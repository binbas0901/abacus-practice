import asyncio, os
from playwright.async_api import async_playwright
# v4.80: the first mental-math (flash) lesson is no longer skipped. A flash node with demos now teaches a bridge
# (intro -> watch the sums build on the beads -> a few guided turns -> THEN the flash drill), instead of dropping
# the child straight into fast-flashing numbers. Repeat visits still go straight to the drill (via startFlash).
PORT = os.environ.get('PORT', '8777')
URL = f'http://localhost:{PORT}/index.html'
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width':1180,'height':820})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function('window.App && window.Lessons && window.__lesson && window.__drill', timeout=30000)
        await pg.wait_for_timeout(300); await pg.evaluate('()=>window.App.Speaker.unlock()')
        # fresh progress: anzan not yet learned -> its first lesson runs
        await pg.evaluate("()=>window.Lessons.start('anzan','practice')"); await pg.wait_for_timeout(600)
        reached = None
        for i in range(8):
            ph = await pg.evaluate('()=>window.__lesson() && window.__lesson().phase')
            if ph and ph != 'intro': reached = ph; break
            await pg.click('#lessonNext'); await pg.wait_for_timeout(500)
        check('first mental lesson teaches on beads before flashing (enters demo/guided, not straight to drill)',
              reached in ('demo', 'guided'), reached)
        # finishing the bridge lesson lands in the flash drill
        await pg.evaluate('()=>window.__lessonFinish()'); await pg.wait_for_timeout(1300)
        d = await pg.evaluate('()=>window.__drill && window.__drill()')
        da = await pg.evaluate("()=>document.getElementById('drill').classList.contains('active')")
        check('after the bridge lesson it goes into the flash drill', da and d and d.get('mode') == 'flash', d)
        check('no page errors through the mental bridge', not errs, errs[:3])
        await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
