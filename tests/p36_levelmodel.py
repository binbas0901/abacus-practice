import asyncio, os
from playwright.async_api import async_playwright
# Practice-first level model: a level is 10 sets x 10 problems, the 10 sets cycle through three REQUIRED types
# (listen, read, build), all three appear, and the level clears only when all 10 sets are done.
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

        L = await pg.evaluate("()=>({sets:window.__level.LEVEL_SETS, len:window.__level.SET_LEN, plan:window.__level.levelSetPlan()})")
        check('a level is 10 sets', L['sets'] == 10, L['sets'])
        check('a set is 10 problems', L['len'] == 10, L['len'])
        check('the level has 10 sets planned', len(L['plan']) == 10, L['plan'])
        check('all three types (listen, read, build) appear', set(L['plan']) == {'listen', 'read', 'build'}, L['plan'])
        check('sets cycle ear/eye/hand in order', L['plan'][:4] == ['listen', 'read', 'build', 'listen'], L['plan'][:4])

        types = await pg.evaluate("()=>[0,1,2,3,9].map(i=>window.__level.setType(i))")
        check('setType cycles correctly', types == ['listen', 'read', 'build', 'listen', 'listen'], types)

        # fresh node: on set 0 (a listen set), level not complete
        st = await pg.evaluate("""()=>{
          const n='sub_direct';
          return {idx:window.__level.currentSetIndex(n), type:window.__level.currentSetType(n), done:window.__level.levelComplete(n)};
        }""")
        check('a fresh level starts on set 0', st['idx'] == 0, st)
        check('set 0 is a listen set', st['type'] == 'listen', st)
        check('a fresh level is not complete', st['done'] is False, st)

        # complete sets one by one; the level clears exactly at 10
        prog = await pg.evaluate("""()=>{
          const n='sub_direct', out=[];
          for (let i=0;i<10;i++){ const d=window.__level.completeSet(n); out.push([d, window.__level.levelComplete(n)]); }
          return out;
        }""")
        check('completing sets counts up to 10', prog[-1][0] == 10, prog[-1])
        check('level is NOT complete before 10 sets', all(not c for d, c in prog[:9]), prog[:9])
        check('level IS complete at 10 sets', prog[9][1] is True, prog[9])
        # persists across a reload
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.reload(); await pg.wait_for_function("window.App && window.__level", timeout=30000)
        persisted = await pg.evaluate("()=>window.__level.setsDone('sub_direct')")
        check('set progress persists across reload', persisted == 10, persisted)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
