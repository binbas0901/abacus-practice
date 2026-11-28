"""Extra words for a Listen voice, as a small pack beside the main sprite (the main file is never rebuilt, so every
existing clip keeps its exact timing). Same Piper model and settings as make_sprites.py.
The pack is audio/voice-<key>-extra.js and calls window.__VOICE_LOADED('<key>-extra', {label, sprite}, mp3base64).
Usage: python3 tools/make_voice_extra.py [key ...]        (default: ljspeech)
"""
import base64, io, json, os, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_sprites as S
from piper import PiperVoice

CLIPS = {'equals': 'Equals.'}   # said after the last number of a Listen problem

def build(key, outdir):
    model, label = S.VOICES[key]; voice = PiperVoice.load(model)
    parts, sprite, t, sr, gap = [], {}, 0.0, None, 0.25
    for cid, text in CLIPS.items():
        sr, d = S.synth(voice, text); d = S.trim(d, sr); d = d * (0.9 / (np.max(np.abs(d)) or 1))
        sprite[cid] = [round(t, 3), round(len(d) / sr, 3)]; t += len(d) / sr + gap
        parts += [d, np.zeros(int(gap * sr), dtype=np.float32)]
    wav = io.BytesIO()
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.concatenate(parts) * 32767).astype(np.int16).tobytes())
    if os.environ.get('KEEP_WAV'): open(f'/tmp/voice-{key}-extra.wav', 'wb').write(wav.getvalue())
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-f', 'mp3', 'pipe:1'], input=wav.getvalue(), capture_output=True, check=True).stdout
    with open(os.path.join(outdir, f'voice-{key}-extra.js'), 'w') as f:
        f.write('window.__VOICE_LOADED && window.__VOICE_LOADED(%s, %s, "%s");\n' % (json.dumps(key + '-extra'), json.dumps({'label': label, 'sprite': sprite}), base64.b64encode(mp3).decode()))
    print(key, sprite, len(mp3) // 1024, 'KB')

if __name__ == '__main__':
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')
    for k in (sys.argv[1:] or ['ljspeech']): build(k, out)
