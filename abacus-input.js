// AbacusInput: an interactive on-screen soroban a child uses to ANSWER problems.
// Browser: global `AbacusInput` (needs abacus-input.css; engine.js for checkMethod).
// Node: module.exports (pure parts only: Model, bead logic, checkMethod).
//
//   const ab = AbacusInput.create(container, { rods: 3, showReadout: true, onChange(value, lastMove) {}, onBead(move) {} });
//   readOnly: true -> a demo abacus (Show me, lessons): same drawing, no touch/keyboard input; setValue still animates it.
//   ab.value(); ab.setValue(15, { animate: false }); ab.clear(); ab.moves(sinceIndex); ab.destroy();
//   AbacusInput.checkMethod(startValue, term, movesLog) -> { ok, valueOk, expected, actual, hint }
//
// Rod 0 is the rightmost rod (ones), like soroban.js. Earth bead k=0 is the one nearest the beam.
(function (root) {
  'use strict';

  const ROD_NAMES = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands'];
  const rodName = r => ROD_NAMES[r] || ('rod ' + (r + 1));

  // ---------------------------------------------------------------- pure bead logic
  function rodBeads(v) { return { heaven: v >= 5, earth: v % 5 }; }

  // New rod value after touching a bead. kind 'h' | 'e'; k = earth index (0 nearest beam);
  // dir 'toward' (push to the beam), 'away', or 'toggle' (a tap: flips that bead, pushing its neighbours).
  function beadTarget(v, kind, k, dir) {
    const h = v >= 5 ? 5 : 0, e = v % 5;
    if (kind === 'h') {
      const on = dir === 'toward' ? true : dir === 'away' ? false : !h;
      return (on ? 5 : 0) + e;
    }
    const active = k < e;
    const on = dir === 'toward' ? true : dir === 'away' ? false : !active;
    if (on) return h + Math.max(e, k + 1);   // this bead and all between it and the beam go up
    return h + Math.min(e, k);                // this bead and all below it go down
  }

  function digitsOf(n, rods) {
    const out = [];
    n = Math.max(0, Math.floor(n));
    for (let i = 0; i < rods; i++) { out.push(n % 10); n = Math.floor(n / 10); }
    return out;
  }
  function rodsNeeded(n) { return Math.max(1, String(Math.max(0, Math.floor(n))).length); }

  // ---------------------------------------------------------------- model (no DOM)
  // Move log entry: { rod, bead: 'heaven'|'earth', delta, from, to, value, via, t }
  //   delta = signed change of the rod's value (heaven ±5, earth ±1..4). One gesture = one entry.
  class Model {
    constructor(rods) { this.rods = Math.max(1, rods || 3); this.d = new Array(this.rods).fill(0); this.log = []; }
    value() { return this.d.reduce((s, v, i) => s + v * Math.pow(10, i), 0); }
    setValue(n) {
      n = Math.max(0, Math.floor(+n || 0));
      if (rodsNeeded(n) > this.rods) this.rods = rodsNeeded(n);
      this.d = digitsOf(n, this.rods);
    }
    clear() { this.d.fill(0); this.log = []; }
    touch(rod, kind, k, dir, via) {
      if (rod < 0 || rod >= this.rods) return null;
      const from = this.d[rod], to = beadTarget(from, kind, k, dir || 'toggle');
      if (to === from) return null;
      this.d[rod] = to;
      const m = { rod, bead: kind === 'h' ? 'heaven' : 'earth', delta: to - from, from, to, value: this.value(), via: via || 'tap', t: Date.now() };
      this.log.push(m);
      return m;
    }
    moves(since) { return this.log.slice(since || 0).map(m => Object.assign({}, m)); }
  }

  // ---------------------------------------------------------------- method checking
  function getEngine(opts) {
    if (opts && opts.engine) return opts.engine;
    if (root.SorobanEngine) return root.SorobanEngine;
    if (typeof require === 'function') { try { return require('./engine.js'); } catch (e) { /* fall through */ } }
    throw new Error('AbacusInput.checkMethod needs engine.js (SorobanEngine)');
  }

  // Bead actions to change one rod from v by n (v+n stays in 0..9), the way a soroban does it.
  function rodActions(rod, v, n) {
    const e = v % 5, out = [];
    const push = (bead, delta) => { if (delta) out.push({ rod, bead, delta }); };
    if (n > 0) {
      if (n >= 5) { push('heaven', 5); push('earth', n - 5); }
      else if (e + n <= 4) push('earth', n);
      else { push('heaven', 5); push('earth', -(5 - n)); }       // small friend
    } else if (n < 0) {
      const m = -n;
      if (m >= 5) { push('heaven', -5); push('earth', -(m - 5)); }
      else if (e >= m) push('earth', -m);
      else { push('heaven', -5); push('earth', 5 - m); }         // small friend
    }
    return out;
  }

  // Expected technique for one term, built from engine.stepMoves.
  // Each stepMoves entry {rod, op, d, v, rule, carry} becomes the bead actions on its own rod:
  //   no carry/borrow: rod ±d;  ten/combined add: rod −(10−d) (the +1 on the next rod is its own carry entry);
  //   ten/combined sub: rod +(10−d) (the −1 is its own borrow entry). Direct vs small friend falls out of rodActions.
  function expectedFor(startValue, term, engine) {
    const sm = engine.stepMoves(startValue, term);
    const rodsVals = digitsOf(startValue, 14);
    const steps = sm.map(m => {
      const v = typeof m.v === 'number' ? m.v : rodsVals[m.rod];
      let n;
      if (m.op === 'add') n = v + m.d >= 10 ? m.d - 10 : m.d;
      else n = v - m.d < 0 ? 10 - m.d : -m.d;
      return { rod: m.rod, op: m.op, d: m.d, rule: m.rule, carry: !!m.carry, beads: rodActions(m.rod, v, n) };
    });
    return steps;
  }

  function collapseRuns(actions) {
    const out = [];
    for (const a of actions) {
      const last = out[out.length - 1];
      if (last && last.rod === a.rod && last.bead === a.bead) {
        last.delta += a.delta;
        if (!last.delta) out.pop();
      } else out.push({ rod: a.rod, bead: a.bead, delta: a.delta });
    }
    return out;
  }
  // Order-free fingerprint: total movement toward / away from the beam per rod and bead type.
  function fingerprint(actions) {
    const f = {};
    for (const a of actions) {
      const key = a.rod + ':' + a.bead + ':' + (a.delta > 0 ? 'up' : 'down');
      f[key] = (f[key] || 0) + Math.abs(a.delta);
    }
    return Object.keys(f).sort().map(k => k + '=' + f[k]).join(',');
  }

  const fmt = n => (n > 0 ? '+' : '−') + Math.abs(n);
  function describe(actions) {
    // Group consecutive actions on the same rod: "+5 −2 on ones"
    const parts = [];
    for (const a of actions) {
      const last = parts[parts.length - 1];
      if (last && last.rod === a.rod) last.n.push(a.delta); else parts.push({ rod: a.rod, n: [a.delta] });
    }
    return parts.map(p => p.n.map(fmt).join(' ') + ' on ' + rodName(p.rod)).join(', ');
  }

  const RANK = { direct: 0, five: 1, ten: 2, combined: 3 };
  function hintFor(m, multiRod) {
    const d = m.d, c = 10 - d, on = multiRod ? ' on the ' + rodName(m.rod) + ' rod' : '';
    const add = m.op === 'add';
    switch (m.rule) {
      case 'five': return add ? `Try the small friend${on}: add 5, take away ${5 - d}.` : `Try the small friend${on}: take away 5, add ${5 - d}.`;
      case 'ten': return add ? `Try the big friend${on}: add 10, take away ${c}.` : `Try the big friend${on}: take away 10, add ${c}.`;
      case 'combined': return add
        ? `Try both friends${on}: add 10, take away ${c} (take away 5, add ${d - 5}).`
        : `Try both friends${on}: take away 10, add ${c} (add 5, take away ${d - 5}).`;
      default: return add ? `Just add ${d} right${on || ' on the ones rod'}.` : `Just take away ${d} right${on || ' on the ones rod'}.`;
    }
  }
  function praiseFor(rule) {
    return ({ five: 'Nice! You used the small friend.', ten: 'Nice! You used the big friend.',
      combined: 'Wow! You used both friends.' })[rule] || 'Nice, right on the beads!';
  }

  function checkMethod(startValue, term, movesLog, opts) {
    const engine = getEngine(opts);
    startValue = Math.floor(+startValue || 0); term = Math.floor(+term || 0);
    const target = startValue + term;
    const steps = term ? expectedFor(startValue, term, engine) : [];
    const expBeads = [];
    // Teaching order: each digit's own rod first, then its carry/borrow (stepMoves lists carries first).
    // stepMoves is post-order (a carry is listed before the digit that caused it), so for display
    // put each digit first and then its carry chain, innermost carry first.
    const main = steps.filter(s => !s.carry);
    const display = [];
    let pending = [];
    for (const s of steps) { if (s.carry) pending.push(s); else { display.push(s); for (let j = pending.length - 1; j >= 0; j--) display.push(pending[j]); pending = []; } }
    display.push(...pending.reverse());
    display.forEach(s => expBeads.push(...s.beads));

    const log = (movesLog || []).filter(m => m && typeof m.delta === 'number' && typeof m.rod === 'number')
      .map(m => ({ rod: m.rod, bead: m.bead === 'heaven' || m.bead === 'h' ? 'heaven' : 'earth', delta: m.delta }));
    const endValue = startValue + log.reduce((s, m) => s + m.delta * Math.pow(10, m.rod), 0);
    const valueOk = endValue === target;
    const actCollapsed = collapseRuns(log);

    // Tolerant match: same total bead movement per rod/bead type (order-free), either counting every
    // tap (raw) or after merging back-and-forth fiddling on the same beads (collapsed).
    const methodOk = valueOk && (fingerprint(log) === fingerprint(expBeads) ||
      fingerprint(actCollapsed) === fingerprint(collapseRuns(expBeads)));

    const rules = Array.from(new Set(steps.filter(s => !(s.carry && s.rule === 'direct')).map(s => s.rule)));
    const top = main.slice().sort((a, b) => RANK[b.rule] - RANK[a.rule])[0] || null;
    const multiRod = main.length > 1;
    let hint;
    if (!term) hint = valueOk ? 'Nothing to move this time!' : `Put the beads back to ${startValue}.`;
    else if (methodOk) hint = praiseFor(top && top.rule);
    else {
      // Point at the digit whose rod (or carry rod) moved differently from the plan.
      const bad = new Set();
      const exRod = {}, acRod = {};
      expBeads.forEach(a => { (exRod[a.rod] = exRod[a.rod] || []).push(a); });
      log.forEach(a => { (acRod[a.rod] = acRod[a.rod] || []).push(a); });
      new Set([...Object.keys(exRod), ...Object.keys(acRod)]).forEach(r => {
        if (fingerprint(collapseRuns(exRod[r] || [])) !== fingerprint(collapseRuns(acRod[r] || []))) bad.add(+r);
      });
      const cands = main.filter(s => bad.has(s.rod) || (s.rule === 'ten' || s.rule === 'combined') && bad.has(s.rod + 1));
      const pick = (cands.length ? cands : main).slice().sort((a, b) => RANK[b.rule] - RANK[a.rule])[0];
      hint = pick ? hintFor(pick, multiRod) : 'Try again on the beads.';
    }

    return {
      ok: !!methodOk,
      valueOk,
      expected: {
        value: target,
        rules,
        steps: display.map(s => ({ rod: s.rod, op: s.op, d: s.d, rule: s.rule, carry: s.carry, beads: s.beads })),
        beads: expBeads,
        text: describe(expBeads),
      },
      actual: { value: endValue, beads: actCollapsed, moves: log.length, text: describe(actCollapsed) },
      hint,
    };
  }

  // ---------------------------------------------------------------- view (DOM / SVG)
  const SVGNS = 'http://www.w3.org/2000/svg';
  const G = { P: 34, BW: 58, ROD: 136, FR: 22, PADX: 14, HH: 74, BM: 14, EH: 176 };
  G.beamY = G.FR + G.HH; G.earthTop = G.beamY + G.BM; G.H = G.earthTop + G.EH + G.FR;
  const LENS = 'M -58 0 Q 0 -32 58 0 Q 0 32 -58 0 Z';
  function heavenY(on) { return on ? G.beamY - G.P / 2 - 1 : G.FR + 3 + G.P / 2; }
  function earthY(k, on) { return G.earthTop + 1 + G.P / 2 + k * G.P + (on ? 0 : G.P + 3); }

  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function create(container, opts) {
    opts = opts || {};
    const model = new Model(opts.rods || 3);
    const minRods = model.rods;
    const scale = opts.scale || 1.4;            // 1.4 => bead slot ~48px tall on screen
    let showReadout = opts.showReadout !== false;
    const readOnly = !!opts.readOnly;
    const wrap = document.createElement('div');
    wrap.className = 'abx' + (readOnly ? ' abx-readonly' : '');
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-roledescription', 'abacus');
    const live = document.createElement('div');
    live.className = 'abx-sr'; live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
    const readout = document.createElement('div');
    readout.className = 'abx-readout'; readout.setAttribute('aria-hidden', 'true');
    let svg, rodEls = [], gestures = new Map(), destroyed = false;

    function build() {
      if (svg) svg.remove();
      rodEls = [];
      const W = 2 * G.FR + 2 * G.PADX + model.rods * G.ROD;
      svg = el('svg', { viewBox: `0 -2 ${W} ${G.H + 8}`, class: 'abx-svg', width: W * scale, height: (G.H + 8) * scale, focusable: 'false' });
      el('rect', { x: 0, y: 6, width: W, height: G.H, rx: 14, class: 'abx-frame-shadow' }, svg);
      el('rect', { x: 0, y: 0, width: W, height: G.H, rx: 14, class: 'abx-frame' }, svg);
      el('rect', { x: G.FR, y: G.FR, width: W - 2 * G.FR, height: G.H - 2 * G.FR, rx: 4, class: 'abx-inner' }, svg);
      const rodsG = el('g', {}, svg);
      el('rect', { x: G.FR, y: G.beamY, width: W - 2 * G.FR, height: G.BM, class: 'abx-beam' }, svg);
      for (let j = 0; j < model.rods; j++) {
        const r = model.rods - 1 - j;                 // leftmost drawn first; rod 0 = ones at the right
        const x = G.FR + G.PADX + G.ROD / 2 + j * G.ROD;
        const g = el('g', readOnly ? { class: 'abx-rod', role: 'group', 'data-rod': r } : { class: 'abx-rod', role: 'group', 'data-rod': r, tabindex: r === 0 ? 0 : -1 }, rodsG);
        el('rect', { x: x - 4, y: G.FR, width: 8, height: G.H - 2 * G.FR, class: 'abx-rodline' }, g);
        const beads = [];
        const mk = (kind, k) => {
          const b = el('g', { class: 'abx-bead', 'data-kind': kind, 'data-k': k, 'aria-hidden': 'true' }, g);
          el('rect', { x: -G.ROD / 2 + 2, y: -G.P / 2, width: G.ROD - 4, height: G.P, class: 'abx-hit' }, b);
          el('path', { d: LENS, class: 'abx-lens' }, b);
          el('path', { d: 'M -46 -4 Q 0 -18 46 -4', class: 'abx-shine' }, b);
          beads.push(b); return b;
        };
        const h = mk('h', 0); const es = [0, 1, 2, 3].map(k => mk('e', k));
        rodEls[r] = { g, x, h, es };
        if (r % 3 === 0) el('circle', { cx: x, cy: G.beamY + G.BM / 2, r: 3.2, class: 'abx-dot' }, svg);
      }
      if (!readOnly) {
        svg.addEventListener('pointerdown', onDown);
        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onUp);
        svg.addEventListener('pointercancel', onCancel);
        svg.addEventListener('keydown', onKey);
      }
      wrap.insertBefore(svg, wrap.firstChild);
      paint();
    }

    function paint() {
      for (let r = 0; r < model.rods; r++) {
        const R = rodEls[r], v = model.d[r], b = rodBeads(v);
        place(R.h, R.x, heavenY(b.heaven), b.heaven);
        R.es.forEach((e, k) => place(e, R.x, earthY(k, k < b.earth), k < b.earth));
        R.g.setAttribute('aria-label', `${rodName(r)} rod: ${v}`);
      }
      const v = model.value();
      wrap.setAttribute('aria-label', `Abacus showing ${v}`);
      live.textContent = `Abacus shows ${v}`;
      readout.innerHTML = 'beads show <b>' + v + '</b>';
      readout.hidden = !showReadout;
    }
    function place(b, x, y, on) {
      b.style.transform = `translate(${x}px, ${y}px)`;
      b.classList.toggle('on', on);
    }

    function hitInfo(target) {
      const b = target.closest && target.closest('.abx-bead');
      if (!b) return null;
      return { rod: +b.parentNode.getAttribute('data-rod'), kind: b.getAttribute('data-kind'), k: +b.getAttribute('data-k') };
    }
    function unitsPerPx() { const rc = svg.getBoundingClientRect(); return rc.height ? (G.H + 8) / rc.height : 1 / scale; }
    function commit(rod, kind, k, dir, via) {
      const m = model.touch(rod, kind, k, dir, via);
      if (!m) return;
      paint();
      if (opts.onBead) try { opts.onBead(m); } catch (e) { /* sound hook must not break input */ }
      if (opts.onChange) opts.onChange(model.value(), m);
    }
    function onDown(e) {
      const hit = hitInfo(e.target); if (!hit) return;
      e.preventDefault();
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      gestures.set(e.pointerId, Object.assign(hit, { y0: e.clientY, moved: false }));
    }
    function onMove(e) {
      const g = gestures.get(e.pointerId); if (!g) return;
      const dy = (e.clientY - g.y0) * unitsPerPx();
      if (Math.abs(dy) < 12) return;
      const down = dy > 0;
      const dir = g.kind === 'h' ? (down ? 'toward' : 'away') : (down ? 'away' : 'toward');
      g.moved = true; g.y0 = e.clientY;
      commit(g.rod, g.kind, g.k, dir, 'drag');
    }
    function onUp(e) {
      const g = gestures.get(e.pointerId); if (!g) return;
      gestures.delete(e.pointerId);
      if (!g.moved) commit(g.rod, g.kind, g.k, 'toggle', 'tap');
    }
    function onCancel(e) { gestures.delete(e.pointerId); }
    // Keyboard (also hardware keyboards on iPad): on a focused rod, Up/Down move one earth bead,
    // PageUp/PageDown move the heaven bead; Left/Right change rods.
    function onKey(e) {
      const rg = e.target.closest && e.target.closest('.abx-rod'); if (!rg) return;
      const r = +rg.getAttribute('data-rod'), e5 = model.d[r] % 5;
      const keys = {
        ArrowUp: () => commit(r, 'e', e5, 'toward', 'key'),
        ArrowDown: () => e5 && commit(r, 'e', e5 - 1, 'away', 'key'),
        PageUp: () => commit(r, 'h', 0, 'away', 'key'),
        PageDown: () => commit(r, 'h', 0, 'toward', 'key'),
        ArrowLeft: () => focusRod(r + 1), ArrowRight: () => focusRod(r - 1),
      };
      if (!keys[e.key]) return;
      e.preventDefault(); keys[e.key]();
    }
    function focusRod(r) {
      if (!rodEls[r]) return;
      rodEls.forEach((R, i) => R.g.setAttribute('tabindex', i === r ? 0 : -1));
      rodEls[r].g.focus();
    }

    wrap.appendChild(readout); wrap.appendChild(live);
    container.appendChild(wrap);
    build();

    function noAnim(fn) {
      wrap.classList.add('abx-noanim'); fn();
      void wrap.offsetWidth;          // flush styles so the jump is not animated
      wrap.classList.remove('abx-noanim');
    }

    const api = {
      el: wrap,
      value: () => model.value(),
      setValue(n, o) {
        const before = model.rods;
        const animate = !o || o.animate !== false;
        const run = () => { model.setValue(n); if (model.rods !== before) build(); else paint(); };
        animate ? run() : noAnim(run);
        return api;
      },
      clear(o) {
        const run = () => { model.clear(); if (model.rods !== minRods) { model.rods = minRods; model.d = new Array(minRods).fill(0); build(); } else paint(); };
        (o && o.animate === false) ? noAnim(run) : run();
        return api;
      },
      moves: since => model.moves(since),
      rods: () => model.rods,
      readOnly,
      setReadout(on) { showReadout = !!on; paint(); return api; },
      destroy() {
        if (destroyed) return; destroyed = true;
        gestures.clear(); wrap.remove();
      },
    };
    return api;
  }

  const AbacusInput = { create, checkMethod, Model, beadTarget, rodBeads, digitsOf, rodActions, expectedFor, ROD_NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = AbacusInput;
  else root.AbacusInput = AbacusInput;
})(typeof globalThis !== 'undefined' ? globalThis : this);
