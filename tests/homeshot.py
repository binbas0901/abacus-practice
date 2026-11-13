import asyncio, sys
from playwright.async_api import async_playwright
exec(open('/tmp/tour.py').read().split('async def main')[0])
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        for W,H,tag in [(1180,820,'a'),(1024,768,'s'),(1366,1024,'l'),(820,1180,'p')]:
            pg = await b.new_page(viewport={'width':W,'height':H}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(1000)
            await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1600); await pg.screenshot(path=f'/tmp/hs_{tag}.png')
            over = await pg.evaluate("(()=>{ const r=[...document.querySelectorAll('#path .node')].map(e=>e.getBoundingClientRect()); return {minL:Math.min(...r.map(x=>x.left)), maxR:Math.max(...r.map(x=>x.right)), W:innerWidth, bottom:Math.max(...[...document.querySelectorAll('.tile')].map(e=>e.getBoundingClientRect().bottom)), H:innerHeight} })()")
            print(W,H, over); await pg.close()
        await b.close()
asyncio.run(main())
