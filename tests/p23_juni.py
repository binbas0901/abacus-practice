import asyncio, os
from playwright.async_api import async_playwright
# Juni is the default number voice (v4.6): check migration sets voice=juni and the sprite has the needed keys.
async def main():
    errs=[]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820})
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % os.environ.get('PORT','8765'))
        await pg.wait_for_timeout(600)
        v = await pg.evaluate("()=>{try{return JSON.parse(window.__legacy('settings')||'{}').voice}catch(e){return 'ERR'}}")
        assert v=='juni', f"default/migrated Listen voice not juni: {v}"
        got = await pg.evaluate("""async()=>{
          window.__JS=null;
          await new Promise(r=>{const prev=window.__VOICE_LOADED;window.__VOICE_LOADED=(k,m,bb)=>{window.__JS=m.sprite;window.__VOICE_LOADED=prev;r();};
            const s=document.createElement('script');s.src='audio/voice-juni.js?probe=1';s.onerror=r;document.head.appendChild(s);
            setTimeout(r,20000);});
          const sp=window.__JS||{}; return ['n0','n7','n99','p5','m2','hundred','equals','yes','notquite'].map(k=>!!sp[k]);
        }""")
        need=['n0','n7','n99','p5','m2','hundred','equals','yes','notquite']
        missing=[k for k,ok in zip(need,got) if not ok]
        assert not missing, f"juni sprite missing keys: {missing}"
        # migration: a pre-v6 user still on the old 'device' default is upgraded to Juni
        await pg.evaluate("()=>{const s=JSON.parse(window.__legacy('settings')||'{}'); s.voice='device'; s.settingsVersion=5; localStorage.setItem('abacus.settings',JSON.stringify(s));}")
        await pg.reload(); await pg.wait_for_timeout(400)
        mv = await pg.evaluate("()=>{try{return JSON.parse(window.__legacy('settings')||'{}').voice}catch(e){return 'ERR'}}")
        assert mv=='juni', f"device user not migrated to juni: {mv}"
        # a deliberate 'ljspeech' choice is preserved
        await pg.evaluate("()=>{const s=JSON.parse(window.__legacy('settings')||'{}'); s.voice='ljspeech'; s.settingsVersion=5; localStorage.setItem('abacus.settings',JSON.stringify(s));}")
        await pg.reload(); await pg.wait_for_timeout(400)
        lv = await pg.evaluate("()=>{try{return JSON.parse(window.__legacy('settings')||'{}').voice}catch(e){return 'ERR'}}")
        assert lv=='ljspeech', f"deliberate ljspeech not preserved: {lv}"
        assert not errs, f"page errors: {errs[:4]}"
        print("OK voice=juni default; device->juni migration; ljspeech preserved; sprite keys present; no page errors")
        await b.close()
asyncio.run(main())
