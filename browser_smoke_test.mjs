import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9333;
const profile = path.join(os.tmpdir(), `agrotahlil-edge-${process.pid}`);
const browserWidth = Number(process.env.BROWSER_WIDTH) || 1600;
const browserHeight = Number(process.env.BROWSER_HEIGHT) || 1000;
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`,
  `--window-size=${browserWidth},${browserHeight}`, `--user-data-dir=${profile}`, "http://127.0.0.1:5173/dashboard/?view=map",
], { windowsHide: true, stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
async function endpoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((item) => item.type === "page" && item.url.includes("127.0.0.1:5173"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await delay(250);
  }
  throw new Error("Edge DevTools endpoint ochilmadi");
}

let socket;
let sequence = 0;
const pending = new Map();
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}

try {
  socket = new WebSocket(await endpoint());
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
  };
  await command("Runtime.enable");
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await evaluate("typeof fullData !== 'undefined' && Boolean(fullData?.features?.length === 10710 && districtBalance && districtAnalytics && irrigationRules.length && actualEtMetadata && weatherLoadComplete)")) break;
    if (attempt === 119) throw new Error("Dashboard ma’lumotlari 30 soniyada tayyor bo‘lmadi");
    await delay(250);
  }
  const recommendation = await evaluate(`(() => {
    applyCropRecommendations();
    const routed = fullData.features.filter((feature) => feature.properties.water_route && feature.properties.seasonal_need_m3);
    const sourceTotal = routed.reduce((total, feature) => total + deliveryScenario(feature.properties).sourceShare, 0);
    return {
      assigned: fullData.features.filter((feature) => feature.properties.crop_group_mvp).length,
      crops: [...new Set(fullData.features.map((feature) => feature.properties.crop_group_mvp).filter(Boolean))].sort(),
      cropCounts: Object.fromEntries(PNG_CROP_ORDER.map((group) => [group, fullData.features.filter((feature) => feature.properties.crop_group_mvp === group).length])),
      cropAreas: Object.fromEntries(PNG_CROP_ORDER.map((group) => [group, fullData.features.filter((feature) => feature.properties.crop_group_mvp === group).reduce((total, feature) => total + Number(feature.properties.maydoni || 0), 0)])),
      snapshotCounts: Object.fromEntries(districtAnalytics.recommendation.crops.map((item) => [item.group, item.fields])),
      snapshotAreas: Object.fromEntries(districtAnalytics.recommendation.crops.map((item) => [item.group, item.area_ha])),
      textureDomain: TEXTURE_LABELS,
      denominator: currentDistrictNeed(),
      sourceTotal,
      officialLimit: Number(document.querySelector("#input-water-limit").value) * 1e6,
      supplied: Number(document.querySelector("#input-water-supplied").value) * 1e6,
      used: Number(document.querySelector("#input-water-used").value) * 1e6,
      realEt: actualEtMetadata.official_period_et_m3,
      periodLabel: document.querySelector("#balance-period").textContent,
      assignmentLabel: document.querySelector("#district-assignment-label").textContent,
      recommendationAtTop: Boolean(document.querySelector(".concept-main-grid .recommendation-primary-card")),
      waterBalanceBelow: Boolean(document.querySelector(".district-intelligence .intelligence-water-card #premium-water-chart")),
      districtAnalytics: {
        bonitet: document.querySelector("#district-bonitet-average").textContent,
        soilLayers: document.querySelectorAll("#district-soil-profile .soil-depth-row").length,
        groundwater: document.querySelector("#district-groundwater-average").textContent,
        gmrRows: document.querySelectorAll("#district-gmr-distribution > div").length,
        recommendationRows: document.querySelectorAll("#district-recommendation-bars > div").length,
        canalCount: document.querySelector("#district-canal-count").textContent,
      },
    };
  })()`);
  console.log(JSON.stringify({ checkpoint: "recommendation", recommendation }, null, 2));
  if (recommendation.assigned !== 10710 || recommendation.crops.length !== 6) throw new Error("Tavsiya barcha dalaga 6 ekinni joylashtirmadi");
  if (recommendation.textureDomain[1] !== "qumoqli" || recommendation.textureDomain[5] !== "qumli" || recommendation.textureDomain[8] !== "og‘ir va o‘rta qumoqli") throw new Error("Tm coded-value nomlari FileGDB domeniga mos emas");
  for (const group of recommendation.crops) {
    if (recommendation.cropCounts[group] !== recommendation.snapshotCounts[group] || Math.abs(recommendation.cropAreas[group] - recommendation.snapshotAreas[group]) > .11) throw new Error(`${group} tavsiya snapshoti joriy algoritmga mos emas`);
  }
  if (recommendation.cropAreas.alfalfa > 5.000001) throw new Error(`Beda tavsiyasi 5 ga limitdan oshdi: ${recommendation.cropAreas.alfalfa}`);
  if (recommendation.assignmentLabel.replace(/\D/g, "") !== "1071010710" || recommendation.districtAnalytics.soilLayers !== 3 || recommendation.districtAnalytics.gmrRows !== 7 || recommendation.districtAnalytics.recommendationRows !== 6) throw new Error("Tuman analitikasi yoki ekin kiritilganlik holati to‘liq render bo‘lmadi");
  if (!recommendation.recommendationAtTop || !recommendation.waterBalanceBelow) throw new Error("Ekin tavsiyasi yuqoriga yoki suv balansi pastki tahlilga ko‘chmadi");
  if (recommendation.denominator.mode !== "dynamic") throw new Error("Tavsiya tugagach tuman talabi dinamik bo‘lmadi");
  if (Math.abs(recommendation.sourceTotal - recommendation.officialLimit) > 1) throw new Error("Dala limit ulushlari rasmiy limitga yig‘ilmadi");
  if (Math.abs(recommendation.supplied - recommendation.officialLimit * .88) > 10000) throw new Error("Boshlang‘ich berilgan suv rasmiy limitning 88% iga teng emas");
  if (Math.abs(recommendation.used - recommendation.supplied * .82) > 10000) throw new Error("Boshlang‘ich ishlatilgan suv berilgan suvning 82% iga teng emas");
  if (!recommendation.periodLabel.includes("2025-04-01") || recommendation.realEt <= 0) throw new Error("Tuman balansi rasmiy davr va real ETga o‘tmadi");
  if (process.env.CAPTURE_DASHBOARD_UI) {
    await evaluate(`(() => { showView("dashboard"); window.scrollTo(0, 0); })()`);
    await delay(500);
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), `agrotahlil-dashboard-${browserWidth}.png`);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log(JSON.stringify({ dashboardScreenshot: screenshotPath }, null, 2));
    await evaluate(`showView("map")`);
    await delay(250);
  }

  const recommendationToggle = await evaluate(`(() => {
    const button = document.querySelector("#recommend-crops");
    const filter = document.querySelector("#recommend-crop-filter");
    const initialActive = button.classList.contains("is-active") && document.querySelector("#recommend-crops-label").textContent.includes("o‘chirish");
    applyCropRecommendations();
    const cleared = fullData.features.filter((feature) => feature.properties.crop_group_mvp).length;
    filter.value = "cotton";
    applyCropRecommendations();
    const filteredFeatures = fullData.features.filter((feature) => feature.properties.crop_group_mvp);
    const filtered = {
      assigned: filteredFeatures.length,
      blank: fullData.features.length - filteredFeatures.length,
      groups: [...new Set(filteredFeatures.map((feature) => feature.properties.crop_group_mvp))],
      area: filteredFeatures.reduce((total, feature) => total + Number(feature.properties.maydoni || 0), 0),
      active: button.classList.contains("is-active"),
      hint: document.querySelector("#map-hint").textContent,
    };
    applyCropRecommendations();
    const secondClear = fullData.features.filter((feature) => feature.properties.crop_group_mvp).length;
    filter.value = "";
    applyCropRecommendations();
    return {
      initialActive, cleared, filtered, secondClear,
      restored: fullData.features.filter((feature) => feature.properties.crop_group_mvp).length,
      restoredActive: button.classList.contains("is-active"),
      removedDashboardTitle: !document.body.textContent.includes("Yer, tuproq va ekin salohiyati"),
    };
  })()`);
  if (!recommendationToggle.initialActive || recommendationToggle.cleared !== 0 || recommendationToggle.secondClear !== 0 || recommendationToggle.restored !== 10710 || !recommendationToggle.restoredActive) throw new Error("Tavsiya enable/disable sikli ishlamadi");
  if (recommendationToggle.filtered.assigned <= 0 || recommendationToggle.filtered.blank <= 0 || recommendationToggle.filtered.groups.join() !== "cotton" || !recommendationToggle.filtered.active || !recommendationToggle.filtered.hint.includes("Qolgan dalalar bo‘sh")) throw new Error("Bitta ekin bo‘yicha tavsiya faqat mos dalalarni ajratmadi");
  if (!recommendationToggle.removedDashboardTitle) throw new Error("Dashboarddagi olib tashlanishi kerak bo‘lgan salohiyat sarlavhasi qolgan");
  if (process.env.CAPTURE_MAP_UI) {
    await evaluate(`document.querySelector(".map-card").scrollIntoView({ block: "start" })`);
    await delay(400);
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), `agrotahlil-map-${browserWidth}.png`);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log(JSON.stringify({ mapScreenshot: screenshotPath }, null, 2));
  }

  const routeUi = await evaluate(`(() => {
    const target = fullData.features.find((feature) => feature.properties.water_route && feature.properties.crop_group_mvp && feature.properties.route_depth >= 6);
    let targetLayer = null;
    geoLayer.eachLayer((layer) => { if (layer.feature === target) targetLayer = layer; });
    selectField(target, targetLayer);
    return {
      soilProfileSummary: document.querySelector("#field-soil-profile-summary").textContent,
      tmScore: document.querySelector("#field-tm-score").textContent,
      tmTitle: document.querySelector("#field-soil-dominant").textContent,
      expectedTmScore: String(Math.round(tmCandidateForField(target.properties).mechanicalScore)),
      fieldRecommendationRemoved: !document.querySelector(".crop-recommendation") && !document.querySelector("#field-note"),
      title: document.querySelector("#route-report-title").textContent,
      subtitle: document.querySelector("#route-report-subtitle").textContent,
      legend: document.querySelector(".route-chart-legend").textContent,
      explanation: document.querySelector("#route-explanation").textContent,
      chartLabel: document.querySelector("#route-chart svg")?.getAttribute("aria-label"),
      chartText: document.querySelector("#route-chart").textContent,
      popup: popupHtml(target.properties),
    };
  })()`);
  if (!routeUi.soilProfileSummary.includes("0–30 sm") || !routeUi.soilProfileSummary.includes("100–200 sm") || !routeUi.soilProfileSummary.includes("sizot")) throw new Error("Dala pasportida uch qatlamli tuproq profili yoki sizot ko‘rinmadi");
  if (routeUi.tmScore !== routeUi.expectedTmScore || !routeUi.tmTitle.includes("uchun Tm mosligi") || routeUi.tmScore === "0–200") throw new Error("Dala pasportidagi dinamik Tm moslik balli ishlamadi");
  if (!routeUi.fieldRecommendationRemoved) throw new Error("Dala pasportidagi takroriy ekin tavsiyasi olib tashlanmadi");
  const tmDynamics = await evaluate(`(() => {
    const originalFeature = selectedFeature, originalLayer = selectedLayer;
    const originalScore = document.querySelector("#field-tm-score").textContent;
    const alternate = fullData.features.find((feature) => {
      const candidate = tmCandidateForField(feature.properties);
      return candidate && String(Math.round(candidate.mechanicalScore)) !== originalScore;
    });
    let alternateLayer = null;
    geoLayer.eachLayer((layer) => { if (layer.feature === alternate) alternateLayer = layer; });
    if (alternate && alternateLayer) selectField(alternate, alternateLayer);
    const alternateScore = document.querySelector("#field-tm-score").textContent;
    if (originalFeature && originalLayer) selectField(originalFeature, originalLayer);
    return { found: Boolean(alternate && alternateLayer), originalScore, alternateScore };
  })()`);
  if (!tmDynamics.found || tmDynamics.originalScore === tmDynamics.alternateScore) throw new Error("Dala almashtirilganda Tm moslik balli yangilanmadi");
  if (!routeUi.title.includes("dalaga suv yetadi") || !routeUi.subtitle.includes("tarmoq bo‘g‘ini")) throw new Error("Suv yo‘li sarlavhasi oddiy tilda emas");
  if (!routeUi.legend.includes("Har bo‘g‘indan keyin qolgan suv") || routeUi.chartText.includes("LVL")) throw new Error("Route chart eski LVL terminlaridan tozalanmadi");
  if (!routeUi.explanation.includes("Grafikni qanday o‘qish kerak") || !routeUi.chartLabel) throw new Error("Route chart izohi yoki accessibility yorlig‘i yo‘q");
  if (!routeUi.popup.includes("Bonitet:") || !routeUi.popup.includes("Tm1 · 0–30 sm") || !routeUi.popup.includes("Tm2 · 30–100 sm") || !routeUi.popup.includes("Tm3 · 100–200 sm") || !routeUi.popup.includes("mexanik moslik") || !routeUi.popup.includes("15 balli") || !routeUi.popup.includes("45% suv") || !routeUi.popup.includes("/100") || routeUi.popup.includes("Zona:") || /kod\s+[1-8]/i.test(routeUi.popup)) throw new Error("Dala popupidagi Tm matni, uch qatlam bahosi yoki yakuniy formula noto‘g‘ri");
  if (process.env.CAPTURE_TM_POPUP) {
    await evaluate(`(() => { let layer = null; geoLayer.eachLayer((item) => { if (item.feature === selectedFeature) layer = item; }); layer?.openPopup(); document.querySelector("#map").scrollIntoView({ block: "center" }); })()`);
    await delay(500);
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), "agrotahlil-tm-popup.png");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log(JSON.stringify({ tmPopupScreenshot: screenshotPath }, null, 2));
  }
  const layerControlUi = await evaluate(`(async () => {
    const control = document.querySelector(".leaflet-control-layers");
    const initiallyCollapsed = !control.classList.contains("leaflet-control-layers-expanded");
    layerControl.expand();
    const didExpand = control.classList.contains("leaflet-control-layers-expanded");
    map.fire("baselayerchange", { layer: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { initiallyCollapsed, didExpand, collapsedAfterSelection: !control.classList.contains("leaflet-control-layers-expanded") };
  })()`);
  if (!layerControlUi.initiallyCollapsed || !layerControlUi.didExpand || !layerControlUi.collapsedAfterSelection) throw new Error("Xarita qatlamlari tugmasi yopilish siklidan o‘tmadi");
  if (process.env.CAPTURE_ROUTE_UI) {
    await evaluate(`document.querySelector("#route-report").scrollIntoView({ block: "start" })`);
    await delay(500);
    const screenshot = await command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const screenshotPath = path.join(os.tmpdir(), "agrotahlil-route-report.png");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    console.log(JSON.stringify({ routeScreenshot: screenshotPath }, null, 2));
  }

  const split = await evaluate(`(async () => {
    const target = fullData.features.find((feature) => feature.properties.soil_gmr_components?.length > 1 && feature.properties.maydoni > 2);
    let targetLayer = null;
    geoLayer.eachLayer((layer) => { if (layer.feature === target) targetLayer = layer; });
    selectField(target, targetLayer);
    await startSplitMode();
    const bounds = turf.bbox(target);
    const middleLatitude = (bounds[1] + bounds[3]) / 2;
    splitState.points = [L.latLng(middleLatitude, bounds[0] - .01), L.latLng(middleLatitude, bounds[2] + .01)];
    createSplitParts();
    const result = {
      count: splitState.parts.length,
      parentArea: target.properties.maydoni,
      partArea: splitState.parts.reduce((total, feature) => total + feature.properties.maydoni, 0),
      statuses: splitState.parts.map((feature) => feature.properties.split_component_status),
      coverages: splitState.parts.map((feature) => feature.properties.split_component_coverage_pct),
      componentAreaDelta: splitState.parts.map((feature) => Math.abs(feature.properties.maydoni - feature.properties.soil_gmr_components.reduce((total, component) => total + component.area_ha, 0))),
    };
    selectField(splitState.parts[0], splitLayerForField(splitState.parts[0].properties.field_id));
    cancelSplit();
    result.cancelRestoredParent = selectedFeature === target;
    return result;
  })()`);
  if (split.count !== 2 || Math.abs(split.parentArea - split.partArea) > 1e-6) throw new Error("Split maydon balansi buzildi");
  if (split.statuses.some((status) => status !== "spatial_intersection")) throw new Error("Split asl komponentlarni fazoviy kesmadi");
  if (split.componentAreaDelta.some((delta) => delta > 1e-6)) throw new Error("Split komponent maydoni qism maydoniga teng emas");
  if (!split.cancelRestoredParent) throw new Error("Split bekor qilinganda ota dala tanlovi tiklanmadi");
  console.log(JSON.stringify({ status: "passed", recommendation, split }, null, 2));
} finally {
  socket?.close();
  browser.kill();
}
