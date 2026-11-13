# Brief 2 — rebuilding Bix Abacus in the Toy Table look

The owner approved a new art direction. Every screen is a **sunlit maple table under a sage wall with a window**. On the table: glossy lacquered soroban beads, wooden blocks, a felt mat, paper, and a cast of toy figurines. It replaces the Workshop look (`workshop.css`, `kit.js`), which stays in the repo only until each screen has been rebuilt.

Open `toykit.html` first. It is the kit showcase and the character sheet. Reference renders: `design2/b-toy.png`, `b-toy-practice.png` (the world) and `c-buddies.png` (the cast's expressiveness only — not its blue background or flat style).

## Files
- `toy.css` — tokens (`--toy-*`), scene, surfaces, buttons, keypad, bubble, tag, dialog. The only source of colours, fonts, radii and shadows.
- `toykit.js` — `window.TOY`, pure functions that return SVG / HTML strings. Loads its shared `<defs>` and the grain by itself.
- `toykit.html` — everything on one page.

## The API
| Call | Gives |
|---|---|
| `TOY.bix(mood, size, {still})` | Bix. Moods: happy, wave, cheer, think, oops, sleepy, wow, proud |
| `TOY.moon(mood, size, {phase, sky, stars})` | The moon. Moods: calm, happy, proud, sleepy, wow, wink. `phase` 0..1 |
| `TOY.moonName` | Her display name. Placeholder `"Juni"`; the owner will supply the real one. Never hard-code the name in a screen |
| `TOY.moonPhases(done, total, {arc})` | Progress as small phase moons in wooden hollows |
| `TOY.skyMoon(mood, phase)` | The moon wrapped for the window slot of `.toy-scene` |
| `TOY.buddy(n, size, mood, {prop})` | Number friends 1-9. Moods: happy, wave, cheer, wow, oops, sleepy, think. Props: glasses, magnifier, book |
| `TOY.pair(a, b, size)` | Two friends holding hands around a wooden disc that shows what they make |
| `TOY.bead(color, size, {dim, tall})` | A bead. Colours: red, mustard, indigo, teal, plum, wood |
| `TOY.rodProgress(done, total, current)` | Beads on a brass rod: done slide left, the current one glows |
| `TOY.icon(name, size, color, {accent})` | practice (soroban), play, room (home), lock, close, back, backspace, check, speaker, star, book, eye, ear, flash, gear, retry, plus |
| `TOY.bubble(html, {title, tail})` | Paper speech card. Tail: left, right, side, none |
| `TOY.block(label, {color, icon, small, sub, attrs})` | Wooden block button |
| `TOY.start(label, {icon, small, attrs})` | The round teal button on its wooden ring (Start, check) |
| `TOY.tag(name, {color, hang})`, `TOY.iconButton(icon, label)`, `TOY.prop('plant'/'rainbow'/'bowl')` | Name tag, round wooden button, table decoration |
| `TOY.keypad(el, {onKey, onBackspace, onCheck, order})` | Wooden keys on felt; returns `{el, setEnabled, destroy}`. Keys keep `data-k` |
| `TOY.confirm(title, msg, {ok, cancel, danger})` | Same promise API as `WS.confirm` |

CSS classes: `.toy-scene` (+ `--calm`, `--evening`, `--table`), `.toy-sky-moon`, `.toy-plaque`, `.toy-felt`, `.toy-paper` (+ `--tilt`), `.toy-clipboard`, `.toy-chip`, `.toy-block` (+ colour, `--sm`, `--wide`), `.toy-start` (+ `--sm`), `.toy-iconbtn`, `.toy-key`, `.toy-keypad`, `.toy-bubble`, `.toy-tag`, `.toy-h1/h2/label/caption/num`, `.toy-dialog`.

## Palette
Maple `#E2B782` / `#CF9858` · sage wall `#D3DEC8` / `#B4C6AE` · oat felt `#F4ECDC` · paper `#FFFDF6` · walnut `#7A4A24`
Lacquer: red `#E5402F` · mustard `#F2B632` · indigo `#3F52A8` · teal `#1FA595` · plum `#9255C4` (cast only) · moon cream `#FBEFC2` (moon only)
Ink: `#2B3674` for all text on wood, felt and paper.

Colour meaning: **teal = go and right** (Start, check, done beads). **Red = Bix** and the first door. **Mustard = play, the current step, gold**. **Indigo = practice, text**. Red is never used to mean "wrong".

Type: Fredoka for everything a child reads (500/600/700), Andika for captions and grown-up text. Sentence case. No all-caps.

## Light and shadow (the rule that makes it one world)
- One light: the window, **top-left**. Highlights sit top-left on every object; shadows fall **down and to the right**.
- **Every object has a contact shadow.** Nothing floats. In HTML use the `--toy-shadow-*` tokens or the component's own shadow. In SVG use an ellipse filled with `url(#toy-g-shadow)`: one tight and dark under the object, one wide and faint offset to the right.
- Shadows are warm brown `rgb(58,30,6)`, never black or grey.
- Lacquer = a radial gradient with its focus at the top-left (`url(#toy-lac-<colour>)`), a soft white bloom, one small hard specular, and a darker lower half. Wood = `--toy-wood-lt` to `--toy-wood` with grain, a light inner line, and a visible side face underneath.
- Anything pressable shows its side face and sinks when pressed (`:active`): it moves down and its shadow shrinks.

## Performance rules (iPad 10th gen, Safari) — what the kit chose
- **No SVG filters and no CSS `filter` / `backdrop-filter` anywhere.** Not `feTurbulence`, not `feGaussianBlur`, not `drop-shadow()`.
- **Wood grain:** `TOY.defs()` draws one 512x256 tile of wavy streaks on a canvas, once per page load, and stores it as a data URL in `--toy-grain`. Table, blocks, keys, plaques and tags all reuse that one image as a CSS background. `toy.css` holds a plain striped fallback for the moment before the script runs. Felt speckle is made the same way (`--toy-felt-grain`).
- **Soft things** (shadows, blooms, blush, glow) are radial gradients that fade to transparent. HTML shadows are `box-shadow`.
- **Window, light patch, name-tag string** are small static SVG data-URIs in `toy.css`, gradients only.
- **Shared gradients live in one hidden SVG** (`#toy-defs`) injected once, so a page with fifty characters has one copy and no id collisions. Do not paste gradient defs into screens. If you inject TOY markup into a shadow root or an iframe, call `TOY.defs()` there too.
- Idle motion is limited to the two leads: Bix breathes and blinks, the moon's glow swells. Both are transform-only CSS animations and stop under `prefers-reduced-motion`. Pass `{still:true}` when many are on screen.

## The cast
**Bix** — the lead, a red soroban bead figurine with a wooden peg, wooden feet and ball hands. Energetic. Big eyes, brows, an asymmetrical open grin. Every mood changes arms, brows and mouth together; never change only the mouth. `oops` is sheepish, not sad: Bix scratches his head. He never frowns at the child.

**The moon** (`TOY.moonName`) — the calm second lead. Glazed cream ceramic with a warm glow, kind eyes, small blush, a tiny smile, no arms. Her night side is indigo lacquer. Role:
- She watches from the window (`TOY.skyMoon` inside `.toy-scene`). By day she is pale; in `.toy-scene--evening` she is bright.
- She **fills as the child finishes steps**: crescent, half, gibbous, full. `TOY.moonPhases(done, total)` shows the same thing as a row for today's three steps or the week.
- At full moon she celebrates (`proud`, with her star companions).
- **She never scolds and never shrinks.** A missed day leaves the phase where it was. No waning as punishment, no streak guilt.
- On the table she stands on a small wooden stand, so she has a contact shadow like everything else.
- Temperament split: Bix reacts to the moment (right, oops, cheer). The moon holds the long view (today, this week) and encourages quietly.

**Number friends 1-9** — toy beads, each with its own silhouette, growing a little with its value, wearing its number.
- **Big friends (make 10) share a colour:** 1 & 9 red, 2 & 8 plum, 3 & 7 teal, 4 & 6 indigo, 5 & 5 gold.
- **Small friends (make 5) share a hat:** 1 & 4 a wooden knob, 2 & 3 a brass ring. 5 sits on a brass rod stub, as the heaven bead.
- Shapes: 1 ball, 2 egg, 3 gumdrop, 4 diamond, 5 soroban lens, 6 cube, 7 capsule, 8 gourd, 9 hexagon.
- Use `TOY.pair` whenever a friend rule is taught; the disc between their hands shows 5 or 10.

Drawing a new character or pose: body = one path filled with a lacquer gradient, then the shade and rim overlays, bloom, specular; limbs = a dark stroke under a colour stroke with a ball hand; wooden feet; eyes with two highlights; two contact shadows. Add it to `toykit.js`, never as a one-off in a screen.

## Scenes
- `.toy-scene` — home and rewards: window light patch on the table.
- `.toy-scene--calm` — practice, tests, anything needing concentration: no light patch, lighter vignette. Keep decoration off the working area.
- `.toy-scene--evening` — dusk window, shaded wall, a warm lamp pool on the table, bright moon. For end-of-session and bedtime-hour use.
- `.toy-scene--table` — no wall: grown-up screens and inner pages.
- Tune with `--toy-wall-h` and `--toy-window-x` on the scene element. The moon slot follows the window.

## Sizes
Design at 1180x820. Check 820x1180 (lower wall, blocks wrap, keys sized by width) and 1366x1024 (larger blocks, tag, icon buttons). Touch targets: 64px minimum for children; keys and blocks are larger.

## Do
- Build from the kit. If something is missing, add it to `toy.css` / `toykit.js` and to `toykit.html`.
- Put text on paper, felt or light wood in ink `#2B3674`. White text only on indigo, red, teal and plum lacquer at 22px or larger, semibold. Dark brown `#4A2C06` on mustard.
- Keep one obvious next step per screen; the teal round button is it.
- Let Bix say instructions; text is a caption.

## Don't
- No emoji, no raster images, no network resources, no new fonts.
- No flat fills, outlines-only drawings or clip-art: every object has material, highlight and shadow.
- No black or grey shadows, no shadows pointing up or left.
- No filters (see above). No more than the two idle animations.
- No red for errors, no sad or scolding faces, no timers or grades on child screens.
- Do not edit `workshop.css` / `kit.js` to "match"; replace their use screen by screen.

## Known gaps in the kit (as shipped)
- Teal dome with white text is about 3:1: fine for the large Start label and icons, not for small text.
- The number friends share one face design; personality comes from shape, colour, hat and prop.
- A crescent moon's face is small; below about 96px use half or fuller, or the faceless `moonPhases` tokens.
- `toykit.js` and `toy.css` are not yet in `sw.js` or `index.html`; add them when the first screen moves over.
