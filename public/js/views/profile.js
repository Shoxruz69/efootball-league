/**
 * Profil (Profile View)
 * eFootball 2026 Mobile UI
 * Features:
 * - NIKNEYM & HOZIRGI HOLAT (#X o'rin • Y ochko)
 * - 2x2 grid (O'ynagan mavsumlar, Eng yaxshi mavsum, W-D-L, GF/GA) with count-up animations
 * - "Tur natijalari" (Round Results) bo'limi:
 *   - Round selector chips
 *   - Matches, real scores, and attached screenshots with lightbox preview
 * - "Mavsumlar tarixi" (Season History) bo'limi:
 *   - Past archived seasons list
 *   - Final standings table & user's historical performance
 * - Admin panel shortcut for authorized admins
 */
const ProfileView = {
  selectedRound: 1,
  allRounds: [],

  async render(container) {
    container.innerHTML = `
      <section class="view-section">
        <div class="view-header">
          <div class="view-title-row">
            <svg class="i" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>
            </svg>
            <h1>Profil</h1>
          </div>
          <p class="view-subtitle">Turnirdagi ishtirokingiz va natijalar tarixi</p>
        </div>

        <div id="profileCardsArea">
          <div style="padding: 32px 16px; text-align: center;">
            <div class="spinner"></div>
            <div style="color: var(--muted); font-size: 13px; font-weight: 500; margin-top: 8px;">
              Profil yuklanmoqda...
            </div>
          </div>
        </div>
      </section>
    `;

    await this.loadProfile();
  },

  async loadProfile() {
    const area = document.getElementById('profileCardsArea');
    if (!area) return;

    try {
      const data = await API.getMyProfile();
      const p = data.participant;
      if (window.App) {
        window.App.currentUser = p || null;
        try { localStorage.setItem('efootball_current_user', JSON.stringify(p || null)); } catch(e) {}
        window.App.renderHeaderUser();
      }
      const stats = data.stats || {
        total_seasons: 1,
        best_season: '—',
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        current_points: 0,
        current_rank: '—'
      };

      if (!p) {
        area.innerHTML = `
          <div class="state-box">
            <svg class="i" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>
            </svg>
            <h3>Siz hali ro'yxatdan o'tmadingiz</h3>
            <p>Turnirda qatnashish uchun nickname kiriting.</p>
            <button class="pill on" onclick="App.showRegisterModal()" type="button">
              Ro'yxatdan o'tish
            </button>
          </div>
        `;
        return;
      }

      // Check W, D, L opacity classes
      const wClass = stats.won === 0 ? 'wdl-w dimmed-zero' : 'wdl-w';
      const dClass = stats.drawn === 0 ? 'wdl-d dimmed-zero' : 'wdl-d';
      const lClass = stats.lost === 0 ? 'wdl-l dimmed-zero' : 'wdl-l';
      const bestSeasonText = stats.best_season || '—';

      area.innerHTML = `
        <!-- Card 1: NIKNEYM -->
        <div class="white-card">
          <div style="flex: 1;">
            <small>NIKNEYM</small>
            <b class="big">${this.escape(p.player_name || "Noma'lum")}</b>
            ${p.team ? `<div style="font-size: 12.5px; color: var(--cyan); margin-top: 2px; font-weight: 600;">${this.escape(p.team)}</div>` : ''}
          </div>
        </div>

        <!-- Card 2: HOZIRGI HOLAT -->
        <div class="white-card">
          <div>
            <small>HOZIRGI HOLAT</small>
            <b class="sub-big">
              #<span id="cntRank">${stats.current_rank}</span> o'rin • <span id="cntPts">${stats.current_points}</span> ochko
            </b>
          </div>
        </div>

        <!-- 2x2 Grid -->
        <div class="grid-2col">
          <!-- Card 3: O'YNAGAN MAVSUMLAR -->
          <div class="white-card">
            <small>O'YNAGAN MAVSUMLAR</small>
            <b><span id="cntSeasons">${stats.total_seasons || 1}</span> ta</b>
          </div>

          <!-- Card 4: ENG YAXSHI MAVSUM -->
          <div class="white-card">
            <small>ENG YAXSHI MAVSUM</small>
            <b>${this.escape(bestSeasonText)}</b>
          </div>

          <!-- Card 5: G'ALABA • DURANG • MAG'LUBIYAT -->
          <div class="white-card">
            <small>G'ALABA • DURANG • MAG'LUBIYAT</small>
            <b class="wdl-stat-row">
              <span class="${wClass}" id="cntWon">${stats.won || 0}</span>
              <span style="color: var(--muted); font-weight: 400;">•</span>
              <span class="${dClass}" id="cntDrawn">${stats.drawn || 0}</span>
              <span style="color: var(--muted); font-weight: 400;">•</span>
              <span class="${lClass}" id="cntLost">${stats.lost || 0}</span>
            </b>
          </div>

          <!-- Card 6: URGAN / O'TKAZGAN -->
          <div class="white-card">
            <small>URGAN / O'TKAZGAN</small>
            <b>
              <span id="cntGf">${stats.goals_for || 0}</span>
              <span style="color: var(--muted); font-weight: 400;"> / </span>
              <span id="cntGa">${stats.goals_against || 0}</span>
            </b>
          </div>
        </div>

        <!-- SECTION: TUR NATIJALARI (ROUND RESULTS) -->
        <div class="profile-section-card" id="profileRoundResultsSection">
          <div class="profile-section-title">
            <h4>
              <svg class="i" viewBox="0 0 24 24" style="width: 16px; height: 16px; color: var(--cyan);">
                <rect x="4" y="3" width="16" height="18" rx="2"/>
                <path d="M8 8h8M8 12h8M8 16h5"/>
              </svg>
              Tur natijalari
            </h4>
            <span style="font-size: 11.5px; color: var(--muted);" id="currentRoundIndicator">Yuklanmoqda...</span>
          </div>

          <!-- Round Chips Scroll -->
          <div class="round-chips-scroll" id="profileRoundChips">
            <div style="font-size: 12px; color: var(--muted); padding: 4px;">Turlar yuklanmoqda...</div>
          </div>

          <!-- Matches for Selected Round -->
          <div id="profileRoundMatchesList">
            <div style="padding: 16px; text-align: center;">
              <div class="spinner"></div>
            </div>
          </div>
        </div>

        <!-- SECTION: MAVSUMLAR TARIXI (SEASON ARCHIVES) -->
        <div class="profile-section-card" id="profileSeasonHistorySection">
          <div class="profile-section-title">
            <h4>
              <svg class="i" viewBox="0 0 24 24" style="width: 16px; height: 16px; color: #ffbb00;">
                <circle cx="12" cy="8" r="7"/>
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
              </svg>
              Mavsumlar tarixi
            </h4>
            <span style="font-size: 11.5px; color: var(--muted);">Arxiv natijalar</span>
          </div>

          <div id="profileSeasonHistoryList">
            <div style="padding: 16px; text-align: center;">
              <div class="spinner"></div>
            </div>
          </div>
        </div>

        ${data.isAdmin ? `
          <!-- Admin Panel Navigation Card -->
          <div class="white-card" style="margin-top: 14px; background: linear-gradient(135deg, rgba(30, 80, 255, 0.08) 0%, rgba(0, 225, 255, 0.05) 100%); border: 1.5px solid rgba(30, 80, 255, 0.25); justify-content: space-between; align-items: center; padding: 14px 16px;">
            <div>
              <small style="color: var(--blue); font-weight: 700; letter-spacing: 0.8px;">ADMIN BOSHQARUVI</small>
              <b style="font-size: 15px; color: var(--row); display: block; margin-top: 2px;">Liga boshqaruv paneli</b>
            </div>
            <button class="pill on" style="padding: 8px 16px; font-size: 13px; min-height: 38px;" onclick="App.navigateTo('admin')" type="button">
              Ochish
            </button>
          </div>
        ` : ''}
      `;

      // Trigger count-up animation for numerical fields
      this.animateCountUp('cntPts', 0, stats.current_points || 0, 500);
      this.animateCountUp('cntWon', 0, stats.won || 0, 500);
      this.animateCountUp('cntDrawn', 0, stats.drawn || 0, 500);
      this.animateCountUp('cntLost', 0, stats.lost || 0, 500);
      this.animateCountUp('cntGf', 0, stats.goals_for || 0, 500);
      this.animateCountUp('cntGa', 0, stats.goals_against || 0, 500);

      // Load Round Results & Season History asynchronously
      await Promise.all([
        this.initRoundResults(),
        this.loadSeasonHistory()
      ]);

    } catch (err) {
      console.error('Profile loading error:', err);
      if (area) {
        area.innerHTML = `
          <div class="state-box">
            <h3 style="color: var(--loss);">Profilni yuklab bo'lmadi</h3>
            <p>${this.escape(err.message || 'Serverga ulanish xatosi')}</p>
            <button class="pill" onclick="ProfileView.loadProfile()" type="button">
              Qayta urinish
            </button>
          </div>
        `;
      }
    }
  },

  async initRoundResults() {
    const chipsContainer = document.getElementById('profileRoundChips');
    const indicator = document.getElementById('currentRoundIndicator');
    try {
      const matchData = await API.getMatches();
      const rounds = (matchData && Array.isArray(matchData.rounds)) ? matchData.rounds : [];
      const currentRound = parseInt(matchData.currentRound, 10) || 1;

      this.allRounds = rounds;
      this.selectedRound = rounds.includes(currentRound) ? currentRound : (rounds[0] || 1);

      if (indicator) {
        indicator.textContent = `Joriy tur: ${currentRound}`;
      }

      if (rounds.length === 0) {
        if (chipsContainer) chipsContainer.innerHTML = '';
        const list = document.getElementById('profileRoundMatchesList');
        if (list) {
          list.innerHTML = `
            <div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">
              Ushbu mavsum uchun hali o'yinlar taqvimi tuzilmagan.
            </div>
          `;
        }
        return;
      }

      if (chipsContainer) {
        chipsContainer.innerHTML = rounds.map(r => `
          <button 
            class="round-chip-btn ${parseInt(r, 10) === parseInt(this.selectedRound, 10) ? 'active' : ''}" 
            onclick="ProfileView.selectRound(${r})" 
            type="button"
          >
            ${r}-tur
          </button>
        `).join('');
      }

      await this.loadRoundMatches(this.selectedRound);
    } catch (err) {
      console.error('Init round results error:', err);
      const list = document.getElementById('profileRoundMatchesList');
      if (list) {
        list.innerHTML = `<div style="color: var(--loss); font-size: 12px; padding: 10px;">Tur natijalarini yuklab bo'lmadi: ${this.escape(err.message)}</div>`;
      }
    }
  },

  async selectRound(roundNum) {
    this.selectedRound = parseInt(roundNum, 10);
    try { window.TelegramService?.haptic('selection'); } catch (e) {}

    const chips = document.querySelectorAll('#profileRoundChips .round-chip-btn');
    chips.forEach(btn => {
      btn.classList.toggle('active', btn.textContent.trim() === `${roundNum}-tur`);
    });

    await this.loadRoundMatches(this.selectedRound);
  },

  async loadRoundMatches(roundNum) {
    const list = document.getElementById('profileRoundMatchesList');
    if (!list) return;

    list.innerHTML = `
      <div style="padding: 16px; text-align: center;">
        <div class="spinner"></div>
      </div>
    `;

    try {
      const data = await API.getRoundMatches(roundNum);
      const matches = (data && Array.isArray(data.matches)) ? data.matches : [];

      if (matches.length === 0) {
        list.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--muted); font-size: 13px;">
            ${roundNum}-turda o'yinlar topilmadi.
          </div>
        `;
        return;
      }

      list.innerHTML = matches.map(m => {
        const isConfirmed = m.status === 'finished';
        const isSubmitted = m.status === 'submitted';
        const isDisputed = m.status === 'disputed';

        let statusBadge = '<span style="color: var(--cyan); background: rgba(25, 201, 255, 0.1); padding: 2px 8px; border-radius: 4px; font-weight: 600;">Kutilmoqda</span>';
        if (isConfirmed) {
          statusBadge = '<span style="color: var(--win); background: rgba(45, 224, 138, 0.1); padding: 2px 8px; border-radius: 4px; font-weight: 600;">Tasdiqlangan</span>';
        } else if (isSubmitted) {
          statusBadge = '<span style="color: #ffbb00; background: rgba(255, 187, 0, 0.1); padding: 2px 8px; border-radius: 4px; font-weight: 600;">Kiritildi</span>';
        } else if (isDisputed) {
          statusBadge = '<span style="color: var(--loss); background: rgba(255, 77, 109, 0.1); padding: 2px 8px; border-radius: 4px; font-weight: 600;">E\'tirozli</span>';
        }

        const scoreText = (isConfirmed || isSubmitted) && m.home_score !== null && m.away_score !== null
          ? `${m.home_score} : ${m.away_score}`
          : '- : -';

        const hasScreenshot = Boolean(m.screenshot_url);

        return `
          <div class="round-match-row">
            <div class="round-match-header">
              <span style="color: var(--muted); font-weight: 500;">${m.round}-tur uchrashuvi</span>
              ${statusBadge}
            </div>

            <div class="round-match-content">
              <div class="round-match-team" style="text-align: right;">
                <div style="color: var(--white);">${this.escape(m.home_player_name || 'Mezbon')}</div>
                <div style="font-size: 11px; color: var(--muted); font-weight: 400;">${this.escape(m.home_team || '')}</div>
              </div>

              <div class="round-match-score">${scoreText}</div>

              <div class="round-match-team" style="text-align: left;">
                <div style="color: var(--white);">${this.escape(m.away_player_name || 'Mehmon')}</div>
                <div style="font-size: 11px; color: var(--muted); font-weight: 400;">${this.escape(m.away_team || '')}</div>
              </div>
            </div>

            ${hasScreenshot ? `
              <div style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between;">
                <button 
                  class="round-screenshot-link" 
                  type="button" 
                  onclick="ProfileView.openScreenshotModal('${this.escape(m.screenshot_url)}', '${this.escape(m.home_player_name)} vs ${this.escape(m.away_player_name)}')"
                >
                  <svg class="i" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Skrinshotni ko'rish
                </button>
                <span style="font-size: 11px; color: var(--muted);">Tasdiqlangan rasm</span>
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Load round matches error:', err);
      list.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--loss); font-size: 12px;">
          Natijalarni yuklab bo'lmadi: ${this.escape(err.message)}
        </div>
      `;
    }
  },

  async loadSeasonHistory() {
    const list = document.getElementById('profileSeasonHistoryList');
    if (!list) return;

    try {
      const data = await API.getSeasonsHistory();
      const archives = (data && Array.isArray(data.archives)) ? data.archives : [];

      if (archives.length === 0) {
        list.innerHTML = `
          <div style="padding: 14px; text-align: center; color: var(--muted); font-size: 13px; line-height: 1.5;">
            Hozircha yakunlangan avvalgi mavsumlar mavjud emas.<br>
            <span style="font-size: 12px; color: var(--cyan);">Joriy mavsum davom etmoqda.</span>
          </div>
        `;
        return;
      }

      list.innerHTML = archives.map(a => {
        const completedDate = a.completed_at ? new Date(a.completed_at).toLocaleDateString('uz-UZ') : '';
        return `
          <div class="season-archive-card" onclick="ProfileView.openArchiveModal(${a.id})">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <b style="font-size: 14px; color: var(--white);">${this.escape(a.league_name)}</b>
              <span style="font-size: 11px; color: var(--muted);">${completedDate}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
              <span style="color: #ffbb00; display: inline-flex; align-items: center; gap: 4px;">
                🏆 Chempion: <b>${this.escape(a.winner_name || 'Noma\'lum')}</b> ${a.winner_club ? `(${this.escape(a.winner_club)})` : ''}
              </span>
              <span style="color: var(--cyan); font-weight: 600;">Jadval ></span>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('Load season history error:', err);
      list.innerHTML = `
        <div style="padding: 12px; text-align: center; color: var(--loss); font-size: 12px;">
          Mavsumlar tarixini yuklab bo'lmadi: ${this.escape(err.message)}
        </div>
      `;
    }
  },

  async openArchiveModal(archiveId) {
    try { window.TelegramService?.haptic('selection'); } catch (e) {}

    try {
      const data = await API.getSeasonArchive(archiveId);
      const archive = data.archive;
      if (!archive) return;

      const standings = Array.isArray(archive.standings) ? archive.standings : [];
      const currentUser = window.App?.currentUser;
      const myTgId = String(currentUser?.telegram_id || window.TelegramService?.getUser()?.id || '');
      const myName = currentUser?.player_name;

      // Find current user's performance in this archived season
      const myArchivedStat = standings.find(s => 
        (myTgId && String(s.telegram_id) === myTgId) || 
        (myName && s.player_name && s.player_name.toLowerCase() === myName.toLowerCase())
      );

      const tableRows = standings.map((s, idx) => {
        const isMe = (myTgId && String(s.telegram_id) === myTgId) || (myName && s.player_name && s.player_name.toLowerCase() === myName.toLowerCase());
        const rowBg = isMe ? 'background: rgba(25, 201, 255, 0.15); font-weight: 700;' : '';
        const rankColor = idx === 0 ? 'color: #ffbb00; font-weight: 700;' : (idx === 1 ? 'color: #c0c0c0;' : (idx === 2 ? 'color: #cd7f32;' : ''));

        return `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.06); ${rowBg}">
            <td style="padding: 8px 4px; text-align: center; ${rankColor}">#${idx + 1}</td>
            <td style="padding: 8px 6px; text-align: left; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span style="color: ${isMe ? 'var(--cyan)' : 'var(--white)'};">${this.escape(s.player_name)}</span>
              ${s.team ? `<div style="font-size: 10px; color: var(--muted);">${this.escape(s.team)}</div>` : ''}
            </td>
            <td style="padding: 8px 4px; text-align: center; color: var(--muted);">${s.played || (s.won + s.drawn + s.lost)}</td>
            <td style="padding: 8px 4px; text-align: center; color: var(--win);">${s.won}</td>
            <td style="padding: 8px 4px; text-align: center; color: var(--draw);">${s.drawn}</td>
            <td style="padding: 8px 4px; text-align: center; color: var(--loss);">${s.lost}</td>
            <td style="padding: 8px 4px; text-align: center; color: var(--muted);">${s.goals_for}:${s.goals_against}</td>
            <td style="padding: 8px 6px; text-align: center; font-weight: 700; color: #ffffff;">${s.points}</td>
          </tr>
        `;
      }).join('');

      const modalHtml = `
        <div class="modal-overlay" id="seasonArchiveModal" onclick="if(event.target===this) ProfileView.closeModal('seasonArchiveModal')">
          <div class="modal-dialog" style="max-width: 440px; padding: 20px 16px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
              <div>
                <span style="font-size: 11px; color: var(--cyan); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Arxiv Mavsum</span>
                <h3 style="font-size: 18px; color: var(--white); margin: 2px 0;">${this.escape(archive.league_name)}</h3>
                <div style="font-size: 12px; color: var(--muted);">Tugallangan: ${archive.completed_at ? new Date(archive.completed_at).toLocaleDateString('uz-UZ') : ''}</div>
              </div>
              <button 
                onclick="ProfileView.closeModal('seasonArchiveModal')" 
                style="background: rgba(255,255,255,0.08); border: none; color: var(--muted); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
                type="button"
              >
                ✕
              </button>
            </div>

            <!-- Winner Highlight -->
            <div style="background: rgba(255, 187, 0, 0.08); border: 1px solid rgba(255, 187, 0, 0.25); border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 24px;">🏆</span>
              <div>
                <div style="font-size: 11px; color: #ffbb00; font-weight: 700; text-transform: uppercase;">Mavsum Chempioni</div>
                <div style="font-size: 15px; font-weight: 700; color: #ffffff;">${this.escape(archive.winner_name || 'Noma\'lum')}</div>
                ${archive.winner_club ? `<div style="font-size: 11.5px; color: var(--muted);">${this.escape(archive.winner_club)}</div>` : ''}
              </div>
            </div>

            ${myArchivedStat ? `
              <!-- User Performance in this season -->
              <div style="background: rgba(25, 201, 255, 0.08); border: 1px solid rgba(25, 201, 255, 0.25); border-radius: 10px; padding: 10px 14px; margin-bottom: 14px;">
                <div style="font-size: 11px; color: var(--cyan); font-weight: 700; text-transform: uppercase;">Sizning ushbu mavsumdagi natijangiz:</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 13.5px; font-weight: 600; color: #ffffff;">
                  <span>O'rin: <b>#${standings.indexOf(myArchivedStat) + 1}</b></span>
                  <span>Ochko: <b>${myArchivedStat.points}</b></span>
                  <span>G': <b style="color:var(--win);">${myArchivedStat.won}</b> D: <b style="color:var(--draw);">${myArchivedStat.drawn}</b> M: <b style="color:var(--loss);">${myArchivedStat.lost}</b></span>
                </div>
              </div>
            ` : ''}

            <!-- Standings Table -->
            <div style="overflow-x: auto; margin-bottom: 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="background: rgba(255,255,255,0.06); color: var(--muted); text-transform: uppercase; font-size: 10px;">
                    <th style="padding: 6px 4px; text-align: center;">#</th>
                    <th style="padding: 6px 6px; text-align: left;">O'yinchi</th>
                    <th style="padding: 6px 4px; text-align: center;">O'</th>
                    <th style="padding: 6px 4px; text-align: center;">G'</th>
                    <th style="padding: 6px 4px; text-align: center;">D</th>
                    <th style="padding: 6px 4px; text-align: center;">M</th>
                    <th style="padding: 6px 4px; text-align: center;">Gol</th>
                    <th style="padding: 6px 6px; text-align: center;">Ochko</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows || '<tr><td colspan="8" style="padding: 12px; text-align: center; color: var(--muted);">Jadval ma\'lumoti mavjud emas</td></tr>'}
                </tbody>
              </table>
            </div>

            <button class="pill on" onclick="ProfileView.closeModal('seasonArchiveModal')" type="button" style="width: 100%;">
              Yopish
            </button>
          </div>
        </div>
      `;

      this.closeModal('seasonArchiveModal');
      document.body.insertAdjacentHTML('beforeend', modalHtml);

    } catch (err) {
      alert("Mavsum arxivini yuklab bo'lmadi: " + (err.message || 'Xatolik'));
    }
  },

  openScreenshotModal(imageUrl, title = 'O\'yin skrinshoti') {
    try { window.TelegramService?.haptic('selection'); } catch (e) {}

    const modalHtml = `
      <div class="modal-overlay" id="screenshotPreviewModal" onclick="if(event.target===this) ProfileView.closeModal('screenshotPreviewModal')">
        <div class="modal-dialog" style="max-width: 420px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${this.escape(title)}</div>
            <button 
              onclick="ProfileView.closeModal('screenshotPreviewModal')" 
              style="background: rgba(255,255,255,0.08); border: none; color: var(--muted); width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;"
              type="button"
            >
              ✕
            </button>
          </div>

          <div style="border-radius: 10px; overflow: hidden; background: #000; border: 1px solid rgba(255,255,255,0.1); margin-bottom: 14px;">
            <img src="${this.escape(imageUrl)}" style="width: 100%; max-height: 440px; object-fit: contain; display: block;" alt="Skrinshot" />
          </div>

          <div style="display: flex; gap: 8px;">
            <a 
              href="${this.escape(imageUrl)}" 
              target="_blank" 
              rel="noopener noreferrer" 
              class="pill" 
              style="flex: 1; text-align: center; text-decoration: none; display: flex; align-items: center; justify-content: center; font-size: 13px;"
            >
              Asl hajmini ochish ↗
            </a>
            <button class="pill on" onclick="ProfileView.closeModal('screenshotPreviewModal')" type="button" style="flex: 1;">
              Yopish
            </button>
          </div>
        </div>
      </div>
    `;

    this.closeModal('screenshotPreviewModal');
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => modal.remove(), 180);
    }
  },

  animateCountUp(id, start, end, duration) {
    const el = document.getElementById(id);
    if (!el || isNaN(end) || end <= 0) return;

    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.floor(start + (end - start) * (progress * (2 - progress)));
      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = end;
      }
    }

    requestAnimationFrame(step);
  },

  escape(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.ProfileView = ProfileView;
