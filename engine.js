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
  //   digits: 1..3  operand digit band (each |term| in [1, 10^digits - 1])
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

  function generateProblem(cfg, rng) {
    rng = rng || cfg.rng || Math.random;
    const required = normSet(cfg.requiredRules);
    for (let attempt = 0; attempt < 200; attempt++) {
      let total = 0;
      const terms = [], stepRuleSets = [];
      let ok = true;
      for (let i = 0; i < cfg.operands; i++) {
        const legal = legalDeltas(total, cfg, i === 0);
        if (!legal.length) { ok = false; break; }
        // Bias: if required rules not yet hit and some legal delta hits them, prefer those on later slots
        let pool = legal;
        if (required.size && i >= 1) {
          const hitSoFar = stepRuleSets.some(s => intersects(s, required));
          const hitting = legal.filter(l => intersects(l.rules, required));
          if (!hitSoFar && hitting.length && rng() < 0.7) pool = hitting;
        }
        const pick = pool[Math.floor(rng() * pool.length)];
        terms.push(pick.delta);
        stepRuleSets.push(pick.rules);
        total += pick.delta;
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

  const api = { RULES, classifyAdd, classifySub, classifySubNoBorrow, stepRules, legalDeltas, generateProblem, generateSet, makeRng, LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SorobanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
