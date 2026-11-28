"""Listen says "equals" after the last number, on every voice path, in the same rhythm as the numbers:
device voice (speechSynthesis), built-in clips (Linda), a recorded family voice with and without its own "equals",
the clip pack missing (device voice says it), and a times problem ("seven", "times five", "equals")."""
import asyncio, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')
WORDS = "['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','plus','minus','yes','not quite']"
SEED = """(async(extra)=>{
  const wav=(dur)=>{ const sr=22050,n=Math.floor(sr*dur); const dv=new DataView(new ArrayBuffer(44+n*2)); const s=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
    s(0,'RIFF');dv.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);s(36,'data');dv.setUint32(40,n*2,true);
    for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(i/8)*12000, true); return {buf:dv.buffer, type:'audio/wav'}; };
  const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onupgradeneeded=()=>q.result.createObjectStore('clips'); q.onsuccess=()=>r(q.result);});
  await new Promise(r=>{const t=db.transaction('clips','readwrite'); const st=t.objectStore('clips'); st.clear(); %s.forEach(w=>st.put(wav(0.3),'p1|'+w)); if (extra) st.put(wav(0.77),'p1|equals'); t.oncomplete=r;});
})""" % WORDS
# Record everything that makes a sound: speech (text) and clips (start, end, clip length before the speed setting).
HOOK = """(()=>{ window.__said=[]; window.__starts=[];
  if (window.speechSynthesis){ const sp=speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak=u=>{ if (u.volume>0.5) window.__said.push([u.text, performance.now()/1000, u.rate]); return sp(u); }; }
  const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when,off,dur){ const r=this.playbackRate.value, len=(dur!==undefined?dur:this.buffer.duration), t=when||this.context.currentTime; if (len>0.02) window.__starts.push([t, t+len/r, len, r]); return o.apply(this,arguments); }; })()"""
ok = True
def check(name, cond, detail=''):
    global ok; ok = ok and bool(cond); print(('PASS' if cond else 'FAIL'), name, detail)
async def listen(pg, voice, gap=1, rate=1.0, node=None, nopack=False):
    await pg.evaluate("([v,g,r,n])=>{const st=JSON.parse(window.__legacy('settings')||'{}'); st.voice=v; st.profiles=[{id:'p1',name:'Mom'}]; st.termGap=g; st.voiceRate=r; st.answerPause=0.5; st.sayPlus=true; st.speakFeedback=false; st.sfx=false; st.settingsVersion=6; localStorage.setItem('abacus.settings',JSON.stringify(st)); if(n){ const pr=JSON.parse(window.__legacy('progress')||'{}'); pr.current=n; localStorage.setItem('abacus.progress',JSON.stringify(pr)); } }", [voice, gap, rate, node])
    await pg.reload(); await pg.wait_for_timeout(400); await pg.evaluate(HOOK)
    if nopack: await pg.evaluate("App.Speaker.prepare().then(()=>{ App.Speaker.extra=null; App.Speaker.loadExtra=async()=>{}; })")   # as if audio/voice-ljspeech-extra.js could not be fetched
    await pg.evaluate("App.startMode('listen')"); await pg.click('#listenGo')
    # nothing may be answered before "equals" has been said: the tool stays locked until then
    await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=60000)
    r = await pg.evaluate("({said:window.__said, starts:window.__starts.slice().sort((a,b)=>a[0]-b[0]), log:window.__diag.lines.slice().reverse()})")
    await pg.click('#exitDrill'); return r
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width': 1180, 'height': 820}); await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read()); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(300)

        # 1) device voice: the spoken sequence is number, plus/minus number ..., then "equals" one gap later, at the voice speed
        r = await listen(pg, 'device', gap=1, rate=1.2); said = r['said']; texts = [s[0] for s in said]
        check('device: last thing spoken is "equals"', len(texts) >= 3 and texts[-1] == 'equals', str(texts))
        check('device: the numbers come first, with plus / minus', all(t.split()[0] in ('plus', 'minus') for t in texts[1:-1]) and texts[0].split()[0] not in ('plus', 'minus', 'equals'), '')
        check('device: "equals" only once', texts.count('equals') == 1)
        check('device: "equals" uses the voice speed', abs(said[-1][2] - 1.2) < 1e-6, 'rate %s' % said[-1][2])
        # (headless Chrome has no speech engine, so each utterance times out; only the order and the settings are checked here)

        # 2) built-in clips (Linda): the last clip is "equals" from the small pack, one gap after the last number started
        for gap, rate in [(1.2, 1.0), (0.3, 1.4)]:
            r = await listen(pg, 'ljspeech', gap=gap, rate=rate); st = r['starts']; log = '\n'.join(r['log'])
            eqlen = await pg.evaluate("App.Speaker.extra && App.Speaker.extra.map.equals[1]")
            check(f'clips gap={gap} rate={rate}: audio clock, "equals" from the built-in clip', 'audio clock' in log and 'equals: built-in clip' in log, '')
            check(f'clips gap={gap} rate={rate}: last sound is the "equals" clip, at the voice speed with the pitch kept (playback rate 1)', len(st) >= 3 and eqlen and abs(st[-1][2] - eqlen / rate) < 0.01 and st[-1][3] == 1, 'clip %.3fs' % (st[-1][2] if st else 0))
            # rhythm: the silence before "equals" is the pause between numbers (settings.termGap)
            sch = await pg.evaluate("window.__lastSchedule"); gp = [round(b0 - a1, 3) for (a0, a1), (b0, b1) in zip(sch, sch[1:])]
            check(f'clips gap={gap} rate={rate}: same pause before "equals" as between numbers', all(abs(x - gap) < 0.02 for x in gp) and abs(st[-1][0] - st[-2][1] - gap - 0.05) < 0.03, str(gp))

        # 3) a recorded voice without its own "equals": still complete, reads on the audio clock, built-in clip says equals
        await pg.evaluate(SEED + "(false)")
        r = await listen(pg, 'rec:p1', gap=1); st = r['starts']; log = '\n'.join(r['log'])
        check('my voice (33 words): voice still counts as complete', '33/33' in log and 'kind=rec' in log and 'audio clock' in log, '')
        check('my voice (33 words): "equals" from the built-in clip, last', 'equals: built-in clip' in log and abs(st[-1][2] - 0.569) < 0.01 and all(abs(x[2] - 0.3) < 0.01 for x in st[:-1]), 'last clip %.3fs' % st[-1][2])

        # 4) the same person after recording "equals": their own recording is used
        await pg.evaluate(SEED + "(true)")
        r = await listen(pg, 'rec:p1', gap=1); st = r['starts']; log = '\n'.join(r['log'])
        check('my voice (with equals): own recording says "equals", last', 'equals: own recording' in log and abs(st[-1][2] - 0.77) < 0.01, 'last clip %.3fs' % st[-1][2])
        # (a recorded number is several words, "plus" + "seven": take the start of each number from the schedule in the sound log)
        sch = [[float(x) for x in pair.split('–')] for pair in [l for l in r['log'] if 'schedule:' in l][-1].split('schedule: ')[1].split(', ')]
        gaps = [b0 - a1 for (a0, a1), (b0, b1) in zip(sch, sch[1:])]
        check('my voice (with equals): same pause before "equals" as between numbers', len(sch) >= 3 and all(abs(g - 1) < 0.03 for g in gaps) and abs(sch[-1][1] - sch[-1][0] - 0.77) < 0.02, 'pauses %s' % [round(x, 2) for x in gaps])

        # 5) the recorder offers "equals" as a 34th word and says what happens without it
        await pg.evaluate(SEED + "(false)"); await pg.reload(); await pg.wait_for_timeout(400)
        await pg.evaluate("document.getElementById('grownups').click()"); await pg.wait_for_selector('#gate.active'); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(600)
        await pg.evaluate("document.querySelector('#recBody').scrollIntoView({block:'center'})"); await pg.wait_for_timeout(300)
        word = await pg.text_content('#recWord'); count = await pg.text_content('#recCount'); status = await pg.text_content('#recStatus')
        check('recorder: goes to "equals" (34 / 34) when the numbers are done', word == 'equals' and count.replace(' ', '') == '34/34', f'{word} {count}')
        check('recorder: says the built-in voice is used until then', 'equals' in status and 'built-in voice' in status, status)
        await pg.screenshot(path='/tmp/toy-v42/recorder_equals.png')
        await pg.click('#parentDone')

        # 6) the clip pack cannot be loaded: the device voice says "equals" after the clips
        r = await listen(pg, 'rec:p1', gap=1, nopack=True); log = '\n'.join(r['log']); texts = [s[0] for s in r['said']]
        check('no clip pack: device voice says "equals" after the recorded numbers', 'equals: device voice' in log and texts == ['equals'], str(texts))

        # 7) a times problem in Listen: "<a>", "times <b>", "equals"
        r = await listen(pg, 'device', gap=0.5, node='times_a'); texts = [s[0] for s in r['said']]
        check('times: "<a>", "times <b>", "equals"', len(texts) == 3 and texts[1].startswith('times ') and texts[2] == 'equals', str(texts))

        check('no page errors', not errs, str(errs))
        print('errors:', errs); await b.close()
    if not ok: print('FAIL p18_equals')
asyncio.run(main())
