const express = require('express');
const router = express.Router();
const db = require('../db');

// Get current active league details with slots info
router.get('/current', (req, res) => {
  try {
    let league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    let isCompleted = false;
    if (!league) {
      league = db.prepare("SELECT * FROM leagues ORDER BY id DESC LIMIT 1").get();
      isCompleted = true;
    }

    if (!league) {
      return res.status(404).json({ success: false, message: 'Liga topilmadi.' });
    }

    const activeCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'active'").get(league.id).count;
    const waitlistCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'waitlist'").get(league.id).count;
    const totalMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ?").get(league.id).count;
    const finishedMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ? AND status = 'finished'").get(league.id).count;

    res.json({
      success: true,
      league: {
        ...league,
        isCompleted,
        slots: {
          occupied: activeCount,
          limit: league.participant_limit,
          isFull: activeCount >= league.participant_limit,
          waitlistCount
        },
        progress: {
          totalMatches,
          finishedMatches,
          percentage: totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0
        }
      }
    });
  } catch (err) {
    console.error('Liga ma\'lumotlarini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all archived seasons history (Public for all players & admin)
router.get('/seasons-history', (req, res) => {
  try {
    const archives = db.prepare(`
      SELECT id, league_id, league_name, season, total_rounds, winner_name, winner_club, completed_at
      FROM season_archives 
      ORDER BY id DESC
    `).all();

    res.json({
      success: true,
      archives
    });
  } catch (err) {
    console.error('Mavsumlar tarixini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get details of a single archived season
router.get('/seasons-history/:id', (req, res) => {
  try {
    const archiveId = parseInt(req.params.id, 10);
    const archive = db.prepare('SELECT * FROM season_archives WHERE id = ?').get(archiveId);
    if (!archive) {
      return res.status(404).json({ success: false, message: 'Mavsum arxivi topilmadi.' });
    }

    let standings = [];
    let matches = [];
    let awards = null;

    try { standings = JSON.parse(archive.standings_json || '[]'); } catch (e) {}
    try { matches = JSON.parse(archive.matches_json || '[]'); } catch (e) {}
    try { if (archive.awards_json) awards = JSON.parse(archive.awards_json); } catch (e) {}

    res.json({
      success: true,
      archive: {
        id: archive.id,
        league_id: archive.league_id,
        league_name: archive.league_name,
        season: archive.season,
        total_rounds: archive.total_rounds,
        winner_name: archive.winner_name,
        winner_club: archive.winner_club,
        completed_at: archive.completed_at,
        standings,
        matches,
        awards
      }
    });
  } catch (err) {
    console.error('Mavsum arxivini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: create new league
router.post('/create', (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat admin uchun ruxsat etilgan.' });
    }

    const { name, season, participant_limit, unique_clubs, rules } = req.body;
    if (!name || !season) {
      return res.status(400).json({ success: false, message: 'Liga nomi va mavsum kiritilishi shart.' });
    }

    const limit = parseInt(participant_limit, 10) || 12;
    const unique = unique_clubs ? 1 : 0;
    const defaultRules = rules || `1. O‘yinlar eFootball Friend Match rejimida o‘tkaziladi.\n2. O‘yin vaqti: 10 daqiqa.\n3. O‘yin yakunlangach statistika skrinshoti majburiy yuklanadi.`;

    // Mark previous leagues as completed if needed, or create new
    const stmt = db.prepare(`
      INSERT INTO leagues (name, season, participant_limit, unique_clubs, rules, status)
      VALUES (?, ?, ?, ?, ?, 'registration')
    `);
    const info = stmt.run(name, season, limit, unique, defaultRules);

    res.json({
      success: true,
      message: 'Yangi liga muvaffaqiyatli yaratildi!',
      leagueId: info.lastInsertRowid
    });
  } catch (err) {
    console.error('Liga yaratishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: update league settings
router.put('/settings', (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat admin uchun ruxsat etilgan.' });
    }

    const { id, name, season, participant_limit, unique_clubs, rules, status } = req.body;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Liga ID kiritilmadi.' });
    }

    const current = db.prepare('SELECT * FROM leagues WHERE id = ?').get(id);
    if (!current) {
      return res.status(404).json({ success: false, message: 'Liga topilmadi.' });
    }

    db.prepare(`
      UPDATE leagues 
      SET name = COALESCE(?, name),
          season = COALESCE(?, season),
          participant_limit = COALESCE(?, participant_limit),
          unique_clubs = COALESCE(?, unique_clubs),
          rules = COALESCE(?, rules),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      season,
      participant_limit ? parseInt(participant_limit, 10) : null,
      unique_clubs !== undefined ? (unique_clubs ? 1 : 0) : null,
      rules,
      status,
      id
    );

    res.json({ success: true, message: 'Liga sozlamalari muvaffaqiyatli yangilandi.' });
  } catch (err) {
    console.error('Liga sozlamalarini yangilashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
