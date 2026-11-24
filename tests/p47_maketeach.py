import asyncio, os
from playwright.async_api import async_playwright
# v4.72: level-1 "Make the number" is PRACTICE, not teaching (the opening lesson teaches the fundamentals).
# Juni says a number; the child builds it on the beads, over several rounds. No-fail (stuck -> Juni builds it, retry).
# This drives the real app:
#   - launching listening at a no-sums level (!n.drill) opens #readTeach, title "Make the number" (NOT a timed build drill)
#   - the flow is driveable: child-paced "Next", then several make rounds (push beads to the target)
#   - a WRONG bead value does NOT fail or advance -> no-fail
#   - completing the rounds advances listening progress by one session with no timer
#   - arithmetic-level listening (n.drill) STILL launches the real listen drill, not the practice flow
PORT = os.environ.get('PORT', '8777')
URL = f'http://localhost:{PORT}/index.html'
SHOTS = os.environ.get('SHOTS', '/tmp/v472m')
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

        await pg.evaluate("()=>{ window.__practice.start('beads'); }")
        await pg.wait_for_timeout(150)
        await pg.evaluate("()=>window.__practice.runMode('listening')")
        await pg.wait_for_timeout(250)
        check('listening at level 1 opens the practice flow (#readTeach active)', await active(pg, 'readTeach'))
        title = await pg.evaluate("()=>{const t=document.getElementById('rtTitle'); return t?t.textContent:'';}")
        check('title reads "Make the number"', title.strip() == 'Make the number', title)
        check('it is NOT a timed build drill (#game not active)', not await active(pg, 'game'))
        check('listening progress starts at 0', (await listening_prog(pg)) == 0)
        await pg.wait_for_function("()=>window.MakeTeach._waiting()==='next'", timeout=8000)
        check('landscape: Next/advance control is fully on-screen at the intro', await onscreen(pg, '#rtNext'))
        await pg.screenshot(path=f'{SHOTS}/make_intro.png')

        rounds = 0; no_fail_ok = None; shot = False
        for i in range(300):
            if (await listening_prog(pg)) >= 1: break
            if not await active(pg, 'readTeach'): break
            w = await pg.evaluate("()=>window.MakeTeach._waiting()")
            if w == 'next':
                await pg.click('#rtNext'); await pg.wait_for_timeout(120)
            elif w and w.startswith('bead:'):
                target = int(w.split(':')[1])
                if not shot:
                    check('landscape: board and number card are fully on-screen on a make round',
                          await onscreen(pg, '#rtAbacus') and await onscreen(pg, '#rtCount'))
                    await pg.screenshot(path=f'{SHOTS}/make_round.png'); shot = True
                if no_fail_ok is None:
                    wrong = target + 1 if target < 5 else target - 1
                    await pg.evaluate("(v)=>window.MakeTeach._poke(v)", wrong); await pg.wait_for_timeout(200)
                    still = await pg.evaluate("()=>window.MakeTeach._waiting()")
                    no_fail_ok = (still == w and (await listening_prog(pg)) == 0 and await active(pg, 'readTeach'))
                await pg.evaluate("(v)=>window.MakeTeach._poke(v)", target)
                rounds += 1; await pg.wait_for_timeout(160)
            else:
                await pg.wait_for_timeout(140)

        check('child built numbers over multiple rounds (practice, not a single taught beat)', rounds >= 3, rounds)
        check('a WRONG bead value did not fail or advance (no-fail)', no_fail_ok is True)
        check('completing the rounds advanced listening progress by one session', (await listening_prog(pg)) == 1)
        await pg.wait_for_timeout(200); await pg.screenshot(path=f'{SHOTS}/make_done.png')
        check('no page errors during the practice flow', not errs, errs[:3])

        drill_id = await pg.evaluate("()=>{ const n=window.App.nodes().find(x=>x.drill); return n && n.id; }")
        if drill_id:
            await pg.evaluate("(id)=>{ window.__practice.on=true; window.__practice.node=id; window.__practice.runMode('listening'); }", drill_id)
            await pg.wait_for_timeout(300)
            check('arithmetic listening is NOT the practice flow (#readTeach not active)', not await active(pg, 'readTeach'))

        await ctx.close(); await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
