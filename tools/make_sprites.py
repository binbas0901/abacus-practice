"""Generate audio sprites (one mp3 + JSON timing map per voice) for the listening drill.
Clips: bare numbers 0-99, "plus n", "minus n" for 1-99, "hundred", feedback phrases.
"""
import json, os, subprocess, sys, wave, io
import numpy as np
from piper import PiperVoice, SynthesisConfig

V='/tmp/voices/vits-piper-'
VOICES = {
    'kristin': (V+'en_US-kristin-medium/en_US-kristin-medium.onnx', 'Kristin (US woman)'),
    'ljspeech':(V+'en_US-ljspeech-high/en_US-ljspeech-high.onnx', 'Linda (US woman)'),
    'libritts':(V+'en_US-libritts_r-medium/en_US-libritts_r-medium.onnx', 'Libby (US woman)'),
    'jenny':   (V+'en_GB-jenny_dioco-medium/en_GB-jenny_dioco-medium.onnx', 'Jenny (British woman)'),
    'ryan':    (V+'en_US-ryan-high/en_US-ryan-high.onnx', 'Ryan (US man)'),
    'joe':     (V+'en_US-joe-medium/en_US-joe-medium.onnx', 'Joe (US man)'),
    'amy':     (V+'en_US-amy-medium/en_US-amy-medium.onnx', 'Amy (US woman)'),
    'hfc':     (V+'en_US-hfc_female-medium/en_US-hfc_female-medium.onnx', 'Hannah (US woman)'),
}
LENGTH_SCALE = 0.82   # <1 = faster speech at the source, pitch unchanged
ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen']
TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety']
def words(n):
    if n < 20: return ONES[n]
    t, o = divmod(n, 10)
    return TENS[t] + ('' if o == 0 else ' ' + ONES[o])

def clip_list():
    clips = {}
    for n in range(100): clips[f'n{n}'] = words(n)
    for n in range(1, 100):
        clips[f'p{n}'] = 'plus ' + words(n)
        clips[f'm{n}'] = 'minus ' + words(n)
    clips['hundred'] = 'hundred'
    clips['yes'] = 'Yes!'
    clips['notquite'] = 'Not quite.'
    clips['listen'] = 'Listen.'
    clips['answer'] = 'Your answer?'
    return clips

def synth(voice, text):
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w: voice.synthesize_wav(text, w, syn_config=SynthesisConfig(length_scale=LENGTH_SCALE))
    buf.seek(0)
    with wave.open(buf, 'rb') as w:
        sr = w.getframerate(); data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
    return sr, data

def trim(data, sr, thresh=0.01, pad=0.04):
    idx = np.where(np.abs(data) > thresh)[0]
    if not len(idx): return data
    a = max(0, idx[0] - int(pad*sr)); b = min(len(data), idx[-1] + int(pad*sr))
    return data[a:b]

def build(key, model, label, outdir):
    voice = PiperVoice.load(model)
    clips = clip_list()
    sr = None; parts = []; sprite = {}; t = 0.0; gap = 0.25
    for cid, text in clips.items():
        sr0, d = synth(voice, text)
        sr = sr or sr0
        d = trim(d, sr)
        # normalize peak
        pk = np.max(np.abs(d)) or 1; d = d * (0.9 / pk)
        dur = len(d) / sr
        sprite[cid] = [round(t, 3), round(dur, 3)]
        parts.append(d); parts.append(np.zeros(int(gap*sr), dtype=np.float32))
        t += dur + gap
    audio = np.concatenate(parts)
    wav_path = f'/tmp/{key}.wav'
    with wave.open(wav_path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((audio*32767).astype(np.int16).tobytes())
    mp3 = os.path.join(outdir, f'voice-{key}.mp3')
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',wav_path,'-codec:a','libmp3lame','-b:a','64k','-ac','1', mp3], check=True)
    meta = {'label': label, 'sprite': sprite}
    json.dump(meta, open(os.path.join(outdir, f'voice-{key}.json'), 'w'))
    import base64
    b64 = base64.b64encode(open(mp3,'rb').read()).decode()
    open(os.path.join(outdir, f'voice-{key}.js'),'w').write('window.__VOICE_LOADED && window.__VOICE_LOADED(%s, %s, "%s");\n' % (json.dumps(key), json.dumps(meta), b64))
    print(key, 'clips', len(sprite), 'duration', round(t,1), 's', os.path.getsize(mp3)//1024, 'KB')

if __name__ == '__main__':
    outdir = sys.argv[1]
    os.makedirs(outdir, exist_ok=True)
    for k, (m, label) in VOICES.items(): build(k, m, label, outdir)
