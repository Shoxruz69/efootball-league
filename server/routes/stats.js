const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateStandings } = require('../services/fixtureGenerator');

// Season Awards (Mavsum mukofotlari)
router.get('/awards', (req, res) => {
  try {
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, awards: null });
    }

    const participants = db.prepare("SELECT * FROM participants WHERE league_id = ? AND status = 'active'").all(league.id);
    const matches = db.prepare("SELECT * FROM matches WHERE league_id = ? AND status = 'finished'").all(league.id);

    const standings = calculateStandings(participants, matches);

    // 1. Best Attack (Eng ko'p gol urgan)
    const topScorer = [...standings].sort((a, b) => b.goals_for - a.goals_for)[0] || null;

    // 2. Best Defense (Eng kam gol o'tkazgan - kamida 1 o'yin o'ynaganlar)
    const playedParticipants = standings.filter(s => s.played > 0);
    const bestDefense = [...playedParticipants].sort((a, b) => a.goals_against - b.goals_against)[0] || null;

    // 3. Longest Win Streak
    let maxStreak = 0;
    let streakLeader = null;
    standings.forEach(s => {
      let currentStreak = 0;
      for (const res of s.form) {
        if (res === 'W') currentStreak++;
        else currentStreak = 0;
      }
      if (currentStreak > maxStreak) {
        maxStreak = currentStreak;
        streakLeader = s;
      }
    });

    // 4. Biggest Win / Comeback
    let biggestWin = null;
    let maxDiff = 0;
    matches.forEach(m => {
      const diff = Math.abs((m.home_score || 0) - (m.away_score || 0));
      if (diff > maxDiff) {
        maxDiff = diff;
        const winnerId = m.home_score > m.away_score ? m.home_participant_id : m.away_participant_id;
        const winner = participants.find(p => p.id === winnerId);
        biggestWin = {
          matchId: m.id,
          winner: winner ? `${winner.player_name} (${winner.club_name})` : 'G\'olib',
          score: `${m.home_score} - ${m.away_score}`
        };
      }
    });

    res.json({
      success: true,
      awards: {
        topScorer: topScorer ? {
          title: '🔥 Eng sermahsul hujum (Oltin butsa)',
          player: topScorer.player_name,
          club: topScorer.club_name,
          badgeColor: topScorer.club_badge_color,
          value: `${topScorer.goals_for} ta gol`
        } : null,
        bestDefense: bestDefense ? {
          title: '🛡️ Temir himoya (Eng kam gol o\'tkazgan)',
          player: bestDefense.player_name,
          club: bestDefense.club_name,
          badgeColor: bestDefense.club_badge_color,
          value: `${bestDefense.goals_against} ta gol o'tkazgan`
        } : null,
        winStreak: streakLeader && maxStreak > 1 ? {
          title: '⚡ G\'alabalar seriyasi',
          player: streakLeader.player_name,
          club: streakLeader.club_name,
          badgeColor: streakLeader.club_badge_color,
          value: `${maxStreak} ta ketma-ket g'alaba`
        } : null,
        biggestWin: biggestWin ? {
          title: '💥 Eng yirik g\'alaba',
          player: biggestWin.winner,
          value: biggestWin.score
        } : null
      }
    });
  } catch (err) {
    console.error('Mukofotlarni hisoblashda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Head-to-Head History (O'zaro tarix)
router.get('/h2h', (req, res) => {
  try {
    const { p1, p2 } = req.query;
    if (!p1 || !p2) {
      return res.status(400).json({ success: false, message: 'Ikkala ishtirokchi ID si kiritilishi shart.' });
    }

    const id1 = parseInt(p1, 10);
    const id2 = parseInt(p2, 10);

    const part1 = db.prepare('SELECT * FROM participants WHERE id = ?').get(id1);
    const part2 = db.prepare('SELECT * FROM participants WHERE id = ?').get(id2);

    if (!part1 || !part2) {
      return res.status(404).json({ success: false, message: 'Ishtirokchilar topilmadi.' });
    }

    const pastMatches = db.prepare(`
      SELECT m.*,
        h.player_name as home_name, h.club_name as home_club,
        a.player_name as away_name, a.club_name as away_club
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      WHERE ((m.home_participant_id = ? AND m.away_participant_id = ?)
         OR (m.home_participant_id = ? AND m.away_participant_id = ?))
        AND m.status = 'finished'
      ORDER BY m.id DESC
    `).all(id1, id2, id2, id1);

    let p1Wins = 0;
    let p2Wins = 0;
    let draws = 0;
    let p1Goals = 0;
    let p2Goals = 0;

    pastMatches.forEach(m => {
      const isP1Home = m.home_participant_id === id1;
      const mP1Goals = isP1Home ? m.home_score : m.away_score;
      const mP2Goals = isP1Home ? m.away_score : m.home_score;

      p1Goals += mP1Goals;
      p2Goals += mP2Goals;

      if (mP1Goals > mP2Goals) p1Wins++;
      else if (mP2Goals > mP1Goals) p2Wins++;
      else draws++;
    });

    res.json({
      success: true,
      participant1: { id: part1.id, name: part1.player_name, club: part1.club_name, color: part1.club_badge_color },
      participant2: { id: part2.id, name: part2.player_name, club: part2.club_name, color: part2.club_badge_color },
      stats: {
        totalMatches: pastMatches.length,
        p1Wins,
        p2Wins,
        draws,
        p1Goals,
        p2Goals
      },
      matches: pastMatches
    });
  } catch (err) {
    console.error('O\'zaro tarixni olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Match of the Week (Haftaning o'yini)
router.get('/motw', (req, res) => {
  try {
    const telegramId = String(req.telegramUser?.id || '');
    const league = db.prepare("SELECT * FROM leagues WHERE status != 'completed' ORDER BY id DESC LIMIT 1").get();
    if (!league) {
      return res.json({ success: true, motw: null });
    }

    // Get current round matches
    const roundMatches = db.prepare(`
      SELECT 
        m.id, m.round,
        h.player_name as home_name, h.club_name as home_club, h.club_badge_color as home_color,
        a.player_name as away_name, a.club_name as away_club, a.club_badge_color as away_color,
        COUNT(v.id) as vote_count
      FROM matches m
      JOIN participants h ON m.home_participant_id = h.id
      JOIN participants a ON m.away_participant_id = a.id
      LEFT JOIN motw_votes v ON v.match_id = m.id
      WHERE m.league_id = ? AND m.round = ?
      GROUP BY m.id
      ORDER BY vote_count DESC
    `).all(league.id, league.current_round);

    // Check if user voted in this round
    const userVote = db.prepare(`
      SELECT match_id FROM motw_votes 
      WHERE league_id = ? AND round = ? AND telegram_id = ?
    `).get(league.id, league.current_round, telegramId);

    res.json({
      success: true,
      currentRound: league.current_round,
      userVotedMatchId: userVote?.match_id || null,
      matches: roundMatches
    });
  } catch (err) {
    console.error('Haftaning o\'yinini olishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vote for Match of the Week
router.post('/motw/vote', (req, res) => {
  try {
    const { match_id } = req.body;
    const telegramId = String(req.telegramUser?.id || '');

    if (!telegramId) {
      return res.status(400).json({ success: false, message: 'Foydalanuvchi aniqlanmadi.' });
    }

    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);
    if (!match) {
      return res.status(404).json({ success: false, message: 'Uchrashuv topilmadi.' });
    }

    // Upsert vote for this user and round
    db.prepare(`
      INSERT INTO motw_votes (league_id, round, match_id, telegram_id)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(league_id, round, telegram_id) DO UPDATE SET
        match_id = excluded.match_id
    `).run(match.league_id, match.round, match_id, telegramId);

    res.json({ success: true, message: 'Ovozingiz qabul qilindi!' });
  } catch (err) {
    console.error('Ovoz berishda xatolik:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
