# ⚽ eFootball Do‘stlar Ligasi & Telegram Mini App

eFootball o‘yini uchun do‘stlar ligasini avtomatlashtirilgan tarzda boshqarishga mo‘ljallangan to‘liq ishlaydigan **Telegram Bot va Telegram Mini App (Web App)** platformasi.

---

## 🚀 Asosiy Imkoniyatlar

### 1. Telegram Bot & Mini App Integratsiyasi
- **`/start` buyrug‘i**: Bot foydalanuvchini samimiy kutib oladi va **“🏆 Turnirni ochish”** inline hamda pastki Menu tugmasi orqali Mini App’ni ochadi.
- **Rasmiy Telegram Ma’lumotlari**: Foydalanuvchi Telegram hisobi orqali avtomatik aniqlanadi. Gmail, KONAMI ID yoki parollar so‘ralmaydi.
- **Telegram Eslatmalari**: O‘yin kuni ishtirokchilarga uchrashuv eslatmasi va raqib natija kiritganda tasdiqlash uchun bot orqali bildirishnoma yuboriladi.
- **Bot orqali to‘g‘ridan-to‘g‘ri skrinshot qabul qilish**: O‘yinchi o‘yin skrinshotini to‘g‘ridan-to‘g‘ri bot chatiga tashlaganda ham AI/OCR orqali hisobni o‘qiydi.

### 2. Liga Yaratish va Ro‘yxatdan O‘tish
- **Liga qoidalari va rozilik**: Yangi ishtirokchi Mini App’ni ochganda avval qoidalar bilan tanishadi va rozilik bildiradi.
- **Klub tanlash**: eFootball’dagi mashhur klublar (Real Madrid, Barcelona, Man City, Arsenal, Bayern Munich, Inter va boshqalar) yoki o‘z klub nomini kiritish imkoniyati.
- **Format**: Jadvalda ishtirokchi **Shox — Real Madrid** ko‘rinishida aks etadi.
- **Joylar limiti va Kutish ro‘yxati (Waitlist)**: Masalan, `12/12 joy band` bo‘lsa, keyingi o‘yinchilar avtomatik tarzda **Kutish ro‘yxatiga** olinadi. Agar biror ishtirokchi ligadan chiqsa yoki chiqarilsa, kutish ro‘yxatidagi navbatdagi odam avtomatik asosiy tarkibga qabul qilinadi!

### 3. Turnir Jadvali va Taqvim (Round-Robin)
- **Avtomatik qur‘a (Berger algoritmi)**: Har bir ishtirokchi qolganlarning har biri bilan bir martadan o‘ynaydigan taqvim tuziladi. Juftliklar adolatli tasodifiy qur‘a bilan bir marta tuzilib bazada saqlanadi; sahifa yangilanganda o‘zgarmaydi.
- **Rasmiy jadval**: O‘yinlar (O‘), G‘alaba (G‘), Durang (D), Mag‘lubiyat (M), Urilgan gollar (UG), O‘tkazilgan gollar (O‘G), To‘plar farqi (+/-), Ochko (OCH).
- **Ochkolar**: G‘alaba — 3, Durang — 1, Mag‘lubiyat — 0. Teng ochkoda: To‘plar farqi ➔ Urilgan gollar ➔ O‘zaro o‘yin natijasi.

### 4. Skrinshotdan Natija va AI/OCR Tahlili
- **Avtomatik hisob va statistika o‘qish**: eFootball o‘yin yakunidagi statistika ekrani skrinshotidan hisob (masalan, `2 - 1`), to‘p nazorati (`58% - 42%`), zarbalar (`8 - 5`), darvozaga aniq zarbalar (`5 - 2`) va burchak zarbalarini avtomatik ajratib oladi.
- **Ikki bosqichli tasdiqlash**:
  1. Skrinshot yuklagan ishtirokchi aniqlangan hisobni tekshiradi yoki tuzatadi.
  2. Natija raqibga yuboriladi. Raqib skrinshotni ko‘rib **“Tasdiqlash”** yoki **“E‘tiroz”** tugmasini bosadi.
  3. Ikkala tomon tasdiqlagach, natija rasman jadvalga qo‘shiladi.
- **Nizo holati**: E‘tiroz bo‘lsa uchrashuv **“Tekshiruvda”** turadi va admin yakuniy qaror qabul qiladi.
- **Haqiqiy AI xulosasi**: Faqat rasmda o‘qilgan aniq raqamlarga tayanadi (masalan: *“To‘p nazorati Real Madridda yuqori bo‘ldi (58%), biroq Barcelona aniq zarbalardan unumli foydalandi”*).
- **Jonli hisob (Live mode)**: Ishtirokchilar o‘yin vaqtida gol kiritganda raqib tasdiqlab jonli hisobni yangilashi mumkin.

### 5. Qo‘shimcha Imkoniyatlar
- 🎨 **Natija kartasi (Match Poster)**: Tasdiqlangan natijani Telegram guruhlarida ulashish uchun chiroyli eFootball uslubidagi rasmga aylantirish (HTML5 Canvas).
- 🎯 **Taxmin o‘yini (Predictor)**: Do‘stlar uchrashuvlar hisobini oldindan topib alohida reytingda ochko to‘plashadi.
- 🏆 **Mavsum mukofotlari**: Oltin butsa, Temir himoya, G‘alabalar seriyasi, Eng yirik g‘alaba.
- ⭐ **Haftaning o‘yini**: Guruh a‘zolari markaziy uchrashuvga ovoz berishadi.
- ⚔️ **O‘zaro tarix (Head-to-Head)**: Ikki o‘yinchining avvalgi to‘qnashuvlari statistikasi.

---

## 🛠️ O‘rnatish va Ishga Tushirish

### Talablar:
- Node.js v18 yoki undan yuqori (v20, v22, v24)
- Telegram Bot Token ([@BotFather](https://t.me/BotFather) orqali olinadi)

### 1. Bog‘liqliklarni o‘rnatish:
```bash
npm install
```

### 2. Sozlamalarni kiritish (.env):
Loyiha papkasidagi `.env` faylini ochib quyidagi qiymatlarni kiriting:
```env
# Server porti
PORT=3000

# Telegram Bot Token (@BotFather dan olingan token)
BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ

# Telegram Admin ID (o'zingizning Telegram ID raqamingiz)
ADMIN_ID=123456789

# Telegram Mini App URL (HTTPS havolasi, masalan ngrok yoki domen)
MINI_APP_URL=http://localhost:3000

# Google Gemini API kaliti (ixtiyoriy, skrinshotdan mukammal AI tahlil uchun)
GEMINI_API_KEY=
```

> **Eslatma:** Agar sizda hozircha `BOT_TOKEN` bo‘lmasa ham, dastur to‘liq ishlaydi! Brauzerda `http://localhost:3000` ga kirsangiz, pastdagi **Profil** bo‘limida foydalanuvchilarni almashtirib (Shox, Javohir, Admin) barcha funksiyalarni to‘liq sinab ko‘rishingiz mumkin.

### 3. Ishga tushirish:
```bash
npm start
```
Yoki:
```bash
node server/index.js
```

### 4. Telegram Botda Mini App’ni ulash:
1. [@BotFather](https://t.me/BotFather) ga o‘ting.
2. `/newapp` buyrug‘ini bering va botingizni tanlang.
3. Mini App nomini va tasvirini kiriting.
4. Web App URL manzili sifatida serveringiz HTTPS havolasini (masalan: `ngrok http 3000` orqali olingan `https://xxxx.ngrok-free.app`) kiriting.
5. Tayyor! Endi botingizda `/start` bosilganda Mini App ochiladi.

---

## 📁 Loyiha Tuzilishi

```
├── package.json
├── .env.example              # Namuna konfiguratsiya fayli
├── .env                      # Asosiy sozlamalar fayli
├── data/
│   └── efootball_league.db   # SQLite doimiy ma'lumotlar bazasi
├── uploads/                  # Yuklangan skrinshotlar
├── server/
│   ├── index.js              # Express, HTTP & WebSocket server
│   ├── config.js             # Konfiguratsiya moduli
│   ├── db.js                 # SQLite sxemasi va migratsiyalar
│   ├── bot.js                # Telegraf bot boshqaruvi va fotoni qabul qilish
│   ├── middleware/
│   │   └── auth.js           # Telegram initData HMAC-SHA256 validatsiyasi
│   ├── services/
│   │   ├── keepAlive.js      # Render 24/7 uxlamaslik (Keep-Alive) xizmati
│   │   ├── ocrService.js     # Tesseract OCR & Gemini Vision tahlilchisi
│   │   ├── fixtureGenerator.js # Berger round-robin va jadval hisoblash
│   │   ├── botNotifier.js    # Telegram xabarnoma xizmati
│   │   └── websocket.js      # Jonli hisob va bildirishnomalar
│   └── routes/
│       ├── league.js         # Liga ma'lumotlari va sozlamalari
│       ├── participants.js   # Ro'yxatdan o'tish va kutish ro'yxati
│       ├── matches.js        # Uchrashuvlar, taqvim va jadval
│       ├── results.js        # Skrinshot yuklash, tasdiqlash va nizo
│       ├── live.js           # Jonli gol kiritish va tasdiqlash
│       ├── taxmin.js         # Taxmin o'yini va reyting
│       ├── stats.js          # Mukofotlar, o'zaro tarix, haftaning o'yini
│       └── admin.js          # Admin paneli amallari
├── public/
│   ├── index.html            # Mini App bosh sahifasi (eFootball mavzusi)
│   ├── css/
│   │   ├── style.css         # eFootball sport uslubidagi dizayn
│   │   └── animations.css    # Mikro-animatsiyalar
│   └── js/
│       ├── app.js            # Asosiy controller va marshrutlash
│       ├── api.js            # Backend API mijozi
│       ├── tg.js             # Telegram WebApp SDK sarmoyasi
│       ├── clubs.js          # eFootball klublari ma'lumotlar bazasi
│       └── views/
│           ├── standings.js  # Turnir jadvali (boshlang'ich ko'rinish)
│           ├── matches.js    # Uchrashuv kartalari va turlar
│           ├── results.js    # Tasdiqlangan natijalar va AI xulosasi
│           ├── profile.js    # Shaxsiy statistika va simulyator
│           ├── register.js   # Qoidalar va ro'yxatdan o'tish modali
│           ├── uploadModal.js# Skrinshot yuklash va OCR tahrirlash
│           ├── liveMatch.js  # Jonli hisob hisoblagichi
│           ├── adminView.js  # Admin boshqaruv paneli
│           ├── taxminView.js # Taxminlar va mukofotlar
│           └── cardGenerator.js # Canvas natija kartasi generatori
└── test/
    └── test_all.js           # E2E to'liq test ssenariysi
```
