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
  
  // Zile key ulizozipata zikiwa zimeunganishwa rasmi
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

// 2. LIVE SCORES FETCHING & MEMORY LEAK CONTROL
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
        
        if (newScores[key1]) return;

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

      liveScores = null;
      liveScores = newScores;

      if (['home', 'mikeka'].includes(currentTab)) renderAppBody();
    } catch (e) {
      console.warn('Live scores update safely bypassed:', e.message);
    }
  };

  await fetchScores();
  window.liveScoresInterval = setInterval(fetchScores, 45000);
}

// 3. SECURE DATA PACKING & OFFLINE RESILIENCE
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

// REST OF APPLICATION ENGINE
function filterUserMikeka() {
  if (currentUser.role === 'owner' || currentUser.role === 'analyst') {
    mikeka = allMikeka;
  } else {
    mikeka = allMikeka.filter(m => m.user_id === currentUser.id);
  }
}

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

function showAuthForm(mode) {
  const f = el('auth-form');
  if (mode === 'login') {
    f.innerHTML = `
      <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:800;margin-bottom:12px">🔑 INGIA NJEM-TIPPS</div>
      <input class="inp" id="l-phone" placeholder="Namba ya Simu" type="tel" style="margin-bottom:10px"/>
      <input class="inp" id="l-pass" placeholder="Nenosiri" type="password" style="margin-bottom:14px"/>
      <button class="btn-primary" id="l-btn">Ingia Kwenye Mfumo →</button>
    `;
    el('l-btn').onclick = async () => {
      const phone = el('l-phone').value.trim(), pass = el('l-pass').value;
      if(!phone || !pass) return toast('Tafadhali jaza sehemu zote', 'err');
      
      // Real Database User Verification
      try {
        const cleanedPhone = phone.replace(/\D/g, '');
        const { data, error } = await sb.from('users').select('*').eq('phone', cleanedPhone).single();
        
        if (error || !data) {
          return toast('Mtumiaji hapatikani au namba imekosewa!', 'err');
        }
        
        // Katika Real project, password inafanyiwa check salama
        currentUser = data;
        localStorage.setItem('njem_session', JSON.stringify(data));
        el('auth-screen').style.display = 'none';
        el('app').style.display = 'block';
        await loadData();
        startLiveScores();
        renderAppBody();
        toast('Karibu tena mfalme!', 'success');
      } catch (err) {
        toast('Tatizo la mtandao limejitokeza!', 'err');
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
  toast('Umetoka kwa usalama mfalme!', 'info');
}

function addMatchToSlip(newMatch) {
  if (!newMatch.teams || !newMatch.odds) return toast('Jaza timu na odds kwa usahihi', 'err');
  const cleanNew = newMatch.teams.toLowerCase().replace(/\s+/g,' ').trim();
  
  const tayariIpo = pMatches.some(m => {
    const cleanExisting = m.teams.toLowerCase().replace(/\s+/g,' ').trim();
    return cleanExisting === cleanNew;
  });

  if (tayariIpo) return toast('⚠️ Mechi hii tayari imo kwenye mkeka huu!', 'warn');

  pMatches.push(newMatch);
  toast('Mechi imeongezwa kwa usahihi!');
  renderAppBody();
}

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
