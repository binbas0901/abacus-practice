const CACHE = 'abacus-v4-22';
const FILES = ['./', './index.html', './styles.css?v=4.22', './fonts/baloo-2-latin-500-normal.woff2', './fonts/baloo-2-latin-700-normal.woff2', './fonts/baloo-2-latin-800-normal.woff2', './fonts/andika-latin-400-normal.woff2', './fonts/andika-latin-700-normal.woff2', './audio/bix-lines.js?v=4.22', './audio/voice-ljspeech-extra.js', './audio/bix-sweet.js', './audio/bix-sweet-home.js', './audio/bix-sweet-polish.js', './audio/bix-extra-sweet.js', './classroom.css?v=4.22', './onboarding.css?v=4.22', './classroom.js?v=4.22', './audio/lines-manifest.js?v=4.22', './audio/juni-lines.js', './audio/bixi-lines.js', './audio/lessons.js?v=4.22', './fun.js?v=4.22', './games.js?v=4.22', './onboarding.js?v=4.22', './treats.js?v=4.22', './app.js?v=4.22', './store.js?v=4.22', './toykit.js?v=4.22', './toystickers.js?v=4.22', './toy.css?v=4.22', './toy-grown.css?v=4.22', './toy-room.css?v=4.22', './toy-door.css?v=4.22', './toy-practice.css?v=4.22', './toy-home.css?v=4.22', './abacus-input.css?v=4.22', './abacus-input.js?v=4.22', './parent-brain.js?v=4.22', './fonts/fredoka-latin-500-normal.woff2', './fonts/fredoka-latin-600-normal.woff2', './fonts/fredoka-latin-700-normal.woff2', './engine.js?v=4.22', './curriculum.js?v=4.22', './manifest.json', './icon.png', './audio/voice-juni.js'];
// Voice packs that are not part of the default install (each is 1-2 MB). A pack is cached when a grown-up picks that
// voice (the page sends {type:'cache-voice', tag}) and carried over to a new cache version if the old one had it.
const VOICE_PACKS = { boy: ['./audio/bix-boy.js', './audio/bix-boy-home.js', './audio/bix-boy-polish.js', './audio/bix-extra-boy.js'] };
async function cacheVoice(tag) {
  const files = VOICE_PACKS[tag]; if (!files) return false;
  const c = await caches.open(CACHE); let ok = true;
  for (const f of files) { if (await c.match(f)) continue; try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(f, r); else ok = false; } catch (e) { ok = false; } }
  return ok;
}
async function hadVoice(tag) { for (const k of await caches.keys()) { if (await (await caches.open(k)).match(VOICE_PACKS[tag][0])) return true; } return false; }
self.addEventListener('message', e => {
  const d = e.data || {}; if (d.type !== 'cache-voice' || !VOICE_PACKS[d.tag]) return;
  e.waitUntil(cacheVoice(d.tag).then(ok => { if (e.source) e.source.postMessage({ type: 'voice-cached', tag: d.tag, ok }); }));
});
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(Promise.all(Object.keys(VOICE_PACKS).map(t => hadVoice(t).then(had => had && cacheVoice(t)).catch(() => {}))).then(() => caches.keys()).then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok && new URL(e.request.url).origin === location.origin) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
