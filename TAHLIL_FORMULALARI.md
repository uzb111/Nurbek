# AgroTahlil: xulosa va formulalar

> 2026-07-21 auditidan keyingi amaldagi batafsil metodika `FORMULA_ALGORITHM_AUDIT.md` faylida. Quyidagi ayrim umumiy dashboard xulosalari tarixiy/proksi qatlamni tavsiflaydi.

## Ma’lumot maqomi

- **Real API ma’lumoti:** Open-Meteo harorat, yog‘in, ET0, shamol va tuproq
  namligi modeli.
- **Manba ma’lumoti:** GDBdagi dala, maydon, ekin, GMR va bonitet atributlari.
- **Taxminiy ma’lumot:** yetishmagan ekin/GMR/zona, ekin koeffitsiyenti va sizot
  suvining hisobiy hissasi.
- **Normativ ma’lumot:** taqdim etilgan PNG jadvallaridan ko‘chirilgan suv
  normalari.

## Asosiy suv formulalari

Mavsumiy reja:

`W_season = Area_ha × Norm_m3ha`

7 kunlik ekin evapotranspiratsiyasi:

`ETc = ET0 × Kc`

7 kunlik sof suv qatlami:

`Net_mm = max(ETc − Rain_mm − Groundwater_estimate_mm, 0)`

7 kunlik dala hajmi:

`W_7d_m3 = Net_mm × Area_ha × 10`

Bu yerda `1 mm × 1 ga = 10 m³`. `Kc` va sizot hissasi hozircha taxminiy.

## Dashboarddagi 20 xulosa

1. Poligon va mantiqiy dalalar soni — `poligon / unique(field_id)`.
2. Umumiy yer maydoni — `Σ maydon`.
3. Mavsumiy suv rejasi — `Σ(maydon × norma)`.
4. Vaznlangan o‘rtacha norma — `jami suv / jami maydon`.
5. Manba asosidagi hisob ulushi — `manba poligonlari / jami poligon × 100`.
6. Taxminiy hisob ulushi — `taxminiy poligonlar / jami poligon × 100`.
7. Ekin taxmini — ekin bo‘sh bo‘lsa eng yaqin ekinli dala.
8. GMR taxmini — GMR bo‘sh bo‘lsa eng yaqin ma’lum GMR.
9. Sug‘orish zonasi — tasdiqlangan zonaga hududiy yaqinlik.
10. Eng katta suv iste’molchisi — `max(Σ ekin suv hajmi)`.
11. Yetakchi ekinning suv ulushi — `ekin suvi / jami suv × 100`.
12. Hududiy zona balansi — `zona maydoni / jami maydon × 100`.
13. Asosiy GMR guruhi — poligon soni va suv hajmi bo‘yicha maksimum.
14. Bonitet bo‘shliqlari — `bonitet IS NULL yoki bo‘sh`.
15. Juda kichik geometriya — `maydon < 0,1 ga`.
16. Uzoq masofali taxmin xavfi — `proxy masofasi > 500 m`.
17. Suv talabi konsentratsiyasi — eng yuqori 10% poligon suvi / jami suv.
18. Issiqlik xavfi — `7 kunlik Tmax ≥ 40°C`.
19. Iqlim defitsiti — `max(ET0 − yog‘in, 0)`.
20. Taxminiy 7 kunlik talab — `max(ET0×Kc − yog‘in − sizot hissasi, 0) × ga × 10`.

## Dala darajasidagi xulosa

Xaritada poligon tanlanganda mavsumiy suv, formula, Open-Meteo asosidagi 7
kunlik talab va ma’lumot manbasi ko‘rsatiladi. 7 kunlik sof talab 30 mm dan
yuqori bo‘lsa sug‘orish navbatini va dala namligini tezkor tekshirish tavsiya
qilinadi. Bu avtomatik signal bo‘lib, agronom tasdig‘ini almashtirmaydi.

## Tuman suv balansi

Tuman ekrani bir xil davr bo‘yicha quyidagi miqdorlarni solishtiradi:

- `Limit` — hozircha dala normativ talablarining yig‘indisi; rasmiy limit bilan
  almashtiriladigan qiymat.
- `Berilgan suv` — tuman chegarasiga amalda kirgan suv; hozircha limitning 88%
  taxmini.
- `Ishlatilgan suv` — dalalarda foydali ishlatilgan suv; hozircha berilgan
  suvning 82% taxmini.
- `ETc potensial` — Open-Meteo ET0 va oylik ekin Kc egri chizig‘i asosidagi
  evapotranspiratsiya talabi.

Asosiy tenglama:

Real ET mavjud bo‘lsa tuman balansida rasmiy limit bilan bir xil aprel–sentabr oylari olinadi:

`ET_actual = Σ(ET_month_mm × field_area_ha × 10)`

`Deficit = max(ETc_potential − Used_irrigation − Effective_rain − Groundwater, 0)`

`Network_loss = max(Supplied − Used, 0)`

`Unused_limit = max(Limit − Supplied, 0)`

Samarali yog‘in hozircha Open-Meteo yog‘inining 80% qismi, sizot hissasi esa
GMR guruhiga qarab 4–16% oralig‘idagi taxminiy koeffitsiyent bilan olinadi.

## Poligon suv holati

Har bir poligon uchun tuman miqyosidagi foydali suv gektarga taqsimlanadi:

`Available_m3ha = District_used_m3 / District_area_ha`

Poligon ekinining sof mavsumiy talabi:

`Field_net_m3ha = max(ET0×Kc − Effective_rain − Groundwater, 0) × 10`

Ta’minlanganlik:

`Coverage = Available_m3ha / Field_net_m3ha × 100`

- `≥100%` — suv yetarli;
- `85–99%` — suv cheklangan;
- `65–84%` — suv tanqis;
- `<65%` — jiddiy tanqis.

## Ekin tavsiyasi

Har bir zona va GMR uchun PNG normativ jadvalidagi barcha ekinlar solishtiriladi:

`Suitability = 0.45×Water + 0.30×Bonitet + 0.15×Texture + 0.10×Climate`

`Water` — 70% tuman foydali suvi / ekin normasi va 30% tuman foydali suvi / real ET talabi; `Bonitet` — ekin uchun minimal
bonitetga nisbatan baho; `Texture` — Tm1 mexanik tarkib sinfi; `Climate` —
Open-Meteo issiqlik stressi va ekinning issiqqa mosligi.

Ob-havo bonitet ballini bir kunda o‘zgartirmaydi. Bonitet tuproqning nisbatan
barqaror sifat bahosi; qurg‘oqchilik, sho‘rlanish, sizotning ko‘tarilishi va
noto‘g‘ri sug‘orish hosildorlikka darhol, tuproq holatiga esa uzoq muddatda
ta’sir qilishi mumkin. Tavsiya laboratoriya va agronom xulosasini almashtirmaydi.

## Dalani split qilish ssenariysi

Split asl poligonni o‘chirib yubormaydi. Foydalanuvchi xaritada ikki nuqta bilan
kesish chizig‘ini belgilaydi va tizim vaqtinchalik `A` hamda `B` qismlarni
yaratadi. Har bir qismga `parent_field_id`, `split_scenario_id`, `split_part`
va yangi `field_id` yoziladi.

Qismlarning tahliliy maydoni manbadagi dala maydoniga mutanosib saqlanadi:

`Part_area = Parent_area × Geometric_part_area / ΣGeometric_part_area`

Shuning uchun `A_area + B_area = Parent_area`. Asl tuproq/GMR fragmentlari A va B
geometriyasi bilan fazoviy kesiladi; zona, GMR, bonitet, Tm1 va dominant suv yo‘li
har qism uchun avtomatik qayta olinadi. Foydalanuvchi faqat ekinni tanlaydi.
Ekinlar: paxta, beda, makkajo‘xori, sabzavot, poliz va bug‘doy.

Suv normasi faqat `zona + GMR + ekin` kombinatsiyasi PNGdan aniq topilganda
qo‘llanadi:

`Part_water_limit = Part_area × PNG_seasonal_norm_m3ha`

Kombinatsiya jadvalda bo‘lmasa, boshqa qatordan yashirin almashtirish qilinmaydi
va «PNG qoidasi topilmadi» deb ko‘rsatiladi. Ekin o‘zgartirilganda suv limiti,
sug‘orish soni va muddati, ET sof talabi, mavjud suv, suv holati hamda muqobil
ekinlar faqat shu qism uchun qayta hisoblanadi. Natijadagi ikki qismni GeoJSON
ssenariysi sifatida yuklab olish mumkin.
