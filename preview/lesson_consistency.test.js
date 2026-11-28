// Guards the class of bug where a lesson's spoken script names numbers that don't match the example on screen.
// The Bixi interlude runs on guided[0] (interludeExample), and the single your_turn cue that lessonScript keeps
// (the LAST your_turn step) is narrated at guided turn 0, which also shows guided[0]. So any digit spoken in those
// steps must be consistent with guided[0]; otherwise the child hears one problem while seeing another.
// Output ends with "N passed, M failed" so tools/check.sh can gate on it.
const fs = require('fs');
const path = require('path');
const C = require('./curriculum.js');
const src = fs.readFileSync(path.join(__dirname, 'audio', 'lessons.js'), 'utf8');
const L = JSON.parse(src.match(/window\.LESSONS\s*=\s*(\{[\s\S]*\});/)[1]);

let passed = 0, failed = 0;
const fail = (msg) => { console.log('FAIL ' + msg); failed++; };
const ok = () => { passed++; };

function digitSet(s) { return new Set(String(s).replace(/[^0-9]/g, '').split('')); }

for (const id of Object.keys(L)) {
  const n = C.BY_ID[id];
  if (!n || !n.guided || !n.guided.length) continue;          // interlude/your_turn only fire on nodes with guided turns
  const g = n.guided[0];
  const isMul = n.drill && n.drill.op === 'mul';
  const result = isMul ? g[0] * g[1] : g[0] + g[1];
  // digits the child can legitimately see on the guided[0] card, plus 0 (the "start at 0" convention for multiply)
  const allowed = new Set([String(g[0]), String(Math.abs(g[1])), String(result), '0'].join('').split(''));

  const steps = L[id].steps || [];
  const interlude = steps.filter(s => ['bixi_wrong', 'ask_help', 'bixi_thanks'].includes(s.act));
  // lessonScript keeps the LAST step of each act, so that is the your_turn cue actually narrated at guided turn 0
  const yourTurns = steps.filter(s => s.act === 'your_turn');
  const usedTurn = yourTurns.length ? yourTurns[yourTurns.length - 1] : null;

  for (const st of interlude.concat(usedTurn ? [usedTurn] : [])) {
    const stray = [...digitSet(st.text)].filter(d => !allowed.has(d));
    if (stray.length) {
      fail(`${id} ${st.id} (${st.act}): text names digit(s) [${stray.join(',')}] not in guided[0]=${JSON.stringify(g)} — script/example mismatch: ${JSON.stringify(st.text)}`);
    } else ok();
  }
}

console.log(`\nlesson script consistency: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
