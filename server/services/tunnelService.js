const { spawn, exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const config = require('../config');

let tunnelProcess = null;
let currentPublicUrl = null;
let reconnectTimer = null;
let keepaliveTimer = null;
let isStopping = false;
let isStarting = false;
let consecutiveFailures = 0;
let lastPingTime = null;
let isTunnelHealthy = false;
let activeTunnelType = null; // 'cloudflare' | 'ngrok' | 'ssh'

/**
 * Start 24/7 self-healing public HTTPS tunnel.
 * Priority:
 * 1. Cloudflare Quick Tunnel (cloudflared) - 100% free, official Cloudflare edge, zero warnings, rock solid 24/7.
 * 2. ngrok (if NGROK_AUTHTOKEN is configured).
 * 3. SSH tunnel to localhost.run (with proper clean process isolation and keepalive).
 */
function startPublicTunnel(port = 3000, botInstance = null) {
  if (isStopping) return;

  // 1. If NGROK_AUTHTOKEN is provided, prioritize official ngrok
  if (config.ngrokAuthToken) {
    try {
      const ngrok = require('@ngrok/ngrok');
      console.log('⚡ ngrok orqali barqaror HTTPS tunnel ulanmoqda...');
      ngrok.SessionBuilder().authtoken(config.ngrokAuthToken).connect().then(session => {
        return session.httpEndpoint().listen().then(listener => {
          listener.forward(`localhost:${port}`);
          const url = listener.url();
          activeTunnelType = 'ngrok';
          applyUrl(url, botInstance, port);
        });
      }).catch(err => {
        console.warn('⚠️ ngrok ulanishda xatolik (Cloudflare zaxirasiga o‘tilmoqda):', err.message);
        startCloudflareOrSsh(port, botInstance);
      });
      return;
    } catch (e) {
      console.warn('ngrok yuklash xatosi, Cloudflare/SSH zaxiraga o‘tilmoqda:', e.message);
    }
  }

  // 2. Default: Launch Cloudflare Quick Tunnel (or SSH fallback)
  startCloudflareOrSsh(port, botInstance);
}

function startCloudflareOrSsh(port, botInstance) {
  const cfBin = findCloudflaredBin();
  if (cfBin) {
    startCloudflareTunnel(cfBin, port, botInstance);
  } else {
    // If cloudflared binary is not cached, start SSH tunnel
    startSshTunnel(port, botInstance);
  }
}

function findCloudflaredBin() {
  try {
    const untunDir = path.join(os.tmpdir(), 'node-untun');
    if (fs.existsSync(untunDir)) {
      const files = fs.readdirSync(untunDir);
      const cfExe = files.find(f => f.startsWith('cloudflared') && (f.endsWith('.exe') || process.platform !== 'win32'));
      if (cfExe) {
        return path.join(untunDir, cfExe);
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Cloudflare Quick Tunnel (Zero warnings, fast, 100% reliable)
 */
function startCloudflareTunnel(binPath, port, botInstance) {
  if (isStopping || isStarting) return;
  isStarting = true;

  stopTunnelProcess();

  console.log('⚡ Cloudflare HTTPS tunnel ishga tushirilmoqda (ogohlantirishlarsiz, rasmiy Cloudflare)...');

  try {
    tunnelProcess = spawn(binPath, [
      'tunnel',
      '--url', `http://127.0.0.1:${port}`,
      '--no-autoupdate'
    ]);

    activeTunnelType = 'cloudflare';
    let urlFound = false;

    const handleOutput = (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && !urlFound) {
        urlFound = true;
        isStarting = false;
        applyUrl(match[0], botInstance, port);
      }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('close', (code, signal) => {
      isStarting = false;
      isTunnelHealthy = false;
      if (!isStopping) {
        console.warn(`⚠️ Cloudflare tunnel to‘xtadi (kod: ${code || signal}). Qayta ulanmoqda...`);
        scheduleReconnect(port, botInstance);
      }
    });

    tunnelProcess.on('error', (err) => {
      isStarting = false;
      isTunnelHealthy = false;
      console.warn('Cloudflare xatosi, SSH zaxirasiga o‘tilmoqda:', err.message);
      startSshTunnel(port, botInstance);
    });

    // Timeout: if no URL found in 20s, fallback to SSH
    setTimeout(() => {
      if (!urlFound && isStarting && !isStopping) {
        console.warn('Cloudflare URL kechikdi, SSH zaxirasiga o‘tilmoqda...');
        isStarting = false;
        stopTunnelProcess();
        startSshTunnel(port, botInstance);
      }
    }, 20000);

  } catch (err) {
    isStarting = false;
    isTunnelHealthy = false;
    console.warn('Cloudflare ishga tushmadi, SSH zaxirasiga o‘tilmoqda:', err.message);
    startSshTunnel(port, botInstance);
  }
}

/**
 * SSH Tunnel to localhost.run (Backup zero-warning tunnel)
 */
function startSshTunnel(port, botInstance) {
  if (isStopping || isStarting) return;
  isStarting = true;

  stopTunnelProcess();

  console.log('⚡ Ommaviy HTTPS tunnel ishga tushirilmoqda (localhost.run)...');

  try {
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';

    tunnelProcess = spawn('ssh', [
      '-o', 'StrictHostKeyChecking=no',
      '-o', `UserKnownHostsFile=${nullDevice}`,
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      '-o', 'TCPKeepAlive=yes',
      '-R', `80:127.0.0.1:${port}`,
      'nokey@localhost.run'
    ]);

    activeTunnelType = 'ssh';
    let urlFound = false;

    tunnelProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.(?:lhr\.life|localhost\.run)/i);
      if (match && !urlFound) {
        urlFound = true;
        isStarting = false;
        applyUrl(match[0], botInstance, port);
      }
    });

    tunnelProcess.stderr.on('data', (data) => {
      const text = data.toString();
      // If remote forwarded port failed or permission denied, log it
      if (text.includes('remote port forwarding failed') || text.includes('Permission denied')) {
        console.warn('SSH ogohlantirish:', text.trim());
      }
    });

    tunnelProcess.on('close', (code, signal) => {
      isStarting = false;
      isTunnelHealthy = false;
      if (!isStopping) {
        console.warn(`⚠️ Tunnel jarayoni to‘xtadi (kod: ${code !== null ? code : signal}). Qayta ulanadi...`);
        scheduleReconnect(port, botInstance);
      }
    });

    tunnelProcess.on('error', (err) => {
      isStarting = false;
      isTunnelHealthy = false;
      if (!isStopping) {
        console.error('Tunnel xatoligi:', err.message);
        scheduleReconnect(port, botInstance);
      }
    });

    setTimeout(() => {
      if (!urlFound && isStarting && !isStopping) {
        console.warn('⚠️ Tunneldan URL olish vaqti tugadi, qaytadan urinilmoqda...');
        isStarting = false;
        stopTunnelProcess();
        scheduleReconnect(port, botInstance);
      }
    }, 20000);

  } catch (err) {
    isStarting = false;
    isTunnelHealthy = false;
    console.error('SSH tunnelni ishga tushirib bo‘lmadi:', err.message);
    scheduleReconnect(port, botInstance);
  }
}

function applyUrl(httpsUrl, botInstance, port) {
  // Clear any pending reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  currentPublicUrl = httpsUrl;
  config.miniAppUrl = httpsUrl;
  consecutiveFailures = 0;
  isTunnelHealthy = true;
  lastPingTime = new Date().toISOString();

  console.log(`\n======================================================`);
  console.log(`🌐 [TELEGRAM MINI APP YANGI RASMIY HTTPS URL TAYYOR]:`);
  console.log(`👉 ${httpsUrl}`);
  console.log(`(Ogohlantirishsiz, IP kiritishlarsiz, to‘g‘ridan-to‘g‘ri ochiladi)`);
  console.log(`======================================================\n`);

  // Update Telegram Bot menu button so users open the fresh working URL
  if (botInstance && botInstance.telegram) {
    botInstance.telegram.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: '🏆 Turnirni ochish',
        web_app: { url: httpsUrl }
      }
    }).then(() => {
      console.log('✅ Telegram Bot chat menyusiga yangi Mini App URL muvaffaqiyatli bog‘landi!');
    }).catch(err => {
      console.warn('Bot menu button yangilashda xatolik:', err.message);
    });
  }

  // Start active keepalive & auto-healing watchdog loop
  startKeepaliveWatchdog(httpsUrl, port, botInstance);
}

/**
 * Proactive Keepalive & Auto-Healing Watchdog
 * Sends lightweight ping requests every 30 seconds.
 * Only triggers self-healing after 5 consecutive failures (2.5 minutes).
 */
function startKeepaliveWatchdog(httpsUrl, port, botInstance) {
  if (keepaliveTimer) clearInterval(keepaliveTimer);

  keepaliveTimer = setInterval(async () => {
    if (isStopping || !currentPublicUrl || currentPublicUrl !== httpsUrl) {
      clearInterval(keepaliveTimer);
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(`${httpsUrl}/api/health/ping`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.status >= 200 && res.status < 500) {
        consecutiveFailures = 0;
        isTunnelHealthy = true;
        lastPingTime = new Date().toISOString();
      } else {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) {
          console.warn(`⚠️ [Tunnel Watchdog] Ommaviy tunnel holati: HTTP ${res.status}. Xatoliklar soni: ${consecutiveFailures}/5`);
        }
        checkFailures(port, botInstance);
      }
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures >= 3) {
        console.warn(`⚠️ [Tunnel Watchdog] Ping so‘rovi kechikdi (${err.message}). Xatoliklar soni: ${consecutiveFailures}/5`);
      }
      checkFailures(port, botInstance);
    }
  }, 30000);
}

function checkFailures(port, botInstance) {
  if (consecutiveFailures >= 5 && !isStarting && !isStopping) {
    console.error(`🚨 [Auto-Healing] Ommaviy tunnel uzildi (5 marta javob bo‘lmadi). Yangi tunnel ishga tushirilmoqda...`);
    isTunnelHealthy = false;
    consecutiveFailures = 0;
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    stopTunnelProcess();
    startPublicTunnel(port, botInstance);
  }
}

function stopTunnelProcess() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (tunnelProcess) {
    // Remove listeners so this intentional stop does NOT trigger on('close') restart loop
    tunnelProcess.removeAllListeners('close');
    tunnelProcess.removeAllListeners('exit');
    tunnelProcess.removeAllListeners('error');
    if (tunnelProcess.stdout) tunnelProcess.stdout.removeAllListeners();
    if (tunnelProcess.stderr) tunnelProcess.stderr.removeAllListeners();

    try {
      if (process.platform === 'win32' && tunnelProcess.pid) {
        exec(`taskkill /F /T /PID ${tunnelProcess.pid}`, () => {});
      } else {
        tunnelProcess.kill('SIGKILL');
      }
    } catch (e) {}

    tunnelProcess = null;
  }
}

function scheduleReconnect(port, botInstance) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    startPublicTunnel(port, botInstance);
  }, 6000);
}

process.once('SIGINT', () => {
  isStopping = true;
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  stopTunnelProcess();
});

process.once('SIGTERM', () => {
  isStopping = true;
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  stopTunnelProcess();
});

module.exports = {
  startPublicTunnel,
  restartTunnel: (port, bot) => {
    stopTunnelProcess();
    startPublicTunnel(port, bot);
  },
  getPublicUrl: () => currentPublicUrl || config.miniAppUrl,
  getTunnelStatus: () => ({
    url: currentPublicUrl || config.miniAppUrl,
    type: activeTunnelType,
    isHealthy: isTunnelHealthy,
    lastPing: lastPingTime,
    consecutiveFailures
  })
};
