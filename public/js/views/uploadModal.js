/**
 * Screenshot Upload & AI/OCR Verification Modal
 */
const UploadModal = {
  currentMatchId: null,
  uploadedUrl: null,
  extractedStats: {},
  aiSummary: null,

  async openModal(matchId) {
    this.currentMatchId = matchId;
    this.uploadedUrl = null;
    this.extractedStats = {};
    this.aiSummary = null;

    let match = null;
    try {
      const res = await API.getMatch(matchId);
      match = res.match;
    } catch (e) {
      alert("Uchrashuv ma'lumotini yuklab bo'lmadi.");
      return;
    }

    const modalHtml = `
      <div class="modal-overlay" id="uploadResultModal">
        <div class="modal-dialog upload-result-dialog">
          <div class="modal-header">
            <h3>📸 O‘yin Skrinshotini Yuklash</h3>
            <button class="close-btn" onclick="UploadModal.close()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Match Header Info -->
            <div class="upload-match-info p-3 mb-3">
              <div class="text-xs text-muted font-bold">${match.round}-TUR UCHRASHUVI</div>
              <div class="d-flex justify-content-between align-items-center mt-2">
                <div class="d-flex align-items-center gap-2">
                  ${renderClubBadgeHtml(match.home_club_name, 32, match.home_badge_color)}
                  <div>
                    <span class="font-bold d-block">${match.home_player_name}</span>
                    <span class="text-xs text-cyan">${match.home_club_name}</span>
                  </div>
                </div>
                <span class="font-extrabold text-muted">VS</span>
                <div class="d-flex align-items-center gap-2 justify-content-end text-right">
                  <div>
                    <span class="font-bold d-block">${match.away_player_name}</span>
                    <span class="text-xs text-red">${match.away_club_name}</span>
                  </div>
                  ${renderClubBadgeHtml(match.away_club_name, 32, match.away_badge_color)}
                </div>
              </div>
            </div>

            <!-- Notice -->
            <div class="ocr-notice-pill mb-3">
              <span>ℹ️ eFootball o‘yini tugagach chiqqan <b>yakuniy hisob va statistika</b> ekrani skrinshotini yuklang. AI/OCR hisobni avtomatik o‘qiydi.</span>
            </div>

            <!-- Drop / File Upload Zone -->
            <div class="upload-dropzone" id="uploadDropzone" onclick="document.getElementById('screenshotFileInput').click()">
              <input type="file" id="screenshotFileInput" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="UploadModal.handleFileSelect(event)" />
              <div class="upload-drop-content" id="dropContent">
                <div class="upload-icon">📷</div>
                <div class="upload-text font-bold mt-2">Skrinshotni tanlang yoki tashlang</div>
                <div class="text-xs text-muted mt-1">PNG, JPG, WebP (maks. 10MB)</div>
              </div>
              <div class="upload-loading-content" id="loadingContent" style="display:none;">
                <div class="spinner"></div>
                <div class="font-bold mt-2 text-cyan">AI & OCR Skrinshotni o‘qimoqda...</div>
                <div class="text-xs text-muted mt-1">Hisob va statistikalar aniqlanmoqda...</div>
              </div>
            </div>

            <!-- OCR / Verification Result Area (Initially hidden) -->
            <div class="ocr-result-area mt-3" id="ocrResultArea" style="display:none;">
              <div class="ocr-preview-thumb-row d-flex gap-2 align-items-center mb-3">
                <img id="screenshotPreviewImg" class="ocr-preview-thumb" src="" alt="Screenshot" />
                <div>
                  <div class="text-sm font-bold text-green">✅ Skrinshot tahlil qilindi</div>
                  <div class="text-xs text-muted">Iltimos, aniqlangan hisobni tekshiring va tasdiqlang:</div>
                </div>
              </div>

              <!-- AI Summary Pill if detected -->
              <div id="aiSummaryBox" class="ai-summary-pill mb-3" style="display:none;">
                <span class="ai-spark-icon">✨ AI Tahlil:</span>
                <span class="ai-text" id="aiSummaryText"></span>
              </div>

              <!-- Score inputs for verification -->
              <div class="score-verify-card mb-3">
                <div class="d-flex justify-content-around align-items-center">
                  <div class="score-input-col text-center">
                    <label class="text-xs font-bold">${match.home_player_name}</label>
                    <input type="number" id="verifyHomeScore" class="form-control score-box-input" min="0" max="30" value="0" />
                  </div>
                  <span class="score-input-sep font-extrabold">:</span>
                  <div class="score-input-col text-center">
                    <label class="text-xs font-bold">${match.away_player_name}</label>
                    <input type="number" id="verifyAwayScore" class="form-control score-box-input" min="0" max="30" value="0" />
                  </div>
                </div>
              </div>

              <!-- Stats Accordion/Inputs -->
              <div class="stats-optional-box mb-3">
                <div class="text-xs text-muted font-bold mb-2">📊 Aniqlangan Statistika (Ixtiyoriy):</div>
                <div class="stats-inputs-grid">
                  <div class="d-flex justify-content-between align-items-center">
                    <span class="text-xs">To‘p nazorati (%):</span>
                    <div class="d-flex gap-1 align-items-center">
                      <input type="number" id="statPossH" class="form-control form-control-sm w-50px text-center" placeholder="50" />
                      <span>-</span>
                      <input type="number" id="statPossA" class="form-control form-control-sm w-50px text-center" placeholder="50" />
                    </div>
                  </div>
                  <div class="d-flex justify-content-between align-items-center mt-2">
                    <span class="text-xs">Zarbalar:</span>
                    <div class="d-flex gap-1 align-items-center">
                      <input type="number" id="statShotsH" class="form-control form-control-sm w-50px text-center" placeholder="0" />
                      <span>-</span>
                      <input type="number" id="statShotsA" class="form-control form-control-sm w-50px text-center" placeholder="0" />
                    </div>
                  </div>
                  <div class="d-flex justify-content-between align-items-center mt-2">
                    <span class="text-xs">Burchak zarbalari:</span>
                    <div class="d-flex gap-1 align-items-center">
                      <input type="number" id="statCornersH" class="form-control form-control-sm w-50px text-center" placeholder="0" />
                      <span>-</span>
                      <input type="number" id="statCornersA" class="form-control form-control-sm w-50px text-center" placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>

              <!-- Submit button -->
              <button class="btn btn-primary w-100 py-3 font-bold" id="submitResultBtn" onclick="UploadModal.submitVerifiedResult()">
                📤 Raqibga tasdiqlash uchun yuborish
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const existing = document.getElementById('uploadResultModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  async handleFileSelect(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const dropContent = document.getElementById('dropContent');
    const loadingContent = document.getElementById('loadingContent');
    const ocrArea = document.getElementById('ocrResultArea');

    dropContent.style.display = 'none';
    loadingContent.style.display = 'block';

    try {
      const res = await API.uploadScreenshot(this.currentMatchId, file);
      this.uploadedUrl = res.screenshotUrl;
      const analysis = res.analysis || {};

      loadingContent.style.display = 'none';
      dropContent.style.display = 'block';
      ocrArea.style.display = 'block';

      // Set preview image
      document.getElementById('screenshotPreviewImg').src = this.uploadedUrl;

      // Fill in detected scores if present
      if (analysis.homeScore !== null) {
        document.getElementById('verifyHomeScore').value = analysis.homeScore;
      }
      if (analysis.awayScore !== null) {
        document.getElementById('verifyAwayScore').value = analysis.awayScore;
      }

      // Fill in stats if present
      const stats = analysis.stats || {};
      this.extractedStats = stats;
      if (stats.possession) {
        document.getElementById('statPossH').value = stats.possession[0] || '';
        document.getElementById('statPossA').value = stats.possession[1] || '';
      }
      if (stats.shots) {
        document.getElementById('statShotsH').value = stats.shots[0] || '';
        document.getElementById('statShotsA').value = stats.shots[1] || '';
      }
      if (stats.corners) {
        document.getElementById('statCornersH').value = stats.corners[0] || '';
        document.getElementById('statCornersA').value = stats.corners[1] || '';
      }

      // Fill in AI summary if present
      if (analysis.aiSummary) {
        this.aiSummary = analysis.aiSummary;
        document.getElementById('aiSummaryText').textContent = analysis.aiSummary;
        document.getElementById('aiSummaryBox').style.display = 'block';
      }

      window.TelegramService?.haptic('success');
    } catch (err) {
      loadingContent.style.display = 'none';
      dropContent.style.display = 'block';
      alert(err.message || 'Skrinshotni yuklashda xatolik yuz berdi. Iltimos, qayta urinib ko‘ring yoki hisobni qo‘lda kiriting.');
      // Still show manual entry
      ocrArea.style.display = 'block';
    }
  },

  async submitVerifiedResult() {
    const homeScore = parseInt(document.getElementById('verifyHomeScore').value, 10);
    const awayScore = parseInt(document.getElementById('verifyAwayScore').value, 10);

    if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
      alert("Iltimos, hisobni to‘g‘ri raqamlarda kiriting.");
      return;
    }

    const btn = document.getElementById('submitResultBtn');
    btn.disabled = true;
    btn.textContent = "Yuborilmoqda...";

    // Collect stats
    const possH = parseInt(document.getElementById('statPossH').value, 10);
    const possA = parseInt(document.getElementById('statPossA').value, 10);
    const shotsH = parseInt(document.getElementById('statShotsH').value, 10);
    const shotsA = parseInt(document.getElementById('statShotsA').value, 10);
    const cornH = parseInt(document.getElementById('statCornersH').value, 10);
    const cornA = parseInt(document.getElementById('statCornersA').value, 10);

    const stats = {};
    if (!isNaN(possH) && !isNaN(possA)) stats.possession = [possH, possA];
    if (!isNaN(shotsH) && !isNaN(shotsA)) stats.shots = [shotsH, shotsA];
    if (!isNaN(cornH) && !isNaN(cornA)) stats.corners = [cornH, cornA];

    try {
      const res = await API.submitResult(this.currentMatchId, {
        home_score: homeScore,
        away_score: awayScore,
        screenshot_url: this.uploadedUrl,
        stats,
        ai_summary: this.aiSummary
      });

      window.TelegramService?.haptic('success');
      alert(res.message);
      this.close();
      App.refreshMatches();
    } catch (err) {
      window.TelegramService?.haptic('error');
      alert(err.message || 'Xatolik yuz berdi');
      btn.disabled = false;
      btn.textContent = "📤 Raqibga tasdiqlash uchun yuborish";
    }
  },

  close() {
    const modal = document.getElementById('uploadResultModal');
    if (modal) modal.remove();
  }
};

window.UploadModal = UploadModal;
