import asyncio, re, json, os
from playwright.async_api import async_playwright
# Reward mechanics (stickers, gold, treats jar, album) off the practice-first home. The daily "Today" plan is retired,
# so activities are reached the way the app now reaches them: lessons + drills via App.startMode, games via the Play hub.
# The sticker/gold reward itself fires from each activity's own completion (app.js activityDone), unchanged. DRIVES THE REAL APP.
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
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=8000)
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
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % os.environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}))"); await pg.reload(); await pg.wait_for_timeout(600)
        await pg.mouse.click(600, 12); await pg.wait_for_timeout(400)

        # practice-first home: Bix on the table, one big Practice hero + the level trophy (10 beads), two earned-break doors
        doors = await pg.eval_on_selector_all('.th-doors > button .toy-block-label','els=>els.map(e=>e.textContent.trim())')
        check('home: Bix, Practice hero + trophy, Play/My room doors',
              await pg.locator('#bixHome .bix').count()==1 and await pg.locator('#doorPractice').count()==1 and await pg.locator('#homeTrophy .th-pip').count()==10 and doors==['Play','My room'], doors)
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('My Room: garden pot drawn (sprout today, nothing wilts)', await pg.locator('#garden .plot').count()>0 and await pg.locator('#garden .g-pot').count()==1, await pg.text_content('#gardenLabel'))
        await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')
        await pg.screenshot(path='/tmp/p3_home.png')

        # A lesson still earns a sticker (reward fires from the lesson's own completion)
        await pg.evaluate("App.startMode('learn')"); await pg.wait_for_selector('#lesson.active')
        for _ in range(25):   # intro pages + demos + tries
            if (await pg.text_content('#capKind'))=='Done!': break
            if (await pg.evaluate("__lesson().phase")) in ('numbers','guided'): await pg.evaluate("__lessonSet(__lesson().target)"); await pg.wait_for_timeout(1100)   # her turn: she moves the beads
            else: await pg.click('#lessonNext'); await pg.wait_for_timeout(150)
        await pg.screenshot(path='/tmp/p3_lesson_done.png')
        t = await collect(pg); check('lesson done -> sticker', bool(t), t)
        await pg.click('#lessonNext'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)

        # A drill, all correct -> summary -> 3-star GOLD sticker
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
        await solve_drill(pg); await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/p3_summary.png')
        t = await collect_all(pg)
        check('drill (10/10) -> 3-star gold sticker', any('GOLD' in x for x in t), t)
        await pg.click('#homeBtn'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)

        # My Room: a flower for today + the sticker badge, and the album holds what was collected
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('home visit earns a flower + sticker badge on', await pg.locator('#garden .plot').count()>0 and await pg.locator('#albumBadge.on').count()==1, await pg.text_content('#albumBadge'))
        await pg.click('#roomStickers'); await pg.wait_for_selector('#album.active')
        check('album shows collected stickers', await pg.locator('.slot.has').count()>=2, await pg.text_content('#albumCount'))
        await pg.screenshot(path='/tmp/p3_album.png'); await pg.click('#exitAlbum'); await pg.wait_for_selector('#room.active'); await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')

        # Bead Detective still scores and gives a sticker (opened the way the app opens a beads game)
        await pg.evaluate("void Games.open('reader', {from:'home'})"); await pg.wait_for_selector('#rdPad button')
        await pg.screenshot(path='/tmp/p3_reader.png')
        for i in range(10):
            await pg.wait_for_function("document.querySelector('#rdCover').classList.contains('on') || document.querySelector('.gresult')", timeout=20000)
            if await pg.locator('.gresult').count(): break
            if i==1: await pg.screenshot(path='/tmp/p3_reader_cover.png')
            v = int((await pg.get_attribute('#rdAb .abx','aria-label')).split()[-1]); ans = v if i!=4 else v+1
            for ch in str(ans): await pg.click(f'#rdPad [data-k="{ch}"]')
            await pg.click('#rdPad [data-k=go]')
            await pg.wait_for_function("!document.querySelector('#rdCover').classList.contains('on') || document.querySelector('.gresult')")
        t = await collect_all(pg); await pg.wait_for_selector('.gresult', timeout=10000)
        check('Bead Detective: 9/10, rods grow', (await pg.text_content('.gr-big'))=='9 shiny beads!' and await pg.locator('.gr-dots .gdot.ok').count()==9 and await pg.locator('.gr-dots .gdot.miss').count()==1, f"{await pg.text_content('.gr-big')} | {await pg.text_content('.gr-sub')}")
        await pg.click('.gresult [data-a=done]'); await pg.wait_for_selector('#home.active')

        # Bead Builder: set beads by tapping (opened the same way)
        await pg.evaluate("void Games.open('build', {from:'home'})"); await pg.wait_for_selector('#bdNum')
        for k in range(8):
            await pg.wait_for_function("document.querySelector('#bdNum') && document.querySelector('#bdNum').textContent!=''")
            v = int(await pg.text_content('#bdNum'))
            for r, d in enumerate(reversed(str(v))):
                d=int(d)
                if d>=5: await pg.click(f'#bdAb .abx-rod[data-rod="{r}"] .abx-bead[data-kind="h"]')
                if d%5: await pg.click(f'#bdAb .abx-rod[data-rod="{r}"] .abx-bead[data-kind="e"][data-k="{d%5-1}"]')
            if k==2: await pg.screenshot(path='/tmp/p3_build.png')
            await pg.wait_for_timeout(750)
        t = await collect_all(pg); await pg.wait_for_selector('.gresult', timeout=10000)
        check('Bead Builder: 8 numbers set, counted not timed', '8 numbers made' in await pg.text_content('.gr-big') and 'second' not in await pg.text_content('.gresult') and 'numbers built' in await pg.text_content('.gresult'), await pg.text_content('.gresult'))
        await pg.click('.gresult [data-a=done]')
        data=json.loads(await pg.evaluate("window.__legacy('fun')"))
        w=data.get('wallet',{})
        check('beads earned along the way', w.get('total',0)>=4, f"{w.get('beads')} beads / total {w.get('total')}")
        check('stickers + bests saved', sum(data['stickers'].values())>=4 and 'reader' in data['best'], f"{sum(data['stickers'].values())} stickers, best={data['best']}")
        print('errors:', errs); await b.close()
asyncio.run(main())
