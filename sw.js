const CACHE = 'abacus-v3-9';
const FILES = ['./', './index.html', './styles.css?v=3.9', './fonts/baloo-2-latin-500-normal.woff2', './fonts/baloo-2-latin-700-normal.woff2', './fonts/baloo-2-latin-800-normal.woff2', './fonts/andika-latin-400-normal.woff2', './fonts/andika-latin-700-normal.woff2', './audio/bix-lines.js?v=3.9', './audio/bix-sweet.js', './fun.js?v=3.9', './games.js?v=3.9', './onboarding.js?v=3.9', './treats.js?v=3.9', './app.js?v=3.9', './engine.js?v=3.9', './soroban.js?v=3.9', './curriculum.js?v=3.9', './manifest.json', './icon.png', './audio/voice-ljspeech.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
