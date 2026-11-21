"""v4.2: nothing overlaps and nothing is cut off, down to 1024x768 landscape and 768x1024 portrait (older 4:3 iPads).
Practice: for a matrix of screen sizes x problem shapes x answer tool, the sum sheet (every number row, the answer box)
never touches a keypad key, the Check dome or the soroban, everything is inside the screen, no key is covered, and keys
are 64px or more. Also the Listen / Flash answer state, the polish pass and the level-test look, the speed panel, and
home, lesson and summary at the two smallest sizes.
Usage: tests/p21_fit.py            the whole matrix
       tests/p21_fit.py shots DIR  also save a screenshot of every failing case (and the worst cases) into DIR"""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')
SHOTS = sys.argv[sys.argv.index('shots') + 1] if 'shots' in sys.argv else None
# iPad 10th gen 1180x820 (Safari bars: 744 / 700 / 650; home-screen app: 796), its portrait, iPad mini 1133x744, iPad Pro 11
# 1366x980, older 4:3 iPads 1024x768 / 1080x810 / 1112x834 and their portraits, and Safari "larger text" 115% / 130%
# on the 1180 iPad (the page is then 1026x713 / 908x631 CSS px: below the supported size, checked for overlap all the same).
SIZES = [(1180, 820), (1180, 796), (1180, 744), (1180, 700), (1180, 650), (820, 1106), (820, 1040), (1133, 744), (1366, 980),
         (1024, 768), (768, 1024), (1080, 810), (810, 1080), (1112, 834), (1026, 713), (908, 631)]
SMALLEST = [(1024, 768), (768, 1024)]
ONLY = [a for a in sys.argv[1:] if 'x' in a and a[0].isdigit()]          # e.g. tests/p21_fit.py 1024x768 908x631
BELOW = {(908, 631), (1180, 650)}          # (at these two the speed panel may scroll inside its sheet)
BELOW_ = 0          # under the supported minimum: keys may be smaller than 64px here, never covered
# (skill, numbers per problem or 0 for the skill's own): 4, 5, 8 one-digit rows; 8-10 rows; 2-, 3-, 4-digit; times
SHAPES = [('combined', 0), ('combined', 5), ('combined', 8), ('long_rows', 0), ('two_digit', 0), ('rows_2d', 0), ('three_digit', 0), ('four_digit', 0), ('times_a', 0), ('mul_3x1', 0)]
MEASURE = """(()=>{ const R=e=>e.getBoundingClientRect(), vis=e=>e && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
  const hit=(a,b)=>!(a.right<=b.left+0.5||a.left>=b.right-0.5||a.bottom<=b.top+0.5||a.top>=b.bottom-0.5), inside=r=>r.left>=-0.5&&r.top>=-0.5&&r.right<=innerWidth+0.5&&r.bottom<=innerHeight+0.5;
  const name=e=>e.id||(e.dataset&&e.dataset.k?'key '+e.dataset.k:'')||String(e.className.baseVal!==undefined?e.className.baseVal:e.className).split(' ')[0];
  const sheet=[document.querySelector('#drill .tp-board'), document.querySelector('#sheet'), document.querySelector('#readout'), ...document.querySelectorAll('#problemArea .term, #listenStage, #flashStage')].filter(vis);
  const keys=[...document.querySelectorAll('#padKeys button')].filter(vis), tool=[...keys, document.querySelector('#padKeys .toy-keypad-mat'), document.querySelector('#checkBtn'), ...document.querySelectorAll('#abHost .abx-svg')].filter(vis);
  const other=[document.querySelector('#exitDrill'), document.querySelector('#toolSwitch'), document.querySelector('#bixDrill .tp-bixfig'), document.querySelector('#bixDrill .tp-bubble'), document.querySelector('#showMeBtn'), document.querySelector('#speedGear'), document.querySelector('#drill .tp-rodwrap')].filter(vis);
  const bad=[];
  for (const s of sheet) for (const t of tool) if (hit(R(s),R(t))) bad.push(name(s)+' over '+name(t));
  for (const o of other) for (const t of [...tool, sheet[0]]) if (t && hit(R(o),R(t))) bad.push(name(o)+' over '+name(t));
  const sw=document.querySelector('#toolSwitch'), rodw=document.querySelector('#drill .tp-rodwrap'), moon=document.querySelector('#drillSky .toy-sky-moon');   // v4.45: the "Use the beads" pill sits by the rod, clear of it and of Juni's window
  if (vis(sw)&&vis(rodw)&&hit(R(sw),R(rodw))) bad.push('toolSwitch over rod');
  if (vis(sw)&&moon&&vis(moon)&&hit(R(sw),R(moon))) bad.push('toolSwitch over Juni');
  const swAbove = (vis(sw)&&vis(rodw)) ? (R(sw).bottom <= R(rodw).top + 1) : null;   // v4.47: the pill is STACKED ABOVE the rod
  for (const e of [...sheet, ...tool, ...other]) if (!inside(R(e))) bad.push(name(e)+' off screen');
  const sh=document.querySelector('#sheet'), sr=sh&&R(sh), pa=document.querySelector('#problemArea'), scrolls=pa && pa.scrollHeight>pa.clientHeight+1;
  for (const e of document.querySelectorAll('#problemArea .term, #readout')) if (vis(e)){ const r=R(e); if (r.left<sr.left-0.5||r.right>sr.right+0.5||r.bottom>sr.bottom+0.5||(!scrolls&&r.top<sr.top-0.5)) bad.push(name(e)+' outside the sheet'); if (e.scrollWidth>e.clientWidth+1) bad.push(name(e)+' digits cut'); }
  if (scrolls){ const now=pa.querySelector('.term.now')||pa.querySelector('.term'), r=R(now), p=R(pa); if (r.top<p.top-0.5||r.bottom>p.bottom+0.5) bad.push('current number not in view'); }
  for (const k of [...keys, document.querySelector('#checkBtn')].filter(vis)){ const r=R(k), t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); if (!t || !(t===k||k.contains(t))) bad.push(name(k)+' covered by '+(t?name(t):'nothing')); }
  { const tx=document.querySelector('#bixDrill .tp-btxt'); if (vis(tx) && tx.scrollHeight>tx.clientHeight+3) bad.push('Bix bubble words cut'); }
  const ks=keys.map(k=>Math.min(R(k).width,R(k).height)), ab=document.querySelector('#abHost .abx-svg');
  return {bad:[...new Set(bad)], minKey: ks.length?Math.round(Math.min(...ks)):null, terms:document.querySelectorAll('#problemArea .term').length, scrolls, swAbove, abw: vis(ab)?Math.round(R(ab).width):null}; })()"""
# v4.47: the "Use the beads" pill must sit ABOVE the rod (not beside it) at the common full-height iPad LANDSCAPE sizes,
# in keys mode (Reading / Listening). Short bars, portrait and the beads layout fall back to beside — not asserted here.
TARGET_ABOVE = {(1180, 820), (1024, 768), (1366, 980), (1133, 744), (1080, 810), (1112, 834)}
PAGE = """(sels)=>{ const R=e=>e.getBoundingClientRect(), bad=[]; for (const s of sels) for (const e of document.querySelectorAll(s)){ if (!e.getClientRects().length) continue; const r=R(e); if (r.left<-0.5||r.top<-0.5||r.right>innerWidth+0.5||r.bottom>innerHeight+0.5) bad.push(s+' off screen'); }
  return [...new Set(bad)]; }"""
OVER = """(pairs)=>{ const R=e=>e.getBoundingClientRect(), bad=[], hit=(a,b)=>!(a.right<=b.left+6||a.left>=b.right-6||a.bottom<=b.top+6||a.top>=b.bottom-6);   // boxes of round things may touch at a corner
  for (const [a,b] of pairs) for (const x of document.querySelectorAll(a)) for (const y of document.querySelectorAll(b)) if (x!==y && !x.contains(y) && !y.contains(x) && x.getClientRects().length && y.getClientRects().length && hit(R(x),R(y))) bad.push(a+' over '+b); return [...new Set(bad)]; }"""
ok = True; fails = []
def check(name, cond, detail=''):
    global ok; ok = ok and bool(cond)
    if not cond: fails.append(name); print('FAIL', name, detail)
async def seed(pg, node, operands, **kw):
    await pg.evaluate("([n,o,kw])=>{ const st=JSON.parse(window.__legacy('settings')||'{}'); Object.assign(st, {name:'Mia', sfx:false, speakFeedback:false, bixTalks:false, operands:o, answerPause:0, termGap:0.05, voice:'ljspeech', flashSec:0.3, flashGap:0.05, flashOwn:true, settingsVersion:5}, kw); localStorage.setItem('abacus.settings', JSON.stringify(st)); const pr=JSON.parse(window.__legacy('progress')||'{}'); pr.current=n; localStorage.setItem('abacus.progress', JSON.stringify(pr)); }", [node, operands, kw])
    await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(250)
async def tool(pg, want):
    if (await pg.evaluate("document.querySelector('#answerTool').classList.contains('beads') ? 'beads' : 'keys'")) != want: await pg.evaluate("document.querySelector('#toolSwitch').click()"); await pg.wait_for_timeout(250)
async def shot(pg, name):
    if SHOTS: os.makedirs(SHOTS, exist_ok=True); await pg.screenshot(path=os.path.join(SHOTS, name + '.png'))
async def main():
    worst = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        n = 0
        async def size(w, h):
            nonlocal n
            ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read()); await pg.goto(URL); await pg.wait_for_timeout(400)
            for (node, ops) in SHAPES:
                await seed(pg, node, ops); await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(350)
                for t in ['keys', 'beads']:
                    await tool(pg, t); await pg.wait_for_timeout(300); m = await pg.evaluate(MEASURE); n += 1; tag = f'{w}x{h} Look {node}{"/"+str(ops) if ops else ""} ({m["terms"]} rows) {t}'
                    check(tag + ': sheet, answer tool and Check apart, all on screen, nothing covered', not m['bad'], str(m['bad']))
                    if t == 'keys' and (w, h) not in BELOW: check(tag + ': keys are 64px or more', m['minKey'] and m['minKey'] >= 64, str(m['minKey']))
                    if t == 'keys' and w > h and m['terms'] <= 4 and (w, h) in TARGET_ABOVE:
                        check(tag + ': the "Use the beads" pill sits ABOVE the rod', m['swAbove'] is True, str(m['swAbove']))
                    if m['bad'] or (node in ('long_rows', 'four_digit') and (w, h) in SMALLEST + [(1180, 650), (908, 631)]): await shot(pg, f'look_{w}x{h}_{node}{ops or ""}_{t}')
                    # the polish pass (Show me in Bix's column) and the level-test look use the same table
                    await pg.evaluate("document.querySelector('#drill').classList.add('fixing'); document.querySelector('#showMeBtn').style.display=''; window.dispatchEvent(new Event('resize'))"); await pg.wait_for_timeout(120); m = await pg.evaluate(MEASURE); n += 1
                    check(tag + ' polish pass: apart, on screen', not m['bad'], str(m['bad']))
                    if m['bad']: await shot(pg, f'polish_{w}x{h}_{node}{ops or ""}_{t}')
                    await pg.evaluate("document.querySelector('#drill').classList.remove('fixing'); document.querySelector('#showMeBtn').style.display='none'; window.dispatchEvent(new Event('resize'))"); await pg.wait_for_timeout(80)
                await tool(pg, 'keys'); await pg.click('#exitDrill'); await pg.wait_for_selector('#home.active')
            # Listen and Flash: the speed panel, then the answer state, both tools
            await seed(pg, 'combined', 0)
            for mode, go, msg in [('listen', '#listenGo', "document.querySelector('#listenMsg').textContent==='Your answer?'"), ('flash', '#flashGo', "/What did you get/.test(document.querySelector('#flashMsg').textContent)")]:
                await pg.evaluate(f"App.startMode('{mode}')"); await pg.wait_for_selector(go, state='visible'); await pg.click('#speedGear'); await pg.wait_for_selector('#speedPop:not([hidden])'); await pg.wait_for_timeout(300); n += 1
                bad = await pg.evaluate(PAGE, ['#speedPop .sp-card', '#speedPop button', '#speedPop input', '#speedPop .sp-val', '#speedPop .sp-label', '#speedPop .sp-end', '#exitDrill', '#speedGear'])
                bad += await pg.evaluate(OVER, [['#speedPop .sp-step', '#speedPop .sp-val'], ['#speedPop .sp-foot button', '#speedPop .sp-ctrl'], ['#speedPop .sp-head', '#speedPop .sp-ctrl'], ['#exitDrill', '#speedGear'], ['#speedGear', '#drill .tp-rodwrap']])
                bad += await pg.evaluate("(()=>{ const c=document.querySelector('#speedPop .sp-card'), cr=c.getBoundingClientRect(), out=[]; if (c.scrollHeight>c.clientHeight+1) out.push('speed panel does not fit its sheet (scrolls)'); for (const e of c.querySelectorAll('.sp-title, .sp-label, .sp-val, .sp-foot button')){ if (!e.getClientRects().length) continue; const r=e.getBoundingClientRect(); if (r.top<cr.top-0.5||r.bottom>cr.bottom+0.5) out.push('speed panel: '+(e.id||e.className)+' cut'); } const g=document.querySelector('#speedGear').getBoundingClientRect(), m=document.querySelector('#drillSky .toy-sky-moon, #drillSky svg'); if (m){ const r=m.getBoundingClientRect(); if (!(g.right<=r.left+4||g.left>=r.right-4||g.bottom<=r.top+4||g.top>=r.bottom-4)) out.push('gear over the moon'); } return [...new Set(out)]; })()")
                sm = await pg.evaluate("Math.min(...[...document.querySelectorAll('#speedPop .sp-step')].map(e=>Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))")
                if (w, h) in BELOW: bad = [x for x in bad if 'scrolls' not in x]
                check(f'{w}x{h} {mode} speed panel: on screen, nothing overlapping, - / + discs 64px or more', not bad and sm >= 64, f'{bad} {sm}')
                if bad or (w, h) in SMALLEST: await shot(pg, f'speed_{w}x{h}_{mode}')
                await pg.click('#spDone'); await pg.wait_for_selector('#speedPop', state='hidden')   # close the panel; Ready stays on the stage
                await pg.click(go); await pg.wait_for_function(msg, timeout=40000); await pg.wait_for_timeout(200)
                for t in ['keys', 'beads']:
                    await tool(pg, t); m = await pg.evaluate(MEASURE); n += 1
                    check(f'{w}x{h} {mode} answer state {t}: apart, on screen, nothing covered', not m['bad'], str(m['bad']))
                    if t == 'keys' and w > h and (w, h) in TARGET_ABOVE:
                        check(f'{w}x{h} {mode} keys: the "Use the beads" pill sits ABOVE the rod', m['swAbove'] is True, str(m['swAbove']))
                    if m['bad'] or (w, h) in SMALLEST: await shot(pg, f'{mode}_{w}x{h}_{t}')
                await tool(pg, 'keys'); await pg.click('#exitDrill'); await pg.wait_for_selector('#home.active')
            check(f'{w}x{h}: no page errors', not errs, str(errs)); await ctx.close()
        PART = os.environ.get('FIT_PART', '1')          # the matrix is split in two so each half fits the test runner's time limit (p22_fit2 runs part 2)
        todo = [s for s in SIZES if '%dx%d' % s in ONLY] if ONLY else (SIZES[8:] if PART == '2' else SIZES[:8])
        for i in range(0, len(todo), 4): await asyncio.gather(*[size(w, h) for (w, h) in todo[i:i+4]])   # four screens at a time

        # home, lesson and summary at the two smallest supported sizes
        for (w, h) in ([] if ONLY or PART != '2' else SMALLEST):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, service_workers='block'); pg = await ctx.new_page(); await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read()); await pg.goto(URL); await pg.wait_for_timeout(400)
            await seed(pg, 'bf_add_a', 0, count=5); await pg.wait_for_timeout(500); n += 1
            bad = await pg.evaluate(PAGE, ['#home button', '#bixHome .bubble', '#homeTrophy', '#home .th-doors', '#ver']) + await pg.evaluate(OVER, [['#bixHome .bubble', '#doorPractice'], ['#home .th-doors > button', '#doorPractice'], ['#home .th-doors > button', '#home .th-doors > button'], ['#grownups', '#bixHome .bubble'], ['#doorPractice', '#home .th-doors > button'], ['#bixHome .bubble', '#homeTrophy']])
            check(f'{w}x{h} home: Bix, bubble, the Practice hero, trophy and the two doors on screen and apart', not bad, str(bad)); await shot(pg, f'home_{w}x{h}')
            await pg.evaluate("(()=>{ const pr=JSON.parse(window.__legacy('progress')); delete pr.nodes.bf_add_a; localStorage.setItem('abacus.progress', JSON.stringify(pr)); })()"); await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)
            await pg.evaluate("App.openPractice()"); await pg.wait_for_timeout(500); n += 1
            bad = await pg.evaluate(PAGE, ['#door .door-block', '#exitDoor', '#doorAll', '#doorLearn', '#bixDoor .bubble']) + await pg.evaluate(OVER, [['#door .door-block', '#door .door-block'], ['#door .door-block', '#doorLearn'], ['#door .door-block', '#bixDoor .bubble'], ['#exitDoor', '#bixDoor .bubble'], ['#doorAll', '#door .door-block']])
            check(f'{w}x{h} practice door: three blocks, the path and Bix on screen and apart', not bad, str(bad)); await shot(pg, f'door_{w}x{h}')
            await pg.click('#doorLearn'); await pg.wait_for_selector('#lesson.active'); await pg.wait_for_timeout(700)
            for step in range(3):
                n += 1; bad = await pg.evaluate(PAGE, ['#lesson button', '#lessonCap', '#lesson .abx-svg', '#bixLesson .bix', '#lessonPair svg']) + await pg.evaluate(OVER, [['#lessonCap', '#lesson .abx-svg'], ['#lessonNext', '#lesson .abx-svg'], ['#lessonNext', '#lessonCap'], ['#exitLesson', '#lessonCap'], ['#lessonPair svg', '#lesson .abx-svg'], ['#lessonHint', '#lessonNext']])
                check(f'{w}x{h} lesson page {step+1}: bubble, soroban and buttons on screen and apart', not bad, str(bad)); await shot(pg, f'lesson_{w}x{h}_{step+1}')
                if await pg.is_visible('#lessonNext'): await pg.click('#lessonNext'); await pg.wait_for_timeout(900)
            await pg.click('#exitLesson'); await pg.wait_for_timeout(300)
            await seed(pg, 'bf_add_a', 0, count=5); await pg.evaluate("(()=>{ const pr=JSON.parse(window.__legacy('progress')); pr.nodes.bf_add_a={lesson:true,mastered:null,hist:[]}; localStorage.setItem('abacus.progress', JSON.stringify(pr)); })()"); await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(300)
            await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await tool(pg, 'keys')
            for i in range(5):
                await pg.wait_for_function("!document.querySelector('#checkBtn').disabled && document.querySelectorAll('#strip .tp-b.cur').length===1"); await pg.wait_for_timeout(250); await pg.click('#pad [data-k="1"]'); await pg.click('#checkBtn'); await pg.wait_for_timeout(1300)
            await pg.wait_for_selector('#summary.active', timeout=20000); await pg.wait_for_timeout(1800); n += 1
            bad = await pg.evaluate(PAGE, ['#summary button', '#sumScore', '#sumMoons', '#bixSum .bix', '#summary .tp-sumhead']) + await pg.evaluate(OVER, [['#summary .tp-sumhead', '#sumMoons'], ['#summary button', '#summary button'], ['#summary button', '#sumMoons'], ['#summary button', '#summary .tp-sumhead']])
            check(f'{w}x{h} summary: score, moons and buttons on screen and apart', not bad, str(bad)); await shot(pg, f'summary_{w}x{h}')
            await ctx.close()
        # v4.5: keyboard up on the Grown-ups gate and the name dialog (tests/kbfit.py; everything else that takes typing is in p19_typing)
        if not ONLY and PART == '2':
            sys.path.insert(0, HERE); import kbfit; await kbfit.keyboard_fit(b, check, full=False)
        print(f'{n} layouts measured, {len(fails)} failed'); print('errors: []'); await b.close()
    if not ok: print('FAIL p21_fit part ' + PART)
asyncio.run(main())
