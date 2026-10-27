/**
 * Admin Panel Component (Liga boshqaruvi, nizolar, qur'a)
 * eFootball 2026 Mobile UI
 * Features:
 * - Strict auth check via API.checkAdminAuth() before rendering
 * - Non-admins receive access denied message
 * - Clean white cards, Rubik font, no emojis, outline SVGs
 * - Taqvim & Qur'a tashlash (Round-Robin Berger generator)
 * - Nizoli uchrashuvlarni hal qilish (Finish yoki Reset)
 * - Ishtirokchilarni boshqarish (Asosiy tarkib va Kutish ro'yxati)
 * - Uchrashuv hisobini tahrirlash
 */
const AdminView = {
  async render(container) {
    container.innerHTML = `
      <section class="view-section">
        <div class="view-header">
          <div class="view-title-row">
            <svg class="i" viewBox="0 0 24 24">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <h1>Admin boshqaruvi</h1>
          </div>
          <p class="view-subtitle">Taqvim, ishtirokchilar va nizolarni boshqarish</p>
        </div>

        <div id="adminContent">
          <div style="padding: 32px 16px; text-align: center;">
            <div class="spinner"></div>
            <div style="color: var(--muted); font-size: 13px; font-weight: 500; margin-top: 8px;">
              Admin ruxsati tekshirilmoqda...
            </div>
          </div>
        </div>
      </section>
    `;

    await this.loadAdminData();
  },

  async loadAdminData() {
    const content = document.getElementById('adminContent');
    if (!content) return;

    try {
      // 1. Strict Server-side Auth Check
      const auth = await API.checkAdminAuth().catch(() => ({ isAdmin: false }));
      if (!auth.isAdmin) {
        content.innerHTML = `
          <div class="state-box" style="padding: 40px 16px; text-align: center;">
            <svg class="i" viewBox="0 0 24 24" style="stroke: var(--loss); width: 44px; height: 44px; margin-bottom: 12px;">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            <h3 style="color: var(--loss); font-size: 17px; margin-bottom: 6px;">Kirish taqiqlangan</h3>
            <p style="font-size: 13px; color: var(--muted); margin-bottom: 18px;">
              Ushbu bo‘lim faqat tasdiqlangan liga adminlari uchun mo‘ljallangan.
            </p>
            <button class="pill" onclick="App.navigateTo('standings')" type="button">
              Jadvalga qaytish
            </button>
          </div>
        `;
        return;
      }

      // 2. Fetch authenticated admin data
      const [leagueRes, participantsRes, disputesRes] = await Promise.all([
        API.getLeague().catch(() => ({ league: null })),
        API.getParticipants().catch(() => ({ active: [], waitlist: [] })),
        API.adminGetDisputes().catch(() => ({ disputes: [] }))
      ]);

      const league = leagueRes.league;
      const active = participantsRes.active || [];
      const waitlist = participantsRes.waitlist || [];
      const disputes = disputesRes.disputes || [];

      content.innerHTML = `
        <!-- Admin Status Card -->
        <div class="white-card" style="justify-content: space-between; padding: 12px 16px; margin-bottom: 14px; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2);">
          <div>
            <small style="color: var(--win); font-weight: 700;">ADMIN HOLATI</small>
            <b style="font-size: 14px; color: var(--row); display: flex; align-items: center; gap: 6px;">
              <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--win);"></span>
              Tasdiqlangan Admin
            </b>
          </div>
          <button class="pill" style="padding: 6px 14px; font-size: 12px; min-height: 32px;" onclick="AdminView.openWebLink()" type="button">
            Noutbuk web versiya
          </button>
        </div>

        <!-- Section 1: Quick Actions & Schedule Generator -->
        <div class="white-card" style="flex-direction: column; align-items: stretch; margin-bottom: 14px;">
          <div>
            <small>TAQVIM VA QUR'A</small>
            <b style="font-size: 17px;">Taqvim tuzish & Qur'a tashlash</b>
          </div>
          <p style="font-size: 13px; color: var(--text-secondary); margin: 6px 0 12px; line-height: 1.5;">
            Faol ishtirokchilar o'rtasida to'liq aylanma (round-robin) taqvimini tuzish. Juftliklar adolatli qur'a orqali bir marta tasodifiy tuziladi.
          </p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="pill on" onclick="AdminView.triggerDraw(false)" type="button" style="width: 100%;">
              Qur'a tashlash & Taqvim tuzish
            </button>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button class="pill" onclick="AdminView.advanceRound()" type="button" style="font-size: 13px;">
                Navbatdagi turga o'tish
              </button>
              <button class="pill" onclick="AdminView.completeSeason()" type="button" style="font-size: 13px; color: var(--win); border-color: rgba(16, 185, 129, 0.3);">
                Mavsumni yakunlash
              </button>
            </div>
            <button class="pill" onclick="AdminView.triggerDraw(true)" type="button" style="font-size: 12px; color: var(--loss); border-color: rgba(255, 77, 109, 0.3); margin-top: 4px;">
              Taqvimni qaytadan boshlash (Force)
            </button>
          </div>
        </div>

        <!-- Section 2: Disputed Matches Queue -->
        <div class="white-card" style="flex-direction: column; align-items: stretch; margin-bottom: 14px;">
          <div>
            <small>NIZOLI UCHRASHUVLAR</small>
            <b style="font-size: 17px;">E'tirozlar (${disputes.length})</b>
          </div>
          ${disputes.length === 0 ? `
            <div style="color: var(--text-secondary); font-size: 13px; padding: 10px 0;">
              Hozirda hech qanday nizoli uchrashuv yo'q.
            </div>
          ` : `
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
              ${disputes.map(d => `
                <div style="background: #f2f4f8; border-radius: 12px; padding: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 700; font-size: 14px;">${d.round}-Tur: ${this.escape(d.home_name)} vs ${this.escape(d.away_name)}</span>
                    <span class="status-pill status-submitted">Tekshiruvda</span>
                  </div>
                  <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 4px;">
                    Kiritilgan hisob: <b>${d.home_score} - ${d.away_score}</b>
                  </div>
                  <div style="font-size: 12px; color: #ff9800; margin-top: 3px;">
                    E'tiroz sababi: <i>${this.escape(d.dispute_reason || "Sabab ko'rsatilmagan")}</i>
                  </div>
                  <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button class="pill on" style="flex: 1; padding: 8px 12px; font-size: 13px; min-height: 38px;" onclick="AdminView.resolveDispute(${d.id}, 'finish', ${d.home_score}, ${d.away_score})" type="button">
                      Hisobni tasdiqlash
                    </button>
                    <button class="pill" style="padding: 8px 12px; font-size: 13px; min-height: 38px; color: var(--loss); border-color: rgba(255, 77, 109, 0.3);" onclick="AdminView.resolveDispute(${d.id}, 'reset')" type="button">
                      Qayta o'ynash
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Section 3: Participants Management -->
        <div class="white-card" style="flex-direction: column; align-items: stretch; margin-bottom: 14px;">
          <div>
            <small>ISHTIROKCHILAR</small>
            <b style="font-size: 17px;">Asosiy tarkib (${active.length}/${league?.participant_limit || 12})</b>
          </div>
          <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
            ${active.map(p => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eef2f8;">
                <div>
                  <span style="font-weight: 600; font-size: 14px;">${this.escape(p.player_name)}</span>
                  <span style="font-size: 12px; color: var(--text-secondary); margin-left: 6px;">@${this.escape(p.username || p.telegram_id)}</span>
                </div>
                <button class="pill" style="padding: 4px 10px; font-size: 12px; min-height: 28px; color: var(--loss); border-color: rgba(255, 77, 109, 0.3);" onclick="AdminView.removeParticipant(${p.id}, '${this.escape(p.player_name)}')" type="button">
                  Chiqarish
                </button>
              </div>
            `).join('')}
          </div>

          <!-- Waitlist Section -->
          <div style="margin-top: 14px;">
            <small>KUTISH RO'YXATI</small>
            <b style="font-size: 15px;">Zaxira navbati (${waitlist.length})</b>
            ${waitlist.length === 0 ? `
              <div style="font-size: 12.5px; color: var(--text-secondary); margin-top: 4px;">Kutish ro'yxatida hech kim yo'q.</div>
            ` : `
              <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 6px;">
                ${waitlist.map(w => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #eef2f8; font-size: 13px;">
                    <div>
                      <span style="font-weight: 700; color: var(--blue);">#${w.waitlist_order}</span>
                      <span style="font-weight: 600; margin-left: 6px;">${this.escape(w.player_name)}</span>
                    </div>
                    <span style="font-size: 11.5px; color: var(--cyan); font-weight: 600;">Navbatda</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <div class="center-btn-row">
          <button class="pill" onclick="App.navigateTo('standings')" type="button">
            Jadvalga qaytish
          </button>
        </div>
      `;

    } catch (err) {
      console.error("Admin ma'lumotini yuklashda xatolik:", err);
      content.innerHTML = `
        <div class="state-box">
          <h3 style="color: var(--loss);">Admin paneliga ulanib bo'lmadi</h3>
          <p>${this.escape(err.message || 'Ruxsat berilmadi')}</p>
          <button class="pill" onclick="AdminView.loadAdminData()" type="button">
            Qayta urinish
          </button>
        </div>
      `;
    }
  },

  openWebLink() {
    const webUrl = `${window.location.origin}/admin`;
    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(webUrl);
    } else {
      window.open(webUrl, '_blank');
    }
  },

  async triggerDraw(force = false) {
    if (force && !confirm("DIQQAT! Taqvimni qaytadan yangilasangiz, mavjud o'yinlar va natijalar o'chiriladi. Davom etasizmi?")) {
      return;
    }

    try {
      const res = await API.adminTriggerDraw(force);
      try { window.TelegramService?.haptic('success'); } catch (e) {}
      alert(res.message || "Taqvim muvaffaqiyatli tuzildi!");
      this.loadAdminData();
      if (window.App) {
        App.refreshStandings();
        App.refreshMatches();
      }
    } catch (err) {
      try { window.TelegramService?.haptic('error'); } catch (e) {}
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  async resolveDispute(matchId, action, h, a) {
    let homeScore = h;
    let awayScore = a;

    if (action === 'finish') {
      const newH = prompt("Tasdiqlanadigan Mezbon hisobini kiriting:", h !== undefined ? h : "0");
      if (newH === null) return;
      const newA = prompt("Tasdiqlanadigan Mehmon hisobini kiriting:", a !== undefined ? a : "0");
      if (newA === null) return;
      homeScore = parseInt(newH, 10);
      awayScore = parseInt(newA, 10);
    } else {
      if (!confirm("Uchrashuv natijasi bekor qilinib, qayta o'ynash uchun tiklanadi. Tasdiqlaysizmi?")) {
        return;
      }
    }

    try {
      const res = await API.adminResolveDispute(matchId, action, homeScore, awayScore);
      try { window.TelegramService?.haptic('success'); } catch (e) {}
      alert(res.message || "Nizo hal qilindi!");
      this.loadAdminData();
      if (window.App) {
        App.refreshStandings();
        App.refreshMatches();
      }
    } catch (err) {
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  async removeParticipant(id, name) {
    if (!confirm(`${name} ni turnirdan chiqarmoqchimisiz? Agar kutish ro'yxatida odam bo'lsa, u avtomatik ravishda qabul qilinadi.`)) {
      return;
    }

    try {
      const res = await API.leaveLeague(id);
      try { window.TelegramService?.haptic('success'); } catch (e) {}
      alert(res.message || "Ishtirokchi chiqarildi.");
      this.loadAdminData();
      if (window.App) App.refreshStandings();
    } catch (err) {
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  async advanceRound() {
    if (!confirm("Haqiqatan ham navbatdagi turga o'tmoqchimisiz?")) return;

    try {
      const res = await API.adminAdvanceRound();
      try { window.TelegramService?.haptic('success'); } catch (e) {}
      alert(res.message || "Navbatdagi turga o'tildi!");
      this.loadAdminData();
      if (window.App) App.refreshMatches();
    } catch (err) {
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  async completeSeason() {
    if (!confirm("Mavsumni rasman yakunlamoqchimisiz?")) return;

    try {
      const res = await API.adminCompleteSeason();
      try { window.TelegramService?.haptic('success'); } catch (e) {}
      alert(res.message || "Mavsum yakunlandi!");
      this.loadAdminData();
    } catch (err) {
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.AdminView = AdminView;
