const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { broadcast } = require('../services/websocket');
const { createAdminSession, destroyAdminSession } = require('../middleware/auth');
const { generateRoundRobinFixtures } = require('../services/fixtureGenerator');

// 1. Web Admin Login Endpoint (Password Authentication)
router.post('/login', (req, res) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Admin paroli kiritilmadi.' });
    }

    const submittedBuf = Buffer.from(password);
    const expectedBuf = Buffer.from(config.adminPassword);

    let match = false;
    if (submittedBuf.length === expectedBuf.length) {
      match = crypto.timingSafeEqual(submittedBuf, expectedBuf);
    }

    if (!match) {
      return res.status(401).json({ success: false, message: 'Noto‘g‘ri admin paroli.' });
    }

    // Create secure server-side session token
    const token = createAdminSession();

    // Set secure HttpOnly cookie
    res.setHeader('Set-Cookie', `admin_session=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`);

    res.json({
      success: true,
      token,
      message: 'Muvaffaqiyatli avtorizatsiyadan o‘tildi.'
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Check Admin Authentication Status
router.get('/auth/check', (req, res) => {
  res.json({
    success: true,
    isAdmin: Boolean(req.isAdmin),
    isSession: Boolean(req.isAdminSession)
  });
});

// 3. Web Admin Logout Endpoint
router.post('/logout', (req, res) => {
  if (req.adminToken) {
    destroyAdminSession(req.adminToken);
  }
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ success: true, message: 'Tizimdan chiqildi.' });
});

// -----------------------------------------------------------------------------
// STRICT SERVER-SIDE PROTECTION: ALL BELOW ROUTES REQUIRE req.isAdmin === true
// -----------------------------------------------------------------------------
router.use((req, res, next) => {
  if (!req.isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Ruxsat berilmagan. Ushbu amal faqat tasdiqlangan liga adminlari uchun.'
    });
  }
  next();
});

// 4. Get all disputed matches
router.get('/disputes', (req, res) => {
  try {
    const disputes = db.prepare(`
      SELECT 
        m.*,
        h.player_name as home_name, h.club_name as home_club,
        a.player_name as away_name, a.club_name as away_club
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE m.status = 'disputed'
      ORDER BY m.updated_at DESC
    `).all();

    res.json({ success: true, disputes });
  } catch (err) {
    console.error('Nizoli o‘yinlarni olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Resolve a disputed match
router.post('/resolve-dispute/:id', (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const { action, home_score, away_score } = req.body; // action: 'finish' or 'reset'

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    if (action === 'finish') {
      const h = parseInt(home_score, 10);
      const a = parseInt(away_score, 10);

      if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
        return res.status(400).json({ success: false, message: 'Hisob to‘g‘ri kiritilishi shart.' });
      }

      db.prepare(`
        UPDATE matches
        SET home_score = ?,
            away_score = ?,
            status = 'finished',
            home_confirmed = 1,
            away_confirmed = 1,
            dispute_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(h, a, matchId);

      broadcast({ type: 'standings_updated', leagueId: match.league_id });
      res.json({ success: true, message: `Nizo hal qilindi: ${h} - ${a} hisobi rasman tasdiqlandi.` });

    } else if (action === 'reset') {
      db.prepare(`
        UPDATE matches
        SET home_score = NULL,
            away_score = NULL,
            status = 'scheduled',
            screenshot_url = NULL,
            stats_json = NULL,
            ai_summary = NULL,
            home_confirmed = 0,
            away_confirmed = 0,
            dispute_reason = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(matchId);

      broadcast({ type: 'match_reset', matchId });
      res.json({ success: true, message: 'Uchrashuv qayta o‘ynash uchun tiklandi.' });
    } else {
      res.status(400).json({ success: false, message: 'Noma‘lum amal.' });
    }
  } catch (err) {
    console.error('Nizoni hal qilishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Trigger draw / generate Berger schedule
router.post('/draw', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(400).json({ success: false, message: 'Faol liga mavjud emas.' });
    }

    const existingCount = db.prepare("SELECT COUNT(*) as count FROM matches WHERE league_id = ?").get(league.id).count;
    if (existingCount > 0 && !req.body.force) {
      return res.status(400).json({
        success: false,
        message: 'Taqvim allaqachon tuzilgan. Qaytadan qur‘a tashlash uchun "force" belgisini yuboring.'
      });
    }

    const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    if (participants.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Taqvim tuzish uchun kamida 2 nafar faol ishtirokchi kerak.'
      });
    }

    if (existingCount > 0 && req.body.force) {
      db.prepare('DELETE FROM matches WHERE league_id = ?').run(league.id);
      db.prepare('DELETE FROM predictions WHERE match_id NOT IN (SELECT id FROM matches)').run();
    }

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

    db.prepare(`
      UPDATE leagues 
      SET status = 'active', total_rounds = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(maxRound, league.id);

    broadcast({ type: 'schedule_generated', leagueId: league.id });

    res.json({
      success: true,
      message: `Qur‘a muvaffaqiyatli tashlandi! ${participants.length} ta jamoa uchun ${fixtures.length} ta o‘yin (${maxRound} tur) taqvimi tuzildi.`
    });
  } catch (err) {
    console.error('Taqvim tuzishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Advance round
router.post('/advance-round', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(404).json({ success: false, message: 'Liga topilmadi.' });
    }

    const nextRound = league.current_round + 1;
    if (nextRound > league.total_rounds) {
      return res.status(400).json({ success: false, message: 'Bu yakuniy tur edi. Mavsumni yakunlashingiz mumkin.' });
    }

    db.prepare('UPDATE leagues SET current_round = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextRound, league.id);
    broadcast({ type: 'round_advanced', newRound: nextRound });

    res.json({ success: true, message: `${nextRound}-Tur boshlandi!`, currentRound: nextRound });
  } catch (err) {
    console.error('Turni o‘zgartirishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Complete season
router.post('/complete-season', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(404).json({ success: false, message: 'Liga topilmadi.' });
    }

    db.prepare("UPDATE leagues SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(league.id);
    broadcast({ type: 'season_completed', leagueId: league.id });

    res.json({ success: true, message: 'Mavsum rasman yakunlandi!' });
  } catch (err) {
    console.error('Mavsumni yakunlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Manually edit any match score
router.put('/matches/:id', (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const { home_score, away_score, status } = req.body;

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    const h = home_score !== undefined && home_score !== null ? parseInt(home_score, 10) : match.home_score;
    const a = away_score !== undefined && away_score !== null ? parseInt(away_score, 10) : match.away_score;
    const s = status || match.status;

    db.prepare(`
      UPDATE matches
      SET home_score = ?,
          away_score = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(h, a, s, matchId);

    broadcast({ type: 'standings_updated', leagueId: match.league_id });
    res.json({ success: true, message: 'Uchrashuv ma‘lumotlari admin tomonidan yangilandi.' });
  } catch (err) {
    console.error('Uchrashuvni tahrirlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
