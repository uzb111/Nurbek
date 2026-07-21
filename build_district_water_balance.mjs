// Builds the district-level seasonal water balance from field data and Open-Meteo.
// Run: node .\build_district_water_balance.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(root, "mvp_data", "geojson", "fields_demo_mvp.geojson");
const output = path.join(root, "mvp_data", "district_water_balance.json");
const districtCode = "1803";
const districtName = "Kasbi tumani";
const timezone = "Asia/Tashkent";
const center = { latitude: 38.86724, longitude: 65.41781 };

const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const endDateValue = new Date(`${today}T00:00:00Z`);
endDateValue.setUTCDate(endDateValue.getUTCDate() - 1);
const endDate = endDateValue.toISOString().slice(0, 10);
const seasonStart = `${endDate.slice(0, 4)}-03-01`;
const weatherUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${center.latitude}&longitude=${center.longitude}&start_date=${seasonStart}&end_date=${endDate}&daily=et0_fao_evapotranspiration,precipitation_sum&timezone=${encodeURIComponent(timezone)}`;

function cropCoefficient(group, date) {
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const values = {
    cotton: { 3: 0, 4: .35, 5: .65, 6: .95, 7: 1.15, 8: 1.15, 9: .8, 10: .4 },
    winter_grain: { 3: .8, 4: 1.05, 5: 1.1, 6: day <= 20 ? .45 : 0 },
    alfalfa: { 3: .75, 4: .9, 5: 1, 6: 1, 7: 1, 8: 1, 9: .9, 10: .7 },
    maize: { 3: 0, 4: .35, 5: .65, 6: 1, 7: 1.15, 8: .95, 9: .5 },
    orchard: { 3: .65, 4: .8, 5: .9, 6: .9, 7: .9, 8: .9, 9: .75, 10: .4 },
    melons: { 3: 0, 4: .35, 5: .7, 6: 1, 7: .9, 8: .5 },
    vegetables: { 3: .5, 4: .75, 5: 1, 6: 1, 7: .9, 8: .7 },
  };
  return values[group]?.[month] ?? 0;
}

const groundwaterFactor = { I: .16, II: .14, III: .12, IV: .10, V: .08, VI: .06, IX: .04 };
const geojson = JSON.parse(await fs.readFile(input, "utf8"));
const districtFeatures = geojson.features.filter((feature) => String(feature.properties.tuman) === districtCode);
const unassignedFeatures = geojson.features.filter((feature) => feature.properties.tuman === null || feature.properties.tuman === "");

const response = await fetch(weatherUrl, { headers: { "user-agent": "AgroTahlil/1.0" } });
if (!response.ok) throw new Error(`Open-Meteo historical request failed: ${response.status}`);
const weather = await response.json();
const dates = weather.daily.time || [];
const et0Daily = weather.daily.et0_fao_evapotranspiration || [];
const rainDaily = weather.daily.precipitation_sum || [];

const etcByGroup = new Map();
for (const group of ["cotton", "winter_grain", "alfalfa", "maize", "orchard", "melons", "vegetables"]) {
  let millimeters = 0;
  dates.forEach((date, index) => { millimeters += (Number(et0Daily[index]) || 0) * cropCoefficient(group, date); });
  etcByGroup.set(group, millimeters);
}

let areaHa = 0;
let plannedWaterM3 = 0;
let etcPotentialM3 = 0;
let groundwaterContributionM3 = 0;
const cropGroups = new Map();
for (const feature of districtFeatures) {
  const properties = feature.properties;
  const area = Number(properties.maydoni) || 0;
  const group = properties.crop_group_mvp || "unknown";
  const etcMm = etcByGroup.get(group) || 0;
  const etcM3 = etcMm * area * 10;
  const groundwaterM3 = etcM3 * (groundwaterFactor[properties.gmr_mvp] ?? .08);
  areaHa += area;
  plannedWaterM3 += Number(properties.planned_water_m3_mvp) || 0;
  etcPotentialM3 += etcM3;
  groundwaterContributionM3 += groundwaterM3;
  const current = cropGroups.get(group) || { group, area_ha: 0, etc_mm: etcMm, etc_m3: 0 };
  current.area_ha += area;
  current.etc_m3 += etcM3;
  cropGroups.set(group, current);
}

const precipitationMm = rainDaily.reduce((total, value) => total + (Number(value) || 0), 0);
const et0Mm = et0Daily.reduce((total, value) => total + (Number(value) || 0), 0);
const effectiveRainCoefficient = .8;
const effectiveRainM3 = precipitationMm * effectiveRainCoefficient * areaHa * 10;
const netIrrigationDemandM3 = Math.max(etcPotentialM3 - effectiveRainM3 - groundwaterContributionM3, 0);
const limitM3 = plannedWaterM3;
const suppliedM3 = limitM3 * .88;
const usedM3 = suppliedM3 * .82;

const result = {
  generated_at: new Date().toISOString(),
  district: { code: districtCode, name: districtName, name_status: "working_label", center },
  period: { start_date: seasonStart, end_date: endDate, days: dates.length },
  source_status: {
    weather: "Open-Meteo Historical Weather API",
    limit: "normative field demand proxy",
    supplied: "estimated as 88% of limit; editable in dashboard",
    used: "estimated as 82% of supplied; editable in dashboard",
    crop_coefficient: "estimated monthly Kc curve",
    groundwater: "estimated from GMR class",
  },
  field_totals: {
    polygons: districtFeatures.length,
    area_ha: areaHa,
    planned_water_m3: plannedWaterM3,
    unassigned_polygons_excluded: unassignedFeatures.length,
    unassigned_area_ha_excluded: unassignedFeatures.reduce((total, feature) => total + (Number(feature.properties.maydoni) || 0), 0),
  },
  weather: { et0_mm: et0Mm, precipitation_mm: precipitationMm, effective_rain_coefficient: effectiveRainCoefficient, effective_rain_m3: effectiveRainM3 },
  evapotranspiration: { potential_etc_m3: etcPotentialM3, groundwater_contribution_m3: groundwaterContributionM3, net_irrigation_demand_m3: netIrrigationDemandM3 },
  editable_defaults: { limit_m3: limitM3, supplied_m3: suppliedM3, used_m3: usedM3 },
  crop_groups: [...cropGroups.values()].sort((a, b) => b.etc_m3 - a.etc_m3),
  open_meteo_url: weatherUrl,
};

await fs.writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ district: districtName, period: result.period, area_ha: areaHa, limit_m3: limitM3, etc_m3: etcPotentialM3, net_demand_m3: netIrrigationDemandM3 }, null, 2));
