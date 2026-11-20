// Tests for parent-brain.js. Run: node parent-brain.test.js
// Fake data is shaped exactly like what app.js saves (abacus.history, abacus.days, abacus.progress, abacus.settings).
const PB = require('./parent-brain.js');
const E = require('./engine.js');
const { dayKey, addDays } = PB._internal;
let fails = 0, passes = 0;
function ok(cond, msg, extra) { if (cond) passes++; else { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg, { got: a, want: b }); }

const NOW = new Date(2026, 10, 13, 19, 30);        // Fri 13 Nov 2026, 7:30 pm local
const TODAY = dayKey(NOW);
const at = (k, h = 18) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d, h, 5).toISOString(); };

// A session record exactly like app.js finish() writes.
function session(k, node, count, correct, missed, mode = 'visual', secs = 300) {
  return { at: at(k), mode, node, count, correct, secs, gap: mode === 'listen' ? 2 : null,
    missed: missed.map(terms => { const answer = terms.reduce((a, b) => a + b, 0); return { terms, answer, given: String(answer + 10), rules: ['ten'] }; }) };
}
function hist(entries) { return entries.flatMap(([k, okN, badN]) => [...Array(okN).fill({ ok: true, day: k }), ...Array(badN).fill({ ok: false, day: k })]); }

/* ---------- realistic child: on big friends +6..9, practises most days ---------- */
function realistic() {
  const d = n => addDays(TODAY, -n);
  const history = [
    session(d(0), 'bf_add_a', 10, 7, [[8, 7, 2, 1], [4, 7, 3, 2], [6, 9, 1, 3]]),            // +7, +7, +9 needed big friends
    session(d(1), 'bf_add_a', 10, 8, [[3, 7, 4, 2], [9, 8, 1, 2]], 'listen'),
    session(d(3), 'bf_add_a', 10, 9, [[2, 8, 7, 1]]),
    session(d(4), 'sf_sub', 10, 10, []),
    session(d(9), 'sf_sub', 10, 6, [[5, -2, 3, 1], [6, -3, 1, 2], [7, -4, 1, 1], [5, -1, 2, 1]]),
    session(d(10), 'sf_sub', 10, 7, [[5, -3, 1, 2], [8, -4, 1, 2], [5, -4, 3, 1]]),
    session(d(16), 'sf_add', 10, 8, [[4, 3, 1, 1], [3, 3, 2, 1]]),
    session(d(23), 'sf_add', 10, 7, [[4, 2, 1, 1], [3, 4, 1, 1], [2, 3, 2, 2]]),
  ];
  const days = {}; history.forEach(s => { days[dayKey(new Date(s.at))] = true; }); days[d(2)] = true;   // a game-only day
  const progress = { current: 'bf_add_a', nodes: {
    beads: { lesson: true, mastered: 'parent', hist: [] },
    add_direct: { lesson: true, mastered: 'parent', hist: [] }, sub_direct: { lesson: true, mastered: 'parent', hist: [] },
    sf_add: { lesson: true, mastered: 'auto', hist: hist([[d(23), 7, 3], [d(16), 8, 2], [d(12), 9, 1]]) },
    sf_sub: { lesson: true, mastered: 'auto', hist: hist([[d(10), 7, 3], [d(9), 6, 4], [d(4), 10, 0], [d(4), 10, 0]]) },   // last 20 = d9(6/10)... window met on d(4)
    bf_add_a: { lesson: true, mastered: null, hist: hist([[d(3), 9, 1], [d(1), 8, 2], [d(0), 7, 3]]) },
  } };
  return { history, days, progress, settings: { name: 'Mia' } };
}

/* ---------- 1. weeklyReport ---------- */
{
  const data = realistic(), r = PB.weeklyReport(data, { now: NOW });
  eq(r.child, 'Mia', 'name from settings');
  eq(r.days.length, 7, '7 days');
  eq(r.days[6], { date: TODAY, practiced: true }, 'today is last');
  eq(r.days.map(x => x.practiced), [false, false, true, true, true, true, true], 'practised days incl. game-only day');
  eq(r.daysPracticed, 5, 'daysPracticed');
  eq(r.problems, 40, 'problems this week');
  eq(r.minutes, 20, 'minutes (4 sessions x 5 min)');
  eq(Math.round(r.accuracy * 100), 85, 'accuracy 34/40');
  eq(r.accuracyTrend.length, 4, '4 weeks of trend');
  eq(r.accuracyTrend[3].weekEnd, TODAY, 'trend newest last');
  eq(Math.round(r.accuracyTrend[2].accuracy * 100), 65, 'last week 13/20');
  eq(r.masteredThisWeek, [{ nodeId: 'sf_sub', label: 'Small friends: taking away' }], 'sf_sub learned this week (not sf_add, not parent-set)');
  eq(r.current.nodeId, 'bf_add_a', 'current node');
  eq(r.current.needed, 0.8, 'needed 0.8');
  eq(r.current.daysOk, 2, 'days in window (last 20 = yesterday + today)');
  eq(Math.round(r.current.accuracy * 100), 75, 'current accuracy: last 20 = 15/20');
  ok(r.missedMost.length === 3, 'top 3 missed', r.missedMost);
  eq(r.missedMost[0].key, 'add:ten:7', 'most missed is +7 big friend');
  ok(/\+7 needs a big friend \(\+10 −3\)/.test(r.missedMost[0].label), 'readable label', r.missedMost[0].label);
  ok(r.missedMost[0].count >= 3, '+7 counted', r.missedMost[0]);
  ok(r.missedMost.every(m => m.example && m.example.terms), 'examples attached');
}
{ // explicit child option and masteredAt override
  const data = realistic(); data.progress.nodes.add_direct.masteredAt = addDays(TODAY, -1);
  const r = PB.weeklyReport(data, { now: NOW, child: { name: 'Leo' } });
  eq(r.child, 'Leo', 'child option wins');
  ok(r.masteredThisWeek.some(m => m.nodeId === 'add_direct'), 'masteredAt honoured');
}

/* ---------- suspects (technique attribution) ---------- */
{
  const s = PB._internal.suspects({ terms: [8, 7, 2], answer: 17, given: '7' }, E);
  eq(s.map(x => x.key), ['add:ten:7'], '8+7 off by 10 -> +7 big friend');
  eq(PB._internal.suspects({ terms: [5, -2, 3, 1], answer: 7, given: '12' }, E, 'sf_sub').map(x => x.key), ['sub:five:2'], 'drill focus: sf_sub miss -> -2 small friend');
  const c = PB._internal.suspects({ terms: [6, 7], answer: 13, given: '12' }, E);
  eq(c.map(x => x.key), ['add:combined:7'], '6+7 -> combined');
  const dct = PB._internal.suspects({ terms: [2, 2], answer: 4, given: '5' }, E);
  eq(dct.map(x => x.key), ['add:direct:2'], 'all-direct problem -> direct');
  const sub = PB._internal.suspects({ terms: [13, -7], answer: 6, given: '16' }, E);
  eq(sub.map(x => x.key), ['sub:combined:7'], '13-7 combined borrow');
  eq(PB._internal.suspects({ terms: [], answer: 0 }, E), [], 'empty terms safe');
  eq(PB._internal.suspects({ terms: [3, -9], answer: -6 }, E), [], 'impossible negative total does not throw');
}

/* ---------- 2. tonightsTip ---------- */
{
  const data = realistic(), t = PB.tonightsTip(data, { now: NOW });
  eq(t.topic, 'ten_add', 'tip targets big-friend adding');
  ok(/Mia/.test(t.text + t.why + t.reason), 'uses name', t);
  ok(/7/.test(t.text + t.why) || /ping-pong/i.test(t.title), 'mentions the digit or is a pair game', t);
  eq(t.helpTopic, 'big-friends', 'help link key');
  ok(t.why && t.why.length > 20 && t.text.length > 40, 'has text and why');
  eq(t.focus.key, 'add:ten:7', 'focus key');
  // rotation: consecutive days give different tips
  const ids = [0, 1, 2, 3].map(k => PB.tonightsTip(data, { now: new Date(NOW.getTime() + k * 864e5) }).id);
  ok(ids[0] !== ids[1] && ids[1] !== ids[2] && ids[2] !== ids[3], 'tip rotates day to day', ids);
  const t2 = PB.tonightsTip(data, { now: NOW, lastTipId: t.id });
  ok(t2.id !== t.id, 'lastTipId avoids repeat', [t.id, t2.id]);
}
{ // every library tip renders cleanly for every digit and both ops
  const T = PB._internal.TIPS; let n = 0, bad = [];
  for (const [topic, list] of Object.entries(T)) for (const fn of list) for (let d = 1; d <= 9; d++) for (const op of ['add', 'sub']) {
    const f = topic.startsWith('five') ? ({ 1: 4, 2: 3, 3: 2, 4: 1 })[d] : 10 - d; if (f === undefined) continue;
    const r = fn('Mia', d, f, op); n++;
    if (!r.title || !r.text || !r.why || /undefined|NaN|null/.test(r.title + r.text + r.why)) bad.push(topic + ':' + d + ':' + op);
  }
  ok(n > 100 && !bad.length, 'all tips render', bad);
  for (const topic of ['beads', 'direct_add', 'direct_sub', 'five_add', 'five_sub', 'ten_add', 'ten_sub', 'combined', 'two_digit', 'anzan', 'habits'])
    ok(T[topic] && T[topic].length >= 2, 'library covers ' + topic);
}
{ // small-friend subtraction misses -> five_sub tip
  const data = realistic(); data.history = data.history.filter(s => s.node === 'sf_sub').map(s => Object.assign({}, s, { at: at(addDays(TODAY, -1)) }));
  data.history.forEach(s => s.missed.forEach(m => { m.given = String(m.answer + 5); }));
  const t = PB.tonightsTip(data, { now: NOW });
  eq(t.topic, 'five_sub', 'small friend subtraction tip');
  eq(t.helpTopic, 'small-friends', 'small-friends help');
}
{ // flash misses -> anzan
  const data = { history: [session(TODAY, 'anzan', 10, 6, [[3, 4, 2], [5, 4, 9], [2, 2, 5], [7, 1, 1]], 'flash')], days: { [TODAY]: true }, progress: { current: 'anzan', nodes: {} } };
  eq(PB.tonightsTip(data, { now: NOW, child: 'Sam' }).topic, 'anzan', 'flash misses -> mental tip');
}

/* ---------- 3. stuckAlerts ---------- */
{
  eq(PB.stuckAlerts(realistic(), { now: NOW }), [], 'healthy child: no alerts');
  const d = n => addDays(TODAY, -n);
  const stuck = { history: [], days: {}, progress: { current: 'bf_sub_a', nodes: {
    bf_sub_a: { lesson: true, mastered: null, hist: hist([[d(8), 5, 5], [d(7), 4, 6], [d(6), 5, 5], [d(5), 5, 5], [d(4), 4, 6]]) } } } };
  stuck.history = [d(8), d(7), d(6), d(5), d(4)].map(k => session(k, 'bf_sub_a', 10, 5, []));
  stuck.history.forEach(s => { stuck.days[dayKey(new Date(s.at))] = true; });
  const a = PB.stuckAlerts(stuck, { now: NOW, child: 'Mia' }), kinds = a.map(x => x.kind);
  ok(kinds.includes('stuck_skill'), 'stuck skill', kinds);
  ok(kinds.includes('no_practice'), 'no practice 4 days', kinds);
  const s = a.find(x => x.kind === 'stuck_skill');
  ok(/45%/.test(s.message) && s.suggestion.length > 20 && s.nodeId === 'bf_sub_a', 'stuck message has %', s);
  ok(/Big friends: \+5/.test(s.suggestion), 'suggests stepping back to previous skill', s.suggestion);
  eq(a.find(x => x.kind === 'no_practice').daysSince, 4, 'days since');
  ok(a.every(x => x.kind && x.message && x.suggestion), 'alert shape');
}
{ // 3 vs 2 days without practice boundary
  const mk = n => ({ history: [], days: { [addDays(TODAY, -n)]: true }, progress: null });
  ok(!PB.stuckAlerts(mk(2), { now: NOW }).length, '2 days: no alert');
  ok(PB.stuckAlerts(mk(3), { now: NOW }).some(x => x.kind === 'no_practice'), '3 days: alert');
}
{ // accuracy drop 15+ points week over week
  const data = { history: [session(addDays(TODAY, -8), 'sf_add', 20, 18, []), session(addDays(TODAY, -1), 'sf_add', 20, 14, [])], days: {}, progress: null };
  const a = PB.stuckAlerts(data, { now: NOW });
  const drop = a.find(x => x.kind === 'accuracy_drop');
  ok(drop && drop.from === 90 && drop.to === 70, 'accuracy drop 90 -> 70', a);
  data.history[1].correct = 16;
  ok(!PB.stuckAlerts(data, { now: NOW }).some(x => x.kind === 'accuracy_drop'), '10-point drop: no alert');
}
{ // frustration: 6 wrong in a row in one sitting
  const k = addDays(TODAY, -1);
  const data = { history: [session(k, 'combined', 10, 4, [])], days: { [k]: true },
    progress: { current: 'combined', nodes: { combined: { lesson: true, mastered: null, hist: hist([[k, 4, 0]]).concat(hist([[k, 0, 6]])) } } } };
  const f = PB.stuckAlerts(data, { now: NOW }).find(x => x.kind === 'frustration');
  ok(f && /6 misses in a row/.test(f.message), 'frustration streak', f);
  // a run split across two days is not one sitting
  const k2 = addDays(TODAY, -2);
  data.progress.nodes.combined.hist = hist([[k2, 0, 3]]).concat(hist([[k, 0, 3]])); data.history[0].correct = 7;
  ok(!PB.stuckAlerts(data, { now: NOW }).some(x => x.kind === 'frustration'), 'streak across days ignored');
}

/* ---------- edge cases ---------- */
{ // brand-new child: nothing stored at all
  for (const data of [{}, null, { history: [], days: {}, progress: null }]) {
    const r = PB.weeklyReport(data, { now: NOW });
    ok(r.days.every(x => !x.practiced) && r.problems === 0 && r.accuracy === null && r.minutes === 0, 'new child report empty', r);
    eq(r.current.nodeId, 'beads', 'new child current = beads');
    eq(r.missedMost, [], 'no misses');
    eq(r.accuracyTrend.map(w => w.accuracy), [null, null, null, null], 'trend nulls');
    const t = PB.tonightsTip(data, { now: NOW });
    eq(t.topic, 'beads', 'new child gets beads tip'); ok(/your child/.test(t.text), 'generic name fallback', t.text);
    eq(PB.stuckAlerts(data, { now: NOW }), [], 'new child: no alerts');
    ok(/no practice this week/.test(PB.shareText(r, {})), 'share text for empty week');
  }
}
{ // one day of data
  const data = { history: [session(TODAY, 'add_direct', 10, 9, [[5, 2, 1]])], days: { [TODAY]: true },
    progress: { current: 'add_direct', nodes: { add_direct: { lesson: true, mastered: null, hist: hist([[TODAY, 9, 1]]) } } }, settings: { name: 'Ava' } };
  const r = PB.weeklyReport(data, { now: NOW });
  eq([r.daysPracticed, r.problems, Math.round(r.accuracy * 100)], [1, 10, 90], 'one day stats');
  eq(r.current.daysOk, 1, 'one day in window');
  eq(r.missedMost[0].rule, 'direct', 'direct miss');
  eq(PB.tonightsTip(data, { now: NOW }).topic, 'direct_add', 'direct tip');
  eq(PB.stuckAlerts(data, { now: NOW }), [], 'one good day: no alerts');
}
{ // all correct
  const data = { history: [0, 1, 2, 3].map(n => session(addDays(TODAY, -n), 'bf_add_b', 10, 10, [])), days: {},
    progress: { current: 'bf_add_b', nodes: { bf_add_b: { lesson: true, mastered: null, hist: hist([[addDays(TODAY, -1), 20, 0]]) } } } };
  const r = PB.weeklyReport(data, { now: NOW });
  eq(r.accuracy, 1, 'all correct accuracy'); eq(r.missedMost, [], 'nothing missed');
  const topics = [0, 1].map(k => PB.tonightsTip(data, { now: new Date(NOW.getTime() + k * 864e5) }).topic).sort();
  eq(topics, ['habits', 'ten_add'], 'all-correct alternates stretch and habit tips');
  eq(PB.stuckAlerts(data, { now: NOW }), [], 'all correct: no alerts');
}
{ // all wrong
  const k = TODAY;
  const data = { history: [session(k, 'sf_add', 10, 0, [[4, 3], [3, 3], [4, 4], [2, 4], [1, 4], [4, 2], [3, 2], [4, 1], [2, 3], [3, 4]])], days: { [k]: true },
    progress: { current: 'sf_add', nodes: { sf_add: { lesson: true, mastered: null, hist: hist([[k, 0, 10]]) } } } };
  const r = PB.weeklyReport(data, { now: NOW });
  eq(r.accuracy, 0, 'all wrong accuracy'); eq(r.missedMost.length, 3, 'three groups');
  ok(r.missedMost.every(m => m.rule === 'five'), 'all small-friend (given off by 10 -> no ten suspects, keeps five)', r.missedMost);
  const a = PB.stuckAlerts(data, { now: NOW });
  ok(a.some(x => x.kind === 'frustration'), 'all wrong -> frustration alert', a);
  ok(!a.some(x => x.kind === 'stuck_skill'), 'one day is not "stuck"');
  eq(PB.tonightsTip(data, { now: NOW }).topic, 'five_add', 'small friend tip');
}

/* ---------- 4. shareText ---------- */
{
  const r = PB.weeklyReport(realistic(), { now: NOW }), s = PB.shareText(r, { childName: 'Mia' });
  ok(/Mia's abacus week: practised 5 of 7 days, about 20 min\./.test(s), 'share line 1', s);
  ok(/40 problems, 85% right\./.test(s) && /Up from 65%/.test(s) && /New skill learned: Small friends: taking away!/.test(s) && /Working on: Big friends/.test(s), 'share body', s);
  ok(s.split('\n').length <= 6 && s.length < 400, 'short', s.length);
  ok(!/[<>{}]|undefined|NaN|null/.test(s), 'plain text, no junk');
  ok(/Our little abacus learner/.test(PB.shareText({ days: [], problems: 0 }, {})), 'no name fallback');
}

console.log(`parent-brain tests: ${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
