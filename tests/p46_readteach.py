import asyncio, os
from playwright.async_api import async_playwright
# v4.58: level-1 "Read the beads" is a Juni-led interactive TEACHING flow, not the Bead Detective quiz.
# This drives the real app:
#   - launching reading at a no-sums level (!n.drill) opens #readTeach (NOT #game / Bead Detective)
#   - the flow is driveable: child-paced "Next", child pushes beads to a target, child reads by tapping a number
#   - a WRONG read tap does NOT fail or advance (count-together help, then retry) -> no-fail
#   - completing the flow advances reading progress by one session (level mastery still works) with no timer
#   - arithmetic-level reading (n.drill) STILL launches the real visual drill (#drill), not the teaching flow
PORT = os.environ.get('PORT', '8777')
URL = f'http://localhost:{PORT}/index.html'
SHOTS = os.environ.get('SHOTS', '/tmp/v458')
SETTINGS = {"name": "June", "settingsVersion": 6, "voice": "ljspeech", "sfx": False, "speakFeedback": False}
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

async def active(pg, sid):
    return await pg.evaluate("(id)=>{const e=document.getElementById(id); return !!e && e.classList.contains('active');}", sid)

async def reading_prog(pg):
    # progress is stored per-child (abacus.c.<id>.progress) and/or legacy (abacus.progress); take the max reading count
    return await pg.evaluate("""()=>{ try{ let best=0; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
        if(!/progress$/.test(k)) continue; let p; try{ p=JSON.parse(localStorage.getItem(k)); }catch(e){ continue; }
        const b=p&&p.nodes&&p.nodes.beads, r=b&&b.modes&&b.modes.reading; if(typeof r==='number'&&r>best) best=r; }
        return best; }catch(e){ return -1; } }""")

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820})
        pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL)
        await pg.wait_for_function("window.App && window.Lessons && window.ReadTeach", timeout=30000)
        await pg.evaluate("([s])=>localStorage.setItem('abacus.settings',JSON.stringify(s))", [SETTINGS])
        # lesson already seen -> practice goes straight to the picker
        await pg.evaluate("localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{beads:{lesson:true}}}))")
        await pg.reload(); await pg.wait_for_function("window.App && window.Lessons && window.ReadTeach", timeout=30000)
        await pg.wait_for_timeout(300); await pg.evaluate("()=>window.App.Speaker.unlock()")

        # --- launch reading at the no-sums level ---
        await pg.evaluate("()=>{ window.__practice.start('beads'); }")
        await pg.wait_for_timeout(150)
        await pg.evaluate("()=>window.__practice.runMode('reading')")
        await pg.wait_for_timeout(250)
        check('reading at level 1 opens the teaching flow (#readTeach active)', await active(pg, 'readTeach'))
        check('it is NOT the Bead Detective quiz (#game not active)', not await active(pg, 'game'))
        check('reading progress starts at 0', (await reading_prog(pg)) == 0)
        await pg.wait_for_timeout(300); await pg.screenshot(path=f'{SHOTS}/readteach_intro.png')

        # --- drive the flow; prove no-fail on the first read beat ---
        did_bead = False; did_read = False; no_fail_ok = None; shot_read = False
        for i in range(160):
            if (await reading_prog(pg)) >= 1: break
            if not await active(pg, 'readTeach'): break
            w = await pg.evaluate("()=>window.ReadTeach._waiting()")
            if w == 'next':
                await pg.click('#rtNext'); await pg.wait_for_timeout(120)
            elif w and w.startswith('bead:'):
                target = int(w.split(':')[1])
                await pg.evaluate("(v)=>window.ReadTeach._poke(v)", target)
                did_bead = True; await pg.wait_for_timeout(120)
            elif w and w.startswith('read:'):
                ans = int(w.split(':')[1])
                if not shot_read:
                    await pg.screenshot(path=f'{SHOTS}/readteach_read.png'); shot_read = True
                if no_fail_ok is None:
                    # deliberately tap a WRONG choice first -> must not fail or advance
                    chs = await pg.evaluate("()=>window.ReadTeach._choices()")
                    wrong = next((d for d in chs if d != ans), None)
                    if wrong is not None:
                        await pg.evaluate("(d)=>window.ReadTeach._pick(d)", wrong)
                        await pg.wait_for_timeout(200)
                        still = await pg.evaluate("()=>window.ReadTeach._waiting()")
                        prog = await reading_prog(pg)
                        no_fail_ok = (still == w and prog == 0 and await active(pg, 'readTeach'))
                        await pg.wait_for_timeout(2600)   # let count-together finish before retrying
                    else:
                        no_fail_ok = True
                # now tap the correct answer
                await pg.evaluate("(d)=>window.ReadTeach._pick(d)", ans)
                did_read = True; await pg.wait_for_timeout(200)
            else:
                await pg.wait_for_timeout(140)

        check('child pushed beads to a target (a "do" beat completed)', did_bead)
        check('child read beads by tapping a number (a "read" beat completed)', did_read)
        check('a WRONG read tap did not fail or advance (no-fail: stayed on the read beat, progress still 0)', no_fail_ok is True)
        check('completing the flow advanced reading progress by one session',
              (await reading_prog(pg)) == 1)
        await pg.wait_for_timeout(200); await pg.screenshot(path=f'{SHOTS}/readteach_done.png')
        check('no page errors during the teaching flow', not errs, errs[:3])

        # --- scope guard: arithmetic-level reading STILL launches the real visual drill, not teaching ---
        drill_id = await pg.evaluate("()=>{ const n=window.App.nodes().find(x=>x.drill); return n && n.id; }")
        check('found an arithmetic (drill) node to check scope', bool(drill_id), drill_id)
        if drill_id:
            await pg.evaluate("(id)=>{ window.__practice.on=true; window.__practice.node=id; window.__practice.runMode('reading'); }", drill_id)
            await pg.wait_for_timeout(300)
            check('arithmetic reading launches the real drill (#drill active)', await active(pg, 'drill'), drill_id)
            check('arithmetic reading is NOT the teaching flow (#readTeach not active)', not await active(pg, 'readTeach'))

        # --- scope guard: the Play-section games are unchanged ("Bead Detective"/"Bead Builder" still defined) ---
        gnames = await pg.evaluate("()=>Object.values(window.Games.GAMES).map(g=>g.name)")
        check('Play games still include "Bead Detective"', 'Bead Detective' in gnames, gnames)
        check('Play games still include "Bead Builder"', 'Bead Builder' in gnames, gnames)

        await ctx.close(); await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
