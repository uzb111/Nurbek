# Smart Agriculture MVP — product, data va texnik roadmap

> Eslatma: bu dastlabki reja tarixiy qarorlarni ham saqlaydi. Bo‘z/cho‘l zona-proksi talabi 2026-07-22 auditida bekor qilingan; amaldagi formula `FORMULA_ALGORITHM_AUDIT.md` faylida.

## 1. MVPning bitta aniq va’dasi

Foydalanuvchi xaritada dalani tanlaydi va tizim quyidagilarni tushunarli
ko‘rsatadi:

1. dala pasporti — ekin, maydon, tuproq, gidromodul rayoni, sug‘orish turi;
2. joriy holat — vegetatsiya, ob-havo, sug‘orish talabi va xavf;
3. “nima ta’sir qilyapti?” — omillar reytingi va ma’lumot ishonchliligi;
4. “nima qilish kerak?” — yaqin 7–14 kun uchun sug‘orish yoki monitoring
   tavsiyasi;
5. ssenariy — hozirgi reja, tavsiya etilgan reja va noqulay ob-havo holatini
   taqqoslash.

MVP **hosildorlikni aniq va kafolatli prognoz qilamiz** deb da’vo qilmaydi.
U “hosildorlik potensiali va agronomik xavf bahosi”ni beradi. Haqiqiy
`tonna/ga` hosildorlik ma’lumotlari yig‘ilgach, keyingi bosqichda ML modeli
qo‘shiladi.

## 2. UX tamoyili va asosiy ekranlar

MVP uchun chap menyu qisqa bo‘lishi kerak:

`Bosh sahifa` · `Dalalar` · `Xarita` · `Tavsiyalar` · `Ma’lumot sifati`

### A. Bosh sahifa — rahbariyat uchun

Asosiy savol: **qayerda muammo bor va qancha maydon ta’sir ostida?**

- KPI: faol dalalar, umumiy maydon, yuqori risk maydoni, yaqin 7 kunlik suv
  talabi, vegetatsiya indeksi;
- xaritada dalalar: yashil — normal, sariq — kuzatuv, qizil — yuqori risk;
- o‘ng tomonda ob-havo, suv ta’minoti va risklar ro‘yxati;
- pastda mavsumiy NDVI va ekinlar tarkibi.

Vizual konsept: [01-executive-dashboard-concept.png](design_concepts/01-executive-dashboard-concept.png)

### B. Dala pasporti — agronom uchun

Asosiy savol: **ushbu dalada nima sodir bo‘lyapti va nega?**

- tanlangan `field_id` geometriyasi va uning bo‘laklari;
- ekin, mavsum, maydon, GMR, tuproq boniteti va sizot suvi;
- NDVI grafigi, yog‘in–ET₀ grafigi, sug‘orish kalendari;
- ma’lumot kelib chiqishi: `observed`, `satellite`, `weather`, `estimated`;
- eng kuchli 3–5 ta cheklovchi omil.

Vizual konsept: [02-field-passport-concept.png](design_concepts/02-field-passport-concept.png)

### C. Ssenariy va tavsiya — qaror uchun

Asosiy savol: **qaysi harakat kamroq xavf va yaxshiroq natija beradi?**

- mavjud reja, tavsiya reja va issiq/quruq ob-havo ssenariysi;
- rejalashtirilgan suv hajmi, xavf balli va potensial o‘zgarishi;
- 14 kunlik harakatlar jadvali;
- omillar hissasi grafigi — lekin u “baholash omili”, “isbotlangan sabab”
  emasligi ochiq yoziladi.

Vizual konsept: [03-scenario-analysis-concept.png](design_concepts/03-scenario-analysis-concept.png)

> Konsept rasmlar vizual yo‘nalish uchungina. Ishlab chiqiladigan interfeysda
> Uzbekcha matn, Qashqadaryo hududi va haqiqiy ma’lumotlar ishlatiladi.

## 3. Tahlil birligi va data modeli

Tizimning biznes birligi — `field_id`; u bir dala ichidagi bir nechta
kesish-poligonlarini birlashtiradi. `feature_id` esa har bir geometriya
bo‘lagining texnik identifikatori bo‘lib qoladi.

| Jadval/qatlam | Granulyarlik | Asosiy maydonlar |
|---|---|---|
| `fields` | geometriya bo‘lagi | `feature_id`, `field_id`, `maydoni`, `crop`, `GMR`, `bonitet` |
| `field_season` | dala × yil × mavsum | ekin, ekish sanasi, reja, yakuniy hosildorlik |
| `weather_daily` | dala × kun | yog‘in, Tmin/Tmax, ET₀, shamol, issiq kunlar |
| `satellite_period` | dala × surat/sana | NDVI, NDWI, bulut foizi, valid piksel ulushi |
| `irrigation_plan` | dala × sug‘orish hodisasi | norma, sana oynasi, m³/ga, rejalashtirilgan m³ |
| `field_score` | dala × sana | risk balli, komponentlar, model versiyasi, confidence |

Har bir keladigan qiymatda quyidagilar bo‘lishi shart:

`value_source`, `source_date`, `method`, `confidence_score`.

## 4. MVP formulalari

### 4.1. Normativ sug‘orish

Rasmlardagi jadval alohida normativ lookup jadvaliga ko‘chiriladi:

`crop_group + GMR + irrigation_zone → irrigations_count, seasonal_norm_m3ha, start_date, end_date`

Hisob:

```text
planned_water_m3 = field_area_ha × seasonal_norm_m3ha
```

`Qovun → Poliz ekinlari` kabi mappinglar alohida `crop_mapping` jadvalida
saqlanadi. Mosligi yo‘q yoki ekin bo‘sh bo‘lsa, tizim norma o‘ylab topmaydi;
`norm_status = unknown` deb ko‘rsatadi.

**Muhim:** III, VI, VII va IX GMR har ikkala normativ zonada uchrashi mumkin.
Shu sababli `irrigation_zone` (`bo‘z` yoki `cho‘l`) majburiy atribut bo‘ladi;
uni mavjud tuproq/zonal poligonidan olish yoki mutaxassis tasdiqlashi kerak.

### 4.2. Suv defitsiti

Kunlik soddalashtirilgan formula:

```text
water_deficit_mm = max(0, ET0_mm - effective_rain_mm - irrigation_mm)
```

MVPda `effective_rain_mm = precipitation_mm × 0.8` boshlang‘ich taxmin sifatida
qo‘llanishi mumkin; bu koeffitsient sozlanadigan va ekranda ko‘rinadigan bo‘ladi.

### 4.3. Vegetatsiya holati

NDVI mutlaq soni emas, shu ekin va mavsum uchun tarixiy/etalon diapazonga nisbatan
baholanadi:

```text
ndvi_score = clamp(0, 100,
  100 × (current_ndvi - ndvi_low_baseline) /
        (ndvi_high_baseline - ndvi_low_baseline))
```

Bulut ko‘p bo‘lsa yoki valid piksel ulushi past bo‘lsa, ball emas, `low_confidence`
holati chiqariladi.

### 4.4. MVP salomatlik/risk balli

Boshlang‘ich versiyada og‘irliklar ekspert tomonidan tasdiqlanadigan, ochiq
rule-based model bo‘ladi:

```text
field_health_score =
  0.25 × soil_score +
  0.25 × irrigation_score +
  0.20 × vegetation_score +
  0.15 × weather_score +
  0.15 × groundwater_score
```

Har bir komponent 0–100 oralig‘ida normallashtiriladi. Agar komponent ma’lumoti
yo‘q bo‘lsa, uning og‘irligi mavjud komponentlarga qayta taqsimlanadi va
`confidence_score` pasayadi. Og‘irliklar kodga qattiq yozilmaydi — admin sozlamasi
yoki versiyalangan konfiguratsiyada turadi.

Bu score hosildorlikning ilmiy sababiy modeli emas; u dala holatini ustuvorlashtirish
uchun tahliliy indikator.

### 4.5. Hosildorlik modeli — keyingi bosqich

Haqiqiy `yield_t_ha` kamida 2–3 mavsumda yetarli dalalar bo‘yicha yig‘ilgach:

1. `field_season` dataset tuziladi;
2. XGBoost/CatBoost regressiya modeli o‘qitiladi;
3. train/test bo‘linishi dala va yil bo‘yicha qilinadi — bitta dalaning bo‘laklari
   ikki tomonga tushmaydi;
4. SHAP orqali omil hissasi tushuntiriladi;
5. model xatosi (MAE/RMSE) va versiyasi ekranda beriladi.

## 5. Ochiq ma’lumotlar integratsiyasi

| Manba | MVP uchun olinadigan qiymat | Chastota |
|---|---|---|
| Open-Meteo / ERA5-Land | yog‘in, harorat, tuproq namligi, ET₀, shamol | kunlik |
| Sentinel-2 / Copernicus | NDVI, NDWI, vegetatsiya trendi, bulut maskasi | 5–10 kun |
| NASA POWER | quyosh radiatsiyasi va meteorologik backup | kunlik |
| FAO WaPOR | ETa, biomassa va suv mahsuldorligi | 10 kunlik/oylik, 2-bosqich |
| SoilGrids | tuproqning qo‘shimcha xususiyatlari | bir martalik boyitish, 2-bosqich |

Manbalar:

- [Open-Meteo Historical API](https://open-meteo.com/en/docs/historical-weather-api)
- [Copernicus Statistical API](https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Statistical.html)
- [NASA POWER Daily API](https://power.larc.nasa.gov/docs/services/api/temporal/daily/)
- [FAO WaPOR](https://www.fao.org/aquastat/en/geospatial-information/wapor/index.html)
- [SoilGrids](https://docs.isric.org/globaldata/soilgrids/SoilGrids_faqs.html)

Har bir kunlik ob-havo qiymati dalaning centroidiga yoki katta dalalar uchun ichki
grid nuqtalariga olinadi. Sentinel statistikasi faqat poligon ichidagi piksellar
bo‘yicha hisoblanadi. API xom javoblari cache qilinadi; frontend APIga bevosita
murojaat qilmaydi.

## 6. Texnik arxitektura

```text
Clean GDB / GeoJSON → import worker → Postgres + PostGIS
Weather / Sentinel jobs → raw cache → feature calculator
                                      ↓
                               scoring service
                                      ↓
                           REST API → web dashboard
```

- GDB — ichki tahlil va ArcGIS ishlari uchun manba.
- GeoJSON — MVP xaritasi uchun qulay; `fields.geojson.gz` hozir 5.4 MB.
- Productionda dalalar uchun PostGIS + vector tiles/PMTiles ishlatiladi; browser
  har safar butun GeoJSONni yuklamaydi.
- Web exportda STIR, kadastr raqami va egasi kabi maxfiy maydonlar chiqmaydi.

Tavsiya etilgan MVP stack: `PostgreSQL + PostGIS`, `Python/FastAPI`, kunlik
integratsiyalar uchun `Python worker`, frontend uchun `React + MapLibre GL`.

## 7. Bosqichlar

### Sprint 0 — data contract va normativ jadval

- `irrigation_zone` manbasini tasdiqlash;
- rasm jadvalini strukturalangan CSV/DB jadvaliga kiritish;
- crop mappingni agronom bilan tasdiqlash;
- `fields`, `field_season`, `weather_daily` sxemasini muzlatish.

**Natija:** bir dala uchun normativ suv hisoblanadi va noaniq joylar ochiq flaglanadi.

### Sprint 1 — xarita va dala pasporti

- web-safe GeoJSON import;
- dala qidiruvi, filterlar, risk ranglari;
- `field_id` bo‘yicha pasport;
- GMR/data-quality flaglarini ko‘rsatish.

**Natija:** rahbariyat xaritadan dalani tanlaydi va uning asosiy profilini ko‘radi.

### Sprint 2 — ob-havo va sun’iy yo‘ldosh

- Open-Meteo tarixiy + prognoz connectori;
- Sentinel-2 NDVI/NDWI statistikasi;
- ma’lumot manbasi va confidence ko‘rsatkichlari;
- ob-havo va NDVI grafiklari.

**Natija:** dala holati vaqt bo‘yicha ko‘rinadi.

### Sprint 3 — suv talabi va risk scoring

- normativ sug‘orish kalendari;
- ET₀/yog‘in asosida defitsit;
- rule-based `field_health_score`;
- 7–14 kunlik tavsiya va ssenariy taqqoslash.

**Natija:** “nima qilish kerak?” savoliga izohli javob chiqadi.

### Sprint 4 — demo tayyorlash va validatsiya

- 10–20 ta namuna dalani agronom bilan tekshirish;
- noto‘g‘ri crop/GMR/zone mappinglarni tuzatish;
- rahbariyat demo ssenariysi va PDF/CSV eksport;
- audit log hamda ma’lumot sifati ekrani.

**Natija:** boshqaruv qarori uchun ko‘rsatiladigan ishonchli MVP.

### Keyingi bosqich — haqiqiy hosildorlik modeli

- hosildorlik, sug‘orishning amaldagi hajmi, o‘g‘it va ekish sanalarini yig‘ish;
- ML modeli va xatolik metrikasi;
- tavsiya natijasini keyingi hosil bilan baholash.

## 8. Hozir tasdiqlanishi kerak bo‘lgan uch qaror

1. `irrigation_zone`ni qaysi manba aniqlaydi: tayyor zonal poligonmi yoki agronom
   tasdiqlagan jadvalmi?
2. MVPda qaysi ekinlar birinchi navbatda ishlaydi: paxta, bug‘doy, beda va
   makkajo‘xori bilan boshlash tavsiya etiladi.
3. Demo uchun 10–20 ta “etalon dala” tanlanadimi? Ular bo‘yicha haqiqiy sug‘orish
   va hosildorlik ma’lumoti olinishi MVPni sezilarli kuchaytiradi.
