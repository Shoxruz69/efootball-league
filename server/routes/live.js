const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcastMatchEvent } = require('../services/websocket');

// Start Live Mode for a match
router.post('/start/:matchId', (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId, 10);
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT m.*, h.telegram_id as home_tg, a.telegram_id as away_tg
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.id = ?
    `).get(matchId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    if (match.home_tg !== telegramId && match.away_tg !== telegramId && !req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat ishtirokchilar jonli rejimni boshlashi mumkin.' });
    }

    let liveState = match.live_state_json ? JSON.parse(match.live_state_json) : null;
    if (!liveState) {
      liveState = {
        homeScore: match.home_score || 0,
        awayScore: match.away_score || 0,
        events: []
      };
    }

    db.prepare(`
      UPDATE matches
      SET status = 'live',
          home_score = COALESCE(home_score, 0),
          away_score = COALESCE(away_score, 0),
          live_state_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(liveState), matchId);

    broadcastMatchEvent(matchId, {
      type: 'live_started',
      liveState
    });

    res.json({ success: true, liveState });
  } catch (err) {
    console.error('Jonli rejimni boshlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Propose a live goal event
router.post('/goal/:matchId', (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId, 10);
    const { team, minute, scorer } = req.body; // team: 'home' | 'away'
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT m.*, 
        h.player_name as home_name, h.telegram_id as home_tg,
        a.player_name as away_name, a.telegram_id as away_tg
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.id = ?
    `).get(matchId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    const isHome = match.home_tg === telegramId;
    const isAway = match.away_tg === telegramId;

    if (!isHome && !isAway && !req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Ruxsat berilmadi.' });
    }

    let liveState = match.live_state_json ? JSON.parse(match.live_state_json) : {
      homeScore: match.home_score || 0,
      awayScore: match.away_score || 0,
      events: []
    };

    const newEvent = {
      id: Date.now(),
      team: team || (isHome ? 'home' : 'away'),
      minute: parseInt(minute, 10) || null,
      scorer: (scorer || 'Noma\'lum o\'yinchi').trim(),
      proposedBy: isHome ? 'home' : 'away',
      proposerName: isHome ? match.home_name : match.away_name,
      status: 'pending_confirmation'
    };

    liveState.events.push(newEvent);

    db.prepare(`
      UPDATE matches
      SET live_state_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(liveState), matchId);

    broadcastMatchEvent(matchId, {
      type: 'goal_proposed',
      event: newEvent,
      liveState
    });

    res.json({ success: true, event: newEvent, liveState });
  } catch (err) {
    console.error('Gol kiritishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Confirm or reject a proposed live goal
router.post('/confirm-goal/:matchId', (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId, 10);
    const { eventId, approved } = req.body;
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT m.*, h.telegram_id as home_tg, a.telegram_id as away_tg
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.id = ?
    `).get(matchId);

    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    let liveState = match.live_state_json ? JSON.parse(match.live_state_json) : null;
    if (!liveState) {
      return res.status(400).json({ success: false, message: 'Jonli holat topilmadi.' });
    }

    const event = liveState.events.find(e => e.id === eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Gol hodisasi topilmadi.' });
    }

    if (approved) {
      event.status = 'confirmed';
      if (event.team === 'home') {
        liveState.homeScore = (liveState.homeScore || 0) + 1;
      } else {
        liveState.awayScore = (liveState.awayScore || 0) + 1;
      }

      db.prepare(`
        UPDATE matches
        SET home_score = ?,
            away_score = ?,
            live_state_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(liveState.homeScore, liveState.awayScore, JSON.stringify(liveState), matchId);
    } else {
      event.status = 'rejected';
      db.prepare(`
        UPDATE matches
        SET live_state_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(JSON.stringify(liveState), matchId);
    }

    broadcastMatchEvent(matchId, {
      type: approved ? 'goal_confirmed' : 'goal_rejected',
      event,
      liveState
    });

    res.json({ success: true, approved, liveState });
  } catch (err) {
    console.error('Golni tasdiqlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
