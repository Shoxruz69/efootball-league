const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const db = require('./db');
const { setBotInstance, createAppButton } = require('./services/botNotifier');
const { analyzeMatchScreenshot } = require('./services/ocrService');
const path = require('path');
const fs = require('fs');
const https = require('https');

let bot = null;

function initBot() {
  if (!config.botToken) {
    console.warn('\n⚠️ [TELEGRAM BOT]: BOT_TOKEN belgilanmagan.');
    console.warn('Telegram botni ishga tushirish uchun .env faylida BOT_TOKEN ni kiriting.');
    console.warn('Mini App veb interfeysi brauzerda http://localhost:' + config.port + ' manzilida ishlamoqda.\n');
    return null;
  }

  bot = new Telegraf(config.botToken);
  setBotInstance(bot);

  // Global bot error handler for 24/7 crash-proofing
  bot.catch((err, ctx) => {
    console.error(`⚠️ [Telegraf Catch] Xatolik (${ctx?.updateType}):`, err.message);
  });

  // Set chat menu button to open Mini App if HTTPS
  if (config.miniAppUrl && config.miniAppUrl.startsWith('https://')) {
    bot.telegram.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🏆 Turnirni ochish',
        web_app: { url: config.miniAppUrl }
      }
    }).catch(err => {
      console.warn('Chat menu button o\'rnatishda xatolik:', err.message);
    });
  }

  // /start command
  bot.start(async (ctx) => {
    const user = ctx.from;
    const miniAppUrl = config.miniAppUrl;

    const welcomeText = `👋 <b>Assalomu alaykum, ${user.first_name || 'do‘stim'}!</b>\n\n` +
      `⚽ <b>eFootball Do‘stlar Ligasi</b> rasmiy Telegram botiga xush kelibsiz!\n\n` +
      `Bu yerda siz do‘stlaringiz bilan eFootball bo‘yicha haqiqiy turnirlar o‘tkazishingiz, ` +
      `natijalarni o‘yin skrinshotidan AI orqali aniqlab jadvalni yuritishingiz mumkin.\n\n` +
      `📌 <b>Imkoniyatlar:</b>\n` +
      `• Turnir jadvali va taqvim\n` +
      `• Skrinshot yuklab hisobni avtomatik aniqlash\n` +
      `• Ikki tomonlama natija tasdig‘i\n` +
      `• Jonli hisob va taxminlar o‘yini\n\n` +
      `Turnirda qatnashish va jadvalni ko‘rish uchun quyidagi tugmani bosing:`;

    // Ensure chat menu button is set for this chat with the HTTPS URL
    if (miniAppUrl && miniAppUrl.startsWith('https://')) {
      ctx.setChatMenuButton({
        type: 'web_app',
        text: '🏆 Turnirni ochish',
        web_app: { url: miniAppUrl }
      }).catch(() => {});
    }

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            createAppButton('🏆 Turnirni ochish', miniAppUrl)
          ],
          [
            {
              text: '📋 Qoidalar va yo‘riqnoma',
              callback_data: 'view_rules'
            }
          ]
        ]
      }
    });
  });

  // /help command
  bot.help(async (ctx) => {
    const helpText = `📖 <b>Bot buyruqlari:</b>\n\n` +
      `/start - Botni ishga tushirish va Mini App'ni ochish\n` +
      `/jadval - Turnir jadvalining qisqa ko‘rinishi\n` +
      `/oyinim - Navbatdagi uchrashuvingiz haqida ma’lumot\n` +
      `/admin - Admin boshqaruv paneli (faqat adminlar uchun)\n` +
      `/help - Ushbu yo‘riqnoma\n\n` +
      `💡 <i>Mini App'ni pastdagi "Turnirni ochish" tugmasi orqali istalgan vaqt ochishingiz mumkin.</i>`;

    await ctx.reply(helpText, { parse_mode: 'HTML' });
  });

  // /jadval command
  bot.command('jadval', async (ctx) => {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return ctx.reply('Hozirda faol liga mavjud emas.');
    }

    const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    const matches = db.prepare("SELECT * FROM matches WHERE league_id = ?").all(league.id);

    const { calculateStandings } = require('./services/fixtureGenerator');
    const standings = calculateStandings(participants, matches);

    if (standings.length === 0) {
      return ctx.reply('Jadvalda hali ishtirokchilar mavjud emas.', {
        reply_markup: {
          inline_keyboard: [[createAppButton('📱 Mini App orqali ro‘yxatdan o‘tish', config.miniAppUrl)]]
        }
      });
    }

    let msg = `🏆 <b>${league.name} — Turnir jadvali</b>\n\n`;
    msg += `<code>O'  Ishtirokchi       O' G' D M  TF  Och</code>\n`;
    msg += `<code>-----------------------------------</code>\n`;

    standings.slice(0, 10).forEach(s => {
      const rank = String(s.rank).padEnd(2, ' ');
      const name = (s.player_name + ' (' + s.club_name.substring(0, 3) + ')').padEnd(16, ' ').substring(0, 16);
      const played = String(s.played).padStart(2, ' ');
      const won = String(s.won);
      const drawn = String(s.drawn);
      const lost = String(s.lost);
      const gd = (s.goal_diff >= 0 ? '+' : '') + String(s.goal_diff);
      const pts = String(s.points).padStart(2, ' ');
      msg += `<code>${rank} ${name} ${played} ${won} ${drawn} ${lost} ${gd.padStart(3, ' ')}  ${pts}</code>\n`;
    });

    await ctx.reply(msg, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [createAppButton('📱 To‘liq jadvalni ochish', `${config.miniAppUrl}?view=standings`)]
        ]
      }
    });
  });

  // /oyinim command
  bot.command('oyinim', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const participant = db.prepare("SELECT * FROM participants WHERE telegram_id = ? AND status = 'active' LIMIT 1").get(telegramId);

    if (!participant) {
      return ctx.reply("Siz hali ligada ro'yxatdan o'tmigansiz.", {
        reply_markup: {
          inline_keyboard: [[createAppButton('📝 Ro‘yxatdan o‘tish', config.miniAppUrl)]]
        }
      });
    }

    const nextMatch = db.prepare(`
      SELECT m.*, 
        h.player_name as home_name, h.club_name as home_club,
        a.player_name as away_name, a.club_name as away_club
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE (m.home_participant_id = ? OR m.away_participant_id = ?)
        AND m.status != 'finished'
      ORDER BY m.round ASC, m.id ASC
      LIMIT 1
    `).get(participant.id, participant.id);

    if (!nextMatch) {
      return ctx.reply("Sizda barcha o'yinlar yakunlangan yoki taqvim hali tuzilmagan.");
    }

    const isHome = nextMatch.home_participant_id === participant.id;
    const opponentName = isHome ? nextMatch.away_name : nextMatch.home_name;
    const opponentClub = isHome ? nextMatch.away_club : nextMatch.home_club;

    const text = `⚔️ <b>Navbatdagi uchrashuvingiz (${nextMatch.round}-Tur):</b>\n\n` +
      `Siz: <b>${participant.player_name}</b> (${participant.club_name})\n` +
      `Raqib: <b>${opponentName}</b> (${opponentClub})\n` +
      `Holati: <b>${nextMatch.status.toUpperCase()}</b>\n\n` +
      `Uchrashuvni o'ynagach, natija skrinshotini Mini App orqali yuklang!`;

    await ctx.reply(text, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [createAppButton('📱 O‘yin kartasini ochish', `${config.miniAppUrl}?match_id=${nextMatch.id}&view=matches`)]
        ]
      }
    });
  });

  // /admin command
  bot.command('admin', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const isAdmin = config.adminId.includes(telegramId);

    if (!isAdmin) {
      return ctx.reply('⛔ Kechirasiz, ushbu buyruq faqat liga adminlari uchun ruxsat etilgan.');
    }

    await ctx.reply('👑 <b>Admin boshqaruv paneli:</b>\n\nQuyidagi tugma orqali Admin boshqaruvini ochishingiz mumkin:', {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [createAppButton('⚙️ Admin panelni ochish', `${config.miniAppUrl}?view=admin`)]
        ]
      }
    });
  });

  // Callback query: view_rules
  bot.action('view_rules', async (ctx) => {
    await ctx.answerCbQuery();
    const league = db.prepare("SELECT * FROM leagues ORDER BY id DESC LIMIT 1").get();
    const rules = league?.rules || 'Qoidalar belgilanmagan.';
    await ctx.reply(`📜 <b>Liga qoidalari:</b>\n\n${rules}`, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [createAppButton('🏆 Turnirni ochish', config.miniAppUrl)]
        ]
      }
    });
  });

  // Listen to photo uploads sent directly to the bot
  bot.on('photo', async (ctx) => {
    const telegramId = String(ctx.from.id);
    const participant = db.prepare("SELECT * FROM participants WHERE telegram_id = ? AND status = 'active' LIMIT 1").get(telegramId);

    if (!participant) {
      return ctx.reply("Skrinshot yuklash uchun avval turnirda ro'yxatdan o'tishingiz kerak.", {
        reply_markup: {
          inline_keyboard: [[createAppButton('📝 Turnirga kirish', config.miniAppUrl)]]
        }
      });
    }

    // Check for a pending match for this participant
    const pendingMatch = db.prepare(`
      SELECT m.*, 
        h.player_name as home_name, h.club_name as home_club,
        a.player_name as away_name, a.club_name as away_club
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE (m.home_participant_id = ? OR m.away_participant_id = ?)
        AND m.status IN ('scheduled', 'live', 'submitted', 'disputed')
      ORDER BY m.round ASC, m.id ASC
      LIMIT 1
    `).get(participant.id, participant.id);

    if (!pendingMatch) {
      return ctx.reply("Sizda hozirda natija kiritish kutilayotgan faol uchrashuv topilmadi.");
    }

    const waitMsg = await ctx.reply("📸 Skrinshot qabul qilindi. AI/OCR orqali natija va statistika tahlil qilinmoqda...");

    try {
      const photos = ctx.message.photo;
      const highestPhoto = photos[photos.length - 1];
      const fileLink = await ctx.telegram.getFileLink(highestPhoto.file_id);

      const uploadDir = path.join(__dirname, '..', config.uploadDir);
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const fileName = `screenshot_${Date.now()}_${highestPhoto.file_id.substring(0, 8)}.jpg`;
      const localFilePath = path.join(uploadDir, fileName);

      // Download file
      const fileStream = fs.createWriteStream(localFilePath);
      await new Promise((resolve, reject) => {
        https.get(fileLink.href, (response) => {
          response.pipe(fileStream);
          fileStream.on('finish', () => {
            fileStream.close();
            resolve();
          });
        }).on('error', reject);
      });

      // Analyze screenshot
      const analysis = await analyzeMatchScreenshot(localFilePath, {
        homePlayer: pendingMatch.home_name,
        awayPlayer: pendingMatch.away_name,
        homeClub: pendingMatch.home_club,
        awayClub: pendingMatch.away_club
      });

      const extracted = analysis.extracted || {};
      let replyText = `📊 <b>Skrinshot tahlili yakunlandi!</b>\n\n`;
      replyText += `Uchrashuv: <b>${pendingMatch.home_name}</b> vs <b>${pendingMatch.away_name}</b>\n`;

      if (extracted.homeScore !== null && extracted.awayScore !== null) {
        replyText += `Aniqlangan hisob: <b>${extracted.homeScore} - ${extracted.awayScore}</b>\n`;
      } else {
        replyText += `⚠️ <i>Hisob aniq o'qilmadi, qo'lda tasdiqlash kerak.</i>\n`;
      }

      if (analysis.aiSummary) {
        replyText += `\n💬 <b>AI xulosasi:</b> ${analysis.aiSummary}\n`;
      }

      replyText += `\nNatijani tekshirish, raqibga yuborish va yakuniy tasdiqlash uchun Mini App'ga o'ting:`;

      await ctx.telegram.deleteMessage(ctx.chat.id, waitMsg.message_id).catch(() => {});
      await ctx.reply(replyText, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              createAppButton('✅ Natijani tasdiqlash uchun ochish', `${config.miniAppUrl}?match_id=${pendingMatch.id}&view=matches`)
            ]
          ]
        }
      });
    } catch (err) {
      console.error('Bot skrinshot tahlil xatosi:', err);
      await ctx.reply("❌ Skrinshotni yuklashda xatolik yuz berdi. Iltimos, Mini App orqali to'g'ridan-to'g'ri yuklang.", {
        reply_markup: {
          inline_keyboard: [[createAppButton('📱 Mini App’ni ochish', config.miniAppUrl)]]
        }
      });
    }
  });

  // Connect and launch bot
  bot.telegram.getMe().then((me) => {
    bot.botInfo = me;
    console.log(`🤖 Telegram Bot muvaffaqiyatli ishga tushdi: @${me.username} (${me.first_name})`);
  }).catch((err) => {
    console.error('Telegram getMe xatoligi:', err.message);
  });

  bot.launch().catch((err) => {
    console.error('Telegram bot ishga tushirishda xatolik:', err.message);
  });

  // Enable graceful stop
  process.once('SIGINT', () => bot && bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot && bot.stop('SIGTERM'));

  return bot;
}

module.exports = {
  initBot,
  getBot: () => bot
};
