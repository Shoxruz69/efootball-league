/**
 * Live Match Interactive Scoreboard & Goal Logger
 */
const LiveMatch = {
  currentMatchId: null,
  liveData: null,
  pollTimer: null,

  async openModal(matchId) {
    this.currentMatchId = matchId;

    try {
      // Start live mode on server
      const res = await API.startLive(matchId);
      this.liveData = res.liveState;
    } catch (e) {
      console.warn('Live start error:', e);
    }

    await this.renderModal();
    this.startPolling();
  },

  async renderModal() {
    let match = null;
    try {
      const res = await API.getMatch(this.currentMatchId);
      match = res.match;
    } catch (e) {
      alert("Uchrashuv yuklanmadi");
      return;
    }

    const myTgId = String(window.TelegramService?.getUser()?.id || '');
    const isHome = String(match.home_telegram_id) === myTgId;
    const isAway = String(match.away_telegram_id) === myTgId;
    const isParticipant = isHome || isAway;

    const liveState = match.live_state || { homeScore: match.home_score || 0, awayScore: match.away_score || 0, events: [] };
    const events = liveState.events || [];

    // Check for any pending goal confirmation waiting for current user
    const pendingGoal = events.find(e => e.status === 'pending_confirmation');
    const isMyTurnToConfirm = pendingGoal && ((pendingGoal.proposedBy === 'home' && isAway) || (pendingGoal.proposedBy === 'away' && isHome));

    const modalHtml = `
      <div class="modal-overlay" id="liveMatchModal">
        <div class="modal-dialog live-match-dialog">
          <div class="modal-header">
            <div class="d-flex align-items-center gap-2">
              <span class="live-dot-pulse"></span>
              <h3>🔴 Jonli Hisob (Live Match)</h3>
            </div>
            <button class="close-btn" onclick="LiveMatch.close()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Scoreboard Box -->
            <div class="live-scoreboard-box mb-3">
              <div class="live-teams-row">
                <!-- Home -->
                <div class="live-team-side text-center">
                  <div class="mb-1 d-flex justify-content-center">
                    ${renderClubBadgeHtml(match.home_club_name, 48, match.home_badge_color)}
                  </div>
                  <div class="live-player-name font-bold">${this.escape(match.home_player_name)}</div>
                  <div class="live-club-name text-xs text-cyan">${this.escape(match.home_club_name)}</div>
                </div>

                <!-- Digits -->
                <div class="live-digits-wrap">
                  <span class="live-digit">${liveState.homeScore}</span>
                  <span class="live-sep">:</span>
                  <span class="live-digit">${liveState.awayScore}</span>
                </div>

                <!-- Away -->
                <div class="live-team-side text-center">
                  <div class="mb-1 d-flex justify-content-center">
                    ${renderClubBadgeHtml(match.away_club_name, 48, match.away_badge_color)}
                  </div>
                  <div class="live-player-name font-bold">${this.escape(match.away_player_name)}</div>
                  <div class="live-club-name text-xs text-red">${this.escape(match.away_club_name)}</div>
                </div>
              </div>
            </div>

            <!-- Opponent Goal Confirmation Prompt -->
            ${isMyTurnToConfirm ? `
              <div class="live-confirm-alert p-3 mb-3">
                <div class="font-bold text-cyan">⚽ Gol kiritildi!</div>
                <div class="text-sm mt-1">
                  Raqibingiz <b>${pendingGoal.minute ? pendingGoal.minute + '-daqiqada' : ''} ${pendingGoal.scorer}</b> urgan golni tasdiqlashingizni kutmoqda.
                </div>
                <div class="d-flex gap-2 mt-2">
                  <button class="btn btn-sm btn-success flex-1" onclick="LiveMatch.confirmGoal(${pendingGoal.id}, true)">
                    ✅ Ha, gol bo‘ldi (+1)
                  </button>
                  <button class="btn btn-sm btn-danger flex-1" onclick="LiveMatch.confirmGoal(${pendingGoal.id}, false)">
                    ❌ Bekor qilish
                  </button>
                </div>
              </div>
            ` : ''}

            <!-- Waiting for opponent prompt -->
            ${pendingGoal && !isMyTurnToConfirm ? `
              <div class="alert-info p-2 mb-3 text-center text-sm">
                ⏳ Gol kiritildi (${pendingGoal.scorer}). Raqib tasdiqlashi kutilmoqda...
              </div>
            ` : ''}

            <!-- Action buttons for participants -->
            ${isParticipant ? `
              <div class="live-actions-bar mb-3">
                <button class="btn btn-primary w-100 py-2 font-bold" onclick="LiveMatch.showGoalInputModal('${isHome ? 'home' : 'away'}')">
                  ⚽ Gol kiritish
                </button>
              </div>
            ` : `
              <div class="text-center text-muted text-xs mb-3">
                👀 Siz kuzatuvchisiz. Hisob ikkala o‘yinchi tomonidan jonli yangilanmoqda.
              </div>
            `}

            <!-- Goal Timeline / Match Events -->
            <div class="match-events-timeline">
              <div class="events-header text-xs text-muted font-bold mb-2">⏱️ O‘YIN HODISALARI:</div>
              ${events.length === 0 ? `
                <div class="text-center text-muted text-xs py-3">Hozircha gollar yo‘q</div>
              ` : `
                <div class="events-list">
                  ${events.map(e => `
                    <div class="timeline-event-item ${e.status === 'confirmed' ? 'confirmed' : 'pending'}">
                      <span class="event-icon">${e.status === 'confirmed' ? '⚽' : '⏳'}</span>
                      <span class="event-min">${e.minute ? e.minute + "'" : '•'}</span>
                      <span class="event-scorer font-bold">${e.scorer}</span>
                      <span class="event-team text-xs text-muted">(${e.team === 'home' ? match.home_club_name : match.away_club_name})</span>
                      ${e.status === 'confirmed' ? '<span class="badge-confirmed">Tasdiqlangan</span>' : '<span class="badge-pending">Kutilmoqda</span>'}
                    </div>
                  `).join('')}
                </div>
              `}
            </div>

            <!-- Finish Match Button -->
            <div class="live-finish-box mt-3 pt-3 border-top">
              <button class="btn btn-outline-cyan w-100" onclick="LiveMatch.proceedToUpload()">
                🏁 O‘yin tugadi ➔ Skrinshot yuklash
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('liveMatchModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  showGoalInputModal(defaultTeam) {
    const minute = prompt("Gol qaysi daqiqada urildi? (masalan: 34):", "35");
    if (minute === null) return;

    const scorer = prompt("Gol muallifi (o‘yinchi ismi):", "");
    if (!scorer || !scorer.trim()) {
      alert("Iltimos, gol muallifini kiriting.");
      return;
    }

    this.submitGoal(defaultTeam, parseInt(minute, 10) || null, scorer.trim());
  },

  async submitGoal(team, minute, scorer) {
    try {
      await API.proposeGoal(this.currentMatchId, { team, minute, scorer });
      window.TelegramService?.haptic('success');
      await this.renderModal();
    } catch (err) {
      alert(err.message || 'Xatolik yuz berdi');
    }
  },

  async confirmGoal(eventId, approved) {
    try {
      await API.confirmGoal(this.currentMatchId, eventId, approved);
      window.TelegramService?.haptic(approved ? 'success' : 'warning');
      await this.renderModal();
    } catch (err) {
      alert(err.message || 'Xatolik yuz berdi');
    }
  },

  proceedToUpload() {
    const matchId = this.currentMatchId;
    this.close();
    UploadModal.openModal(matchId);
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      const modal = document.getElementById('liveMatchModal');
      if (!modal) {
        this.stopPolling();
        return;
      }
      await this.renderModal();
    }, 4000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  close() {
    this.stopPolling();
    const modal = document.getElementById('liveMatchModal');
    if (modal) modal.remove();
  },

  escape(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.LiveMatch = LiveMatch;
