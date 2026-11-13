import asyncio, re, json, os
from playwright.async_api import async_playwright
LEGACY = """(async()=>{
  const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','plus','minus','yes','not quite'];
  const sr=48000,n=Math.floor(sr*0.3); const dv=new DataView(new ArrayBuffer(44+n*2)); const s=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
  s(0,'RIFF');dv.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);s(36,'data');dv.setUint32(40,n*2,true);
  for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(i/8)*12000, true);
  const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onupgradeneeded=()=>q.result.createObjectStore('clips'); q.onsuccess=()=>r(q.result);});
  await new Promise(r=>{const t=db.transaction('clips','readwrite'); words.forEach(w=>t.objectStore('clips').put({buf:dv.buffer.slice(0),type:'audio/wav'},w)); t.oncomplete=r;});
  localStorage.setItem('abacus.settings', JSON.stringify({voice:'mine', gap:1, settingsVersion:5, speakFeedback:false}));
  localStorage.setItem('abacus.progress', JSON.stringify({current:'bf_sub_a', nodes:{bf_add_a:{lesson:true,mastered:'auto',hist:[]}}}));
})()"""
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(500)
async def readers(pg, n):
    await pg.evaluate("App.startMode('listen')"); await pg.click('#listenGo'); out=[]
    for k in range(n):
        await pg.wait_for_function("/is reading/.test(document.querySelector('#listenMsg').textContent) || document.querySelector('#listenMsg').textContent==='Listen…'", timeout=20000)
        out.append(await pg.text_content('#listenMsg'))
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
        await pg.click('#pad [data-k="1"]'); await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1000)
    await pg.click('#exitDrill'); return out
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+extra) if extra else ''))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'])
        ctx = await b.new_context(viewport={'width':1180,'height':820}, accept_downloads=True); await ctx.grant_permissions(['microphone'])
        pg = await ctx.new_page(); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate(LEGACY); await pg.reload(); await pg.wait_for_timeout(1500)

        st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        check('1. existing recordings moved into a person', st.get('profiles')==[{'id':'p1','name':'My voice'}] and st.get('voice')=='rec:p1', str(st.get('profiles'))+' voice='+str(st.get('voice')))
        r=await readers(pg,1); check('2. Listen uses the existing recordings', r[0]=='My voice is reading…', r[0])

        await gate(pg)
        await pg.fill('#recName','Dad'); await pg.dispatch_event('#recName','change'); await pg.wait_for_timeout(400)
        await pg.fill('#recNew','Mom'); await pg.click('#recAdd'); await pg.wait_for_timeout(600)
        check('3. add Mom', 'Mom' in await pg.text_content('#recWho'), (await pg.text_content('#recStatus'))[:60])
        await pg.click('#recStart'); await pg.wait_for_timeout(800)
        box = await (await pg.query_selector('#recBtn')).bounding_box()
        for i in range(33):
            await pg.mouse.move(box['x']+30, box['y']+20); await pg.mouse.down(); await pg.wait_for_timeout(400); await pg.mouse.up()
            await pg.wait_for_function("!document.querySelector('#recBtn').classList.contains('on')"); await pg.wait_for_timeout(650)
        opts = await pg.eval_on_selector_all('#sVoice option','els=>els.map(e=>[e.value,e.textContent])')
        check('4. Mom recorded all 33; "Take turns" offered', any(v=='rec:turns' for v,_ in opts), ' | '.join(t for v,t in opts if v.startswith('rec:')))
        await pg.select_option('#sVoice','rec:turns'); await pg.wait_for_timeout(800)
        await pg.click('#parentDone'); await pg.wait_for_timeout(300)
        r=await readers(pg,4); check('5. take turns alternates readers', r==['Dad is reading…','Mom is reading…','Dad is reading…','Mom is reading…'], str(r))

        await gate(pg)
        await pg.click('#bkMake'); await pg.wait_for_function("document.querySelector('#bkSave').style.display===''", timeout=30000)
        info = await pg.text_content('#bkInfo')
        async with pg.expect_download() as dl: await pg.click('#bkSave')
        d = await dl.value; path='/tmp/abacus-backup-test.json'; await d.save_as(path)
        data=json.load(open(path)); sizes={k:len(v) for k,v in data['voices']['clips'].items()}
        check('6. backup file has both voices + progress', sizes=={'p1':33,'p2':33} and [c for c in data['children'] if c['id']==data['active']][0]['data']['progress']['current']=='bf_sub_a', f"{info[:70]} | clips={sizes} | {os.path.getsize(path)/1048576:.1f} MB")

        await pg.evaluate("(async()=>{ localStorage.clear(); await new Promise(r=>{const q=indexedDB.deleteDatabase('abacus-voice'); q.onsuccess=q.onerror=q.onblocked=()=>r();}); })()")
        await pg.reload(); await pg.wait_for_timeout(1000)
        st=json.loads(await pg.evaluate("window.__legacy('settings')") or '{}')
        check('7. device wiped (simulated)', not st.get('profiles'), str(st.get('profiles')))
        await gate(pg)
        await pg.set_input_files('#bkFile', path); await pg.wait_for_selector('.ws-dialog'); await pg.click('.ws-dialog [data-r="1"]'); await pg.wait_for_function("/Restored/.test(document.querySelector('#bkInfo').textContent)", timeout=30000)
        info=await pg.text_content('#bkInfo'); st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        prog=json.loads(await pg.evaluate("window.__legacy('progress')"))
        check('8. restore brings back voices, names, progress', [x['name'] for x in st['profiles']]==['Dad','Mom'] and prog['current']=='bf_sub_a' and st['voice']=='rec:turns', info)
        await pg.click('#parentDone'); r=await readers(pg,2); check('9. restored voices play', r==['Dad is reading…','Mom is reading…'], str(r))

        await gate(pg); await pg.select_option('#recWho','p2'); await pg.wait_for_timeout(300); await pg.click('#recDelete'); await pg.wait_for_selector('.ws-dialog'); await pg.click('.ws-dialog [data-r="1"]'); await pg.wait_for_timeout(800)
        st=json.loads(await pg.evaluate("window.__legacy('settings')")); opts=await pg.eval_on_selector_all('#sVoice option','els=>els.map(e=>e.value)')
        check('10. delete Mom: turns removed, falls back to Dad', [x['name'] for x in st['profiles']]==['Dad'] and 'rec:turns' not in opts and st['voice']=='rec:p1', st['voice'])
        await pg.click('#kidAdd'); await pg.wait_for_timeout(1500)
        st=json.loads(await pg.evaluate("window.__legacy('settings')"))
        check('11. adding a child keeps recorded voices', [x['name'] for x in st['profiles']]==['Dad'], str(st.get('profiles')))
        await pg.evaluate("Store.switchTo(Store.children()[0].id); sessionStorage.setItem('abacus.who','1')"); await pg.reload(); await pg.wait_for_timeout(1200)
        await pg.screenshot(path='/tmp/p2_family_home.png'); await gate(pg); await pg.evaluate("document.querySelector('#recPanel').scrollIntoView()"); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/p2_family_panel.png')
        print('errors:', errs); await b.close()
asyncio.run(main())
