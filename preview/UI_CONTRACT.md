# UI redesign — safety plan & contract

How we rebuild the look **without breaking the working app**. The engine, curriculum,
lessons, drills and audio are done and green (v4.92). UI work changes markup/CSS only.

## The risk
`app.js` (and the tests) find elements by ID and attach all behavior to them. A redesign
breaks things not by changing how something *looks*, but by silently renaming, removing,
moving or covering an element the logic depends on — or by breaking layout at a viewport so
a control goes off-screen / an overlay eats taps. The styling is safe; the **DOM contract**
is fragile.

## Guardrails (all in place)
1. **June is frozen.** Her live app stays at the repo ROOT (v4.35). UI work lands only in
   `/preview/`. Never touch root app files. Baseline of the working preview: commit `c2c6b01`
   (local tag `ui-baseline-v4.92`).
2. **Contract gate** — `contract.test.js` (run by `tools/check.sh`). Snapshots the DOM IDs in
   `index.html` (`tests/dom-contract.json`, 368 ids, 333 load-bearing = referenced by JS) and
   **fails if any load-bearing id disappears.** When a removal is intentional, update the JS and
   run `node contract.test.js --update` in the SAME commit.
3. **Behavioral suite** — the 32 maintained Playwright tests exercise the real flows, so a broken
   hook fails a flow test. Run `tests/run.sh` (or the relevant subset).
4. **Per-screen, one at a time.** Each screen has its own CSS file (`toy-home.css`,
   `toy-practice.css`, …) so a restyle's blast radius is that file. Never restyle everything at once.

## Per-screen workflow (repeat for each screen)
1. Note that screen's load-bearing hooks (grep its render fn + CSS).
2. Build/finalize the look in the `look/` component kit (isolated gallery, no app logic).
3. Port into the screen, preserving every hook. Markup changes update JS + tests + the contract
   baseline in the same commit — never a silent rename.
4. Gate: `bash tools/check.sh` (logic + contract) → `tests/run.sh` (flows) → add/extend an
   on-screen smoke at phone + small-iPad + 13" iPad Air → visual check.
5. Ship to `/preview/`, BB device-checks, then the next screen.

## Order
Home screen first (highest-visibility, proves the pipeline), then lesson/practice (most hooks),
then the rest.

## Still to add as we go
Fresh on-screen / fit smoke tests for the new look at the key viewports (the old pre-redesign
fit tests were retired). New screenshot baselines per screen.
