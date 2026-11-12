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

  const GAMES = {
    pop: { name: 'Friend Pop', icon: '🫧', desc: 'Pop the friend that makes 10 (or 5)!', unit: 'friends' },
    reader: { name: 'Bead Detective', icon: '🔍', desc: 'Peek at the beads. What number was it?', unit: 'right' },
    build: { name: 'Bead Builder', icon: '🧱', desc: 'Make each number on the abacus, fast!', unit: 'sec' },
  };
  let token = 0;

  function family() {               // which friends she is working on
    const a = App(), i = a.nodeIndex();
    if (i < a.idx('sf_add')) return 5;
    if (i < a.idx('bf_add_a')) return 5;
    if (i < a.idx('combined')) return 10;
    return 'mix';
  }
  function setBar(p) { $('#gameBar').style.width = Math.max(0, Math.min(100, p)) + '%'; }
  function setScore(t) { $('#gameScore').textContent = t; }
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
      const st = $('#gameStage'); const div = document.createElement('div'); div.className = 'gresult pop';
      div.innerHTML = `<div class="gr-icon">${r.icon}</div><div class="gr-big">${r.big}</div><div class="gr-sub">${r.sub}</div>${r.best ? '<div class="gr-best">🏆 New personal best!</div>' : r.bestText ? `<div class="gr-sub2">${r.bestText}</div>` : ''}
        <div class="row"><button class="btn" data-a="again">Play again</button><button class="btn ghost" data-a="done">Done</button></div>`;
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
      $('#popHint').textContent = F === 10 ? `Find ${a}'s big friend` : `Find ${a}'s small friend`;
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
        App().Sfx.pop(); score++; setScore('⭐ ' + score);
        if (score % 5 === 0) { root.Fun.Mascot.react(bix(), 'cheer'); root.Fun.Mascot.say(bix(), pick(['Pop-tastic!', `${score} friends!`, 'So fast!', 'Friend finder!']), 1800); }
        newTarget();
      } else { b.el.classList.remove('nope'); void b.el.offsetWidth; b.el.classList.add('nope'); App().Sfx.soft(); }
    }
    newTarget(); setScore('⭐ 0');
    requestAnimationFrame(()=>{ const H=field.clientHeight; for (let k=0;k<4;k++){ spawn(); const b=bubbles[bubbles.length-1]; if (b) b.y = H*(0.25+0.18*k); } });
    root.Fun.Mascot.say(bix(), 'Pop the friend!', 2000);
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
    let rods = 1, show = 2.0, streak = 0, misses = 0, score = 0;
    st.innerHTML = `<div class="rd-wrap"><div class="rd-left"><div class="rd-msg" id="rdMsg"></div><div class="rd-ab"><div id="rdAb"></div><div class="rd-cover" id="rdCover"><span>❓</span></div></div></div>
      <div class="rd-right"><div class="feedback" id="rdFb"></div><div class="answer" id="rdAns">&nbsp;</div><div class="pad" id="rdPad"></div></div></div>`;
    const P = pad($('#rdPad'), $('#rdAns'));
    let ab = null, abRods = 0;
    for (let i = 0; i < N; i++) {
      if (tok !== token) return null;
      setScore(`${i + 1} / ${N}`); setBar(100 * i / N); $('#rdFb').textContent = ''; $('#rdFb').className = 'feedback';
      if (abRods !== rods) { ab = new root.Soroban($('#rdAb'), { rods, interactive: false }); ab.el.classList.add('big'); ab.showLabels = false; abRods = rods; }
      const v = rods === 1 ? rnd(1, 9) : rnd(Math.pow(10, rods - 1), Math.pow(10, rods) - 1);
      ab.value = v; ab.update();
      $('#rdCover').classList.remove('on'); $('#rdMsg').textContent = 'Look!';
      await sleep(show * 1000); if (tok !== token) return null;
      $('#rdCover').classList.add('on'); $('#rdMsg').textContent = 'What number was it?';
      const ans = await P.ask(); if (tok !== token) return null;
      $('#rdCover').classList.remove('on');
      if (ans === v) {
        score++; streak++; misses = 0; show = Math.max(0.6, show * 0.85);
        $('#rdFb').textContent = 'Yes! ✓'; $('#rdFb').className = 'feedback ok'; a.Sfx.ok(); root.Fun.Mascot.react(bix(), 'happy');
        if (streak >= 3 && rods < maxR) { rods++; streak = 0; show = 2.2; $('#rdMsg').textContent = 'Super detective! One more rod! 🎉'; root.Fun.Mascot.say(bix(), 'More beads now!', 2000); await sleep(1500); }
        else await sleep(900);
      } else {
        streak = 0; misses++; show = Math.min(3.5, show * 1.25);
        $('#rdFb').innerHTML = `It was <b>${v}</b>`; $('#rdFb').className = 'feedback bad'; a.Sfx.soft(); root.Fun.Mascot.react(bix(), 'oops');
        if (misses >= 2 && rods > 1) { rods--; misses = 0; }
        await sleep(1800);
      }
    }
    setBar(100);
    return { score, of: N, rods: abRods };
  }

  /* =========================================================
     Bead Builder: "Make 47!" — set it on the abacus. Timed.
     ========================================================= */
  async function build(tok) {
    const a = App(), st = $('#gameStage'), i = a.nodeIndex();
    const rods = i >= a.idx('two_digit') ? 3 : i >= a.idx('add_direct') ? 2 : 1; const N = 8;
    st.innerHTML = `<div class="bd-wrap"><div class="bd-q"><div class="bd-k">Make</div><div class="bd-num" id="bdNum"></div><button class="btn ghost small" id="bdSay">🔊 Again</button><button class="btn ghost small" id="bdClear">Clear</button></div><div id="bdAb"></div></div>`;
    let want = null, hit = null;
    const ab = new root.Soroban($('#bdAb'), { rods: rods + 1, interactive: true, onChange: v => { if (want !== null && v === want && hit) { const h = hit; hit = null; h(); } } });
    ab.el.classList.add('big'); ab.showLabels = false; ab.update();
    $('#bdClear').onclick = () => { ab.reset(); a.Sfx.tap(); };
    $('#bdSay').onclick = () => { if (want !== null) a.say(want); };
    await a.voiceReady();
    const t0 = Date.now(); const tick = setInterval(() => setScore('⏱ ' + Math.floor((Date.now() - t0) / 1000) + 's'), 250);
    let lastV = -1;
    try {
      for (let k = 0; k < N; k++) {
        if (tok !== token) return null;
        setBar(100 * k / N); ab.reset();
        let v; do { v = rods === 1 ? rnd(1, 9) : rods === 2 ? (Math.random() < 0.2 ? rnd(1, 9) : rnd(10, 99)) : (Math.random() < 0.2 ? rnd(10, 99) : rnd(100, 999)); } while (v === lastV);
        lastV = v; want = v; $('#bdNum').textContent = v; $('#bdNum').classList.remove('pop'); void $('#bdNum').offsetWidth; $('#bdNum').classList.add('pop');
        a.say(v);
        await new Promise(r => { hit = r; });
        if (tok !== token) return null;
        a.Sfx.pop(); a.Sfx.ok(); root.Fun.Mascot.react(bix(), k === N - 1 ? 'cheer' : 'happy');
        if (k === 3) root.Fun.Mascot.say(bix(), 'Halfway!', 1500);
        await sleep(650);
      }
    } finally { clearInterval(tick); }
    setBar(100);
    return { time: Math.round((Date.now() - t0) / 100) / 10, n: N, rods };
  }

  /* ---------- runner ---------- */
  async function open(id) {
    const a = App(); const my = ++token; a.Sfx.tap(); a.unlock();
    const g = GAMES[id]; $('#gameTitle').textContent = g.icon + ' ' + g.name; setScore(''); setBar(100);
    root.Fun.Mascot.mount(bix(), { size: 76 });
    a.show('game');
    const r = id === 'pop' ? await pop(my) : id === 'reader' ? await reader(my) : await build(my);
    if (!r || my !== token) return;
    const best = root.Fun.data.best; let isBest = false, card;
    if (id === 'pop') {
      isBest = r.score > 0 && r.score > (best.pop || 0); if (isBest) best.pop = r.score;
      card = { icon: '🫧', big: `${r.score} friends!`, sub: 'popped in one minute', best: isBest, bestText: best.pop ? `Your best: ${best.pop}` : '' };
    } else if (id === 'reader') {
      isBest = r.score > (best.reader || 0); if (isBest) best.reader = r.score;
      card = { icon: '🔍', big: `${r.score} / ${r.of}`, sub: `beads read correctly · up to ${r.rods} rod${r.rods > 1 ? 's' : ''}`, best: isBest && r.score > 0, bestText: `Your best: ${best.reader}` };
    } else {
      const k = 'build' + r.rods; isBest = !best[k] || r.time < best[k]; if (isBest) best[k] = r.time;
      card = { icon: '🧱', big: `${r.time} seconds`, sub: `to make ${r.n} numbers`, best: isBest, bestText: `Your best: ${best[k]} s` };
    }
    root.Fun.save();
    root.Fun.Mascot.react(bix(), 'cheer', 2000); root.Fun.Mascot.say(bix(), isBest ? 'A new best! Wow!' : 'Great playing!', 3000);
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
      const el = document.createElement('button'); el.className = 'gcard'; el.dataset.game = id;
      el.innerHTML = `<div class="gc-icon">${g.icon}</div><div class="gc-name">${g.name}</div><div class="gc-desc">${g.desc}</div><div class="gc-best">${b ? '🏆 Best: ' + b + (id === 'build' ? ' s' : '') : 'New!'}</div>`;
      el.onclick = () => open(id); box.appendChild(el);
    }
  }
  root.Games = { GAMES, open, stop, renderHub, family };
})(typeof globalThis !== 'undefined' ? globalThis : this);
