const db = require('../db');
const { broadcast } = require('./websocket');

/**
 * Checks if a match belongs to a future round that is currently locked.
 * A future round (round > current_round) is strictly locked until ALL matches
 * in the current round are completed (status === 'finished').
 *
 * @param {number} leagueId 
 * @param {number} matchRound 
 * @returns {{ locked: boolean, currentRound?: number, pendingMatches?: Array }}
 */
function checkRoundLocked(leagueId, matchRound) {
  const league = db.prepare("SELECT * FROM leagues WHERE id = ?").get(leagueId);
  if (!league) return { locked: false };

  if (matchRound > league.current_round) {
    const pending = db.prepare(`
      SELECT 
        m.id, 
        m.round, 
        h.player_name as home_name, 
        a.player_name as away_name, 
        m.status
      FROM matches m
      LEFT JOIN participants h ON m.home_participant_id = h.id
      LEFT JOIN participants a ON m.away_participant_id = a.id
      WHERE m.league_id = ? AND m.round = ? AND m.status != 'finished'
      ORDER BY m.id ASC
    `).all(league.id, league.current_round);

    if (pending.length > 0) {
      return {
        locked: true,
        currentRound: league.current_round,
        matchRound,
        pendingMatches: pending.map(p => ({
          id: p.id,
          title: `${p.home_name || 'Mezbon'} vs ${p.away_name || 'Mehmon'}`,
          status: p.status === 'submitted' ? 'tasdiqlash kutilmoqda' : 'kutilmoqda'
        }))
      };
    }
  }

  return { locked: false };
}

/**
 * Verifies if all matches in the current round of an active league are finished.
 * If all are finished, automatically advances the league to the next round,
 * updates the standings, and broadcasts WebSocket events to all connected clients.
 *
 * @param {number} leagueId 
 * @returns {{ advanced: boolean, newRound?: number, allRoundsCompleted?: boolean, currentRound?: number }}
 */
function checkAndAdvanceRound(leagueId) {
  const league = db.prepare("SELECT * FROM leagues WHERE id = ?").get(leagueId);
  if (!league || league.status === 'completed') {
    return { advanced: false };
  }

  const unfinishedCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM matches 
    WHERE league_id = ? AND round = ? AND status != 'finished'
  `).get(league.id, league.current_round).count;

  if (unfinishedCount === 0) {
    // All matches in current_round are confirmed & finished
    if (league.current_round < league.total_rounds) {
      const nextRound = league.current_round + 1;
      db.prepare(`
        UPDATE leagues 
        SET current_round = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(nextRound, league.id);

      console.log(`⚡ [AUTO ROUND ADVANCE] Liga #${league.id}: ${league.current_round}-tur to‘liq yakunlandi. ${nextRound}-tur avtomatik ochildi!`);

      broadcast({
        type: 'round_advanced',
        leagueId: league.id,
        previousRound: league.current_round,
        newRound: nextRound,
        message: `${league.current_round}-turning barcha uchrashuvlari yakunlandi! ${nextRound}-tur rasman boshlandi.`
      });
      broadcast({ type: 'standings_updated', leagueId: league.id });

      return { advanced: true, newRound: nextRound };
    } else {
      console.log(`🏆 [LEAGUE STAGE] Liga #${league.id}: Barcha ${league.total_rounds} ta turning o‘yinlari to‘liq yakunlandi.`);
      broadcast({ type: 'standings_updated', leagueId: league.id });
      return { advanced: false, allRoundsCompleted: true, currentRound: league.current_round };
    }
  }

  return { advanced: false, currentRound: league.current_round };
}

module.exports = {
  checkRoundLocked,
  checkAndAdvanceRound
};
