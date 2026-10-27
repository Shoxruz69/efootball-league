const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const config = require('../config');
const { analyzeMatchScreenshot } = require('../services/ocrService');
const { broadcast, broadcastMatchEvent } = require('../services/websocket');
const { notifyOpponentOfResult, notifyResultConfirmed } = require('../services/botNotifier');
const { checkRoundLocked, checkAndAdvanceRound } = require('../services/roundManager');

// Setup multer for screenshot uploads
const uploadDir = path.join(__dirname, '..', config.uploadDir);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `match_${req.params.id}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Faqat rasm fayllari (JPEG, PNG, WebP) qabul qilinadi.'));
    }
    cb(null, true);
  }
});

// Helper: Award predictor points when a match finishes
function settlePredictions(matchId, homeScore, awayScore) {
  const predictions = db.prepare('SELECT * FROM predictions WHERE match_id = ?').all(matchId);
  const updateStmt = db.prepare('UPDATE predictions SET points_earned = ? WHERE id = ?');

  predictions.forEach(p => {
    let points = 0;
    // Exact score: 3 points
    if (p.predicted_home === homeScore && p.predicted_away === awayScore) {
      points = 3;
    } else {
      // Correct outcome: 1 point
      const actualOutcome = homeScore > awayScore ? 'H' : (homeScore < awayScore ? 'A' : 'D');
      const predOutcome = p.predicted_home > p.predicted_away ? 'H' : (p.predicted_home < p.predicted_away ? 'A' : 'D');
      if (actualOutcome === predOutcome) {
        points = 1;
      }
    }
    updateStmt.run(points, p.id);
  });
}

// 1. Upload screenshot (Manual entry - NO AI/OCR)
router.post('/upload-screenshot/:id', upload.single('screenshot'), (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Skrinshot fayli yuklanmadi.' });
    }

    const match = db.prepare(`SELECT id, league_id, round FROM matches WHERE id = ?`).get(matchId);
    if (!match) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    // Check if the match's round is locked
    const lockCheck = checkRoundLocked(match.league_id, match.round);
    if (lockCheck.locked) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      const pendingText = lockCheck.pendingMatches.map(p => p.title).join(', ');
      return res.status(400).json({
        success: false,
        locked: true,
        message: `${match.round}-tur qulflangan. Avval ${lockCheck.currentRound}-turning barcha o‘yinlari yakunlanishi shart!`,
        currentRound: lockCheck.currentRound,
        matchRound: match.round,
        pendingMatches: lockCheck.pendingMatches,
        pendingText
      });
    }

    const relativeUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      screenshotUrl: relativeUrl
    });
  } catch (err) {
    console.error('Skrinshot yuklashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Submit match result manually (requires screenshot)
router.post('/submit/:id', async (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const { home_score, away_score, screenshot_url } = req.body;
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT 
        m.*,
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

    // Check if the match's round is locked (waiting for previous round to finish)
    const lockCheck = checkRoundLocked(match.league_id, match.round);
    if (lockCheck.locked) {
      const pendingText = lockCheck.pendingMatches.map(p => p.title).join(', ');
      const msg = `${match.round}-tur o‘yinlarini kiritish qulflangan. Avval ${lockCheck.currentRound}-turning barcha o‘yinlari yakunlanishi shart!`;
      return res.status(400).json({
        success: false,
        locked: true,
        error: msg,
        message: msg,
        currentRound: lockCheck.currentRound,
        matchRound: match.round,
        pending_matches: lockCheck.pendingMatches,
        pendingMatches: lockCheck.pendingMatches,
        pendingText
      });
    }

    // Only participants can submit
    const isHome = match.home_tg === telegramId;
    const isAway = match.away_tg === telegramId;

    if (!isHome && !isAway && !req.isAdmin) {
      return res.status(403).json({ success: false, message: 'Faqat shu uchrashuvda qatnashgan ikki o‘yinchidan biri natija kirita oladi.' });
    }

    // Finished match cannot be edited
    if (match.status === 'finished') {
      return res.status(400).json({ success: false, message: 'Ushbu uchrashuv natijasi allaqachon tasdiqlangan va yakunlangan.' });
    }

    // If opponent already submitted, show exact message
    if (match.status === 'submitted') {
      return res.status(400).json({
        success: false,
        message: 'Bu uchrashuv natijasi allaqachon kiritilgan',
        already_submitted: true,
        matchId: match.id,
        home_score: match.home_score,
        away_score: match.away_score,
        screenshot_url: match.screenshot_url
      });
    }

    // Mandatory screenshot check
    if (!screenshot_url) {
      return res.status(400).json({ success: false, message: 'O‘yin skrinshotini yuklash majburiy.' });
    }

    const hScore = parseInt(home_score, 10);
    const aScore = parseInt(away_score, 10);

    if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
      return res.status(400).json({ success: false, message: 'Hisob to‘g‘ri butun sonlarda kiritilishi shart.' });
    }

    const uploaderParticipantId = isHome ? match.home_participant_id : match.away_participant_id;

    // Update match record
    db.prepare(`
      UPDATE matches
      SET home_score = ?,
          away_score = ?,
          screenshot_url = ?,
          uploader_participant_id = ?,
          status = 'submitted',
          home_confirmed = ?,
          away_confirmed = ?,
          dispute_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      hScore,
      aScore,
      screenshot_url,
      uploaderParticipantId,
      isHome ? 1 : 0,
      isAway ? 1 : 0,
      matchId
    );

    const scoreText = `${hScore} - ${aScore}`;

    // Notify BOTH players via Telegram Bot
    const { notifyBothPlayersOfResult } = require('../services/botNotifier');
    await notifyBothPlayersOfResult(match, telegramId, scoreText, screenshot_url);

    // Broadcast to live Mini Apps
    broadcastMatchEvent(matchId, {
      status: 'submitted',
      home_score: hScore,
      away_score: aScore,
      screenshot_url
    });

    res.json({
      success: true,
      message: 'Natija kiritildi! Raqib tasdiqlashi uchun yuborildi.',
      matchId,
      status: 'submitted'
    });
  } catch (err) {
    console.error('Natijani saqlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Opponent confirms match result
router.post('/confirm/:id', async (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT 
        m.*,
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
      return res.status(403).json({ success: false, message: 'Faqat uchrashuv ishtirokchisi tasdiqlay oladi.' });
    }

    // Set match as finished
    db.prepare(`
      UPDATE matches
      SET status = 'finished',
          home_confirmed = 1,
          away_confirmed = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(matchId);

    // Settle prediction points if table exists
    try {
      settlePredictions(matchId, match.home_score, match.away_score);
    } catch (e) {}

    // Notify BOTH players that result is officially confirmed
    const { notifyResultConfirmed } = require('../services/botNotifier');
    const scoreText = `${match.home_score} - ${match.away_score}`;
    await notifyResultConfirmed(match.home_tg, match.away_tg, match.home_name, match.away_name, scoreText);

    // Broadcast match finished & standings update
    broadcastMatchEvent(matchId, {
      status: 'finished',
      home_score: match.home_score,
      away_score: match.away_score
    });
    broadcast({ type: 'standings_updated', leagueId: match.league_id });

    // Check if current round is complete and automatically advance!
    const advanceInfo = checkAndAdvanceRound(match.league_id);
    let successMsg = 'Uchrashuv natijasi rasman tasdiqlandi va turnir jadvaliga qo‘shildi!';
    if (advanceInfo?.advanced) {
      successMsg += ` ${match.round}-turning barcha o‘yinlari yakunlandi, ${advanceInfo.newRound}-tur avtomatik ochildi!`;
    }

    res.json({
      success: true,
      message: successMsg,
      matchId,
      status: 'finished',
      roundAdvanced: Boolean(advanceInfo?.advanced),
      newRound: advanceInfo?.newRound || null
    });
  } catch (err) {
    console.error('Natijani tasdiqlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Opponent disputes result
router.post('/dispute/:id', (req, res) => {
  try {
    const matchId = parseInt(req.params.id, 10);
    const { reason } = req.body;
    const telegramId = String(req.telegramUser?.id || '');

    const match = db.prepare(`
      SELECT 
        m.*,
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
      return res.status(403).json({ success: false, message: 'Faqat ishtirokchilar e\'tiroz bildira oladi.' });
    }

    const disputeReason = reason || 'Ishtirokchi kiritilgan hisob yoki skrinshotga e\'tiroz bildirdi.';

    db.prepare(`
      UPDATE matches
      SET status = 'disputed',
          dispute_reason = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(disputeReason, matchId);

    broadcastMatchEvent(matchId, {
      status: 'disputed',
      reason: disputeReason
    });

    res.json({
      success: true,
      message: 'E\'tiroz qabul qilindi. Uchrashuv tekshiruv uchun adminga yuborildi.',
      matchId,
      status: 'disputed'
    });
  } catch (err) {
    console.error('Nizoni saqlashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
