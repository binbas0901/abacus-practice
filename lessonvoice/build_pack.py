#!/usr/bin/env python3
# Pack the recorded lesson clips into the app's voice pack.
#
#   python3 lessonvoice/build_pack.py
#
# Reads  : lessonvoice/lesson-manifest.json  ([{id, text}, ...])
#          lessonvoice/clips/<id>.mp3        (from gen.sh)
# Writes : audio/juni-lines-lesson.js        (window.__LINES_LOADED pack)
#
# The pack is keyed by the EXACT line text, not by id. That is what makes the
# lessons repurposable: if a script line is reworded, only that one line needs
# re-recording; unchanged lines keep playing from the existing pack. The app
# finds a clip via Classroom.Voice.find('juni', <line text>).
import json, subprocess, wave, base64, os
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
MAN = json.load(open(os.path.join(HERE, 'lesson-manifest.json')))
SR = 44100
allpcm = bytearray(); sprite = {}; cur = 0.0; miss = 0
for row in MAN:
    mp3 = os.path.join(HERE, 'clips', f"{row['id']}.mp3")
    if not os.path.exists(mp3) or os.path.getsize(mp3) == 0:
        miss += 1; continue
    subprocess.run(['ffmpeg', '-y', '-i', mp3, '-ac', '1', '-ar', str(SR), '/tmp/w.wav'], capture_output=True)
    w = wave.open('/tmp/w.wav', 'rb'); n = w.getnframes(); pcm = w.readframes(n); w.close()
    dur = n / SR
    sprite[row['text']] = [round(cur, 3), round(dur, 3)]
    allpcm += pcm; cur += dur
w = wave.open('/tmp/full.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(allpcm); w.close()
subprocess.run(['ffmpeg', '-y', '-i', '/tmp/full.wav', '-b:a', '48k', '/tmp/sprite.mp3'], capture_output=True)
b64 = base64.b64encode(open('/tmp/sprite.mp3', 'rb').read()).decode()
pack = 'window.__LINES_LOADED && window.__LINES_LOADED("juni-lesson", ' + json.dumps({"who": "juni", "label": "Juni", "sprite": sprite}) + ', "' + b64 + '");\n'
open(os.path.join(REPO, 'audio', 'juni-lines-lesson.js'), 'w').write(pack)
print(f"clips packed: {len(sprite)}  missing: {miss}  total audio: {cur:.1f}s  pack: {len(pack)//1024} KB")
