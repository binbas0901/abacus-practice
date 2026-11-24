// UI CONTRACT GATE — guards the redesign against silently breaking behavior.
// app.js and the test suite find elements by ID; if a UI change renames or removes a load-bearing element,
// the logic throws or silently no-ops. This test snapshots the DOM IDs in index.html (tests/dom-contract.json,
// captured at the v4.92 baseline) and FAILS if any LOAD-BEARING id (one the JS references) has disappeared.
// Additions and non-load-bearing removals are reported but don't fail. When a removal is intentional, regenerate
// the baseline in the SAME commit (node contract.test.js --update) so the change is deliberate and reviewed.
// Output ends with "N passed, M failed" so tools/check.sh can gate on it.
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const currentIds = new Set([...html.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map(m => m[1]));

const baselinePath = path.join(__dirname, 'tests', 'dom-contract.json');

if (process.argv.includes('--update')) {
  const jsFiles = ['app.js','classroom.js','fun.js','onboarding.js','games.js','abacus-input.js','parent-brain.js','store.js','treats.js'];
  const js = jsFiles.map(f => { try { return fs.readFileSync(path.join(__dirname, f), 'utf8'); } catch (e) { return ''; } }).join('\n');
  const ids = [...currentIds].sort();
  const loadBearing = ids.filter(id => js.includes('#' + id) || js.includes("'" + id + "'") || js.includes('"' + id + '"'));
  fs.writeFileSync(baselinePath, JSON.stringify({ generatedFrom: 'index.html', totalIds: ids.length, loadBearingCount: loadBearing.length, ids, loadBearing }, null, 1));
  console.log(`baseline updated: ${ids.length} ids, ${loadBearing.length} load-bearing`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
let passed = 0, failed = 0;

const removedLoadBearing = base.loadBearing.filter(id => !currentIds.has(id));
const removedOther = base.ids.filter(id => !currentIds.has(id) && !base.loadBearing.includes(id));
const added = [...currentIds].filter(id => !base.ids.includes(id)).sort();

for (const id of base.loadBearing) {
  if (currentIds.has(id)) { passed++; }
  else { console.log(`FAIL load-bearing element #${id} is gone from index.html — app.js/tests reference it. If intentional, update the JS + run \`node contract.test.js --update\` in the same commit.`); failed++; }
}

if (removedOther.length) console.log(`note: ${removedOther.length} non-load-bearing id(s) removed: ${removedOther.slice(0, 20).join(', ')}${removedOther.length > 20 ? '…' : ''}`);
if (added.length) console.log(`note: ${added.length} new id(s) added: ${added.slice(0, 20).join(', ')}${added.length > 20 ? '…' : ''}`);

console.log(`\nUI contract: ${passed} load-bearing ids present, ${failed} failed`);
process.exit(failed ? 1 : 0);
