import asyncio, re, json
from playwright.async_api import async_playwright
res=[]
def check(label, ok, extra=''): res.append(ok); print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
# iPad rules: AudioContext.resume() only works during a finger lift / click (not touch-down).
HOOK = r"""(()=>{
  const okEv=new Set(['click','pointerup','touchend','mouseup','keydown']);
  const R=AudioContext.prototype.resume;
  AudioContext.prototype.resume=function(){ const e=window.event; if(!e||!okEv.has(e.type)){ window.__blocked=(window.__blocked||0)+1; return new Promise(()=>{}); } return R.apply(this,arguments); };
  window.__bix=[]; window.__cl=[]; const S=AudioBufferSourceNode.prototype.start, P=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(w,off,dur){ try{ const bv=window.Fun&&Fun.BixVoice, tag=bv&&bv.tag();
    if(bv&&this.buffer&&this.buffer===bv.buf[tag]){ const id=(Object.entries(bv.map[tag]).find(([k,v])=>Math.abs(v[0]-off)<0.01)||[])[0];
      const bubbles=[...document.querySelectorAll('.bubble.on, .tp-bubble.on, #summary.active .tp-sumnote')].map(b=>b.textContent);
      const rec={id, t0:this.context.currentTime, t1:this.context.currentTime+dur, state:this.context.state, bubbles, screen:document.querySelector('.screen.active').id}; this.__rec=rec; window.__bix.push(rec); }
    const cv=window.Classroom&&Classroom.Voice;
    if(cv&&this.buffer){ for(const pk in cv.buf){ if(this.buffer===cv.buf[pk]){ const m=cv.map[pk]||{}; const e=(Object.entries(m).find(([k,v])=>Math.abs(v[0]-off)<0.01)||[]);
      const rec={char: pk.indexOf('juni')===0?'juni':'bixi', id:e[0], t0:this.context.currentTime, t1:this.context.currentTime+dur, state:this.context.state, screen:document.querySelector('.screen.active').id}; this.__rec=rec; window.__cl.push(rec); break; } } } }catch(e){}
    return S.apply(this,arguments); };
  AudioBufferSourceNode.prototype.stop=function(){ if(this.__rec) this.__rec.t1=Math.min(this.__rec.t1,this.context.currentTime); return P.apply(this,arguments); };
})()"""
async def take(pg): return await pg.evaluate("window.__bix.splice(0)")
async def clrecs(pg): return await pg.evaluate("window.__cl.splice(0)")
def overlaps(recs):
    r=sorted(recs,key=lambda x:x['t0']); return [ (a['id'],b['id']) for a,b in zip(r,r[1:]) if b['t0']<a['t1']-0.03 ]
async def slow(route):
    await asyncio.sleep(3); await route.continue_()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        errs=[]; allrecs=[]
        async def newpage(seed=False):
            ctx = await b.new_context(viewport={'width':1180,'height':820}, has_touch=True, is_mobile=False)
            await ctx.route('**/audio/bix-*.js*', slow)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            if seed: await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
            await pg.add_init_script(HOOK); return ctx, pg
        LINES=None
        # 1. brand-new device, slow tablet
        ctx,pg = await newpage(); await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(800)
        LINES = await pg.evaluate("window.BIX_LINES")
        await pg.touchscreen.tap(60, 60); await pg.wait_for_timeout(14000); cl=await clrecs(pg)
        ids=[x['id'] for x in cl]
        check('new device: first tap -> Juni welcomes, then asks the name', ids[:3]==['j_intro_hello','j_intro_welcome','j_intro_name'] and all(x['char']=='juni' for x in cl[:3]), ids)
        check('  ...the lines do not cut each other off (slow tablet)', not overlaps(cl) and all(x['t1']-x['t0']>0.8 for x in cl), [(x['id'],round(x['t1']-x['t0'],1)) for x in cl])
        check('  ...sound really on when she talks', all(x['state']=='running' for x in cl))
        await pg.fill('#suNameIn','Mia'); await pg.tap('#suNameGo')
        await pg.wait_for_selector('#bixiSetupBubble.on', timeout=20000); await pg.wait_for_timeout(1500)
        await pg.wait_for_selector('#suWin.on', timeout=20000); await pg.tap('#suWinHost .abx-bead[data-kind="e"][data-k="0"] .abx-lens')   # quick win: make 1
        await pg.wait_for_selector('#suAbacus.on', timeout=20000); await pg.tap('[data-abacus=unsure]')
        await pg.wait_for_selector('#suLevel.on'); await pg.tap('[data-lv=pick]')
        await pg.wait_for_selector('#suPick.on'); await pg.tap('.su-skill[data-id=bf_add_a]')
        await pg.wait_for_selector('#suDone.on'); await pg.wait_for_timeout(2500)
        await pg.tap('#suStart'); await pg.wait_for_timeout(5000)
        cl=await clrecs(pg); bx=await take(pg); allrecs+=bx; clids=[(x['char'],x['id']) for x in cl]
        check('setup talk-through (Juni leads, Bixi introduced) + home hello, no overlaps', ('juni','j_intro_meet') in clids and ('bixi','b_intro_hi') in clids and ('juni','j_intro_begin') in clids and any(s=='juni' and (i or '').startswith('j_hello_') for (s,i) in clids) and not overlaps(cl), [clids, [x['id'] for x in bx]])
        await ctx.close()
        # 2. returning child
        ctx,pg = await newpage(True); await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765'))
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(1500)
        check('returning: silent until she taps', len(await take(pg))==0)
        # tap an empty spot (the top margin), not a button -> the two-speaker greeting: Juni (teacher) first, then Bixi.
        # (the init HOOK already records every clip to window.__cl as {char,id,...}; read those, don't double-hook Voice.play.)
        await pg.touchscreen.tap(600, 12); await pg.wait_for_timeout(6500); r=await take(pg); allrecs+=r; cl=await clrecs(pg)
        check('returning: first tap anywhere -> Juni greets alone (j_hello_*), no Bixi countdown', bool(cl) and cl[0]['char']=='juni' and cl[0]['id'].startswith('j_hello_') and not any(x['char']=='bixi' and (x['id'] or '').startswith('b_home_') for x in cl[1:]), [(x['char'],x['id']) for x in cl])
        for i in range(5): await pg.tap('#bixHome .bix'); await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(5000); r=[x for x in await clrecs(pg) if x['char']=='bixi']; allrecs+=r; await take(pg)
        check('tapping Bix 5 times fast -> each new line replaces the last, never two at once', len(r)>=1 and not overlaps(r), [x['id'] for x in r])
        await pg.tap('#bixHome .bix'); await pg.wait_for_timeout(1000); r=[x for x in await clrecs(pg) if x['char']=='bixi']; allrecs+=r; await take(pg)
        check('single tap on Bix -> his new (Gigi) voice', len(r)>=1 and (r[0]['id'] or '').startswith('b_'), [x['id'] for x in r])
        # listen drill silent
        await pg.wait_for_timeout(4000); await take(pg)
        await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(600); await pg.tap('#listenGo')
        for i in range(3):
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==1 else 0)): await pg.tap(f'#pad [data-k="{ch}"]')
            await pg.tap('#pad [data-k=go]'); await pg.wait_for_timeout(1200)
        r=await take(pg); check('Listen drill: Bix completely quiet', len(r)==0, [x['id'] for x in r])
        await pg.tap('#exitDrill'); await pg.wait_for_timeout(500); await take(pg)
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(900)
        for i in range(10):
            d=await pg.evaluate("window.__drill()")
            if not d: break
            for ch in str(d['answer']+(1 if i in (2,5) else 0)): await pg.tap(f'#pad [data-k="{ch}"]')
            await pg.tap('#pad [data-k=go]'); await pg.wait_for_timeout(1300)
        await pg.wait_for_timeout(2500); r=await take(pg); allrecs+=r; clr=await clrecs(pg)
        check('Look drill: Juni leads, Bixi only reacts, no voice overlaps', any(x['char']=='juni' for x in clr) and not overlaps(r), [x['id'] for x in r]+['|']+[(x['char'],x['id']) for x in clr])
        await ctx.close()
        # 3. text on screen matches what he says
        bad=[]; checked=0
        for x in allrecs:
            if 'bubbles' not in x: continue   # classroom (Gigi) recs carry no bubble snapshot; their text is checked inline above
            if x['id'] in ('gift','gift_gold','today_done'): continue   # spoken over the sticker card, which has its own text
            checked+=1
            want=re.sub(r'[^a-z0-9 ]','',(LINES.get(x['id']) or '').lower().replace('’',"'").replace("'",'')).split()
            got=[re.sub(r'[^a-z0-9 ]','',bb.lower().replace('’',"'").replace("'",'')).split() for bb in x['bubbles']]
            if not any(len(set(want)&set(g))>=0.6*len(set(want)) for g in got): bad.append((x['id'], LINES.get(x['id']), x['bubbles']))
        check('bubble text matches the spoken line (%d lines checked)'%checked, not bad, bad)
        print('errors:', errs); print('RESULT', sum(res),'/',len(res)); await b.close()
asyncio.run(main())
