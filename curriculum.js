// Curriculum: ordered skill nodes, each with lesson examples + drill config.
// Depends on SorobanEngine (engine.js).
(function (root) {
  'use strict';
  const E = root.SorobanEngine || (typeof require === 'function' ? require('./engine.js') : null);

  // --- Move specs: node drills are data ------------------------------------
  // A drill lists which bead moves are allowed / required as short strings instead of code:
  //   'rule[:op[:digits[:rods]]]'
  //     rule   direct | five | ten | combined | any
  //     op     add | sub | *            (default *)
  //     digits '6-9' or '1,2,3' or *     (the digit d of the move; default *)
  //     rods   '0-1' or '2' or *         (rod index, 0 = units; default *) - hook for 3-4 digit nodes
  //   e.g. 'five:add', 'ten:sub:6-9', 'any:sub' (any take-away move), 'ten:add:*:2-3'
  // compileNode turns drill.allow / drill.require into drill.allowMove / drill.requireMove
  // (the predicates SorobanEngine.generateSet2 takes). Carry/borrow propagation moves that are plain
  // direct moves are always allowed, as before. Drills may instead use allowedRules (engine default).
  function parseList(x) {
    if (x === undefined || x === '' || x === '*') return null;
    const out = [];
    for (const part of String(x).split(',')) {
      const ab = part.split('-').map(Number);
      if (ab.length === 2) { for (let k = ab[0]; k <= ab[1]; k++) out.push(k); } else out.push(ab[0]);
    }
    return out;
  }
  function moveMatcher(spec) {
    const o = typeof spec === 'string' ? (([rule, op, ds, rods]) => ({ rule, op, d: parseList(ds), rod: parseList(rods) }))(spec.split(':')) : spec;
    const rule = o.rule || 'any', op = (!o.op || o.op === '*') ? null : o.op;
    return m => (rule === 'any' || m.rule === rule) && (!op || m.op === op) && (!o.d || o.d.includes(m.d)) && (!o.rod || o.rod.includes(m.rod));
  }
  const carryDirect = m => m.carry && m.rule === 'direct';
  function compileDrill(drill) {
    if (!drill) return drill;
    const d = Object.assign({}, drill);
    if (d.allow && !d.allowMove) { const fs = d.allow.map(moveMatcher); d.allowMove = m => carryDirect(m) || fs.some(f => f(m)); }
    if (d.require && !d.requireMove) { const fs = d.require.map(moveMatcher); d.requireMove = m => fs.some(f => f(m)); }
    return d;
  }
  function compileNode(spec) { return Object.assign({ mastery: MASTERY }, spec, { drill: compileDrill(spec.drill) }); }

  // --- Skill nodes (data) ----------------------------------------------------
  // Node fields used by the app: id, title, short, icon, kind ('numbers' | 'flash'), intro, family,
  // (icon is the id of a drawn picture, TOY.pic in toystickers.js: no emoji anywhere.)
  // lesson / demos / guided, drill (generateSet2 config + allow/require move specs).
  // Optional level-test fields: review: [nodeId...] (earlier nodes mixed into the level test;
  // default = every earlier node with a non-flash drill), test: { count, secondsPerProblem, reviewShare }.
  //
  // Adding a node = adding an entry here (order = unlock order). Ready-made drill shapes for the next
  // band live in TEMPLATES below (longer rows, 3- and 4-digit add/subtract); the generator handles
  // 1-4 digit terms quickly. Multiplication nodes use drill.op = 'mul' (engine.js Phase 4, explainMul here).
  const ALL = ['direct', 'five', 'ten', 'combined'];
  // Mastery rule shared by every node (app.js checkMastery): >= 80% of the last 20 answers, over >= 2 days.
  const MASTERY = { lastN: 20, minAccuracy: 0.8, minDays: 2 };
  const NODE_SPECS = [
    { id: 'beads', title: 'Beads & numbers', short: 'Beads', icon: 'ball', kind: 'numbers',
      intro: 'The top bead is worth 5. Each bottom bead is worth 1. A bead counts when it touches the bar.',
      lesson: { numbers: [1, 3, 5, 7, 9, 4, 6, 10, 23] },
      drill: null },
    { id: 'add_direct', title: 'Adding, just beads', short: 'Add', icon: 'balloon',
      intro: 'When there are enough beads, just push them to the bar. No tricks yet.',
      demos: [[1, 2], [3, 5], [5, 3], [11, 6]], guided: [[2, 2], [1, 3], [5, 2], [6, 3], [10, 5], [12, 7]],
      drill: { operands: 3, digits: 1, maxTotal: 9, allowSubtraction: false, allow: ['direct'] } },
    { id: 'sub_direct', title: 'Taking away, just beads', short: 'Take away', icon: 'kite',
      intro: 'If the beads are already at the bar, just push them away.',
      demos: [[3, -2], [8, -3], [7, -5], [19, -4]], guided: [[4, -1], [9, -4], [6, -5], [8, -2], [17, -6], [15, -5]],
      drill: { operands: 3, digits: 1, maxTotal: 9, allowSubtraction: true, allow: ['direct'], require: ['any:sub'] } },
    { id: 'sf_add', title: 'Small friends: adding', short: 'Small +', icon: 'teddy', family: 5,
      intro: 'Not enough 1-beads? Use the 5-bead and take away its small friend. 1↔4 and 2↔3 are small friends: they make 5.',
      demos: [[4, 1], [3, 2], [2, 3], [1, 4], [4, 4]], guided: [[4, 2], [3, 3], [2, 4], [1, 4], [4, 3], [13, 4]],
      drill: { operands: 4, digits: 1, maxTotal: 9, allowSubtraction: false, allow: ['direct', 'five:add'], require: ['five:add'] } },
    { id: 'sf_sub', title: 'Small friends: taking away', short: 'Small −', icon: 'teddy', family: 5,
      intro: 'Need to take away but the 1-beads are not there? Take away the 5-bead and add back its small friend.',
      demos: [[5, -1], [6, -2], [7, -3], [8, -4]], guided: [[5, -2], [6, -3], [7, -4], [5, -4], [8, -4], [16, -2]],
      drill: { operands: 4, digits: 1, maxTotal: 9, allowSubtraction: true, allow: ['direct', 'five:add', 'five:sub'], require: ['five:sub'] } },
    { id: 'bf_add_a', title: 'Big friends: +9 +8 +7 +6', short: 'Big + (6–9)', icon: 'star', family: 10,
      intro: 'Not enough room on the rod? Add 10 on the next rod and take away the big friend. 1↔9, 2↔8, 3↔7, 4↔6, 5↔5 make 10.',
      demos: [[8, 9], [7, 8], [4, 7], [9, 6]], guided: [[2, 9], [3, 8], [5, 7], [4, 6], [9, 9], [15, 8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: false, allow: ['direct', 'five:add', 'ten:add:6-9'], require: ['ten:add:6-9'] } },
    { id: 'bf_add_b', title: 'Big friends: +5 +4 +3 +2 +1', short: 'Big + (1–5)', icon: 'star', family: 10,
      intro: 'Same trick with smaller numbers: add 10, take away the big friend.',
      demos: [[9, 1], [8, 2], [7, 3], [6, 4], [5, 5]], guided: [[9, 2], [8, 3], [7, 4], [9, 5], [6, 5], [19, 1]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: false, allow: ['direct', 'five:add', 'ten:add'], require: ['ten:add:1-5'] } },
    { id: 'bf_sub_a', title: 'Big friends: −9 −8 −7 −6', short: 'Big − (6–9)', icon: 'moon', family: 10,
      intro: 'Not enough beads to take away? Take 10 from the next rod and add back the big friend.',
      demos: [[10, -9], [11, -8], [13, -7], [15, -6]], guided: [[10, -8], [12, -9], [14, -7], [11, -6], [20, -9], [16, -8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allow: ['direct', 'five:add', 'five:sub', 'ten:add', 'ten:sub:6-9'], require: ['ten:sub:6-9'] } },
    { id: 'bf_sub_b', title: 'Big friends: −5 −4 −3 −2 −1', short: 'Big − (1–5)', icon: 'moon', family: 10,
      intro: 'Same trick with smaller numbers: take 10, add back the big friend.',
      demos: [[10, -1], [11, -2], [10, -3], [12, -4], [10, -5]], guided: [[10, -2], [11, -3], [13, -4], [10, -4], [14, -5], [21, -2]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allow: ['direct', 'five:add', 'five:sub', 'ten:add', 'ten:sub'], require: ['ten:sub:1-5'] } },
    { id: 'combined', title: 'Both friends together', short: 'Both', icon: 'yoyo',
      intro: 'Sometimes the big-friend step needs a small-friend step inside it. Two tricks, one move.',
      demos: [[6, 7], [5, 8], [12, -7], [11, -6]], guided: [[6, 6], [7, 7], [5, 9], [13, -7], [14, -6], [12, -8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten', 'combined'], require: ['combined'] } },
    { id: 'two_digit', title: 'Two-digit numbers', short: '2-digit', icon: 'lion',
      intro: 'Work left to right: tens rod first, then units. Every rod uses the same friends.',
      demos: [[23, 45], [38, 27], [64, -29]], guided: [[12, 34], [25, 48], [57, 36], [72, -45], [60, -27], [81, -56]],
      drill: { operands: 4, digits: 2, minTerm: 10, maxTotal: 999, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten', 'combined'] } },
    { id: 'anzan', title: 'Mental abacus', short: 'Mental', icon: 'owl', kind: 'flash',
      intro: 'Picture the beads in your head. Numbers flash by; move the beads in your mind; say the answer.',
      review: ['add_direct', 'sf_add', 'bf_add_a', 'bf_add_b'],      // flash test reviews add-only skills
      drill: { operands: 3, digits: 1, maxTotal: 99, allowSubtraction: false, allowedRules: ['direct', 'five', 'ten', 'combined'], flash: true } },

    // ---- Levels 4-6 (appended: the 12 nodes above keep their ids and order, so saved progress stays valid) ----
    // Order follows the shared ladder of KSC sheets 09-12 / Japanese 10-9 kyu: longer rows, 2-digit x 5 rows,
    // 3-digit, 4-digit, times tables, then 2x1 and 3x1 multiplication. Flash anzan grows numbers before
    // digits (official flash-anzan ladder) and stays add-only, as in the anzan exams.
    // New fields: level (4-6), iconKey (a kit.js WS.icon name), mastery (same rule as every node),
    // drill.operandsMax (row length varies operands..operandsMax), drill.flashSec (suggested seconds per
    // flashed number), drill.op: 'mul' (multiplication drill, see engine.js Phase 4) and method (mul nodes:
    // the placement rule in three short lines). Mul nodes keep demos/guided as [a, b] pairs: use
    // lessonStep(node, pair) to turn any demo/guided pair into start value, target and animated steps.

    // Level 4
    { id: 'long_rows', level: 4, title: 'Long rows: 8 to 10 numbers', short: 'Long rows', icon: 'telescope', iconKey: 'plus',
      intro: 'Long rows use every friend you know. Keep going number after number, keep your finger on your place, and let the beads do the thinking.',
      demos: [[9, 7], [16, -8], [8, 6]],                                                 // one row: 9 +7 -8 +6
      guided: [[24, 8], [32, -5], [27, 6], [33, -9], [24, 7], [31, -4]],                 // one row: 24 +8 -5 +6 -9 +7 -4 = 27
      drill: { operands: 8, operandsMax: 10, digits: 1, maxTotal: 99, allowSubtraction: true, allowedRules: ALL } },
    { id: 'rows_2d', level: 4, title: 'Two-digit rows: 5 numbers', short: '2-digit ×5', icon: 'castle', iconKey: 'star',
      intro: 'Five two-digit numbers in a row. Tens rod first, then units. When the tens rod is full, a big friend carries onto the hundreds rod.',
      demos: [[46, 38], [84, 57], [141, -65]],
      guided: [[35, 47], [82, 29], [111, -46], [65, 58], [123, -79]],                    // one row: = 44
      drill: { operands: 5, digits: 2, minTerm: 10, maxTotal: 999, allowSubtraction: true, allowedRules: ALL, require: ['ten:*:*:1-2', 'combined:*:*:1-2'] } },
    { id: 'anzan_more', level: 4, title: 'Mental abacus: 5 numbers', short: 'Mental ×5', icon: 'owl', iconKey: 'bolt', kind: 'flash',
      intro: 'Same mental beads, more numbers. Picture the abacus, add each number as it flashes, and keep the picture still between numbers.',
      demos: [[7, 8], [15, 6]],
      guided: [[6, 9], [15, 7], [22, 5]],
      review: ['add_direct', 'sf_add', 'bf_add_a', 'bf_add_b'],
      drill: { operands: 5, digits: 1, maxTotal: 99, allowSubtraction: false, allowedRules: ALL, flash: true, flashSec: 1.0 } },

    // Level 5
    { id: 'three_digit', level: 5, title: 'Three-digit numbers', short: '3-digit', icon: 'tent', iconKey: 'sprout',
      intro: 'Now three rods for each number: hundreds, tens, units. Always start on the left. Each rod is just a one-digit sum you already know.',
      demos: [[125, 341], [468, 275], [703, -458]],
      guided: [[214, 352], [566, 187], [753, -329], [424, 596], [1020, -485]],          // one row: = 535
      drill: { operands: 3, operandsMax: 5, digits: 3, minTerm: 100, maxTotal: 9999, allowSubtraction: true, allowedRules: ALL } },
    { id: 'times_a', level: 5, title: 'Times tables 2 to 5', short: '× 2–5', icon: 'ferriswheel', iconKey: 'keypad',
      intro: '3 × 4 means three 4s: 4, 8, 12. Count up on the abacus to see it, then learn the answer by heart. Fast facts make abacus multiplying easy.',
      demos: [[3, 4], [6, 2], [4, 5]],
      guided: [[2, 3], [3, 3], [5, 4], [7, 2], [4, 4], [8, 5]],
      review: ['three_digit', 'rows_2d'],
      drill: { op: 'mul', a: [2, 9], bSet: [2, 3, 4, 5] } },
    { id: 'times_b', level: 5, title: 'Times tables 6 to 9', short: '× 6–9', icon: 'ferriswheel', iconKey: 'keypad',
      intro: 'The bigger tables. 3 × 7 is three 7s: 7, 14, 21. Count up a few times, then say the fact without counting.',
      demos: [[3, 6], [4, 8]],
      guided: [[2, 6], [4, 7], [6, 6], [8, 8], [9, 7], [7, 9]],
      review: ['times_a', 'three_digit'],
      drill: { op: 'mul', a: [2, 9], bSet: [6, 7, 8, 9] } },
    { id: 'anzan_2d', level: 5, title: 'Mental abacus: two-digit', short: 'Mental 2-digit', icon: 'owl', iconKey: 'bolt', kind: 'flash',
      intro: 'Picture two rods now: tens and units. Add the tens first, then the units, just like on the real abacus.',
      demos: [[24, 35], [59, 47]],
      guided: [[31, 26], [57, 48], [105, 23]],
      review: ['add_direct', 'sf_add', 'bf_add_a', 'bf_add_b', 'long_rows'],
      drill: { operands: 3, digits: 2, minTerm: 10, maxTotal: 999, allowSubtraction: false, allowedRules: ALL, flash: true, flashSec: 1.5 } },

    // Level 6
    { id: 'four_digit', level: 6, title: 'Four-digit numbers', short: '4-digit', icon: 'rocket', iconKey: 'star',
      intro: 'Thousands, hundreds, tens, units: four rods for each number. Left to right, one rod at a time, every friend still works.',
      demos: [[1234, 2345], [4876, 3459], [8205, -3768]],
      guided: [[2513, 1264], [3777, 4685], [8462, -2938], [5524, 3891]],               // one row: = 9415
      review: ['three_digit', 'rows_2d', 'long_rows'],
      drill: { operands: 3, operandsMax: 4, digits: 4, minTerm: 1000, maxTotal: 99999, allowSubtraction: true, allowedRules: ALL } },
    { id: 'mul_2x1', level: 6, title: 'Multiplying: 2-digit × 1-digit', short: '2-digit ×', icon: 'palette', iconKey: 'abacus',
      intro: 'Start at 0. Go left to right: times each digit by the small number and add the answer to the abacus. Every times answer takes two rods.',
      method: ['Start with 0 on the abacus. Keep the problem on the card.',
        'Left to right: times each digit by the small number. Say the answer with two digits (6 is 06).',
        'The last digit of that answer goes on the same rod as the digit you multiplied; the first digit goes one rod to its left. Add it.'],
      demos: [[23, 3], [34, 6], [78, 9]],
      guided: [[13, 2], [24, 3], [42, 5], [56, 4], [67, 8], [89, 7]],
      review: ['times_b', 'times_a', 'four_digit'],
      drill: { op: 'mul', a: [12, 99], b: [2, 9], zeros: 'none', twoDigitPartial: true } },
    { id: 'mul_3x1', level: 6, title: 'Multiplying: 3-digit × 1-digit', short: '3-digit ×', icon: 'palette', iconKey: 'abacus',
      intro: 'Same method, one more digit: hundreds, then tens, then units. A 0 digit gives 00, so nothing to add: just move one rod right.',
      method: ['Start with 0 on the abacus. Keep the problem on the card.',
        'Left to right: hundreds, tens, units. Times each digit by the small number (two digits: 6 is 06, 0 is 00).',
        'The last digit goes on the rod of the digit you multiplied, the first digit one rod to its left. Add it.'],
      demos: [[123, 3], [406, 7], [358, 6]],
      guided: [[213, 3], [142, 4], [305, 6], [476, 5], [829, 7]],
      review: ['mul_2x1', 'times_b', 'times_a'],
      drill: { op: 'mul', a: [102, 999], b: [2, 9], zeros: 'inner', twoDigitPartial: true } },
  ];
  const NODES = NODE_SPECS.map(compileNode);
  // Drill shapes (the Level 4-6 nodes above use these shapes). Each is a plain generateSet2 config once compiled.
  const TEMPLATES = {
    longRows:   { operands: 8, digits: 1, maxTotal: 99, allowSubtraction: true, allowedRules: ALL },          // 8-10 rows of 1-digit
    longRows2:  { operands: 8, digits: 2, minTerm: 10, maxTotal: 999, allowSubtraction: true, allowedRules: ALL },
    threeDigit: { operands: 5, digits: 3, minTerm: 100, maxTotal: 9999, allowSubtraction: true, allowedRules: ALL },
    fourDigit:  { operands: 5, digits: 4, minTerm: 1000, maxTotal: 99999, allowSubtraction: true, allowedRules: ALL },
    // Rod-limited example (uses the rods field of a move spec): 3-digit adding where big friends are
    // only allowed from the hundreds rod up, and at least one big friend happens on the hundreds rod.
    rodLimited: { operands: 4, digits: 3, minTerm: 100, maxTotal: 9999, allowSubtraction: false, allow: ['direct', 'five', 'ten:*:*:2-4'], require: ['ten:add:*:2'] },
  };
  const BY_ID = Object.fromEntries(NODES.map(n => [n.id, n]));

  const FRIEND5 = { 1: 4, 2: 3, 3: 2, 4: 1 };
  const FRIEND10 = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1 };

  // Build an animated explanation for adding/subtracting `delta` to `total`, worked
  // left to right (highest rod first) the way a soroban is actually used.
  // Returns steps: [{say, do:[{rod, delta}]}] - `do` applies bead moves in order.
  function explain(total, delta) {
    const rods = String(total).padStart(8, '0').split('').reverse().map(Number);
    const steps = [];
    const op = delta >= 0 ? 'add' : 'sub';
    const ROD_NAMES = ['', 'tens', 'hundreds', 'thousands', 'ten-thousands'];
    const place = r => r === 0 ? '' : ROD_NAMES[r] ? ` on the ${ROD_NAMES[r]} rod` : ' on the next rod';
    steps.push({ say: `We have ${total}. ${op === 'add' ? 'Add' : 'Take away'} ${Math.abs(delta)}.`, do: [] });

    function applyDigit(r, d, isCarry) {
      const v = rods[r];
      const rule = op === 'add' ? E.classifyAdd(v, d) : E.classifySub(v, d);
      const sign = op === 'add' ? 1 : -1;
      if (rule === 'direct') {
        rods[r] += sign * d;
        steps.push({ say: isCarry ? (op === 'add' ? `Add 1${place(r)}.` : `Take 1${place(r)}.`)
                                  : `${op === 'add' ? 'Push' : 'Push away'} ${d}${place(r)}: enough beads, no trick.`, do: [{ rod: r, delta: sign * d }] });
        return;
      }
      if (rule === 'five') {
        const f = FRIEND5[d];
        rods[r] += sign * d;
        if (op === 'add') steps.push({ say: `Not enough 1-beads for ${d}${place(r)}. Small friend of ${d} is ${f}: add 5, take away ${f}.`, do: [{ rod: r, delta: 5 }, { rod: r, delta: -f }] });
        else steps.push({ say: `The 1-beads for ${d} aren't there${place(r)}. Small friend of ${d} is ${f}: take away 5, add ${f}.`, do: [{ rod: r, delta: -5 }, { rod: r, delta: f }] });
        return;
      }
      // ten or combined: carry/borrow on the next rod first, then fix this rod
      const f = FRIEND10[d];
      steps.push({ say: op === 'add' ? `No room for ${d}${place(r)}. Big friend of ${d} is ${f}: add 10 on the next rod…`
                                     : `Not enough to take ${d}${place(r)}. Big friend of ${d} is ${f}: take 10 from the next rod…`, do: [] });
      applyDigit(r + 1, 1, true);
      rods[r] += sign * d - sign * 10;
      if (op === 'add') steps.push({ say: `…and take away ${f}${rule === 'combined' ? ` (taking ${f} needs the small friend: take 5, add ${FRIEND5[f]})` : ''}.`, do: rule === 'combined' ? [{ rod: r, delta: -5 }, { rod: r, delta: 5 - f }] : [{ rod: r, delta: -f }] });
      else steps.push({ say: `…and add ${f}${rule === 'combined' ? ` (adding ${f} needs the small friend: add 5, take ${FRIEND5[f]})` : ''}.`, do: rule === 'combined' ? [{ rod: r, delta: 5 }, { rod: r, delta: f - 5 }] : [{ rod: r, delta: f }] });
    }
    const digits = String(Math.abs(delta)).split('').reverse().map(Number);
    for (let r = digits.length - 1; r >= 0; r--) if (digits[r]) applyDigit(r, digits[r], false);
    steps.push({ say: `Now it shows ${total + delta}.`, do: [] });
    return steps;
  }

  // --- Multiplication explanation (left to right, soroban placement) ---------------
  // explainMul(a, b, opts) -> steps [{say, do:[{rod, delta}]}], the same shape as explain(): the abacus
  // starts at 0 and `do` moves end on a*b. Each partial product is one step whose `do` holds the bead
  // moves explain() would use to add it (so carries are shown properly).
  //   opts.countUp (default: true when a and b are both 1-digit): show a times-table fact by counting up
  //   on the abacus (3 x 7: 7, 14, 21) instead of placing the fact in one go.
  const PLACE = ['units', 'tens', 'hundreds', 'thousands', 'ten-thousands'];
  const moveList = steps => steps.reduce((o, st) => o.concat(st.do), []);
  function explainMul(a, b, opts) {
    a = Math.floor(Math.abs(a)); b = Math.floor(Math.abs(b));
    const ans = a * b, steps = [];
    const countUp = opts && opts.countUp !== undefined ? opts.countUp : (a < 10 && b < 10);
    if (countUp && a < 10 && b < 10) {
      const big = Math.max(a, b), times = Math.min(a, b);
      const seq = []; for (let k = 1; k <= times; k++) seq.push(big * k);
      steps.push({ say: `${a} × ${b} means ${times} groups of ${big}. Count up by ${big}s.`, do: [] });
      let total = 0;
      for (let k = 1; k <= times; k++) { steps.push({ say: `Add ${big}: ${seq.slice(0, k).join(', ')}.`, do: moveList(explain(total, big)) }); total += big; }
      steps.push({ say: `${a} × ${b} = ${ans}. Say it by heart: ${a} times ${b} is ${ans}.`, do: [] });
      return steps;
    }
    const parts = E.mulPartials(a, b);
    steps.push({ say: parts.length > 1 ? `${a} × ${b}. Start at 0. Go left to right: times each digit of ${a} by ${b}.`
                                       : `${a} × ${b}. Start at 0.`, do: [] });
    let total = 0;
    for (const pt of parts) {
      const two = String(pt.product).padStart(2, '0');
      if (!pt.value) { steps.push({ say: `${pt.digit} × ${b} = 00. Nothing to add: move one rod to the right.`, do: [] }); continue; }
      const where = pt.place + 1 < PLACE.length ? `${PLACE[pt.place + 1]} and ${PLACE[pt.place]} rods` : 'next two rods';
      const lead = parts.length > 1 ? `${pt.digit} is on the ${PLACE[pt.place]} rod, so ` : '';
      steps.push({ say: `${pt.digit} × ${b} = ${two}. ${lead}${two} goes on the ${where}: add ${pt.value}.`, do: moveList(explain(total, pt.value)) });
      total += pt.value;
    }
    steps.push({ say: `Now it shows ${ans}. ${a} × ${b} = ${ans}.`, do: [] });
    return steps;
  }

  // lessonStep(node, pair) -> { start, target, label, op, steps } for one demo/guided pair of any node:
  //   add/subtract nodes: pair = [total, delta] -> start total, target total+delta, steps explain(total, delta)
  //   mul nodes:          pair = [a, b]         -> start 0, target a*b, steps explainMul(a, b)
  // label is the card text ('34 × 6', '16 − 8'); op is 'add' | 'sub' | 'mul'.
  function lessonStep(node, pair) {
    const [x, y] = pair;
    if (node.drill && node.drill.op === 'mul') return { start: 0, target: x * y, label: `${x} × ${y}`, op: 'mul', steps: explainMul(x, y) };
    return { start: x, target: x + y, label: `${x} ${y < 0 ? '−' : '+'} ${Math.abs(y)}`, op: y < 0 ? 'sub' : 'add', steps: explain(x, y) };
  }

  // advanceCurrent(currentId, isMastered) -> id the child should be on. Moves past mastered nodes (e.g. a
  // child who had mastered 'anzan', the old last node, now continues at 'long_rows'). Pure.
  function advanceCurrent(currentId, isMastered) {
    let i = NODES.findIndex(n => n.id === currentId);
    if (i < 0) return NODES[0].id;
    while (i < NODES.length - 1 && isMastered(NODES[i].id)) i++;
    return NODES[i].id;
  }

  // --- Level tests ------------------------------------------------------------
  // levelTest(nodeId, opts) -> LevelTest, or null if the node has no drill (e.g. 'beads').
  // Pure: no clock, no storage. Pass opts.seed (or opts.rng) for a repeatable test.
  //   opts: { count = 10,            number of problems
  //           reviewShare = 0.3,     share of problems drawn from earlier nodes (rounded; 0 if none)
  //           operands,              override terms per problem (default: the node's drill)
  //           seed | rng,            randomness (default Math.random)
  //           secondsPerProblem,     fixed time per problem instead of the estimate below
  //           timeScale = 1 }        multiply the time limit (e.g. 1.5 for a younger child)
  // LevelTest = {
  //   nodeId, title, icon, kind,       kind: 'flash' for the mental-abacus node, else 'visual'
  //   count,
  //   problems: [{ terms, answer, rulesUsed, moveKeys, moves,   (as from SorobanEngine.generateSet2)
  //                nodeId,                                       node whose drill made this problem
  //                review }],                                    true = review of an earlier node
  //   timeLimitSec,                    recommended limit for the whole test (rounded up to 30 s)
  //   passRule: { minAccuracy: 0.8, withinTimeLimit: true }
  // }
  // Time estimate per problem: 5 s + per term (2 s + 4 s per digit), so a 4-term 1-digit problem is 29 s.
  // Multiplication (op 'mul'): 4 s + 6 s per digit of a (times fact 10 s, 2x1 16 s, 3x1 22 s).
  // Mul nodes' problems have the mul shape (op, terms [a, b], answer, partials; see engine.js Phase 4).
  const PASS_ACCURACY = 0.8;
  function shuffle(a, rng) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function problemSeconds(p) { return p.op === 'mul' ? 4 + 6 * String(p.terms[0]).length : 5 + p.terms.reduce((s, t) => s + 2 + 4 * String(Math.abs(t)).length, 0); }
  function levelTest(nodeId, opts) {
    opts = opts || {};
    const node = BY_ID[nodeId];
    if (!node) throw new Error('unknown node ' + nodeId);
    if (!node.drill) return null;
    const rng = opts.rng || (opts.seed !== undefined ? E.makeRng(opts.seed) : Math.random);
    const t = node.test || {};
    const count = Math.max(1, opts.count || t.count || 10);
    const idx = NODES.indexOf(node);
    const reviewIds = (node.review || NODES.slice(0, idx).filter(n => n.drill && !n.drill.flash).map(n => n.id))
      .filter(id => BY_ID[id] && BY_ID[id].drill).reverse();                   // most recent first
    const share = opts.reviewShare !== undefined ? opts.reviewShare : t.reviewShare !== undefined ? t.reviewShare : 0.3;
    const nReview = reviewIds.length ? Math.min(count - 1, Math.round(count * share)) : 0;
    const operands = opts.operands || node.drill.operands;
    const make = (n, k) => {                     // k problems from node n's drill; fall back to its own row count
      for (const ops of [operands, n.drill.operands]) {
        const cfg = Object.assign({}, n.drill, { operands: ops });
        if (ops !== n.drill.operands) delete cfg.operandsMax;         // an explicit row length is exact
        try { return E.generateSet2(cfg, k, rng); } catch (e) { /* try next shape */ }
      }
      return null;
    };
    const own = make(node, count - nReview);
    if (!own) throw new Error('could not build a level test for ' + nodeId);
    const problems = own.map(p => Object.assign(p, { nodeId, review: false }));
    const per = {};
    for (let j = 0; j < nReview; j++) { const id = reviewIds[j % reviewIds.length]; per[id] = (per[id] || 0) + 1; }
    let missing = 0;
    for (const id of Object.keys(per)) {
      const ps = make(BY_ID[id], per[id]);
      if (ps) ps.forEach(p => problems.push(Object.assign(p, { nodeId: id, review: true }))); else missing += per[id];
    }
    if (missing) (make(node, missing) || []).forEach(p => problems.push(Object.assign(p, { nodeId, review: false })));
    shuffle(problems, rng);
    const est = opts.secondsPerProblem ? opts.secondsPerProblem * problems.length : problems.reduce((s, p) => s + problemSeconds(p), 0);
    const timeLimitSec = Math.ceil(est * (opts.timeScale || 1) / 30) * 30;
    return { nodeId, title: node.title, icon: node.icon, kind: node.kind === 'flash' ? 'flash' : 'visual', count: problems.length,
      problems, timeLimitSec, passRule: { minAccuracy: PASS_ACCURACY, withinTimeLimit: true } };
  }

  // scoreLevelTest(test, answers, elapsedMs) -> LevelScore     (pure)
  //   answers[i] for test.problems[i]: a number, null/undefined (skipped), or { value, atMs } where atMs
  //   is ms since the test started. An answer counts only if correct AND in time: atMs <= limit when
  //   given, otherwise elapsedMs <= limit. So finishing late without per-answer times does not pass.
  // LevelScore = {
  //   passed,            accuracy >= passRule.minAccuracy (counting only in-time correct answers)
  //   accuracy,          correct in time / number of problems (0..1)
  //   correct,           correct in time;   correctAny: correct ignoring the clock
  //   total, answered, inTime (whole test within the limit), elapsedSec, timeLimitSec, minAccuracy,
  //   perProblem: [{ answer, expected, ok, late }],
  //   byNode: { nodeId: { correct, total } },      (in-time correct, split new skill vs review)
  //   certificate: null | { nodeId, title, icon, accuracyPct, correct, total, timeSec, timeLimitSec }
  // }                    certificate is filled only when passed; the caller adds the child's name and date.
  function scoreLevelTest(test, answers, elapsedMs) {
    answers = answers || [];
    const limitMs = test.timeLimitSec * 1000, el = Math.max(0, Number(elapsedMs) || 0);
    const minAccuracy = (test.passRule && test.passRule.minAccuracy) || PASS_ACCURACY;
    const byNode = {}; let correct = 0, correctAny = 0, answered = 0;
    const perProblem = test.problems.map((p, i) => {
      const a = answers[i];
      const value = a !== null && typeof a === 'object' ? a.value : a;
      const at = a !== null && typeof a === 'object' && Number.isFinite(a.atMs) ? a.atMs : null;
      const has = value !== null && value !== undefined && value !== '' && !Number.isNaN(Number(value));
      const right = has && Number(value) === p.answer;
      const late = has && (at !== null ? at > limitMs : el > limitMs);
      const ok = right && !late;
      if (has) answered++; if (right) correctAny++; if (ok) correct++;
      const b = byNode[p.nodeId] || (byNode[p.nodeId] = { correct: 0, total: 0 }); b.total++; if (ok) b.correct++;
      return { answer: has ? Number(value) : null, expected: p.answer, ok, late };
    });
    const total = test.problems.length, accuracy = total ? correct / total : 0;
    const passed = total > 0 && accuracy >= minAccuracy - 1e-9;
    const elapsedSec = Math.round(el / 1000);
    return { passed, accuracy, correct, correctAny, total, answered, inTime: el <= limitMs, elapsedSec, timeLimitSec: test.timeLimitSec, minAccuracy,
      perProblem, byNode,
      certificate: passed ? { nodeId: test.nodeId, title: test.title, icon: test.icon, accuracyPct: Math.round(accuracy * 100), correct, total, timeSec: elapsedSec, timeLimitSec: test.timeLimitSec } : null };
  }

  const api = { NODES, BY_ID, explain, explainMul, lessonStep, advanceCurrent, MASTERY, FRIEND5, FRIEND10, NODE_SPECS, TEMPLATES, compileNode, compileDrill, moveMatcher, levelTest, scoreLevelTest, PASS_ACCURACY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Curriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
