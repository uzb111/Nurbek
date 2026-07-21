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
- `TAHLIL_FORMULALARI.md` — suv balansi, dala holati, ekin tavsiyasi va split
  ssenariysi formulalari.
- `mvp_data/config/` — ekin guruhlari va sug‘orish normativlari konfiguratsiyasi.

## Lokal ishga tushirish

```powershell
node .\dashboard\server.mjs
```

Brauzerda: <http://127.0.0.1:5173/dashboard/>

Dashboard ishlashi uchun `mvp_data/` ostidagi mahalliy GeoJSON va hisoblangan
JSON fayllar talab qilinadi. Ular dala geometriyasi va hosilaviy ma’lumotlarni
o‘z ichiga olgani sababli public GitHub repozitoriyiga kiritilmagan.

## Ma’lumot xavfsizligi

Original FileGDB, dala GeoJSONlari, qayta ishlangan qatlamlar va vaqtinchalik
natijalar `.gitignore` orqali chiqarilgan. Public repozitoriy faqat kod,
metodika va umumiy konfiguratsiyani saqlaydi.
