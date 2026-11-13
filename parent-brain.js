// Parent Brain: pure logic behind the grown-ups view (weekly report, tonight's tip, gentle alerts, share text).
// No DOM, no storage, no network. Every function takes plain data, so it keeps working however storage changes.
// Everything stays on the device: this module never sends anything anywhere.
// Browser: window.ParentBrain (load after engine.js and curriculum.js). Node: require('./parent-brain.js').
/*
  INPUT SHAPES (what app.js stores today; adapt here if storage changes)

  data = {
    history:  [Session],      // localStorage 'abacus.history'  (newest first, max 200; order does not matter here)
    days:     {'YYYY-MM-DD': true},   // localStorage 'abacus.days'  (any finished activity: drill, lesson or game)
    progress: Progress|null,  // localStorage 'abacus.progress' (null for a brand-new child)
    settings: {name}          // optional; localStorage 'abacus.settings' (only .name is read)
  }
  Session = { at: ISO string, mode: 'visual'|'listen'|'flash', node: nodeId, count, correct, secs,
              missed: [{ terms:[7,3,-4], answer, given:'14', rules:['ten'] }],
              results?: [true,false,...] }   // optional per-problem order, if app.js ever stores it
  Progress = { current: nodeId,
               nodes: { [nodeId]: { lesson: bool, mastered: 'auto'|'parent'|'placed'|null,
                                    hist: [{ ok: bool, day: 'YYYY-MM-DD' }],   // oldest first, last 40 kept
                                    masteredAt?: ISO|'YYYY-MM-DD' } } }        // optional, used if present
  opts = { now: Date|number|ISO (default: now), child: {name} | 'Name' (default: data.settings.name),
           lastTipId?: string (avoid repeating yesterday's tip), engine?, curriculum? (injection for tests) }

  Dates are local calendar days ('YYYY-MM-DD'), matching app.js todayKey(). A "week" is the 7 days ending today.
  Minutes come from drill sessions only (lessons and games are not timed by app.js).
*/
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  function getEngine(o) { return (o && o.engine) || root.SorobanEngine || (isNode ? require('./engine.js') : null); }
  function getCurriculum(o) { return (o && o.curriculum) || root.Curriculum || (isNode ? require('./curriculum.js') : null); }

  const NEEDED = 0.8, WINDOW = 20, DAYS_NEEDED = 2;
  const FRIEND5 = { 1: 4, 2: 3, 3: 2, 4: 1 };
  const FRIEND10 = { 1: 9, 2: 8, 3: 7, 4: 6, 5: 5, 6: 4, 7: 3, 8: 2, 9: 1 };
  const FALLBACK_TITLES = { beads: 'Beads & numbers', add_direct: 'Adding, just beads', sub_direct: 'Taking away, just beads',
    sf_add: 'Small friends: adding', sf_sub: 'Small friends: taking away', bf_add_a: 'Big friends: +9 +8 +7 +6',
    bf_add_b: 'Big friends: +5 +4 +3 +2 +1', bf_sub_a: 'Big friends: −9 −8 −7 −6', bf_sub_b: 'Big friends: −5 −4 −3 −2 −1',
    combined: 'Both friends together', two_digit: 'Two-digit numbers', anzan: 'Mental abacus' };
  const ORDER = Object.keys(FALLBACK_TITLES);

  /* ---------------- small helpers ---------------- */
  function toDate(x) { return x instanceof Date ? new Date(x.getTime()) : x === undefined || x === null ? new Date() : new Date(x); }
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function parseKey(k) { const [y, m, d] = String(k).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return dayKey(d); }
  function daysBetween(a, b) { return Math.round((parseKey(b) - parseKey(a)) / 864e5); }   // b - a, DST-safe via rounding
  function sessionDay(s) { const d = new Date(s.at); return isNaN(d) ? null : dayKey(d); }
  function inRange(k, from, to) { return k && k >= from && k <= to; }
  function pct(x) { return x === null || x === undefined ? null : Math.round(x * 100); }
  function norm(data) {
    data = data || {};
    return { history: Array.isArray(data.history) ? data.history : [], days: data.days && typeof data.days === 'object' ? data.days : {},
      progress: data.progress && data.progress.nodes ? data.progress : { current: (data.progress && data.progress.current) || 'beads', nodes: {} },
      settings: data.settings || {} };
  }
  function childName(data, opts) {
    const c = opts && opts.child; const n = typeof c === 'string' ? c : c && c.name;
    return String(n || (data.settings && data.settings.name) || '').trim();
  }
  function nodeTitle(id, opts) { const C = getCurriculum(opts); const n = C && C.BY_ID && C.BY_ID[id]; return (n && n.title) || FALLBACK_TITLES[id] || id; }
  function nodeOrder(opts) { const C = getCurriculum(opts); return C && C.NODES ? C.NODES.map(n => n.id) : ORDER; }
  function windowStats(hist) {
    const h = (hist || []).slice(-WINDOW);
    return { n: h.length, accuracy: h.length ? h.filter(x => x.ok).length / h.length : null, days: new Set(h.map(x => x.day)).size };
  }
  function sessionsIn(history, from, to) { return history.filter(s => inRange(sessionDay(s), from, to)); }
  function sumAcc(sessions) {
    let n = 0, c = 0; for (const s of sessions) { n += +s.count || 0; c += +s.correct || 0; }
    return { problems: n, correct: c, accuracy: n ? c / n : null };
  }
  function practicedDays(d) {   // every day with any activity: abacus.days plus drill sessions
    const set = new Set(Object.keys(d.days).filter(k => d.days[k]));
    for (const s of d.history) { const k = sessionDay(s); if (k) set.add(k); }
    return set;
  }

  /* ---------------- mastery date ----------------
     app.js does not store when a skill was learned. Use masteredAt if present, else replay the kept hist
     (last 40) and find the first point where the last-20 window met the gate (80% on >= 2 days). */
  function masteredDay(st) {
    if (!st || !st.mastered) return null;
    if (st.masteredAt) { const d = new Date(st.masteredAt); return /^\d{4}-\d\d-\d\d$/.test(st.masteredAt) ? st.masteredAt : isNaN(d) ? null : dayKey(d); }
    if (st.mastered !== 'auto') return null;          // set by a grown-up or the level check: no "learned this week" claim
    const h = st.hist || [];
    for (let i = WINDOW - 1; i < h.length; i++) {
      const w = windowStats(h.slice(i - WINDOW + 1, i + 1));
      if (w.accuracy >= NEEDED && w.days >= DAYS_NEEDED) return h[i].day;
    }
    return h.length ? h[h.length - 1].day : null;
  }

  /* ---------------- which technique a missed problem needed ---------------- */
  function techniqueLabel(op, rule, d) {
    const s = op === 'add' ? '+' : '−', f5 = FRIEND5[d], f10 = FRIEND10[d];
    if (rule === 'five') return `${s}${d} needs a small friend (${op === 'add' ? `+5 −${f5}` : `−5 +${f5}`})`;
    if (rule === 'ten') return `${s}${d} needs a big friend (${op === 'add' ? `+10 −${f10}` : `−10 +${f10}`})`;
    if (rule === 'combined') return `${s}${d} needs both friends (${op === 'add' ? `+10 −${f10}` : `−10 +${f10}`}, and the ${f10} uses a small friend)`;
    return `${s}${d} with just beads`;
  }
  // What each drill is there to practise (mirrors curriculum.js requireMove). A miss in that drill most likely came from it.
  const NODE_FOCUS = {
    sf_add: m => m.rule === 'five' && m.op === 'add', sf_sub: m => m.rule === 'five' && m.op === 'sub',
    bf_add_a: m => m.rule === 'ten' && m.op === 'add' && m.d >= 6, bf_add_b: m => m.rule === 'ten' && m.op === 'add' && m.d <= 5,
    bf_sub_a: m => m.rule === 'ten' && m.op === 'sub' && m.d >= 6, bf_sub_b: m => m.rule === 'ten' && m.op === 'sub' && m.d <= 5,
    combined: m => m.rule === 'combined',
  };
  // Returns [{key, op, rule, d}] (deduplicated) for the techniques that could explain this wrong answer.
  function suspects(miss, E, nodeId) {
    const terms = (miss && miss.terms) || []; if (!terms.length || !E || !E.stepMoves) return [];
    let total = 0; const all = [];
    terms.forEach((t, i) => {
      let moves = []; try { moves = E.stepMoves(total, t); } catch (e) { moves = []; }
      if (i > 0 || terms.length === 1) for (const m of moves) if (!(m.carry && m.rule === 'direct')) all.push({ op: m.op, rule: m.rule, d: m.d });
      total += t;
    });
    let pool = all.filter(m => m.rule !== 'direct'); if (!pool.length) pool = all;
    // Sharpen with the given answer: off by a multiple of 10 smells like a forgotten carry/borrow; off by 5 like a five-bead slip.
    const given = parseInt(miss.given, 10), ans = +miss.answer;
    if (!isNaN(given) && !isNaN(ans) && given !== ans) {
      const diff = Math.abs(given - ans);
      const tens = pool.filter(m => m.rule === 'ten' || m.rule === 'combined'), fives = pool.filter(m => m.rule === 'five' || m.rule === 'combined');
      if (diff % 10 === 0 && tens.length) pool = tens; else if (diff % 10 === 5 && fives.length) pool = fives;
    }
    const focus = NODE_FOCUS[nodeId], focused = focus ? pool.filter(focus) : [];
    if (focused.length) pool = focused;
    const seen = new Map(); for (const m of pool) { const key = `${m.op}:${m.rule}:${m.d}`; if (!seen.has(key)) seen.set(key, Object.assign({ key }, m)); }
    return [...seen.values()];
  }
  const RULE_WEIGHT = { combined: 4, ten: 3, five: 2, direct: 1 };
  function missedGroups(sessions, E) {
    const g = new Map();
    for (const s of sessions) for (const miss of (s.missed || [])) for (const m of suspects(miss, E, s.node)) {
      const cur = g.get(m.key) || { key: m.key, op: m.op, rule: m.rule, d: m.d, label: techniqueLabel(m.op, m.rule, m.d), count: 0, flash: 0, nodes: {}, example: null };
      cur.count++; if (s.mode === 'flash') cur.flash++; cur.nodes[s.node] = (cur.nodes[s.node] || 0) + 1;
      if (!cur.example) cur.example = { terms: miss.terms, answer: miss.answer, given: miss.given };
      g.set(m.key, cur);
    }
    return [...g.values()].sort((a, b) => b.count - a.count || RULE_WEIGHT[b.rule] - RULE_WEIGHT[a.rule] || a.d - b.d);
  }

  /* ---------------- 1. weekly report ---------------- */
  function weeklyReport(data, opts) {
    opts = opts || {}; const d = norm(data), E = getEngine(opts), today = dayKey(toDate(opts.now));
    const from = addDays(today, -6), practiced = practicedDays(d);
    const days = []; for (let i = 6; i >= 0; i--) { const k = addDays(today, -i); days.push({ date: k, practiced: practiced.has(k) }); }
    const week = sessionsIn(d.history, from, today), acc = sumAcc(week);
    const accuracyTrend = [];
    for (let w = 3; w >= 0; w--) {
      const end = addDays(today, -7 * w), start = addDays(end, -6), a = sumAcc(sessionsIn(d.history, start, end));
      accuracyTrend.push({ weekStart: start, weekEnd: end, problems: a.problems, accuracy: a.accuracy });
    }
    const order = nodeOrder(opts);
    const masteredThisWeek = order.filter(id => inRange(masteredDay(d.progress.nodes[id]), from, today)).map(id => ({ nodeId: id, label: nodeTitle(id, opts) }));
    const curId = d.progress.current || 'beads', cs = d.progress.nodes[curId] || {}, w = windowStats(cs.hist);
    return {
      child: childName(d, opts), weekStart: from, weekEnd: today,
      days, daysPracticed: days.filter(x => x.practiced).length,
      minutes: Math.round(week.reduce((t, s) => t + (+s.secs || 0), 0) / 60),
      sessions: week.length, problems: acc.problems, correct: acc.correct, accuracy: acc.accuracy,
      accuracyTrend, masteredThisWeek,
      current: { nodeId: curId, label: nodeTitle(curId, opts), accuracy: w.accuracy, problems: w.n, problemsNeeded: WINDOW,
        needed: NEEDED, daysOk: w.days, daysNeeded: DAYS_NEEDED, mastered: !!cs.mastered, lessonDone: !!cs.lesson },
      missedMost: missedGroups(week, E).slice(0, 3).map(g => ({ key: g.key, op: g.op, rule: g.rule, digit: g.d, label: g.label, count: g.count, example: g.example })),
    };
  }

  /* ---------------- 2. tonight's tip ----------------
     Library keyed by topic. Each tip: (name, d, f) -> {title, text, why}. d is the digit, f its friend.
     Written for a grown-up who has never used an abacus: every term is explained the first time it appears. */
  const T = {
    beads: [
      (n) => ({ title: 'The 5-bead is a shortcut', text: `Ask ${n} to show you 7 on the abacus and tell you which beads count. The one top bead is worth 5, each bottom bead is worth 1, and a bead only counts when it touches the middle bar. So 7 = the top bead + 2 bottom beads.`, why: 'Seeing 5 as one bead, not five things to count, is the base of every trick that comes later.' }),
      (n) => ({ title: 'Hand abacus', text: `Make a hand abacus together: a flat hand on the table is the 5-bead, fingers on the other hand are the 1-beads. Call out numbers from 0 to 9 and let ${n} build them as fast as possible. Then swap: ${n} calls, you build (and make a silly mistake for ${n} to catch).`, why: 'Building numbers from "5 and some more" makes the abacus picture stick in the head.' }),
      (n) => ({ title: 'One pinch for 6 to 9', text: `Ask ${n} to show 8 on the abacus in one move, a "pinch": the thumb pushes 3 bottom beads up while the pointing finger brings the top bead down, both at the same time. Try 6, 7, 8 and 9 the same way.`, why: 'Abacus teachers want 6 to 9 set in one pinch, never by counting beads one at a time.' }),
    ],
    direct_add: [
      (n, d) => ({ title: 'Say it before you move it', text: `Ask ${n} to show 2, then tell you out loud what will happen before adding ${d || 3}: "I push up ${d || 3} bottom beads." Then do it. Try four or five like this.`, why: 'Naming the move before making it builds the habit that the later tricks rely on.' }),
      (n) => ({ title: 'Thumb up, finger down', text: `Watch ${n}'s fingers for one minute. On an abacus the thumb pushes bottom beads up (adding), and the pointing finger pushes them down (taking away) and moves the top bead. Gently point it out if a different finger sneaks in.`, why: 'Using the same finger for the same move every time is what makes abacus fast later.' }),
      (n) => ({ title: 'Beads, not fingers', text: `Give ${n} three quick ones like 3 + 1, 5 + 2, 6 + 3, and ask for the answer read from the beads, not counted on fingers. Cheer when ${n} says "I can see it!"`, why: 'The abacus is the calculator here; reading the answer from the beads trains the picture-in-the-head skill.' }),
    ],
    direct_sub: [
      (n, d) => ({ title: 'Push away', text: `Ask ${n} to show 8, then take away ${d || 3} by pushing beads away from the middle bar, saying it first: "I push down ${d || 3}." Do four or five, then let ${n} give you one.`, why: 'Taking away is the same picture backwards; saying it first keeps it calm and exact.' }),
      (n) => ({ title: 'Which bead goes?', text: `Show 7 (top bead + 2 bottom beads) and ask: "If we take away 5, which bead leaves?" Then try taking away 2, then 7. Let ${n} explain it to you like a teacher.`, why: 'Knowing that the top bead is 5 in one piece makes taking away 5 to 9 a single move.' }),
    ],
    five_add: [
      (n, d, f) => ({ title: `${d} and ${f} are small friends`, text: `Small friends are pairs that make 5: 1 and 4, 2 and 3. Hold up ${d} fingers and ask: "What does ${d} need to make 5?" (${f}). Then ask it backwards: "What does ${f} need to make 5?" Do this 5 times with different numbers.`, why: `When there aren't enough bottom beads to add ${d}, the abacus way is "add 5, take away ${f}". If ${n} knows ${d}'s small friend instantly, that move becomes automatic.` }),
      (n, d, f) => ({ title: 'Say the trick out loud', text: `Ask ${n} to show 3 on the abacus, then add ${d}. Before moving, ${n} says: "Plus ${d} is plus 5, minus ${f}." Then moves the top bead down and pushes ${f} bottom beads away. Two or three times is plenty.`, why: 'Saying the friend before moving the beads is what abacus teachers recommend; it links the words to the hand.' }),
      (n, d) => ({ title: 'Small-friend clap game', text: `You say a number from 1 to 4, ${n} claps its small friend (the number that makes 5 with it: 1 and 4, 2 and 3). Say ${d} a few extra times. Go faster and faster, then swap roles.`, why: 'Quick recall of the pairs is the whole secret of the small-friend move.' }),
    ],
    five_sub: [
      (n, d, f) => ({ title: `Taking away ${d} with a small friend`, text: `Small friends are pairs that make 5 (1 and 4, 2 and 3). Show 5 on the abacus (just the top bead) and ask ${n} to take away ${d}. There are no bottom beads to remove, so: take away the 5-bead and add back ${f}. Ask ${n} to say it: "Minus ${d} is minus 5, plus ${f}."`, why: `Taking away ${d} when the bottom beads aren't there is the step ${n} found tricky; saying it aloud makes it a routine.` }),
      (n, d, f) => ({ title: 'Coin swap', text: `Put down a "5" coin or note and ask ${n} to pay you ${d}. ${n} gives you the 5 and you give back ${f} in ones. Do it with 1, 2, 3 and 4.`, why: `That swap is exactly the abacus move for −${d}: the 5-bead goes away and ${f} comes back.` }),
      (n) => ({ title: 'Friends backwards', text: `Ask ${n} the small-friend pairs both ways: "4 and...?" "1 and...?" "2 and...?" "3 and...?" Then mix them up quickly.`, why: 'Remembering pairs in only one direction is the most common beginner snag.' }),
    ],
    ten_add: [
      (n, d, f) => ({ title: `${d} needs ${f} to make 10`, text: `Hold up ${d} fingers and ask: "What does ${d} need to make 10?" (${f}). Big friends are pairs that make 10: 1 and 9, 2 and 8, 3 and 7, 4 and 6, 5 and 5. Go through a few, then end on ${d} and ${f} again.`, why: `When there's no room on the rod, "+${d}" is done as "add 10 on the next rod, take away ${f}". Knowing ${d}'s big friend instantly is the whole trick.` }),
      (n, d, f) => ({ title: 'Plus ten, minus the friend', text: `Ask ${n} to show 8 on the abacus, then add ${d}. Before moving, ${n} says: "Plus ${d} is plus 10, minus ${f}." One bead goes up on the rod to the left (that's the 10), then ${f} comes away on this rod. Do two or three.`, why: 'Saying the friend first, then moving, is how abacus teachers build the habit.' }),
      (n, d) => ({ title: 'Big-friend ping-pong', text: `You say a number from 1 to 9, ${n} answers with its big friend (the number that makes 10 with it). Slip in ${d} a few extra times. Speed up, then swap so ${n} quizzes you.`, why: 'Fast pair recall is what makes the big-friend move smooth instead of slow counting.' }),
      (n, d, f) => ({ title: 'Ten-snack test', text: `Line up 10 small snacks or toys. Hide ${f} under your hand and ask ${n}: "How many are hiding?" Then try other amounts.`, why: `Seeing 10 split into ${d} and ${f} makes the big-friend pair feel real, not memorized.` }),
    ],
    ten_sub: [
      (n, d, f) => ({ title: `Minus ${d}: borrow 10, give back ${f}`, text: `Big friends are pairs that make 10 (1+9, 2+8, 3+7, 4+6, 5+5). Ask ${n} to show 12 and take away ${d}. Not enough beads on the ones rod, so: take one bead from the tens rod (that's 10) and add back ${f}. ${n} says: "Minus ${d} is minus 10, plus ${f}."`, why: `That borrow-and-give-back move is the step ${n} found tricky. Saying it aloud turns it into a routine.` }),
      (n, d, f) => ({ title: 'Paying with a ten', text: `Give ${n} a "10" coin or note. Ask to buy something for ${d}. ${n} pays the 10, you give back change: ${f}. Do it for a few prices.`, why: `Giving change is exactly the abacus move for −${d}: 10 goes away, ${f} comes back.` }),
      (n) => ({ title: 'Big friends both ways', text: `Quiz the big-friend pairs (numbers that make 10) in both directions: "9 and...?" "1 and...?" "7 and...?" "3 and...?" Mix them up and keep it quick and silly.`, why: 'Knowing pairs in both directions makes the take-away version as easy as the adding version.' }),
    ],
    combined: [
      (n, d, f, op) => { const k = d >= 6 && d <= 9 ? d : 7, g = FRIEND10[k], s = FRIEND5[g];
        return { title: 'Two tricks in one move', text: op === 'sub'
          ? `Some problems need both friends. Try 14 − ${k} together: take 10 from the tens rod (big friend: give back ${g}). But adding ${g} on the ones rod needs the small friend too: add the 5-bead, take away ${s}. Ask ${n} to say each step out loud slowly; speed comes later.`
          : `Some problems need both friends. Try 5 + ${k} together: add 10 on the tens rod (big friend: take away ${g}). But taking ${g} from the 5-bead needs the small friend too: take away the 5-bead, add back ${s}. Ask ${n} to say each step out loud slowly; speed comes later.`,
          why: 'This is the trickiest move on the abacus. Slow, spoken steps beat fast guessing every time.' }; },
      (n) => ({ title: 'Both friends quiz', text: `Say a number from 1 to 4; ${n} says its small friend (makes 5) AND its big friend (makes 10). Example: 3 → "2 and 7". Do all four.`, why: 'The combined move needs both pairs at once, so practising them side by side helps most.' }),
      (n) => ({ title: 'Slow-motion replay', text: `After practice, pick one red (missed) problem and tap "Show me" together. Pause after each step and ask ${n}: "Which friend was that, the small one or the big one?"`, why: 'Watching the beads and naming each trick untangles which of the two steps went wrong.' }),
    ],
    two_digit: [
      (n) => ({ title: 'Tens first', text: `Ask ${n} to show 47: the 4 goes on the tens rod first, then 7 on the ones rod. Try 25, 63, 90. On the abacus we always work left to right, tens before ones.`, why: 'Going left to right, the same order we read, keeps two-digit problems tidy.' }),
      (n) => ({ title: 'One rod at a time', text: `Give ${n} 34 + 25 and ask to say it in parts: "Plus 2 on the tens rod, plus 5 on the ones rod." Each rod uses the same friends as before.`, why: 'Two-digit problems are just two one-digit moves; naming the rod keeps them from mixing up.' }),
      (n) => ({ title: 'Which rod?', text: `Say a two-digit number like 58; ${n} points to the rod each digit goes on before moving any beads. Five numbers, then ${n} quizzes you.`, why: 'Most two-digit slips are a digit on the wrong rod, not a wrong trick.' }),
    ],
    anzan: [
      (n) => ({ title: 'Air abacus', text: `Ask ${n} to "move the beads in the air" with the same fingers as on a real abacus while you say 3, plus 4, plus 2 slowly. Keep it to two or three numbers.`, why: 'Mental abacus (anzan) is picturing the beads; moving the fingers in the air helps the picture hold.' }),
      (n) => ({ title: 'Eyes closed, one number', text: `Ask ${n} to close their eyes and picture the abacus showing 6. "Which beads are touching the bar?" Then add 2 in the picture. Go slow; just three or four tries.`, why: 'A steady picture of one number comes before adding several in the head.' }),
      (n) => ({ title: 'Slower is faster', text: `In Flash practice, slide the speed to slower for tonight. Let ${n} get several right in a row before speeding up again.`, why: 'A clear picture at a slow speed builds faster than guessing at a fast one.' }),
    ],
    habits: [
      (n) => ({ title: 'Stop while it is fun', text: `Tonight, do just one short practice and stop while ${n} is still smiling. Tell ${n} one thing you noticed they did well, like "you used your thumb every time!"`, why: 'Teachers find 5 to 10 happy minutes a day beats a long tired session.' }),
      (n) => ({ title: 'Teach me', text: `Ask ${n} to teach you one move on the abacus, as if you are the student. Make a small mistake and let ${n} correct you.`, why: 'Explaining a move is one of the best ways to really own it, and it builds confidence.' }),
      (n) => ({ title: 'Praise the effort', text: `Instead of "you're so smart", try "you kept going on the hard one!" when ${n} finishes practice tonight.`, why: 'Praising effort keeps kids trying when the problems get harder.' }),
    ],
  };
  const HELP = { beads: 'beads', direct_add: 'direct', direct_sub: 'direct', five_add: 'small-friends', five_sub: 'small-friends',
    ten_add: 'big-friends', ten_sub: 'big-friends', combined: 'both-friends', two_digit: 'two-digit', anzan: 'mental', habits: 'practice-habits' };
  const NODE_TOPIC = { beads: ['beads'], add_direct: ['direct_add', 'add', 3], sub_direct: ['direct_sub', 'sub', 3], sf_add: ['five_add', 'add', 3],
    sf_sub: ['five_sub', 'sub', 3], bf_add_a: ['ten_add', 'add', 7], bf_add_b: ['ten_add', 'add', 3], bf_sub_a: ['ten_sub', 'sub', 7],
    bf_sub_b: ['ten_sub', 'sub', 3], combined: ['combined', 'add', 7], two_digit: ['two_digit'], anzan: ['anzan'] };

  function dayIndex(k) { return Math.floor(parseKey(k).getTime() / 864e5 + 0.5); }
  function topicFor(rule, op) { return rule === 'direct' ? 'direct_' + op : rule === 'combined' ? 'combined' : rule + '_' + op; }

  function tonightsTip(data, opts) {
    opts = opts || {}; const d = norm(data), E = getEngine(opts), today = dayKey(toDate(opts.now));
    const name = childName(d, opts) || 'your child';
    const recent = sessionsIn(d.history, addDays(today, -13), today);   // two weeks, so one quiet week still has something to work on
    const groups = missedGroups(recent, E), top = groups[0] || null;
    const cur = d.progress.current || 'beads';
    let topic, op, digit, reason;
    if (top) {
      const totalMiss = groups.reduce((t, g) => t + g.count, 0), flashMiss = groups.reduce((t, g) => t + g.flash, 0);
      const twoDigit = groups.reduce((t, g) => t + (g.nodes.two_digit || 0), 0);
      if (flashMiss * 2 > totalMiss) { topic = 'anzan'; reason = `${name} missed a few of the picture-in-your-head (Flash) problems.`; }
      else if (twoDigit * 2 > totalMiss && top.rule === 'direct') { topic = 'two_digit'; reason = `${name} missed a few two-digit problems.`; }
      else { topic = topicFor(top.rule, top.op); op = top.op; digit = top.d; reason = `${name}'s trickiest step lately: ${top.label}.`; }
    } else {
      const sessions = recent.length, nt = NODE_TOPIC[cur] || ['habits'];
      topic = nt[0]; op = nt[1]; digit = nt[2];
      reason = sessions ? `${name} got everything right lately, so here's a tip for the current skill (${nodeTitle(cur, opts)}).`
                        : `A gentle start for the current skill (${nodeTitle(cur, opts)}).`;
      if (sessions >= 3 && recent.every(s => !(s.missed || []).length)) {
        // All correct: alternate a stretch tip for the current skill with a confidence/habit tip.
        if (dayIndex(today) % 2) { topic = 'habits'; reason = `${name} is getting everything right. Lovely work!`; }
      }
    }
    if (!digit) digit = topic.startsWith('five') ? 3 : 7;
    if (topic.startsWith('five') && !FRIEND5[digit]) digit = digit % 5 || 4;
    const friend = topic.startsWith('five') ? FRIEND5[digit] : FRIEND10[digit];
    const lib = T[topic] || T.habits; let i = dayIndex(today) % lib.length;
    let id = `${topic}#${i}:${digit}`;
    if (opts.lastTipId && opts.lastTipId === id && lib.length > 1) { i = (i + 1) % lib.length; id = `${topic}#${i}:${digit}`; }
    const t = lib[i](name, digit, friend, op || 'add');
    return { id, topic, title: t.title, text: t.text, why: t.why, reason, helpTopic: HELP[topic] || 'practice-habits', minutes: 2,
      focus: top ? { key: top.key, label: top.label, count: top.count } : null };
  }

  /* ---------------- 3. gentle alerts ---------------- */
  function stuckAlerts(data, opts) {
    opts = opts || {}; const d = norm(data), today = dayKey(toDate(opts.now));
    const name = childName(d, opts) || 'Your child', out = [];
    const order = nodeOrder(opts);
    // a) skill under 60% after >= 4 practice days on it
    for (const id of order) {
      const st = d.progress.nodes[id]; if (!st || st.mastered || !(st.hist || []).length) continue;
      const nDays = new Set(st.hist.map(x => x.day)).size, w = windowStats(st.hist);
      if (nDays >= 4 && w.accuracy !== null && w.accuracy < 0.6) {
        const idx = order.indexOf(id), prev = idx > 0 ? order[idx - 1] : null;
        out.push({ kind: 'stuck_skill', nodeId: id, severity: 2,
          message: `${nodeTitle(id, opts)} is still feeling hard: ${pct(w.accuracy)}% on the last ${w.n} problems after ${nDays} days of practice. That's normal for a new trick; it just needs a different angle.`,
          suggestion: `Watch the lesson again together (tap the skill on the path, then Learn), and use "Fix" after practice so ${name} sees the beads move. You can also lower "Numbers per problem" in settings for a few days` + (prev ? `, or spend a day back on ${nodeTitle(prev, opts)} for a confidence boost.` : '.') });
      }
    }
    // b) no practice for 3+ days
    const pd = [...practicedDays(d)].filter(k => k <= today).sort();
    if (pd.length) {
      const gap = daysBetween(pd[pd.length - 1], today);
      if (gap >= 3) out.push({ kind: 'no_practice', severity: 1, daysSince: gap,
        message: `No abacus for ${gap} days. Totally fine, life happens!`,
        suggestion: `Restart small: one short practice tonight, and stop while ${name} is having fun. A few minutes most days works better than long catch-up sessions.` });
    }
    // c) accuracy down 15+ points week over week (needs enough problems both weeks to mean anything)
    const thisW = sumAcc(sessionsIn(d.history, addDays(today, -6), today)), lastW = sumAcc(sessionsIn(d.history, addDays(today, -13), addDays(today, -7)));
    if (thisW.problems >= 10 && lastW.problems >= 10 && lastW.accuracy - thisW.accuracy >= 0.15) {
      out.push({ kind: 'accuracy_drop', severity: 2, from: pct(lastW.accuracy), to: pct(thisW.accuracy),
        message: `Accuracy went from ${pct(lastW.accuracy)}% last week to ${pct(thisW.accuracy)}% this week. Often that just means a new, harder trick arrived, or a tired week.`,
        suggestion: `Try practising at a calmer time of day, keep sessions short, and look at the missed problems in the session log together. If a new skill just unlocked, a slower listening speed helps too.` });
    }
    // d) frustration: many wrong in a row in one sitting (last 7 days)
    const from7 = addDays(today, -6); let worst = null;
    for (const id of Object.keys(d.progress.nodes)) {
      const h = d.progress.nodes[id].hist || []; let run = 0, prevDay = null;
      for (const x of h) {
        if (x.day !== prevDay) run = 0; prevDay = x.day;
        run = x.ok ? 0 : run + 1;
        if (run >= 5 && inRange(x.day, from7, today) && (!worst || run > worst.run || (run === worst.run && x.day > worst.day))) worst = { run, day: x.day, nodeId: id };
      }
    }
    for (const s of sessionsIn(d.history, from7, today)) {
      let run = 0, best = 0; for (const r of (s.results || [])) { run = r ? 0 : run + 1; best = Math.max(best, run); }
      const low = (+s.count >= 5 && +s.correct / +s.count < 0.4);
      if ((best >= 5 || low) && !worst) worst = { run: best || (s.count - s.correct), day: sessionDay(s), nodeId: s.node, low: !best };
    }
    if (worst) out.push({ kind: 'frustration', severity: 3, nodeId: worst.nodeId, day: worst.day,
      message: worst.low ? `One practice on ${worst.day} (${nodeTitle(worst.nodeId, opts)}) had lots of misses. ${name} may have felt frustrated.`
                         : `${worst.run} misses in a row on ${worst.day} (${nodeTitle(worst.nodeId, opts)}). ${name} may have felt frustrated.`,
      suggestion: `Next time, sit nearby for the first few problems. If two in a row go wrong, pause, say something kind ("that one's tricky for everyone"), and do one together with "Show me". Ending on an easy win matters more than finishing the set.` });
    return out.sort((a, b) => b.severity - a.severity);
  }

  /* ---------------- 4. share text ---------------- */
  function shareText(report, opts) {
    report = report || {}; opts = opts || {};
    const name = String(opts.childName || report.child || '').trim() || 'Our little abacus learner';
    const lines = [];
    const dp = report.daysPracticed !== undefined ? report.daysPracticed : (report.days || []).filter(x => x.practiced).length;
    if (!dp && !report.problems) {
      lines.push(`${name}'s abacus week: no practice this week yet. Starting fresh!`);
    } else {
      lines.push(`${name}'s abacus week: practised ${dp} of 7 days` + (report.minutes ? `, about ${report.minutes} min` : '') + '.');
      if (report.problems) lines.push(`${report.problems} problems, ${pct(report.accuracy)}% right.`);
      const tr = (report.accuracyTrend || []).filter(w => w.accuracy !== null);
      if (tr.length >= 2) { const a = pct(tr[tr.length - 2].accuracy), b = pct(tr[tr.length - 1].accuracy); if (b - a >= 5) lines.push(`Up from ${a}% the week before.`); }
      for (const m of (report.masteredThisWeek || [])) lines.push(`New skill learned: ${m.label}!`);
      if (report.current && report.current.label && !report.current.mastered) lines.push(`Working on: ${report.current.label}.`);
    }
    return lines.join('\n');
  }

  const api = { weeklyReport, tonightsTip, stuckAlerts, shareText, _internal: { suspects, missedGroups, masteredDay, techniqueLabel, TIPS: T, dayKey, addDays } };
  if (isNode) module.exports = api; else root.ParentBrain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
