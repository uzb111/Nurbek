# Ekin tavsiyasi va joylashtirish metodikasi

Tizim faqat quyidagi 6 ekindan foydalanadi: Paxta, Beda, Makkajo‘xori, Sabzavot, Poliz va Bug‘doy. Bog‘ tavsiya va qo‘lda ekin tanlash ro‘yxatidan chiqarilgan.

## Dala moslik skori

- 45% suv: rasmiy suv hajmi, kanal yo‘li samaradorligi va real ET;
- 30% tuproq boniteti;
- 15% uch qatlamli mexanik tarkib: `Tm1` 50%, `Tm2` 30%, `Tm3` 20%;
- 10% Open-Meteo ob-havo sharoiti.

Suv normasi dala ichidagi barcha GMR/tuproq qismlari uchun PNG qoidalari bo‘yicha alohida hisoblanadi. Bo‘z/cho‘l zonasi modeldan chiqarilgan. Bir GMR–ekin uchun PNGda bir nechta satr bo‘lsa, suv talabini kam baholamaslik uchun eng yuqori mavsumiy norma olinadi. Real ET mavjud bo‘lsa suv skorining 30% qismi real ET bilan, 70% qismi limit va tarmoq samaradorligi bilan baholanadi.

`Tm1/Tm2/Tm3` qiymatlari FileGDB domen kodlaridir: 1 qumoqli, 2 yengil qumoqli, 3 o‘rta qumoqli, 4 og‘ir qumoqli, 5 qumli, 6 loyli, 7 shag‘alli maxsus sinf, 8 og‘ir va o‘rta qumoqli. Kodlar ayniqsa 5–8 oralig‘ida son jihatidan yaqin bo‘lsa ham mexanik jihatdan yaqin deb hisoblanmaydi.

Har bir tuproq komponentining Tm mosligi maydoni bilan vaznlanadi. So‘ng `50% Tm1 + 30% Tm2 + 20% Tm3` mexanik bahosi olinib, yakuniy tavsiya balining 15 foizini beradi. Popup va dala pasporti qatlam kodi, domen nomi, qatlam bali hamda 15 ballik hissani ko‘rsatadi.

`Norm_coverage = mavjud_m3ga / PNG_norm_m3ga × 100`

`ET_coverage = mavjud_m3ga / (real_ET_mm × 10) × 100`

`Water_score = 0.70 × Norm_coverage + 0.30 × ET_coverage`

Shunday qilib real ET talabi oshishi ballni avtomatik oshirmaydi; mavjud suv talabni qanchalik qoplashi baholanadi.

## Barcha dalaga joylashtirish

Har bir dalaga faqat individual eng yuqori ball berilsa suv tejamkor ekinlar haddan tashqari ko‘payib ketadi. Shu sabab barcha dalalar birgalikda joylashtiriladi:

1. Har dala–ekin juftligi uchun moslik skori hisoblanadi.
2. Tuman suv balansi faylidagi 6 ekin maydoni ulushlari maqsadli taqsimot sifatida olinadi.
3. Eng yuqori moslikdagi dala–ekin juftliklari maqsadli maydon chegarasigacha joylashtiriladi.
4. Qolgan dalalar moslik skori va ekinning maqsadli maydoni to‘lish darajasi bilan muvozanatlashtiriladi.

Natijada 6 ekinning barchasi dalalarga joylashtiriladi va xaritada alohida rang bilan ko‘rsatiladi. Tavsiya va qo‘lda tanlangan ekinlar sahifa yangilanganda saqlanmaydi.
