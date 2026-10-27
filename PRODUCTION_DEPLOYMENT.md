# 🚀 eFootball Telegram Mini App & Bot: Production 24/7 Qo‘llanmasi

Ushbu qo‘llanma loyihani **LocalTunnel yoki vaqtinchalik ogohlantirish sahifalarisiz**, haqiqiy doimiy HTTPS domenida **24/7 rejimida uzluksiz** ishlatish uchun to‘liq yo‘riqnomani taqdim etadi.

---

## 📌 Nima uchun LocalTunnel ogohlantirish chiqardi?

Rasmda ko‘ringan ogohlantirish — LocalTunnel xizmatining phishing va xakerlikning oldini olish uchun kiritgan maxsus tekshiruv sahifasidir. 
* LocalTunnel bepul va vaqtinchalik sinov xizmati bo‘lgani sababli, har bir yangi kirgan foydalanuvchidan server egasining IP-manzilini tasdiqlashni talab qiladi.
* **Production Mini App uchun bu yaramaydi**, chunki o‘yinchilar Telegram ichida bot tugmasini bosganda hech qanday IP yoki oraliq tasdiqlashlarsiz **to‘g‘ridan-to‘g‘ri turnir sahifasiga** kirishi shart.

Buning yagona to‘g‘ri va professional yechimi — loyihani doimiy ishlaydigan hostingga joylab, rasmiy SSL (HTTPS) domenidan foydalanishdir.

---

## 🛠️ 1-Variant: Linux VPS Serverda Ishga Tushirish (Tavsiya etiladi — 100% 24/7)

Hetzner, Timeweb, Beget, DigitalOcean yoki Vultr kabi arzon VPS serverlarida (oyiga $2.5 - $4) loyiha 24/7 to‘xtamasdan, uxlab qolmasdan ishlaydi.

### 1-qadam: VPS ga ulanish va Node.js o‘rnatish
```bash
# Serverga SSH orqali kiring:
ssh root@SERVER_IP_MANZILI

# Tizimni yangilang va Node.js 22 ni o'rnating:
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git build-essential nginx certbot python3-certbot-nginx
```

### 2-qadam: Loyihani serverga yuklash
```bash
# Papka yarating va loyihani yuklang:
mkdir -p /var/www/efootball
cd /var/www/efootball

# Fayllarni git orqali yoki SCP/FTP orqali yuklang
# Bog'liqliklarni o'rnating:
npm install --omit=dev
```

### 3-qadam: .env faylini to‘ldirish
`/var/www/efootball/.env` faylini oching:
```env
PORT=3000
BOT_TOKEN=8893507248:AAFlnyGWdPQoil6ybwcMEFtFLBHel3j77SM
ADMIN_ID=123456789
MINI_APP_URL=https://sizningdomeningiz.uz
ADMIN_SECRET_KEY=efootball_admin_2026
```

### 4-qadam: PM2 orqali 24/7 rejimida yoqish (Avtomatik qayta yonish)
```bash
# PM2 ni global o'rnating:
npm install -g pm2

# Loyihani tayyor ecosystem.config.js bilan ishga tushiring:
pm2 start ecosystem.config.js

# Server qayta o'chib-yonsa ham avtomatik qayta yonishi uchun:
pm2 startup
pm2 save
```
> **Natija:** Server o‘chib yonsa ham, tizim PM2 yordamida bot va web-serverni avtomatik qayta yoqadi. `data/efootball_league.db` va `uploads/` doimiy saqlanadi, ma’lumotlar yo‘qolmaydi!

### 5-qadam: Nginx va Bepul SSL (HTTPS) ulash
`/etc/nginx/sites-available/efootball.conf` fayliga loyihadagi `nginx/efootball.conf` mazmunini nusxalang va domeningizni yozing:
```bash
cp /var/www/efootball/nginx/efootball.conf /etc/nginx/sites-available/efootball.conf
ln -s /etc/nginx/sites-available/efootball.conf /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx

# Bepul Let's Encrypt SSL sertifikatini oling:
certbot --nginx -d sizningdomeningiz.uz
```

---

## ☁️ 2-Variant: Railway.app da Ishga Tushirish (1-Click Cloud)

Agar shaxsiy VPS bo‘lmasa, **Railway.app** orqali kodni ulashingiz mumkin:

1. [Railway.app](https://railway.app) ga kiring va GitHub akkauntingiz bilan kiring.
2. **“New Project” ➔ “Deploy from GitHub repo”** ni tanlang.
3. Loyihangiz repozitoriyasini tanlang.
4. **Variables (.env)** bo‘limiga quyidagilarni kiriting:
   * `PORT`: `3000`
   * `BOT_TOKEN`: `8893507248:AAFlnyGWdPQoil6ybwcMEFtFLBHel3j77SM`
   * `ADMIN_ID`: Telegram ID raqamingiz
   * `MINI_APP_URL`: Railway bergan domen (masalan: `https://efootball-production.up.railway.app`)
5. **Volume (Doimiy Disk) ulash (MUHIM!):**
   * Railway loyihasida **Add ➔ Volume** tugmasini bosing.
   * Mount path ga `/app/data` ni yozing.
   * Bu server qayta ishga tushganda SQLite bazasi o‘chib ketmasligini ta’minlaydi.
6. Railway sizga rasmiy `https://xxxx.up.railway.app` domenini beradi. Unda hech qanday ogohlantirish chiqmaydi!

---

## 🤖 Telegram @BotFather Sozlamalari (Mini App’ni Ulab Qo‘yish)

Production HTTPS manzilingiz tayyor bo‘lgach (masalan: `https://sizningdomeningiz.uz` yoki `https://xxxx.up.railway.app`):

### 1. BotFather orqali Mini App yaratish:
1. Telegramda [@BotFather](https://t.me/BotFather) ga kiring.
2. `/newapp` buyrug‘ini yuboring.
3. Botingizni tanlang: `@Efootbal_League_bot`.
4. Mini App nomini kiriting: masalan, `eFootball Uzbekistan Masters`.
5. Mini App haqida qisqa tavsif yozing.
6. Mini App uchun 640x360 o‘lchamdagi rasm (banner) yuboring.
7. **Web App URL** so‘ralganda: Rasmiy HTTPS manzilingizni yozing:
   ```
   https://sizningdomeningiz.uz
   ```
8. **Short name** so‘ralganda: masalan, `league` yoki `app` deb yozing.
9. **Natija:** BotFather sizga rasmiy Mini App havolasini beradi:
   👉 `t.me/Efootbal_League_bot/league`

### 2. Chat menyu tugmasini (Menu Button) sozlash:
1. [@BotFather](https://t.me/BotFather) da `/setmenubutton` buyrug‘ini yuboring.
2. `@Efootbal_League_bot` ni tanlang.
3. Tugma URL manziliga HTTPS manzilingizni kiriting: `https://sizningdomeningiz.uz`.
4. Tugma matniga `🏆 Turnirni ochish` deb yozing.

Endi har qanday foydalanuvchi botga kirganda pastdagi tugmani bosishi bilan **LocalTunnel ogohlantirishisiz, to‘g‘ridan-to‘g‘ri haqiqiy Mini App interfeysi** ochiladi!

---

## 📊 24/7 Monitoring va Health-Check

Serveringiz doimo sog‘lom va uxlab qolmasdan ishlayotganini tekshirish uchun tizimda quyidagi monitoring manzillari mavjud:

* **To‘liq holat:** `GET https://sizningdomeningiz.uz/api/health`
  ```json
  {
    "status": "ok",
    "uptime_human": "5 kun, 12 soat, 4 daqiqa",
    "database": {
      "status": "connected",
      "type": "SQLite (WAL mode)",
      "active_participants": 12,
      "total_matches": 66
    },
    "telegramBot": {
      "connected": true,
      "username": "Efootbal_League_bot"
    }
  }
  ```
* **Lightweight Ping:** `GET https://sizningdomeningiz.uz/api/health/ping` ➔ `PONG`

### Bepul 24/7 Monitoring o‘rnatish:
1. [UptimeRobot.com](https://uptimerobot.com) ga kiring (bepul).
2. **“Add New Monitor”** ni bosing:
   * Monitor Type: `HTTP(s)`
   * URL: `https://sizningdomeningiz.uz/api/health/ping`
   * Monitoring Interval: `5 minutes`
3. Bu xizmat serveringizni har 5 daqiqada tekshirib turadi va server hech qachon to‘xtab qolmasligini ta’minlaydi. Agar serverda uzilish bo‘lsa, sizga darhol Telegram yoki Email orqali xabar yuboradi.
