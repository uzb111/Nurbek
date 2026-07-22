# AgroTahlil dashboard

Rahbariyat uchun interfeys ikki qismga ajratilgan:

1. **Umumiy tahlil** — xaritasiz, tez ochiladigan suv balansi, Real ET,
   Open-Meteo, bonitet, uch chuqurlikdagi mexanik tarkib, sizot suvi, GMR,
   ekin tavsiyasi hamda kanal-zovur qamrovi.
2. **Dalalar xaritasi** — GeoJSON xaritasi, dala pasporti, ekin kiritish,
   avtomatik tavsiya, split va kanaldan dalagacha suv yo‘li hisoboti.

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

Tuman tuproq, sizot, GMR, ekin tavsiyasi va infratuzilma agregatini qayta qurish:

```powershell
node .\build_district_analytics.mjs
```

Bonitet tuproq poligoni maydoniga vaznlanadi. `Tm1`, `Tm2`, `Tm3` mos ravishda
0–30, 30–100 va 100–200 sm qatlamlardir. Kasbi monitoring nuqtalaridagi 2025
sizot chuqurligi metrdan millimetrga o‘tkaziladi; 15 metrdan katta aniq kiritish
xatolari yig‘ma statistikadan chiqarilib, soni auditda saqlanadi.

Bo‘z/cho‘l zona atributi foydalanuvchi interfeysi va ekin tavsiyasi hisobidan
chiqarilgan. Mexanik tarkib skori uch qatlamdan 50% / 30% / 20% vaznda olinadi.
Bir GMR–ekin uchun PNGda ikki satr uchrasa, suvni kam baholamaslik uchun yuqori
mavsumiy norma konservativ hisob sifatida ishlatiladi.

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
