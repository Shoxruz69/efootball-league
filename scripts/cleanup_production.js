const db = require('../server/db');

console.log('🧹 === PRODUCTION CLEANUP & RESET ===\n');

// 1. Get Shox's details
const shox = db.prepare("SELECT * FROM participants WHERE LOWER(TRIM(player_name)) = 'shox' LIMIT 1").get();
const shoxTg = shox?.telegram_id || '10001';
const shoxClub = shox?.club_name || 'Real Madrid';
const shoxColor = shox?.club_badge_color || '#00e5ff';
const shoxUsername = shox?.username || null;
const shoxAvatar = shox?.avatar_url || null;

console.log(`Preserving real user account: Shox (${shoxClub}, TG: ${shoxTg})`);

// 2. Clear all test archives, predictions, votes, matches, participants, and leagues
db.exec(`
  DELETE FROM season_archives;
  DELETE FROM predictions;
  DELETE FROM motw_votes;
  DELETE FROM matches;
  DELETE FROM participants;
  DELETE FROM leagues;
  DELETE FROM sqlite_sequence WHERE name IN ('leagues', 'participants', 'matches', 'predictions', 'motw_votes', 'season_archives');
`);

console.log('✅ Cleared test dummy participants, test matches, and test archives.');

// 3. Create fresh 1-Mavsum (2026) production league
const defaultRules = `1. O‘yinlar eFootball do‘stlik o‘yini (Friend Match) rejimida o‘tkaziladi.
2. Har bir o‘yin vaqti: 10 daqiqa, qo‘shimcha vaqt va penaltilar yo‘q (durang bo‘lishi mumkin).
3. Internet uzilib qolsa yoki o‘yin to‘xtasa, ikkala o‘yinchi qolgan daqiqani qaytadan o‘ynab hisobni qo‘shib hisoblaydi.
4. O‘yin yakunlangach, statistika ekrani skrinshoti majburiy yuklanadi va raqib tomonidan tasdiqlanadi.
5. Soxta natija yoki nizo yuzaga kelsa, yakuniy qarorni Admin qabul qiladi.
6. Halol va sportcha hurmat bilan o‘ynang!`;

const leagueInfo = db.prepare(`
  INSERT INTO leagues (name, season, participant_limit, unique_clubs, rules, status, current_round, total_rounds)
  VALUES (?, ?, 12, 0, ?, 'registration', 1, 1)
`).run('eFootball Uzbekistan Masters', '1-Mavsum (2026)', defaultRules);

const leagueId = leagueInfo.lastInsertRowid;
console.log(`✅ Created clean production league: #${leagueId} - "eFootball Uzbekistan Masters" (1-Mavsum 2026)`);

// 4. Register Shox in the fresh production league
db.prepare(`
  INSERT INTO participants (league_id, telegram_id, username, player_name, club_name, club_badge_color, avatar_url, status)
  VALUES (?, ?, ?, 'Shox', ?, ?, ?, 'active')
`).run(leagueId, shoxTg, shoxUsername, shoxClub, shoxColor, shoxAvatar);

console.log(`✅ Shox registered in League #${leagueId}`);

// 5. Verify database state
const finalLeague = db.prepare("SELECT * FROM leagues WHERE id = ?").get(leagueId);
const finalParticipants = db.prepare("SELECT id, player_name, club_name, telegram_id FROM participants WHERE league_id = ?").all(leagueId);
const matchCount = db.prepare("SELECT count(*) as c FROM matches WHERE league_id = ?").get(leagueId).c;
const archiveCount = db.prepare("SELECT count(*) as c FROM season_archives").get().c;

console.log('\n--- VERIFICATION ---');
console.log('Active League:', finalLeague.name, `(${finalLeague.season}, status: ${finalLeague.status})`);
console.log('Participants count:', finalParticipants.length);
console.log('Participants list:', finalParticipants);
console.log('Matches count:', matchCount);
console.log('Archives count:', archiveCount);

console.log('\n🎉 Production database is fresh, clean, and ready for real use!\n');
