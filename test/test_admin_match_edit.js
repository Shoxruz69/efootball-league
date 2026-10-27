const http = require('http');

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:3000' + path, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      if (typeof body === 'object') {
        req.setHeader('Content-Type', 'application/json');
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- ADMIN MATCH EDITING & SECURITY TESTS ---\n');

  // 1. Get current matches to pick one
  const matchesRes = await request('/api/matches');
  if (!matchesRes.data.matches || matchesRes.data.matches.length === 0) {
    throw new Error('No matches found for testing');
  }
  const testMatch = matchesRes.data.matches[0];
  console.log(`Test Match selected: ID ${testMatch.id} (${testMatch.home_player_name} vs ${testMatch.away_player_name}), Current Status: ${testMatch.status}`);

  // TEST 1: Non-admin calling PUT /api/admin/matches/:id
  console.log('\n[TEST 1] Non-admin calling PUT /api/admin/matches/:id...');
  const unauthorizedRes = await request(`/api/admin/matches/${testMatch.id}`, {
    method: 'PUT'
  }, { home_score: 5, away_score: 0 });
  console.log('Status code:', unauthorizedRes.status, 'Response:', unauthorizedRes.data);
  if (unauthorizedRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden, got ${unauthorizedRes.status}`);
  }
  console.log('PASS: Unauthorized edit correctly rejected with 403 Forbidden.');

  // TEST 2: Attacker attempting spoofing with isAdmin: true in body / headers
  console.log('\n[TEST 2] Attacker trying spoofed isAdmin: true in body...');
  const spoofedRes = await request(`/api/admin/matches/${testMatch.id}`, {
    method: 'PUT',
    headers: { 'x-telegram-user': JSON.stringify({ id: '99999999', isAdmin: true }) }
  }, { home_score: 5, away_score: 0, isAdmin: true });
  console.log('Status code:', spoofedRes.status, 'Response:', spoofedRes.data);
  if (spoofedRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for spoofed request, got ${spoofedRes.status}`);
  }
  console.log('PASS: Spoofed isAdmin rejected by server-side verification.');

  // TEST 3: Non-participant trying to submit result via /api/results/submit/:id
  console.log('\n[TEST 3] Non-participant trying to submit result...');
  const nonParticipantRes = await request(`/api/results/submit/${testMatch.id}`, {
    method: 'POST',
    headers: { 'x-telegram-user': JSON.stringify({ id: 'random_stranger_123' }) }
  }, { home_score: 3, away_score: 2, screenshot_url: '/uploads/fake.jpg' });
  console.log('Status code:', nonParticipantRes.status, 'Response:', nonParticipantRes.data);
  if (nonParticipantRes.status !== 403) {
    throw new Error(`Expected 403 for non-participant submission, got ${nonParticipantRes.status}`);
  }
  console.log('PASS: Non-participant prevented from altering other matches.');

  // TEST 4: Admin authentication via /api/admin/login
  console.log('\n[TEST 4] Admin logging in via /api/admin/login...');
  const loginRes = await request('/api/admin/login', {
    method: 'POST'
  }, { password: 'efootball_admin_2026' });
  console.log('Login status:', loginRes.status, 'Success:', loginRes.data.success);
  if (!loginRes.data.success || !loginRes.data.token) {
    throw new Error('Admin login failed');
  }
  const adminToken = loginRes.data.token;
  console.log('PASS: Admin session token obtained.');

  // TEST 5: Verify Admin auth check returns isAdmin = true
  console.log('\n[TEST 5] Verifying /api/admin/auth/check with admin token...');
  const authCheckRes = await request('/api/admin/auth/check', {
    method: 'GET',
    headers: { 'x-admin-token': adminToken }
  });
  console.log('Auth check status:', authCheckRes.status, 'Data:', authCheckRes.data);
  if (!authCheckRes.data.isAdmin) {
    throw new Error('Admin auth check returned isAdmin=false');
  }
  console.log('PASS: Server verified Admin privileges.');

  // TEST 6: Admin edits match results, screenshot, and stats
  console.log('\n[TEST 6] Admin edits match result, screenshot, and stats...');
  const editRes = await request(`/api/admin/matches/${testMatch.id}`, {
    method: 'PUT',
    headers: { 'x-admin-token': adminToken }
  }, {
    home_score: 4,
    away_score: 1,
    status: 'finished',
    screenshot_url: '/uploads/match_125_1793036310617.jpg',
    stats: {
      possession: [62, 38],
      shots: [11, 5],
      shotsOnTarget: [7, 2]
    }
  });
  console.log('Edit status:', editRes.status, 'Data:', editRes.data);
  if (editRes.status !== 200 || !editRes.data.success) {
    throw new Error('Admin match edit failed');
  }
  console.log('PASS: Admin edited match successfully.');

  // TEST 7: Verify match details directly from /api/matches/:id
  console.log('\n[TEST 7] Verifying updated match details...');
  const updatedMatchRes = await request(`/api/matches/${testMatch.id}`);
  const m = updatedMatchRes.data.match;
  console.log(`Updated match: ${m.home_player_name} (${m.home_score}) - (${m.away_score}) ${m.away_player_name}, Status: ${m.status}`);
  console.log('Screenshot URL:', m.screenshot_url);
  console.log('Stats:', m.stats);
  if (m.home_score !== 4 || m.away_score !== 1 || m.status !== 'finished') {
    throw new Error('Match fields did not update properly in database');
  }
  if (!m.screenshot_url || !m.stats) {
    throw new Error('Screenshot or stats missing');
  }
  console.log('PASS: Match details verified accurately in database.');

  // TEST 8: Standings recalculation verification
  console.log('\n[TEST 8] Verifying standings recalculation...');
  const standingsRes = await request('/api/matches/table/standings');
  const standings = standingsRes.data.standings;
  console.log('Total participants in standings:', standings.length);
  const homeStanding = standings.find(s => s.player_name === testMatch.home_player_name);
  const awayStanding = standings.find(s => s.player_name === testMatch.away_player_name);
  console.log(`Home standing (${testMatch.home_player_name}):`, {
    played: homeStanding?.played,
    won: homeStanding?.won,
    goals_for: homeStanding?.goals_for,
    points: homeStanding?.points
  });
  console.log(`Away standing (${testMatch.away_player_name}):`, {
    played: awayStanding?.played,
    lost: awayStanding?.lost,
    goals_for: awayStanding?.goals_for,
    points: awayStanding?.points
  });
  if (!homeStanding || homeStanding.goals_for < 4 || homeStanding.points < 3) {
    throw new Error('Standings were not recalculated properly from database');
  }
  console.log('PASS: Turnir jadvali bazadagi natijalar asosida muvaffaqiyatli qayta hisoblandi.');

  console.log('\n==========================================');
  console.log('🎉 BARCHA ADMIN HUQUQLARI TESTLARI MUVAFFAQIYATLI O‘TDI!');
  console.log('==========================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
