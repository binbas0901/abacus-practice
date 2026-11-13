const E = require('./engine.js');
const { RULES: R } = E;
let fails = 0, passes = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) passes++; else { fails++; console.log('FAIL', msg, 'got', a, 'want', b); }
}
const set = (...r) => Array.from(E.stepRules(...r)).sort();

// --- Single rod add
eq(E.classifyAdd(1, 2), R.DIRECT, '1+2');
eq(E.classifyAdd(0, 7), R.DIRECT, '0+7 (five bead + 2 earth)');
eq(E.classifyAdd(4, 3), R.FIVE, '4+3');
eq(E.classifyAdd(3, 2), R.FIVE, '3+2');
eq(E.classifyAdd(8, 2), R.TEN, '8+2');
eq(E.classifyAdd(7, 8), R.TEN, '7+8');
eq(E.classifyAdd(9, 1), R.TEN, '9+1');
eq(E.classifyAdd(6, 7), R.COMBINED, '6+7');
// Combined addition cells per report: 5+6..9, 6+6..8, 7+6..7, 8+6
const combAdd = new Set(['5,6','5,7','5,8','5,9','6,6','6,7','6,8','7,6','7,7','8,6']);
for (let v = 0; v <= 9; v++) for (let d = 1; d <= 9; d++) {
  const c = E.classifyAdd(v, d);
  const isComb = combAdd.has(`${v},${d}`);
  eq(c === R.COMBINED, isComb, `combined-add table ${v}+${d}`);
  if (v + d >= 10 && !isComb) eq(c, R.TEN, `carry non-combined is TEN ${v}+${d}`);
}
// --- Single rod sub
eq(E.classifySub(8, 3), R.DIRECT, '8-3');
eq(E.classifySub(7, 2), R.DIRECT, '7-2');
eq(E.classifySub(6, 2), R.FIVE, '6-2');
eq(E.classifySub(5, 1), R.FIVE, '5-1');
eq(E.classifySub(0, 6), R.TEN, '10-6');
eq(E.classifySub(5, 7), R.TEN, '15-7');
eq(E.classifySub(2, 7), R.COMBINED, '12-7');
const combSub = new Set(['1,6','2,6','3,6','4,6','2,7','3,7','4,7','3,8','4,8','4,9']);
for (let v = 0; v <= 9; v++) for (let d = 1; d <= 9; d++) {
  const c = E.classifySub(v, d);
  const isComb = combSub.has(`${v},${d}`);
  eq(c === R.COMBINED, isComb, `combined-sub table ${v}-${d}`);
  if (v - d < 0 && !isComb) eq(c, R.TEN, `borrow non-combined is TEN ${v}-${d}`);
}
// --- Whole number with carries
eq(set(49, 1), ['five', 'ten'], '49+1 carry into 4 is FIVE');
eq(set(99, 1), ['ten'], '99+1 cascades');
eq(set(14, 1), ['five'], '14+1');
eq(set(9, 1), ['ten'], '9+1');
eq(set(8, 2), ['ten'], '8+2 (portal example)');
eq(set(9, -1), ['direct'], '9-1');
eq(set(10, -4), ['ten'], '10-4');
eq(set(50, -1), ['five', 'ten'], '50-1 borrow from 5');
eq(set(100, -1), ['ten'], '100-1 cascade');
eq(set(12, 31), ['direct'], '12+31 digitwise direct');
eq(set(12, 34), ['direct', 'five'], '12+34: 2+4 on units is FIVE');
// portal example 9 -1 +2 +4 = 14
{
  let t = 0, rules = new Set();
  for (const d of [9, -1, 2, 4]) { for (const r of E.stepRules(t, d)) rules.add(r); t += d; }
  eq(t, 14, 'portal answer'); eq(Array.from(rules).sort(), ['direct', 'ten'], 'portal rules');
}
// --- Generator properties
const rng = E.makeRng(42);
for (const [name, lvl] of Object.entries(E.LEVELS)) {
  const probs = E.generateSet(lvl, 50, rng);
  const allowed = new Set(lvl.allowedRules), required = new Set(lvl.requiredRules);
  for (const p of probs) {
    let t = 0;
    const used = new Set();
    p.terms.forEach((d, i) => {
      if (i === 0) eq(d > 0, true, `${name} first term positive`);
      if (!lvl.allowSubtraction) eq(d > 0, true, `${name} no subtraction`);
      eq(Math.abs(d) <= Math.pow(10, lvl.digits) - 1, true, `${name} digit band`);
      for (const r of E.stepRules(t, d)) { used.add(r); eq(allowed.has(r), true, `${name} rule ${r} allowed in ${p.terms}`); }
      t += d;
      eq(t >= 0 && t <= lvl.maxTotal, true, `${name} total in range ${p.terms}`);
      if (i < p.terms.length - 1) eq(t !== 0, true, `${name} no zero intermediate ${p.terms}`);
    });
    eq(t, p.answer, `${name} answer`);
    if (required.size) eq([...used].some(r => required.has(r)), true, `${name} required rule hit ${p.terms}`);
  }
}

// ===================== Phase 3: fast generator, multi-digit, data nodes, level tests =====================
const C = require('./curriculum.js');
const ALL = ['direct', 'five', 'ten', 'combined'];
const dflt = cfg => cfg.allowMove || (m => (m.carry && m.rule === 'direct') || !cfg.allowedRules || cfg.allowedRules.includes(m.rule));
// Reference generator: the original slow generateProblem2/generateSet2 built on legalDeltas2.
function refProblem2(cfg, rng) {
  const req = cfg.requireMove || null;
  for (let attempt = 0; attempt < 300; attempt++) {
    let total = 0; const terms = [], list = []; let ok = true;
    for (let i = 0; i < cfg.operands; i++) {
      const legal = E.legalDeltas2(total, cfg, i === 0);
      if (!legal.length) { ok = false; break; }
      let pool = legal;
      if (req && i >= 1) {
        const hitSoFar = list.some(ms => ms.some(req));
        const hitting = legal.filter(l => l.moves.some(req));
        if (!hitSoFar && hitting.length && rng() < 0.75) pool = hitting;
      }
      const pick = pool[Math.floor(rng() * pool.length)];
      terms.push(pick.delta); list.push(pick.moves); total += pick.delta;
    }
    if (!ok) continue;
    if (req && !list.some(ms => ms.some(req))) continue;
    return { terms, answer: total };
  }
  return null;
}
function refSet2(cfg, count, rng) {
  const out = [], seen = new Set();
  for (let i = 0; i < count; i++) {
    let p = null;
    for (let k = 0; k < 25; k++) { p = refProblem2(cfg, rng); if (!p) break; const key = p.terms.join(','); if (!seen.has(key)) { seen.add(key); break; } }
    if (!p) return 'error';
    out.push(p);
  }
  return out;
}
const slim = ps => ps === 'error' ? ps : ps.map(p => ({ terms: p.terms, answer: p.answer }));
const tryGen = f => { try { return slim(f()); } catch (e) { return 'error'; } };

// --- 1. deltaSampler gives exactly legalDeltas2's list (count and order), incl. 3-digit and edge options
{
  const cfgs = [
    { digits: 1, maxTotal: 9, allowSubtraction: true, allowMove: C.BY_ID.sf_sub.drill.allowMove, requireMove: C.BY_ID.sf_sub.drill.requireMove },
    { digits: 1, maxTotal: 99, allowSubtraction: true, allowMove: C.BY_ID.bf_sub_b.drill.allowMove, requireMove: C.BY_ID.bf_sub_b.drill.requireMove },
    { digits: 2, maxTotal: 999, minTerm: 10, allowSubtraction: true, allowedRules: ALL },
    { digits: 2, maxTotal: 150, allowSubtraction: true, allowBorrow: false, allowZeroIntermediate: true, firstMax: 40, allowedRules: ['direct', 'five', 'ten'] },
    { digits: 3, maxTotal: 9999, minTerm: 100, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten'], requireMove: m => m.rule === 'ten' && m.rod === 2 },
    { digits: 3, maxTotal: 999, allowSubtraction: true, allowedRules: ['direct', 'five'] },
  ];
  const rng = E.makeRng(5);
  let n = 0;
  for (let k = 0; k < 36; k++) {
    const cfg = cfgs[k % cfgs.length];
    const total = Math.floor(rng() * Math.min(cfg.maxTotal + 1, 3000));
    for (const first of [false, true]) {
      if (first && total) continue;
      const L = E.legalDeltas2(total, cfg, first), S = E.deltaSampler(total, cfg, first, dflt(cfg), cfg.requireMove);
      eq(S.count(false), L.length, `sampler count t=${total} cfg${k % cfgs.length}`);
      const got = []; for (let j = 0; j < L.length; j++) got.push(S.pick(j, false));
      eq(got, L.map(x => x.delta), `sampler order t=${total} cfg${k % cfgs.length}`);
      if (cfg.requireMove) {
        const H = L.filter(x => x.moves.some(cfg.requireMove)), gh = [];
        eq(S.count(true), H.length, `sampler hit count t=${total}`);
        for (let j = 0; j < H.length; j++) gh.push(S.pick(j, true));
        eq(gh, H.map(x => x.delta), `sampler hit order t=${total}`);
      }
      n++;
    }
  }
}
// --- 2. generateSet2 returns exactly what the original slow generator returned (same seed)
{
  const cfgs = C.NODES.filter(n => n.drill).map(n => [n.id, n.drill]).concat([
    ['2d-noborrow', { operands: 4, digits: 2, maxTotal: 999, allowSubtraction: true, allowBorrow: false, allowedRules: ALL }],
    ['2d-five', { operands: 5, digits: 2, maxTotal: 99, allowSubtraction: true, allowedRules: ['direct', 'five'], requireMove: m => m.rule === 'five' && m.rod === 1 }],
  ]);
  for (const [name, cfg] of cfgs) for (const seed of [1, 2, 3]) {
    eq(tryGen(() => E.generateSet2(cfg, 8, E.makeRng(seed))), refSet2(cfg, 8, E.makeRng(seed)), `generateSet2 == reference ${name} seed ${seed}`);
  }
}
// --- 3. multi-digit generation: rule semantics hold for 3- and 4-digit terms
function checkProblems(name, cfg, probs) {
  const allow = dflt(cfg), lo = cfg.minTerm || 1, hi = Math.pow(10, cfg.digits) - 1;
  for (const p of probs) {
    let t = 0; const all = [];
    p.terms.forEach((d, i) => {
      if (i === 0 && d <= 0) eq(d > 0, true, `${name} first term positive ${p.terms}`);
      if (!(Math.abs(d) >= lo && Math.abs(d) <= hi)) eq(Math.abs(d), `in [${lo},${hi}]`, `${name} digit band ${p.terms}`);
      const ms = E.stepMoves(t, d);
      if (!ms.every(allow)) eq(false, true, `${name} move not allowed ${p.terms}`);
      eq(p.moves[i], ms, `${name} moves match stepMoves`);
      all.push(...ms); t += d;
      if (!(t >= 0 && t <= cfg.maxTotal && (t !== 0 || cfg.allowZeroIntermediate))) eq(t, 'in range', `${name} running total ${p.terms}`);
    });
    eq(t, p.answer, `${name} answer`);
    if (cfg.requireMove && !all.some(cfg.requireMove)) eq(false, true, `${name} required move ${p.terms}`);
  }
}
{
  const t3 = { operands: 5, digits: 3, minTerm: 100, maxTotal: 9999, allowSubtraction: true, allowedRules: ALL };
  const t4 = { operands: 5, digits: 4, maxTotal: 99999, allowSubtraction: true, allowedRules: ALL };
  const t4r = { operands: 5, digits: 4, maxTotal: 9999, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten'], requireMove: m => m.rule === 'ten' && m.op === 'sub' && m.rod === 2 };
  const t3d = { operands: 4, digits: 3, maxTotal: 999, allowSubtraction: true, allowedRules: ['direct'], requireMove: m => m.op === 'sub' };
  for (const [name, cfg] of [['3-digit', t3], ['4-digit', t4], ['4-digit ten-sub on hundreds', t4r], ['3-digit direct only', t3d]].concat(Object.entries(C.TEMPLATES).map(([k, d]) => ['template ' + k, C.compileDrill(d)]))) {
    const probs = E.generateSet2(cfg, 20, E.makeRng(11));
    eq(probs.length, 20, `${name} count`);
    checkProblems(name, cfg, probs);
  }
  // v1 generator (LEVELS-style config) at 3 digits keeps its rules too
  const v1 = { allowedRules: ['direct', 'five', 'ten'], requiredRules: ['ten'], operands: 5, digits: 3, maxTotal: 9999, allowSubtraction: true };
  for (const p of E.generateSet(v1, 20, E.makeRng(4))) {
    let t = 0, hit = false;
    for (const d of p.terms) { for (const r of E.stepRules(t, d)) { if (!v1.allowedRules.includes(r)) eq(r, 'allowed', 'v1 3-digit rule'); if (r === 'ten') hit = true; } t += d; }
    eq([t === p.answer, hit, t >= 0 && t <= v1.maxTotal], [true, true, true], `v1 3-digit ${p.terms}`);
  }
}
// --- 4. speed: 10 problems of 4-digit, 5-term in well under 50 ms (median of 5 runs)
{
  const cfg = { operands: 5, digits: 4, maxTotal: 99999, allowSubtraction: true, allowedRules: ALL };
  const cfgReq = Object.assign({}, cfg, { requireMove: m => m.rule === 'combined' && m.rod === 3 });
  for (const [name, c] of [['4-digit', cfg], ['4-digit with required move', cfgReq]]) {
    const times = [];
    for (let k = 0; k < 5; k++) { const t0 = process.hrtime.bigint(); E.generateSet2(c, 10, E.makeRng(k + 1)); times.push(Number(process.hrtime.bigint() - t0) / 1e6); }
    times.sort((a, b) => a - b);
    eq(times[2] < 50, true, `${name} set of 10 generated in < 50 ms (median ${times[2].toFixed(1)} ms)`);
  }
}
// --- 5. stepMoves on 3-4 digit numbers: cascades, recorded rod values, final value
eq(E.stepMoves(9999, 1).map(m => [m.rod, m.rule, m.carry]), [[4, 'direct', true], [3, 'ten', true], [2, 'ten', true], [1, 'ten', true], [0, 'ten', false]], '9999+1 cascades to rod 4');
eq(E.stepMoves(1000, -1).map(m => [m.rod, m.rule, m.carry]), [[3, 'direct', true], [2, 'ten', true], [1, 'ten', true], [0, 'ten', false]], '1000-1 borrows across zeros');
eq(Array.from(E.stepRules(4999, 1)).sort(), ['five', 'ten'], '4999+1: carry into 4 on thousands is FIVE');
eq(E.stepMoves(1234, 5311).map(m => m.rule), ['five', 'direct', 'five', 'direct'], '1234+5311 per rod');
{
  const rng = E.makeRng(77);
  for (let k = 0; k < 3000; k++) {
    const total = Math.floor(rng() * 10000), mag = 1 + Math.floor(rng() * 9999), delta = rng() < 0.5 && mag <= total ? -mag : mag;
    const rods = String(total).padStart(12, '0').split('').reverse().map(Number);
    let ok = true;
    for (const m of E.stepMoves(total, delta)) {
      if (rods[m.rod] !== m.v) ok = false;
      const r = m.op === 'add' ? E.classifyAdd(m.v, m.d) : E.classifySub(m.v, m.d);
      if (r !== m.rule) ok = false;
      rods[m.rod] = ((m.v + (m.op === 'add' ? m.d : -m.d)) % 10 + 10) % 10;
    }
    if (Number(rods.slice().reverse().join('')) !== total + delta) ok = false;
    if (!ok) eq(false, true, `stepMoves replay ${total}${delta < 0 ? '' : '+'}${delta}`);
  }
}
// --- 6. explain works for 3-4 digits: every bead move is physically possible and the end value is right
function beadMoveOk(v, dl) {
  const n = v + dl; if (n < 0 || n > 9 || dl === 0) return false;
  const a = Math.abs(dl);
  if (dl > 0) return a >= 5 ? v < 5 && (v % 5) + a - 5 <= 4 : (v % 5) + a <= 4;
  return a >= 5 ? v >= 5 && (v % 5) >= a - 5 : (v % 5) >= a;
}
function checkExplain(total, delta) {
  const rods = String(total).padStart(12, '0').split('').reverse().map(Number);
  const steps = C.explain(total, delta);
  for (const s of steps) for (const m of s.do) { if (!beadMoveOk(rods[m.rod], m.delta)) return `bad bead move rod ${m.rod} v=${rods[m.rod]} ${m.delta}`; rods[m.rod] += m.delta; }
  if (Number(rods.slice().reverse().join('')) !== total + delta) return 'wrong end value';
  if (!steps[steps.length - 1].say.includes(String(total + delta))) return 'last line';
  return 'ok';
}
{
  let bad = 0;
  for (let t = 0; t < 100; t++) for (let d = 1; d < 100; d++) for (const dd of [d, -d]) if (t + dd >= 0 && checkExplain(t, dd) !== 'ok') bad++;
  eq(bad, 0, 'explain valid for every 2-digit pair');
  const rng = E.makeRng(8);
  for (let k = 0; k < 3000; k++) {
    const total = Math.floor(rng() * 10000), mag = 1 + Math.floor(rng() * 9999), delta = rng() < 0.5 && mag <= total ? -mag : mag;
    const r = checkExplain(total, delta);
    if (r !== 'ok') eq(r, 'ok', `explain ${total}${delta < 0 ? '' : '+'}${delta}`);
  }
  eq(C.explain(999, 1).some(s => s.say.includes('thousands rod')), true, 'explain names the thousands rod');
  eq(C.explain(1000, -1).some(s => s.say.includes('thousands rod')), true, 'explain borrow from thousands rod');
}
// Left-to-right (how explain and the child work) and units-first (stepMoves) agree whenever the term
// has one digit, so every current node's rule gating matches its explanation.
{
  function ltrRules(total, delta) {
    const rods = String(total).padStart(12, '0').split('').reverse().map(Number), op = delta >= 0 ? 'add' : 'sub', out = [];
    (function apply(i, d, carry) {
      const v = rods[i], r = op === 'add' ? E.classifyAdd(v, d) : E.classifySub(v, d);
      if (op === 'add') { if (v + d >= 10) { rods[i] = v + d - 10; apply(i + 1, 1, true); } else rods[i] = v + d; }
      else { if (v - d < 0) { rods[i] = v - d + 10; apply(i + 1, 1, true); } else rods[i] = v - d; }
      out.push(i + ':' + r + ':' + carry);
    })(0, Math.abs(delta), false);
    return out.sort();
  }
  let bad = 0;
  for (let t = 0; t < 10000; t++) for (let d = 1; d <= 9; d++) for (const dd of [d, -d]) {
    if (t + dd < 0) continue;
    if (JSON.stringify(ltrRules(t, dd)) !== JSON.stringify(E.stepMoves(t, dd).map(m => m.rod + ':' + m.rule + ':' + m.carry).sort())) bad++;
  }
  eq(bad, 0, '1-digit terms: left-to-right and units-first classification agree');
}
// --- 7. data-driven nodes compile to the same predicates as the old hand-written ones
{
  const ok = m => (m.carry && m.rule === 'direct'), direct = m => ok(m) || m.rule === 'direct';
  const five = (op, ds) => m => m.rule === 'five' && m.op === op && (!ds || ds.includes(m.d));
  const ten = (op, ds) => m => m.rule === 'ten' && m.op === op && (!ds || ds.includes(m.d));
  const any = (...fs) => m => fs.some(f => f(m));
  const OLD = {
    add_direct: [direct, null], sub_direct: [direct, m => m.op === 'sub'],
    sf_add: [any(direct, five('add')), five('add')], sf_sub: [any(direct, five('add'), five('sub')), five('sub')],
    bf_add_a: [any(direct, five('add'), ten('add', [6, 7, 8, 9])), ten('add', [6, 7, 8, 9])],
    bf_add_b: [any(direct, five('add'), ten('add')), ten('add', [1, 2, 3, 4, 5])],
    bf_sub_a: [any(direct, five('add'), five('sub'), ten('add'), ten('sub', [6, 7, 8, 9])), ten('sub', [6, 7, 8, 9])],
    bf_sub_b: [any(direct, five('add'), five('sub'), ten('add'), ten('sub')), ten('sub', [1, 2, 3, 4, 5])],
    combined: [null, m => m.rule === 'combined'],
  };
  const moves = [];
  for (const rule of ALL) for (const op of ['add', 'sub']) for (let d = 1; d <= 9; d++) for (const carry of [false, true]) for (let rod = 0; rod < 4; rod++) moves.push({ rod, op, d, v: 0, rule, carry });
  for (const [id, [a, r]] of Object.entries(OLD)) {
    const dr = C.BY_ID[id].drill;
    if (a) eq(moves.map(dr.allowMove), moves.map(a), `${id} allowMove unchanged`);
    else eq([dr.allowMove, dr.allowedRules], [undefined, ALL], `${id} uses allowedRules`);
    if (r) eq(moves.map(dr.requireMove), moves.map(r), `${id} requireMove unchanged`);
  }
  eq(['two_digit', 'anzan', 'beads'].map(id => C.BY_ID[id].drill && C.BY_ID[id].drill.requireMove), [undefined, undefined, null], 'nodes without require');
  eq(C.NODES.map(n => n.id), ['beads', 'add_direct', 'sub_direct', 'sf_add', 'sf_sub', 'bf_add_a', 'bf_add_b', 'bf_sub_a', 'bf_sub_b', 'combined', 'two_digit', 'anzan'], 'node order unchanged');
  const mm = C.moveMatcher('ten:sub:6-9:1');
  eq([mm({ rule: 'ten', op: 'sub', d: 7, rod: 1 }), mm({ rule: 'ten', op: 'sub', d: 7, rod: 0 }), mm({ rule: 'ten', op: 'sub', d: 5, rod: 1 }), mm({ rule: 'ten', op: 'add', d: 7, rod: 1 })], [true, false, false, false], 'moveMatcher rule:op:digits:rods');
  eq([C.moveMatcher('any:sub')({ rule: 'five', op: 'sub', d: 1, rod: 0 }), C.moveMatcher('five:*:1,3')({ rule: 'five', op: 'add', d: 3, rod: 2 }), C.moveMatcher({ rule: 'combined', rod: [2] })({ rule: 'combined', op: 'add', d: 6, rod: 2 })], [true, true, true], 'moveMatcher wildcards and object form');
}
// --- 8. level tests
{
  for (const n of C.NODES) {
    const t = E.levelTest(n.id, { seed: 21 });
    if (!n.drill) { eq(t, null, `${n.id} has no level test`); continue; }
    const earlier = (n.review || C.NODES.slice(0, C.NODES.indexOf(n)).filter(x => x.drill && !x.drill.flash).map(x => x.id));
    eq(t.problems.length, 10, `${n.id} level test has 10 problems`);
    eq(t.count, t.problems.length, `${n.id} count`);
    const rev = t.problems.filter(p => p.review);
    eq(rev.length, earlier.length ? 3 : 0, `${n.id} review share`);
    eq(rev.every(p => earlier.includes(p.nodeId)) && t.problems.filter(p => !p.review).every(p => p.nodeId === n.id), true, `${n.id} review from earlier nodes only`);
    for (const p of t.problems) checkProblems(`${n.id} test (${p.nodeId})`, Object.assign({}, C.BY_ID[p.nodeId].drill), [p]);
    eq(t.timeLimitSec > 0 && t.timeLimitSec % 30 === 0, true, `${n.id} time limit`);
    eq(t.passRule, { minAccuracy: 0.8, withinTimeLimit: true }, `${n.id} pass rule`);
    eq(t.kind, n.kind === 'flash' ? 'flash' : 'visual', `${n.id} kind`);
  }
  const a = C.levelTest('bf_sub_b', { seed: 5 }), b = E.levelTest('bf_sub_b', { seed: 5 });
  eq(a.problems.map(p => p.terms), b.problems.map(p => p.terms), 'level test repeatable with a seed');
  eq(C.levelTest('two_digit', { seed: 1, count: 20, reviewShare: 0.5 }).problems.filter(p => p.review).length, 10, 'count and reviewShare options');
  eq(C.levelTest('sf_add', { seed: 1, secondsPerProblem: 20 }).timeLimitSec, 210, 'secondsPerProblem option (200 s -> 210)');
  eq(C.levelTest('sf_add', { seed: 1, secondsPerProblem: 30, timeScale: 2 }).timeLimitSec, 600, 'timeScale option');
  eq(C.levelTest('sf_add', { seed: 2, operands: 3 }).problems.filter(p => !p.review).every(p => p.terms.length === 3), true, 'operands option');
  let threw = false; try { C.levelTest('nope'); } catch (e) { threw = true; } eq(threw, true, 'unknown node throws');

  // scoring
  const T = C.levelTest('bf_add_a', { seed: 9 }), L = T.timeLimitSec * 1000, right = T.problems.map(p => p.answer);
  const wrongN = n => right.map((x, i) => i < n ? x + 1 : x);
  let s = E.scoreLevelTest(T, right, L - 1000);
  eq([s.passed, s.accuracy, s.correct, s.total, s.answered, s.inTime], [true, 1, 10, 10, 10, true], 'all right in time passes');
  eq(s.certificate && [s.certificate.nodeId, s.certificate.accuracyPct, s.certificate.total], ['bf_add_a', 100, 10], 'certificate on pass');
  s = C.scoreLevelTest(T, wrongN(2), 60000); eq([s.passed, s.accuracy], [true, 0.8], '8/10 passes (80%)');
  s = C.scoreLevelTest(T, wrongN(3), 60000); eq([s.passed, s.accuracy, s.certificate], [false, 0.7, null], '7/10 fails');
  s = C.scoreLevelTest(T, right, L + 1000); eq([s.passed, s.correct, s.correctAny, s.inTime], [false, 0, 10, false], 'over time without per-answer times fails');
  s = C.scoreLevelTest(T, right.map((v, i) => ({ value: v, atMs: i < 8 ? 1000 * i : L + 5000 })), L + 9000);
  eq([s.passed, s.correct, s.perProblem[9].late, s.inTime], [true, 8, true, false], 'per-answer times: 8 in time still passes');
  s = C.scoreLevelTest(T, right.slice(0, 7).map(String), 30000);
  eq([s.passed, s.answered, s.correct, s.perProblem[9].answer], [false, 7, 7, null], 'skipped answers count as wrong; numeric strings accepted');
  s = C.scoreLevelTest(C.levelTest('two_digit', { seed: 3 }), [], 1000);
  eq(Object.values(s.byNode).reduce((a, b) => a + b.total, 0), 10, 'byNode totals');
}
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
