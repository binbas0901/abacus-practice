import asyncio, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3200)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def ready(pg, m):
    if m=='visual': await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0")
    elif m=='listen':
        if await pg.locator('#listenGo').is_visible(): await pg.click('#listenGo')
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000)
    else:
        await pg.wait_for_selector('#flashGo', state='visible', timeout=30000); await pg.click('#flashGo')
        await pg.wait_for_function("document.querySelector('#flashNum').classList.contains('ask')", timeout=30000)
async def answer(pg, v):
    for ch in str(v): await pg.click(f'#pad [data-k="{ch}"]')
    await pg.click('#pad [data-k=go]')
async def run(pg, m):
    await pg.evaluate(f"App.startMode('{m}')"); await pg.wait_for_selector('#drill.active')
    WRONG={1,4,7}; seen={}
    for i in range(10):
        await ready(pg, m); d=await pg.evaluate("window.__drill()"); seen[d['idx']]=d['terms']
        await answer(pg, d['answer']+1 if i in WRONG else d['answer']); await pg.wait_for_timeout(1000)
    await pg.wait_for_selector('#summary.active'); await collect_all(pg)
    await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active')
    visited=[]; stages_ok=True; terms_ok=True; first=True
    while True:
        if await pg.locator('#summary.active').count(): break
        await ready(pg, m); d=await pg.evaluate("window.__drill()")
        if not d['reviewing']: break
        visited.append(d['idx'])
        vis = await pg.evaluate("['problemArea','listenStage','flashStage'].map(id=>getComputedStyle(document.getElementById(id)).display!=='none')")
        want = [m=='visual', m=='listen', m=='flash']; stages_ok &= (vis==want)
        if m=='visual':
            shown=[int(t.replace('−','-')) for t in await pg.eval_on_selector_all('#problemArea .term','els=>els.map(e=>e.textContent)')]
            terms_ok &= (shown==seen[d['idx']])
        if m!='visual': terms_ok &= await pg.eval_on_selector('#problemArea','e=>e.children.length===0 || getComputedStyle(e).display==="none"')
        if first:   # first red one: answer wrong once -> Show me -> same problem again
            first=False; before=d['idx']
            await answer(pg, d['answer']+1); await pg.wait_for_selector('#showme.active', timeout=8000); await pg.wait_for_timeout(600); await pg.click('#showmeClose'); await pg.wait_for_timeout(500)
            await ready(pg, m); d2=await pg.evaluate("window.__drill()")
            check(f'{m}: wrong in fix pass -> Show me -> same problem again', d2['idx']==before and d2['reviewing'], f"idx {before}->{d2['idx']}")
            d=d2
        await answer(pg, d['answer']); await pg.wait_for_timeout(500)
        strip=(await pg.evaluate("window.__drill()"))['strip']
        if 'fixed' not in strip[d['idx']]: check(f'{m}: fixed bead turns green', False, strip)
        await pg.wait_for_timeout(700)
    visited_unique=[v for k,v in enumerate(visited) if v not in visited[:k]]
    check(f'{m}: fix pass visits only the red ones, in order', visited_unique==[1,4,7], visited)
    check(f'{m}: stays in {m} mode (no numbers shown for listen/flash)', stages_ok and terms_ok)
    await pg.wait_for_selector('#summary.active'); strip=(await pg.evaluate("window.__drill()"))['strip']
    check(f'{m}: all red beads now green, summary says All fixed', all('ok' in s for s in strip) and 'All fixed' in await pg.text_content('#sumNote'), f"{await pg.text_content('#sumScore')} | {await pg.text_content('#sumNote')}")
    await pg.click('#homeBtn'); await pg.wait_for_timeout(300)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':1180,'height':820}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(1200)
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({settingsVersion:5, sfx:false, speakFeedback:false, gap:0.5, voice:'ljspeech', flashSec:0.3, answerPause:0}))"); await pg.reload(); await pg.wait_for_timeout(800)
        for m in ['visual','listen','flash']: await run(pg, m)
        print('errors:', errs); await b.close()
asyncio.run(main())
