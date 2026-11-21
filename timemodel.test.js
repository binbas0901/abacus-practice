// node timemodel.test.js — pure time-model checks (no DOM).
const T = require('./timemodel.js');
let fails = 0, passes = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) passes++; else { fails++; console.log('FAIL', msg, 'got', a, 'want', b); }
}

// --- fmt --------------------------------------------------------------------
eq(T.fmt(0), '0:00', 'fmt 0');
eq(T.fmt(1230), '0:01', 'fmt rounds to seconds (1.23s)');
eq(T.fmt(83000), '1:23', 'fmt 1:23');
eq(T.fmt(45000), '0:45', 'fmt single-digit minute, no leading zero');
eq(T.fmt(599000), '9:59', 'fmt just under ten minutes');
eq(T.fmt(600000), '10:00', 'fmt ten minutes -> MM:SS');
eq(T.fmt(3723000), '62:03', 'fmt over an hour still MM:SS');
eq(T.fmt(2500), '0:03', 'fmt rounds half up');

// --- blank + first set ------------------------------------------------------
{
  const times = {};
  const r = T.updateSetTime(times, 'nA', 'reading', 50000, 7);
  eq(r.setMs, 50000, 'first set stored elapsed');
  eq([r.isBestSet, r.firstSet], [false, true], 'first set is not a "beaten" best, but is firstSet');
  eq(times.nA.reading.bestSet, 50000, 'bestSet set on first set');
  eq(times.nA.reading.recentSets, [50000], 'recentSets has the one time');
  eq(times.nA.reading.run, { sum: 50000, sets: 1 }, 'run accumulates');
  eq(times.nA.reading.bestTotal, null, 'no bestTotal before 7 sets');
}

// --- bestSet only improves, isBestSet flags a genuine improvement -----------
{
  const times = {};
  T.updateSetTime(times, 'n', 'reading', 60000, 7);          // 1:00
  let r = T.updateSetTime(times, 'n', 'reading', 70000, 7);  // slower
  eq([r.isBestSet, times.n.reading.bestSet], [false, 60000], 'slower set does not beat best; best unchanged');
  r = T.updateSetTime(times, 'n', 'reading', 55000, 7);      // faster
  eq([r.isBestSet, times.n.reading.bestSet], [true, 55000], 'faster set beats best; best improves');
  r = T.updateSetTime(times, 'n', 'reading', 55000, 7);      // tie
  eq([r.isBestSet, times.n.reading.bestSet], [false, 55000], 'a tie is not a new best');
}

// --- recentSets cap at 5 ----------------------------------------------------
{
  const times = {};
  for (let i = 1; i <= 8; i++) T.updateSetTime(times, 'n', 'listening', i * 1000, 99);
  eq(times.n.listening.recentSets, [4000, 5000, 6000, 7000, 8000], 'recentSets keeps only the last 5');
  eq(times.n.listening.run.sets, 8, 'run keeps counting beyond the cap when sessions not reached');
}

// --- run resets at 7 sets; bestTotal set; accumulation is solve-time sum -----
{
  const times = {};
  let r;
  const each = 10000;
  for (let i = 1; i <= 7; i++) r = T.updateSetTime(times, 'n', 'reading', each, 7);
  eq(r.modeComplete, true, '7th set completes the mode');
  eq(r.total, 70000, 'total is the sum of the 7 set times');
  eq([r.isBestTotal, times.n.reading.bestTotal], [false, 70000], 'first full run sets bestTotal (not a beaten record)');
  eq(times.n.reading.run, { sum: 0, sets: 0 }, 'run resets after the 7th set');
  // next run, faster overall
  for (let i = 1; i <= 6; i++) r = T.updateSetTime(times, 'n', 'reading', 9000, 7);
  eq([r.modeComplete, times.n.reading.run.sets], [false, 6], 'run accumulates again, not complete at 6');
  r = T.updateSetTime(times, 'n', 'reading', 9000, 7);
  eq([r.modeComplete, r.total, r.isBestTotal, times.n.reading.bestTotal], [true, 63000, true, 63000], 'faster second run beats bestTotal');
  // a slower run does not lower bestTotal
  for (let i = 1; i <= 7; i++) r = T.updateSetTime(times, 'n', 'reading', 20000, 7);
  eq([r.isBestTotal, times.n.reading.bestTotal], [false, 63000], 'slower run leaves bestTotal unchanged');
}

// --- run persists across sittings (the model never looks at wall clock) -----
{
  const times = {};
  T.updateSetTime(times, 'n', 'reading', 8000, 7);
  T.updateSetTime(times, 'n', 'reading', 8000, 7);
  // (imagine the child closes the app here; `times` is what persisted)
  const reloaded = JSON.parse(JSON.stringify(times));
  const r = T.updateSetTime(reloaded, 'n', 'reading', 8000, 7);
  eq(reloaded.n.reading.run, { sum: 24000, sets: 3 }, 'run continues from stored state, no gap counted');
  eq(r.modeComplete, false, 'still mid-run after resuming');
}

// --- modes and nodes are independent ----------------------------------------
{
  const times = {};
  T.updateSetTime(times, 'nA', 'reading', 30000, 7);
  T.updateSetTime(times, 'nA', 'listening', 40000, 7);
  T.updateSetTime(times, 'nB', 'reading', 20000, 7);
  eq(T.bestSet(times, 'nA', 'reading'), 30000, 'nA reading best');
  eq(T.bestSet(times, 'nA', 'listening'), 40000, 'nA listening best (separate)');
  eq(T.bestSet(times, 'nB', 'reading'), 20000, 'nB reading best (separate node)');
  eq(T.bestSet(times, 'nB', 'listening'), null, 'unused mode has no best');
}

// --- defensive: elapsed is clamped/rounded to whole ms ----------------------
{
  const times = {};
  const r = T.updateSetTime(times, 'n', 'reading', -500, 7);
  eq([r.setMs, times.n.reading.bestSet], [0, 0], 'negative elapsed clamped to 0');
  const r2 = T.updateSetTime(times, 'n2', 'reading', 1234.7, 7);
  eq(r2.setMs, 1235, 'fractional ms rounded');
}

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
