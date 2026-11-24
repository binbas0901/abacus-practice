import asyncio, os
from playwright.async_api import async_playwright
# v4.81: three_digit and rows_2d now have a Bixi interlude (the classic carry slip the child fixes), like the
# combined / two_digit lessons already do. Each lesson must flow intro -> demo -> guided -> help -> done.
# Walk uses __lessonSet (poke the answer) for interactive phases and clicks Next otherwise; __lessonFinish is
# avoided because it force-skips to done (bypassing the interlude).
PORT = os.environ.get('PORT', '8912')
URL = f'http://localhost:{PORT}/index.html'
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

async def walk(pg, node):
    await pg.evaluate(f'()=>window.Lessons.start("{node}","practice")'); await pg.wait_for_timeout(500)
    seen = []
    for _ in range(80):
        st = await pg.evaluate('()=>window.__lesson()')
        if not st: break
        ph = st['phase']
        if not seen or seen[-1] != ph: seen.append(ph)
        if ph == 'done': break
        tgt = st.get('target')
        if ph in ('guided', 'numbers', 'help') and tgt is not None:
            await pg.evaluate(f'()=>window.__lessonSet({tgt})'); await pg.wait_for_timeout(450)
        else:
            try: await pg.click('#lessonNext', timeout=700)
            except Exception: pass
            await pg.wait_for_timeout(300)
    return seen

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width':1180,'height':820})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL, wait_until='load'); await pg.wait_for_timeout(2500)
        await pg.evaluate('()=>window.App.Speaker.unlock()')
        # combined is the known-good reference; the two new ones must match its shape
        for node in ['combined', 'three_digit', 'rows_2d']:
            s = await walk(pg, node)
            check(f'{node}: lesson flows intro -> demo -> guided -> help (interlude) -> done',
                  ('help' in s and 'done' in s and 'guided' in s), s)
        # the interlude audio must resolve (Juni help on juni pack, Bixi slip/thanks on bixi pack)
        await pg.evaluate('async()=>{await window.Classroom.Voice.load("juni"); await window.Classroom.Voice.load("bixi");}')
        await pg.wait_for_timeout(400)
        for i in ['l_three_digit_help', 'l_rows_2d_help', 'l_three_digit_slip', 'l_three_digit_thanks', 'l_rows_2d_slip', 'l_rows_2d_thanks']:
            who = 'juni' if i.endswith('_help') else 'bixi'
            r = await pg.evaluate(f'()=>{{const r=window.Classroom.Voice.find("{who}","{i}"); return !!(r&&r[0]&&r[1]);}}')
            check(f'audio resolves: {i}', r)
        check('no page errors through the interludes', not errs, errs[:3])
        await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
