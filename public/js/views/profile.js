/**
 * Profil (Profile View)
 * eFootball 2026 Mobile UI
 * Features:
 * - White rounded cards (.white-card, .grid-2col)
 * - NIKNEYM (large bold)
 * - HOZIRGI HOLAT (#X o'rin • Y ochko)
 * - 2x2 grid:
 *   - O'YNAGAN MAVSUMLAR (N ta)
 *   - ENG YAXSHI MAVSUM (— or season name)
 *   - G'ALABA • DURANG • MAG'LUBIYAT (W green, D gray, L red with dimmer .45 opacity for 0)
 *   - URGAN / O'TKAZGAN (GF / GA)
 * - Numbers count up on screen open (500ms duration)
 */
const ProfileView = {
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
          <p class="view-subtitle">Turnirdagi ishtirokingiz</p>
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
          <div>
            <small>NIKNEYM</small>
            <b class="big">${this.escape(p.player_name || "Noma'lum")}</b>
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

        ${data.isAdmin ? `
          <!-- Admin Panel Navigation Card (Faqat tasdiqlangan adminlar uchun) -->
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

  animateCountUp(id, start, end, duration) {
    const el = document.getElementById(id);
    if (!el || isNaN(end) || end <= 0) return;

    const startTime = performance.now();

    function step(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuad
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
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.ProfileView = ProfileView;
