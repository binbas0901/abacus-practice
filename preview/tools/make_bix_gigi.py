#!/usr/bin/env python3
# Generate Bixi's voice pack in ElevenLabs "Gigi - Cute, Peppy, Energetic" and pack it for the app.
# App-wide Bixi voice (replaces the Kokoro sweet/boy placeholders).
#
#   ELEVEN_KEY=sk_xxx python3 tools/make_bix_gigi.py <lines.json> <out.js>
#   e.g. ELEVEN_KEY=... python3 tools/make_bix_gigi.py /tmp/bix_gigi_lines.json audio/bix-gigi.js
#
# Resumable: clips cached in /tmp/bixgigi/<id>.mp3 (re-run only records new/changed lines).
# Emits window.__BIX_LOADED('gigi', {label, sprite, lines}, b64) — one comprehensive base pack
# (fun.js find() resolves every line from it; gigi sub-packs may be absent).
import json, os, sys, subprocess, wave, base64, hashlib
if len(sys.argv) != 3: sys.exit("usage: make_bix_gigi.py <lines.json> <out.js>")
LINES, OUT = sys.argv[1], sys.argv[2]
KEY = os.environ.get('ELEVEN_KEY') or sys.exit("set ELEVEN_KEY")
VOICE = "n7Wi4g1bhpw4Bs8HK5ph"   # Gigi - Cute, Peppy, Energetic
# Bixi is a lively kid mascot; a touch slower than default for a 6-year-old's ear. One setting app-wide.
VS = {"stability": 0.45, "similarity_boost": 0.75, "style": 0.35, "use_speaker_boost": True, "speed": 0.98}
SR = 44100
lines = json.load(open(LINES, encoding='utf-8'))
cache = '/tmp/bixgigi'; os.makedirs(cache, exist_ok=True)
allpcm = bytearray(); sprite = {}; cur = 0.0; ok = 0; fail = 0
for _id, text in lines.items():
    sig = hashlib.md5((text + '|' + json.dumps(VS, sort_keys=True)).encode()).hexdigest()[:8]
    mp3 = os.path.join(cache, f"{_id}.{sig}.mp3")
    if not (os.path.exists(mp3) and os.path.getsize(mp3) > 0):
        payload = json.dumps({"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VS})
        code = subprocess.run(['curl', '-s', '-o', mp3, '-w', '%{http_code}',
            '-X', 'POST', f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE}",
            '-H', f"xi-api-key: {KEY}", '-H', 'Content-Type: application/json',
            '--data-binary', payload], capture_output=True, text=True).stdout.strip()
        if code != '200' or not (os.path.exists(mp3) and os.path.getsize(mp3) > 0):
            fail += 1; print(f"FAIL {_id} ({code})");
            (os.path.exists(mp3) and os.remove(mp3)); continue
    subprocess.run(['ffmpeg', '-y', '-i', mp3, '-ac', '1', '-ar', str(SR), '/tmp/bg.wav'], capture_output=True)
    w = wave.open('/tmp/bg.wav', 'rb'); n = w.getnframes(); pcm = w.readframes(n); w.close()
    dur = n / SR
    sprite[_id] = [round(cur, 3), round(dur, 3)]
    allpcm += pcm; cur += dur; ok += 1
w = wave.open('/tmp/bgfull.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(allpcm); w.close()
subprocess.run(['ffmpeg', '-y', '-i', '/tmp/bgfull.wav', '-b:a', '48k', '/tmp/bgspr.mp3'], capture_output=True)
b64 = base64.b64encode(open('/tmp/bgspr.mp3', 'rb').read()).decode()
meta = {"label": "Gigi", "sprite": sprite, "lines": lines}
pack = "window.__BIX_LOADED && window.__BIX_LOADED('gigi', " + json.dumps(meta, ensure_ascii=False) + ", '" + b64 + "');\n"
open(OUT, 'w', encoding='utf-8').write(pack)
print(f"gigi pack: {ok} ok, {fail} fail  total {cur:.1f}s  pack {len(pack)//1024} KB -> {OUT}")
