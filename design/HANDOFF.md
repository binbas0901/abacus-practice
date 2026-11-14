# Toy Table rebuild — where things stand (update on every milestone)

- Live app: main, v3.13 (old Workshop look). Do not push to main until the owner approves.
- New look: branch `toy-int` = kit (toy.css, toykit.js, toystickers.js) + all screens merged, 19/19 suites green at ebcd74b.
- Review 4 (independent): 1 P0, 9 P1, 19 P2. Fixes in progress on two branches off toy-int:
  - `toy-fixA` (behaviour): day-one blank drill (P0), lesson demo race, lesson skip, Boy voice offline, restore dialog, sticker-over-result, small behaviour items.
  - `toy-fixB` (visual): no red for wrong, Juni day phases + curved half, soroban bead size, portrait onboarding, polish list.
  - Rules: /design/BRIEF2.md; agents commit after each item.
- Next: merge fixA + fixB into toy-int, full tests, show owner before/after, bump version, merge to main on approval.
- Open decisions: app name (Bix vs Juni) after owner sees home; voice lines saying "red ones" may need re-recording; real-iPad check not done.
- Characters: Bix (bead coach), Juni (moon, fills with today's 3 steps), number friends 1-9.
