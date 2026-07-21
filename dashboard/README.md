# AgroTahlil dashboard

Rahbariyat uchun interfeys uch qismga ajratilgan:

1. **Umumiy dashboard** — xaritasiz, tez ochiladigan KPI, diagramma, Open-Meteo
   ob-havosi va 20 ta avtomatik xulosa.
2. **Tuman suv balansi** — limit, amalda berilgan, dalalarda ishlatilgan suv,
   ET sarfi, tarmoq yo‘qotishi va defitsit. Limit va sarf qiymatlari ekranda
   tahrirlanadi.
3. **Dalalar xaritasi** — GeoJSON xaritasi, qidiruv, filtr, dala pasporti,
   mavsumiy formula va 7 kunlik hisob.

## Ishga tushirish

```powershell
node .\dashboard\server.mjs
```

Brauzerda: <http://127.0.0.1:5173/dashboard/>

## Ma’lumotlarni yangilash

Dashboard agregatini qayta qurish:

```powershell
node .\build_dashboard_summary.mjs
```

Open-Meteo zaxira nusxasini yangilash:

```powershell
node .\fetch_open_meteo_weather.mjs
```

Tuman mavsumiy suv balansini Open-Meteo tarixiy ET0 bilan yangilash:

```powershell
node .\build_district_water_balance.mjs
```

Jonli ob-havo lokal serverdagi `/api/open-meteo` yo‘li orqali olinadi. Internet
uzilsa, `mvp_data/open_meteo_weather.json` zaxira nusxasi ishlaydi.

Mavsumiy suv: `maydon × PNG jadvalidagi norma`. Qisqa muddatli hisob:
`max(ET0 × Kc − yog‘in − sizot hissasi taxmini, 0) × maydon × 10`.

`1 mm × 1 ga = 10 m³`. Ekin koeffitsiyenti va sizot hissasi hozircha taxminiy;
Open-Meteo ob-havosi esa real API javobidir.
