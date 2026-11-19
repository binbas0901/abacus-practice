import asyncio, os
from playwright.async_api import async_playwright
# Two restored behaviours (v4.38), DRIVING THE REAL APP:
#  FIX 1 - a not-yet-learned skill is TAUGHT (its lesson) before its first practice set; finishing the lesson
#          flows into the set; exiting early (or a skill with no lesson) does not loop.
#  FIX 2 - mental-math (anzan, kind:'flash') skills run as real Flash drills (abacus hidden), not visible-abacus sets.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails.append(label)

PORT = os.environ.get('PORT', '8765')
URL = 'http://localhost:%s/index.html' % PORT
SETTINGS = {"name": "June", "settingsVersion": 6, "voice": "ljspeech", "sfx": False, "speakFeedback": False}

async def boot(b, prog):
    ctx = await b.new_context(viewport={'width': 820, 'height': 1180})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__practice && window.__level", timeout=30000)
    await pg.evaluate("([p,s])=>{localStorage.setItem('abacus.progress',JSON.stringify(p));localStorage.setItem('abacus.settings',JSON.stringify(s));}", [prog, SETTINGS])
    await pg.reload()
    await pg.wait_for_function("window.App && window.__practice && window.__level", timeout=30000)
    await pg.wait_for_timeout(400)
    await pg.evaluate("()=>window.App.Speaker.unlock()")
    return ctx, pg, errs

def active(pg, sel): return pg.evaluate(f"()=>!!document.querySelector('{sel}.active')")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # FIX 1.1 - untaught drill skill teaches first
        ctx, pg, errs = await boot(b, {"current": "add_direct", "nodes": {"beads": {"lesson": True, "mastered": "parent", "hist": []}, "add_direct": {"lesson": False, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('add_direct')"); await pg.wait_for_timeout(900)
        check('untaught skill -> lesson shows before the first set', await active(pg, '#lesson'))
        check('untaught skill -> not dropped into a drill/game', not (await active(pg, '#drill')) and not (await active(pg, '#game')))
        # finishing the lesson flows into the set
        await pg.evaluate("()=>window.__lessonFinish()"); await pg.wait_for_timeout(1200)
        after = await pg.evaluate("()=>({drill:!!document.querySelector('#drill.active'), game:!!document.querySelector('#game.active'), on:window.__practice.on, learned:(window.__prog('add_direct').node||{}).lesson})")
        check('finishing the lesson flows into the first set', (after['drill'] or after['game']) and after['on'] is True, after)
        check('the skill is now marked learned', after['learned'] is True, after)
        check('no page errors (untaught -> lesson -> set)', not errs, errs[:3])
        await ctx.close()

        # FIX 1.2 - brand-new child (beads, never taught) teaches first
        ctx, pg, errs = await boot(b, {"current": "beads", "nodes": {}})
        await pg.evaluate("()=>window.__practice.start('beads')"); await pg.wait_for_timeout(900)
        check('brand-new child -> beads lesson shows (not raw practice)', await active(pg, '#lesson'))
        await ctx.close()

        # FIX 1.3 - exiting the lesson early goes home and stops practice (no loop)
        ctx, pg, errs = await boot(b, {"current": "add_direct", "nodes": {"beads": {"lesson": True, "mastered": "parent", "hist": []}, "add_direct": {"lesson": False, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('add_direct')"); await pg.wait_for_timeout(800)
        await pg.click('#exitLesson'); await pg.wait_for_timeout(600)
        ex = await pg.evaluate("()=>({home:!!document.querySelector('#home.active'), on:window.__practice.on, lesson:!!document.querySelector('#lesson.active')})")
        check('exiting the lesson early -> home, practice stopped, no re-loop', ex['home'] and ex['on'] is False and not ex['lesson'], ex)
        await ctx.close()

        # FIX 1.4 - an already-taught skill goes straight to practice (no lesson)
        ctx, pg, errs = await boot(b, {"current": "add_direct", "nodes": {"add_direct": {"lesson": True, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('add_direct')"); await pg.wait_for_timeout(900)
        check('already-taught skill -> straight into a set (no lesson)', not (await active(pg, '#lesson')) and (await active(pg, '#drill') or await active(pg, '#game')))
        await ctx.close()

        # FIX 2.1 - anzan (learned) runs a real Flash drill with the abacus hidden
        ctx, pg, errs = await boot(b, {"current": "anzan", "nodes": {"anzan": {"lesson": True, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('anzan')"); await pg.wait_for_timeout(1200)
        fz = await pg.evaluate("""()=>{ const q=s=>document.querySelector(s); const vis=el=>el?getComputedStyle(el).display:null;
            const ab=q('#abHost')||q('.abx-svg');
            return { drill:!!q('#drill.active'), mode:(q('#drill')||{dataset:{}}).dataset.mode, ptype:window.__practice.type,
                     flashStage:vis(q('#flashStage')), listenStage:vis(q('#listenStage')), problemArea:vis(q('#problemArea')),
                     abacusVisible: ab?(getComputedStyle(ab).display!=='none' && ab.offsetParent!==null):false }; }""")
        check('anzan practice runs in FLASH mode', fz['mode'] == 'flash' and fz['ptype'] == 'flash', fz)
        check('anzan flash: the flash stage is shown', fz['flashStage'] not in (None, 'none'), fz)
        check('anzan flash: the abacus is hidden (mental math)', fz['abacusVisible'] is False, fz)
        check('anzan flash: listen/visible-sum stages are hidden', fz['listenStage'] in (None, 'none') and fz['problemArea'] in (None, 'none'), fz)
        check('no page errors (anzan flash)', not errs, errs[:3])
        await ctx.close()

        # FIX 2.2 - anzan not-yet-introduced shows its one-time intro card (the flash lesson) first
        ctx, pg, errs = await boot(b, {"current": "anzan", "nodes": {"anzan": {"lesson": False, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('anzan')"); await pg.wait_for_timeout(900)
        check('anzan first time -> intro card (lesson) before the flash drill', await active(pg, '#lesson'))
        await ctx.close()

        await b.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + str(fails)))

asyncio.run(main())
