# Bixi — Character & Voice Bible

Spec for the mascot of **Bix Abacus** (commercial soroban / 1–5 abacus PWA, ages 6–8).
This is a WRITING/SPEC doc. No source file is changed by this doc. The owner generates
Bixi's audio separately in ElevenLabs **"Gigi — Cute, Peppy, Energetic"** using the text in
`bixi-lines.tsv` (same folder).

---

## 1. Who Bixi is

Bixi is a **red bead** — a classmate, not a teacher. He sits beside the child on the abacus
and goes through every lesson *with* them, as an equal who is a little bit silly. He loves
numbers, loves to bounce, and loves to make the child laugh. He is the kid at the next desk
who whispers a joke and then whoops when you get the answer right.

**Juni (the moon) is the authoritative teacher.** Juni owns every maths instruction.
Bixi reacts, celebrates, jokes, and (sometimes) guesses wrong in a fun way so the room
feels like a playful classroom instead of a worksheet. His job is to make the child feel
**smart and relaxed**, never to teach the method.

One-line pitch: *the funny friend who cheers you on and is secretly a bit of a goofball with numbers.*

---

## 2. Voice & delivery

Recorded voice: ElevenLabs **Gigi (Cute, Peppy, Energetic)**. High energy, small, bouncy, warm.

Four delivery modes (the `delivery` column in `bixi-lines.tsv`):

| delivery | when | how it should sound |
|----------|------|---------------------|
| `joke`   | a lull between maths beats, or a tap on Bixi | lively, bouncy, a little cheeky; land the punchline then giggle |
| `cheer`  | after the child succeeds, or at completion | loud, delighted, proud of the CHILD (not himself) |
| `maths`  | the rare moment Bixi is near a real number beat (e.g. awe at the heaven bead) | **slower and calmer** — he quiets down so he never competes with Juni's teaching |
| `oops`   | the "fun wrong answer" bit | confident-then-sheepish; he's sure, he's wrong, he laughs at himself, he hands the win to the child |

Golden rule of delivery: **bouncy for fun, calm for maths.** When a real number is being
taught, Bixi gets quieter, not louder.

---

## 3. Do's and Don'ts

**DO**
- Celebrate the *child's* win ("YOU did it!"), not his own.
- Be silly, bouncy, and genuinely funny to a 6-year-old (knock-knock logic, boing noises,
  being wrong about something harmless).
- Get a *count or an answer* wrong sometimes — then let Juni gently correct, then cheer the child.
- Keep every line short. A 6-year-old should get the joke before they lose interest.
- Stay a peer: wonder out loud, guess, high-five, bounce.

**DON'T**
- **Never talk over Juni while she is giving a maths instruction.** Bixi only speaks in the
  gaps — after Juni's verdict, during a `Next`-wait pause, or at completion. One voice at a time
  (the flow already enforces this: a spoken Bixi cheer plays only *after* Juni's clip finishes).
- **Never model or state the wrong technique / method.** He can be wrong about *what number it is*
  ("is that a hundred?") — he must never be wrong about *how the beads work* ("push the top bead
  with your pinky", "two earth beads make five"). Technique is always correct and always Juni's.
- Never act like a second teacher — no "let me explain", no correcting the child, no drilling.
- Never make the child the butt of the joke. Bixi is the goof; the child is the hero.
- No emoji in line text (the bubble is a caption and strips emoji; see `fun.js` `caption`).

---

## 4. The "fun wrong answer" pattern

This is Bixi's signature bit. It runs in **three beats** and always ends with the child on top:

1. **Bixi guesses wrong (fun).** A harmless, obviously-silly *answer* — never a wrong method.
2. **Juni gently corrects.** Juni stays warm and brief; she is the authority.
3. **Bixi cheers the child.** He laughs at himself and hands the win over: "YOU knew it!"

**Concrete example (at the heaven bead, "worth 5"):**

- Juni (instruction, `j_rt_heaven` / `j_rt_heaven5`): *"This top bead is special — it's worth 5
  all by itself! One top bead down — that's 5!"*
- Bixi (`oops`, `bx_mk_guess_big`): *"Ooh ooh — is that a HUNDRED?"*
- Juni (correction, her line): *"It's 5, Bixi."*
- Bixi (`cheer`, `bx_fix_cheer`): *"Five! Of course. You knew that way before me — you're so good at this!"*

Note the wrongness is about the *number named*, not the bead rule. Juni never has to re-teach
technique because Bixi never breaks it. The beat lands as comedy and the child feels clever.

Timing: the wrong guess fires in a pause (not over Juni's instruction), Juni's correction is a
short existing-style clip, and Bixi's cheer plays only after Juni finishes.

---

## 5. Where Bixi fires in the lesson flows

Line keys below are defined in `bixi-lines.tsv`. All fire points are **gaps**, never over a
Juni instruction. Existing `bx_rt_*` cheer keys already in `audio/bix-lines.js` keep working;
the new keys extend them.

### 5a. ReadTeach flow (`ReadTeach` module, `app.js` `run()`)

Juni's instruction clips are `j_rt_*`. Bixi's safe windows:

| # | Point in `run()` | Juni just said | Bixi line (delivery) | Why it's safe |
|---|------------------|----------------|----------------------|---------------|
| 1 | after `j_rt_intro`, during the `waitNext()` pause (~L2547) | intro done | `bx_hi_class` (joke) | pause, child hasn't tapped Next yet |
| 2 | after `j_rt_you1ok` verdict (~L2557) | "Yes! One bead — that's 1." | `bx_try_woo` / existing `bx_rt_*` (cheer) | after verdict, child succeeded |
| 3 | during the `waitNext()` before the ladder (~L2563) | "that's 3!" | `bx_joke_slide` (joke) | lull pause |
| 4 | after `j_rt_readok` (~L2568) | "That's 3 — you read it!" | `bx_try_smart` (cheer) | after verdict |
| 5 | the heaven-bead reveal — after `j_rt_heaven5` (~L2572), before the `waitNext()` | "that's 5!" | `bx_wow_five` (maths, calm) | Juni's instruction has finished |
| 6 | the fun-wrong bit at the heaven bead (optional, in the `waitNext` gap ~L2573) | — | `bx_mk_guess_big` (oops) → Juni corrects → `bx_fix_cheer` (cheer) | runs in the pause, Juni's correction is authoritative |
| 7 | after `j_rt_you5ok` (~L2578) | "the top bead is 5!" | `bx_try_woo` (cheer) | after verdict |
| 8 | after `j_rt_read6ok` (~L2586) | "that's 6. Brilliant!" | `bx_try_smart` (cheer) | after verdict |
| 9 | completion, with confetti (~L2588–2590) | "You can read the beads now! High five!" | `bx_rt_done1/2` (existing) + new `bx_done_highfive` / `bx_done_proud` (cheer) | end of lesson, Juni done |
| idle | `bixIdleStart()` 4s bounce | — | silent bounce today; optionally an occasional `bx_joke_*` (joke) on a long idle | only when nothing else is speaking |

### 5b. Make-the-number flow (upcoming; `makeNumberSteps` + `#lessonHint`, `app.js` ~L1669–1692)

Phase `'numbers'`: Juni demonstrates forming N (`cap('Show me', …)`), then the child gets
`cap('Your turn', 'Show N …')` and tries on the abacus. Bixi's safe windows:

| # | Point | Juni / cap state | Bixi line (delivery) | Why it's safe |
|---|-------|------------------|----------------------|---------------|
| 1 | on entering "Your turn — Show N" | cap set to "Your turn" | `bx_mk_cheerme` (joke) — a playful "ooh I love this one!" | caption is static, no spoken instruction |
| 2 | fun-wrong before the child moves (optional) | "Your turn — Show N" | `bx_mk_guess_big` / `bx_mk_guess_silly` (oops) → the "Show me" demo / Juni corrects → `bx_fix_cheer` (cheer) | guess is about the number, never the method |
| 3 | after the child forms N correctly | — | `bx_try_woo` / `bx_try_smart` / `bx_try_strong` (cheer) | after the child's successful try |
| 4 | after a wobble / the "Show me" hint demo | Juni re-demos technique | `bx_try_again` (cheer, gentle "you've got this") | fires after Juni's demo, never over it |
| 5 | number set complete | — | `bx_done_proud` / `bx_done_highfive` (cheer) | end of set |

---

## 6. Line inventory → key map (see `bixi-lines.tsv` for text)

- **Greet / classroom warmth:** `bx_hi_class`
- **Jokes (gentle math + kid):** `bx_joke_slide`, `bx_joke_seven`, `bx_joke_zero`, `bx_joke_boing`
- **Fun-wrong (oops):** `bx_mk_guess_big`, `bx_mk_guess_silly`, `bx_mk_countfail`
- **Fun-wrong recovery cheer:** `bx_fix_cheer`, `bx_fix_knew`
- **Encouragement after a try (cheer):** `bx_try_woo`, `bx_try_smart`, `bx_try_strong`, `bx_try_again`
- **Awe at a real number beat (maths, calm):** `bx_wow_five`
- **Make-the-number intro aside (joke):** `bx_mk_cheerme`
- **Completion (cheer):** `bx_done_highfive`, `bx_done_proud`, `bx_done_readstar`

Existing keys reused as-is from `audio/bix-lines.js`: `bx_rt_nice`, `bx_rt_yes`, `bx_rt_got`,
`bx_rt_woo`, `bx_rt_cool`, `bx_rt_me`, `bx_rt_done1`, `bx_rt_done2`. The new keys layer on top;
nothing above renames or removes an existing key.
