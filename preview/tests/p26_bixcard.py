# Bixi's reserved speech card on Home / Play / My Room: it shows his line with his name, has no tail,
# stays fully on-screen in the lower region (never near the top-center moon), and never overlaps Juni's bubble.
# Checked on small (mini), standard, and 12.9" iPad sizes, in both portrait and landscape.
import asyncio, os
from playwright.async_api import async_playwright
PORT = os.environ.get('PORT', '8765')
SEED = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_init.js')).read()
res = []
def check(label, ok, extra=''): res.append(ok); print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if extra else ''))
def intersect(a, b): return not (a['right'] <= b['left'] or b['right'] <= a['left'] or a['bottom'] <= b['top'] or b['bottom'] <= a['top'])
SIZES = [('mini', 744, 1133), ('standard', 820, 1180), ('pro', 1024, 1366)]

async def box(pg, sel):
    return await pg.evaluate("""s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:r.width,h:r.height};}""", sel)
async def card_state(pg, c):
    return await pg.evaluate("""s=>{const e=document.querySelector(s); if(!e) return null; const cs=getComputedStyle(e), r=e.getBoundingClientRect();
      return {on:e.classList.contains('on'),disp:cs.display,tail:e.classList.contains('toy-say'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:r.width,h:r.height,text:(e.querySelector('.ctext')||{}).textContent||''};}""", c)

async def run_screen(pg, w, h, name, nav, scr, fig, card, juni, controls):
    if nav: await pg.click(nav)
    await pg.wait_for_selector(scr + '.active', timeout=5000); await pg.wait_for_timeout(300)
    if name == 'home':   # let the first-interaction greeting run and settle (it owns the bubble until greeted), so it can't steal Bixi's card mid-test
        await pg.evaluate("()=>document.getElementById('home').click()"); await pg.wait_for_timeout(1500)
    await pg.evaluate("c=>window.Classroom && window.Classroom.showBubble(document.querySelector(c),'Is the answer a hundred? No? A squillion?','bixi',0)", card)
    await pg.wait_for_timeout(250)
    cs = await card_state(pg, card); lab = f'{name} {w}x{h}'
    if not cs: return check(f'{lab}: card exists', False)
    check(f'{lab}: card shows Bixi\'s line', cs['on'] and cs['disp'] != 'none' and len(cs['text']) > 0, cs['text'][:18])
    check(f'{lab}: card has NO tail', not cs['tail'])
    check(f'{lab}: card fully on-screen', cs['left'] >= -1 and cs['right'] <= w + 1 and cs['top'] >= -1 and cs['bottom'] <= h + 1, cs)
    check(f'{lab}: card in lower region, clear of the top moon', cs['top'] > h * 0.42, round(cs['top']))
    jb = await box(pg, juni)
    if jb and jb['w'] > 2: check(f'{lab}: card does NOT overlap Juni\'s bubble', not intersect(cs, jb), [cs, jb])
    for csel in controls:
        cb = await box(pg, csel)
        if cb and cb['w'] > 2: check(f'{lab}: card does NOT cover {csel}', not intersect(cs, cb), [cs, cb])
    # wiring: tapping Bixi shows his card
    await pg.evaluate("c=>{const e=document.querySelector(c); e.classList.remove('on');}", card)
    fb = await box(pg, fig + ' .bix')
    if fb and fb['w'] > 2:
        await pg.click(fig + ' .bix', force=True); await pg.wait_for_timeout(300)
        cs2 = await card_state(pg, card)
        check(f'{lab}: tapping Bixi shows his card', bool(cs2 and cs2['on']))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        errs = []
        base = {'name': 'Mia', 'settingsVersion': 5, 'sfx': False, 'speakFeedback': False}
        for (nm, W, H) in SIZES:
            for (vw, vh) in [(W, H), (H, W)]:
                ctx = await b.new_context(viewport={'width': vw, 'height': vh}); pg = await ctx.new_page()
                pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(SEED)
                await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(600)
                await pg.evaluate("s=>localStorage.setItem('abacus.settings',JSON.stringify(s))", base)
                await pg.reload(); await pg.wait_for_timeout(700); await pg.wait_for_selector('#home.active', timeout=5000)
                await run_screen(pg, vw, vh, 'home', None, '#home', '#bixHome', '#bixHomeCard', '#homeJuni', ['#doorPractice', '#homeTrophy'])
                await run_screen(pg, vw, vh, 'play', '#doorPlay', '#play', '#bixPlay', '#bixPlayCard', '#playJuni', [])
                await pg.click('#exitPlay'); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(200)
                await run_screen(pg, vw, vh, 'room', '#doorRoom', '#room', '#bixRoom', '#bixRoomCard', '#roomJuni', ['#roomWish'])
                await ctx.close()
        print('errors:', errs); print('RESULT', sum(res), '/', len(res))
asyncio.run(main())
