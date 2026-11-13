import asyncio, time, re
from playwright.async_api import async_playwright
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active')
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
        ctx = await b.new_context(viewport={'width':1180,'height':820}); await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page(); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(300)

        # A) Old-format recordings (Blob in IndexedDB, as the previous version saved them) must load
        await pg.evaluate("""(async()=>{
          const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','plus','minus','yes','not quite'];
          const sr=22050,n=Math.floor(sr*0.3); const dv=new DataView(new ArrayBuffer(44+n*2)); const s=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
          s(0,'RIFF');dv.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);s(36,'data');dv.setUint32(40,n*2,true);
          for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(i/8)*12000, true);
          const blob=new Blob([dv],{type:'audio/wav'});
          const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onupgradeneeded=()=>q.result.createObjectStore('clips'); q.onsuccess=()=>r(q.result);});
          await new Promise(r=>{const t=db.transaction('clips','readwrite'); words.forEach(w=>t.objectStore('clips').put(blob,w)); t.oncomplete=r;});
          const st=JSON.parse(window.__legacy('settings')||'{}'); st.voice='mine'; st.gap=1; st.settingsVersion=5; localStorage.setItem('abacus.settings',JSON.stringify(st));
        })()"""); await pg.reload(); await pg.wait_for_timeout(500)
        await pg.evaluate("App.startMode('listen')"); await pg.click('#listenGo')
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
        log = await pg.evaluate("window.__diag.lines.join('\\n')")
        print('A) old-format recordings:', 'PASS' if 'audio clock' in log and '33/33' in log else 'FAIL'); print('   ', [l for l in log.split('\n') if 'my voice' in l or 'clips ready' in l][:2])
        await pg.click('#exitDrill')

        # B) Fresh recording of all 33 words via the recorder UI, then auto-switch + playback
        await pg.evaluate("(async()=>{ const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onsuccess=()=>r(q.result);}); await new Promise(r=>{const t=db.transaction('clips','readwrite'); t.objectStore('clips').clear(); t.oncomplete=r;}); const st=JSON.parse(window.__legacy('settings')); st.voice='device'; localStorage.setItem('abacus.settings',JSON.stringify(st)); })()")
        await pg.reload(); await pg.wait_for_timeout(300); await gate(pg)
        await pg.click('#recStart'); await pg.wait_for_timeout(800)
        box = await (await pg.query_selector('#recBtn')).bounding_box()
        for i in range(33):
            await pg.mouse.move(box['x']+30, box['y']+20); await pg.mouse.down(); await pg.wait_for_timeout(450); await pg.mouse.up()
            await pg.wait_for_function(f"!document.querySelector('#recBtn').classList.contains('on')"); await pg.wait_for_timeout(700)
        status = await pg.text_content('#recStatus'); sel = await pg.eval_on_selector('#sVoice','e=>e.value')
        print('B) after 33 words:', status[:70], '| voice selected =', sel)
        await pg.click('#parentDone'); await pg.evaluate("App.startMode('listen')"); await pg.click('#listenGo')
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
        log = await pg.evaluate("window.__diag.lines.join('\\n')")
        print('B) listen uses my voice:', 'PASS' if 'kind=rec' in log and 'audio clock' in log else 'FAIL')
        print('errors:', errs); await b.close()
asyncio.run(main())
