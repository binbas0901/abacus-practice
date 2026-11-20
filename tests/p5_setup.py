import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def fresh(b):
    ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page()
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(800)
    # Juni-led onboarding plays her recorded welcome once tapped; the bubbles still show the same with sound off, so
    # keep these UI-flow tests fast and deterministic by muting the characters (audio pacing is covered by p24_classroom).
    try: await pg.evaluate("window.App && (App.settings.bixTalks=false)")
    except Exception: pass
    return ctx, pg
# Juni leads: the first screen is hers. After the child's name, Bixi (the classmate) rolls in during the meet beat.
async def name(pg, n):
    await pg.wait_for_selector('#suName.on'); await pg.fill('#suNameIn', n); await pg.click('#suNameGo')
    await pg.wait_for_selector('#suAbacus.on'); await pg.click('[data-abacus=yes]'); await pg.wait_for_selector('#suLevel.on')
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(400)
# First-run setup is now behind the grown-up gate: pass it, then the name/abacus/skill steps show.
async def pass_setup_gate(pg):
    await pg.wait_for_selector('#gate.active', timeout=20000)
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk')
    await pg.wait_for_selector('#suName.on', timeout=20000)
async def answer_check(pg, wrong_at_level):
    lvl=0
    while True:
        await pg.wait_for_timeout(150)
        if await pg.locator('#suDone.on').count(): return
        terms=[int(t.replace('−','-')) for t in await pg.eval_on_selector_all('#suProb .term','els=>els.map(e=>e.textContent)')]
        lname=await pg.text_content('#suLevelName')
        v=sum(terms)+(1 if wrong_at_level and wrong_at_level in lname else 0)
        for ch in str(v): await pg.click(f'#suPad [data-k="{ch}"]')
        await pg.click('#suGo'); await pg.wait_for_timeout(700)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        errs=[]
        # 1. brand-new device -> setup -> "I'm new"
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        # First-run now opens behind the grown-up gate: name/abacus/skill are grown-up setup steps, so the gate comes first.
        check('new device opens the grown-up gate first (not home, setup steps not yet shown)', await pg.locator('#gate.active').count()==1 and await pg.locator('#home.active').count()==0 and await pg.locator('#suName.on').count()==0)
        await pass_setup_gate(pg)
        check('after passing the gate, setup opens (not home)', await pg.locator('#setup.active').count()==1 and await pg.locator('#home.active').count()==0)
        # Juni leads from the very first setup screen: her bubble shows a j_intro_* line (marked who=juni); Bixi is not shown yet.
        await pg.wait_for_selector('#suName.on')
        first = await pg.evaluate("()=>{const j=document.querySelector('#juniBubble'),b=document.querySelector('#bixiSetupBubble');return {jon:j.classList.contains('on'),jwho:j.dataset.who,jtxt:(j.querySelector('.ctext').textContent||''),bon:b.classList.contains('on'),bvis:getComputedStyle(document.querySelector('#bixSetup')).visibility,here:document.querySelector('#setup').classList.contains('cl-bixi-here')};}")
        check('Juni leads the first setup screen (her bubble, who=juni, has text); Bixi not introduced yet', first['jon'] and first['jwho']=='juni' and len(first['jtxt'])>0 and not first['bon'] and first['bvis']=='hidden' and not first['here'], first)
        # The name field (and its Next button) stay above the keyboard when it is up (v4.5 keyboard-up handling).
        await pg.focus('#suNameIn'); await pg.evaluate("window.__kb(360)"); await pg.wait_for_timeout(220)
        kb = await pg.evaluate("()=>{const d=document.documentElement,r=document.querySelector('#suNameIn').getBoundingClientRect(),g=document.querySelector('#suNameGo').getBoundingClientRect(),vv=parseFloat(getComputedStyle(d).getPropertyValue('--vv-h'))||innerHeight;return {up:d.classList.contains('kb-up'),vv:Math.round(vv),inBot:Math.round(r.bottom),goBot:Math.round(g.bottom),ok:(r.top>=0 && r.bottom<=vv+2 && g.bottom<=vv+2 && r.height>=48 && g.height>=48)};}")
        check('keyboard up: name field and Next stay reachable above the keyboard', kb['up'] and kb['ok'], kb)
        await pg.evaluate("window.__kb(null)"); await pg.wait_for_timeout(150)
        await pg.screenshot(path='/tmp/su_name.png')
        # submit the name -> Bixi is introduced AFTER the name step (rolls in during the meet beat).
        await pg.fill('#suNameIn','Leo'); await pg.click('#suNameGo')
        await pg.wait_for_selector('#setup.cl-bixi-here', timeout=20000)
        onname = await pg.evaluate("()=>document.querySelector('#setup').dataset.step")
        await pg.wait_for_selector('#bixiSetupBubble.on', timeout=20000)   # Bixi rolls in, then greets in his own bubble
        meet = await pg.evaluate("()=>({step:document.querySelector('#setup').dataset.step, bvis:getComputedStyle(document.querySelector('#bixSetup')).visibility, bwho:document.querySelector('#bixiSetupBubble').dataset.who, btxt:(document.querySelector('#bixiSetupBubble .ctext').textContent||'')});")
        check('Bixi is introduced after the name step (meet beat, rolls in, greets as who=bixi)', onname=='suMeet' and meet['bvis']=='visible' and meet['bwho']=='bixi' and len(meet['btxt'])>0, [onname, meet])
        await pg.screenshot(path='/tmp/su_meet.png')
        await pg.wait_for_selector('#suAbacus.on'); await pg.click('[data-abacus=yes]'); await pg.wait_for_selector('#suLevel.on'); await pg.screenshot(path='/tmp/su_level.png')
        await pg.click('[data-lv=new]'); await pg.wait_for_selector('#suDone.on'); await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/su_done.png')
        check('install reminder shown in a browser tab', await pg.locator('#suInstall').is_visible())
        await pg.click('#suStart'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(600)
        pr=json.loads(await pg.evaluate("window.__legacy('progress')")); st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        trophy=await pg.text_content('#homeTrophy')
        check("I'm new -> starts at Beads, name saved, Practice hero + empty trophy", pr['current']=='beads' and st['name']=='Leo' and await pg.locator('#doorPractice').count()==1 and '0 / 10' in trophy, f"{pr['current']} | {st['name']} | {trophy} | {await pg.text_content('#bixHomeCard .ctext')}")
        await pg.screenshot(path='/tmp/su_home_new.png')
        await pg.reload(); await pg.wait_for_timeout(800)
        check('after setup, reopening goes straight home', await pg.locator('#home.active').count()==1)
        await ctx.close()

        # 2. Find my level: right through Small friends, wrong at Big friends +9..+6
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pass_setup_gate(pg)
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
        await pg.click('#suStop'); await pg.wait_for_selector('#suDone.on', timeout=12000)   # "Stop here" ends the check at once
        pr=json.loads(await pg.evaluate("window.__legacy('progress')")); st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        check('re-run level check + "Stop here" -> resets to Beads, keeps name', pr['current']=='beads' and st['name']=='Ava' and not any(v.get('mastered') for v in pr['nodes'].values()), f"{pr['current']} {st['name']}")
        await pg.click('#suStart'); await pg.wait_for_selector('#home.active')
        # 4. start over for a new child
        await gate(pg); await pg.click('#kidAdd'); await pg.wait_for_timeout(1500)
        await pass_setup_gate(pg)
        check('Add a child -> grown-up gate first, then setup for the new child', await pg.locator('#setup.active').count()==1 and await pg.locator('#suName.on').count()==1)
        await ctx.close()

        # 5. grown-up chooses
        ctx,pg = await fresh(b); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pass_setup_gate(pg)
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
        # portrait iPad: all three "abacus at home?" cards (and the three starting-point cards) fit on the page
        ctx = await b.new_context(viewport={'width':820,'height':1180}); pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(800)
        try: await pg.evaluate("window.App && (App.settings.bixTalks=false)")
        except Exception: pass
        await pass_setup_gate(pg)
        await pg.fill('#suNameIn', 'June'); await pg.click('#suNameGo'); await pg.wait_for_selector('#suAbacus.on'); await pg.wait_for_timeout(400)
        FIT="(sel)=>[...document.querySelectorAll(sel+' .to-card')].map(e=>{ const r=e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), r.top>=0 && r.bottom<=innerHeight-8 && r.height>=64]; })"
        cards = await pg.evaluate(FIT, '#suAbacus')
        check('portrait setup: Yes / No / Not sure all fit on the page', len(cards)==3 and all(c[2] for c in cards), cards)
        await pg.screenshot(path='/tmp/su_abacus_portrait.png'); await pg.click('[data-abacus=unsure]'); await pg.wait_for_selector('#suLevel.on'); await pg.wait_for_timeout(400)
        cards = await pg.evaluate(FIT, '#suLevel')
        check('portrait setup: the three starting-point cards fit on the page', len(cards)==3 and all(c[2] for c in cards), cards)
        await ctx.close()
        print('errors:', errs); await b.close()
asyncio.run(main())
