// ==========================================
// CONFIGURATIONS & GLOBAL STATES (N JEM Tipps v2.0)
// ==========================================
const SPORTSDB_KEY = "3"; 
let sb = null; 
let currentUser = null;
let currentTab = 'home';
let liveScores = {};
let mikeka = [];
let allMikeka = [];

// Post State Holders
let pMatches = [], pChecks = [false, false, false, false], kOn = false, kProb = 55;

const MARKETS = ['1X2','Double Chance','Draw No Bet','Over 0.5','Over 1.5','Over 2.5','Over 3.5','Over 4.5','Over 5.5','Under 0.5','Under 1.5','Under 2.5','Under 3.5','Under 4.5','Under 5.5','BTTS - Yes','BTTS - No','HT/FT','1st Half 1X2','Asian Handicap','European Handicap','Corners Over 9.5','Cards Over 3.5','Correct Score'];
const ROLES = { owner: '👑 Owner', analyst: '🔍 Analyst', viewer: '👁️ Viewer' };

const fmt = (n) => Math.round(Number(n)).toLocaleString();
const kelly = (odds, p) => { const b = odds - 1, q = 1 - p, k = (b * p - q) / b; return Math.min(Math.max(k * 0.25, 0), 0.2); };

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  // Key zako thabiti za Supabase zilizounganishwa rasmi
  const SUPABASE_URL = "https://mhmcvvfoylbnwqfwioys.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obWN2dmZveWxibndxZndpb3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Mzc3NDUsImV4cCI6MjA5NDUxMzc0NX0.DJx01EDheWCjpq2nkdK0aljTmf9irfTugPhn_fTXSWM";
  
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase failed to initialize.");
  }
  
  initApp();
});

// UTILITY FUNCTIONS
const el = (id) => document.getElementById(id);
const toast = (msg, type = 'info') => {
  const t = document.createElement('div');
  t.style = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid ${type==='err'?'var(--danger)':type==='warn'?'var(--warn)':'var(--accent)'};padding:.65rem 1.2rem;border-radius:20px;font-size:12px;font-weight:600;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

// 1. TANZANIA TIMEZONE CONVERSION
function convertToTanzaniaTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { displayTime: 'NS', displayDate: '' };
  try {
    const utcDateTime = new Date(`${dateStr}T${timeStr.trim().substring(0, 5)}Z`);
    if (isNaN(utcDateTime.getTime())) {
      return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
    }
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Dar_es_Salaam' };
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam' };
    
    return {
      displayTime: utcDateTime.toLocaleTimeString('en-GB', timeOptions),
      displayDate: utcDateTime.toLocaleDateString('en-GB', dateOptions).split('/').reverse().join('-')
    };
  } catch (err) {
    return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
  }
}

// 2. LIVE SCORES FETCHING WITH DUPLICATE PROTECTION
async function startLiveScores() {
  if (window.liveScoresInterval) clearInterval(window.liveScoresInterval);

  const fetchScores = async () => {
    if (!currentUser || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/latesteat.php`);
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      const newScores = {};

      (data.events || []).forEach(ev => {
        if (!ev.idEvent || !ev.strHomeTeam || !ev.strAwayTeam) return;
        const key = `${ev.strHomeTeam.toLowerCase().trim()} vs ${ev.strAwayTeam.toLowerCase().trim()}`;
        if (newScores[key]) return; // Ulinzi wa kutokurudia mechi

        let minute = ev.strProgress ? ev.strProgress + "'" : ev.strStatus || 'NS';
        if (ev.strStatus === 'HT') minute = "HT";
        if (ev.strStatus === 'ET') minute = "ET";

        const tzTime = convertToTanzaniaTime(ev.dateEvent, ev.strTime);

        newScores[key] = {
          home: ev.intHomeScore !== null ? parseInt(ev.intHomeScore) : '-',
          away: ev.intAwayScore !== null ? parseInt(ev.intAwayScore) : '-',
          homeTeam: ev.strHomeTeam, awayTeam: ev.strAwayTeam,
          minute, status: ev.strStatus || 'NS', league: ev.strLeague || '',
          time: tzTime.displayTime, date: tzTime.displayDate,
          isLive: ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(ev.strStatus),
          isFinished: ['FT', 'AET', 'PEN', 'FT_PEN'].includes(ev.strStatus)
        };
      });

      liveScores = newScores;
      if (['home', 'live', 'mikeka'].includes(currentTab)) renderTabContent();
    } catch (e) {
      console.warn('Live scores safe bypass:', e.message);
    }
  };

  await fetchScores();
  window.liveScoresInterval = setInterval(fetchScores, 45000);
}

// 3. DATABASE DATA LOAD
async function loadData() {
  try {
    if (!sb) return;
    const { data: all, error } = await sb.from('mikeka')
      .select('*, matches(*), users(name,role)')
      .order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    allMikeka = all || [];
    filterUserMikeka();
  } catch (err) {
    console.error("Error loading data from Supabase", err);
  }
}

function filterUserMikeka() {
  if (currentUser.role === 'owner' || currentUser.role === 'analyst') {
    mikeka = allMikeka;
  } else {
    mikeka = allMikeka.filter(m => m.user_id === currentUser.id);
  }
}

// 4. AUTHENTICATION (LOGIN & REGISTRATION)
async function initApp() {
  const session = localStorage.getItem('njem_session');
  const ls = el('loading-screen');
  if (ls) ls.style.display = 'none';

  if (session) {
    currentUser = JSON.parse(session);
    el('app').style.display = 'block';
    await loadData();
    startLiveScores();
    renderShell();
    showTab('home');
  } else {
    el('auth-screen').style.display = 'block';
    showAuthForm('login');
  }
}

function loginUser(user) {
  currentUser = user;
  localStorage.setItem('njem_session', JSON.stringify(user));
  el('auth-screen').style.display = 'none';
  el('app').style.display = 'block';
  loadData().then(() => {
    startLiveScores();
    renderShell();
    showTab('home');
  });
}

function showAuthForm(mode) {
  const f = el('auth-form');
  if (!f) return;

  if (mode === 'register') {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:12px;color:var(--accent)">📝 JISAJILI HAPA</div>
      <input class="inp" id="r-name" placeholder="Jina Kamili" type="text" style="margin-bottom:10px"/>
      <input class="inp" id="r-phone" placeholder="Namba ya Simu (Mfano: 0764674285)" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="r-pass" placeholder="Nenosiri" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="r-btn" style="margin-bottom:12px">Thibitisha Usajili ✓</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Tayari una akaunti? <span id="go-log" style="color:var(--accent);cursor:pointer;font-weight:600">Ingia hapa</span></p>
    `;
    el('go-log').onclick = () => showAuthForm('login');
    el('r-btn').onclick = async () => {
      const name = el('r-name').value.trim(), phone = el('r-phone').value.replace(/\D/g, ''), pass = el('r-pass').value;
      if (!name || !phone || !pass) return toast('Tafadhali jaza sehemu zote!', 'err');
      try {
        const { data, error } = await sb.from('users').insert([{ name, phone, role: 'viewer', bankroll: 0, password: pass }]).select().single();
        if (error) return toast('Namba hii tayari imeshasajiliwa!', 'err');
        toast('Usajili umekamilika! 🎉');
        setTimeout(() => loginUser(data), 600);
      } catch (e) { toast('Imeshindwa kuwasiliana na database.', 'err'); }
    };
  } else {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:12px;color:var(--accent)">🔑 INGIA MFUMONI</div>
      <input class="inp" id="l-phone" placeholder="Namba ya Simu" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="l-pass" placeholder="Nenosiri" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="l-btn" style="margin-bottom:12px">Ingia Sasa →</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Huna akaunti bado? <span id="go-reg" style="color:var(--accent);cursor:pointer;font-weight:600">Jisajili hapa</span></p>
    `;
    el('go-reg').onclick = () => showAuthForm('register');
    el('l-btn').onclick = async () => {
      const phone = el('l-phone').value.replace(/\D/g, ''), pass = el('l-pass').value;
      if (!phone || !pass) return toast('Jaza sehemu zote!', 'err');
      try {
        const { data, error } = await sb.from('users').select('*').eq('phone', phone).single();
        if (error || !data || data.password !== pass) return toast('Namba ya simu au password si sahihi!', 'err');
        loginUser(data);
      } catch (e) { toast('Hitilafu ya mtandao!', 'err'); }
    };
  }
}

// 5. THE SHELL NAVIGATION ENGINE
function renderShell() {
  const app = el('app');
  if (!app) return;
  
  const tabs = [
    { id: 'home', label: 'Home', icon: '🏠' },
    { id: 'live', label: 'Live', icon: '🔴' },
    { id: 'post', label: 'Mkeka+', icon: '➕' },
    { id: 'reports', label: 'Ripoti', icon: '📊' },
    { id: 'profile', label: 'Profile', icon: '👤' }
  ];

  app.innerHTML = `
    <div id="app-body" style="padding:1rem; padding-bottom:90px; max-width:500px; margin:0 auto;"></div>
    <nav class="bottom-nav" style="position:fixed; bottom:0; left:0; right:0; background:var(--surface); border-top:1px solid var(--border); display:flex; justify-content:space-around; padding:.75rem 0; z-index:9999;">
      ${tabs.map(t => `
        <button onclick="showTab('${t.id}')" id="nav-${t.id}" style="background:none; border:none; color:var(--muted); display:flex; flex-direction:column; align-items:center; cursor:pointer; font-size:11px; font-weight:600;">
          <span style="font-size:18px; margin-bottom:2px;">${t.icon}</span>
          <span>${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function showTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.bottom-nav button').forEach(b => b.style.color = 'var(--muted)');
  const activeBtn = el(`nav-${tabId}`);
  if (activeBtn) activeBtn.style.color = 'var(--accent)';
  renderTabContent();
}

// 6. DYNAMIC TAB RENDERING
function renderTabContent() {
  const body = el('app-body');
  if (!body) return;

  if (currentTab === 'home') {
    body.innerHTML = `
      <div style="margin-bottom:1.5rem">
        <div style="font-size:12px; color:var(--muted)">Mambo vipi,</div>
        <div style="font-family:'Syne',sans-serif; font-size:20px; font-weight:800; color:var(--text)">${currentUser.name}</div>
        <div style="font-size:13px; color:var(--accent); font-weight:700; margin-top:4px">Wallet: TZS ${fmt(currentUser.bankroll || 0)}</div>
      </div>
      <div style="font-family:'Syne',sans-serif; font-size:14px; font-weight:800; margin-bottom:10px; color:var(--accent)">📌 MIKEKA ILIYOPO</div>
      <div id="mikeka-list">Inapakia...</div>
    `;
    renderHomeMikeka();
  } 
  
  else if (currentTab === 'live') {
    let matchesHtml = '';
    Object.values(liveScores).forEach(m => {
      matchesHtml += `
        <div style="background:var(--surface); padding:1rem; border-radius:12px; margin-bottom:10px; border:1px solid var(--border)">
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:6px">
            <span>⚽ ${m.league}</span>
            <span style="color:var(--accent); font-weight:700">${m.minute}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:600; font-size:14px">
            <span>${m.homeTeam} vs ${m.awayTeam}</span>
            <span style="color:var(--accent)">${m.home} - ${m.away}</span>
          </div>
          <div style="font-size:11px; color:var(--muted); margin-top:6px">⏰ EAT (TZ Time): ${m.time} | Tarehe: ${m.date}</div>
        </div>
      `;
    });
    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:16px; font-weight:800; margin-bottom:12px; color:var(--accent)">🔴 LIVE SCORES (TANZANIA TIME)</div>
      ${matchesHtml || '<div style="text-align:center; padding:2rem; color:var(--muted)">Hakuna mechi za Live kwa sasa.</div>'}
    `;
  } 
  
  else if (currentTab === 'post') {
    // Kurudisha ule mfumo wako mzima wa kupost mkeka + kelly criterion analysis
    const tOdds = pMatches.reduce((p, m) => p * (parseFloat(m.odds) || 1), 1);
    const kF = kelly(tOdds, kProb / 100), kStake = Math.round((currentUser.bankroll || 0) * kF);

    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:17px; font-weight:800; margin-bottom:1rem">➕ Unda Mkeka Mpya</div>
      <div style="background:var(--surface); padding:1rem; border-radius:14px; border:1px solid var(--border); margin-bottom:1rem">
        <div style="font-size:12px; font-weight:700; color:var(--accent); margin-bottom:4px">📊 Kelly Criterion Analytics</div>
        <div style="font-size:13px; color:var(--text)">Odds Jumla: <span style="color:var(--accent)">${tOdds.toFixed(2)}x</span></div>
        <div style="font-size:13px; color:var(--text)">Kiwango cha Uwekezaji (Kelly Stake): <span style="color:var(--accent)">TZS ${fmt(kStake > 0 ? kStake : 2000)}</span></div>
      </div>
      
      <div style="margin-bottom:12px">
        <input class="inp" id="p-teams" placeholder="Mfano: Arsenal vs Chelsea" style="margin-bottom:8px"/>
        <select class="inp" id="p-market" style="margin-bottom:8px">
          ${MARKETS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <input class="inp" id="p-odds" placeholder="Odds mfano: 1.85" type="number" step="0.01"/>
        <button onclick="addMatchToSlip()" class="btn-primary" style="background:rgba(0,255,133,0.15); color:var(--accent); border:1px solid var(--accent); margin-top:8px">Ongeza Mechi Kwenye Slip</button>
      </div>

      <div style="margin-top:1rem">
        <div style="font-size:12px; font-weight:700; color:var(--muted); margin-bottom:6px">MECHI ZILIZOONGEZWA:</div>
        <div id="slip-matches"></div>
      </div>
    `;
    renderSlipMatches();
  } 
  
  else if (currentTab === 'reports') {
    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:16px; font-weight:800; margin-bottom:12px; color:var(--accent)">📊 RIPOTI NA STRATEGIES</div>
      <div style="background:var(--surface); padding:1rem; border-radius:12px; border:1px solid var(--border); margin-bottom:10px">
        <div style="font-weight:700; color:var(--text)">📈 System Rollover Tracker</div>
        <p style="font-size:12px; color:var(--muted); margin-top:4px">Inafuatilia ukuaji wa bankroll yako kulingana na uwekezaji makini wa algorithms.</p>
      </div>
      <div style="background:var(--surface); padding:1rem; border-radius:12px; border:1px solid var(--border)">
        <div style="font-weight:700; color:var(--text)">🔍 Market Advantage (Edge)</div>
        <p style="font-size:12px; color:var(--muted); margin-top:4px">Uchambuzi wa asilimia ya faida dhidi ya mabookmaker kwa kutumia vigezo vya Poisson.</p>
      </div>
    `;
  } 
  
  else if (currentTab === 'profile') {
    body.innerHTML = `
      <div style="text-align:center; padding:1.5rem 0">
        <div style="font-size:45px">👤</div>
        <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:800; margin-top:6px">${currentUser.name}</div>
        <div style="font-size:12px; color:var(--accent); font-weight:600; background:rgba(0,255,133,0.1); display:inline-block; padding:.2rem .6rem; border-radius:12px; margin-top:4px">${ROLES[currentUser.role] || 'Viewer'}</div>
      </div>
      <div style="background:var(--surface); border-radius:14px; border:1px solid var(--border); padding:0.5rem">
        <div style="padding:1rem; border-bottom:1px solid var(--border); font-size:14px; color:var(--text)">📞 Namba: ${currentUser.phone}</div>
        <div onclick="logout()" style="padding:1rem; font-size:14px; color:var(--danger); cursor:pointer; font-weight:700">🚪 Ondoka Kwenye Mfumo</div>
      </div>
    `;
  }
}

// 7. SUBSYSTEM RENDERING (HOME SLIPS & POST ITEMS)
function renderHomeMikeka() {
  const container = el('mikeka-list');
  if (!container) return;
  if (!mikeka.length) { container.innerHTML = '<div style="color:var(--muted); font-size:13px; text-align:center; padding:1.5rem">Hakuna mikeka inayopatikana.</div>'; return; }

  container.innerHTML = mikeka.map(m => `
    <div style="background:var(--surface); border:1px solid var(--border); padding:1rem; border-radius:14px; margin-bottom:12px">
      <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:8px">
        <span style="color:var(--muted)">Kupost: ${m.users?.name || 'Analyst'}</span>
        <span style="color:${m.status==='WON'?'var(--win)':m.status==='LOST'?'var(--danger)':'var(--warn)'}; font-weight:700">${m.status}</span>
      </div>
      <div style="font-size:14px; font-weight:600; margin-bottom:4px">Odds Jumla: ${m.total_odds || '1.80'}x</div>
    </div>
  `).join('');
}

function addMatchToSlip() {
  const teams = el('p-teams').value.trim(), market = el('p-market').value, odds = parseFloat(el('p-odds').value);
  if (!teams || !odds) return toast('Jaza timu na odds zote vizuri!', 'err');
  
  // Ulinzi wa mechi isijirudie ndani ya slip moja
  if (pMatches.some(m => m.teams.toLowerCase() === teams.toLowerCase())) {
    return toast('⚠️ Mechi hii tayari imo kwenye mkeka huu!', 'warn');
  }

  pMatches.push({ teams, market, odds });
  el('p-teams').value = ''; el('p-odds').value = '';
  toast('Mechi imeongezwa!');
  renderTabContent();
}

function renderSlipMatches() {
  const container = el('slip-matches');
  if (!container) return;
  if (!pMatches.length) { container.innerHTML = '<div style="color:var(--muted); font-size:12px">Slip ipo tupu.</div>'; return; }

  container.innerHTML = pMatches.map((m, i) => `
    <div style="display:flex; justify-content:space-between; font-size:13px; padding:.5rem; background:rgba(255,255,255,0.02); margin-bottom:4px; border-radius:6px">
      <span>${m.teams} (${m.market})</span>
      <span style="color:var(--accent); font-weight:700">${m.odds}x</span>
    </div>
  `).join('');
}

function logout() {
  if (window.liveScoresInterval) clearInterval(window.liveScoresInterval);
  localStorage.removeItem('njem_session');
  currentUser = null;
  el('app').style.display = 'none';
  el('auth-screen').style.display = 'block';
  showAuthForm('login');
  toast('Umetoka kwa usalama mfalme!');
      }
                                                                                                         
