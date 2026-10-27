const express = require('express');
const router = express.Router();
const db = require('../db');
const { broadcast } = require('../services/websocket');
const { sendTelegramNotification } = require('../services/botNotifier');
const config = require('../config');

// Get all participants of current league
router.get('/', (req, res) => {
  try {
    const league = db.prepare("SELECT id FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, active: [], waitlist: [] });
    }

    const active = db.prepare(`
      SELECT id, telegram_id, username, first_name, player_name, club_name, club_badge_color, avatar_url, registered_at
      FROM participants
      WHERE league_id = ? AND status = 'active'
      ORDER BY registered_at ASC
    `).all(league.id);

    const waitlist = db.prepare(`
      SELECT id, telegram_id, username, first_name, player_name, club_name, club_badge_color, waitlist_order, registered_at
      FROM participants
      WHERE league_id = ? AND status = 'waitlist'
      ORDER BY waitlist_order ASC
    `).all(league.id);

    res.json({
      success: true,
      active,
      waitlist,
      slots: {
        total: active.length,
        waitlist: waitlist.length
      }
    });
  } catch (err) {
    console.error('Ishtirokchilarni olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check current user status and computed profile stats
router.get('/me', (req, res) => {
  try {
    const telegramId = String(req.telegramUser?.id || '');
    if (!telegramId) {
      return res.json({ success: true, participant: null, stats: null });
    }

    let league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      league = db.prepare("SELECT * FROM leagues ORDER BY id DESC LIMIT 1").get();
    }
    if (!league) {
      return res.json({ success: true, participant: null, stats: null });
    }

    let participant = db.prepare(`
      SELECT * FROM participants 
      WHERE league_id = ? AND telegram_id = ? AND status != 'removed'
      LIMIT 1
    `).get(league.id, telegramId);

    // If player registered in previous seasons, automatically preserve them into current season!
    if (!participant) {
      const anyPrevious = db.prepare(`
        SELECT * FROM participants 
        WHERE telegram_id = ? AND status != 'removed'
        ORDER BY id DESC LIMIT 1
      `).get(telegramId);

      if (anyPrevious) {
        try {
          const insertStmt = db.prepare(`
            INSERT INTO participants (
              league_id, telegram_id, username, first_name, player_name, 
              club_name, club_badge_color, avatar_url, status, waitlist_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)
          `);
          const info = insertStmt.run(
            league.id, anyPrevious.telegram_id, anyPrevious.username, anyPrevious.first_name,
            anyPrevious.player_name, anyPrevious.club_name, anyPrevious.club_badge_color, anyPrevious.avatar_url
          );
          participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(info.lastInsertRowid);
        } catch (e) {
          participant = anyPrevious;
        }
      }
    }

    if (!participant) {
      return res.json({ success: true, participant: null, stats: null, isAdmin: req.isAdmin });
    }

    // 1. O‘ynagan sezonlari soni (arxivlar + joriy ligalar)
    const totalSeasonsRow = db.prepare(`
      SELECT COUNT(DISTINCT league_id) as count 
      FROM participants 
      WHERE telegram_id = ? AND status != 'removed'
    `).get(telegramId);
    const totalSeasons = Math.max(totalSeasonsRow?.count || 1, 1);

    // 2. Joriy mavsum statistikasi (Yangi mavsumda 0 dan boshlanadi)
    const currentSeasonMatches = db.prepare(`
      SELECT m.* 
      FROM matches m
      JOIN participants p ON (p.id = m.home_participant_id OR p.id = m.away_participant_id)
      WHERE m.league_id = ? AND p.telegram_id = ? AND m.status = 'finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
    `).all(league.id, telegramId);

    const uniqueMatchMap = new Map();
    currentSeasonMatches.forEach(m => uniqueMatchMap.set(m.id, m));

    let won = 0, drawn = 0, lost = 0, goalsFor = 0, goalsAgainst = 0;
    uniqueMatchMap.forEach(m => {
      const isHome = m.home_participant_id === participant.id;
      const myScore = isHome ? m.home_score : m.away_score;
      const oppScore = isHome ? m.away_score : m.home_score;

      goalsFor += myScore;
      goalsAgainst += oppScore;

      if (myScore > oppScore) won++;
      else if (myScore < oppScore) lost++;
      else drawn++;
    });

    // 3. Hozirgi turnirdagi ochko va o‘rni (Standings hisoblash)
    const activeParticipants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    const activeMatches = db.prepare("SELECT * FROM matches WHERE league_id = ?").all(league.id);
    const { calculateStandings } = require('../services/fixtureGenerator');
    const standings = calculateStandings(activeParticipants, activeMatches);
    const myStanding = standings.find(s => s.participant_id === participant.id);

    const currentPoints = myStanding ? myStanding.points : 0;
    const currentRank = myStanding ? myStanding.rank : '-';

    // 4. Eng yaxshi mavsum (arxivlangan mavsumlar va yakunlangan ligalar orasidan)
    let bestSeason = 'Hali yakunlanmagan';
    const archives = db.prepare("SELECT * FROM season_archives ORDER BY id ASC").all();
    if (archives.length > 0) {
      let bestRank = 9999;
      let bestPts = -1;
      archives.forEach(arch => {
        try {
          const archStandings = JSON.parse(arch.standings_json || '[]');
          const myArchStanding = archStandings.find(s => String(s.telegram_id) === telegramId);
          if (myArchStanding) {
            if (myArchStanding.rank < bestRank || (myArchStanding.rank === bestRank && myArchStanding.points > bestPts)) {
              bestRank = myArchStanding.rank;
              bestPts = myArchStanding.points;
              bestSeason = `${arch.season} (${myArchStanding.rank}-o‘rin, ${myArchStanding.points} ochko)`;
            }
          }
        } catch (e) {}
      });
    }

    res.json({
      success: true,
      participant,
      isAdmin: req.isAdmin,
      stats: {
        total_seasons: totalSeasons,
        best_season: bestSeason,
        won,
        drawn,
        lost,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        current_points: currentPoints,
        current_rank: currentRank
      }
    });
  } catch (err) {
    console.error('Foydalanuvchi ma\'lumotini tekshirishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Register new participant (only terms agreement and nickname)
router.post('/register', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(400).json({ success: false, message: 'Hozirda ro‘yxatdan o‘tish uchun faol liga mavjud emas.' });
    }

    const { rules_accepted } = req.body;
    const rawNickname = req.body.nickname || req.body.player_name || '';
    const cleanNickname = String(rawNickname).trim();

    const telegramUser = req.telegramUser || {};
    const telegramId = String(telegramUser.id || req.body.telegram_id || '');

    if (!telegramId) {
      return res.status(400).json({ success: false, message: 'Telegram foydalanuvchi ma\'lumotlari topilmadi.' });
    }

    if (!rules_accepted) {
      return res.status(400).json({ success: false, message: 'Turnirda qatnashish uchun qoidalarga rozilik bildirish shart.' });
    }

    if (!cleanNickname || cleanNickname.length < 2) {
      return res.status(400).json({ success: false, message: 'Nickname kamida 2 ta belgidan iborat bo‘lishi shart.' });
    }

    // 1. Check if user already registered in this league
    const existingUser = db.prepare(`
      SELECT * FROM participants 
      WHERE league_id = ? AND telegram_id = ? AND status != 'removed'
    `).get(league.id, telegramId);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.status === 'active' 
          ? `Siz allaqachon "${existingUser.player_name}" nickname'i bilan ro‘yxatdan o‘tgansiz!`
          : `Siz allaqachon kutish ro‘yxatidasiz (Navbat: #${existingUser.waitlist_order})!`
      });
    }

    // 2. Strict case-insensitive trimmed duplicate nickname check
    const nicknameTaken = db.prepare(`
      SELECT id, player_name FROM participants 
      WHERE league_id = ? AND status != 'removed' AND LOWER(TRIM(player_name)) = LOWER(?)
    `).get(league.id, cleanNickname);

    if (nicknameTaken) {
      return res.status(400).json({
        success: false,
        message: 'Bu nickname band, boshqasini tanlang'
      });
    }

    // 3. Check slots limit
    const activeCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'active'").get(league.id).count;
    const isFull = activeCount >= league.participant_limit;

    let status = 'active';
    let waitlistOrder = 0;

    if (isFull) {
      const waitlistCount = db.prepare("SELECT COUNT(*) as count FROM participants WHERE league_id = ? AND status = 'waitlist'").get(league.id).count;
      status = 'waitlist';
      waitlistOrder = waitlistCount + 1;
    }

    const stmt = db.prepare(`
      INSERT INTO participants (
        league_id, telegram_id, username, first_name, player_name, 
        club_name, club_badge_color, avatar_url, status, waitlist_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      league.id,
      telegramId,
      telegramUser.username || null,
      telegramUser.first_name || null,
      cleanNickname,
      '', // No club required
      '#7c528a',
      null,
      status,
      waitlistOrder
    );

    const participantId = result.lastInsertRowid;

    // Broadcast update to open clients
    broadcast({
      type: 'participants_updated',
      leagueId: league.id,
      newParticipant: {
        id: participantId,
        player_name: cleanNickname,
        club_name: '',
        status,
        waitlistOrder
      }
    });

    if (status === 'waitlist') {
      return res.json({
        success: true,
        status: 'waitlist',
        message: `Asosiy joylar to‘lgan. Siz kutish ro‘yxatiga #${waitlistOrder}-raqam bilan qo‘shildingiz! Joy bo‘shashi bilan sizga xabar beriladi.`,
        participantId,
        participant: {
          id: participantId,
          player_name: cleanNickname,
          status,
          waitlist_order: waitlistOrder
        }
      });
    }

    res.json({
      success: true,
      status: 'active',
      message: `Tabriklaymiz! Siz ligaga muvaffaqiyatli qabul qilindingiz: ${cleanNickname}`,
      participantId,
      participant: {
        id: participantId,
        player_name: cleanNickname,
        status,
        waitlist_order: 0
      }
    });
  } catch (err) {
    console.error('Ro‘yxatdan o‘tishda xatolik:', err);
    res.status(500).json({ success: false, message: 'Server xatosi: ' + err.message });
  }
});

// Add 5 test participants endpoint (without removing existing players)
router.post('/add-test-participants', (req, res) => {
  try {
    const league = db.prepare("SELECT id FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.status(404).json({ success: false, message: 'Faol liga topilmadi.' });
    }

    const testParticipants = [
      { tg: '10002', name: 'Javohir', club: 'Barcelona', color: '#a50044' },
      { tg: '10003', name: 'Bekzod', club: 'Manchester City', color: '#6cabdd' },
      { tg: '10004', name: 'Sardor', club: 'Arsenal', color: '#ef0107' },
      { tg: '10005', name: 'Alisher', club: 'Bayern Munich', color: '#dc052d' },
      { tg: '10006', name: 'Doniyor', club: 'Inter Milan', color: '#00e5ff' }
    ];

    let addedCount = 0;
    const insertStmt = db.prepare(`
      INSERT INTO participants (league_id, telegram_id, player_name, club_name, club_badge_color, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `);

    for (const p of testParticipants) {
      const exists = db.prepare(`
        SELECT id FROM participants 
        WHERE league_id = ? AND (telegram_id = ? OR LOWER(TRIM(player_name)) = LOWER(?))
      `).get(league.id, p.tg, p.name);

      if (!exists) {
        insertStmt.run(league.id, p.tg, p.name, p.club, p.color);
        addedCount++;
      }
    }

    broadcast({ type: 'participants_updated', leagueId: league.id });
    res.json({
      success: true,
      message: `${addedCount} ta test ishtirokchisi qo‘shildi.`,
      addedCount
    });
  } catch (err) {
    console.error('Test ishtirokchilarini qo‘shishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin remove participant or user leaves
router.post('/remove', (req, res) => {
  try {
    const { participant_id } = req.body;
    const telegramId = String(req.telegramUser?.id || '');

    const participant = db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id);
    if (!participant) {
      return res.status(404).json({ success: false, message: 'Ishtirokchi topilmadi.' });
    }

    // Permission check: admin or own participant
    if (!req.isAdmin && participant.telegram_id !== telegramId) {
      return res.status(403).json({ success: false, message: 'Ruxsat berilmadi.' });
    }

    const wasActive = participant.status === 'active';
    const leagueId = participant.league_id;

    // Mark as removed
    db.prepare("UPDATE participants SET status = 'removed' WHERE id = ?").run(participant.id);

    // If an active participant was removed, automatically promote next from waitlist!
    let promoted = null;
    if (wasActive) {
      const nextInLine = db.prepare(`
        SELECT * FROM participants 
        WHERE league_id = ? AND status = 'waitlist'
        ORDER BY waitlist_order ASC
        LIMIT 1
      `).get(leagueId);

      if (nextInLine) {
        db.prepare("UPDATE participants SET status = 'active', waitlist_order = 0 WHERE id = ?").run(nextInLine.id);
        promoted = nextInLine;

        // Re-order remaining waitlist
        const remainingWaitlist = db.prepare(`
          SELECT id FROM participants 
          WHERE league_id = ? AND status = 'waitlist'
          ORDER BY waitlist_order ASC
        `).all(leagueId);

        const updateOrder = db.prepare('UPDATE participants SET waitlist_order = ? WHERE id = ?');
        remainingWaitlist.forEach((w, idx) => {
          updateOrder.run(idx + 1, w.id);
        });

        // Notify promoted user via Telegram Bot
        sendTelegramNotification(
          nextInLine.telegram_id,
          `🎉 <b>Xushxabar!</b>\n\neFootball ligasida joy bo‘shadi va siz kutish ro‘yxatidan asosiy tarkibga qabul qilindingiz!\n` +
          `Jadvalda: <b>${nextInLine.player_name} — ${nextInLine.club_name}</b>`,
          { inline_keyboard: [[{ text: '🏆 Turnirni ochish', web_app: { url: config.miniAppUrl } }]] }
        );
      }
    }

    broadcast({ type: 'participants_updated', leagueId });

    res.json({
      success: true,
      message: 'Ishtirokchi chiqarildi.',
      promotedParticipant: promoted ? `${promoted.player_name} (${promoted.club_name})` : null
    });
  } catch (err) {
    console.error('Ishtirokchini chiqarishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
