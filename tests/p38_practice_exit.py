import asyncio, os
from playwright.async_api import async_playwright
# G3: leaving a practice set mid-way must end the Practice flow cleanly -> land on HOME (never the Play hub) and clear
# Practice.on (a stuck Practice.on would misroute the next normal drill's finish() into the level flow).
# v4.42: the modes are Reading (reader game -> #exitGame) and Listening (listen drill -> #exitDrill); the picker
# itself (#practicePick -> #exitPick) must also exit cleanly. DRIVES THE REAL APP.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails.append(label)

PORT = os.environ.get('PORT', '8765')
URL = 'http://localhost:%s/index.html' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = open(os.path.join(ROOT, 'tests', 'seed_init.js')).read()
SETTINGS = ("()=>localStorage.setItem('abacus.settings', JSON.stringify("
            "{name:'Mia', settingsVersion:9, speakFeedback:false, sfx:false, voice:'device', gap:0.2, bixVoice:'sweet'}))")

async def new_page(b):
    ctx = await b.new_context(viewport={'width': 1180, 'height': 820})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(SEED)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.evaluate(SETTINGS)
    await pg.reload()
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.mouse.click(600, 12)
    await pg.wait_for_timeout(600)
    return ctx, pg, errs

# make node current + learned (past the first-time lesson) so Practice lands on the picker
async def setup_node(pg, node):
    await pg.evaluate("""a=>{ const node=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        window.__markLearned(node); }""", node)
    await pg.wait_for_timeout(200)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ---- exit a READING set (reader game) mid-way via #exitGame ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('reading')")
        await pg.wait_for_selector('#game.active', timeout=15000)
        on_before = await pg.evaluate("()=>window.__practice.on")
        check('reading-set: Practice is running after entering the mode', on_before is True, on_before)
        await pg.evaluate("()=>{const b=document.querySelector('#exitGame'); if(b) b.click();}"); await pg.wait_for_timeout(500)
        state = await pg.evaluate("""()=>({on: window.__practice.on,
            home: !!document.querySelector('#home.active'),
            play: !!document.querySelector('#play.active'),
            game: !!document.querySelector('#game.active')})""")
        check('reading-set exit: Practice.on cleared (no stuck flow)', state['on'] is False, state)
        check('reading-set exit: lands on HOME, not the Play hub', state['home'] and not state['play'] and not state['game'], state)
        sd = await pg.evaluate("()=>window.__level.modeDone('sub_direct','reading')")
        check('reading-set exit: an abandoned set does NOT count (Reading stays 0)', sd == 0, sd)
        regressed = await pg.evaluate("()=>window.__practice.on")
        check('reading-set exit: no stuck Practice.on to hijack the next drill', regressed is False, regressed)
        check('reading-set exit: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- exit a LISTENING set (listen drill) mid-way via #exitDrill ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        check('listening-set: Practice running after entering the mode', (await pg.evaluate("()=>window.__practice.on")) is True)
        await pg.evaluate("()=>{const b=document.querySelector('#exitDrill'); if(b) b.click();}"); await pg.wait_for_timeout(500)
        state = await pg.evaluate("""()=>({on: window.__practice.on,
            home: !!document.querySelector('#home.active'),
            play: !!document.querySelector('#play.active'),
            drill: !!document.querySelector('#drill.active')})""")
        check('listening-set exit: Practice.on cleared', state['on'] is False, state)
        check('listening-set exit: lands on HOME', state['home'] and not state['play'] and not state['drill'], state)
        ld = await pg.evaluate("()=>window.__level.modeDone('sub_direct','listening')")
        check('listening-set exit: an abandoned set does NOT count (Listening stays 0)', ld == 0, ld)
        check('listening-set exit: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- exit from the PICKER itself via #exitPick (new screen) ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        check('picker: Practice running while the picker is up', (await pg.evaluate("()=>window.__practice.on")) is True)
        await pg.evaluate("()=>{const b=document.querySelector('#exitPick'); if(b) b.click();}"); await pg.wait_for_timeout(500)
        state = await pg.evaluate("""()=>({on: window.__practice.on,
            home: !!document.querySelector('#home.active'),
            play: !!document.querySelector('#play.active'),
            pick: !!document.querySelector('#practicePick.active')})""")
        check('picker exit: Practice.on cleared', state['on'] is False, state)
        check('picker exit: lands on HOME, not the Play hub', state['home'] and not state['play'] and not state['pick'], state)
        check('picker exit: no page errors', not errs, errs[:3])
        await ctx.close()

        await b.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + str(fails)))
    print('errors:', [])

asyncio.run(main())
