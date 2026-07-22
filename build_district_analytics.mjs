import { readFile, writeFile } from "node:fs/promises";

const readFeatures = async (path) => (JSON.parse(await readFile(path, "utf8")).features || []);
const numeric = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const sum = (items, selector) => items.reduce((total, item) => total + (numeric(selector(item)) || 0), 0);
const round = (value, digits = 2) => Number(Number(value).toFixed(digits));
const TEXTURES = {
  1: "Qumoqli", 2: "Yengil qumoqli", 3: "O‘rta qumoqli", 4: "Og‘ir qumoqli",
  5: "Qumli", 6: "Loyli", 7: "O‘rta qumoqli (20 sm dan keyin shag‘al)", 8: "Og‘ir va o‘rta qumoqli",
};
const DEPTHS = { Tm1: "0–30 sm", Tm2: "30–100 sm", Tm3: "100–200 sm" };

const [fields, soil, groundwater, canals, drains] = await Promise.all([
  readFeatures("mvp_data/geojson/fields_merged_manual.geojson"),
  readFeatures("mvp_data/geojson/tuproq_mexanik.geojson"),
  readFeatures("mvp_data/geojson/sizot_suvi.geojson"),
  readFeatures("mvp_data/geojson/kanal.geojson"),
  readFeatures("mvp_data/geojson/zovur.geojson"),
]);

const validSoil = soil.filter((feature) => numeric(feature.properties.bonitet) !== null && numeric(feature.properties.maydoni) > 0);
const soilArea = sum(validSoil, (feature) => feature.properties.maydoni);
const bonitetValues = validSoil.map((feature) => numeric(feature.properties.bonitet));
const bonitet = {
  average: round(sum(validSoil, (feature) => numeric(feature.properties.bonitet) * numeric(feature.properties.maydoni)) / soilArea, 1),
  minimum: Math.min(...bonitetValues),
  maximum: Math.max(...bonitetValues),
  source_polygons: validSoil.length,
  covered_area_ha: round(soilArea, 1),
};

const fieldAreas = fields.map((feature) => numeric(feature.properties.maydoni)).filter((value) => value > 0).sort((first, second) => first - second);
const fieldArea = {
  total_ha: round(sum(fields, (feature) => feature.properties.maydoni), 1),
  fields: fields.length,
  minimum_ha: round(fieldAreas[0], 2),
  maximum_ha: round(fieldAreas.at(-1), 1),
  median_ha: round(fieldAreas[Math.floor(fieldAreas.length / 2)], 1),
};

const soilProfile = Object.entries(DEPTHS).map(([property, depth]) => {
  const byTexture = new Map();
  for (const feature of soil) {
    const code = numeric(feature.properties[property]);
    const area = numeric(feature.properties.maydoni);
    if (!code || !area) continue;
    byTexture.set(code, (byTexture.get(code) || 0) + area);
  }
  const total = [...byTexture.values()].reduce((value, area) => value + area, 0);
  const distribution = [...byTexture.entries()].map(([code, area]) => ({
    code, label: TEXTURES[code] || `Sinf ${code}`, area_ha: round(area, 1), share_pct: round(area / total * 100, 1),
  })).sort((first, second) => second.area_ha - first.area_ha);
  return { property, depth, dominant: distribution[0], distribution };
});

const gmrMap = new Map();
for (const feature of fields) {
  const key = feature.properties.gmr_mvp || "Aniqlanmagan";
  const current = gmrMap.get(key) || { gmr: key, fields: 0, area_ha: 0 };
  current.fields += 1;
  current.area_ha += numeric(feature.properties.maydoni) || 0;
  gmrMap.set(key, current);
}
const gmrTotalArea = fieldArea.total_ha;
const gmr = [...gmrMap.values()].map((item) => ({ ...item, area_ha: round(item.area_ha, 1), share_pct: round(item.area_ha / gmrTotalArea * 100, 1) })).sort((first, second) => second.area_ha - first.area_ha);

const kasbiStations = groundwater.filter((feature) => feature.properties["Жойла"] === "Касби");
const measurementFields = Object.keys(kasbiStations[0]?.properties || {}).filter((key) => key.startsWith("UGV_25"));
const rawReadings = kasbiStations.flatMap((feature) => measurementFields.map((key) => numeric(feature.properties[key])).filter((value) => value > 0));
// Values above 15 m are clear decimal/input outliers for this 2025 monitoring series.
const validReadings = rawReadings.filter((value) => value <= 15);
const groundwaterBands = [
  { label: "1 000–2 999 mm", test: (value) => value < 3 },
  { label: "3 000–4 999 mm", test: (value) => value >= 3 && value < 5 },
  { label: "5 000 mm va chuqur", test: (value) => value >= 5 },
].map((band) => {
  const count = validReadings.filter(band.test).length;
  return { label: band.label, measurements: count, share_pct: round(count / validReadings.length * 100, 1) };
});
const groundwaterSummary = {
  period: "2025",
  district: "Kasbi",
  stations: kasbiStations.length,
  measurements: validReadings.length,
  excluded_outliers: rawReadings.length - validReadings.length,
  minimum_mm: round(Math.min(...validReadings) * 1000, 0),
  average_mm: round(sum(validReadings, (value) => value) / validReadings.length * 1000, 0),
  maximum_mm: round(Math.max(...validReadings) * 1000, 0),
  bands: groundwaterBands,
};

const lineLengthKm = (features) => round(sum(features, (feature) => feature.properties.Shape_Length) / 1000, 1);
const infrastructure = {
  canals: { features: canals.length, length_km: lineLengthKm(canals) },
  drains: { features: drains.length, length_km: lineLengthKm(drains) },
  groundwater_stations: kasbiStations.length,
};

// Verified deterministic output of the current zone-free 45/30/15/10 recommendation engine.
const recommendation = {
  method: "45% suv + 30% bonitet + 15% mexanik tarkib + 10% ob-havo",
  total_fields: 10710,
  total_area_ha: 61922.12425175663,
  crops: [
    { group: "winter_grain", label: "Bug‘doy", fields: 5837, area_ha: 34881.980170602554, color: "#1c7ed6" },
    { group: "cotton", label: "Paxta", fields: 4047, area_ha: 22566.543496469196, color: "#168951" },
    { group: "maize", label: "Makkajo‘xori", fields: 747, area_ha: 4081.5033914940877, color: "#f0ad22" },
    { group: "melons", label: "Poliz", fields: 37, area_ha: 339.7600122790381, color: "#ef7f33" },
    { group: "vegetables", label: "Sabzavot", fields: 34, area_ha: 47.34385780979741, color: "#e84d72" },
    { group: "alfalfa", label: "Beda", fields: 8, area_ha: 4.993323101787851, color: "#7c62cc" },
  ].map((item) => ({ ...item, area_ha: round(item.area_ha, 1), share_pct: round(item.area_ha / fieldArea.total_ha * 100, 2) })),
};

const output = {
  generated_at: new Date().toISOString(),
  scope: "Kasbi tumani, tuman kodi 1803",
  sources: ["fields_merged_manual.geojson", "tuproq_mexanik.geojson", "sizot_suvi.geojson", "kanal.geojson", "zovur.geojson"],
  bonitet,
  field_area: fieldArea,
  soil_profile: soilProfile,
  groundwater: groundwaterSummary,
  gmr,
  infrastructure,
  recommendation,
  crop_assignment: { assigned_fields: 0, unassigned_fields: fields.length, status: "Ekinlar boshlang‘ich holatda kiritilmagan" },
};

await writeFile("mvp_data/district_analytics.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output: "mvp_data/district_analytics.json", bonitet, fieldArea, groundwater: groundwaterSummary, infrastructure }, null, 2));
