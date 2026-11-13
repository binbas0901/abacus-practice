import asyncio, json
from playwright.async_api import async_playwright
SEED = """(async(dur)=>{
  const words=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred','plus','minus','yes','not quite'];
  const sr=22050,n=Math.floor(sr*dur); const dv=new DataView(new ArrayBuffer(44+n*2)); const s=(o,t)=>{for(let i=0;i<t.length;i++)dv.setUint8(o+i,t.charCodeAt(i))};
  s(0,'RIFF');dv.setUint32(4,36+n*2,true);s(8,'WAVE');s(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);s(36,'data');dv.setUint32(40,n*2,true);
  for(let i=0;i<n;i++) dv.setInt16(44+i*2, Math.sin(i/8)*12000, true);
  const db=await new Promise(r=>{const q=indexedDB.open('abacus-voice',1); q.onupgradeneeded=()=>q.result.createObjectStore('clips'); q.onsuccess=()=>r(q.result);});
  await new Promise(r=>{const t=db.transaction('clips','readwrite'); words.forEach(w=>t.objectStore('clips').put({buf:dv.buffer.slice(0),type:'audio/wav'},w)); t.oncomplete=r;});
})"""
HOOK = """(()=>{ window.__starts=[]; const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when,off,dur){ const r=this.playbackRate.value; const d=(dur!==undefined?dur:this.buffer.duration)/r; window.__starts.push([when||this.context.currentTime, (when||this.context.currentTime)+d]); return o.apply(this,arguments); }; })()"""
async def run(pg, voice, gap, rate=1.0):
    await pg.evaluate("([v,g,r])=>{const st=JSON.parse(window.__legacy('settings')||'{}'); st.voice=v; st.gap=g; st.gapMin=0.5; st.voiceRate=r; st.speakFeedback=false; st.sfx=false; st.settingsVersion=5; localStorage.setItem('abacus.settings',JSON.stringify(st));}", [voice,gap,rate])
    await pg.reload(); await pg.wait_for_timeout(400); await pg.evaluate(HOOK)
    await pg.click('.tile[data-mode=listen]'); await pg.click('#listenGo')
    worst=9; n=0
    for k in range(3):
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=60000)
        st = sorted(x for x in await pg.evaluate("window.__starts.splice(0)") if x[1]-x[0] > 0.02)
        for (a0,a1),(b0,b1) in zip(st, st[1:]): worst=min(worst, b0-a1); n+=1
        await pg.click('#pad [data-k="1"]'); await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(900)
    log=[l for l in (await pg.evaluate("window.__diag.lines")) if 'schedule' in l][:1]
    await pg.click('#exitDrill')
    return worst, n, log
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.evaluate(SEED+"(0.5)")
        for voice,gap,rate in [('mine',0.5,1.0),('mine',0.5,1.4),('mine',3,1.0),('ljspeech',0.5,1.0)]:
            worst,n,log = await run(pg,voice,gap,rate)
            print(f"{voice:9} gap={gap} rate={rate}: {n} sound pairs, smallest gap between sounds = {worst*1000:.0f} ms -> {'PASS (no overlap)' if worst>=-0.001 else 'FAIL overlap'}"); print('   ', log)
        print('errors:', errs); await b.close()
asyncio.run(main())
