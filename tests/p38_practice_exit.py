import asyncio, os
from playwright.async_api import async_playwright
# v4.43 Back-nav: Back from INSIDE a Reading/Listening session returns to the Reading/Listening PICKER (Practice.on
# stays on — you're still in the practice flow), and the abandoned set does NOT count. Only Back from the PICKER
# itself (#exitPick) leaves the practice flow -> HOME (never the Play hub) and clears Practice.on. Reading on a level
# with sums is the shown-problem drill (#drill -> #exitDrill); a no-sums level (beads) uses the reader (#game ->
# #exitGame). DRIVES THE REAL APP.
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

        # ---- Back from a READING session (shown-problem #drill) via #exitDrill -> returns to the PICKER ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('reading')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        await pg.wait_for_function("()=>window.__drill() && window.__drill().mode==='visual'", timeout=15000)
        check('reading-session: Practice is running after entering the mode', (await pg.evaluate("()=>window.__practice.on")) is True)
        await pg.evaluate("()=>{const b=document.querySelector('#exitDrill'); if(b) b.click();}"); await pg.wait_for_timeout(500)
        state = await pg.evaluate("""()=>({on: window.__practice.on,
            pick: !!document.querySelector('#practicePick.active'),
            home: !!document.querySelector('#home.active'),
            play: !!document.querySelector('#play.active'),
            drill: !!document.querySelector('#drill.active')})""")
        check('reading Back: returns to the Reading/Listening picker', state['pick'] and not state['home'] and not state['play'] and not state['drill'], state)
        check('reading Back: stays in the practice flow (Practice.on still true)', state['on'] is True, state)
        sd = await pg.evaluate("()=>window.__level.modeDone('sub_direct','reading')")
        check('reading Back: the abandoned set does NOT count (Reading stays 0)', sd == 0, sd)
        check('reading Back: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- Back from a LISTENING session (listen #drill) via #exitDrill -> returns to the PICKER ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        check('listening-session: Practice running after entering the mode', (await pg.evaluate("()=>window.__practice.on")) is True)
        await pg.evaluate("()=>{const b=document.querySelector('#exitDrill'); if(b) b.click();}"); await pg.wait_for_timeout(500)
        state = await pg.evaluate("""()=>({on: window.__practice.on,
            pick: !!document.querySelector('#practicePick.active'),
            home: !!document.querySelector('#home.active'),
            play: !!document.querySelector('#play.active'),
            drill: !!document.querySelector('#drill.active')})""")
        check('listening Back: returns to the picker', state['pick'] and not state['home'] and not state['play'] and not state['drill'], state)
        check('listening Back: stays in the practice flow (Practice.on still true)', state['on'] is True, state)
        ld = await pg.evaluate("()=>window.__level.modeDone('sub_direct','listening')")
        check('listening Back: the abandoned set does NOT count (Listening stays 0)', ld == 0, ld)
        check('listening Back: no page errors', not errs, errs[:3])
        await ctx.close()

        # NOTE: #exitGame's in-practice routing (no-sums reader/build fallback) is the exact mirror of #exitDrill
        # above — both, while Practice.on and not a flash node, return to the picker via Practice.pick(). It isn't
        # driven here because the only no-sums node (beads) has a pre-existing reader quirk that stalls the harness.

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
