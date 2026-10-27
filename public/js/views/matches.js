/**
 * Natija Kiritish (Matches & Result Entry View)
 * eFootball 2026 Mobile UI
 * Features:
 * - Round chips horizontal scroll (1-tur, 2-tur...)
 * - Selected chip: blue gradient with white text; unselected: black with cyan text
 * - Match cards: dark #1c1c22 rounded 16px, host - score - guest, Mezbon/Mehmon captions
 * - Pending score "-  :  -", confirmed score "3 - 1" large white
 * - Status pills: "Kutilmoqda" cyan on black, "Tasdiqlangan" green on black
 * - Locked match modal for third parties with lock SVG:
 *   "Uchrashuv tafsilotlari - Ushbu natijani faqat unda qatnashuvchi ikki o'yinchi kirita oladi."
 * - Card success animation (scale pulse + green glow, 600ms)
 * - Upload flow with skeleton shimmer/progress, success, and error retry states
 */
const MatchesView = {
  currentRound: null,
  allRounds: [],
  selectedFile: null,
  selectedFileUrl: null,
  uploadState: 'idle', // 'idle' | 'uploading' | 'success' | 'error'
  lastConfirmedMatchId: null,

  async render(container) {
    container.innerHTML = `
      <section class="view-section">
        <div class="view-header">
          <div class="view-title-row">
            <svg class="i" viewBox="0 0 24 24">
              <rect x="4" y="3" width="16" height="18" rx="2"/>
              <path d="M8 8h8M8 12h8M8 16h5"/>
            </svg>
            <h1>Natija kiritish</h1>
          </div>
          <p class="view-subtitle">Uchrashuvni tanlang va skrinshot yuboring</p>
        </div>

        <!-- Round Selector Chips -->
        <div class="chips-scroll-bar" id="roundChipsBar">
          <div style="color: var(--muted); font-size: 13px; padding: 6px;">Turlar yuklanmoqda...</div>
        </div>

        <!-- Matches List -->
        <div class="matches-list" id="matchesList">
          <div style="padding: 32px 16px; text-align: center;">
            <div class="spinner"></div>
            <div style="color: var(--muted); font-size: 13px; font-weight: 500; margin-top: 8px;">
              O'yinlar yuklanmoqda...
            </div>
          </div>
        </div>
      </section>
    `;

    await this.loadMatches();
  },

  async loadMatches() {
    const listContainer = document.getElementById('matchesList');
    const chipsBar = document.getElementById('roundChipsBar');

    try {
      const data = await API.getMatches();
      const matches = (data && Array.isArray(data.matches)) ? data.matches : [];
      const rounds = (data && Array.isArray(data.rounds)) ? data.rounds : [];

      this.allRounds = rounds;
      const currentUser = window.App?.currentUser;

      if (rounds.length === 0) {
        if (chipsBar) chipsBar.innerHTML = '';
        if (listContainer) {
          if (currentUser) {
            listContainer.innerHTML = `
              <div class="state-box">
                <svg class="i" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h3>Hali taqvim tuzilmagan</h3>
                <p>Siz turnirga muvaffaqiyatli qabul qilingansiz. Admin tomonidan taqvim/qur'a tuzilishi kutilmoqda.</p>
                <button class="pill on" onclick="MatchesView.loadMatches()" type="button">
                  Qayta tekshirish
                </button>
              </div>
            `;
          } else {
            listContainer.innerHTML = `
              <div class="state-box">
                <svg class="i" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <h3>Hali taqvim tuzilmagan</h3>
                <p>Turnirda qatnashish va o‘yinlaringizni ko‘rish uchun ro‘yxatdan o‘ting.</p>
                <button class="pill on" onclick="App.showRegisterModal()" type="button">
                  Ro'yxatdan o'tish
                </button>
              </div>
            `;
          }
        }
        return;
      }

      const numRounds = rounds.map(r => parseInt(r, 10));
      const curNum = parseInt(this.currentRound, 10);
      const activeRound = parseInt(data.currentRound, 10) || numRounds[0] || 1;
      this.activeCurrentRound = activeRound;
      this.allMatches = matches;

      if (!this.currentRound || !numRounds.includes(curNum)) {
        this.currentRound = activeRound;
      }

      // Render round chips with locked indicator
      if (chipsBar) {
        chipsBar.innerHTML = rounds.map(r => {
          const roundNum = parseInt(r, 10);
          const isSelected = roundNum === parseInt(this.currentRound, 10);
          const isLocked = roundNum > activeRound;
          return `
            <button 
              class="pill ${isSelected ? 'on' : ''}" 
              onclick="MatchesView.selectRound(${r})" 
              type="button"
              style="${isLocked && !isSelected ? 'opacity: 0.75;' : ''}"
            >
              ${r}-tur ${isLocked ? '🔒' : ''}
            </button>
          `;
        }).join('');
      }

      // Filter matches by current selected round
      const roundMatches = matches.filter(m => parseInt(m.round, 10) === parseInt(this.currentRound, 10));

      if (roundMatches.length === 0) {
        if (listContainer) {
          listContainer.innerHTML = `
            <div class="state-box">
              <h3>Bu turda o'yinlar yo'q</h3>
              <p>Boshqa turni tanlang yoki sahifani yangilang.</p>
              <button class="pill on" onclick="MatchesView.loadMatches()" type="button">
                Qayta yuklash
              </button>
            </div>
          `;
        }
        return;
      }

      const isCurrentRoundLocked = parseInt(this.currentRound, 10) > activeRound;
      const pendingInActiveRound = matches.filter(m => parseInt(m.round, 10) === activeRound && m.status !== 'finished');

      const myTgId = String(currentUser?.telegram_id || window.TelegramService?.getUser()?.id || '');
      const myParticipantId = currentUser?.id;

      if (listContainer) {
        const lockedBannerHtml = isCurrentRoundLocked ? `
          <div style="background: rgba(255, 187, 0, 0.08); border: 1px solid rgba(255, 187, 0, 0.25); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #ffbb00; font-size: 13px;">
              <span>🔒 ${this.currentRound}-tur qulflangan</span>
            </div>
            <div style="font-size: 12px; color: var(--muted); margin-top: 4px; line-height: 1.4;">
              Hozirgi <b>${activeRound}-tur</b>da hali <b>${pendingInActiveRound.length} ta</b> uchrashuv to'liq yakunlanmagan. Barcha o'yinlar tasdiqlangach, tizim keyingi turni avtomatik ochadi.
            </div>
          </div>
        ` : '';

        const cardsHtml = roundMatches.map((m, idx) => {
          const isHome = String(m.home_telegram_id) === myTgId || (myParticipantId && m.home_participant_id === myParticipantId);
          const isAway = String(m.away_telegram_id) === myTgId || (myParticipantId && m.away_participant_id === myParticipantId);
          const isMyMatch = Boolean(isHome || isAway);
          const isConfirmed = m.status === 'finished';
          const isSubmitted = m.status === 'submitted';
          const isDisputed = m.status === 'disputed';
          const hasScore = isConfirmed || isSubmitted;

          // Status Pill text and class
          let statusText = 'Kutilmoqda';
          let statusClass = '';
          if (isConfirmed) {
            statusText = 'Tasdiqlangan';
            statusClass = 'status-confirmed';
          } else if (isSubmitted) {
            statusText = 'Kiritildi';
            statusClass = 'status-submitted';
          } else if (isDisputed) {
            statusText = "E'tirozli";
            statusClass = 'status-disputed';
          }

          // Center Score
          let scoreText = '-  :  -';
          let scoreClass = '';
          if (hasScore && m.home_score !== null && m.away_score !== null) {
            scoreText = `${m.home_score} - ${m.away_score}`;
            scoreClass = 'score-final';
          }

          // Footer Action Hint
          let actionHint = "Tafsilot >";
          if (isConfirmed) {
            actionHint = "Ko'rish >";
          } else if (isCurrentRoundLocked) {
            actionHint = "Qulflangan 🔒";
          } else if (isMyMatch) {
            if (isSubmitted) {
              const uploaderIsHome = m.home_confirmed === 1;
              const iUploaded = (isHome && uploaderIsHome) || (isAway && !uploaderIsHome);
              actionHint = iUploaded ? "Kutilmoqda >" : "Tasdiqlang >";
            } else {
              actionHint = "Kiritish >";
            }
          }

          const hasScreenshot = Boolean(m.screenshot_url);
          const isJustConfirmed = this.lastConfirmedMatchId === m.id;

          // Staggered animation delay
          const animDelay = idx * 60;

          return `
            <button 
              class="match-card ${isJustConfirmed ? 'card-success-pulse' : ''}" 
              onclick="MatchesView.openMatchModal(${m.id})" 
              type="button"
              style="animation: viewFadeIn 280ms ease-out ${animDelay}ms both;"
            >
              <div class="match-header">
                <span class="match-round-text">${m.round}-tur</span>
                <span class="status-pill ${statusClass}">${statusText}</span>
              </div>

              <div class="match-body">
                <div class="match-team" style="text-align: left;">
                  <p>${this.escape(m.home_player_name || 'Mezbon')}</p>
                  <small>Mezbon${isHome ? ' (Siz)' : ''}</small>
                </div>

                <div class="match-score-badge ${scoreClass}">
                  ${scoreText}
                </div>

                <div class="match-team" style="text-align: right;">
                  <p>${this.escape(m.away_player_name || 'Mehmon')}</p>
                  <small>Mehmon${isAway ? ' (Siz)' : ''}</small>
                </div>
              </div>

              <div class="match-footer">
                <span>Skrinshot ${hasScreenshot ? 'yuklangan' : 'kutilmoqda'}</span>
                <i class="match-footer-action">${actionHint}</i>
              </div>
            </button>
          `;
        }).join('');

        listContainer.innerHTML = lockedBannerHtml + cardsHtml;
      }

    } catch (err) {
      console.error('Matches loading error:', err);
      if (listContainer) {
        listContainer.innerHTML = `
          <div class="state-box">
            <h3 style="color: var(--loss);">O'yinlarni yuklab bo'lmadi</h3>
            <p>${this.escape(err.message || 'Serverga ulanish xatosi')}</p>
            <button class="pill" onclick="MatchesView.loadMatches()" type="button">
              Qayta urinish
            </button>
          </div>
        `;
      }
    }
  },

  selectRound(roundNum) {
    this.currentRound = roundNum;
    try { window.TelegramService?.haptic('selection'); } catch (e) {}
    this.loadMatches();
  },

  async openMatchModal(matchId) {
    try { window.TelegramService?.haptic('selection'); } catch (e) {}
    this.selectedFile = null;
    this.selectedFileUrl = null;
    this.uploadState = 'idle';

    try {
      const res = await API.getMatch(matchId);
      const match = res.match;
      if (!match) return;

      const currentUser = window.App?.currentUser;
      const myTgId = String(currentUser?.telegram_id || window.TelegramService?.getUser()?.id || '');
      const myParticipantId = currentUser?.id;
      const isHome = String(match.home_telegram_id) === myTgId || (myParticipantId && match.home_participant_id === myParticipantId);
      const isAway = String(match.away_telegram_id) === myTgId || (myParticipantId && match.away_participant_id === myParticipantId);
      const isParticipant = Boolean(isHome || isAway);
      const myName = isHome ? match.home_player_name : match.away_player_name;
      const activeRound = this.activeCurrentRound || 1;
      const isRoundLocked = match.status !== 'finished' && parseInt(match.round, 10) > activeRound;

      let modalContent = '';

      // CASE 1: MATCH IS FINISHED (Viewable by everyone)
      if (match.status === 'finished') {
        modalContent = `
          <div class="modal-icon-wrap" style="color: var(--win); background: #e8fbf2;">
            <svg class="i" viewBox="0 0 24 24">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          </div>
          <h3>Uchrashuv yakunlangan</h3>
          <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
            ${match.round}-tur rasmiy natijasi
          </div>
          <div style="font-size: 32px; font-weight: 700; color: var(--text); letter-spacing: 2px; margin: 8px 0;">
            ${match.home_score} - ${match.away_score}
          </div>
          <p style="font-size: 14px; color: var(--text-secondary);">
            ${this.escape(match.home_player_name)} vs ${this.escape(match.away_player_name)}
          </p>
          ${match.screenshot_url ? `
            <div style="text-align: left; margin: 12px 0;">
              <label class="form-label">Yuklangan skrinshot:</label>
              <img src="${match.screenshot_url}" class="screenshot-preview-thumb" alt="Skrinshot" onclick="window.open('${this.escape(match.screenshot_url)}', '_blank')" />
            </div>
          ` : ''}
          <button class="pill on" onclick="MatchesView.closeModal()" type="button" style="width: 100%; margin-top: 10px;">
            Yopish
          </button>
        `;
      }
      // CASE 2: ROUND IS LOCKED (Current round has unfinished matches)
      else if (isRoundLocked) {
        const pendingMatches = (this.allMatches || []).filter(m => parseInt(m.round, 10) === activeRound && m.status !== 'finished');
        modalContent = `
          <div class="modal-icon-wrap" style="color: #ffbb00; background: rgba(255, 187, 0, 0.1);">
            <svg class="i" viewBox="0 0 24 24">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
          </div>
          <h3>Ushbu tur hali ochilmagan</h3>
          <p style="font-size: 13.5px; color: var(--muted); margin-bottom: 12px;">
            ${match.round}-turga natija kiritish yopiq. Hozirgi <b>${activeRound}-tur</b>dagi barcha o‘yinlar to'liq o'ynalib, tasdiqlangach tizim bu turni avtomatik ochadi.
          </p>
          <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 10px 12px; text-align: left; margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 700; color: #ffbb00; text-transform: uppercase; margin-bottom: 6px;">
              ${activeRound}-turda kutilayotgan uchrashuvlar (${pendingMatches.length} ta):
            </div>
            ${pendingMatches.length > 0 ? pendingMatches.map(pm => `
              <div style="font-size: 12.5px; color: #ffffff; padding: 4px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); display: flex; justify-content: space-between;">
                <span>• <b>${this.escape(pm.home_player_name)}</b> vs <b>${this.escape(pm.away_player_name)}</b></span>
                <span style="font-size: 11px; color: ${pm.status === 'submitted' ? '#ffbb00' : 'var(--muted)'};">
                  ${pm.status === 'submitted' ? 'Tasdiqlash kutilmoqda' : 'O\'ynalmagan'}
                </span>
              </div>
            `).join('') : '<div style="font-size: 12px; color: var(--muted);">Barcha o\'yinlar yakunlangan.</div>'}
          </div>
          <button class="pill on" onclick="MatchesView.closeModal()" type="button" style="width: 100%;">
            Tushundim
          </button>
        `;
      }
      // CASE 3: USER IS NOT ONE OF THE TWO PARTICIPANTS
      else if (!isParticipant) {
        modalContent = `
          <div class="modal-icon-wrap">
            <svg class="i" viewBox="0 0 24 24">
              <rect x="5" y="11" width="14" height="10" rx="2"/>
              <path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
          </div>
          <h3>Uchrashuv tafsilotlari</h3>
          <p>
            Ushbu natijani faqat unda qatnashuvchi ikki o'yinchi — <b>${this.escape(match.home_player_name)}</b> yoki <b>${this.escape(match.away_player_name)}</b> kirita oladi.
          </p>
          <button class="pill on" onclick="MatchesView.closeModal()" type="button" style="width: 100%; margin-top: 14px;">
            Yopish
          </button>
        `;
      }
      // CASE 4: MATCH IS SUBMITTED (AWAITING CONFIRMATION)
      else if (match.status === 'submitted') {
        const uploaderIsHome = match.home_confirmed === 1;
        const iAmUploader = (isHome && uploaderIsHome) || (isAway && !uploaderIsHome);

        if (iAmUploader) {
          modalContent = `
            <div class="modal-icon-wrap" style="color: #ff9800; background: #fff8eb;">
              <svg class="i" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <h3>Tasdiqlash kutilmoqda</h3>
            <div style="font-size: 30px; font-weight: 700; color: var(--text); margin: 6px 0;">
              ${match.home_score} - ${match.away_score}
            </div>
            <p>
              Siz kiritgan hisob yuborildi. Raqibingiz (<b>${this.escape(isHome ? match.away_player_name : match.home_player_name)}</b>) tasdiqlashi kutilmoqda.
            </p>
            ${match.screenshot_url ? `
              <div style="text-align: left; margin: 12px 0;">
                <label class="form-label">Yuklangan skrinshot:</label>
                <img src="${match.screenshot_url}" class="screenshot-preview-thumb" alt="Skrinshot" />
              </div>
            ` : ''}
            <button class="pill on" onclick="MatchesView.closeModal()" type="button" style="width: 100%;">
              Yopish
            </button>
          `;
        } else {
          // Opponent sees the result and can Confirm or Dispute
          modalContent = `
            <div class="modal-icon-wrap" style="color: var(--blue); background: #eef5ff;">
              <svg class="i" viewBox="0 0 24 24">
                <rect x="4" y="3" width="16" height="18" rx="2"/>
                <path d="M8 8h8M8 12h8M8 16h5"/>
              </svg>
            </div>
            <h3>Natijani tasdiqlash</h3>
            <div style="background: #f2f4f8; border-radius: 12px; padding: 12px; margin: 10px 0;">
              <div style="font-size: 12px; color: var(--text-secondary);">Raqib kiritgan hisob:</div>
              <div style="font-size: 32px; font-weight: 700; color: var(--text); letter-spacing: 2px; margin: 4px 0;">
                ${match.home_score} - ${match.away_score}
              </div>
              <div style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">
                ${this.escape(match.home_player_name)} vs ${this.escape(match.away_player_name)}
              </div>
            </div>
            ${match.screenshot_url ? `
              <div style="text-align: left; margin: 12px 0;">
                <label class="form-label">Raqib yuklagan skrinshot:</label>
                <img src="${match.screenshot_url}" class="screenshot-preview-thumb" alt="Skrinshot" />
              </div>
            ` : ''}
            <div style="display: flex; gap: 10px; margin-top: 16px;">
              <button class="pill on" onclick="MatchesView.confirmResult(${match.id})" id="confirmBtn_${match.id}" type="button" style="flex: 1;">
                Hisobni tasdiqlash
              </button>
              <button class="pill" onclick="MatchesView.disputeResult(${match.id})" type="button" style="color: var(--loss); border-color: rgba(255, 77, 109, 0.3);">
                E'tiroz
              </button>
            </div>
          `;
        }
      }
      // CASE 4: SCHEDULED / DISPUTED - SCORE ENTRY FORM
      else {
        modalContent = `
          <div class="modal-icon-wrap">
            <svg class="i" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </div>
          <h3>Natija kiritish</h3>
          <p style="margin-bottom: 12px;">
            ${this.escape(match.home_player_name)} <span style="color: var(--muted); font-size: 12px;">vs</span> ${this.escape(match.away_player_name)}<br>
            <span style="font-size: 12px; color: var(--blue); font-weight: 600;">
              Siz: ${this.escape(myName)} (${isHome ? 'Mezbon' : 'Mehmon'})
            </span>
          </p>

          <form id="matchEntryForm" onsubmit="MatchesView.submitResult(event, ${match.id}, ${isHome})">
            <!-- 1. Screenshot Upload with Dropzone / Shimmer -->
            <div class="form-group">
              <label class="form-label">1. O'yin skrinshoti (Majburiy):</label>
              <div class="upload-dropzone" id="uploadDropArea" onclick="document.getElementById('matchScreenshotFile').click()">
                <input 
                  type="file" 
                  id="matchScreenshotFile" 
                  accept="image/jpeg,image/png,image/webp" 
                  style="display:none;" 
                  required 
                  onchange="MatchesView.onFileSelect(event)" 
                />
                <div id="dropzoneContent">
                  <svg class="i" viewBox="0 0 24 24" style="width: 28px; height: 28px; color: var(--blue); margin-bottom: 6px;">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <div style="font-size: 13.5px; font-weight: 600; color: var(--text);">Skrinshotni tanlang</div>
                  <div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">JPG, PNG yoki WebP</div>
                </div>
                <div id="uploadLoadingArea" style="display:none; padding: 10px 0;">
                  <div class="spinner"></div>
                  <div style="font-size: 12px; color: var(--blue); font-weight: 600;">Skrinshot yuklanmoqda...</div>
                </div>
                <img id="filePreviewImg" class="screenshot-preview-thumb" style="display:none;" />
              </div>
            </div>

            <!-- 2. Goals Entry: Men urgan va Men o'tkazgan -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px;">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Men urgan gollar:</label>
                <input 
                  type="number" 
                  id="myGoalsInput" 
                  class="form-control" 
                  min="0" 
                  max="99" 
                  value="0" 
                  required 
                  oninput="MatchesView.updateLivePreview(${isHome}, '${this.escape(match.home_player_name)}', '${this.escape(match.away_player_name)}')"
                />
              </div>

              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Men o'tkazgan:</label>
                <input 
                  type="number" 
                  id="oppGoalsInput" 
                  class="form-control" 
                  min="0" 
                  max="99" 
                  value="0" 
                  required 
                  oninput="MatchesView.updateLivePreview(${isHome}, '${this.escape(match.home_player_name)}', '${this.escape(match.away_player_name)}')"
                />
              </div>
            </div>

            <!-- 3. Live Score Preview -->
            <div style="background: #f2f4f8; border-radius: 12px; padding: 10px; margin-bottom: 14px; text-align: center;">
              <div style="font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase;">
                Hisob ko'rinishi
              </div>
              <div style="font-size: 26px; font-weight: 700; color: var(--text); letter-spacing: 2px; margin: 2px 0;" id="liveScorePreview">
                0 - 0
              </div>
              <div style="font-size: 12px; color: var(--text-secondary);" id="liveTeamsPreview">
                ${this.escape(match.home_player_name)} (0) — (${match.away_player_name}) (0)
              </div>
            </div>

            <!-- Submit Button -->
            <button type="submit" id="submitResultBtn" class="pill on" style="width: 100%;">
              Natijani yuborish
            </button>
          </form>
        `;
      }

      const modalHtml = `
        <div class="modal-overlay" id="matchDetailModal" onclick="if(event.target===this) MatchesView.closeModal()">
          <div class="modal-dialog">
            ${modalContent}
          </div>
        </div>
      `;

      this.closeModal();
      document.body.insertAdjacentHTML('beforeend', modalHtml);

    } catch (err) {
      alert("Uchrashuv ma'lumotlarini yuklab bo'lmadi: " + (err.message || 'Xatolik'));
    }
  },

  onFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const previewImg = document.getElementById('filePreviewImg');
      const dropContent = document.getElementById('dropzoneContent');

      if (previewImg) {
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = 'block';
      }
      if (dropContent) {
        dropContent.style.display = 'none';
      }
    }
  },

  updateLivePreview(isHome, homeName, awayName) {
    const myG = parseInt(document.getElementById('myGoalsInput')?.value || '0', 10);
    const oppG = parseInt(document.getElementById('oppGoalsInput')?.value || '0', 10);

    const homeG = isHome ? myG : oppG;
    const awayG = isHome ? oppG : myG;

    const previewEl = document.getElementById('liveScorePreview');
    const teamsEl = document.getElementById('liveTeamsPreview');

    if (previewEl) previewEl.textContent = `${homeG} - ${awayG}`;
    if (teamsEl) teamsEl.textContent = `${homeName} (${homeG}) — (${awayG}) ${awayName}`;
  },

  async submitResult(event, matchId, isHome) {
    event.preventDefault();

    const fileInput = document.getElementById('matchScreenshotFile');
    const myGoals = parseInt(document.getElementById('myGoalsInput')?.value || '0', 10);
    const oppGoals = parseInt(document.getElementById('oppGoalsInput')?.value || '0', 10);
    const submitBtn = document.getElementById('submitResultBtn');
    const loadingArea = document.getElementById('uploadLoadingArea');
    const dropContent = document.getElementById('dropzoneContent');

    if (!fileInput || !fileInput.files[0]) {
      alert("Iltimos, o'yin skrinshotini tanlang (Majburiy).");
      return;
    }

    if (isNaN(myGoals) || isNaN(oppGoals) || myGoals < 0 || oppGoals < 0) {
      alert("Gollar sonini to'g'ri kiriting.");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Skrinshot yuklanmoqda...';
    }
    if (loadingArea) loadingArea.style.display = 'block';
    if (dropContent) dropContent.style.display = 'none';

    const homeScore = isHome ? myGoals : oppGoals;
    const awayScore = isHome ? oppGoals : myGoals;

    try {
      // 1. Upload screenshot
      const uploadRes = await API.uploadScreenshot(matchId, fileInput.files[0]);
      const screenshotUrl = uploadRes.screenshotUrl;

      if (submitBtn) submitBtn.textContent = 'Natija saqlanmoqda...';

      // 2. Submit score
      await API.submitResult(matchId, {
        home_score: homeScore,
        away_score: awayScore,
        screenshot_url: screenshotUrl
      });

      try { window.TelegramService?.haptic('success'); } catch (e) {}

      this.closeModal();
      await this.loadMatches();
      alert("Natija muvaffaqiyatli kiritildi! Raqib tasdiqlashi uchun yuborildi.");

    } catch (err) {
      try { window.TelegramService?.haptic('error'); } catch (e) {}
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Natijani yuborish';
      }
      if (loadingArea) loadingArea.style.display = 'none';
      alert(err.message || "Natijani yuborishda xatolik yuz berdi");
    }
  },

  async confirmResult(matchId) {
    const btn = document.getElementById(`confirmBtn_${matchId}`);
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Tasdiqlanmoqda...';
    }

    try {
      const res = await API.confirmResult(matchId);
      try { window.TelegramService?.haptic('success'); } catch (e) {}

      this.lastConfirmedMatchId = matchId;
      this.closeModal();
      await this.loadMatches();

      if (window.App) App.refreshStandings();
      alert(res.message || "Uchrashuv natijasi rasman tasdiqlandi!");

      // Clear pulse after 700ms
      setTimeout(() => {
        this.lastConfirmedMatchId = null;
      }, 700);

    } catch (err) {
      try { window.TelegramService?.haptic('error'); } catch (e) {}
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Hisobni tasdiqlash';
      }
      alert(err.message || "Tasdiqlashda xatolik");
    }
  },

  async disputeResult(matchId) {
    const reason = prompt("E'tiroz sababini kiriting (masalan: hisob noto'g'ri):", "");
    if (reason === null) return;

    try {
      const res = await API.disputeResult(matchId, reason.trim() || "Noma'lum e'tiroz");
      try { window.TelegramService?.haptic('warning'); } catch (e) {}
      this.closeModal();
      await this.loadMatches();
      alert(res.message || "E'tiroz qabul qilindi va adminga yuborildi.");
    } catch (err) {
      alert(err.message || "Xatolik yuz berdi");
    }
  },

  closeModal() {
    const modal = document.getElementById('matchDetailModal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => modal.remove(), 180);
    }
  },

  escape(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  }
};

window.MatchesView = MatchesView;
