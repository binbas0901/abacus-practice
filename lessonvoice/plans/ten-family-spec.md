# Ten-Family (Complements) — Teaching Spec + First Voiced Lesson

Scope: design/research/script only. No source files are edited by this document.
Target child: ages 6–8, currently learning the "family" / complement rules in a live
online soroban class. Mirrors the `ReadTeach` voiced-lesson pattern in `app.js`
(single rod, Juni narrates, beads move in sync, live number card, no-fail "you try",
celebration).

---

## Part A — Teaching-method primer (what, why, sequence, pitfalls)

### A.1 What a "friend" / complement is
On the soroban a rod can only hold **four earth beads** (each worth 1) and **one heaven
bead** (worth 5). So the moment a child wants to add 1 to a rod that already shows 4,
there is physically **no bead left to push** — direct addition "runs out of room." The
complement method is the fix: instead of adding the beads you don't have, you add a
bigger bead and **give back its friend**.

Two friend families:

- **Little friends — complements of 5** (make 5): **1&4, 2&3** (and 5&0).
  Rule for adding: *add 5 (bring the heaven bead down), then take away the friend.*
  e.g. 4 + 1 → there's no 5th earth bead, so **+5 − 4** → 5.
- **Big friends — complements of 10** (make 10): **1&9, 2&8, 3&7, 4&6, 5&5**.
  Rule for adding: *add 10 on the next rod (carry a ten), then take away the friend on
  this rod.* e.g. 7 + 3 → there's no room on the units rod, so **+10 (tens rod) − 7**
  → 10.

The app's own curriculum already encodes exactly these rules and friend tables
(`FRIEND5 = {1:4,2:3,3:2,4:1}`, `FRIEND10 = {1:9,2:8,3:7,4:6,5:5,...}` in
`curriculum.js`), and names them "small friends," "big friends," and "both friends"
(a big-friend move that needs a small-friend move inside it). This lesson is the
**voiced, interactive on-ramp** to that `sf_add` / `bf_add` material, not a replacement.

### A.2 How it is introduced on the beads (the right sequence)
Reputable soroban teaching for kids introduces complements as a visual **pairing** idea,
not as arithmetic facts to memorize. The Soroban Dojo "complements to five" lesson frames
them as thinking **"in number pairs"** rather than moving beads one at a time, and teaches
the pairs **1&4** and **2&3** first ([Soroban Dojo — Complements to Five](https://dmoliveira.github.io/soroban-dojo/lessons/l2/complements-to-five)).
Its "complements to ten" lesson lists **1&9, 2&8, 3&7, 4&6, 5&5** as the "pairs that
complete ten," worked through examples like **7 + 3 → 10**
([Soroban Dojo — Complements to Ten](https://dmoliveira.github.io/soroban-dojo/lessons/l2/complements-to-ten)).

The standard ordering, which this app follows too:

1. **Read/set numbers first** — a bead counts only when it touches the beam; zero is
   heaven-up / earth-down ([OISE/U-Toronto soroban lesson plan](https://www.oise.utoronto.ca/robertson/lesson-plans/soroban)).
   The heaven bead moves **down**, earth beads move **up** ([Wikipedia — Soroban](https://en.wikipedia.org/wiki/Soroban)).
2. **Direct add/subtract** on one rod (no running out).
3. **Little friends (complements of 5)** — still on **one rod**. ← this lesson's topic.
4. **Big friends (complements of 10)** — introduces the **carry onto a second rod**.
5. **Both friends together** — a big-friend move containing a small-friend move.

Soroban carrying for ten is done "making use of a complementary number"
([Wikipedia — Soroban](https://en.wikipedia.org/wiki/Soroban)); the carry to the next
rod is the one genuinely new mechanic in step 4, which is why step 3 (one rod) must come
first.

### A.3 Finger technique (Juni's values, woven into the script)
- **Right hand** moves every bead and never rests on the frame — it stays ready above the
  beads. (Heaven bead down with the thumb/index; earth beads up with the thumb; the
  key point for a 6-year-old is simply "right hand moves, and it never sits down.")
- **Left index finger** rests on the reset/clear button, ready to zero the board.
- Don't rush; trust the process; learn the fundamentals; **practice, practice, practice.**

### A.4 Common kid pitfalls (design the no-fail around these)
- **Adding the number instead of swapping.** The child tries to shove a 5th earth bead
  up (there isn't one) and freezes. → The lesson leads with the "no room!" moment so the
  swap feels like the natural rescue.
- **Forgetting to give the friend back.** They bring the 5-bead down but leave the earth
  beads up (reads 9 instead of 5). → Narrate the two halves as one motion: "five down…
  and friend home," and the live number card shows the transient 9 → 5 so the correction
  is visible, not hidden.
- **Confusing which friend.** "Is 1's friend 4 or is it 2?" → Teach only the two
  complement-of-5 pairs (1&4, 2&3) before any adding, and keep them on screen.
- **Rushing / grabbing with the wrong hand.** → Juni's right-hand / left-finger / "no
  rush" lines are spaced through the beats, not front-loaded.
- **Overload.** Kids do best in 5–10 min with "a short happy finish… better than a long
  tired session" ([Soroban Dojo — children path](https://dmoliveira.github.io/soroban-dojo/paths/children)).
  → One concept (friends of 5), two worked pairs, one read-back, done.

---

## Part B — The FIRST voiced interactive lesson

### B.1 Which first step, and why: **Little friends (complements of 5), landing on a clean 5**
I recommend the first voiced lesson teach **complements of 5** — not complements of 10 —
even though the child's class calls the whole topic the "10 family." Reasons:

1. **It is the real prerequisite.** Every soroban syllabus (and this app's own
   `sf_add` → `bf_add` ordering) teaches friends-of-5 before friends-of-10. The complement
   *idea* ("can't add the little beads? use the big bead and give its friend back") is
   identical in both; teaching it once, cheaply, transfers straight to tens.
2. **It stays on ONE rod → maximum reuse, near-zero new UI.** The existing `ReadTeach`
   screen is already a single-rod `DemoAbacus` (`rods:1`). Friends of 5 need no second
   rod and no carry animation, so the whole `#readTeach` layout is reused as-is.
   Complements of 10 need a 2-rod board plus a visible "carry a ten to the next rod"
   motion — a much larger engineering lift, correctly deferred to lesson 2.
3. **It matches the child's own worked example.** The "4 + 3, earth beads run out" case
   from her class is, on a single rod, a **complement-of-5** move (3's little friend is 2:
   **+5 − 2** → 7). So friends-of-5 *is* the "no room, use the friend" situation for every
   single-rod sum, and is the honest first rung of the 10-family ladder.
4. **The first result is maximally legible.** I pick **4 + 1 = 5** as the flagship: four
   earth beads up (rod visibly full), add 1 → bring the heaven bead down and send all four
   little beads home → **one clean 5-bead**. The payoff is a single bead = 5, the clearest
   possible "it worked" for a 6-year-old. Second try **3 + 2 = 5** uses the other pair.

So: lesson 1 = **friends of 5** (pairs 1&4 and 2&3), two adds that both land on 5, one
read-back. Lesson 2 (future) = friends of 10 with the carry, on a 2-rod board.

### B.2 Beat sequence (ReadTeach style)
Each beat: Juni line key → spoken words → bead action → child action → no-fail → how it
completes. Bead API is `DemoAbacus` (see B.3). `token` guards every `await` exactly as in
`ReadTeach.run`. "live card" = `#rtCount`.

| # | Juni line (key) | Bead action (DemoAbacus) | Child action | No-fail handling |
|---|---|---|---|---|
| 1 | `j_fam_intro` | reset; preset to **4** via `input.setValue(4,{animate:true})`; readonly; card shows `4` | — | — (ends on child tapping **Next**) |
| 2 | `j_fam_full` | highlight rod 0 briefly; beads stay at 4 | — | — → **Next** |
| 3 | `j_fam_pairs` (teach pairs 1&4, 2&3) | optional: flash the friend chips (see B.3 note); board stays at 4 | — | — → **Next** |
| 4 | `j_fam_demo1` | `move(0,+5)` → card goes **4 → 9** (heaven down, earth still up = the transient 9) | watch | — |
| 5 | `j_fam_demo1b` | `move(0,-4)` → card **9 → 5** (four little friends go home) | watch | — |
| 6 | `j_fam_demo1c` | card holds **5**; brief star/bounce | — | — → **Next** |
| 7 | `j_fam_you1` | reset; preset to **4**; `setReadOnly(false)`; card `4` | child adds 1 → must reach **5** | stuck ~6.5s → `j_fam_stuck` + demo `move(0,+5)` then `move(0,-4)`, reset to 4, retry |
| 8 | `j_fam_you1ok` | card `5`; Bix bounce | — | — |
| 9 | `j_fam_hand` (right hand ready, never resting) | — | — | — → **Next** |
| 10 | `j_fam_demo2` | reset; preset **3**; `move(0,+5)` (3→8) ; `move(0,-3)` (8→5) narrated | watch | — → **Next** |
| 11 | `j_fam_you2` | reset; preset **3**; `setReadOnly(false)`; card `3` | child adds 2 → reach **5** (2's friend is 3) | stuck → `j_fam_stuck` + demo `+5`/`-3`, reset to 3, retry |
| 12 | `j_fam_you2ok` | card `5`; Bix bounce | — | — → **Next** |
| 13 | `j_fam_read` | reset; `input.setValue(5,{animate:true})` (clean heaven bead) | tap the number on `#rtPad` | wrong tap → `countTogether(5)` (heaven = 5), then hint-highlight the 5 choice, retry |
| 14 | `j_fam_readok` | — | — | — |
| 15 | `j_fam_slow` (no rush, beads do the thinking, practice×3) | — | — | — |
| 16 | `j_fam_done` | `Fun.confetti`; `Sfx.star`; Bix cheer; then `finish()` | high five | — |

Notes on tone/pacing: keep spoken lines 1–2 short sentences (kids lose the thread past
~8s of audio). The right-hand line (9) and the "no rush / practice" line (15) are the two
places Juni's teaching values land — spaced out, not stacked at the start.

### B.3 Engineering notes (reuse first; minimal new work)
**Reuse as-is (no change):**
- The entire `#readTeach` screen and its nodes: `#rtSky`, `#rtJuni`, `#rtBix`, `#rtNext`,
  `#rtPad`, `#rtCount`, `#rtAbacus`, `#rtTitle`, `#exitReadTeach`. No new DOM, no new CSS.
- `DemoAbacus(host, {rods:1, readout:false, onBead, onChange})` — the same single-rod
  board `ReadTeach` builds.
- Helpers to clone/share from `ReadTeach`: `beat`, `say`, `gap`, `waitNext`/`showNext`/
  `onNextClick`, `demoMove`, `waitRead`/`choices`, `countTogether`, `cheerBix`, the
  `token`/`alive` guards, `start`/`finish`/`stop`, and the Bix idle/cheer wiring. The
  cleanest build is a sibling module (e.g. `FamilyTeach`) that reuses these, or a `mode`
  parameter on `ReadTeach.start` that selects the `run()` body. Either way the beat engine
  is already written.

**DemoAbacus API this lesson uses** (from `games.js`):
- `ab.reset()` — clear to 0.
- `ab.input.setValue(n, {animate:true})` — preset a starting value (4, 3) or show 5.
- `ab.setReadOnly(true|false)` — lock during demos, unlock for "you try."
- `await ab.move(rod, delta, ms, aliveFn)` — animates one delta on a rod, clamped to
  [0,9]. **Important:** `move(0,+5)` from 4 clamps to 9 and that transient **9** is
  *correct* (heaven down while the 4 earth beads are still up) — don't "fix" it; the next
  `move(0,-4)` drops it to 5. Pass `()=>token===my` as `aliveFn` so a cancelled lesson
  stops mid-move, exactly like `ReadTeach`'s demo calls.
- `onChange(v)` — drives the live card and the "did they reach target" check.
- `ab.highlight(rod,true)` / `ab.clearHighlights()` — for the "no room" emphasis.

**One small new engine piece needed:** the existing `waitBead(target, demoFn)` seeds the
card to `'0'` and watches for `value===target` from zero. Friends-of-5 "you try" starts
from a **non-zero preset** (4, then 3) and the child **adds**. Add a thin variant, e.g.
`waitBeadFrom(start, target, demoFn)` that (a) presets the board + card to `start`, (b)
unlocks, (c) resolves when `onChange` reports `target`, and (d) on the stuck timer runs
`demoFn` then resets **to `start`** (not 0) before retry. ~10 lines, copied from
`waitBead`. No-fail semantics are otherwise identical.

**Curriculum data (describe only — do not edit `curriculum.js`):** wire the launcher the
same way reading is wired (`ReadTeach.start(...)` is called from the beads node). The
natural hook is the **`sf_add`** node ("Small friends: adding", `family:5`): when the
child first opens it, run this voiced `FamilyTeach` flow before the normal guided
problems, then hand off to the existing `sf_add` demos/guided set. No new node is strictly
required; if the team prefers a distinct "lesson" entry, add one intro-flow id (e.g.
`sf_add_teach`) that points at `FamilyTeach.start`.

**Optional friend-chip visual:** the lesson screen (`#capFriends` / `friendsHtml` /
`TOY.FRIENDS.small`) already renders small-friend pair chips, but that markup lives on the
`#lesson` screen, not `#readTeach`. Showing the 1&4 / 2&3 chips during beat 3 is a nice
reinforcement but would need a small chip strip added to `#readTeach` (new DOM/CSS) — so
mark it **optional / v2**. The lesson is complete without it; Juni names the pairs aloud.

**Title:** set `#rtTitle` to the small-friends label (reuse `PATH_NAMES.sf_add`
= "Small friends +", or a kid label like "Friends of five").

---

## Sources
- [Soroban Dojo — Complements to Five](https://dmoliveira.github.io/soroban-dojo/lessons/l2/complements-to-five) — pairs 1&4, 2&3; "think in number pairs"; worked add example.
- [Soroban Dojo — Complements to Ten](https://dmoliveira.github.io/soroban-dojo/lessons/l2/complements-to-ten) — pairs 1&9, 2&8, 3&7, 4&6, 5&5; 7+3→10.
- [Soroban Dojo — Children learning path](https://dmoliveira.github.io/soroban-dojo/paths/children) — read/set before move; short 5–10 min sessions; "a short happy finish is better than a long tired session."
- [OISE / University of Toronto — Soroban lesson plan](https://www.oise.utoronto.ca/robertson/lesson-plans/soroban) — a bead counts when it touches the beam; zero = heaven up / earth down.
- [Wikipedia — Soroban](https://en.wikipedia.org/wiki/Soroban) — heaven bead moves down, earth beads move up; carrying ten "making use of a complementary number."
- Internal corroboration (not web): `curriculum.js` `FRIEND5`/`FRIEND10` tables and the `sf_add`/`bf_add`/`combined` nodes encode the same complement rules.
