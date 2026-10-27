const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const { authMiddleware } = require('./middleware/auth');
const { initWebSocket } = require('./services/websocket');
const { initBot, getBot } = require('./bot');
const { startPublicTunnel } = require('./services/tunnelService');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 24/7 Crash-Proof Watchdog Handlers
process.on('uncaughtException', (err) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [UNCAUGHT_EXCEPTION] ${err.stack || err.message}\n`;
  console.error('⚠️ [24/7 Watchdog] Uncaught Exception:', err.message);
  try {
    fs.appendFileSync(path.join(logsDir, 'error.log'), logMessage);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [UNHANDLED_REJECTION] ${reason instanceof Error ? reason.stack : reason}\n`;
  console.error('⚠️ [24/7 Watchdog] Unhandled Rejection:', reason);
  try {
    fs.appendFileSync(path.join(logsDir, 'error.log'), logMessage);
  } catch (e) {}
});

const app = express();
const server = http.createServer(app);

// Initialize WebSockets for real-time live match score updates
initWebSocket(server);

// Ensure uploads folder exists
const uploadsPath = path.join(__dirname, '..', config.uploadDir);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend Mini App (no-cache for HTML/CSS/JS so Telegram WebView updates immediately)
app.use(express.static(path.join(__dirname, '..', 'public'), {
  maxAge: 0,
  etag: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// Serve uploaded screenshots
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d'
}));

// Auth Middleware for all API routes
app.use('/api', authMiddleware);

// API Routes
app.use('/api/league', require('./routes/league'));
app.use('/api/participants', require('./routes/participants'));
app.use('/api/matches', require('./routes/matches'));
app.use('/api/results', require('./routes/results'));
app.use('/api/live', require('./routes/live'));
app.use('/api/taxmin', require('./routes/taxmin'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/admin', require('./routes/admin'));

// Route Aliases
app.get('/api/standings', (req, res, next) => {
  req.url = '/table/standings';
  return require('./routes/matches')(req, res, next);
});
app.get('/api/leagues/active', (req, res, next) => {
  req.url = '/current';
  return require('./routes/league')(req, res, next);
});

// Helper: format uptime
function formatUptime(seconds) {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d} kun`);
  if (h > 0) parts.push(`${h} soat`);
  if (m > 0) parts.push(`${m} daqiqa`);
  parts.push(`${s} soniya`);
  return parts.join(', ');
}

// Production Health Check & Uptime Monitoring
app.get('/api/health', (req, res) => {
  try {
    // Test SQLite database connection
    const dbCheck = db.prepare('SELECT 1 as test').get();
    const isDbConnected = dbCheck && dbCheck.test === 1;

    // Participant and match counts
    const counts = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM participants WHERE status = 'active') as active_participants,
        (SELECT COUNT(*) FROM matches) as total_matches,
        (SELECT COUNT(*) FROM matches WHERE status = 'finished') as finished_matches
    `).get();

    const mem = process.memoryUsage();
    const bot = getBot();
    const { getTunnelStatus } = require('./services/tunnelService');

    res.json({
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      uptime_human: formatUptime(process.uptime()),
      timestamp: new Date().toISOString(),
      node_version: process.version,
      memory: {
        rss_mb: Math.round(mem.rss / (1024 * 1024)),
        heap_used_mb: Math.round(mem.heapUsed / (1024 * 1024)),
        heap_total_mb: Math.round(mem.heapTotal / (1024 * 1024))
      },
      database: {
        status: isDbConnected ? 'connected' : 'error',
        type: 'SQLite (WAL mode)',
        active_participants: counts?.active_participants || 0,
        total_matches: counts?.total_matches || 0,
        finished_matches: counts?.finished_matches || 0
      },
      telegramBot: {
        enabled: Boolean(config.botToken),
        connected: Boolean(bot && bot.botInfo),
        username: bot?.botInfo?.username || null
      },
      miniApp: {
        url: config.miniAppUrl,
        isHttps: config.miniAppUrl.startsWith('https://')
      },
      tunnel: getTunnelStatus()
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Direct root health endpoints
app.get('/health', (req, res) => {
  const { getTunnelStatus } = require('./services/tunnelService');
  res.json({
    status: 'ok',
    uptime: formatUptime(process.uptime()),
    tunnel: getTunnelStatus()
  });
});

app.get('/ping', (req, res) => {
  res.status(200).send('PONG');
});

// Lightweight ping for keepalive watchdog
app.get('/api/health/ping', (req, res) => {
  res.status(200).send('PONG');
});

// Dedicated Web Admin Panel page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

// Fallback route for SPA
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start server
server.listen(config.port, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`⚽ eFootball League & Telegram Mini App Production Server`);
  console.log(`🚀 Port:         ${config.port}`);
  console.log(`🌐 Local Web:    http://localhost:${config.port}`);
  console.log(`📱 Mini App URL: ${config.miniAppUrl}`);
  console.log(`======================================================\n`);

  // Start Telegram Bot
  const bot = initBot();

  // If a production HTTPS URL is configured, use it directly; otherwise launch zero-warning SSH HTTPS tunnel
  if (config.miniAppUrl && config.miniAppUrl.startsWith('https://')) {
    if (bot) {
      bot.telegram.setChatMenuButton({
        menu_button: {
          type: 'web_app',
          text: '🏆 Turnirni ochish',
          web_app: { url: config.miniAppUrl }
        }
      }).then(() => {
        console.log(`✅ Telegram Bot chat menu buttoniga rasmiy HTTPS Mini App ulandi:`);
        console.log(`👉 ${config.miniAppUrl}`);
      }).catch((err) => {
        console.warn('Telegram chat menu button o\'rnatishda xatolik:', err.message);
      });
    }
  } else {
    // Start automated zero-warning HTTPS tunnel
    startPublicTunnel(config.port, bot);
  }
});

module.exports = { app, server };
