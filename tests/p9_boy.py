import asyncio, re
from playwright.async_api import async_playwright
HOOK=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'p8_ipad.py')).read().split('HOOK = r"""')[1].split('"""')[0]
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1180,'height':820}, has_touch=True); pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); await pg.add_init_script(HOOK)
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false}))"); await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.tap('#grownups'); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.tap('#gateOk'); await pg.wait_for_timeout(600)
        print('options', await pg.eval_on_selector_all('#sBixVoice option','els=>els.map(e=>e.textContent)'))
        await pg.select_option('#sBixVoice','boy'); await pg.wait_for_timeout(2500)
        r=await pg.evaluate("window.__bix.splice(0)"); print('boy plays on pick:', [(x['id'],x['state']) for x in r], 'tag', await pg.evaluate("Fun.BixVoice.tag()"))
        await pg.tap('#parentDone'); await pg.wait_for_timeout(5000); await pg.evaluate("window.__bix.splice(0)")
        await pg.evaluate("Fun.Mascot.say(document.querySelector('#bixHome'), null, 0, 'yes_5')"); await pg.wait_for_timeout(800)
        r=await pg.evaluate("window.__bix.splice(0)"); print('quiet line yes_5 -> sound:', len(r), '| bubble:', await pg.text_content('#bixHome .bubble'))
        await pg.reload(); await pg.wait_for_timeout(1200); await pg.touchscreen.tap(600,12); await pg.wait_for_timeout(4000)
        r=await pg.evaluate("window.__bix.splice(0)"); print('after reload, greeting in boy voice:', [x['id'] for x in r], await pg.evaluate("Fun.BixVoice.tag()"))
        await ctx.close()
        # ---- offline: the Boy voice is not in the default install; it is saved when a grown-up picks it ----
        def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
        URL='http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')
        BOY="Promise.all(['./audio/bix-boy.js','./audio/bix-boy-home.js','./audio/bix-extra-boy.js'].map(f=>caches.match(f).then(r=>!!r)))"
        ctx=await b.new_context(viewport={'width':1180,'height':820}); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, sfx:false}))"); await pg.reload()
        await pg.evaluate("navigator.serviceWorker.ready.then(()=>new Promise(r=>{ const t=setInterval(()=>caches.match('./audio/voice-ljspeech.js').then(x=>{ if (x){ clearInterval(t); r(); } }), 200); }))"); await pg.wait_for_timeout(2500)
        check('default install does not hold the Boy voice (about 3 MB)', await pg.evaluate(BOY)==[False,False,False], await pg.evaluate(BOY))
        await pg.click('#grownups'); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active')
        await pg.select_option('#sBixVoice','boy')
        for _ in range(60):
            if await pg.evaluate(BOY)==[True,True,True]: break
            await pg.wait_for_timeout(300)
        check('picking Boy saves all three Boy files for offline use', await pg.evaluate(BOY)==[True,True,True], await pg.evaluate(BOY))
        await ctx.set_offline(True); await pg.reload(); await pg.wait_for_selector('#home.active', timeout=15000)
        got=await pg.evaluate("(async()=>{ App.unlock(); await Fun.BixVoice.load(); const x=await new Promise(r=>{ const s=document.createElement('script'); s.src='audio/bix-extra-boy.js'; s.onload=()=>r(true); s.onerror=()=>r(false); document.head.appendChild(s); }); return [Fun.BixVoice.tag(), !!Fun.BixVoice.buf.boy, !!Fun.BixVoice.buf['boy-home'], x]; })()")
        check('offline, after a reload: Bix still talks in the Boy voice (main, home and extra lines)', got==['boy',True,True,True], got)
        await ctx.set_offline(False); await ctx.close()
        # Boy chosen but its files cannot be had (never downloaded, no internet): Bix falls back to the installed voice
        ctx=await b.new_context(viewport={'width':1180,'height':820}, service_workers='block'); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
        await pg.route('**/audio/*boy*', lambda r: r.abort())
        await pg.goto(URL); await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, sfx:false, bixVoice:'boy'}))"); await pg.reload(); await pg.wait_for_selector('#home.active')
        got=await pg.evaluate("(async()=>{ App.unlock(); await Fun.BixVoice.load(); return [Fun.BixVoice.tag(), !!Fun.BixVoice.buf.sweet, !!Fun.BixVoice.find('hello_ready')[0], App.settings.bixVoice]; })()")
        check('Boy cannot be loaded: Bix is not silent, he uses the installed voice (the choice is kept)', got==['sweet',True,True,'boy'], got)
        print('errors', errs); await b.close()
asyncio.run(main())
