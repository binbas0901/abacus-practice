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

async def onscreen(pg, sel):
    # True only if the element is visible AND its box is fully inside the viewport (not clipped off any edge).
    # Guards the landscape bug where the advance control was pushed below the bottom edge (v4.58).
    box = await pg.evaluate("""(s)=>{ const el=document.querySelector(s); if(!el) return null;
        const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
        if(cs.visibility==='hidden'||cs.display==='none'||r.width<1||r.height<1) return null;
        return {top:r.top, bottom:r.bottom, left:r.left, right:r.right, vw:window.innerWidth, vh:window.innerHeight}; }""", sel)
    if not box: return False
    return box['top'] >= -0.5 and box['bottom'] <= box['vh'] + 0.5 and box['left'] >= -0.5 and box['right'] <= box['vw'] + 0.5

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
        # landscape guard (1180x820): the advance control must be fully on-screen at the intro.
        # In v4.58 it was pushed below the bottom edge, so the child could never advance.
        await pg.wait_for_function("()=>window.ReadTeach._waiting()==='next'", timeout=8000)
        check('landscape: Next/advance control is fully on-screen at the intro (not clipped off the edge)',
              await onscreen(pg, '#rtNext'))

        # --- drive the flow; prove no-fail on the first read beat ---
        did_bead = False; did_read = False; no_fail_ok = None; shot_read = False; read_onscreen = None
        heaven_probe = None   # v4.60: at the heaven-bead ("push the big top bead") beat, the heaven bead must be
                              # visible (not under Juni's bubble) AND a tap at its centre must hit the bead, not #rtJuni.
        for i in range(160):
            if (await reading_prog(pg)) >= 1: break
            if not await active(pg, 'readTeach'): break
            w = await pg.evaluate("()=>window.ReadTeach._waiting()")
            if w == 'next':
                await pg.click('#rtNext'); await pg.wait_for_timeout(120)
            elif w and w.startswith('bead:'):
                target = int(w.split(':')[1])
                if target >= 5 and heaven_probe is None:
                    # heaven bead at rest sits at the board's top — the spot most at risk of the bubble.
                    heaven_probe = await pg.evaluate("""()=>{
                        const hb = document.querySelector('#rtAbacus .abx-bead[data-kind="h"]');
                        const hit = hb && hb.querySelector('.abx-hit'); if(!hit) return {found:false};
                        const r = hit.getBoundingClientRect(); const cx=r.left+r.width/2, cy=r.top+r.height/2;
                        const el = document.elementFromPoint(cx, cy);
                        const juni = document.getElementById('rtJuni');
                        const jr = juni ? juni.getBoundingClientRect() : null;
                        const juniVis = juni && getComputedStyle(juni).visibility!=='hidden' && getComputedStyle(juni).display!=='none';
                        const overlap = jr ? !(r.right<=jr.left||r.left>=jr.right||r.bottom<=jr.top||r.top>=jr.bottom) : false;
                        return { found:true, inBead: !!(el && hb.contains(el)),
                                 hitsJuni: !!(el && juni && (el===juni||juni.contains(el))),
                                 occluded: !!(overlap && juniVis) }; }""")
                    await pg.screenshot(path=f'{SHOTS}/readteach_bead5.png')
                await pg.evaluate("(v)=>window.ReadTeach._poke(v)", target)
                did_bead = True; await pg.wait_for_timeout(120)
            elif w and w.startswith('read:'):
                ans = int(w.split(':')[1])
                if not shot_read:
                    # landscape guard: on a read beat the board and the number choices must both be fully on-screen.
                    # (#rtCount is intentionally empty here — showing a count would give away the answer.)
                    read_onscreen = (await onscreen(pg, '#rtAbacus') and await onscreen(pg, '.rt-choice'))
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
        check('landscape: board and number choices are fully on-screen on a read beat', read_onscreen is True)
        check('reached the heaven-bead ("push the big top bead") beat', heaven_probe is not None and heaven_probe.get('found'))
        if heaven_probe and heaven_probe.get('found'):
            check('landscape: heaven bead is tappable — a tap at its centre hits the bead, not Juni\'s bubble',
                  heaven_probe.get('inBead') and not heaven_probe.get('hitsJuni'), heaven_probe)
            check('landscape: heaven bead is not visually covered by Juni\'s bubble (#rtJuni)',
                  not heaven_probe.get('occluded'), heaven_probe)
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
