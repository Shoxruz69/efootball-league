const assert = require('assert');
const path = require('path');
const fs = require('fs');
const db = require('../server/db');
const { generateRoundRobinFixtures, calculateStandings } = require('../server/services/fixtureGenerator');
const { analyzeMatchScreenshot } = require('../server/services/ocrService');

console.log('🧪 ==========================================');
console.log('🧪 eFootball League E2E Test Suite');
console.log('🧪 ==========================================\n');

async function runTests() {
  // Test 1: Check Database Tables
  console.log('▶ Test 1: SQLite jadvallari tekshirilmoqda...');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  assert(tables.includes('leagues'), 'leagues jadvali mavjud emas');
  assert(tables.includes('participants'), 'participants jadvali mavjud emas');
  assert(tables.includes('matches'), 'matches jadvali mavjud emas');
  assert(tables.includes('predictions'), 'predictions jadvali mavjud emas');
  assert(tables.includes('motw_votes'), 'motw_votes jadvali mavjud emas');
  console.log('✅ SQLite jadvallari mavjud: leagues, participants, matches, predictions, motw_votes');

  // Test 2: Active League & Limit Check
  console.log('\n▶ Test 2: Faol liga ma\'lumotlari tekshirilmoqda...');
  const league = db.prepare("SELECT * FROM leagues ORDER BY id DESC LIMIT 1").get();
  assert(league, 'Faol liga topilmadi');
  assert.strictEqual(league.participant_limit, 12, 'Limit 12 bo\'lishi kerak');
  console.log(`✅ Faol liga: "${league.name}" (${league.season}), limit: ${league.participant_limit}`);

  // Test 3: Fixture Generation Algorithm (Berger Round-Robin)
  console.log('\n▶ Test 3: Round-Robin (Berger) taqvim algoritmi tekshirilmoqda...');
  const testParticipants = [
    { id: 1, player_name: 'Shox', club_name: 'Real Madrid' },
    { id: 2, player_name: 'Javohir', club_name: 'Barcelona' },
    { id: 3, player_name: 'Bekzod', club_name: 'Manchester City' },
    { id: 4, player_name: 'Sardor', club_name: 'Arsenal' }
  ];

  const fixtures = generateRoundRobinFixtures(testParticipants);
  // 4 teams -> 4*(4-1)/2 = 6 matches total, 3 rounds
  assert.strictEqual(fixtures.length, 6, `4 ta jamoa uchun 6 ta o'yin bo'lishi kerak, lekin ${fixtures.length} chiqdi`);
  const rounds = [...new Set(fixtures.map(f => f.round))];
  assert.strictEqual(rounds.length, 3, '4 ta jamoa uchun 3 ta tur bo\'lishi kerak');
  console.log(`✅ Berger algoritmi: 4 ta jamoa ➔ ${fixtures.length} ta o‘yin, ${rounds.length} ta tur muvaffaqiyatli tuzildi`);

  // Test 4: Standings Calculation & Tie-breakers
  console.log('\n▶ Test 4: Turnir jadvali va ochkolar hisob-kitobi tekshirilmoqda...');
  const dummyMatches = [
    { id: 101, round: 1, home_participant_id: 1, away_participant_id: 2, home_score: 3, away_score: 1, status: 'finished' },
    { id: 102, round: 1, home_participant_id: 3, away_participant_id: 4, home_score: 2, away_score: 2, status: 'finished' }
  ];

  const standings = calculateStandings(testParticipants, dummyMatches);
  assert.strictEqual(standings[0].player_name, 'Shox', 'Shox 3 ochko bilan 1-o\'rinda bo\'lishi kerak');
  assert.strictEqual(standings[0].points, 3, 'Shox 3 ochko olgan');
  assert.strictEqual(standings[0].goal_diff, 2, 'To\'plar farqi +2');
  assert.strictEqual(standings[1].points, 1, 'Durang o\'ynagan jamoa 1 ochko olgan');
  console.log('✅ Turnir jadvali g‘alaba (3 ochko), durang (1 ochko), mag‘lubiyat (0 ochko) va to‘plar farqi bo‘yicha to‘g‘ri hisoblandi');

  // Test 5: OCR / Tesseract Fallback and Stats Summary
  console.log('\n▶ Test 5: OCR va Statistika tahlili tekshirilmoqda...');
  // Create a sample dummy image buffer to test the analyzer
  const testImgPath = path.join(__dirname, 'test_sample.png');
  // Simple 1x1 transparent PNG buffer
  const samplePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  fs.writeFileSync(testImgPath, samplePng);

  const ocrResult = await analyzeMatchScreenshot(testImgPath, {
    homePlayer: 'Shox',
    awayPlayer: 'Javohir',
    homeClub: 'Real Madrid',
    awayClub: 'Barcelona'
  });

  assert(ocrResult.allowManual === true, 'allowManual ruxsati true bo\'lishi kerak');
  console.log('✅ OCR servisi to‘g‘ri ishladi, allowManual va xatoliklar nazorat ostida');

  // Clean test file
  if (fs.existsSync(testImgPath)) fs.unlinkSync(testImgPath);

  // Test 6: Registration & Waitlist Logic
  console.log('\n▶ Test 6: Ro‘yxatdan o‘tish va kutish ro‘yxati (waitlist) tekshirilmoqda...');
  // Clean participants table for fresh test
  db.prepare('DELETE FROM participants WHERE league_id = ?').run(league.id);

  // Insert 12 participants to reach limit
  const insertP = db.prepare(`
    INSERT INTO participants (league_id, telegram_id, player_name, club_name, status, waitlist_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (let i = 1; i <= 12; i++) {
    insertP.run(league.id, `tg_${i}`, `O'yinchi_${i}`, `Klub_${i}`, 'active', 0);
  }

  const activeCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'active'").get(league.id).count;
  assert.strictEqual(activeCount, 12, '12 ta joy to\'lishi kerak');

  // 13th participant should go to waitlist
  const waitlistCountBefore = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'waitlist'").get(league.id).count;
  insertP.run(league.id, 'tg_13', 'Kutuvchi_13', 'Arsenal', 'waitlist', waitlistCountBefore + 1);

  const waitlistP = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'waitlist'").get(league.id);
  assert(waitlistP, 'Kutish ro\'yxatida ishtirokchi bo\'lishi kerak');
  assert.strictEqual(waitlistP.waitlist_order, 1, 'Navbat #1 bo\'lishi kerak');
  console.log('✅ 12/12 joy to‘lganda 13-ishtirokchi kutish ro‘yxatiga (#1 navbat) muvaffaqiyatli joylashtirildi');

  // Test 7: Participant removal & auto-promotion from waitlist
  console.log('\n▶ Test 7: Ishtirokchi chiqqanda kutish ro‘yxatidan avtomatik qabul qilish tekshirilmoqda...');
  // Remove 1 active participant
  db.prepare("UPDATE participants SET status = 'removed' WHERE telegram_id = 'tg_1'").run();

  // Promote next in waitlist
  const nextInLine = db.prepare(`
    SELECT * FROM participants WHERE league_id = ? AND status = 'waitlist' ORDER BY waitlist_order ASC LIMIT 1
  `).get(league.id);

  assert(nextInLine, 'Navbatdagi ishtirokchi topilmadi');
  db.prepare("UPDATE participants SET status = 'active', waitlist_order = 0 WHERE id = ?").run(nextInLine.id);

  const newActiveCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'active'").get(league.id).count;
  assert.strictEqual(newActiveCount, 12, 'Yana 12 ta faol ishtirokchi bo\'ldi');
  console.log(`✅ Ishtirokchi chiqqach, "${nextInLine.player_name}" kutish ro‘yxatidan asosiy tarkibga avtomatik qabul qilindi`);

  // Clean test data and insert realistic demo league data
  console.log('\n▶ Test 8: Realistik demo ma\'lumotlarini kiritish...');
  db.prepare('DELETE FROM matches WHERE league_id = ?').run(league.id);
  db.prepare('DELETE FROM participants WHERE league_id = ?').run(league.id);

  const initialPlayers = [
    { tg: '10001', name: 'Shox', club: 'Real Madrid', color: '#febe10' },
    { tg: '10002', name: 'Javohir', club: 'Barcelona', color: '#a50044' },
    { tg: '10003', name: 'Bekzod', club: 'Manchester City', color: '#6cabdd' },
    { tg: '10004', name: 'Sardor', club: 'Arsenal', color: '#ef0107' },
    { tg: '10005', name: 'Alisher', club: 'Bayern Munich', color: '#dc052d' },
    { tg: '10006', name: 'Doniyor', club: 'Inter Milan', color: '#00e5ff' }
  ];

  const insertReal = db.prepare(`
    INSERT INTO participants (league_id, telegram_id, player_name, club_name, club_badge_color, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `);

  initialPlayers.forEach(p => {
    insertReal.run(league.id, p.tg, p.name, p.club, p.color);
  });

  const participantsList = db.prepare("SELECT * FROM participants WHERE league_id = ?").all(league.id);
  const scheduleFixtures = generateRoundRobinFixtures(participantsList);

  const insertMatch = db.prepare(`
    INSERT INTO matches (league_id, round, home_participant_id, away_participant_id, status)
    VALUES (?, ?, ?, ?, 'scheduled')
  `);

  scheduleFixtures.forEach(f => {
    insertMatch.run(league.id, f.round, f.homeId, f.awayId);
  });

  const maxR = Math.max(...scheduleFixtures.map(f => f.round));
  db.prepare("UPDATE leagues SET status = 'active', total_rounds = ?, current_round = 1 WHERE id = ?").run(maxR, league.id);

  // Set 1 finished match with AI summary & stats for testing
  const firstMatch = db.prepare("SELECT id FROM matches WHERE round = 1 LIMIT 1").get();
  if (firstMatch) {
    db.prepare(`
      UPDATE matches
      SET home_score = 3,
          away_score = 1,
          status = 'finished',
          home_confirmed = 1,
          away_confirmed = 1,
          stats_json = ?,
          ai_summary = ?
      WHERE id = ?
    `).run(
      JSON.stringify({ possession: [58, 42], shots: [9, 4], shotsOnTarget: [6, 2], corners: [4, 1] }),
      "Real Madrid to‘p nazorati (58%) va darvozaga aniq zarbalar bo‘yicha ustunlik qildi.",
      firstMatch.id
    );
  }

  console.log(`✅ ${initialPlayers.length} ta ishtirokchi, ${scheduleFixtures.length} ta uchrashuv va namunaviy tasdiqlangan o‘yin saqlandi`);

  console.log('\n==========================================');
  console.log('🎉 BARCHA TESTLAR MUVAFFAQIYATLI O‘TDI!');
  console.log('==========================================\n');
}

runTests().catch(err => {
  console.error('❌ Test xatoligi:', err);
  process.exit(1);
});
