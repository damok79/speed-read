const CACHE_NAME = 'speed-read-v3';
const ASSETS = [
  './',
  './index.html',
  './reader.html',
  './style.css',
  './app.js',
  './reader.js',
  './readwise.js',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Skip CORS proxy and API calls
  if (e.request.url.includes('readwise.io') || e.request.url.includes('allorigins.win')) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Network-first for app assets — always get latest, fall back to cache offline
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
