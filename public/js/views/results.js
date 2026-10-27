/**
 * Results View (Natijalar va AI statistika)
 * Designed for eFootball 2026 Mobile Experience
 */
const ResultsView = {
  async render(container) {
    container.innerHTML = `
      <div class="view-header">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h2 class="view-title">📋 Yakunlangan Natijalar</h2>
            <p class="view-subtitle" id="resultsSubtitle">Yuklanmoqda...</p>
          </div>
          <button class="btn btn-sm btn-outline-cyan" onclick="App.refreshResults()">
            🔄 Yangilash
          </button>
        </div>
      </div>

      <!-- Results List Container -->
      <div class="results-feed" id="resultsFeed">
        <div class="text-center py-4">
          <div class="spinner"></div>
          <div class="mt-2 text-muted">Natijalar yuklanmoqda...</div>
        </div>
      </div>
    `;

    await this.loadResults();
  },

  async loadResults() {
    const feed = document.getElementById('resultsFeed');
    if (feed && !feed.querySelector('.result-card')) {
      feed.innerHTML = `
        <div class="text-center py-4">
          <div class="spinner"></div>
          <div class="mt-2 text-muted">Natijalar yuklanmoqda...</div>
        </div>
      `;
    }

    try {
      const data = await API.getMatches({ status: 'finished' });
      const matches = (data.matches || []).sort((a, b) => b.id - a.id);

      const sub = document.getElementById('resultsSubtitle');
      if (sub) {
        sub.textContent = `${matches.length} ta tasdiqlangan natija`;
      }

      if (!feed) return;

      if (matches.length === 0) {
        feed.innerHTML = `
          <div class="empty-state-box text-center py-5">
            <div class="empty-state-icon">🏆</div>
            <div class="font-bold mt-2">Hali yakunlangan o‘yinlar yo‘q</div>
            <div class="text-muted text-sm mt-1">Uchrashuvlar o‘ynalib, skrinshotlar tasdiqlangach bu yerda ko‘rinadi.</div>
          </div>
        `;
        return;
      }

      feed.innerHTML = matches.map(m => {
        const stats = m.stats || {};
        const hasStats = Boolean(stats.possession || stats.shots || stats.corners);
        const homeBadgeHtml = renderClubBadgeHtml(m.home_club_name, 28, m.home_badge_color);
        const awayBadgeHtml = renderClubBadgeHtml(m.away_club_name, 28, m.away_badge_color);

        return `
          <div class="result-card">
            <div class="result-card-top">
              <span class="result-round">${m.round}-Tur</span>
              <span class="result-verified-badge">✅ Tasdiqlangan</span>
            </div>

            <div class="result-match-row">
              <!-- Home -->
              <div class="result-team home">
                <div class="d-flex align-items-center gap-2">
                  ${homeBadgeHtml}
                  <div>
                    <span class="result-player">${this.escape(m.home_player_name)}</span>
                    <span class="result-club text-cyan d-block">${this.escape(m.home_club_name)}</span>
                  </div>
                </div>
              </div>

              <!-- Score -->
              <div class="result-score-box">
                <span class="score-num ${m.home_score > m.away_score ? 'winner' : ''}">${m.home_score}</span>
                <span class="score-divider">:</span>
                <span class="score-num ${m.away_score > m.home_score ? 'winner' : ''}">${m.away_score}</span>
              </div>

              <!-- Away -->
              <div class="result-team away">
                <div class="d-flex align-items-center gap-2 justify-content-end">
                  <div class="text-right">
                    <span class="result-player">${this.escape(m.away_player_name)}</span>
                    <span class="result-club text-cyan d-block">${this.escape(m.away_club_name)}</span>
                  </div>
                  ${awayBadgeHtml}
                </div>
              </div>
            </div>

            <!-- AI / Stats Insight Pill -->
            ${m.ai_summary ? `
              <div class="ai-summary-pill mt-2">
                <span class="ai-spark-icon">✨ AI:</span>
                <span class="ai-text">${this.escape(m.ai_summary)}</span>
              </div>
            ` : ''}

            <!-- Quick Stats Bar if available -->
            ${hasStats ? `
              <div class="mini-stats-grid mt-2">
                ${stats.possession ? `
                  <div class="mini-stat-col">
                    <span class="stat-h-val">${stats.possession[0]}%</span>
                    <span class="stat-name">To‘p nazorati</span>
                    <span class="stat-a-val">${stats.possession[1]}%</span>
                  </div>
                ` : ''}
                ${stats.shots ? `
                  <div class="mini-stat-col">
                    <span class="stat-h-val">${stats.shots[0]}</span>
                    <span class="stat-name">Zarbalar</span>
                    <span class="stat-a-val">${stats.shots[1]}</span>
                  </div>
                ` : ''}
                ${stats.corners ? `
                  <div class="mini-stat-col">
                    <span class="stat-h-val">${stats.corners[0]}</span>
                    <span class="stat-name">Burchak</span>
                    <span class="stat-a-val">${stats.corners[1]}</span>
                  </div>
                ` : ''}
              </div>
            ` : ''}

            <!-- Action footer -->
            <div class="result-footer mt-2 d-flex justify-content-between align-items-center">
              ${m.screenshot_url ? `
                <button class="btn btn-xs btn-outline-secondary" onclick="App.viewScreenshot('${m.screenshot_url}')">
                  🔍 Skrinshotni ko‘rish
                </button>
              ` : '<span></span>'}

              <button class="btn btn-xs btn-outline-cyan" onclick="App.generateCard(${m.id})">
                🎨 Natija kartasini yaratish
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Natijalarni yuklashda xatolik:', err);
      if (feed) {
        feed.innerHTML = `
          <div class="error-state-box">
            <div class="error-state-icon">⚠️</div>
            <div class="error-state-title">Natijalarni yuklab bo‘lmadi</div>
            <div class="error-state-msg">${this.escape(err.message || 'Serverga ulanishda xatolik yuz berdi')}</div>
            <button class="btn btn-sm btn-primary" onclick="ResultsView.loadResults()">
              🔄 Qayta urinish
            </button>
          </div>
        `;
      }
    }
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.ResultsView = ResultsView;
