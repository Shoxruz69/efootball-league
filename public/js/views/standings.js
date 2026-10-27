/**
 * Turnir Jadvali (League Table View)
 * eFootball 2026 Mobile UI
 * Features:
 * - 58px high dark rows (#1c1c22, alternating #222229, 1st place #4a4a54)
 * - Set A: Rank, Nickname, MP, W, D, L, Pts
 * - Set B: Rank, Nickname, MP, F, A, GD, Pts
 * - "Switch Info" black pill button with cyan text
 * - Color rules: W is GREEN (#2de08a), L is RED (#ff4d6d), D is gray (#8b8b96)
 * - In case of 0 values, dimmer version (opacity .45)
 * - SIZ tag with cyan left border for current user
 * - Sorting: Pts desc, then GD desc, then F desc, then name
 * - FLIP row animation on updates
 */
const StandingsView = {
  showSetB: false,
  previousPositions: new Map(),
  previousScores: new Map(),
  currentStandings: [],

  async render(container) {
    const appEl = document.getElementById('appContainer') || document.querySelector('.app-container');
    if (appEl) appEl.classList.add('view-standings-active');
    document.body.classList.add('view-standings-active');

    container.innerHTML = `
      <section class="view-section">
        <div class="view-header">
          <div class="view-title-row">
            <svg class="i" viewBox="0 0 24 24">
              <path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v4M8 20h8"/>
            </svg>
            <h1>League Table</h1>
          </div>
          <p class="view-subtitle" id="leagueSubtitle">Ochko: g'alaba 3 • durang 1</p>
        </div>

        <!-- Table Box Container -->
        <div class="table-box" id="tableBoxContainer">
          <div class="table-header-row ${this.showSetB ? 'cols-b' : 'cols-a'}" id="tableHeaderRow">
            ${this.renderHeaderHtml()}
          </div>
          <div id="tableBodyRows">
            <div style="padding: 32px 16px; text-align: center;">
              <div class="spinner"></div>
              <div style="color: var(--muted); font-size: 13px; font-weight: 500; margin-top: 8px;">
                Jadval yuklanmoqda...
              </div>
            </div>
          </div>
        </div>

        <!-- Switch Info Button -->
        <div class="center-btn-row">
          <button class="pill" id="switchInfoBtn" onclick="StandingsView.toggleInfo()" type="button">
            Switch Info
          </button>
        </div>
      </section>
    `;

    await this.loadData();
  },

  renderHeaderHtml() {
    if (this.showSetB) {
      return `
        <span>Rank</span>
        <span></span>
        <span>MP</span>
        <span>F</span>
        <span>A</span>
        <span>GD</span>
        <span>Pts</span>
      `;
    } else {
      return `
        <span>Rank</span>
        <span></span>
        <span>MP</span>
        <span>W</span>
        <span>D</span>
        <span>L</span>
        <span>Pts</span>
      `;
    }
  },

  toggleInfo() {
    this.showSetB = !this.showSetB;
    try { window.TelegramService?.haptic('selection'); } catch (e) {}

    const header = document.getElementById('tableHeaderRow');
    if (header) {
      header.className = `table-header-row ${this.showSetB ? 'cols-b' : 'cols-a'} fade-col-transition`;
      header.innerHTML = this.renderHeaderHtml();
    }

    this.renderRows(this.currentStandings, false);
  },

  async loadData() {
    const bodyContainer = document.getElementById('tableBodyRows');
    if (!bodyContainer) return;

    try {
      const data = await API.getStandings();
      const rawStandings = data.standings || [];
      const league = data.league || {};

      // Update subtitle if league name/season exists
      const sub = document.getElementById('leagueSubtitle');
      if (sub && league.name) {
        sub.textContent = `${league.name} • Ochko: g'alaba 3 • durang 1`;
      }

      // Update header league text in top bar
      const topText = document.getElementById('headerLeagueText');
      if (topText && league.name) {
        topText.textContent = `${league.name} • ${league.season || '1-Mavsum'}`;
      }

      // Record positions before updating for FLIP animation
      this.recordRowPositions();

      // Sort according to Premier League rules: Pts desc, then GD desc, then F desc, then name
      const sorted = [...rawStandings].sort((a, b) => {
        const ptsDiff = (b.points || 0) - (a.points || 0);
        if (ptsDiff !== 0) return ptsDiff;
        const gdDiff = (b.goal_diff || 0) - (a.goal_diff || 0);
        if (gdDiff !== 0) return gdDiff;
        const fDiff = (b.goals_for || 0) - (a.goals_for || 0);
        if (fDiff !== 0) return fDiff;
        return (a.player_name || '').localeCompare(b.player_name || '');
      });

      // Assign calculated rank numbers
      sorted.forEach((row, idx) => {
        row.rank = idx + 1;
      });

      this.currentStandings = sorted;
      this.renderRows(sorted, true);

    } catch (err) {
      console.error('Standings loading error:', err);
      if (bodyContainer) {
        bodyContainer.innerHTML = `
          <div style="padding: 28px 16px; text-align: center;">
            <div style="color: var(--loss); font-weight: 600; font-size: 15px;">Jadvalni yuklab bo'lmadi</div>
            <div style="color: var(--muted); font-size: 12px; margin: 6px 0 14px;">${this.escape(err.message || 'Serverga ulanish xatosi')}</div>
            <button class="pill" onclick="StandingsView.loadData()" type="button">
              Qayta urinish
            </button>
          </div>
        `;
      }
    }
  },

  renderRows(standings, animateFlip = false) {
    const bodyContainer = document.getElementById('tableBodyRows');
    if (!bodyContainer) return;

    if (!standings || standings.length === 0) {
      bodyContainer.innerHTML = `
        <div style="padding: 36px 16px; text-align: center;">
          <div style="font-weight: 700; font-size: 16px; color: var(--white); margin-bottom: 6px;">Hali ishtirokchilar yo'q</div>
          <div style="color: var(--muted); font-size: 13px; margin-bottom: 16px;">Ro'yxatdan o'tib birinchi bo'lib qo'shiling.</div>
          <button class="pill on" onclick="App.showRegisterModal()" type="button">
            Ro'yxatdan o'tish
          </button>
        </div>
      `;
      return;
    }

    const myTgId = String(window.TelegramService?.getUser()?.id || '');
    const colClass = this.showSetB ? 'cols-b' : 'cols-a';

    bodyContainer.innerHTML = standings.map((p, index) => {
      const isMe = String(p.telegram_id) === myTgId;
      const isFirst = index === 0;
      const rowId = `row_${p.participant_id || p.telegram_id || index}`;

      // Check if points or W/D/L changed since last load to briefly flash
      const prevScore = this.previousScores.get(rowId);
      const scoreKey = `${p.points}_${p.won}_${p.drawn}_${p.lost}`;
      const hasChanged = prevScore && prevScore !== scoreKey;
      this.previousScores.set(rowId, scoreKey);

      let statCells = '';

      if (this.showSetB) {
        // Set B: MP, F, A, GD
        const gd = p.goal_diff !== undefined ? p.goal_diff : ((p.goals_for || 0) - (p.goals_against || 0));
        let gdClass = 'col-num-gd zero dimmed-zero';
        let gdText = '0';
        if (gd > 0) {
          gdClass = 'col-num-gd positive';
          gdText = `+${gd}`;
        } else if (gd < 0) {
          gdClass = 'col-num-gd negative';
          gdText = `${gd}`;
        }

        statCells = `
          <span class="col-num-mp ${p.played === 0 ? 'dimmed-zero' : ''}">${p.played || 0}</span>
          <span class="col-num-f ${p.goals_for === 0 ? 'dimmed-zero' : ''}">${p.goals_for || 0}</span>
          <span class="col-num-a ${p.goals_against === 0 ? 'dimmed-zero' : ''}">${p.goals_against || 0}</span>
          <span class="${gdClass}">${gdText}</span>
        `;
      } else {
        // Set A: MP, W, D, L
        statCells = `
          <span class="col-num-mp ${p.played === 0 ? 'dimmed-zero' : ''}">${p.played || 0}</span>
          <span class="col-num-w ${p.won === 0 ? 'dimmed-zero' : ''}">${p.won || 0}</span>
          <span class="col-num-d ${p.drawn === 0 ? 'dimmed-zero' : ''}">${p.drawn || 0}</span>
          <span class="col-num-l ${p.lost === 0 ? 'dimmed-zero' : ''}">${p.lost || 0}</span>
        `;
      }

      return `
        <div 
          class="table-data-row ${colClass} ${isFirst ? 'rank-first' : ''} ${isMe ? 'is-current-user' : ''} ${hasChanged ? 'flash-update' : ''}" 
          id="${rowId}" 
          data-key="${rowId}"
        >
          <span class="table-rank-cell">${p.rank}</span>
          <span class="table-nickname-cell">
            <em>${this.escape(p.player_name || "Noma'lum")}</em>
            ${isMe ? '<b class="tag-siz">SIZ</b>' : ''}
          </span>
          ${statCells}
          <span class="col-num-pts">${p.points || 0}</span>
        </div>
      `;
    }).join('');

    // Apply FLIP animation if positions changed
    if (animateFlip && this.previousPositions.size > 0) {
      this.applyFlipAnimation();
    }
  },

  recordRowPositions() {
    this.previousPositions.clear();
    const rows = document.querySelectorAll('.table-data-row');
    rows.forEach(r => {
      const key = r.getAttribute('data-key');
      if (key) {
        this.previousPositions.set(key, r.getBoundingClientRect().top);
      }
    });
  },

  applyFlipAnimation() {
    const rows = document.querySelectorAll('.table-data-row');
    rows.forEach(r => {
      const key = r.getAttribute('data-key');
      if (key && this.previousPositions.has(key)) {
        const prevTop = this.previousPositions.get(key);
        const currentTop = r.getBoundingClientRect().top;
        const deltaY = prevTop - currentTop;

        if (deltaY !== 0) {
          r.style.transform = `translateY(${deltaY}px)`;
          r.style.transition = 'none';

          requestAnimationFrame(() => {
            r.style.transition = 'transform 400ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            r.style.transform = '';
          });
        }
      }
    });
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.StandingsView = StandingsView;
