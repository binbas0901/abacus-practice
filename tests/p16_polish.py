# v4.1: the screen's words stay consistent. "Polish" everywhere a sum is not right yet (never "fix", "red ones"
# or "green beads"). Juni now leads the practice reactions, the polish pass and the end-of-set summary (her bubble + moon);
# Bixi reacts alongside (reactVoice). The Bix polish pack still exists in audio/ and is checked for sensible clip lengths.
import asyncio, os, re
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
# every Bix line that starts playing: which recording (main or pack), which line, and the words on screen at that moment
HOOK = r"""(()=>{ window.__said=[]; const o=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(w,off,dur){ try{ const bv=window.Fun&&Fun.BixVoice; const key=bv&&Object.keys(bv.buf).find(k=>bv.buf[k]===this.buffer);
    if (key){ const id=(Object.entries(bv.map[key]).find(([k,v])=>Math.abs(v[0]-off)<0.01)||[])[0];
      window.__said.push({key, id, dur, text:[...document.querySelectorAll('.screen.active .bubble.on, .screen.active .tp-bubble.on, #summary.active .tp-sumnote')].map(b=>b.textContent.replace(/\s+/g,' ').trim()).join(' | ')}); } }catch(e){} return o.apply(this,arguments); }; })()"""
async def said(pg): return await pg.evaluate("window.__said.splice(0)")
norm = lambda s: re.sub(r"[^a-z0-9 ]", '', s.lower().replace('’', "'").replace("'", ''))
async def collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=8000)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def answer(pg, v):
    for ch in str(v): await pg.click(f'#pad [data-k="{ch}"]')
    await pg.click('#pad [data-k=go]')
async def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); port = os.environ.get('PORT', '8765')
    # ---- the words in the files: nothing a child sees or hears says fix / red ones / green beads ----
    bad = re.compile(r"\bfix(ing|es)?\b|\bfixed!|red ones?\b|green beads?", re.I)
    lines = open(os.path.join(root, 'audio', 'bix-lines.js')).read()
    check('Bix lines: no "fix", "red one(s)", "green beads"', not bad.search(lines), bad.findall(lines))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        for voice in ('sweet', 'boy'):
            ctx = await b.new_context(viewport={'width':1180,'height':820}); pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script(open(os.path.join(root, 'tests', 'seed_init.js')).read()); await pg.add_init_script(HOOK)
            await pg.goto(f'http://localhost:{port}/index.html')
            await pg.evaluate("v=>localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false, bixVoice:v}))", voice); await pg.reload(); await pg.wait_for_timeout(2000)
            LINES = await pg.evaluate("window.BIX_LINES"); pack = voice + '-polish'
            if voice == 'sweet':
                vis = await pg.evaluate("[...document.querySelectorAll('.screen')].map(s=>s.innerText||s.textContent).join(' ')")
                check('every screen as loaded: no "fix", "red one(s)", "green beads"', not bad.search(vis), bad.findall(vis))
            # ---- home: the greeting is now the two-speaker classroom (Juni leads, then Bixi's bead countdown) and is
            #      covered by p12_home; here we only unlock audio so the practice-screen BixVoice checks below can play. ----
            await pg.mouse.click(600, 12); await pg.wait_for_timeout(1500); await said(pg)
            await pg.evaluate("{ Fun.data.today.steps.forEach(s=>s.done=false); App.renderHome(); }")
            # ---- practice: polish pass ----
            await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(1500); await said(pg)
            oops = []
            for i in range(10):
                await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0"); d = await pg.evaluate("window.__drill()")
                await answer(pg, d['answer']+1 if i in (1,4,7,8) else d['answer']); await pg.wait_for_timeout(350)
                if i in (1,4,7,8): oops.append(await pg.evaluate("document.querySelector('#drillJuni .ctext').textContent"))
                await pg.wait_for_timeout(750)
            # Juni now leads the miss reaction (one kind reassurance); Bixi's recorded groan plays alongside (reactVoice). Still never "fix".
            check(f'{voice}: a miss in the set -> Juni\'s reassurance on screen (never "fix")', all(norm(o)==norm("That's okay. We'll polish it together.") for o in oops) and not any(bad.search(o) for o in oops), oops)
            await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(600); note = (await pg.text_content('#sumNote')).strip()
            check(f'{voice}: summary with 4 to polish ends with the words Bix says next: "Let\'s polish these together."', norm(note).endswith(norm(LINES['fix_start'])) and not bad.search(await pg.evaluate("document.querySelector('#summary').innerText")), note)
            await collect_all(pg); await said(pg)
            await pg.click('#sumSay'); await pg.wait_for_timeout(1200)
            # Juni is the lead voice at the summary (her bubble + her moon); the written note still reads the praise then the polish line.
            check(f'{voice}: Juni leads the summary (her bubble + moon), the note reads praise then "Let\'s polish these together."', (await pg.get_attribute('#sumJuni', 'data-who'))=='juni' and await pg.evaluate("!!document.querySelector('#sumJuniMoon .toy-moon')") and norm(note).endswith(norm(LINES['fix_start'])), note)
            await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(700)
            check(f'{voice}: Polish these with Bix -> Juni shows "Let\'s polish these together." and the chip says "Polishing"', norm(await pg.text_content('#drillJuni .ctext'))==norm(LINES['fix_start']) and (await pg.text_content('#fixLabel')).strip()=='Polishing', await pg.text_content('#drillJuni .ctext'))
            n = 0
            while not await pg.locator('#summary.active').count() and n < 8:
                await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0"); d = await pg.evaluate("window.__drill()")
                await answer(pg, d['answer']); await pg.wait_for_timeout(250)
                if n == 0: check(f'{voice}: right in the polish pass -> "Polished!"', (await pg.text_content('#feedback')).strip()=='Polished!', await pg.text_content('#feedback'))
                await pg.wait_for_timeout(900); n += 1
            await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(3000); note = (await pg.text_content('#sumNote')).strip()
            check(f'{voice}: all polished -> the summary reads "All polished! So shiny!" (Juni leads)', note==LINES['sum_fixed']=='All polished! So shiny!' and (await pg.get_attribute('#sumJuni', 'data-who'))=='juni', note)
            if voice == 'sweet': await pg.screenshot(path='/tmp/toy-open/p16_all_polished.png')
            # ---- one to polish ----
            await pg.click('#homeBtn'); await pg.wait_for_timeout(300); await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
            for i in range(10):
                await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0"); d = await pg.evaluate("window.__drill()")
                await answer(pg, d['answer']+1 if i==3 else d['answer']); await pg.wait_for_timeout(1100)
            await pg.wait_for_selector('#summary.active'); await collect_all(pg); await pg.wait_for_timeout(300); await said(pg)
            await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(700)
            check(f'{voice}: Polish this with Bix -> Juni shows "Let\'s polish this one together."', norm(await pg.text_content('#drillJuni .ctext'))==norm(LINES['fix_one']), await pg.text_content('#drillJuni .ctext'))
            check(f'{voice}: recorded clips have a sensible length', all(1.0 < v[1] < 6 for v in (await pg.evaluate("k=>Fun.BixVoice.map[k]", pack)).values()), await pg.evaluate("k=>Fun.BixVoice.map[k]", pack))
            print('errors:', errs); await ctx.close()
        await b.close()
asyncio.run(main())
