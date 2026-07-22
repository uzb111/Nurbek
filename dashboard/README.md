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

Tm kod nomlari taxmin emas, FileGDB coded-value domenidan olinadi: 1 qumoqli,
2 yengil qumoqli, 3 o‘rta qumoqli, 4 og‘ir qumoqli, 5 qumli, 6 loyli,
7 20 sm dan keyin shag‘alli o‘rta qumoqli, 8 og‘ir va o‘rta qumoqli.

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

## Tavsiya boshqaruvi

`Tavsiya` tugmasi ikki holatli: birinchi bosishda hisoblangan ekinlar xaritaga
kiritiladi, ikkinchi bosishda faqat tizim tavsiyalari olib tashlanadi. Qo‘lda
kiritilgan ekinlar saqlanadi.

Tugma oldidagi tanlovda bitta ekin belgilansa, tizim shu ekin uchun umumiy,
uch qatlamli Tm va tuproq ballari bo‘yicha mos keladigan dalalarnigina to‘ldiradi.
Qolgan dalalar bo‘sh qoladi. `Barcha ekinlar` tanlovi esa olti ekin bo‘yicha
umumiy joylashtirish algoritmini ishga tushiradi.
