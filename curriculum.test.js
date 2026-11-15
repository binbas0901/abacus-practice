// Lesson examples only use what the child has been taught (run by tools/check.sh).
// For every skill with demos / guided examples [start, change]:
//   - Engine.stepRules(start, change) stays inside the rules the skill's practice allows
//     (a small-friends lesson never needs a big friend, a big-friends lesson never needs both friends at once);
//   - in the friend lessons (sf_*, bf_*, combined) every example really uses the rule the lesson is about;
//   - bf_*_a examples change by 6-9 and bf_*_b by 1-5, as their titles say; no example appears twice in a lesson.
// The three formula groups: small friends make 5 (1&4, 2&3), big friends make 10 (1&9, 2&8, 3&7, 4&6, 5&5), and the
// combination ("mixed friends" / "family") formulas where the big-friend move needs a small-friend move inside it.
const E = require('./engine.js'), C = require('./curriculum.js');
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL', msg); } }
const rulesOf = (a, d) => Array.from(E.stepRules(a, d)).sort();
const allowedOf = dr => new Set(dr.allowedRules || (dr.allow || []).map(s => s.split(':')[0]));
const ABOUT = { sf_add: 'five', sf_sub: 'five', bf_add_a: 'ten', bf_add_b: 'ten', bf_sub_a: 'ten', bf_sub_b: 'ten', combined: 'combined' };
const SIGN = { sf_add: 1, sf_sub: -1, bf_add_a: 1, bf_add_b: 1, bf_sub_a: -1, bf_sub_b: -1 };
const SIZE = { bf_add_a: [6, 9], bf_sub_a: [6, 9], bf_add_b: [1, 5], bf_sub_b: [1, 5] };
let checked = 0;
for (const n of C.NODES) {
  if (!n.drill || n.drill.op === 'mul' || !(n.demos || n.guided)) continue;
  const allowed = allowedOf(n.drill);
  for (const [kind, list] of [['demo', n.demos || []], ['guided', n.guided || []]]) {
    const seen = new Set();
    for (const [a, d] of list) {
      const r = rulesOf(a, d), tag = `${n.id} ${kind} [${a}, ${d}] uses ${r.join('+')}`; checked++;
      ok(r.every(x => allowed.has(x)), `${tag}, but this skill only teaches ${Array.from(allowed).join(', ')}`);
      if (ABOUT[n.id]) ok(r.includes(ABOUT[n.id]), `${tag}, but the lesson is about "${ABOUT[n.id]}"`);
      if (SIGN[n.id]) ok(Math.sign(d) === SIGN[n.id], `${tag}: wrong direction for this lesson`);
      if (SIZE[n.id]) ok(Math.abs(d) >= SIZE[n.id][0] && Math.abs(d) <= SIZE[n.id][1], `${tag}: the change must be ${SIZE[n.id][0]}-${SIZE[n.id][1]}`);
      ok(!seen.has(a + ',' + d), `${n.id} ${kind} [${a}, ${d}] appears twice`); seen.add(a + ',' + d);
    }
  }
}
ok(checked > 80, 'examples were found and checked (' + checked + ')');
// The friend tables themselves: 5 has no small friend, 6-9 have none either.
ok(JSON.stringify(C.FRIEND5) === JSON.stringify({ 1: 4, 2: 3, 3: 2, 4: 1 }), 'small friends are 1&4 and 2&3 only: ' + JSON.stringify(C.FRIEND5));
ok(JSON.stringify(C.FRIEND10) === JSON.stringify({ 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1 }), 'big friends make 10: ' + JSON.stringify(C.FRIEND10));
ok(!/famil/i.test(Object.values(E.LEVELS).map(l => l.label).join(' ')), 'engine level labels do not call a set of friends a "family"');
console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
