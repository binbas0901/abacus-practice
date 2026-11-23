import asyncio, os
from playwright.async_api import async_playwright
# "Show me" in the first lesson's NUMBERS phase (v4.55): on the "Your turn - Show N" step a stuck child can press
# "Show me" and Juni DEMONSTRATES forming N on the abacus (beads animate into place, caption narrates the steps),
# then the child is returned to "Your turn" with the abacus reset - NOT auto-completed. This drives the real app:
#   - the button is present on the numbers-phase step (it used to show only in the guided phase)
#   - pressing it animates the units rod to the target number, then resets to 0 and returns to "Your turn"
#   - the child is not auto-completed (demoIdx and did unchanged)
#   - it is re-pressable
#   - works for v<5 (earth beads only) and v>=5 (heaven bead + earth beads)
PORT = os.environ.get('PORT', '8765')
URL = f'http://localhost:{PORT}/index.html'
SHOTS = os.environ.get('SHOTS', '/tmp/v455')
SETTINGS = {"name": "June", "settingsVersion": 6, "voice": "ljspeech", "sfx": False, "speakFeedback": False}
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

async def to_numbers(pg):
    for _ in range(24):   # intro / anatomy (5) / fingers (5), then the Your-turn (numbers) phase
        if (await pg.evaluate("__lesson().phase")) == 'numbers': return True
        await pg.click('#lessonNext'); await pg.wait_for_timeout(160)
    return (await pg.evaluate("__lesson().phase")) == 'numbers'

async def advance_to_value(pg, want):
    # complete numbers (poke to target -> auto-advance) until the current "Show N" is `want`
    for _ in range(12):
        st = await pg.evaluate("__lesson()")
        if st['phase'] != 'numbers': return False
        if st['target'] == want: return True
        await pg.evaluate("__lessonSet(__lesson().target)"); await pg.wait_for_timeout(1150)
    return (await pg.evaluate("__lesson()"))['target'] == want

async def hint_visible(pg):
    return await pg.evaluate("()=>{const h=document.querySelector('#lessonHint'); return !!h && getComputedStyle(h).display!=='none' && /Show me/.test(h.textContent);}")

async def watch_demo(pg):
    # press "Show me" and record the bead values the units rod passes through while Juni demonstrates
    seq = await pg.evaluate("""async ()=>{
      const sl=ms=>new Promise(r=>setTimeout(r,ms));
      document.querySelector('#lessonHint').click();
      const seen=[], busy=[];
      for(let i=0;i<120;i++){ const s=__lesson(); if(!s) break; const v=s.value; if(seen[seen.length-1]!==v) seen.push(v); busy.push(s.busy);
        if(i>3 && s.busy===false && seen.length>1 && v===0) break; await sl(60); }
      return {seen, everBusy: busy.some(Boolean)};
    }""")
    return seq

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
        await pg.wait_for_function("window.App && window.Lessons", timeout=30000)
        await pg.evaluate("([s])=>localStorage.setItem('abacus.settings',JSON.stringify(s))", [SETTINGS])
        await pg.evaluate("localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}))")
        await pg.reload(); await pg.wait_for_function("window.App && window.Lessons", timeout=30000)
        await pg.wait_for_timeout(300); await pg.evaluate("()=>window.App.Speaker.unlock()")

        await pg.evaluate("()=>window.Lessons.start('beads','home')")
        await pg.wait_for_timeout(200)
        ok = await to_numbers(pg)
        check('reached the numbers (Your turn - Show N) phase', ok, await pg.evaluate("__lesson()"))

        # ---- v<5 (first number is 1): earth beads only ----
        st = await pg.evaluate("__lesson()")
        check('first Your-turn number is single-digit v<5', st['target'] < 5, st)
        v = st['target']
        check(f'"Show me" button is present on the Your-turn step (v={v})', await hint_visible(pg))
        await pg.screenshot(path=f'{SHOTS}/numbers_button_present.png')

        # press Show me mid-demo screenshot: grab a frame while the beads are mid-formation
        task = asyncio.ensure_future(watch_demo(pg))
        await pg.wait_for_timeout(500); await pg.screenshot(path=f'{SHOTS}/numbers_mid_demo_v{v}.png')
        seq = await task
        check(f'the demo animates the units rod up to {v}', v in seq['seen'], seq)
        check('the demo marks the lesson busy while it plays (taps ignored)', seq['everBusy'], seq)
        after = await pg.evaluate("__lesson()")
        check('after the demo the abacus is reset to 0', after['value'] == 0, after)
        check('the child is returned to "Your turn" (still numbers phase, same number)',
              after['phase'] == 'numbers' and after['target'] == v, after)
        check('the child is NOT auto-completed (demoIdx and did unchanged)',
              after['demoIdx'] == 0 and after['did'] == 0, after)
        check('"Show me" is still present (re-pressable)', await hint_visible(pg))
        cap = (await pg.text_content('#capKind') or '').strip()
        check('caption is back on the "Your turn" prompt', cap == 'Your turn', repr(cap))
        await pg.screenshot(path=f'{SHOTS}/numbers_back_to_your_turn.png')

        # re-press to confirm it runs again
        seq2 = await watch_demo(pg)
        check(f're-pressing the button runs the demo again (reaches {v})', v in seq2['seen'], seq2)

        # ---- v>=5 (drive to 6): heaven bead + earth beads ----
        reached = await advance_to_value(pg, 6)
        check('drove the lesson to a v>=5 number (6)', reached, await pg.evaluate("__lesson()"))
        if reached:
            check('"Show me" present on the v>=5 step', await hint_visible(pg))
            before = await pg.evaluate("__lesson()")
            task = asyncio.ensure_future(watch_demo(pg))
            await pg.wait_for_timeout(700); await pg.screenshot(path=f'{SHOTS}/numbers_mid_demo_v6.png')
            seq6 = await task
            check('6 is formed as heaven-first then earth (passes through 5 then 6)',
                  5 in seq6['seen'] and 6 in seq6['seen'], seq6)
            a6 = await pg.evaluate("__lesson()")
            check('after the v=6 demo: reset to 0, still Your turn on 6, not auto-completed by the press',
                  a6['value'] == 0 and a6['phase'] == 'numbers' and a6['target'] == 6
                  and a6['demoIdx'] == before['demoIdx'] and a6['did'] == before['did'], a6)

        check('no page errors', not errs, errs[:3])

        # v4.57 FIX 3 - the two "skip" controls on the Your-turn step are distinguishable:
        #   #lessonSkip (static) skips the WHOLE lesson and now reads "Skip lesson";
        #   #lessonNext in its td-skip state skips THIS number and still reads "Skip".
        shots457 = '/tmp/v457'; os.makedirs(shots457, exist_ok=True)
        ctx2 = await b.new_context(viewport={'width': 1180, 'height': 820}); pg2 = await ctx2.new_page()
        errs2 = []; pg2.on('pageerror', lambda e: errs2.append(str(e)))
        await pg2.goto(URL); await pg2.wait_for_function("window.App && window.Lessons", timeout=30000)
        await pg2.evaluate("([s])=>localStorage.setItem('abacus.settings',JSON.stringify(s))", [SETTINGS])
        await pg2.evaluate("localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}))")
        await pg2.reload(); await pg2.wait_for_function("window.App && window.Lessons", timeout=30000)
        await pg2.wait_for_timeout(300); await pg2.evaluate("()=>window.App.Speaker.unlock()")
        await pg2.evaluate("window.App.lessonSkipMs=500")   # make the per-number Skip surface quickly
        await pg2.evaluate("()=>window.Lessons.start('beads','home')"); await pg2.wait_for_timeout(200)
        ok2 = await to_numbers(pg2)
        check('reached the Your-turn step for the skip-label check', ok2, await pg2.evaluate("__lesson()"))
        await pg2.wait_for_function("getComputedStyle(document.querySelector('#lessonNext')).visibility==='visible'", timeout=8000)
        labels = await pg2.evaluate("""()=>{const ls=document.querySelector('#lessonSkip'), ln=document.querySelector('#lessonNext');
          const vis=e=>!!e && e.offsetParent!==null && getComputedStyle(e).visibility!=='hidden';
          return {skip: ls.textContent.trim(), next: ln.textContent.trim(), skipVis: vis(ls), nextVis: vis(ln), nextSkip: ln.classList.contains('td-skip')};}""")
        check('Your-turn: the whole-lesson skip reads "Skip lesson"', labels['skip'] == 'Skip lesson', labels)
        check('Your-turn: the per-number skip (td-skip) still reads "Skip"', labels['next'] == 'Skip' and labels['nextSkip'], labels)
        check('Your-turn: the two skip controls have DISTINCT labels, both visible',
              labels['skip'] != labels['next'] and labels['skipVis'] and labels['nextVis'], labels)
        await pg2.screenshot(path=f'{shots457}/your_turn_two_skips_1180x820.png')
        check('no page errors (two-skip labels)', not errs2, errs2[:3])
        await ctx2.close()

        await ctx.close(); await b.close()

asyncio.run(main())
print('\n' + ('ALL PASS' if not fails else 'FAILURES'))
import sys; sys.exit(1 if fails else 0)
