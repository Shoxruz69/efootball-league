const express = require('express');
const router = express.Router();
const db = require('../db');

// Get list of upcoming/current matches available for prediction
router.get('/matches', (req, res) => {
  try {
    const telegramId = String(req.telegramUser?.id || '');
    const league = db.prepare("SELECT id FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, matches: [] });
    }

    const matches = db.prepare(`
      SELECT 
        m.id, m.round, m.status,
        h.player_name as home_name, h.club_name as home_club, h.club_badge_color as home_color,
        a.player_name as away_name, a.club_name as away_club, a.club_badge_color as away_color,
        p.predicted_home, p.predicted_away, p.points_earned
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      LEFT JOIN predictions p ON p.match_id = m.id AND p.telegram_id = ?
      WHERE m.league_id = ? AND m.status != 'finished'
      ORDER BY m.round ASC, m.id ASC
    `).all(telegramId, league.id);

    res.json({ success: true, matches });
  } catch (err) {
    console.error('Taxmin uchrashuvlarini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Submit a score prediction
router.post('/predict', (req, res) => {
  try {
    const { match_id, predicted_home, predicted_away, predictor_name } = req.body;
    const telegramUser = req.telegramUser || {};
    const telegramId = String(telegramUser.id || req.body.telegram_id || '');

    if (!telegramId) {
      return res.status(400).json({ success: false, message: 'Foydalanuvchi aniqlanmadi.' });
    }

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    if (match.status === 'finished') {
      return res.status(400).json({ success: false, message: 'Uchrashuv allaqachon yakunlangan, taxmin kiritib bo\'lmaydi.' });
    }

    const h = parseInt(predicted_home, 10);
    const a = parseInt(predicted_away, 10);

    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      return res.status(400).json({ success: false, message: 'Hisobni to‘g‘ri raqamlarda kiriting.' });
    }

    const name = predictor_name || telegramUser.first_name || telegramUser.username || 'Foydalanuvchi';

    // Upsert prediction
    db.prepare(`
      INSERT INTO predictions (match_id, telegram_id, predictor_name, predicted_home, predicted_away)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(match_id, telegram_id) DO UPDATE SET
        predicted_home = excluded.predicted_home,
        predicted_away = excluded.predicted_away,
        predictor_name = excluded.predictor_name
    `).run(match_id, telegramId, name, h, a);

    res.json({
      success: true,
      message: `Taxminingiz qabul qilindi: ${h} - ${a}`
    });
  } catch (err) {
    console.error('Taxmin kiritishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Predictor Leaderboard (Taxminchilar reytingi)
router.get('/leaderboard', (req, res) => {
  try {
    const leaderboard = db.prepare(`
      SELECT 
        telegram_id,
        predictor_name,
        COUNT(id) as total_predictions,
        SUM(CASE WHEN points_earned = 3 THEN 1 ELSE 0 END) as exact_scores,
        SUM(CASE WHEN points_earned = 1 THEN 1 ELSE 0 END) as correct_outcomes,
        SUM(points_earned) as total_points
      FROM predictions
      GROUP BY telegram_id
      ORDER BY total_points DESC, exact_scores DESC
      LIMIT 20
    `).all();

    res.json({
      success: true,
      leaderboard: leaderboard.map((l, index) => ({
        rank: index + 1,
        ...l,
        total_points: l.total_points || 0,
        exact_scores: l.exact_scores || 0
      }))
    });
  } catch (err) {
    console.error('Taxmin reytingini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
