const http = require('http');
const db = require('../server/db');
const config = require('../server/config');

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
  console.log('🚀 === DUAL CONFIRMATION & VERIFICATION TESTS ===\n');

  // Get active league
  const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
  if (!league) {
    console.error('❌ Active league not found');
    process.exit(1);
  }

  // Get two active participants
  const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active' LIMIT 2").all(league.id);
  if (participants.length < 2) {
    console.error('❌ Need at least 2 participants');
    process.exit(1);
  }

  const p1 = participants[0];
  const p2 = participants[1];
  console.log(`P1: ${p1.player_name} (tg: ${p1.telegram_id})`);
  console.log(`P2: ${p2.player_name} (tg: ${p2.telegram_id})`);

  // Ensure a test match exists between p1 and p2
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

  // Reset match to scheduled
  db.prepare(`
    UPDATE matches 
    SET home_score = NULL, away_score = NULL, status = 'scheduled',
        home_confirmed = 0, away_confirmed = 0, dispute_reason = NULL,
        screenshot_url = NULL
    WHERE id = ?
  `).run(testMatch.id);

  // Obtain verified Admin session token via /api/admin/login
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

  // Get initial standings
  const initStandings = await request('GET', '/api/standings');
  const getPlayed = (pId) => {
    const row = initStandings.data?.standings?.find(s => s.participant_id === pId);
    return row ? row.played : 0;
  };
  const p1InitPlayed = getPlayed(p1.id);
  const p2InitPlayed = getPlayed(p2.id);

  console.log(`Initial played: P1=${p1InitPlayed}, P2=${p2InitPlayed}`);

  // TEST 1: Non-admin cannot call admin match update
  console.log('\n--- TEST 1: Non-admin calling PUT /api/admin/matches/:id is blocked ---');
  const nonAdminRes = await request('PUT', `/api/admin/matches/${testMatch.id}`, {
    home_score: 3,
    away_score: 1,
    status: 'finished'
  }, strangerHeaders);

  console.log(`Non-admin status: ${nonAdminRes.status} (Expected: 403)`);
  if (nonAdminRes.status === 403) {
    console.log('✅ PASS: Non-admin cannot edit admin match route');
  } else {
    console.error('❌ FAIL: Non-admin was not blocked');
    process.exit(1);
  }

  // TEST 2: Admin saves match result (with scores, screenshot, and stats)
  console.log('\n--- TEST 2: Admin saves match result ---');
  const adminSaveRes = await request('PUT', `/api/admin/matches/${testMatch.id}`, {
    home_score: 2,
    away_score: 1,
    status: 'submitted',
    screenshot_url: '/uploads/test_screenshot.jpg',
    stats: {
      possession: [60, 40],
      shots: [8, 4],
      shotsOnTarget: [5, 2]
    }
  }, adminHeaders);

  console.log(`Admin save response: ${adminSaveRes.status}, status: ${adminSaveRes.data?.match?.status}`);
  const matchAfterAdminSave = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  console.log(`DB state: status=${matchAfterAdminSave.status}, home_confirmed=${matchAfterAdminSave.home_confirmed}, away_confirmed=${matchAfterAdminSave.away_confirmed}`);

  if (matchAfterAdminSave.status === 'submitted' && matchAfterAdminSave.home_confirmed === 0 && matchAfterAdminSave.away_confirmed === 0) {
    console.log('✅ PASS: Match saved as submitted, both confirmations 0');
  } else {
    console.error('❌ FAIL: Match not in expected submitted/unconfirmed state');
    process.exit(1);
  }

  // TEST 3: Standings table must NOT include this match while pending
  console.log('\n--- TEST 3: Standings table must NOT be updated while pending ---');
  const pendingStandings = await request('GET', '/api/standings');
  const p1PendingPlayed = pendingStandings.data?.standings?.find(s => s.participant_id === p1.id)?.played || 0;
  const p2PendingPlayed = pendingStandings.data?.standings?.find(s => s.participant_id === p2.id)?.played || 0;

  console.log(`Pending played: P1=${p1PendingPlayed} (init: ${p1InitPlayed}), P2=${p2PendingPlayed} (init: ${p2InitPlayed})`);
  if (p1PendingPlayed === p1InitPlayed && p2PendingPlayed === p2InitPlayed) {
    console.log('✅ PASS: Standings completely unchanged while pending dual confirmation');
  } else {
    console.error('❌ FAIL: Standings changed prematurely!');
    process.exit(1);
  }

  // TEST 4: Player 1 confirms result
  console.log('\n--- TEST 4: Player 1 confirms result ---');
  const p1ConfirmRes = await request('POST', `/api/results/confirm/${testMatch.id}`, {}, p1Headers);
  console.log(`P1 confirm: bothConfirmed=${p1ConfirmRes.data?.bothConfirmed}, message: ${p1ConfirmRes.data?.message}`);

  const matchAfterP1 = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  const isP1Home = testMatch.home_participant_id === p1.id;
  const p1Flag = isP1Home ? matchAfterP1.home_confirmed : matchAfterP1.away_confirmed;
  const p2Flag = isP1Home ? matchAfterP1.away_confirmed : matchAfterP1.home_confirmed;

  console.log(`DB state: status=${matchAfterP1.status}, P1 confirmed=${p1Flag}, P2 confirmed=${p2Flag}`);

  if (matchAfterP1.status === 'submitted' && p1Flag === 1 && p2Flag === 0) {
    console.log('✅ PASS: P1 confirmed, match remains submitted waiting for P2');
  } else {
    console.error('❌ FAIL: P1 confirmation state unexpected');
    process.exit(1);
  }

  // TEST 5: Standings STILL must not update with only 1 confirmation
  console.log('\n--- TEST 5: Standings STILL unchanged with 1 of 2 confirmations ---');
  const midStandings = await request('GET', '/api/standings');
  const p1MidPlayed = midStandings.data?.standings?.find(s => s.participant_id === p1.id)?.played || 0;
  if (p1MidPlayed === p1InitPlayed) {
    console.log('✅ PASS: Standings still unaffected with single confirmation');
  } else {
    console.error('❌ FAIL: Standings updated with only 1 confirmation!');
    process.exit(1);
  }

  // TEST 6: Player 2 confirms result (Both now confirmed!)
  console.log('\n--- TEST 6: Player 2 confirms result (Both confirmed) ---');
  const p2ConfirmRes = await request('POST', `/api/results/confirm/${testMatch.id}`, {}, p2Headers);
  console.log(`P2 confirm: bothConfirmed=${p2ConfirmRes.data?.bothConfirmed}, status=${p2ConfirmRes.data?.status}`);

  const matchAfterBoth = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  console.log(`DB state: status=${matchAfterBoth.status}, home_confirmed=${matchAfterBoth.home_confirmed}, away_confirmed=${matchAfterBoth.away_confirmed}`);

  if (matchAfterBoth.status === 'finished' && matchAfterBoth.home_confirmed === 1 && matchAfterBoth.away_confirmed === 1) {
    console.log('✅ PASS: Both confirmed, match marked finished!');
  } else {
    console.error('❌ FAIL: Match not marked finished after both confirmed');
    process.exit(1);
  }

  // TEST 7: Standings MUST now be updated!
  console.log('\n--- TEST 7: Standings updated after dual confirmation ---');
  const finalStandings = await request('GET', '/api/standings');
  const p1FinalPlayed = finalStandings.data?.standings?.find(s => s.participant_id === p1.id)?.played || 0;
  const p2FinalPlayed = finalStandings.data?.standings?.find(s => s.participant_id === p2.id)?.played || 0;

  console.log(`Final played: P1=${p1FinalPlayed} (init: ${p1InitPlayed}), P2=${p2FinalPlayed} (init: ${p2InitPlayed})`);
  if (p1FinalPlayed === p1InitPlayed + 1 && p2FinalPlayed === p2InitPlayed + 1) {
    console.log('✅ PASS: Standings accurately updated after both confirmed!');
  } else {
    console.error('❌ FAIL: Standings did not update correctly after dual confirmation');
    process.exit(1);
  }

  // TEST 8: Dispute / Rejection Flow
  console.log('\n--- TEST 8: Rejection / Dispute Flow ---');
  // Re-save as submitted
  await request('PUT', `/api/admin/matches/${testMatch.id}`, {
    home_score: 4,
    away_score: 0,
    status: 'submitted',
    screenshot_url: '/uploads/test_screenshot.jpg'
  }, adminHeaders);

  // Player 1 disputes / rejects
  const disputeRes = await request('POST', `/api/results/dispute/${testMatch.id}`, {
    reason: "Hisob noto'g'ri, 4 emas 2 bo'lgan"
  }, p1Headers);

  console.log(`Dispute response: status=${disputeRes.status}, message: ${disputeRes.data?.message}`);
  const matchAfterDispute = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatch.id);
  console.log(`DB state: status=${matchAfterDispute.status}, reason: ${matchAfterDispute.dispute_reason}`);

  if (matchAfterDispute.status === 'disputed' && matchAfterDispute.home_confirmed === 0 && matchAfterDispute.away_confirmed === 0) {
    console.log('✅ PASS: Match is marked disputed, confirmations reset to 0, awaiting admin review');
  } else {
    console.error('❌ FAIL: Dispute state incorrect');
    process.exit(1);
  }

  // Stranger cannot dispute or confirm match they do not belong to
  console.log('\n--- TEST 9: Stranger cannot confirm or dispute other matches ---');
  const strangerConfirm = await request('POST', `/api/results/confirm/${testMatch.id}`, {}, strangerHeaders);
  const strangerDispute = await request('POST', `/api/results/dispute/${testMatch.id}`, { reason: 'fake' }, strangerHeaders);

  console.log(`Stranger confirm: ${strangerConfirm.status} (Expected: 403), Stranger dispute: ${strangerDispute.status} (Expected: 403)`);
  if (strangerConfirm.status === 403 && strangerDispute.status === 403) {
    console.log('✅ PASS: Strangers strictly forbidden from confirming/disputing');
  } else {
    console.error('❌ FAIL: Security check failed for stranger');
    process.exit(1);
  }

  console.log('\n🎉 === ALL TESTS PASSED SUCCESSFULLY! ===\n');
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
