const CACHE = 'abacus-v4-104';
const FILES = ['./', './index.html', './styles.css?v=4.104', './fonts/baloo-2-latin-500-normal.woff2', './fonts/baloo-2-latin-700-normal.woff2', './fonts/baloo-2-latin-800-normal.woff2', './fonts/andika-latin-400-normal.woff2', './fonts/andika-latin-700-normal.woff2', './audio/bix-lines.js?v=4.104', './audio/voice-ljspeech-extra.js', './audio/bix-gigi.js', './audio/bix-sweet.js', './audio/bix-sweet-home.js', './audio/bix-sweet-polish.js', './audio/bix-sweet-teach.js', './audio/bix-extra-sweet.js', './classroom.css?v=4.104', './onboarding.css?v=4.104', './classroom.js?v=4.104', './audio/lines-manifest.js?v=4.104', './audio/juni-lines.js', './audio/bixi-lines.js', './audio/juni-lines-hardfix.js', './audio/bixi-lines-hardfix.js', './audio/lessons.js?v=4.104', './fun.js?v=4.104', './games.js?v=4.104', './onboarding.js?v=4.104', './treats.js?v=4.104', './app.js?v=4.104', './store.js?v=4.104', './toykit.js?v=4.104', './toystickers.js?v=4.104', './toy.css?v=4.104', './toy-grown.css?v=4.104', './toy-room.css?v=4.104', './toy-door.css?v=4.104', './toy-practice.css?v=4.104', './toy-home.css?v=4.104', './abacus-input.css?v=4.104', './abacus-input.js?v=4.104', './parent-brain.js?v=4.104', './fonts/fredoka-latin-500-normal.woff2', './fonts/fredoka-latin-600-normal.woff2', './fonts/fredoka-latin-700-normal.woff2', './engine.js?v=4.104', './timemodel.js?v=4.104', './curriculum.js?v=4.104', './manifest.json', './icon.png', './audio/voice-juni.js', './look/tokens.css?v=4.104', './look/characters.js?v=4.104', './look/abacus.js?v=4.104', './look/ui.js?v=4.104', './look/screens.js?v=4.104', './look/art/juni-wave.webp', './look/art/juni-point.webp', './look/art/juni-clap.webp', './look/art/juni-think.webp', './look/art/bixi-wave.webp', './look/art/bixi-confused.webp', './look/art/bixi-cheer.webp', './look/art/bixi-giggle.webp', './look/fonts/nunito-latin-600-normal.woff2', './look/fonts/nunito-latin-700-normal.woff2', './look/fonts/nunito-latin-800-normal.woff2', './look/fonts/nunito-latin-900-normal.woff2',];
// Voice packs that are not part of the default install (each is 1-2 MB). A pack is cached when a grown-up picks that
// voice (the page sends {type:'cache-voice', tag}) and carried over to a new cache version if the old one had it.
const VOICE_PACKS = { boy: ['./audio/bix-boy.js', './audio/bix-boy-home.js', './audio/bix-boy-polish.js', './audio/bix-boy-teach.js', './audio/bix-extra-boy.js'] };
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
