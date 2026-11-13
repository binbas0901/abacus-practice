import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(400)
async def collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3500)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}))"); await pg.reload(); await pg.wait_for_timeout(500)
        check('home bead chip and jar start empty', (await pg.text_content('#roomBeads')).strip()=='0' and (await pg.text_content('#jar .jar-n')).strip()=='0' and await pg.locator('#jar .j-bead').count()==0, await pg.text_content('#jar'))
        # earn by finishing a game
        await pg.evaluate("App.gamePops=1"); await pg.click('#doorPlay'); await pg.click('.gcard[data-game=pop]')
        await pg.wait_for_selector('.bub'); await pg.wait_for_timeout(300)
        ans = await pg.evaluate("+document.querySelector('.pq-f').textContent - +document.querySelector('.pq-a').textContent")
        if await pg.locator(f'.bub[data-v="{ans}"]').count(): await pg.locator(f'.bub[data-v="{ans}"]').first.dispatch_event('pointerdown')
        await collect_all(pg); await pg.wait_for_timeout(500)
        w=json.loads(await pg.evaluate("window.__legacy('fun')"))['wallet']
        check('finishing a game earns beads (+1, +1 more for a gold best)', w['beads'] in (1,2), w)
        await pg.click('.gresult [data-a=done]'); await pg.click('#exitPlay'); await pg.wait_for_timeout(300)
        # shop: My Room -> treat jar
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active')
        check('jar holds the earned beads', await pg.locator('#jar .j-bead').count()>=1 and (await pg.text_content('#roomBeads')).strip()==str(w['beads']), await pg.text_content('#jar .jar-n'))
        await pg.click('#jar'); await pg.wait_for_selector('#shop.active')
        names = await pg.eval_on_selector_all('.tcard .tname','els=>els.map(e=>e.textContent)')
        check('shop lists the six treats, cheapest first', names==['Small snack','Extra bedtime story','Game with a grown-up','Choose dinner','Park trip','Ice cream outing'], names)
        await pg.screenshot(path='/tmp/p3_shop0.png')
        await pg.click('.tcard.tpick:has-text("Ice cream")'); await pg.click('.tcard.hi:has-text("Ice cream") [data-goal]'); await pg.wait_for_timeout(300)
        check('save for the ice cream outing', await pg.locator('.tcard.goal:has-text("Ice cream")').count()==1, await pg.text_content('#bixShop .bubble'))
        await pg.click('#exitShop'); await pg.wait_for_selector('#room.active'); await pg.wait_for_timeout(300)
        check('jar shows the goal tag + Bix counts the beads still to go', 'Ice cream' in await pg.text_content('#jar .jar-sub') and await pg.locator('#jar .j-goal').count()==1 and 'more bead' in await pg.text_content('#bixRoom .bubble'), f"{await pg.text_content('#jar .jar-sub')} | {await pg.text_content('#bixRoom .bubble')}")
        await pg.screenshot(path='/tmp/p3_home_jar.png'); await pg.click('#exitRoom')
        # grown-up adds beads
        await gate(pg); await pg.click('[data-adj="5"]'); await pg.click('[data-adj="1"]'); bead_txt = await pg.text_content('#tpBeads')
        await pg.screenshot(path='/tmp/p3_parent_treats.png')
        await pg.click('#parentDone'); await pg.click('#doorRoom'); await pg.click('#roomWish'); await pg.wait_for_selector('#shop.active')
        can = await pg.eval_on_selector_all('.tcard.can .tname','els=>els.map(e=>e.textContent)')
        check('with beads, cheap treats unlock', 'Extra bedtime story' in can and 'Park trip' not in can, f"beads={bead_txt} can={can}")
        await pg.click('.tcard.tpick:has-text("bedtime story")'); await pg.click('.tcard.hi:has-text("bedtime story") [data-get]'); await pg.wait_for_selector('#shopAsk.active'); await pg.screenshot(path='/tmp/p3_ask.png')
        await pg.click('#askYes'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='/tmp/p3_shop_bought.png')
        w=json.loads(await pg.evaluate("window.__legacy('fun')"))['wallet']
        check('buy lollipop: beads spent, ticket made', w['tickets'][-1]['name']=='Extra bedtime story' and not w['tickets'][-1]['given'] and w['beads']==int(bead_txt)-5, f"beads={w['beads']} tickets={[t['name'] for t in w['tickets']]} | shop shows: {await pg.text_content('#shopTickets')}")
        await pg.click('#exitShop'); await pg.click('#exitRoom'); await gate(pg)
        check('ticket shows in Grown-ups', 'Extra bedtime story' in await pg.text_content('#tpTickets'), (await pg.text_content('#tpTickets'))[:60])
        await pg.click('#tpTickets [data-give]'); await pg.wait_for_timeout(200)
        check('mark given', 'Nothing waiting' in await pg.text_content('#tpTickets'), await pg.text_content('#tpTickets'))
        # edit list
        await pg.fill('#tpList tr:nth-child(1) input[data-f=price]', '2'); await pg.dispatch_event('#tpList tr:nth-child(1) input[data-f=price]','change')
        await pg.click('#tpAdd'); last='#tpList tr:last-child'
        await pg.fill(f'{last} input[data-f=emoji]','🛝'); await pg.dispatch_event(f'{last} input[data-f=emoji]','change')
        await pg.fill(f'{last} input[data-f=name]','Library visit'); await pg.dispatch_event(f'{last} input[data-f=name]','change')
        await pg.fill(f'{last} input[data-f=price]','15'); await pg.dispatch_event(f'{last} input[data-f=price]','change')
        st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        check('grown-up edits price + adds non-food treat', st['treats'][0]['price']==2 and st['treats'][-1]['name']=='Library visit', [(t['emoji'],t['name'],t['price']) for t in st['treats']])
        await pg.click('#parentDone'); await pg.click('#doorRoom'); await pg.click('#jar'); await pg.wait_for_selector('#shop.active')
        check('shop reflects edits', 'Library visit' in await pg.text_content('#shopCards'))
        print('errors:', errs); await b.close()
asyncio.run(main())
