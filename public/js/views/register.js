/**
 * Registration Modal Component
 * eFootball 2026 Mobile UI
 * Contains strictly:
 * 1. Tournament terms and rules.
 * 2. Mandatory agreement checkbox.
 * 3. Nickname input field (displayed in table).
 * 4. Submit button (disabled until checkbox is checked).
 */
const RegisterModal = {
  show() {
    this.close();

    const user = window.TelegramService?.getUser() || {};
    const defaultName = user.username || user.first_name || '';

    const modalHtml = `
      <div class="modal-overlay" id="registerModal" onclick="if(event.target===this) RegisterModal.close()">
        <div class="modal-dialog">
          <div class="modal-icon-wrap">
            <svg class="i" viewBox="0 0 24 24">
              <rect x="4" y="3" width="16" height="18" rx="2"/>
              <path d="M8 8h8M8 12h8M8 16h5"/>
            </svg>
          </div>

          <h3>Turnirga ro'yxatdan o'tish</h3>
          <p style="margin-bottom: 14px;">Qoidalarni o'qib chiqing va ishtirok etish uchun nickname kiriting.</p>

          <!-- 1. Turnir shartlari va qoidalari -->
          <div class="form-group">
            <label class="form-label">Turnir qoidalari:</label>
            <div class="rules-box" id="regRulesBox">
              1. O'yinlar eFootball Friend Match (do'stona o'yin) rejimida o'tkaziladi.<br>
              2. Har bir o'yin davomiyligi: 10 daqiqa, durang bo'lishi mumkin.<br>
              3. O'yin yakunlangach, hisob ko'ringan yakuniy skrinshotni Mini App orqali yuklash majburiy.<br>
              4. Natijani ikki o'yinchidan biri kiritadi, ikkinchisi esa tasdiqlaydi.<br>
              5. G'alaba uchun 3 ochko, durangga 1 ochko, mag'lubiyatga 0 ochko beriladi.<br>
              6. Halol va sportcha hurmat bilan o'ynang!
            </div>
          </div>

          <!-- Error Alert Box -->
          <div id="regErrorAlert" style="display:none; background: #fde8ed; color: var(--loss); padding: 10px 14px; border-radius: 10px; font-weight: 600; font-size: 13px; margin-bottom: 14px; text-align: left;"></div>

          <!-- Form -->
          <form id="regForm" onsubmit="RegisterModal.submit(event)">
            <!-- 3. Jadvalda ko'rinadigan nickname -->
            <div class="form-group">
              <label class="form-label" for="regNickname">Jadvalda ko'rinadigan Nickname:</label>
              <input 
                type="text" 
                id="regNickname" 
                class="form-control" 
                placeholder="Masalan: Shox, Ozod, Sardor..." 
                value="${this.escape(defaultName)}" 
                required 
                minlength="2" 
                maxlength="24"
                autocomplete="off"
              />
              <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 4px; text-align: left;">
                Ushbu nom turnir jadvalida va uchrashuvlarda ko'rinadi.
              </div>
            </div>

            <!-- 2. Majburiy rozilik katagi -->
            <label class="checkbox-wrap">
              <input type="checkbox" id="regRulesCheckbox" onchange="RegisterModal.onCheckChange(this)" />
              <span class="checkbox-label">
                Turnir shartlari va qoidalari bilan tanishdim, to'liq roziman.
              </span>
            </label>

            <!-- 4. Submit Button (Disabled until checked) -->
            <div style="display: flex; gap: 10px; margin-top: 10px;">
              <button type="submit" id="regSubmitBtn" class="pill on" style="flex: 1;" disabled>
                Ro'yxatdan o'tish
              </button>
              <button type="button" class="pill" onclick="RegisterModal.close()">
                Bekor qilish
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Asynchronously update rules from server if available
    API.getLeague().then(res => {
      if (res?.league?.rules) {
        const box = document.getElementById('regRulesBox');
        if (box) box.innerHTML = res.league.rules.replace(/\n/g, '<br>');
      }
    }).catch(() => {});
  },

  onCheckChange(checkbox) {
    const btn = document.getElementById('regSubmitBtn');
    if (btn) {
      btn.disabled = !checkbox.checked;
    }
  },

  close() {
    const m = document.getElementById('registerModal');
    if (m) {
      m.classList.add('closing');
      setTimeout(() => m.remove(), 180);
    }
  },

  async submit(e) {
    e.preventDefault();

    const nickInput = document.getElementById('regNickname');
    const checkbox = document.getElementById('regRulesCheckbox');
    const submitBtn = document.getElementById('regSubmitBtn');

    if (!checkbox || !checkbox.checked) {
      this.showError("Turnirda qatnashish uchun qoidalarga rozilik bildirish shart.");
      return;
    }

    const nickname = nickInput?.value?.trim();
    if (!nickname || nickname.length < 2) {
      this.showError("Nickname kamida 2 ta belgidan iborat bo'lishi shart.");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Yuborilmoqda...";

    try {
      const res = await API.register({
        nickname: nickname,
        rules_accepted: true
      });

      try { window.TelegramService?.haptic('success'); } catch (e) {}
      
      if (res.participant && window.App) {
        window.App.currentUser = res.participant;
        try { localStorage.setItem('efootball_current_user', JSON.stringify(res.participant)); } catch(e) {}
        window.App.renderHeaderUser();
      }

      this.close();

      if (window.App) {
        await App.checkUserRegistration();
        App.refreshStandings();
        App.navigateTo('standings');
      }

      alert(res.message || "Muvaffaqiyatli ro'yxatdan o'tdingiz!");
    } catch (err) {
      try { window.TelegramService?.haptic('error'); } catch (e) {}
      submitBtn.disabled = false;
      submitBtn.textContent = "Ro'yxatdan o'tish";
      this.showError(err.message || "Ro'yxatdan o'tishda xatolik yuz berdi");
    }
  },

  showError(msg) {
    const alertBox = document.getElementById('regErrorAlert');
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.style.display = 'block';
    } else {
      alert(msg);
    }
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.RegisterModal = RegisterModal;
