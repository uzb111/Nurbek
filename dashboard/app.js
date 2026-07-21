const SUMMARY_URL = "../mvp_data/dashboard_summary.json";
const DATA_URL = "../mvp_data/geojson/fields_demo_mvp.geojson";
const WEATHER_SNAPSHOT_URL = "../mvp_data/open_meteo_weather.json";
const WEATHER_API_URL = "/api/open-meteo";
const DISTRICT_BALANCE_URL = "../mvp_data/district_water_balance.json";
const IRRIGATION_RULES_URL = "../mvp_data/config/irrigation_norms.csv";
const MAP_FEATURE_LIMIT = 1800;

const STATUS_META = {
  demo_ready_observed: { label: "Manba asosidagi hisob", color: "#17663b", className: "ready" },
  demo_ready_proxy: { label: "Taxminiy hisob", color: "#d88917", className: "provisional" },
  demo_norm_unavailable: { label: "Norma topilmadi", color: "#c95343", className: "incomplete" },
};
const MAP_STATUS_COLORS = { demo_ready_observed: "#00c96b", demo_ready_proxy: "#ffb000", demo_norm_unavailable: "#ff375f" };
const WATER_STATUS_META = {
  sufficient: { label: "Suv yetarli", color: "#00c96b", className: "" },
  limited: { label: "Suv cheklangan", color: "#f4c430", className: "limited" },
  shortage: { label: "Suv tanqis", color: "#ff7a00", className: "shortage" },
  severe: { label: "Jiddiy tanqis", color: "#e53935", className: "severe" },
};
const CROP_COEFFICIENT = { cotton: 1.15, winter_grain: 1.05, alfalfa: 1.10, maize: 1.15, vegetables: 1.05, melons: 0.95, orchard: 0.95 };
const GROUNDWATER_FACTOR = { I: 0.16, II: 0.14, III: 0.12, IV: 0.10, V: 0.08, VI: 0.06, IX: 0.04 };
const CROP_LABELS = { cotton: "Paxta", winter_grain: "Bug‘doy", alfalfa: "Beda", maize: "Makkajo‘xori", orchard: "Bog‘", melons: "Poliz", vegetables: "Sabzavot" };
const PNG_CROP_ORDER = ["cotton", "alfalfa", "maize", "vegetables", "melons", "orchard", "winter_grain"];
const CROP_PROFILES = {
  cotton: { minBonitet: 55, textures: [3, 4, 5], heat: 92 }, winter_grain: { minBonitet: 40, textures: [2, 3, 4, 5], heat: 84 },
  alfalfa: { minBonitet: 50, textures: [3, 4, 5], heat: 76 }, maize: { minBonitet: 55, textures: [3, 4, 5], heat: 80 },
  orchard: { minBonitet: 60, textures: [3, 4, 5], heat: 72 }, melons: { minBonitet: 45, textures: [2, 3, 4], heat: 92 },
  vegetables: { minBonitet: 65, textures: [3, 4], heat: 62 },
};

let dashboardSummary = null;
let currentWeather = null;
let districtBalance = null;
let irrigationRules = [];
let map = null;
let geoLayer = null;
let fullData = null;
let selectedLayer = null;
let selectedFeature = null;
let mapPromise = null;
let splitState = { active: false, parent: null, points: [], markers: [], line: null, layer: null, parts: [], scenarioId: null };

const fmtInt = new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const number = (value) => Number(value) || 0;
const sum = (items, selector) => items.reduce((total, item) => total + number(selector(item)), 0);
const text = (value, fallback = "—") => value === undefined || value === null || value === "" ? fallback : value;
const percent = (part, total) => total ? part / total * 100 : 0;
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
const getMeta = (status) => STATUS_META[status] || STATUS_META.demo_norm_unavailable;

function weatherStats(payload) {
  const daily = payload?.daily || {};
  const current = payload?.current || {};
  const rain = sum(daily.precipitation_sum || [], Number);
  const et0 = sum(daily.et0_fao_evapotranspiration || [], Number);
  return {
    rain, et0, deficit: Math.max(et0 - rain, 0),
    temperature: number(current.temperature_2m),
    maxTemperature: Math.max(...(daily.temperature_2m_max || [number(current.temperature_2m)]).map(number)),
    soil: number(current.soil_moisture_3_to_9cm), wind: number(current.wind_speed_10m), time: current.time,
  };
}

function weatherValue(value, unit, digits = 1) {
  return Number.isFinite(Number(value)) ? `${Number(value).toLocaleString("uz-UZ", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}` : "—";
}

function renderWeather(payload, sourceLabel, fallback = false) {
  currentWeather = payload;
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
  renderConclusions();
  if (selectedFeature) renderFieldDecision(selectedFeature.properties);
}

async function loadWeather() {
  try {
    const response = await fetch(WEATHER_API_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Open-Meteo: ${response.status}`);
    renderWeather(await response.json(), "Open-Meteo · jonli API");
  } catch (liveError) {
    try {
      const response = await fetch(WEATHER_SNAPSHOT_URL, { cache: "no-store" });
      if (!response.ok) throw liveError;
      const snapshot = await response.json();
      renderWeather(snapshot.weather || snapshot, "Open-Meteo · saqlangan nusxa", true);
    } catch (snapshotError) {
      const source = document.querySelector("#weather-source");
      source.textContent = "Open-Meteo ulanmagan";
      source.classList.add("offline");
      renderConclusions();
      console.warn("Weather unavailable", snapshotError);
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
  document.querySelector("#zone-bars").innerHTML = simpleRows(summary.zones, t.planned_water_m3, 4);
  document.querySelector("#gmr-bars").innerHTML = simpleRows(summary.gmrs, t.planned_water_m3, 6);

  const observedShare = percent(t.observed_polygons, t.polygons);
  const donut = document.querySelector("#quality-donut");
  donut.style.setProperty("--observed", observedShare);
  document.querySelector("#quality-percent").textContent = `${fmtDec.format(observedShare)}%`;
  document.querySelector("#quality-legend").innerHTML = `<div class="legend-item"><i style="background:#17663b"></i><span>Manba asosida</span><strong>${fmtInt.format(t.observed_polygons)}</strong><small>${fmtDec.format(t.observed_water_m3 / 1e6)} mln m³</small></div><div class="legend-item"><i style="background:#d88917"></i><span>Taxminiy</span><strong>${fmtInt.format(t.estimated_polygons)}</strong><small>${fmtDec.format(t.estimated_water_m3 / 1e6)} mln m³</small></div>`;
  const observedWaterShare = percent(t.observed_water_m3, t.planned_water_m3);
  document.querySelector("#water-composition").innerHTML = `<div class="composition-track"><div class="composition-observed" style="width:${observedWaterShare}%"></div><div class="composition-estimated" style="width:${100 - observedWaterShare}%"></div></div><div class="composition-legend"><div><span>Manba asosidagi suv</span><strong>${fmtDec.format(t.observed_water_m3 / 1e6)} mln m³</strong><small>${fmtDec.format(observedWaterShare)}% jami hajmdan</small></div><div><span>Taxminiy suv</span><strong>${fmtDec.format(t.estimated_water_m3 / 1e6)} mln m³</strong><small>${fmtDec.format(100 - observedWaterShare)}% jami hajmdan</small></div></div>`;
  document.querySelector("#data-status").textContent = `${fmtInt.format(t.polygons)} poligon · tahlil tayyor`;
  renderConclusions();
}

function balanceMillions(value) { return fmtDec.format(number(value) / 1e6); }

function setBalanceInputs() {
  if (!districtBalance) return;
  const defaults = districtBalance.editable_defaults;
  document.querySelector("#input-water-limit").value = (defaults.limit_m3 / 1e6).toFixed(1);
  document.querySelector("#input-water-supplied").value = (defaults.supplied_m3 / 1e6).toFixed(1);
  document.querySelector("#input-water-used").value = (defaults.used_m3 / 1e6).toFixed(1);
  updateWaterBalance();
}

function updateWaterBalance() {
  if (!districtBalance) return;
  const limit = number(document.querySelector("#input-water-limit").value) * 1e6;
  const supplied = number(document.querySelector("#input-water-supplied").value) * 1e6;
  const used = number(document.querySelector("#input-water-used").value) * 1e6;
  const potentialEt = districtBalance.evapotranspiration.potential_etc_m3;
  const rain = districtBalance.weather.effective_rain_m3;
  const groundwater = districtBalance.evapotranspiration.groundwater_contribution_m3;
  const availableForEt = used + rain + groundwater;
  const actualEt = Math.min(potentialEt, availableForEt);
  const deficit = Math.max(potentialEt - availableForEt, 0);
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
  document.querySelector("#balance-conclusion").textContent = deficit > 0 ? `ET talabi bo‘yicha ${balanceMillions(deficit)} mln m³ suv defitsiti mavjud` : `Mavjud suv manbalari hisobiy ET talabini qoplaydi`;
  document.querySelector("#balance-equation").textContent = `ET sarfi = min(ETc ${balanceMillions(potentialEt)}, ishlatilgan ${balanceMillions(used)} + samarali yog‘in ${balanceMillions(rain)} + sizot ${balanceMillions(groundwater)}) = ${balanceMillions(actualEt)} mln m³. Ishlatilmagan limit: ${balanceMillions(unusedLimit)} mln m³.`;
  if (geoLayer && document.querySelector("#map-metric").value === "water") geoLayer.setStyle(styleFor);
  if (selectedFeature) renderFieldDecision(selectedFeature.properties);
}

function renderDistrictBalance(data) {
  districtBalance = data;
  document.querySelector("#balance-district").textContent = `${data.district.name} · kod ${data.district.code}`;
  document.querySelector("#balance-period").textContent = `${data.period.start_date} — ${data.period.end_date} · ${fmtInt.format(data.period.days)} kun · ${fmtInt.format(data.field_totals.area_ha)} ga`;
  const cropLabels = { cotton: "Paxta", winter_grain: "Bug‘doy", alfalfa: "Beda", maize: "Makkajo‘xori", orchard: "Bog‘", melons: "Poliz", vegetables: "Sabzavot" };
  const maximum = Math.max(...data.crop_groups.map((group) => group.etc_m3), 1);
  document.querySelector("#balance-crop-et").innerHTML = data.crop_groups.map((group) => `<div class="bar-row"><span>${cropLabels[group.group] || group.group}</span><div class="bar-track"><div class="bar-fill" style="width:${group.etc_m3 / maximum * 100}%"></div></div><span class="bar-value">${balanceMillions(group.etc_m3)}</span></div>`).join("");
  document.querySelector("#balance-excluded").textContent = `${fmtInt.format(data.field_totals.unassigned_polygons_excluded)} poligon (${fmtDec.format(data.field_totals.unassigned_area_ha_excluded)} ga) tuman kodi bo‘sh bo‘lgani uchun ushbu hisobga kiritilmadi.`;
  setBalanceInputs();
  if (geoLayer && document.querySelector("#map-metric").value === "water") geoLayer.setStyle(styleFor);
  if (!document.querySelector("#water-balance-view").hidden) document.querySelector("#data-status").textContent = `${data.district.name} · ${data.period.days} kun`;
}

async function loadDistrictBalance() {
  try {
    const response = await fetch(DISTRICT_BALANCE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Tuman suv balansi yuklanmadi: ${response.status}`);
    renderDistrictBalance(await response.json());
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
    if (selectedFeature) renderFieldDecision(selectedFeature.properties);
  } catch (error) {
    console.error(error);
  }
}

function currentDistrictUsedM3() {
  if (!districtBalance) return 0;
  const input = number(document.querySelector("#input-water-used")?.value) * 1e6;
  return input || districtBalance.editable_defaults.used_m3;
}

function fieldWaterAnalysis(properties) {
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
  const distance = Math.min(...preferred.map((value) => Math.abs(value - texture)));
  return distance === 1 ? 72 : 45;
}

function soilSuitability(bonitet, minimum) {
  if (!bonitet) return 55;
  return bonitet >= minimum ? Math.min(100, 78 + (bonitet - minimum) * 1.2) : Math.max(25, 78 - (minimum - bonitet) * 3.5);
}

function rulesForField(properties) {
  const zoneRules = irrigationRules.filter((rule) => rule.irrigation_zone === properties.irrigation_zone);
  const exact = zoneRules.filter((rule) => rule.gmr === properties.gmr_mvp);
  if (exact.length) return exact;
  const order = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
  const target = order.indexOf(properties.gmr_mvp);
  const byCrop = new Map();
  for (const rule of zoneRules) {
    const distance = Math.abs(order.indexOf(rule.gmr) - target);
    if (!byCrop.has(rule.crop_group) || distance < byCrop.get(rule.crop_group).distance) byCrop.set(rule.crop_group, { ...rule, distance });
  }
  return [...byCrop.values()];
}

function cropRecommendations(properties) {
  if (!districtBalance || !irrigationRules.length) return [];
  const availableM3Ha = currentDistrictUsedM3() / districtBalance.field_totals.area_ha;
  const bonitet = number(properties.bonitet);
  const texture = number(properties.Tm1);
  const hot = currentWeather ? weatherStats(currentWeather).maxTemperature >= 40 : false;
  return rulesForField(properties).map((rule) => {
    const profile = CROP_PROFILES[rule.crop_group] || { minBonitet: 50, textures: [3, 4], heat: 75 };
    const norm = number(rule.seasonal_norm_m3ha);
    const waterScore = Math.min(100, percent(availableM3Ha, norm));
    const soilScore = soilSuitability(bonitet, profile.minBonitet);
    const mechanicalScore = textureScore(texture, profile.textures);
    const climateScore = hot ? profile.heat : 85;
    const score = Math.round(waterScore * .45 + soilScore * .30 + mechanicalScore * .15 + climateScore * .10);
    return { group: rule.crop_group, name: CROP_LABELS[rule.crop_group] || rule.crop_group, norm, waterScore, score, minBonitet: profile.minBonitet };
  }).sort((a, b) => b.score - a.score).slice(0, 3);
}

function renderFieldDecision(properties) {
  const water = fieldWaterAnalysis(properties);
  const waterMeta = WATER_STATUS_META[water.key];
  const state = document.querySelector("#field-water-state");
  state.textContent = waterMeta.label;
  state.className = `water-state ${waterMeta.className}`;
  document.querySelector("#field-water-coverage").textContent = `${fmtInt.format(water.coverage * 100)}%`;
  const bar = document.querySelector("#field-water-bar");
  bar.style.width = `${Math.min(water.coverage * 100, 100)}%`;
  bar.style.background = waterMeta.color;
  document.querySelector("#field-water-reason").textContent = `Sabab: tumandagi foydali suv ${fmtInt.format(water.availableM3Ha)} m³/ga, ushbu ekin uchun ET asosidagi sof talab ${fmtInt.format(water.demandM3Ha)} m³/ga. Samarali yog‘in ${fmtDec.format(water.rainMm)} mm, GMR bo‘yicha sizot hissasi ${fmtDec.format(water.groundwaterMm)} mm.`;

  const bonitet = number(properties.bonitet);
  const soilLabel = !bonitet ? "Bonitet ma’lumoti yo‘q" : bonitet >= 80 ? "Yuqori unumdor tuproq" : bonitet >= 60 ? "Yaxshi unumdor tuproq" : bonitet >= 40 ? "O‘rtacha unumdor tuproq" : "Past unumdor tuproq";
  const textureLabels = { 1: "qumli", 2: "qumoq", 3: "yengil qumoq", 4: "o‘rta qumoq", 5: "og‘ir qumoq", 6: "gilli" };
  document.querySelector("#field-soil-score").textContent = bonitet ? `${fmtInt.format(bonitet)} ball` : "—";
  document.querySelector("#field-soil-state").textContent = soilLabel;
  document.querySelector("#field-texture").textContent = `Mexanik tarkib Tm1: ${textureLabels[number(properties.Tm1)] || text(properties.Tm1, "aniqlanmagan")}`;
  const weather = currentWeather ? weatherStats(currentWeather) : null;
  document.querySelector("#field-soil-note").textContent = `Ob-havo bonitet ballini qisqa muddatda o‘zgartirmaydi. Ammo ${weather ? `${fmtDec.format(weather.maxTemperature)}°C gacha issiqlik, ` : ""}suv tanqisligi, sho‘rlanish yoki sizotning ko‘tarilishi hosildorlikni pasaytirishi va uzoq muddatda tuproq holatiga ta’sir qilishi mumkin.`;

  const recommendations = cropRecommendations(properties);
  document.querySelector("#field-crop-recommendations").innerHTML = recommendations.length ? recommendations.map((item, index) => `<div class="recommendation-item"><span class="recommendation-rank">${index + 1}</span><div><strong>${item.name}</strong><small>Norma ${fmtInt.format(item.norm)} m³/ga · suv qoplashi ${fmtInt.format(item.waterScore)}% · bonitet talabi ≥${item.minBonitet}</small></div><span class="recommendation-score">${item.score}</span></div>`).join("") : "<p>Tavsiya qoidalari topilmadi.</p>";
}

function splitCropOptions(selected) {
  return PNG_CROP_ORDER.map((group) => `<option value="${group}" ${group === selected ? "selected" : ""}>${CROP_LABELS[group]}</option>`).join("");
}

function splitGmrOptions(selected) {
  return ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"].map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("");
}

function startSplitMode() {
  if (!selectedFeature || !map) return;
  if (!irrigationRules.length) {
    document.querySelector("#split-panel").hidden = false;
    document.querySelector("#split-message").textContent = "PNG sug‘orish qoidalari hali yuklanmoqda. Bir necha soniyadan keyin qayta urinib ko‘ring.";
    return;
  }
  cancelSplit(false);
  splitState.active = true;
  splitState.parent = selectedFeature;
  splitState.scenarioId = `split-${Date.now().toString(36)}`;
  document.querySelector("#split-panel").hidden = false;
  document.querySelector("#split-editors").hidden = true;
  document.querySelector("#export-split").hidden = true;
  document.querySelector("#split-message").textContent = "Birinchi nuqtani xaritada belgilang.";
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
    document.querySelector("#split-message").textContent = "Ikkinchi nuqtani belgilang — chiziq poligonni to‘liq kesib o‘tsin.";
    return;
  }
  map.off("click", onSplitMapClick);
  map.getContainer().classList.remove("split-cursor");
  splitState.line = L.polyline(splitState.points, { color: "#fff200", weight: 3, dashArray: "7 5" }).addTo(map);
  try {
    createSplitParts();
  } catch (error) {
    document.querySelector("#split-message").textContent = `Split amalga oshmadi: ${error.message}. Bekor qilib qayta chizing.`;
    console.error(error);
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
    feature.id = id;
    feature.properties = {
      ...parent.properties, feature_id: id, field_id: id, parent_field_id: parentId,
      split_scenario_id: splitState.scenarioId, split_part: part, split_status: "scenario",
      maydoni: parentArea * rawAreas[index] / rawTotal, split_area_ha: parentArea * rawAreas[index] / rawTotal,
      crop_group_mvp: PNG_CROP_ORDER.includes(parent.properties.crop_group_mvp) ? parent.properties.crop_group_mvp : PNG_CROP_ORDER[0],
    };
    return feature;
  });
  splitState.active = false;
  applySplitCropRule(splitState.parts[0]);
  applySplitCropRule(splitState.parts[1]);
  renderSplitLayer();
  renderSplitEditors();
  document.querySelector("#split-message").textContent = `Split tayyor: ${fmtDec.format(splitState.parts[0].properties.maydoni)} ga + ${fmtDec.format(splitState.parts[1].properties.maydoni)} ga = ${fmtDec.format(parentArea)} ga.`;
  document.querySelector("#split-editors").hidden = false;
  document.querySelector("#export-split").hidden = false;
}

function exactSplitRule(properties) {
  return irrigationRules.find((rule) => rule.irrigation_zone === properties.irrigation_zone && rule.gmr === properties.gmr_mvp && rule.crop_group === properties.crop_group_mvp) || null;
}

function applySplitCropRule(feature) {
  const properties = feature.properties;
  properties.crop_mvp = CROP_LABELS[properties.crop_group_mvp] || properties.crop_mvp;
  properties.crop_mvp_source = "split_user_selection";
  const rule = exactSplitRule(properties);
  if (!rule) {
    properties.norm_m3ha_mvp = null; properties.planned_water_m3_mvp = null;
    properties.irrigation_count_mvp = null; properties.irrigation_start_mvp = null; properties.irrigation_end_mvp = null;
    properties.demo_norm_status = "demo_norm_unavailable"; properties.norm_source = null;
    return;
  }
  properties.norm_m3ha_mvp = number(rule.seasonal_norm_m3ha);
  properties.planned_water_m3_mvp = properties.maydoni * properties.norm_m3ha_mvp;
  properties.irrigation_count_mvp = rule.irrigation_pattern;
  properties.irrigation_start_mvp = rule.start_month_day;
  properties.irrigation_end_mvp = rule.end_month_day;
  properties.demo_norm_status = "demo_ready_proxy";
  properties.norm_source = rule.source;
}

function splitPartSummary(feature) {
  const properties = feature.properties;
  const rule = exactSplitRule(properties);
  const water = fieldWaterAnalysis(properties);
  const area = number(properties.maydoni);
  const alternatives = cropRecommendations(properties).map((item) => item.name).join(", ");
  return { rule, water, area, etM3: water.demandM3Ha * area, availableM3: water.availableM3Ha * area, alternatives };
}

function renderSplitLayer() {
  if (splitState.layer) map.removeLayer(splitState.layer);
  splitState.layer = L.geoJSON(turf.featureCollection(splitState.parts), {
    style(feature) {
      const water = fieldWaterAnalysis(feature.properties);
      return { color: feature.properties.split_part === "A" ? "#00e5ff" : "#ff4fd8", weight: 4, opacity: 1, fillColor: WATER_STATUS_META[water.key].color, fillOpacity: .82 };
    },
    onEachFeature(feature, layer) { layer.bindTooltip(`Qism ${feature.properties.split_part} · ${fmtDec.format(feature.properties.maydoni)} ga · ${CROP_LABELS[feature.properties.crop_group_mvp]}`, { sticky: true }); },
  }).addTo(map);
  splitState.layer.bringToFront();
  if (selectedLayer) selectedLayer.setStyle({ fillOpacity: .05, opacity: .35, dashArray: "5 5" });
}

function renderSplitEditors() {
  const container = document.querySelector("#split-editors");
  container.innerHTML = splitState.parts.map((feature, index) => {
    const properties = feature.properties;
    const summary = splitPartSummary(feature);
    const rule = summary.rule;
    const waterMeta = WATER_STATUS_META[summary.water.key];
    return `<article class="split-part-card" data-part-index="${index}"><div class="split-part-head"><strong>Qism ${properties.split_part}</strong><span>${fmtDec.format(summary.area)} ga · ${escapeHtml(properties.field_id.slice(-18))}</span></div><div class="split-part-grid"><label>Ekin<select data-split-field="crop_group_mvp">${splitCropOptions(properties.crop_group_mvp)}</select></label><label>Zona<select data-split-field="irrigation_zone"><option value="boz" ${properties.irrigation_zone === "boz" ? "selected" : ""}>Bo‘z</option><option value="chol" ${properties.irrigation_zone === "chol" ? "selected" : ""}>Cho‘l</option></select></label><label>GMR<select data-split-field="gmr_mvp">${splitGmrOptions(properties.gmr_mvp)}</select></label><label>Bonitet<input data-split-field="bonitet" type="number" min="0" max="100" value="${text(properties.bonitet, "")}" /></label><label>Tm1<select data-split-field="Tm1">${[1,2,3,4,5,6].map((value) => `<option value="${value}" ${number(properties.Tm1) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label></div><div class="split-result">${rule ? `<div><span>PNG normasi</span><strong>${fmtInt.format(properties.norm_m3ha_mvp)} m³/ga</strong><small>${escapeHtml(rule.source)}</small></div><div><span>Suv limiti</span><strong>${fmtInt.format(properties.planned_water_m3_mvp)} m³</strong><small>maydon × norma</small></div><div><span>Sug‘orish</span><strong>${escapeHtml(rule.irrigation_pattern)}</strong><small>${rule.start_month_day} — ${rule.end_month_day}</small></div>` : `<div class="split-full"><span>PNG qoidasi</span><strong>Bu zona–GMR–ekin kombinatsiyasi topilmadi</strong></div>`}<div><span>ET sof talab</span><strong>${fmtInt.format(summary.etM3)} m³</strong><small>${fmtInt.format(summary.water.demandM3Ha)} m³/ga</small></div><div><span>Mavjud suv</span><strong>${fmtInt.format(summary.availableM3)} m³</strong><small>${fmtInt.format(summary.water.coverage * 100)}% qoplash</small></div><div><span>Suv holati</span><strong style="color:${waterMeta.color}">${waterMeta.label}</strong><small>mustaqil qism hisobi</small></div></div><p class="split-alternatives">Mos muqobil ekinlar: ${escapeHtml(summary.alternatives || "aniqlanmadi")}</p></article>`;
  }).join("");
  container.querySelectorAll("[data-split-field]").forEach((control) => control.addEventListener("change", (event) => {
    const card = event.target.closest("[data-part-index]");
    updateSplitPart(number(card.dataset.partIndex), event.target.dataset.splitField, event.target.value);
  }));
}

function updateSplitPart(index, field, value) {
  const feature = splitState.parts[index];
  if (!feature) return;
  feature.properties[field] = ["bonitet", "Tm1"].includes(field) ? number(value) : value;
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
  if (map) { map.off("click", onSplitMapClick); map.getContainer().classList.remove("split-cursor"); }
  for (const marker of splitState.markers || []) map?.removeLayer(marker);
  if (splitState.line) map?.removeLayer(splitState.line);
  if (splitState.layer) map?.removeLayer(splitState.layer);
  if (selectedLayer && geoLayer) { geoLayer.resetStyle(selectedLayer); selectedLayer.setStyle({ weight: 4, color: "#fff200", fillOpacity: .92 }); }
  splitState = { active: false, parent: null, points: [], markers: [], line: null, layer: null, parts: [], scenarioId: null };
  if (hidePanel) document.querySelector("#split-panel").hidden = true;
}

function renderConclusions() {
  const container = document.querySelector("#conclusion-grid");
  if (!dashboardSummary) { container.innerHTML = "<p>Statistika yuklanmoqda…</p>"; return; }
  const s = dashboardSummary;
  const t = s.totals;
  const weather = currentWeather ? weatherStats(currentWeather) : null;
  const topCrop = s.crops[0];
  const topZone = s.zones[0];
  const topGmr = s.gmrs[0];
  const observedShare = percent(t.observed_polygons, t.polygons);
  const estimatedShare = percent(t.estimated_polygons, t.polygons);
  const topCropShare = percent(topCrop.water_m3, t.planned_water_m3);
  const zoneShare = percent(topZone.area_ha, t.area_ha);
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
    { title: "Manba asosidagi hisob", text: `${fmtDec.format(observedShare)}% poligonda ekin, GMR va zona manba ma’lumotiga tayangan.`, formula: `${fmtInt.format(t.observed_polygons)} / ${fmtInt.format(t.polygons)} × 100`, tone: observedShare < 50 ? "warning" : "" },
    { title: "Taxminiy hisob ulushi", text: `${fmtDec.format(estimatedShare)}% poligon dala ma’lumoti bilan keyinchalik tasdiqlanishi kerak.`, formula: `${fmtInt.format(t.estimated_polygons)} / ${fmtInt.format(t.polygons)} × 100`, tone: estimatedShare > 50 ? "warning" : "" },
    { title: "Ekin ma’lumoti", text: `${fmtInt.format(t.crop_proxy_polygons)} poligonda ekin eng yaqin ekinli dala orqali baholangan.`, formula: "ekin taxmini = eng yaqin ma’lum ekin", tone: "warning" },
    { title: "GMR ma’lumoti", text: `${fmtInt.format(t.gmr_proxy_polygons)} poligonda GMR eng yaqin ma’lum poligondan olingan.`, formula: "GMR taxmini = nearest known GMR", tone: "warning" },
    { title: "Sug‘orish zonasi", text: `${fmtInt.format(t.zone_estimated_polygons)} poligonda bo‘z yoki cho‘l zonasi hududiy yaqinlik bilan baholangan.`, formula: "zona = eng yaqin tasdiqlangan zona", tone: "warning" },
    { title: "Eng katta suv iste’molchisi", text: `${topCrop.label} uchun ${fmtDec.format(topCrop.water_m3 / 1e6)} mln m³ rejalashtirilgan.`, formula: "maksimum Σ ekin suv hajmi" },
    { title: "Ekin bo‘yicha ulush", text: `${topCrop.label} jami suv rejasining ${fmtDec.format(topCropShare)}% qismini tashkil etadi.`, formula: `${fmtDec.format(topCrop.water_m3 / 1e6)} / ${fmtDec.format(t.planned_water_m3 / 1e6)} × 100` },
    { title: "Hududiy zona balansi", text: `${topZone.label === "boz" ? "Bo‘z" : "Cho‘l"} zonasi maydonning ${fmtDec.format(zoneShare)}% qismini qamrab oladi.`, formula: "zona ulushi = zona maydoni / jami maydon" },
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
}

function showView(view) {
  const dashboard = view === "dashboard";
  const waterBalance = view === "water-balance";
  const mapView = view === "map";
  document.querySelector("#dashboard-view").hidden = !dashboard;
  document.querySelector("#water-balance-view").hidden = !waterBalance;
  document.querySelector("#map-view").hidden = !mapView;
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelector("#page-title").textContent = dashboard ? "Umumiy tahlil dashboardi" : waterBalance ? "Tuman suv balansi" : "Dalalar xaritasi va dala pasporti";
  document.querySelector("#page-subtitle").textContent = dashboard ? "Hudud, ekinlar, suv talabi, ob-havo va avtomatik xulosalar" : waterBalance ? "Limit, berilgan suv, ishlatilgan suv va evapotranspiratsiya" : "Poligonni tanlang va dala hisobini batafsil ko‘ring";
  document.querySelector("#reset-view").hidden = !mapView;
  if (dashboard) {
    if (dashboardSummary) document.querySelector("#data-status").textContent = `${fmtInt.format(dashboardSummary.totals.polygons)} poligon · tahlil tayyor`;
  } else if (waterBalance) {
    document.querySelector("#data-status").textContent = districtBalance ? `${districtBalance.district.name} · ${districtBalance.period.days} kun` : "Suv balansi yuklanmoqda…";
  } else if (mapView) {
    initMapPage();
    setTimeout(() => map?.invalidateSize(), 50);
  }
}

function styleFor(feature) {
  const meta = getMeta(feature.properties.demo_norm_status);
  const metric = document.querySelector("#map-metric")?.value || "water";
  const fillColor = metric === "water" && districtBalance ? WATER_STATUS_META[fieldWaterAnalysis(feature.properties).key].color : MAP_STATUS_COLORS[feature.properties.demo_norm_status] || meta.color;
  return { color: "#ffffff", weight: 1.45, opacity: 1, fillColor, fillOpacity: feature.properties.demo_norm_status === "demo_ready_observed" ? .76 : .72 };
}

function popupHtml(properties) {
  const meta = getMeta(properties.demo_norm_status);
  const water = districtBalance ? fieldWaterAnalysis(properties) : null;
  const waterLine = water ? `<p class="popup-line" style="color:${WATER_STATUS_META[water.key].color}">${WATER_STATUS_META[water.key].label} · ${fmtInt.format(water.coverage * 100)}%</p>` : "";
  return `<h3 class="popup-title">${escapeHtml(text(properties.crop_mvp, "Ekin ko‘rsatilmagan"))}</h3><p class="popup-line">Maydon: <strong>${fmtDec.format(number(properties.maydoni))} ga</strong></p><p class="popup-line">GMR: <strong>${escapeHtml(text(properties.gmr_mvp))}</strong> · Zona: <strong>${escapeHtml(text(properties.irrigation_zone))}</strong></p>${waterLine}<p class="popup-line" style="color:${meta.color}">${meta.label}</p>`;
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
  document.querySelector("#map-hint").textContent = features.length === 0 ? "Tanlangan filtrlarga mos poligon topilmadi." : visible.length === features.length ? `${fmtInt.format(visible.length)} poligon ko‘rinmoqda — pasport uchun ustiga bosing` : `${fmtInt.format(visible.length)} / ${fmtInt.format(features.length)} poligon xaritada. Aniq dalani qidiring yoki filtrlang.`;
  document.querySelector("#data-status").textContent = `${fmtInt.format(fullData.features.length)} poligon · xaritada ${fmtInt.format(visible.length)}`;
}

function sourceLabel(value) { return value === "observed" ? "manba" : "yaqin dala taxmini"; }

function fieldWeatherCalculation(properties) {
  if (!currentWeather) return null;
  const weather = weatherStats(currentWeather);
  const kc = CROP_COEFFICIENT[properties.crop_group_mvp] || 1;
  const groundwaterFactor = GROUNDWATER_FACTOR[properties.gmr_mvp] ?? .08;
  const cropEt = weather.et0 * kc;
  const groundwaterMm = cropEt * groundwaterFactor;
  const netMm = Math.max(cropEt - weather.rain - groundwaterMm, 0);
  const waterM3 = netMm * number(properties.maydoni) * 10;
  return { ...weather, kc, groundwaterFactor, cropEt, groundwaterMm, netMm, waterM3 };
}

function selectField(feature, layer) {
  if (splitState.active) return;
  const nextId = feature.properties.field_id || feature.properties.feature_id;
  const splitParentId = splitState.parent?.properties?.field_id || splitState.parent?.properties?.feature_id;
  if (splitState.parts.length && nextId !== splitParentId) cancelSplit();
  const p = feature.properties;
  if (selectedLayer && selectedLayer !== layer) geoLayer.resetStyle(selectedLayer);
  selectedLayer = layer;
  selectedFeature = feature;
  layer.setStyle({ weight: 4, color: "#fff200", fillOpacity: .92 });
  document.querySelector("#field-empty").hidden = true;
  document.querySelector("#field-details").hidden = false;
  document.querySelector("#field-title").textContent = `Dala ${String(p.field_id || p.feature_id).slice(0, 8)}`;
  const meta = getMeta(p.demo_norm_status);
  const status = document.querySelector("#field-status"); status.textContent = meta.label; status.className = `status-pill ${meta.className}`;
  document.querySelector("#field-confidence").textContent = text(p.zone_confidence, "0");
  document.querySelector("#confidence-ring").style.setProperty("--ring", number(p.zone_confidence));
  document.querySelector("#field-zone").textContent = p.irrigation_zone === "boz" ? "Bo‘z mintaqasi" : p.irrigation_zone === "chol" ? "Cho‘l mintaqasi" : "Aniqlanmagan";
  document.querySelector("#field-zone-note").textContent = p.zone_status === "exclusive_gmr" ? "GMR bo‘yicha aniqlangan" : `Hududiy taxmin · ${fmtInt.format(number(p.zone_distance_m))} m`;
  document.querySelector("#field-crop").textContent = `${text(p.crop_mvp, "Ko‘rsatilmagan")} · ${sourceLabel(p.crop_mvp_source)}`;
  document.querySelector("#field-area").textContent = `${fmtDec.format(number(p.maydoni))} ga`;
  document.querySelector("#field-gmr").textContent = `${text(p.gmr_mvp, "Yo‘q")} · ${sourceLabel(p.gmr_mvp_source)}`;
  document.querySelector("#field-bonitet").textContent = text(p.bonitet, "Yo‘q");
  document.querySelector("#field-water").textContent = p.planned_water_m3_mvp ? fmtInt.format(p.planned_water_m3_mvp) : "—";
  document.querySelector("#field-norm").textContent = p.norm_m3ha_mvp ? `${fmtInt.format(p.norm_m3ha_mvp)} m³/ga` : "—";
  document.querySelector("#field-count").textContent = text(p.irrigation_count_mvp);
  document.querySelector("#field-window").textContent = p.irrigation_start_mvp ? `${p.irrigation_start_mvp} — ${p.irrigation_end_mvp}` : "—";
  document.querySelector("#field-norm-status").textContent = meta.label;
  document.querySelector("#field-season-formula").textContent = `${fmtDec.format(number(p.maydoni))} ga × ${fmtInt.format(number(p.norm_m3ha_mvp))} m³/ga = ${fmtInt.format(number(p.planned_water_m3_mvp))} m³`;

  const analysis = fieldWeatherCalculation(p);
  if (analysis) {
    document.querySelector("#field-seven-day-water").textContent = fmtInt.format(analysis.waterM3);
    document.querySelector("#field-weather-formula").textContent = `max(ET0 ${fmtDec.format(analysis.et0)} × Kc ${analysis.kc} − yog‘in ${fmtDec.format(analysis.rain)} − sizot taxmini ${fmtDec.format(analysis.groundwaterMm)}, 0) × ${fmtDec.format(number(p.maydoni))} ga × 10`;
    document.querySelector("#field-conclusion").textContent = analysis.netMm > 30 ? `7 kunlik sof talab ${fmtDec.format(analysis.netMm)} mm. Issiq va quruq sharoit sabab dala kuzatuvi hamda sug‘orish navbatini yaqinlashtirish kerak.` : `7 kunlik sof talab ${fmtDec.format(analysis.netMm)} mm. Reja dala namligi bilan tekshirilgach tasdiqlanadi.`;
  } else {
    document.querySelector("#field-seven-day-water").textContent = "—";
    document.querySelector("#field-weather-formula").textContent = "Open-Meteo ma’lumoti kutilmoqda";
    document.querySelector("#field-conclusion").textContent = "Ob-havo ma’lumoti kelgach 7 kunlik baho hisoblanadi.";
  }
  document.querySelector("#field-note").textContent = p.demo_norm_status === "demo_ready_observed" ? "Ekin, GMR va zona manba ma’lumotidan olingan. Mavsumiy ko‘rsatkich normativ hisob, amaldagi sarf emas." : `Ekin — ${sourceLabel(p.crop_mvp_source)}; GMR — ${sourceLabel(p.gmr_mvp_source)}; zona — taxminiy. Real dala ma’lumoti bilan tasdiqlash talab etiladi.`;
  renderFieldDecision(p);
}

function populateCropFilter(features) {
  const select = document.querySelector("#crop-filter");
  const crops = [...new Set(features.map((feature) => feature.properties.crop_mvp).filter(Boolean))].sort();
  for (const crop of crops) { const option = document.createElement("option"); option.value = crop; option.textContent = crop; select.append(option); }
}

function populateGmrFilter(features) {
  const select = document.querySelector("#gmr-filter");
  const values = [...new Set(features.map((feature) => feature.properties.gmr_mvp).filter(Boolean))].sort();
  for (const value of values) { const option = document.createElement("option"); option.value = value; option.textContent = `GMR ${value}`; select.append(option); }
}

function areaMatches(value, area) {
  if (value === "under1") return area < 1;
  if (value === "1to5") return area >= 1 && area < 5;
  if (value === "5to20") return area >= 5 && area < 20;
  if (value === "over20") return area >= 20;
  return true;
}

function confidenceMatches(value, confidence) {
  if (value === "high") return confidence >= 80;
  if (value === "medium") return confidence >= 50 && confidence < 80;
  if (value === "low") return confidence < 50;
  return true;
}

function applyFilters() {
  if (!fullData) return;
  if (splitState.active || splitState.parts.length) cancelSplit();
  const query = document.querySelector("#field-search").value.trim().toLowerCase();
  const crop = document.querySelector("#crop-filter").value;
  const status = document.querySelector("#status-filter").value;
  const zone = document.querySelector("#zone-filter").value;
  const gmr = document.querySelector("#gmr-filter").value;
  const area = document.querySelector("#area-filter").value;
  const confidence = document.querySelector("#confidence-filter").value;
  const waterStatus = document.querySelector("#water-filter").value;
  const filtered = fullData.features.filter((feature) => {
    const p = feature.properties;
    const searchable = `${p.field_id || ""} ${p.feature_id || ""} ${p.crop_mvp || ""}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (crop === "all" || p.crop_mvp === crop)
      && (status === "all" || p.demo_norm_status === status)
      && (zone === "all" || p.irrigation_zone === zone)
      && (gmr === "all" || p.gmr_mvp === gmr)
      && areaMatches(area, number(p.maydoni))
      && confidenceMatches(confidence, number(p.zone_confidence))
      && (waterStatus === "all" || fieldWaterAnalysis(p).key === waterStatus);
  });
  renderMapView(filtered);
}

function resetFilters() {
  document.querySelector("#field-search").value = "";
  ["crop-filter", "status-filter", "zone-filter", "gmr-filter", "area-filter", "confidence-filter", "water-filter"].forEach((id) => { document.querySelector(`#${id}`).value = "all"; });
  applyFilters();
}

function updateMapMetric() {
  if (!geoLayer) return;
  const water = document.querySelector("#map-metric").value === "water";
  document.querySelector("#map-legend").innerHTML = water ? `<span><i class="legend-dot water-good"></i> Yetarli</span><span><i class="legend-dot water-limited"></i> Cheklangan</span><span><i class="legend-dot water-short"></i> Tanqis</span><span><i class="legend-dot water-severe"></i> Jiddiy tanqis</span>` : `<span><i class="legend-dot ready"></i> Manba asosida</span><span><i class="legend-dot provisional"></i> Taxminiy</span><span><i class="legend-dot incomplete"></i> Norma yo‘q</span>`;
  geoLayer.setStyle(styleFor);
}

function initMapPage() {
  if (mapPromise) return mapPromise;
  mapPromise = (async () => {
    map = L.map("map", { zoomControl: false, preferCanvas: true }).setView([38.86,65.42], 10);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    const imagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri, Maxar, Earthstar Geographics and the GIS User Community" });
    const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" });
    imagery.addTo(map);
    L.control.layers({ "ArcGIS World Imagery": imagery, "Oddiy xarita": street }, null, { position: "topright", collapsed: false }).addTo(map);
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`GeoJSON yuklanmadi: ${response.status}`);
      fullData = await response.json();
      populateCropFilter(fullData.features);
      populateGmrFilter(fullData.features);
      document.querySelector("#map-loading").hidden = true;
      renderMapView(fullData.features);
      const bounds = geoLayer.getBounds(); if (bounds.isValid()) map.fitBounds(bounds.pad(.05));
      ["field-search", "crop-filter", "status-filter", "zone-filter", "gmr-filter", "area-filter", "confidence-filter", "water-filter"].forEach((id) => document.querySelector(`#${id}`).addEventListener("input", applyFilters));
      document.querySelector("#map-metric").addEventListener("input", updateMapMetric);
      document.querySelector("#filter-reset").addEventListener("click", resetFilters);
    } catch (error) {
      document.querySelector("#map-loading").innerHTML = `<p><strong>Ma’lumot yuklanmadi.</strong><br>${escapeHtml(error.message)}</p>`;
      console.error(error);
    }
  })();
  return mapPromise;
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
document.querySelector("#cancel-split").addEventListener("click", () => cancelSplit());
document.querySelector("#export-split").addEventListener("click", exportSplitGeoJSON);
const initialView = new URLSearchParams(window.location.search).get("view");
if (initialView === "map" || initialView === "water-balance") showView(initialView);
loadSummary();
loadWeather();
loadDistrictBalance();
loadIrrigationRules();
