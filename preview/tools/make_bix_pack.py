"""Build a small extra pack of Bix lines (same voices and pipeline as make_bix_voice.py) without re-recording the main set.
The pack is audio/bix-<voice>-<pack>.js and calls window.__BIX_LOADED('<voice>-<pack>', {label, sprite, lines}, mp3base64);
fun.js loads it after the main voice file and adds its line texts to the speech bubbles.
Usage: python3 tools/make_bix_pack.py <pack> <lines.json> [voice ...]      e.g.  python3 tools/make_bix_pack.py home tools/bix_lines_home.json sweet boy
"""
import json, os, sys, io, wave, base64, subprocess
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import make_bix_voice as M

def build_pack(pack, tag, lines, tts, asr, out_dir):
    label, sid, semis, speed = M.VOICES[tag]
    parts, sprite, t, sr, report = [], {}, 0.0, None, []
    cache_dir = os.path.join('/tmp', f'bixcache-{tag}-{pack}'); os.makedirs(cache_dir, exist_ok=True)   # one checkpoint per line: survives restarts
    for key, text in lines.items():
        cf = os.path.join(cache_dir, key + '.npz'); z = None
        if os.path.exists(cf):
            z = np.load(cf, allow_pickle=True)
            if str(z['text']) == text: c, x, sr, heard = float(z['c']), z['x'], int(z['sr']), str(z['heard'])
            else: z = None
        if z is None:
            c, _, x, sr, heard, how = M.best_take(tts, asr, text, sid, semis, speed)
            np.savez(cf, c=c, x=x, sr=sr, heard=heard, how=how, text=text); print('  done', tag, key, round(c, 2), '|', heard, flush=True)
        dur = len(x) / sr; sprite[key] = [round(t, 3), round(dur, 3)]; t += dur + 0.3
        parts += [x, np.zeros(int(sr * 0.3), dtype=np.float32)]
        report.append((key, round(c, 2), heard, round(dur, 2)))
    wav = io.BytesIO()
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(np.concatenate(parts), -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '56k', '-ac', '1', '-f', 'mp3', 'pipe:1'], input=wav.getvalue(), capture_output=True, check=True).stdout
    meta = {'label': label, 'sprite': sprite, 'lines': lines}
    with open(os.path.join(out_dir, f'bix-{tag}-{pack}.js'), 'w') as f:
        f.write('window.__BIX_LOADED && window.__BIX_LOADED(%s, %s, "%s");\n' % (json.dumps(f'{tag}-{pack}'), json.dumps(meta, ensure_ascii=False), base64.b64encode(mp3).decode()))
    return report, len(mp3)

if __name__ == '__main__':
    pack, src = sys.argv[1], sys.argv[2]; tags = sys.argv[3:] or ['sweet', 'boy']
    lines = {k: v for k, v in json.load(open(src)).items() if not k.startswith('_')}
    out = os.path.join(M.HERE, '..', 'audio'); M.ensure_lexicon(); tts, asr = M.make_tts(), M.make_asr()
    for tag in tags:
        rep, size = build_pack(pack, tag, lines, tts, asr, out)
        print(tag, f'{size // 1024} KB', rep, flush=True)
