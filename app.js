// ==========================================================================
// N JEM TIPPS v2.0 — ENGINE MAAIN (RESTORED ARCHITECTURE)
// ==========================================================================
const SPORTSDB_KEY = "3"; 
let sb = null; 
let currentUser = null;
let currentTab = 'home';
let liveScores = {};
let mikeka = [];
let allMikeka = [];
let realtimeChannel = null;

// Post State Holders (Kelly Criterion & Market Edge System)
let pMatches = [], pChecks = [false, false, false, false], kOn = false, kProb = 55;

const MARKETS = ['1X2','Double Chance','Draw No Bet','Over 0.5','Over 1.5','Over 2.5','Over 3.5','Over 4.5','Over 5.5','Under 0.5','Under 1.5','Under 2.5','Under 3.5','Under 4.5','Under 5.5','BTTS - Yes','BTTS - No','HT/FT','1st Half 1X2','1st Half Double Chance','1st Half Over 0.5','1st Half Over 1.5','1st Half Over 2.5','2nd Half Over 0.5','2nd Half Over 1.5','Asian Handicap','European Handicap','Corners Over 8.5','Corners Over 9.5','Corners Over 10.5','Cards Over 2.5','Cards Over 3.5','Cards Over 4.5','Correct Score','Anytime Scorer','Clean Sheet'];
const ROLES = { owner: '👑 Owner', analyst: '🔍 Analyst', viewer: '👁️ Viewer' };

const uid = () => crypto.randomUUID();
const today = () => new Date().toISOString().split('T')[0];
const fmt = (n) => Math.round(Number(n)).toLocaleString();
const clamp = (v,a,b) => Math.min(Math.max(v,a),b);
const kelly = (odds, p) => { const b = odds - 1, q = 1 - p, k = (b * p - q) / b; return Math.min(Math.max(k * 0.25, 0), 0.2); };

// INITIALIZATION WITH INTEGRATED PRODUCTION KEYS
document.addEventListener("DOMContentLoaded", () => {
  const SUPABASE_URL = "https://mhmcvvfoylbnwqfwioys.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obWN2dmZveWxibndxZndpb3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Mzc3NDUsImV4cCI6MjA5NDUxMzc0NX0.DJx01EDheWCjpq2nkdK0aljTmf9irfTugPhn_fTXSWM";
  
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase Client Critical failure initialization.");
  }
  initApp();
});

// CORE UTILITIES
const el = (id) => document.getElementById(id);
const toast = (msg, type = 'info') => {
  const t = document.createElement('div');
  t.style = `position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:var(--surface);border:1px solid ${type==='err'?'var(--danger)':type==='warn'?'var(--warn)':'var(--accent)'};padding:.65rem 1.2rem;border-radius:20px;font-size:12px;font-weight:600;z-index:10000;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

// 1. TANZANIA REALTIME TIMEZONE MANAGEMENT (EAT FIX)
function convertToTanzaniaTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { displayTime: 'NS', displayDate: '' };
  try {
    const utcDateTime = new Date(`${dateStr}T${timeStr.trim().substring(0, 5)}Z`);
    if (isNaN(utcDateTime.getTime())) return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
    
    const timeOpts = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Dar_es_Salaam' };
    const dateOpts = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam' };
    
    return {
      displayTime: utcDateTime.toLocaleTimeString('en-GB', timeOpts),
      displayDate: utcDateTime.toLocaleDateString('en-GB', dateOpts).split('/').reverse().join('-')
    };
  } catch (err) {
    return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
  }
}

// 2. LIVE SCORES FEED WITH ADVANCED DUPLICATE CONTROLS
async function startLiveScores() {
  if (window.liveScoresInterval) clearInterval(window.liveScoresInterval);

  const fetchScores = async () => {
    if (!currentUser || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/latesteat.php`);
      if (!res.ok) throw new Error("API Failure");
      const data = await res.json();
      const newScores = {};

      (data.events || []).forEach(ev => {
        if (!ev.idEvent || !ev.strHomeTeam || !ev.strAwayTeam) return;
        const key = `${ev.strHomeTeam.toLowerCase().trim()} vs ${ev.strAwayTeam.toLowerCase().trim()}`;
        if (newScores[key]) return; // Safeguard protection against identical entries

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
      await autoSettleMatches();
      if (['results', 'mikeka', 'home', 'live'].includes(currentTab)) renderTabContent();
    } catch (e) {
      console.warn('Live score silent recovery active:', e.message);
    }
  };

  await fetchScores();
  window.liveScoresInterval = setInterval(fetchScores, 45000);
}

// 3. AUTO-SETTLEMENT SUBSYSTEM
async function autoSettleMatches() {
  if (!currentUser || (currentUser.role !== 'owner' && currentUser.role !== 'analyst')) return;
  const pendingMikeka = allMikeka.filter(m => m.status === 'PENDING' && m.user_id === currentUser.id);
  
  for (const mk of pendingMikeka) {
    const matches = mk.matches || [];
    let needsUpdate = false;
    for (const match of matches) {
      if (match.outcome !== 'PENDING') continue;
      const score = findScore(match.teams);
      if (!score || !score.isFinished) continue;
      const outcome = determineOutcome(match, score);
      if (outcome) {
        await sb.from('matches').update({ outcome }).eq('id', match.id);
        match.outcome = outcome;
        needsUpdate = true;
      }
    }
    if (needsUpdate) {
      const { data: fresh } = await sb.from('matches').select('*').eq('mkeka_id', mk.id);
      const hasLoss = (fresh || []).some(m => m.outcome === 'LOSS');
      const pending = (fresh || []).filter(m => m.outcome === 'PENDING');
      if (hasLoss) {
        await sb.from('mikeka').update({ status: 'LOST' }).eq('id', mk.id);
      } else if (pending.length === 0) {
        await sb.from('mikeka').update({ status: 'WON' }).eq('id', mk.id);
      }
    }
  }
}

function findScore(teamsStr) {
  if (!teamsStr) return null;
  const key = teamsStr.toLowerCase().trim();
  return liveScores[key] || null;
}

function determineOutcome(match, score) {
  const h = parseInt(score.home), a = parseInt(score.away);
  if (isNaN(h) || isNaN(a)) return null;
  const pick = match.pick;
  if (match.market === '1X2') {
    if (pick === '1' && h > a) return 'WIN';
    if (pick === 'X' && h === a) return 'WIN';
    if (pick === '2' && a > h) return 'WIN';
    return 'LOSS';
  }
  if (match.market === 'Over 2.5') return (h + a) > 2.5 ? 'WIN' : 'LOSS';
  if (match.market === 'Under 2.5') return (h + a) < 2.5 ? 'WIN' : 'LOSS';
  return null;
}

// 4. DATABASE SYNC & PERSISTENCE
async function loadData() {
  try {
    if (!sb) return;
    const { data: all, error } = await sb.from('mikeka')
      .select('*, matches(*), users(name,role)')
      .order('created_at', { ascending: false }).limit(60);
    if (error) throw error;
    allMikeka = all || [];
    filterUserMikeka();
  } catch (err) {
    console.error("Supabase sync error bypass payload active.");
  }
}

function filterUserMikeka() {
  if (currentUser.role === 'owner' || currentUser.role === 'analyst') {
    mikeka = allMikeka;
  } else {
    mikeka = allMikeka.filter(m => m.user_id === currentUser.id);
  }
}

// 5. SECURE ROUTER (LOGIN, REGISTRATION & SESSION ENGINE)
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
    toast('Karibu Kiongozi! Mfumo Umefunguka. 🎉', 'success');
  });
}

function showAuthForm(mode) {
  const f = el('auth-form');
  if (!f) return;

  if (mode === 'register') {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:12px;color:var(--accent)">📝 REGISTRATION (V2.0)</div>
      <input class="inp" id="r-name" placeholder="Jina Lako Kamili" type="text" style="margin-bottom:10px"/>
      <input class="inp" id="r-phone" placeholder="Namba ya Simu (Mfano: 0764674285)" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="r-pass" placeholder="Nenosiri Salama" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="r-btn" style="margin-bottom:12px">Unda Akaunti Mpya ✓</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Tayari una akaunti? <span id="go-log" style="color:var(--accent);cursor:pointer;font-weight:600">Ingia Hapa</span></p>
    `;
    el('go-log').onclick = () => showAuthForm('login');
    el('r-btn').onclick = async () => {
      const name = el('r-name').value.trim(), phone = el('r-phone').value.replace(/\D/g, ''), pass = el('r-pass').value;
      if (!name || !phone || !pass) return toast('Tafadhali jaza nafasi zote vizuri!', 'err');
      try {
        const { data, error } = await sb.from('users').insert([{ name, phone, role: 'viewer', bankroll: 0, password: pass }]).select().single();
        if (error) return toast('Hitilafu: Namba hii imeshasajiliwa tayari!', 'err');
        toast('Akaunti yako imekamilika! 🎉');
        setTimeout(() => loginUser(data), 600);
      } catch (e) { toast('Hitilafu ya muunganisho wa Database.', 'err'); }
    };
  } else {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:22px;font-weight:800;margin-bottom:12px;color:var(--accent)">🔑 SECURE SIGN-IN</div>
      <input class="inp" id="l-phone" placeholder="Namba ya Simu" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="l-pass" placeholder="Nenosiri (Password)" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="l-btn" style="margin-bottom:12px">Ingia Kwenye App →</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Huna akaunti bado? <span id="go-reg" style="color:var(--accent);cursor:pointer;font-weight:600">Jisajili Sasa</span></p>
    `;
    el('go-reg').onclick = () => showAuthForm('register');
    el('l-btn').onclick = async () => {
      const phone = el('l-phone').value.replace(/\D/g, ''), pass = el('l-pass').value;
      if (!phone || !pass) return toast('Tafadhali jaza sehemu zote mbili!', 'err');
      try {
        const { data, error } = await sb.from('users').select('*').eq('phone', phone).single();
        if (error || !data || data.password !== pass) return toast('Namba au Nenosiri sio sahihi kiongozi!', 'err');
        loginUser(data);
      } catch (e) { toast('Mawasiliano yamefeli. Jaribu baadae kidogo.', 'err'); }
    };
  }
}

// 6. BOTTOM APP SHELL
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
    <div id="app-body" style="padding:1rem; padding-bottom:95px; max-width:480px; margin:0 auto;"></div>
    <nav class="bottom-nav" style="position:fixed; bottom:0; left:0; right:0; background:var(--surface); border-top:1px solid var(--border); display:flex; justify-content:space-around; padding:.8rem 0; z-index:9999;">
      ${tabs.map(t => `
        <button onclick="showTab('${t.id}')" id="nav-${t.id}" style="background:none; border:none; color:var(--muted); display:flex; flex-direction:column; align-items:center; cursor:pointer; font-size:11px; font-weight:700;">
          <span style="font-size:19px; margin-bottom:2px;">${t.icon}</span>
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

// 7. RESTORED ANALYSIS INTERFACES & DYNAMIC TAB SYSTEM
function renderTabContent() {
  const body = el('app-body');
  if (!body) return;

  if (currentTab === 'home') {
    body.innerHTML = `
      <div style="margin-bottom:1.5rem; display:flex; justify-content:between; align-items:center;">
        <div>
          <div style="font-size:12px; color:var(--muted)">Mambo vipi mfalme,</div>
          <div style="font-family:'Syne',sans-serif; font-size:22px; font-weight:800; color:var(--text)">${currentUser.name}</div>
          <div style="font-size:14px; color:var(--accent); font-weight:700; margin-top:3px">💰 Bankroll: TZS ${fmt(currentUser.bankroll || 0)}</div>
        </div>
      </div>
      <div style="font-family:'Syne',sans-serif; font-size:15px; font-weight:800; margin-bottom:12px; color:var(--accent)">📌 ANALYSIS DASHBOARD & SLIPS</div>
      <div id="mikeka-list"></div>
    `;
    renderHomeMikeka();
  } 
  
  else if (currentTab === 'live') {
    let html = '';
    Object.values(liveScores).forEach(m => {
      html += `
        <div style="background:var(--surface); padding:1rem; border-radius:12px; margin-bottom:10px; border:1px solid var(--border)">
          <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted); margin-bottom:6px">
            <span>⚽ ${m.league}</span>
            <span style="color:var(--accent); font-weight:700">${m.minute}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-weight:600; font-size:14px">
            <span>${m.homeTeam} vs ${m.awayTeam}</span>
            <span style="color:var(--accent)">${m.home} - ${m.away}</span>
          </div>
          <div style="font-size:11px; color:var(--muted); margin-top:6px">⏰ Saa za TZ: ${m.time} | Tarehe: ${m.date}</div>
        </div>
      `;
    });
    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:16px; font-weight:800; margin-bottom:12px; color:var(--accent)">🔴 LIVE ANALYSIS TICKER</div>
      ${html || '<div style="text-align:center; padding:2rem; color:var(--muted)">Hakuna mechi za live kwenye algorithm sasa hivi.</div>'}
    `;
  } 
  
  else if (currentTab === 'post') {
    const tOdds = pMatches.reduce((p, m) => p * (parseFloat(m.odds) || 1), 1);
    const kF = kelly(tOdds, kProb / 100);
    const kStake = Math.round((currentUser.bankroll || 0) * kF);

    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:800; margin-bottom:1rem">➕ Unda Uchambuzi Mpya</div>
      
      <div style="background:rgba(0,255,133,0.04); padding:1rem; border-radius:14px; border:1px solid var(--border); margin-bottom:1.2rem">
        <div style="font-size:12px; font-weight:800; color:var(--accent); margin-bottom:6px; font-family:'Syne'">📊 ADVANCED KELLY CRITERION ALGORITHM</div>
        <div style="font-size:13px; margin-bottom:4px">Odds za Mkeka: <span style="color:var(--accent); font-weight:700">${tOdds.toFixed(2)}x</span></div>
        <div style="font-size:13px">Pendekezo la Dau (Optimal Stake): <span style="color:var(--accent); font-weight:700">TZS ${fmt(kStake > 0 ? kStake : 2500)}</span></div>
      </div>
      
      <div style="margin-bottom:12px">
        <label style="font-size:11px; color:var(--muted); font-weight:600">TIMU ZINAZOCHEZA</label>
        <input class="inp" id="p-teams" placeholder="Mfan: Real Madrid vs Barcelona" style="margin-bottom:8px; margin-top:3px"/>
        
        <label style="font-size:11px; color:var(--muted); font-weight:600">MARKET (EDGE ANALYSIS)</label>
        <select class="inp" id="p-market" style="margin-bottom:8px; margin-top:3px">
          ${MARKETS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        
        <label style="font-size:11px; color:var(--muted); font-weight:600">ODDS ZA SOKONI</label>
        <input class="inp" id="p-odds" placeholder="Odds Mfano: 1.95" type="number" step="0.01" style="margin-top:3px"/>
        
        <button onclick="addMatchToSlip()" class="btn-primary" style="background:rgba(0,255,133,0.12); color:var(--accent); border:1px solid var(--accent); margin-top:12px">Ongeza Kwenye Mfumo ✓</button>
      </div>

      <div style="margin-top:1.5rem">
        <div style="font-size:12px; font-weight:800; color:var(--muted); margin-bottom:6px">MATCH SLIP SLOTS:</div>
        <div id="slip-matches"></div>
      </div>
    `;
    renderSlipMatches();
  } 
  
  else if (currentTab === 'reports') {
    body.innerHTML = `
      <div style="font-family:'Syne',sans-serif; font-size:17px; font-weight:800; margin-bottom:12px; color:var(--accent)">📊 STRATEGIES & SYSTEM ROLLOVER</div>
      <div style="background:var(--surface); padding:1rem; border-radius:12px; border:1px solid var(--border); margin-bottom:10px">
        <div style="font-weight:700; color:var(--text)">📈 Poisson Distribution Model</div>
        <p style="font-size:12px; color:var(--muted); margin-top:4px">Uchambuzi wa uwezo wa magoli ya nyumbani na ugenini kufungua soko la Over/Under.</p>
      </div>
      <div style="background:var(--surface); padding:1rem; border-radius:12px; border:1px solid var(--border)">
        <div style="font-weight:700; color:var(--text)">🔍 Mathematical Edge Tracker</div>
        <p style="font-size:12px; color:var(--muted); margin-top:4px">Inatafuta makosa ya mabookmakers kwa kupiga hesabu za asilimia ya Probability dhidi ya Odds zilizotolewa.</p>
      </div>
    `;
  } 
  
  else if (currentTab === 'profile') {
    body.innerHTML = `
      <div style="text-align:center; padding:1.5rem 0">
        <div style="font-size:45px">👤</div>
        <div style="font-family:'Syne',sans-serif; font-size:18px; font-weight:800; margin-top:6px">${currentUser.name}</div>
        <div style="font-size:12px; color:var(--accent); font-weight:700; background:rgba(0,255,133,0.08); display:inline-block; padding:.2rem .7rem; border-radius:12px; margin-top:4px">${ROLES[currentUser.role] || 'Viewer'}</div>
      </div>
      <div style="background:var(--surface); border-radius:14px; border:1px solid var(--border); padding:0.5rem">
        <div style="padding:1rem; border-bottom:1px solid var(--border); font-size:14px">📞 Simu: ${currentUser.phone}</div>
        <div onclick="logout()" style="padding:1rem; font-size:14px; color:var(--danger); cursor:pointer; font-weight:700">🚪 Toka Kwenye Mfumo (Logout)</div>
      </div>
    `;
  }
}

// 8. DATA RENDERING HANDLERS
function renderHomeMikeka() {
  const container = el('mikeka-list');
  if (!container) return;
  if (!mikeka.length) { container.innerHTML = '<div style="color:var(--muted); font-size:13px; text-align:center; padding:2rem">Bado hakuna mikeka wala uchambuzi wowote kwenye database yako.</div>'; return; }

  container.innerHTML = mikeka.map(m => `
    <div style="background:var(--surface); border:1px solid var(--border); padding:1rem; border-radius:14px; margin-bottom:12px">
      <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:8px">
        <span style="color:var(--muted)">Analyst: ${m.users?.name || 'System'}</span>
        <span style="color:${m.status==='WON'?'var(--win)':m.status==='LOST'?'var(--loss)':'var(--warn)'}; font-weight:800; letter-spacing:0.5px">${m.status}</span>
      </div>
      <div style="font-size:15px; font-weight:700; margin-bottom:4px">Odds: ${(m.total_odds || 1.85).toFixed(2)}x</div>
    </div>
  `).join('');
}

function addMatchToSlip() {
  const teams = el('p-teams').value.trim(), market = el('p-market').value, odds = parseFloat(el('p-odds').value);
  if (!teams || !odds) return toast('Tafadhali jaza jina la mechi na odds zake vizuri!', 'err');
  
  if (pMatches.some(m => m.teams.toLowerCase() === teams.toLowerCase())) {
    return toast('⚠️ Mechi hiyo ipo tayari kwenye slip ya uchambuzi huu!', 'warn');
  }

  pMatches.push({ teams, market, odds });
  el('p-teams').value = ''; el('p-odds').value = '';
  toast('Mechi imepakiwa kwenye slip!');
  renderTabContent();
}

function renderSlipMatches() {
  const container = el('slip-matches');
  if (!container) return;
  if (!pMatches.length) { container.innerHTML = '<div style="color:var(--muted); font-size:12px; padding:0.5rem 0">Kadi ya Slip haina mechi kwa sasa.</div>'; return; }

  container.innerHTML = pMatches.map((m, i) => `
    <div style="display:flex; justify-content:space-between; font-size:13px; padding:.6rem; background:rgba(255,255,255,0.02); margin-bottom:5px; border-radius:8px; border:1px solid rgba(255,255,255,0.03)">
      <span>⚽ ${m.teams} <b style="color:var(--muted)">(${m.market})</b></span>
      <span style="color:var(--accent); font-weight:800">${m.odds}x</span>
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
  toast('Umetoka salama kiongozi!');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && currentUser) startLiveScores();
});
