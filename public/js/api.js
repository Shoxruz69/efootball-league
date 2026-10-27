/**
 * eFootball League API Client with Timeout, Safe Error Handling & Auto-Retry
 */
const API = {
  baseUrl: '',

  getHeaders() {
    const headers = {};
    const initData = window.TelegramService?.getInitData();
    if (initData) {
      headers['x-telegram-init-data'] = initData;
    }

    const user = window.TelegramService?.getUser();
    if (user) {
      headers['x-telegram-user'] = JSON.stringify(user);
    }

    const adminToken = localStorage.getItem('efootball_admin_token') || localStorage.getItem('efootball_admin_secret');
    if (adminToken) {
      headers['x-admin-token'] = adminToken;
    }

    return headers;
  },

  async request(endpoint, options = {}, retries = 1) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      ...this.getHeaders(),
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // 8-second request timeout controller
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      let data = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const rawText = await response.text();
        if (response.status === 502 || rawText.includes('no tunnel') || rawText.includes('Bad Gateway')) {
          throw new Error('Ommaviy tunnel vaqtincha javob bermayapti (Bad Gateway 502). Server qayta tiklanmoqda...');
        }
        try {
          data = JSON.parse(rawText);
        } catch (e) {
          data = { message: rawText || `Server javobi: HTTP ${response.status}` };
        }
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `Server xatosi: HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      clearTimeout(timeoutId);

      // Auto-retry once on network or abort timeout errors
      if (retries > 0 && (err.name === 'AbortError' || err.message.includes('fetch') || err.message.includes('Failed to fetch'))) {
        console.warn(`[API Retry] ${endpoint} qayta urinilmoqda...`);
        await new Promise(r => setTimeout(r, 1200));
        return this.request(endpoint, options, retries - 1);
      }

      let errorMsg = err.message;
      if (err.name === 'AbortError') {
        errorMsg = 'Server javob berish vaqti tugadi (Timeout). Internet aloqasini tekshiring.';
      } else if (errorMsg.includes('Failed to fetch')) {
        errorMsg = 'Serverga ulanib bo‘lmadi. Internet yoki tunnel aloqasini tekshiring.';
      }

      console.error(`API Xatosi (${endpoint}):`, errorMsg);
      throw new Error(errorMsg);
    }
  },

  // League
  getLeague() {
    return this.request('/api/league/current');
  },

  // Participants
  getParticipants() {
    return this.request('/api/participants');
  },
  getMyProfile() {
    return this.request('/api/participants/me');
  },
  register(data) {
    return this.request('/api/participants/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  leaveLeague(participantId) {
    return this.request('/api/participants/remove', {
      method: 'POST',
      body: JSON.stringify({ participant_id: participantId })
    });
  },

  // Matches & Standings
  getMatches(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/matches${query ? '?' + query : ''}`);
  },
  getMatch(id) {
    return this.request(`/api/matches/${id}`);
  },
  getStandings() {
    return this.request('/api/matches/table/standings');
  },

  // Results & Screenshot OCR
  uploadScreenshot(matchId, file) {
    const formData = new FormData();
    formData.append('screenshot', file);
    return this.request(`/api/results/upload-screenshot/${matchId}`, {
      method: 'POST',
      body: formData
    });
  },
  submitResult(matchId, data) {
    return this.request(`/api/results/submit/${matchId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  confirmResult(matchId) {
    return this.request(`/api/results/confirm/${matchId}`, {
      method: 'POST'
    });
  },
  disputeResult(matchId, reason) {
    return this.request(`/api/results/dispute/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
  },

  // Live Match Interactive Scoring
  startLive(matchId) {
    return this.request(`/api/live/start/${matchId}`, { method: 'POST' });
  },
  logLiveGoal(matchId, data) {
    return this.request(`/api/live/goal/${matchId}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  confirmLiveGoal(matchId, eventId, confirmed) {
    return this.request(`/api/live/confirm-goal/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ eventId, confirmed })
    });
  },

  // Predictions (Taxminlar)
  getPredictionMatches() {
    return this.request('/api/taxmin/matches');
  },
  submitPrediction(matchId, homeScore, awayScore) {
    return this.request(`/api/taxmin/predict/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ home_score: homeScore, away_score: awayScore })
    });
  },
  getPredictionLeaderboard() {
    return this.request('/api/taxmin/leaderboard');
  },
  getAwards() {
    return this.request('/api/taxmin/awards');
  },
  getMotw() {
    return this.request('/api/taxmin/motw');
  },
  voteMotw(matchId) {
    return this.request(`/api/taxmin/motw/vote/${matchId}`, { method: 'POST' });
  },

  // H2H & Stats
  getH2H(p1, p2) {
    return this.request(`/api/stats/h2h?p1=${p1}&p2=${p2}`);
  },

  // Admin Authentication & Actions
  adminLogin(password) {
    return this.request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },
  adminLogout() {
    return this.request('/api/admin/logout', { method: 'POST' });
  },
  checkAdminAuth() {
    return this.request('/api/admin/auth/check');
  },
  adminTriggerDraw(force = false) {
    return this.request('/api/admin/draw', {
      method: 'POST',
      body: JSON.stringify({ force })
    });
  },
  adminAdvanceRound() {
    return this.request('/api/admin/advance-round', { method: 'POST' });
  },
  adminCompleteSeason() {
    return this.request('/api/admin/complete-season', { method: 'POST' });
  },
  adminGetDisputes() {
    return this.request('/api/admin/disputes');
  },
  adminResolveDispute(matchId, action, homeScore, awayScore) {
    return this.request(`/api/admin/resolve-dispute/${matchId}`, {
      method: 'POST',
      body: JSON.stringify({ action, home_score: homeScore, away_score: awayScore })
    });
  },
  adminUpdateMatchScore(matchId, data) {
    return this.request(`/api/admin/matches/${matchId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
};

window.API = API;
