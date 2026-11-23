// Classroom: the two-character layer (Juni the teacher = the moon; Bixi the classmate = the bead).
// It generalises Bix's single-voice player (fun.js / Fun.BixVoice) so the app can speak as EITHER character.
//
// A spoken line has a character (juni|bixi) and a stable key (see /home/claude/voices/CONTRACT.md).
//   - Non-lesson lines come from window.LINES_MANIFEST (audio/lines-manifest.js).
//   - Lesson lines come from window.LESSONS (audio/lessons.js), keyed l_<nodeId>_<step>, each step carries who/text/act.
//   Both app-local files are generated from voices/manifest.json + voices/lessons.json by tools/make_lines.py;
//   a small built-in stub lets the app build and test before the real files exist.
//
// Recorded audio lives in sprite packs, same format as the bix packs:
//   audio/juni-lines.js, audio/bixi-lines.js   (main packs)
//   audio/juni-lines-<pack>.js, audio/bixi-lines-<pack>.js  (re-records; newest pack wins, see Classroom.EXTRA)
//   each file calls window.__LINES_LOADED("<packKey>", {who,label,sprite:{key:[start,dur]},lines:{key:text}}, "<b64 mp3>").
// The packs are produced separately (later). Until a clip exists, say(key) shows the bubble and stays silent.
(function (root) {
  'use strict';
  const App = () => root.App;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  const caption = t => String(t == null ? '' : t).replace(NO_EMOJI, '').replace(/\s+([!?.,])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const reduceMotion = () => document.body.classList.contains('ws-calm') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------------- content registry ---------------- */
  const MANIFEST = () => root.LINES_MANIFEST || {};
  const LESSONS = () => root.LESSONS || {};
  let lessonIndex = null, lessonIndexFor = null;
  function lessonLine(key) {
    const L = LESSONS();
    if (lessonIndex && lessonIndexFor === L) return lessonIndex[key] || null;
    lessonIndex = {}; lessonIndexFor = L;
    for (const nid in L) for (const st of (L[nid].steps || [])) if (st.id) lessonIndex[st.id] = { who: st.who, text: st.text, tuning: st.tuning || 'default' };
    return lessonIndex[key] || null;
  }
  // What a key says and who says it (manifest first, then lesson lines).
  function lineInfo(key) { const m = MANIFEST()[key]; if (m) return { who: m.who, text: m.text, tuning: m.tuning || 'default' }; return lessonLine(key); }

  /* ---------------- voice packs ---------------- */
  // Which recorded packs exist is declared in window.LINE_PACKS (an array of pack keys), so the loader never fetches a
  // file that is not there (a 404 would show in the console and fail tests). It is empty until the recording track ships
  // packs; then it lists, oldest first: "juni", "bixi", and any re-record pack "juni-<name>" / "bixi-<name>".
  // Search order is newest-first (a later pack's take of a key wins), so packList reverses the list.
  function packList(char) {
    const avail = root.LINE_PACKS || [];
    return avail.filter(k => k === char || k.indexOf(char + '-') === 0).reverse()
      .map(k => ({ key: k, src: k === char ? `audio/${char}-lines.js` : `audio/${char}-lines-${k.slice(char.length + 1)}.js` }));
  }
  const EXTRA = {};   // legacy shim; re-records are declared in window.LINE_PACKS now
  const Voice = {
    buf: {}, map: {}, text: {}, loading: {}, src: null, talkingEl: null, seq: 0, queued: 0,
    enabled() { const s = App() && App().settings; return !s || s.bixTalks !== false; },   // the "characters talk out loud" family switch
    busy() { return !!this.src || this.queued > 0; },
    loadKey(key, src) {
      if (this.buf[key]) return Promise.resolve(); if (this.loading[key]) return this.loading[key];
      this.loading[key] = new Promise(res => {
        const prev = root.__LINES_LOADED;
        root.__LINES_LOADED = async (t, meta, b64) => {
          if (t !== key) { if (prev) prev(t, meta, b64); return; }
          try {
            const ctx = App().Speaker.ensureCtx(), raw = atob(b64), u = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
            this.buf[key] = await new Promise((ok, no) => { const p = ctx.decodeAudioData(u.buffer, ok, no); if (p && p.then) p.then(ok, no); });
            this.map[key] = meta.sprite || {};
            if (meta.lines) Object.assign(this.text, meta.lines);
          } catch (e) {}
          delete this.loading[key]; res();
        };
        const s = document.createElement('script'); s.src = src; s.onerror = () => { delete this.loading[key]; res(); }; document.head.appendChild(s);
      });
      return this.loading[key];
    },
    load(char) { return Promise.all(packList(char).map(p => this.loadKey(p.key, p.src))); },
    find(char, id) { for (const p of packList(char)) { const m = this.map[p.key]; if (m && m[id]) return [this.buf[p.key], m[id]]; } return [null, null]; },
    stop() { this.seq++; if (this.src) { try { this.src.stop(); } catch (e) {} this.src = null; } if (this.talkingEl) { this.talkingEl.classList.remove('talking'); this.talkingEl = null; } },
    // Play one clip by key as `char`. Resolves true when it played to the end, false/undefined otherwise.
    // Tolerates a missing clip: resolves right away so the (already shown) bubble just stays silent.
    async play(char, id, figure) {
      if (Array.isArray(id)) { for (const x of id) { if (x && !(await this.play(char, x, figure))) return false; } return true; }
      if (!id || !this.enabled()) return;
      const a = App(); if (!a || (a.quietNow && a.quietNow())) return;        // never over a sum being read
      if (!a.Speaker.gestured) return;                                        // no sound before the first tap (iPad rule)
      const ctx = a.Speaker.ensureCtx(); this.queued++; const my = ++this.seq;
      try {
        if (ctx.state !== 'running') { try { await Promise.race([ctx.resume(), sleep(800)]); } catch (e) {} }
        await this.load(char);
      } finally { this.queued--; }
      if (my !== this.seq || ctx.state !== 'running') return;
      const [buf, sp] = this.find(char, id); if (!buf || !sp) return;         // clip not recorded yet: silent
      this.stop(); try { if (root.Fun && root.Fun.BixVoice) root.Fun.BixVoice.stop(); } catch (e) {}   // one voice at a time: silence any legacy Bixi clip
      const mine = ++this.seq;
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(ctx.currentTime + 0.02, sp[0], sp[1]); this.src = s;
      const fig = figure && (figure.classList && figure.classList.contains('bix') ? figure : figure.querySelector && figure.querySelector('.bix'));
      const mouth = fig || (figure && figure.classList && figure.classList.contains('toy-moon') ? figure : figure && figure.querySelector && figure.querySelector('.toy-moon'));
      if (mouth) { mouth.classList.add('talking'); this.talkingEl = mouth; }
      await new Promise(r => { s.onended = r; setTimeout(r, sp[1] * 1000 + 400); });
      if (this.src !== s) return false;
      this.src = null; if (mouth) mouth.classList.remove('talking');
      return this.seq === mine;
    },
  };

  /* ---------------- a speech bubble attached to the right speaker ---------------- */
  // bubble: a toy-bubble element (plain, or with a .ctext / .ws-text child). who marks it so CSS shows the right name + tail.
  function showBubble(bubble, text, who, ms) {
    if (!bubble) return;
    // one bubble at a time: close any other open speech bubble so banners never overlap.
    // The lesson caption is persistent context (the problem + instruction), so it's left alone and can sit beside Bixi's lesson bubble.
    if (bubble.id !== 'lessonCap') document.querySelectorAll('.cl-bubble.on').forEach(b => { if (b !== bubble && b.id !== 'lessonCap') { b.classList.remove('on'); clearTimeout(b._cl); } });
    // also close any stray legacy (Fun) speech bubble so a Bixi line can't sit beside Juni's sign — except inside an active lesson
    { const _les = document.getElementById('lesson');
      if (bubble.id !== 'lessonCap' && !(_les && _les.classList.contains('active'))) document.querySelectorAll('.bubble.on').forEach(b2 => { if (b2 !== bubble && !b2.classList.contains('cl-bubble')) { b2.classList.remove('on'); clearTimeout(b2._t); clearTimeout(b2._cl); } }); }
    bubble.dataset.who = who; bubble.classList.add('cl-bubble');
    const t = bubble.querySelector('.ctext') || bubble.querySelector('.ws-text') || bubble;
    t.textContent = caption(text);
    bubble.classList.add('on'); bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop');
    clearTimeout(bubble._cl); if (ms) bubble._cl = setTimeout(() => bubble.classList.remove('on'), ms);
  }

  // The main entry: say a line. Shows the bubble on the right speaker and plays the clip (silent if not recorded yet).
  // opts: { who, text, tuning, bubble, figure, ms } — who/text default from the registry; figure gets the talking mouth.
  async function say(key, opts = {}) {
    const info = lineInfo(key) || {};
    const who = opts.who || info.who || 'bixi';
    const text = opts.text != null ? opts.text : (info.text || Voice.text[key] || '');
    if (opts.bubble) { showBubble(opts.bubble, text, who, opts.ms || 0); if (opts.bubble.__replay) opts.bubble.__replay(key, who, opts.figure); }
    // A failed/rejected clip must never surface as an uncaught rejection to a fire-and-forget caller (the bubble is
    // already shown; the voice just stays silent). Hang protection for awaited beats lives in the callers (e.g. onboarding beat()).
    return Promise.resolve(Voice.play(who, key, opts.figure)).catch(() => {});
  }
  // Say a short sequence (e.g. a joke: question, pause, punchline), each on the same bubble.
  async function sequence(items, opts = {}) {
    for (const it of items) {
      if (it.pause) { await sleep(it.pause); continue; }
      await say(it.key, Object.assign({}, opts, it));
    }
  }

  /* ---------------- Bixi's moves (Part 3) ---------------- */
  // Cheap, transform-only CSS states added to the .bix figure (keyframes in classroom.css; all off under reduced motion).
  const MOVES = ['roll', 'rollback', 'dizzy', 'tip', 'sleep', 'wake', 'warmup', 'bow'];
  const MOVE_MS = { roll: 1200, rollback: 1200, dizzy: 1600, tip: 1400, sleep: 2600, wake: 1400, warmup: 1800, bow: 1400 };
  function bixFig(el) { return el && (el.classList && el.classList.contains('bix') ? el : el.querySelector && el.querySelector('.bix')); }
  function move(el, name, ms) {
    const f = bixFig(el); if (!f || MOVES.indexOf(name) < 0) return Promise.resolve();
    if (reduceMotion()) return Promise.resolve();                      // respect reduced motion: no stunt, just the line
    MOVES.forEach(m => f.classList.remove('cl-' + m)); void f.offsetWidth;
    f.classList.add('cl-' + name); const dur = ms || MOVE_MS[name] || 1200;
    return new Promise(res => { clearTimeout(f._clmove); f._clmove = setTimeout(() => { f.classList.remove('cl-' + name); res(); }, dur); });
  }

  /* ---------------- Bixi moments + joke scheduler (Part 6) ---------------- */
  const SKEY = 'classroom';
  function sstate() { const d = (root.Store && Store.get(SKEY)) || {}; return Object.assign({ jokes: [], bits: [], sets: 0 }, d); }
  function ssave(s) { if (root.Store) Store.set(SKEY, s); }
  // Draw the next item from a pool with no repeat until the pool is exhausted; persist what has been heard.
  function nextUnheard(pool, heard) {
    if (!pool.length) return null;
    let left = pool.filter(x => heard.indexOf(x) < 0);
    if (!left.length) { heard.length = 0; left = pool.slice(); }          // exhausted: reshuffle, start the pool over
    const chosen = pick(left); heard.push(chosen); return chosen;
  }
  const Silly = {
    level() { const s = App() && App().settings; return (s && s.bixiSilly) || 'normal'; },
    // A joke is two clips: <base>_q then <base>_a. Only count bases that have both.
    jokeBases() { const M = MANIFEST(); return Object.keys(M).filter(k => /^b_joke_.+_q$/.test(k) && M[k.replace(/_q$/, '_a')]).map(k => k.replace(/_q$/, '')); },
    // Silly one-liners that come with a move. [lineKey, move]
    bitList() {
      const M = MANIFEST(), opts = [['b_tap_roll', 'roll'], ['b_tap_dizzy', 'dizzy'], ['b_tap_nohands', 'tip'], ['b_tap_fastest', 'warmup'], ['b_tap_beadword', 'bow']];
      return opts.filter(([k]) => M[k]);
    },
    // Draw the next joke base (no repeat until exhausted) and persist it, without playing. Exposed for the scheduler + tests.
    drawJoke() { const s = sstate(), base = nextUnheard(this.jokeBases(), s.jokes); ssave(s); return base; },
    // Tell a joke: question, pause, punchline. who stays bixi; Juni may chime a reply after (manifest j_jokereply_*).
    async joke(opts = {}) {
      const base = this.drawJoke(); if (!base) return false;
      await sequence([{ key: base + '_q' }, { pause: opts.gap || 1400 }, { key: base + '_a' }], opts);
      return base;
    },
    async bit(opts = {}) {
      const list = this.bitList(); if (!list.length) return false;
      const s = sstate(), keys = list.map(x => x[0]), k = nextUnheard(keys, s.bits); ssave(s);
      const pair = list.find(x => x[0] === k) || list[0];
      if (opts.figure) move(opts.figure, pair[1]);
      await say(pair[0], Object.assign({ who: 'bixi' }, opts));
      return pair[0];
    },
    // Between finished activities: a short bit or joke, honouring the silliness setting. Never called during a sum.
    async between(opts = {}) {
      const lvl = this.level(); if (lvl === 'quiet') return false;          // quiet: only when tapped
      const s = sstate(); s.sets = (s.sets || 0) + 1; ssave(s);
      const chance = lvl === 'more' ? 1 : 0.5;                              // normal: about every 2nd finished set
      if (lvl !== 'more' && (s.sets % 2 !== 0)) return false;
      if (Math.random() > chance) return false;
      return (Math.random() < 0.5) ? this.joke(opts) : this.bit(opts);
    },
    // Tapping Bixi: a tap line, sometimes with a move or a joke.
    async tapBixi(opts = {}) {
      const M = MANIFEST(), taps = Object.keys(M).filter(k => /^b_tap_/.test(k));
      if (!taps.length) return say('b_tap_boing', Object.assign({ who: 'bixi', text: 'Boing!' }, opts));
      const k = pick(taps), mv = { b_tap_roll: 'roll', b_tap_dizzy: 'dizzy', b_tap_nohands: 'tip' }[k];
      if (mv && opts.figure) move(opts.figure, mv);
      return say(k, Object.assign({ who: 'bixi' }, opts));
    },
    // Tapping Juni: one of her calm facts / habit lines.
    async tapJuni(opts = {}) {
      const M = MANIFEST(), ks = Object.keys(M).filter(k => /^j_(fact|habit)_/.test(k));
      if (!ks.length) return say('j_fact_smallfriends', Object.assign({ who: 'juni', text: 'Small friends make ten.' }, opts));
      return say(pick(ks), Object.assign({ who: 'juni' }, opts));
    },
  };

  root.Classroom = {
    lineInfo, say, sequence, showBubble, Voice, move, MOVES, Silly, EXTRA,
    // introspection for tests / tooling
    jokeBases: () => Silly.jokeBases(), state: sstate,
    stop: () => Voice.stop(),
  };

  // Bulletproof "one speech bubble at a time" rule. Whatever code path turns a speech bubble on — the classroom
  // system (.cl-bubble) or the legacy Fun mascot (.bixwrap .bubble) — this backstop turns every OTHER one off, so
  // Juni's sign and a Bixi line can never sit on top of each other. A lesson is the one exception: there the teacher
  // caption (#lessonCap) and the classmate's bubble are meant to show together, so the rule stands down while a
  // lesson is active.
  (function oneBubbleGuard(doc) {
    if (!doc || typeof MutationObserver === 'undefined') return;
    const isSpeech = el => el && el.nodeType === 1 && el.classList &&
      (el.classList.contains('cl-bubble') || (el.classList.contains('bubble') && el.closest && el.closest('.bixwrap')));
    function enforce(keep) {
      const les = doc.getElementById('lesson');
      if (les && les.classList.contains('active')) return;          // lesson: caption + classmate coexist
      doc.querySelectorAll('.cl-bubble.on, .bixwrap .bubble.on').forEach(b => {
        if (b !== keep && b.id !== 'lessonCap') { b.classList.remove('on'); clearTimeout(b._cl); clearTimeout(b._t); }
      });
    }
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        const el = m.target;
        if (el.classList && el.classList.contains('on') && isSpeech(el)) { enforce(el); break; }
      }
    });
    const start = () => { try { obs.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); } catch (e) {} };
    // Start only after the page has loaded, so the observer never competes with app start-up.
    const win = doc.defaultView;
    if (doc.readyState === 'complete') start();
    else if (win) win.addEventListener('load', () => setTimeout(start, 0), { once: true });
    else doc.addEventListener('DOMContentLoaded', start);
  })(typeof document !== 'undefined' ? document : null);
})(typeof globalThis !== 'undefined' ? globalThis : this);
