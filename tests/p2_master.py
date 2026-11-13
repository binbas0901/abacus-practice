import asyncio
from playwright.async_api import async_playwright

async def _collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3500)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8765/index.html')
        # seed: 12 correct yesterday on bf_add_a, lesson done
        await pg.evaluate("""(()=>{const pr={current:'bf_add_a',nodes:{}}; ['beads','add_direct','sub_direct','sf_add','sf_sub'].forEach(id=>pr.nodes[id]={lesson:true,mastered:'parent',hist:[]});
          pr.nodes.bf_add_a={lesson:true,mastered:null,hist:Array.from({length:12},()=>({ok:true,day:'2026-11-11'}))}; localStorage.setItem('abacus.progress',JSON.stringify(pr)); localStorage.removeItem('abacus.fun');})()""")
        await pg.reload(); print('today:', await pg.text_content('#todayTitle'))
        await pg.click('#todayGo'); await pg.wait_for_timeout(300)
        for i in range(10):
            terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
            for ch in str(sum(int(t) for t in terms)): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(850)
        await pg.wait_for_selector('#summary.active'); await _collect_all(pg); print('score:', await pg.text_content('#sumScore'), '|', await pg.text_content('#sumNote'))
        await pg.screenshot(path='/tmp/p2_levelup.png')
        await pg.click('#homeBtn'); await pg.wait_for_timeout(300); print('now:', await pg.text_content('#greetSub'), '|', await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.textContent)'))
        await pg.screenshot(path='/tmp/p2_home3.png'); print('errors:', errs); await b.close()
asyncio.run(main())
