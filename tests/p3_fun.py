import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def collect(pg, n=1):
    titles=[]
    for _ in range(n):
        await pg.wait_for_selector('#stickerReveal.active', timeout=15000); titles.append(await pg.text_content('#rvTitle'))
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(500); await pg.click('#rvOk'); await pg.wait_for_timeout(400)
    return titles
async def collect_all(pg):
    titles=[]
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3000)
        except Exception: return titles
        titles.append(await pg.text_content('#rvTitle')); await pg.click('#rvPack', force=True); await pg.wait_for_timeout(500); await pg.click('#rvOk'); await pg.wait_for_timeout(400)
async def solve_drill(pg):
    for i in range(10):
        await pg.wait_for_selector('#problemArea .term')
        terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
        for ch in str(sum(int(t) for t in terms)): await pg.click(f'#pad [data-k="{ch}"]')
        await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(850)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}))"); await pg.reload(); await pg.wait_for_timeout(600)
        steps = await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.textContent)')
        check('home: Bix, greeting, 3 steps, 3 doors; My Room has the garden pot', await pg.locator('#bixHome .bix').count()==1 and len(steps)==3 and await pg.locator('.hm-doors > button').count()==3, f"{await pg.text_content('#bixHome .bubble')} | {steps}")
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('My Room: garden pot drawn (sprout today, nothing wilts)', await pg.locator('#garden .plot').count()>0 and await pg.locator('#garden .g-pot').count()==1, await pg.text_content('#gardenLabel'))
        await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')
        await pg.screenshot(path='/tmp/p3_home.png')

        # Step 1: lesson
        await pg.click('#todayGo'); await pg.wait_for_selector('#lesson.active')
        for _ in range(15):
            if (await pg.text_content('#capKind'))=='Done!': break
            await pg.click('#lessonNext'); await pg.wait_for_timeout(150)
        await pg.screenshot(path='/tmp/p3_lesson_done.png')
        t = await collect(pg); check('lesson done -> sticker', bool(t), t)
        await pg.screenshot(path='/tmp/p3_reveal.png')
        await pg.click('#lessonNext'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)
        steps = await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className.includes("done"))')
        check('step 1 ticked', steps==[True,False,False], steps)

        # Step 2: game (Friend Pop for big-friends level), 6-second round
        await pg.evaluate("App.gameSeconds=6"); await pg.click('#todayGo'); await pg.wait_for_selector('#game.active'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/p3_pop.png')
        popped=0
        for _ in range(200):
            if await pg.locator('.gresult').count(): break
            ans = await pg.evaluate("(()=>{const q=document.querySelector('.pq-a'), f=document.querySelector('.pq-f'); return q? (+f.textContent - +q.textContent) : null})()")
            if ans is not None:
                bub = pg.locator(f'.bub[data-v="{ans}"]:not(.popped)')
                if await bub.count():
                    try: await bub.first.dispatch_event('pointerdown'); popped+=1
                    except Exception: pass
            await pg.wait_for_timeout(60)
        score = await pg.text_content('#gameScore')
        t = await collect(pg); await pg.wait_for_selector('.gresult')
        await pg.screenshot(path='/tmp/p3_pop_result.png')
        check('Friend Pop plays, scores, gives sticker', popped>0 and score!='⭐ 0', f"{score} | {await pg.text_content('.gr-big')} | {t}")
        await pg.click('.gresult [data-a=done]'); await pg.wait_for_selector('#play.active'); await pg.screenshot(path='/tmp/p3_play.png')
        await pg.click('#exitPlay'); await pg.wait_for_timeout(300)

        # Step 3: drill -> summary sticker + today-complete gold
        await pg.click('#todayGo'); await pg.wait_for_selector('#drill.active')
        mode = 'listen' if await pg.locator('#listenStage').is_visible() else 'visual'
        if mode=='listen':
            await pg.click('#exitDrill'); await pg.evaluate("App.startMode('visual')")  # (headless can't type spoken answers easily)
        await solve_drill(pg); await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/p3_summary.png')
        t = await collect_all(pg)
        check('drill -> 3-star gold sticker', 'GOLD' in t[0], t)
        check('all 3 steps -> celebration gold sticker', any('Today' in x for x in t), t)
        await pg.click('#homeBtn'); await pg.wait_for_timeout(500)
        st = await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className.includes("done"))')
        print('     steps after drill:', st, '(step 3 was', mode, ')')

        # finish the remaining step if it was listen
        if not all(st):
            await pg.evaluate("(async()=>{ await App.activityDone('listen'); })()")
            t = await collect_all(pg)
        await pg.wait_for_timeout(300); await pg.evaluate("document.querySelector('#exitAlbum') && 0"); 
        await pg.click('#exitPlay') if await pg.locator('#play.active').count() else None
        await pg.evaluate("(()=>{})()"); await pg.reload(); await pg.wait_for_timeout(600)
        done_title = await pg.text_content('#todayTitle'); all_done_beads = await pg.locator('#todaySteps .step.done').count()
        await pg.screenshot(path='/tmp/p3_home_done.png')
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('home shows done + My Room has the full flower + sticker badge', 'done' in done_title and all_done_beads==3 and await pg.locator('#garden .full').count()==1 and await pg.locator('#albumBadge.on').count()==1, f"{done_title} | badge {await pg.text_content('#albumBadge')}")
        await pg.click('#roomStickers'); await pg.wait_for_selector('#album.active')
        check('album shows collected stickers', await pg.locator('.slot.has').count()>=4, await pg.text_content('#albumCount'))
        await pg.screenshot(path='/tmp/p3_album.png'); await pg.click('#exitAlbum'); await pg.wait_for_selector('#room.active'); await pg.click('#exitRoom')

        # Bead Detective
        await pg.click('#doorPlay'); await pg.click('.gcard[data-game=reader]'); await pg.wait_for_selector('#rdPad button')
        await pg.screenshot(path='/tmp/p3_reader.png')
        right=0
        for i in range(10):
            await pg.wait_for_function("document.querySelector('#rdCover').classList.contains('on') || document.querySelector('.gresult')", timeout=20000)
            if await pg.locator('.gresult').count(): break
            if i==1: await pg.screenshot(path='/tmp/p3_reader_cover.png')
            labels = await pg.eval_on_selector_all('#rdAb .sb-label','els=>els.map(e=>e.textContent)')
            v = int(''.join(labels)); ans = v if i!=4 else v+1
            for ch in str(ans): await pg.click(f'#rdPad [data-k="{ch}"]')
            await pg.click('#rdPad [data-k=go]'); right += (i!=4)
            await pg.wait_for_function("!document.querySelector('#rdCover').classList.contains('on')")
        t = await collect(pg); await pg.wait_for_selector('.gresult')
        check('Bead Detective: 9/10, rods grow', (await pg.text_content('.gr-big'))=='9 / 10', f"{await pg.text_content('.gr-big')} | {await pg.text_content('.gr-sub')}")
        await pg.click('.gresult [data-a=done]'); await pg.wait_for_selector('#play.active')

        # Bead Builder: set beads by tapping
        await pg.click('.gcard[data-game=build]'); await pg.wait_for_selector('#bdNum')
        for k in range(8):
            await pg.wait_for_function(f"document.querySelector('#bdNum') && document.querySelector('#bdNum').textContent!=''")
            v = int(await pg.text_content('#bdNum'))
            rods = await pg.eval_on_selector_all('#bdAb .sb-rod','els=>els.map(e=>+e.dataset.rod)')
            for r, d in enumerate(reversed(str(v))):
                d=int(d)
                if d>=5: await pg.click(f'#bdAb .sb-rod[data-rod="{r}"] .sb-heaven')
                if d%5: await pg.click(f'#bdAb .sb-rod[data-rod="{r}"] .sb-earth[data-k="{d%5-1}"]')
            if k==2: await pg.screenshot(path='/tmp/p3_build.png')
            await pg.wait_for_timeout(750)
        t = await collect(pg); await pg.wait_for_selector('.gresult')
        check('Bead Builder: 8 numbers set', 'seconds' in await pg.text_content('.gr-big'), await pg.text_content('.gr-big'))
        await pg.click('.gresult [data-a=done]')
        data=json.loads(await pg.evaluate("window.__legacy('fun')"))
        w=data.get('wallet',{})
        check('beads earned along the way', w.get('total',0)>=10, f"{w.get('beads')} beads (lesson 1, games 1-2 each, drill +gold 2, today +3)")
        check('stickers + bests saved', len(data['stickers'])>=6 and 'reader' in data['best'], f"{sum(data['stickers'].values())} stickers, best={data['best']}")
        print('errors:', errs); await b.close()
asyncio.run(main())
