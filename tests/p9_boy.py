import asyncio, re
from playwright.async_api import async_playwright
HOOK=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'p8_ipad.py')).read().split('HOOK = r"""')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1180,'height':820}, has_touch=True); pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:8765/index.html'); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.tap('#grownups'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.tap('#gateOk'); await pg.wait_for_timeout(600)
        print('options', await pg.eval_on_selector_all('#sBixVoice option','els=>els.map(e=>e.textContent)'))
        await pg.select_option('#sBixVoice','boy'); await pg.wait_for_timeout(2500)
        r=await pg.evaluate("window.__bix.splice(0)"); print('boy plays on pick:', [(x['id'],x['state']) for x in r], 'tag', await pg.evaluate("Fun.BixVoice.tag()"))
        await pg.tap('#parentDone'); await pg.wait_for_timeout(5000); await pg.evaluate("window.__bix.splice(0)")
        await pg.evaluate("Fun.Mascot.say(document.querySelector('#bixHome'), null, 0, 'yes_5')"); await pg.wait_for_timeout(800)
        r=await pg.evaluate("window.__bix.splice(0)"); print('quiet line yes_5 -> sound:', len(r), '| bubble:', await pg.text_content('#bixHome .bubble'))
        await pg.reload(); await pg.wait_for_timeout(1200); await pg.touchscreen.tap(600,790); await pg.wait_for_timeout(4000)
        r=await pg.evaluate("window.__bix.splice(0)"); print('after reload, greeting in boy voice:', [x['id'] for x in r], await pg.evaluate("Fun.BixVoice.tag()"))
        print('errors', errs); await b.close()
asyncio.run(main())
