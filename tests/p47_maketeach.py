import asyncio, os
from playwright.async_api import async_playwright
# v4.69: level-1 "Make the number" is a Juni-led interactive TEACHING flow (the reverse of Read the beads):
# Juni names a number, the child BUILDS it on the beads. Same engine as ReadTeach, launched in 'make' mode.
# This drives the real app:
#   - launching listening at a no-sums level (!n.drill) opens #readTeach with title "Make the number" (NOT the build drill/game)
#   - the flow is driveable: child-paced "Next", child pushes beads to each target (1..5); interaction is always 'bead:'
#   - a WRONG bead value does NOT fail or advance (stays on the beat; no-fail), then the child can reach the target
#   - completing the flow advances LISTENING progress by one session (level mastery still works) with no timer
#   - the heaven bead (target 5) is reached, visible and tappable (not under Juni's bubble) in landscape
#   - arithmetic-level listening (n.drill) STILL launches the real listen drill, not the teaching flow
PORT = os.environ.get('PORT', '8777')
URL = f'http://localhost:{PORT}/index.html'
SHOTS = os.environ.get('SHOTS', '/tmp/v469mk')
SETTINGS = {"name": "June", "settingsVersion": 6, "voice": "ljspeech", "sfx": False, "speakFeedback": False}
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

async def active(pg, sid):
    return await pg.evaluate("(id)=>{const e=document.getElementById(id); return !!e && e.classList.contains('active');}", sid)

async def onscreen(pg, sel):
    box = await pg.evaluate("""(s)=>{ const el=document.querySelector(s); if(!el) return null;
        const r=el.getBoundingClientRect(); const cs=getComputedStyle(el);
        if(cs.visibility==='hidden'||cs.display==='none'||r.width<1||r.height<1) return null;
        return {top:r.top, bottom:r.bottom, left:r.left, right:r.right, vw:window.innerWidth, vh:window.innerHeight}; }""", sel)
    if not box: return False
    return box['top'] >= -0.5 and box['bottom'] <= box['vh'] + 0.5 and box['left'] >= -0.5 and box['right'] <= box['vw'] + 0.5

async def listening_prog(pg):
    return await pg.evaluate("""()=>{ try{ let best=0; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i);
        if(!/progress$/.test(k)) continue; let p; try{ p=JSON.parse(localStorage.getItem(k)); }catch(e){ continue; }
        const b=p&&p.nodes&&p.nodes.beads, r=b&&b.modes&&b.modes.listening; if(typeof r==='number'&&r>best) best=r; }
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
        await pg.wait_for_function("window.App && window.Lessons && window.MakeTeach", timeout=30000)
        await pg.evaluate("([s])=>localStorage.setItem('abacus.settings',JSON.stringify(s))", [SETTINGS])
        await pg.evaluate("localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{beads:{lesson:true}}}))")
        await pg.reload(); await pg.wait_for_function("window.App && window.Lessons && window.MakeTeach", timeout=30000)
        await pg.wait_for_timeout(300); await pg.evaluate("()=>window.App.Speaker.unlock()")

        # --- launch listening (Make the number) at the no-sums level ---
        await pg.evaluate("()=>{ window.__practice.start('beads'); }")
        await pg.wait_for_timeout(150)
        await pg.evaluate("()=>window.__practice.runMode('listening')")
        await pg.wait_for_timeout(250)
        check('listening at level 1 opens the teaching flow (#readTeach active)', await active(pg, 'readTeach'))
        title = await pg.evaluate("()=>{const t=document.getElementById('rtTitle'); return t?t.textContent:'';}")
        check('title reads "Make the number"', title.strip() == 'Make the number', title)
        check('it is NOT a timed build drill (#game not active)', not await active(pg, 'game'))
        check('listening progress starts at 0', (await listening_prog(pg)) == 0)
        await pg.wait_for_function("()=>window.MakeTeach._waiting()==='next'", timeout=8000)
        check('landscape: Next/advance control is fully on-screen at the intro', await onscreen(pg, '#rtNext'))
        await pg.screenshot(path=f'{SHOTS}/maketeach_intro.png')

        did_bead = False; no_fail_ok = None; heaven_probe = None; shot_bead = False
        for i in range(220):
            if (await listening_prog(pg)) >= 1: break
            if not await active(pg, 'readTeach'): break
            w = await pg.evaluate("()=>window.MakeTeach._waiting()")
            if w == 'next':
                await pg.click('#rtNext'); await pg.wait_for_timeout(120)
            elif w and w.startswith('bead:'):
                target = int(w.split(':')[1])
                if not shot_bead:
                    check('landscape: board and number card are fully on-screen on a bead beat',
                          await onscreen(pg, '#rtAbacus') and await onscreen(pg, '#rtCount'))
                    await pg.screenshot(path=f'{SHOTS}/maketeach_bead.png'); shot_bead = True
                if target >= 5 and heaven_probe is None:
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
                    await pg.screenshot(path=f'{SHOTS}/maketeach_bead5.png')
                if no_fail_ok is None:
                    wrong = target + 1 if target < 5 else target - 1
                    await pg.evaluate("(v)=>window.MakeTeach._poke(v)", wrong)
                    await pg.wait_for_timeout(200)
                    still = await pg.evaluate("()=>window.MakeTeach._waiting()")
                    prog = await listening_prog(pg)
                    no_fail_ok = (still == w and prog == 0 and await active(pg, 'readTeach'))
                await pg.evaluate("(v)=>window.MakeTeach._poke(v)", target)
                did_bead = True; await pg.wait_for_timeout(140)
            else:
                await pg.wait_for_timeout(140)

        check('child built numbers on the beads (a "make" beat completed)', did_bead)
        check('a WRONG bead value did not fail or advance (no-fail: stayed on the beat, progress still 0)', no_fail_ok is True)
        check('reached the heaven-bead (make 5) beat', heaven_probe is not None and heaven_probe.get('found'))
        if heaven_probe and heaven_probe.get('found'):
            check('landscape: heaven bead is tappable — a tap at its centre hits the bead, not Juni\'s bubble',
                  heaven_probe.get('inBead') and not heaven_probe.get('hitsJuni'), heaven_probe)
            check('landscape: heaven bead is not visually covered by Juni\'s bubble (#rtJuni)',
                  not heaven_probe.get('occluded'), heaven_probe)
        check('completing the flow advanced listening progress by one session', (await listening_prog(pg)) == 1)
        await pg.wait_for_timeout(200); await pg.screenshot(path=f'{SHOTS}/maketeach_done.png')
        check('no page errors during the teaching flow', not errs, errs[:3])

        # --- scope guard: arithmetic-level listening STILL launches the real listen drill, not teaching ---
        drill_id = await pg.evaluate("()=>{ const n=window.App.nodes().find(x=>x.drill); return n && n.id; }")
        if drill_id:
            await pg.evaluate("(id)=>{ window.__practice.on=true; window.__practice.node=id; window.__practice.runMode('listening'); }", drill_id)
            await pg.wait_for_timeout(300)
            check('arithmetic listening is NOT the teaching flow (#readTeach not active)', not await active(pg, 'readTeach'))

        await ctx.close(); await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
