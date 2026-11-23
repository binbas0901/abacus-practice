import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
HOOK = """(()=>{ window.__bixPlays=[]; window.__clPlays=[]; const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(w,off,dur){ try{
    const bv=window.Fun&&Fun.BixVoice; const tag=bv&&bv.tag();
    if (bv && this.buffer && this.buffer===bv.buf[tag]){ const id=Object.entries(bv.map[tag]||{}).find(([k,v])=>Math.abs(v[0]-off)<0.01); window.__bixPlays.push({id:id&&id[0], t:performance.now(), screen:document.querySelector('.screen.active').id, msg:(document.querySelector('#listenMsg')||{}).textContent}); }
    const cv=window.Classroom&&Classroom.Voice;
    if (cv && this.buffer){ for (const pk in cv.buf){ if (this.buffer===cv.buf[pk]){ const m=cv.map[pk]||{}; const e=Object.entries(m).find(([k,v])=>Math.abs(v[0]-off)<0.01); window.__clPlays.push({src: pk.indexOf('juni')===0?'juni':'bixi', id:e&&e[0], t:performance.now(), screen:document.querySelector('.screen.active').id}); break; } } }
  }catch(e){} return o.apply(this,arguments); }; })()"""
async def plays(pg): return await pg.evaluate("window.__bixPlays.splice(0)")
async def clplays(pg): return await pg.evaluate("window.__clPlays.splice(0)")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        errs=[]
        # 1. first-time setup (now Juni-led): Juni welcomes on the first tap, then asks the name; after the name,
        #    Bixi (the classmate) rolls in and greets. Juni presents the setup and the start; home greeting at the end.
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(2500)
        await pg.mouse.click(60, 60)   # a first tap on an empty spot, not a button
        try: await pg.wait_for_selector('#juniSetup .toy-moon.talking', timeout=12000); talking=1   # her mouth moves while she speaks
        except Exception: talking=0
        await pg.screenshot(path='/tmp/bx_setup_talk.png')
        await pg.wait_for_timeout(8000); cl=await clplays(pg)
        jids=[x['id'] for x in cl if x['src']=='juni']
        check('first launch: Juni welcomes, then asks for the name (mouth moving)', jids[:3]==['j_intro_hello','j_intro_welcome','j_intro_name'] and talking>=1, [(x['src'],x['id']) for x in cl])
        await pg.fill('#suNameIn','Mia'); await pg.click('#suNameGo')
        await pg.wait_for_selector('#bixiSetupBubble.on', timeout=15000); await pg.wait_for_timeout(1200); cl=await clplays(pg)
        pairs=[(x['src'],x['id']) for x in cl]
        check('after the name: Juni "Lovely to meet you", then Bixi rolls in and greets', ('juni','j_intro_meet') in pairs and ('bixi','b_intro_hi') in pairs, pairs)
        await pg.wait_for_selector('#suWin.on', timeout=20000); await pg.click('#suWinHost .abx-bead[data-kind="e"][data-k="0"] .abx-lens')   # quick win: make 1
        await pg.wait_for_selector('#suAbacus.on', timeout=20000); await pg.click('[data-abacus=yes]')
        await pg.wait_for_selector('#suLevel.on'); await pg.click('[data-lv=pick]')
        await pg.wait_for_selector('#suPick.on'); await pg.click('.su-skill[data-id=bf_add_a]')
        await pg.wait_for_selector('#suDone.on'); await pg.wait_for_timeout(1500)
        await pg.click('#suStart'); await pg.wait_for_timeout(2500)
        cl=await clplays(pg); bx=[x['id'] for x in await plays(pg)]
        pairs=[(x['src'],x['id']) for x in cl]
        check('setup lines + home greeting', ('juni','j_intro_pick') in pairs and ('juni','j_intro_begin') in pairs and any(s=='juni' and i.startswith('j_hello_') for (s,i) in pairs), [pairs, bx])
        await ctx.close()
        # 2. existing device: greeting on first tap on an empty spot (not on a button)
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(2500)
        check('existing device: no sound before any tap', len(await plays(pg))==0)
        # tap an empty spot (the top margin), not a button -> the two-speaker greeting: Juni (teacher) first, then Bixi.
        await pg.evaluate("""window.__cl=[]; const op=Classroom.Voice.play.bind(Classroom.Voice);
          Classroom.Voice.play=function(c,id,f){ (Array.isArray(id)?id:[id]).forEach(x=>{ if(x) window.__cl.push(c+':'+x); }); return op(c,id,f); };""")
        await pg.mouse.click(600, 12); await pg.wait_for_timeout(6500); cl=await pg.evaluate("window.__cl.slice(0)"); await plays(pg)
        check('first tap on an empty spot -> Juni greets alone (j_hello_*), no Bixi countdown', bool(cl) and cl[0].startswith('juni:j_hello_') and not any(x.startswith('bixi:b_home_') for x in cl[1:]), cl)
        await pg.click('#bixHome .bix'); await pg.wait_for_timeout(1000); cp=[x for x in await clplays(pg) if x['src']=='bixi']; await plays(pg)
        check('tapping Bix -> his new (Gigi) voice out loud, not the old one', len(cp)>=1 and (cp[0]['id'] or '').startswith('b_'), cp)
        # 3. listening drill: Bix silent the whole time numbers are read and answered
        await pg.evaluate("App.startMode('listen')"); await pg.click('#listenGo')
        for i in range(3):
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==1 else 0)): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1200)
        pl=await plays(pg)
        check('Listen drill: Bix never talks (numbers stay clear)', len(pl)==0, [(x['id'],x['msg']) for x in pl])
        await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # 4. look drill: Juni gives the intro (she leads now); Bixi only reacts
        await pg.evaluate("window.__cl=[]"); await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(800)
        for i in range(4):
            d=await pg.evaluate("window.__drill()")
            for ch in str(d['answer']+(1 if i==2 else 0)): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1100)
        cl=await pg.evaluate("window.__cl.slice(0)")
        check('Look drill: Juni gives the intro (j_start_look)', any(x.startswith('juni:j_start_look') for x in cl), cl)
        await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # 5. grown-ups: turn Bix off
        await pg.click('#grownups'); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(500)
        await pg.click('#sBixTest'); await pg.wait_for_timeout(800); pl=await plays(pg); check('Grown-ups test button plays Bix', len(pl)==1)
        await pg.click('#sBixTalks'); await pg.click('#parentDone'); await pg.wait_for_timeout(400)
        await pg.click('#bixHome .bix'); await pg.wait_for_timeout(800)
        check('Bix switched off -> silent (bubble still shows)', len(await plays(pg))==0 and await pg.locator('#bixHomeCard.on').count()==1)
        print('errors:', errs); await b.close()
asyncio.run(main())
