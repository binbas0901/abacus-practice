const CACHE = 'abacus-v3-1';
const FILES = ['./', './index.html', './styles.css?v=3.1', './fonts/baloo-2-latin-500-normal.woff2', './fonts/baloo-2-latin-700-normal.woff2', './fonts/baloo-2-latin-800-normal.woff2', './fonts/andika-latin-400-normal.woff2', './fonts/andika-latin-700-normal.woff2', './fun.js?v=3.1', './games.js?v=3.1', './treats.js?v=3.1', './app.js?v=3.1', './engine.js?v=3.1', './soroban.js?v=3.1', './curriculum.js?v=3.1', './manifest.json', './icon.png', './audio/voice-ljspeech.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
