# Juni's lesson voice — source of record

This folder is how Juni's spoken lessons are **protected and repurposable**. The
app ships the finished pack at `audio/juni-lines-lesson.js`; this folder is what
regenerates it.

## The key idea: stable keys, not sentences

Every lesson line has a **stable key** (`step.k` in `curriculum.js`), e.g.
`t+f.2` ("Then take away 2 from this rod."), `we.add.8.9`, `end.17`. The
recording and the pack are filed under that **key**, never under the raw
sentence.

Why this matters — the three layers stay independent:
1. **What's taught** — the steps and bead moves (curriculum.js logic).
2. **The words** — the sentence for each key.
3. **The recording** — the clip filed under the key.

So you can restyle the app, swap characters, re-order scenarios, or change the
wording of the framing, and the recordings keep working and get reused. Only a
change to the actual **words** of a line means re-recording that one key. The
lookup in the app is `Classroom.Voice.find('juni', step.k)`.

## What's here
- `enumerate.js` — **generates** `lesson-manifest.json` from `curriculum.js`.
  Never hand-edit the manifest; regenerate it. One row per spoken demo line:
  `{ id: <stable key>, text: <exact words> }`. It fails loudly on any key
  collision.
- `lesson-manifest.json` / `lines.tsv` — the generated line list (key + words).
- `gen.sh` — records each line with ElevenLabs into `clips/<key>.mp3`.
  Resumable: skips any key that already has a clip, so a re-run only records
  what's new or changed.
- `build_pack.py` — stitches the clips into `audio/juni-lines-lesson.js`,
  **keyed by `id` (the stable key)**.
- `clips/` — the raw per-line mp3s, named by key (not committed; regenerated).

## Voice (locked)
Juni = ElevenLabs **Sarah – Approachable and Informative**, id
`Nhs7eitvQWFTQBsf0yiT`, `eleven_multilingual_v2`, settings
`{stability:0.55, similarity_boost:0.8, style:0.2, use_speaker_boost:true, speed:0.88}`.
Do **not** switch to the mature Sarah voice. `speed:0.88` keeps her calm/normal.

## The guard
`tests/p27_voiced.py` walks every demo line the curriculum can produce and
asserts each one's key resolves to a recorded clip. If a reword, a new node, or
any other change would leave a line silent, the build **fails there** instead of
the child hearing a gap. Run it (and the rest) with `bash tests/run.sh`.

## Regenerate / extend
1. Edit the demo scripts in `curriculum.js` (the `explain` / `explainMul`
   templates). If you only reword a line, its key is unchanged — but the audio
   now says the old words, so that key must be re-recorded. If you add lines,
   they get new keys.
2. `node lessonvoice/enumerate.js > lessonvoice/lesson-manifest.json`
   then rebuild `lines.tsv` from it (one `<key>\t<text>` per row).
3. `ELEVEN_KEY=sk_xxx bash lessonvoice/gen.sh`  (records only missing/changed keys)
4. `python3 lessonvoice/build_pack.py`  (rebuilds `audio/juni-lines-lesson.js`)
5. Bump the version, run `bash tests/run.sh` (p27_voiced must pass), commit.

The ElevenLabs key is never stored in the repo — pass it via `ELEVEN_KEY` for the
one run that records, then discard it.

## Repurposing (new characters / voices / concept)
- **New voice or character for the same lessons:** record the same keys with the
  new voice into a new pack; the app points at it. Content and timing unchanged.
- **New scenarios / re-ordered lessons:** the keys a demo uses are reused
  automatically; only genuinely new lines need recording (the guard shows which).
- **New concept that keeps some utterances:** reuse those keys' clips as-is.
