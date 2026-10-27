require('dotenv').config();

const adminIdsRaw = process.env.ADMIN_TELEGRAM_IDS || process.env.ADMIN_ID || '123456789';
const adminPasswordRaw = process.env.ADMIN_PASSWORD || process.env.ADMIN_SECRET_KEY || 'efootball_admin_2026';

module.exports = {
  port: process.env.PORT || 3000,
  botToken: process.env.BOT_TOKEN || '',
  adminId: adminIdsRaw.split(',').map(s => s.trim()).filter(Boolean),
  adminPassword: adminPasswordRaw.trim(),
  adminSecretKey: adminPasswordRaw.trim(),
  miniAppUrl: process.env.MINI_APP_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000',
  ngrokAuthToken: process.env.NGROK_AUTHTOKEN || process.env.NGROK_AUTH_TOKEN || '',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  uploadDir: process.env.UPLOAD_DIR || 'uploads'
};
