import asyncio, time, re
from playwright.async_api import async_playwright

async def _collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3500)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console: '+m.text) if m.type=='error' and 'favicon' not in m.text else None)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/p2_home.png')
        # Today = lesson for bf_add_a (lesson not done)
        print('today:', await pg.text_content('#todayTitle'))
        await pg.click('#todayGo'); await pg.wait_for_timeout(400); await pg.screenshot(path='/tmp/p2_lesson_intro.png')
        await pg.click('#lessonNext'); await pg.wait_for_timeout(2500); await pg.screenshot(path='/tmp/p2_lesson_demo.png')
        # skip through demos
        for i in range(4): await pg.click('#lessonNext'); await pg.wait_for_timeout(300)
        print('phase caption:', await pg.text_content('#capKind'))
        await pg.screenshot(path='/tmp/p2_guided.png')
        # solve guided 1: abacus shows 2, add 9 -> 11: tap beads to make 11: rod1 earth k0, rod0: currently 2 -> need 1: tap earth k0 (active index0 => set e=0)? tapping k=0 when ev=2 -> k<ev -> ne=0 -> wrong. tap k=1? k=1<2 -> ne=1 -> rod0=1. good
        await pg.click('#lessonAbacus .abx-rod[data-rod="0"] .abx-bead[data-kind="e"][data-k="1"]'); await pg.wait_for_timeout(100)
        await pg.click('#lessonAbacus .abx-rod[data-rod="1"] .abx-bead[data-kind="e"][data-k="0"]'); await pg.wait_for_timeout(1200)
        print('after guided 1:', await pg.text_content('#capKind'))
        # hint
        await pg.click('#lessonHint'); await pg.wait_for_timeout(3000); await pg.screenshot(path='/tmp/p2_hint.png')
        await pg.click('#exitLesson'); await pg.wait_for_timeout(300)
        # Look drill on current node
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/p2_drill.png')
        for i in range(10):
            terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
            ans = sum(int(t) for t in terms) + (1 if i in (1,4) else 0)
            for ch in str(ans): await pg.click(f"#pad [data-k=\"{ch}\"]")
            await pg.click("#pad [data-k=go]"); await pg.wait_for_timeout(1000)
        await pg.wait_for_selector('#summary.active'); await _collect_all(pg); print('summary:', await pg.text_content('#sumScore')); await pg.screenshot(path='/tmp/p2_summary.png')
        await pg.click('#fixBtn'); await pg.wait_for_timeout(300)
        await pg.click("#pad [data-k=\"1\"]"); await pg.click("#pad [data-k=go]"); await pg.wait_for_timeout(2500); await pg.screenshot(path='/tmp/p2_showme.png')
        await pg.click('#showmeClose'); await pg.wait_for_timeout(500)
        for _ in range(6):   # answer the remaining red ones correctly
            if await pg.locator('#summary.active').count(): break
            d = await pg.evaluate("window.__drill()")
            for ch in str(d['answer']): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1300)
        await pg.wait_for_selector('#summary.active', timeout=8000); await _collect_all(pg)
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/p2_home2.png')
        # flash
        await pg.evaluate("(()=>{const s=JSON.parse(window.__legacy('settings')||'{}');s.flashSec=0.3;s.settingsVersion=5;localStorage.setItem('abacus.settings',JSON.stringify(s));})()"); await pg.reload(); await pg.wait_for_timeout(300)
        await pg.evaluate("App.startMode('flash')"); await pg.wait_for_timeout(900); await pg.screenshot(path='/tmp/p2_flash.png')
        await pg.click('#flashGo'); await pg.wait_for_function("document.querySelector('#flashNum').textContent==='= ?'", timeout=10000); print('flash ok')
        await pg.click('#exitDrill')
        # parent
        await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
        await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/p2_parent.png')
        print('errors:', errs); await b.close()
asyncio.run(main())
