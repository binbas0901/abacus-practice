# Abacus Practice

Soroban practice app for a young learner. Static site; live at the GitHub Pages link for this repo. On an iPad open it in Safari → Share → Add to Home Screen.

**What it does**
- A curriculum of skills in the standard soroban order (beads → direct add/subtract → small friends → big friends → combined → two-digit → mental), each with an animated lesson on a touchable on-screen soroban, guided practice, then drills.
- Drills: Look & solve (stacked numbers), Listen & solve (spoken numbers at an adjustable pace), Flash (numbers flash for mental abacus).
- "Show me": any missed problem replayed bead by bead with an explanation.
- Auto-unlock of the next skill at 80% accuracy over the last 20 problems on 2+ days; parent override.
- Grown-ups mode (hold the corner button, answer a multiplication): level control, pacing, voice (device voice, bundled synthetic voice, or record your own 33 words), per-skill stats, session log with every missed problem, technique checklist, backup.

**Files**
- `engine.js` — bead-rule classifier and rule-aware problem generator (`node engine.test.js`)
- `curriculum.js` — skill nodes and the left-to-right explanation generator
- `soroban.js` — on-screen soroban component
- `app.js`, `index.html` — the app
- `audio/` — bundled synthetic voice; `tools/make_sprites.py` regenerates it with Piper TTS
- `BUILD-PLAN.md` — research and phased plan
