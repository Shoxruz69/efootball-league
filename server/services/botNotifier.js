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
 * Notify ONLY the opponent when a result is submitted.
 * The submitter's Telegram ID is strictly excluded from recipients.
 */
async function notifyBothPlayersOfResult(match, uploaderTg, scoreText, screenshotUrl) {
  const miniAppUrl = config.miniAppUrl;
  const homeName = match.home_name;
  const awayName = match.away_name;
  const uploaderStr = uploaderTg ? String(uploaderTg) : '';
  const isUploaderHome = String(match.home_tg) === uploaderStr;
  const opponentTg = isUploaderHome ? match.away_tg : match.home_tg;
  const uploaderName = isUploaderHome ? homeName : awayName;

  // Strict rule: exclude the submitter's Telegram ID from receiving the notification!
  if (!opponentTg || String(opponentTg) === uploaderStr) {
    return;
  }

  const oppCaption = `⚽ <b>eFootball Liga: Natija kiritildi!</b>\n\n` +
    `Uchrashuv: <b>${homeName}</b> vs <b>${awayName}</b>\n` +
    `Kiritilgan hisob: <b>${scoreText}</b>\n` +
    `Kirituvchi: <b>${uploaderName}</b>\n\n` +
    `Iltimos, natijani tekshirib, tasdiqlang yoki e'tiroz bildiring.\n` +
    `<i>⚠️ Siz tasdiqlaganingizdan so‘ng natija rasman turnir jadvaliga qo‘shiladi.</i>`;

  const oppMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Hisobni tasdiqlash', callback_data: `confirm_match_${match.id}` },
        { text: '❌ Rad etish', callback_data: `dispute_match_${match.id}` }
      ],
      [
        createAppButton('📱 Mini App’da ko‘rish', `${miniAppUrl}?match_id=${match.id}&view=matches`)
      ]
    ]
  };

  // Send ONLY to the opponent (submitter is excluded)
  await sendTelegramPhoto(opponentTg, screenshotUrl, oppCaption, oppMarkup);

  // Group channel/topic notification if TELEGRAM_GROUP_ID configured
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

/**
 * Notify opponent(s) when Admin enters/saves match result for confirmation.
 * The submitter's Telegram ID is strictly excluded from recipients.
 */
async function notifyAdminSubmissionForConfirmation(match, scoreText, screenshotUrl, submitterTg = null) {
  const miniAppUrl = config.miniAppUrl;
  const homeName = match.home_name;
  const awayName = match.away_name;

  const caption = `⚽ <b>eFootball Liga: Uchrashuv natijasi kiritildi!</b>\n\n` +
    `Uchrashuv: <b>${homeName}</b> vs <b>${awayName}</b>\n` +
    `Hisob: <b>${scoreText}</b>\n\n` +
    `Iltimos, natijani tekshirib, tasdiqlang yoki e'tiroz bildiring.\n` +
    `<i>⚠️ Natija tasdiqlangandan so‘ng rasman turnir jadvaliga qo‘shiladi.</i>`;

  const markup = {
    inline_keyboard: [
      [
        { text: '✅ Hisobni tasdiqlash', callback_data: `confirm_match_${match.id}` },
        { text: '❌ Rad etish', callback_data: `dispute_match_${match.id}` }
      ],
      [
        createAppButton('📱 Mini App’da to‘liq ko‘rish', `${miniAppUrl}?match_id=${match.id}&view=matches`)
      ]
    ]
  };

  // STRICT RULE: Exclude the submitter's Telegram ID from receiving the notification!
  const submitterStr = submitterTg ? String(submitterTg) : null;
  const recipients = [];
  if (match.home_tg && String(match.home_tg) !== submitterStr) {
    recipients.push(match.home_tg);
  }
  if (match.away_tg && String(match.away_tg) !== submitterStr) {
    recipients.push(match.away_tg);
  }

  for (const tgId of recipients) {
    await sendTelegramPhoto(tgId, screenshotUrl, caption, markup);
  }

  // Group notification if configured
  const groupId = process.env.TELEGRAM_GROUP_ID;
  if (groupId && botInstance) {
    try {
      const groupCaption = `📢 <b>${match.round}-Tur natijasi kiritildi:</b>\n` +
        `⚔️ <b>${homeName}</b> ${scoreText} <b>${awayName}</b>\n` +
        `⏳ <i>Tasdiqlash kutilmoqda</i>`;
      await sendTelegramPhoto(groupId, screenshotUrl, groupCaption);
    } catch (gErr) {}
  }
}

module.exports = {
  setBotInstance,
  createAppButton,
  sendTelegramNotification,
  sendTelegramPhoto,
  notifyBothPlayersOfResult,
  notifyMatchReminder,
  notifyResultConfirmed,
  notifyAdminSubmissionForConfirmation
};

