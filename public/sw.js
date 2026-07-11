const CACHE_NAME = 'voicewave-v1.0.90';
const ASSETS = [
  '/',
  '/app',
  '/app.css',
  '/app.js',
  '/audio-gate-worklet.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first, cache as offline fallback only — NOT cache-first. This app
// ships frequent fixes; cache-first meant users could keep seeing broken
// old code for a long time after every deploy, with no way to tell they
// were on a stale version (this bit us directly: a "Connection failed"
// message from a prior build kept showing up long after the real fix had
// already shipped and was verified working server-side).
self.addEventListener('fetch', (e) => {
  if (e.request.url.includes('/socket.io/')) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
