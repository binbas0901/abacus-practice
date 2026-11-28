#!/bin/bash
# Record Juni's lesson lines with ElevenLabs. Resumable: skips lines whose
# clip already exists, so a re-run only records new/changed lines.
#
#   ELEVEN_KEY=sk_xxx bash lessonvoice/gen.sh
#
# Input : lessonvoice/lines.tsv   (one line per row: <id>\t<text>)
# Output: lessonvoice/clips/<id>.mp3
# Then  : python3 lessonvoice/build_pack.py   # packs clips -> audio/juni-lines-lesson.js
#
# Voice + tuning are locked to match the app (Juni = Sarah, calm/normal pace).
set -euo pipefail
cd "$(dirname "$0")"
KEY="${ELEVEN_KEY:?set ELEVEN_KEY to your ElevenLabs API key}"
VOICE="Nhs7eitvQWFTQBsf0yiT"   # Sarah - Approachable and Informative (Juni). Do NOT swap to mature Sarah.
mkdir -p clips
rm -f gen.log gen.done; n=0; ok=0; fail=0
while IFS=$'\t' read -r id text; do
  [ -z "${id:-}" ] && continue
  n=$((n+1)); out="clips/$id.mp3"
  if [ -s "$out" ]; then ok=$((ok+1)); continue; fi
  payload=$(python3 -c "import json,sys;print(json.dumps({'text':sys.argv[1],'model_id':'eleven_multilingual_v2','voice_settings':{'stability':0.55,'similarity_boost':0.8,'style':0.2,'use_speaker_boost':True,'speed':0.88}}))" "$text")
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE" -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$payload")
  if [ "$code" = "200" ] && [ -s "$out" ]; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $id ($code)" >> gen.log; rm -f "$out"; fi
  sleep 0.15
done < lines.tsv
echo "DONE: $ok ok, $fail fail of $n total" | tee gen.done
