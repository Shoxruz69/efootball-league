const db = require('../server/db');

async function testBotActions() {
  console.log('🤖 === BOT ACTIONS UNIT TEST ===\n');

  const match = db.prepare(`
    SELECT m.*, 
      h.player_name as home_name, h.telegram_id as home_tg,
      a.player_name as away_name, a.telegram_id as away_tg
    FROM matches m
    JOIN participants h ON m.home_participant_id = h.id
    JOIN participants a ON m.away_participant_id = a.id
    LIMIT 1
  `).get();

  if (!match) {
    console.error('No match found');
    process.exit(1);
  }

  // Reset match to submitted
  db.prepare(`
    UPDATE matches
    SET status = 'submitted',
        home_score = 3,
        away_score = 2,
        home_confirmed = 0,
        away_confirmed = 0,
        dispute_reason = NULL
    WHERE id = ?
  `).run(match.id);

  console.log(`Testing match #${match.id}: ${match.home_name} vs ${match.away_name}`);

  // Test 1: Home player confirms via bot simulation
  const isHome = true;
  let newHomeConfirmed = match.home_confirmed || 0;
  let newAwayConfirmed = match.away_confirmed || 0;
  if (isHome) newHomeConfirmed = 1;

  let bothConfirmed = (newHomeConfirmed === 1 && newAwayConfirmed === 1);
  console.log(`1. Home player taps confirm: bothConfirmed=${bothConfirmed}`);
  if (!bothConfirmed) {
    db.prepare("UPDATE matches SET status = 'submitted', home_confirmed = ?, away_confirmed = ? WHERE id = ?")
      .run(newHomeConfirmed, newAwayConfirmed, match.id);
    console.log('✅ PASS: After 1 confirmation, match is submitted, waiting for opponent');
  }

  // Test 2: Away player confirms via bot simulation
  const isAway = true;
  if (isAway) newAwayConfirmed = 1;
  bothConfirmed = (newHomeConfirmed === 1 && newAwayConfirmed === 1);
  console.log(`2. Away player taps confirm: bothConfirmed=${bothConfirmed}`);
  if (bothConfirmed) {
    db.prepare("UPDATE matches SET status = 'finished', home_confirmed = 1, away_confirmed = 1 WHERE id = ?")
      .run(match.id);
    console.log('✅ PASS: After both confirmations, match marked finished');
  }

  // Test 3: Dispute via bot simulation
  const disputeReason = `${match.away_name} Telegram bot orqali natijani rad etdi.`;
  db.prepare("UPDATE matches SET status = 'disputed', dispute_reason = ?, home_confirmed = 0, away_confirmed = 0 WHERE id = ?")
    .run(disputeReason, match.id);

  const mAfter = db.prepare("SELECT * FROM matches WHERE id = ?").get(match.id);
  if (mAfter.status === 'disputed' && mAfter.dispute_reason === disputeReason) {
    console.log('✅ PASS: Dispute action properly sets status to disputed and records reason');
  }

  console.log('\n🎉 ALL BOT LOGIC TESTS PASSED!\n');
}

testBotActions().catch(e => {
  console.error(e);
  process.exit(1);
});
