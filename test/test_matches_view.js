const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

function apiGet(endpoint) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${endpoint}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function testFrontendMatchesView() {
  console.log('🧪 === TESTING MATCHES VIEW & TAB SWITCHING ===\n');

  // 1. Check API /api/matches
  console.log('--- 1. Testing Backend /api/matches API ---');
  const apiRes = await apiGet('/api/matches');
  console.log(`Backend /api/matches status: ${apiRes.status}, count: ${apiRes.data?.matches?.length}`);
  if (apiRes.status !== 200 || !Array.isArray(apiRes.data?.matches)) {
    console.error('❌ /api/matches failed');
    process.exit(1);
  }
  console.log('✅ PASS: /api/matches returns valid matches list');

  // 2. Evaluate matches.js in a mock browser window context
  console.log('\n--- 2. Evaluating public/js/views/matches.js in VM window context ---');
  const matchesJsPath = path.join(__dirname, '../public/js/views/matches.js');
  const matchesJsCode = fs.readFileSync(matchesJsPath, 'utf8');

  const mockWindow = {
    location: { search: '' },
    sessionStorage: {
      items: {},
      getItem(k) { return this.items[k] || null; },
      setItem(k, v) { this.items[k] = v; }
    },
    localStorage: {
      items: {},
      getItem(k) { return this.items[k] || null; },
      setItem(k, v) { this.items[k] = v; }
    },
    TelegramService: {
      haptic() {},
      getUser() { return { id: 10001, first_name: 'Shox' }; }
    },
    API: {
      getMatches: async () => apiRes.data,
      checkAdminAuth: async () => ({ isAdmin: false })
    },
    document: {
      addEventListener() {},
      getElementById(id) {
        return {
          innerHTML: '',
          value: '',
          style: {},
          classList: { add() {}, remove() {}, toggle() {} },
          appendChild() {},
          querySelectorAll() { return []; },
          addEventListener() {}
        };
      },
      querySelectorAll() { return []; },
      createElement() {
        return {
          innerHTML: '',
          style: {},
          classList: { add() {}, remove() {}, toggle() {} },
          appendChild() {},
          addEventListener() {}
        };
      }
    }
  };
  mockWindow.window = mockWindow;

  const context = vm.createContext(mockWindow);
  vm.runInContext(matchesJsCode, context);

  if (!mockWindow.MatchesView) {
    console.error('❌ FAIL: MatchesView was not exported to window!');
    process.exit(1);
  }
  console.log('✅ PASS: MatchesView successfully loaded into window object');

  // Verify essential methods exist
  const requiredMethods = ['render', 'loadMatches', 'selectRound', 'openMatchModal', 'saveAdminMatch', 'confirmResult', 'disputeResult', 'closeModal'];
  for (const m of requiredMethods) {
    if (typeof mockWindow.MatchesView[m] !== 'function') {
      console.error(`❌ FAIL: MatchesView.${m} is missing!`);
      process.exit(1);
    }
  }
  console.log('✅ PASS: All required MatchesView methods exist');

  // Test MatchesView.render
  const container = { innerHTML: '' };
  mockWindow.MatchesView.render(container);
  if (!container.innerHTML.includes('id="matchesList"')) {
    console.error('❌ FAIL: MatchesView.render did not populate container HTML');
    process.exit(1);
  }
  console.log('✅ PASS: MatchesView.render successfully generates Natija screen template');

  // 3. Test App navigation logic
  console.log('\n--- 3. Testing App.navigateTo for all 3 tabs (Jadval, Natija, Profil) ---');
  const appJsPath = path.join(__dirname, '../public/js/app.js');
  const appJsCode = fs.readFileSync(appJsPath, 'utf8');

  mockWindow.StandingsView = { render: (c) => { c.innerHTML = '<div id="standingsView">Jadval</div>'; } };
  mockWindow.ProfileView = { render: (c) => { c.innerHTML = '<div id="profileView">Profil</div>'; } };

  vm.runInContext(appJsCode, context);

  if (!mockWindow.App) {
    console.error('❌ FAIL: App was not exported to window!');
    process.exit(1);
  }

  // Simulate clicking 'matches' (Natija)
  mockWindow.App.navigateTo('matches');
  console.log(`Current view after navigating to matches: ${mockWindow.App.currentView}`);
  if (mockWindow.App.currentView !== 'matches') {
    console.error('❌ FAIL: App failed to switch to matches view');
    process.exit(1);
  }
  console.log('✅ PASS: Switched to Natija (matches) tab');

  // Simulate clicking 'standings' (Jadval)
  mockWindow.App.navigateTo('standings');
  console.log(`Current view after navigating to standings: ${mockWindow.App.currentView}`);
  if (mockWindow.App.currentView !== 'standings') {
    console.error('❌ FAIL: App failed to switch to standings view');
    process.exit(1);
  }
  console.log('✅ PASS: Switched to Jadval (standings) tab');

  // Simulate clicking 'profile' (Profil)
  mockWindow.App.navigateTo('profile');
  console.log(`Current view after navigating to profile: ${mockWindow.App.currentView}`);
  if (mockWindow.App.currentView !== 'profile') {
    console.error('❌ FAIL: App failed to switch to profile view');
    process.exit(1);
  }
  console.log('✅ PASS: Switched to Profil (profile) tab');

  // Switch back to matches (Natija)
  mockWindow.App.navigateTo('matches');
  const savedActive = mockWindow.sessionStorage.getItem('efootball_active_view');
  console.log(`sessionStorage efootball_active_view: ${savedActive}`);
  if (savedActive !== 'matches') {
    console.error('❌ FAIL: active view not persisted to sessionStorage');
    process.exit(1);
  }
  console.log('✅ PASS: Natija view persisted across page refreshes via sessionStorage');

  console.log('\n🎉 === ALL FRONTEND NAVIGATION CHECKS PASSED! ===\n');
}

testFrontendMatchesView().catch(e => {
  console.error(e);
  process.exit(1);
});
