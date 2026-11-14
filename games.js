// Mini-games. Each one drills a real soroban skill:
//   Friend Pop     - instant recall of the friend pairs (make 5 / make 10): the number friends find their partner
//   Bead Detective - reading bead patterns at a glance (the basis of mental abacus)
//   Bead Builder   - setting numbers on the abacus correctly
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const App = () => root.App;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ---------- Toy Table helpers shared by My Room, the shop, the Play menu and the games (window.ToyRoom) ---------- */
  const T = () => root.TOY;
  const TI = (n, sz, c, o) => T() ? T().icon(n, sz, c, o) : '';
  // A soroban bead lying flat (the kit's wide bead), for local drawings: the treat jar, the mini soroban.
  // Shared drawings come from the kit (TOY.parts, TOY.soroban).
  const wideBead = c => T().parts.wideBead(c), shadowE = (cx, cy, rx, ry, op) => T().parts.shadow(cx, cy, rx, ry, op), miniSoroban = (n, h) => T().soroban(n, h, { cls: 'tr-soroban' });
  root.ToyRoom = { wideBead, miniSoroban, shadowE };

  // art(size): the picture on the game's toy box, built from kit parts; mark(): the small one beside its title; block: its lacquer colour.
  const ART = {
    pop: h => T().pair(family() === 5 ? 2 : 3, family() === 5 ? 3 : 7, h),
    reader: h => `<span class="ga-row">${miniSoroban(8, Math.round(h * .84))}${T().buddy(8, h, 'happy', { prop: 'magnifier' })}</span>`,
    build: h => `<span class="ga-row"><span class="ga-tile" style="font-size:${Math.round(h * .36)}px">47</span>${miniSoroban(47, Math.round(h * .9))}</span>`,
  };
  const MARK = {
    pop: () => T().pair(3, 7, 50, { sum: false }),
    reader: () => T().buddy(8, 54, 'happy', { prop: 'magnifier' }),
    build: () => miniSoroban(47, 46),
  };
  // block: the game's own lacquer colour (Friend Pop red, Bead Detective indigo, Bead Builder mustard), on its toy box.
  const GAMES = {
    pop: { name: 'Friend Pop', art: ART.pop, mark: MARK.pop, block: 'red', desc: 'Pop the friend that makes 10 (or 5)!', unit: 'friends' },
    reader: { name: 'Bead Detective', art: ART.reader, mark: MARK.reader, block: 'indigo', desc: 'Peek at the beads. What number was it?', unit: 'right' },
    build: { name: 'Bead Builder', art: ART.build, mark: MARK.build, block: 'mustard', desc: 'Make each number on the abacus!', unit: 'numbers' },
  };
  const POPS = 12;   // friends per Friend Pop round (no clock: the round ends when they are all found)
  // Bix says a line (main or extra voice pack; app.js provides BixSay), else just the bubble.
  // quiet: show the caption without speaking (the bubble's speaker mark says it on tap).
  function bixLine(text, id, ms, quiet) {
    const el = bix();
    if (quiet) { root.Fun.Mascot.say(el, text, ms, null, id); if (el) el.dataset.line = JSON.stringify([text, id || '']); }
    else if (root.BixSay) root.BixSay(el, text, id, ms); else root.Fun.Mascot.say(el, text, ms, id);
    const b = el && el.querySelector('.bubble'); if (b && id) b.classList.add('has-voice');   // extra-pack lines have a voice too
  }
  // A row of little beads for "how far through the round": done ones jade (or walnut when missed), the current one indigo.
  function beadDots(n, done, marks) {
    return Array.from({ length: n }, (_, i) => `<i class="gdot${i < done ? (marks && marks[i] === false ? ' miss' : ' ok') : i === done ? ' cur' : ''}"></i>`).join('');
  }
  let token = 0;

  function family() {               // which friends she is working on
    const a = App(), i = a.nodeIndex();
    if (i < a.idx('sf_add')) return 5;
    if (i < a.idx('bf_add_a')) return 5;
    if (i < a.idx('combined')) return 10;
    return 'mix';
  }
  function setScore(t) { $('#gameScore').innerHTML = t; }
  function bix() { return $('#bixGame'); }

  // One abacus look everywhere: the practice soroban (AbacusInput, abacus-input.js) also draws the lessons and games.
  // AbacusInput itself is not changed: read-only is a class on our host (no pointer events) and a lit rod is a class
  // on its rod group, so lessons keep their Soroban-style calls (value, reset, move, highlight, clearHighlights).
  function demoAbacus(host, opts) {
    opts = opts || {};
    host.innerHTML = ''; host.classList.add('ab-demo');
    const AI = root.AbacusInput;
    const ab = AI.create(host, { rods: opts.rods || 3, showReadout: !!opts.readout, scale: opts.scale || 1.4, onBead: opts.onBead, onChange: opts.onChange });
    const rodG = r => ab.el.querySelector(`.abx-rod[data-rod="${r}"]`);
    const api = {
      el: ab.el, input: ab,
      get value() { return ab.value(); },
      set value(n) { api.clearHighlights(); ab.setValue(n, { animate: false }); },
      rods: () => ab.rods(),
      reset() { api.clearHighlights(); ab.clear({ animate: false }); },
      setReadOnly(on) { host.classList.toggle('ab-ro', !!on); return api; },
      highlight(r, on = true) { const g = rodG(r); if (g) g.classList.toggle('hl', on); },
      clearHighlights() { ab.el.querySelectorAll('.abx-rod.hl').forEach(g => g.classList.remove('hl')); },
      // Animate one move like Soroban.move: light the rod, move its beads by delta, wait, unlight.
      // alive(): the caller's cancel token. A cancelled move stops at once and leaves the beads to whoever cancelled it.
      async move(r, delta, ms = 500, alive) {
        if (alive && !alive()) return;
        api.highlight(r, true); await sleep(120);
        if (alive && !alive()) return;
        const d = AI.digitsOf(ab.value(), Math.max(ab.rods(), r + 1));
        d[r] = Math.max(0, Math.min(9, d[r] + delta));
        ab.setValue(d.reduce((s, v, i) => s + v * Math.pow(10, i), 0));
        await sleep(ms); if (!alive || alive()) api.highlight(r, false);
      },
      poke(v) { ab.setValue(v, { animate: false }); if (opts.onChange) opts.onChange(ab.value()); },   // tests: set a value as if she had moved the beads
      destroy() { ab.destroy(); host.classList.remove('ab-demo', 'ab-ro'); },
    };
    if (opts.readOnly) api.setReadOnly(true);
    return api;
  }

  /* ---------- number pad: the ONE kit keypad (TOY.keypad, toykit.js) with the round teal Check beside the felt mat ----------
     Keys and Check stay dimmed until the question is asked. */
  function pad(el, ansEl, maxLen = 3) {
    el.innerHTML = '';
    let val = '', waiting = null;
    const kp = T().keypad(el, {
      onKey(d) { if (!waiting || !/^\d$/.test(d)) return; App().Sfx.tap(); if (val.length < maxLen) set(val + d); },
      onBackspace() { if (!waiting) return; App().Sfx.tap(); set(val.slice(0, -1)); },
      onCheck() {},
    });
    const go = kp.el.querySelector('[data-k="check"]');
    go.classList.add('g-check'); go.dataset.k = 'go'; go.setAttribute('aria-label', 'Check'); go.disabled = true;
    const set = v => { val = v; ansEl.textContent = v || '?'; ansEl.classList.toggle('empty', !v); go.disabled = !waiting || v === ''; };
    const idle = on => { el.classList.toggle('idle', on); kp.setEnabled(!on); go.disabled = on || val === ''; };
    go.onclick = () => { if (!waiting || val === '') return; App().Sfx.tap(); const w = waiting; waiting = null; idle(true); go.disabled = true; w(parseInt(val, 10)); };
    idle(true); set('');
    return {
      ask() { return new Promise(r => { waiting = r; idle(false); set(''); }); },
      clear() { waiting = null; idle(true); set(''); },
    };
  }

  /* ---------- results card ---------- */
  function results(r, block) {
    return new Promise(res => {
      const scrim = document.createElement('div'); scrim.className = 'gscrim';
      const div = document.createElement('div'); div.className = 'gresult toy-paper';
      div.setAttribute('role', 'dialog'); div.setAttribute('aria-label', r.big);
      div.innerHTML = `<div class="gr-icon g-${block}">${r.icon}</div><div class="gr-big">${r.big}</div>${r.dots ? `<div class="gr-dots" aria-hidden="true">${r.dots}</div>` : ''}<div class="gr-sub">${r.sub}</div>${r.best ? `<div class="gr-best">${TI('star', 26, '#C98A16')}${r.bestLine || 'New personal best!'}</div>` : r.bestText ? `<div class="gr-sub2">${r.bestText}</div>` : ''}
        <div class="gr-row"><button type="button" class="toy-block toy-block--teal toy-block--sm" data-a="again">${TI('retry', 28, 'currentColor', { stroke: 2.8 })}Play again</button><button type="button" class="toy-block toy-block--wood toy-block--sm" data-a="done">${TI('check', 28, 'currentColor', { stroke: 3 })}Done</button></div>`;
      scrim.innerHTML = `<span class="gr-prop" aria-hidden="true">${T().prop('bowl', 170)}</span>`;
      scrim.appendChild(div); $('#game').appendChild(scrim);
      div.onclick = e => { const b = e.target.closest('button'); if (b) res(b.dataset.a); };
    });
  }

  /* =========================================================
     Friend Pop: a number friend waits for its partner; friends float up in bubbles.
     Pop the right bubble and the two hold hands again (they make 5 or 10).
     No clock: a round is a fixed number of friends found.
     ========================================================= */
  function pop(tok) {
    const st = $('#gameStage'), fam = family(), N = App().gamePops || POPS;
    st.innerHTML = `<div class="pop-head"><div class="pop-q" id="popQ"></div><div class="pop-hint" id="popHint"></div></div><div class="pop-field" id="popField"></div>`;
    const calm = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const field = $('#popField');
    let score = 0, wrong = 0, target = null, bubbles = [], spawnIn = 0.2, ended = false, last = performance.now(), back = 0, busy = false;
    const GO = 'Find the friend and pop it!';
    // Bubbles rise in lanes, so they never overlap: one speed per round, a new bubble enters a lane only once the
    // last one in it has risen clear, and the sway stays inside the lane. They appear and fade INSIDE the frame.
    const PAD = 20, SWAY = 8, GAP = 10, SPEED = 46;   // big bubbles on a mat that fits them; slow enough to read each friend
    let lanes = [], size = 100, W = 0, H = 0;
    function layout() {
      W = field.clientWidth; H = field.clientHeight; if (!W) return false;
      const probe = document.createElement('button'); probe.className = 'bub'; probe.style.visibility = 'hidden'; field.appendChild(probe);
      size = probe.offsetWidth || 100; probe.remove();
      const lw = size + 2 * SWAY + GAP, n = Math.max(2, Math.floor((W - 2 * PAD) / lw)), spare = (W - 2 * PAD - n * lw) / 2;
      lanes = Array.from({ length: n }, (_, i) => ({ x: PAD + spare + i * lw + SWAY + GAP / 2, last: null }));
      return true;
    }
    const top = () => PAD, bottom = () => H - size - PAD;
    function newTarget() {
      const F = fam === 'mix' ? (Math.random() < 0.5 ? 5 : 10) : fam;
      let a; do { a = rnd(1, F - 1); } while (target && target.a === a && F > 2);
      target = { F, a, ans: F - a };
      // The waiting friend (with its number on a little wooden disc), an empty place for its partner, and what they make together.
      $('#popQ').className = 'pop-q';
      $('#popQ').innerHTML = `<span class="pq-who">${T().buddy(a, 150, 'wave')}<b class="pq-a tr-disc">${a}</b></span><span class="pq-op">+</span><span class="pq-q" aria-label="who?">?</span><span class="pq-op">=</span><span class="pq-f tr-disc">${F}</span>`;
      $('#popHint').textContent = F === 10 ? `Find ${a}'s big friend (makes 10)` : `Find ${a}'s small friend (makes 5)`;
    }
    // Found: the two friends hold hands (TOY.pair shows what they make) for a moment before the next friend arrives.
    function reunite(v) {
      const t = target; busy = true;
      $('#popQ').className = 'pop-q together';
      $('#popQ').innerHTML = `<span class="pq-pair">${T().pair(t.a, v, 150, { mood: 'cheer' })}</span>`;
      $('#popHint').textContent = `${t.a} and ${v} make ${t.F}!`;
      setTimeout(() => { busy = false; if (!ended && tok === token) newTarget(); }, calm ? 700 : 950);
    }
    function freeLanes(y) { return lanes.filter(l => !l.last || l.last.gone || l.last.y <= y - size - GAP); }
    function spawn(y) {
      if (!W && !layout()) return false;
      if (y === undefined) y = bottom();
      const free = freeLanes(y); if (!free.length) return false;
      const lane = free[Math.floor(Math.random() * free.length)];
      const onScreen = bubbles.some(b => !b.gone && b.v === target.ans);
      // Always one answer on screen; after that mostly other numbers, so she has to look for it.
      let v; if (!onScreen || Math.random() < 0.18) v = target.ans; else { do { v = rnd(1, target.F - 1); } while (v === target.ans && target.F > 2); }
      const el = document.createElement('button'); el.className = 'bub in'; el.dataset.v = v; el.setAttribute('aria-label', String(v));
      el.innerHTML = `${T().buddy(v, 96, 'happy')}<b class="bub-n tr-disc">${v}</b>`;
      el.addEventListener('animationend', () => el.classList.remove('in'), { once: true });
      const b = { el, v, lane, y, ph: Math.random() * 6, gone: false };
      el.addEventListener('pointerdown', e => { e.preventDefault(); tap(b); });
      place(b); field.appendChild(el); bubbles.push(b); lane.last = b;
      return true;
    }
    // The CSS translate property (not transform) places it, so the pop / wobble / fade-in scale and rotate in place.
    function place(b) { b.el.style.translate = `${(b.lane.x + Math.sin(b.ph) * SWAY).toFixed(1)}px ${b.y.toFixed(1)}px`; }
    function leave(b) { b.gone = true; b.el.classList.add('out'); setTimeout(() => b.el.remove(), 320); }
    function tap(b) {
      if (ended || busy || b.gone) return;
      if (b.v === target.ans) {
        b.gone = true; b.el.classList.add('popped'); setTimeout(() => b.el.remove(), 320);
        App().Sfx.pop(); score++; setScore(beadDots(N, score)); reunite(b.v);
        if (score >= N) { ended = true; return; }
        if (score % 4 === 0) { root.Fun.Mascot.react(bix(), 'cheer'); const c = pick([['Great popping!', 'pop_cheer'], [`${score} friends!`, null], ['Friend finder!', null]]); bixLine(c[0], c[1], 0); clearTimeout(back); back = setTimeout(() => { if (!ended && tok === token) bixLine(GO, 'pop_go', 0, true); }, 2200); }
      } else { wrong++; b.el.classList.remove('nope'); void b.el.offsetWidth; b.el.classList.add('nope'); App().Sfx.soft(); }
    }
    newTarget(); setScore(beadDots(N, 0));
    requestAnimationFrame(() => { if (!layout()) return; for (let k = 3; k >= 0; k--) spawn(top() + (bottom() - top()) * (0.15 + 0.22 * k)); });   // lowest first: the first bubble is the answer, so it stays longest
    bixLine(GO, 'pop_go', 0);
    return new Promise(res => {
      function frame(now) {
        if (tok !== token) return res(null);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        if (ended) { setTimeout(() => { field.querySelectorAll('.bub').forEach(e => e.remove()); $('#popQ').innerHTML = ''; $('#popHint').textContent = ''; res(tok === token ? { score, wrong, of: N } : null); }, 900); return; }
        if (field.clientWidth && (field.clientWidth !== W || field.clientHeight !== H)) layout_keep();
        spawnIn -= dt;
        if (spawnIn <= 0) { const need = !bubbles.some(b => !b.gone && b.v === target.ans); spawnIn = spawn() ? 0.6 + Math.random() * 0.4 : (need ? 0.05 : 0.3); }
        for (const b of bubbles) {
          if (b.gone) continue; b.y -= SPEED * dt; b.ph += dt * 2.2; place(b);
          if (b.y <= top()) leave(b);
        }
        bubbles = bubbles.filter(b => !b.gone);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    // The window changed size (rotation): new lanes; bubbles already rising keep their lane until they leave.
    function layout_keep() { const old = lanes; layout(); bubbles.forEach(b => { const i = old.indexOf(b.lane); if (i < 0 || i >= lanes.length) leave(b); else { const L = lanes[i]; b.lane = L; if (!L.last || L.last.y < b.y) L.last = b; } }); }
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* =========================================================
     Bead Detective: beads show briefly, then get covered. Read them.
     Peeks get shorter when she's right; adds rods after 3 in a row.
     ========================================================= */
  async function reader(tok) {
    const a = App(), st = $('#gameStage');
    const maxR = a.nodeIndex() >= a.idx('bf_add_a') ? 3 : 2; const N = a.gameReads || 10;
    let rods = 1, show = 2.0, streak = 0, misses = 0, score = 0; const marks = [];
    st.innerHTML = `<div class="rd-wrap"><div class="rd-left"><div class="rd-ab"><div id="rdAb"></div><div class="rd-cover" id="rdCover"><span>${TI('eye', 76, '#7A4A24', { stroke: 2.2, accent: '#FFFDF6' })}<b>?</b></span></div></div></div>
      <div class="rd-right"><div class="rd-slip"><div class="answer empty" id="rdAns">?</div><div class="feedback" id="rdFb" aria-live="polite"></div></div><div class="g-pad" id="rdPad"></div></div></div>`;
    const P = pad($('#rdPad'), $('#rdAns'));
    let ab = null, abRods = 0;
    for (let i = 0; i < N; i++) {
      if (tok !== token) return null;
      setScore(beadDots(N, i, marks)); $('#rdFb').textContent = ''; $('#rdFb').className = 'feedback';
      if (abRods !== rods) { if (ab) ab.destroy(); ab = demoAbacus($('#rdAb'), { rods, readOnly: true }); abRods = rods; $('#rdAb').dataset.rods = rods; }
      const v = rods === 1 ? rnd(1, 9) : rnd(Math.pow(10, rods - 1), Math.pow(10, rods) - 1);
      ab.value = v;
      // Bix's bubble is the one instruction (spoken on the first number; afterwards a quiet caption, tap to hear it).
      $('#rdCover').classList.remove('on'); bixLine('Look closely at the beads!', 'reader_look', 0, i > 0);
      await sleep(show * 1000); if (tok !== token) return null;
      $('#rdCover').classList.add('on'); bixLine('What number was it?', 'reader_ask', 0, i > 0);
      const ans = await P.ask(); if (tok !== token) return null;
      $('#rdCover').classList.remove('on');
      if (ans === v) {
        score++; streak++; misses = 0; show = Math.max(0.6, show * 0.85); marks[i] = true; setScore(beadDots(N, i + 1, marks));
        $('#rdFb').innerHTML = `${TI('check', 26, '#fff', { stroke: 3.4 })}Yes!`; $('#rdFb').className = 'feedback ok'; $('#rdAns').classList.add('is-right'); a.Sfx.ok(); root.Fun.Mascot.react(bix(), 'happy');
        if (streak >= 3 && rods < maxR) { rods++; streak = 0; show = 2.2; bixLine('Super detective! More beads now!', 'reader_more', 0); await sleep(1500); }
        else await sleep(900);
      } else {
        streak = 0; misses++; show = Math.min(3.5, show * 1.25); marks[i] = false; setScore(beadDots(N, i + 1, marks));
        $('#rdFb').innerHTML = `It was <b>${v}</b>`; $('#rdFb').className = 'feedback bad'; $('#rdAns').classList.add('is-wrong'); bixLine(`It was ${v}. Next one!`, null, 0, true); a.Sfx.soft(); root.Fun.Mascot.react(bix(), 'oops');
        if (misses >= 2 && rods > 1) { rods--; misses = 0; }
        await sleep(1800);
      }
      if (tok !== token) return null;
      P.clear(); $('#rdAns').classList.remove('is-right', 'is-wrong');
    }
    return { score, of: N, rods: abRods, marks };
  }

  /* =========================================================
     Bead Builder: "Make 47!" — set it on the abacus. No clock: the round is 8 numbers.
     ========================================================= */
  async function build(tok) {
    const a = App(), st = $('#gameStage'), i = a.nodeIndex();
    const rods = i >= a.idx('two_digit') ? 3 : i >= a.idx('add_direct') ? 2 : 1; const N = a.gameNumbers || 8;
    st.innerHTML = `<div class="bd-wrap"><div class="bd-q"><div class="toy-clipboard bd-board"><div class="toy-paper"><div class="bd-k">Make</div><div class="bd-num" id="bdNum" aria-live="polite"></div></div></div><div class="bd-tools"><button type="button" class="toy-block toy-block--wood toy-block--sm toy-block--compact" id="bdSay" aria-label="Say the number again">${TI('speaker', 30, 'currentColor')}Again</button><button type="button" class="toy-block toy-block--wood toy-block--sm toy-block--compact" id="bdClear" aria-label="Clear the abacus">${TI('retry', 28, 'currentColor')}Clear</button></div></div><div class="bd-ab" id="bdAb"></div></div>`;
    let want = null, hit = null;
    const ab = demoAbacus($('#bdAb'), { rods: Math.max(2, rods), scale: 1.6, onBead: () => a.Sfx.tap(), onChange: v => { if (want !== null && v === want && hit) { const h = hit; hit = null; h(); } } });
    $('#bdClear').onclick = () => { ab.reset(); a.Sfx.tap(); };
    root.__gameAb = ab;   // test hook
    $('#bdSay').onclick = () => { if (want !== null) a.say(want); };
    await a.voiceReady();
    bixLine('Make this number on the abacus!', 'build_go', 0);
    let lastV = -1;
    for (let k = 0; k < N; k++) {
      if (tok !== token) return null;
      setScore(beadDots(N, k)); ab.reset(); ab.setReadOnly(false);
      let v; do { v = rods === 1 ? rnd(1, 9) : rods === 2 ? (Math.random() < 0.2 ? rnd(1, 9) : rnd(10, 99)) : (Math.random() < 0.2 ? rnd(10, 99) : rnd(100, 999)); } while (v === lastV);
      lastV = v; want = v; $('#bdNum').textContent = v; $('#bdNum').classList.remove('pop'); void $('#bdNum').offsetWidth; $('#bdNum').classList.add('pop');
      if (k > 0) a.say(v); else setTimeout(() => { if (want === v && tok === token) a.say(v); }, 2300);
      await new Promise(r => { hit = r; });
      if (tok !== token) return null;
      ab.setReadOnly(true); setScore(beadDots(N, k + 1));
      a.Sfx.pop(); a.Sfx.ok(); root.Fun.Mascot.react(bix(), k === N - 1 ? 'cheer' : 'happy');
      if (k === Math.floor(N / 2) - 1) { bixLine('You’re halfway there!', 'build_half', 0); setTimeout(() => { if (tok === token && !document.querySelector('#game .gscrim')) bixLine('Make this number on the abacus!', 'build_go', 0, true); }, 2400); }
      await sleep(650);
    }
    return { n: N, rods };
  }

  /* ---------- runner ---------- */
  // from: where Done goes back to ('home' for a Today step, 'door' for the Practice door; otherwise the Play hub).
  let cameFrom = '';
  async function open(id, o) {
    const a = App(); const my = ++token; a.Sfx.tap(); a.unlock(); clearScrim(); if (o) cameFrom = o.from || '';
    $('#exitGame').setAttribute('aria-label', cameFrom === 'home' ? 'Back home' : cameFrom === 'door' ? 'Back to Practice' : 'Back to the games');
    const g = GAMES[id]; $('#gameTitle').innerHTML = `<span class="gt-art g-${g.block}">${g.mark()}</span><span>${g.name}</span>`; $('#game').dataset.game = id; setScore('');
    root.Fun.Mascot.mount(bix(), { size: 76 }); if (root.ToyRoom.sky) root.ToyRoom.sky('#gameSky');
    a.show('game');
    const r = id === 'pop' ? await pop(my) : id === 'reader' ? await reader(my) : await build(my);
    if (!r || my !== token) return;
    const best = root.Fun.data.best; let isBest = false, card;
    if (id === 'pop') {
      best.popTotal = popTotal(best) + r.score; isBest = r.wrong === 0;
      card = { icon: T().pair(family() === 5 ? 2 : 3, family() === 5 ? 3 : 7, 130, { mood: 'cheer' }), big: `${r.score} friend${r.score === 1 ? '' : 's'} found!`, sub: isBest ? 'Every pop was a friend.' : 'popped in one round', best: isBest, bestLine: 'Perfect popping!', bestText: `${best.popTotal} friends popped so far` };
    } else if (id === 'reader') {
      isBest = r.score > (best.reader || 0); if (isBest) best.reader = r.score;
      card = { icon: GAMES.reader.art(130), big: `${r.score} green bead${r.score === 1 ? '' : 's'}!`, dots: beadDots(r.of, r.of, r.marks), sub: `numbers read · up to ${r.rods} rod${r.rods > 1 ? 's' : ''}`, best: isBest && r.score > 0, bestText: `Your best: ${best.reader}` };
    } else {
      best.buildTotal = (best.buildTotal || 0) + r.n;
      card = { icon: GAMES.build.art(130), big: `${r.n} numbers made!`, sub: 'all on the abacus', best: false, bestText: `${best.buildTotal} numbers built so far` };
    }
    root.Fun.save();
    root.Fun.Mascot.react(bix(), 'cheer', 2000); const newBest = isBest && id === 'reader'; bixLine(newBest ? 'A new best! Wow!' : 'Great playing!', newBest ? 'game_best' : 'game_good', 0);
    if (isBest) root.Fun.confetti(60);
    const leveled = a.gameResult ? a.gameResult(id, id === 'build' ? Array(r.n).fill(true) : r.marks) : false;
    if (leveled) { card.best = true; card.bestLine = 'New skill!'; bixLine('Hooray! You unlocked a new skill!', 'sum_unlock', 0); }
    // The sticker present comes first, on its own; the result card follows once it has been collected (never two layers).
    await a.activityDone('game', { gold: isBest, game: id, leveled, gap: 700 });
    if (my !== token) return;
    const choice = await results(card, g.block);
    if (my !== token) return;
    if (choice === 'again') open(id); else { token++; clearScrim(); leave(); }
  }
  function leave() { const a = App(), f = cameFrom; cameFrom = ''; if (f === 'home') a.goHome(); else if (f === 'door') a.goDoor(); else a.goPlay(); }
  function stop() { token++; clearScrim(); }
  function clearScrim() { document.querySelectorAll('#game .gscrim').forEach(e => e.remove()); }
  // Friends popped so far. Older versions kept only a best round in best.pop (a timed score): a child who played
  // then has played Friend Pop, so it counts towards the total and her card never says "New!" again.
  function popTotal(best) { return best.popTotal || best.pop || 0; }
  function renderHub() {
    const best = root.Fun.data.best; const box = $('#playCards'); box.innerHTML = '';
    const ic = $('#playIc'); if (ic && !ic.innerHTML) ic.innerHTML = TI('play', 30, '#4A2C06');
    for (const [id, g] of Object.entries(GAMES)) {
      const chip = id === 'pop' ? (popTotal(best) ? `${popTotal(best)} friends popped` : '')
        : id === 'reader' ? (best.reader ? `Best: ${best.reader} green beads` : '')
        : (best.buildTotal ? `${best.buildTotal} numbers built` : '');
      // A toy box with its lid: the picture on the front is the game. A game never played says "New!" (Bead Builder stays plain).
      const el = document.createElement('button'); el.type = 'button'; el.className = `gcard toy-box ${g.block}`; el.dataset.game = id; el.setAttribute('aria-label', `${g.name}: ${g.desc}`);
      const tagChip = chip ? `<span class="gc-best">${TI('star', 20, '#C98A16')}${chip}</span>` : id === 'build' ? '' : `<span class="gc-best is-new">New!</span>`;
      el.innerHTML = `<span class="gc-lid" aria-hidden="true"><i></i></span><span class="gc-box"><span class="gc-icon">${g.art(132)}</span><span class="gc-name">${g.name}</span><span class="gc-desc">${g.desc}</span>${tagChip}</span>`;
      el.onclick = () => open(id, { from: '' }); box.appendChild(el);
    }
  }
  root.DemoAbacus = demoAbacus;
  root.Games = { GAMES, open, stop, leave, renderHub, family, demoAbacus };
})(typeof globalThis !== 'undefined' ? globalThis : this);
