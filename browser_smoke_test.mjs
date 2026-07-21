import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const port = 9333;
const profile = path.join(os.tmpdir(), `agrotahlil-edge-${process.pid}`);
const browser = spawn(edge, [
  "--headless=new", "--disable-gpu", "--no-sandbox", `--remote-debugging-port=${port}`,
  "--window-size=1600,1000", `--user-data-dir=${profile}`, "http://127.0.0.1:5173/dashboard/?view=map",
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
    if (await evaluate("typeof fullData !== 'undefined' && Boolean(fullData?.features?.length === 10710 && districtBalance && irrigationRules.length && actualEtMetadata && weatherLoadComplete)")) break;
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
      denominator: currentDistrictNeed(),
      sourceTotal,
      officialLimit: Number(document.querySelector("#input-water-limit").value) * 1e6,
      supplied: Number(document.querySelector("#input-water-supplied").value) * 1e6,
      used: Number(document.querySelector("#input-water-used").value) * 1e6,
      realEt: actualEtMetadata.official_period_et_m3,
      periodLabel: document.querySelector("#balance-period").textContent,
    };
  })()`);
  console.log(JSON.stringify({ checkpoint: "recommendation", recommendation }, null, 2));
  if (recommendation.assigned !== 10710 || recommendation.crops.length !== 6) throw new Error("Tavsiya barcha dalaga 6 ekinni joylashtirmadi");
  if (recommendation.denominator.mode !== "dynamic") throw new Error("Tavsiya tugagach tuman talabi dinamik bo‘lmadi");
  if (Math.abs(recommendation.sourceTotal - recommendation.officialLimit) > 1) throw new Error("Dala limit ulushlari rasmiy limitga yig‘ilmadi");
  if (Math.abs(recommendation.supplied - recommendation.officialLimit * .88) > 10000) throw new Error("Boshlang‘ich berilgan suv rasmiy limitning 88% iga teng emas");
  if (Math.abs(recommendation.used - recommendation.supplied * .82) > 10000) throw new Error("Boshlang‘ich ishlatilgan suv berilgan suvning 82% iga teng emas");
  if (!recommendation.periodLabel.includes("2025-04-01") || recommendation.realEt <= 0) throw new Error("Tuman balansi rasmiy davr va real ETga o‘tmadi");

  const routeUi = await evaluate(`(() => {
    const target = fullData.features.find((feature) => feature.properties.water_route && feature.properties.crop_group_mvp && feature.properties.route_depth >= 6);
    let targetLayer = null;
    geoLayer.eachLayer((layer) => { if (layer.feature === target) targetLayer = layer; });
    selectField(target, targetLayer);
    return {
      confidence: document.querySelector("#field-confidence").textContent,
      title: document.querySelector("#route-report-title").textContent,
      subtitle: document.querySelector("#route-report-subtitle").textContent,
      legend: document.querySelector(".route-chart-legend").textContent,
      explanation: document.querySelector("#route-explanation").textContent,
      chartLabel: document.querySelector("#route-chart svg")?.getAttribute("aria-label"),
      chartText: document.querySelector("#route-chart").textContent,
    };
  })()`);
  if (!/^\d{1,3}$/.test(routeUi.confidence)) throw new Error("Zona ishonchliligi halqadan chiqadigan kasr son bo‘lib qoldi");
  if (!routeUi.title.includes("dalaga suv yetadi") || !routeUi.subtitle.includes("tarmoq bo‘g‘ini")) throw new Error("Suv yo‘li sarlavhasi oddiy tilda emas");
  if (!routeUi.legend.includes("Har bo‘g‘indan keyin qolgan suv") || routeUi.chartText.includes("LVL")) throw new Error("Route chart eski LVL terminlaridan tozalanmadi");
  if (!routeUi.explanation.includes("Grafikni qanday o‘qish kerak") || !routeUi.chartLabel) throw new Error("Route chart izohi yoki accessibility yorlig‘i yo‘q");
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
