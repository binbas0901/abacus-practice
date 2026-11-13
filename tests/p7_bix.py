import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
HOOK = """(()=>{ window.__bixPlays=[]; const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(w,off,dur){ try{ const bv=window.Fun&&Fun.BixVoice; const tag=bv&&bv.tag(); if (bv && this.buffer && this.buffer===bv.buf[tag]){ const id=Object.entries(bv.map[tag]).find(([k,v])=>Math.abs(v[0]-off)<0.01); window.__bixPlays.push({id:id&&id[0], t:performance.now(), screen:document.querySelector('.screen.active').id, msg:(document.querySelector('#listenMsg')||{}).textContent}); } }catch(e){} return o.apply(this,arguments); }; })()"""
async def plays(pg): return await pg.evaluate("window.__bixPlays.splice(0)")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        errs=[]
        # 1. first-time setup: Bix introduces himself on first tap, then asks the name
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(2500)
        await pg.mouse.click(600, 700); await pg.wait_for_timeout(700)
        talking = await pg.locator('#bixSetup .bix.talking').count()
        await pg.screenshot(path='/tmp/bx_setup_talk.png')
        await pg.wait_for_timeout(7000); pl=[x['id'] for x in await plays(pg)]
        check('first launch: Bix says hello, then asks for the name (mouth moving)', pl[:2]==['intro_hi','intro_name'] and talking==1, pl)
        await pg.fill('#suNameIn','Mia'); await pg.click('#suNameGo'); await pg.wait_for_timeout(1500); pl=[x['id'] for x in await plays(pg)]
        check('after the name: "Nice to meet you"', pl==['intro_meet'], pl)
        await pg.click('[data-lv=pick]'); await pg.wait_for_timeout(500); await pg.click('.su-skill[data-id=bf_add_a]'); await pg.wait_for_timeout(800)
        await pg.click('#suStart'); await pg.wait_for_timeout(1200); pl=[x['id'] for x in await plays(pg)]
        check('setup lines + home greeting', 'intro_pick' in pl and 'intro_done' in pl and any(x and x.startswith('hello_') for x in pl), pl)
        await ctx.close()
        # 2. existing device: greeting on first tap on an empty spot (not on a button)
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(2500)
        check('existing device: no sound before any tap', len(await plays(pg))==0)
        await pg.mouse.click(600, 790); await pg.wait_for_timeout(1200); pl=await plays(pg)
        check('first tap on an empty spot -> greeting', len(pl)==1 and pl[0]['id'].startswith('hello_'), [x['id'] for x in pl])
        await pg.click('#bixHome .bix'); await pg.wait_for_timeout(800); pl=[x['id'] for x in await plays(pg)]
        check('tapping Bix -> a joke/fact out loud', len(pl)==1 and pl[0].startswith('tap_'), pl)
        # 3. listening drill: Bix silent the whole time numbers are read and answered
        await pg.click('.tile[data-mode=listen]'); await pg.click('#listenGo')
        for i in range(3):
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==1 else 0)): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1200)
        pl=await plays(pg)
        check('Listen drill: Bix never talks (numbers stay clear)', len(pl)==0, [(x['id'],x['msg']) for x in pl])
        await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # 4. look drill with family feedback off: Bix starts and cheers
        await pg.click('.tile[data-mode=visual]'); await pg.wait_for_timeout(800)
        for i in range(4):
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==2 else 0)): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1100)
        pl=[x['id'] for x in await plays(pg)]
        check('Look drill: Bix says "You can do it!" (and sometimes cheers)', pl and pl[0]=='drill_look', pl)
        await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # 5. grown-ups: turn Bix off
        await pg.click('#grownups'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(500)
        await pg.click('#sBixTest'); await pg.wait_for_timeout(800); pl=await plays(pg); check('Grown-ups test button plays Bix', len(pl)==1)
        await pg.click('#sBixTalks'); await pg.click('#parentDone'); await pg.wait_for_timeout(400)
        await pg.click('#bixHome .bix'); await pg.wait_for_timeout(800)
        check('Bix switched off -> silent (bubble still shows)', len(await plays(pg))==0 and await pg.locator('#bixHome .bubble.on').count()==1)
        print('errors:', errs); await b.close()
asyncio.run(main())
