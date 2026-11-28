#!/usr/bin/env python3
# Regenerate Juni's NUMBER voice (the clips the drills speak) in the current ElevenLabs settings,
# so the numbers match her teaching voice. Whole-phrase clips for natural prosody.
#   ELEVEN_KEY=sk_xxx python3 lessonvoice/make_numbers.py
# Emits window.__VOICE_LOADED("juni", {label, sprite}, b64) -> audio/voice-juni.js
# ids: n0..n99 (the number alone), p1..p99 ("plus N"), m1..m99 ("minus N"),
#      t1..t9 ("times N", for multiplication), hundred, equals, yes, notquite
# Resumable: clips cached in /tmp/numvoice/<id>.<sig>.mp3
import json, os, sys, subprocess, wave, base64, hashlib
KEY = os.environ.get('ELEVEN_KEY') or sys.exit("set ELEVEN_KEY")
VOICE = "Nhs7eitvQWFTQBsf0yiT"   # Sarah (Juni) — same voice as teaching lines
VS = {"stability": 0.45, "similarity_boost": 0.8, "style": 0.30, "use_speaker_boost": True, "speed": 0.95}
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "audio", "voice-juni.js")
ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
def words(n):
    if n < 20: return ONES[n]
    return TENS[n//10] + (('-' + ONES[n%10]) if n%10 else '')
items = []  # (id, text)
for n in range(100): items.append(('n%d'%n, words(n)))
for n in range(1,100): items.append(('p%d'%n, 'plus ' + words(n)))
for n in range(1,100): items.append(('m%d'%n, 'minus ' + words(n)))
for n in range(1,10):  items.append(('t%d'%n, 'times ' + words(n)))
items += [('hundred','hundred'), ('equals','equals'), ('yes','Yes!'), ('notquite','Not quite.')]
cache = '/tmp/numvoice'; os.makedirs(cache, exist_ok=True)
allpcm = bytearray(); sprite = {}; cur = 0.0; ok = 0; fail = 0
for _id, text in items:
    sig = hashlib.md5((text + '|' + json.dumps(VS, sort_keys=True)).encode()).hexdigest()[:8]
    mp3 = os.path.join(cache, '%s.%s.mp3' % (_id, sig))
    if not (os.path.exists(mp3) and os.path.getsize(mp3) > 0):
        payload = json.dumps({"text": text, "model_id": "eleven_multilingual_v2", "voice_settings": VS})
        code = subprocess.run(['curl','-s','-o',mp3,'-w','%{http_code}','-X','POST',
            'https://api.elevenlabs.io/v1/text-to-speech/%s' % VOICE,
            '-H','xi-api-key: %s' % KEY, '-H','Content-Type: application/json',
            '--data-binary', payload], capture_output=True, text=True).stdout.strip()
        if code != '200' or not (os.path.exists(mp3) and os.path.getsize(mp3) > 0):
            fail += 1; print('FAIL %s (%s)' % (_id, code));
            if os.path.exists(mp3): os.remove(mp3)
            continue
    subprocess.run(['ffmpeg','-y','-i',mp3,'-ac','1','-ar',str(SR),'/tmp/nv.wav'], capture_output=True)
    w = wave.open('/tmp/nv.wav','rb'); nfr = w.getnframes(); pcm = w.readframes(nfr); w.close()
    dur = nfr / SR
    sprite[_id] = [round(cur,3), round(dur,3)]
    allpcm += pcm; cur += dur; ok += 1
w = wave.open('/tmp/nvfull.wav','wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(allpcm); w.close()
subprocess.run(['ffmpeg','-y','-i','/tmp/nvfull.wav','-b:a','48k','/tmp/nvspr.mp3'], capture_output=True)
b64 = base64.b64encode(open('/tmp/nvspr.mp3','rb').read()).decode()
meta = {"label": "Juni (teacher)", "sprite": sprite}
pack = 'window.__VOICE_LOADED && window.__VOICE_LOADED("juni", ' + json.dumps(meta) + ', "' + b64 + '");\n'
open(OUT, 'w').write(pack)
print('number voice: %d ok, %d fail  total %.1fs  pack %d KB -> audio/voice-juni.js' % (ok, fail, cur, len(pack)//1024))
