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
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
