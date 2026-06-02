// ═══════════════════════════════════════════════════
// 76TIPPS — Service Worker v2.0
// Inashughulikia: Offline Cache, Push Notifications,
//                Background Sync, Periodic Sync
// ═══════════════════════════════════════════════════

const CACHE_NAME = '76tipps-v2';
const OFFLINE_URL = '/index.html';

// Mafaili ya kuhifadhi kwenye cache wakati wa install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/screenshot-wide.png',
  '/screenshot-narrow.png'
];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache static assets — faili isipokuwepo, endelea tu
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => {
            console.warn('[SW] Could not cache:', url);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — Network-first, Cache fallback ────────────
self.addEventListener('fetch', event => {
  const { request } = event;

  // Omba tu GET requests
  if (request.method !== 'GET') return;

  // Supabase & API calls — usizuie, wacha ziende mtandaoni
  const url = new URL(request.url);
  const isExternal =
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('api-football.com') ||
    url.hostname.includes('allsportsapi.com') ||
    url.hostname.includes('thesportsdb.com') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('api-sports.io') ||
    url.hostname.includes('football-data.org') ||
    url.hostname.includes('generativelanguage.googleapis.com');

  if (isExternal) {
    // API calls: network only, hakuna cache
    event.respondWith(fetch(request));
    return;
  }

  // App shell & static assets: Network-first, cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(cached => {
          if (cached) return cached;
          // Kama html page — rudisha offline page
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_URL);
          }
          return new Response('', { status: 408 });
        })
      )
  );
});

// ── PUSH NOTIFICATIONS ───────────────────────────────
self.addEventListener('push', event => {
  let data = { title: '76TIPPS', body: 'Una taarifa mpya!', icon: '/icon-192.png' };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: '/icon-maskable-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/', timestamp: Date.now() },
    actions: data.actions || [
      { action: 'open', title: '📊 Fungua App' },
      { action: 'dismiss', title: 'Funga' }
    ],
    tag: data.tag || 'tipps-notification',
    renotify: true,
    requireInteraction: data.requireInteraction || false
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Kama window ipo wazi — ileta mbele na ipeleke kwenye URL
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      // Fungua window mpya
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// ── BACKGROUND SYNC ──────────────────────────────────
// Inahifadhi vitendo vilivyoshindwa (mkeka mpya n.k.) na kuvirudia
self.addEventListener('sync', event => {
  if (event.tag === 'sync-bets') {
    event.waitUntil(syncPendingBets());
  } else if (event.tag === 'sync-bankroll') {
    event.waitUntil(syncBankroll());
  }
});

async function syncPendingBets() {
  try {
    // Chukua mikeka iliyohifadhiwa ndani ya IndexedDB / localStorage-equivalent
    const db = await openSyncDB();
    const pending = await getAllPending(db, 'pending-bets');

    for (const bet of pending) {
      try {
        const res = await fetch('/api/sync-bet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bet)
        });
        if (res.ok) {
          await deletePending(db, 'pending-bets', bet.id);
        }
      } catch {
        // Bado haijafanikiwa — itajaribu tena
      }
    }
  } catch (e) {
    console.warn('[SW] syncPendingBets failed:', e);
  }
}

async function syncBankroll() {
  // Placeholder — unaweza kuongeza logic ya Supabase sync hapa
  console.log('[SW] Bankroll sync triggered');
}

// ── PERIODIC BACKGROUND SYNC ─────────────────────────
// Inasasisha data (scores, fixtures) mara kwa mara kwa background
self.addEventListener('periodicsync', event => {
  if (event.tag === 'refresh-scores') {
    event.waitUntil(refreshScoresInBackground());
  } else if (event.tag === 'refresh-fixtures') {
    event.waitUntil(refreshFixturesInBackground());
  }
});

async function refreshScoresInBackground() {
  try {
    // Taarisha clients kwamba data mpya inapatikana
    const clientList = await clients.matchAll({ type: 'window' });
    clientList.forEach(client => {
      client.postMessage({ type: 'BG_SCORES_UPDATED' });
    });
    console.log('[SW] Background scores refresh triggered');
  } catch (e) {
    console.warn('[SW] refreshScoresInBackground failed:', e);
  }
}

async function refreshFixturesInBackground() {
  try {
    const clientList = await clients.matchAll({ type: 'window' });
    clientList.forEach(client => {
      client.postMessage({ type: 'BG_FIXTURES_UPDATED' });
    });
    console.log('[SW] Background fixtures refresh triggered');
  } catch (e) {
    console.warn('[SW] refreshFixturesInBackground failed:', e);
  }
}

// ── MESSAGES FROM APP ────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(CACHE_NAME).then(cache => cache.addAll(urls));
  }
});

// ── IndexedDB Helper (kwa background sync) ───────────
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('76tipps-sync', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('pending-bets')) {
        db.createObjectStore('pending-bets', { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getAllPending(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deletePending(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
