// Mini-games. Each one drills a real soroban skill:
//   Friend Pop     - instant recall of the friend pairs (make 5 / make 10)
//   Bead Detective - reading bead patterns at a glance (the basis of mental abacus)
//   Bead Builder   - setting numbers on the abacus quickly and correctly
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const App = () => root.App;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  // icon: legacy emoji (other screens may still read it); art: the Workshop drawing; block: the block colour (meaning, see BRIEF).
  const ART = {
    pop: `<svg class="g-art" width="150" height="120" viewBox="0 0 150 120" aria-hidden="true"><circle class="a-bubble" cx="48" cy="66" r="38"/><circle class="a-bubble" cx="112" cy="42" r="28"/><circle class="a-bubble" cx="118" cy="98" r="16"/><text class="a-num" x="48" y="82" text-anchor="middle" font-size="44">7</text><text class="a-num" x="112" y="54" text-anchor="middle" font-size="34">3</text><path class="a-white-s" d="M24 50 q6-14 20-18" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/><g class="a-ochre-s" stroke-width="5" stroke-linecap="round"><line x1="132" y1="10" x2="138" y2="4"/><line x1="140" y1="22" x2="148" y2="20"/></g></svg>`,
    reader: `<svg class="g-art" width="150" height="120" viewBox="0 0 150 120" aria-hidden="true"><rect class="a-wood" x="8" y="10" width="104" height="96" rx="14"/><rect class="a-maple" x="16" y="18" width="88" height="80" rx="9"/><rect class="a-rod" x="16" y="44" width="88" height="6"/><g class="a-rod"><rect x="39" y="18" width="4" height="80"/><rect x="77" y="18" width="4" height="80"/></g><g class="a-red"><path d="M27 37 Q41 27 55 37 Q41 47 27 37Z"/><path d="M65 58 Q79 48 93 58 Q79 68 65 58Z"/><path d="M65 72 Q79 62 93 72 Q79 82 65 72Z"/></g><g class="a-walnut"><path d="M65 26 Q79 16 93 26 Q79 36 65 26Z"/><path d="M27 82 Q41 72 55 82 Q41 92 27 82Z"/></g><circle class="a-glass" cx="104" cy="74" r="26" stroke-width="9"/><path class="a-ochre-s" d="M123 93 L140 110" stroke-width="12" stroke-linecap="round"/></svg>`,
    build: `<svg class="g-art" width="150" height="120" viewBox="0 0 150 120" aria-hidden="true"><rect class="a-maple" x="40" y="2" width="70" height="42" rx="10"/><text class="a-num" x="75" y="34" text-anchor="middle" font-size="28">47</text><rect class="a-wood" x="22" y="52" width="106" height="64" rx="12"/><rect class="a-maple" x="29" y="59" width="92" height="50" rx="7"/><rect class="a-rod" x="29" y="74" width="92" height="5"/><g class="a-rod"><rect x="55" y="59" width="4" height="50"/><rect x="91" y="59" width="4" height="50"/></g><g class="a-red"><path d="M44 84 Q57 76 70 84 Q57 92 44 84Z"/><path d="M44 96 Q57 88 70 96 Q57 104 44 96Z"/><path d="M80 70 Q93 62 106 70 Q93 78 80 70Z" class="a-red"/><path d="M80 84 Q93 76 106 84 Q93 92 80 84Z"/><path d="M80 96 Q93 88 106 96 Q93 104 80 96Z"/></g></svg>`,
  };
  const GAMES = {
    pop: { name: 'Friend Pop', icon: '🫧', art: ART.pop, block: 'jade', desc: 'Pop the friend that makes 10 (or 5)!', unit: 'friends' },
    reader: { name: 'Bead Detective', icon: '🔍', art: ART.reader, block: 'indigo', desc: 'Peek at the beads. What number was it?', unit: 'right' },
    build: { name: 'Bead Builder', icon: '🧱', art: ART.build, block: 'red', desc: 'Make each number on the abacus!', unit: 'sec' },
  };
  const WSI = (n, sz, c, w) => root.WS ? root.WS.icon(n, sz, c, w) : '';
  // Bix says a line (main or extra voice pack; app.js provides BixSay), else just the bubble.
  function bixLine(text, id, ms) { if (root.BixSay) root.BixSay(bix(), text, id, ms); else root.Fun.Mascot.say(bix(), text, ms, id); }
  // A row of little beads for "how far through the round": done ones jade (or pale when missed), the current one ringed.
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
  function setBar(p) { $('#gameBar').style.width = Math.max(0, Math.min(100, p)) + '%'; }
  function setScore(t) { $('#gameScore').innerHTML = t; }
  function bix() { return $('#bixGame'); }

  /* ---------- shared number pad ---------- */
  function pad(el, ansEl, maxLen = 3) {
    el.innerHTML = [7, 8, 9, 4, 5, 6, 1, 2, 3].map(k => `<button data-k="${k}">${k}</button>`).join('') + '<button data-k="del" class="del">⌫</button><button data-k="0">0</button><button data-k="go" class="go">GO</button>';
    let val = '', waiting = null;
    const set = v => { val = v; ansEl.textContent = v || ' '; };
    el.onclick = e => {
      const b = e.target.closest('button'); if (!b || !waiting) return; const k = b.dataset.k; App().Sfx.tap();
      if (k === 'del') set(val.slice(0, -1)); else if (k === 'go') { if (val !== '') { const w = waiting; waiting = null; w(parseInt(val, 10)); } } else if (val.length < maxLen) set(val + k);
    };
    return { ask() { set(''); return new Promise(r => { waiting = r; }); }, clear() { set(''); waiting = null; } };
  }

  /* ---------- results card ---------- */
  function results(r) {
    return new Promise(res => {
      const st = $('#gameStage'); const div = document.createElement('div'); div.className = 'gresult ws-pop';
      div.setAttribute('role', 'dialog'); div.setAttribute('aria-label', r.big);
      div.innerHTML = `<div class="gr-icon">${r.icon}</div><div class="gr-big">${r.big}</div>${r.dots ? `<div class="gr-dots" aria-hidden="true">${r.dots}</div>` : ''}<div class="gr-sub">${r.sub}</div>${r.best ? `<div class="gr-best">${WSI('star', 26, '#E8A93A')}New personal best!</div>` : r.bestText ? `<div class="gr-sub2">${r.bestText}</div>` : ''}
        <div class="row"><button class="ws-btn jade ws-nudge" data-a="again">${WSI('retry', 28, 'currentColor', 2.8)}Play again</button><button class="ws-btn maple" data-a="done">${WSI('check', 28, 'currentColor', 3)}Done</button></div>`;
      st.appendChild(div);
      div.onclick = e => { const b = e.target.closest('button'); if (b) res(b.dataset.a); };
    });
  }

  /* =========================================================
     Friend Pop: a number shows, bubbles float up; pop its friend.
     ========================================================= */
  function pop(tok) {
    const st = $('#gameStage'), fam = family();
    st.innerHTML = `<div class="pop-head"><div class="pop-q" id="popQ"></div><div class="pop-hint" id="popHint"></div></div><div class="pop-field" id="popField"></div>`;
    const field = $('#popField'); const dur = App().gameSeconds || 60;
    let score = 0, target = null, bubbles = [], spawnIn = 0.2, ended = false, t0 = performance.now(), last = t0;
    function newTarget() {
      const F = fam === 'mix' ? (Math.random() < 0.5 ? 5 : 10) : fam;
      let a; do { a = rnd(1, F - 1); } while (target && target.a === a && F > 2);
      target = { F, a, ans: F - a };
      $('#popQ').innerHTML = `<span class="pq-a">${a}</span><span class="pq-op">+</span><span class="pq-q">?</span><span class="pq-op">=</span><span class="pq-f">${F}</span>`;
      $('#popHint').textContent = F === 10 ? `Find ${a}'s big friend (makes 10)` : `Find ${a}'s small friend (makes 5)`;
    }
    function spawn() {
      const W = field.clientWidth, H = field.clientHeight; if (!W) return;
      const onScreen = bubbles.some(b => !b.gone && b.v === target.ans);
      // Always one answer on screen; after that mostly other numbers, so she has to look for it.
      let v; if (!onScreen || Math.random() < 0.18) v = target.ans; else { do { v = rnd(1, target.F - 1); } while (v === target.ans && target.F > 2); }
      const el = document.createElement('button'); el.className = 'bub'; el.textContent = v; el.dataset.v = v;
      const b = { el, v, x: rnd(10, Math.max(10, W - 110)), y: H + 10, sp: 70 + Math.random() * 45, ph: Math.random() * 6, gone: false };
      el.addEventListener('pointerdown', e => { e.preventDefault(); tap(b); });
      field.appendChild(el); bubbles.push(b);
    }
    function tap(b) {
      if (ended || b.gone) return;
      if (b.v === target.ans) {
        b.gone = true; b.el.classList.add('popped'); setTimeout(() => b.el.remove(), 320);
        App().Sfx.pop(); score++; setScore(WSI('star', 24, '#E8A93A') + '<b>' + score + '</b>');
        if (score % 5 === 0) { root.Fun.Mascot.react(bix(), 'cheer'); { const c = pick([['Great popping!','pop_cheer'], [`${score} friends!`, null], ["You're so fast!",'pop_fast'], ['Friend finder!', null]]); root.Fun.Mascot.say(bix(), c[0], 1800, c[1]); } }
        newTarget();
      } else { b.el.classList.remove('nope'); void b.el.offsetWidth; b.el.classList.add('nope'); App().Sfx.soft(); }
    }
    newTarget(); setScore(WSI('star', 24, '#E8A93A') + '<b>0</b>');
    requestAnimationFrame(()=>{ const H=field.clientHeight; for (let k=0;k<4;k++){ spawn(); const b=bubbles[bubbles.length-1]; if (b) b.y = H*(0.25+0.18*k); } });
    root.Fun.Mascot.say(bix(), 'Pop the friend!', 2000, 'pop_go');
    return new Promise(res => {
      function frame(now) {
        if (tok !== token) return res(null);
        const dt = Math.min(0.05, (now - last) / 1000); last = now; const el = (now - t0) / 1000;
        setBar(100 * (1 - el / dur));
        spawnIn -= dt; if (spawnIn <= 0) { spawn(); spawnIn = 0.7 + Math.random() * 0.45; }
        for (const b of bubbles) {
          if (b.gone) continue; b.y -= b.sp * dt; b.ph += dt * 2.2;
          b.el.style.transform = `translate(${b.x + Math.sin(b.ph) * 12}px, ${b.y}px)`;
          if (b.y < -120) { b.gone = true; b.el.remove(); }
        }
        bubbles = bubbles.filter(b => !b.gone);
        if (el >= dur) { ended = true; field.querySelectorAll('.bub').forEach(e => e.remove()); $('#popQ').innerHTML = ''; $('#popHint').textContent = ''; return res({ score }); }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* =========================================================
     Bead Detective: beads show briefly, then get covered. Read them.
     Gets faster when she's right; adds rods after 3 in a row.
     ========================================================= */
  async function reader(tok) {
    const a = App(), st = $('#gameStage');
    const maxR = a.nodeIndex() >= a.idx('bf_add_a') ? 3 : 2; const N = 10;
    let rods = 1, show = 2.0, streak = 0, misses = 0, score = 0; const marks = [];
    st.innerHTML = `<div class="rd-wrap"><div class="rd-left"><div class="rd-msg" id="rdMsg" aria-live="polite"></div><div class="rd-ab ws-frame"><div class="ws-inner"><div id="rdAb"></div></div><div class="rd-cover" id="rdCover"><span>${WSI('eye', 72, '#F4E3C3', 2.4)}<b>?</b></span></div></div></div>
      <div class="rd-right"><div class="feedback" id="rdFb"></div><div class="answer" id="rdAns">&nbsp;</div><div class="pad" id="rdPad"></div></div></div>`;
    const P = pad($('#rdPad'), $('#rdAns'));
    let ab = null, abRods = 0;
    for (let i = 0; i < N; i++) {
      if (tok !== token) return null;
      setScore(beadDots(N, i, marks)); setBar(100 * i / N); $('#rdFb').textContent = ''; $('#rdFb').className = 'feedback';
      if (abRods !== rods) { ab = new root.Soroban($('#rdAb'), { rods, interactive: false }); ab.el.classList.add('big', 'ws-soroban'); ab.showLabels = false; abRods = rods; }
      const v = rods === 1 ? rnd(1, 9) : rnd(Math.pow(10, rods - 1), Math.pow(10, rods) - 1);
      ab.value = v; ab.update();
      $('#rdCover').classList.remove('on'); $('#rdMsg').textContent = 'Look!'; if (i === 0) bixLine('Look closely at the beads!', 'reader_look', 2200);
      await sleep(show * 1000); if (tok !== token) return null;
      $('#rdCover').classList.add('on'); $('#rdMsg').textContent = 'What number was it?'; if (i === 0) bixLine('What number was it?', 'reader_ask', 2200);
      const ans = await P.ask(); if (tok !== token) return null;
      $('#rdCover').classList.remove('on');
      if (ans === v) {
        score++; streak++; misses = 0; show = Math.max(0.6, show * 0.85); marks[i] = true; setScore(beadDots(N, i + 1, marks));
        $('#rdFb').textContent = 'Yes! ✓'; $('#rdFb').className = 'feedback ok'; a.Sfx.ok(); root.Fun.Mascot.react(bix(), 'happy');
        if (streak >= 3 && rods < maxR) { rods++; streak = 0; show = 2.2; $('#rdMsg').textContent = 'Super detective! One more rod!'; root.Fun.Mascot.say(bix(), 'More beads now!', 2000, 'reader_more'); await sleep(1500); }
        else await sleep(900);
      } else {
        streak = 0; misses++; show = Math.min(3.5, show * 1.25); marks[i] = false; setScore(beadDots(N, i + 1, marks));
        $('#rdFb').innerHTML = `It was <b>${v}</b>`; $('#rdFb').className = 'feedback bad'; a.Sfx.soft(); root.Fun.Mascot.react(bix(), 'oops');
        if (misses >= 2 && rods > 1) { rods--; misses = 0; }
        await sleep(1800);
      }
    }
    setBar(100);
    return { score, of: N, rods: abRods, marks };
  }

  /* =========================================================
     Bead Builder: "Make 47!" — set it on the abacus. Timed.
     ========================================================= */
  async function build(tok) {
    const a = App(), st = $('#gameStage'), i = a.nodeIndex();
    const rods = i >= a.idx('two_digit') ? 3 : i >= a.idx('add_direct') ? 2 : 1; const N = 8;
    st.innerHTML = `<div class="bd-wrap"><div class="bd-q"><div class="bd-k">Make</div><div class="bd-num" id="bdNum" aria-live="polite"></div><div class="bd-tools"><button class="ws-btn maple small" id="bdSay" aria-label="Say the number again">${WSI('speaker', 26, 'currentColor')}Again</button><button class="ws-btn maple small" id="bdClear" aria-label="Clear the abacus">${WSI('retry', 24, 'currentColor')}Clear</button></div></div><div class="ws-frame bd-frame"><div class="ws-inner"><div id="bdAb"></div></div></div></div>`;
    let want = null, hit = null;
    const ab = new root.Soroban($('#bdAb'), { rods: rods + 1, interactive: true, onChange: v => { if (want !== null && v === want && hit) { const h = hit; hit = null; h(); } } });
    ab.el.classList.add('big', 'ws-soroban'); ab.showLabels = false; ab.update();
    $('#bdClear').onclick = () => { ab.reset(); a.Sfx.tap(); };
    $('#bdSay').onclick = () => { if (want !== null) a.say(want); };
    await a.voiceReady();
    // Timed for the personal best, but no clock on screen (no timers on child screens): the chip shows numbers made.
    const t0 = Date.now(), tick = null;
    bixLine('Make this number on the abacus!', 'build_go', 2400);
    let lastV = -1;
    try {
      for (let k = 0; k < N; k++) {
        if (tok !== token) return null;
        setBar(100 * k / N); setScore(beadDots(N, k)); ab.reset();
        let v; do { v = rods === 1 ? rnd(1, 9) : rods === 2 ? (Math.random() < 0.2 ? rnd(1, 9) : rnd(10, 99)) : (Math.random() < 0.2 ? rnd(10, 99) : rnd(100, 999)); } while (v === lastV);
        lastV = v; want = v; $('#bdNum').textContent = v; $('#bdNum').classList.remove('pop'); void $('#bdNum').offsetWidth; $('#bdNum').classList.add('pop');
        if (k > 0) a.say(v); else setTimeout(() => { if (want === v && tok === token) a.say(v); }, 2300);
        await new Promise(r => { hit = r; });
        if (tok !== token) return null;
        a.Sfx.pop(); a.Sfx.ok(); root.Fun.Mascot.react(bix(), k === N - 1 ? 'cheer' : 'happy');
        if (k === 3) root.Fun.Mascot.say(bix(), 'Halfway there!', 1500, 'build_half');
        await sleep(650);
      }
    } finally { clearInterval(tick); }
    setBar(100);
    return { time: Math.round((Date.now() - t0) / 100) / 10, n: N, rods };
  }

  /* ---------- runner ---------- */
  async function open(id) {
    const a = App(); const my = ++token; a.Sfx.tap(); a.unlock();
    const g = GAMES[id]; $('#gameTitle').innerHTML = `<span class="gt-art g-${g.block}">${g.art}</span><span>${g.name}</span>`; $('#game').dataset.game = id; setScore(''); setBar(100);
    root.Fun.Mascot.mount(bix(), { size: 76 });
    a.show('game');
    const r = id === 'pop' ? await pop(my) : id === 'reader' ? await reader(my) : await build(my);
    if (!r || my !== token) return;
    const best = root.Fun.data.best; let isBest = false, card;
    if (id === 'pop') {
      isBest = r.score > 0 && r.score > (best.pop || 0); if (isBest) best.pop = r.score;
      card = { icon: GAMES.pop.art, big: `${r.score} friend${r.score === 1 ? '' : 's'}!`, sub: 'popped in one round', best: isBest, bestText: best.pop ? `Your best: ${best.pop}` : '' };
    } else if (id === 'reader') {
      isBest = r.score > (best.reader || 0); if (isBest) best.reader = r.score;
      card = { icon: GAMES.reader.art, big: `${r.score} green bead${r.score === 1 ? '' : 's'}!`, dots: beadDots(r.of, r.of, r.marks), sub: `numbers read · up to ${r.rods} rod${r.rods > 1 ? 's' : ''}`, best: isBest && r.score > 0, bestText: `Your best: ${best.reader}` };
    } else {
      const k = 'build' + r.rods; isBest = !best[k] || r.time < best[k]; if (isBest) best[k] = r.time;
      card = { icon: GAMES.build.art, big: `${r.n} numbers made!`, sub: `in ${r.time} seconds`, best: isBest, bestText: `Your best: ${best[k]} seconds` };
    }
    root.Fun.save();
    root.Fun.Mascot.react(bix(), 'cheer', 2000); root.Fun.Mascot.say(bix(), isBest ? 'A new best! Wow!' : 'Great playing!', 3000, isBest ? 'game_best' : 'game_good');
    if (isBest) root.Fun.confetti(60);
    a.activityDone('game', { gold: isBest, game: id });
    const choice = await results(card);
    if (my !== token) return;
    if (choice === 'again') open(id); else { token++; a.goPlay(); }
  }
  function stop() { token++; }
  function renderHub() {
    const best = root.Fun.data.best; const box = $('#playCards'); box.innerHTML = '';
    for (const [id, g] of Object.entries(GAMES)) {
      const b = id === 'pop' ? best.pop : id === 'reader' ? best.reader : ['build1', 'build2', 'build3'].map(k => best[k]).filter(Boolean).sort((x, y) => x - y)[0];
      const el = document.createElement('button'); el.className = `gcard ws-block tall ${g.block}`; el.dataset.game = id; el.setAttribute('aria-label', `${g.name}: ${g.desc}`);
      el.innerHTML = `<span class="gc-icon">${g.art}</span><span class="gc-name">${g.name}</span><span class="gc-desc">${g.desc}</span><span class="gc-best">${b ? WSI('star', 20, '#E8A93A') + 'Best: ' + b + (id === 'build' ? ' s' : '') : 'New!'}</span>`;
      el.onclick = () => open(id); box.appendChild(el);
    }
  }
  root.Games = { GAMES, open, stop, renderHub, family };
})(typeof globalThis !== 'undefined' ? globalThis : this);
