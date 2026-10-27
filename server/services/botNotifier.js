const config = require('../config');

let botInstance = null;

function setBotInstance(bot) {
  botInstance = bot;
}

/**
 * Helper to create button compatible with Telegram's HTTPS web_app requirement
 */
function createAppButton(text, url) {
  if (url && url.startsWith('https://')) {
    return { text, web_app: { url } };
  }
  // NEVER send http://localhost to Telegram inline keyboard as it throws 400 Bad Request
  return { text: text, callback_data: 'view_rules' };
}

/**
 * Send a notification to a specific Telegram user ID
 */
async function sendTelegramNotification(telegramId, message, replyMarkup = null) {
  if (!botInstance || !config.botToken) {
    console.log(`[Bot Notification (Simulation)] To: ${telegramId}\nMsg: ${message}`);
    return false;
  }

  try {
    const extra = { parse_mode: 'HTML' };
    if (replyMarkup) {
      extra.reply_markup = replyMarkup;
    }
    await botInstance.telegram.sendMessage(telegramId, message, extra);
    return true;
  } catch (err) {
    console.error(`Telegram xabar yuborishda xatolik (${telegramId}):`, err.message);
    return false;
  }
}

/**
 * Send photo notification with caption and fallback
 */
async function sendTelegramPhoto(telegramId, photoUrlOrPath, caption, replyMarkup = null) {
  if (!botInstance || !config.botToken) {
    console.log(`[Bot Notification (Simulation Photo)] To: ${telegramId}\nCaption: ${caption}`);
    return false;
  }

  try {
    const extra = { parse_mode: 'HTML', caption };
    if (replyMarkup) extra.reply_markup = replyMarkup;

    const fs = require('fs');
    const path = require('path');

    // If local relative upload path like /uploads/filename.jpg
    if (photoUrlOrPath && photoUrlOrPath.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, '..', '..', photoUrlOrPath);
      if (fs.existsSync(localPath)) {
        await botInstance.telegram.sendPhoto(telegramId, { source: localPath }, extra);
        return true;
      }
    }

    // Direct URL or source
    if (photoUrlOrPath && photoUrlOrPath.startsWith('http')) {
      await botInstance.telegram.sendPhoto(telegramId, photoUrlOrPath, extra);
      return true;
    }

    // Fallback to text message if photo file unavailable
    await botInstance.telegram.sendMessage(telegramId, caption, extra);
    return true;
  } catch (err) {
    console.warn(`[Bot Notification] ${telegramId} ga xabar/skrinshot yetkazilmadi (${err.message}) - Sabab: foydalanuvchi botga /start bosmagan yoki chat ochilmagan`);
    return false;
  }
}

/**
 * Notify both players when a result is submitted
 */
async function notifyBothPlayersOfResult(match, uploaderTg, scoreText, screenshotUrl) {
  const miniAppUrl = config.miniAppUrl;
  const homeName = match.home_name;
  const awayName = match.away_name;
  const isUploaderHome = match.home_tg === uploaderTg;
  const opponentTg = isUploaderHome ? match.away_tg : match.home_tg;
  const uploaderName = isUploaderHome ? homeName : awayName;

  // 1. Notify opponent (needs to review & confirm)
  const oppCaption = `⚽ <b>eFootball Liga: Natija kiritildi!</b>\n\n` +
    `Uchrashuv: <b>${homeName}</b> vs <b>${awayName}</b>\n` +
    `Kiritilgan hisob: <b>${scoreText}</b>\n` +
    `Kirituvchi: <b>${uploaderName}</b>\n\n` +
    `Iltimos, Mini App'ga kirib skrinshotni tekshiring va natijani tasdiqlang yoki e'tiroz bildiring.`;

  const oppMarkup = {
    inline_keyboard: [
      [createAppButton('✅ Natijani tasdiqlash / ko‘rish', `${miniAppUrl}?match_id=${match.id}&view=matches`)]
    ]
  };

  await sendTelegramPhoto(opponentTg, screenshotUrl, oppCaption, oppMarkup);

  // 2. Notify uploader (confirmation of submission)
  const uploaderCaption = `📤 <b>Natijangiz qabul qilindi!</b>\n\n` +
    `Uchrashuv: <b>${homeName}</b> vs <b>${awayName}</b>\n` +
    `Hisob: <b>${scoreText}</b>\n\n` +
    `Skrinshot saqlandi. Raqibingiz tasdiqlashi kutilmoqda.`;

  const uploaderMarkup = {
    inline_keyboard: [
      [createAppButton('📱 Turnirni ochish', `${miniAppUrl}?view=matches`)]
    ]
  };

  await sendTelegramPhoto(uploaderTg, screenshotUrl, uploaderCaption, uploaderMarkup);

  // 3. Group channel/topic notification if TELEGRAM_GROUP_ID configured
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (groupId && botInstance) {
    try {
      const groupCaption = `📢 <b>${match.round}-Tur natijasi yuborildi:</b>\n` +
        `⚔️ <b>${homeName}</b> ${scoreText} <b>${awayName}</b>\n` +
        `Kirituvchi: ${uploaderName} (Raqib tasdig‘i kutilmoqda)`;

      await sendTelegramPhoto(groupId, screenshotUrl, groupCaption);
    } catch (gErr) {
      console.warn(`[Telegram Group] Guruhga yuborishda xatolik (${groupId}):`, gErr.message);
    }
  } else {
    console.log(`[Telegram Group] TELEGRAM_GROUP_ID sozlanmagan. Natijalar Mini App va o‘yinchilar bot chatida saqlandi.`);
  }
}

/**
 * Notify both players about upcoming match
 */
async function notifyMatchReminder(homeTelegramId, awayTelegramId, homeName, awayName, round) {
  const miniAppUrl = config.miniAppUrl;
  const msg = `🏆 <b>eFootball: ${round}-Tur uchrashuvi!</b>\n\n` +
    `Bugun sizning navbatdagi o‘yiningiz bor:\n` +
    `⚔️ <b>${homeName}</b> vs <b>${awayName}</b>\n\n` +
    `O‘yindan so‘ng yakuniy hisob ko‘ringan skrinshotni Mini App orqali yuborishni unutmang!`;

  const markup = {
    inline_keyboard: [
      [createAppButton('📱 Turnirni ochish', `${miniAppUrl}?view=matches`)]
    ]
  };

  await sendTelegramNotification(homeTelegramId, msg, markup);
  await sendTelegramNotification(awayTelegramId, msg, markup);
}

/**
 * Notify both players when result is finalized and confirmed
 */
async function notifyResultConfirmed(homeTg, awayTg, homeName, awayName, scoreText) {
  const miniAppUrl = config.miniAppUrl;
  const message = `🎉 <b>Natija rasman tasdiqlandi!</b>\n\n` +
    `⚔️ <b>${homeName}</b> ${scoreText} <b>${awayName}</b>\n\n` +
    `Ushbu natija rasmiy turnir jadvaliga qo‘shildi.`;

  const markup = {
    inline_keyboard: [
      [createAppButton('📊 Turnir jadvalini ko‘rish', `${miniAppUrl}?view=standings`)]
    ]
  };

  await sendTelegramNotification(homeTg, message, markup);
  await sendTelegramNotification(awayTg, message, markup);

  // Group notification if configured
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (groupId && botInstance) {
    try {
      await botInstance.telegram.sendMessage(groupId, `✅ <b>Natija tasdiqlandi:</b>\n⚔️ <b>${homeName}</b> ${scoreText} <b>${awayName}</b>\nJadval yangilandi!`, { parse_mode: 'HTML' });
    } catch (e) {}
  }
}

module.exports = {
  setBotInstance,
  createAppButton,
  sendTelegramNotification,
  sendTelegramPhoto,
  notifyBothPlayersOfResult,
  notifyMatchReminder,
  notifyResultConfirmed
};

