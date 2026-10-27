const express = require('express');
const router = express.Router();
const db = require('../db');

// Get current active league details with slots info
router.get('/current', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(404).json({ success: false, message: 'Faol liga topilmadi.' });
    }

    const activeCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'active'").get(league.id).count;
    const waitlistCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'waitlist'").get(league.id).count;
    const totalMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ?").get(league.id).count;
    const finishedMatches = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ? AND status = 'finished'").get(league.id).count;

    res.json({
      success: true,
      league: {
        ...league,
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
