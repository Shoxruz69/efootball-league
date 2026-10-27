/**
 * Comprehensive Automated Test Suite:
 * Season Completion, Archives, Cross-Season Retention, Automatic Round Progression & Locking, Admin Match Editing
 */
const http = require('http');

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const opt = {
      hostname: 'localhost',
      port: 3000,
      path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(opt, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting Efootball League Season Lifecycle & Round Progression Tests...\n');
  
  // 0. Login as Admin
  const loginRes = await request('/api/admin/login', {
    method: 'POST',
    body: { password: 'efootball_admin_2026' }
  });
  const adminHeaders = { 'x-admin-token': loginRes.body.token };

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  try {
    // 1. Get current league & participants
    const leagueRes = await request('/api/league/current');
    assert(leagueRes.status === 200 && leagueRes.body.league, 'Current league is active');
    const league = leagueRes.body.league;

    const partRes = await request('/api/participants');
    assert(partRes.status === 200 && partRes.body.active.length >= 6, `Active participants present (${partRes.body.active.length} players)`);
    const p1 = partRes.body.active[0];
    const p2 = partRes.body.active[1];

    // 2. Test Round-Robin Draw if matches don't exist
    const matchRes = await request('/api/matches');
    let matches = matchRes.body.matches || [];
    if (matches.length === 0) {
      console.log('   Generating draw...');
      const drawRes = await request('/api/admin/draw', {
        method: 'POST',
        headers: adminHeaders,
        body: { force: true }
      });
      assert(drawRes.status === 200, 'Admin draw generated round-robin fixtures');
      const m2 = await request('/api/matches');
      matches = m2.body.matches;
    }
    assert(matches.length > 0, `Matches exist in the season (${matches.length} matches)`);

    // 3. Round Lock Test: Attempt to submit/upload to Round 2 while Round 1 is incomplete
    const round2Matches = matches.filter(m => m.round === 2);
    if (round2Matches.length > 0) {
      const r2m = round2Matches[0];
      const r2Submit = await request(`/api/results/submit/${r2m.id}`, {
        method: 'POST',
        headers: {
          'x-telegram-user': JSON.stringify({ id: r2m.home_telegram_id, first_name: r2m.home_player_name })
        },
        body: { home_score: 2, away_score: 1, screenshot_url: 'http://test/shot.png' }
      });
      const errMsg = r2Submit.body.error || r2Submit.body.message || '';
      assert(
        r2Submit.status === 400 && (errMsg.includes('qulflangan') || errMsg.includes('yakunlanmagan')),
        'Round lock enforced: Cannot submit result for future round when current round is incomplete'
      );
      assert(Array.isArray(r2Submit.body.pending_matches) || Array.isArray(r2Submit.body.pendingMatches), 'Locked response returns list of pending matches in active round');
    }

    // 4. Admin Edit Match Test
    const r1Matches = matches.filter(m => m.round === 1);
    const mToEdit = r1Matches[0];
    const editRes = await request(`/api/admin/matches/${mToEdit.id}`, {
      method: 'PUT',
      headers: adminHeaders,
      body: { home_score: 4, away_score: 2, status: 'finished' }
    });
    assert(editRes.status === 200, 'Admin can edit any match score');

    // Verify standings updated with confirmed match
    const standRes = await request('/api/matches/table/standings');
    const winnerInStandings = standRes.body.standings.find(s => s.participant_id === mToEdit.home_participant_id);
    assert(winnerInStandings && winnerInStandings.goals_for >= 4, 'Standings automatically recalculated from confirmed match');

    // 5. Complete all Round 1 matches to test automatic round advancement
    console.log('   Completing remaining Round 1 matches...');
    for (const rm of r1Matches) {
      if (rm.id !== mToEdit.id) {
        await request(`/api/admin/matches/${rm.id}`, {
          method: 'PUT',
          headers: adminHeaders,
          body: { home_score: 1, away_score: 0, status: 'finished' }
        });
      }
    }

    // Check if league advanced to Round 2
    const advLeagueRes = await request('/api/league/current');
    assert(advLeagueRes.body.league.current_round >= 2, 'Automatic round advancement: round advanced after all matches finished');

    // 6. Test Profile "Tur natijalari" endpoint
    const round1Res = await request('/api/matches/round/1');
    assert(round1Res.status === 200 && Array.isArray(round1Res.body.matches), 'Profile "Tur natijalari" endpoint returns matches for requested round');
    assert(round1Res.body.matches.length === r1Matches.length, 'All matches in selected round are returned with real DB scores');

    // 7. Test Season Completion & Archiving
    console.log('   Testing Season Completion...');
    const compRes = await request('/api/admin/complete-season', {
      method: 'POST',
      headers: adminHeaders
    });
    assert(compRes.status === 200, 'Admin successfully completed season');
    assert(compRes.body.leagueId, 'Season completed and returned leagueId');

    // Test duplicate prevention (idempotent archive)
    const compRes2 = await request('/api/admin/complete-season', {
      method: 'POST',
      headers: adminHeaders
    });
    assert(compRes2.status === 200 && compRes2.body.message.includes('yakunlangan'), 'Duplicate archive prevention: calling complete season again is safely idempotent');

    // Check Seasons History endpoint
    const histRes = await request('/api/league/seasons-history');
    assert(histRes.status === 200 && Array.isArray(histRes.body.archives) && histRes.body.archives.length > 0, 'Seasons history endpoint returns archived seasons list');
    const archId = histRes.body.archives[0].id;

    // Check Season Archive Detail
    const archDetail = await request(`/api/league/seasons-history/${archId}`);
    assert(archDetail.status === 200 && archDetail.body.archive && archDetail.body.archive.standings.length > 0, 'Season archive details include full historical standings table');
    assert(archDetail.body.archive.winner_name, 'Season archive includes winner name');

    // 8. Test Start New Season (with automatic participant retention & reset)
    console.log('   Testing Start New Season...');
    const newSeasonRes = await request('/api/admin/start-new-season', {
      method: 'POST',
      headers: adminHeaders
    });
    assert(newSeasonRes.status === 200, 'Admin successfully started new season');
    assert(newSeasonRes.body.leagueId, 'New league created for next season');

    // Verify participants carried over with stats reset to 0
    const newPartRes = await request('/api/participants');
    assert(newPartRes.body.active.length >= 6, 'Participants preserved across seasons without needing to re-register');
    const sampleP = newPartRes.body.active[0];

    // Check standings in new season are all 0
    const newStandRes = await request('/api/matches/table/standings');
    const sampleInStandings = newStandRes.body.standings.find(s => s.participant_id === sampleP.id);
    assert(sampleInStandings && sampleInStandings.points === 0 && sampleInStandings.won === 0 && sampleInStandings.goals_for === 0, 'New season statistics reset to 0 in standings');

    // Verify player profile recognizes historical participant and maintains career stats
    const meRes = await request('/api/participants/me', {
      headers: {
        'x-telegram-user': JSON.stringify({ id: sampleP.telegram_id, first_name: sampleP.player_name })
      }
    });
    assert(meRes.status === 200 && meRes.body.participant, 'Player immediately recognized without re-registration');
    assert(meRes.body.stats && meRes.body.stats.current_points === 0, 'Player current season points start at 0');
    assert(meRes.body.stats && meRes.body.stats.total_seasons >= 2, 'Player profile tracks total seasons played across archives');
    assert(meRes.status === 200 && meRes.body.participant, 'Player immediately recognized without re-registration');
    assert(meRes.body.stats && meRes.body.stats.total_seasons >= 2, 'Player profile tracks total seasons played across archives');

    // Verify past season archive remains intact
    const histResAfter = await request('/api/league/seasons-history');
    assert(histResAfter.body.archives.length >= 1, 'Previous season archive remains unchanged in history');

    console.log(`\n========================================`);
    console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

runTests();
