import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(root, ...parts), "utf8"));
const fields = readJson("mvp_data", "geojson", "fields_merged_manual.geojson").features;
const components = readJson("mvp_data", "geojson", "field_components.geojson").features;
const actualEt = readJson("mvp_data", "actual_et_by_field.json");
const official = readJson("mvp_data", "official_water_limit_2025.json");
const periodWeather = readJson("mvp_data", "open_meteo_official_period_2025.json");
const summary = readJson("mvp_data", "dashboard_summary.json");
const districtAnalytics = readJson("mvp_data", "district_analytics.json");
const canals = readJson("mvp_data", "geojson", "kanal.geojson").features;
const drains = readJson("mvp_data", "geojson", "zovur.geojson").features;
const rulesText = fs.readFileSync(path.join(root, "mvp_data", "config", "irrigation_norms.csv"), "utf8").trim();
const appText = fs.readFileSync(path.join(root, "dashboard", "app.js"), "utf8");
const htmlText = fs.readFileSync(path.join(root, "dashboard", "index.html"), "utf8");
const [headerLine, ...ruleLines] = rulesText.split(/\r?\n/);
const headers = headerLine.split(",");
const rules = ruleLines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
const errors = [];
const warnings = [];
const number = (value) => Number(value) || 0;
const sum = (items, selector) => items.reduce((total, item) => total + number(selector(item)), 0);
const close = (first, second, tolerance) => Math.abs(first - second) <= tolerance;
const htmlIds = new Set([...htmlText.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
const queriedIds = new Set([...appText.matchAll(/querySelector\("#([A-Za-z0-9_-]+)"\)/g)].map((match) => match[1]));
const missingDomIds = [...queriedIds].filter((id) => !htmlIds.has(id));
if (missingDomIds.length) errors.push(`JavaScript HTMLda yo‘q IDlarni ishlatyapti: ${missingDomIds.join(", ")}`);

const ids = new Set();
let componentAreaErrors = 0;
let routeLossErrors = 0;
let routeDepthErrors = 0;
let routedFields = 0;
let fieldArea = 0;
for (const feature of fields) {
  const properties = feature.properties;
  const id = properties.field_id;
  if (!id || ids.has(id)) errors.push(`Takror yoki bo‘sh field_id: ${id || "NULL"}`);
  ids.add(id);
  const area = number(properties.maydoni);
  fieldArea += area;
  const partsArea = sum(properties.soil_gmr_components || [], (component) => component.area_ha);
  if (!close(area, partsArea, 0.02)) componentAreaErrors += 1;
  const route = String(properties.water_route || "").split("→").map((item) => item.trim()).filter(Boolean);
  if (!route.length) continue;
  routedFields += 1;
  if (number(properties.route_depth) !== route.length) routeDepthErrors += 1;
  const expectedLoss = (1 - 0.985 ** Math.max(route.length - 1, 0)) * 100;
  if (!close(number(properties.route_loss_pct_scn), expectedLoss, 1e-8)) routeLossErrors += 1;
}
if (componentAreaErrors) errors.push(`${componentAreaErrors} dalada komponent maydoni dala maydoniga teng emas`);
if (routeDepthErrors) errors.push(`${routeDepthErrors} dalada route_depth suv yo‘li uzunligiga mos emas`);
if (routeLossErrors) errors.push(`${routeLossErrors} dalada 1,5%/bosqich formulasi mos emas`);

const componentIds = new Set(components.map((feature) => feature.properties?.field_id).filter(Boolean));
const allowedComponentProperties = new Set(["field_id", "gmr_mvp", "bonitet", "Tm1", "Tm2", "Tm3", "SS", "water_route", "water_block_id", "route_depth", "route_loss_pct_scn", "block_match_status"]);
const unexpectedComponentProperties = [...new Set(components.flatMap((feature) => Object.keys(feature.properties || {})).filter((key) => !allowedComponentProperties.has(key)))];
if (unexpectedComponentProperties.length) errors.push(`Public split qatlamida kutilmagan atributlar bor: ${unexpectedComponentProperties.join(", ")}`);
const forbiddenZoneProperties = fields.filter((feature) => Object.hasOwn(feature.properties || {}, "irrigation_zone")).length;
if (forbiddenZoneProperties) errors.push(`${forbiddenZoneProperties} dalada endi ishlatilmaydigan irrigation_zone atributi qolgan`);
const soilProfileCoverage = Object.fromEntries(["Tm1", "Tm2", "Tm3", "SS"].map((key) => [key, fields.filter((feature) => number(feature.properties?.[key]) > 0).length]));
for (const [key, covered] of Object.entries(soilProfileCoverage)) {
  if (!covered) errors.push(`${key} tuproq/sizot atributida birorta ham qiymat yo‘q`);
}
if (/irrigation_zone|Bo‘z|Cho‘l/.test(appText + htmlText)) errors.push("Dashboard interfeysi yoki algoritmida eski zona atamasi qolgan");
const missingComponentFields = [...ids].filter((id) => !componentIds.has(id));
if (missingComponentFields.length) errors.push(`${missingComponentFields.length} dalada split uchun asl komponent geometriyasi yo‘q`);

let etFormulaErrors = 0;
let etMatched = 0;
let etAprSepM3 = 0;
const etFields = actualEt.fields || {};
for (const feature of fields) {
  const properties = feature.properties;
  const match = etFields[properties.field_id];
  if (!match) continue;
  etMatched += 1;
  const expected = number(match.total_mm) * number(properties.maydoni) * 10;
  if (!close(expected, number(match.field_et_m3), 0.11)) etFormulaErrors += 1;
  const periodMm = ["4", "5", "6", "7", "8", "9"].reduce((total, month) => total + number(match.monthly_mm?.[month]), 0);
  etAprSepM3 += periodMm * number(properties.maydoni) * 10;
}
if (etFormulaErrors) errors.push(`${etFormulaErrors} dalada real ET hajmi formulasi mos emas`);

const officialMonthTotal = sum(official.monthly_limits || [], (item) => item.limit_m3);
const periodWeatherData = periodWeather.weather || periodWeather;
const periodRainMm = sum(periodWeatherData.daily?.precipitation_sum || [], Number);
const periodEt0Mm = sum(periodWeatherData.daily?.et0_fao_evapotranspiration || [], Number);
if (periodWeatherData.daily?.time?.length !== 183) errors.push("Open-Meteo rasmiy limit davri 183 kunni qamramadi");
if (!close(officialMonthTotal, number(official.total_limit_m3), 1)) warnings.push(`Oylar yig‘indisi rasmiy jamidan ${officialMonthTotal - number(official.total_limit_m3)} m³ farq qiladi; rasmiy jami ustun olinadi`);
if (summary.totals.fields !== fields.length) errors.push("Dashboard summary mantiqiy dala soni merged qatlamga mos emas");
if (summary.totals.polygons !== components.length) errors.push("Dashboard summary manba poligon soni komponent qatlamiga mos emas");
if (!close(summary.totals.area_ha, fieldArea, 0.01)) errors.push("Dashboard summary maydoni merged qatlamga mos emas");
if (districtAnalytics.field_area.fields !== fields.length || !close(districtAnalytics.field_area.total_ha, fieldArea, 0.1)) errors.push("Tuman analitikasidagi dala qamrovi merged qatlamga mos emas");
if (districtAnalytics.bonitet.average < districtAnalytics.bonitet.minimum || districtAnalytics.bonitet.average > districtAnalytics.bonitet.maximum) errors.push("Bonitet o‘rtachasi minimum–maksimum oralig‘ida emas");
if (districtAnalytics.soil_profile.length !== 3 || districtAnalytics.soil_profile.some((layer) => !close(sum(layer.distribution, (item) => item.share_pct), 100, 0.2))) errors.push("0–30, 30–100 yoki 100–200 sm tuproq taqsimoti 100% ga yig‘ilmadi");
const textureDomain = { 1: "Qumoqli", 2: "Yengil qumoqli", 3: "O‘rta qumoqli", 4: "Og‘ir qumoqli", 5: "Qumli", 6: "Loyli", 7: "O‘rta qumoqli (20 sm dan keyin shag‘al)", 8: "Og‘ir va o‘rta qumoqli" };
const textureLabelErrors = districtAnalytics.soil_profile.flatMap((layer) => layer.distribution).filter((item) => textureDomain[item.code] !== item.label);
if (textureLabelErrors.length) errors.push(`${textureLabelErrors.length} tuproq mexanik tarkib kodi FileGDB domen nomiga mos emas`);
if (districtAnalytics.groundwater.minimum_mm > districtAnalytics.groundwater.average_mm || districtAnalytics.groundwater.average_mm > districtAnalytics.groundwater.maximum_mm) errors.push("Sizot suvi mm statistikasi mantiqiy tartibda emas");
if (districtAnalytics.infrastructure.canals.features !== canals.length || districtAnalytics.infrastructure.drains.features !== drains.length) errors.push("Kanal yoki zovur soni GDB GeoJSON qamroviga mos emas");
if (!close(sum(districtAnalytics.recommendation.crops, (item) => item.area_ha), districtAnalytics.recommendation.total_area_ha, 0.5)) errors.push("Ekin tavsiyasi maydonlari jami tuman maydoniga teng emas");
if (districtAnalytics.recommendation.crops.find((item) => item.group === "alfalfa")?.area_ha > 5) errors.push("Beda tavsiyasi 5 ga limitdan oshdi");

const cropGroups = [...new Set(rules.map((rule) => rule.crop_group))];
const report = {
  status: errors.length ? "failed" : "passed",
  errors,
  warnings,
  fields: { logical: fields.length, unique_ids: ids.size, area_ha: fieldArea, routed: routedFields },
  components: { features: components.length, represented_fields: componentIds.size, soil_profile_coverage: soilProfileCoverage },
  irrigation_rules: { rows: rules.length, crop_groups: cropGroups, matching_basis: "GMR + crop; zone is not used" },
  actual_et: { matched_fields: etMatched, april_september_m3: etAprSepM3, spatial_threshold_pct: actualEt.metadata?.match_threshold_pct },
  official_limit: { total_m3: number(official.total_limit_m3), monthly_sum_m3: officialMonthTotal },
  official_period_weather: { days: periodWeatherData.daily?.time?.length || 0, rain_mm: periodRainMm, et0_mm: periodEt0Mm },
  dom_contract: { queried_ids: queriedIds.size, missing_ids: missingDomIds },
  district_analytics: { bonitet: districtAnalytics.bonitet, groundwater: districtAnalytics.groundwater, soil_layers: districtAnalytics.soil_profile.length, canals: canals.length, drains: drains.length },
  route_loss_formula: "1 - (1 - 0.015)^(route_depth - 1)",
};

console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
