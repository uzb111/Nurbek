/**
 * Create the browser-focused field layer from the full GIS calculation export.
 * It keeps every polygon and every dashboard/calculation field, but discards
 * raw GDB attributes and rounds coordinates to ~0.1 m precision.
 */
import { readFile, writeFile, stat } from "node:fs/promises";

const source = new URL("./mvp_data/geojson/fields_delivery_2025.geojson", import.meta.url);
const output = new URL("./mvp_data/geojson/fields_delivery_2025_lite.geojson", import.meta.url);
const KEEP = [
  "field_id", "feature_id", "maydoni", "Tm1", "bonitet",
  "crop_mvp", "crop_mvp_source", "crop_mvp_confidence", "crop_group_mvp",
  "gmr_mvp", "gmr_mvp_source", "gmr_mvp_confidence",
  "irrigation_zone", "zone_status", "zone_confidence", "zone_distance_m",
  "irrigation_count_mvp", "norm_m3ha_mvp", "irrigation_start_mvp", "irrigation_end_mvp",
  "planned_water_m3_mvp", "demo_norm_status", "demo_proxy_used",
  "plan_part_id", "water_block_id", "water_route", "route_depth", "block_overlap_pct", "block_match_status",
  "seasonal_need_m3", "district_need_m3", "official_limit_m3", "source_share_m3",
  "route_loss_pct_scn", "route_loss_m3_scn", "delivery_est_m3", "delivery_cover_pct",
  "branch_need_m3", "branch_limit_m3", "branch_field_count", "delivery_calc_status",
];

function simplifyCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number") return value.map((number) => Math.round(number * 1e6) / 1e6);
  return value.map(simplifyCoordinates);
}

const data = JSON.parse(await readFile(source, "utf8"));
const lite = {
  type: "FeatureCollection",
  features: data.features.map((feature) => ({
    type: "Feature",
    id: feature.id,
    geometry: { ...feature.geometry, coordinates: simplifyCoordinates(feature.geometry.coordinates) },
    properties: Object.fromEntries(KEEP.map((key) => [key, feature.properties[key] ?? null])),
  })),
};
await writeFile(output, JSON.stringify(lite), "utf8");
console.log(JSON.stringify({ features: lite.features.length, source_bytes: (await stat(source)).size, output_bytes: (await stat(output)).size }));
