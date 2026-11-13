// node abacus-input.test.js  — pure parts of AbacusInput (no DOM).
const A = require('./abacus-input.js');
const E = require('./engine.js');
let fails = 0, passes = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) passes++; else { fails++; console.log('FAIL', msg, 'got', a, 'want', b); }
}

// --- bead logic -----------------------------------------------------------
eq(A.rodBeads(7), { heaven: true, earth: 2 }, 'rodBeads 7');
eq(A.beadTarget(0, 'h', 0, 'toggle'), 5, 'tap heaven on 0');
eq(A.beadTarget(7, 'h', 0, 'toggle'), 2, 'tap heaven on 7');
eq(A.beadTarget(0, 'e', 2, 'toggle'), 3, 'tap 3rd earth bead pushes 3 up');
eq(A.beadTarget(3, 'e', 0, 'toggle'), 0, 'tap top earth bead when 3 up drops all');
eq(A.beadTarget(3, 'e', 1, 'toggle'), 1, 'tap 2nd earth bead when 3 up leaves 1');
eq(A.beadTarget(3, 'e', 3, 'toggle'), 4, 'tap resting bottom bead pushes it up');
eq(A.beadTarget(3, 'e', 0, 'toward'), 3, 'drag active bead toward beam = no change');
eq(A.beadTarget(8, 'e', 3, 'away'), 8, 'drag resting bead away = no change');
eq(A.beadTarget(6, 'h', 0, 'toward'), 6, 'heaven already down');
for (let v = 0; v <= 9; v++) for (const kind of ['h', 'e']) for (let k = 0; k < (kind === 'h' ? 1 : 4); k++)
  for (const dir of ['toggle', 'toward', 'away']) { const t = A.beadTarget(v, kind, k, dir); if (t < 0 || t > 9) eq(t, 'in 0..9', `range ${v} ${kind}${k} ${dir}`); }
eq(A.digitsOf(305, 3), [5, 0, 3], 'digitsOf');

// --- model value + log ----------------------------------------------------
{
  const m = new A.Model(3);
  eq(m.value(), 0, 'starts at 0');
  m.touch(0, 'h', 0, 'toggle'); m.touch(0, 'e', 1, 'toggle');
  eq(m.value(), 7, '5 + 2 = 7');
  eq(m.moves().map(x => [x.rod, x.bead, x.delta]), [[0, 'heaven', 5], [0, 'earth', 2]], 'log');
  eq(m.touch(0, 'e', 0, 'toward'), null, 'no-op touch not logged');
  m.touch(1, 'e', 0, 'toggle');
  eq(m.value(), 17, 'tens bead');
  eq(m.moves(2).length, 1, 'moves(since)');
  m.setValue(1234);
  eq([m.rods, m.value()], [4, 1234], 'setValue grows rods');
  eq(m.moves().length, 3, 'setValue does not log');
  m.clear(); eq([m.value(), m.moves().length], [0, 0], 'clear');
}

// helper: perform a list of [rod, delta] gestures on a model, choosing beads like a child would
function play(start, gestures) {
  const m = new A.Model(3); m.setValue(start); m.log = [];
  for (const [rod, bead, delta] of gestures) {
    const v = m.d[rod], e = v % 5;
    if (bead === 'h') m.touch(rod, 'h', 0, delta > 0 ? 'toward' : 'away');
    else if (delta > 0) m.touch(rod, 'e', e + delta - 1, 'toward');
    else m.touch(rod, 'e', e + delta, 'away');
  }
  return m;
}

// --- checkMethod ------------------------------------------------------------
{ // 0 + 7 direct
  const m = play(0, [[0, 'h', 5], [0, 'e', 2]]);
  const r = A.checkMethod(0, 7, m.moves());
  eq([r.ok, r.valueOk, r.expected.rules], [true, true, ['direct']], '0+7 direct ok');
}
{ // 7 + 8 big friend: −2 on ones, +1 on tens (either order)
  const a = A.checkMethod(7, 8, play(7, [[0, 'e', -2], [1, 'e', 1]]).moves());
  eq([a.ok, a.expected.rules, a.expected.text], [true, ['ten'], '−2 on ones, +1 on tens'], '7+8 big friend');
  const b = A.checkMethod(7, 8, play(7, [[1, 'e', 1], [0, 'e', -2]]).moves());
  eq(b.ok, true, '7+8 big friend, tens first is fine');
  // counting style: clear ones rod, add ten, put 5 back
  const c = A.checkMethod(7, 8, play(7, [[0, 'h', -5], [0, 'e', -2], [1, 'e', 1], [0, 'h', 5]]).moves());
  eq([c.ok, c.valueOk], [false, true], '7+8 clear-and-redo: right answer, other method');
  eq(c.hint, 'Try the big friend: add 10, take away 2.', '7+8 hint');
}
{ // 15 − 4 small friend: −5, +1
  const ok = A.checkMethod(15, -4, play(15, [[0, 'h', -5], [0, 'e', 1]]).moves());
  eq([ok.ok, ok.expected.rules], [true, ['five']], '15-4 small friend');
  const bad = A.checkMethod(15, -4, play(15, [[1, 'e', -1], [0, 'h', -5], [0, 'e', 4], [0, 'e', 1], [1, 'e', 1], [0, 'e', -4]]).moves());
  eq([bad.ok, bad.valueOk], [false, true], '15-4 roundabout');
  eq(bad.hint, 'Try the small friend: take away 5, add 1.', '15-4 hint');
}
{ // +7 on 4: the task example "+10 on tens, −3 on ones"
  const r = A.checkMethod(4, 7, play(4, [[1, 'e', 1], [0, 'e', -3]]).moves());
  eq([r.ok, r.expected.rules], [true, ['ten']], '4+7 big friend');
  const n = A.checkMethod(4, 7, []);
  eq([n.ok, n.valueOk, n.hint], [false, false, 'Try the big friend: add 10, take away 3.'], 'no moves -> hint');
}
{ // combined: 6 + 7 = 13: ones −5 +2, tens +1
  const r = A.checkMethod(6, 7, play(6, [[0, 'h', -5], [0, 'e', 2], [1, 'e', 1]]).moves());
  eq([r.ok, r.expected.rules], [true, ['combined']], '6+7 both friends');
  const w = A.checkMethod(6, 7, play(6, [[0, 'e', -1], [0, 'h', -5], [1, 'e', 1], [0, 'e', 3]]).moves());
  eq([w.ok, w.valueOk, w.hint], [false, true, 'Try both friends: add 10, take away 3 (take away 5, add 2).'], '6+7 other way');
  // 12 − 7: ones +5 −2, tens −1
  const s = A.checkMethod(12, -7, play(12, [[1, 'e', -1], [0, 'h', 5], [0, 'e', -2]]).moves());
  eq([s.ok, s.expected.rules], [true, ['combined']], '12-7 both friends');
}
{ // fiddling: overshoot then fix on the same beads still counts
  const r = A.checkMethod(0, 3, play(0, [[0, 'e', 4], [0, 'e', -1]]).moves());
  eq([r.ok, r.valueOk], [true, true], 'overshoot+fix ok');
  const wrong = A.checkMethod(0, 3, play(0, [[0, 'e', 2]]).moves());
  eq([wrong.ok, wrong.valueOk, wrong.actual.value], [false, false, 2], 'wrong value reported, not ok');
}
{ // cascades and multi-digit
  const r = A.checkMethod(99, 1, play(99, [[0, 'h', -5], [0, 'e', -4], [1, 'h', -5], [1, 'e', -4], [2, 'e', 1]]).moves());
  eq([r.ok, r.expected.text], [true, '−5 −4 on ones, −5 −4 on tens, +1 on hundreds'], '99+1 cascade');
  const t = A.checkMethod(12, 34, play(12, [[1, 'e', 3], [0, 'h', 5], [0, 'e', -1]]).moves());
  eq([t.ok, t.expected.rules.sort()], [true, ['direct', 'five']], '12+34 left-to-right');
  // carry lands on a rod that also gets its own digit with opposite earth moves (38 + 47 = 85)
  const u = A.checkMethod(38, 47, play(38, [[1, 'h', 5], [1, 'e', -1], [0, 'e', -3], [1, 'e', 1]]).moves());
  eq([u.ok, u.valueOk], [true, true], '38+47 mixed order');
  const h = A.checkMethod(38, 47, []);
  eq(h.hint, 'Try the big friend on the ones rod: add 10, take away 3.', 'multi-digit hint names the rod');
}
// Every single-digit step from every 1-2 digit start: the expected bead plan replayed on a model gives the right value.
for (let s = 0; s <= 90; s++) for (let d = -9; d <= 9; d++) {
  if (!d || s + d < 0) continue;
  const r0 = A.checkMethod(s, d, []);
  const m = new A.Model(3); m.setValue(s); m.log = [];
  const log = r0.expected.beads.map(b => ({ rod: b.rod, bead: b.bead, delta: b.delta }));
  // replay through beadTarget to make sure every planned action is physically possible
  let possible = true;
  for (const b of log) {
    const before = m.d[b.rod];
    const e = before % 5;
    if (b.bead === 'heaven') m.touch(b.rod, 'h', 0, b.delta > 0 ? 'toward' : 'away');
    else if (b.delta > 0) m.touch(b.rod, 'e', e + b.delta - 1, 'toward');
    else m.touch(b.rod, 'e', e + b.delta, 'away');
    if (m.d[b.rod] - before !== b.delta) possible = false;
  }
  if (!possible) eq(log, 'physically possible', `plan ${s}${d > 0 ? '+' : ''}${d}`);
  const r = A.checkMethod(s, d, m.moves());
  if (!r.ok) eq(r, 'ok', `replayed plan ${s}${d > 0 ? '+' : ''}${d}`);
  else passes++;
  // and the rule set matches the engine's own classification
  const eng = Array.from(E.stepRules(s, d)).sort();
  if (JSON.stringify(r.expected.rules.slice().sort()) !== JSON.stringify(eng)) eq(r.expected.rules.sort(), eng, `rules ${s}${d}`);
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
