const express = require('express');
const router = express.Router();
const db = require('../db');
const { generateRoundRobinFixtures, calculateStandings } = require('../services/fixtureGenerator');
const { broadcast } = require('../services/websocket');
const { notifyMatchReminder } = require('../services/botNotifier');

// Get all matches for current league
router.get('/', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, matches: [], rounds: [], currentRound: 1 });
    }

    const { round, status } = req.query;

    let query = `
      SELECT 
        m.*,
        h.player_name as home_player_name,
        h.club_name as home_club_name,
        h.club_badge_color as home_badge_color,
        h.avatar_url as home_avatar_url,
        h.telegram_id as home_telegram_id,
        a.player_name as away_player_name,
        a.club_name as away_club_name,
        a.club_badge_color as away_badge_color,
        a.avatar_url as away_avatar_url,
        a.telegram_id as away_telegram_id
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.league_id = ?
    `;

    const params = [league.id];

    if (round) {
      query += ` AND m.round = ?`;
      params.push(parseInt(round, 10));
    }

    if (status) {
      query += ` AND m.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY m.round ASC, m.id ASC`;

    const matches = db.prepare(query).all(...params);

    // Get list of distinct rounds
    const rounds = db.prepare(`SELECT DISTINCT round FROM matches WHERE league_id = ? ORDER BY round ASC`).all(league.id).map(r => r.round);

    res.json({
      success: true,
      leagueId: league.id,
      currentRound: league.current_round,
      totalRounds: league.total_rounds,
      rounds,
      matches: matches.map(m => ({
        ...m,
        stats: m.stats_json ? JSON.parse(m.stats_json) : null,
        live_state: m.live_state_json ? JSON.parse(m.live_state_json) : null
      }))
    });
  } catch (err) {
    console.error('Uchrashuvlarni olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get single match by ID
router.get('/:id', (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const match = db.prepare(`
      SELECT 
        m.*,
        h.player_name as home_player_name,
        h.club_name as home_club_name,
        h.club_badge_color as home_badge_color,
        h.avatar_url as home_avatar_url,
        h.telegram_id as home_telegram_id,
        a.player_name as away_player_name,
        a.club_name as away_club_name,
        a.club_badge_color as away_badge_color,
        a.avatar_url as away_avatar_url,
        a.telegram_id as away_telegram_id
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.id = ?
    `).get(matchId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    res.json({
      success: true,
      match: {
        ...match,
        stats: match.stats_json ? JSON.parse(match.stats_json) : null,
        live_state: match.live_state_json ? JSON.parse(match.live_state_json) : null
      }
    });
  } catch (err) {
    console.error('Uchrashuv ma\'lumotlarini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Generate round-robin fixture schedule (Qur'a / Taqvim)
router.post('/generate-schedule', (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat admin uchun ruxsat etilgan.' });
    }

    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(400).json({ success: false, message: 'Faol liga mavjud emas.' });
    }

    // Check existing matches
    const existingCount = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ?").get(league.id).count;
    if (existingCount > 0 && !req.body.force) {
      return res.status(400).json({
        success: false,
        message: 'Taqvim allaqachon tuzilgan. Qaytadan qur\'a tashlash uchun "force" belgisini yuboring.'
      });
    }

    const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    if (participants.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Taqvim tuzish uchun kamida 2 nafar faol ishtirokchi kerak.'
      });
    }

    // Clear existing matches if force
    if (existingCount > 0 && req.body.force) {
      db.prepare('DELETE FROM matches WHERE league_id = ?').run(league.id);
      db.prepare('DELETE FROM predictions WHERE match_id NOT IN (SELECT id FROM matches)').run();
    }

    // Generate round-robin schedule
    const fixtures = generateRoundRobinFixtures(participants);
    const maxRound = Math.max(...fixtures.map(f => f.round), 1);

    const insertStmt = db.prepare(`
      INSERT INTO matches (league_id, round, home_participant_id, away_participant_id, status)
      VALUES (?, ?, ?, ?, 'scheduled')
    `);

    const insertMany = db.transaction((fixtureList) => {
      for (const f of fixtureList) {
        insertStmt.run(league.id, f.round, f.homeId, f.awayId);
      }
    });

    insertMany(fixtures);

    // Update league status to active
    db.prepare(`
      UPDATE leagues 
      SET status = 'active', total_rounds = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(maxRound, league.id);

    broadcast({ type: 'schedule_generated', leagueId: league.id, totalMatches: fixtures.length });

    res.json({
      success: true,
      message: `Taqvim muvaffaqiyatli tuzildi! Jami ${fixtures.length} ta uchrashuv va ${maxRound} ta tur yaratildi.`,
      totalMatches: fixtures.length,
      totalRounds: maxRound
    });
  } catch (err) {
    console.error('Taqvim tuzishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: Send match reminder to both participants
router.post('/:id/remind', async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat admin uchun ruxsat etilgan.' });
    }

    const matchId = parseInt(req.params.id, 10);
    const match = db.prepare(`
      SELECT 
        m.*,
        h.player_name as home_name, h.club_name as home_club, h.telegram_id as home_tg,
        a.player_name as away_name, a.club_name as away_club, a.telegram_id as away_tg
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.id = ?
    `).get(matchId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    await notifyMatchReminder(
      match.home_tg,
      match.away_tg,
      `${match.home_name} (${match.home_club})`,
      `${match.away_name} (${match.away_club})`,
      match.round
    );

    res.json({ success: true, message: 'Eslatma ikkala ishtirokchiga yuborildi!' });
  } catch (err) {
    console.error('Eslatma yuborishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Standings Table (Turnir jadvali)
router.get('/table/standings', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, standings: [] });
    }

    const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    const matches = db.prepare("SELECT * FROM matches WHERE league_id = ?").all(league.id);

    const standings = calculateStandings(participants, matches);

    res.json({
      success: true,
      league: {
        id: league.id,
        name: league.name,
        season: league.season
      },
      standings
    });
  } catch (err) {
    console.error('Turnir jadvalini hisoblashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
