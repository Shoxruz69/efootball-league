const http = require('http');
const db = require('../server/db');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 ==========================================');
  console.log('🧪 Ro‘yxatdan o‘tish, Sessiya va Sahifalar Testi');
  console.log('🧪 ==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, title) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      failed++;
    }
  }

  const testTgId = '999888' + Date.now().toString().slice(-4);
  const testNick = 'Player_' + Math.floor(Math.random() * 9000 + 1000);
  const simUser = { id: testTgId, first_name: 'Test', username: 'testuser' };

  // 1. Validation Test: 1-char nickname
  const resShort = await request('POST', '/api/participants/register', {
    nickname: 'A',
    rules_accepted: true
  }, { 'x-telegram-user': JSON.stringify(simUser) });
  assert(resShort.status === 400 && resShort.data.message.includes('kamida 2'), '1 ta belgili nickname xatolik beradi');

  // 2. Validation Test: Rules not accepted
  const resNoRules = await request('POST', '/api/participants/register', {
    nickname: testNick,
    rules_accepted: false
  }, { 'x-telegram-user': JSON.stringify(simUser) });
  assert(resNoRules.status === 400 && resNoRules.data.message.includes('qoidalarga rozilik'), 'Qoidalarga rozilik belgilanmaganda xatolik beradi');

  // 3. Successful Registration
  const resSuccess = await request('POST', '/api/participants/register', {
    nickname: testNick,
    rules_accepted: true
  }, { 'x-telegram-user': JSON.stringify(simUser) });
  
  assert(resSuccess.status === 200, 'Muvaffaqiyatli ro‘yxatdan o‘tish HTTP 200 qaytaradi');
  assert(resSuccess.data.success === true, 'Muvaffaqiyatli ro‘yxatdan o‘tish success: true');
  assert(resSuccess.data.participant && resSuccess.data.participant.player_name === testNick, 'Javobda yangi ishtirokchi va aniq nickname mavjud');
  assert(resSuccess.data.message.includes(testNick), 'Xabarda to‘g‘ri nickname aks etadi');

  // 4. Verify duplicate nickname rejected
  const resDupNick = await request('POST', '/api/participants/register', {
    nickname: testNick.toLowerCase(),
    rules_accepted: true
  }, { 'x-telegram-user': JSON.stringify({ id: 'diff_id_' + Date.now(), first_name: 'Other' }) });
  assert(resDupNick.status === 400 && resDupNick.data.message.includes('band'), 'Takroriy nickname (katta-kichik harf) rad etiladi');

  // 5. Verify user in Standings table
  const resStandings = await request('GET', '/api/matches/table/standings');
  assert(resStandings.status === 200, 'Jadval API HTTP 200 qaytaradi');
  const foundInStandings = resStandings.data.standings.find(s => s.player_name === testNick);
  assert(Boolean(foundInStandings), `Jadvalda yangi o‘yinchi (${testNick}) mavjud`);

  // 6. Verify User Session / Profile restoration
  const resProfile = await request('GET', '/api/participants/me', null, {
    'x-telegram-user': JSON.stringify(simUser)
  });
  assert(resProfile.status === 200, 'Profil API HTTP 200 qaytaradi');
  assert(resProfile.data.participant && resProfile.data.participant.player_name === testNick, 'Profil o‘yinchining to‘g‘ri sessiyasi va nicknamesini qaytaradi');

  // 7. Verify Matches View API
  const resMatches = await request('GET', '/api/matches', null, {
    'x-telegram-user': JSON.stringify(simUser)
  });
  assert(resMatches.status === 200, 'Natija (Matches) API HTTP 200 qaytaradi');
  assert(Array.isArray(resMatches.data.matches), 'Matches massiv shaklida qaytadi');
  assert(Array.isArray(resMatches.data.rounds), 'Rounds massiv shaklida qaytadi');

  // Clean up created test participants
  const db = require('../server/db');
  db.prepare("DELETE FROM participants WHERE telegram_id LIKE 'test_tg_%' OR telegram_id LIKE '999888%' OR player_name LIKE 'Player_%' OR player_name LIKE 'NewNick_%'").run();

  console.log('\n==========================================');
  console.log(`Natija: ${passed} ta o‘tdi, ${failed} ta xato`);
  console.log('==========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test kutilmagan xatolik bilan to‘xtadi:', err);
  process.exit(1);
});
