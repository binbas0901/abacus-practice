import asyncio, os
from playwright.async_api import async_playwright
# The practice-door greeting ("Tap Learn and I'll show you the beads...") must NOT replay when the child comes
# straight back from the Learn screen (BB: repeating it is bad design). It should still greet on a genuine visit.
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
        await pg.wait_for_function("window.App && window.Classroom", timeout=20000)
        # 'beads' node has no drill -> the door shows the j_door_first "Tap Learn..." greeting BB quoted
        await pg.evaluate("""()=>{
          localStorage.setItem('abacus.progress', JSON.stringify({current:'beads', nodes:{}}));
          localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:6, voice:'ljspeech', sfx:false}));
        }""")
        await pg.reload(); await pg.wait_for_function("window.App && window.Classroom", timeout=20000)
        await pg.wait_for_timeout(500)
        await pg.evaluate("()=>window.App.Speaker.unlock()")

        def greeting_shown():
            return pg.evaluate("""()=>{const j=document.querySelector('#doorJuni');return !!(j && j.classList.contains('on') && /Tap Learn/i.test(j.textContent||''));}""")

        # 1) genuine first visit to the door: greeting shows
        await pg.evaluate("()=>window.App.openPractice()")
        await pg.wait_for_timeout(700)
        on_door = await pg.evaluate("()=>document.querySelector('#door').classList.contains('active')")
        check('door opened', on_door)
        check('greeting shows on a genuine door visit', await greeting_shown())

        # 2) go into Learn from the door, then come back
        await pg.evaluate("()=>document.querySelector('#doorLearn').click()")
        await pg.wait_for_timeout(600)
        in_lesson = await pg.evaluate("()=>document.querySelector('#lesson').classList.contains('active')")
        check('tapping Learn opens the lesson', in_lesson)
        await pg.evaluate("()=>document.querySelector('#exitLesson').click()")
        await pg.wait_for_timeout(700)
        back_on_door = await pg.evaluate("()=>document.querySelector('#door').classList.contains('active')")
        check('back on the door after leaving Learn', back_on_door)
        check('greeting does NOT replay when returning from Learn', not await greeting_shown())

        # 3) leave to home and come back as a fresh visit: greeting returns
        await pg.evaluate("()=>{ if (window.App.renderHome) window.App.renderHome(); }")
        await pg.evaluate("()=>document.querySelector('#exitDoor') && document.querySelector('#exitDoor').click()")
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.App.openPractice()")
        await pg.wait_for_timeout(700)
        check('greeting shows again on a later genuine visit', await greeting_shown())

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
