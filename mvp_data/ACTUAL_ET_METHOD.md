# Real ET integratsiyasi

## Manba

- Fayl: `ET_qashqadarya_20260129_1143.shp`
- Koordinata tizimi: EPSG:3857
- Qamrov: Qashqadaryo viloyati
- Kasbi tumani manba poligonlari: 8 517
- ET davri: mart–oktabr, oylik va jami millimetr qiymatlari

## Dala bilan bog‘lash

ET manbasidagi `Q_...` identifikatorlar dashboarddagi barqaror `field_id` bilan bir xil emas. Shu sabab bog‘lash koordinata va poligon kesishmasi orqali bajarildi.

1. Dashboard dalalari EPSG:3857 ga proyeksiya qilindi.
2. Faqat `Kasbi tumani` ET poligonlari tanlandi.
3. Har bir `field_id` uchun ET poligonlari bilan kesishgan maydon hisoblandi.
4. Oylik va jami ET kesishgan maydonga vaznlantirildi.
5. Dala qamrovi kamida 70% bo‘lsa real ET qabul qilindi.

Natija: 10 710 daladan 10 563 tasi real ET bilan bog‘landi; 10 515 dalada qamrov 90–100%. Mos kelmagan dalalarda taxminiy ET ko‘rsatilmaydi.

## Formula

`Dala real ET hajmi (m³) = maydon-vaznli jami ET (mm) × dala maydoni (ga) × 10`

Split qism uchun shu real ET millimetr qiymati qismning yangi maydoniga qo‘llanadi. ET geometriyasi va bog‘lash natijasi `integrate_actual_et.py` orqali qayta yaratiladi.

Tuman suv balansida rasmiy 2025 limit davriga mos bo‘lishi uchun faqat aprel–sentabr oylari yig‘iladi. Hozirgi moslangan dalalar bo‘yicha bu hajm 301,157 mln m³. Shu davr samarali yog‘ini 2025-04-01—2025-09-30 Open-Meteo tarixiy qatoridan olinadi.
