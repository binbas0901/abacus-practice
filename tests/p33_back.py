import asyncio, os
from playwright.async_api import async_playwright
# Lessons need a Back button so the child can return to a step they missed, and the voice + animation must
# re-sync on the way back. Also: the first lesson must stay single-digit (no 10 / 20s "tens rod" yet).
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
        await pg.wait_for_function("window.App && window.Classroom && window.Lessons && window.Curriculum", timeout=30000)

        # (1) first lesson stays single-digit -- no 10 or 20s
        nums = await pg.evaluate("()=>window.Curriculum.BY_ID.beads.lesson.numbers")
        check('first lesson numbers are all single-digit (no 10 / tens rod)', all(0 <= x <= 9 for x in nums), nums)

        await pg.evaluate("""()=>{localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}));
                               localStorage.setItem('abacus.settings',JSON.stringify({name:'Mia',settingsVersion:6,voice:'ljspeech',sfx:false}));}""")
        await pg.reload(); await pg.wait_for_function("window.App && window.Classroom && window.Lessons", timeout=30000)
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.evaluate("""()=>{ window.__plays=[]; const V=window.Classroom.Voice, oP=V.play.bind(V); V.play=(c,k,f)=>{ window.__plays.push(c+':'+k); return oP(c,k,f); }; }""")

        async def phase(): return await pg.evaluate("()=>document.querySelector('#lesson').dataset.phase")
        async def kind(): return (await pg.text_content('#capKind')) or ''
        async def back_shown(): return await pg.evaluate("()=>{const b=document.querySelector('#lessonBack');return !!b && getComputedStyle(b).display!=='none';}")

        await pg.evaluate("()=>window.Lessons.start('beads','home')")
        await pg.wait_for_timeout(500)

        # (2) on the very first step, Back is hidden
        check('first step is the anatomy opener', await phase() == 'anatomy')
        check('Back is hidden on the first step', not await back_shown())

        # (3) step forward, Back appears, and going back re-renders the previous step + replays its voice
        await pg.evaluate("()=>document.querySelector('#lessonNext').click()")  # -> anatomy 2/5 (rod)
        await pg.wait_for_timeout(500)
        check('Back appears after the first step', await back_shown())
        check('now on part 2 of 5', '2 of 5' in await kind(), await kind())
        before = await pg.evaluate("()=>window.__plays.length")
        await pg.evaluate("()=>document.querySelector('#lessonBack').click()")
        await pg.wait_for_timeout(500)
        check('Back returns to part 1 of 5', '1 of 5' in await kind(), await kind())
        new = await pg.evaluate("(n)=>window.__plays.slice(n)", before)
        check('going back replays that step Juni voice (audio re-syncs)', any(p == 'juni:anat_abacus' for p in new), new)
        check('Back is hidden again on the first step', not await back_shown())

        # (4) Back crosses a phase boundary (fingers -> last anatomy step) and re-syncs
        for _ in range(8):
            if await phase() == 'fingers': break
            await pg.evaluate("()=>document.querySelector('#lessonNext').click()")
            await pg.wait_for_timeout(350)
        check('reached the finger step', await phase() == 'fingers')
        before = await pg.evaluate("()=>window.__plays.length")
        await pg.evaluate("()=>document.querySelector('#lessonBack').click()")
        await pg.wait_for_timeout(500)
        check('Back from fingers returns to the last anatomy part (earth, 5 of 5)', await phase() == 'anatomy' and '5 of 5' in await kind(), await kind())
        new = await pg.evaluate("(n)=>window.__plays.slice(n)", before)
        check('crossing back a phase replays that step voice', any(p == 'juni:anat_earth' for p in new), new)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
