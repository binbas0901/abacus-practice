import asyncio, re, json, os
from playwright.async_api import async_playwright
# Day one on a brand-new profile, end to end: lesson -> Bead Builder -> Bead Detective. The first skill has no sums,
# so no drill may ever start for it. Also: lesson demos cannot race, and a skipped lesson does not count.
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
URL='http://localhost:%s/index.html' % os.environ.get('PORT','8765')
SPY="""(()=>{ window.__sets=[];
  const wrap=()=>{ const e=window.SorobanEngine; if (!e || e.__spied) return; e.__spied=true; const g=e.generateSet2;
    e.generateSet2=function(){ const r=g.apply(this, arguments); window.__sets.push(r.map(p=>p.terms.length)); return r; }; };
  const t=setInterval(()=>{ wrap(); if (window.SorobanEngine && window.SorobanEngine.__spied) clearInterval(t); }, 5); })();"""
async def fresh(b, size=(1180,820)):
    ctx = await b.new_context(viewport={'width':size[0],'height':size[1]}); pg = await ctx.new_page(); await pg.add_init_script(SPY)
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(800)
    await pg.wait_for_selector('#suName.on'); await pg.fill('#suNameIn', 'Leo'); await pg.click('#suNameGo'); await pg.wait_for_selector('#suAbacus.on'); await pg.click('[data-abacus=yes]'); await pg.wait_for_selector('#suLevel.on')
    await pg.click('[data-lv=new]'); await pg.wait_for_selector('#suDone.on'); await pg.click('#suStart'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(500)
    return ctx, pg, errs
async def collect_all(pg, first=15000):
    titles=[]; wait=first
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=wait)
        except Exception: return titles
        titles.append(await pg.text_content('#rvTitle')); await pg.click('#rvPack', force=True); await pg.wait_for_timeout(500); await pg.click('#rvOk'); await pg.wait_for_timeout(400); wait=3500
async def steps_done(pg): return await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className.includes("done"))')
async def plan(pg): return await pg.evaluate("JSON.parse(window.__legacy('fun')).today.steps.map(s=>s.kind+(s.game?':'+s.game:'')+(s.done?'*':''))")
async def to_turns(pg):
    for _ in range(12):
        if (await pg.evaluate("__lesson().phase")) in ('numbers','guided','demo'): return
        await pg.click('#lessonNext'); await pg.wait_for_timeout(150)
async def do_turns(pg, phase):
    n=0
    while (await pg.evaluate("__lesson().phase"))==phase:
        await pg.evaluate("__lessonSet(__lesson().target)"); n+=1; await pg.wait_for_timeout(1100)
    return n
async def build_round(pg, k):
    for _ in range(k):
        await pg.wait_for_function("document.querySelector('#bdNum') && document.querySelector('#bdNum').textContent && !document.querySelector('#bdAb').classList.contains('ab-ro')")
        v=int(await pg.text_content('#bdNum')); await pg.evaluate(f"__gameAb.poke({v})"); await pg.wait_for_timeout(800)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        ctx,pg,errs = await fresh(b)
        labels=await pg.eval_on_selector_all('#todaySteps .step .sl','els=>els.map(e=>e.textContent)')
        check('day one plan: Learn, then making numbers, then reading them (no Look / Listen on a skill without sums)', await plan(pg)==['lesson','game:build','game:reader'] and labels==['Learn','Bead Builder','Bead Detective'], [await plan(pg), labels])
        # step 1: the lesson, really done
        await pg.click('#todayGo'); await pg.wait_for_selector('#lesson.active'); await to_turns(pg)
        check('lesson "Your turn": no Skip at first (the beads are the way forward)', await pg.eval_on_selector('#lessonNext','e=>getComputedStyle(e).visibility')=='hidden')
        await pg.screenshot(path='/tmp/p15_turn.png')
        n=await do_turns(pg, 'numbers')
        check('lesson: nine numbers made -> Done, all step beads done', n==9 and await pg.text_content('#capKind')=='Done!' and await pg.locator('#lessonSteps .ls-dot.ok').count()==9, [n, await pg.text_content('#capKind')])
        t=await collect_all(pg); check('lesson done -> sticker', len(t)==1, t)
        await pg.click('#lessonNext'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)
        check('step 1 ticked', await steps_done(pg)==[True,False,False], await steps_done(pg))
        bub=await pg.text_content('#bixHome .bubble')
        check('home after step 1: Bix names the button that is there (Next, not Start)', await pg.text_content('#todayGoT')=='Next' and 'Tap Next' in bub and 'Tap Start' not in bub, bub)
        await pg.screenshot(path='/tmp/p15_home1.png')
        # step 2: Bead Builder
        await pg.evaluate("App.gameNumbers=3"); await pg.click('#todayGo'); await pg.wait_for_selector('#game.active')
        check('step 2 is Bead Builder (make the number)', await pg.get_attribute('#game','data-game')=='build')
        await build_round(pg, 3)
        await pg.wait_for_selector('#stickerReveal.active', timeout=8000)
        check('the sticker present comes alone: no result card under it', await pg.locator('#game .gresult').count()==0 and await pg.locator('#game .gscrim').count()==0)
        await pg.screenshot(path='/tmp/p15_present.png')
        t=await collect_all(pg, 3000); await pg.wait_for_selector('#game .gresult', timeout=6000)
        check('...then the result card, with no present on top', len(t)==1 and await pg.locator('#stickerReveal.active').count()==0, t)
        await pg.screenshot(path='/tmp/p15_result.png')
        await pg.click('.gresult [data-a=done]'); await pg.wait_for_timeout(400)
        check('Done after a Today game goes home (the bead ticks, the moon fills)', await pg.locator('#home.active').count()==1 and await steps_done(pg)==[True,True,False], await steps_done(pg))
        # step 3: Bead Detective
        await pg.evaluate("App.gameReads=3"); await pg.click('#todayGo'); await pg.wait_for_selector('#game.active')
        check('step 3 is a different beads activity: Bead Detective (read the number)', await pg.get_attribute('#game','data-game')=='reader' and await pg.locator('#drill.active').count()==0)
        for _ in range(3):
            await pg.wait_for_selector('#rdPad:not(.idle)', timeout=9000)
            v=re.search(r'(\d+)$', await pg.get_attribute('#rdAb .abx','aria-label')).group(1)
            for ch in v: await pg.click(f'#rdPad [data-k="{ch}"]')
            await pg.click('#rdPad [data-k=go]'); await pg.wait_for_timeout(1100)
        t=await collect_all(pg, 8000)
        check('step 3 -> sticker, then the gold "Today is done" sticker', len(t)==2 and any('Today' in x for x in t), t)
        await pg.wait_for_selector('#game .gresult', timeout=6000); await pg.click('.gresult [data-a=done]'); await pg.wait_for_timeout(500)
        check('all three steps done, home says so', await pg.locator('#home.active').count()==1 and await steps_done(pg)==[True,True,True] and await pg.text_content('#todayTitle')=='All done!', await steps_done(pg))
        hist=await pg.evaluate("JSON.parse(window.__legacy('progress')).nodes.beads.hist.length")
        check('the numbers made and read are the skill\'s practice record (6 answers)', hist==6, hist)
        # no arithmetic drill for a skill without sums, however it is asked for
        for m in ('visual','listen','flash'):
            await pg.evaluate(f"void App.startMode('{m}')"); await pg.wait_for_timeout(500)
            ok = await pg.locator('#drill.active').count()==0 and await pg.locator('#game.active').count()==1
            await pg.evaluate("Games.stop(); App.goHome()"); await pg.wait_for_timeout(200)
            check(f"startMode('{m}') on Beads never opens a drill (it opens a beads game)", ok)
        # Practice door on Beads: three blocks that all work, Bix explains
        await pg.click('#doorPractice'); await pg.wait_for_selector('#door.active'); await pg.wait_for_timeout(500)
        labs=await pg.eval_on_selector_all('#door .door-block .door-label','els=>els.map(e=>e.textContent)')
        check('Practice door on Beads offers Learn / Make / Read, and Bix says why', labs==['Learn','Make','Read'] and 'Sums come next' in await pg.text_content('#bixDoor .bubble'), [labs, await pg.text_content('#bixDoor .bubble')])
        await pg.screenshot(path='/tmp/p15_door_beads.png')
        opened=[]
        for sel in ('#doorLook','#doorListen','#doorFlash'):
            await pg.click(sel); await pg.wait_for_timeout(500)
            opened.append('lesson' if await pg.locator('#lesson.active').count() else await pg.get_attribute('#game','data-game') if await pg.locator('#game.active').count() else 'drill' if await pg.locator('#drill.active').count() else '?')
            await pg.click('#exitLesson' if opened[-1]=='lesson' else '#exitGame'); await pg.wait_for_timeout(300)
            if not await pg.locator('#door.active').count(): opened.append('not back at the door')
        check('each block opens what it says and comes back to the door', opened==['lesson','build','reader'], opened)
        sets=await pg.evaluate("window.__sets")
        check('day one: no drill was ever made, so none with empty problems (terms.length === 0)', len(sets)==0 and await pg.evaluate("!!SorobanEngine.__spied"), sets)
        # an old plan (made before the bead games) with Look on Beads still never drills
        await pg.evaluate("(()=>{ const f=JSON.parse(window.__legacy('fun')); f.today.steps=[{kind:'visual',done:false},{kind:'game',game:'build',done:false},{kind:'listen',done:false}]; f.today.celebrated=false; Store.set('fun', f); })()")
        await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(500)
        await pg.click('#todayGo'); await pg.wait_for_timeout(600)
        check('an older plan with "Look" on Beads opens Bead Detective, not blank problems', await pg.locator('#drill.active').count()==0 and await pg.get_attribute('#game','data-game')=='reader')
        check('no page errors (day one)', not errs, errs); await ctx.close()

        # ---- every skill that does drill makes real problems ----
        ctx,pg,errs = await fresh(b)
        bad=await pg.evaluate("Curriculum.NODES.filter(n=>n.drill).map(n=>{ try{ return SorobanEngine.generateSet2(n.drill, 6).some(p=>!p.terms || !p.terms.length) ? n.id : null; }catch(e){ return n.id+': '+e.message; } }).filter(Boolean)")
        check('every skill with a drill makes problems with numbers in them', bad==[], bad)
        # ---- mastery: the bead games are the practice record, so the first skill can be finished ----
        await pg.evaluate("(()=>{ const p=JSON.parse(window.__legacy('progress')); p.nodes.beads={lesson:true,mastered:null,hist:Array.from({length:18},()=>({ok:true,day:'2020-01-01'}))}; Store.set('progress',p); })()")
        await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(400)
        await pg.evaluate("App.gameNumbers=2; void Games.open('build', {from:'home'})"); await pg.wait_for_selector('#game.active')
        await build_round(pg, 2)
        await collect_all(pg, 8000); await pg.wait_for_selector('#game .gresult', timeout=6000)
        cur=await pg.evaluate("JSON.parse(window.__legacy('progress')).current")
        check('20 good answers over two days on Beads -> the next skill opens', cur=='add_direct' and 'New skill' in await pg.text_content('.gresult'), cur)
        check('no page errors (mastery)', not errs, errs); await ctx.close()

        # ---- a skipped lesson does not count ----
        ctx,pg,errs = await fresh(b)
        await pg.evaluate("App.lessonSkipMs=700"); await pg.click('#todayGo'); await pg.wait_for_selector('#lesson.active'); await to_turns(pg)
        vis=await pg.eval_on_selector("#lessonNext","e=>getComputedStyle(e).visibility"); await pg.wait_for_timeout(900)
        box=await pg.eval_on_selector('#lessonNext','e=>{const r=e.getBoundingClientRect(); return [getComputedStyle(e).visibility, Math.round(r.height), e.className]}')
        check('Skip turns up only after a wait, as a small wooden button', vis=='hidden' and box[0]=='visible' and 64<=box[1]<=72 and 'toy-block--wood' in box[2] and 'td-skip' in box[2], [vis, box])
        await pg.screenshot(path='/tmp/p15_skip.png')
        for _ in range(9):
            await pg.wait_for_function("getComputedStyle(document.querySelector('#lessonNext')).visibility==='visible'"); await pg.click('#lessonNext'); await pg.wait_for_timeout(80)
        dots=await pg.eval_on_selector_all('#lessonSteps .ls-dot','els=>els.map(e=>e.className.replace("ls-dot","").trim())')
        check('nine Skips: no step bead is marked done, Bix says to try again later', dots==['skip']*9 and await pg.text_content('#capKind')=='Good try!' and 'again later' in await pg.text_content('#capText'), [dots, await pg.text_content('#capKind')])
        await pg.screenshot(path='/tmp/p15_skipped_end.png')
        await pg.wait_for_timeout(3200)
        check('...no sticker', await pg.locator('#stickerReveal.active').count()==0)
        await pg.click('#lessonNext'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)
        st=await pg.evaluate("(()=>{ const f=JSON.parse(window.__legacy('fun')); return [JSON.parse(window.__legacy('progress')).nodes.beads.lesson, (f.wallet&&f.wallet.beads)||0, Object.keys(f.stickers||{}).length]; })()")
        check('...not learned, no golden bead, no sticker, the Today step stays open', st[0] is False and st[1]==0 and st[2]==0 and await steps_done(pg)==[False,False,False], [st, await steps_done(pg)])
        # two tries that end on another number bring Skip without the wait; doing most steps counts
        await pg.evaluate("App.lessonSkipMs=600000"); await pg.click('#todayGo'); await pg.wait_for_selector('#lesson.active'); await to_turns(pg)
        await pg.evaluate("__lessonSet(8)"); await pg.wait_for_timeout(1700); one=await pg.eval_on_selector('#lessonNext','e=>getComputedStyle(e).visibility')
        await pg.evaluate("__lessonSet(6)"); await pg.wait_for_timeout(1700); two=await pg.eval_on_selector('#lessonNext','e=>getComputedStyle(e).visibility')
        check('Skip also turns up after two tries that ended on another number', one=='hidden' and two=='visible', [one, two])
        await pg.click('#lessonNext'); await pg.wait_for_timeout(100)
        n=await do_turns(pg, 'numbers')
        dots=await pg.eval_on_selector_all('#lessonSteps .ls-dot','els=>els.map(e=>e.className.replace("ls-dot","").trim())')
        check('one skipped, eight done -> learned, with the skipped bead left plain', n==8 and dots==['skip']+['ok']*8 and await pg.text_content('#capKind')=='Done!', [n, dots])
        t=await collect_all(pg); check('...and the sticker comes', len(t)==1, t)
        check('no page errors (skip)', not errs, errs); await ctx.close()

        # ---- small things: keypad length, one red bead to fix, Friend Pop without motion ----
        ctx = await b.new_context(viewport={'width':1180,'height':820}, reduced_motion='reduce'); pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false, hasAbacus:true}))"); await pg.reload(); await pg.wait_for_timeout(600)
        await pg.evaluate("void App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0")
        if await pg.evaluate("__drill().tool")!='keys': await pg.click('#toolSwitch'); await pg.wait_for_timeout(200)
        ans=await pg.evaluate("__drill().answer")
        for _ in range(6): await pg.click('#pad [data-k="9"]')
        typed=(await pg.text_content('#answer')).strip()
        check('practice keypad takes one digit more than the answer has, no more', len(typed)==len(str(ans))+1, [ans, typed])
        for _ in range(6): await pg.click('#pad [data-k="del"]')
        for i in range(10):
            await pg.wait_for_function(f"window.__drill().idx=={i} && document.querySelectorAll('#problemArea .term').length>0")
            v=await pg.evaluate("__drill().answer")+(1 if i==0 else 0)
            for ch in str(v): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1050)
        await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(400)
        check('summary with one to fix: the button says "Fix the red one"', (await pg.text_content('#fixBtn')).strip()=='Fix the red one', await pg.text_content('#fixBtn'))
        await pg.screenshot(path='/tmp/p15_fix_one.png'); await collect_all(pg, 5000); await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
        await pg.evaluate("App.gamePops=3; void Games.open('pop')"); await pg.wait_for_selector('#game.active'); await pg.wait_for_selector('#popField .bub.still')
        async def spots(): return await pg.eval_on_selector_all('#popField .bub','els=>els.map(e=>{const r=e.getBoundingClientRect(); return [e.dataset.v, Math.round(r.x), Math.round(r.y), Math.round(r.width)]})')
        a1=await spots(); await pg.wait_for_timeout(900); a2=await spots()
        inside=await pg.evaluate("(()=>{ const f=document.querySelector('#popField').getBoundingClientRect(); return [...document.querySelectorAll('#popField .bub')].every(e=>{ const r=e.getBoundingClientRect(); return r.left>=f.left && r.right<=f.right && r.top>=f.top && r.bottom<=f.bottom; }); })()")
        apart=all(abs(p[1]-q[1])>=p[3] or abs(p[2]-q[2])>=p[3] for i,p in enumerate(a1) for q in a1[i+1:])
        check('Friend Pop with reduced motion: every friend waits still in a grid (nothing drifts, nothing overlaps)', a1==a2 and len(a1)>=4 and len(set(x[0] for x in a1))==len(a1) and inside and apart, a1)
        await pg.screenshot(path='/tmp/p15_pop_still.png')
        for _ in range(3):
            await pg.wait_for_function("document.querySelector('.pq-a') && document.querySelector('#popField .bub.still')")
            want=await pg.evaluate("+document.querySelector('.pq-f').textContent - +document.querySelector('.pq-a').textContent")
            await pg.locator(f'#popField .bub[data-v="{want}"]').first.dispatch_event('pointerdown'); await pg.wait_for_timeout(1000)
        await collect_all(pg, 8000); await pg.wait_for_selector('#game .gresult', timeout=6000)
        check('...and the round still plays to the end', '3 friends found' in await pg.text_content('.gr-big'), await pg.text_content('.gr-big'))
        await pg.click('.gresult [data-a=done]'); await pg.wait_for_timeout(300)
        check('Done after a game from the Play hub goes back to the hub', await pg.locator('#play.active').count()==1)
        check('no page errors (small things)', not errs, errs); await ctx.close()

        # ---- lesson demos cannot race: Next in the middle of a move ----
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}))"); await pg.reload(); await pg.wait_for_timeout(600)
        RACE="""async (wait)=>{ const sl=ms=>new Promise(r=>setTimeout(r,ms)), nx=document.querySelector('#lessonNext');
          Lessons.start('bf_add_a'); while (nx.textContent!=='Show me') nx.click(); nx.click(); await sl(wait); nx.click(); const seen=[];   // demo 1 (8 + 9), then Next -> demo 2 (7 + 8)
          for (let i=0;i<70;i++){ const v=__lesson().value; if (seen[seen.length-1]!==v) seen.push(v); await sl(40); } return seen; }"""
        bad=[]
        for wait in list(range(0,1600,400))+list(range(1640,2060,30))+[2300, 2500]:      # leave demo 1 at many moments of its bead moves
            seen=await pg.evaluate(RACE, wait)
            if seen!=[7,17,15][:len(seen)] or len(seen)<2: bad.append([wait, seen])
        check('Next in the middle of a demo: 7 + 8 only ever shows 7, 17, 15 and ends on 15', not bad, bad)
        await pg.screenshot(path='/tmp/p15_demo.png')
        check('no page errors (demo)', not errs, errs)
        await b.close()
asyncio.run(main())
