const assert = require('assert');
const http = require('http');
const { app } = require('../server/index');
const {
  startKeepAlive,
  stopKeepAlive,
  pingTarget,
  getKeepAliveStatus,
  resolveTargetUrl
} = require('../server/services/keepAlive');

console.log('🧪 ==========================================');
console.log('🧪 Render 24/7 Keep-Alive & Health Check Test Suite');
console.log('🧪 ==========================================\n');

async function runKeepAliveTests() {
  const PORT = 3999;
  let testServer;

  await new Promise((resolve) => {
    testServer = app.listen(PORT, '127.0.0.1', () => {
      console.log(`✅ Test server running on http://127.0.0.1:${PORT}`);
      resolve();
    });
  });

  try {
    // Test 1: Root /ping endpoint returns 200 OK JSON
    console.log('\n▶ Test 1: /ping endpoint tekshirilmoqda...');
    const pingRes = await fetch(`http://127.0.0.1:${PORT}/ping`);
    assert.strictEqual(pingRes.status, 200, '/ping 200 status qaytarishi kerak');
    const pingData = await pingRes.json();
    assert.strictEqual(pingData.status, 'ok');
    assert.strictEqual(pingData.pong, true);
    console.log('✅ /ping muvaffaqiyatli:', pingData);

    // Test 2: Root /health endpoint returns 200 OK JSON with uptime & keepAlive
    console.log('\n▶ Test 2: /health endpoint tekshirilmoqda...');
    const healthRes = await fetch(`http://127.0.0.1:${PORT}/health`);
    assert.strictEqual(healthRes.status, 200, '/health 200 status qaytarishi kerak');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'ok');
    assert(typeof healthData.uptime_seconds === 'number', 'uptime_seconds son bo‘lishi kerak');
    assert(healthData.keepAlive, 'keepAlive holati mavjud bo‘lishi kerak');
    console.log('✅ /health muvaffaqiyatli (Uptime: ' + healthData.uptime_seconds + 's)');

    // Test 3: /api/keep-alive endpoint
    console.log('\n▶ Test 3: /api/keep-alive endpoint tekshirilmoqda...');
    const apiRes = await fetch(`http://127.0.0.1:${PORT}/api/keep-alive`);
    assert.strictEqual(apiRes.status, 200);
    const apiData = await apiRes.json();
    assert.strictEqual(apiData.success, true);
    assert(apiData.keepAlive, 'keepAlive ma\'lumoti qaytishi kerak');
    console.log('✅ /api/keep-alive muvaffaqiyatli');

    // Test 4: pingTarget function
    console.log('\n▶ Test 4: pingTarget() funksiyasi tekshirilmoqda...');
    const pingResult = await pingTarget(`http://127.0.0.1:${PORT}/ping`);
    assert.strictEqual(pingResult.success, true);
    assert.strictEqual(pingResult.statusCode, 200);
    assert(typeof pingResult.duration === 'number');
    console.log(`✅ pingTarget() ishladi (${pingResult.duration}ms)`);

    // Test 5: Resolve target URL
    console.log('\n▶ Test 5: resolveTargetUrl() tekshirilmoqda...');
    process.env.RENDER_EXTERNAL_URL = 'https://my-app.onrender.com';
    const resolved = resolveTargetUrl();
    assert.strictEqual(resolved, 'https://my-app.onrender.com');
    delete process.env.RENDER_EXTERNAL_URL;
    console.log('✅ resolveTargetUrl() RENDER_EXTERNAL_URL ni to‘g‘ri aniqladi');

    // Test 6: getKeepAliveStatus reflects ping counts
    console.log('\n▶ Test 6: getKeepAliveStatus() tekshirilmoqda...');
    const status = getKeepAliveStatus();
    assert(status.pingCount >= 1, 'Kamida 1 ta ping hisoblangan bo‘lishi kerak');
    assert(status.successfulPings >= 1, 'Muvaffaqiyatli pinglar mavjud bo‘lishi kerak');
    console.log('✅ getKeepAliveStatus() hisoblagichlari to‘g‘ri:', status);

    console.log('\n==========================================');
    console.log('🎉 KEEP-ALIVE BARCHA TESTLARI MUVAFFAQIYATLI!');
    console.log('==========================================\n');
    process.exit(0);
  } finally {
    stopKeepAlive();
    await new Promise((resolve) => testServer.close(resolve));
  }
}

runKeepAliveTests().catch((err) => {
  console.error('❌ Test xatoligi:', err);
  process.exit(1);
});
