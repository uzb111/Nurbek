# AgroTahlil: formula va algoritm auditi

Yangilangan sana: 2026-07-21. Ushbu fayl dashboard hisoblarining amaldagi yagona texnik tavsifi hisoblanadi.

## 1. Ma’lumot oqimi

- 13 231 tuproq/GMR fragmenti `field_id` bo‘yicha 10 710 mantiqiy dalaga birlashtirilgan.
- Jami maydon 61 922,1243 ga. Barcha `field_id` qiymatlari unique.
- Har bir merged dala ichida `soil_gmr_components` saqlanadi; komponent maydonlari yig‘indisi dala maydoniga teng.
- 10 554 dalada `blok.LAST_lvl_0 ... LAST_lvl_9` atributlaridan olingan suv yo‘li mavjud.
- 10 563 dala real ET bilan kamida 70% fazoviy moslashgan.
- Rasmiy 2025 vegetatsiya limiti 307 490 000 m³. Oylik yaxlitlangan sonlar 307 500 000 m³ bo‘ladi; hisobda rasmiy jami ustun.

## 2. Dala va tuproq/GMR hisobi

Bir dala bir nechta tuproq/GMR qismidan iborat bo‘lishi mumkin. Ekin tanlanganda har bir qism alohida hisoblanadi:

`Need_component = Area_component_ha × PNG_norm(zone, GMR, crop)`

`Need_field = Σ Need_component`

`Weighted_norm_field = Need_field / Area_field_ha`

PNG jadvalida aynan shu GMR qatori bo‘lmasa, shu zona va ekin ichidagi eng yaqin GMR qatori olinadi. UI buni `yaqin GMR qoidasi` deb belgilaydi; bu taxmin yashirilmaydi.

## 3. Rasmiy limitdan dala ulushi

Ekinlar hali faqat qisman kiritilgan bo‘lsa, maxraj sifatida dastlabki eligible tuman normativ talabi ishlatiladi. Bu bitta qo‘lda to‘ldirilgan dalaga butun tuman limitini berib yubormaslik uchun kerak.

Barcha suv yo‘li mavjud dalalarda ekin/tavsiya hisobi tayyor bo‘lgach maxraj dinamik bo‘ladi:

`District_need = Σ Need_field`

`Source_share_field = Official_limit × Need_field / District_need`

Ekin o‘zgarsa `District_need` qayta hisoblanadi. Ekin vaqtincha tozalansa, oxirgi hisoblangan talab allocation reference sifatida qoladi. Splitda ota dala maxrajdan chiqarilib, A va B qismlar kiritiladi.

## 4. Kanal yo‘li va yetib keladigan suv

Yo‘l chuqurligi — takroriy nomlar olib tashlangandan keyingi `LAST_lvl` zanjiri uzunligi. `LVL` kanalning ierarxik darajasi; u fizik o‘lcham yoki o‘lchangan oqim emas.

Hozirgi yo‘qotish ssenariysi har bir o‘tishda 1,5%:

`Route_loss = 1 − (1 − 0.015)^(Route_depth − 1)`

`Delivered_field = Source_share_field × (1 − Route_loss)`

`Coverage_field = Delivered_field / Need_field × 100%`

Holatlar:

- `≥100%` — suv yetarli;
- `85–99%` — suv cheklangan;
- `65–84%` — suv tanqis;
- `<65%` — jiddiy tanqis.

Line chartdagi yashil chiziq har LVL prefiksida shu yo‘nalishda qoladigan unique dalalar soni. Sariq chiziq shu prefiks ostidagi unique terminal blok/quloqlar soni. Ularning keskin kamayishi suv yo‘qotilishi emas, tarmoqning shoxlanishidir. Ko‘k chiziq esa faqat 1,5%/bosqich ssenariysi bo‘yicha tanlangan dalaga ajratilgan suvning kamayishini ko‘rsatadi.

## 5. Real ET va tuman suv balansi

Dala real ET hajmi:

`ET_field_m3 = Area_weighted_ET_mm × Area_field_ha × 10`

Bu yerda `1 mm × 1 ga = 10 m³`. Dala kartasida mart–oktabr jami ko‘rsatiladi. Tuman balansi rasmiy limit bilan bir xil oylarni solishtirish uchun faqat aprel–sentabr ET qiymatlarini yig‘adi:

`ET_district_AprSep = Σ(ET_month_mm × Area_field_ha × 10)`

Audit natijasi: qamrovi yetarli 10 563 dalada aprel–sentabr real ET jami taxminan 301,157 mln m³.

Samarali yog‘in 2025-04-01 dan 2025-09-30 gacha Open-Meteo tarixiy API ma’lumotidan olinadi:

`Effective_rain_m3 = Rain_mm × 0.80 × Matched_area_ha × 10`

Sizot hissasi hozircha real ET hajmiga GMR koeffitsiyentini maydon bo‘yicha vaznlantirish orqali baholanadi:

`Groundwater_m3 = Σ(ET_component_m3 × GMR_factor)`

`Available_for_ET = Used_irrigation + Effective_rain + Groundwater`

`Deficit = max(Real_ET − Available_for_ET, 0)`

Sizot koeffitsiyenti o‘lchangan qiymat emas. Real monitoring nuqtalari bilan interpolatsiya qilingach almashtirilishi kerak.

## 6. Ekin tavsiyasi

Tizimda 6 ekin bor: Paxta, Beda, Makkajo‘xori, Sabzavot, Poliz va Bug‘doy. Bog‘ tavsiya va qo‘lda tanlashdan chiqarilgan.

Har dala–ekin juftligi uchun:

`Available_m3ha = District_used_m3 / District_area_ha × Route_efficiency`

`Norm_coverage = min(100, Available_m3ha / PNG_norm_m3ha × 100)`

Real ET mavjud bo‘lsa:

`ET_coverage = min(100, Available_m3ha / (Real_ET_mm × 10) × 100)`

`Water_score = 0.70 × Norm_coverage + 0.30 × ET_coverage`

`Suitability = 0.45 × Water_score + 0.30 × Bonitet_score + 0.15 × Texture_score + 0.10 × Climate_score`

Muhim tuzatish: eski kod `Real_ET / norma` nisbatini ball qilgan va ET talabi kattalashgan sari ballni oshirgan. Endi mavjud suv real ET talabiga bo‘linadi.

Barcha dalaga `Tavsiya` bosilganda individual maksimum bilan cheklanilmaydi. Tuman manbasidagi ekin maydoni ulushlari 6 ekinga qayta normallashtiriladi, yuqori balli dala–ekin juftliklari maqsad maydonigacha joylashtiriladi, qolganlari score va target load bilan muvozanatlanadi.

## 7. Split algoritmi

Split ikki nuqta orqali cheksiz kesish chizig‘i hosil qiladi va ota geometriyani Turf bilan A/B qismlarga kesadi:

`Area_part = Area_parent × Geometric_area_part / Σ Geometric_area_parts`

Endi tuproq/GMR tarkibi ota daladagi foizni ikki qismga bir xil ko‘chirmaydi. `field_components.geojson` dagi asl 13 231 fragment A va B geometriyasi bilan fazoviy kesiladi:

`Component_area_part = Area(intersection(Component_geometry, Part_geometry))`

Kesishgan komponent maydonlari dala atribut maydoniga normallashtiriladi. Dominant GMR, Tm1, zona, maydon-vaznli bonitet va dominant suv yo‘li har qism uchun qayta olinadi. Fazoviy qamrov 70% dan past bo‘lsa proportional fallback ishlaydi va statusda alohida belgilanadi.

Split qismda faqat ekin foydalanuvchi tomonidan o‘zgartiriladi; suv normasi, real ET hajmi, limit ulushi, yo‘l yo‘qotishi, suv holati va tavsiya avtomatik qayta hisoblanadi. Split va ekin tanlovi sahifa yangilanganda saqlanmaydi.

## 8. Audit bilan tasdiqlangan va taxminiy qismlar

Tasdiqlangan texnik yaxlitlik:

- unique `field_id`: 10 710/10 710;
- komponent maydoni xatosi: 0;
- route depth xatosi: 0;
- 1,5% route-loss formula xatosi: 0;
- real ET hajmi formula xatosi: 0;
- split manba geometriyasi mavjud dala: 10 710/10 710.

Haqiqiy o‘lchov bo‘lmagan qismlar:

- kanal bo‘yicha 1,5%/bosqich yo‘qotish;
- amalda berilgan suv va dalada ishlatilgan suvning boshlang‘ich 88%/82% qiymatlari;
- GMRga bog‘langan sizot hissasi;
- ekin bonitet minimumlari, Tm1 va issiqlik profillari;
- blok atributidagi yo‘lning haqiqiy oqim yo‘nalishi va suv berish navbati.

Shu sabab `Delivered_field` o‘lchangan suv emas, aniq yozilgan ssenariy natijasidir. Real sarf, zatvor, oqim yo‘nalishi va navbat ma’lumoti kelganda formuladagi taxminiy koeffitsiyentlar almashtiriladi.

## 9. Qayta audit qilish

```powershell
node build_field_components.mjs
node audit_project.mjs
node --check dashboard\app.js
git diff --check
```

`audit_project.mjs` xato topsa exit code `1` qaytaradi.
