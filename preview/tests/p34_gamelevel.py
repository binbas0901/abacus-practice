import asyncio, os
from playwright.async_api import async_playwright
# The practice games must stay within the current skill's level. On the first skill (beads, single digit) neither
# Bead Builder ("Make N") nor Bead Detective (read the beads) may show numbers above 9. Also: returning from a
# game to the practice door must NOT replay Juni's door greeting.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.App && window.Games && window.Classroom", timeout=30000)
        await pg.evaluate("""()=>{localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}));
                               localStorage.setItem('abacus.settings',JSON.stringify({name:'Mia',settingsVersion:6,voice:'ljspeech',sfx:false}));}""")
        await pg.reload(); await pg.wait_for_function("window.App && window.Games && window.Classroom", timeout=30000)
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.App.Speaker.unlock()")

        # ---- Bead Builder ("Make N") ----
        await pg.evaluate("()=>{ window.Games.open('build', {from:'home'}); }")
        await pg.wait_for_function("()=>!!window.__gameAb && !!document.querySelector('#bdNum') && document.querySelector('#bdNum').textContent", timeout=15000)
        build_nums = []
        for _ in range(8):
            v = await pg.evaluate("()=>parseInt(document.querySelector('#bdNum').textContent,10)")
            if v is None: break
            build_nums.append(v)
            # make the number to advance to the next one
            await pg.evaluate("(n)=>window.__gameAb.poke(n)", v)
            await pg.wait_for_timeout(750)
            # stop if the game left the stage
            if not await pg.evaluate("()=>!!document.querySelector('#bdNum')"): break
        check('Bead Builder collected several numbers', len(build_nums) >= 4, build_nums)
        check('Bead Builder never asks for a number above the level (<=9 on beads)', all(0 <= x <= 9 for x in build_nums), build_nums)

        # ---- Bead Detective (read the beads) ----
        await pg.evaluate("()=>window.Games.stop && window.Games.stop()")
        await pg.wait_for_timeout(200)
        await pg.evaluate("()=>{ window.Games.open('reader', {from:'home'}); }")
        await pg.wait_for_function("()=>typeof window.__rdVal === 'number' && !!document.querySelector('#rdPad')", timeout=15000)
        read_vals = []
        rods_seen = set()
        for _ in range(10):
            v = await pg.evaluate("()=>window.__rdVal")
            if not isinstance(v, int): break
            read_vals.append(v)
            rods_seen.add(await pg.evaluate("()=>document.querySelector('#rdAb') && document.querySelector('#rdAb').dataset.rods"))
            # answer correctly so the game progresses (and could try to ramp up)
            for ch in str(v):
                await pg.evaluate("(c)=>{const b=[...document.querySelectorAll('#rdPad [data-k]')].find(x=>x.dataset.k===c); if(b) b.click();}", ch)
            await pg.evaluate("()=>{const g=[...document.querySelectorAll('#rdPad [data-k]')].find(x=>x.dataset.k==='go'); if(g) g.click();}")
            await pg.wait_for_timeout(1100)
            if not await pg.evaluate("()=>!!document.querySelector('#rdPad')"): break
            # wait for the next number to differ (or the same key stays)
            await pg.wait_for_timeout(100)

        check('Bead Detective collected several numbers', len(read_vals) >= 4, read_vals)
        check('Bead Detective never shows a number above the level (<=9 on beads)', all(0 <= x <= 9 for x in read_vals), read_vals)
        check('Bead Detective never ramps past one rod on beads', rods_seen <= {'1', None}, rods_seen)

        # ---- returning from a game to the door does not replay the greeting ----
        await pg.evaluate("()=>window.Games.stop && window.Games.stop()")
        await pg.wait_for_timeout(200)
        await pg.evaluate("()=>window.App.openPractice()")          # genuine door visit -> greets
        await pg.wait_for_timeout(700)
        greeted = await pg.evaluate("""()=>{const j=document.querySelector('#doorJuni');return !!(j && j.classList.contains('on') && /Tap Learn/i.test(j.textContent||''));}""")
        check('door greets on a genuine visit', greeted)
        await pg.evaluate("()=>{ window.Games.open('build', {from:'door'}); }")   # open Make from the door
        await pg.wait_for_timeout(600)
        await pg.evaluate("()=>window.Games.leave && window.Games.leave()")  # Done -> back to the door
        await pg.wait_for_timeout(800)
        on_door = await pg.evaluate("()=>document.querySelector('#door').classList.contains('active')")
        check('back on the door after the game', on_door)
        greeted2 = await pg.evaluate("""()=>{const j=document.querySelector('#doorJuni');return !!(j && j.classList.contains('on') && /Tap Learn/i.test(j.textContent||''));}""")
        check('door greeting does NOT replay when returning from a game', not greeted2)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
