const fs = require('fs');
const path = require('path');
const config = require('../config');

let Tesseract = null;
try {
  Tesseract = require('tesseract.js');
} catch (err) {
  console.warn('tesseract.js yuklanmadi, zaxira regex tahlil ishlatiladi.');
}

/**
 * Analyze an eFootball screenshot using Gemini Vision API if key is available,
 * or local Tesseract OCR + smart regex parsing.
 *
 * @param {string} imagePath - Absolute path to the uploaded screenshot
 * @param {object} context - { homePlayer, awayPlayer, homeClub, awayClub }
 * @returns {Promise<object>} Parsed match statistics and AI summary
 */
async function analyzeMatchScreenshot(imagePath, context = {}) {
  // 1. Try Gemini Vision API if configured
  if (config.geminiApiKey) {
    try {
      const geminiResult = await analyzeWithGemini(imagePath, context);
      if (geminiResult && geminiResult.success) {
        return geminiResult;
      }
    } catch (err) {
      console.error('Gemini Vision API xatoligi:', err.message);
    }
  }

  // 2. Fallback to Local Tesseract OCR
  if (Tesseract) {
    try {
      const tesseractResult = await analyzeWithTesseract(imagePath, context);
      return tesseractResult;
    } catch (err) {
      console.error('Tesseract OCR xatoligi:', err.message);
    }
  }

  // 3. If neither worked or file unreadable
  return {
    success: false,
    extracted: null,
    aiSummary: null,
    allowManual: true,
    error: "Skrinshotdan ma'lumotlarni avtomatik aniqlab bo'lmadi. Rasm xira yoki eFootball statistika ekrani emas bo'lishi mumkin. Natijani qo'lda tekshirib kiritishingiz mumkin."
  };
}

/**
 * Call Gemini Vision API directly via fetch
 */
async function analyzeWithGemini(imagePath, context) {
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  const prompt = `
Siz eFootball o'yini uchrashuv natijasi va statistika skrinshotlarini aniq o'qiydigan tahlilchisiz.
Ushbu rasm eFootball o'yini yakunidagi "Match Stats" (Statistika) ekranidir.

Uchrashuv ishtirokchilari:
- 1-jamoa (Home): ${context.homeClub || '1-Klub'} (${context.homePlayer || '1-O\'yinchi'})
- 2-jamoa (Away): ${context.awayClub || '2-Klub'} (${context.awayPlayer || '2-O\'yinchi'})

QOIDALAR:
1. Rasmda ko'rsatilgan yakuniy hisobni aniq o'qing (masalan: 2 - 1).
2. Quyidagi statistikalarni faqat rasmda aniq ko'rinib turgan bo'lsa o'qing (topilmasa null qiling):
   - To'p nazorati (Possession %): masalan 58 va 42
   - Jami zarbalar (Total Shots): masalan 8 va 5
   - Darvozaga aniq zarbalar (Shots on target): masalan 5 va 2
   - Burchak zarbalari (Corners): masalan 4 va 1
3. HECH QACHON mavjud bo'lmagan ma'lumotni to'qib chiqarmang.
4. O'zbek tilida FAQAT aniqlangan raqamlarga asoslangan 1-2 jumlalik qisqa xulosa bering (masalan: "Real Madrid to'p nazorati (58%) va darvozaga aniq zarbalar bo'yicha ustunlik qildi.").

Javobni FAQAT quyidagi JSON formatida qaytaring, boshqa hech qanday so'z yoki markdown belgisi qo'shmang:
{
  "homeScore": 2,
  "awayScore": 1,
  "stats": {
    "possession": [58, 42],
    "shots": [8, 5],
    "shotsOnTarget": [5, 2],
    "corners": [4, 1]
  },
  "aiSummary": "Real Madrid to'p nazorati (58%) va darvozaga aniq zarbalar bo'yicha ustunlik qildi.",
  "confidence": 0.95
}
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.geminiApiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64Image } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        response_mime_type: "application/json"
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini bo\'sh javob qaytardi');

  const parsed = JSON.parse(rawText.trim());

  return {
    success: true,
    engine: 'gemini-vision',
    extracted: {
      homeScore: Number.isInteger(parsed.homeScore) ? parsed.homeScore : null,
      awayScore: Number.isInteger(parsed.awayScore) ? parsed.awayScore : null,
      stats: parsed.stats || {}
    },
    aiSummary: parsed.aiSummary || generateStatsSummary(parsed.stats, parsed.homeScore, parsed.awayScore, context),
    allowManual: true
  };
}

/**
 * Local OCR with Tesseract and regex parser
 */
async function analyzeWithTesseract(imagePath, context) {
  const { data: { text } } = await Tesseract.recognize(imagePath, 'eng');
  
  if (!text || text.trim().length < 5) {
    return {
      success: false,
      extracted: null,
      allowManual: true,
      error: "Skrinshotdagi yozuvlarni o'qib bo'lmadi. Iltimos, eFootball o'yin tugagandagi statistika ekranini to'liq yuklang."
    };
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let homeScore = null;
  let awayScore = null;
  const stats = {};

  // Score pattern: "2 - 1", "3 : 0", or isolated "2 1" near the top
  const scoreRegex = /(?:^|\s)(\d{1,2})\s*[-:–]\s*(\d{1,2})(?:$|\s)/;
  for (const line of lines) {
    const match = line.match(scoreRegex);
    if (match) {
      const h = parseInt(match[1], 10);
      const a = parseInt(match[2], 10);
      if (h <= 20 && a <= 20) {
        homeScore = h;
        awayScore = a;
        break;
      }
    }
  }

  // Possession pattern: e.g. "55% 45%" or "Possession 55 45"
  const possRegex = /(\d{2})%?\s*(?:possession|to'?p nazorati)?\s*(\d{2})%?/i;
  // Shots pattern: "Shots 8 5"
  const shotsRegex = /shots?\s*(\d{1,2})\s+(\d{1,2})/i;
  // Corners pattern: "Corners 4 2"
  const cornersRegex = /corners?\s*(\d{1,2})\s+(\d{1,2})/i;

  for (const line of lines) {
    if (!stats.possession && possRegex.test(line)) {
      const m = line.match(possRegex);
      stats.possession = [parseInt(m[1], 10), parseInt(m[2], 10)];
    }
    if (!stats.shots && shotsRegex.test(line)) {
      const m = line.match(shotsRegex);
      stats.shots = [parseInt(m[1], 10), parseInt(m[2], 10)];
    }
    if (!stats.corners && cornersRegex.test(line)) {
      const m = line.match(cornersRegex);
      stats.corners = [parseInt(m[1], 10), parseInt(m[2], 10)];
    }
  }

  const summary = generateStatsSummary(stats, homeScore, awayScore, context);

  return {
    success: homeScore !== null && awayScore !== null,
    engine: 'local-ocr',
    rawTextPreview: text.substring(0, 200),
    extracted: {
      homeScore,
      awayScore,
      stats
    },
    aiSummary: summary,
    allowManual: true
  };
}

/**
 * Generate a strict, hallucination-free summary based ONLY on verified extracted statistics
 */
function generateStatsSummary(stats, homeScore, awayScore, context) {
  const home = context.homeClub || context.homePlayer || '1-jamoa';
  const away = context.awayClub || context.awayPlayer || '2-jamoa';

  if (!stats || Object.keys(stats).length === 0) {
    if (homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) {
        return `${home} uchrashuvda ${homeScore}-${awayScore} hisobida g'alaba qozondi.`;
      } else if (homeScore < awayScore) {
        return `${away} mehmonda ${awayScore}-${homeScore} hisobida g'alabaga erishdi.`;
      } else {
        return `Uchrashuv ${homeScore}-${awayScore} durang natijasi bilan yakunlandi.`;
      }
    }
    return null;
  }

  const parts = [];

  if (stats.possession && stats.possession.length === 2) {
    const [hP, aP] = stats.possession;
    if (Math.abs(hP - aP) >= 6) {
      const leader = hP > aP ? home : away;
      const higher = Math.max(hP, aP);
      parts.push(`${leader} to'p nazorati bo'yicha ustunlik qildi (${higher}%)`);
    } else {
      parts.push(`To'p nazorati teng kurashlar ostida kechdi (${hP}% - ${aP}%)`);
    }
  }

  if (stats.shots && stats.shots.length === 2) {
    const [hS, aS] = stats.shots;
    if (hS !== aS) {
      const shotLeader = hS > aS ? home : away;
      parts.push(`${shotLeader} darvoza tomon ko'proq zarba berdi (${Math.max(hS, aS)} ta)`);
    }
  }

  if (parts.length > 0) {
    return parts.join(', biroq ') + '.';
  }

  return null;
}

module.exports = {
  analyzeMatchScreenshot
};
