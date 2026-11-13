# Practice screen (stream B): on-screen beads + method feedback, keypad path, end of set, fix the red ones,
# show me on the beads, level test -> certificate, and the hasAbacus default.
# Optional: SHOTS=/dir saves screenshots of each screen; VP=1180x820 sets the viewport.
import asyncio, os, re, json
from playwright.async_api import async_playwright
PORT = os.environ.get('PORT', '8765'); SHOTS = os.environ.get('SHOTS'); VP = os.environ.get('VP', '1180x820')
W, H = (int(x) for x in VP.split('x'))
SEED = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_init.js')).read()
res = []
def check(label, ok, extra=''): res.append(ok); print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if extra else ''))
async def shot(pg, name):
    if SHOTS: await pg.wait_for_timeout(450); await pg.screenshot(path=f'{SHOTS}/{name}_{VP}.png')
async def collect_all(pg):
    while True:
        try: await pg.wait_for_selector('#stickerReveal.active', timeout=3200)
        except Exception: return
        await pg.click('#rvPack', force=True); await pg.wait_for_timeout(450); await pg.click('#rvOk'); await pg.wait_for_timeout(350)
async def drill(pg): return await pg.evaluate("window.__drill()")
# every visible child button on these screens is at least 60px (the grown-up speed control may be 44px)
SMALL = "(sel)=>[...document.querySelectorAll(sel+' button')].filter(b=>b.getClientRects().length && getComputedStyle(b).visibility!=='hidden').map(b=>[b.id||b.dataset.k||b.textContent.trim(), b.getBoundingClientRect()]).filter(([n,r])=>Math.min(r.width,r.height)<(n==='speedBtn'?44:60)).map(([n,r])=>n+':'+Math.round(r.width)+'x'+Math.round(r.height))"
async def bubble(pg): return (await pg.text_content('#bixDrill .tp-bubble')).strip()
async def keypad(pg, v):
    for ch in str(v): await pg.click(f'#pad [data-k="{ch}"]')
    await pg.click('#pad [data-k=go]')

# ---- on-screen soroban driving: one tap = one move, like a child's finger ----
def digit(v, rod): return (v // 10 ** rod) % 10
async def tap(pg, rod, kind, k=0):
    sel = f'#abHost .abx-rod[data-rod="{rod}"] .abx-bead[data-kind="{kind}"]' + (f'[data-k="{k}"]' if kind == 'e' else '') + ' .abx-lens'
    await pg.click(sel)
async def do_action(pg, cur, a):
    rod, d = a['rod'], a['delta']; v = digit(cur, rod); e = v % 5
    if a['bead'] == 'heaven': await tap(pg, rod, 'h')
    else: await tap(pg, rod, 'e', e + d - 1 if d > 0 else e + d)
    return cur + d * 10 ** rod
async def by_method(pg, cur, term):   # the bead moves a teacher would use (from AbacusInput.checkMethod's plan)
    plan = await pg.evaluate(f"AbacusInput.checkMethod({cur},{term},[]).expected.beads")
    for a in plan: cur = await do_action(pg, cur, a)
    return cur
async def beads_value(pg): return int((await pg.text_content('#answer')).strip())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        errs = []
        async def newpage(settings, progress=None):
            ctx = await b.new_context(viewport={'width': W, 'height': H}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(SEED)
            await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(600)
            await pg.evaluate("s=>localStorage.setItem('abacus.settings', JSON.stringify(s))", settings)
            if progress: await pg.evaluate("p=>{ localStorage.setItem('abacus.progress', JSON.stringify(p)); Store.remove('fun'); }", progress)
            await pg.reload(); await pg.wait_for_timeout(700); return ctx, pg
        base = {'name': 'Mia', 'settingsVersion': 5, 'sfx': False, 'speakFeedback': False, 'gap': 0.5, 'voice': 'ljspeech', 'flashSec': 0.3, 'answerPause': 0}

        # ===== 1. Look: beads with method feedback, keypad, end of set, fix =====
        ctx, pg = await newpage(base)
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
        check('no timer on the child practice screen', await pg.evaluate("!document.querySelector('#timer') && !document.querySelector('#testTime')"))
        kp = await pg.evaluate("""()=>{ const r=k=>document.querySelector(`#pad [data-k="${k}"]`).getBoundingClientRect(); const c=document.querySelector('#checkBtn').getBoundingClientRect(), g=document.querySelector('#padKeys .toy-keypad').getBoundingClientRect();
          return { rows: [r(7).top===r(8).top && r(8).top===r(9).top, r(4).top===r(5).top && r(1).top===r(3).top, r(7).top<r(4).top && r(4).top<r(1).top && r(1).top<r(0).top],
                   delLeft: r('del').left<r(0).left && r('del').top===r(0).top && r(0).width>r(1).width*1.8, checkOutside: c.left>=g.right-1 || c.top>=g.bottom-1, kit: !!document.querySelector('#padKeys .toy-keypad') }; }""")
        check('keypad is the kit keypad: 7-8-9 / 4-5-6 / 1-2-3, then ⌫ left + wide 0, the teal check dome outside the grid', all(kp['rows']) and kp['delLeft'] and kp['checkOutside'] and kp['kit'], kp)
        d = await drill(pg); check('physical abacus (default) -> keypad first, with a "Use the beads" switch', d['tool'] == 'keys' and 'Use the beads' in await pg.text_content('#toolSwitch'))
        check('problem shown as stacked tiles, first unsigned', await pg.evaluate("document.querySelectorAll('#problemArea .tp-term.term').length") == len(d['terms'])
              and not re.search(r'[+−]', await pg.text_content('#problemArea .term')))
        await pg.click('#toolSwitch'); await pg.wait_for_timeout(250)
        d = await drill(pg); check('"Use the beads" -> on-screen soroban, choice remembered', d['tool'] == 'beads' and await pg.evaluate("Fun.data.answerTool") == 'beads' and await pg.locator('#abHost .abx-svg').is_visible())
        check('Look + beads: first tile is outlined as "now"', await pg.evaluate("document.querySelector('#problemArea .term').classList.contains('now')"))
        # problem 1: every number the soroban way
        cur = 0
        for i, t in enumerate(d['terms']):
            cur = await by_method(pg, cur, t)
            if i == 0: ticked = await pg.evaluate("document.querySelector('#problemArea .term').classList.contains('done') && document.querySelectorAll('#problemArea .term')[1].classList.contains('now')")
        check('beads reach the first number -> its tile is ticked, the next is "now"', ticked)
        check('readout shows what the beads show', await beads_value(pg) == d['answer'], await beads_value(pg))
        await pg.wait_for_timeout(1000); await shot(pg, 'practice_beads')
        await pg.click('#checkBtn'); await pg.wait_for_timeout(200); bt = await bubble(pg)
        st = (await drill(pg))['strip']
        check('beads, right answer, right method -> green bead, Bix praises (no hint)', 'ok' in st[0] and 'Try' not in bt, bt)
        await pg.wait_for_timeout(1200)
        # problem 2: right number, but with extra bead moves -> still green, gentle hint
        d = await drill(pg); cur = 0
        for t in d['terms'][:-1]: cur = await by_method(pg, cur, t)
        await tap(pg, 2, 'h'); cur += 500          # a stray bead on the hundreds rod...
        cur = await by_method(pg, cur, d['terms'][-1])
        await tap(pg, 2, 'h'); cur -= 500          # ...put back: right number, not the soroban way
        await pg.click('#checkBtn'); await pg.wait_for_timeout(250); bt = await bubble(pg); st = (await drill(pg))['strip']
        check('right answer, other method -> still green, never marked wrong', 'ok' in st[1] and 'bad' not in st[1], st[1])
        check('...and Bix gives gentle method feedback', bt.startswith(f"Yes, {d['answer']}!") and len(bt) > len(f"Yes, {d['answer']}!") + 8, bt)
        await shot(pg, 'practice_method_hint')
        await pg.wait_for_timeout(2900)
        # problem 3: wrong number on the beads
        d = await drill(pg); cur = 0
        for t in d['terms']: cur = await by_method(pg, cur, t)
        e = digit(cur, 0) % 5
        await tap(pg, 0, 'e', e if e < 4 else 0)
        await pg.click('#checkBtn'); await pg.wait_for_timeout(300); st = (await drill(pg))['strip']
        check('beads, wrong answer -> red bead to fix later', 'bad' in st[2], st)
        await pg.wait_for_timeout(900)
        # the rest with the keypad
        await pg.click('#toolSwitch'); await pg.wait_for_timeout(200)
        check('"Type it instead" -> keypad, remembered', (await drill(pg))['tool'] == 'keys' and await pg.evaluate("Fun.data.answerTool") == 'keys')
        for i in range(3, 10):
            d = await drill(pg); await keypad(pg, d['answer'] + (1 if i == 5 else 0)); await pg.wait_for_timeout(1050)
        await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(500)
        head = await pg.text_content('#sumScore'); text = await pg.text_content('#summary')
        check('end of set: "8 green beads!" headline, no N/10 score', head.strip() == '8 green beads!' and not re.search(r'\d+\s*/\s*\d+', text), head)
        check('end of set: 10 beads (8 green dropped in the bowl, 2 red on the mat)', await pg.evaluate("document.querySelectorAll('#sumStars .tp-b:not(.tp-gold), #sumFix .tp-b').length") == 10 and await pg.evaluate("document.querySelectorAll('#sumStars .tp-b.in:not(.tp-gold)').length") == 8 and await pg.evaluate("document.querySelectorAll('#sumFix .tp-b').length") == 2)
        check('end of set: golden bead chip + "Fix the red ones" + "I\'m done"', await pg.locator('#sumGold').is_visible() and 'golden bead' in await pg.text_content('#sumGold')
              and await pg.locator('#fixBtn').is_visible() and await pg.locator('#homeBtn').is_visible())
        await shot(pg, 'end_of_set')
        check('child targets >= 60px on the end of set', not await pg.evaluate(SMALL, '#summary'), await pg.evaluate(SMALL, '#summary'))
        await pg.wait_for_timeout(2600)
        check('end of set: no floating "+n" toast over the headline / bead rod (rewards go to the top-right chip)', await pg.evaluate("""()=>[...document.querySelectorAll('.beadfloat')].every(f=>getComputedStyle(f).display==='none')"""))
        await collect_all(pg)
        # fix the red ones
        await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(2500)
        d = await drill(pg)
        check('fix: "Fixing" rod with only the red ones', await pg.locator('#fixLabel').is_visible() and await pg.evaluate("document.querySelectorAll('#strip .tp-b').length") == 2 and d['reviewing'] and d['idx'] == 2)
        check('fix: Bix "This one was tricky. Want me to show you first?" + indigo Show me', 'tricky' in await bubble(pg) and await pg.locator('#showMeBtn').is_visible())
        await shot(pg, 'fix')
        check('child targets >= 60px on the practice screen', not await pg.evaluate(SMALL, '#drill'), await pg.evaluate(SMALL, '#drill'))
        # show me on the on-screen soroban
        await pg.click('#toolSwitch'); await pg.wait_for_timeout(200)
        await pg.click('#showMeBtn'); seen = set()
        for _ in range(150):
            seen.add(await beads_value(pg))
            if _ == 12: await shot(pg, 'fix_showme_beads')
            if not await pg.evaluate("document.querySelector('#answerTool').classList.contains('demo')"): break
            await pg.wait_for_timeout(200)
        check('Show me with beads in use -> Bix demonstrates on her soroban, then hands it back cleared', d['answer'] in seen and await beads_value(pg) == 0 and not await pg.locator('#showme.active').count(), sorted(seen))
        cur = 0
        for t in d['terms']: cur = await by_method(pg, cur, t)
        await pg.click('#checkBtn'); await pg.wait_for_timeout(300)
        check('fix: right answer -> that bead turns green', 'fixed' in (await drill(pg))['strip'][2])
        await pg.wait_for_timeout(900)
        # second red one with the keypad: wrong -> show me card -> right
        await pg.click('#toolSwitch'); await pg.wait_for_timeout(200); d = await drill(pg)
        await keypad(pg, d['answer'] + 1); await pg.wait_for_selector('#showme.active', timeout=8000); await pg.wait_for_timeout(2400); await shot(pg, 'showme_card')
        check('Show me card uses the practice soroban (AbacusInput, read-only demo)', await pg.evaluate("!!document.querySelector('#showmeAbacus .abx.abx-readonly .abx-svg') && !document.querySelector('#showmeAbacus .abx-rod[tabindex]')"))
        await pg.click('#showmeClose'); await pg.wait_for_timeout(400)
        check('fix: wrong with keypad -> Show me card -> same problem again', (await drill(pg))['idx'] == d['idx'])
        await keypad(pg, d['answer']); await pg.wait_for_selector('#summary.active', timeout=6000)
        check('all fixed -> 10 green beads, "All fixed"', (await pg.text_content('#sumScore')).strip() == '10 green beads!' and 'All fixed' in await pg.text_content('#sumNote'))
        await shot(pg, 'end_all_fixed')
        await ctx.close()

        # ===== 2. mastery -> Level test offer -> pass -> certificate =====
        prog = {'current': 'bf_add_a', 'nodes': {k: {'lesson': True, 'mastered': 'parent', 'hist': []} for k in ['beads', 'add_direct', 'sub_direct', 'sf_add', 'sf_sub']}}
        prog['nodes']['bf_add_a'] = {'lesson': True, 'mastered': None, 'hist': [{'ok': True, 'day': '2026-11-11'}] * 12}
        ctx, pg = await newpage(base, prog)
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
        for i in range(10):
            d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(800)
        await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(400)
        check('skill mastered -> end of set offers the Level test', await pg.locator('#testBtn').is_visible() and not await pg.locator('#fixBtn').is_visible())
        lay = await pg.evaluate("""()=>{ const t=document.querySelector('#testBtn').getBoundingClientRect(), h=document.querySelector('#homeBtn').getBoundingClientRect(); return Math.abs(t.top-h.top)<2 && t.right<=h.left; }""")
        check('...Level test sits in the same button row as "I\'m done" (same layout as Fix / Play again)', lay)
        await pg.wait_for_timeout(1700)
        check('...new skill reward lands in the top-right chips, not over the headline', await pg.locator('#sumNew').is_visible() and await pg.evaluate("""()=>{ const a=document.querySelector('#sumRewards').getBoundingClientRect(), h=document.querySelector('#sumScore').getBoundingClientRect(), r=document.querySelector('#sumStars').getBoundingClientRect();
              const hit=(x,y)=>!(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top); return !hit(a,h) && !hit(a,r); }"""))
        await shot(pg, 'end_mastered')
        await collect_all(pg)
        await pg.click('#testBtn'); await pg.wait_for_selector('#drill.active'); d = await drill(pg)
        check('level test runs in the practice layout with NO visible time beads or countdown (timing is silent)', d['levelTest'] and not await pg.locator('#testTime').count()
              and await pg.evaluate("document.querySelectorAll('#drill .tp-top svg').length") == len(d['strip']) + 2
              and not re.search(r'second|time left|hurry', await pg.text_content('#drill'), re.I) and not await pg.locator('#showMeBtn').is_visible())
        await shot(pg, 'level_test')
        n = len(d['strip'])
        for i in range(n):
            d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(450)
        await pg.wait_for_selector('#certificate.active', timeout=5000); await pg.wait_for_timeout(300)
        check('level test passed -> certificate with name, skill and date', (await pg.text_content('#certName')) == 'Mia' and 'Big friends' in await pg.text_content('#certSkill') and len(await pg.text_content('#certDate')) > 6)
        certs = await pg.evaluate("Store.get('certificates')")
        check('certificate saved per child as {nodeId,title,date,accuracy}', isinstance(certs, list) and len(certs) == 1 and set(certs[0]) == {'nodeId', 'title', 'date', 'accuracy'} and certs[0]['nodeId'] == 'bf_add_a' and certs[0]['accuracy'] == 1, certs)
        await pg.evaluate("()=>{ window.print=()=>{ window.__printed=(window.__printed||0)+1; }; }"); await pg.click('#certPrint'); await pg.wait_for_timeout(300)
        check('certificate: printing/sharing asks for a grown-up first (Kids Category)', await pg.is_visible('#gate') and not await pg.evaluate("window.__printed"))
        await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_timeout(300)
        check('certificate is printable after the gate, and returns to the certificate (window.print)', await pg.evaluate("window.__printed") == 1 and await pg.is_visible('#certificate'))
        check('certificate: one way out (Done, no duplicate X) and a printer icon on Print', not await pg.locator('#certClose').count() and await pg.evaluate("document.querySelector('#certPrint svg').innerHTML.includes('M6 9V3h12v6')"))
        await shot(pg, 'certificate')
        await collect_all(pg)
        await pg.click('#certDone'); await pg.wait_for_selector('#home.active')
        # not-yet pass: Bix encourages and suggests practice
        await pg.evaluate("LevelTest.start('bf_add_a')"); await pg.wait_for_selector('#drill.active'); n = len((await drill(pg))['strip'])
        for i in range(n):
            d = await drill(pg); await keypad(pg, d['answer'] + (1 if i % 2 else 0)); await pg.wait_for_timeout(450)
        await pg.wait_for_selector('#summary.active', timeout=5000)
        check('level test not passed -> encouragement + Practise, no new certificate', 'Practise' in await pg.text_content('#againBtn') and await pg.locator('#againBtn').is_visible()
              and len(await pg.evaluate("Store.get('certificates')")) == 1 and 'again' in await pg.text_content('#sumNote'))
        await shot(pg, 'level_test_notyet')
        await ctx.close()

        # ===== 3. no abacus at home -> beads by default, last choice remembered =====
        ctx, pg = await newpage(dict(base, hasAbacus=False))
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
        check('no physical abacus -> on-screen soroban by default, "Type it instead"', (await drill(pg))['tool'] == 'beads' and 'Type it instead' in await pg.text_content('#toolSwitch'))
        # multiplication on the beads: its own Bix line, rods sized to the answer
        await pg.evaluate("__drillSet([26,6],'mul','beads')"); await pg.wait_for_timeout(200); bt = await bubble(pg)
        check('mul on beads: Bix says work it out, then show the answer (not "for each number")', 'show the answer on the beads' in bt and 'each number' not in bt, bt)
        await pg.evaluate("__drillSet([748,9],'mul','beads')"); await pg.wait_for_timeout(200)
        r3 = await pg.evaluate("document.querySelectorAll('#abHost .abx-rod').length")
        await pg.evaluate("__drillSet([4867,9],'mul','beads')"); await pg.wait_for_timeout(200)
        r5 = await pg.evaluate("document.querySelectorAll('#abHost .abx-rod').length")
        fits = await pg.evaluate("(()=>{ const a=document.querySelector('#abHost .abx-svg').getBoundingClientRect(); return a.left>=0 && a.right<=innerWidth && a.bottom<=innerHeight && a.height>120; })()")
        check('mul on beads: rods sized to the answer (3-digit×1 -> 4 rods, 4-digit×1 -> 5 rods), abacus fits the screen', r3 == 4 and r5 == 5 and fits, (r3, r5))
        await shot(pg, 'mul_beads')
        # long rows: ONE column of smaller tiles, up to 10 numbers of 4 digits, never clipped
        for terms in ([7, 9, 9, -5, -1, -7, -7, -1, 2, 8], [6155, -3294, 4896, 8102, 1234, -2345, 3456, 4567, -1111, 2222]):
            for tool in ('keys', 'beads'):
                await pg.evaluate("([t,tool])=>__drillSet(t,null,tool)", [terms, tool]); await pg.wait_for_timeout(250)
                g = await pg.evaluate("""()=>{ const ts=[...document.querySelectorAll('#problemArea .tp-term')].map(t=>t.getBoundingClientRect());
                  return { n: ts.length, oneCol: ts.every(r=>Math.abs(r.left-ts[0].left)<1), down: ts.every((r,i)=>!i||r.top>=ts[i-1].bottom),
                    inView: ts.every(r=>r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth), digitsFit: [...document.querySelectorAll('#problemArea .tp-term')].every(t=>t.scrollWidth<=t.clientWidth+1) }; }""")
                check(f'long row ({len(terms)} numbers, {len(str(abs(terms[0])))} digits, {tool}): one column, top to bottom, nothing clipped', g['n'] == 10 and g['oneCol'] and g['down'] and g['inView'] and g['digitsFit'], g)
        await shot(pg, 'long_row')
        await pg.click('#toolSwitch'); await pg.click('#exitDrill'); await pg.reload(); await pg.wait_for_timeout(600)
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active')
        check('...but her last choice wins next time', (await drill(pg))['tool'] == 'keys')
        await pg.click('#exitDrill')
        # listen + flash screens (layout)
        await pg.evaluate("App.startMode('listen')"); await pg.wait_for_selector('#listenGo', state='visible')
        check('Listen: numbers hidden, listening card + Ready, speed behind a small control', await pg.evaluate("getComputedStyle(document.getElementById('problemArea')).display==='none'")
              and await pg.locator('#speedBtn').is_visible() and not await pg.locator('#speedPop').is_visible())
        await shot(pg, 'listen_ready')
        check('child targets >= 60px on Listen', not await pg.evaluate(SMALL, '#drill'), await pg.evaluate(SMALL, '#drill'))
        fit = "(()=>{ const els=['#checkBtn','#toolSwitch','#listenStage','#flashStage'].map(q=>document.querySelector(q)).concat([...document.querySelectorAll('#answerTool .abx-svg, #padKeys .toy-keypad')]).filter(e=>e.getClientRects().length); return els.every(e=>{ const r=e.getBoundingClientRect(); return r.bottom<=innerHeight && r.right<=innerWidth && r.left>=0; }); })()"
        for k in range(2):
            ok = await pg.evaluate(fit); await pg.click('#toolSwitch'); await pg.wait_for_timeout(150)
            check(f'Listen ({(await drill(pg))["tool"]=="keys" and "beads" or "keys"}): card, answer tool and Check all fit on screen', ok)
        off = "document.querySelector('#checkBtn').disabled && [...document.querySelectorAll('#pad [data-k]')].filter(b=>b.dataset.k!=='go').every(b=>b.disabled) && document.querySelector('#answerTool').classList.contains('waiting')"
        check('Listen: keypad + Check disabled (dimmed) before the numbers are read', await pg.evaluate(off))
        await pg.click('#listenGo'); await pg.wait_for_timeout(150)
        check('Listen: ...and still disabled while Bix reads', await pg.evaluate(off) or await pg.text_content('#listenMsg') == 'Your answer?')
        await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000); await shot(pg, 'listen_answer')
        check('Listen: "Your answer?" -> keypad + Check live', await pg.evaluate("!document.querySelector('#checkBtn').disabled && !document.querySelector('#pad [data-k=\"5\"]').disabled && !document.querySelector('#answerTool').classList.contains('waiting')"))
        await pg.click('#speedBtn'); check('speed control opens the slider', await pg.locator('#gapSlider').is_visible()); await shot(pg, 'listen_speed'); await pg.click('#speedBtn')
        await pg.click('#exitDrill'); await pg.evaluate("App.startMode('flash')"); await pg.wait_for_selector('#flashGo', state='visible'); await shot(pg, 'flash_ready')
        check('Flash: keypad + Check disabled (dimmed) until the numbers have flashed', await pg.evaluate(off))
        check('Flash: card, answer tool and Check all fit on screen', await pg.evaluate(fit))
        await pg.click('#flashGo'); await pg.wait_for_function("document.querySelector('#flashNum').textContent==='= ?'", timeout=20000); await shot(pg, 'flash_ask')
        check('Flash: "= ?" -> keypad + Check live', await pg.evaluate("!document.querySelector('#checkBtn').disabled && !document.querySelector('#answerTool').classList.contains('waiting')"))
        d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(900)
        check('Flash: Ready -> flash -> "= ?" -> answer -> next problem', (await drill(pg))['idx'] == 1 and 'ok' in (await drill(pg))['strip'][0])
        await ctx.close()

        # ===== 4. fix pass 2: every iPad size (landscape, portrait, 12.9" Pro) =====
        SETNODE = """(node)=>{ const p=Store.get('progress')||{nodes:{}}; p.nodes=p.nodes||{}; App.nodes().forEach(n=>{ if(App.idx(n.id)<App.idx(node)) p.nodes[n.id]={lesson:true,mastered:'parent',hist:[]}; }); p.current=node; p.nodes[node]={lesson:true,mastered:null,hist:[]}; Store.set('progress',p); }"""
        FIT = """()=>{ const ts=[...document.querySelectorAll('#problemArea .tp-term')], rs=ts.map(t=>t.getBoundingClientRect()), d=document.querySelector('#drill');
          const tool=[...document.querySelectorAll('#checkBtn, #answerTool .abx-svg, #padKeys .toy-keypad')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());
          return { n: ts.length, oneCol: rs.every(r=>Math.abs(r.left-rs[0].left)<1), down: rs.every((r,i)=>!i||r.top>=rs[i-1].bottom),
            inView: rs.concat(tool).every(r=>r.top>=0 && r.bottom<=innerHeight+0.5 && r.left>=0 && r.right<=innerWidth), digitsFit: ts.every(t=>t.scrollWidth<=t.clientWidth+1),
            noScroll: d.scrollHeight<=d.clientHeight && document.scrollingElement.scrollHeight<=innerHeight, h: Math.round(rs[0].height), font: parseFloat(getComputedStyle(ts[0]).fontSize) }; }"""
        BUB = "(()=>{ const r=document.querySelector('#bixDrill .tp-bubble').getBoundingClientRect(), s=document.querySelector('#bixDrill .tp-say'); return [Math.round(r.left),Math.round(r.top),Math.round(r.width),Math.round(r.height), s.getClientRects().length>0 && getComputedStyle(s).visibility==='visible']; })()"
        for (vw, vh) in ((1180, 820), (820, 1180), (1366, 1024)):
            tag = f'{vw}x{vh}'
            ctx = await b.new_context(viewport={'width': vw, 'height': vh}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(SEED)
            await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(500)
            await pg.evaluate("s=>localStorage.setItem('abacus.settings', JSON.stringify(s))", base); await pg.reload(); await pg.wait_for_timeout(500)
            # the real level-4 path: the FIRST problem of a long-rows set (the bubble is not yet on screen when the set starts)
            await pg.evaluate(f"({SETNODE})('long_rows')"); await pg.reload(); await pg.wait_for_timeout(600)
            await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(400)
            g = await pg.evaluate(FIT)
            check(f'{tag}: first problem of a long-rows set fits, one column, no scrolling', g['n'] >= 5 and g['oneCol'] and g['down'] and g['inView'] and g['noScroll'], g)
            for terms in ([7, 9, 9, -5, -1, -7, -7, -1, 2, 8], [6155, -3294, 4896, 8102, 1234, -2345, 3456, 4567, -1111, 2222]):
                for tool in ('keys', 'beads'):
                    await pg.evaluate("([t,tool])=>__drillSet(t,null,tool)", [terms, tool]); await pg.wait_for_timeout(250)
                    g = await pg.evaluate(FIT)
                    check(f'{tag}: 10 numbers, {len(str(abs(terms[0])))} digits, {tool}: one column top to bottom, all on screen, readable (tile >= 48px, digits >= 30px)',
                          g['n'] == 10 and g['oneCol'] and g['down'] and g['inView'] and g['digitsFit'] and g['noScroll'] and g['h'] >= 48 and g['font'] >= 30, g)
                    if tool == 'keys' and len(str(abs(terms[0]))) == 4: await shot(pg, f'long_row_4digit_{tag}')
            # one bubble: same place and size for short and long lines, always the speaker mark
            await pg.evaluate("__drillSet([3,4,-2,5],null,'keys')"); await pg.wait_for_timeout(200)
            geo = []
            for t in ['Yes!', 'Move the beads for each number, then tap Check.', 'This one was tricky. Want me to show you first?']:
                await pg.evaluate("t=>__drillSay(t)", t); await pg.wait_for_timeout(60); geo.append(await pg.evaluate(BUB))
            await pg.evaluate("__drillSet([6155,-3294,4896,8102,1234,-2345,3456,4567,-1111,2222],null,'keys')"); await pg.wait_for_timeout(200)
            await pg.evaluate("t=>__drillSay(t)", 'Nice!'); await pg.wait_for_timeout(60); geo.append(await pg.evaluate(BUB))
            check(f'{tag}: Bix bubble keeps one place and size (short / long line, short / long row) and always shows the speaker mark',
                  all(x[:4] == geo[0][:4] for x in (geo[:3] if vw < vh else geo)) and all(x[4] and x[2] >= 320 and x[3] == geo[0][3] for x in geo), geo)   # portrait long rows: Bix sits beside the tall sheet
            # instant right / wrong on the answer box and the bead on the rod
            await pg.evaluate("__drillSet([3,4,-2,5],null,'keys')"); await pg.wait_for_timeout(200)
            await keypad(pg, 10); await pg.wait_for_timeout(220)
            st = await pg.evaluate("[document.querySelector('#readout').className, document.querySelector('#strip .tp-b.cur').className, getComputedStyle(document.querySelector('#readout')).backgroundColor]")
            check(f'{tag}: right answer -> answer box teal (is-right) + its rod bead teal with a pop, instantly', 'is-right' in st[0] and 'ok' in st[1] and 'tp-pop' in st[1] and 'is-wrong' not in st[0], st)
            await shot(pg, f'right_{tag}')
            await pg.wait_for_timeout(900); d = await drill(pg)
            check(f'{tag}: next problem -> answer box back to plain', not await pg.evaluate("document.querySelector('#readout').classList.contains('is-right')"))
            await keypad(pg, d['answer'] + 1); await pg.wait_for_timeout(220)
            st = await pg.evaluate("[document.querySelector('#readout').className, document.querySelector('#strip .tp-b.cur').className, getComputedStyle(document.querySelector('#readout')).backgroundColor]")
            check(f'{tag}: wrong answer -> answer box red-rimmed (is-wrong) + its rod bead red with a gentle wobble, instantly', 'is-wrong' in st[0] and 'bad' in st[1] and 'tp-wob' in st[1] and st[2] == 'rgb(255, 231, 222)', st)
            await pg.wait_for_timeout(1000)
            await pg.evaluate("__drillSet([1,1],null,'beads')"); await pg.wait_for_timeout(200)
            await tap(pg, 0, 'e', 1); await pg.click('#checkBtn'); await pg.wait_for_timeout(120)
            check(f'{tag}: beads, right -> the "beads show" box turns jade too', 'is-right' in await pg.evaluate("document.querySelector('#readout').className"))
            await pg.wait_for_timeout(900)
            if vw == 1366:
                await pg.evaluate("__drillSet([3,4,-2,5],null,'keys')"); await pg.wait_for_timeout(250)
                pro = await pg.evaluate("""()=>{ const k=document.querySelector('#padKeys .toy-keypad').getBoundingClientRect(), c=document.querySelector('#checkBtn').getBoundingClientRect(), t=document.querySelector('#problemArea .tp-term').getBoundingClientRect(); return {keyH: Math.round(k.height), checkBottom: Math.round(c.bottom), tileH: Math.round(t.height), key: Math.round(document.querySelector('#pad [data-k="5"]').getBoundingClientRect().height)}; }""")
                check('iPad Pro: practice uses the height (bigger keys and tiles, no 250px band at the bottom)', pro['keyH'] >= 500 and pro['key'] >= 110 and pro['tileH'] >= 100 and pro['checkBottom'] >= vh - 160, pro)
                await shot(pg, 'pro_keys')
            check(f'{tag}: child targets >= 60px on the practice screen', not await pg.evaluate(SMALL, '#drill'), await pg.evaluate(SMALL, '#drill'))
            # sticker reveal: the card hugs the present (no empty band under it)
            await pg.evaluate("()=>{ Fun.give({}); }"); await pg.wait_for_selector('#stickerReveal.active'); await pg.wait_for_timeout(500)
            gap = await pg.evaluate("(()=>{ const c=document.querySelector('#stickerReveal .rv-card').getBoundingClientRect(), k=document.querySelector('#rvPack').getBoundingClientRect(); return Math.round(c.bottom-k.bottom); })()")
            check(f'{tag}: sticker reveal has no empty band under the present', gap <= 60, gap)
            await collect_all(pg)
            await ctx.close()

        # ===== 5. certificate in the Home Screen app: "Save picture" (PNG via share sheet, else download); Print stays in browsers =====
        STAND = "Object.defineProperty(navigator,'standalone',{get:()=>true}); window.__shared=[];"
        SHARE = "navigator.canShare=d=>!!(d&&d.files&&d.files.length); navigator.share=async d=>{ for (const f of d.files){ const bm=await createImageBitmap(f); window.__shared.push({name:f.name,type:f.type,size:f.size,w:bm.width,h:bm.height}); } };"
        for share in (True, False):
            ctx = await b.new_context(viewport={'width': W, 'height': H}, accept_downloads=True); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(SEED); await pg.add_init_script(STAND + SHARE if share else "window.__shared=[]; navigator.canShare=undefined; navigator.share=undefined; window.matchMedia=(q=>{ const m=window.matchMedia; return x=>/display-mode: standalone/.test(x)?{matches:true,addListener(){},removeListener(){}}:m.call(window,x); })();")
            await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(500)
            await pg.evaluate("s=>localStorage.setItem('abacus.settings', JSON.stringify(s))", base); await pg.reload(); await pg.wait_for_timeout(500)
            await pg.evaluate("()=>{ window.print=()=>{ window.__printed=1; }; LevelTest.show({nodeId:'bf_add_a',title:'Big friends: adding',date:'2026-11-13',accuracy:1}); }"); await pg.wait_for_selector('#certificate.active')
            label = (await pg.inner_text('#certPrint')).strip()
            if share:
                await pg.click('#certPrint'); await pg.wait_for_timeout(300); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk')
                await pg.wait_for_function("window.__shared.length>0", timeout=6000); sh = await pg.evaluate("window.__shared")
                check('standalone app: certificate button says "Save picture" and shares a PNG of the certificate (no window.print)',
                      label == 'Save picture' and sh[0]['type'] == 'image/png' and sh[0]['w'] == 1600 and sh[0]['h'] == 1130 and sh[0]['size'] > 20000 and not await pg.evaluate("window.__printed"), (label, sh))
                await shot(pg, 'certificate_standalone')
            else:
                await pg.click('#certPrint'); await pg.wait_for_timeout(300); await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer')))
                async with pg.expect_download(timeout=6000) as dl: await pg.click('#gateOk')
                f = await dl.value
                check('standalone app without a share sheet: the PNG is downloaded instead', label == 'Save picture' and f.suggested_filename.endswith('.png') and not await pg.evaluate("window.__printed"), (label, f.suggested_filename))
            check('child targets >= 60px on the certificate', not await pg.evaluate(SMALL, '#certificate'), await pg.evaluate(SMALL, '#certificate'))
            await ctx.close()
        print('errors:', errs); print('RESULT', sum(res), '/', len(res)); await b.close()
asyncio.run(main())
