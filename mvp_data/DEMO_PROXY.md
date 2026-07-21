# Demo-proksi suv normasi

Bu qatlam rahbariyatga MVP ishlash prinsipini ko'rsatish uchun yaratilgan.
Asl GDBdagi ustunlar o'zgartirilmagan; barcha demo qiymatlar `*_mvp` nomli
yangi ustunlarda saqlanadi.

## Hisoblash qoidasi

1. Ekin va ekin guruhi bo'lsa, aynan manba qiymati olinadi. Aks holda eng
   yaqin ekinli poligondan `crop_mvp` va `crop_group_mvp` olinadi.
2. GMR bo'lsa, manba qiymati olinadi. Aks holda eng yaqin GMRli poligondan
   `gmr_mvp` olinadi.
3. `irrigation_zone`, `gmr_mvp` va `crop_group_mvp` bo'yicha PNG jadvallardan
   ko'chirilgan `irrigation_norms.csv` qoidasi tanlanadi.
4. `planned_water_m3_mvp = maydoni × norm_m3ha_mvp`.

## Cheklov

`demo_ready_proxy` qiymati real suv sarfi yoki agronomik tavsiya emas. U faqat
MVP oqimini ko'rsatadi va ET0, ob-havo, sizot suvi, ekin fenologiyasi hamda
dala kuzatuvi qo'shilganda yangilanadi.

Yaqinlashtirilgan qiymatlarning manbasi va masofasi har poligonda
`crop_mvp_source`, `crop_proxy_distance_m`, `gmr_mvp_source` va
`gmr_proxy_distance_m` ustunlarida saqlangan.
