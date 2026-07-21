# Kanal orqali dala suv ta’minoti metodikasi

## Maqsad

Har bir dala uchun qaysi bosh kanaldan, qaysi ariq zanjiri orqali suv kelishi,
undan oldingi dalalarning talab va yo‘qotishlaridan keyin qancha suv yetishi
aniqlanadi. Natija quyidagilarni beradi: manba, yo‘l, yuqori oqimdagi dalalar,
yo‘qotilgan hajm, dala kirishidagi taxminiy suv va qoplanish foizi.

## Hozir avtomatik tayyorlanadigan qism

`build_hydraulic_topology.py` kanal chiziqlarini barcha kesishmalarida
segmentlaydi. `network_edges` — segmentlar, `network_nodes` — tugunlar,
`field_intake_candidates` esa dalaga eng yaqin kanal nuqtalari bo‘ladi.

`field_intake_candidates` **suv olish nuqtasi emas**, balki dalada tekshirilishi
kerak bo‘lgan nomzoddir. Chiziqning birinchi va oxirgi nuqtalari ham oqim
yo‘nalishi emas, faqat raqamlashtirish yo‘nalishi hisoblanadi.

`hydraulic_pilot_review.csv` ichida 20 ta turli kanal segmentidan saralangan
etalon dalalar bor. Ular uchun suvchi / GIS mutaxassisi quyidagilarni
tasdiqlaydi:

- haqiqiy `confirmed_intake_node_id`;
- bosh manba `confirmed_source_node_id`;
- oqim yo‘nalishi tasdiqlanganligi;
- yuqori oqimda xizmat ko‘rilish navbati;
- dala talabi yoki rasmiy limit va manba sarfi.

Tasdiqdan keyin `simulate_hydraulic_delivery.py` shu jadvalni o‘qib, har bir
etalon dala uchun manba tuguni, yo‘l segmentlari, yuqori oqimda avval
taqsimlangan hajm va dala kirishidagi suvni `hydraulic_delivery_results.csv`
ga yozadi. Hisob faqat `flow_direction_verified = ha/yes` bo‘lgan qatorlarda
ishga tushadi.

## Hisoblash

Tasdiqlangan yo‘l uchun har bir segment yo‘qotish koeffitsiyenti:

`η_edge = 1 − (loss_percent_per_km / 100 × length_km) − offtake_loss`

Yo‘l bo‘yicha samaradorlik:

`η_route = Π η_edge`

Yuqori oqimdagi dalalar navbat bilan taqsimlanganda:

`Q_source_remaining(k) = Q_source − Σ gross_allocation(upstream fields)`

`Q_field_arrival = min(Field_gross_need, Q_source_remaining) × η_route`

`Field_coverage = Q_field_arrival / Field_net_demand × 100`

Bu yerda `gross_allocation` dalaning sof talabini yo‘ldagi yo‘qotishni ham
qoplash uchun manbadan ajratilgan hajmdir. Shu sababli 11-ariqdagi dala uchun
uning oldidagi 10 ta ariq/dala ajratmasi, yo‘l uzunligi va segment yo‘qotishi
alohida ko‘rinadi.

## Qat’iy cheklov

Hozirgi GDBda oqim yo‘nalishi, bosh inshoot, sarf/o‘tkazuvchanlik, zatvor
holati, navbat jadvali va haqiqiy suv o‘lchovi yo‘q. Shuning uchun bu ustunlar
tasdiqlanmaguncha `Q_field_arrival` yoki “yo‘qotilgan limit”ni haqiqiy son deb
chiqarish mumkin emas. Tizim faqat `taxminiy` maqomda simulyatsiya beradi.

Zovur/kollеktor odatda drenaj tarmog‘i: u sug‘orish manbasi sifatida faqat
qayta foydalanish nasosi yoki rasmiy ulanish tasdiqlansa qo‘shiladi.
