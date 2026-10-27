/**
 * Main Application Controller
 * Strictly 3 views: standings (Jadval), matches (Natija kiritish), profile (Profil)
 * eFootball 2026 Mobile UI
 */
const App = {
  currentView: 'standings',
  currentUser: null,
  ws: null,

  async init() {
    try {
      window.TelegramService?.init();
    } catch (e) {
      console.warn('[App] Telegram init warning:', e);
    }

    // 0. Restore cached user session immediately (no flickering)
    try {
      const savedUser = localStorage.getItem('efootball_current_user');
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
      }
      this.isAdmin = localStorage.getItem('efootball_is_admin') === '1';
    } catch (e) {}
    this.renderHeaderUser();

    // Setup navigation tabs (Strictly 3 tabs)
    document.querySelectorAll('#bottomNav .pill').forEach(tab => {
      tab.addEventListener('click', () => {
        const view = tab.getAttribute('data-view');
        if (view) this.navigateTo(view);
      });
    });

    // Check URL parameters and saved session view
    const urlParams = new URLSearchParams(window.location.search);
    const targetView = urlParams.get('view');
    const targetMatchId = urlParams.get('match_id');
    const secretParam = urlParams.get('secret') || urlParams.get('key');
    const savedView = sessionStorage.getItem('efootball_active_view');

    // Save admin secret if provided in URL
    if (secretParam) {
      localStorage.setItem('efootball_admin_secret', secretParam);
    }

    // 1. Render initial view immediately (Persists active view across refreshes)
    const initialView = (targetView && ['standings', 'matches', 'profile', 'admin'].includes(targetView))
      ? targetView
      : (savedView && ['standings', 'matches', 'profile', 'admin'].includes(savedView))
        ? savedView
        : 'standings';
    this.navigateTo(initialView);

    // 2. Connect WebSocket and check user registration in background
    try {
      this.connectWebSocket();
    } catch (e) {}

    try {
      await this.checkUserRegistration();
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
    try {
      sessionStorage.setItem('efootball_active_view', viewName);
    } catch (e) {}

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
          <button class="pill on" onclick="App.navigateTo('${viewName}')" type="button">
            Qayta urinish
          </button>
        </div>
      `;
    }
  },

  renderHeaderUser() {
    const headerUserTag = document.getElementById('headerUserTag');
    if (!headerUserTag) return;

    if (this.currentUser && this.currentUser.player_name) {
      headerUserTag.innerHTML = `
        <span class="user-status-pill">
          <span class="dot"></span>
          <span>${this.escape(this.currentUser.player_name)}</span>
        </span>
      `;
    } else {
      headerUserTag.innerHTML = `
        <button class="pill" style="padding: 4px 10px; font-size: 11.5px; min-height: 28px;" onclick="App.showRegisterModal()" type="button">
          Ro'yxatdan o'tish
        </button>
      `;
    }
  },

  async checkUserRegistration() {
    try {
      const res = await API.getMyProfile();
      this.currentUser = res.participant || null;
      this.isAdmin = Boolean(res.isAdmin);
      try {
        localStorage.setItem('efootball_current_user', JSON.stringify(this.currentUser));
        localStorage.setItem('efootball_is_admin', this.isAdmin ? '1' : '0');
      } catch (e) {}
      this.renderHeaderUser();
      return this.currentUser;
    } catch (e) {
      console.warn('Registration check failed:', e);
      return this.currentUser;
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
