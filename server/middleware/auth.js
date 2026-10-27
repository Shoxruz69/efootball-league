const crypto = require('crypto');
const config = require('../config');

// In-memory server-side session store for Web Admin (token -> { createdAt, expiresAt })
const adminSessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  adminSessions.set(token, {
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS
  });
  return token;
}

function validateAdminSession(token) {
  if (!token || typeof token !== 'string') return false;
  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function destroyAdminSession(token) {
  if (token) {
    adminSessions.delete(token);
  }
}

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of adminSessions.entries()) {
    if (now > session.expiresAt) {
      adminSessions.delete(token);
    }
  }
}, 60 * 60 * 1000);

/**
 * Validate Telegram Mini App initData signature cryptographically
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return null;
    urlParams.delete('hash');

    const dataCheckArr = [];
    urlParams.sort();
    for (const [key, value] of urlParams.entries()) {
      dataCheckArr.push(`${key}=${value}`);
    }
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash === hash) {
      const userStr = urlParams.get('user');
      return userStr ? JSON.parse(userStr) : null;
    }
  } catch (err) {
    console.error('Telegram initData tekshirishda xatolik:', err);
  }
  return null;
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(c => {
    const [k, v] = c.trim().split('=');
    if (k && v) cookies[k] = decodeURIComponent(v);
  });
  return cookies;
}

/**
 * Express middleware to identify Telegram user and Admin privileges
 * Security Guarantee:
 * - Admin rights via Telegram ID are granted ONLY if initData HMAC-SHA256 signature is verified.
 * - Admin rights via Web are granted ONLY if a valid, unexpired server session exists.
 * - Raw/unverified headers NEVER grant admin privileges.
 */
function authMiddleware(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  const devUserHeader = req.headers['x-telegram-user'];
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = req.headers['x-admin-token'] || cookies['admin_session'];

  // Default initial security state
  req.isAdmin = false;
  req.isAdminSession = false;
  req.telegramUser = null;

  // 1. Check Web Admin Session (Header or Cookie)
  if (sessionToken && validateAdminSession(sessionToken)) {
    req.isAdmin = true;
    req.isAdminSession = true;
    req.adminToken = sessionToken;
    req.telegramUser = {
      id: 'admin_web',
      first_name: 'Liga Admini',
      username: 'admin'
    };
    return next();
  }

  // 2. Check official Telegram WebApp initData (Cryptographic HMAC validation)
  if (initData && config.botToken) {
    const validatedUser = validateTelegramInitData(initData, config.botToken);
    if (validatedUser) {
      req.telegramUser = validatedUser;
      // Grant admin ONLY if verified Telegram ID matches ADMIN_TELEGRAM_IDS
      req.isAdmin = config.adminId.includes(String(validatedUser.id));
      return next();
    }
  }

  // 3. Dev user simulation header (ONLY for non-admin participant operations, NEVER for admin)
  if (devUserHeader) {
    try {
      const user = JSON.parse(devUserHeader);
      req.telegramUser = user;
      req.isAdmin = false; // Strictly non-admin for raw unverified headers
      return next();
    } catch (e) {}
  }

  // 4. Default fallback guest
  req.telegramUser = {
    id: '999999999',
    first_name: 'Mehmon Foydalanuvchi',
    username: 'guest_player'
  };
  req.isAdmin = false;

  next();
}

module.exports = {
  authMiddleware,
  validateTelegramInitData,
  createAdminSession,
  validateAdminSession,
  destroyAdminSession
};
