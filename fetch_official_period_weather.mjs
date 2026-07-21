import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const apiUrl = "https://archive-api.open-meteo.com/v1/archive?latitude=38.86724&longitude=65.41781&start_date=2025-04-01&end_date=2025-09-30&daily=precipitation_sum,et0_fao_evapotranspiration&timezone=Asia%2FTashkent";
const response = await fetch(apiUrl);
if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
const weather = await response.json();
const payload = {
  source: "Open-Meteo Historical Weather API",
  fetched_at: new Date().toISOString(),
  purpose: "Kasbi 2025 official irrigation-limit period weather",
  api_url: apiUrl,
  weather,
};
const output = path.join(root, "mvp_data", "open_meteo_official_period_2025.json");
fs.writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ output, days: weather.daily?.time?.length || 0 }, null, 2));
