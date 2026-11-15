"""v4.2 speed panel on the Listen and Flash screens: two controls each, exact values on chips, - / + steps, the same
per-child settings Grown-ups edits, applied on every voice path with the pitch kept; the gear reopens it during a set."""
import asyncio, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765'); OUT = '/tmp/toy-v42'; os.makedirs(OUT, exist_ok=True)
WORDS = "['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','plus','minus','yes','not quite']"
SEEDREC = """(async()=>{ const sr=22050,n=Math.floor(sr*0.4); const dv=new DataView(new ArrayBuffer(44+n*2)); const s=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
  s(0,'RIFF');dv.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);s(36,'data');dv.setUint32(40,n*2,true);
  for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(i/8)*12000, true);
  const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onupgradeneeded=()=>q.result.createObjectStore('clips'); q.onsuccess=()=>r(q.result);});
  await new Promise(r=>{const t=db.transaction('clips','readwrite'); const st=t.objectStore('clips'); %s.concat('equals').forEach(w=>st.put({buf:dv.buffer.slice(0),type:'audio/wav'},'p1|'+w)); t.oncomplete=r;}); })()""" % WORDS
HOOK = """(()=>{ window.__said=[]; window.__src=[];
  if (window.speechSynthesis){ const sp=speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak=u=>{ if (u.volume>0.5) window.__said.push([u.text, u.rate, u.pitch]); return sp(u); }; }
  const o=AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start=function(when,off,dur){ const len=dur!==undefined?dur:this.buffer.duration; if (len>0.02) window.__src.push({rate:this.playbackRate.value, len, whole:off===undefined, buflen:this.buffer.duration}); return o.apply(this,arguments); }; })()"""
ok = True
def check(name, cond, detail=''):
    global ok; ok = ok and bool(cond); print(('PASS' if cond else 'FAIL'), name, detail)
async def setv(pg, **kw):
    await pg.evaluate("(kw)=>{ const st=JSON.parse(window.__legacy('settings')||'{}'); Object.assign(st, {sfx:false, speakFeedback:false, answerPause:0, settingsVersion:5}, kw); localStorage.setItem('abacus.settings', JSON.stringify(st)); }", kw); await pg.reload(); await pg.wait_for_timeout(500); await pg.evaluate(HOOK)
async def vals(pg): return await pg.evaluate("[...document.querySelectorAll('#spCtrls .sp-val')].map(e=>e.textContent)")
async def sett(pg): return await pg.evaluate("(()=>{ const s=App.settings; return [s.voiceRate, s.termGap, s.flashSec, s.flashGap]; })()")
async def step(pg, k, d, n=1):
    for _ in range(n): await pg.click(f'#spCtrls [data-k="{k}"] [data-d="{d}"]', force=True)
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active'); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(400)
async def tryit(pg):
    await pg.evaluate("window.__lastSchedule=null; window.__src.length=0; window.__said.length=0"); await pg.click('#spTry'); await pg.wait_for_function("window.__lastSchedule && window.__lastSchedule.length===4", timeout=40000); await pg.wait_for_timeout(150)
    return await pg.evaluate("({s:window.__lastSchedule, src:window.__src.slice(), said:window.__said.slice()})")
def gaps(s): return [round(b[0] - a[1], 3) for a, b in zip(s, s[1:])]
def durs(s): return [round(e - a, 3) for a, e in s]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, service_workers='block'); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read()); await pg.goto(URL); await pg.wait_for_timeout(500); await pg.evaluate(HOOK)

        # 1) a fresh child: the panel opens before the set, with 100% and 0.65s and one Start
        await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(500)
        v = await vals(pg); st = await sett(pg)
        check('fresh child: panel shown before a Listen set, 100% and 0.65s', await pg.is_visible('#speedPop') and v == ['100%', '0.65s'] and st[:2] == [1, 0.65], f'{v} {st}')
        check('fresh child: Start is in the panel (the set\'s own button), Done is not; Try it is', await pg.locator('#speedPop #listenGo').count() == 1 and 'Start' in await pg.text_content('#listenGo') and not await pg.is_visible('#spDone') and await pg.is_visible('#spTry'))
        sz = await pg.evaluate("[...document.querySelectorAll('#speedPop .sp-step')].map(e=>{const r=e.getBoundingClientRect(); return Math.min(r.width,r.height)})")
        check('- and + discs are 64px or more; slow / fast drawings at both ends (no emoji)', len(sz) == 4 and min(sz) >= 64 and await pg.locator('#speedPop .sp-end svg').count() == 4 and await pg.evaluate("[...document.querySelectorAll('#spCtrls [data-k=voiceRate] .sp-end')].map(e=>e.dataset.end).join()") == 'slow,fast' and await pg.evaluate("[...document.querySelectorAll('#spCtrls [data-k=termGap] .sp-end')].map(e=>e.dataset.end).join()") == 'fast,slow', str(sz))

        # 2) + and - move one step and stop at the ends; dragging snaps to steps
        await step(pg, 'voiceRate', 1); a = (await vals(pg))[0]; await step(pg, 'voiceRate', -1, 2); c = (await vals(pg))[0]
        check('voice speed: + then - - gives 110% then 90%', (a, c) == ('110%', '90%'), f'{a} {c}')
        await step(pg, 'voiceRate', -1, 6); lo = (await vals(pg))[0]; dis = await pg.is_disabled('#spCtrls [data-k=voiceRate] [data-d="-1"]'); await step(pg, 'voiceRate', 1, 12); hi = (await vals(pg))[0]
        check('voice speed: clamps at 70% and 150%', (lo, hi) == ('70%', '150%') and dis and await pg.is_disabled('#spCtrls [data-k=voiceRate] [data-d="1"]') and (await sett(pg))[0] == 1.5, f'{lo} {hi}')
        await step(pg, 'termGap', 1); a = (await vals(pg))[1]; await step(pg, 'termGap', -1, 2); c = (await vals(pg))[1]; await step(pg, 'termGap', -1, 20); lo = (await vals(pg))[1]; await step(pg, 'termGap', 1, 30); hi = (await vals(pg))[1]
        check('pause: steps of 0.05s, clamps at 0.05s and 1.20s', (a, c, lo, hi) == ('0.70s', '0.60s', '0.05s', '1.20s'), f'{a} {c} {lo} {hi}')
        box = await (await pg.query_selector('#sp_termGap')).bounding_box(); y = box['y'] + box['height'] / 2
        await pg.mouse.move(box['x'] + box['width'] - 20, y); await pg.mouse.down(); await pg.mouse.move(box['x'] + box['width'] * 0.415, y, steps=8); await pg.mouse.up(); d = (await vals(pg))[1]; dv = (await sett(pg))[1]
        check('pause: dragging the bead lands on a step', d.endswith('s') and abs(round(dv / 0.05) * 0.05 - dv) < 1e-9 and 0.3 <= dv <= 0.7 and d == '%.2fs' % dv, f'{d} {dv}')

        # 3) the same settings as Grown-ups, saved for this child only
        await pg.evaluate("document.querySelector('#sp_termGap').value=0.3; document.querySelector('#sp_termGap').dispatchEvent(new Event('input',{bubbles:true}))"); await step(pg, 'voiceRate', -1, 3)
        check('set to 120% and 0.30s', await vals(pg) == ['120%', '0.30s'], str(await vals(pg)))
        await pg.click('#exitDrill'); await gate(pg)
        gu = await pg.evaluate("[document.querySelector('#sRateV').textContent, document.querySelector('#sGapV').textContent, document.querySelector('#sRate').step, document.querySelector('#sGap').step, document.querySelectorAll('#sGapMin, #sGapMax').length]")
        check('Grown-ups shows the same values, steps and units', gu == ['120%', '0.30s', '0.1', '0.05', 0], str(gu))
        await pg.evaluate("(()=>{ const e=document.querySelector('#sGap'); e.value=0.5; e.dispatchEvent(new Event('input',{bubbles:true})); })()"); await pg.click('#parentDone')
        await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(400); check('a change in Grown-ups shows on the Listen panel', await vals(pg) == ['120%', '0.50s'], str(await vals(pg))); await pg.click('#exitDrill')
        await pg.reload(); await pg.wait_for_timeout(500); await pg.evaluate(HOOK); check('saved: still 120% and 0.50s after a restart', (await sett(pg))[:2] == [1.2, 0.5], str(await sett(pg)))
        first = await pg.evaluate("Store.activeId()"); await pg.evaluate("(()=>{ const id=Store.addChild(); Store.switchTo(id); })()"); await pg.reload(); await pg.wait_for_timeout(500)
        check('another child starts at 100% and 0.65s', (await sett(pg))[:2] == [1, 0.65], str(await sett(pg)))
        await pg.evaluate("id=>Store.switchTo(id)", first); await pg.reload(); await pg.wait_for_timeout(500); await pg.evaluate(HOOK); check('the first child still has 120% and 0.50s', (await sett(pg))[:2] == [1.2, 0.5], str(await sett(pg)))

        # 4) the pause really is the silence between numbers, and before "equals" - built-in clips, on the audio clock
        for g in [0.05, 0.65, 1.2]:
            await setv(pg, voice='ljspeech', voiceRate=1, termGap=g); await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(300); await pg.click('#listenGo')
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=60000); s = await pg.evaluate("window.__lastSchedule"); gp = gaps(s)
            check(f'clips: pause {g}s -> silence between numbers and before "equals" is {g}s', len(s) >= 3 and all(abs(x - g) < 0.02 for x in gp), str(gp)); await pg.click('#exitDrill')
        # voice speed: clips get longer / shorter, the pitch is kept (never a changed playback rate), 100% is the recording itself
        await setv(pg, voice='ljspeech', voiceRate=1, termGap=0.3); await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(400)
        base = await tryit(pg); d1 = durs(base['s']); sprite = await pg.evaluate("App.Speaker.sprite.ljspeech.duration")
        check('Try it says "three, plus four, minus two, equals" (4 parts) with the chosen pause', len(base['s']) == 4 and all(abs(x - 0.3) < 0.02 for x in gaps(base['s'])), str(base['s']))
        check('100%: the recording is played as it is (slices of the original sprite, rate 1)', all(x['rate'] == 1 and not x['whole'] for x in base['src']) and abs(base['src'][0]['buflen'] - sprite) < 0.01, str(base['src'][:1]))
        for r, lab in [(0.7, -3), (1.5, 8)]:
            await step(pg, 'voiceRate', 1 if lab > 0 else -1, abs(lab)); await step(pg, 'voiceRate', 1 if lab > 0 else -1, 0)
            t = await tryit(pg); d = durs(t['s']); ratio = [round(x / y, 3) for x, y in zip(d, d1)]
            check(f'{int(r*100)}%: every part lasts 1/{r} as long, pause unchanged, playback rate stays 1 (pitch kept)', (await sett(pg))[0] == r and all(abs(q - 1 / r) < 0.06 for q in ratio) and all(abs(x - 0.3) < 0.02 for x in gaps(t['s'])) and all(x['rate'] == 1 and x['whole'] for x in t['src']), f'{ratio} {gaps(t["s"])}')
        await pg.click('#exitDrill')
        # a recorded family voice: same pause, same stretch
        await pg.evaluate(SEEDREC); await setv(pg, voice='rec:p1', profiles=[{'id': 'p1', 'name': 'Mom'}], voiceRate=1, termGap=0.4); await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(500)
        r1 = await tryit(pg); await step(pg, 'voiceRate', -1, 3); r2 = await tryit(pg); log = '\n'.join(await pg.evaluate("window.__diag.lines"))
        check('recorded voice: pause 0.40s between numbers and before its own "equals"', 'equals: own recording' in log and all(abs(x - 0.4) < 0.02 for x in gaps(r1['s']) + gaps(r2['s'])), f'{gaps(r1["s"])} {gaps(r2["s"])}')
        check('recorded voice: 70% makes each word 1/0.7 as long at playback rate 1', all(abs(x['len'] - 0.4) < 0.01 and x['rate'] == 1 for x in r1['src']) and all(abs(x['len'] - 0.4 / 0.7) < 0.02 and x['rate'] == 1 for x in r2['src']), str([round(x['len'], 3) for x in r2['src']][:4]))
        await pg.click('#exitDrill')
        # the device voice: speech rate and the pause after each utterance
        await setv(pg, voice='device', voiceRate=1.3, termGap=0.8); await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(400); dvc = await tryit(pg)
        check('device voice: rate 1.3 (pitch 1), "three" / "plus four" / "minus two" / "equals", 0.80s after each', [x[0] for x in dvc['said']] == ['three', 'plus four', 'minus two', 'equals'] and all(abs(x[1] - 1.3) < 1e-6 and x[2] == 1 for x in dvc['said']) and all(abs(x - 0.8) < 0.08 for x in gaps(dvc['s'])), f'{dvc["said"]} {gaps(dvc["s"])}')
        await pg.click('#exitDrill')

        # 5) the gear during a set: no gate, pauses, Done starts the same problem again from its first number
        await setv(pg, voice='ljspeech', voiceRate=1, termGap=1.2); await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(300)
        check('gear disc is on the Listen screen (wooden disc, 64px+)', await pg.is_visible('#speedGear') and (await (await pg.query_selector('#speedGear')).bounding_box())['width'] >= 64)
        await pg.click('#listenGo'); await pg.wait_for_timeout(1300)
        n0 = await pg.evaluate("window.__diag.lines.filter(l=>l.includes('dictate start')).length"); i0 = await pg.evaluate("document.querySelectorAll('#strip .tp-b.cur').length")
        await pg.click('#speedGear'); await pg.wait_for_timeout(300)
        stt = await pg.evaluate("[document.querySelector('#speedPop').hidden, document.querySelector('#gate').classList.contains('active'), document.querySelector('#listenMsg').textContent, App.Speaker.playing.length, !document.querySelector('#spDone').hidden, document.querySelector('#speedPop #listenGo')===null]")
        check('gear: panel opens straight away (no grown-ups gate), the reading stops, Done instead of Start', stt == [False, False, 'Paused', 0, True, True], str(stt))
        await pg.screenshot(path=f'{OUT}/speed_gear.png')
        await step(pg, 'termGap', -1, 23); await pg.wait_for_timeout(1500)
        check('gear: nothing is read while the panel is open', await pg.evaluate("window.__diag.lines.filter(l=>l.includes('dictate start')).length") == n0 and await pg.text_content('#listenMsg') == 'Paused')
        await pg.evaluate("window.__lastSchedule=null"); await pg.click('#spDone'); await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
        s = await pg.evaluate("window.__lastSchedule"); n1 = await pg.evaluate("window.__diag.lines.filter(l=>l.includes('dictate start')).length")
        check('gear: Done replays the same problem from the start at the new pause (0.05s)', n1 == n0 + 1 and s and s[0][0] == 0 and all(abs(x - 0.05) < 0.02 for x in gaps(s)) and not await pg.is_visible('#speedPop') and await pg.evaluate("document.querySelectorAll('#strip .tp-b.cur').length") == i0, f'{gaps(s) if s else s}')
        await pg.click('#speedGear'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); check('gear: Escape closes it too', not await pg.is_visible('#speedPop'))
        await pg.click('#exitDrill'); await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(400)
        check('Look mode: no gear, no panel', not await pg.is_visible('#speedGear') and not await pg.is_visible('#speedPop')); await pg.click('#exitDrill')

        # 6) Flash: two controls in seconds; the numbers stay and the blanks last as chosen
        await setv(pg, flashSec=1, flashGap=0.2); await pg.evaluate("App.startMode('flash')"); await pg.wait_for_timeout(500); v = await vals(pg)
        check('Flash: panel with "How long each number shows" and "Pause between numbers", in seconds', await pg.is_visible('#speedPop') and len(v) == 2 and all(x.endswith('s') for x in v) and v[1] == '0.20s' and await pg.locator('#speedPop #flashGo').count() == 1, str(v))
        await pg.evaluate("(()=>{ for (const [k,x] of [['flashSec',0.5],['flashGap',0.4]]){ const e=document.querySelector('#sp_'+k); e.value=x; e.dispatchEvent(new Event('input',{bubbles:true})); } })()")
        check('Flash: set to 0.5s and 0.40s', await vals(pg) == ['0.5s', '0.40s'] and (await sett(pg))[2:] == [0.5, 0.4], str(await vals(pg)))
        await pg.click('#spTry'); await pg.wait_for_timeout(250); pv = await pg.text_content('#spPreview'); check('Flash: Try it shows the sample numbers in the panel', pv.strip() == '3', pv); await pg.wait_for_timeout(2900)
        await pg.screenshot(path=f'{OUT}/speed_flash.png')
        await pg.evaluate("(()=>{ window.__fl=[]; const el=document.querySelector('#flashNum'); new MutationObserver(()=>window.__fl.push([performance.now()/1000, el.textContent.trim()!=='' && el.classList.contains('pop')])).observe(el,{childList:true,characterData:true,subtree:true,attributes:true}); })()")
        await pg.click('#flashGo'); await pg.wait_for_function("/What did you get/.test(document.querySelector('#flashMsg').textContent)", timeout=30000)
        fl = await pg.evaluate("window.__fl"); on = []; off = []; last = None
        for t, vis in fl:
            if last is not None and vis != last[1]: (on if last[1] else off).append(round(t - last[0], 2))
            if last is None or vis != last[1]: last = (t, vis)
        check('Flash: each number stays 0.5s, each blank lasts 0.40s', len(on) >= 2 and all(abs(x - 0.5) < 0.08 for x in on) and len(off) >= 2 and all(abs(x - 0.4) < 0.08 for x in off[1:]), f'shown {on} blank {off}')
        await pg.click('#speedGear'); await pg.wait_for_timeout(200); check('Flash: the gear opens the same panel with Done', await pg.is_visible('#speedPop') and await pg.is_visible('#spDone') and len(await vals(pg)) == 2); await pg.click('#spDone'); await pg.wait_for_timeout(300); await pg.click('#exitDrill')
        await gate(pg); gu = await pg.evaluate("[document.querySelector('#sFlashV').textContent, document.querySelector('#sFlashGapV').textContent]"); check('Flash: Grown-ups shows the same two values', gu == ['0.5s', '0.40s'], str(gu)); await pg.click('#parentDone')

        # 7) settings from before v4.2: start-to-start seconds become a pause on the new scale, speed goes to a 10% step
        for old, want in [({'gap': 2}, 0.65), ({'gap': 1.5}, 0.6), ({'gap': 6}, 1.2), ({'gap': 0.5}, 0.05)]:
            await pg.evaluate("(old)=>{ const id=Store.addChild(); Store.switchTo(id); localStorage.setItem('abacus.settings', JSON.stringify(Object.assign({settingsVersion:5, voiceRate:1.2}, old))); }", old); await pg.reload(); await pg.wait_for_timeout(400)
            st = await sett(pg); check(f'old setting {old} -> pause {want}s, speed 120%', st[:2] == [1.2, want], str(st))
        check('no page errors', not errs, str(errs)); await ctx.close()

        # 8) nothing clipped at the three sizes, Listen and Flash
        for (w, h) in [(1180, 820), (820, 1180), (1366, 1024)]:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page(); await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read()); await pg.goto(URL); await pg.wait_for_timeout(500)
            for m in ['listen', 'flash']:
                await pg.evaluate(f"App.startMode('{m}')"); await pg.wait_for_timeout(600)
                r = await pg.evaluate("(()=>{ const top=document.querySelector('#speedPop').getBoundingClientRect().top; const bad=[...document.querySelectorAll('#speedPop .sp-card, #speedPop button, #speedPop input, #speedPop .sp-val, #speedPop .sp-label, #speedPop .sp-end, #speedPop .sp-title, #speedPop .sp-sub, #exitDrill, #speedGear')].filter(e=>e.offsetParent).filter(e=>{ const r=e.getBoundingClientRect(); return r.width<=0 || r.left<0 || r.right>innerWidth || r.bottom>innerHeight || (e.closest('#speedPop') && r.top<top) || e.scrollWidth>e.clientWidth+1; }).map(e=>e.id||e.className); const g=document.querySelector('#speedGear').getBoundingClientRect(), x=document.querySelector('#exitDrill').getBoundingClientRect(); return [bad, g.left>=x.right, document.elementFromPoint(g.left+g.width/2,g.top+g.height/2).closest('#speedGear')!==null, document.elementFromPoint(x.left+x.width/2,x.top+x.height/2).closest('#exitDrill')!==null]; })()")
                check(f'{w}x{h} {m}: panel, controls, chips and Start all inside the screen; X and gear free', r == [[], True, True, True], str(r))
                await pg.screenshot(path=f'{OUT}/speed_{m}_{w}x{h}.png'); await pg.click('#exitDrill'); await pg.wait_for_timeout(200)
            await ctx.close()
        print('errors:', errs); await b.close()
    if not ok: print('FAIL p20_speed')
asyncio.run(main())
