// Downloads a transparent Open-Meteo weather snapshot for the AgroTahlil MVP.
// Run: node .\fetch_open_meteo_weather.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const point = { latitude: 38.86724, longitude: 65.41781, timezone: "Asia/Tashkent" };
const url = `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,soil_moisture_3_to_9cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=${encodeURIComponent(point.timezone)}&forecast_days=7`;

const response = await fetch(url, { headers: { "user-agent": "AgroTahlil-MVP/1.0" } });
if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status}`);
const weather = await response.json();
const snapshot = {
  source: "Open-Meteo Forecast API",
  fetched_at: new Date().toISOString(),
  scope: "Qashqadaryo MVP field extent central point",
  coordinates: point,
  api_url: url,
  weather,
};
await fs.writeFile(path.join(root, "mvp_data", "open_meteo_weather.json"), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Saved Open-Meteo snapshot: ${snapshot.fetched_at}`);
