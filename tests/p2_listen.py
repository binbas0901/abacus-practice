import asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765'))
        for voice in ['device','ljspeech']:
            await pg.evaluate("(v)=>{const s=JSON.parse(window.__legacy('settings')||'{}');s.gap=1;s.voice=v;s.settingsVersion=5;localStorage.setItem('abacus.settings',JSON.stringify(s));}", voice); await pg.reload(); await pg.wait_for_timeout(300)
            await pg.click('.tile[data-mode=listen]'); await pg.wait_for_timeout(300)
            print(voice, 'msg:', await pg.text_content('#listenMsg'))
            await pg.click('#listenGo'); t0=time.time()
            await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=40000)
            print(voice, 'done in %.1fs, replay enabled:'%(time.time()-t0), await pg.eval_on_selector('#replayBtn','e=>!e.disabled'))
            # answer and check 2nd problem auto-starts
            await pg.click('#pad [data-k="1"]'); await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1200)
            print(voice, '2nd:', await pg.text_content('#listenMsg'))
            await pg.click('#exitDrill')
        print(await pg.evaluate("Diag.lines.slice(0,6)") if False else '')
        print('errors:', errs); await b.close()
asyncio.run(main())
