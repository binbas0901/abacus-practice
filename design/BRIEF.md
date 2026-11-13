# Wave 2 brief — rebuilding Bix Abacus in the Workshop design

Bix Abacus is a commercial iPad app (App Store, Kids Category, ages 6–8) that teaches soroban (Japanese abacus) to children 5–10. It must look and feel like a premium, modern kids' app — consistent on every screen, fun enough that a child wants to come back on day 30, calm enough that parents trust it.

## Read first
- `design/mockups/*.png` and `*.html` — the approved Workshop screens at iPad size (1180×820 landscape). They are the minimum bar, not the target.
- `workshop.css` — the ONLY source of colours, fonts, radii, shadows, buttons, blocks, tiles, bubbles and motion.
- `kit.js` — `WS.bix(mood,size)`, `WS.bead(color,width,{ring,label})`, `WS.icon(name,size,color)`, `WS.bubble(text)`, `WS.tile(term,first)`. Open `kit.html` to see them all.
- `store.js` — all saving (per child vs family). Never touch localStorage directly.

## Design principles (from the research)
1. **One thing at a time.** Each screen has one obvious next step. Cluttered screens cost young children attention and learning.
2. **No reading needed to play.** Bix says every instruction (Fun.Mascot.say with a voice id when one exists); text is a caption. Pictures and colour carry meaning.
3. **The abacus is the hero.** Wood frame, maple inside, lacquered lens-shaped beads.
4. **Colour has meaning:** red = the main action / counted beads / fix; indigo = Look, headings, "you are here"; ochre = Listen, golden beads, rewards; jade = Flash/Play, right, done; locked = not yet.
5. **Motion with purpose:** press-sink on every tap, the next thing pulses, rewards pop, Bix bobs and talks. Respect prefers-reduced-motion and `body.ws-calm`. iPad has no haptics — feedback is sound + motion.
6. **Honest and kind:** no timers on child screens, no scores as grades ("8 green beads!", not "8/10"), no streak guilt, no dark patterns, nothing that pushes a child to buy.
7. **Big targets:** ≥ 60px for children (kit buttons are 68px+), ≥ 44px anywhere. Real `<button>`s, aria-labels on icon buttons, text contrast ≥ 4.5:1.

## Rules
- Build every screen from the kit. Do not add new colours, fonts or shadows in screen CSS; if the kit lacks something, add it to `workshop.css` in a clearly marked section at the end and mention it in your report.
- No emoji as UI icons (use `WS.icon`). Stickers in the sticker book may stay emoji (they are content, not UI).
- Keep existing element IDs and behaviour hooks where the logic still applies, so the old logic keeps working; when the UI legitimately changes, update the affected tests in `tests/` — never weaken what a test checks.
- No network requests, no third-party code or fonts (Kids Category). Everything ships in the repo.
- Put your screen CSS in your own new file (listed below), linked in index.html where marked. Do not edit `styles.css` (old styles; it will be cleaned up after the merge) — override from your file instead.
- Only edit the files and the parts of shared files that your stream owns (below). Other agents edit the other parts at the same time; git will merge separate regions cleanly but not overlapping edits.
- Quality bar before you report done: `sh tools/check.sh` prints "check ok"; `PORT=<your port> tests/run.sh` passes every suite; you screenshot each of your screens at 1180×820 with Playwright (/usr/bin/google-chrome) and compare it side by side with its mockup PNG, fixing anything that falls short (alignment, spacing, clipped text, crowding, contrast). Also check 820×1180 portrait and 1366×1024 (iPad Pro) look sensible.

## Streams and ownership
- **A — Home, Who's practising, My Room, first-time setup.** index.html sections `#home`, `#who`, `#album`, `#shop` (fold into a new `#room` My Room screen as in the mockup: sticker book, flower pot = garden, treat jar with goal), `#setup`, `#nameAsk`; app.js: `renderHome`, the Today steps, home bindings, `showWho`, name-ask; `fun.js` (switch Fun.Mascot drawing to `WS.bix`, keeping its API: say/react/talking voice), `treats.js`, `onboarding.js`. CSS: `screens-home.css`.
- **B — Practice.** index.html `#drill`, `#summary`, `#showme`, `#stickerReveal`; app.js drill / Look / Listen / Flash / summary / fix-the-red-ones code. Wire `AbacusInput` (abacus-input.js) as the answer tool (child setting `hasAbacus`: physical abacus → keypad default with "Use the beads" option; no abacus → beads default with "Type it instead"), plus method feedback from `AbacusInput.checkMethod`. Add level tests + certificate (Curriculum.levelTest / scoreLevelTest) as new sections `#levelTest` / `#certificate`. Problems with `op:'mul'` (from stream D) show as tiles `a` and `× b`. CSS: `screens-practice.css`.
- **C — Practice door, lessons, games, grown-ups.** New section `#door` (Look / Listen / Flash blocks + "My path" bead rod + "Learn it with Bix"); `#lesson`, `#play`, `#game`, `#gate`, `#parent`; app.js lesson, gate and parent code; `games.js`. Parent report from `ParentBrain` (parent-brain.js): week beads, mastered, working-on bar, Tonight's tip hero, missed most, stuck alerts, Share (navigator.share text), children switcher. CSS: `screens-door.css`, `screens-grownup.css`.
- **D — Levels 4–6.** engine.js, curriculum.js, engine.test.js only (plus new data files). No UI.
