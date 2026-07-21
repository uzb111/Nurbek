# AgroTahlil

Yer, ekin, sug‘orish normasi, GMR, tuproq boniteti va ob-havo ma’lumotlarini
birlashtirib dala va tuman miqyosida qaror qabul qilishga yordam beruvchi
dashboard hamda ma’lumotlarni tayyorlash skriptlari.

## Tarkibi

- `dashboard/` — umumiy dashboard, tuman suv balansi va dala xaritasi.
- `build_*.mjs`, `fetch_open_meteo_weather.mjs` — agregat, suv balansi va
  Open-Meteo ma’lumotlarini tayyorlash skriptlari.
- `prepare_mvp_data.py`, `build_irrigation_mvp.py`, `build_demo_proxy.py` —
  GIS qatlamlarini tayyorlash va normativ atributlarni biriktirish skriptlari.
- `build_real_project_model.py` — real loyiha uchun yagona dala konturi,
  tahliliy tuproq/GMR bo‘laklari hamda kanal/zovur endpoint QA modelini quradi.
- `build_block_delivery_model.py` — 2026-yilgi `kontur` va `blok` qatlamlarini
  eng katta kesishma orqali bog‘lab, dala uchun bosh kanal–ariq suv yo‘lini va
  real ekinni tayyorlaydi.
- `build_hydraulic_topology.py`, `simulate_hydraulic_delivery.py` — kanal
  kesishmalarining topologiyasi hamda tasdiqlangan etalon dalalar uchun yuqori
  oqim limitlari va yo‘qotishlarini hisoblash poydevori.
- `TAHLIL_FORMULALARI.md` — suv balansi, dala holati, ekin tavsiyasi va split
  ssenariysi formulalari.
- `mvp_data/config/` — ekin guruhlari va sug‘orish normativlari konfiguratsiyasi.

## Lokal ishga tushirish

```powershell
node .\dashboard\server.mjs
```

Brauzerda: <http://127.0.0.1:5173/dashboard/>

Dashboard va GitHub Pages uchun `mvp_data/geojson/fields_demo_mvp.geojson`,
dashboard agregati, suv balansi hamda Open-Meteo zaxira JSONi kiritilgan. Bu
fayllar public sahifadagi barcha poligonlarni ko‘rsatish uchun kerak.

## Ma’lumot xavfsizligi

Original FileGDB, oraliq GIS qatlamlari, boshqa GeoJSONlar va vaqtinchalik
natijalar `.gitignore` orqali chiqarilgan. Public sahifa faqat zarur demo
GeoJSON, kod, metodika va umumiy konfiguratsiyani saqlaydi.
