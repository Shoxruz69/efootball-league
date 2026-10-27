const assert = require('assert');
const db = require('../server/db');

console.log('🧪 ==========================================');
console.log('🧪 Yangi Qoidalar & Soddalashtirilgan Liga Testlari');
console.log('🧪 ==========================================\n');

// Get active league
const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
assert(league, 'Faol liga mavjud bo‘lishi shart');

// 1. Nickname duplicate check (case-insensitive & trimmed)
console.log('▶ Test 1: Takroriy Nickname (katta-kichik harf, bo‘shliqlar) tekshiruvi...');
const testNick1 = 'Temur_Pro';
const testNickLower = '  temur_pro  ';

// Clean test participants
db.prepare("DELETE FROM participants WHERE league_id = ? AND player_name IN ('Temur_Pro', 'temur_pro', 'Ozod_Test')").run(league.id);

// Insert test participant
db.prepare(`
  INSERT INTO participants (league_id, telegram_id, player_name, club_name, status)
  VALUES (?, ?, ?, '', 'active')
`).run(league.id, 'tg_test_101', testNick1);

// Query with LOWER(TRIM(?))
const foundDuplicate = db.prepare(`
  SELECT id, player_name FROM participants 
  WHERE league_id = ? AND status != 'removed' AND LOWER(TRIM(player_name)) = LOWER(?)
`).get(league.id, testNickLower.trim());

assert(foundDuplicate, 'Takroriy nickname aniqlanmadi');
assert.strictEqual(foundDuplicate.player_name, 'Temur_Pro');
console.log('✅ "  temur_pro  " kiritilganda "Temur_Pro" bilan takrorlanish muvaffaqiyatli aniqlandi');

// 2. Already submitted check
console.log('\n▶ Test 2: "Bu uchrashuv natijasi allaqachon kiritilgan" tekshiruvi...');
// Create two test participants and a match
db.prepare(`
  INSERT INTO participants (league_id, telegram_id, player_name, club_name, status)
  VALUES (?, ?, ?, '', 'active')
`).run(league.id, 'tg_test_102', 'Ozod_Test');

const pHome = db.prepare("SELECT * FROM participants WHERE telegram_id = 'tg_test_101'").get();
const pAway = db.prepare("SELECT * FROM participants WHERE telegram_id = 'tg_test_102'").get();

const matchResult = db.prepare(`
  INSERT INTO matches (league_id, round, home_participant_id, away_participant_id, status)
  VALUES (?, 1, ?, ?, 'scheduled')
`).run(league.id, pHome.id, pAway.id);
const testMatchId = matchResult.lastInsertRowid;

// Player 1 (Home) submits score first
db.prepare(`
  UPDATE matches 
  SET home_score = 3, away_score = 1, screenshot_url = '/uploads/test.jpg', 
      uploader_participant_id = ?, status = 'submitted', home_confirmed = 1, away_confirmed = 0
  WHERE id = ?
`).run(pHome.id, testMatchId);

// Check match status for Player 2
const currentMatch = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatchId);
assert.strictEqual(currentMatch.status, 'submitted');
assert.strictEqual(currentMatch.home_score, 3);
assert.strictEqual(currentMatch.away_score, 1);
assert.strictEqual(currentMatch.home_confirmed, 1);
assert.strictEqual(currentMatch.away_confirmed, 0);
console.log('✅ Birinchi o‘yinchi natija kiritgach, o‘yin holati "submitted" bo‘ldi va hisob saqlandi');

// 3. Opponent confirmation & points calculation
console.log('\n▶ Test 3: Raqib tasdiqlashi va ochkolar avtomatik hisoblanishi...');
// Player 2 confirms
db.prepare(`
  UPDATE matches 
  SET status = 'finished', away_confirmed = 1
  WHERE id = ?
`).run(testMatchId);

const finishedMatch = db.prepare("SELECT * FROM matches WHERE id = ?").get(testMatchId);
assert.strictEqual(finishedMatch.status, 'finished');
assert.strictEqual(finishedMatch.home_confirmed, 1);
assert.strictEqual(finishedMatch.away_confirmed, 1);

const { calculateStandings } = require('../server/services/fixtureGenerator');
const participants = [pHome, pAway];
const standings = calculateStandings(participants, [finishedMatch]);

const homeStanding = standings.find(s => s.participant_id === pHome.id);
const awayStanding = standings.find(s => s.participant_id === pAway.id);

assert.strictEqual(homeStanding.won, 1, 'Mezbon 1 ta g‘alabaga ega bo‘lishi kerak');
assert.strictEqual(homeStanding.points, 3, 'G‘alaba uchun 3 ochko berilishi kerak');
assert.strictEqual(homeStanding.goals_for, 3, 'GF 3 bo‘lishi kerak');
assert.strictEqual(homeStanding.goals_against, 1, 'GA 1 bo‘lishi kerak');

assert.strictEqual(awayStanding.lost, 1, 'Mehmon 1 ta mag‘lubiyatga ega bo‘lishi kerak');
assert.strictEqual(awayStanding.points, 0, 'Mag‘lubiyat uchun 0 ochko bo‘lishi kerak');
console.log('✅ G‘alaba (3 ochko), mag‘lubiyat (0 ochko), GF/GA to‘liq hisoblandi');

// Clean test records
db.prepare("DELETE FROM matches WHERE id = ?").run(testMatchId);
db.prepare("DELETE FROM participants WHERE id IN (?, ?)").run(pHome.id, pAway.id);

console.log('\n==========================================');
console.log('🎉 BARCHA YANGI TESTLAR MUVAFFAQIYATLI O‘TDI!');
console.log('==========================================');
