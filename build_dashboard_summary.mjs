// Builds a small aggregate JSON so the first dashboard screen opens quickly.
// Run: node .\build_dashboard_summary.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(root, "mvp_data", "geojson", "fields_demo_mvp.geojson");
const output = path.join(root, "mvp_data", "dashboard_summary.json");
const geojson = JSON.parse(await fs.readFile(input, "utf8"));
const properties = geojson.features.map((feature) => feature.properties);

const number = (value) => Number(value) || 0;
const sum = (items, selector) => items.reduce((total, item) => total + number(selector(item)), 0);
const percentile = (values, ratio) => {
  const sorted = values.map(number).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * ratio)] : 0;
};
const aggregate = (key) => {
  const groups = new Map();
  for (const item of properties) {
    const label = item[key] || "Ko'rsatilmagan";
    const current = groups.get(label) || { label, polygons: 0, area_ha: 0, water_m3: 0 };
    current.polygons += 1;
    current.area_ha += number(item.maydoni);
    current.water_m3 += number(item.planned_water_m3_mvp);
    groups.set(label, current);
  }
  return [...groups.values()].sort((a, b) => b.water_m3 - a.water_m3);
};

const totalArea = sum(properties, (item) => item.maydoni);
const totalWater = sum(properties, (item) => item.planned_water_m3_mvp);
const observed = properties.filter((item) => item.demo_norm_status === "demo_ready_observed");
const estimated = properties.filter((item) => item.demo_norm_status === "demo_ready_proxy");
const waterSorted = properties.map((item) => number(item.planned_water_m3_mvp)).sort((a, b) => b - a);
const topTenCount = Math.max(1, Math.ceil(waterSorted.length * 0.1));
const topTenWater = waterSorted.slice(0, topTenCount).reduce((a, b) => a + b, 0);

const summary = {
  generated_at: new Date().toISOString(),
  source_features: path.relative(root, input).replaceAll("\\", "/"),
  totals: {
    polygons: properties.length,
    fields: new Set(properties.map((item) => item.field_id).filter(Boolean)).size,
    area_ha: totalArea,
    planned_water_m3: totalWater,
    weighted_norm_m3ha: totalArea ? totalWater / totalArea : 0,
    observed_polygons: observed.length,
    estimated_polygons: estimated.length,
    observed_water_m3: sum(observed, (item) => item.planned_water_m3_mvp),
    estimated_water_m3: sum(estimated, (item) => item.planned_water_m3_mvp),
    crop_proxy_polygons: properties.filter((item) => item.crop_mvp_source !== "observed").length,
    gmr_proxy_polygons: properties.filter((item) => item.gmr_mvp_source !== "observed").length,
    bonitet_missing_polygons: properties.filter((item) => item.bonitet === null || item.bonitet === "").length,
    small_polygons_under_01ha: properties.filter((item) => number(item.maydoni) < 0.1).length,
    long_crop_proxy_over_500m: properties.filter((item) => number(item.crop_proxy_distance_m) > 500).length,
    long_gmr_proxy_over_500m: properties.filter((item) => number(item.gmr_proxy_distance_m) > 500).length,
    top_10_percent_water_share: totalWater ? topTenWater / totalWater * 100 : 0,
    area_median_ha: percentile(properties.map((item) => item.maydoni), 0.5),
    area_p90_ha: percentile(properties.map((item) => item.maydoni), 0.9),
    norm_min_m3ha: Math.min(...properties.map((item) => number(item.norm_m3ha_mvp)).filter(Boolean)),
    norm_max_m3ha: Math.max(...properties.map((item) => number(item.norm_m3ha_mvp))),
  },
  crops: aggregate("crop_mvp"),
  crop_groups: aggregate("crop_group_mvp"),
  gmrs: aggregate("gmr_mvp"),
};

await fs.writeFile(output, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`Dashboard summary: ${summary.totals.polygons} polygons, ${(summary.totals.planned_water_m3 / 1e6).toFixed(1)} million m3`);
