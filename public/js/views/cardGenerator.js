/**
 * Match Result Graphic Card Generator (HTML5 Canvas)
 * Creates sleek eFootball-style shareable match posters
 */
const CardGenerator = {
  renderCard(match, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    // 1. Sporty Gradient Background
    const bgGrad = ctx.createRadialGradient(540, 540, 100, 540, 540, 750);
    bgGrad.addColorStop(0, '#101d36');
    bgGrad.addColorStop(0.5, '#090f1d');
    bgGrad.addColorStop(1, '#04070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    // 2. Subtle Pitch Pattern / Geometric Stadium lines
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.08)';
    ctx.lineWidth = 4;
    // Center circle
    ctx.beginPath();
    ctx.arc(540, 540, 240, 0, Math.PI * 2);
    ctx.stroke();

    // Center dividing line
    ctx.beginPath();
    ctx.moveTo(540, 0);
    ctx.lineTo(540, 1080);
    ctx.stroke();

    // Diagonal accents
    ctx.strokeStyle = 'rgba(0, 102, 255, 0.12)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 200);
    ctx.lineTo(1080, 880);
    ctx.moveTo(0, 880);
    ctx.lineTo(1080, 200);
    ctx.stroke();

    // 3. Top Banner: League Branding
    ctx.fillStyle = '#ccff00';
    ctx.font = 'bold 32px "Rajdhani", sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('⚽ eFOOTBALL O‘ZBEKISTON DO‘STLAR LIGASI', 540, 120);

    ctx.fillStyle = '#9cb1ce';
    ctx.font = '600 24px "Rajdhani", sans-serif';
    ctx.fillText(`${match.round}-TUR • RASMIY NATIJA`, 540, 165);

    // 4. Glow pill under title
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(420, 185, 240, 36, 18);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fill();

    ctx.fillStyle = '#ccff00';
    ctx.font = 'bold 18px "Rajdhani", sans-serif';
    ctx.fillText('MATCH COMPLETED', 540, 210);

    // 5. Teams & Players
    // Left (Home)
    const homeX = 270;
    const awayX = 810;
    const teamY = 440;

    // Home Badge Circle
    ctx.save();
    ctx.shadowColor = match.home_badge_color || '#00e5ff';
    ctx.shadowBlur = 25;
    ctx.fillStyle = match.home_badge_color || '#00e5ff';
    ctx.beginPath();
    ctx.arc(homeX, teamY - 100, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#04070e';
    ctx.font = 'bold 36px "Rajdhani", sans-serif';
    ctx.fillText((match.home_club_name || 'H').substring(0, 3).toUpperCase(), homeX, teamY - 88);

    // Home Team Names
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Rajdhani", sans-serif';
    ctx.fillText(match.home_player_name || 'Home', homeX, teamY + 40);

    ctx.fillStyle = '#00e5ff';
    ctx.font = '600 30px "Rajdhani", sans-serif';
    ctx.fillText(match.home_club_name || 'Klub', homeX, teamY + 80);

    // Away Badge Circle
    ctx.save();
    ctx.shadowColor = match.away_badge_color || '#ff3366';
    ctx.shadowBlur = 25;
    ctx.fillStyle = match.away_badge_color || '#ff3366';
    ctx.beginPath();
    ctx.arc(awayX, teamY - 100, 80, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#04070e';
    ctx.font = 'bold 36px "Rajdhani", sans-serif';
    ctx.fillText((match.away_club_name || 'A').substring(0, 3).toUpperCase(), awayX, teamY - 88);

    // Away Team Names
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Rajdhani", sans-serif';
    ctx.fillText(match.away_player_name || 'Away', awayX, teamY + 40);

    ctx.fillStyle = '#ff3366';
    ctx.font = '600 30px "Rajdhani", sans-serif';
    ctx.fillText(match.away_club_name || 'Klub', awayX, teamY + 80);

    // 6. Score Center
    const scoreY = teamY - 10;
    ctx.save();
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px "Rajdhani", sans-serif';
    ctx.fillText(`${match.home_score ?? 0} : ${match.away_score ?? 0}`, 540, scoreY);
    ctx.restore();

    // 7. Stats Box if available
    if (match.stats && (match.stats.possession || match.stats.shots)) {
      const boxY = 650;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(140, boxY, 800, 220, 20);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px "Rajdhani", sans-serif';
      ctx.fillText('UCHRASHUV STATISTIKASI', 540, boxY + 40);

      let rowY = boxY + 90;
      if (match.stats.possession) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Rajdhani", sans-serif';
        ctx.fillText(`${match.stats.possession[0]}%`, 260, rowY);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('To‘p nazorati', 540, rowY);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${match.stats.possession[1]}%`, 820, rowY);
        rowY += 45;
      }

      if (match.stats.shots) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 26px "Rajdhani", sans-serif';
        ctx.fillText(`${match.stats.shots[0]}`, 260, rowY);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Jami zarbalar', 540, rowY);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${match.stats.shots[1]}`, 820, rowY);
      }
    }

    // 8. Footer
    ctx.fillStyle = '#64748b';
    ctx.font = '500 22px "Rajdhani", sans-serif';
    ctx.fillText('Rasmiy Telegram Mini App orqali tasdiqlangan', 540, 1000);

    return canvas;
  },

  showModal(match) {
    const canvas = this.renderCard(match);
    const dataUrl = canvas.toDataURL('image/png');

    const modalHtml = `
      <div class="modal-overlay" id="cardModal">
        <div class="modal-dialog card-generator-dialog">
          <div class="modal-header">
            <h3>🎨 Natija kartasi</h3>
            <button class="close-btn" onclick="document.getElementById('cardModal').remove()">✕</button>
          </div>
          <div class="modal-body text-center">
            <div class="card-preview-wrap">
              <img src="${dataUrl}" alt="Match Card" class="generated-card-img" />
            </div>
            <div class="card-actions mt-3">
              <a href="${dataUrl}" download="efootball_match_${match.id}.png" class="btn btn-primary">
                📥 Yuklab olish (PNG)
              </a>
              <button class="btn btn-secondary ml-2" onclick="CardGenerator.shareCard('${dataUrl}', ${match.id})">
                📤 Telegram'da ulashish
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Remove existing if any
    const existing = document.getElementById('cardModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  shareCard(dataUrl, matchId) {
    if (navigator.share) {
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `efootball_match_${matchId}.png`, { type: 'image/png' });
          navigator.share({
            title: 'eFootball Natijasi',
            text: 'eFootball ligamizdagi uchrashuv natijasi!',
            files: [file]
          }).catch(() => {});
        });
    } else {
      // Fallback: copy link or open telegram
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent('eFootball uchrashuv natijasi tasdiqlandi!')}`;
      window.open(shareUrl, '_blank');
    }
  }
};

window.CardGenerator = CardGenerator;
