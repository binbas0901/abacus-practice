import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1180,'height':820}, has_touch=True); pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false, flashSec:1.2}))"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.evaluate("App.startMode('flash')"); await pg.wait_for_timeout(1000); await pg.screenshot(path='/tmp/fl_1_ready.png')
        print('before:', await pg.text_content('#flashMsg'), '| pad locked:', await pg.evaluate("1"))
        await pg.tap('#flashGo'); await pg.wait_for_timeout(600+1200*1+500); await pg.screenshot(path='/tmp/fl_2_second.png'); print('during:', await pg.text_content('#flashNum'))
        await pg.wait_for_function("document.querySelector('#flashNum').classList.contains('ask')", timeout=20000); await pg.screenshot(path='/tmp/fl_3_ask.png')
        print('after:', await pg.text_content('#flashMsg'))
        d=await pg.evaluate("window.__drill()"); print('terms', d)
        for ch in str(d['answer']): await pg.tap(f'#pad [data-k="{ch}"]')
        await pg.tap('#pad [data-k=go]'); await pg.wait_for_timeout(1800); print('next:', await pg.text_content('#flashMsg'), await pg.is_visible('#flashGo'))
        print('errors', errs); await b.close()
asyncio.run(main())
