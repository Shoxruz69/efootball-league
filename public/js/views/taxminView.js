/**
 * Predictions & Awards View (Taxminlar o‘yini, Mukofotlar & Haftaning o‘yini)
 */
const TaxminView = {
  currentTab: 'predict', // 'predict', 'leaderboard', 'awards', 'motw'

  async render(container) {
    container.innerHTML = `
      <div class="view-header">
        <h2 class="view-title">🎯 Taxminlar & Mukofotlar</h2>
        <p class="view-subtitle">Do‘stlar bilan hisobni oldindan toping va ochko yiging</p>
      </div>

      <!-- Sub Tabs -->
      <div class="taxmin-nav-tabs mb-3">
        <button class="taxmin-tab ${this.currentTab === 'predict' ? 'active' : ''}" onclick="TaxminView.switchTab('predict')">
          🎯 Taxmin qilish
        </button>
        <button class="taxmin-tab ${this.currentTab === 'leaderboard' ? 'active' : ''}" onclick="TaxminView.switchTab('leaderboard')">
          🏅 Reyting
        </button>
        <button class="taxmin-tab ${this.currentTab === 'awards' ? 'active' : ''}" onclick="TaxminView.switchTab('awards')">
          🏆 Mukofotlar
        </button>
        <button class="taxmin-tab ${this.currentTab === 'motw' ? 'active' : ''}" onclick="TaxminView.switchTab('motw')">
          ⭐ Haftaning o‘yini
        </button>
      </div>

      <div id="taxminTabContent">
        <div class="text-center py-4">
          <div class="spinner"></div>
          <div class="mt-2 text-muted">Yuklanmoqda...</div>
        </div>
      </div>
    `;

    await this.loadTabContent();
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.taxmin-tab').forEach(t => t.classList.remove('active'));
    event?.target?.classList.add('active');
    this.loadTabContent();
  },

  async loadTabContent() {
    const content = document.getElementById('taxminTabContent');
    if (!content) return;

    try {
      if (this.currentTab === 'predict') {
        await this.loadPredictMatches(content);
      } else if (this.currentTab === 'leaderboard') {
        await this.loadLeaderboard(content);
      } else if (this.currentTab === 'awards') {
        await this.loadAwards(content);
      } else if (this.currentTab === 'motw') {
        await this.loadMotw(content);
      }
    } catch (err) {
      console.error('Taxmin yuklash xatosi:', err);
      content.innerHTML = `
        <div class="error-state-box">
          <div class="error-state-icon">⚠️</div>
          <div class="error-state-title">Ma’lumotlarni yuklab bo‘lmadi</div>
          <div class="error-state-msg">${err.message || 'Serverga ulanishda xatolik yuz berdi'}</div>
          <button class="btn btn-sm btn-primary mt-2" onclick="TaxminView.loadTabContent()">
            🔄 Qayta urinish
          </button>
        </div>
      `;
    }
  },

  // 1. Prediction Inputs for upcoming matches
  async loadPredictMatches(content) {
    try {
      const res = await API.getPredictionMatches();
      const matches = res.matches || [];

      if (matches.length === 0) {
        content.innerHTML = `
          <div class="empty-state-box text-center py-4">
            <div class="empty-state-icon">🎯</div>
            <div class="font-bold mt-2">Hozirda kutilayotgan o‘yinlar yo‘q</div>
            <div class="text-muted text-sm mt-1">Yangi turlar boshlangach taxmin kiritishingiz mumkin.</div>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="taxmin-info-banner p-3 mb-3">
          <span class="text-xs">💡 <b>Ochko qoidasi:</b> Aniq hisobni topsangiz — <b>3 ochko</b>, g‘olibni yoki durangni to‘g‘ri topsangiz — <b>1 ochko</b> beriladi. Rasmiy liga jadvaliga ta’sir qilmaydi!</span>
        </div>

        <div class="predictions-list">
          ${matches.map(m => {
            const hasPredicted = m.predicted_home !== null && m.predicted_away !== null;
            return `
              <div class="prediction-card p-3 mb-3 border rounded">
                <div class="text-xs text-muted font-bold mb-2">${m.round}-TUR UCHRASHUVI</div>
                
                <div class="d-flex justify-content-between align-items-center">
                  <div class="text-center flex-1">
                    <div class="font-bold">${m.home_name}</div>
                    <div class="text-xs text-cyan">${m.home_club}</div>
                  </div>

                  <!-- Prediction Inputs -->
                  <div class="d-flex align-items-center gap-1 mx-2">
                    <input type="number" id="predH_${m.id}" class="form-control text-center w-50px font-bold" min="0" max="20" value="${m.predicted_home !== null ? m.predicted_home : ''}" placeholder="0" />
                    <span class="font-bold">:</span>
                    <input type="number" id="predA_${m.id}" class="form-control text-center w-50px font-bold" min="0" max="20" value="${m.predicted_away !== null ? m.predicted_away : ''}" placeholder="0" />
                  </div>

                  <div class="text-center flex-1">
                    <div class="font-bold">${m.away_name}</div>
                    <div class="text-xs text-red">${m.away_club}</div>
                  </div>
                </div>

                <div class="text-right mt-3">
                  <button class="btn btn-sm ${hasPredicted ? 'btn-outline-cyan' : 'btn-primary'}" onclick="TaxminView.submitPrediction(${m.id})">
                    ${hasPredicted ? '✏️ Taxminni yangilash' : '🎯 Taxminni saqlash'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  async submitPrediction(matchId) {
    const h = document.getElementById(`predH_${matchId}`).value;
    const a = document.getElementById(`predA_${matchId}`).value;

    if (h === '' || a === '') {
      alert("Iltimos, ikkala hisobni ham kiriting.");
      return;
    }

    try {
      const res = await API.submitPrediction({
        match_id: matchId,
        predicted_home: parseInt(h, 10),
        predicted_away: parseInt(a, 10)
      });
      window.TelegramService?.haptic('success');
      alert(res.message);
      this.loadTabContent();
    } catch (err) {
      alert(err.message || 'Xatolik yuz berdi');
    }
  },

  // 2. Leaderboard
  async loadLeaderboard(content) {
    try {
      const res = await API.getPredictorLeaderboard();
      const list = res.leaderboard || [];

      if (list.length === 0) {
        content.innerHTML = `<div class="text-muted text-center py-4">Hali hech kim taxmin kiritmagan.</div>`;
        return;
      }

      content.innerHTML = `
        <div class="table-responsive efootball-table-wrap">
          <table class="table efootball-table">
            <thead>
              <tr>
                <th class="th-rank">#</th>
                <th>Taxminchi</th>
                <th class="th-num">Aniq</th>
                <th class="th-num">Jami</th>
                <th class="th-pts">Ochko</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(row => `
                <tr>
                  <td><span class="rank-badge">${row.rank}</span></td>
                  <td class="font-bold">${row.predictor_name}</td>
                  <td class="text-center text-cyan font-bold">${row.exact_scores}</td>
                  <td class="text-center">${row.total_predictions}</td>
                  <td class="text-center font-extrabold text-cyan">${row.total_points}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  // 3. Season Awards
  async loadAwards(content) {
    try {
      const res = await API.getAwards();
      const awards = res.awards || {};

      content.innerHTML = `
        <div class="awards-grid">
          ${awards.topScorer ? `
            <div class="award-card mb-3 p-3 border rounded">
              <div class="award-title font-bold text-cyan">${awards.topScorer.title}</div>
              <div class="award-player font-extrabold text-lg mt-1">${awards.topScorer.player}</div>
              <div class="award-club text-sm text-muted">${awards.topScorer.club}</div>
              <div class="award-val text-green font-bold mt-1">${awards.topScorer.value}</div>
            </div>
          ` : ''}

          ${awards.bestDefense ? `
            <div class="award-card mb-3 p-3 border rounded">
              <div class="award-title font-bold text-cyan">${awards.bestDefense.title}</div>
              <div class="award-player font-extrabold text-lg mt-1">${awards.bestDefense.player}</div>
              <div class="award-club text-sm text-muted">${awards.bestDefense.club}</div>
              <div class="award-val text-green font-bold mt-1">${awards.bestDefense.value}</div>
            </div>
          ` : ''}

          ${awards.winStreak ? `
            <div class="award-card mb-3 p-3 border rounded">
              <div class="award-title font-bold text-cyan">${awards.winStreak.title}</div>
              <div class="award-player font-extrabold text-lg mt-1">${awards.winStreak.player}</div>
              <div class="award-club text-sm text-muted">${awards.winStreak.club}</div>
              <div class="award-val text-green font-bold mt-1">${awards.winStreak.value}</div>
            </div>
          ` : ''}

          ${awards.biggestWin ? `
            <div class="award-card mb-3 p-3 border rounded">
              <div class="award-title font-bold text-cyan">${awards.biggestWin.title}</div>
              <div class="award-player font-extrabold text-lg mt-1">${awards.biggestWin.player}</div>
              <div class="award-val text-cyan font-bold mt-1">${awards.biggestWin.value}</div>
            </div>
          ` : ''}
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  // 4. Match of the week
  async loadMotw(content) {
    try {
      const res = await API.getMotw();
      const matches = res.matches || [];
      const userVote = res.userVotedMatchId;

      content.innerHTML = `
        <div class="motw-banner p-3 mb-3">
          <span class="text-xs">⭐ <b>Haftaning eng qiziqarli o‘yiniga ovoz bering!</b> Eng ko‘p ovoz to‘plagan uchrashuv markaziy o‘yin deb e’lon qilinadi.</span>
        </div>

        <div class="motw-list">
          ${matches.map(m => `
            <div class="motw-item p-3 mb-2 border rounded d-flex justify-content-between align-items-center">
              <div>
                <span class="font-bold">${m.home_name} (${m.home_club}) vs ${m.away_name} (${m.away_club})</span>
                <div class="text-xs text-cyan mt-1">🗳️ ${m.vote_count} ta ovoz</div>
              </div>
              <button class="btn btn-sm ${userVote === m.id ? 'btn-success' : 'btn-outline-cyan'}" onclick="TaxminView.voteMotw(${m.id})">
                ${userVote === m.id ? '✅ Ovozingiz' : 'Ovoz berish'}
              </button>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      console.error(err);
    }
  },

  async voteMotw(matchId) {
    try {
      const res = await API.voteMotw(matchId);
      window.TelegramService?.haptic('success');
      this.loadTabContent();
    } catch (err) {
      alert(err.message || 'Xatolik yuz berdi');
    }
  }
};

window.TaxminView = TaxminView;
