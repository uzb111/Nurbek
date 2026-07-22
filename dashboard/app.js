const SUMMARY_URL = "../mvp_data/dashboard_summary.json";
const DATA_URL = "../mvp_data/geojson/fields_merged_manual.geojson";
const WEATHER_SNAPSHOT_URL = "../mvp_data/open_meteo_weather.json";
const WEATHER_API_URL = "/api/open-meteo";
const WEATHER_DIRECT_URL = "https://api.open-meteo.com/v1/forecast?latitude=38.86724&longitude=65.41781&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,soil_moisture_3_to_9cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=Asia%2FTashkent&forecast_days=7";
const OFFICIAL_PERIOD_WEATHER_URL = "https://archive-api.open-meteo.com/v1/archive?latitude=38.86724&longitude=65.41781&start_date=2025-04-01&end_date=2025-09-30&daily=precipitation_sum,et0_fao_evapotranspiration&timezone=Asia%2FTashkent";
const OFFICIAL_PERIOD_WEATHER_SNAPSHOT_URL = "../mvp_data/open_meteo_official_period_2025.json";
const DISTRICT_BALANCE_URL = "../mvp_data/district_water_balance.json";
const OFFICIAL_LIMIT_URL = "../mvp_data/official_water_limit_2025.json";
const IRRIGATION_RULES_URL = "../mvp_data/config/irrigation_norms.csv";
const ACTUAL_ET_URL = "../mvp_data/actual_et_by_field.json";
const ACTUAL_ET_DASHBOARD_URL = "../mvp_data/actual_et_dashboard.json";
const DISTRICT_ANALYTICS_URL = "../mvp_data/district_analytics.json?v=20260722-tmdomain1";
const FIELD_COMPONENTS_URL = "../mvp_data/geojson/field_components.geojson";
const NETWORK_SOURCES = {
  kanal: { url: "../mvp_data/geojson/kanal.geojson", label: "Kanallar — 1 615", color: "#16b8e8", weight: 2.8 },
  zovur: { url: "../mvp_data/geojson/zovur.geojson", label: "Zovurlar — 64", color: "#b88248", weight: 3.2 },
};
// GitHub Pages publishes the complete static dataset. Render every available
// polygon so the public map is a full field inventory, not a preview sample.
const MAP_FEATURE_LIMIT = Number.POSITIVE_INFINITY;

const STATUS_META = {
  demo_ready_observed: { label: "Manba asosidagi hisob", color: "#17663b", className: "ready" },
  demo_ready_proxy: { label: "Taxminiy hisob", color: "#d88917", className: "provisional" },
  demo_norm_unavailable: { label: "Norma topilmadi", color: "#c95343", className: "incomplete" },
  crop_required: { label: "Ekin kiritilmagan", color: "#708078", className: "neutral" },
};
const MAP_STATUS_COLORS = { demo_ready_observed: "#00c96b", demo_ready_proxy: "#ffb000", demo_norm_unavailable: "#ff375f", crop_required: "#809087" };
const WATER_STATUS_META = {
  sufficient: { label: "Suv yetarli", color: "#00c96b", className: "" },
  limited: { label: "Suv cheklangan", color: "#f4c430", className: "limited" },
  shortage: { label: "Suv tanqis", color: "#ff7a00", className: "shortage" },
  severe: { label: "Jiddiy tanqis", color: "#e53935", className: "severe" },
};
const CROP_COEFFICIENT = { cotton: 1.15, winter_grain: 1.05, alfalfa: 1.10, maize: 1.15, vegetables: 1.05, melons: 0.95 };
const GROUNDWATER_FACTOR = { I: 0.16, II: 0.14, III: 0.12, IV: 0.10, V: 0.08, VI: 0.06, IX: 0.04 };
const CROP_LABELS = { cotton: "Paxta", winter_grain: "Bug‘doy", alfalfa: "Beda", maize: "Makkajo‘xori", orchard: "Bog‘", melons: "Poliz", vegetables: "Sabzavot" };
const PNG_CROP_ORDER = ["cotton", "alfalfa", "maize", "vegetables", "melons", "winter_grain"];
const RECOMMENDATION_AREA_LIMIT_HA = { alfalfa: 5 };
const CROP_COLORS = { cotton: "#00c96b", alfalfa: "#7c4dff", maize: "#ffd000", vegetables: "#ff3d71", melons: "#ff8a00", winter_grain: "#00a3ff" };
// Exact coded-value domain stored in the source FileGDB (Tuproq.Tm1/Tm2/Tm3).
const TEXTURE_LABELS = {
  1: "qumoqli", 2: "yengil qumoqli", 3: "o‘rta qumoqli", 4: "og‘ir qumoqli",
  5: "qumli", 6: "loyli", 7: "o‘rta qumoqli, 20 sm dan keyin shag‘al", 8: "og‘ir va o‘rta qumoqli",
};
const CROP_PROFILES = {
  cotton: { minBonitet: 55, textures: [2, 3, 4, 8], heat: 92 }, winter_grain: { minBonitet: 40, textures: [1, 2, 3, 4, 8], heat: 84 },
  alfalfa: { minBonitet: 50, textures: [2, 3, 4, 8], heat: 76 }, maize: { minBonitet: 55, textures: [2, 3, 4, 8], heat: 80 },
  melons: { minBonitet: 45, textures: [1, 2, 3], heat: 92 },
  vegetables: { minBonitet: 65, textures: [2, 3], heat: 62 },
};

let dashboardSummary = null;
let currentWeather = null;
let weatherLoadComplete = false;
let officialPeriodWeather = null;
let districtBalance = null;
let officialLimit = null;
let irrigationRules = [];
let map = null;
let layerControl = null;
let geoLayer = null;
let fullData = null;
let selectedLayer = null;
let selectedFeature = null;
let mapPromise = null;
let splitState = { active: false, parent: null, parentLayer: null, points: [], markers: [], line: null, layer: null, parts: [], scenarioId: null };
let networkGroups = {};
let waterRouteIndex = new Map();
let fieldGeometryIndex = [];
let selectedNetworkLayer = null;
let manualCropAssignments = {};
let actualEtMetadata = null;
let fieldComponentPromise = null;
let fieldComponentIndex = new Map();
let districtNeedCache = null;
let districtAnalytics = null;
const networkLoadState = new Set();
const networkSpatialCache = new Map();

const fmtInt = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtPrecise = new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value) => Number(value) || 0;
const sum = (items, selector) => items.reduce((total, item) => total + number(selector(item)), 0);
const text = (value, fallback = "—") => value === undefined || value === null || value === "" ? fallback : value;
const percent = (part, total) => total ? part / total * 100 : 0;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const getMeta = (status) => STATUS_META[status] || STATUS_META.demo_norm_unavailable;

function applyActualEtData(features, payload) {
  actualEtMetadata = payload?.metadata || null;
  const byField = payload?.fields || {};
  features.forEach((feature) => {
    const match = byField[feature.properties.field_id];
    if (!match) {
      feature.properties.actual_et_status = "not_matched";
      return;
    }
    Object.assign(feature.properties, {
      actual_et_status: "matched",
      actual_et_coverage_pct: match.coverage_pct,
      actual_et_source_ids: match.source_ids,
      actual_et_monthly_mm: match.monthly_mm,
      actual_et_total_mm: match.total_mm,
      actual_et_mean_monthly_mm: match.mean_monthly_mm,
      actual_et_m3: match.field_et_m3,
      actual_et_source: match.source,
    });
  });
  if (actualEtMetadata) {
    const officialPeriodMonths = ["4", "5", "6", "7", "8", "9"];
    const matched = features.filter((feature) => feature.properties.actual_et_status === "matched");
    actualEtMetadata.official_period_months = officialPeriodMonths;
    actualEtMetadata.official_period_monthly_m3 = Object.fromEntries(officialPeriodMonths.map((month) => [month, sum(matched, (feature) => {
      const properties = feature.properties;
      return number(properties.actual_et_monthly_mm?.[month]) * number(properties.maydoni) * 10;
    })]));
    actualEtMetadata.official_period_et_m3 = sum(matched, (feature) => {
      const properties = feature.properties;
      const monthlyMm = sum(officialPeriodMonths, (month) => properties.actual_et_monthly_mm?.[month]);
      return monthlyMm * number(properties.maydoni) * 10;
    });
    actualEtMetadata.official_period_groundwater_m3 = sum(matched, (feature) => {
      const properties = feature.properties;
      const monthlyMm = sum(officialPeriodMonths, (month) => properties.actual_et_monthly_mm?.[month]);
      const components = properties.soil_gmr_components || [];
      const componentArea = sum(components, (component) => component.area_ha);
      const groundwaterFactor = componentArea
        ? sum(components, (component) => number(component.area_ha) * (GROUNDWATER_FACTOR[component.gmr] ?? .08)) / componentArea
        : (GROUNDWATER_FACTOR[properties.gmr_mvp] ?? .08);
      return monthlyMm * number(properties.maydoni) * 10 * groundwaterFactor;
    });
    actualEtMetadata.matched_area_ha = sum(matched, (feature) => feature.properties.maydoni);
    actualEtMetadata.unmatched_fields = features.length - matched.length;
    actualEtMetadata.unmatched_area_ha = sum(features.filter((feature) => feature.properties.actual_et_status !== "matched"), (feature) => feature.properties.maydoni);
  }
  if (districtBalance) updateWaterBalance();
}

function weatherStats(payload) {
  const daily = payload?.daily || {};
  const current = payload?.current || {};
  const rain = sum(daily.precipitation_sum || [], Number);
  const et0 = sum(daily.et0_fao_evapotranspiration || [], Number);
  const maximums = (daily.temperature_2m_max || []).map(number).filter(Number.isFinite);
  return {
    rain, et0, deficit: Math.max(et0 - rain, 0),
    temperature: number(current.temperature_2m),
    maxTemperature: maximums.length ? Math.max(...maximums) : number(current.temperature_2m),
    soil: number(current.soil_moisture_3_to_9cm), wind: number(current.wind_speed_10m), time: current.time,
  };
}

function weatherValue(value, unit, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString("uz-UZ", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}` : "—";
}

function premiumQualityMetrics() {
  if (!dashboardSummary) return [];
  const totals = dashboardSummary.totals;
  return [
    { label: "Dala geometriyasi", value: 100 },
    { label: "Real ET mosligi", value: actualEtMetadata ? percent(actualEtMetadata.matched_fields, actualEtMetadata.matched_fields + actualEtMetadata.unmatched_fields) : 98.6 },
    { label: "Suv yo‘li", value: percent(10554, 10710) },
    { label: "GMR ma’lumoti", value: 100 - percent(totals.gmr_proxy_polygons, totals.polygons) },
    { label: "Bonitet qamrovi", value: 100 - percent(totals.bonitet_missing_polygons, totals.polygons) },
  ];
}

function renderPremiumQuality() {
  const metrics = premiumQualityMetrics();
  if (!metrics.length) return;
  const score = sum(metrics, (item) => item.value) / metrics.length;
  document.querySelector("#premium-quality-ring").style.setProperty("--quality", score);
  document.querySelector("#premium-quality-score").textContent = `${fmtInt.format(score)}%`;
  document.querySelector("#premium-quality-ring small").textContent = score >= 90 ? "Yaxshi" : score >= 75 ? "Qoniqarli" : "Tekshirish kerak";
  document.querySelector("#premium-quality-list").innerHTML = metrics.map((item) => `<div><span><i>✓</i>${escapeHtml(item.label)}</span><strong>${fmtInt.format(item.value)}%</strong></div>`).join("");
}

function renderPremiumCropDistribution(summary) {
  const colors = ["#168951", "#2e7be7", "#f2ae25", "#ef6b45", "#8bb8c5", "#8a75d6"];
  const totalArea = sum(summary.crops, (item) => item.area_ha);
  const visible = summary.crops.slice(0, 5);
  const visibleArea = sum(visible, (item) => item.area_ha);
  if (totalArea > visibleArea) visible.push({ label: "Boshqa", area_ha: totalArea - visibleArea });
  let cursor = 0;
  const stops = visible.map((item, index) => {
    const start = cursor;
    cursor += percent(item.area_ha, totalArea);
    return `${colors[index]} ${start}% ${cursor}%`;
  }).join(",");
  document.querySelector("#premium-crop-distribution").innerHTML = `<div class="crop-concept-donut" style="background:radial-gradient(circle closest-side,#fff 63%,transparent 65%),conic-gradient(${stops})"><div><strong>${fmtInt.format(totalArea)}</strong><small>ga</small></div></div><div class="crop-concept-list">${visible.map((item, index) => `<div><span><i style="background:${colors[index]}"></i>${escapeHtml(item.label)}</span><small>${fmtInt.format(item.area_ha)} ga</small><strong>${fmtDec.format(percent(item.area_ha, totalArea))}%</strong></div>`).join("")}</div>`;
  document.querySelector("#premium-crop-count").textContent = `${fmtInt.format(summary.crops.length)} ekin turi · ${fmtInt.format(totalArea)} ga`;
}

function renderPremiumMonthlyEt() {
  const values = actualEtMetadata?.official_period_monthly_m3;
  if (!values) return;
  const monthLabels = { 4: "Aprel", 5: "May", 6: "Iyun", 7: "Iyul", 8: "Avgust", 9: "Sentabr" };
  const rows = Object.entries(values).map(([month, value]) => ({ month, label: monthLabels[month], value: number(value) / 1e6 }));
  const maximum = Math.max(...rows.map((item) => item.value), 1);
  document.querySelector("#premium-monthly-et").innerHTML = rows.map((item) => `<div class="monthly-et-column"><strong>${fmtDec.format(item.value)}</strong><div><i style="height:${item.value / maximum * 100}%"></i></div><span>${item.label}</span></div>`).join("");
  document.querySelector("#premium-et-total").textContent = `Jami (aprel–sentabr): ${balanceMillions(actualEtMetadata.official_period_et_m3)} mln m³`;
  document.querySelector("#premium-real-et").textContent = premiumMillions(actualEtMetadata.official_period_et_m3);
  document.querySelector("#premium-et-note").textContent = `${fmtInt.format(actualEtMetadata.matched_fields)} dala · ≥${fmtInt.format(actualEtMetadata.match_threshold_pct || 70)}% fazoviy moslik`;
}

function renderPremiumWeather(payload, sourceLabel) {
  const daily = payload?.daily || {};
  const current = payload?.current || {};
  const times = daily.time || [];
  const maxTemps = daily.temperature_2m_max || [];
  const minTemps = daily.temperature_2m_min || [];
  const rain = daily.precipitation_sum || [];
  const weatherCodes = daily.weather_code || [];
  const winds = daily.wind_speed_10m_max || [];
  const dayFormatter = new Intl.DateTimeFormat("uz-UZ", { weekday: "short" });
  const dateFormatter = new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "short" });
  const weatherIcon = (index) => number(rain[index]) > .2 ? "🌧" : number(weatherCodes[index]) > 2 ? "⛅" : "☀";
  document.querySelector("#premium-forecast").innerHTML = times.slice(0, 7).map((date, index) => {
    const parsed = new Date(`${date}T12:00:00`);
    return `<div class="forecast-day"><strong>${index === 0 ? "Bugun" : escapeHtml(dayFormatter.format(parsed))}</strong><small>${escapeHtml(dateFormatter.format(parsed))}</small><span class="forecast-icon">${weatherIcon(index)}</span><b>${fmtInt.format(maxTemps[index])}°</b><em>${fmtInt.format(minTemps[index])}°</em><span>♢ ${fmtDec.format(rain[index])} mm</span><span>≋ ${fmtInt.format(winds[index] || current.wind_speed_10m)} km/s</span></div>`;
  }).join("");
  const average = maxTemps.length ? sum(maxTemps, Number) / maxTemps.length : number(current.temperature_2m);
  const totalRain = sum(rain, Number);
  document.querySelector("#premium-weather-summary").innerHTML = `<div><i>♨</i><span>O‘rt. harorat<strong>${fmtDec.format(average)}°C</strong></span></div><div><i>☔</i><span>Jami yog‘ingarchilik<strong>${fmtDec.format(totalRain)} mm</strong></span></div><div><i>♢</i><span>O‘rt. namlik<strong>${fmtInt.format(current.relative_humidity_2m)}%</strong></span></div><div><i>≋</i><span>Shamol (hozir)<strong>${fmtDec.format(current.wind_speed_10m)} km/s</strong></span></div>`;
  document.querySelector("#premium-weather-source").textContent = sourceLabel;
}

function premiumWaterChartSvg(limit, actualEt, rainTotal, groundwaterTotal, distributionLoss) {
  const labels = (officialLimit?.monthly_limits || []).map((item) => item.month);
  const limitParts = (officialLimit?.monthly_limits || []).map((item) => number(item.limit_m3));
  const etParts = labels.map((_, index) => number(actualEtMetadata?.official_period_monthly_m3?.[String(index + 4)]));
  if (!labels.length || !etParts.some(Boolean)) return "";
  const cumulative = (items) => items.map((_, index) => sum(items.slice(0, index + 1), Number));
  const etCumulative = cumulative(etParts);
  const shares = limitParts.map((value) => percent(value, sum(limitParts, Number)) / 100);
  const rainCum = cumulative(shares.map((share) => rainTotal * share));
  const groundwaterCum = cumulative(etParts.map((value) => groundwaterTotal * value / Math.max(actualEt, 1)));
  const lossCum = cumulative(shares.map((share) => distributionLoss * share));
  const width = 760, height = 290, left = 48, right = 18, top = 20, bottom = 38;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const maximum = Math.max(350e6, limit, actualEt);
  const x = (index) => left + (index + .5) * plotWidth / labels.length;
  const y = (value) => top + plotHeight - value / maximum * plotHeight;
  const grid = [0, 50, 100, 150, 200, 250, 300, 350].map((value) => `<line x1="${left}" x2="${width - right}" y1="${y(value * 1e6)}" y2="${y(value * 1e6)}" stroke="#e7ece9"/><text x="${left - 9}" y="${y(value * 1e6) + 3}" text-anchor="end" fill="#68786f" font-size="9">${value}</text>`).join("");
  const bars = labels.map((label, index) => {
    const barWidth = 40, startX = x(index) - barWidth / 2;
    const lossHeight = plotHeight - (y(lossCum[index]) - top);
    const groundwaterHeight = plotHeight - (y(groundwaterCum[index]) - top);
    const rainHeight = plotHeight - (y(rainCum[index]) - top);
    return `<rect x="${startX}" y="${y(lossCum[index])}" width="${barWidth}" height="${lossHeight}" rx="3" fill="#a8b4ba"/><rect x="${startX}" y="${y(lossCum[index] + groundwaterCum[index])}" width="${barWidth}" height="${groundwaterHeight}" fill="#aa9be9"/><rect x="${startX}" y="${y(lossCum[index] + groundwaterCum[index] + rainCum[index])}" width="${barWidth}" height="${rainHeight}" rx="3" fill="#74d4c1"/>`;
  }).join("");
  const points = etCumulative.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const dots = etCumulative.map((value, index) => `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="#fff" stroke="#1474ee" stroke-width="3"><title>${labels[index]}: ${balanceMillions(value)} mln m³</title></circle>`).join("");
  const xLabels = labels.map((label, index) => `<text x="${x(index)}" y="${height - 12}" text-anchor="middle" fill="#52645a" font-size="9">${label}</text>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Rasmiy suv limiti va real ET oylik dinamikasi">${grid}${bars}<line x1="${left}" x2="${width - right}" y1="${y(limit)}" y2="${y(limit)}" stroke="#1474ee" stroke-width="2" stroke-dasharray="6 5"/><polyline points="${points}" fill="none" stroke="#1474ee" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}${xLabels}</svg>`;
}

function renderPremiumManagement(limit, actualEt, deficit) {
  if (!dashboardSummary) return;
  const fulfillment = percent(actualEt, limit);
  const saving = limit - actualEt;
  const weather = currentWeather ? weatherStats(currentWeather) : null;
  const quality = premiumQualityMetrics();
  const qualityScore = quality.length ? sum(quality, (item) => item.value) / quality.length : 0;
  const items = [
    { text: `Real ET rasmiy limitning ${fmtDec.format(fulfillment)}% qismini tashkil etdi; farq ${balanceMillions(Math.abs(saving))} mln m³.`, warning: saving < 0 },
    { text: `${fmtInt.format(actualEtMetadata?.matched_fields || 0)} dala real ET bilan fazoviy moslashtirilgan.`, warning: false },
    { text: weather ? `7 kunlik yog‘in ${fmtDec.format(weather.rain)} mm, ET0 ${fmtDec.format(weather.et0)} mm; sug‘orish nazorati zarur.` : "Open-Meteo ma’lumoti yuklanmoqda.", warning: weather?.deficit > 30 },
    { text: `${fmtInt.format(actualEtMetadata?.unmatched_fields || 0)} dala ET qamrovi chegarasidan tashqarida va alohida tekshiruv talab qiladi.`, warning: true },
    { text: `Umumiy ma’lumotlar sifati ${fmtInt.format(qualityScore)}% — ${qualityScore >= 90 ? "yaxshi darajada" : "qo‘shimcha tekshiruv zarur"}.`, warning: qualityScore < 90 },
  ];
  document.querySelector("#premium-management-summary").innerHTML = items.map((item) => `<div class="${item.warning ? "warning" : ""}"><i>${item.warning ? "!" : "✓"}</i><span>${escapeHtml(item.text)}</span></div>`).join("");
  document.querySelector("#premium-fulfillment").textContent = fmtDec.format(fulfillment);
  document.querySelector("#premium-saving").textContent = `${saving >= 0 ? "Farq" : "Ortiqcha talab"}: ${balanceMillions(Math.abs(saving))} mln m³`;
  document.querySelector("#premium-saving").classList.toggle("negative", saving < 0);
}

function renderPremiumWaterBalance({ limit, supplied, used, actualEt, rain, groundwater, distributionLoss, deficit }) {
  document.querySelector("#premium-limit").textContent = premiumMillions(limit);
  document.querySelector("#premium-real-et").textContent = premiumMillions(actualEt);
  const svg = premiumWaterChartSvg(limit, actualEt, rain, groundwater, distributionLoss);
  document.querySelector("#premium-water-chart").innerHTML = `${svg || '<div class="chart-loading">Oylik real ET yuklanmoqda…</div>'}<div class="water-chart-summary"><div><i class="limit-dot"></i><span>Rasmiy suv limiti</span><strong>${balanceMillions(limit)} mln m³</strong></div><div><i class="et-dot"></i><span>ET (Real)</span><strong>${balanceMillions(actualEt)} mln m³</strong></div><div><i class="rain-dot"></i><span>Yog‘ingarchilik</span><strong>${balanceMillions(rain)} mln m³</strong></div><div><i class="ground-dot"></i><span>Sizot suvlari oqimi</span><strong>${balanceMillions(groundwater)} mln m³</strong></div><div><i class="loss-dot"></i><span>Boshqa yo‘qotishlar</span><strong>${balanceMillions(distributionLoss)} mln m³</strong></div></div>`;
  renderPremiumManagement(limit, actualEt, deficit);
}

function renderWeather(payload, sourceLabel, fallback = false) {
  currentWeather = payload;
  weatherLoadComplete = true;
  const stats = weatherStats(payload);
  document.querySelector("#weather-temp").textContent = weatherValue(stats.temperature, "°C");
  document.querySelector("#weather-rain").textContent = weatherValue(stats.rain, "mm");
  document.querySelector("#weather-et0").textContent = weatherValue(stats.et0, "mm");
  document.querySelector("#weather-deficit").textContent = weatherValue(stats.deficit, "mm");
  document.querySelector("#weather-soil").textContent = weatherValue(stats.soil, "m³/m³", 2);
  document.querySelector("#weather-wind").textContent = weatherValue(stats.wind, "km/soat");
  document.querySelector("#weather-observed-at").textContent = stats.time ? `${stats.time.replace("T", " ")} (Toshkent)` : "Vaqt mavjud emas";
  const source = document.querySelector("#weather-source");
  source.textContent = sourceLabel;
  source.classList.toggle("offline", fallback);
  renderPremiumWeather(payload, sourceLabel);
  renderConclusions();
  if (districtBalance) updateWaterBalance();
  updateRecommendationControl();
  if (selectedFeature) { renderFieldDecision(selectedFeature.properties); renderRouteReport(selectedFeature.properties); }
}

async function loadWeather() {
  const liveSources = [
    { url: WEATHER_API_URL, label: "Open-Meteo · jonli API" },
    { url: WEATHER_DIRECT_URL, label: "Open-Meteo · jonli API (to‘g‘ridan-to‘g‘ri)" },
  ];
  for (const source of liveSources) {
    try {
      const response = await fetch(source.url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`);
      renderWeather(await response.json(), source.label);
      return;
    } catch (error) {
      console.warn(`Weather source unavailable: ${source.url}`, error);
    }
  }
  try {
    const response = await fetch(WEATHER_SNAPSHOT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Saqlangan ob-havo: ${response.status}`);
    const snapshot = await response.json();
    renderWeather(snapshot.weather || snapshot, "Open-Meteo · saqlangan nusxa", true);
  } catch (snapshotError) {
    const source = document.querySelector("#weather-source");
    source.textContent = "Open-Meteo ulanmagan";
    source.classList.add("offline");
    weatherLoadComplete = true;
    renderConclusions();
    updateRecommendationControl();
    console.warn("Weather unavailable", snapshotError);
  }
}

async function loadOfficialPeriodWeather() {
  const sources = [OFFICIAL_PERIOD_WEATHER_URL, OFFICIAL_PERIOD_WEATHER_SNAPSHOT_URL];
  for (const url of sources) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Open-Meteo tarixiy davr: ${response.status}`);
      const payload = await response.json();
      officialPeriodWeather = payload.weather || payload;
      if (districtBalance) updateWaterBalance();
      return;
    } catch (error) {
      console.warn(`Official-period weather unavailable: ${url}`, error);
    }
  }
}

function barRows(items, total, limit = 6) {
  const visible = items.slice(0, limit);
  const maximum = Math.max(...visible.map((item) => item.water_m3), 1);
  return visible.map((item) => `<div class="bar-row"><span>${escapeHtml(item.label)}</span><div class="bar-track"><div class="bar-fill" style="width:${item.water_m3 / maximum * 100}%"></div></div><span class="bar-value">${fmtDec.format(item.water_m3 / 1e6)}</span></div>`).join("");
}

function simpleRows(items, total, limit = 6) {
  return items.slice(0, limit).map((item) => {
    const share = percent(item.water_m3, total);
    return `<div class="simple-row"><div class="simple-row-head"><strong>${escapeHtml(item.label)}</strong><span>${fmtDec.format(item.water_m3 / 1e6)} mln m³ · ${fmtDec.format(share)}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${share}%"></div></div></div>`;
  }).join("");
}

function renderDashboard(summary) {
  dashboardSummary = summary;
  const t = summary.totals;
  document.querySelector("#kpi-features").textContent = fmtInt.format(t.polygons);
  document.querySelector("#kpi-fields").textContent = `${fmtInt.format(t.fields)} mantiqiy dala`;
  document.querySelector("#kpi-area").textContent = fmtInt.format(t.area_ha);
  document.querySelector("#kpi-water").textContent = `${fmtDec.format(t.planned_water_m3 / 1e6)} mln m³`;
  document.querySelector("#kpi-norm").textContent = `${fmtInt.format(t.weighted_norm_m3ha)} m³/ga o‘rtacha`;
  document.querySelector("#kpi-review").textContent = fmtInt.format(t.estimated_polygons);
  document.querySelector("#crop-bars").innerHTML = barRows(summary.crops, t.planned_water_m3);
  document.querySelector("#gmr-bars").innerHTML = simpleRows(summary.gmrs, t.planned_water_m3, 6);

  const observedShare = percent(t.observed_polygons, t.polygons);
  const donut = document.querySelector("#quality-donut");
  donut.style.setProperty("--observed", observedShare);
  document.querySelector("#quality-percent").textContent = `${fmtDec.format(observedShare)}%`;
  document.querySelector("#quality-legend").innerHTML = `<div class="legend-item"><i style="background:#17663b"></i><span>Manba asosida</span><strong>${fmtInt.format(t.observed_polygons)}</strong><small>${fmtDec.format(t.observed_water_m3 / 1e6)} mln m³</small></div><div class="legend-item"><i style="background:#d88917"></i><span>Taxminiy</span><strong>${fmtInt.format(t.estimated_polygons)}</strong><small>${fmtDec.format(t.estimated_water_m3 / 1e6)} mln m³</small></div>`;
  const observedWaterShare = percent(t.observed_water_m3, t.planned_water_m3);
  document.querySelector("#water-composition").innerHTML = `<div class="composition-track"><div class="composition-observed" style="width:${observedWaterShare}%"></div><div class="composition-estimated" style="width:${100 - observedWaterShare}%"></div></div><div class="composition-legend"><div><span>Manba asosidagi suv</span><strong>${fmtDec.format(t.observed_water_m3 / 1e6)} mln m³</strong><small>${fmtDec.format(observedWaterShare)}% jami hajmdan</small></div><div><span>Taxminiy suv</span><strong>${fmtDec.format(t.estimated_water_m3 / 1e6)} mln m³</strong><small>${fmtDec.format(100 - observedWaterShare)}% jami hajmdan</small></div></div>`;
  document.querySelector("#data-status").textContent = `${fmtInt.format(t.polygons)} poligon · tahlil tayyor`;
  document.querySelector("#premium-area").textContent = fmtInt.format(t.area_ha);
  document.querySelector("#premium-fields").textContent = `GDB · ${fmtInt.format(t.fields)} DALA`;
  renderPremiumCropDistribution(summary);
  renderPremiumQuality();
  renderConclusions();
}

function renderDistrictCropAssignment(features = []) {
  const total = districtAnalytics?.field_area?.fields || features.length;
  const assigned = features.filter((feature) => feature.properties.crop_group_mvp).length;
  const share = percent(assigned, total);
  document.querySelector("#district-assignment-label").textContent = `${fmtInt.format(assigned)} / ${fmtInt.format(total)} dala`;
  document.querySelector("#district-assignment-bar").style.width = `${Math.min(share, 100)}%`;
  if (!assigned) {
    document.querySelector("#district-assignment-note").textContent = "Ekinlar boshlang‘ich holatda kiritilmagan; tavsiya xaritada qo‘llangach yangilanadi.";
    return;
  }
  const allocation = PNG_CROP_ORDER.map((group) => {
    const matching = features.filter((feature) => feature.properties.crop_group_mvp === group);
    return { group, fields: matching.length, area: sum(matching, (feature) => feature.properties.maydoni) };
  }).filter((item) => item.fields);
  document.querySelector("#district-assignment-note").textContent = allocation.map((item) => `${CROP_LABELS[item.group]}: ${fmtInt.format(item.fields)} dala / ${fmtDec.format(item.area)} ga`).join(" · ");
}

function renderDistrictAnalytics(data) {
  districtAnalytics = data;
  const bonitet = data.bonitet;
  document.querySelector(".bonitet-ring").style.setProperty("--bonitet", bonitet.average);
  document.querySelector("#district-bonitet-average").textContent = fmtDec.format(bonitet.average);
  document.querySelector("#district-bonitet-min").textContent = fmtInt.format(bonitet.minimum);
  document.querySelector("#district-bonitet-max").textContent = fmtInt.format(bonitet.maximum);
  document.querySelector("#district-field-min").textContent = `${fmtPrecise.format(data.field_area.minimum_ha)} ga`;
  document.querySelector("#district-field-median").textContent = `${fmtDec.format(data.field_area.median_ha)} ga`;
  document.querySelector("#district-field-max").textContent = `${fmtDec.format(data.field_area.maximum_ha)} ga`;
  document.querySelector("#district-bonitet-note").textContent = `${fmtInt.format(bonitet.source_polygons)} tuproq poligoni va ${fmtInt.format(bonitet.covered_area_ha)} ga qamrov bo‘yicha maydon-vaznli baho.`;

  const textureColors = { 1: "#d5b46d", 2: "#e0a755", 3: "#65b97b", 4: "#258b63", 5: "#e3c98e", 6: "#5e6170", 7: "#9a8870", 8: "#397b60" };
  document.querySelector("#district-soil-profile").innerHTML = data.soil_profile.map((layer) => `<div class="soil-depth-row"><div class="soil-depth-heading"><strong>${escapeHtml(layer.depth)}</strong><span>${escapeHtml(layer.dominant.label)} · ${fmtDec.format(layer.dominant.share_pct)}%</span></div><div class="soil-profile-track">${layer.distribution.map((item) => `<i style="width:${item.share_pct}%;background:${textureColors[item.code]}" title="${escapeHtml(item.label)}: ${fmtDec.format(item.share_pct)}%"></i>`).join("")}</div><p>${layer.distribution.map((item) => `${escapeHtml(item.label)} ${fmtDec.format(item.share_pct)}%`).join(" · ")}</p></div>`).join("");
  const textureCodes = [...new Map(data.soil_profile.flatMap((layer) => layer.distribution).map((item) => [item.code, item])).values()].sort((first, second) => first.code - second.code);
  document.querySelector("#district-texture-key").innerHTML = textureCodes.map((item) => `<span><i style="background:${textureColors[item.code]}"></i>${escapeHtml(item.label)}</span>`).join("");

  const groundwater = data.groundwater;
  document.querySelector("#district-groundwater-average").textContent = fmtInt.format(groundwater.average_mm);
  document.querySelector("#district-groundwater-min").textContent = `${fmtInt.format(groundwater.minimum_mm)} mm`;
  document.querySelector("#district-groundwater-max").textContent = `${fmtInt.format(groundwater.maximum_mm)} mm`;
  document.querySelector("#district-groundwater-bands").innerHTML = groundwater.bands.map((band) => `<div><strong>${fmtDec.format(band.share_pct)}%</strong><span>${escapeHtml(band.label)}</span><small>${fmtInt.format(band.measurements)} o‘lchov</small></div>`).join("");
  document.querySelector("#district-gmr-note").textContent = `${data.gmr.length} rayon · ${fmtInt.format(data.field_area.total_ha)} ga`;
  document.querySelector("#district-gmr-distribution").innerHTML = data.gmr.map((item) => `<div><span>GMR ${escapeHtml(item.gmr)}</span><div><i style="width:${item.share_pct}%"></i></div><strong>${fmtDec.format(item.share_pct)}%</strong><small>${fmtInt.format(item.area_ha)} ga · ${fmtInt.format(item.fields)} dala</small></div>`).join("");

  const recommendation = data.recommendation;
  document.querySelector("#district-recommendation-area").textContent = fmtInt.format(recommendation.total_area_ha);
  document.querySelector("#district-recommendation-bars").innerHTML = recommendation.crops.map((crop) => `<div><div class="recommendation-bar-heading"><span><i style="background:${crop.color}"></i>${escapeHtml(crop.label)}</span><strong>${fmtInt.format(crop.area_ha)} ga</strong><small>${fmtInt.format(crop.fields)} dala · ${fmtDec.format(crop.share_pct)}%</small></div><div class="recommendation-track"><i style="width:${Math.max(crop.share_pct, .25)}%;background:${crop.color}"></i></div></div>`).join("");
  renderDistrictCropAssignment(fullData?.features || []);

  document.querySelector("#district-land-area").textContent = fmtInt.format(data.field_area.total_ha);
  document.querySelector("#district-field-count").textContent = `${fmtInt.format(data.field_area.fields)} ta mantiqiy dala`;
  document.querySelector("#district-canal-count").textContent = fmtInt.format(data.infrastructure.canals.features);
  document.querySelector("#district-canal-length").textContent = `${fmtDec.format(data.infrastructure.canals.length_km)} km`;
  document.querySelector("#district-drain-count").textContent = fmtInt.format(data.infrastructure.drains.features);
  document.querySelector("#district-drain-length").textContent = `${fmtDec.format(data.infrastructure.drains.length_km)} km`;
  document.querySelector("#district-station-count").textContent = fmtInt.format(data.infrastructure.groundwater_stations);
}

async function loadDistrictAnalytics() {
  try {
    const response = await fetch(DISTRICT_ANALYTICS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Tuman analitikasi: ${response.status}`);
    renderDistrictAnalytics(await response.json());
  } catch (error) {
    document.querySelector("#district-intelligence-title").textContent = "Tuman analitikasi yuklanmadi";
    console.warn(error);
  }
}

function balanceMillions(value) { return fmtDec.format(number(value) / 1e6); }
function premiumMillions(value) { return fmtPrecise.format(number(value) / 1e6); }

function setBalanceInputs() {
  if (!districtBalance) return;
  const defaults = districtBalance.editable_defaults;
  const limit = officialLimit?.total_limit_m3 ?? defaults.limit_m3;
  const supplied = officialLimit ? limit * .88 : defaults.supplied_m3;
  const used = officialLimit ? supplied * .82 : defaults.used_m3;
  document.querySelector("#input-water-limit").value = (limit / 1e6).toFixed(2);
  document.querySelector("#input-water-supplied").value = (supplied / 1e6).toFixed(2);
  document.querySelector("#input-water-used").value = (used / 1e6).toFixed(2);
  updateWaterBalance();
}

function updateBalancePeriodLabel() {
  if (officialLimit) {
    document.querySelector("#balance-period").textContent = `${officialLimit.period.start} — ${officialLimit.period.end} · rasmiy limit va real ET bir xil aprel–sentabr oylari`;
  } else if (districtBalance) {
    document.querySelector("#balance-period").textContent = `${districtBalance.period.start_date} — ${districtBalance.period.end_date} · ${fmtInt.format(districtBalance.period.days)} kun · ${fmtInt.format(districtBalance.field_totals.area_ha)} ga`;
  }
}

function renderOfficialLimit(data) {
  officialLimit = data;
  const total = number(data.total_limit_m3);
  const monthTotal = sum(data.monthly_limits || [], (item) => item.limit_m3);
  const maximum = Math.max(...(data.monthly_limits || []).map((item) => number(item.limit_m3)), 1);
  document.querySelector("#official-limit-card").hidden = false;
  document.querySelector("#official-limit-title").textContent = `${data.district} · ${data.period.label}`;
  document.querySelector("#official-limit-total").textContent = `${balanceMillions(total)} mln m³`;
  document.querySelector("#official-limit-note").textContent = `${data.period.start} — ${data.period.end}. ${data.source.note}`;
  document.querySelector("#official-limit-months").innerHTML = (data.monthly_limits || []).map((item) => `<div class="official-month"><div><strong>${escapeHtml(item.month)}</strong><span>${balanceMillions(item.limit_m3)} mln m³</span></div><div class="official-track"><i style="width:${number(item.limit_m3) / maximum * 100}%"></i></div></div>`).join("");
  document.querySelector("#balance-limit-status").textContent = "Rasmiy limit · 2025";
  document.querySelector("#balance-limit-status").classList.remove("estimated");
  document.querySelector("#limit-input-source").textContent = `mln m³ · rasmiy jami ${balanceMillions(total)}; oylar ${balanceMillions(monthTotal)}`;
  document.querySelector("#premium-limit").textContent = premiumMillions(total);
  document.querySelector("#premium-period").textContent = "2025-yil, 1-aprel — 30-sentabr";
  updateBalancePeriodLabel();
  if (districtBalance) setBalanceInputs();
}

async function loadOfficialLimit() {
  try {
    const response = await fetch(OFFICIAL_LIMIT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Rasmiy limit yuklanmadi: ${response.status}`);
    renderOfficialLimit(await response.json());
  } catch (error) {
    document.querySelector("#balance-limit-status").textContent = "Limit — taxminiy";
    console.warn(error);
  }
}

function updateWaterBalance() {
  if (!districtBalance) return;
  const limit = number(document.querySelector("#input-water-limit").value) * 1e6;
  const supplied = number(document.querySelector("#input-water-supplied").value) * 1e6;
  const used = number(document.querySelector("#input-water-used").value) * 1e6;
  const realEt = number(actualEtMetadata?.official_period_et_m3);
  const potentialEt = districtBalance.evapotranspiration.potential_etc_m3;
  const etDemand = realEt || potentialEt;
  const periodRainMm = officialPeriodWeather ? sum(officialPeriodWeather.daily?.precipitation_sum || [], Number) : 0;
  const periodAligned = Boolean(realEt && periodRainMm && actualEtMetadata?.matched_area_ha);
  const rain = periodAligned
    ? periodRainMm * .8 * number(actualEtMetadata.matched_area_ha) * 10
    : districtBalance.weather.effective_rain_m3;
  const groundwater = periodAligned
    ? number(actualEtMetadata.official_period_groundwater_m3)
    : districtBalance.evapotranspiration.groundwater_contribution_m3;
  const availableForEt = used + rain + groundwater;
  const actualEt = realEt || Math.min(potentialEt, availableForEt);
  const deficit = Math.max(etDemand - availableForEt, 0);
  const distributionLoss = Math.max(supplied - used, 0);
  const unusedLimit = Math.max(limit - supplied, 0);

  document.querySelector("#balance-limit").textContent = balanceMillions(limit);
  document.querySelector("#balance-supplied").textContent = balanceMillions(supplied);
  document.querySelector("#balance-used").textContent = balanceMillions(used);
  document.querySelector("#balance-actual-et").textContent = balanceMillions(actualEt);
  document.querySelector("#balance-supply-share").textContent = `${fmtDec.format(percent(supplied, limit))}% limit berilgan`;
  document.querySelector("#balance-use-share").textContent = `${fmtDec.format(percent(used, supplied))}% berilgan suvdan`;
  document.querySelector("#balance-loss").textContent = `${balanceMillions(distributionLoss)} mln m³`;
  document.querySelector("#balance-rain").textContent = `${balanceMillions(rain)} mln m³`;
  document.querySelector("#balance-groundwater").textContent = `${balanceMillions(groundwater)} mln m³`;
  document.querySelector("#balance-deficit").textContent = `${balanceMillions(deficit)} mln m³`;

  const maximum = Math.max(limit, supplied, used, actualEt, 1);
  const rows = [
    ["Umumiy limit", limit, "limit"], ["Amalda berilgan", supplied, "supplied"],
    ["Dalalarda ishlatilgan", used, "used"], ["ET bo‘yicha sarflangan", actualEt, "et"],
  ];
  document.querySelector("#balance-flow").innerHTML = rows.map(([label, value, className]) => `<div class="flow-row"><span>${label}</span><div class="flow-track"><div class="flow-fill ${className}" style="width:${value / maximum * 100}%"></div></div><strong>${balanceMillions(value)}</strong></div>`).join("");
  document.querySelector("#balance-et-source").textContent = realEt ? `real ET · aprel–sentabr · ${fmtInt.format(actualEtMetadata.matched_fields)} dala` : "ekin va tuproq evapotranspiratsiyasi";
  document.querySelector("#balance-et-badge").textContent = realEt ? `Real ET · fazoviy moslashtirilgan${periodAligned ? " · davrlar teng" : ""}` : "Open-Meteo ET modeli";
  document.querySelector("#balance-conclusion").textContent = deficit > 0 ? `ET talabi bo‘yicha ${balanceMillions(deficit)} mln m³ suv defitsiti mavjud` : `Mavjud suv manbalari ET talabini qoplaydi`;
  document.querySelector("#balance-equation").textContent = realEt
    ? `Real ET (aprel–sentabr) = Σ(oylik ET mm × dala ga × 10) = ${balanceMillions(realEt)} mln m³. Mavjud manba: ishlatilgan ${balanceMillions(used)} + samarali yog‘in ${balanceMillions(rain)} + sizot ${balanceMillions(groundwater)} mln m³${periodAligned ? "; yog‘in ham 2025-yil aprel–sentabr Open-Meteo davridan" : ""}. Ishlatilmagan limit: ${balanceMillions(unusedLimit)} mln m³.`
    : `ET sarfi = min(ETc ${balanceMillions(potentialEt)}, ishlatilgan ${balanceMillions(used)} + samarali yog‘in ${balanceMillions(rain)} + sizot ${balanceMillions(groundwater)}) = ${balanceMillions(actualEt)} mln m³. Ishlatilmagan limit: ${balanceMillions(unusedLimit)} mln m³.`;
  if (realEt) {
    const monthLabels = { 4: "Aprel", 5: "May", 6: "Iyun", 7: "Iyul", 8: "Avgust", 9: "Sentabr" };
    const monthRows = Object.entries(actualEtMetadata.official_period_monthly_m3 || {}).map(([month, value]) => ({ label: monthLabels[month] || month, water_m3: value }));
    document.querySelector("#balance-crop-et").innerHTML = barRows(monthRows, realEt, 6);
    document.querySelector("#balance-excluded").textContent = `${fmtInt.format(actualEtMetadata.unmatched_fields)} dala (${fmtDec.format(actualEtMetadata.unmatched_area_ha)} ga) real ET bilan 70% chegarada moslashmagan; real ET jami bu maydonlarni o‘z ichiga olmaydi.`;
  }
  renderPremiumMonthlyEt();
  renderPremiumQuality();
  renderPremiumWaterBalance({ limit, supplied, used, actualEt, rain, groundwater, distributionLoss, deficit });
  if (geoLayer) geoLayer.setStyle(styleFor);
  if (selectedFeature) { renderFieldDecision(selectedFeature.properties); renderRouteReport(selectedFeature.properties); }
}

function renderDistrictBalance(data) {
  districtBalance = data;
  document.querySelector("#balance-district").textContent = `${data.district.name} · kod ${data.district.code}`;
  updateBalancePeriodLabel();
  const cropLabels = { cotton: "Paxta", winter_grain: "Bug‘doy", alfalfa: "Beda", maize: "Makkajo‘xori", orchard: "Bog‘", melons: "Poliz", vegetables: "Sabzavot" };
  const maximum = Math.max(...data.crop_groups.map((group) => group.etc_m3), 1);
  document.querySelector("#balance-crop-et").innerHTML = data.crop_groups.map((group) => `<div class="bar-row"><span>${cropLabels[group.group] || group.group}</span><div class="bar-track"><div class="bar-fill" style="width:${group.etc_m3 / maximum * 100}%"></div></div><span class="bar-value">${balanceMillions(group.etc_m3)}</span></div>`).join("");
  document.querySelector("#balance-excluded").textContent = `${fmtInt.format(data.field_totals.unassigned_polygons_excluded)} poligon (${fmtDec.format(data.field_totals.unassigned_area_ha_excluded)} ga) tuman kodi bo‘sh bo‘lgani uchun ushbu hisobga kiritilmadi.`;
  setBalanceInputs();
  if (geoLayer) geoLayer.setStyle(styleFor);
  if (!document.querySelector("#dashboard-view").hidden) document.querySelector("#data-status").textContent = `${data.district.name} · ${data.period.days} kun`;
}

async function loadDistrictBalance() {
  try {
    const response = await fetch(DISTRICT_BALANCE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Tuman suv balansi yuklanmadi: ${response.status}`);
    renderDistrictBalance(await response.json());
    updateRecommendationControl();
  } catch (error) {
    document.querySelector("#balance-period").textContent = error.message;
    console.error(error);
  }
}

async function loadIrrigationRules() {
  try {
    const response = await fetch(IRRIGATION_RULES_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sug‘orish qoidalari yuklanmadi: ${response.status}`);
    const lines = (await response.text()).trim().split(/\r?\n/);
    const headers = lines.shift().split(",");
    irrigationRules = lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [headers[index], value])));
    if (fullData) {
      applyStoredCropAssignments(fullData.features);
      if (geoLayer) geoLayer.setStyle(styleFor);
    }
    if (splitState.parts.length) {
      splitState.parts.forEach(applySplitCropRule);
      renderSplitLayer();
    }
    if (selectedFeature) selectField(selectedFeature, selectedLayer);
    updateRecommendationControl();
  } catch (error) {
    console.error(error);
  }
}

function loadManualCropAssignments() {
  manualCropAssignments = {};
}

function highestNormRule(rules) {
  return [...rules].sort((first, second) => number(second.seasonal_norm_m3ha) - number(first.seasonal_norm_m3ha))[0] || null;
}

function nearestComponentRule(component, cropGroup) {
  const exact = highestNormRule(irrigationRules.filter((rule) => rule.gmr === component.gmr && rule.crop_group === cropGroup));
  if (exact) return { rule: exact, exact: true };
  const order = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const target = order.indexOf(component.gmr);
  const candidates = irrigationRules.filter((rule) => rule.crop_group === cropGroup);
  candidates.sort((first, second) => Math.abs(order.indexOf(first.gmr) - target) - Math.abs(order.indexOf(second.gmr) - target) || number(second.seasonal_norm_m3ha) - number(first.seasonal_norm_m3ha));
  return candidates[0] ? { rule: candidates[0], exact: false } : null;
}

function clearFieldCrop(properties) {
  districtNeedCache = null;
  Object.assign(properties, {
    crop_group_mvp: null, crop_mvp: null, crop_mvp_source: "manual_required",
    crop_mvp_confidence: null, norm_m3ha_mvp: null, planned_water_m3_mvp: null,
    seasonal_need_m3: null, irrigation_count_mvp: null, irrigation_start_mvp: null,
    irrigation_end_mvp: null, crop_norm_components: [], demo_norm_status: "crop_required",
    delivery_calc_status: "crop_required", source_share_m3: null, route_loss_m3_scn: null,
    delivery_est_m3: null, delivery_cover_pct: null,
  });
}

function applyManualCrop(properties, cropGroup) {
  if (!cropGroup || !PNG_CROP_ORDER.includes(cropGroup)) { clearFieldCrop(properties); return; }
  const sourceComponents = properties.soil_gmr_components?.length ? properties.soil_gmr_components : [{
    area_ha: number(properties.maydoni), gmr: properties.gmr_mvp, bonitet: properties.bonitet,
    tm1: properties.Tm1, tm2: properties.Tm2, tm3: properties.Tm3, ss: properties.SS,
  }];
  const calculated = sourceComponents.map((component) => {
    const match = nearestComponentRule(component, cropGroup);
    const norm = number(match?.rule?.seasonal_norm_m3ha);
    return {
      ...component, rule_gmr: match?.rule?.gmr || null, exact_rule: Boolean(match?.exact), norm_m3ha: norm,
      water_m3: number(component.area_ha) * norm, irrigation_pattern: match?.rule?.irrigation_pattern || null,
      start: match?.rule?.start_month_day || null, end: match?.rule?.end_month_day || null,
      source: match?.rule?.source || null,
    };
  });
  const totalNeed = sum(calculated, (component) => component.water_m3);
  const patterns = [...new Set(calculated.map((component) => component.irrigation_pattern).filter(Boolean))];
  const starts = calculated.map((component) => component.start).filter(Boolean).sort();
  const ends = calculated.map((component) => component.end).filter(Boolean).sort();
  districtNeedCache = null;
  Object.assign(properties, {
    crop_group_mvp: cropGroup, crop_mvp: CROP_LABELS[cropGroup], crop_mvp_source: "manual_user",
    crop_mvp_confidence: 100, crop_norm_components: calculated,
    norm_m3ha_mvp: number(properties.maydoni) ? totalNeed / number(properties.maydoni) : null,
    planned_water_m3_mvp: totalNeed, seasonal_need_m3: totalNeed,
    allocation_reference_need_m3: totalNeed,
    irrigation_count_mvp: patterns.join(" / ") || null,
    irrigation_start_mvp: starts[0] || null, irrigation_end_mvp: ends[ends.length - 1] || null,
    norm_source: [...new Set(calculated.map((component) => component.source).filter(Boolean))].join("; "),
    demo_norm_status: totalNeed ? "demo_ready_proxy" : "demo_norm_unavailable",
    delivery_calc_status: totalNeed && properties.water_route ? "scenario_ready" : "norm_unavailable",
  });
}

function applyStoredCropAssignments(features) {
  features.forEach((feature) => applyManualCrop(feature.properties, manualCropAssignments[feature.properties.field_id] || ""));
}

function updateManualCropControls(properties = null) {
  const select = document.querySelector("#manual-crop-select");
  const splitButton = document.querySelector("#toolbar-start-split");
  const label = document.querySelector("#manual-crop-selected-field");
  if (!properties) {
    select.value = ""; select.disabled = true; splitButton.disabled = true; label.textContent = "Avval xaritadan dalani tanlang";
    return;
  }
  select.value = properties.crop_group_mvp || "";
  select.disabled = false;
  splitButton.disabled = false;
  const selectionName = properties.split_status === "scenario" ? `Qism ${properties.split_part}` : `Dala ${String(properties.field_id || properties.feature_id).slice(0, 8)}`;
  label.textContent = `${selectionName} · ${fmtDec.format(number(properties.maydoni))} ga`;
}

function assignCropToSelectedField() {
  if (!selectedFeature) return;
  const properties = selectedFeature.properties;
  const cropGroup = document.querySelector("#manual-crop-select").value;
  if (properties.split_status === "scenario") {
    properties.crop_group_mvp = cropGroup || null;
    applySplitCropRule(selectedFeature);
    renderSplitLayer();
    renderCropLegend();
    const replacementLayer = splitLayerForField(properties.field_id);
    if (replacementLayer) selectField(selectedFeature, replacementLayer);
    renderDistrictCropAssignment(fullData?.features || []);
    return;
  }
  if (cropGroup) manualCropAssignments[properties.field_id] = cropGroup;
  else delete manualCropAssignments[properties.field_id];
  applyManualCrop(properties, cropGroup);
  if (selectedLayer) selectedLayer.bindPopup(popupHtml(properties));
  if (geoLayer) geoLayer.setStyle(styleFor);
  renderCropLegend();
  selectField(selectedFeature, selectedLayer);
  renderDistrictCropAssignment(fullData?.features || []);
}

function currentDistrictUsedM3() {
  if (!districtBalance) return 0;
  const input = number(document.querySelector("#input-water-used")?.value) * 1e6;
  return input || districtBalance.editable_defaults.used_m3;
}

function currentDistrictNeed() {
  if (districtNeedCache) return districtNeedCache;
  const fallback = number(fullData?.features?.find((feature) => number(feature.properties.district_need_m3))?.properties?.district_need_m3)
    || number(districtBalance?.field_totals?.planned_water_m3);
  if (!fullData?.features?.length) return { value: fallback, mode: "static", assigned: 0, eligible: 0 };
  const splitParentId = splitState.parts.length ? splitState.parent?.properties?.field_id : null;
  const allocationFeatures = fullData.features.filter((feature) => feature.properties.water_route && feature.properties.field_id !== splitParentId);
  if (splitState.parts.length) allocationFeatures.push(...splitState.parts.filter((feature) => feature.properties.water_route));
  let complete = true, assigned = 0;
  const dynamicTotal = sum(allocationFeatures, (feature) => {
    const properties = feature.properties;
    const current = number(properties.seasonal_need_m3);
    const reference = number(properties.allocation_reference_need_m3);
    if (current) assigned += 1;
    if (!current && !reference) complete = false;
    return current || reference;
  });
  districtNeedCache = complete && dynamicTotal > 0
    ? { value: dynamicTotal, mode: "dynamic", assigned, eligible: allocationFeatures.length }
    : { value: fallback, mode: "static", assigned, eligible: allocationFeatures.length };
  return districtNeedCache;
}

function deliveryScenario(properties) {
  if (properties.delivery_calc_status !== "scenario_ready") return null;
  const activeLimit = number(document.querySelector("#input-water-limit")?.value) * 1e6 || number(properties.official_limit_m3);
  const need = number(properties.seasonal_need_m3);
  const denominator = currentDistrictNeed();
  const districtNeed = denominator.value;
  const lossPct = number(properties.route_loss_pct_scn);
  if (!activeLimit || !need || !districtNeed) return null;
  const sourceShare = activeLimit * need / districtNeed;
  const delivery = sourceShare * (1 - lossPct / 100);
  return { activeLimit, sourceShare, lossPct, lossM3: sourceShare - delivery, delivery, coverage: delivery / need, need, districtNeed, denominatorMode: denominator.mode };
}

function fieldWaterAnalysis(properties) {
  const delivery = deliveryScenario(properties);
  if (delivery) {
    const coverage = delivery.coverage;
    const key = coverage >= 1 ? "sufficient" : coverage >= .85 ? "limited" : coverage >= .65 ? "shortage" : "severe";
    const area = Math.max(number(properties.maydoni), .001);
    return { key, coverage, availableM3Ha: delivery.delivery / area, demandM3Ha: delivery.need / area, rainMm: 0, groundwaterMm: 0, delivery };
  }
  if (!districtBalance) return { key: "limited", coverage: 0, availableM3Ha: 0, demandM3Ha: 0, rainMm: 0, groundwaterMm: 0 };
  const crop = districtBalance.crop_groups.find((group) => group.group === properties.crop_group_mvp);
  const etcMm = crop?.etc_mm || 0;
  const rainMm = districtBalance.weather.effective_rain_m3 / districtBalance.field_totals.area_ha / 10;
  const groundwaterMm = etcMm * (GROUNDWATER_FACTOR[properties.gmr_mvp] ?? .08);
  const demandM3Ha = Math.max((etcMm - rainMm - groundwaterMm) * 10, 1);
  const availableM3Ha = currentDistrictUsedM3() / districtBalance.field_totals.area_ha;
  const coverage = availableM3Ha / demandM3Ha;
  const key = coverage >= 1 ? "sufficient" : coverage >= .85 ? "limited" : coverage >= .65 ? "shortage" : "severe";
  return { key, coverage, availableM3Ha, demandM3Ha, rainMm, groundwaterMm, etcMm };
}

function textureScore(texture, preferred) {
  if (!texture) return 60;
  if (preferred.includes(texture)) return 100;
  // FileGDB codes 1–4 form the loam gradient. Codes 5–8 are categorical,
  // therefore their numeric distance must never be treated as soil similarity.
  if (texture >= 1 && texture <= 4) {
    const loamPreferences = preferred.filter((value) => value >= 1 && value <= 4);
    const distance = loamPreferences.length ? Math.min(...loamPreferences.map((value) => Math.abs(value - texture))) : Infinity;
    return distance === 1 ? 72 : 45;
  }
  if (texture === 5) return preferred.includes(1) ? 72 : 45; // qumli ↔ qumoqli
  if (texture === 6) return preferred.includes(4) ? 72 : 45; // loyli ↔ og‘ir qumoqli
  if (texture === 7) return preferred.some((value) => value === 2 || value === 3) ? 55 : 40;
  if (texture === 8) return preferred.some((value) => value === 3 || value === 4) ? 90 : 50;
  return 45;
}

function soilSuitability(bonitet, minimum) {
  if (!bonitet) return 55;
  return bonitet >= minimum ? Math.min(100, 78 + (bonitet - minimum) * 1.2) : Math.max(25, 78 - (minimum - bonitet) * 3.5);
}

function rulesForField(properties) {
  return PNG_CROP_ORDER.map((cropGroup) => nearestComponentRule({ gmr: properties.gmr_mvp }, cropGroup)?.rule).filter(Boolean);
}

function cropRecommendations(properties) {
  return (cropCandidatesForField(properties) || []).slice(0, 3).map((item) => ({
    ...item, name: CROP_LABELS[item.group] || item.group,
    minBonitet: (CROP_PROFILES[item.group] || { minBonitet: 50 }).minBonitet,
  }));
}

function cropCandidatesForField(properties) {
  if (!districtBalance || !irrigationRules.length) return null;
  const components = properties.soil_gmr_components?.length ? properties.soil_gmr_components : [{
    area_ha: number(properties.maydoni), gmr: properties.gmr_mvp, bonitet: properties.bonitet,
    tm1: properties.Tm1, tm2: properties.Tm2, tm3: properties.Tm3, ss: properties.SS,
  }];
  const area = sum(components, (component) => component.area_ha) || number(properties.maydoni);
  if (!area) return null;
  const routeEfficiency = properties.water_route ? Math.max(0, 1 - number(properties.route_loss_pct_scn) / 100) : 0.75;
  const availableM3Ha = currentDistrictUsedM3() / districtBalance.field_totals.area_ha * routeEfficiency;
  const hot = currentWeather ? weatherStats(currentWeather).maxTemperature >= 40 : false;
  return PNG_CROP_ORDER.map((group) => {
    const profile = CROP_PROFILES[group] || { minBonitet: 50, textures: [2, 3], heat: 75 };
    const calculated = components.map((component) => {
      const match = nearestComponentRule(component, group);
      return { component, norm: number(match?.rule?.seasonal_norm_m3ha), matched: Boolean(match?.rule) };
    });
    if (!calculated.every((item) => item.matched)) return null;
    const need = sum(calculated, (item) => number(item.component.area_ha) * item.norm);
    const norm = need / area;
    const soilScore = sum(calculated, (item) => number(item.component.area_ha) * soilSuitability(number(item.component.bonitet) || number(properties.bonitet), profile.minBonitet)) / area;
    const mechanicalScore = sum(calculated, (item) => {
      const component = item.component;
      const tm1 = number(component.tm1) || number(properties.Tm1);
      const tm2 = number(component.tm2) || number(properties.Tm2) || tm1;
      const tm3 = number(component.tm3) || number(properties.Tm3) || tm2;
      return number(component.area_ha) * (textureScore(tm1, profile.textures) * .50 + textureScore(tm2, profile.textures) * .30 + textureScore(tm3, profile.textures) * .20);
    }) / area;
    const officialWaterScore = Math.min(100, percent(availableM3Ha, norm));
    const actualEtDemandM3Ha = number(properties.actual_et_total_mm) * 10;
    const actualEtScore = properties.actual_et_status === "matched" && actualEtDemandM3Ha
      ? Math.min(100, percent(availableM3Ha, actualEtDemandM3Ha))
      : officialWaterScore;
    const waterScore = officialWaterScore * .70 + actualEtScore * .30;
    const climateScore = hot ? profile.heat : 85;
    return { group, score: Math.round(waterScore * .45 + soilScore * .30 + mechanicalScore * .15 + climateScore * .10), norm, waterScore };
  }).filter(Boolean).sort((first, second) => second.score - first.score);
}

function recommendedCropForField(properties) {
  return (cropCandidatesForField(properties) || [])[0] || null;
}

function updateRecommendationControl() {
  const button = document.querySelector("#recommend-crops");
  if (!button) return;
  const ready = Boolean(fullData && districtBalance && irrigationRules.length && weatherLoadComplete);
  button.disabled = !ready;
  button.querySelector("small").textContent = ready ? "Barcha dalaga hisoblash" : "Dala, suv va ob-havo yuklanmoqda";
}

function applyCropRecommendations() {
  if (!fullData || !districtBalance || !irrigationRules.length) {
    document.querySelector("#map-hint").textContent = "Tavsiya uchun dala, suv balansi va PNG qoidalari yuklanishi kutilmoqda.";
    return;
  }
  const dashboardArea = sum(fullData.features, (feature) => feature.properties.maydoni);
  const sourceCropArea = sum(districtBalance.crop_groups.filter((item) => PNG_CROP_ORDER.includes(item.group)), (item) => item.area_ha);
  const targetAreas = new Map(districtBalance.crop_groups.filter((item) => PNG_CROP_ORDER.includes(item.group)).map((item) => [item.group, dashboardArea * number(item.area_ha) / sourceCropArea]));
  Object.entries(RECOMMENDATION_AREA_LIMIT_HA).forEach(([group, limit]) => targetAreas.set(group, Math.min(targetAreas.get(group) || limit, limit)));
  const assignedAreas = new Map(PNG_CROP_ORDER.map((group) => [group, 0]));
  const canAssign = (group, area) => {
    const assigned = assignedAreas.get(group) || 0;
    const hardLimit = RECOMMENDATION_AREA_LIMIT_HA[group];
    if (hardLimit !== undefined) return assigned + area <= hardLimit + 1e-9;
    return assigned + area <= (targetAreas.get(group) || 0) * 1.015;
  };
  const plans = fullData.features.map((feature) => ({ feature, area: number(feature.properties.maydoni), candidates: cropCandidatesForField(feature.properties) || [] })).filter((plan) => plan.candidates.length);
  const pairs = plans.flatMap((plan) => plan.candidates.map((candidate) => ({ plan, candidate }))).sort((first, second) => second.candidate.score - first.candidate.score);
  const assignments = new Map();
  [...PNG_CROP_ORDER].sort((first, second) => (targetAreas.get(first) || 0) - (targetAreas.get(second) || 0)).forEach((group) => {
    const target = targetAreas.get(group) || 0;
    const options = plans.map((plan) => ({ plan, candidate: plan.candidates.find((item) => item.group === group) })).filter((item) => item.candidate && !assignments.has(item.plan.feature));
    const withinTarget = options.filter((item) => item.plan.area <= (RECOMMENDATION_AREA_LIMIT_HA[group] ?? target * 1.015));
    const pool = RECOMMENDATION_AREA_LIMIT_HA[group] !== undefined ? withinTarget : (withinTarget.length ? withinTarget : options);
    const selected = pool.sort((first, second) => second.candidate.score - first.candidate.score || first.plan.area - second.plan.area)[0];
    if (!selected) return;
    assignments.set(selected.plan.feature, selected.candidate);
    assignedAreas.set(group, selected.plan.area);
  });
  pairs.forEach(({ plan, candidate }) => {
    if (assignments.has(plan.feature)) return;
    if (!canAssign(candidate.group, plan.area)) return;
    assignments.set(plan.feature, candidate);
    assignedAreas.set(candidate.group, (assignedAreas.get(candidate.group) || 0) + plan.area);
  });
  plans.filter((plan) => !assignments.has(plan.feature)).forEach((plan) => {
    const eligible = plan.candidates.filter((candidate) => RECOMMENDATION_AREA_LIMIT_HA[candidate.group] === undefined || canAssign(candidate.group, plan.area));
    const candidate = [...eligible].sort((first, second) => {
      const firstLoad = (assignedAreas.get(first.group) || 0) / Math.max(targetAreas.get(first.group) || 1, 1);
      const secondLoad = (assignedAreas.get(second.group) || 0) / Math.max(targetAreas.get(second.group) || 1, 1);
      return (second.score - secondLoad * 35) - (first.score - firstLoad * 35);
    })[0];
    if (!candidate) return;
    assignments.set(plan.feature, candidate);
    assignedAreas.set(candidate.group, (assignedAreas.get(candidate.group) || 0) + plan.area);
  });
  const counts = new Map();
  assignments.forEach((recommendation, feature) => {
    applyManualCrop(feature.properties, recommendation.group);
    feature.properties.crop_mvp_source = "system_recommendation";
    feature.properties.crop_mvp_confidence = recommendation.score;
    feature.properties.recommendation_target_area_ha = Math.round((targetAreas.get(recommendation.group) || 0) * 10) / 10;
    counts.set(recommendation.group, (counts.get(recommendation.group) || 0) + 1);
  });
  splitState.parts.forEach((feature) => {
    const recommendation = (cropCandidatesForField(feature.properties) || []).find((candidate) => candidate.group !== "alfalfa");
    if (!recommendation) return;
    feature.properties.crop_group_mvp = recommendation.group;
    applySplitCropRule(feature);
    feature.properties.crop_mvp_source = "system_recommendation";
    feature.properties.crop_mvp_confidence = recommendation.score;
  });
  geoLayer?.setStyle(styleFor);
  renderCropLegend();
  if (splitState.parts.length) renderSplitLayer();
  if (selectedFeature) {
    const replacement = selectedFeature.properties.split_status === "scenario" ? splitLayerForField(selectedFeature.properties.field_id) : selectedLayer;
    if (replacement) selectField(selectedFeature, replacement);
  }
  const summary = PNG_CROP_ORDER.map((group) => `${CROP_LABELS[group]} ${fmtInt.format(counts.get(group) || 0)} dala / ${fmtDec.format(assignedAreas.get(group) || 0)} ga`).join(" · ");
  document.querySelector("#map-hint").textContent = `Tavsiya tayyor: ${fmtInt.format(assignments.size)} dala, ${counts.size}/6 ekin joylashtirildi. ${summary}.`;
  renderDistrictCropAssignment(fullData.features);
}

function renderFieldDecision(properties) {
  const state = document.querySelector("#field-water-state");
  const bar = document.querySelector("#field-water-bar");
  const water = properties.crop_group_mvp ? fieldWaterAnalysis(properties) : null;
  if (!water) {
    state.textContent = "Ekin tanlang";
    state.className = "water-state limited";
    document.querySelector("#field-water-coverage").textContent = "—";
    bar.style.width = "0%";
    document.querySelector("#field-water-reason").textContent = "Suv holati ekin, uning PNG normasi va dala ichidagi GMR qismlari hisoblangach chiqadi.";
  } else {
    const waterMeta = WATER_STATUS_META[water.key];
    state.textContent = waterMeta.label;
    state.className = `water-state ${waterMeta.className}`;
    document.querySelector("#field-water-coverage").textContent = `${fmtInt.format(water.coverage * 100)}%`;
    bar.style.width = `${Math.min(water.coverage * 100, 100)}%`;
    bar.style.background = waterMeta.color;
    document.querySelector("#field-water-reason").textContent = water.delivery ? `Sabab: rasmiy limitdan dalaning normativ ulushi ${fmtInt.format(water.delivery.sourceShare)} m³. Tarmoq darajalari ssenariysidagi ${fmtDec.format(water.delivery.lossPct)}% yo‘qotishdan keyin yakuniy quloqdan dalaga ${fmtInt.format(water.delivery.delivery)} m³ hisoblanadi.` : `Sabab: tumandagi foydali suv ${fmtInt.format(water.availableM3Ha)} m³/ga, ushbu ekin uchun ET asosidagi sof talab ${fmtInt.format(water.demandM3Ha)} m³/ga. Samarali yog‘in ${fmtDec.format(water.rainMm)} mm, GMR bo‘yicha sizot hissasi ${fmtDec.format(water.groundwaterMm)} mm.`;
  }
  if (water?.delivery && !document.querySelector("#field-delivery-plan").hidden) {
    document.querySelector("#field-source-share").textContent = `${fmtInt.format(water.delivery.sourceShare)} m³`;
    document.querySelector("#field-route-loss").textContent = `${fmtDec.format(water.delivery.lossPct)}% · ${fmtInt.format(water.delivery.lossM3)} m³`;
    document.querySelector("#field-delivery-water").textContent = `${fmtInt.format(water.delivery.delivery)} m³`;
    document.querySelector("#field-delivery-formula").textContent = `${fmtInt.format(water.delivery.activeLimit)} × ${fmtInt.format(number(properties.seasonal_need_m3))} / ${fmtInt.format(water.delivery.districtNeed)} × (1 − ${fmtDec.format(water.delivery.lossPct)}%) = ${fmtInt.format(water.delivery.delivery)} m³`;
  }

  const bonitet = number(properties.bonitet);
  const soilLabel = !bonitet ? "Bonitet ma’lumoti yo‘q" : bonitet >= 80 ? "Yuqori unumdor tuproq" : bonitet >= 60 ? "Yaxshi unumdor tuproq" : bonitet >= 40 ? "O‘rtacha unumdor tuproq" : "Past unumdor tuproq";
  document.querySelector("#field-soil-score").textContent = bonitet ? `${fmtInt.format(bonitet)} ball` : "—";
  document.querySelector("#field-soil-state").textContent = soilLabel;
  document.querySelector("#field-texture").textContent = `0–30 sm: ${TEXTURE_LABELS[number(properties.Tm1)] || "aniqlanmagan"} · 30–100 sm: ${TEXTURE_LABELS[number(properties.Tm2)] || "aniqlanmagan"} · 100–200 sm: ${TEXTURE_LABELS[number(properties.Tm3)] || "aniqlanmagan"}`;
  const weather = currentWeather ? weatherStats(currentWeather) : null;
  document.querySelector("#field-soil-note").textContent = `Ob-havo bonitet ballini qisqa muddatda o‘zgartirmaydi. Ammo ${weather ? `${fmtDec.format(weather.maxTemperature)}°C gacha issiqlik, ` : ""}suv tanqisligi, sho‘rlanish yoki sizotning ko‘tarilishi hosildorlikni pasaytirishi va uzoq muddatda tuproq holatiga ta’sir qilishi mumkin.`;

  const recommendations = cropRecommendations(properties);
  document.querySelector("#field-crop-recommendations").innerHTML = recommendations.length ? recommendations.map((item, index) => `<div class="recommendation-item"><span class="recommendation-rank">${index + 1}</span><div><strong>${item.name}</strong><small>Norma ${fmtInt.format(item.norm)} m³/ga · suv qoplashi ${fmtInt.format(item.waterScore)}% · bonitet talabi ≥${item.minBonitet}</small></div><span class="recommendation-score">${item.score}</span></div>`).join("") : "<p>Tavsiya qoidalari topilmadi.</p>";
}

function splitCropOptions(selected) {
  return `<option value="" ${selected ? "" : "selected"}>Bo‘sh — ekin kiritilmagan</option>${PNG_CROP_ORDER.map((group) => `<option value="${group}" ${group === selected ? "selected" : ""}>${CROP_LABELS[group]}</option>`).join("")}`;
}

function splitGmrOptions(selected) {
  return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"].map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

async function loadFieldComponents() {
  if (fieldComponentIndex.size) return fieldComponentIndex;
  if (fieldComponentPromise) return fieldComponentPromise;
  fieldComponentPromise = (async () => {
    const response = await fetch(FIELD_COMPONENTS_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`tuproq/GMR komponentlari yuklanmadi: ${response.status}`);
    const data = await response.json();
    const index = new Map();
    for (const feature of data.features || []) {
      const fieldId = feature.properties?.field_id;
      if (!fieldId) continue;
      if (!index.has(fieldId)) index.set(fieldId, []);
      index.get(fieldId).push(feature);
    }
    fieldComponentIndex = index;
    return index;
  })().catch((error) => {
    fieldComponentPromise = null;
    throw error;
  });
  return fieldComponentPromise;
}

async function startSplitMode() {
  if (!selectedFeature || !map) return;
  if (!irrigationRules.length) {
    document.querySelector("#map-hint").textContent = "PNG sug‘orish qoidalari yuklanmoqda — bir necha soniyadan keyin qayta urinib ko‘ring.";
    return;
  }
  const requestedFeature = selectedFeature;
  const splitButton = document.querySelector("#toolbar-start-split");
  splitButton.disabled = true;
  document.querySelector("#map-hint").textContent = "Split uchun asl tuproq/GMR chegaralari yuklanmoqda…";
  try {
    await loadFieldComponents();
  } catch (error) {
    document.querySelector("#map-hint").textContent = `Split boshlanmadi: ${error.message}`;
    console.error(error);
    splitButton.disabled = false;
    return;
  }
  splitButton.disabled = false;
  if (selectedFeature !== requestedFeature) return;
  cancelSplit(false);
  splitState.active = true;
  splitState.parent = selectedFeature;
  splitState.parentLayer = selectedLayer;
  splitState.scenarioId = `split-${Date.now().toString(36)}`;
  document.querySelector("#split-panel").hidden = true;
  document.querySelector("#map-hint").textContent = "Split rejimi: dala chegarasidan tashqarida birinchi nuqtani bosing.";
  map.getContainer().classList.add("split-cursor");
  map.on("click", onSplitMapClick);
}

function onSplitMapClick(event) {
  if (!splitState.active) return;
  map.closePopup();
  splitState.points.push(event.latlng);
  const marker = L.circleMarker(event.latlng, { radius: 6, color: "#fff", weight: 2, fillColor: "#6556b3", fillOpacity: 1 }).addTo(map);
  splitState.markers.push(marker);
  if (splitState.points.length === 1) {
    document.querySelector("#map-hint").textContent = "Ikkinchi nuqtani bosing — kesish chizig‘i dalani to‘liq kesib o‘tsin.";
    return;
  }
  map.off("click", onSplitMapClick);
  map.getContainer().classList.remove("split-cursor");
  splitState.line = L.polyline(splitState.points, { color: "#fff200", weight: 3, dashArray: "7 5" }).addTo(map);
  try {
    createSplitParts();
  } catch (error) {
    document.querySelector("#map-hint").textContent = `Split amalga oshmadi: ${error.message}. Qayta chizing.`;
    console.error(error);
    for (const marker of splitState.markers) map.removeLayer(marker);
    if (splitState.line) map.removeLayer(splitState.line);
    splitState.points = [];
    splitState.markers = [];
    splitState.line = null;
    splitState.active = true;
    map.getContainer().classList.add("split-cursor");
    map.on("click", onSplitMapClick);
  }
}

function halfPlanePolygon(pointA, pointB, sign, extent) {
  const dx = pointB[0] - pointA[0], dy = pointB[1] - pointA[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-10) throw new Error("ikki nuqta bir-biriga juda yaqin");
  const ux = dx / length, uy = dy / length, nx = -uy, ny = ux;
  const center = [(pointA[0] + pointB[0]) / 2, (pointA[1] + pointB[1]) / 2];
  const a = [center[0] - ux * extent, center[1] - uy * extent];
  const b = [center[0] + ux * extent, center[1] + uy * extent];
  const c = [b[0] + nx * extent * sign, b[1] + ny * extent * sign];
  const d = [a[0] + nx * extent * sign, a[1] + ny * extent * sign];
  return turf.polygon([[a, b, c, d, a]]);
}

function scaledSoilComponents(properties, ratio, partArea) {
  const source = properties.soil_gmr_components?.length ? properties.soil_gmr_components : [{
    area_ha: number(properties.maydoni), gmr: properties.gmr_mvp, bonitet: properties.bonitet,
    tm1: properties.Tm1, tm2: properties.Tm2, tm3: properties.Tm3, ss: properties.SS,
  }];
  const sourceArea = sum(source, (component) => component.area_ha) || number(properties.maydoni) || 1;
  const scale = partArea / sourceArea;
  return source.map((component) => ({ ...component, area_ha: number(component.area_ha) * scale }));
}

function spatialPartContext(parentProperties, partFeature, partArea) {
  const parentId = parentProperties.field_id || parentProperties.feature_id;
  const sources = fieldComponentIndex.get(parentId) || [];
  const overlaps = [];
  for (const source of sources) {
    try {
      const intersection = turf.intersect(turf.featureCollection([partFeature, source]));
      if (!intersection) continue;
      const areaM2 = turf.area(intersection);
      if (areaM2 > 0.01) overlaps.push({ properties: source.properties || {}, areaM2 });
    } catch (error) {
      console.warn(`Split komponenti kesilmadi: ${parentId}`, error);
    }
  }
  const rawAreaM2 = sum(overlaps, (item) => item.areaM2);
  const geometryAreaM2 = turf.area(partFeature);
  const coveragePct = percent(rawAreaM2, geometryAreaM2);
  if (!overlaps.length || coveragePct < 70) {
    return {
      components: scaledSoilComponents(parentProperties, partArea / Math.max(number(parentProperties.maydoni), .000001), partArea),
      coveragePct, status: "proportional_fallback", route: null, sourceParts: 0,
    };
  }
  const componentGroups = new Map();
  const routeGroups = new Map();
  for (const overlap of overlaps) {
    const p = overlap.properties;
    const component = { gmr: p.gmr_mvp || null, bonitet: p.bonitet, tm1: p.Tm1, tm2: p.Tm2, tm3: p.Tm3, ss: p.SS };
    const componentKey = JSON.stringify(component);
    if (!componentGroups.has(componentKey)) componentGroups.set(componentKey, { ...component, rawAreaM2: 0 });
    componentGroups.get(componentKey).rawAreaM2 += overlap.areaM2;
    const routeKey = `${p.water_route || ""}\u001f${p.water_block_id || ""}`;
    if (!routeGroups.has(routeKey)) routeGroups.set(routeKey, { properties: p, rawAreaM2: 0 });
    routeGroups.get(routeKey).rawAreaM2 += overlap.areaM2;
  }
  const scale = partArea / (rawAreaM2 / 10000);
  const components = [...componentGroups.values()].map(({ rawAreaM2: componentAreaM2, ...component }) => ({
    ...component, area_ha: componentAreaM2 / 10000 * scale,
  })).sort((first, second) => second.area_ha - first.area_ha);
  const route = [...routeGroups.values()].sort((first, second) => second.rawAreaM2 - first.rawAreaM2)[0]?.properties || null;
  return { components, coveragePct, status: "spatial_intersection", route, sourceParts: overlaps.length };
}

function dominantComponentValue(components, key) {
  const groups = new Map();
  for (const component of components) groups.set(component[key], (groups.get(component[key]) || 0) + number(component.area_ha));
  return [...groups.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] ?? null;
}

function weightedComponentValue(components, key) {
  const valid = components.filter((component) => Number.isFinite(Number(component[key])));
  const area = sum(valid, (component) => component.area_ha);
  return area ? sum(valid, (component) => number(component[key]) * number(component.area_ha)) / area : null;
}

function createSplitParts() {
  if (!window.turf) throw new Error("geometriya kutubxonasi yuklanmagan");
  const parent = turf.feature(splitState.parent.geometry, { ...splitState.parent.properties });
  const first = [splitState.points[0].lng, splitState.points[0].lat];
  const second = [splitState.points[1].lng, splitState.points[1].lat];
  const bbox = turf.bbox(parent);
  const extent = (Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) || .01) * 30;
  const positive = turf.intersect(turf.featureCollection([parent, halfPlanePolygon(first, second, 1, extent)]));
  const negative = turf.intersect(turf.featureCollection([parent, halfPlanePolygon(first, second, -1, extent)]));
  if (!positive || !negative) throw new Error("chiziq poligonni ikki qismga ajratmadi");
  const rawAreas = [turf.area(positive), turf.area(negative)];
  if (Math.min(...rawAreas) < 100) throw new Error("hosil bo‘lgan qismlardan biri 0,01 ga dan kichik");
  const rawTotal = rawAreas[0] + rawAreas[1];
  const parentArea = number(parent.properties.maydoni) || turf.area(parent) / 10000;
  const parentId = parent.properties.field_id || parent.properties.feature_id;
  splitState.parts = [positive, negative].map((feature, index) => {
    const part = index === 0 ? "A" : "B";
    const id = `${parentId}-${splitState.scenarioId}-${part}`;
    const partArea = parentArea * rawAreas[index] / rawTotal;
    const context = spatialPartContext(parent.properties, feature, partArea);
    const route = context.route;
    feature.id = id;
    feature.properties = {
      ...parent.properties, feature_id: id, field_id: id, parent_field_id: parentId,
      split_scenario_id: splitState.scenarioId, split_part: part, split_status: "scenario",
      maydoni: partArea, split_area_ha: partArea,
      soil_gmr_components: context.components,
      gmr_mvp: dominantComponentValue(context.components, "gmr"),
      bonitet: weightedComponentValue(context.components, "bonitet"),
      Tm1: dominantComponentValue(context.components, "tm1"),
      Tm2: dominantComponentValue(context.components, "tm2"),
      Tm3: dominantComponentValue(context.components, "tm3"),
      SS: weightedComponentValue(context.components, "ss"),
      split_component_status: context.status,
      split_component_coverage_pct: context.coveragePct,
      split_source_parts: context.sourceParts,
      water_route: route?.water_route || parent.properties.water_route,
      water_block_id: route?.water_block_id || parent.properties.water_block_id,
      route_depth: number(route?.route_depth) || parent.properties.route_depth,
      route_loss_pct_scn: Number.isFinite(Number(route?.route_loss_pct_scn)) ? Number(route.route_loss_pct_scn) : parent.properties.route_loss_pct_scn,
      block_match_status: route?.block_match_status || parent.properties.block_match_status,
      crop_group_mvp: PNG_CROP_ORDER.includes(parent.properties.crop_group_mvp) ? parent.properties.crop_group_mvp : null,
    };
    return feature;
  });
  splitState.active = false;
  districtNeedCache = null;
  applySplitCropRule(splitState.parts[0]);
  applySplitCropRule(splitState.parts[1]);
  renderSplitLayer();
  for (const marker of splitState.markers) map.removeLayer(marker);
  if (splitState.line) map.removeLayer(splitState.line);
  splitState.markers = [];
  splitState.line = null;
  splitState.points = [];
  document.querySelector("#map-hint").textContent = `Dala 2 qismga ajratildi: A ${fmtDec.format(splitState.parts[0].properties.maydoni)} ga, B ${fmtDec.format(splitState.parts[1].properties.maydoni)} ga. Qismni bosing va yuqoridan ekin tanlang.`;
  const firstPartLayer = splitLayerForField(splitState.parts[0].properties.field_id);
  if (firstPartLayer) selectField(splitState.parts[0], firstPartLayer);
}

function exactSplitRule(properties) {
  return nearestComponentRule({ gmr: properties.gmr_mvp }, properties.crop_group_mvp)?.rule || null;
}

function applySplitCropRule(feature) {
  const properties = feature.properties;
  if (!properties.crop_group_mvp) {
    clearFieldCrop(properties);
    properties.crop_mvp_source = "split_user_selection";
    return;
  }
  applyManualCrop(properties, properties.crop_group_mvp);
  properties.crop_mvp_source = "split_user_selection";
}

function splitPartSummary(feature) {
  const properties = feature.properties;
  const rule = exactSplitRule(properties);
  const water = properties.crop_group_mvp ? fieldWaterAnalysis(properties) : null;
  const area = number(properties.maydoni);
  const alternatives = cropRecommendations(properties).map((item) => item.name).join(", ");
  return { rule, water, area, etM3: water ? water.demandM3Ha * area : null, availableM3: water ? water.availableM3Ha * area : null, alternatives };
}

function splitLayerForField(fieldId) {
  let match = null;
  splitState.layer?.eachLayer((layer) => { if (layer.feature?.properties?.field_id === fieldId) match = layer; });
  return match;
}

function restoreSplitPartStyle(layer) {
  const feature = layer.feature;
  const cropGroup = feature.properties.crop_group_mvp;
  layer.setStyle({ color: feature.properties.split_part === "A" ? "#00e5ff" : "#ff4fd8", weight: 4, opacity: 1, fillColor: CROP_COLORS[cropGroup] || MAP_STATUS_COLORS.crop_required, fillOpacity: cropGroup ? .86 : .65, dashArray: null });
}

function renderSplitLayer() {
  if (splitState.layer) map.removeLayer(splitState.layer);
  splitState.layer = L.geoJSON(turf.featureCollection(splitState.parts), {
    style(feature) {
      const cropGroup = feature.properties.crop_group_mvp;
      return { color: feature.properties.split_part === "A" ? "#00e5ff" : "#ff4fd8", weight: 4, opacity: 1, fillColor: CROP_COLORS[cropGroup] || MAP_STATUS_COLORS.crop_required, fillOpacity: cropGroup ? .86 : .65 };
    },
    onEachFeature(feature, layer) { layer.bindTooltip(`Qism ${feature.properties.split_part} · ${fmtDec.format(feature.properties.maydoni)} ga · ${CROP_LABELS[feature.properties.crop_group_mvp] || "Ekin kiritilmagan"}`, { sticky: true }); },
  }).addTo(map);
  splitState.layer.bringToFront();
  splitState.layer.eachLayer((layer) => {
    layer.__splitPartLayer = true;
    layer.on("click", () => selectField(layer.feature, layer));
  });
  if (splitState.parentLayer) splitState.parentLayer.setStyle({ fillOpacity: 0, opacity: 0, weight: 0 });
}

function renderSplitEditors() {
  const container = document.querySelector("#split-editors");
  container.innerHTML = splitState.parts.map((feature, index) => {
    const properties = feature.properties;
    const summary = splitPartSummary(feature);
    const rule = summary.rule;
    const soilProfile = `<div class="split-soil-readonly"><span>0–30 sm<strong>${escapeHtml(TEXTURE_LABELS[number(properties.Tm1)] || "—")}</strong></span><span>30–100 sm<strong>${escapeHtml(TEXTURE_LABELS[number(properties.Tm2)] || "—")}</strong></span><span>100–200 sm<strong>${escapeHtml(TEXTURE_LABELS[number(properties.Tm3)] || "—")}</strong></span><span>Sizot<strong>${properties.SS ? `${fmtInt.format(number(properties.SS) * 1000)} mm` : "—"}</strong></span></div>`;
    if (!properties.crop_group_mvp) {
      return `<article class="split-part-card" data-part-index="${index}"><div class="split-part-head"><strong>Qism ${properties.split_part}</strong><span>${fmtDec.format(summary.area)} ga</span></div><div class="split-part-grid"><label>Ekin<select data-split-field="crop_group_mvp">${splitCropOptions(properties.crop_group_mvp)}</select></label>${soilProfile}</div><div class="split-result"><div class="split-full"><span>Hisoblash holati</span><strong>Avval shu qism uchun ekin tanlang</strong><small>Maydon × GMR bo‘yicha konservativ PNG normasi va tarmoqdan yetadigan suv alohida qayta hisoblanadi.</small></div></div><p class="split-alternatives">GMR, bonitet, uch qatlamli mexanik tarkib va sizot qiymati asl geometriyadan avtomatik kesildi; faqat ekin tanlanadi.</p></article>`;
    }
    const waterMeta = WATER_STATUS_META[summary.water.key];
    return `<article class="split-part-card" data-part-index="${index}"><div class="split-part-head"><strong>Qism ${properties.split_part}</strong><span>${fmtDec.format(summary.area)} ga · ${escapeHtml(properties.field_id.slice(-18))}</span></div><div class="split-part-grid"><label>Ekin<select data-split-field="crop_group_mvp">${splitCropOptions(properties.crop_group_mvp)}</select></label>${soilProfile}</div><div class="split-result">${rule ? `<div><span>PNG normasi</span><strong>${fmtInt.format(properties.norm_m3ha_mvp)} m³/ga</strong><small>GMR bo‘yicha konservativ norma</small></div><div><span>Suv limiti</span><strong>${fmtInt.format(properties.planned_water_m3_mvp)} m³</strong><small>maydon × norma</small></div><div><span>Sug‘orish</span><strong>${escapeHtml(rule.irrigation_pattern)}</strong><small>${rule.start_month_day} — ${rule.end_month_day}</small></div>` : `<div class="split-full"><span>PNG qoidasi</span><strong>Bu GMR–ekin kombinatsiyasi topilmadi</strong></div>`}<div><span>ET sof talab</span><strong>${fmtInt.format(summary.etM3)} m³</strong><small>${fmtInt.format(summary.water.demandM3Ha)} m³/ga</small></div><div><span>Mavjud suv</span><strong>${fmtInt.format(summary.availableM3)} m³</strong><small>${fmtInt.format(summary.water.coverage * 100)}% qoplash</small></div><div><span>Suv holati</span><strong style="color:${waterMeta.color}">${waterMeta.label}</strong><small>mustaqil qism hisobi</small></div></div><p class="split-alternatives">Mos muqobil ekinlar: ${escapeHtml(summary.alternatives || "aniqlanmadi")}</p></article>`;
  }).join("");
  container.querySelectorAll("[data-split-field]").forEach((control) => control.addEventListener("change", (event) => {
    const card = event.target.closest("[data-part-index]");
    updateSplitPart(number(card.dataset.partIndex), event.target.dataset.splitField, event.target.value);
  }));
}

function updateSplitPart(index, field, value) {
  const feature = splitState.parts[index];
  if (!feature) return;
  feature.properties[field] = value;
  if (field === "crop_group_mvp") feature.properties.crop_mvp = CROP_LABELS[value];
  applySplitCropRule(feature);
  renderSplitLayer();
  renderSplitEditors();
}

function exportSplitGeoJSON() {
  if (!splitState.parts.length) return;
  const exported = splitState.parts.map((feature) => {
    const copy = JSON.parse(JSON.stringify(feature));
    const summary = splitPartSummary(copy);
    copy.properties.water_status = summary.water.key;
    copy.properties.water_coverage_percent = Math.round(summary.water.coverage * 1000) / 10;
    copy.properties.et_net_need_m3 = Math.round(summary.etM3 * 100) / 100;
    copy.properties.available_water_m3 = Math.round(summary.availableM3 * 100) / 100;
    return copy;
  });
  const blob = new Blob([JSON.stringify(turf.featureCollection(exported), null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `${splitState.scenarioId}.geojson`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cancelSplit(hidePanel = true) {
  const parentFeature = splitState.parent;
  const parentLayer = splitState.parentLayer;
  const selectedWasSplitPart = selectedFeature?.properties?.split_status === "scenario";
  if (map) { map.off("click", onSplitMapClick); map.getContainer().classList.remove("split-cursor"); }
  for (const marker of splitState.markers || []) map?.removeLayer(marker);
  if (splitState.line) map?.removeLayer(splitState.line);
  if (splitState.layer) map?.removeLayer(splitState.layer);
  if (splitState.parentLayer && geoLayer) geoLayer.resetStyle(splitState.parentLayer);
  if (selectedLayer && !selectedLayer.__splitPartLayer && geoLayer) selectedLayer.setStyle({ weight: 4, color: "#fff200", fillOpacity: .92 });
  splitState = { active: false, parent: null, parentLayer: null, points: [], markers: [], line: null, layer: null, parts: [], scenarioId: null };
  districtNeedCache = null;
  if (hidePanel) document.querySelector("#split-panel").hidden = true;
  document.querySelector("#map-hint").textContent = "Poligon ustiga bosing — dala pasporti ochiladi";
  if (selectedWasSplitPart && parentFeature && parentLayer) {
    selectedFeature = null;
    selectedLayer = null;
    selectField(parentFeature, parentLayer);
  }
}

function renderConclusions() {
  const container = document.querySelector("#conclusion-grid");
  const executiveContainer = document.querySelector("#executive-conclusions");
  if (!dashboardSummary) {
    container.innerHTML = "<p>Statistika yuklanmoqda…</p>";
    executiveContainer.innerHTML = "<p>Asosiy signallar hisoblanmoqda…</p>";
    return;
  }
  const s = dashboardSummary;
  const t = s.totals;
  const weather = currentWeather ? weatherStats(currentWeather) : null;
  const topCrop = s.crops[0];
  const topGmr = s.gmrs[0];
  const observedShare = percent(t.observed_polygons, t.polygons);
  const estimatedShare = percent(t.estimated_polygons, t.polygons);
  const topCropShare = percent(topCrop.water_m3, t.planned_water_m3);
  const longProxy = t.long_crop_proxy_over_500m + t.long_gmr_proxy_over_500m;
  const weightedKc = sum(s.crop_groups, (group) => group.area_ha * (CROP_COEFFICIENT[group.label] || 1)) / t.area_ha;
  const weightedGroundwaterFactor = sum(s.gmrs, (group) => group.area_ha * (GROUNDWATER_FACTOR[group.label] ?? .08)) / t.area_ha;
  const regionalEtc = weather ? weather.et0 * weightedKc : 0;
  const regionalGroundwater = regionalEtc * weightedGroundwaterFactor;
  const regionalNetMm = weather ? Math.max(regionalEtc - weather.rain - regionalGroundwater, 0) : 0;
  const theoreticalWater = regionalNetMm * 10 * t.area_ha;
  const conclusions = [
    { title: "Tahlil qamrovi", text: `${fmtInt.format(t.polygons)} poligon ${fmtInt.format(t.fields)} ta mantiqiy dalaga birlashtirilgan.`, formula: `qamrov = ${fmtInt.format(t.polygons)} poligon / ${fmtInt.format(t.fields)} dala` },
    { title: "Umumiy yer maydoni", text: `Hisobga olingan maydon ${fmtInt.format(t.area_ha)} gektarni tashkil etadi.`, formula: "maydon = Σ poligon maydoni" },
    { title: "Mavsumiy suv rejasi", text: `PNG normativ jadvallari asosidagi jami reja ${fmtDec.format(t.planned_water_m3 / 1e6)} mln m³.`, formula: "jami suv = Σ(maydon × norma)" },
    { title: "O‘rtacha suv normasi", text: `Maydon bo‘yicha vaznlangan o‘rtacha norma ${fmtInt.format(t.weighted_norm_m3ha)} m³/ga.`, formula: "o‘rtacha norma = jami suv / jami maydon" },
    { title: "Manba asosidagi hisob", text: `${fmtDec.format(observedShare)}% poligonda ekin va GMR manba ma’lumotiga tayangan.`, formula: `${fmtInt.format(t.observed_polygons)} / ${fmtInt.format(t.polygons)} × 100`, tone: observedShare < 50 ? "warning" : "" },
    { title: "Taxminiy hisob ulushi", text: `${fmtDec.format(estimatedShare)}% poligon dala ma’lumoti bilan keyinchalik tasdiqlanishi kerak.`, formula: `${fmtInt.format(t.estimated_polygons)} / ${fmtInt.format(t.polygons)} × 100`, tone: estimatedShare > 50 ? "warning" : "" },
    { title: "Ekin ma’lumoti", text: `${fmtInt.format(t.crop_proxy_polygons)} poligonda ekin eng yaqin ekinli dala orqali baholangan.`, formula: "ekin taxmini = eng yaqin ma’lum ekin", tone: "warning" },
    { title: "GMR ma’lumoti", text: `${fmtInt.format(t.gmr_proxy_polygons)} poligonda GMR eng yaqin ma’lum poligondan olingan.`, formula: "GMR taxmini = nearest known GMR", tone: "warning" },
    { title: "Eng katta suv iste’molchisi", text: `${topCrop.label} uchun ${fmtDec.format(topCrop.water_m3 / 1e6)} mln m³ rejalashtirilgan.`, formula: "maksimum Σ ekin suv hajmi" },
    { title: "Ekin bo‘yicha ulush", text: `${topCrop.label} jami suv rejasining ${fmtDec.format(topCropShare)}% qismini tashkil etadi.`, formula: `${fmtDec.format(topCrop.water_m3 / 1e6)} / ${fmtDec.format(t.planned_water_m3 / 1e6)} × 100` },
    { title: "Asosiy GMR guruhi", text: `${topGmr.label} guruhida ${fmtInt.format(topGmr.polygons)} poligon va ${fmtDec.format(topGmr.water_m3 / 1e6)} mln m³ suv mavjud.`, formula: "asosiy GMR = max(poligon soni)" },
    { title: "Bonitet bo‘shliqlari", text: `${fmtInt.format(t.bonitet_missing_polygons)} poligonda tuproq boniteti ko‘rsatilmagan.`, formula: "bo‘sh bonitet = NULL yoki bo‘sh matn", tone: t.bonitet_missing_polygons ? "warning" : "" },
    { title: "Juda kichik poligonlar", text: `${fmtInt.format(t.small_polygons_under_01ha)} poligon 0,1 gektardan kichik; dala chegarasi bilan tekshirish tavsiya etiladi.`, formula: "kichik = maydon < 0,1 ga", tone: "warning" },
    { title: "Uzoq masofali taxmin", text: `${fmtInt.format(longProxy)} ta ekin yoki GMR taxmini 500 metrdan uzoq manbaga tayangan.`, formula: "risk = proxy masofasi > 500 m", tone: longProxy ? "risk" : "" },
    { title: "Suv talabi konsentratsiyasi", text: `Eng yuqori talabga ega 10% poligon jami suvning ${fmtDec.format(t.top_10_percent_water_share)}% qismini oladi.`, formula: "top 10% suv / jami suv × 100", tone: t.top_10_percent_water_share > 50 ? "warning" : "" },
    { title: "Issiqlik holati", text: weather ? `7 kunlik eng yuqori harorat ${fmtDec.format(weather.maxTemperature)}°C; ${weather.maxTemperature >= 40 ? "issiqlik xavfi yuqori" : "keskin issiqlik signali aniqlanmadi"}.` : "Open-Meteo ma’lumoti yuklanmoqda.", formula: "issiqlik xavfi = Tmax ≥ 40°C", tone: weather?.maxTemperature >= 40 ? "risk" : "" },
    { title: "7 kunlik iqlim defitsiti", text: weather ? `ET0 va yog‘in farqi ${fmtDec.format(weather.deficit)} mm; bu atmosferaning sof suv talabini ko‘rsatadi.` : "Open-Meteo ma’lumoti yuklanmoqda.", formula: "defitsit = max(ET0 − yog‘in, 0)", tone: weather?.deficit > 30 ? "risk" : "warning" },
    { title: "Taxminiy qisqa muddatli talab", text: weather ? `Ekin Kc va GMR bo‘yicha sizot hissasi taxmini qo‘shilganda 7 kunlik talab ${fmtDec.format(theoreticalWater / 1e6)} mln m³.` : "Ob-havo kelgach hisoblanadi.", formula: `suv = max(ET0×Kc ${fmtDec.format(weightedKc)} − yog‘in − sizot ${fmtDec.format(weightedGroundwaterFactor * 100)}%, 0) × ga × 10`, tone: "warning" },
  ];
  container.innerHTML = conclusions.map((item, index) => `<article class="conclusion-item ${item.tone || ""}"><span class="conclusion-number">XULOSA ${String(index + 1).padStart(2, "0")}</span><h3>${item.title}</h3><p>${item.text}</p><code>${item.formula}</code></article>`).join("");
  const executiveIndexes = [2, 4, 15, 16];
  executiveContainer.innerHTML = executiveIndexes.map((index) => {
    const item = conclusions[index];
    return `<article class="executive-item ${item.tone || ""}"><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${item.title}</h3><p>${item.text}</p></div></article>`;
  }).join("");
}

function showView(view) {
  const normalizedView = view === "map" ? "map" : "dashboard";
  const dashboard = normalizedView === "dashboard";
  const mapView = normalizedView === "map";
  document.querySelector("#dashboard-view").hidden = !dashboard;
  document.querySelector("#map-view").hidden = !mapView;
  document.body.classList.toggle("dashboard-mode", dashboard);
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === normalizedView));
  document.querySelector("#page-title").textContent = dashboard ? "Umumiy tahlil" : "Dalalar xaritasi va dala pasporti";
  document.querySelector("#page-subtitle").textContent = dashboard ? "Suv balansi, ekinlar, real ET, ob-havo va rahbariyat xulosasi" : "Dalani toping, ekin kiriting va suv yo‘lini line chartda kuzating";
  document.querySelector("#reset-view").hidden = !mapView;
  if (dashboard) {
    if (dashboardSummary) document.querySelector("#data-status").textContent = `${fmtInt.format(dashboardSummary.totals.polygons)} poligon · tahlil tayyor`;
  } else if (mapView) {
    initMapPage();
    setTimeout(() => map?.invalidateSize(), 50);
  }
}

function renderCropLegend() {
  document.querySelector("#map-legend").innerHTML = `${PNG_CROP_ORDER.map((group) => `<span><i class="legend-dot" style="background:${CROP_COLORS[group]}"></i>${CROP_LABELS[group]}</span>`).join("")}<span><i class="legend-dot" style="background:${MAP_STATUS_COLORS.crop_required}"></i>Ekin kiritilmagan</span>`;
}

function styleFor(feature) {
  const cropGroup = feature.properties.crop_group_mvp;
  const fillColor = CROP_COLORS[cropGroup] || MAP_STATUS_COLORS.crop_required;
  return { color: "#ffffff", weight: 1.55, opacity: 1, fillColor, fillOpacity: cropGroup ? .82 : .62 };
}

function popupHtml(properties) {
  const meta = getMeta(properties.demo_norm_status);
  const water = districtBalance && properties.crop_group_mvp ? fieldWaterAnalysis(properties) : null;
  const waterLine = water ? `<p class="popup-line" style="color:${WATER_STATUS_META[water.key].color}">${WATER_STATUS_META[water.key].label} · ${fmtInt.format(water.coverage * 100)}%</p>` : "";
  const bonitet = number(properties.bonitet);
  const profile = [properties.Tm1, properties.Tm2, properties.Tm3].map((value) => TEXTURE_LABELS[number(value)] || "—").join(" / ");
  const groundwater = properties.SS ? `${fmtInt.format(number(properties.SS) * 1000)} mm` : "—";
  return `<h3 class="popup-title">${escapeHtml(text(properties.crop_mvp, "Ekin ko‘rsatilmagan"))}</h3><p class="popup-line">Maydon: <strong>${fmtDec.format(number(properties.maydoni))} ga</strong></p><p class="popup-line">Bonitet: <strong>${bonitet ? `${fmtDec.format(bonitet)} ball` : "Ma’lumot yo‘q"}</strong></p><p class="popup-line">GMR: <strong>${escapeHtml(text(properties.gmr_mvp))}</strong></p><p class="popup-line">Tuproq 0–30 / 30–100 / 100–200 sm: <strong>${escapeHtml(profile)}</strong></p><p class="popup-line">Sizot chuqurligi: <strong>${escapeHtml(groundwater)}</strong></p>${waterLine}<p class="popup-line" style="color:${meta.color}">${meta.label}</p>`;
}

function networkNodeKey(value) { return String(value || "").trim().toLocaleLowerCase(); }

function geometryBounds(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (typeof coordinates?.[0] === "number") {
      bounds[0] = Math.min(bounds[0], coordinates[0]); bounds[1] = Math.min(bounds[1], coordinates[1]);
      bounds[2] = Math.max(bounds[2], coordinates[0]); bounds[3] = Math.max(bounds[3], coordinates[1]);
      return;
    }
    (coordinates || []).forEach(visit);
  };
  visit(geometry?.coordinates);
  return bounds;
}

function buildFieldNetworkIndexes(features) {
  waterRouteIndex = new Map();
  fieldGeometryIndex = features.map((feature) => ({ feature, bounds: geometryBounds(feature.geometry) }));
  features.forEach((feature) => {
    const uniqueNodes = new Set(waterRouteParts(feature.properties).map(networkNodeKey).filter(Boolean));
    uniqueNodes.forEach((node) => {
      if (!waterRouteIndex.has(node)) waterRouteIndex.set(node, []);
      waterRouteIndex.get(node).push(feature);
    });
  });
  networkSpatialCache.clear();
}

function canalRouteStats(properties) {
  const id = String(properties.id || "").trim();
  const name = String(properties.kanal_nomi || "").trim();
  const candidates = [id, ...((name.length > 3 && !/^\d+$/.test(name)) ? [name] : [])];
  let matchKey = "", matches = [];
  for (const candidate of candidates) {
    const found = waterRouteIndex.get(networkNodeKey(candidate)) || [];
    if (found.length) { matchKey = candidate; matches = found; break; }
  }
  if (!matches.length) return null;
  const fields = new Set(), calculatedFields = new Set(), outlets = new Set(), sources = new Set(), parents = new Set();
  let sourceShare = 0, delivered = 0, loss = 0, terminalMatches = 0;
  matches.forEach((feature) => {
    const p = feature.properties;
    const route = waterRouteParts(p);
    const matchedIndex = route.findIndex((node) => networkNodeKey(node) === networkNodeKey(matchKey));
    const scenario = deliveryScenario(p);
    fields.add(p.field_id || p.plan_part_id || p.feature_id);
    if (route.length) { sources.add(route[0]); outlets.add(route[route.length - 1]); }
    if (matchedIndex > 0) parents.add(route[matchedIndex - 1]);
    if (matchedIndex === route.length - 1) terminalMatches += 1;
    if (scenario) { calculatedFields.add(p.field_id || p.plan_part_id || p.feature_id); sourceShare += scenario.sourceShare; delivered += scenario.delivery; loss += scenario.lossM3; }
  });
  return {
    matchKey, polygons: matches.length, fields: fields.size, calculatedFields: calculatedFields.size, outlets: outlets.size,
    sources: [...sources], parents: [...parents], sourceShare, delivered, loss,
    isOutlet: terminalMatches === matches.length,
  };
}

function boundsOverlap(first, second, padding = 0) {
  return first[0] <= second[2] + padding && first[2] >= second[0] - padding
    && first[1] <= second[3] + padding && first[3] >= second[1] - padding;
}

function projectCoordinate(point) { return [point[0] * 86500, point[1] * 111000]; }

function pointSegmentDistanceSquared(point, start, end) {
  const vx = end[0] - start[0], vy = end[1] - start[1];
  const wx = point[0] - start[0], wy = point[1] - start[1];
  const lengthSquared = vx * vx + vy * vy;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / lengthSquared)) : 0;
  const dx = point[0] - (start[0] + ratio * vx), dy = point[1] - (start[1] + ratio * vy);
  return dx * dx + dy * dy;
}

function segmentCross(first, second, point) {
  return (second[0] - first[0]) * (point[1] - first[1]) - (second[1] - first[1]) * (point[0] - first[0]);
}

function pointOnSegment(first, second, point) {
  return Math.abs(segmentCross(first, second, point)) < 1e-7
    && point[0] >= Math.min(first[0], second[0]) - 1e-7 && point[0] <= Math.max(first[0], second[0]) + 1e-7
    && point[1] >= Math.min(first[1], second[1]) - 1e-7 && point[1] <= Math.max(first[1], second[1]) + 1e-7;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const a = segmentCross(firstStart, firstEnd, secondStart), b = segmentCross(firstStart, firstEnd, secondEnd);
  const c = segmentCross(secondStart, secondEnd, firstStart), d = segmentCross(secondStart, secondEnd, firstEnd);
  return (a * b < 0 && c * d < 0) || pointOnSegment(firstStart, firstEnd, secondStart)
    || pointOnSegment(firstStart, firstEnd, secondEnd) || pointOnSegment(secondStart, secondEnd, firstStart)
    || pointOnSegment(secondStart, secondEnd, firstEnd);
}

function segmentDistanceSquared(firstStart, firstEnd, secondStart, secondEnd) {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(firstStart, secondStart, secondEnd), pointSegmentDistanceSquared(firstEnd, secondStart, secondEnd),
    pointSegmentDistanceSquared(secondStart, firstStart, firstEnd), pointSegmentDistanceSquared(secondEnd, firstStart, firstEnd),
  );
}

function geometryNearLine(lineCoordinates, geometry, distanceMeters = 50) {
  const lineSegments = [];
  for (let index = 1; index < lineCoordinates.length; index += 1) {
    lineSegments.push([projectCoordinate(lineCoordinates[index - 1]), projectCoordinate(lineCoordinates[index])]);
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const threshold = distanceMeters * distanceMeters;
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (let index = 1; index < ring.length; index += 1) {
        const first = projectCoordinate(ring[index - 1]), second = projectCoordinate(ring[index]);
        if (lineSegments.some(([start, end]) => segmentDistanceSquared(start, end, first, second) <= threshold)) return true;
      }
    }
  }
  return false;
}

function networkProximityStats(feature) {
  const key = feature.properties?.feature_id || `${feature.properties?.source_oid}-${feature.properties?.id || "network"}`;
  if (networkSpatialCache.has(key)) return networkSpatialCache.get(key);
  const lineBounds = geometryBounds(feature.geometry);
  const candidates = fieldGeometryIndex.filter((item) => boundsOverlap(item.bounds, lineBounds, .0007));
  const nearby = candidates.filter((item) => geometryNearLine(feature.geometry.coordinates, item.feature.geometry, 50));
  const fields = new Set(nearby.map((item) => item.feature.properties.field_id || item.feature.properties.plan_part_id || item.feature.properties.feature_id));
  const result = { polygons: nearby.length, fields: fields.size, area: sum(nearby, (item) => item.feature.properties.maydoni) };
  networkSpatialCache.set(key, result);
  return result;
}

function networkVolume(value) {
  return number(value) >= 1e6 ? `${balanceMillions(value)} mln m³` : `${fmtInt.format(value)} m³`;
}

function networkPopupHtml(networkType, properties, routeStats = null, proximityStats = null, loading = false) {
  const isCanal = networkType === "kanal";
  const title = isCanal ? text(properties.kanal_nomi, "Nomsiz kanal") : text(properties.kollektor_, "Nomsiz zovur");
  const length = isCanal ? number(properties.uzunlik) : number(properties.Lenght);
  const lengthText = length ? `${fmtDec.format(length)} km` : "—";
  const level = isCanal ? text(properties.daraja_1, text(properties.level)) : text(properties.db_ddnm0_h);
  const location = isCanal ? text(properties.id) : text(properties.joylashgan);
  const badge = !isCanal ? "DRENAJ TARMOQI" : routeStats?.isOutlet ? "YAKUNIY QULOQ" : routeStats ? "ORALIQ KANAL" : "BOG‘LANISH ANIQLANMAGAN";
  const loadingLine = loading ? `<p class="network-popup-loading">Dala va quloq bog‘lanishi hisoblanmoqda…</p>` : "";
  let analysis = "";
  if (isCanal && routeStats) {
    analysis = `<div class="network-popup-kpis"><div><strong>${fmtInt.format(routeStats.fields)}</strong><span>xizmat hududidagi dala</span><small>${fmtInt.format(routeStats.calculatedFields)} dalada ekin kiritilgan</small></div><div><strong>${fmtInt.format(routeStats.outlets)}</strong><span>yakuniy quloq</span><small>quyi tarmoqda</small></div><div><strong>${routeStats.calculatedFields ? networkVolume(routeStats.delivered) : "—"}</strong><span>dalalarga hisobiy suv</span><small>${routeStats.calculatedFields ? `${networkVolume(routeStats.loss)} yo‘qotish` : "ekin kiritilgach chiqadi"}</small></div></div><div class="network-water-row"><div><span>Hisobiy limit</span><strong>${routeStats.calculatedFields ? networkVolume(routeStats.sourceShare) : "Ekin kutilmoqda"}</strong></div><div><span>Bosh manba</span><strong>${escapeHtml(routeStats.sources.join(", ") || "—")}</strong></div>${routeStats.parents.length ? `<div><span>Bevosita yuqori bo‘g‘in</span><strong>${escapeHtml(routeStats.parents.join(", "))}</strong></div>` : ""}</div>`;
  } else if (proximityStats) {
    const label = isCanal ? "Kanalga 50 m yaqin dalalar" : "Zovurga 50 m yaqin dalalar";
    analysis = `<div class="network-popup-kpis proximity"><div><strong>${fmtInt.format(proximityStats.fields)}</strong><span>${label}</span><small>${fmtInt.format(proximityStats.polygons)} poligon</small></div><div><strong>${fmtDec.format(proximityStats.area)} ga</strong><span>yaqin maydon</span><small>geometrik baho</small></div><div><strong>${isCanal ? "—" : "0"}</strong><span>yakuniy quloq</span><small>${isCanal ? "topologiya yo‘q" : "zovur suv bermaydi"}</small></div></div><p class="network-popup-note">${isCanal ? "Bu kanal kodi blok suv yo‘li bilan bog‘lanmagan. Yaqin dalalar suv oluvchi dala sifatida tasdiqlanmagan." : "Zovur sug‘orish suvi bermaydi; u sizot suvlarini chiqaradi. Dala soni 50 metr geometrik yaqinlik bo‘yicha hisoblandi."}</p>`;
  }
  return `<div class="network-popup"><div class="network-popup-head"><span>${badge}</span><h3>${escapeHtml(title)}</h3><p>${isCanal ? "Sug‘orish kanali" : "Zovur / kollektor"} · ${lengthText} · daraja ${escapeHtml(String(level))}</p></div><p class="network-popup-code">${isCanal ? "Tarmoq kodi" : "Joylashuvi"}: <strong>${escapeHtml(String(location))}</strong></p>${loadingLine}${analysis}<p class="network-popup-foot">Start/end nuqtalari raqamlashtirish yo‘nalishi; tasdiqlangan oqim yo‘nalishi emas.</p></div>`;
}

async function loadNetworkOverlay(networkType) {
  if (networkLoadState.has(networkType)) return;
  const config = NETWORK_SOURCES[networkType];
  const group = networkGroups[networkType];
  if (!config || !group) return;
  networkLoadState.add(networkType);
  try {
    const response = await fetch(config.url);
    if (!response.ok) throw new Error(`${response.status}`);
    const data = await response.json();
    L.geoJSON(data, {
      pane: "networkPane",
      interactive: false,
      renderer: L.svg({ padding: .5, pane: "networkPane" }),
      style: { color: config.color, weight: config.weight, opacity: .92 },
    }).addTo(group);
    L.geoJSON(data, {
      pane: "networkHitPane",
      interactive: true,
      bubblingMouseEvents: false,
      renderer: L.svg({ padding: .5, pane: "networkHitPane" }),
      style: { color: "#000", weight: 18, opacity: .001, lineCap: "round", lineJoin: "round" },
      onEachFeature(feature, layer) {
        layer._networkBaseStyle = { color: "#000", weight: 18, opacity: .001 };
        layer.bindPopup(networkPopupHtml(networkType, feature.properties || {}, null, null, true), { maxWidth: 390, minWidth: 330 });
        layer.bindTooltip(networkType === "kanal" ? text(feature.properties?.kanal_nomi, "Kanal") : text(feature.properties?.kollektor_, "Zovur"), { sticky: true });
        layer.on("mouseover", () => {
          if (selectedNetworkLayer !== layer) layer.setStyle({ color: "#fff200", weight: 7, opacity: .95 });
        });
        layer.on("mouseout", () => {
          if (selectedNetworkLayer !== layer) layer.setStyle(layer._networkBaseStyle);
        });
        layer.on("click", (event) => {
          if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
          if (selectedNetworkLayer && selectedNetworkLayer !== layer) selectedNetworkLayer.setStyle(selectedNetworkLayer._networkBaseStyle);
          selectedNetworkLayer = layer;
          layer.setStyle({ color: "#fff200", weight: 7, opacity: 1 });
          layer.setPopupContent(networkPopupHtml(networkType, feature.properties || {}, null, null, true));
          setTimeout(() => {
            const routeStats = networkType === "kanal" ? canalRouteStats(feature.properties || {}) : null;
            const proximityStats = networkType === "zovur" || !routeStats ? networkProximityStats(feature) : null;
            layer.setPopupContent(networkPopupHtml(networkType, feature.properties || {}, routeStats, proximityStats));
            layer.openPopup();
          }, 0);
        });
      },
    }).addTo(group);
  } catch (error) {
    networkLoadState.delete(networkType);
    if (map.hasLayer(group)) map.removeLayer(group);
    document.querySelector("#map-hint").textContent = `${config.label} qatlami yuklanmadi: ${error.message}`;
    console.error(error);
  }
}

function renderLayer(features) {
  if (geoLayer) map.removeLayer(geoLayer);
  selectedLayer = null;
  geoLayer = L.geoJSON({ type: "FeatureCollection", features }, {
    renderer: L.canvas({ padding: .5 }), style: styleFor,
    onEachFeature(feature, layer) {
      layer.bindPopup(popupHtml(feature.properties));
      layer.on({ mouseover(event) { event.target.setStyle({ weight: 3, color: "#00e5ff", fillOpacity: .9 }); }, mouseout(event) { if (event.target !== selectedLayer) geoLayer.resetStyle(event.target); }, click(event) { selectField(feature, event.target); } });
    },
  }).addTo(map);
}

function chooseMapFeatures(features) {
  if (features.length <= MAP_FEATURE_LIMIT) return features;
  return [...features].sort((a, b) => number(b.properties.maydoni) - number(a.properties.maydoni)).slice(0, MAP_FEATURE_LIMIT);
}

function renderMapView(features) {
  const visible = chooseMapFeatures(features);
  renderLayer(visible);
  document.querySelector("#map-hint").textContent = features.length === 0 ? "Dala topilmadi." : `${fmtInt.format(visible.length)} yagona dala ko‘rinmoqda — ekin kiritish uchun ustiga bosing`;
  const etStatus = actualEtMetadata ? ` · real ET ${fmtInt.format(actualEtMetadata.matched_fields)} dala` : "";
  document.querySelector("#data-status").textContent = `${fmtInt.format(fullData.features.length)} yagona dala · xaritada ${fmtInt.format(visible.length)}${etStatus}`;
}

function findFieldFromToolbar() {
  const input = document.querySelector("#quick-field-search");
  const query = input.value.trim().toLowerCase();
  if (!query || !fullData || !geoLayer) {
    document.querySelector("#map-hint").textContent = query ? "Dala ma’lumoti hali yuklanmagan." : "Qidirish uchun field_id kiriting.";
    return;
  }
  const idOf = (item) => String(item.properties.field_id || item.properties.feature_id || "");
  const feature = fullData.features.find((item) => idOf(item).toLowerCase() === query)
    || fullData.features.find((item) => idOf(item).toLowerCase().includes(query));
  if (!feature) {
    document.querySelector("#map-hint").textContent = `“${query}” bo‘yicha dala topilmadi.`;
    return;
  }
  let layer = null;
  geoLayer.eachLayer((candidate) => {
    if (idOf(candidate.feature || { properties: {} }) === idOf(feature)) layer = candidate;
  });
  if (!layer) {
    document.querySelector("#map-hint").textContent = "Dala bazada bor, ammo xarita optimizatsiyasi sabab joriy qatlamga kirmagan.";
    return;
  }
  map.fitBounds(layer.getBounds().pad(.45), { maxZoom: 15 });
  selectField(feature, layer);
  layer.openPopup();
  document.querySelector("#map-hint").textContent = `Dala ${idOf(feature).slice(0, 12)} topildi.`;
}

function waterRouteParts(properties) {
  return String(properties.water_route || "").split("→").map((item) => item.trim()).filter(Boolean);
}

function routeStartsWith(candidate, prefix) {
  return prefix.every((value, index) => candidate[index] === value);
}

function terminalOutlet(properties, route) {
  const code = String(route[route.length - 1] || properties.water_block_id || "").trim();
  const suffix = code.match(/(?:^|[-_\s])(\d+)\s*$/);
  return { code, number: suffix ? suffix[1] : null };
}

function routeChartSvg(steps, fieldLimit) {
  const width = 960, height = 300, left = 70, right = 28, top = 42, bottom = 62;
  const chartWidth = width - left - right, chartHeight = height - top - bottom;
  const waterMaximum = Math.max(fieldLimit, ...steps.map((step) => step.selectedWater), 1);
  const x = (index) => left + (steps.length === 1 ? chartWidth / 2 : index * chartWidth / (steps.length - 1));
  const waterY = (value) => top + chartHeight - value / waterMaximum * chartHeight;
  const waterPoints = steps.map((step, index) => `${x(index)},${waterY(step.selectedWater)}`).join(" ");
  const limitY = waterY(fieldLimit);
  const lossArea = `${steps.map((_, index) => `${x(index)},${limitY}`).join(" ")} ${[...steps].reverse().map((step, reverseIndex) => `${x(steps.length - 1 - reverseIndex)},${waterY(step.selectedWater)}`).join(" ")}`;
  const waterArea = `${left},${top + chartHeight} ${waterPoints} ${x(steps.length - 1)},${top + chartHeight}`;
  const grids = [0, .25, .5, .75, 1].map((ratio) => {
    const value = waterMaximum * ratio;
    const chartY = waterY(value);
    return `<line x1="${left}" y1="${chartY}" x2="${width - right}" y2="${chartY}" stroke="#dfe9e3" stroke-width="1"/><text x="${left - 10}" y="${chartY + 3}" text-anchor="end" fill="#718076" font-size="10">${fmtInt.format(value)}</text>`;
  }).join("");
  const dots = steps.map((step, index) => `<g><circle cx="${x(index)}" cy="${waterY(step.selectedWater)}" r="5" fill="#fff" stroke="#1174ee" stroke-width="3"><title>${index + 1}-bo‘g‘in · ${escapeHtml(step.name)} · ${fmtInt.format(step.selectedWater)} m³</title></circle>${index === 0 || index === steps.length - 1 || index % 2 === 0 ? `<text x="${x(index)}" y="${waterY(step.selectedWater) - 11}" text-anchor="middle" fill="#0d5fc3" font-size="9" font-weight="800">${fmtInt.format(step.selectedWater)} m³</text>` : ""}</g>`).join("");
  const xLabels = steps.map((step, index) => {
    const label = index === 0 ? "Bosh manba" : index === steps.length - 1 ? "Yakuniy quloq" : `${index + 1}-bo‘g‘in`;
    return `<text x="${x(index)}" y="${height - 28}" text-anchor="middle" fill="#244f36" font-size="9" font-weight="750">${label}</text><text x="${x(index)}" y="${height - 13}" text-anchor="middle" fill="#748178" font-size="8">${fmtInt.format(step.fields)} dala yo‘li</text>`;
  }).join("");
  const finalStep = steps[steps.length - 1];
  const retained = percent(finalStep.selectedWater, fieldLimit);
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bosh manbadan yakuniy quloqqacha tanlangan dala suvining hisobiy kamayishi"><defs><linearGradient id="routeWaterArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1687ff" stop-opacity=".28"/><stop offset="100%" stop-color="#1687ff" stop-opacity=".02"/></linearGradient><linearGradient id="routeLossArea" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="#f3a51b" stop-opacity=".05"/><stop offset="100%" stop-color="#f3a51b" stop-opacity=".3"/></linearGradient></defs><text x="${left}" y="18" fill="#52665a" font-size="10" font-weight="700">SUV HAJMI · m³</text><text x="${width - right}" y="18" text-anchor="end" fill="#0d6ed8" font-size="10" font-weight="800">DALAGA QOLGAN ULUSH ${fmtDec.format(retained)}%</text>${grids}<polygon points="${waterArea}" fill="url(#routeWaterArea)"/><polygon points="${lossArea}" fill="url(#routeLossArea)"/><line class="route-limit-line" x1="${left}" y1="${limitY}" x2="${width - right}" y2="${limitY}" stroke="#7057d8" stroke-width="2.5" stroke-dasharray="9 7"/><polyline class="route-water-line" points="${waterPoints}" fill="none" stroke="#1174ee" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${xLabels}</svg>`;
}

function renderRouteReport(properties) {
  const route = waterRouteParts(properties);
  const empty = document.querySelector("#route-report-empty");
  const data = document.querySelector("#route-report-data");
  const selectedScenario = deliveryScenario(properties);
  if (!fullData || !route.length) {
    empty.hidden = false; data.hidden = true;
    document.querySelector("#route-report-title").textContent = "Suv yo‘li aniqlanmagan";
    return;
  }
  const outlet = terminalOutlet(properties, route);
  const routeIntervals = Math.max(route.length - 1, 0);
  const stageRetention = selectedScenario && routeIntervals > 0 ? Math.pow(1 - selectedScenario.lossPct / 100, 1 / routeIntervals) : 1;
  const steps = route.map((name, index) => {
    const prefix = route.slice(0, index + 1);
    const matches = fullData.features.filter((feature) => routeStartsWith(waterRouteParts(feature.properties), prefix));
    const uniqueFields = new Set(matches.map((feature) => feature.properties.field_id || feature.properties.plan_part_id));
    const terminalBlocks = new Set(matches.map((feature) => waterRouteParts(feature.properties).at(-1)).filter(Boolean));
    return {
      name, index: index + 1, fields: uniqueFields.size, blocks: terminalBlocks.size,
      sourceParts: sum(matches, (feature) => feature.properties.merged_source_parts || 1),
      selectedWater: selectedScenario ? selectedScenario.sourceShare * Math.pow(stageRetention, index) : 0,
    };
  });
  const selected = steps[steps.length - 1];
  if (selectedScenario) selected.selectedWater = selectedScenario.delivery;
  const drops = steps.slice(1).map((step, index) => ({ from: steps[index], to: step, drop: steps[index].fields - step.fields }));
  const largestDrop = drops.sort((first, second) => second.drop - first.drop)[0];
  const outletLabel = outlet.number ? `${outlet.number}-quloq` : outlet.code;
  empty.hidden = true; data.hidden = false;
  document.querySelector("#route-report-title").textContent = `${outletLabel} orqali dalaga suv yetadi`;
  document.querySelector("#route-report-subtitle").textContent = `Bosh manba: ${route[0]} · ${route.length} ta tarmoq bo‘g‘ini · yakun: ${outlet.code}.`;
  document.querySelector("#route-metrics").innerHTML = `<div><span>Bosh manbadan ajratildi</span><strong>${selectedScenario ? `${fmtInt.format(selectedScenario.sourceShare)} m³` : "Ekin tanlang"}</strong><small>tanlangan dala uchun hisobiy ulush</small></div><div><span>Yo‘l bo‘yicha yo‘qotish</span><strong>${selectedScenario ? `${fmtDec.format(selectedScenario.lossPct)}%` : "—"}</strong><small>${selectedScenario ? `${fmtInt.format(selectedScenario.lossM3)} m³ ssenariy` : "ekin tanlangach hisoblanadi"}</small></div><div><span>Dalaga yetib keladi</span><strong>${selectedScenario ? `${fmtInt.format(selectedScenario.delivery)} m³` : "Ekin tanlang"}</strong><small>yakuniy quloqdan dala uchun</small></div><div><span>Quloq xizmat hududi</span><strong>${fmtInt.format(selected.fields)} dala</strong><small>${escapeHtml(outletLabel)} orqali suv oladi</small></div>`;
  document.querySelector("#route-explanation").innerHTML = `<strong>Grafikni qanday o‘qish kerak?</strong> Binafsha punktir — manbada ushbu dala uchun ajratilgan suv. Ko‘k chiziq suvning ${route.length} ta bo‘g‘indan o‘tib, <strong>${escapeHtml(outletLabel)}</strong> orqali dalaga yetguncha hisobiy kamayishini ko‘rsatadi. ${fmtInt.format(selected.fields)} dala — shu yakuniy quloqqa biriktirilgan dalalar soni; bu quloqlar soni emas.${largestDrop?.drop > 0 ? ` Eng katta yo‘nalish ajralishi ${largestDrop.from.index}- va ${largestDrop.to.index}-bo‘g‘in oralig‘ida: ${fmtInt.format(largestDrop.from.fields)} daladan ${fmtInt.format(largestDrop.to.fields)} dala shu shoxda davom etadi.` : ""}`;
  document.querySelector("#route-stage-list").innerHTML = steps.map((step, index) => `<div class="route-stage-item"><span>${index === 0 ? "BOSH MANBA" : index === steps.length - 1 ? "YAKUNIY QULOQ" : `${index + 1}-BO‘G‘IN`}</span><strong>${escapeHtml(step.name)}</strong><small>Shu yo‘nalishda ${fmtInt.format(step.fields)} dala · ${fmtInt.format(step.blocks)} yakuniy quloq</small></div>`).join("");
  const chart = document.querySelector("#route-chart");
  const legend = document.querySelector(".route-chart-legend");
  chart.hidden = !selectedScenario;
  legend.hidden = !selectedScenario;
  chart.innerHTML = selectedScenario ? routeChartSvg(steps, selectedScenario.sourceShare) : "";
}

function sourceLabel(value) {
  if (value === "observed") return "manba";
  if (value === "manual_user") return "qo‘lda kiritildi";
  if (value === "system_recommendation") return "tizim tavsiyasi";
  if (value === "split_user_selection") return "split qismi uchun tanlandi";
  if (value === "manual_required") return "kiritilmagan";
  return "yaqin dala taxmini";
}

function fieldEtCalculation(properties) {
  if (properties.actual_et_status !== "matched" || !number(properties.actual_et_total_mm)) return null;
  const totalMm = number(properties.actual_et_total_mm);
  const waterM3 = totalMm * number(properties.maydoni) * 10;
  return {
    totalMm, waterM3, monthlyMm: properties.actual_et_monthly_mm || {},
    coveragePct: number(properties.actual_et_coverage_pct), sourceIds: properties.actual_et_source_ids || [],
  };
}

function renderSoilComposition(properties) {
  const components = properties.crop_norm_components?.length ? properties.crop_norm_components : properties.soil_gmr_components || [];
  document.querySelector("#field-source-parts").textContent = properties.split_status === "scenario"
    ? `${fmtInt.format(number(properties.split_source_parts) || components.length || 1)} asl qism · ${fmtInt.format(number(properties.split_component_coverage_pct))}% fazoviy qamrov`
    : `${fmtInt.format(number(properties.merged_source_parts) || components.length || 1)} GIS qism → 1 dala`;
  document.querySelector("#field-soil-components").innerHTML = components.length ? components.map((component) => {
    const norm = number(component.norm_m3ha);
    const profile = `0–30 ${TEXTURE_LABELS[number(component.tm1)] || "—"} · 30–100 ${TEXTURE_LABELS[number(component.tm2)] || "—"} · 100–200 ${TEXTURE_LABELS[number(component.tm3)] || "—"}`;
    const groundwater = component.ss ? `${fmtInt.format(number(component.ss) * 1000)} mm` : "—";
    const normText = `${profile} · sizot ${groundwater}${norm ? ` · ${fmtInt.format(norm)} m³/ga` : ""}`;
    return `<div class="soil-component-row"><strong>${fmtDec.format(number(component.area_ha))} ga</strong><span>GMR ${escapeHtml(text(component.gmr, "—"))}</span><span>${component.bonitet === null ? "Bonitet —" : `${fmtInt.format(number(component.bonitet))} ball`}</span><small>${escapeHtml(normText)}</small></div>`;
  }).join("") : `<div class="soil-component-row"><strong>${fmtDec.format(number(properties.maydoni))} ga</strong><span>GMR ${escapeHtml(text(properties.gmr_mvp))}</span><span>${fmtInt.format(number(properties.bonitet))} ball</span><small>0–30 ${escapeHtml(TEXTURE_LABELS[number(properties.Tm1)] || "—")} · 30–100 ${escapeHtml(TEXTURE_LABELS[number(properties.Tm2)] || "—")} · 100–200 ${escapeHtml(TEXTURE_LABELS[number(properties.Tm3)] || "—")}</small></div>`;
}

function selectField(feature, layer) {
  if (splitState.active) return;
  const nextId = feature.properties.field_id || feature.properties.feature_id;
  const splitParentId = splitState.parent?.properties?.field_id || splitState.parent?.properties?.feature_id;
  const isSplitPart = feature.properties.split_status === "scenario";
  if (splitState.active && !isSplitPart && nextId !== splitParentId) return;
  const p = feature.properties;
  if (selectedLayer && selectedLayer !== layer) {
    if (selectedLayer.__splitPartLayer) restoreSplitPartStyle(selectedLayer);
    else if (selectedLayer !== splitState.parentLayer) geoLayer.resetStyle(selectedLayer);
  }
  selectedLayer = layer;
  selectedFeature = feature;
  layer.setStyle({ weight: 4, color: "#fff200", fillOpacity: .92 });
  document.querySelector("#field-empty").hidden = true;
  document.querySelector("#field-details").hidden = false;
  document.querySelector("#field-title").textContent = `Dala ${String(p.field_id || p.feature_id).slice(0, 8)}`;
  const meta = getMeta(p.demo_norm_status);
  const status = document.querySelector("#field-status"); status.textContent = meta.label; status.className = `status-pill ${meta.className}`;
  document.querySelector("#field-soil-dominant").textContent = TEXTURE_LABELS[number(p.Tm1)] || "Tarkib aniqlanmagan";
  document.querySelector("#field-soil-profile-summary").textContent = `0–30 sm ${TEXTURE_LABELS[number(p.Tm1)] || "—"} · 30–100 sm ${TEXTURE_LABELS[number(p.Tm2)] || "—"} · 100–200 sm ${TEXTURE_LABELS[number(p.Tm3)] || "—"} · sizot ${p.SS ? `${fmtInt.format(number(p.SS) * 1000)} mm` : "—"}`;
  document.querySelector("#field-crop").textContent = `${text(p.crop_mvp, "Ekin kiritilmagan")} · ${sourceLabel(p.crop_mvp_source)}`;
  document.querySelector("#field-area").textContent = `${fmtDec.format(number(p.maydoni))} ga`;
  const distinctGmrs = [...new Set((p.soil_gmr_components || []).map((component) => component.gmr).filter(Boolean))];
  document.querySelector("#field-gmr").textContent = distinctGmrs.length > 1 ? `${distinctGmrs.join(" / ")} · ${distinctGmrs.length} qism` : `${text(p.gmr_mvp, "Yo‘q")} · dominant`;
  document.querySelector("#field-bonitet").textContent = p.bonitet ? `${fmtDec.format(number(p.bonitet))} · maydon-vaznli` : "Yo‘q";
  renderSoilComposition(p);
  updateManualCropControls(p);
  document.querySelector("#field-water").textContent = p.planned_water_m3_mvp ? fmtInt.format(p.planned_water_m3_mvp) : "—";
  document.querySelector("#field-norm").textContent = p.norm_m3ha_mvp ? `${fmtInt.format(p.norm_m3ha_mvp)} m³/ga` : "—";
  document.querySelector("#field-count").textContent = text(p.irrigation_count_mvp);
  document.querySelector("#field-window").textContent = p.irrigation_start_mvp ? `${p.irrigation_start_mvp} — ${p.irrigation_end_mvp}` : "—";
  document.querySelector("#field-norm-status").textContent = meta.label;
  document.querySelector("#field-season-formula").textContent = p.crop_group_mvp ? `Σ(tuproq/GMR qismi maydoni × shu qism PNG normasi) = ${fmtInt.format(number(p.planned_water_m3_mvp))} m³` : "Ekin tanlang — GMR va tuproq qismlari bo‘yicha norma avtomatik hisoblanadi";

  const delivery = deliveryScenario(p);
  const deliveryPanel = document.querySelector("#field-delivery-plan");
  deliveryPanel.hidden = !delivery;
  if (delivery) {
    document.querySelector("#field-delivery-route").textContent = text(p.water_route, "Suv yo‘li aniqlanmagan");
    document.querySelector("#field-source-share").textContent = `${fmtInt.format(delivery.sourceShare)} m³`;
    document.querySelector("#field-route-loss").textContent = `${fmtDec.format(delivery.lossPct)}% · ${fmtInt.format(delivery.lossM3)} m³`;
    document.querySelector("#field-delivery-water").textContent = `${fmtInt.format(delivery.delivery)} m³`;
    document.querySelector("#field-delivery-formula").textContent = `${fmtInt.format(delivery.activeLimit)} × ${fmtInt.format(number(p.seasonal_need_m3))} / ${fmtInt.format(delivery.districtNeed)} × (1 − ${fmtDec.format(delivery.lossPct)}%) = ${fmtInt.format(delivery.delivery)} m³`;
    const route = waterRouteParts(p), outlet = terminalOutlet(p, route);
    document.querySelector("#field-delivery-note").textContent = `${outlet.number ? `${outlet.number}-quloq` : outlet.code} — tanlangan yo‘lning yakuniy tuguni. Dala ichidagi ariq yoki suv kirish darvozasi geometriyasi manbada yo‘q; hajm 1,5%/daraja ssenariysi, o‘lchangan sarf emas.`;
  }

  const analysis = fieldEtCalculation(p);
  if (analysis) {
    document.querySelector("#field-et-heading").textContent = "REAL ET — MART–OKTABR";
    document.querySelector("#field-seven-day-water").textContent = fmtInt.format(analysis.waterM3);
    document.querySelector("#field-weather-formula").textContent = `Real ET ${fmtDec.format(analysis.totalMm)} mm × ${fmtDec.format(number(p.maydoni))} ga × 10 = ${fmtInt.format(analysis.waterM3)} m³`;
    document.querySelector("#field-conclusion").textContent = `ET poligonlari bilan ${fmtDec.format(analysis.coveragePct)}% fazoviy moslik. Manba ID: ${analysis.sourceIds.join(", ") || "—"}. Oylik qiymatlar mart–oktabr kesimida maydon-vaznli hisoblandi.`;
  } else {
    document.querySelector("#field-et-heading").textContent = "REAL ET MA’LUMOTI";
    document.querySelector("#field-seven-day-water").textContent = "—";
    document.querySelector("#field-weather-formula").textContent = "Ushbu dala uchun ET qamrovi 70% chegaraga yetmadi";
    document.querySelector("#field-conclusion").textContent = "Taxminiy ET qo‘llanilmadi. Real ET bilan ishonchli fazoviy moslik topilgach ko‘rsatiladi.";
  }
  document.querySelector("#field-note").textContent = p.crop_group_mvp ? `${p.crop_mvp_source === "system_recommendation" ? "Ekin tizim tavsiyasi bilan belgilandi" : "Ekin qo‘lda kiritildi"}. Formula dala ichidagi ${p.soil_gmr_components?.length || 1} ta real tuproq/GMR qismi maydonlarini alohida hisoblaydi.` : "Dala geometriyasi va tuproq/GMR tarkibi manbadan olindi; ekin ataylab bo‘sh qoldirilgan va faqat qo‘lda kiritiladi.";
  renderFieldDecision(p);
  renderRouteReport(p);
}

function initMapPage() {
  if (mapPromise) return mapPromise;
  mapPromise = (async () => {
    map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([38.86,65.42], 10);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const networkPane = map.createPane("networkPane");
    networkPane.style.zIndex = "620";
    networkPane.style.pointerEvents = "none";
    const networkHitPane = map.createPane("networkHitPane");
    networkHitPane.style.zIndex = "630";
    networkHitPane.style.pointerEvents = "auto";
    const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri, Maxar, Earthstar Geographics and the GIS User Community" });
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
    imagery.addTo(map);
    networkGroups = { kanal: L.layerGroup(), zovur: L.layerGroup() };
    const closeLayerControl = () => setTimeout(() => layerControl?.collapse(), 0);
    layerControl = L.control.layers({ "ArcGIS World Imagery": imagery, "Oddiy xarita": street }, { [NETWORK_SOURCES.kanal.label]: networkGroups.kanal, [NETWORK_SOURCES.zovur.label]: networkGroups.zovur }, { position: "topright", collapsed: true }).addTo(map);
    map.on("baselayerchange", closeLayerControl);
    map.on("overlayadd", ({ layer }) => {
      const networkType = Object.keys(networkGroups).find((key) => networkGroups[key] === layer);
      if (networkType) loadNetworkOverlay(networkType);
      closeLayerControl();
    });
    map.on("overlayremove", closeLayerControl);
    try {
      const [response, etResponse] = await Promise.all([fetch(DATA_URL), fetch(ACTUAL_ET_URL, { cache: "no-store" })]);
      if (!response.ok) throw new Error(`GeoJSON yuklanmadi: ${response.status}`);
      fullData = await response.json();
      if (etResponse.ok) applyActualEtData(fullData.features, await etResponse.json());
      else console.warn(`Real ET ma’lumoti yuklanmadi: ${etResponse.status}`);
      if (irrigationRules.length) applyStoredCropAssignments(fullData.features);
      renderDistrictCropAssignment(fullData.features);
      buildFieldNetworkIndexes(fullData.features);
      document.querySelector("#map-loading").hidden = true;
      renderMapView(fullData.features);
      updateRecommendationControl();
      const bounds = geoLayer.getBounds(); if (bounds.isValid()) map.fitBounds(bounds.pad(.05));
    } catch (error) {
      document.querySelector("#map-loading").innerHTML = `<p><strong>Ma’lumot yuklanmadi.</strong><br>${escapeHtml(error.message)}</p>`;
      console.error(error);
    }
  })();
  return mapPromise;
}

async function loadDashboardEtSummary() {
  try {
    const response = await fetch(ACTUAL_ET_DASHBOARD_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Dashboard real ET: ${response.status}`);
    actualEtMetadata = await response.json();
    renderPremiumMonthlyEt();
    renderPremiumQuality();
    if (districtBalance) updateWaterBalance();
  } catch (error) {
    document.querySelector("#premium-et-note").textContent = "Real ET xulosasi yuklanmadi";
    console.warn(error);
  }
}

async function loadSummary() {
  try {
    const response = await fetch(SUMMARY_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Statistika yuklanmadi: ${response.status}`);
    renderDashboard(await response.json());
  } catch (error) {
    document.querySelector("#data-status").textContent = "Statistika yuklanmadi";
    document.querySelector("#conclusion-grid").innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    console.error(error);
  }
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
document.querySelector("#reset-view").addEventListener("click", () => geoLayer && map.fitBounds(geoLayer.getBounds().pad(.05)));
["input-water-limit", "input-water-supplied", "input-water-used"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", updateWaterBalance));
document.querySelector("#balance-reset").addEventListener("click", setBalanceInputs);
document.querySelector("#start-split").addEventListener("click", startSplitMode);
document.querySelector("#toolbar-start-split").addEventListener("click", startSplitMode);
document.querySelector("#cancel-split").addEventListener("click", () => cancelSplit());
document.querySelector("#export-split").addEventListener("click", exportSplitGeoJSON);
document.querySelector("#manual-crop-select").addEventListener("change", assignCropToSelectedField);
document.querySelector("#recommend-crops").addEventListener("click", applyCropRecommendations);
document.querySelector("#quick-field-find").addEventListener("click", findFieldFromToolbar);
document.querySelector("#quick-field-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") findFieldFromToolbar();
});
document.querySelector("#download-report").addEventListener("click", () => window.print());
loadManualCropAssignments();
const initialView = new URLSearchParams(window.location.search).get("view");
showView(initialView === "map" ? "map" : "dashboard");
loadSummary();
loadDistrictAnalytics();
loadDashboardEtSummary();
loadWeather();
loadOfficialPeriodWeather();
loadDistrictBalance();
loadOfficialLimit();
loadIrrigationRules();
