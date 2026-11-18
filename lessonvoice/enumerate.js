#!/usr/bin/env node
// Source of record, GENERATED from the curriculum — never hand-edited.
// Walks every lesson demo the app can show and emits one row per spoken line:
//   { id: <stable key>, text: <exact words> }
// The id (step.k) is stable to rewording: restyle the app, swap characters,
// re-order scenarios or change wording of the framing, and the id stays — so the
// recording keyed by it is reused. Only a change to the WORDS of that line means
// re-recording that one id.
//
//   node lessonvoice/enumerate.js > lessonvoice/lesson-manifest.json
//
// Demos only: those are the lines the app narrates aloud today. (When the guided
// "your turn" phase gets a voice, add 'guided' to KINDS below and re-record the
// new ids — the guard test tests/p27_voiced.py will flag exactly which are missing.)
const C = require('../curriculum.js');
const KINDS = ['demos'];
const byKey = new Map();
for (const n of C.NODES) {
  for (const kind of KINDS) {
    for (const pair of (n[kind] || [])) {
      let ls; try { ls = C.lessonStep(n, pair); } catch (e) { continue; }
      for (const s of (ls.steps || [])) {
        if (!s.say || !s.k) continue;
        if (byKey.has(s.k) && byKey.get(s.k) !== s.say) {
          console.error('KEY COLLISION', s.k, '\n  A:', byKey.get(s.k), '\n  B:', s.say);
          process.exit(1);
        }
        byKey.set(s.k, s.say);
      }
    }
  }
}
const rows = [...byKey].map(([id, text]) => ({ id, text }));
process.stdout.write(JSON.stringify(rows, null, 0) + '\n');
console.error(`enumerated ${rows.length} lesson lines`);
