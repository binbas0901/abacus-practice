// Curriculum: ordered skill nodes, each with lesson examples + drill config.
// Depends on SorobanEngine (engine.js).
(function (root) {
  'use strict';
  const E = root.SorobanEngine;
  const ok = (m) => (m.carry && m.rule === 'direct');          // carry-propagation direct moves are always fine
  const direct = m => ok(m) || m.rule === 'direct';
  const five = (op, ds) => m => m.rule === 'five' && m.op === op && (!ds || ds.includes(m.d));
  const ten = (op, ds) => m => m.rule === 'ten' && m.op === op && (!ds || ds.includes(m.d));
  const any = (...fs) => m => fs.some(f => f(m));

  const NODES = [
    { id: 'beads', title: 'Beads & numbers', short: 'Beads', icon: '🧮', kind: 'numbers',
      intro: 'The top bead is worth 5. Each bottom bead is worth 1. A bead counts when it touches the bar.',
      lesson: { numbers: [1, 3, 5, 7, 9, 4, 6, 10, 23] },
      drill: null },
    { id: 'add_direct', title: 'Adding, just beads', short: 'Add', icon: '➕',
      intro: 'When there are enough beads, just push them to the bar. No tricks yet.',
      demos: [[1, 2], [3, 5], [5, 3], [11, 6]], guided: [[2, 2], [1, 3], [5, 2], [6, 3], [10, 5], [12, 7]],
      drill: { operands: 3, digits: 1, maxTotal: 9, allowSubtraction: false, allowMove: direct } },
    { id: 'sub_direct', title: 'Taking away, just beads', short: 'Take away', icon: '➖',
      intro: 'If the beads are already at the bar, just push them away.',
      demos: [[3, -2], [8, -3], [7, -5], [19, -4]], guided: [[4, -1], [9, -4], [6, -5], [8, -2], [17, -6], [15, -5]],
      drill: { operands: 3, digits: 1, maxTotal: 9, allowSubtraction: true, allowMove: direct, requireMove: m => m.op === 'sub' } },
    { id: 'sf_add', title: 'Small friends: adding', short: 'Small +', icon: '🤝', family: 5,
      intro: 'Not enough 1-beads? Use the 5-bead and take away its small friend. 1↔4 and 2↔3 are small friends: they make 5.',
      demos: [[4, 1], [3, 2], [2, 3], [1, 4], [4, 4]], guided: [[4, 2], [3, 3], [2, 4], [1, 4], [4, 3], [13, 4]],
      drill: { operands: 4, digits: 1, maxTotal: 9, allowSubtraction: false, allowMove: any(direct, five('add')), requireMove: five('add') } },
    { id: 'sf_sub', title: 'Small friends: taking away', short: 'Small −', icon: '🤝', family: 5,
      intro: 'Need to take away but the 1-beads are not there? Take away the 5-bead and add back its small friend.',
      demos: [[5, -1], [6, -2], [7, -3], [8, -4]], guided: [[5, -2], [6, -3], [7, -4], [5, -4], [8, -4], [16, -2]],
      drill: { operands: 4, digits: 1, maxTotal: 9, allowSubtraction: true, allowMove: any(direct, five('add'), five('sub')), requireMove: five('sub') } },
    { id: 'bf_add_a', title: 'Big friends: +9 +8 +7 +6', short: 'Big + (6–9)', icon: '⭐', family: 10,
      intro: 'Not enough room on the rod? Add 10 on the next rod and take away the big friend. 1↔9, 2↔8, 3↔7, 4↔6, 5↔5 make 10.',
      demos: [[8, 9], [7, 8], [4, 7], [9, 6]], guided: [[2, 9], [3, 8], [5, 7], [4, 6], [9, 9], [15, 8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: false, allowMove: any(direct, five('add'), ten('add', [6, 7, 8, 9])), requireMove: ten('add', [6, 7, 8, 9]) } },
    { id: 'bf_add_b', title: 'Big friends: +5 +4 +3 +2 +1', short: 'Big + (1–5)', icon: '⭐', family: 10,
      intro: 'Same trick with smaller numbers: add 10, take away the big friend.',
      demos: [[9, 1], [8, 2], [7, 3], [6, 4], [5, 5]], guided: [[9, 2], [8, 3], [7, 4], [9, 5], [6, 5], [19, 1]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: false, allowMove: any(direct, five('add'), ten('add')), requireMove: ten('add', [1, 2, 3, 4, 5]) } },
    { id: 'bf_sub_a', title: 'Big friends: −9 −8 −7 −6', short: 'Big − (6–9)', icon: '🌙', family: 10,
      intro: 'Not enough beads to take away? Take 10 from the next rod and add back the big friend.',
      demos: [[10, -9], [11, -8], [13, -7], [15, -6]], guided: [[10, -8], [12, -9], [14, -7], [11, -6], [20, -9], [16, -8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allowMove: any(direct, five('add'), five('sub'), ten('add'), ten('sub', [6, 7, 8, 9])), requireMove: ten('sub', [6, 7, 8, 9]) } },
    { id: 'bf_sub_b', title: 'Big friends: −5 −4 −3 −2 −1', short: 'Big − (1–5)', icon: '🌙', family: 10,
      intro: 'Same trick with smaller numbers: take 10, add back the big friend.',
      demos: [[10, -1], [11, -2], [10, -3], [12, -4], [10, -5]], guided: [[10, -2], [11, -3], [13, -4], [10, -4], [14, -5], [21, -2]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allowMove: any(direct, five('add'), five('sub'), ten('add'), ten('sub')), requireMove: ten('sub', [1, 2, 3, 4, 5]) } },
    { id: 'combined', title: 'Both friends together', short: 'Both', icon: '🎯',
      intro: 'Sometimes the big-friend step needs a small-friend step inside it. Two tricks, one move.',
      demos: [[6, 7], [5, 8], [12, -7], [11, -6]], guided: [[6, 6], [7, 7], [5, 9], [13, -7], [14, -6], [12, -8]],
      drill: { operands: 4, digits: 1, maxTotal: 99, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten', 'combined'], requireMove: m => m.rule === 'combined' } },
    { id: 'two_digit', title: 'Two-digit numbers', short: '2-digit', icon: '💪',
      intro: 'Work left to right: tens rod first, then units. Every rod uses the same friends.',
      demos: [[23, 45], [38, 27], [64, -29]], guided: [[12, 34], [25, 48], [57, 36], [72, -45], [60, -27], [81, -56]],
      drill: { operands: 4, digits: 2, minTerm: 10, maxTotal: 999, allowSubtraction: true, allowedRules: ['direct', 'five', 'ten', 'combined'] } },
    { id: 'anzan', title: 'Mental abacus', short: 'Mental', icon: '🧠', kind: 'flash',
      intro: 'Picture the beads in your head. Numbers flash by; move the beads in your mind; say the answer.',
      drill: { operands: 3, digits: 1, maxTotal: 99, allowSubtraction: false, allowedRules: ['direct', 'five', 'ten', 'combined'], flash: true } },
  ];
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
    const place = r => r === 0 ? '' : r === 1 ? ' on the tens rod' : r === 2 ? ' on the hundreds rod' : ' on the next rod';
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

  const api = { NODES, BY_ID, explain, FRIEND5, FRIEND10 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Curriculum = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
