// Dependency-free local server. Run: node server.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".geojson": "application/geo+json; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".png": "image/png" };
const weatherUrl = "https://api.open-meteo.com/v1/forecast?latitude=38.86724&longitude=65.41781&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,soil_moisture_3_to_9cm&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration&timezone=Asia%2FTashkent&forecast_days=7";
const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (requestPath === "/api/open-meteo") {
    fetch(weatherUrl)
      .then(async (upstream) => {
        if (!upstream.ok) throw new Error(`Open-Meteo ${upstream.status}`);
        const body = await upstream.text();
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(body);
      })
      .catch((error) => {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: "Open-Meteo unavailable", detail: error.message }));
      });
    return;
  }
  let relative = requestPath === "/" ? "/dashboard/" : requestPath;
  if (relative.endsWith("/")) relative += "index.html";
  const filePath = path.resolve(workspaceRoot, `.${relative}`);
  if (!filePath.startsWith(workspaceRoot + path.sep)) { response.writeHead(403); response.end("Forbidden"); return; }
  const useGzip = path.extname(filePath) === ".geojson" && request.headers["accept-encoding"]?.includes("gzip") && fs.existsSync(`${filePath}.gz`);
  const servedPath = useGzip ? `${filePath}.gz` : filePath;
  fs.readFile(servedPath, (error, data) => {
    if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500); response.end("Not found"); return; }
    const headers = { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" };
    if (useGzip) headers["Content-Encoding"] = "gzip";
    response.writeHead(200, headers);
    response.end(data);
  });
});
server.listen(5173, () => console.log("AgroTahlil MVP: http://localhost:5173/dashboard/"));
