import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(root, "mvp_data", "geojson", "fields_delivery_2025_lite.geojson");
const outputPath = path.join(root, "mvp_data", "geojson", "fields_merged_manual.geojson");
const dissolvedPath = path.join(root, "real_project_data", "fields_dissolved.geojson");

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const dissolved = fs.existsSync(dissolvedPath) ? JSON.parse(fs.readFileSync(dissolvedPath, "utf8")) : null;
const dissolvedGeometry = new Map((dissolved?.features || []).map((feature) => [feature.properties.field_id, feature.geometry]));
const groups = new Map();

for (const feature of source.features) {
  const id = feature.properties.field_id || feature.properties.feature_id;
  if (!groups.has(id)) groups.set(id, []);
  groups.get(id).push(feature);
}

function number(value) { return Number(value) || 0; }

function dominant(features, key) {
  const areas = new Map();
  for (const feature of features) {
    const value = feature.properties[key];
    const normalized = value === undefined || value === null || value === "" ? null : value;
    areas.set(normalized, (areas.get(normalized) || 0) + number(feature.properties.maydoni));
  }
  return [...areas.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
}

function weighted(features, key) {
  let total = 0, area = 0;
  for (const feature of features) {
    const value = Number(feature.properties[key]);
    const partArea = number(feature.properties.maydoni);
    if (Number.isFinite(value) && partArea > 0) { total += value * partArea; area += partArea; }
  }
  return area ? total / area : null;
}

function polygonParts(geometry) {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported field geometry: ${geometry.type}`);
}

function roundedCoordinates(value) {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === "number") return value.map((coordinate) => Math.round(coordinate * 1e6) / 1e6);
  return value.map(roundedCoordinates);
}

function componentSummary(features) {
  const components = new Map();
  for (const feature of features) {
    const properties = feature.properties;
    const component = {
      gmr: properties.gmr_mvp || null,
      bonitet: Number.isFinite(Number(properties.bonitet)) ? Number(properties.bonitet) : null,
      tm1: Number.isFinite(Number(properties.Tm1)) ? Number(properties.Tm1) : null,
      zone: properties.irrigation_zone || null,
    };
    const key = JSON.stringify(component);
    if (!components.has(key)) components.set(key, { ...component, area_ha: 0 });
    components.get(key).area_ha += number(properties.maydoni);
  }
  return [...components.values()].sort((first, second) => second.area_ha - first.area_ha)
    .map((component) => ({ ...component, area_ha: Number(component.area_ha.toFixed(6)) }));
}

function routeSummary(features) {
  const routes = new Map();
  for (const feature of features) {
    const properties = feature.properties;
    const route = properties.water_route || null;
    const key = `${route || ""}\u001f${properties.water_block_id || ""}`;
    if (!routes.has(key)) routes.set(key, { route, block_id: properties.water_block_id || null, area_ha: 0 });
    routes.get(key).area_ha += number(properties.maydoni);
  }
  return [...routes.values()].sort((first, second) => second.area_ha - first.area_ha)
    .map((route) => ({ ...route, area_ha: Number(route.area_ha.toFixed(6)) }));
}

const merged = [];
for (const [fieldId, features] of groups) {
  const primary = [...features].sort((first, second) => number(second.properties.maydoni) - number(first.properties.maydoni))[0];
  const properties = { ...primary.properties };
  const parts = features.flatMap((feature) => polygonParts(feature.geometry));
  const totalArea = features.reduce((total, feature) => total + number(feature.properties.maydoni), 0);
  const routes = routeSummary(features);
  const primaryRoute = routes[0];

  Object.assign(properties, {
    feature_id: fieldId,
    field_id: fieldId,
    plan_part_id: fieldId,
    maydoni: totalArea,
    merged_source_parts: features.length,
    soil_gmr_components: componentSummary(features),
    water_route_components: routes,
    gmr_mvp: dominant(features, "gmr_mvp"),
    bonitet: weighted(features, "bonitet"),
    Tm1: dominant(features, "Tm1"),
    irrigation_zone: dominant(features, "irrigation_zone"),
    zone_confidence: weighted(features, "zone_confidence"),
    water_route: primaryRoute?.route || null,
    water_block_id: primaryRoute?.block_id || null,
    route_depth: primaryRoute?.route ? primaryRoute.route.split("→").filter(Boolean).length : null,
    crop_group_mvp: null,
    crop_mvp: null,
    crop_mvp_source: "manual_required",
    norm_m3ha_mvp: null,
    planned_water_m3_mvp: null,
    seasonal_need_m3: null,
    irrigation_count_mvp: null,
    irrigation_start_mvp: null,
    irrigation_end_mvp: null,
    crop_norm_components: [],
    demo_norm_status: "crop_required",
    delivery_calc_status: "crop_required",
    source_share_m3: null,
    route_loss_m3_scn: null,
    delivery_est_m3: null,
    delivery_cover_pct: null,
    branch_need_m3: null,
    branch_limit_m3: null,
    branch_field_count: null,
  });

  const dissolvedFieldGeometry = dissolvedGeometry.get(fieldId);
  const fallbackGeometry = parts.length === 1 ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts };
  const geometry = dissolvedFieldGeometry || fallbackGeometry;
  merged.push({
    type: "Feature",
    id: fieldId,
    properties,
    geometry: { ...geometry, coordinates: roundedCoordinates(geometry.coordinates) },
  });
}

const output = {
  type: "FeatureCollection",
  name: "fields_merged_manual",
  metadata: {
    source_features: source.features.length,
    merged_fields: merged.length,
    crop_policy: "blank_until_manual_assignment",
    merge_key: "field_id",
    geometry_dissolved: Boolean(dissolved),
  },
  features: merged,
};

fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ output: outputPath, source_features: source.features.length, merged_fields: merged.length }, null, 2));
