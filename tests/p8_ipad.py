import asyncio, re, json
from playwright.async_api import async_playwright
res=[]
def check(label, ok, extra=''): res.append(ok); print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
# iPad rules: AudioContext.resume() only works during a finger lift / click (not touch-down).
HOOK = r"""(()=>{
  const okEv=new Set(['click','pointerup','touchend','mouseup','keydown']);
  const R=AudioContext.prototype.resume;
  AudioContext.prototype.resume=function(){ const e=window.event; if(!e||!okEv.has(e.type)){ window.__blocked=(window.__blocked||0)+1; return new Promise(()=>{}); } return R.apply(this,arguments); };
  window.__bix=[]; const S=AudioBufferSourceNode.prototype.start, P=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(w,off,dur){ try{ const bv=window.Fun&&Fun.BixVoice, tag=bv&&bv.tag();
    if(bv&&this.buffer&&this.buffer===bv.buf[tag]){ const id=(Object.entries(bv.map[tag]).find(([k,v])=>Math.abs(v[0]-off)<0.01)||[])[0];
      const bubbles=[...document.querySelectorAll('.bubble.on')].map(b=>b.textContent);
      const rec={id, t0:this.context.currentTime, t1:this.context.currentTime+dur, state:this.context.state, bubbles, screen:document.querySelector('.screen.active').id}; this.__rec=rec; window.__bix.push(rec); } }catch(e){}
    return S.apply(this,arguments); };
  AudioBufferSourceNode.prototype.stop=function(){ if(this.__rec) this.__rec.t1=Math.min(this.__rec.t1,this.context.currentTime); return P.apply(this,arguments); };
})()"""
async def take(pg): return await pg.evaluate("window.__bix.splice(0)")
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
        ctx,pg = await newpage(); await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(800)
        LINES = await pg.evaluate("window.BIX_LINES")
        await pg.touchscreen.tap(600, 760); await pg.wait_for_timeout(14000); r=await take(pg); allrecs+=r
        ids=[x['id'] for x in r]
        check('new device: first tap -> "Hi, I\'m Bix" then "What\'s your name?"', ids[:2]==['intro_hi','intro_name'], ids)
        check('  ...the two lines do not cut each other off (slow tablet)', not overlaps(r) and all(x['t1']-x['t0']>1 for x in r), [(x['id'],round(x['t1']-x['t0'],1)) for x in r])
        check('  ...sound really on when he talks', all(x['state']=='running' for x in r))
        await pg.fill('#suNameIn','Mia'); await pg.tap('#suNameGo'); await pg.wait_for_timeout(4500)
        await pg.tap('[data-lv=pick]'); await pg.wait_for_timeout(3500); await pg.tap('.su-skill[data-id=bf_add_a]'); await pg.wait_for_timeout(800)
        await pg.tap('#suStart'); await pg.wait_for_timeout(5000); r=await take(pg); allrecs+=r; ids=[x['id'] for x in r]
        check('setup talk-through + home hello, no overlaps', 'intro_meet' in ids and 'intro_done' in ids and not overlaps(r), ids)
        await ctx.close()
        # 2. returning child
        ctx,pg = await newpage(True); await pg.goto('http://localhost:8765/index.html')
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(1500)
        check('returning: silent until she taps', len(await take(pg))==0)
        await pg.touchscreen.tap(600, 790); await pg.wait_for_timeout(5500); r=await take(pg); allrecs+=r
        check('returning: first tap anywhere -> Bix says hello', len(r)==1 and r[0]['id'].startswith('hello_'), [x['id'] for x in r])
        for i in range(5): await pg.tap('#bixHome .bix'); await pg.wait_for_timeout(250)
        await pg.wait_for_timeout(5000); r=await take(pg); allrecs+=r
        check('tapping Bix 5 times fast -> each new joke replaces the last, never two at once', len(r)>=1 and not overlaps(r), [x['id'] for x in r])
        await pg.tap('#bixHome .bix'); await pg.wait_for_timeout(500); r=await take(pg); allrecs+=r
        check('single tap on Bix -> joke', len(r)==1 and r[0]['id'].startswith('tap_'), [x['id'] for x in r])
        # listen drill silent
        await pg.wait_for_timeout(4000); await take(pg)
        await pg.tap('.tile[data-mode=listen]'); await pg.wait_for_timeout(600); await pg.tap('#listenGo')
        for i in range(3):
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==1 else 0)): await pg.tap(f'#pad [data-k="{ch}"]')
            await pg.tap('#pad [data-k=go]'); await pg.wait_for_timeout(1200)
        r=await take(pg); check('Listen drill: Bix completely quiet', len(r)==0, [x['id'] for x in r])
        await pg.tap('#exitDrill'); await pg.wait_for_timeout(500); await take(pg)
        await pg.tap('.tile[data-mode=visual]'); await pg.wait_for_timeout(900)
        for i in range(10):
            d=await pg.evaluate("window.__drill()")
            if not d: break
            for ch in str(d['answer']+(1 if i in (2,5) else 0)): await pg.tap(f'#pad [data-k="{ch}"]')
            await pg.tap('#pad [data-k=go]'); await pg.wait_for_timeout(1300)
        await pg.wait_for_timeout(2500); r=await take(pg); allrecs+=r
        check('Look drill: Bix starts, cheers, no overlaps', r and r[0]['id']=='drill_look' and not overlaps(r), [x['id'] for x in r])
        await ctx.close()
        # 3. text on screen matches what he says
        bad=[]
        for x in allrecs:
            if x['id'] in ('gift','gift_gold','today_done'): continue   # spoken over the sticker card, which has its own text
            want=re.sub(r'[^a-z0-9 ]','',(LINES.get(x['id']) or '').lower().replace('’',"'").replace("'",'')).split()
            got=[re.sub(r'[^a-z0-9 ]','',bb.lower().replace('’',"'").replace("'",'')).split() for bb in x['bubbles']]
            if not any(len(set(want)&set(g))>=0.6*len(set(want)) for g in got): bad.append((x['id'], LINES.get(x['id']), x['bubbles']))
        check('bubble text matches the spoken line (%d lines checked)'%len(allrecs), not bad, bad)
        print('errors:', errs); print('RESULT', sum(res),'/',len(res)); await b.close()
asyncio.run(main())
