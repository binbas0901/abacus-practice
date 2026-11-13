// Fun layer: Bix the bead mascot (drawn by the Workshop kit), sticker album, the garden flower pot, confetti.
// Reads the app through window.App at call time (app.js defines it before boot).
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const App = () => root.App;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------------- data ---------------- */
  // Stickers, garden, beads and treat tickets belong to the child who is practising (see store.js).
  const data = Object.assign({ stickers: {}, gold: {}, garden: {}, best: {}, today: null, seen: 0 }, Store.get('fun', {}));
  function save() { Store.set('fun', data); }
  function replace(d) { Object.keys(data).forEach(k => delete data[k]); Object.assign(data, { stickers: {}, gold: {}, garden: {}, best: {}, today: null, seen: 0 }, d || {}); save(); }

  /* ---------------- Bix, the bead mascot: drawn by the Workshop kit (WS.bix) ---------------- */
  // Moods come from kit.js: happy | cheer | think | concerned | wow | sleepy. The older reaction names map onto them.
  const MOODS = ['happy', 'cheer', 'think', 'concerned', 'wow', 'sleepy'];
  const REACT = { happy: 'happy', cheer: 'cheer', oops: 'concerned' };
  function bixSVG(mood, size) { return root.WS.bix(MOODS.includes(mood) ? mood : 'happy', size || 96).replace('class="ws-bix ', 'class="bix ws-bix '); }
  // Swap the drawing inside an existing Bix (keeps the element, its click handler and the .talking class).
  function setMood(s, mood) {
    if (!s || !MOODS.includes(mood)) return;
    const t = document.createElement('div'); t.innerHTML = root.WS.bix(mood, 96);
    const svg = t.querySelector('svg'), old = s.querySelector('svg'); if (!svg || !old) return;
    old.replaceWith(svg); MOODS.forEach(m => s.classList.remove('ws-bix-' + m)); s.classList.add('ws-bix-' + mood); s.dataset.mood = mood;
  }
  /* ---------------- Bix's voice (pre-recorded lines, see tools/make_bix_voice.py) ---------------- */
  const LINES = () => root.BIX_LINES || {};
  const BixVoice = {
    buf: {}, map: {}, loading: {}, src: null, talkingEl: null, spokenIntro: false, queued: 0, seq: 0,
    busy() { return !!this.src || this.queued > 0; },
    voices: { sweet:'Sweet', boy:'Boy' },
    tag() { const s = App() && App().settings; const t = s && s.bixVoice; return this.voices[t] ? t : 'sweet'; },
    enabled() { const s = App() && App().settings; return !s || s.bixTalks !== false; },
    // Extra line packs recorded after the main set (audio/bix-<voice>-<pack>.js, see tools/make_bix_pack.py).
    PACKS: ['home'],
    load(tag) {
      tag = tag || this.tag();
      return Promise.all([this.loadKey(tag, `audio/bix-${tag}.js`)].concat(this.PACKS.map(p => this.loadKey(tag + '-' + p, `audio/bix-${tag}-${p}.js`))));
    },
    loadKey(key, src) {
      if (this.buf[key]) return Promise.resolve(); if (this.loading[key]) return this.loading[key];
      this.loading[key] = new Promise((res) => {
        const prev = root.__BIX_LOADED;
        root.__BIX_LOADED = async (t, meta, b64) => {
          if (t !== key) { if (prev) prev(t, meta, b64); return; }
          try { const ctx = App().Speaker.ensureCtx(); const raw = atob(b64), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
            this.buf[key] = await new Promise((ok, no) => { const p = ctx.decodeAudioData(u.buffer, ok, no); if (p && p.then) p.then(ok, no); }); this.map[key] = meta.sprite;
            if (meta.lines && root.BIX_LINES) Object.keys(meta.lines).forEach(k => { if (!root.BIX_LINES[k]) root.BIX_LINES[k] = meta.lines[k]; }); } catch (e) {}
          delete this.loading[key]; res();
        };
        const s = document.createElement('script'); s.src = src; s.onerror = () => { delete this.loading[key]; res(); }; document.head.appendChild(s);
      });
      return this.loading[key];
    },
    // Where a line lives: the main recording first, then the extra packs.
    find(id) {
      const tag = this.tag(); if (this.map[tag] && this.map[tag][id]) return [this.buf[tag], this.map[tag][id]];
      for (const p of this.PACKS) { const k = tag + '-' + p; if (this.map[k] && this.map[k][id]) return [this.buf[k], this.map[k][id]]; }
      return [null, null];
    },
    // Play a line by id. Returns a promise that resolves when it ends (or right away if Bix can't talk now).
    async play(id, el) {
      if (!id || !this.enabled()) return;
      const a = App(); if (!a || (a.quietNow && a.quietNow())) return;
      if (!a.Speaker.gestured) return;                                            // no sound before the first tap (iPad rule)
      const ctx = a.Speaker.ensureCtx();
      this.queued++; const my = ++this.seq;
      try {
        if (ctx.state !== 'running') { try { await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 800))]); } catch (e) {} }
        await this.load(this.tag());
      } finally { this.queued--; }
      if (my !== this.seq || ctx.state !== 'running') return;                    // a newer line was asked for, or sound is still off
      const [buf, sp] = this.find(id); if (!buf || !sp) return;
      this.stop();
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(ctx.currentTime + 0.02, sp[0], sp[1]); this.src = s;
      const bx = el && el.querySelector('.bix'); if (bx) { bx.classList.add('talking'); this.talkingEl = bx; }
      await new Promise(r => { s.onended = r; setTimeout(r, sp[1] * 1000 + 400); });
      if (this.src === s) { this.src = null; if (bx) bx.classList.remove('talking'); }
    },
    stop() { this.seq++; if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; } if (this.talkingEl) { this.talkingEl.classList.remove('talking'); this.talkingEl = null; } },
  };

  const TAP_LINES = [
    '4 and 6 are big friends. Together they make 10!', '2 and 3 are small friends. They make 5!', 'The top bead is worth 5. Each bottom bead is 1.',
    'Thumb pushes beads up. Pointer finger pushes them down!', '7 needs 3 to make 10!', '9 needs 1 to make 10!', '1 and 4 make 5. Small friends!',
    'Hee hee, that tickles!', 'Beads are my cousins 😄', 'Work left to right, like reading!', 'Close your eyes and picture the beads. That is mental math!', '5 and 5 are friends with each other!',
  ];
  const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;   // bubbles are captions: no emoji
  const caption = t => String(t == null ? '' : t).replace(NO_EMOJI, '').replace(/\s+([!?.,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const Mascot = {
    // mount(el, {size, keep, bubble:false, mood, onTap}): Bix (and his speech bubble) inside el.
    mount(el, opts = {}) {
      if (!el) return;
      el.classList.add('bixwrap'); if (opts.size) el.style.setProperty('--bix', opts.size + 'px');
      const say = root.WS.icon('speaker', 22, root.WS.colors.indigo);
      el.innerHTML = bixSVG(opts.mood || 'happy', opts.size) + (opts.bubble === false ? '' : `<div class="bubble ws-bubble" aria-live="polite"><span class="ws-text"></span><span class="ws-say">${say}</span></div>`);
      const bx = el.querySelector('.bix'); bx.dataset.base = opts.mood || 'happy';
      bx.setAttribute('role', 'button'); bx.setAttribute('aria-label', 'Bix'); bx.tabIndex = 0;
      bx.addEventListener('click', () => {
        Mascot.react(el, 'happy'); const a = App(); if (a) a.Sfx.boing();
        if (opts.onTap && opts.onTap() === false) return;
        const id = 'tap_' + (1 + Math.floor(Math.random() * 16)); const text = LINES()[id] || pick(TAP_LINES);
        Mascot.say(el, text, opts.keep ? 0 : 3500, id);
      });
      // Tapping the bubble says the line again (children who can't read yet hear it twice).
      const b = el.querySelector('.bubble'); if (b) b.addEventListener('click', () => { if (b._vid) BixVoice.play(b._vid, el); });
    },
    // react(el, state, ms): a short reaction (hop, cheer, wobble) with the matching face; then back to his resting mood.
    react(el, state, ms = 1300) {
      const s = el && el.querySelector('.bix'); if (!s) return;
      const mood = REACT[state] || (MOODS.includes(state) ? state : 'happy'), anim = REACT[state] ? state : (state === 'concerned' ? 'oops' : 'happy');
      s.classList.remove('happy', 'cheer', 'oops'); setMood(s, mood); void s.getBoundingClientRect(); s.classList.add(anim);
      clearTimeout(s._t); s._t = setTimeout(() => { s.classList.remove(anim); setMood(s, s.dataset.base || 'happy'); }, ms);
    },
    // mood(el, mood): change his resting face (e.g. 'think' while waiting, 'sleepy' at night).
    mood(el, mood) { const s = el && el.querySelector('.bix'); if (!s || !MOODS.includes(mood)) return; s.dataset.base = mood; setMood(s, mood); },
    // say(el, text, ms, voiceId, replayId): show the speech bubble; if a voice line id is given, Bix says it out loud too.
    // replayId: the line that goes with this caption when it is not spoken right now (the bubble's speaker plays it on tap).
    say(el, text, ms = 3500, vid, replayId) {
      if (vid && (text === null || text === undefined)) text = LINES()[vid] || '';
      if (vid) BixVoice.play(vid, el);
      const b = el && el.querySelector('.bubble'); if (!b) return;
      const t = b.querySelector('.ws-text') || b; t.textContent = caption(text); b._vid = vid || replayId || null;
      b.classList.toggle('has-voice', !!(b._vid && LINES()[b._vid]));
      b.classList.add('on'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      clearTimeout(b._t); if (ms) b._t = setTimeout(() => b.classList.remove('on'), ms);
    },
    quiet(el) { const b = el && el.querySelector('.bubble'); if (b) b.classList.remove('on'); },
  };

  /* ---------------- stickers ---------------- */
  const PACKS = [
    { id: 'animals', name: 'Animals', items: ['🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🦄', '🦉', '🐢', '🦋', '🐰'] },
    { id: 'ocean', name: 'Ocean', items: ['🐳', '🐬', '🦈', '🐠', '🐡', '🦀', '🐚', '🦑', '🐧', '🦭', '🐙', '🦞'] },
    { id: 'space', name: 'Space', items: ['🚀', '🪐', '🌙', '⭐️', '☄️', '🛸', '🌍', '🌞', '🌈', '🔭', '🌠', '🛰️'] },
    { id: 'treats', name: 'Treats', items: ['🍓', '🍉', '🍩', '🧁', '🍪', '🍭', '🍦', '🥨', '🍒', '🥝', '🍕', '🥞'] },
    { id: 'toys', name: 'Toys', items: ['🎈', '🎨', '🧸', '🪁', '🎸', '🏰', '🎠', '🎡', '⚽️', '🎁', '🪀', '🎪'] },
  ];
  const ALL = PACKS.flatMap(p => p.items.map((e, i) => ({ id: p.id + ':' + i, emoji: e, pack: p.id, packName: p.name })));
  const BYID = Object.fromEntries(ALL.map(s => [s.id, s]));
  function count() { return Object.keys(data.stickers).filter(k => BYID[k]).length; }
  function draw(gold) {
    const have = new Set(Object.keys(data.stickers));
    const fresh = ALL.filter(s => !have.has(s.id));
    const pool = (fresh.length && Math.random() < 0.85) ? fresh : ALL;
    const s = pick(pool); const isNew = !have.has(s.id);
    data.stickers[s.id] = (data.stickers[s.id] || 0) + 1; if (gold) data.gold[s.id] = true; save();
    return Object.assign({}, s, { gold: !!gold, isNew, n: data.stickers[s.id] });
  }
  // Reveal queue: one overlay at a time; give() resolves when that sticker has been collected.
  const queue = []; let showing = false;
  function give(opts = {}) {
    const s = draw(opts.gold);
    return new Promise(res => { queue.push({ s, title: opts.title, voice: opts.voice, res }); if (!showing) next(); });
  }
  function next() {
    const item = queue.shift(); if (!item) { showing = false; return; }
    showing = true; const { s } = item;
    const ov = $('#stickerReveal'); const pack = $('#rvPack'), face = $('#rvFace');
    $('#rvTitle').textContent = item.title || (s.gold ? 'A GOLD sticker!' : 'You earned a sticker!');
    BixVoice.play(item.voice || (s.gold ? 'gift_gold' : 'gift'), null);
    face.textContent = s.emoji; face.classList.toggle('gold', s.gold);
    $('#rvName').textContent = ''; $('#rvOk').style.visibility = 'hidden';
    pack.classList.remove('open'); pack.classList.toggle('gold', s.gold); ov.classList.add('active');
    const open = () => {
      if (pack.classList.contains('open')) return;
      pack.classList.add('open'); const a = App(); if (a) a.Sfx.sparkle();
      $('#rvName').textContent = `${s.packName} sticker` + (s.isNew ? ' — NEW!' : ` — you have ${s.n}`);
      setTimeout(() => { $('#rvOk').style.visibility = 'visible'; }, 350);
    };
    pack.onclick = open; $('#rvOk').onclick = () => { ov.classList.remove('active'); item.res(s); setTimeout(next, 250); };
  }
  // The sticker book: one page per pack. Stickers are content, so they stay emoji; empty spots are soft maple circles.
  function renderAlbum() {
    const W = root.WS;
    $('#albumCount').innerHTML = `${W.icon('star', 22, W.colors.ochre)}<b>${count()}</b><span class="ab-of">of ${ALL.length}</span>`;
    const box = $('#albumPages'); box.innerHTML = '';
    for (const p of PACKS) {
      const got = p.items.filter((_, i) => data.stickers[p.id + ':' + i]).length;
      const pg = document.createElement('div'); pg.className = 'apage ab-page' + (got === p.items.length ? ' full' : '');
      pg.innerHTML = `<div class="ahead ab-head"><h2>${p.name}</h2><span class="ab-got">${got} of ${p.items.length}</span></div><div class="agrid ab-grid">` +
        p.items.map((e, i) => { const id = p.id + ':' + i, n = data.stickers[id]; return n ? `<div class="slot has${data.gold[id] ? ' gold' : ''}"><span>${e}</span>${n > 1 ? `<b>×${n}</b>` : ''}</div>` : `<div class="slot" aria-label="not found yet"></div>`; }).join('') + '</div>';
      box.appendChild(pg);
    }
  }

  /* ---------------- garden: a flower pot on the My Room shelf (one flower per practice day this month; never wilts) ---------------- */
  const PETALS = ['red', 'ochre', 'indigo', 'pink', 'white', 'red', 'ochre', 'pink', 'indigo'];
  // Flower spots above the pot, in the order they fill: each new flower goes where there is most room
  // (farthest from the others), so 3 flowers or 30 both look like a bouquet.
  const SPOTS = (() => {
    const cand = [];
    for (let y = 24; y <= 168; y += 6) for (let x = 22; x <= 208; x += 6) {
      const dx = (x - 115) / 100, dy = (y - 206) / 182;
      if (dx * dx + dy * dy <= 1) cand.push({ x, y });
    }
    const out = [{ x: 115, y: 40 }];
    while (out.length < 31) {
      let best = null, bd = -1;
      for (const c of cand) { let m = Infinity; for (const o of out) m = Math.min(m, Math.hypot(c.x - o.x, c.y - o.y) - (c.y > 150 ? 6 : 0)); if (m > bd) { bd = m; best = c; } }
      out.push(best);
    }
    return out;
  })();
  function potSVG(flowers, sprout) {
    let stems = '', heads = '';
    flowers.forEach((f, i) => {
      const s = SPOTS[i % SPOTS.length], cx = 115 + (s.x - 115) * 0.35;
      stems += `<path class="g-stem" d="M115 206 Q ${cx.toFixed(1)} ${((206 + s.y) / 2 + 12).toFixed(1)} ${s.x.toFixed(1)} ${s.y.toFixed(1)}"/>`;
      const r = flowers.length <= 9 ? 16 : flowers.length <= 18 ? 13 : 11, c = PETALS[(f.d * 7) % PETALS.length];
      heads += `<g class="plot bloom${f.full ? ' full' : ''}${f.today ? ' today' : ''}" transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})">${f.full ? `<circle r="${r + 6}" class="g-ring"/>` : ''}<circle r="${r}" class="g-${c}"/><circle r="${Math.round(r / 3)}" class="g-eye"/></g>`;
    });
    const leaves = flowers.length ? '<path class="g-leaf" d="M104 186 C 88 180, 82 166, 86 158 C 100 162, 106 172, 104 186Z"/><path class="g-leaf" d="M126 182 C 142 176, 148 162, 144 154 C 130 158, 124 168, 126 182Z"/>' : '';
    const sp = sprout ? `<g class="plot sprout"><path class="g-stem" d="M115 206 V 176"/><path class="g-leaf" d="M115 186 C 104 184, 98 176, 100 170 C 110 172, 115 178, 115 186Z"/><path class="g-leaf" d="M115 180 C 126 176, 132 168, 130 162 C 120 164, 115 172, 115 180Z"/></g>` : '';
    return `<svg viewBox="0 0 230 300" width="230" height="300" aria-hidden="true">${stems}${leaves}${sp}${heads}<path class="g-pot" d="M58 212 H172 L160 296 H70Z"/><rect class="g-rim" x="50" y="200" width="130" height="22" rx="8"/></svg>`;
  }
  function renderGarden(el, labelEl, days) {
    if (!el) return;
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), today = now.getDate(), fl = [];
    let practisedToday = false;
    for (let d = 1; d <= today; d++) {
      const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      if (days[key]) { fl.push({ d, full: data.garden[key] === 'full', today: d === today }); if (d === today) practisedToday = true; }
    }
    el.innerHTML = potSVG(fl, !practisedToday);
    const n = fl.length;
    if (labelEl) labelEl.textContent = n === 0 ? 'Practise to grow a flower!' : `${n} flower${n === 1 ? '' : 's'} this month`;
    return n;
  }

  /* ---------------- confetti ---------------- */
  function confetti(n = 90) {
    const box = document.createElement('div'); box.className = 'confetti';
    const K = root.WS ? root.WS.colors : {}, colors = [K.red, K.ochre, K.jade, K.indigo, K.bulb, '#F28FA6'].filter(Boolean);
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.5) + 's'; p.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      p.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px'); p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%'; box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 4200);
  }

  // Small, non-interactive Bix (e.g. a "you are here" marker).
  function bixMini(mood) { return root.WS.bix(mood || 'happy', 46).replace('class="ws-bix ', 'class="bixmini ws-bix '); }
  root.Fun = { data, save, replace, Mascot, give, potSVG, renderAlbum, renderGarden, confetti, ALL, PACKS, count, bixMini, BixVoice };
})(typeof globalThis !== 'undefined' ? globalThis : this);
