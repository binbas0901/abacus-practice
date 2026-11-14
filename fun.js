// Fun layer: Bix the bead mascot (drawn by the Toy Table kit, TOY.bix), sticker album, the garden flower pot, confetti.
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

  /* ---------------- Bix, the bead mascot: the Toy Table figurine (TOY.bix) ---------------- */
  // Moods are the kit's: happy | wave | cheer | think | oops | sleepy | wow | proud ("concerned" is the old name for oops).
  const MOODS = ['happy', 'wave', 'cheer', 'think', 'oops', 'sleepy', 'wow', 'proud'];
  const norm = m => (m === 'concerned' ? 'oops' : MOODS.includes(m) ? m : null);
  // art(mood, size, opts): a Bix drawing that can talk (class "bix"), for screens that place him themselves.
  function art(mood, size, opts) { return root.TOY.bix(norm(mood) || 'happy', size || 120, opts).replace('class="toy-bix ', 'class="toy-bix bix '); }
  // Swap the drawing inside a mounted Bix (keeps the element, its click handler and the .talking class).
  function setMood(s, mood) {
    mood = norm(mood); if (!s || !mood) return;
    if (s.dataset.mood !== mood || !s.firstChild) { s.innerHTML = root.TOY.bix(mood, 320); s.dataset.mood = mood; }
  }
  /* ---------------- Bix's voice (pre-recorded lines, see tools/make_bix_voice.py) ---------------- */
  const LINES = () => root.BIX_LINES || {};
  const BixVoice = {
    buf: {}, map: {}, loading: {}, src: null, talkingEl: null, spokenIntro: false, queued: 0, seq: 0,
    busy() { return !!this.src || this.queued > 0; },
    voices: { sweet:'Sweet', boy:'Boy' },
    // The chosen voice; if its recordings could not be loaded (picked but never downloaded, now offline), Bix
    // keeps talking in the voice that is always installed.
    missing: {},
    tag() { const s = App() && App().settings; const t = s && s.bixVoice; return this.voices[t] && !this.missing[t] ? t : 'sweet'; },
    enabled() { const s = App() && App().settings; return !s || s.bixTalks !== false; },
    // Extra line packs recorded after the main set (audio/bix-<voice>-<pack>.js, see tools/make_bix_pack.py).
    PACKS: ['home'],
    load(tag) {
      if (!tag) { const s = App() && App().settings, want = s && this.voices[s.bixVoice] ? s.bixVoice : 'sweet';
        if (want !== 'sweet') return this.load(want).then(() => { this.missing[want] = !this.buf[want]; if (this.missing[want]) return this.load('sweet'); }); }
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
    'Hee hee, that tickles!', 'Beads are my cousins!', 'Work left to right, like reading!', 'Close your eyes and picture the beads. That is mental math!', '5 and 5 are friends with each other!',
  ];
  const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;   // bubbles are captions: no emoji
  const caption = t => String(t == null ? '' : t).replace(NO_EMOJI, '').replace(/\s+([!?.,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const Mascot = {
    // mount(el, {size, keep, bubble:false, mood, onTap}): Bix (and his speech bubble) inside el.
    mount(el, opts = {}) {
      if (!el) return;
      el.classList.add('bixwrap'); if (opts.size) el.style.setProperty('--bix', opts.size + 'px');
      const say = root.TOY.icon('speaker', 24, 'currentColor'), base = norm(opts.mood) || 'happy';
      el.innerHTML = '<span class="bix"></span>' + (opts.bubble === false ? '' : `<div class="bubble toy-say" aria-live="polite"><span class="ws-text"></span><span class="ws-say">${say}</span></div>`);
      setMood(el.querySelector('.bix'), base);
      const bx = el.querySelector('.bix'); bx.dataset.base = base;
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
      const anim = state === 'cheer' ? 'cheer' : (state === 'oops' || state === 'concerned') ? 'oops' : 'happy';
      const mood = state === 'happy' ? s.dataset.base : norm(state) || s.dataset.base;     // a tap hops in his resting pose
      s.classList.remove('happy', 'cheer', 'oops'); setMood(s, mood); void s.getBoundingClientRect(); s.classList.add(anim);
      clearTimeout(s._t); s._t = setTimeout(() => { s.classList.remove(anim); setMood(s, s.dataset.base || 'happy'); }, ms);
    },
    // mood(el, mood): change his resting pose (e.g. 'think' while waiting, 'proud' when today is done).
    mood(el, mood) { const s = el && el.querySelector('.bix'); mood = norm(mood); if (!s || !mood) return; s.dataset.base = mood; if (!s.classList.contains('cheer') && !s.classList.contains('oops')) setMood(s, mood); },
    // rest(el, mood, opts): mount Bix once (or keep him) and set his resting pose.
    rest(el, mood, opts) { if (!el) return; if (!el.querySelector('.bix')) Mascot.mount(el, Object.assign({ mood }, opts || {})); else if (mood) Mascot.mood(el, mood); },
    art,
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
  // The drawn sticker set lives in toystickers.js (TOY.STICKERS); ids stay "pack:index", so collected stickers keep working.
  const PACKS = root.TOY.STICKERS;
  const ALL = PACKS.flatMap(p => p.items.map((k, i) => ({ id: p.id + ':' + i, key: k, pack: p.id, packName: p.name })));
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
    face.innerHTML = root.TOY.sticker(s.id, 230, { gold: s.gold }); $('#rvWrap').innerHTML = root.TOY.present(230, { gold: s.gold });
    $('#rvName').textContent = ''; $('#rvOk').style.visibility = 'hidden';
    pack.classList.remove('open'); pack.classList.toggle('gold', s.gold); ov.classList.add('active');
    const open = () => {
      if (pack.classList.contains('open')) return;
      pack.classList.add('open'); const a = App(); if (a) a.Sfx.sparkle();
      $('#rvName').textContent = `${s.packName} sticker` + (s.isNew ? ' — New!' : ` — you have ${s.n}`);
      setTimeout(() => { $('#rvOk').style.visibility = 'visible'; }, 350);
    };
    pack.onclick = open; $('#rvOk').onclick = () => { ov.classList.remove('active'); item.res(s); setTimeout(next, 250); };
  }
  // The sticker book: one page per pack. Stickers are drawn (TOY.sticker); empty spots are soft dashed circles.
  function renderAlbum() {
    $('#albumCount').innerHTML = `${root.TOY.icon('star', 26, '#C98A16')}<b>${count()}</b><span class="ab-of">of ${ALL.length}</span>`;
    const box = $('#albumPages'); box.innerHTML = '';
    for (const p of PACKS) {
      const got = p.items.filter((_, i) => data.stickers[p.id + ':' + i]).length;
      const pg = document.createElement('div'); pg.className = 'apage ab-page' + (got === p.items.length ? ' full' : '');
      pg.innerHTML = `<div class="ahead ab-head"><h2>${p.name}</h2><span class="ab-got">${got} of ${p.items.length}</span></div><div class="agrid ab-grid">` +
        p.items.map((e, i) => { const id = p.id + ':' + i, n = data.stickers[id]; return n ? `<div class="slot has${data.gold[id] ? ' gold' : ''}">${root.TOY.sticker(id, 86, { gold: !!data.gold[id] })}${n > 1 ? `<b>×${n}</b>` : ''}</div>` : `<div class="slot" aria-label="not found yet"></div>`; }).join('') + '</div>';
      box.appendChild(pg);
    }
  }

  /* ---------------- garden: a flower pot on the My Room shelf (one flower per practice day this month; never wilts) ---------------- */
  const PETALS = ['red', 'mustard', 'indigo', 'plum', 'moon', 'red', 'mustard', 'plum', 'indigo'];   // lacquer petals (Toy Table kit gradients)
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
  // A glazed pot on its saucer; the plant grows a lacquer flower for every practice day. Classes are test / style hooks.
  function potSVG(flowers, sprout) {
    let stems = '', heads = '';
    const sh = (cx, cy, rx, ry, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#toy-g-shadow)" opacity="${op}"/>`;
    flowers.forEach((f, i) => {
      const s = SPOTS[i % SPOTS.length], cx = 115 + (s.x - 115) * 0.35;
      const d = `M115 206 Q ${cx.toFixed(1)} ${((206 + s.y) / 2 + 12).toFixed(1)} ${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
      stems += `<path class="g-stem" d="${d}"/><path class="g-stem-hi" d="${d}"/>`;
      const r = flowers.length <= 9 ? 17 : flowers.length <= 18 ? 14 : 12, c = PETALS[(f.d * 7) % PETALS.length], eye = c === 'mustard' ? 'red' : 'mustard';
      let petals = '';
      for (let k = 0; k < 5; k++) { const a = (k * 72 - 90 + (f.d * 13) % 40) * Math.PI / 180; petals += `<circle cx="${(Math.cos(a) * r * .62).toFixed(1)}" cy="${(Math.sin(a) * r * .62).toFixed(1)}" r="${(r * .52).toFixed(1)}" fill="url(#toy-lac-${c})"/>`; }
      heads += `<g class="plot bloom${f.full ? ' full' : ''}${f.today ? ' today' : ''}" transform="translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})"><g class="g-in">${f.full ? `<circle r="${r + 13}" class="g-ring" fill="url(#toy-g-glow)"/>` : ''}`
        + `<circle cx="2" cy="3" r="${r}" fill="#3A1E06" opacity=".16"/>${petals}<circle r="${(r * .4).toFixed(1)}" class="g-eye" fill="url(#toy-lac-${eye})"/><ellipse cx="${(-r * .5).toFixed(1)}" cy="${(-r * .62).toFixed(1)}" rx="${(r * .24).toFixed(1)}" ry="${(r * .1).toFixed(1)}" transform="rotate(-35 ${(-r * .5).toFixed(1)} ${(-r * .62).toFixed(1)})" fill="#fff" opacity=".85"/></g></g>`;
    });
    const leaf = d => `<path class="g-leaf" d="${d}" fill="url(#toy-g-leaf)"/>`;
    const leaves = flowers.length ? leaf('M104 190 C 84 184, 74 166, 80 152 C 98 158, 108 172, 104 190Z') + leaf('M126 186 C 146 180, 156 162, 150 148 C 132 154, 122 168, 126 186Z') + leaf('M112 196 C 96 196, 84 204, 70 200 C 80 188, 98 186, 112 196Z') + leaf('M118 196 C 134 196, 146 204, 160 200 C 150 188, 132 186, 118 196Z') : '';
    const sp = sprout ? `<g class="plot sprout"><path class="g-stem" d="M115 206 V 172"/><path class="g-stem-hi" d="M115 206 V 172"/>${leaf('M115 186 C 102 184, 94 174, 97 166 C 109 168, 115 176, 115 186Z')}${leaf('M115 178 C 128 174, 135 164, 133 156 C 121 158, 115 168, 115 178Z')}</g>` : '';
    const pot = `<ellipse cx="115" cy="289" rx="66" ry="9" fill="#B9AA90"/><ellipse cx="115" cy="285.5" rx="66" ry="8.4" fill="#FFF9EE"/>`
      + `<path class="g-pot" d="M56 214 H174 L163 280 Q115 291 67 280Z" fill="url(#toy-g-pot)"/>`
      + `<path d="M59.5 234 H170.5 L166.8 256 Q115 265 63.2 256Z" fill="url(#toy-lac-mustard)"/><path d="M59.5 234 H170.5 L170 237 H60Z" fill="#fff" opacity=".35"/>`
      + `<path d="M138 214 H174 L163 280 Q150 284 132 286Z" fill="#3A1E06" opacity=".1"/>`
      + `<ellipse cx="76" cy="246" rx="5" ry="24" transform="rotate(7 76 246)" fill="#fff" opacity=".7"/><ellipse cx="87" cy="232" rx="2.4" ry="9" transform="rotate(7 87 232)" fill="#fff" opacity=".5"/>`
      + `<rect x="48" y="206" width="134" height="16" rx="8" fill="#C9BBA0"/><rect class="g-rim" x="48" y="198" width="134" height="18" rx="9" fill="#FFF9EE"/><rect x="58" y="201" width="60" height="4" rx="2" fill="#fff"/>`;
    return `<svg viewBox="0 0 230 300" width="230" height="300" aria-hidden="true">${sh(132, 291, 96, 12, .5)}${sh(120, 290, 70, 9, .95)}${stems}${leaves}${sp}${heads}${pot}</svg>`;
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
  // A short burst that never covers text or buttons: the layer is the first child of the active screen, made fixed with
  // z-index:-1 while the screen is isolated (its own stacking context). It paints over the screen's ground colour but under
  // every card, button and line of text, so pieces show only in the empty space;
  // and they fall only down the outer edges, away from the middle. Nothing at all with reduced motion / ws-calm.
  function confetti(n = 60) {
    const calm = document.body.classList.contains('ws-calm') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (calm) return null;
    const host = document.querySelector('.screen.active') || document.body;
    const box = document.createElement('div'); box.className = 'confetti ws-confetti'; box.setAttribute('aria-hidden', 'true');
    const colors = ['#E5402F', '#F2B632', '#1FA595', '#3F52A8', '#9255C4', '#FBEFC2'];   // the kit's lacquer colours
    n = Math.min(n, 60);
    for (let i = 0; i < n; i++) {
      // only the outer edges (left and right 18%), drifting outwards: the middle, where text and buttons live, stays clear
      const left = i % 2 === 0, x = Math.random() * 18;
      const p = document.createElement('i'); p.style.left = (left ? x : 100 - x) + '%'; p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.3) + 's'; p.style.animationDuration = (1.3 + Math.random() * 0.8) + 's';
      p.style.setProperty('--dx', ((left ? -1 : 1) * Math.random() * 60) + 'px'); p.style.setProperty('--r', (Math.random() * 720 - 360) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%'; box.appendChild(p);
    }
    host.classList.add('ws-confetti-host'); host.insertBefore(box, host.firstChild);
    setTimeout(() => { box.remove(); if (!host.querySelector('.ws-confetti')) host.classList.remove('ws-confetti-host'); }, 2600);
    return box;
  }

  // Small, non-interactive Bix (e.g. a "you are here" marker).
  root.Fun = { data, save, replace, Mascot, give, potSVG, renderAlbum, renderGarden, confetti, ALL, PACKS, count, BixVoice };
})(typeof globalThis !== 'undefined' ? globalThis : this);
