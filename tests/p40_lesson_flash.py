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
        # v4.42: finishing a (non-flash) lesson flows into the Reading/Listening PICKER, not straight into a set
        await pg.evaluate("()=>window.__lessonFinish()"); await pg.wait_for_timeout(1200)
        after = await pg.evaluate("()=>({pick:!!document.querySelector('#practicePick.active'), on:window.__practice.on, learned:(window.__prog('add_direct').node||{}).lesson})")
        check('finishing the lesson flows into the Reading/Listening picker', after['pick'] and after['on'] is True, after)
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
        await pg.evaluate("()=>{const b=document.querySelector('#exitLesson'); if(b) b.click();}"); await pg.wait_for_timeout(600)
        ex = await pg.evaluate("()=>({home:!!document.querySelector('#home.active'), on:window.__practice.on, lesson:!!document.querySelector('#lesson.active')})")
        check('exiting the lesson early -> home, practice stopped, no re-loop', ex['home'] and ex['on'] is False and not ex['lesson'], ex)
        await ctx.close()

        # FIX 1.4 - an already-taught skill goes straight to practice (no lesson)
        ctx, pg, errs = await boot(b, {"current": "add_direct", "nodes": {"add_direct": {"lesson": True, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('add_direct')"); await pg.wait_for_timeout(900)
        check('already-taught skill -> straight to the Reading/Listening picker (no lesson)', not (await active(pg, '#lesson')) and (await active(pg, '#practicePick')))
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

        # v4.57 FIX 1 - at the first (no-sums) level the picker card and the activity it launches share a name
        # (the card no longer says "Reading"/"Listening" while opening "Bead Detective"/"Bead Builder")
        # v4.57 FIX 2 - a "Watch the lesson again" button in the picker replays the current skill's lesson
        shots = '/tmp/v457'; os.makedirs(shots, exist_ok=True)
        ctx, pg, errs = await boot(b, {"current": "beads", "nodes": {"beads": {"lesson": True, "mastered": None, "hist": []}}})
        await pg.evaluate("()=>window.__practice.start('beads')"); await pg.wait_for_timeout(700)
        check('learned no-sums level -> straight to the picker', await active(pg, '#practicePick'))
        cards = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>({mode:e.getAttribute("data-mode"), lab:e.querySelector(".pp-lab").textContent.trim()}))')
        check('no-sums picker: the two cards still drive the reading/listening modes', [c['mode'] for c in cards] == ['reading', 'listening'], cards)
        check('no-sums picker: cards are labelled by what they DO, not "Reading"/"Listening"',
              [c['lab'] for c in cards] == ['Read the beads', 'Make the number'], cards)
        check('no-sums picker: a "Watch the lesson again" button is present (the skill has a lesson)',
              await pg.evaluate("()=>{const b=document.querySelector('#ppWatch'); return !!b && b.offsetParent!==null && /Watch the lesson again/.test(b.textContent);}"))
        await pg.wait_for_timeout(300); await pg.screenshot(path=f'{shots}/level1_picker_820x1180.png')
        # (a) the launched activity's on-screen title matches the card that opened it
        # (don't return the runMode promise - the game awaits pad input and never resolves, which would hang evaluate)
        await pg.evaluate("()=>{ window.__practice.runMode('reading'); }"); await pg.wait_for_selector('#game.active'); await pg.wait_for_timeout(300)
        gt = (await pg.evaluate("()=>document.querySelector('#gameTitle').lastElementChild.textContent") or '').strip()
        check('no-sums "Read the beads" card launches an activity titled the same (not "Bead Detective")',
              await active(pg, '#game') and gt == 'Read the beads', gt)
        # (b) the Watch button replays the lesson
        await pg.evaluate("()=>window.__practice.start('beads')"); await pg.wait_for_timeout(700)
        await pg.wait_for_selector('#ppWatch'); await pg.evaluate("()=>document.querySelector('#ppWatch').click()"); await pg.wait_for_timeout(700)
        check('tapping "Watch the lesson again" replays the current skill lesson', await active(pg, '#lesson'))
        check('no page errors (no-sums picker naming + watch-again)', not errs, errs[:3])
        await ctx.close()

        await b.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + str(fails)))

asyncio.run(main())
