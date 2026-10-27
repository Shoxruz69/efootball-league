const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'efootball_league.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      season TEXT NOT NULL,
      participant_limit INTEGER NOT NULL DEFAULT 12,
      unique_clubs INTEGER NOT NULL DEFAULT 0,
      rules TEXT,
      status TEXT NOT NULL DEFAULT 'registration', -- 'registration', 'active', 'completed'
      current_round INTEGER NOT NULL DEFAULT 1,
      total_rounds INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      player_name TEXT NOT NULL,
      club_name TEXT NOT NULL,
      club_badge_color TEXT DEFAULT '#00e5ff',
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active', -- 'active', 'waitlist', 'removed'
      waitlist_order INTEGER DEFAULT 0,
      registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      UNIQUE (league_id, telegram_id)
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      home_participant_id INTEGER NOT NULL,
      away_participant_id INTEGER NOT NULL,
      home_score INTEGER DEFAULT NULL,
      away_score INTEGER DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'live', 'submitted', 'disputed', 'finished'
      scheduled_date TEXT,
      uploader_participant_id INTEGER DEFAULT NULL,
      screenshot_url TEXT DEFAULT NULL,
      stats_json TEXT DEFAULT NULL, -- possession, shots, on_target, corners, fouls
      ai_summary TEXT DEFAULT NULL,
      home_confirmed INTEGER NOT NULL DEFAULT 0,
      away_confirmed INTEGER NOT NULL DEFAULT 0,
      dispute_reason TEXT DEFAULT NULL,
      live_state_json TEXT DEFAULT NULL, -- live score events, authors, minutes
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE,
      FOREIGN KEY (home_participant_id) REFERENCES participants(id) ON DELETE CASCADE,
      FOREIGN KEY (away_participant_id) REFERENCES participants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      predictor_name TEXT NOT NULL,
      predicted_home INTEGER NOT NULL,
      predicted_away INTEGER NOT NULL,
      points_earned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE (match_id, telegram_id)
    );

    CREATE TABLE IF NOT EXISTS motw_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      telegram_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
      UNIQUE (league_id, round, telegram_id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS season_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      league_id INTEGER NOT NULL UNIQUE,
      league_name TEXT NOT NULL,
      season TEXT NOT NULL,
      total_rounds INTEGER NOT NULL DEFAULT 1,
      winner_name TEXT,
      winner_club TEXT,
      standings_json TEXT NOT NULL,
      matches_json TEXT NOT NULL,
      awards_json TEXT,
      completed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Create default active league if none exists
  const existingLeague = db.prepare('SELECT id FROM leagues LIMIT 1').get();
  if (!existingLeague) {
    const defaultRules = `1. O‘yinlar eFootball do‘stlik o‘yini (Friend Match) rejimida o‘tkaziladi.
2. Har bir o‘yin vaqti: 10 daqiqa, qo‘shimcha vaqt va penaltilar yo‘q (durang bo‘lishi mumkin).
3. Internet uzilib qolsa yoki o‘yin to‘xtasa, ikkala o‘yinchi qolgan daqiqani qaytadan o‘ynab hisobni qo‘shib hisoblaydi.
4. O‘yin yakunlangach, statistika ekrani skrinshoti majburiy yuklanadi va raqib tomonidan tasdiqlanadi.
5. Soxta natija yoki nizo yuzaga kelsa, yakuniy qarorni Admin qabul qiladi.
6. Halol va sportcha hurmat bilan o‘ynang!`;

    const insertLeague = db.prepare(`
      INSERT INTO leagues (name, season, participant_limit, unique_clubs, rules, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertLeague.run(
      'eFootball Uzbekistan Masters',
      '1-Mavsum (2026)',
      12,
      0, // duplicate clubs allowed by default
      defaultRules,
      'registration'
    );
  }

  // Ensure 5 test participants exist in active league (without touching the user)
  const activeLeague = db.prepare("SELECT id FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
  if (activeLeague) {
    const testParticipants = [
      { tg: '10002', name: 'Javohir', club: 'Barcelona', color: '#a50044' },
      { tg: '10003', name: 'Bekzod', club: 'Manchester City', color: '#6cabdd' },
      { tg: '10004', name: 'Sardor', club: 'Arsenal', color: '#ef0107' },
      { tg: '10005', name: 'Alisher', club: 'Bayern Munich', color: '#dc052d' },
      { tg: '10006', name: 'Doniyor', club: 'Inter Milan', color: '#00e5ff' }
    ];

    const insertPartStmt = db.prepare(`
      INSERT INTO participants (league_id, telegram_id, player_name, club_name, club_badge_color, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    for (const p of testParticipants) {
      const exists = db.prepare(`
        SELECT id FROM participants 
        WHERE league_id = ? AND (telegram_id = ? OR LOWER(TRIM(player_name)) = LOWER(?))
      `).get(activeLeague.id, p.tg, p.name);

      if (!exists) {
        insertPartStmt.run(activeLeague.id, p.tg, p.name, p.club, p.color);
      }
    }
  }
}

initSchema();

module.exports = db;
