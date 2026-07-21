# Sug‘orish normasi — MVP modul natijasi

## Yaratilgan fayllar

- `Smart_agriculture_mvp.gdb/fields_irrigation_mvp` — sug‘orish atributlari
  qo‘shilgan 13,231 poligon.
- `geojson/fields_irrigation_mvp.geojson` va `.geojson.gz` — web xaritasi uchun
  WGS84 eksport.
- `config/irrigation_norms.csv` — Qashqadaryo jadvalidan ko‘chirilgan 91 ta
  normativ qoida.
- `config/crop_mapping.csv` — mavjud ekin nomlarini normativ ekin guruhiga
  bog‘lash.
- `config/field_zone_review_all.csv` — qo‘lda tekshirilishi kerak bo‘lgan 8,799
  mantiqiy dala.
- `config/field_zone_review_top20.csv` — maydoni katta 20 ta eng ustuvor dala.
- `irrigation_mvp_report.json` — ishlov berish sonlari.

## Yangi atributlar

| Maydon | Ma’nosi |
|---|---|
| `irrigation_zone` | `boz` yoki `chol` normativ zonasi |
| `zone_status` | `exclusive_gmr` yoki `spatial_proxy_mvp` |
| `zone_confidence` | 0–100 oralig‘idagi ishonch bahosi |
| `zone_distance_m` | proxy zona uchun eng yaqin ishonchli seedgacha masofa |
| `zone_review_required` | `1` bo‘lsa qo‘lda tekshirish talab qilinadi |
| `crop_group` | normativ ekin guruhi |
| `seasonal_norm_m3ha` | mavsumiy sug‘orish normasi |
| `planned_water_m3` | `maydoni × norma` bo‘yicha hisoblangan hajm |
| `norm_status` | normaning tayyorlik va ishonchlilik holati |

## Natija holati

- `ready`: 2,213 poligon, **11,658.97 ga**. Zona va ekin normativ jadvalga
  aniq mos tushgan.
- `provisional_zone`: 7,056 poligon, **31,343.83 ga**. Zona eng yaqin aniq GMR
  poligoniga ko‘ra MVP proxy sifatida baholangan; bu qiymatlar demo uchun
  ishlatilishi mumkin, lekin qo‘lda tasdiqlanishi shart.
- `crop_missing`: 1,669 poligon. Ekin yo‘q.
- `crop_unmapped`: 536 poligon. Ekin jadvaldagi guruhlarga hali bog‘lanmagan.
- `gmr_unavailable`: 1,757 poligon. GMR hisoblab bo‘lmagan.

`planned_water_m3` — me’yoriy talab, amalda berilgan suv emas. U suv hisoblagichi
yoki dispetcher ma’lumoti bilan almashtirilgach, suv defitsiti hisoblanadi.

## Qo‘lda zona tasdiqlash tartibi

1. `field_zone_review_top20.csv`dagi `reviewed_zone` ustuniga `boz` yoki `chol`
   yoziladi.
2. `reviewed_by` va `review_note` to‘ldiriladi.
3. Tasdiqlangan qiymatlar keyingi importda `spatial_proxy_mvp` qiymatlaridan
   ustun turadi.
4. So‘ng qolgan dalalar `field_zone_review_all.csv` orqali bosqichma-bosqich
   tekshiriladi.

Hozirgi proxy yondashuv faqat GMR I/II/V/VIII uchun bo‘z, IV uchun cho‘l
normativining eksklyuzivligidan foydalanadi. III/VI/VII/IX uchun hududiy yaqinlik
bo‘yicha taklif beriladi; shu sababli ular “haqiqiy zona” deb qabul qilinmaydi.
