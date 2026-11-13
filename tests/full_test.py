import asyncio, time, re
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
        ctx = await b.new_context(viewport={'width':1180,'height':820}); await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('console: '+m.text) if m.type in('error','warning') and 'favicon' not in m.text else None)
        await pg.goto('http://localhost:8765/index.html')
        # 1 visual regression
        await pg.click('[data-mode=visual]'); await pg.wait_for_timeout(200)
        for i in range(10):
            terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
            ans = sum(int(t) for t in terms) + (1 if i==3 else 0)
            for ch in str(ans): await pg.click(f'[data-k="{ch}"]')
            await pg.click('[data-k=go]'); await pg.wait_for_timeout(1100)
        await pg.wait_for_selector('#summary.active'); print('visual:', await pg.text_content('#sumScore'))
        await pg.click('#homeBtn')
        # 2 listening, device voice (no TTS voices headless -> still completes)
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({gap:1, voice:'device', settingsVersion:4}))"); await pg.reload()
        await pg.click('[data-mode=listen]'); t0=time.time()
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000); print('listen device: %.1fs'%(time.time()-t0))
        await pg.click('#exitDrill')
        # 3 listening, sprite
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({gap:1, voice:'ljspeech', settingsVersion:4}))"); await pg.reload()
        await pg.click('[data-mode=listen]'); t0=time.time()
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=60000); print('listen sprite: %.1fs (expect ~4.5)'%(time.time()-t0))
        await pg.click('#exitDrill')
        # 4 recorder
        await pg.hover('#grownups'); await pg.mouse.down(); await pg.wait_for_timeout(1500); await pg.mouse.up()
        await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk')
        await pg.wait_for_selector('#parent.active')
        await pg.click('#recStart'); await pg.wait_for_timeout(800)
        for i in range(3):
            box = await (await pg.query_selector('#recBtn')).bounding_box()
            await pg.mouse.move(box['x']+20, box['y']+20); await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up(); await pg.wait_for_timeout(900)
        print('rec status:', await pg.text_content('#recStatus'), '| word now:', await pg.text_content('#recWord'))
        n = await pg.evaluate("(async()=>{const r=indexedDB.open('abacus-voice',1); return new Promise(res=>{r.onsuccess=()=>{const t=r.result.transaction('clips');const c=t.objectStore('clips').count();c.onsuccess=()=>res(c.result);}})})()")
        print('clips stored:', n)
        await pg.screenshot(path='/tmp/s_rec.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
