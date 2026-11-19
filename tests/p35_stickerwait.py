import asyncio, os
from playwright.async_api import async_playwright
# A sticker reward must not pop while a character is still talking (it was talking over Juni's closing line, and
# everywhere else a sticker is earned). Fun.give() now waits until the voice is idle before revealing.
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
        await pg.wait_for_function("window.App && window.Fun && window.Classroom && typeof window.Fun.give === 'function'", timeout=30000)
        await pg.evaluate("()=>window.App.Speaker.unlock()")

        # pretend a character voice is still talking
        await pg.evaluate("""()=>{
          window.__busy = true;
          window.Classroom.Voice.busy = () => window.__busy;
          try { window.Fun.BixVoice.src = null; window.Fun.BixVoice.queued = 0; } catch(e){}
        }""")

        async def overlay_on(): return await pg.evaluate("()=>{const o=document.querySelector('#stickerReveal');return !!(o && o.classList.contains('active'));}")

        # award a sticker while the voice is "busy" -> it must hold
        await pg.evaluate("()=>{ window.Fun.give({}); }")
        await pg.wait_for_timeout(700)
        check('sticker is held while a voice is still talking', not await overlay_on())

        # voice finishes -> sticker appears
        await pg.evaluate("()=>{ window.__busy = false; }")
        await pg.wait_for_timeout(700)
        check('sticker appears once the voice is idle', await overlay_on())

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
