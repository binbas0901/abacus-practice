"""Build Bix's extra lines (tools/bix_lines_door.json) into audio/bix-extra-<voice>.js, in the same voices as make_bix_voice.py.
A separate small pack so new screens can add lines without regenerating the big bix-<voice>.js files.
The pack calls window.__BIX_EXTRA(tag, meta, b64); app.js loads it next to the main pack.
Usage: python3 tools/make_bix_extra.py <out_dir> [voice ...]
"""
import json, os, sys, io, wave, base64, subprocess
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_bix_voice as m

def build(tag, out_dir, tts, asr, lines):
    label, sid, semis, speed = m.VOICES[tag]
    parts, sprite, report, t, sr = [], {}, [], 0.0, None
    cache_dir = os.path.join('/tmp', f'bixcache-{tag}'); os.makedirs(cache_dir, exist_ok=True)
    for key, text in lines.items():
        cf = os.path.join(cache_dir, key + '.npz'); z = None
        if os.path.exists(cf):
            z = np.load(cf, allow_pickle=True)
            if str(z['text']) == text: c, x, sr, heard = float(z['c']), z['x'], int(z['sr']), str(z['heard'])
            else: z = None
        if z is None:
            c, _, x, sr, heard, how = m.best_take(tts, asr, text, sid, semis, speed)
            np.savez(cf, c=c, x=x, sr=sr, heard=heard, how=how, text=text); print('  done', tag, key, round(c, 2), heard, flush=True)
        dur = len(x) / sr
        report.append({'id': key, 'text': text, 'heard': heard, 'clarity': round(c, 3), 'sec': round(dur, 2)})
        sprite[key] = [round(t, 3), round(dur, 3)]
        parts += [x, np.zeros(int(sr * 0.3), dtype=np.float32)]; t += dur + 0.3
    audio = np.concatenate(parts); wav = io.BytesIO()
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '56k', '-ac', '1', '-f', 'mp3', 'pipe:1'], input=wav.getvalue(), capture_output=True, check=True).stdout
    with open(os.path.join(out_dir, f'bix-extra-{tag}.js'), 'w') as f:
        f.write('window.__BIX_EXTRA && window.__BIX_EXTRA(%s, %s, "%s");\n' % (json.dumps(tag), json.dumps({'label': label, 'sprite': sprite}), base64.b64encode(mp3).decode()))
    return report, len(mp3)

if __name__ == '__main__':
    out = sys.argv[1]; tags = sys.argv[2:] or ['sweet', 'boy']
    os.makedirs(out, exist_ok=True); m.ensure_lexicon()
    lines = {k: v for k, v in json.load(open(os.path.join(m.HERE, 'bix_lines_door.json'))).items() if not k.startswith('_')}
    tts, asr = m.make_tts(), m.make_asr()
    for tag in tags:
        rep, size = build(tag, out, tts, asr, lines)
        low = [r for r in rep if r['clarity'] < 0.8]
        print(f"{tag}: {len(rep)} lines, {size//1024} KB, {len(low)} below 0.8", flush=True)
        for r in low: print('   ', r['id'], r['clarity'], '|', r['heard'])
