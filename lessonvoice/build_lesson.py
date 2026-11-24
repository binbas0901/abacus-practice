#!/usr/bin/env python3
# Pack a lesson's recorded Juni clips into an app voice pack. Reusable across lessons.
#
#   python3 lessonvoice/build_lesson.py <lines.tsv> <clips_dir> <pack_name> <out.js>
#
# e.g. python3 lessonvoice/build_lesson.py make-lines.tsv clips_make juni-make ../audio/juni-lines-make.js
#
# Reads  : <lines.tsv>  (rows: <id>\t<text>; '#'-prefixed / blank rows skipped)
#          <clips_dir>/<id>.mp3  (from gen_pack.sh)
# Writes : <out.js>      (window.__LINES_LOADED(<pack_name>, {...}, b64))
# Keyed by the stable id, matching Classroom.Voice.find('juni', id).
import json, subprocess, wave, base64, os, sys
if len(sys.argv) != 5:
    sys.exit("usage: build_lesson.py <lines.tsv> <clips_dir> <pack_name> <out.js>")
LINES, CLIPS, PACK, OUT = sys.argv[1:5]
HERE = os.path.dirname(os.path.abspath(__file__))
def P(p): return p if os.path.isabs(p) else os.path.join(HERE, p)
SR = 44100
ids = []; texts = {}
for line in open(P(LINES), encoding='utf-8'):
    line = line.rstrip('\n')
    if not line or line.lstrip().startswith('#') or '\t' not in line: continue
    _id, _t = line.split('\t', 1)
    ids.append(_id); texts[_id] = _t
allpcm = bytearray(); sprite = {}; cur = 0.0; miss = 0
for _id in ids:
    mp3 = os.path.join(P(CLIPS), f"{_id}.mp3")
    if not os.path.exists(mp3) or os.path.getsize(mp3) == 0:
        miss += 1; print(f"  missing clip: {_id}"); continue
    subprocess.run(['ffmpeg', '-y', '-i', mp3, '-ac', '1', '-ar', str(SR), '/tmp/wl.wav'], capture_output=True)
    w = wave.open('/tmp/wl.wav', 'rb'); n = w.getnframes(); pcm = w.readframes(n); w.close()
    dur = n / SR
    sprite[_id] = [round(cur, 3), round(dur, 3)]
    allpcm += pcm; cur += dur
w = wave.open('/tmp/fulll.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(allpcm); w.close()
subprocess.run(['ffmpeg', '-y', '-i', '/tmp/fulll.wav', '-b:a', '48k', '/tmp/spritel.mp3'], capture_output=True)
b64 = base64.b64encode(open('/tmp/spritel.mp3', 'rb').read()).decode()
lines_map = {k: texts[k] for k in sprite if k in texts}   # embed caption text (loadKey merges into Voice.text) so nothing depends on clip order
pack = 'window.__LINES_LOADED && window.__LINES_LOADED("' + PACK + '", ' + json.dumps({"who": "juni", "label": "Juni", "sprite": sprite, "lines": lines_map}, ensure_ascii=False) + ', "' + b64 + '");\n'
open(P(OUT), 'w').write(pack)
print(f"packed {len(sprite)} clips  missing: {miss}  total: {cur:.1f}s  pack: {len(pack)//1024} KB -> {OUT}")
