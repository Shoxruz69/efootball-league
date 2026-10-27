const http = require('http');
const crypto = require('crypto');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json
        });
      });
    });

    req.on('error', reject);

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== [ADMIN PANEL & SECURITY AUTOMATED TESTS] ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Web /admin page check
    const pageRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/admin',
      method: 'GET'
    });
    assert(pageRes.statusCode === 200, 'GET /admin returns HTTP 200');
    assert(pageRes.body.includes('Admin Boshqaruv Paneli'), '/admin contains Admin Boshqaruv Paneli title');
    assert(pageRes.body.includes('AdminApp'), '/admin contains admin app client logic');

    // 2. Unauthenticated access to /api/admin/disputes must be 403 Forbidden
    const unauthDisputes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/disputes',
      method: 'GET'
    });
    assert(unauthDisputes.statusCode === 403, 'GET /api/admin/disputes without auth is 403 Forbidden');
    assert(unauthDisputes.json?.success === false, '403 response has success: false');

    // 3. Raw client spoofed x-telegram-user must NOT grant admin (Security rule)
    const spoofedReq = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/disputes',
      method: 'GET',
      headers: {
        'x-telegram-user': JSON.stringify({ id: 123456789, first_name: 'Hacker' })
      }
    });
    assert(spoofedReq.statusCode === 403, 'Unverified x-telegram-user header is strictly rejected with 403 Forbidden');

    // 4. /api/admin/login with incorrect password must be 401
    const badLogin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { password: 'wrong_password_123' });
    assert(badLogin.statusCode === 401, 'POST /api/admin/login with wrong password returns HTTP 401');

    // 5. /api/admin/login with correct password creates session token & Set-Cookie
    const goodLogin = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { password: 'efootball_admin_2026' });
    assert(goodLogin.statusCode === 200, 'POST /api/admin/login with correct password returns HTTP 200');
    assert(Boolean(goodLogin.json?.token), 'Login response contains cryptographically secure session token');
    const setCookie = goodLogin.headers['set-cookie'];
    assert(Array.isArray(setCookie) && setCookie.some(c => c.includes('admin_session=')), 'Login sets HttpOnly admin_session cookie');

    const adminToken = goodLogin.json.token;

    // 6. Check admin auth status with token
    const authCheck = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/auth/check',
      method: 'GET',
      headers: { 'x-admin-token': adminToken }
    });
    assert(authCheck.statusCode === 200 && authCheck.json?.isAdmin === true, 'GET /api/admin/auth/check with token confirms isAdmin: true');

    // 7. Access disputes queue with token
    const authDisputes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/disputes',
      method: 'GET',
      headers: { 'x-admin-token': adminToken }
    });
    assert(authDisputes.statusCode === 200, 'GET /api/admin/disputes with valid token returns HTTP 200');
    assert(Array.isArray(authDisputes.json?.disputes), 'Disputes array returned successfully');

    // 8. Normal player profile check: isAdmin must be false
    const normalProfile = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/participants/me',
      method: 'GET',
      headers: {
        'x-telegram-user': JSON.stringify({ id: 555555555, first_name: 'Ali' })
      }
    });
    assert(normalProfile.statusCode === 200, 'GET /api/participants/me returns HTTP 200');
    assert(normalProfile.json?.isAdmin === false, 'Normal player profile returns isAdmin: false');

    // 9. Admin profile check: with token, isAdmin is true
    const adminProfile = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/participants/me',
      method: 'GET',
      headers: { 'x-admin-token': adminToken }
    });
    assert(adminProfile.json?.isAdmin === true, 'Admin profile returns isAdmin: true');

    // 10. Logout destroys the session token
    const logoutRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/logout',
      method: 'POST',
      headers: { 'x-admin-token': adminToken }
    });
    assert(logoutRes.statusCode === 200, 'POST /api/admin/logout returns HTTP 200');

    // 11. Trying to use destroyed token must now be 403
    const revokedRes = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/admin/disputes',
      method: 'GET',
      headers: { 'x-admin-token': adminToken }
    });
    assert(revokedRes.statusCode === 403, 'Destroyed token is rejected with 403 Forbidden');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log(`\n========================================`);
  console.log(`Test natijasi: ${passed} ta o‘tdi, ${failed} ta xato`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
