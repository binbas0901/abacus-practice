import asyncio, json, os
from playwright.async_api import async_playwright
# Reward mechanics after the practice-first rewards slice (v4.41): beads are earned ONLY from real practice
# (finishing a set +1, mastering a skill +5); games earn nothing; the collectible sticker album is gone; the
# garden grows with skills MASTERED, not days shown up. DRIVES THE REAL APP.
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
SEED_P='{"current":"add_direct","nodes":{"beads":{"lesson":true,"mastered":"parent","hist":[]},"add_direct":{"lesson":true,"mastered":null,"hist":[],"setsDone":0}}}'
SEED_S='{"name":"Mia","settingsVersion":6,"voice":"ljspeech","sfx":false,"speakFeedback":false}'
async def ans_pad(pg, sel, v):
    # click via JS so an off-screen pad doesn't fail Playwright's visibility/scroll checks
    for ch in str(v):
        await pg.evaluate("a=>{const [sel,c]=a; const b=[...document.querySelectorAll(sel+' [data-k]')].find(x=>x.dataset.k===c); if(b) b.click();}", [sel, ch])
    await pg.evaluate("sel=>{const g=[...document.querySelectorAll(sel+' [data-k]')].find(x=>x.dataset.k==='go'); if(g) g.click();}", sel)
async def listen_ready(pg):
    await pg.wait_for_function("()=>{const m=document.querySelector('#listenMsg');return m&&/answer/i.test(m.textContent)&&!window.App.quietNow();}", timeout=25000)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg=await b.new_page(viewport={'width':1180,'height':820}); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        PORT=os.environ.get('PORT','8765')
        await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_function("window.App&&window.__practice&&window.Treats", timeout=30000)
        await pg.evaluate(f"localStorage.setItem('abacus.progress','{SEED_P}');localStorage.setItem('abacus.settings','{SEED_S}')")
        await pg.reload(); await pg.wait_for_function("window.App&&window.__practice&&window.Treats", timeout=30000)
        await pg.mouse.click(600, 12); await pg.wait_for_timeout(400)

        # practice-first home: Bix on the table, one big Practice hero + the level trophy (10 beads), two earned-break doors
        doors = await pg.eval_on_selector_all('.th-doors > button .toy-block-label','els=>els.map(e=>e.textContent.trim())')
        check('home: Bix, Practice hero + trophy (14 beads), Play/My room doors',
              await pg.locator('#bixHome .bix').count()==1 and await pg.locator('#doorPractice').count()==1 and await pg.locator('#homeTrophy .th-pip').count()==14 and doors==['Play','My room'], doors)

        # My Room: the garden is the ONE progress visual (grows with mastered skills); the sticker album is gone
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('My Room: garden pot drawn, grows with mastered skills', await pg.locator('#garden .g-pot').count()==1 and await pg.locator('#garden .plot').count()>0, await pg.text_content('#gardenLabel'))
        check('sticker album is gone (no Stickers button in the room)', await pg.locator('#roomStickers').count()==0)
        gl = await pg.text_content('#gardenLabel')
        check('garden labels by skills mastered, not days', 'skill' in gl.lower(), gl)
        await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')

        # beads start at 0; a finished practice SET earns one bead toward a treat (real practice earns)
        b0 = await pg.evaluate("window.Treats.wallet().beads")
        check('beads start at 0', b0==0, b0)
        # v4.42: start opens the Reading/Listening picker; pick Listening to run the listen drill set
        await pg.evaluate("window.__practice.start('add_direct')")
        await pg.wait_for_function("()=>!!document.querySelector('#practicePick.active')", timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await pg.wait_for_function("()=>!!document.querySelector('#drill.active')", timeout=15000)
        await pg.wait_for_selector('#listenGo', timeout=10000)
        await pg.evaluate("()=>{const g=document.querySelector('#listenGo'); if(g) g.click();}")
        for i in range(10):
            await listen_ready(pg); d=await pg.evaluate("()=>window.__drill()"); await ans_pad(pg,'#pad',d['answer']); await pg.wait_for_timeout(300)
        await pg.wait_for_selector('.toy-dialog', timeout=15000); await pg.wait_for_timeout(300)
        b1 = await pg.evaluate("window.Treats.wallet().beads")
        check('finishing a practice SET earns a bead (+1)', b1==b0+1, [b0,b1])
        await pg.evaluate("[...document.querySelectorAll('.toy-dialog button')].find(x=>/done for now/i.test(x.textContent))?.click()"); await pg.wait_for_timeout(600)

        # a finished GAME earns nothing (the exact completion path a standalone game runs)
        bg0 = await pg.evaluate("window.Treats.wallet().beads")
        await pg.evaluate("window.App.activityDone('game',{gold:true,leveled:true,game:'reader'})"); await pg.wait_for_timeout(500)
        bg1 = await pg.evaluate("window.Treats.wallet().beads")
        check('a finished GAME earns no beads', bg1==bg0, [bg0,bg1])

        # no collectible stickers are ever awarded now
        data=json.loads(await pg.evaluate("window.__legacy('fun')"))
        check('no collectible stickers are awarded', sum((data.get('stickers') or {}).values())==0, data.get('stickers'))
        print('errors:', errs); await b.close()
asyncio.run(main())
