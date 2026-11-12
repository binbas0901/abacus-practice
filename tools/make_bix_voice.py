"""Generate Bix's voice: every line in tools/bix_lines.json, in each voice below, packed as audio/bix-<voice>.js.

Pipeline per line: Kokoro v1.0 (sherpa-onnx) -> raise pitch + formants (smaller "vocal tract" = childlike) -> trim -> normalise.
Then a Whisper check scores each line for clarity, and the pitch and pace are measured, so nothing ships unheard.

Needs: pip install sherpa-onnx numpy; ffmpeg; the Kokoro multi-lang v1.0 model and Whisper base.en from the sherpa-onnx
GitHub releases; a lexicon with Bix's words added (see LEXICON_EXTRA).
Usage: python3 tools/make_bix_voice.py <out_dir> [voice ...]
"""
import json, os, re, sys, wave, base64, subprocess, io
import numpy as np
import sherpa_onnx

K = os.environ.get('KOKORO', '/tmp/kok/kokoro-multi-lang-v1_0/')
W = os.environ.get('WHISPER', '/tmp/asr/sherpa-onnx-whisper-base.en/')
LEXICON = K + 'lexicon-bix.txt'
LEXICON_EXTRA = """bix b ˈ ɪ k s
bix's b ˈ ɪ k s ɪ z
soroban s ˈ ɔ ɹ ə b ɑ n
that's ð ˈ æ t s
what's w ˈ ʌ t s
today's t ə d ˈ A z
makes m ˈ A k s
bead's b ˈ i d z
hee h ˈ i
hoo h ˈ u
beadtastic b ˌ i d t ˈ æ s t ɪ k
poptastic p ˌ ɑ p t ˈ æ s t ɪ k
"""
# tag: (label, kokoro speaker id, semitones up, kokoro speed)
VOICES = {
    'sweet':  ('Sweet',  2, 4.0, 0.62),   # af_bella
    'bright': ('Bright', 3, 4.5, 0.64),   # af_heart
    'boy':    ('Boy',   18, 6.0, 0.57),   # am_puck
}
HERE = os.path.dirname(os.path.abspath(__file__))

def ensure_lexicon():
    if os.path.exists(LEXICON): return
    with open(K + 'lexicon-us-en.txt', encoding='utf-8') as f: base = f.read()
    with open(LEXICON, 'w', encoding='utf-8') as f: f.write(base.rstrip('\n') + '\n' + LEXICON_EXTRA)

def make_tts():
    return sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
        kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(model=K+'model.onnx', voices=K+'voices.bin', tokens=K+'tokens.txt',
            lexicon=LEXICON, data_dir=K+'espeak-ng-data', dict_dir=K+'dict', lang='en-us'), num_threads=4), max_num_sentences=1))

def make_asr():
    return sherpa_onnx.OfflineRecognizer.from_whisper(encoder=W+'base.en-encoder.int8.onnx', decoder=W+'base.en-decoder.int8.onnx', tokens=W+'base.en-tokens.txt', num_threads=4)

def shift(x, semis):
    if not semis: return x
    f = 2 ** (semis / 12); n = int(len(x) / f)
    return np.interp(np.arange(n) * f, np.arange(len(x)), x).astype(np.float32)

def trim_norm(x, sr):
    a = np.abs(x); th = max(0.01, a.max() * 0.03); idx = np.where(a > th)[0]
    if len(idx): x = x[max(0, idx[0] - int(sr * .03)): idx[-1] + int(sr * .08)]
    peak = np.abs(x).max() or 1
    return (x * (0.92 / peak)).astype(np.float32)

def f0(x, sr):
    fr = int(sr * 0.04); hop = fr // 2; vals = []
    for i in range(0, len(x) - fr, hop):
        s = x[i:i + fr] - x[i:i + fr].mean()
        if np.sqrt((s ** 2).mean()) < 0.02: continue
        c = np.correlate(s, s, 'full')[fr - 1:]; lo, hi = int(sr / 600), int(sr / 80)
        k = lo + np.argmax(c[lo:hi])
        if c[k] > 0.3 * c[0]: vals.append(sr / k)
    return float(np.median(vals)) if vals else 0.0

NUM = {'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9','ten':'10'}
def words(t):
    w = re.sub(r"[^a-z0-9' ]", " ", t.lower().replace('’', "'").replace('-', ' ')).split()
    alias = {'everyone':'every one','beads':'bead\'s' if False else 'beads','bicks':'bix','biks':'bix','bixs':'bix','bigs':'bix','bics':'bix','vix':'bix','bex':'bix','bead tastic':'beadtastic'}
    out = [NUM.get(alias.get(x, x), alias.get(x, x)) for x in w]
    return ' '.join(out).replace("bead's", 'beads').split()

def clarity(ref, hyp):
    r, h = words(ref), words(hyp)
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1): d[i][0] = i
    for j in range(len(h) + 1): d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (r[i-1] != h[j-1]))
    return max(0.0, 1 - d[len(r)][len(h)] / max(1, len(r)))


def cut_lead(x, sr):
    """Drop a short sound before the first word (a breath or 'uh' the model sometimes adds): a burst under 250 ms followed by a quiet dip."""
    hop = int(sr * 0.01); env = np.array([np.sqrt((x[i:i+hop]**2).mean()) for i in range(0, len(x) - hop, hop)])
    if not len(env): return x
    peak = env.max(); speech = env > peak * 0.35
    if not speech.any(): return x
    # find first frame of a run of >= 8 loud frames (80 ms): the real start of speech
    run = 0
    for i, s in enumerate(speech):
        run = run + 1 if s else 0
        if run >= 8:
            start = i - 7; break
    else: return x
    lead = env[:start]
    if start == 0 or start * 10 > 400: return x
    dip = lead.min() if len(lead) else 0
    if lead.max() > peak * 0.15 and dip < peak * 0.12:       # there is a separate burst, then quiet, before the word
        cut = max(0, start * hop - int(sr * 0.03)); return x[cut:]
    return x

def hear(asr, x, sr):
    pad = np.zeros(int(sr * 0.4), np.float32)
    s = asr.create_stream(); s.accept_waveform(sr, np.concatenate([pad, x, pad])); asr.decode_stream(s); return s.result.text.strip()

def best_take(tts, asr, text, sid, semis, speed):
    """Make several takes of a line and keep the one speech recognition hears most accurately (ties: the most natural take)."""
    variants = [text]
    if text.endswith('!'): variants.append(text[:-1] + '.')
    takes = []
    for v in variants:
        for sp in (speed, speed * 1.08, speed * 0.94):
            a = tts.generate(v, sid=sid, speed=sp); sr = a.sample_rate
            base = trim_norm(shift(np.array(a.samples, dtype=np.float32), semis), sr)
            for x, kind in ((base, 'plain'), (trim_norm(cut_lead(base, sr), sr), 'cut')):
                if kind == 'cut' and len(x) == len(base): continue
                h = hear(asr, x, sr); c = clarity(text, h)
                pref = (v == text) + (sp == speed) + (kind == 'plain')   # prefer the original wording/speed/untouched audio when equal
                takes.append((c, pref, x, sr, h, f"{'!' if v == text else '.'} {sp:.2f} {kind}"))
                if c >= 0.999 and pref == 3: return takes[-1]
    return max(takes, key=lambda t: (t[0], t[1]))

def build(tag, out_dir, tts, asr, lines):
    label, sid, semis, speed = VOICES[tag]
    parts, sprite, report, t, sr = [], {}, [], 0.0, None
    for key, text in lines.items():
        c, _, x, sr, heard, how = best_take(tts, asr, text, sid, semis, speed)
        dur = len(x) / sr
        report.append({'id': key, 'text': text, 'heard': heard, 'clarity': round(c, 3), 'take': how, 'pitch': round(f0(x, sr)), 'sec': round(dur, 2), 'wpm': round(len(words(text)) / dur * 60)})
        sprite[key] = [round(t, 3), round(dur, 3)]
        parts += [x, np.zeros(int(sr * 0.3), dtype=np.float32)]; t += dur + 0.3
    audio = np.concatenate(parts)
    wav = io.BytesIO()
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(audio, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-f', 'wav', '-i', 'pipe:0', '-codec:a', 'libmp3lame', '-b:a', '56k', '-ac', '1', '-f', 'mp3', 'pipe:1'], input=wav.getvalue(), capture_output=True, check=True).stdout
    meta = {'label': label, 'sprite': sprite}
    with open(os.path.join(out_dir, f'bix-{tag}.js'), 'w') as f:
        f.write('window.__BIX_LOADED && window.__BIX_LOADED(%s, %s, "%s");\n' % (json.dumps(tag), json.dumps(meta), base64.b64encode(mp3).decode()))
    with open(os.path.join(HERE, f'bix-{tag}-report.json'), 'w') as f: json.dump(report, f, indent=1)
    return report, len(mp3)

if __name__ == '__main__':
    out = sys.argv[1]; tags = sys.argv[2:] or list(VOICES)
    os.makedirs(out, exist_ok=True); ensure_lexicon()
    lines = {k: v for k, v in json.load(open(os.path.join(HERE, 'bix_lines.json'))).items() if not k.startswith('_')}
    tts, asr = make_tts(), make_asr()
    for tag in tags:
        rep, size = build(tag, out, tts, asr, lines)
        c = np.mean([r['clarity'] for r in rep]); low = [r for r in rep if r['clarity'] < 0.8]
        print(f"{tag:7} clarity {c:.2f} | pitch {np.median([r['pitch'] for r in rep]):.0f} Hz | pace {np.median([r['wpm'] for r in rep]):.0f} wpm | {size//1024} KB | {len(low)} lines below 0.8", flush=True)
        for r in low: print(f"         {r['id']:12} {r['clarity']:.2f}  said: {r['text']}  |  heard: {r['heard']}  [{r['take']}]")
