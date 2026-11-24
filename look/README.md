# Abacus design kit (`look/`)

The new look for the app, built as plug-and-play pieces. This folder is owned by the **design chat**; the engine chat
does not edit it, and the design chat does not edit anything outside it. Gallery: `/look/` on the live site.

## Rules
- Only new files inside `look/`. Never edit the app's own files from here.
- Every piece works on its own: one `<link>` / `<script>` plus one tag. Styles live inside each component (Shadow DOM),
  so the app's CSS can't break them and they can't break the app.
- Shared values (colors, font, shapes) live in `tokens.css` as `--ab-*` variables.
- Built one slice at a time; each slice is reviewed on the iPad before the next.

## Plugging in
```html
<link rel="stylesheet" href="look/tokens.css">
<script src="look/characters.js"></script>
<ab-juni pose="point" size="160"></ab-juni>
<ab-bixi pose="confused" size="120" idle></ab-bixi>

<script src="look/abacus.js"></script>
<ab-abacus value="7" rods="5" labels highlight="1 e1 up"></ab-abacus>
```

## Slices
1. **Foundation** (v0.1): tokens, Nunito font (self-hosted, SIL OFL), 8 character poses. Done.
2. **Abacus** (v0.2): `<ab-abacus value rods size labels interactive highlight>`; `setValue`, `setRod`, `highlight`; events `change`, `bead`. Done.
3. Buttons, cards, speech bubble, progress moons, top bar.
4. Screens assembled from the pieces: home, lesson.

## Decisions (design chat, 23 Nov 2026)
- Characters: AI-made art (ChatGPT/Gemini), master drawings locked: Juni (simplified purple dress), Bixi (symmetric orange bead).
  Poses: Juni wave/point/clap/think, Bixi wave/confused/cheer/giggle. Style is set by the masters, not by another brand.
- Look: lavender sky, cream ground, Juni purple for calm/teaching, Bixi orange for the one main action, Nunito font,
  one clear thing to do per screen. Mockups: https://claude.ai/artifact/E49xprrWt2MCdJf3M4vPyQ
- Abacus: dark wooden frame, red heaven beads, yellow earth beads (white looked faded), dots on the beam marking the ones rod.
- Bixi stays orange (a special bead), standing out against the red/yellow abacus.

## Open questions
- Match the abacus to June's real abacus (photo pending).
- Animate the characters in Rive later (the tags stay the same; only what's inside changes).
