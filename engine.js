// Soroban rule classifier + rule-aware problem generator.
// Works in browser (global `SorobanEngine`) and Node (module.exports).

(function (root) {
  'use strict';

  const RULES = { DIRECT: 'direct', FIVE: 'five', TEN: 'ten', COMBINED: 'combined' };

  // --- Single-rod classification ---------------------------------------
  // v: current rod value 0..9, d: digit 1..9
  function classifySubNoBorrow(v, d) {            // precondition v >= d
    return (d >= 5 || (v % 5) >= d) ? RULES.DIRECT : RULES.FIVE;
  }
  function classifyAdd(v, d) {
    const e = v % 5;
    if (v + d <= 9) return (d >= 5 || e + d <= 4) ? RULES.DIRECT : RULES.FIVE;
    // carry: this rod does (v - (10-d)), left rod +1
    return classifySubNoBorrow(v, 10 - d) === RULES.FIVE ? RULES.COMBINED : RULES.TEN;
  }
  function classifySub(v, d) {
    if (v - d >= 0) return classifySubNoBorrow(v, d);
    // borrow: this rod does (v + (10-d)), left rod -1
    const c = 10 - d, e = v % 5;
    return (c < 5 && e + c > 4) ? RULES.COMBINED : RULES.TEN;
  }

  // --- Whole-number step: which rules are used, including carries/borrows
  function stepRules(total, delta) {
    if (total < 0 || total + delta < 0) throw new Error('negative total');
    const rules = new Set();
    const op = delta >= 0 ? 'add' : 'sub';
    const digits = String(Math.abs(delta)).split('').reverse().map(Number);
    const rods = String(total).padStart(12, '0').split('').reverse().map(Number);
    // isCarry: the +1/-1 propagated to the left rod is part of the ten-move;
    // only record it if it needs a trick of its own (five / ten / combined).
    function applyDigit(i, d, isCarry) {
      if (d === 0) return;
      const v = rods[i];
      let r;
      if (op === 'add') {
        r = classifyAdd(v, d);
        if (v + d >= 10) { rods[i] = v + d - 10; applyDigit(i + 1, 1, true); }
        else rods[i] = v + d;
      } else {
        r = classifySub(v, d);
        if (v - d < 0) { rods[i] = v - d + 10; applyDigit(i + 1, 1, true); }
        else rods[i] = v - d;
      }
      if (!(isCarry && r === RULES.DIRECT)) rules.add(r);
    }
    digits.forEach((d, i) => applyDigit(i, d, false));
    return rules;
  }

  // --- Generator -------------------------------------------------------
  // config:
  //   allowedRules: Set/array of rule names permitted
  //   requiredRules: Set/array; at least one step in the problem must use one (optional)
  //   operands: number of terms (first term is always positive)
  //   digits: 1..4  operand digit band (each |term| in [1, 10^digits - 1]); fast for 1-4 (see deltaSampler)
  //   maxTotal: running total ceiling (default 10^digits - 1 ... caller decides)
  //   allowSubtraction: bool
  //   allowZeroIntermediate: bool (default false)
  //   allowBorrow: bool (default true) - if false, no borrows at all
  //   rng: () => [0,1)
  function makeRng(seed) {
    let s = seed >>> 0 || 123456789;
    return function () { // mulberry32
      s += 0x6D2B79F5;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normSet(x) { return x instanceof Set ? x : new Set(x || []); }
  function subsetOf(a, b) { for (const r of a) if (!b.has(r)) return false; return true; }
  function intersects(a, b) { for (const r of a) if (b.has(r)) return true; return false; }

  function legalDeltas(total, cfg, isFirst) {
    const allowed = normSet(cfg.allowedRules);
    const hi = Math.pow(10, cfg.digits) - 1;
    const out = [];
    for (let m = 1; m <= hi; m++) {
      const cands = (isFirst || !cfg.allowSubtraction) ? [m] : [m, -m];
      for (const delta of cands) {
        const t = total + delta;
        if (t < 0 || t > cfg.maxTotal) continue;
        if (t === 0 && !cfg.allowZeroIntermediate) continue;
        const rules = stepRules(total, delta);
        if (!subsetOf(rules, allowed)) continue;
        if (cfg.allowBorrow === false && delta < 0 && String(total).length > String(t).length) continue;
        out.push({ delta, rules });
      }
    }
    return out;
  }

  // --- Fast exact sampler for one term slot -----------------------------
  // legalDeltas / legalDeltas2 build the full ordered list of legal terms for a slot:
  //   for m = lo..hi: [+m] then [-m] (minus only when subtraction is on and it is not the first slot),
  //   keeping a term only if the running total stays in range and every bead move is allowed.
  // That is 10^digits x stepMoves calls per slot: fine for 1-2 digits, far too slow for 3-4.
  // deltaSampler gives the SAME list without building it: a digit DP (units rod first, carry/borrow
  // state 0/1) counts the legal terms, and pick(k) "unranks" the k-th entry of that ordered list.
  // Same list + same order + same rng calls => generators return exactly what the slow path returned.
  //
  // Why a carry bit is enough: stepMoves applies digits units-first and cascades every carry at once,
  // so when digit i is applied the rods >= i always hold floor(total/10^i) +/- c with c in {0,1}.
  // The moves digit i produces (its own move plus the cascade) depend only on (i, c, digit).
  // Range rules (total <= maxTotal, no zero total, firstMax, minTerm, allowBorrow:false) all reduce to
  // an interval L <= m <= U, tracked with two compare states (low digits of m vs low digits of L/U).
  const CMP_LT = 0, CMP_EQ = 1, CMP_GT = 2;
  function digitsOf(n, len) { const a = []; for (let i = 0; i < len; i++) { a.push(n % 10); n = Math.floor(n / 10); } return a; }
  // Moves for applying digit d at rod `base` of the number h (rods below `base` ignored); same shape and
  // order as stepMoves: {rod, op, d, v, rule, carry}. Caller guarantees no borrow past the top.
  function rodMoves(h, base, op, d) {
    const rods = digitsOf(h, 18), moves = [];
    (function apply(i, dd, carry) {
      if (dd === 0) return;
      const v = rods[i];
      let rule;
      if (op === 'add') { rule = classifyAdd(v, dd); if (v + dd >= 10) { rods[i] = v + dd - 10; apply(i + 1, 1, true); } else rods[i] = v + dd; }
      else { rule = classifySub(v, dd); if (v - dd < 0) { rods[i] = v - dd + 10; apply(i + 1, 1, true); } else rods[i] = v - dd; }
      moves.push({ rod: base + i, op, d: dd, v, rule, carry: !!carry });
    })(0, d, false);
    return moves;
  }
  // One operation (add or sub) over m in [L, U] with D digits. Returns null when the interval is empty.
  // State index: ((carry*3 + cmpLo)*3 + cmpHi)*2 + hit   (hit = some move satisfied `req`)
  function opTable(total, op, D, L, U, allowMove, req) {
    if (!(L <= U)) return null;
    const s = op === 'add' ? 1 : -1, Ld = digitsOf(L, D), Ud = digitsOf(U, D);
    const H = []; for (let i = 0, h = total; i <= D; i++, h = Math.floor(h / 10)) H.push(h);
    const trans = [];                       // trans[i][c*10+d] = {cout, hit} or null (illegal)
    for (let i = 0; i < D; i++) {
      const row = new Array(20).fill(null);
      for (let c = 0; c < 2; c++) {
        const hc = H[i] + s * c;
        if (hc < 0) continue;
        for (let d = 0; d < 10; d++) {
          let hit = 0;
          if (d) {
            if (s < 0 && hc - d < 0) continue;      // would borrow past the top rod: total would go negative
            const ms = rodMoves(hc, i, op, d);
            if (!ms.every(allowMove)) continue;
            if (req && ms.some(req)) hit = 1;
          }
          row[c * 10 + d] = { cout: s * (Math.floor((hc + s * d) / 10) - H[i + 1]), hit };
        }
      }
      trans.push(row);
    }
    const idx = (c, lo, hi, hit) => ((c * 3 + lo) * 3 + hi) * 2 + hit;
    const step = (st, i, d) => {
      const hit = st & 1, hi = (st >> 1) % 3, lo = Math.floor((st >> 1) / 3) % 3, c = Math.floor(st / 18);
      const t = trans[i][c * 10 + d];
      if (!t) return -1;
      const nlo = d > Ld[i] ? CMP_GT : d < Ld[i] ? CMP_LT : lo, nhi = d > Ud[i] ? CMP_GT : d < Ud[i] ? CMP_LT : hi;
      return idx(t.cout, nlo, nhi, hit | t.hit);
    };
    const accept = (st, hitOnly) => {
      const hi = (st >> 1) % 3, lo = Math.floor((st >> 1) / 3) % 3;
      return lo !== CMP_LT && hi !== CMP_GT && (!hitOnly || (st & 1) === 1);
    };
    const f = [new Float64Array(36)]; f[0][idx(0, CMP_EQ, CMP_EQ, 0)] = 1;   // f[i][st]: ways to fill digits < i
    for (let i = 0; i < D; i++) {
      const nf = new Float64Array(36);
      for (let st = 0; st < 36; st++) { if (!f[i][st]) continue; for (let d = 0; d < 10; d++) { const ns = step(st, i, d); if (ns >= 0) nf[ns] += f[i][st]; } }
      f.push(nf);
    }
    return { s, D, f, step, accept, init: idx(0, CMP_EQ, CMP_EQ, 0),
      count(hitOnly) { let n = 0; for (let st = 0; st < 36; st++) if (accept(st, hitOnly)) n += f[D][st]; return n; } };
  }
  // cfg fields used: digits, minTerm, maxTotal, firstMax, allowSubtraction, allowZeroIntermediate, allowBorrow.
  // Returns { count(hitOnly) -> n, pick(k, hitOnly) -> delta } where pick(k) is entry k of the ordered
  // legal list (or of its sub-list of terms with a `req` move when hitOnly).
  function deltaSampler(total, cfg, isFirst, allowMove, req) {
    const D = Math.floor(cfg.digits) || 0;
    const hi = Math.pow(10, D) - 1, lo = Math.max(1, cfg.minTerm || 1);
    const mt = (cfg.maxTotal === undefined || isNaN(Number(cfg.maxTotal))) ? Infinity : Number(cfg.maxTotal);
    const tables = [];
    if (D >= 1) {
      let U = Math.min(hi, Math.floor(mt - total));
      if (isFirst && cfg.firstMax) U = Math.min(U, Math.floor(cfg.firstMax));
      tables.push(opTable(total, 'add', D, Math.ceil(lo), U, allowMove, req));
      if (!isFirst && cfg.allowSubtraction) {
        let Us = Math.min(hi, total - (cfg.allowZeroIntermediate ? 0 : 1));
        const len = String(total).length;
        if (cfg.allowBorrow === false && len >= 2) Us = Math.min(Us, total - Math.pow(10, len - 1));
        tables.push(opTable(total, 'sub', D, Math.max(Math.ceil(lo), Math.ceil(total - mt)), Us, allowMove, req));
      }
    }
    const live = tables.filter(Boolean);
    function count(hitOnly) { let n = 0; for (const t of live) n += t.count(hitOnly); return n; }
    function pick(k, hitOnly) {
      // acc[t][st]: from state st at the current level, the digits already fixed above lead to an accepted term
      let acc = live.map(t => { const a = new Uint8Array(36); for (let st = 0; st < 36; st++) a[st] = t.accept(st, hitOnly) ? 1 : 0; return a; });
      let m = 0;
      for (let i = D - 1; i >= 0; i--) {             // most significant digit first = ascending m order
        let chosen = -1;
        for (let d = 0; d < 10 && chosen < 0; d++) {
          let n = 0;
          live.forEach((t, j) => { const fi = t.f[i]; for (let st = 0; st < 36; st++) if (fi[st]) { const ns = t.step(st, i, d); if (ns >= 0 && acc[j][ns]) n += fi[st]; } });
          if (k < n) chosen = d; else k -= n;
        }
        if (chosen < 0) throw new Error('deltaSampler: index out of range');
        acc = live.map((t, j) => { const a = new Uint8Array(36); for (let st = 0; st < 36; st++) { const ns = t.step(st, i, chosen); a[st] = ns >= 0 && acc[j][ns] ? 1 : 0; } return a; });
        m = m * 10 + chosen;
      }
      for (let j = 0; j < live.length; j++) if (acc[j][live[j].init]) { if (k === 0) return live[j].s * m; k--; }
      throw new Error('deltaSampler: index out of range');
    }
    return { count, pick };
  }

  function generateProblem(cfg, rng) {
    rng = rng || cfg.rng || Math.random;
    const required = normSet(cfg.requiredRules), allowed = normSet(cfg.allowedRules);
    const carryDirect = m => m.carry && m.rule === RULES.DIRECT;   // stepRules never records these
    const allowMove = m => carryDirect(m) || allowed.has(m.rule);
    const req = required.size ? (m => !carryDirect(m) && required.has(m.rule)) : null;
    const scfg = { digits: cfg.digits, maxTotal: cfg.maxTotal, allowSubtraction: cfg.allowSubtraction, allowZeroIntermediate: cfg.allowZeroIntermediate, allowBorrow: cfg.allowBorrow };
    for (let attempt = 0; attempt < 200; attempt++) {
      let total = 0;
      const terms = [], stepRuleSets = [];
      let ok = true;
      for (let i = 0; i < cfg.operands; i++) {
        // Same pool and rng use as the original legalDeltas loop (see deltaSampler).
        const S = deltaSampler(total, scfg, i === 0, allowMove, req);
        let N = S.count(false), hitOnly = false;
        if (!N) { ok = false; break; }
        // Bias: if required rules not yet hit and some legal delta hits them, prefer those on later slots
        if (req && i >= 1) {
          const hitSoFar = stepRuleSets.some(s => intersects(s, required));
          const nh = hitSoFar ? 0 : S.count(true);
          if (!hitSoFar && nh && rng() < 0.7) { hitOnly = true; N = nh; }
        }
        const delta = S.pick(Math.floor(rng() * N), hitOnly);
        terms.push(delta);
        stepRuleSets.push(stepRules(total, delta));
        total += delta;
      }
      if (!ok) continue;
      if (required.size && !stepRuleSets.some(s => intersects(s, required))) continue;
      return {
        terms,
        answer: total,
        stepRules: stepRuleSets.map(s => Array.from(s)),
        rulesUsed: Array.from(new Set(stepRuleSets.flatMap(s => Array.from(s)))),
      };
    }
    return null;
  }

  function generateSet(cfg, count, rng) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < count; i++) {
      let p = null;
      for (let k = 0; k < 20; k++) {
        p = generateProblem(cfg, rng);
        if (!p) break;
        const key = p.terms.join(',');
        if (!seen.has(key)) { seen.add(key); break; }
      }
      if (!p) throw new Error('generator could not satisfy config');
      out.push(p);
    }
    return out;
  }

  // Preset levels (Phase 1). Phase 2 expands into a skill tree.
  const LEVELS = {
    direct_add:  { label: 'Direct add',           allowedRules: ['direct'], requiredRules: [], operands: 4, digits: 1, maxTotal: 9,  allowSubtraction: false },
    direct_sub:  { label: 'Direct add & subtract', allowedRules: ['direct'], requiredRules: [], operands: 4, digits: 1, maxTotal: 9,  allowSubtraction: true },
    five_family: { label: '5 family (small friends)', allowedRules: ['direct','five'], requiredRules: ['five'], operands: 4, digits: 1, maxTotal: 9, allowSubtraction: true },
    ten_family:  { label: '10 family (big friends)', allowedRules: ['direct','five','ten'], requiredRules: ['ten'], operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true },
    combined:    { label: 'Combined (both friends)', allowedRules: ['direct','five','ten','combined'], requiredRules: ['combined'], operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true },
    two_digit:   { label: '2-digit mixed',         allowedRules: ['direct','five','ten','combined'], requiredRules: [], operands: 5, digits: 2, maxTotal: 999, allowSubtraction: true },
  };

  const api = { RULES, classifyAdd, classifySub, classifySubNoBorrow, stepRules, legalDeltas, generateProblem, generateSet, makeRng, LEVELS, deltaSampler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SorobanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ---- Phase 2 extension: per-move detail and move-level allow/require ---- */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : root.SorobanEngine;
  const R = E.RULES;

  // Every bead "move" a step needs: {rod, op:'add'|'sub', d, rule, carry:boolean}
  // rod 0 = units. Carry/borrow propagations are included with carry:true.
  // Digits are classified units rod first (the generator's rule gating relies on this). Children and
  // Curriculum.explain work left to right. For 1-digit terms both orders give identical moves (tested);
  // for multi-digit terms they can differ (e.g. 41+59: units-first sees a 5-friend on the tens carry,
  // left-to-right does not). Only matters for a future multi-digit node that restricts rules.
  function stepMoves(total, delta) {
    if (total < 0 || total + delta < 0) throw new Error('negative total');
    const moves = [];
    const op = delta >= 0 ? 'add' : 'sub';
    const digits = String(Math.abs(delta)).split('').reverse().map(Number);
    const rods = String(total).padStart(12, '0').split('').reverse().map(Number);
    function apply(i, d, carry) {
      if (d === 0) return;
      const v = rods[i];
      let rule;
      if (op === 'add') { rule = E.classifyAdd(v, d); if (v + d >= 10) { rods[i] = v + d - 10; apply(i + 1, 1, true); } else rods[i] = v + d; }
      else { rule = E.classifySub(v, d); if (v - d < 0) { rods[i] = v - d + 10; apply(i + 1, 1, true); } else rods[i] = v - d; }
      moves.push({ rod: i, op, d, v, rule, carry: !!carry });
    }
    digits.forEach((d, i) => apply(i, d, false));
    return moves;
  }
  // Move key like "add:ten:7" (op:rule:digit)
  function moveKey(m) { return m.op + ':' + m.rule + ':' + m.d; }

  // Generator variant with move-level predicates:
  //   cfg.allowMove(m) -> bool   (default: rule in cfg.allowedRules; carry-direct moves always ok)
  //   cfg.requireMove(m) -> bool (optional: at least one step must contain such a move)
  function legalDeltas2(total, cfg, isFirst) {
    const allowed = cfg.allowedRules ? new Set(cfg.allowedRules) : null;
    const allowMove = cfg.allowMove || (m => (m.carry && m.rule === R.DIRECT) || !allowed || allowed.has(m.rule));
    const hi = Math.pow(10, cfg.digits) - 1, lo = cfg.minTerm || 1;
    const out = [];
    for (let m = lo; m <= hi; m++) {
      const cands = (isFirst || !cfg.allowSubtraction) ? [m] : [m, -m];
      for (const delta of cands) {
        const t = total + delta;
        if (t < 0 || t > cfg.maxTotal) continue;
        if (t === 0 && !cfg.allowZeroIntermediate) continue;
        if (isFirst && cfg.firstMax && delta > cfg.firstMax) continue;
        const moves = stepMoves(total, delta);
        if (!moves.every(allowMove)) continue;
        if (cfg.allowBorrow === false && delta < 0 && String(total).length > String(t).length) continue;
        out.push({ delta, moves });
      }
    }
    return out;
  }
  // legalDeltas2 is kept as the readable reference (and for tests); generation no longer calls it.
  function defaultAllowMove(cfg) {
    const allowed = cfg.allowedRules ? new Set(cfg.allowedRules) : null;
    return cfg.allowMove || (m => (m.carry && m.rule === R.DIRECT) || !allowed || allowed.has(m.rule));
  }
  function generateProblem2(cfg, rng) {
    rng = rng || cfg.rng || Math.random;
    const req = cfg.requireMove || null;
    const allowMove = defaultAllowMove(cfg);
    // operandsMax (optional): rows vary from operands to operandsMax terms (one rng call, only when set).
    const nOps = cfg.operandsMax > cfg.operands ? cfg.operands + Math.floor(rng() * (cfg.operandsMax - cfg.operands + 1)) : cfg.operands;
    for (let attempt = 0; attempt < 300; attempt++) {
      let total = 0; const terms = [], stepMovesList = []; let ok = true;
      for (let i = 0; i < nOps; i++) {
        // Exactly the pool legalDeltas2 would build, sampled with the same rng calls (see deltaSampler).
        const S = E.deltaSampler(total, cfg, i === 0, allowMove, req);
        let N = S.count(false), hitOnly = false;
        if (!N) { ok = false; break; }
        if (req && i >= 1) {
          const hitSoFar = stepMovesList.some(ms => ms.some(req));
          const nh = hitSoFar ? 0 : S.count(true);
          if (!hitSoFar && nh && rng() < 0.75) { hitOnly = true; N = nh; }
        }
        const delta = S.pick(Math.floor(rng() * N), hitOnly);
        terms.push(delta); stepMovesList.push(stepMoves(total, delta)); total += delta;
      }
      if (!ok) continue;
      if (req && !stepMovesList.some(ms => ms.some(req))) continue;
      const rulesUsed = Array.from(new Set(stepMovesList.flatMap(ms => ms.filter(m => !(m.carry && m.rule === R.DIRECT)).map(m => m.rule))));
      return { terms, answer: total, moves: stepMovesList, rulesUsed, moveKeys: Array.from(new Set(stepMovesList.flatMap(ms => ms.map(moveKey)))) };
    }
    return null;
  }
  function generateSet2(cfg, count, rng) {
    const out = [], seen = new Set();
    for (let i = 0; i < count; i++) {
      let p = null;
      for (let k = 0; k < 25; k++) { p = generateProblem2(cfg, rng); if (!p) break; const key = p.terms.join(','); if (!seen.has(key)) { seen.add(key); break; } }
      if (!p) throw new Error('generator could not satisfy config');
      out.push(p);
    }
    return out;
  }
  Object.assign(E, { stepMoves, moveKey, legalDeltas2, generateProblem2, generateSet2 });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ---- Phase 3: level tests (delegates) and extension notes ----
 * levelTest / scoreLevelTest live in curriculum.js (they need the skill nodes); these aliases let
 * callers use either SorobanEngine.levelTest(nodeId, opts) or Curriculum.levelTest(nodeId, opts).
 * Shapes are documented next to the implementation in curriculum.js.
 *
 * Multiplication lives in the Phase 4 block below (generateMul); the add/subtract generator and
 * stepMoves above are unchanged by it.
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : root.SorobanEngine;
  const cur = () => root.Curriculum || (typeof require === 'function' ? require('./curriculum.js') : null);
  E.levelTest = function (nodeId, opts) { return cur().levelTest(nodeId, opts); };
  E.scoreLevelTest = function (test, answers, elapsedMs) { return cur().scoreLevelTest(test, answers, elapsedMs); };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ---- Phase 4: multiplication (times tables, 2-digit x 1-digit, 3-digit x 1-digit) ----
 * Soroban method used by kids' programmes, worked left to right: the abacus starts at 0, the problem
 * stays on the card, and each digit of the multiplicand (a) is multiplied by the 1-digit multiplier (b).
 * Every times answer takes two rods (6 is "06"); its units digit lands on the rod of the digit you
 * multiplied. So each partial product is ADDED to the abacus as digit*b*10^place, using the same bead
 * moves (direct / five / ten / combined) as adding, which is why partials carry stepMoves.
 *
 * Config (a node drill with op: 'mul'):
 *   a: [min, max]        multiplicand range (inclusive)
 *   b: [min, max] | bSet: [..]   multiplier range or list (1-digit)
 *   zeros: 'none' (default; no 0 digit in a) | 'inner' (0 allowed inside a, never as its last digit)
 *   twoDigitPartial: true -> at least one digit product is >= 10 (so the two-rod placement matters)
 * Problem = { op: 'mul', terms: [a, b], answer: a*b,
 *   partials: [{ digit, place, product, value, total }]   left to right; value = product*10^place,
 *                                                          total = abacus after adding it
 *   moves: [stepMoves(...)]   one list per partial (aligned with partials, NOT with terms),
 *   rulesUsed, moveKeys }     as for add/subtract problems (bead rules met while adding the partials)
 * generateSet2(cfg) dispatches here when cfg.op === 'mul' (cfg.operands etc. are ignored).
 */
(function (root) {
  'use strict';
  const E = (typeof module !== 'undefined' && module.exports) ? module.exports : root.SorobanEngine;
  function mulPartials(a, b) {
    const ds = String(a).split('').map(Number), out = [];
    let total = 0;
    ds.forEach((digit, i) => {
      const place = ds.length - 1 - i, product = digit * b, value = product * Math.pow(10, place);
      const moves = value ? E.stepMoves(total, value) : [];
      total += value;
      out.push({ digit, place, product, value, total, moves });
    });
    return out;
  }
  function mulProblem(a, b) {
    const parts = mulPartials(a, b), moves = parts.map(p => p.moves);   // [] for a 0 digit
    const flat = moves.flat();
    return { op: 'mul', terms: [a, b], answer: a * b,
      partials: parts.map(p => ({ digit: p.digit, place: p.place, product: p.product, value: p.value, total: p.total })),
      moves,
      rulesUsed: Array.from(new Set(flat.filter(m => !(m.carry && m.rule === 'direct')).map(m => m.rule))),
      moveKeys: Array.from(new Set(flat.map(E.moveKey))) };
  }
  function mulOk(cfg, a, b) {
    const ds = String(a).split('').map(Number);
    if ((cfg.zeros || 'none') === 'none' ? ds.includes(0) : ds[ds.length - 1] === 0) return false;
    if (cfg.twoDigitPartial && !ds.some(d => d * b >= 10)) return false;
    return true;
  }
  function generateMul(cfg, rng) {
    rng = rng || cfg.rng || Math.random;
    const [alo, ahi] = cfg.a, bs = cfg.bSet || (() => { const o = []; for (let k = cfg.b[0]; k <= cfg.b[1]; k++) o.push(k); return o; })();
    for (let attempt = 0; attempt < 500; attempt++) {
      const a = alo + Math.floor(rng() * (ahi - alo + 1)), b = bs[Math.floor(rng() * bs.length)];
      if (mulOk(cfg, a, b)) return mulProblem(a, b);
    }
    return null;
  }
  function generateMulSet(cfg, count, rng) {
    rng = rng || cfg.rng || Math.random;
    const out = [], seen = new Set();
    for (let i = 0; i < count; i++) {
      let p = null;
      for (let k = 0; k < 200; k++) { p = generateMul(cfg, rng); if (!p) break; const key = p.terms.join('x'); if (!seen.has(key)) { seen.add(key); break; } }
      if (!p) throw new Error('generator could not satisfy config');
      out.push(p);
    }
    return out;
  }
  const addSet2 = E.generateSet2;
  function generateSet2(cfg, count, rng) { return cfg && cfg.op === 'mul' ? generateMulSet(cfg, count, rng) : addSet2(cfg, count, rng); }
  Object.assign(E, { generateMul, generateMulSet, mulProblem, mulPartials, generateSet2 });
})(typeof globalThis !== 'undefined' ? globalThis : this);
