# Abacus Practice

Soroban practice app (visual + listening drills, parent mode). Static site; open `index.html` from any web server, or use the GitHub Pages link.

- `engine.js` — rule classifier and rule-aware problem generator (`node engine.test.js` to run tests)
- `index.html` — the app
- `audio/` — bundled synthetic voice (fallback); parents can record their own voice in Grown-ups mode
- `tools/make_sprites.py` — regenerates bundled voices with Piper TTS
- `BUILD-PLAN.md` — research and phased plan
