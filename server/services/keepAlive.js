/**
 * Render 24/7 Keep-Alive Service
 *
 * Render Free Tier Web Services spin down (sleep) after 15 minutes of inactivity.
 * This service runs in the background and sends an HTTP/HTTPS GET request to its own
 * public URL (e.g. https://<app-name>.onrender.com/ping) every 10 minutes.
 *
 * This continuous traffic resets Render's 15-minute idle countdown, keeping the
 * web service, WebSocket server, and Telegram bot alive 24/7.
 */

const http = require('http');
const https = require('https');
const config = require('../config');

let keepAliveTimer = null;
let initialTimer = null;

const state = {
  enabled: false,
  targetUrl: null,
  pingUrl: null,
  intervalMs: 10 * 60 * 1000, // 10 minutes (well under Render's 15 min idle threshold)
  pingCount: 0,
  successfulPings: 0,
  failedPings: 0,
  lastPingTime: null,
  lastPingStatus: null,
  lastDurationMs: null
};

/**
 * Resolve target external URL
 */
function resolveTargetUrl() {
  const candidates = [
    process.env.KEEP_ALIVE_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.SERVER_URL,
    config.miniAppUrl
  ];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (
      (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
      !trimmed.includes('localhost') &&
      !trimmed.includes('127.0.0.1')
    ) {
      return trimmed.replace(/\/+$/, '');
    }
  }

  // Explicit override or dev testing
  if (process.env.FORCE_KEEP_ALIVE === 'true' && config.miniAppUrl) {
    return config.miniAppUrl.replace(/\/+$/, '');
  }

  return null;
}

/**
 * Send a single lightweight HTTP/HTTPS GET request to keep service awake
 */
function pingTarget(urlToPing) {
  return new Promise((resolve) => {
    const target = urlToPing || state.pingUrl;
    if (!target) {
      return resolve({ success: false, error: 'Target URL belgilanmagan' });
    }

    try {
      const parsedUrl = new URL(target);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const startTime = Date.now();

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        timeout: 25000,
        headers: {
          'User-Agent': 'Render-24-7-KeepAlive/1.0 (Efootball League 24/7 Watchdog)',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      };

      const req = client.request(options, (res) => {
        // Drain incoming stream so memory is freed
        res.resume();

        const duration = Date.now() - startTime;
        state.pingCount++;
        state.lastPingTime = new Date().toISOString();
        state.lastDurationMs = duration;

        if (res.statusCode >= 200 && res.statusCode < 400) {
          state.successfulPings++;
          state.lastPingStatus = `OK (${res.statusCode})`;
          console.log(`⚡ [Keep-Alive 24/7] Ping muvaffaqiyatli: ${target} -> ${res.statusCode} (${duration}ms) [Jami: #${state.pingCount}]`);
          resolve({ success: true, statusCode: res.statusCode, duration });
        } else {
          state.failedPings++;
          state.lastPingStatus = `HTTP_${res.statusCode}`;
          console.warn(`⚠️ [Keep-Alive 24/7] Ping kutilmagan javob qaytardi: ${target} -> ${res.statusCode} (${duration}ms)`);
          resolve({ success: false, statusCode: res.statusCode, duration });
        }
      });

      req.on('timeout', () => {
        req.destroy(new Error('Ulanish vaqti tugadi (Timeout: 25s)'));
      });

      req.on('error', (err) => {
        state.pingCount++;
        state.failedPings++;
        state.lastPingTime = new Date().toISOString();
        state.lastPingStatus = `Error: ${err.message}`;
        console.warn(`⚠️ [Keep-Alive 24/7] Ping yuborishda ogohlantirish (${target}): ${err.message}`);
        resolve({ success: false, error: err.message });
      });

      req.end();
    } catch (err) {
      state.pingCount++;
      state.failedPings++;
      state.lastPingTime = new Date().toISOString();
      state.lastPingStatus = `Exception: ${err.message}`;
      console.warn(`⚠️ [Keep-Alive 24/7] Xatolik: ${err.message}`);
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Start the 24/7 Keep-Alive watchdog loop
 */
function startKeepAlive() {
  const targetUrl = resolveTargetUrl();

  const customInterval = parseInt(process.env.KEEP_ALIVE_INTERVAL_MS, 10);
  if (customInterval && customInterval >= 60000) {
    state.intervalMs = customInterval;
  }

  if (!targetUrl) {
    state.enabled = false;
    state.targetUrl = null;
    state.pingUrl = null;
    console.log('ℹ️ [Keep-Alive 24/7] Tashqi Render/Server URL aniqlanmadi (localhost rejimida).');
    console.log('💡 Renderda RENDER_EXTERNAL_URL avtomatik qo\'llanadi yoki .env faylda KEEP_ALIVE_URL=https://... belgilash mumkin.');
    return state;
  }

  state.enabled = true;
  state.targetUrl = targetUrl;
  state.pingUrl = `${targetUrl}/ping`;

  const intervalMinutes = Math.round(state.intervalMs / 60000);

  console.log(`\n======================================================`);
  console.log(`🚀 [Keep-Alive 24/7] Render serverini uyg'oq ushlab turish faollashdi!`);
  console.log(`🌐 Tashqi URL:   ${state.targetUrl}`);
  console.log(`🎯 Ping manzili: ${state.pingUrl}`);
  console.log(`⏱️ Interval:     Har ${intervalMinutes} daqiqada (15 min Render limitidan tez)`);
  console.log(`🛡️ 24/7 holat:   Server uxlamasdan to'xtovsiz ishlaydi`);
  console.log(`======================================================\n`);

  // Clear existing timers if any
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  if (initialTimer) clearTimeout(initialTimer);

  // Send an initial ping after 30 seconds to confirm everything is working
  initialTimer = setTimeout(() => {
    pingTarget(state.pingUrl);
  }, 30 * 1000);

  if (initialTimer.unref) initialTimer.unref();

  // Set recurring interval
  keepAliveTimer = setInterval(() => {
    pingTarget(state.pingUrl);
  }, state.intervalMs);

  if (keepAliveTimer.unref) keepAliveTimer.unref();

  return state;
}

/**
 * Stop keep-alive loop (e.g. for graceful shutdown or tests)
 */
function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  if (initialTimer) {
    clearTimeout(initialTimer);
    initialTimer = null;
  }
  state.enabled = false;
}

/**
 * Get current keep-alive status metrics
 */
function getKeepAliveStatus() {
  return {
    enabled: state.enabled,
    targetUrl: state.targetUrl,
    pingUrl: state.pingUrl,
    intervalMinutes: Math.round(state.intervalMs / 60000),
    intervalMs: state.intervalMs,
    pingCount: state.pingCount,
    successfulPings: state.successfulPings,
    failedPings: state.failedPings,
    lastPingTime: state.lastPingTime,
    lastPingStatus: state.lastPingStatus,
    lastDurationMs: state.lastDurationMs
  };
}

module.exports = {
  startKeepAlive,
  stopKeepAlive,
  pingTarget,
  getKeepAliveStatus,
  resolveTargetUrl
};
