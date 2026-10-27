const http = require('http');
const fs = require('fs');
const path = require('path');
const db = require('../server/db');
const config = require('../server/config');
const { notifyBothPlayersOfResult, notifyAdminSubmissionForConfirmation } = require('../server/services/botNotifier');

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (payload) {
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 === DUAL CONFIRMATION & EXCLUSION TESTS ===\n');

  // Verify "Gollar va o'yin statistikasi" is removed from matches.js
  console.log('--- TEST 0: Frontend check - Gollar va o‘yin statistikasi must NOT exist ---');
  const matchesJsPath = path.join(__dirname, '../public/js/views/matches.js');
  const matchesJsContent = fs.readFileSync(matchesJsPath, 'utf8');

  if (matchesJsContent.includes("Gollar va o‘yin statistikasi") ||
      matchesJsContent.includes("adminHomePossession") ||
      matchesJsContent.includes("adminHomeShots")) {
    console.error("❌ FAIL: 'Gollar va o‘yin statistikasi' or stats inputs still present in matches.js");
    process.exit(1);
  } else {
    console.log("✅ PASS: 'Gollar va o‘yin statistikasi' completely removed from matches.js");
  }

  // Get active league
  const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
  if (!league) {
    console.error('❌ Active league not found');
    process.exit(1);
  }

  // Get two active participants (e.g. Shox and opponent)
  const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active' LIMIT 2").all(league.id);
  if (participants.length < 2) {
    console.error('❌ Need at least 2 participants');
    process.exit(1);
  }

  const p1 = participants[0];
  const p2 = participants[1];
  console.log(`P1 (Shox): ${p1.player_name} (tg: ${p1.telegram_id})`);
  console.log(`P2 (Opponent): ${p2.player_name} (tg: ${p2.telegram_id})`);

  let testMatch = db.prepare(`
    SELECT * FROM matches 
    WHERE league_id = ? 
      AND ((home_participant_id = ? AND away_participant_id = ?) 
        OR (home_participant_id = ? AND away_participant_id = ?))
    LIMIT 1
  `).get(league.id, p1.id, p2.id, p2.id, p1.id);

  if (!testMatch) {
    const info = db.prepare(`
      INSERT INTO matches (league_id, round, home_participant_id, away_participant_id, status)
      VALUES (?, 1, ?, ?, 'scheduled')
    `).run(league.id, p1.id, p2.id);
    testMatch = db.prepare("SELECT * FROM matches WHERE id = ?").get(info.lastInsertRowid);
  }

  // Reset match to scheduled in round 1
  db.prepare(`
    UPDATE matches 
    SET round = 1, home_score = NULL, away_score = NULL, status = 'scheduled',
        home_confirmed = 0, away_confirmed = 0, dispute_reason = NULL,
        screenshot_url = NULL
    WHERE id = ?
  `).run(testMatch.id);

  // Obtain verified Admin session token
  const loginRes = await request('POST', '/api/admin/login', { password: config.adminPassword });
  if (!loginRes.data?.token) {
    console.error('❌ Admin login failed', loginRes);
    process.exit(1);
  }
  const adminToken = loginRes.data.token;
  const adminHeaders = { 'x-admin-token': adminToken };

  const p1Headers = { 'x-telegram-user': JSON.stringify({ id: String(p1.telegram_id), first_name: p1.player_name }) };
  const p2Headers = { 'x-telegram-user': JSON.stringify({ id: String(p2.telegram_id), first_name: p2.player_name }) };
  const strangerHeaders = { 'x-telegram-user': JSON.stringify({ id: '999999999', first_name: 'Stranger' }) };

  // Initial standings check
  const initStandings = await request('GET', '/api/standings');
  const getPlayed = (pId) => {
    const row = initStandings.data?.standings?.find(s => s.participant_id === pId);
    return row ? row.played : 0;
  };
  const p1InitPlayed = getPlayed(p1.id);
  const p2InitPlayed = getPlayed(p2.id);

  // TEST 1: Submitter exclusion check in notifier
  console.log('\n--- TEST 1: Submitter Telegram ID exclusion in notifications ---');
  // Mock botInstance to track recipients
  let notifiedRecipients = [];
  const fakeBot = {
    telegram: {
      sendPhoto: async (tgId) => {
        notifiedRecipients.push(String(tgId));
        return true;
      },
      sendMessage: async (tgId) => {
        notifiedRecipients.push(String(tgId));
        return true;
      }
    }
  };
  const { setBotInstance } = require('../server/services/botNotifier');
  setBotInstance(fakeBot);

  const matchData = db.prepare(`
    SELECT m.*, 
      h.player_name as home_name, h.telegram_id as home_tg,
      a.player_name as away_name, a.telegram_id as away_tg
    FROM matches m
    JOIN participants h ON m.home_participant_id = h.id
    JOIN participants a ON m.away_participant_id = a.id
    WHERE m.id = ?
  `).get(testMatch.id);

  notifiedRecipients = [];
  await notifyBothPlayersOfResult(matchData, p1.telegram_id, "2 - 1", "/uploads/mock.jpg");

  console.log(`Submitter: ${p1.telegram_id}, Recipients received: ${JSON.stringify(notifiedRecipients)}`);
  if (!notifiedRecipients.includes(String(p1.telegram_id)) && notifiedRecipients.includes(String(p2.telegram_id))) {
    console.log('✅ PASS: Submitter Shox was excluded from recipients! Only opponent received message.');
  } else {
    console.error('❌ FAIL: Submitter was not excluded from recipients!');
    process.exit(1);
  }

  // TEST 2: Shox enters match result via API
  console.log('\n--- TEST 2: Shox enters match result via API ---');
  notifiedRecipients = [];
  const submitRes = await request('POST', `/api/results/submit/${testMatch.id}`, {
    home_score: 3,
    away_score: 1,
    screenshot_url: '/uploads/screenshot_sample.jpg'
  }, p1Headers);

  console.log(`Submit result: ${submitRes.status}, message: ${submitRes.data?.message}`);
  const matchAfterSubmit = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  const isP1Home = testMatch.home_participant_id === p1.id;
  const p1Confirmed = isP1Home ? matchAfterSubmit.home_confirmed : matchAfterSubmit.away_confirmed;
  const p2Confirmed = isP1Home ? matchAfterSubmit.away_confirmed : matchAfterSubmit.home_confirmed;

  console.log(`DB state: status=${matchAfterSubmit.status}, Shox confirmed=${p1Confirmed}, Opponent confirmed=${p2Confirmed}`);
  if (matchAfterSubmit.status === 'submitted' && p1Confirmed === 1 && p2Confirmed === 0) {
    console.log('✅ PASS: Shox confirmed side, Opponent pending (0)');
  } else {
    console.error('❌ FAIL: Unexpected confirmation state after Shox submit');
    process.exit(1);
  }

  // TEST 3: Standings table must NOT include this match while pending opponent confirmation
  console.log('\n--- TEST 3: Standings table unchanged while pending opponent confirmation ---');
  const pendingStandings = await request('GET', '/api/standings');
  const p1PendingPlayed = pendingStandings.data?.standings?.find(s => s.participant_id === p1.id)?.played || 0;
  const p2PendingPlayed = pendingStandings.data?.standings?.find(s => s.participant_id === p2.id)?.played || 0;

  console.log(`Pending played: P1=${p1PendingPlayed} (init: ${p1InitPlayed}), P2=${p2PendingPlayed} (init: ${p2InitPlayed})`);
  if (p1PendingPlayed === p1InitPlayed && p2PendingPlayed === p2InitPlayed) {
    console.log('✅ PASS: Standings completely unchanged while waiting for opponent confirmation');
  } else {
    console.error('❌ FAIL: Standings changed prematurely!');
    process.exit(1);
  }

  // TEST 4: Opponent confirms result
  console.log('\n--- TEST 4: Opponent confirms result ---');
  const p2ConfirmRes = await request('POST', `/api/results/confirm/${testMatch.id}`, {}, p2Headers);
  console.log(`Opponent confirm: status=${p2ConfirmRes.status}, bothConfirmed=${p2ConfirmRes.data?.bothConfirmed}`);

  const matchAfterBoth = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  console.log(`DB state: status=${matchAfterBoth.status}, home_confirmed=${matchAfterBoth.home_confirmed}, away_confirmed=${matchAfterBoth.away_confirmed}`);

  if (matchAfterBoth.status === 'finished' && matchAfterBoth.home_confirmed === 1 && matchAfterBoth.away_confirmed === 1) {
    console.log('✅ PASS: Opponent confirmed, match is officially finished!');
  } else {
    console.error('❌ FAIL: Match not marked finished after opponent confirmed');
    process.exit(1);
  }

  // TEST 5: Standings updated now that opponent confirmed
  console.log('\n--- TEST 5: Standings updated after opponent confirmation ---');
  const finalStandings = await request('GET', '/api/standings');
  const p1FinalPlayed = finalStandings.data?.standings?.find(s => s.participant_id === p1.id)?.played || 0;
  const p2FinalPlayed = finalStandings.data?.standings?.find(s => s.participant_id === p2.id)?.played || 0;

  console.log(`Final played: P1=${p1FinalPlayed} (init: ${p1InitPlayed}), P2=${p2FinalPlayed} (init: ${p2InitPlayed})`);
  if (p1FinalPlayed === p1InitPlayed + 1 && p2FinalPlayed === p2InitPlayed + 1) {
    console.log('✅ PASS: Standings accurately updated after opponent confirmation!');
  } else {
    console.error('❌ FAIL: Standings did not update correctly');
    process.exit(1);
  }

  // TEST 6: Opponent disputes/rejects
  console.log('\n--- TEST 6: Opponent disputes/rejects flow ---');
  // Re-submit
  await request('POST', `/api/results/submit/${testMatch.id}`, {
    home_score: 5,
    away_score: 0,
    screenshot_url: '/uploads/screenshot_sample.jpg'
  }, p1Headers);

  const disputeRes = await request('POST', `/api/results/dispute/${testMatch.id}`, {
    reason: "Hisob noto'g'ri, men ham 1 ta gol urgandim"
  }, p2Headers);

  const matchAfterDispute = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  console.log(`Dispute state: status=${matchAfterDispute.status}, reason: ${matchAfterDispute.dispute_reason}`);
  if (matchAfterDispute.status === 'disputed' && matchAfterDispute.home_confirmed === 0 && matchAfterDispute.away_confirmed === 0) {
    console.log('✅ PASS: Opponent dispute set status to disputed, awaiting admin review');
  } else {
    console.error('❌ FAIL: Dispute state incorrect');
    process.exit(1);
  }

  console.log('\n🎉 === ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
