#!/usr/bin/env python3
# Pack the recorded "Read the beads" teaching clips into the app's voice pack.
#
#   python3 lessonvoice/build_teach.py
#
# Reads  : lessonvoice/teach-manifest.json  ([{id, text}, ...])
#          lessonvoice/clips_teach/<id>.mp3 (from the ElevenLabs gen step)
# Writes : audio/juni-lines-teach.js        (window.__LINES_LOADED "juni-teach" pack)
#
# Keyed by the stable key (j_rt_*), matching Classroom.Voice.find('juni', key).
import json, subprocess, wave, base64, os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
MAN = json.load(open(os.path.join(HERE, 'teach-manifest.json')))
SR = 44100
allpcm = bytearray(); sprite = {}; cur = 0.0; miss = 0
for row in MAN:
    mp3 = os.path.join(HERE, 'clips_teach', f"{row['id']}.mp3")
    if not os.path.exists(mp3) or os.path.getsize(mp3) == 0:
        miss += 1; continue
    subprocess.run(['ffmpeg', '-y', '-i', mp3, '-ac', '1', '-ar', str(SR), '/tmp/wt.wav'], capture_output=True)
    w = wave.open('/tmp/wt.wav', 'rb'); n = w.getnframes(); pcm = w.readframes(n); w.close()
    dur = n / SR
    sprite[row['id']] = [round(cur, 3), round(dur, 3)]
    allpcm += pcm; cur += dur
w = wave.open('/tmp/fullt.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(allpcm); w.close()
subprocess.run(['ffmpeg', '-y', '-i', '/tmp/fullt.wav', '-b:a', '48k', '/tmp/spritet.mp3'], capture_output=True)
b64 = base64.b64encode(open('/tmp/spritet.mp3', 'rb').read()).decode()
pack = 'window.__LINES_LOADED && window.__LINES_LOADED("juni-teach", ' + json.dumps({"who": "juni", "label": "Juni", "sprite": sprite}) + ', "' + b64 + '");\n'
open(os.path.join(REPO, 'audio', 'juni-lines-teach.js'), 'w').write(pack)
print(f"teaching clips packed: {len(sprite)}  missing: {miss}  total audio: {cur:.1f}s  pack: {len(pack)//1024} KB")
