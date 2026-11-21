// Soroban practice TIME MODEL — pure, side-effect-free functions over a `times` store object.
// Works in the browser (global `TimeModel`) and in Node (module.exports), so it can be unit-tested.
//
// The number IS the child's SOLVING time for a set (10 problems), not wall-clock across days: the app's
// stopwatch pauses during demos / show-me and while the tab is hidden, and only the resulting elapsed ms is
// handed to updateSetTime(). NOTHING here is ever shown mid-set; the app reveals a value only at set-complete.
//
//   times[nodeId][mode] = {
//     bestSet:    ms | null,       // fastest single set of 10
//     recentSets: [ms, ...],       // last up to 5 set times (for parent stats / trend)
//     run: { sum: ms, sets: n },   // current run through the MODE_SESSIONS sets (solving time only)
//     bestTotal:  ms | null        // best total solving time to clear all MODE_SESSIONS sets
//   }
// mode ∈ {reading, listening} (flash/mental later).

(function (root) {
  'use strict';

  const CAP = 5;            // how many recent set times we keep
  const SESSIONS = 7;       // default sets per mode (mirrors app's MODE_SESSIONS)

  function blankEntry() { return { bestSet: null, recentSets: [], run: { sum: 0, sets: 0 }, bestTotal: null }; }

  // Normalise an entry read from storage so older/partial data never throws.
  function fixEntry(e) {
    if (!e || typeof e !== 'object') return blankEntry();
    if (typeof e.bestSet !== 'number') e.bestSet = (e.bestSet == null ? null : +e.bestSet || null);
    if (!Array.isArray(e.recentSets)) e.recentSets = [];
    if (!e.run || typeof e.run !== 'object') e.run = { sum: 0, sets: 0 };
    if (typeof e.run.sum !== 'number') e.run.sum = 0;
    if (typeof e.run.sets !== 'number') e.run.sets = 0;
    if (typeof e.bestTotal !== 'number') e.bestTotal = (e.bestTotal == null ? null : +e.bestTotal || null);
    return e;
  }

  // Read-only accessor: the stored entry for a node+mode, or null.
  function entryOf(times, nodeId, mode) {
    return (times && times[nodeId] && times[nodeId][mode]) ? fixEntry(times[nodeId][mode]) : null;
  }
  function bestSet(times, nodeId, mode) { const e = entryOf(times, nodeId, mode); return e ? e.bestSet : null; }
  function bestTotal(times, nodeId, mode) { const e = entryOf(times, nodeId, mode); return e ? e.bestTotal : null; }

  // Record one finished set. Mutates `times` in place (the app re-saves it) and returns a result the
  // set-complete screen uses for its reveal. `isBestSet` / `isBestTotal` mean a PRIOR record was beaten
  // (not merely "the first time recorded"), so the "New best!" flourish only fires on a genuine improvement.
  function updateSetTime(times, nodeId, mode, elapsed, sessions) {
    sessions = sessions || SESSIONS;
    if (!times[nodeId]) times[nodeId] = {};
    const e = fixEntry(times[nodeId][mode] || blankEntry());
    times[nodeId][mode] = e;

    const ms = Math.max(0, Math.round(elapsed) || 0);
    const prevBest = e.bestSet;
    const isBestSet = prevBest != null && ms < prevBest;      // beat a previous single-set record
    if (prevBest == null || ms < prevBest) e.bestSet = ms;    // bestSet only ever improves (min)

    e.recentSets.push(ms);
    if (e.recentSets.length > CAP) e.recentSets = e.recentSets.slice(-CAP);

    e.run.sum += ms;
    e.run.sets += 1;

    let modeComplete = false, total = null, isBestTotal = false;
    if (e.run.sets >= sessions) {
      modeComplete = true;
      total = e.run.sum;
      const prevTot = e.bestTotal;
      isBestTotal = prevTot != null && total < prevTot;      // beat a previous full-run record
      if (prevTot == null || total < prevTot) e.bestTotal = total;   // bestTotal only ever improves (min)
      e.run = { sum: 0, sets: 0 };                            // next run starts fresh
    }
    return { times: times, entry: e, setMs: ms, isBestSet: isBestSet, firstSet: (prevBest == null), modeComplete: modeComplete, total: total, isBestTotal: isBestTotal };
  }

  // M:SS (e.g. 1:23); MM:SS once it reaches ten minutes. Rounds to whole seconds for display.
  function fmt(ms) {
    const s = Math.max(0, Math.round((ms || 0) / 1000));
    const m = Math.floor(s / 60), ss = s % 60;
    return (m >= 10 ? String(m).padStart(2, '0') : String(m)) + ':' + String(ss).padStart(2, '0');
  }

  const TimeModel = { blankEntry, fixEntry, entryOf, bestSet, bestTotal, updateSetTime, fmt, CAP, SESSIONS };

  if (typeof module !== 'undefined' && module.exports) module.exports = TimeModel;
  if (root) root.TimeModel = TimeModel;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
