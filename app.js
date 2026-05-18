// CONFIGURATIONS & GLOBAL STATES
const SPORTSDB_KEY = "3"; // API Key ya TheSportsDB ya vigezo
let sb = null; // Supabase Client Holder
let currentUser = null;
let currentTab = 'home';
let liveScores = {};
let mikeka = [];
let allMikeka = [];
let pMatches = [], pChecks = [false, false, false, false], kOn = false, kProb = 55;

const MARKETS = ['1X2','Double Chance','Draw No Bet','Over 2.5','Under 2.5','BTTS - Yes','BTTS - No'];
const ROLES = { owner: '👑 Owner', analyst: '🔍 Analyst', viewer: '👁️ Viewer' };

// INITIALIZATION DIRECT VIA INTEGRATED KEYS
document.addEventListener("DOMContentLoaded", () => {
  // Zile key zako thabiti za Supabase zilizounganishwa rasmi
  const SUPABASE_URL = "https://mhmcvvfoylbnwqfwioys.supabase.co"; 
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1obWN2dmZveWxibndxZndpb3lzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Mzc3NDUsImV4cCI6MjA5NDUxMzc0NX0.DJx01EDheWCjpq2nkdK0aljTmf9irfTugPhn_fTXSWM";
  
  if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else {
    console.error("Supabase failed to initialize. Double check your setup.");
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

// 1. REALTIME TIMEZONE CONVERSION (EAT - Tanzania Time)
function convertToTanzaniaTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return { displayTime: 'NS', displayDate: '' };
  try {
    const utcDateTime = new Date(`${dateStr}T${timeStr.trim().substring(0, 5)}Z`);
    if (isNaN(utcDateTime.getTime())) {
      return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
    }
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Dar_es_Salaam' };
    const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam' };
    
    const localTime = utcDateTime.toLocaleTimeString('en-GB', timeOptions);
    const localDate = utcDateTime.toLocaleDateString('en-GB', dateOptions).split('/').reverse().join('-');
    return { displayTime: localTime, displayDate: localDate };
  } catch (err) {
    return { displayTime: timeStr.substring(0, 5), displayDate: dateStr };
  }
}

// 2. LIVE SCORES FETCHING WITH DUPLICATE PROTECTION
async function startLiveScores() {
  if (window.liveScoresInterval) {
    clearInterval(window.liveScoresInterval);
    window.liveScoresInterval = null;
  }

  const fetchScores = async () => {
    if (!currentUser || document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/latesteat.php`);
      if (!res.ok) throw new Error("Network error");
      const data = await res.json();
      const newScores = {};

      (data.events || []).forEach(ev => {
        if (!ev.idEvent || !ev.strHomeTeam || !ev.strAwayTeam) return;

        const key1 = `${ev.strHomeTeam.toLowerCase().trim()} vs ${ev.strAwayTeam.toLowerCase().trim()}`;
        
        if (newScores[key1]) return; // Ulinzi wa mechi kujirudia

        let minute = ev.strProgress ? ev.strProgress + "'" : ev.strStatus || 'NS';
        if (ev.strStatus === 'HT') minute = "HT";
        if (ev.strStatus === 'ET') minute = "ET";

        const isLive = ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(ev.strStatus);
        const isFinished = ['FT', 'AET', 'PEN', 'FT_PEN'].includes(ev.strStatus);
        const tzTime = convertToTanzaniaTime(ev.dateEvent, ev.strTime);

        newScores[key1] = {
          home: ev.intHomeScore !== null ? parseInt(ev.intHomeScore) : '-',
          away: ev.intAwayScore !== null ? parseInt(ev.intAwayScore) : '-',
          homeTeam: ev.strHomeTeam,
          awayTeam: ev.strAwayTeam,
          minute, status: ev.strStatus || 'NS',
          league: ev.strLeague || '', eventId: ev.idEvent,
          time: tzTime.displayTime, date: tzTime.displayDate,
          isLive, isFinished, isUpcoming: !isLive && !isFinished
        };
      });

      liveScores = newScores;
      if (['home', 'mikeka'].includes(currentTab)) renderAppBody();
    } catch (e) {
      console.warn('Live scores bypass:', e.message);
    }
  };

  await fetchScores();
  window.liveScoresInterval = setInterval(fetchScores, 45000);
}

// 3. DATA LOAD & BACKUP
async function loadData() {
  try {
    if (!sb) return;
    const { data: all, error } = await sb.from('mikeka')
      .select('*, matches(*), users(name,role)')
      .order('created_at', { ascending: false }).limit(50);
      
    if (error) throw error;

    allMikeka = all || [];
    localStorage.setItem('njem_cached_data', JSON.stringify(allMikeka));
    filterUserMikeka();
  } catch (err) {
    const akiba = localStorage.getItem('njem_cached_data');
    if (akiba) {
      allMikeka = JSON.parse(akiba);
      filterUserMikeka();
    }
  }
}

function filterUserMikeka() {
  if (currentUser.role === 'owner' || currentUser.role === 'analyst') {
    mikeka = allMikeka;
  } else {
    mikeka = allMikeka.filter(m => m.user_id === currentUser.id);
  }
}

// 4. AUTHENTICATION ENGINE (URUDISHAJI WA REGISTRATION NA LOGIN)
async function initApp() {
  const session = localStorage.getItem('njem_session');
  const ls = el('loading-screen');
  if (ls) ls.style.display = 'none';

  if (session) {
    currentUser = JSON.parse(session);
    el('app').style.display = 'block';
    await loadData();
    startLiveScores();
    renderAppBody();
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
  loadData();
  startLiveScores();
  renderAppBody();
  toast('Karibu kwenye NJEM-TIPPS! 🎉', 'success');
}

function showAuthForm(mode) {
  const f = el('auth-form');
  if (!f) return;

  if (mode === 'register') {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-bottom:12px;color:var(--accent)">📝 JISAJILI HAPA</div>
      <input class="inp" id="r-name" placeholder="Jina Kamili" type="text" style="margin-bottom:10px"/>
      <input class="inp" id="r-phone" placeholder="Namba ya Simu (Mfano: 0764674285)" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="r-pass" placeholder="Nenosiri (Password)" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="r-btn" style="margin-bottom:12px">Thibitisha Usajili ✓</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Tayari una akaunti? <span id="go-log" style="color:var(--accent);cursor:pointer;font-weight:600">Ingia hapa</span></p>
    `;
    
    el('go-log').onclick = () => showAuthForm('login');
    
    el('r-btn').onclick = async () => {
      const name = el('r-name').value.trim();
      const phone = el('r-phone').value.replace(/\D/g, '');
      const pass = el('r-pass').value;

      if (!name || !phone || !pass) return toast('Tafadhali jaza sehemu zote!', 'err');
      
      const btn = el('r-btn');
      btn.textContent = 'Inasajili...';
      btn.disabled = true;

      try {
        const { data, error } = await sb.from('users').insert([{
          name, phone, role: 'viewer', bankroll: 0, password: pass
        }]).select().single();

        if (error) {
          btn.textContent = 'Thibitisha Usajili ✓';
          btn.disabled = false;
          return toast('Hitilafu: Namba tayari imeshasajiliwa!', 'err');
        }

        toast('Akaunti imefunguliwa kwa mafanikio! 🎉');
        setTimeout(() => loginUser(data), 800);
      } catch (err) {
        btn.textContent = 'Thibitisha Usajili ✓';
        btn.disabled = false;
        toast('Mawasiliano na database yamefeli.', 'err');
      }
    };

  } else { // Mode ya LOGIN
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-bottom:12px;color:var(--accent)">🔑 INGIA MFUMONI</div>
      <input class="inp" id="l-phone" placeholder="Namba ya Simu (0764674285)" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="l-pass" placeholder="Nenosiri" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="l-btn" style="margin-bottom:12px">Ingia Sasa →</button>
      <p style="text-align:center;font-size:13px;color:var(--muted)">Huna akaunti bado? <span id="go-reg" style="color:var(--accent);cursor:pointer;font-weight:600">Jisajili hapa</span></p>
    `;

    el('go-reg').onclick = () => showAuthForm('register');

    el('l-btn').onclick = async () => {
      const phone = el('l-phone').value.replace(/\D/g, '');
      const pass = el('l-pass').value;

      if (!phone || !pass) return toast('Tafadhali jaza sehemu zote!', 'err');
      
      const btn = el('l-btn');
      btn.textContent = 'Inaingia...';
      btn.disabled = true;

      try {
        const { data, error } = await sb.from('users').select('*').eq('phone', phone).single();
        
        if (error || !data || data.password !== pass) {
          btn.textContent = 'Ingia Sasa →';
          btn.disabled = false;
          return toast('Namba ya simu au nenosiri si sahihi!', 'err');
        }
        
        loginUser(data);
      } catch (err) {
        btn.textContent = 'Ingia Sasa →';
        btn.disabled = false;
        toast('Hitilafu ya mtandao imejitokeza!', 'err');
      }
    };
  }
}

function logout() {
  if (window.liveScoresInterval) {
    clearInterval(window.liveScoresInterval);
    window.liveScoresInterval = null;
  }
  localStorage.removeItem('njem_session');
  currentUser = null;
  liveScores = {};
  el('app').style.display = 'none';
  el('auth-screen').style.display = 'block';
  showAuthForm('login');
  toast('Umetoka kwa usalama!', 'info');
}

// 5. INTERFACE RENDERING
function renderAppBody() {
  const body = el('app-body');
  if (!body) return;

  if (currentTab === 'home') {
    let matchesHtml = '';
    Object.values(liveScores).forEach(m => {
      matchesHtml += `
        <div style="background:var(--surface);padding:1rem;border-radius:12px;margin-bottom:10px;border:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px">
            <span>⚽ ${m.league || 'Soka'}</span>
            <span style="color:var(--accent);font-weight:700">${m.minute}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:600">
            <span>${m.homeTeam} vs ${m.awayTeam}</span>
            <span style="color:var(--accent)">${m.home} - ${m.away}</span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:5px">⏰ Saa za TZ (EAT): ${m.time} | Tarehe: ${m.date}</div>
        </div>
      `;
    });

    body.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
        <div>
          <div style="font-size:12px;color:var(--muted)">Mambo vipi,</div>
          <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800">${currentUser?.name || 'Mtumiaji'}</div>
        </div>
        <button onclick="logout()" style="background:transparent;border:1px solid var(--border);color:var(--danger);padding:.4rem .8rem;border-radius:8px;font-size:12px;cursor:pointer">Ondoka</button>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:14px;font-weight:700;margin-bottom:10px;color:var(--accent)">🔴 LIVE SCORES (TANZANIA TIME)</div>
      ${matchesHtml || '<div style="font-size:13px;color:var(--muted);text-align:center;padding:2rem">Hakuna mechi za live kwa sasa.</div>'}
    `;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (currentUser) startLiveScores();
  } else {
    if (window.liveScoresInterval) {
      clearInterval(window.liveScoresInterval);
      window.liveScoresInterval = null;
    }
  }
});
    
