# Blok asosidagi suv yo‘li modeli

Yangi 2026-yil FileGDBda `kontur` — ekin maydoni, `blok` esa suv taqsimot
hududidir. `blok`ning `LAST_lvl_0` dan `LAST_lvl_9` gacha bo‘lgan atributlari
suv yo‘lini beradi: bosh kanal, undan ajralgan kanal/ariqlar va yakuniy blok.

`build_block_delivery_model.py` har bir kontur uchun blokni eng katta geometriya
kesishmasi bilan tanlaydi. Shuning uchun IDlar mos kelmasa ham yo‘l aniqlanadi.
Natijadagi `field_delivery_units` qatlamida quyidagilar bo‘ladi:

- `delivery_field_id` — doimiy kontur ID;
- `water_route` — tasdiqlangan atributlardagi to‘liq suv zanjiri;
- `block_overlap_pct` va `block_match_status` — bog‘lanish sifati;
- `crop_actual`, `crop_season`, `crop_overlap_pct` — `natija`dan eng katta
  kesishma asosida olingan real ekin;
- `supply_type` — `irrigation` yoki `drainage_or_reuse_unverified`.

Bu qatlam dala qaysi bosh kanaldan va qaysi tarmoqdan suv olishini ko‘rsatadi.
U yuqori oqimdagi dala limitlarini ayirish uchun zarur guruhlash kalitini beradi,
lekin haqiqiy yetib kelgan suv foizi uchun baribir manba sarfi, suv berish
navbati va kanal yo‘qotish koeffitsiyentlari kerak bo‘ladi.
