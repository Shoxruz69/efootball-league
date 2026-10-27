/**
 * Telegram WebApp SDK Wrapper & Simulation Layer
 */
const tgApp = window.Telegram?.WebApp || null;

const TelegramService = {
  isAvailable: Boolean(tgApp && tgApp.initData),

  init() {
    if (tgApp) {
      tgApp.ready();
      tgApp.expand();
      
      // Set header color to match eFootball 2026 light theme
      try {
        tgApp.setHeaderColor('#f2f4f8');
        tgApp.setBackgroundColor('#f2f4f8');
      } catch (e) {}
    }
  },

  getUser() {
    if (tgApp && tgApp.initDataUnsafe && tgApp.initDataUnsafe.user) {
      return tgApp.initDataUnsafe.user;
    }

    // Read stored simulation user for browser testing
    const saved = localStorage.getItem('efootball_sim_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }

    // Default simulation user
    return {
      id: 10001,
      first_name: 'Shox',
      username: 'shox_pro',
      photo_url: ''
    };
  },

  setSimulationUser(user) {
    localStorage.setItem('efootball_sim_user', JSON.stringify(user));
  },

  getInitData() {
    return tgApp?.initData || '';
  },

  haptic(type = 'medium') {
    try {
      if (!tgApp || !tgApp.HapticFeedback) return;
      if (type === 'selection') {
        if (typeof tgApp.HapticFeedback.selectionChanged === 'function') {
          tgApp.HapticFeedback.selectionChanged();
        }
      } else if (type === 'success' || type === 'error' || type === 'warning') {
        if (typeof tgApp.HapticFeedback.notificationOccurred === 'function') {
          tgApp.HapticFeedback.notificationOccurred(type);
        }
      } else {
        const allowedStyles = ['light', 'medium', 'heavy', 'rigid', 'soft'];
        const style = allowedStyles.includes(type) ? type : 'light';
        if (typeof tgApp.HapticFeedback.impactOccurred === 'function') {
          tgApp.HapticFeedback.impactOccurred(style);
        }
      }
    } catch (e) {
      // Never allow haptic feedback failure to interrupt execution
    }
  },

  close() {
    if (tgApp) tgApp.close();
  },

  openTelegramLink(url) {
    if (tgApp && tgApp.openTelegramLink) {
      tgApp.openTelegramLink(url);
    } else {
      window.open(url, '_blank');
    }
  }
};

window.TelegramService = TelegramService;
