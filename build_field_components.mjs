import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(root, "mvp_data", "geojson", "fields_delivery_2025_lite.geojson");
const outputPath = path.join(root, "mvp_data", "geojson", "field_components.geojson");
const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const features = source.features.map((feature) => {
  const properties = feature.properties || {};
  return {
    type: "Feature",
    geometry: feature.geometry,
    properties: {
      field_id: properties.field_id,
      gmr_mvp: properties.gmr_mvp || null,
      bonitet: Number.isFinite(Number(properties.bonitet)) ? Number(properties.bonitet) : null,
      Tm1: Number.isFinite(Number(properties.Tm1)) ? Number(properties.Tm1) : null,
      irrigation_zone: properties.irrigation_zone || null,
      water_route: properties.water_route || null,
      water_block_id: properties.water_block_id || null,
      route_depth: Number.isFinite(Number(properties.route_depth)) ? Number(properties.route_depth) : null,
      route_loss_pct_scn: Number.isFinite(Number(properties.route_loss_pct_scn)) ? Number(properties.route_loss_pct_scn) : null,
      block_match_status: properties.block_match_status || null,
    },
  };
});

const output = {
  type: "FeatureCollection",
  name: "field_components",
  metadata: {
    source: path.relative(root, inputPath).replaceAll("\\", "/"),
    features: features.length,
    purpose: "lazy spatial soil/GMR and water-route recalculation after field split",
  },
  features,
};

fs.writeFileSync(outputPath, JSON.stringify(output));
console.log(JSON.stringify({ output: outputPath, features: features.length, bytes: fs.statSync(outputPath).size }, null, 2));
