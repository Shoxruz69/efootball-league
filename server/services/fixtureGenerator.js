/**
 * Fixture Generator for Round-Robin League (Berger Tables / Circle Method)
 */

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generates single round-robin fixtures for a list of participants.
 * Each participant plays every other participant once.
 * @param {Array<{id: number, player_name: string, club_name: string}>} participants
 * @returns {Array<{round: number, homeId: number, awayId: number}>}
 */
function generateRoundRobinFixtures(participants) {
  if (!participants || participants.length < 2) {
    return [];
  }

  // Shuffle participant order for randomized fair draw
  let list = shuffleArray(participants.map(p => p.id));

  // If odd number of participants, add a dummy/bye (-1)
  const isOdd = list.length % 2 !== 0;
  if (isOdd) {
    list.push(null);
  }

  const numTeams = list.length;
  const numRounds = numTeams - 1;
  const half = numTeams / 2;

  const fixtures = [];

  for (let round = 1; round <= numRounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = list[i];
      const away = list[numTeams - 1 - i];

      // Skip bye matches
      if (home !== null && away !== null) {
        // Alternate home/away to ensure balance
        if (round % 2 === 1) {
          fixtures.push({ round, homeId: home, awayId: away });
        } else {
          fixtures.push({ round, homeId: away, awayId: home });
        }
      }
    }

    // Rotate list keeping the first element fixed
    const fixed = list[0];
    const rest = list.slice(1);
    const last = rest.pop();
    rest.unshift(last);
    list = [fixed, ...rest];
  }

  return fixtures;
}

/**
 * Calculate Standings Table from participants and completed matches
 * Follows tie-breakers:
 * 1. Points (Win = 3, Draw = 1, Loss = 0)
 * 2. Goal Difference (TF)
 * 3. Goals Scored (UG)
 * 4. Head-to-Head (O'zaro o'yin)
 */
function calculateStandings(participants, matches) {
  const stats = {};

  participants.forEach(p => {
    stats[p.id] = {
      participant_id: p.id,
      player_name: p.player_name,
      club_name: p.club_name,
      club_badge_color: p.club_badge_color,
      avatar_url: p.avatar_url,
      telegram_id: p.telegram_id,
      username: p.username,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goals_for: 0,
      goals_against: 0,
      goal_diff: 0,
      points: 0,
      form: [] // last 5 results: ['W', 'D', 'L']
    };
  });

  const completedMatches = matches.filter(m => m.status === 'finished' && m.home_score !== null && m.away_score !== null);

  completedMatches.forEach(m => {
    const home = stats[m.home_participant_id];
    const away = stats[m.away_participant_id];

    if (!home || !away) return;

    home.played += 1;
    away.played += 1;

    home.goals_for += m.home_score;
    home.goals_against += m.away_score;
    away.goals_for += m.away_score;
    away.goals_against += m.home_score;

    if (m.home_score > m.away_score) {
      home.won += 1;
      home.points += 3;
      home.form.push('W');

      away.lost += 1;
      away.form.push('L');
    } else if (m.home_score < m.away_score) {
      away.won += 1;
      away.points += 3;
      away.form.push('W');

      home.lost += 1;
      home.form.push('L');
    } else {
      home.drawn += 1;
      home.points += 1;
      home.form.push('D');

      away.drawn += 1;
      away.points += 1;
      away.form.push('D');
    }
  });

  // Calculate goal diff and keep only last 5 form matches
  Object.values(stats).forEach(s => {
    s.goal_diff = s.goals_for - s.goals_against;
    s.form = s.form.slice(-5);
  });

  // Sort by Points -> Goal Diff -> Goals Scored -> Head to Head
  const sorted = Object.values(stats).sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;

    // 2. Goal Difference
    if (b.goal_diff !== a.goal_diff) return b.goal_diff - a.goal_diff;

    // 3. Goals For (Goals Scored)
    if (b.goals_for !== a.goals_for) return b.goals_for - a.goals_for;

    // 4. Head-to-Head
    const h2h = completedMatches.find(
      m => (m.home_participant_id === a.participant_id && m.away_participant_id === b.participant_id) ||
           (m.home_participant_id === b.participant_id && m.away_participant_id === a.participant_id)
    );

    if (h2h) {
      const aIsHome = h2h.home_participant_id === a.participant_id;
      const aScore = aIsHome ? h2h.home_score : h2h.away_score;
      const bScore = aIsHome ? h2h.away_score : h2h.home_score;
      if (aScore !== bScore) return bScore - aScore;
    }

    return a.player_name.localeCompare(b.player_name);
  });

  // Add ranking positions (1, 2, 3...)
  return sorted.map((item, index) => ({
    rank: index + 1,
    ...item
  }));
}

module.exports = {
  generateRoundRobinFixtures,
  calculateStandings
};
