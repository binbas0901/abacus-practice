const CACHE = 'abacus-v2-8';
const FILES = ['./', './index.html', './fun.js?v=2.8', './games.js?v=2.8', './treats.js?v=2.8', './app.js?v=2.8', './engine.js?v=2.8', './soroban.js?v=2.8', './curriculum.js?v=2.8', './manifest.json', './icon.png', './audio/voice-ljspeech.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
