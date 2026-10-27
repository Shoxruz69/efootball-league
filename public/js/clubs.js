/**
 * Curated list of popular eFootball 2026 partner and licensed clubs
 * with authentic SVG crests, colors, and fallbacks.
 */
const EFOOTBALL_CLUBS = [
  { id: 'bar', name: 'Barcelona', short: 'FCB', logo: 'barcelona.svg', primaryColor: '#004d98', accentColor: '#a50044', bgGradient: 'linear-gradient(135deg, #004d98, #a50044)' },
  { id: 'rm', name: 'Real Madrid', short: 'RMA', logo: 'realmadrid.svg', primaryColor: '#ffffff', accentColor: '#febe10', bgGradient: 'linear-gradient(135deg, #1b264f, #27408b)' },
  { id: 'mun', name: 'Manchester United', short: 'MUN', logo: 'manunited.svg', primaryColor: '#da291c', accentColor: '#ffe500', bgGradient: 'linear-gradient(135deg, #da291c, #000000)' },
  { id: 'ars', name: 'Arsenal', short: 'ARS', logo: 'arsenal.svg', primaryColor: '#ef0107', accentColor: '#063672', bgGradient: 'linear-gradient(135deg, #ef0107, #9c824a)' },
  { id: 'bay', name: 'Bayern Munich', short: 'BAY', logo: 'bayern.svg', primaryColor: '#dc052d', accentColor: '#0066b2', bgGradient: 'linear-gradient(135deg, #dc052d, #0066b2)' },
  { id: 'int', name: 'Inter Milan', short: 'INT', logo: 'inter.svg', primaryColor: '#010e80', accentColor: '#001428', bgGradient: 'linear-gradient(135deg, #010e80, #00e5ff)' },
  { id: 'acm', name: 'AC Milan', short: 'ACM', logo: 'acmilan.svg', primaryColor: '#fb090b', accentColor: '#000000', bgGradient: 'linear-gradient(135deg, #fb090b, #000000)' },
  { id: 'mci', name: 'Manchester City', short: 'MCI', logo: 'mancity.svg', primaryColor: '#6cabdd', accentColor: '#1c2c5b', bgGradient: 'linear-gradient(135deg, #6cabdd, #1c2c5b)' },
  { id: 'liv', name: 'Liverpool', short: 'LIV', logo: 'liverpool.svg', primaryColor: '#c8102e', accentColor: '#00b2a9', bgGradient: 'linear-gradient(135deg, #c8102e, #00b2a9)' },
  { id: 'psg', name: 'Paris Saint-Germain', short: 'PSG', logo: 'psg.svg', primaryColor: '#004170', accentColor: '#da291c', bgGradient: 'linear-gradient(135deg, #004170, #da291c)' },
  { id: 'juv', name: 'Juventus', short: 'JUV', logo: 'juventus.svg', primaryColor: '#ffffff', accentColor: '#000000', bgGradient: 'linear-gradient(135deg, #222222, #000000)' },
  { id: 'che', name: 'Chelsea', short: 'CHE', logo: 'chelsea.svg', primaryColor: '#034694', accentColor: '#dba111', bgGradient: 'linear-gradient(135deg, #034694, #0b2240)' },
  { id: 'bvb', name: 'Borussia Dortmund', short: 'BVB', logo: 'dortmund.svg', primaryColor: '#fde100', accentColor: '#000000', bgGradient: 'linear-gradient(135deg, #fde100, #000000)' },
  { id: 'atm', name: 'Atletico Madrid', short: 'ATM', logo: 'atletico.svg', primaryColor: '#cb3524', accentColor: '#272e61', bgGradient: 'linear-gradient(135deg, #cb3524, #272e61)' },
  { id: 'nap', name: 'Napoli', short: 'NAP', logo: 'napoli.svg', primaryColor: '#12a0d7', accentColor: '#ffffff', bgGradient: 'linear-gradient(135deg, #12a0d7, #083c6c)' },
  { id: 'uzb', name: 'O‘zbekiston MTJ', short: 'UZB', logo: 'uzbekistan.svg', primaryColor: '#0099b8', accentColor: '#ffffff', bgGradient: 'linear-gradient(135deg, #0099b8, #1eb53a)' },
  { id: 'pak', name: 'Paxtakor', short: 'PAK', logo: 'pakhtakor.svg', primaryColor: '#003399', accentColor: '#ffcc00', bgGradient: 'linear-gradient(135deg, #003399, #ffcc00)' },
  { id: 'nas', name: 'Nasaf', short: 'NAS', logo: 'nasaf.svg', primaryColor: '#da291c', accentColor: '#003399', bgGradient: 'linear-gradient(135deg, #da291c, #003399)' }
];

/**
 * Find club data by name
 */
function getClubBadge(clubName) {
  if (!clubName) {
    return {
      id: 'custom',
      name: 'Klub',
      short: 'FC',
      logo: 'generic_crest.svg',
      primaryColor: '#00f0ff',
      accentColor: '#0066ff'
    };
  }

  const clean = clubName.trim().toLowerCase();
  const found = EFOOTBALL_CLUBS.find(c => 
    c.name.toLowerCase() === clean || 
    c.name.toLowerCase().includes(clean) || 
    clean.includes(c.name.toLowerCase()) ||
    c.short.toLowerCase() === clean
  );

  if (found) return found;

  return {
    id: 'custom',
    name: clubName,
    short: clubName.substring(0, 3).toUpperCase(),
    logo: 'generic_crest.svg',
    primaryColor: '#00f0ff',
    accentColor: '#0066ff'
  };
}

/**
 * Generate HTML string for club crest logo with automatic fallback
 */
function renderClubBadgeHtml(clubName, size = 34, customColor = null) {
  const club = getClubBadge(clubName);
  const color = customColor || club.primaryColor || '#00f0ff';
  const logoUrl = `assets/clubs/${club.logo || 'generic_crest.svg'}`;

  return `
    <div class="club-crest-container" style="width: ${size}px; height: ${size}px;">
      <img 
        src="${logoUrl}" 
        alt="${club.name}" 
        class="club-crest-img"
        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
      />
      <div class="club-circle-badge club-crest-fallback" style="display: none; background: ${color}; width: ${size}px; height: ${size}px;">
        ${club.short}
      </div>
    </div>
  `;
}

window.EFOOTBALL_CLUBS = EFOOTBALL_CLUBS;
window.getClubBadge = getClubBadge;
window.renderClubBadgeHtml = renderClubBadgeHtml;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { EFOOTBALL_CLUBS, getClubBadge, renderClubBadgeHtml };
}

