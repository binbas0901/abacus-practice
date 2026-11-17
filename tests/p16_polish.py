# v4.1: Bix's voice and the screen say the same words. "Polish" everywhere a sum is not right yet (never "fix", "red ones"
# or "green beads"), and the home bubble's sentence about the moon is spoken too, in both voices.
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
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3200)
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
                if i in (1,4,7,8): oops.append(await pg.evaluate("document.querySelector('#bixDrill .tp-btxt').textContent"))
                await pg.wait_for_timeout(750)
            check(f'{voice}: a miss in the set -> one of Bix\'s three lines, as recorded (never "fix")', all(o in (LINES['oops_1'], LINES['oops_2'], "That's OK. Next one!") for o in oops), oops)
            await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(600); note = (await pg.text_content('#sumNote')).strip()
            check(f'{voice}: summary with 4 to polish ends with the words Bix says next: "Let\'s polish these together."', norm(note).endswith(norm(LINES['fix_start'])) and not bad.search(await pg.evaluate("document.querySelector('#summary').innerText")), note)
            await collect_all(pg); await said(pg)
            await pg.click('#sumSay'); await pg.wait_for_timeout(6500); r = await said(pg)
            check(f'{voice}: tap the speaker on the summary -> the whole note is spoken (praise, then "Let\'s polish these together.")', len(r)==2 and r[1]['id']=='fix_start' and r[1]['key']==pack and norm(note)==norm(' '.join(LINES[x['id']] for x in r)), ([(x['key'],x['id']) for x in r], note))
            await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(700); r = await said(pg)
            check(f'{voice}: Polish these with Bix -> he says and shows "Let\'s polish these together." (new recording), chip says "Polishing"', len(r)==1 and (r[0]['key'], r[0]['id'])==(pack,'fix_start') and r[0]['text'].replace('’', "'")==LINES['fix_start'] and (await pg.text_content('#fixLabel')).strip()=='Polishing', r)
            n = 0
            while not await pg.locator('#summary.active').count() and n < 8:
                await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0"); d = await pg.evaluate("window.__drill()")
                await answer(pg, d['answer']); await pg.wait_for_timeout(250)
                if n == 0: check(f'{voice}: right in the polish pass -> "Polished!"', (await pg.text_content('#feedback')).strip()=='Polished!', await pg.text_content('#feedback'))
                await pg.wait_for_timeout(900); n += 1
            await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(3000); r = [x for x in await said(pg) if x['id']=='sum_fixed']; note = (await pg.text_content('#sumNote')).strip()
            check(f'{voice}: all polished -> he says and shows "All polished! So shiny!" (new recording)', len(r)==1 and r[0]['key']==pack and note==LINES['sum_fixed']=='All polished! So shiny!', (r, note))
            if voice == 'sweet': await pg.screenshot(path='/tmp/toy-open/p16_all_polished.png')
            # ---- one to polish ----
            await pg.click('#homeBtn'); await pg.wait_for_timeout(300); await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
            for i in range(10):
                await pg.wait_for_function("window.__drill().terms && document.querySelectorAll('#problemArea .term').length>0"); d = await pg.evaluate("window.__drill()")
                await answer(pg, d['answer']+1 if i==3 else d['answer']); await pg.wait_for_timeout(1100)
            await pg.wait_for_selector('#summary.active'); await collect_all(pg); await pg.wait_for_timeout(300); await said(pg)
            await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(700); r = await said(pg)
            check(f'{voice}: Polish this with Bix -> "Let\'s polish this one together."', len(r)==1 and (r[0]['key'], r[0]['id'])==(pack,'fix_one') and r[0]['text'].replace('’', "'")==LINES['fix_one'], r)
            check(f'{voice}: recorded clips have a sensible length', all(1.0 < v[1] < 6 for v in (await pg.evaluate("k=>Fun.BixVoice.map[k]", pack)).values()), await pg.evaluate("k=>Fun.BixVoice.map[k]", pack))
            print('errors:', errs); await ctx.close()
        await b.close()
asyncio.run(main())
