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
async def bubble(pg): return (await pg.text_content('#bixDrill .pr-bubble')).strip()
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
async def rebuild(pg, cur, target):   # right number, wrong way: wipe the rods and set the answer
    for rod in range(4):
        v = digit(cur, rod)
        if v >= 5: await tap(pg, rod, 'h'); cur -= 5 * 10 ** rod
        if v % 5: await tap(pg, rod, 'e', 0); cur -= (v % 5) * 10 ** rod
    for rod in range(4):
        v = digit(target, rod)
        if v >= 5: await tap(pg, rod, 'h')
        if v % 5: await tap(pg, rod, 'e', v % 5 - 1)
    return target
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
        await pg.click('.tile[data-mode=visual]'); await pg.wait_for_selector('#drill.active')
        check('no timer on the child practice screen', await pg.evaluate("!document.querySelector('#timer') && document.querySelector('#testTime').hidden"))
        d = await drill(pg); check('physical abacus (default) -> keypad first, with a "Use the beads" switch', d['tool'] == 'keys' and 'Use the beads' in await pg.text_content('#toolSwitch'))
        check('problem shown as stacked tiles, first unsigned', await pg.evaluate("document.querySelectorAll('#problemArea .ws-tile.term').length") == len(d['terms'])
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
        # problem 2: right number, but the beads were wiped and set again -> still green, gentle hint
        d = await drill(pg); cur = 0
        for t in d['terms'][:-1]: cur = await by_method(pg, cur, t)
        await rebuild(pg, cur, d['answer'])
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
        check('end of set: 10 beads on the rod (8 green, 2 red)', await pg.evaluate("document.querySelectorAll('#sumStars .pr-b').length") == 10)
        check('end of set: golden bead chip + "Fix the red ones" + "I\'m done"', await pg.locator('#sumGold').is_visible() and 'golden bead' in await pg.text_content('#sumGold')
              and await pg.locator('#fixBtn').is_visible() and await pg.locator('#homeBtn').is_visible())
        await shot(pg, 'end_of_set')
        await collect_all(pg)
        # fix the red ones
        await pg.click('#fixBtn'); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(2500)
        d = await drill(pg)
        check('fix: "Fixing" rod with only the red ones', await pg.locator('#fixLabel').is_visible() and await pg.evaluate("document.querySelectorAll('#strip .pr-b').length") == 2 and d['reviewing'] and d['idx'] == 2)
        check('fix: Bix "This one was tricky. Want me to show you first?" + indigo Show me', 'tricky' in await bubble(pg) and await pg.locator('#showMeBtn').is_visible())
        await shot(pg, 'fix')
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
        await pg.click('.tile[data-mode=visual]'); await pg.wait_for_selector('#drill.active')
        for i in range(10):
            d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(800)
        await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(400)
        check('skill mastered -> end of set offers the Level test', await pg.locator('#testBtn').is_visible() and not await pg.locator('#fixBtn').is_visible())
        await shot(pg, 'end_mastered')
        await collect_all(pg)
        await pg.click('#testBtn'); await pg.wait_for_selector('#drill.active'); d = await drill(pg)
        check('level test runs in the practice layout with time beads (only here)', d['levelTest'] and await pg.locator('#testTime').is_visible()
              and await pg.evaluate("document.querySelectorAll('#testTime svg').length") == 10 and not await pg.locator('#showMeBtn').is_visible())
        await shot(pg, 'level_test')
        n = len(d['strip'])
        for i in range(n):
            d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(450)
        await pg.wait_for_selector('#certificate.active', timeout=5000); await pg.wait_for_timeout(300)
        check('level test passed -> certificate with name, skill and date', (await pg.text_content('#certName')) == 'Mia' and 'Big friends' in await pg.text_content('#certSkill') and len(await pg.text_content('#certDate')) > 6)
        certs = await pg.evaluate("Store.get('certificates')")
        check('certificate saved per child as {nodeId,title,date,accuracy}', isinstance(certs, list) and len(certs) == 1 and set(certs[0]) == {'nodeId', 'title', 'date', 'accuracy'} and certs[0]['nodeId'] == 'bf_add_a' and certs[0]['accuracy'] == 1, certs)
        await pg.evaluate("()=>{ window.print=()=>{ window.__printed=(window.__printed||0)+1; }; }"); await pg.click('#certPrint'); await pg.wait_for_timeout(200)
        check('certificate is printable (window.print)', await pg.evaluate("window.__printed") == 1)
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
        await pg.click('.tile[data-mode=visual]'); await pg.wait_for_selector('#drill.active')
        check('no physical abacus -> on-screen soroban by default, "Type it instead"', (await drill(pg))['tool'] == 'beads' and 'Type it instead' in await pg.text_content('#toolSwitch'))
        await pg.click('#toolSwitch'); await pg.click('#exitDrill'); await pg.reload(); await pg.wait_for_timeout(600)
        await pg.click('.tile[data-mode=visual]'); await pg.wait_for_selector('#drill.active')
        check('...but her last choice wins next time', (await drill(pg))['tool'] == 'keys')
        await pg.click('#exitDrill')
        # listen + flash screens (layout)
        await pg.click('.tile[data-mode=listen]'); await pg.wait_for_selector('#listenGo', state='visible')
        check('Listen: numbers hidden, listening card + Ready, speed behind a small control', await pg.evaluate("getComputedStyle(document.getElementById('problemArea')).display==='none'")
              and await pg.locator('#speedBtn').is_visible() and not await pg.locator('#speedPop').is_visible())
        await shot(pg, 'listen_ready')
        await pg.click('#listenGo'); await pg.wait_for_function("document.querySelector('#listenMsg').textContent==='Your answer?'", timeout=30000); await shot(pg, 'listen_answer')
        await pg.click('#speedBtn'); check('speed control opens the slider', await pg.locator('#gapSlider').is_visible()); await shot(pg, 'listen_speed'); await pg.click('#speedBtn')
        await pg.click('#exitDrill'); await pg.click('.tile[data-mode=flash]'); await pg.wait_for_selector('#flashGo', state='visible'); await shot(pg, 'flash_ready')
        await pg.click('#flashGo'); await pg.wait_for_function("document.querySelector('#flashNum').textContent==='= ?'", timeout=20000); await shot(pg, 'flash_ask')
        d = await drill(pg); await keypad(pg, d['answer']); await pg.wait_for_timeout(900)
        check('Flash: Ready -> flash -> "= ?" -> answer -> next problem', (await drill(pg))['idx'] == 1 and 'ok' in (await drill(pg))['strip'][0])
        await ctx.close()
        print('errors:', errs); print('RESULT', sum(res), '/', len(res)); await b.close()
asyncio.run(main())
