# Abacus Practice

Soroban practice app for a young learner. Static site; live at the GitHub Pages link for this repo. On an iPad open it in Safari → Share → Add to Home Screen.

**Sharing with other families**
Each child uses their own device and opens the same link. A device that has never used the app runs a first-time setup (name, then: start from the beginning / find my level / a grown-up picks the skill) and reminds the grown-up to add it to the Home Screen. Everything is stored only on that device, so children never see each other's data. Grown-ups → Backup moves a child's progress to a new device.

**What it does**
- A curriculum of skills in the standard soroban order (beads → direct add/subtract → small friends → big friends → combined → two-digit → mental), each with an animated lesson on a touchable on-screen soroban, guided practice, then drills.
- Drills: Look & solve (stacked numbers), Listen & solve (spoken numbers at an adjustable pace), Flash (numbers flash for mental abacus).
- "Show me": any missed problem replayed bead by bead with an explanation.
- Auto-unlock of the next skill at 80% accuracy over the last 20 problems on 2+ days; parent override.
- Fun layer: Bix the bead mascot; 3 mini-games (Friend Pop, Bead Detective, Bead Builder) that drill friend pairs, bead reading and setting numbers; a 60-sticker album; a practice garden (a flower per practice day, no penalty for missed days); "Today's practice" in 3 short steps.
- Treat Shop: golden beads earned for finishing things (not for accuracy) buy real-world treats the family sets up; purchases become tickets for a grown-up to hand over.
- Grown-ups mode (hold the corner button, answer a multiplication): level control, pacing, voice (device voice, bundled synthetic voice, or record your own 33 words), per-skill stats, session log with every missed problem, technique checklist, backup.

**Design:** "Bead Maze Playroom": playroom-sky base, ink-navy text, grape for actions, lacquered bead colours only where they mean something. Progress is shown as beads on wires (skill path, today's steps, question strip). Fonts: Baloo 2 (display/numbers) and Andika (reading text, designed for early readers), both self-hosted under the SIL Open Font License.

**Files**
- `engine.js` — bead-rule classifier and rule-aware problem generator (`node engine.test.js`)
- `curriculum.js` — skill nodes and the left-to-right explanation generator
- `onboarding.js` — first-time setup and level check
- `fun.js` — mascot, stickers, garden, confetti · `games.js` — mini-games · `treats.js` — golden beads and Treat Shop
- `styles.css` — the design system · `fonts/` — self-hosted fonts
- `app.js`, `index.html` — the app
- `audio/` — bundled synthetic voice; `tools/make_sprites.py` regenerates it with Piper TTS
- `BUILD-PLAN.md` — research and phased plan
