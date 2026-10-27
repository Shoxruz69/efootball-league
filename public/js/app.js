/**
 * Main Application Controller
 * Strictly 3 views: standings (Jadval), matches (Natija kiritish), profile (Profil)
 * eFootball 2026 Mobile UI
 */
const App = {
  currentView: 'standings',
  ws: null,

  async init() {
    try {
      window.TelegramService?.init();
    } catch (e) {
      console.warn('[App] Telegram init warning:', e);
    }

    // Setup navigation tabs (Strictly 3 tabs)
    document.querySelectorAll('#bottomNav .pill').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('data-view');
        if (view) this.navigateTo(view);
      });
    });

    // Check URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const targetView = urlParams.get('view');
    const targetMatchId = urlParams.get('match_id');
    const secretParam = urlParams.get('secret') || urlParams.get('key');

    // Save admin secret if provided in URL
    if (secretParam) {
      localStorage.setItem('efootball_admin_secret', secretParam);
    }

    // 1. Render initial view immediately (Default is Standings)
    const initialView = (targetView && ['standings', 'matches', 'profile', 'admin'].includes(targetView))
      ? targetView
      : 'standings';
    this.navigateTo(initialView);

    // 2. Connect WebSocket and check user registration in background
    try {
      this.connectWebSocket();
    } catch (e) {}

    try {
      this.checkUserRegistration();
    } catch (e) {}

    // 3. If specific match requested via deep-link
    if (targetMatchId) {
      setTimeout(() => {
        if (window.MatchesView) {
          MatchesView.openMatchModal(parseInt(targetMatchId, 10));
        }
      }, 400);
    }
  },

  navigateTo(viewName) {
    if (!['standings', 'matches', 'profile', 'admin'].includes(viewName)) {
      viewName = 'standings';
    }
    this.currentView = viewName;

    // Toggle pitch background for Standings view
    const isStandings = viewName === 'standings';
    const appContainer = document.getElementById('appContainer') || document.querySelector('.app-container');
    if (appContainer) {
      appContainer.classList.toggle('view-standings-active', isStandings);
    }
    document.body.classList.toggle('view-standings-active', isStandings);

    // Update bottom nav active state (.on)
    document.querySelectorAll('#bottomNav .pill').forEach(tab => {
      tab.classList.toggle('on', tab.getAttribute('data-view') === viewName);
    });

    const content = document.getElementById('mainContent');
    if (!content) return;

    try {
      window.TelegramService?.haptic('selection');
    } catch (e) {}

    try {
      if (viewName === 'standings' && window.StandingsView) {
        StandingsView.render(content);
      } else if (viewName === 'matches' && window.MatchesView) {
        MatchesView.render(content);
      } else if (viewName === 'profile' && window.ProfileView) {
        ProfileView.render(content);
      } else if (viewName === 'admin' && window.AdminView) {
        AdminView.render(content);
      }
    } catch (err) {
      console.error(`[App.navigateTo] Error rendering ${viewName}:`, err);
      content.innerHTML = `
        <div class="state-box">
          <h3 style="color: var(--loss);">Ekranni yuklashda xatolik</h3>
          <p>${err.message || "Noma'lum xatolik"}</p>
          <button class="pill" onclick="App.navigateTo('${viewName}')" type="button">
            Qayta urinish
          </button>
        </div>
      `;
    }
  },

  async checkUserRegistration() {
    try {
      const res = await API.getMyProfile();
      const p = res.participant;
      const headerUserTag = document.getElementById('headerUserTag');

      if (!headerUserTag) return;

      if (p) {
        headerUserTag.innerHTML = `
          <span class="user-status-pill">
            <span class="dot"></span>
            <span>${this.escape(p.player_name)}</span>
          </span>
        `;
      } else {
        headerUserTag.innerHTML = `
          <button class="pill" style="padding: 4px 10px; font-size: 11.5px; min-height: 28px;" onclick="App.showRegisterModal()" type="button">
            Ro'yxatdan o'tish
          </button>
        `;
      }
    } catch (e) {
      console.warn('Registration check failed:', e);
    }
  },

  connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleWebSocketMessage(msg);
        } catch (e) {}
      };

      this.ws.onclose = () => {
        setTimeout(() => this.connectWebSocket(), 6000);
      };
    } catch (e) {}
  },

  handleWebSocketMessage(msg) {
    if (msg.type === 'standings_updated') {
      if (this.currentView === 'standings') StandingsView.loadData();
      if (this.currentView === 'profile') ProfileView.loadProfile();
    } else if (msg.type === 'schedule_generated' || msg.type === 'match_reset' || msg.type === 'match_event') {
      if (this.currentView === 'matches') MatchesView.loadMatches();
      if (this.currentView === 'standings') StandingsView.loadData();
    }
  },

  refreshStandings() {
    try { window.TelegramService?.haptic('medium'); } catch (e) {}
    if (window.StandingsView) StandingsView.loadData();
  },

  refreshMatches() {
    try { window.TelegramService?.haptic('medium'); } catch (e) {}
    if (window.MatchesView) MatchesView.loadMatches();
  },

  showRegisterModal() {
    if (window.RegisterModal) {
      RegisterModal.show();
    }
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.App = App;

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
