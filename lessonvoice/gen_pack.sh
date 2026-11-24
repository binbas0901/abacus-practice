#!/bin/bash
# Record a lesson's Juni lines with ElevenLabs. Reusable + resumable: skips lines
# whose clip already exists, so a re-run only records new/changed lines.
#
#   ELEVEN_KEY=sk_xxx bash lessonvoice/gen_pack.sh <lines.tsv> <clips_dir>
#
# Input : <lines.tsv>   (one row: <id>\t<text>)
# Output: <clips_dir>/<id>.mp3
# Voice + tuning are locked to match the app (Juni = Sarah, calm/normal pace).
set -euo pipefail
cd "$(dirname "$0")"
LINES="${1:?usage: gen_pack.sh <lines.tsv> <clips_dir>}"
CLIPS="${2:?usage: gen_pack.sh <lines.tsv> <clips_dir>}"
KEY="${ELEVEN_KEY:?set ELEVEN_KEY to your ElevenLabs API key}"
VOICE="Nhs7eitvQWFTQBsf0yiT"   # Sarah - Approachable and Informative (Juni). Do NOT swap to mature Sarah.
# Voice tuning (overridable via env). Default is a touch faster + a bit more expressive than the first cut
# (which was too slow/robotic). speed ~0.95, lower stability + a little style for a warmer, less flat delivery.
SPEED="${SPEED:-0.95}"; STAB="${STAB:-0.45}"; STYLE="${STYLE:-0.30}"
mkdir -p "$CLIPS"
n=0; ok=0; fail=0
while IFS=$'\t' read -r id text; do
  [ -z "${id:-}" ] && continue
  case "$id" in \#*) continue;; esac
  n=$((n+1)); out="$CLIPS/$id.mp3"
  if [ -s "$out" ]; then ok=$((ok+1)); continue; fi
  payload=$(SPEED="$SPEED" STAB="$STAB" STYLE="$STYLE" python3 -c "import json,os,sys;print(json.dumps({'text':sys.argv[1],'model_id':'eleven_multilingual_v2','voice_settings':{'stability':float(os.environ['STAB']),'similarity_boost':0.8,'style':float(os.environ['STYLE']),'use_speaker_boost':True,'speed':float(os.environ['SPEED'])}}))" "$text")
  code=$(curl -s -o "$out" -w '%{http_code}' -X POST "https://api.elevenlabs.io/v1/text-to-speech/$VOICE" -H "xi-api-key: $KEY" -H "Content-Type: application/json" -d "$payload")
  if [ "$code" = "200" ] && [ -s "$out" ]; then ok=$((ok+1)); else fail=$((fail+1)); echo "FAIL $id ($code)"; rm -f "$out"; fi
  sleep 0.15
done < "$LINES"
echo "DONE: $ok ok, $fail fail of $n total"
