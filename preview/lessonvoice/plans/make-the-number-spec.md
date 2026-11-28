# "Make the number" — voiced teaching lesson (spec)

Level-1 companion to **Read the beads**. Where Read-the-beads teaches the child to
LOOK at beads and say the number, **Make-the-number** teaches the reverse: Juni names
a target number (1–5) and the child PLACES the beads to build it on the soroban.

This is a **lesson**, not a drill — Juni introduces the idea, demonstrates, the child
tries, climbs a gentle ladder 2→3→4, then meets the heaven bead for 5. Calm pace, one
idea per beat, no-fail throughout.

Teacher-facing goal: by the end the child can build any single digit 1–5 on one rod,
and understands that 5 is the **top (heaven) bead**, not five bottom beads.

---

## How to wire it (mirror `ReadTeach` in app.js)

This lesson is a near-twin of `ReadTeach` (app.js ~line 2474). Build a `MakeTeach`
module with the **same shape** and reuse as much as possible. Key reuse:

- **Same DOM / CSS.** Reuse the existing `#readTeach` section and all `rt-*` classes
  (`#rtSky`, `#rtJuni`, `#rtBix`, `#rtAbacus`, `#rtCount`, `#rtPad`, `#rtNext`,
  `#rtTitle`, `#exitReadTeach`). No new markup or CSS is required. (`#rtPad` — the
  number-choice pad — is simply **never used** here; the child answers on the beads,
  not the pad. Leave it empty via `clearPad()`.)
- **Same abacus.** `DemoAbacus(host, {rods:1, readout:false, ...})` — the one-rod demo
  soroban (games.js `demoAbacus`). Four bottom (earth) beads + one top (heaven) bead.
- **Same primitives, copied verbatim:** `beat(key,text)`, `say`, `gap()`, `showNext`,
  `waitNext`/`onNextClick`, `clearPad`, `demoMove(key,text,lead,moveFn,val)`,
  `waitBead(target, demoFn)`, the Bixi helpers (`bixReact`, `bixSay`, `cheerBix`,
  `bixIdleStart/Stop`), and the `start`/`finish`/`stop`/token/`alive` scaffolding.
- **The child's interaction is ALWAYS `waitBead`.** Make-the-number needs only the
  "push beads to a target" beat. It does **not** use `waitRead`/`choices`/
  `countTogether` (those are the read-direction). You can drop them from this module.

### Abacus move vocabulary (DemoAbacus API)
`ab.move(rod, delta, ms, alive)` animates a change to the rod's numeric value and
renders the correct bead layout; `ab.reset()` clears; `ab.input.setValue(n,{animate})`
jumps to a value. On rod 0:

| Action Juni narrates | Call | Resulting value |
|---|---|---|
| Push one bottom bead **up** | `ab.move(0,+1,ms,alive)` | +1 (works 0→1→2→3→4) |
| Clear the bottom beads (reset button) | `ab.reset()` | 0 |
| Bring the **top** bead **down** | `ab.move(0,+5,ms,alive)` | 5 |

`waitBead(target, demoFn)` is the no-fail "you try": it un-freezes the beads, shows the
live count in `#rtCount` from 0, resolves when the child's value **equals** `target`,
and on a ~6.5s stall plays the stuck line, runs `demoFn()`, resets, and lets the child
retry. For this lesson, pass make-specific copy by setting the stuck key to
`j_mk_stuck` (change the hard-coded `'j_rt_stuck'` string inside the copied `waitBead`).

### Title
Set `#rtTitle` to `L1_LABELS.listening` ("Make the number") — it already exists in
app.js (line 72). (Read-the-beads uses `L1_LABELS.reading`.)

### Entry point / completion
`ReadTeach` is launched by `Practice.runMode('reading')` → `ReadTeach.start(n, …)`.
Add a parallel launch for this lesson (e.g. `MakeTeach.start(n, () => this.teachDone())`
wherever the "Make the number" teach node is selected) and call the same completion
callback pattern. Nothing else in the practice flow needs to change.

---

## Beat sequence

Notation: **J** = Juni speaks (`beat`/`demoMove`). **BEADS** = what the demo soroban
does. **CHILD** = the interactive `waitBead` the child must complete. **NEXT** =
`waitNext()` (child-paced tap). Every beat is followed by `if (token!==my) return;`
just as in `ReadTeach.run()` — omitted below for brevity.

### 0. Setup (in `start()`)
`ab.reset(); ab.setReadOnly(true); $count().textContent=''; clearPad(); showNext(false);`
Sky + Bixi in, idle loop on, title = "Make the number".

### 1. Intro — the reverse idea
- **J** `j_mk_intro` — *"Now let's make the numbers! I say a number, and you build it with the beads."*
- `gap()` → **NEXT**

### 2. Hand posture (fundamental, light)
- **J** `j_mk_hands` — *"Only your right hand moves the beads. Keep it ready — never resting on the frame."*
- `gap()` → **NEXT**

### 3. Demo: make 1 (thumb pushes up)
- `ab.reset(); setReadOnly(true); count=''`
- **J + BEADS** `demoMove('j_mk_make1', …, lead≈650, ()=>ab.move(0,+1,600,alive), 1)`
  — *"Watch. My thumb pushes one bottom bead up to the bar."* (bead rises as she speaks; count → 1)
- **J** `j_mk_make1b` — *"One bead up — that makes 1!"*
- `gap()` → **NEXT**

### 4. CHILD makes 1
- `ab.reset(); count=''`
- **J** `j_mk_you1` — *"Now you. Push one bead up to make 1."*
- **CHILD** `waitBead(1, async()=>{ await ab.move(0,+1,600,alive); })`
- **J** `j_mk_you1ok` — *"Yes! You made 1."*  → then `cheerBix()` (see Bixi cues)

### 5. Climb the ladder 2 → 3 → 4 (one more bead each time)
One shared idea — "add one more bead" — paced calm. Each rung is a short `waitBead`.
Before the climb, reset and set the frame:
- **J** `j_mk_climb` — *"Each time, add one more bead. No rushing — slow and sure."*
- `ab.reset(); count=''` · **J** `j_mk_you2` — *"Make 2. Push up one more bead."* · **CHILD** `waitBead(2, demo: move(0,+1)×2)` · **J** `j_mk_you2ok` — *"Two beads — that's 2."*
- `ab.reset(); count=''` · **J** `j_mk_you3` — *"Now make 3."* · **CHILD** `waitBead(3, demo: move(0,+1)×3)` · **J** `j_mk_you3ok` — *"Lovely — that's 3."*
- `ab.reset(); count=''` · **J** `j_mk_you4` — *"And make 4."* · **CHILD** `waitBead(4, demo: move(0,+1)×4)` · **J** `j_mk_you4ok` — *"That's 4 — all four bottom beads!"*  → `cheerBix()`

Leave **4 showing on the board** (do NOT reset) so the next beat is visually continuous.
Each rung's `demoFn` is a small loop that pushes bottom beads up to the target:
`for (let k=0;k<target;k++){ await ab.move(0,+1,480,alive); }` (reset first inside the
demo so a partial child attempt doesn't offset it).

### 6. Introduce 5 — the heaven bead (the key idea)
Board still shows 4 from the climb.
- **J** `j_mk_five_setup` — *"You used all four bottom beads. For 5, there are no more — so we use the special top bead."*
- **J + BEADS** `j_mk_five_clear` — *"First, your left finger presses the button to clear them."* → narrate, short `lead`, then `ab.reset()`, count → 0. (Ties in the left-hand/reset-button fundamental.)
- **J + BEADS** `demoMove('j_mk_five_demo', …, lead≈1200, ()=>ab.move(0,+5,700,alive), 5)`
  — *"Now your index finger brings the top bead down. That's 5!"* (heaven bead drops as she speaks; count → 5)
- `gap()` → **NEXT**

### 7. CHILD makes 5
- `ab.reset(); count=''` (child starts cleared — matches the demo's final action)
- **J** `j_mk_you5` — *"Your turn. Bring the top bead down to make 5."*
- **CHILD** `waitBead(5, async()=>{ await ab.move(0,+5,700,alive); })`
  — No-fail note: if the child pushes bottom beads instead, the value climbs toward 4
    and never equals 5, so the ~6.5s stall fires `j_mk_stuck` and Juni demonstrates the
    top-bead move, resets, and lets them retry. This is the intended teaching catch.
- **J** `j_mk_you5ok` — *"Yes! The top bead is 5."*  → `cheerBix()`

### 8. Completion
- `Fun.confetti(70); Sfx.star(); bixReact('cheer', 2200);`
- **J** `j_mk_done` — *"You can make the numbers now! Practise a little every day and you'll get even faster."* (carries the practice-practice-practice value)
- `bixSay('bx_mk_done'+(1 or 2), 2600); await sleep(600);`
- `finish();`  → fires the completion callback (advance like `teachDone()`).

---

## No-fail behaviour (summary)
- The child can never "fail." Every `waitBead` waits indefinitely; a ~6.5s stall makes
  Juni say `j_mk_stuck` and **demonstrate** the exact move, then resets and waits again.
- Partial progress is always visible in `#rtCount` (0 → … → target) so the child sees
  the number grow as they place beads — this is itself feedback that they're on track.
- Wrong direction (e.g. bottom beads for 5) is handled by the same stall→demo path, not
  by any error state, buzzer, or lockout. Bixi only ever reacts positively.
- `#rtNext` only appears between Juni's demos and the child's turns, so the child sets
  the pace; there is no timer anywhere in the lesson.

## Juni's teaching values woven in (where)
- Right hand moves beads, never resting → `j_mk_hands` (beat 2).
- Thumb pushes bottom beads **up** → `j_mk_make1` (beat 3).
- Left hand / index finger on the reset button → `j_mk_five_clear` (beat 6).
- Index finger brings the **heaven** bead down → `j_mk_five_demo` (beat 6).
- Don't rush, trust the process → `j_mk_climb` (beat 5).
- Practice, practice, practice → `j_mk_done` (beat 8).
Each is a single short line in context — no lecturing, one value per beat.

## New assets needed
- **Audio:** record the `j_mk_*` clips and add a `make-the-number` manifest + build step
  mirroring `teach-manifest.json` / `build_teach.py` (same pipeline, new id list). The
  lines are in `make-the-number-lines.tsv`.
- **Bixi:** `bx_mk_*` cheer + done lines are owned by Bixi's voice agent — see the cue
  list at the bottom of `make-the-number-lines.tsv`. Until they exist, `MakeTeach` can
  fall back to the existing `bx_rt_*` cheers (identical in intent).
- **DOM/CSS:** none. Reuses `#readTeach` and `rt-*` styles as-is.
