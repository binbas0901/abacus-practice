import asyncio, os
from playwright.async_api import async_playwright
# Practice model (v4.42): a level is practised in two modes, Reading and Listening, 7 sessions each.
# The level clears only when BOTH modes reach 7. Progress is per-mode and persists across reload.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.App && window.__level", timeout=30000)

        L = await pg.evaluate("()=>({ms:window.__level.MODE_SESSIONS, len:window.__level.SET_LEN, modes:window.__level.PRACTICE_MODES})")
        check('each mode has 7 sessions', L['ms'] == 7, L['ms'])
        check('a session is 10 problems', L['len'] == 10, L['len'])
        check('the two modes are reading and listening', L['modes'] == ['reading', 'listening'], L['modes'])

        st = await pg.evaluate("""()=>{const n='sub_direct';return {
          r:window.__level.modeDone(n,'reading'), l:window.__level.modeDone(n,'listening'),
          done:window.__level.levelComplete(n), total:window.__level.levelTotalCount(n)};}""")
        check('a fresh level has 0/0 sessions', st['r'] == 0 and st['l'] == 0, st)
        check('a fresh level is not complete', st['done'] is False, st)
        check('a level is 14 sessions total', st['total'] == 14, st)

        # finish Reading only -> still not complete; then finish Listening -> complete exactly when both are done
        prog = await pg.evaluate("""()=>{const n='sub_direct', out={};
          for(let i=0;i<7;i++)window.__level.bumpMode(n,'reading');
          out.readingDone = [window.__level.modeComplete(n,'reading'), window.__level.levelComplete(n)];
          for(let i=0;i<6;i++)window.__level.bumpMode(n,'listening');
          out.listening6 = window.__level.levelComplete(n);
          window.__level.bumpMode(n,'listening');
          out.bothDone = window.__level.levelComplete(n);
          out.count = window.__level.levelDoneCount(n);
          return out;}""")
        check('Reading done but Listening not -> level NOT complete', prog['readingDone'] == [True, False], prog['readingDone'])
        check('Listening at 6/7 -> level NOT complete', prog['listening6'] is False, prog)
        check('BOTH modes at 7/7 -> level complete', prog['bothDone'] is True, prog)
        check('done count reaches 14', prog['count'] == 14, prog)

        # per-mode progress persists across reload
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.reload(); await pg.wait_for_function("window.App && window.__level", timeout=30000)
        persisted = await pg.evaluate("()=>[window.__level.modeDone('sub_direct','reading'), window.__level.modeDone('sub_direct','listening')]")
        check('per-mode progress persists across reload', persisted == [7, 7], persisted)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
