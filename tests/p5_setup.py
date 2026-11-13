import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def fresh(b):
    ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page()
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(800); return ctx, pg
async def name(pg, n):
    await pg.wait_for_selector('#suName.on'); await pg.fill('#suNameIn', n); await pg.click('#suNameGo'); await pg.wait_for_selector('#suLevel.on')
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(400)
async def answer_check(pg, wrong_at_level):
    lvl=0
    while True:
        await pg.wait_for_timeout(150)
        if await pg.locator('#suDone.on').count(): return
        terms=[int(t.replace('−','-')) for t in await pg.eval_on_selector_all('#suProb .term','els=>els.map(e=>e.textContent)')]
        lname=await pg.text_content('#suLevelName')
        v=sum(terms)+(1 if wrong_at_level and wrong_at_level in lname else 0)
        for ch in str(v): await pg.click(f'#suPad [data-k="{ch}"]')
        await pg.click('#suPad [data-k=go]'); await pg.wait_for_timeout(700)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        errs=[]
        # 1. brand-new device -> setup -> "I'm new"
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        check('new device opens setup (not home)', await pg.locator('#setup.active').count()==1 and await pg.locator('#home.active').count()==0)
        await pg.screenshot(path='/tmp/su_name.png'); await name(pg,'Leo'); await pg.screenshot(path='/tmp/su_level.png')
        await pg.click('[data-lv=new]'); await pg.wait_for_selector('#suDone.on'); await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/su_done.png')
        check('install reminder shown in a browser tab', await pg.locator('#suInstall').is_visible())
        await pg.click('#suStart'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(600)
        pr=json.loads(await pg.evaluate("window.__legacy('progress')")); st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        steps=await pg.eval_on_selector_all('#todaySteps .step .sl','els=>els.map(e=>e.textContent)')
        check("I'm new -> starts at Beads, name saved, first step is Learn", pr['current']=='beads' and st['name']=='Leo' and steps[0]=='Learn', f"{pr['current']} | {st['name']} | {steps} | {await pg.text_content('#bixHome .bubble')}")
        await pg.screenshot(path='/tmp/su_home_new.png')
        await pg.reload(); await pg.wait_for_timeout(800)
        check('after setup, reopening goes straight home', await pg.locator('#home.active').count()==1)
        await ctx.close()

        # 2. Find my level: right through Small friends, wrong at Big friends +9..+6
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        await name(pg,'Ava'); await pg.click('[data-lv=check]'); await pg.wait_for_selector('#suCheck.on'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/su_check.png')
        await answer_check(pg, 'Big friends: +9')
        pr=json.loads(await pg.evaluate("window.__legacy('progress')"))
        learned=[k for k,v in pr['nodes'].items() if v.get('mastered')]
        check('level check places at first missed skill', pr['current']=='bf_add_a' and set(learned)=={'beads','add_direct','sub_direct','sf_add','sf_sub'} and all(pr['nodes'][k]['mastered']=='placed' for k in learned), f"{pr['current']} | {learned} | {await pg.text_content('#suDoneH')}")
        await pg.click('#suStart'); await pg.wait_for_selector('#home.active')
        await gate(pg)
        check('Grown-ups shows "learned (level check)"', 'learned (level check)' in await pg.text_content('#nodeTable'))
        # 3. run the level check again from Grown-ups, stop at the first level -> back to Beads, name kept
        await pg.click('#levelAgain'); await pg.wait_for_selector('#suCheck.on'); await pg.wait_for_timeout(300)
        await pg.click('#suStop'); terms=[int(t.replace('−','-')) for t in await pg.eval_on_selector_all('#suProb .term','els=>els.map(e=>e.textContent)')]
        for ch in str(sum(terms)): await pg.click(f'#suPad [data-k="{ch}"]')
        await pg.click('#suPad [data-k=go]'); await pg.wait_for_selector('#suDone.on')
        pr=json.loads(await pg.evaluate("window.__legacy('progress')")); st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        check('re-run level check + "Start here" -> resets to Beads, keeps name', pr['current']=='beads' and st['name']=='Ava' and not any(v.get('mastered') for v in pr['nodes'].values()), f"{pr['current']} {st['name']}")
        await pg.click('#suStart'); await pg.wait_for_selector('#home.active')
        # 4. start over for a new child
        await gate(pg); await pg.click('#kidAdd'); await pg.wait_for_timeout(1500)
        check('Add a child -> setup runs for the new child', await pg.locator('#setup.active').count()==1 and await pg.locator('#suName.on').count()==1)
        await ctx.close()

        # 5. grown-up chooses
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        await name(pg,'Sam'); await pg.click('[data-lv=pick]'); await pg.wait_for_selector('#suPick.on'); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/su_pick.png')
        await pg.click('.su-skill[data-id=combined]'); await pg.wait_for_selector('#suDone.on'); await pg.click('#suStart'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(600)
        pr=json.loads(await pg.evaluate("window.__legacy('progress')"))
        before=[n for n in ['beads','add_direct','sub_direct','sf_add','sf_sub','bf_add_a','bf_add_b','bf_sub_a','bf_sub_b']]
        check('grown-up picks "Both friends" -> current combined, earlier ones learned', pr['current']=='combined' and all(pr['nodes'][k]['mastered']=='parent' for k in before), pr['current'])
        await pg.screenshot(path='/tmp/su_home_pick.png'); await ctx.close()

        # 6. existing device (already has progress) never sees setup
        ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(900)
        check('existing device goes straight home', await pg.locator('#home.active').count()==1 and await pg.locator('#setup.active').count()==0)
        await ctx.close()
        print('errors:', errs); await b.close()
asyncio.run(main())
