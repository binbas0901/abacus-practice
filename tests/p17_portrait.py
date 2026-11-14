# v4.1: in portrait (820x1180) the lesson soroban and the Bead Detective soroban are as big as in landscape: bead pitch at least 56px,
# drawn at its true proportions (never stretched), nothing clipped, nothing on top of anything else. Landscape sizes stay as they were.
import asyncio, os
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = os.environ.get('PORT', '8765')
# the soroban's size on screen, and the boxes of the things around it
GEO = """(a)=>{ const [abSel, others]=a; const s=document.querySelector(abSel+' .abx-svg'), r=s.getBoundingClientRect(), vb=s.viewBox.baseVal;
  const box=e=>{ const q=e.getBoundingClientRect(); return [q.left,q.top,q.right,q.bottom]; };
  const vis=e=>e && getComputedStyle(e).display!=='none' && getComputedStyle(e).visibility!=='hidden' && e.getBoundingClientRect().width>0;
  const bead=s.querySelector('.abx-bead').getBoundingClientRect();
  return { pitch: 34*r.height/vb.height, stretch: (r.width/r.height)/(vb.width/vb.height), ab: box(s), bead:[bead.width, bead.height],
    boxes: Object.fromEntries(others.map(o=>[o, document.querySelector(o)]).filter(([o,e])=>vis(e)).map(([o,e])=>[o, box(e)])),
    vw: innerWidth, vh: innerHeight, scroll:[document.documentElement.scrollWidth, document.documentElement.scrollHeight] }; }"""
def inside(b, g, m=0): return b[0] >= -m and b[1] >= -m and b[2] <= g['vw']+m and b[3] <= g['vh']+m
def apart(a, b): return a[2] <= b[0]+1 or b[2] <= a[0]+1 or a[3] <= b[1]+1 or b[3] <= a[1]+1
def layout_ok(g, need):
    bx = dict(g['boxes']); bx['soroban'] = g['ab']; names = list(bx)
    bad = [n for n in names if not inside(bx[n], g)] + [f'{a} x {b}' for i, a in enumerate(names) for b in names[i+1:] if not apart(bx[a], bx[b])] + [f'missing {n}' for n in need if n not in bx]
    return bad
async def page(b, w, h, cur=None):
    ctx = await b.new_context(viewport={'width':w,'height':h}); pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(open(os.path.join(ROOT, 'tests', 'seed_init.js')).read())
    await pg.goto(f'http://localhost:{PORT}/index.html')
    await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, speakFeedback:false, gap:0.5, voice:'ljspeech', sfx:false, bixTalks:false}))")
    if cur: await pg.evaluate("c=>{ for (const k of Object.keys(localStorage)){ try{ const pr=JSON.parse(localStorage.getItem(k)); if (pr && typeof pr==='object' && 'current' in pr && pr.nodes){ pr.current=c; localStorage.setItem(k, JSON.stringify(pr)); } }catch(e){} } }", cur)
    await pg.reload(); await pg.wait_for_timeout(1000); return ctx, pg, errs
LESSON = ['#lessonCap', '#bixLesson .bix', '#lessonPair .toy-pair', '#lessonNext', '#lessonHint', '#lessonAbacus .abx-readout', '#exitLesson', '#lesson .td-board']
async def lesson(b, w, h, cur, rods, lo, hi, name):
    ctx, pg, errs = await page(b, w, h, cur)
    await pg.evaluate("App.openPractice()"); await pg.wait_for_timeout(500); await pg.click('#doorLearn'); await pg.wait_for_selector('#lesson.active'); await pg.wait_for_timeout(600)
    seen = []
    for i in range(14):
        k = await pg.text_content('#capKind'); kind = k.split(' ')[0]
        if kind not in seen:
            if kind == 'Watch': await pg.wait_for_timeout(1500)
            seen.append(kind); g = await pg.evaluate(GEO, ['#lessonAbacus', LESSON]); bad = layout_ok(g, ['#lessonCap', '#bixLesson .bix'])
            check(f'{name} lesson, {rods} rods, "{k}": bead pitch {g["pitch"]:.0f}px (want {lo}-{hi}), true proportions, nothing clipped or overlapping, no scrolling',
                  await pg.get_attribute('#lesson', 'data-rods') == str(rods) and lo <= g['pitch'] <= hi and abs(g['stretch']-1) < .01 and not bad and g['scroll'] == [w, h], (round(g['pitch'], 1), round(g['stretch'], 3), bad, g['scroll']))
            if kind == 'Your':
                gap = min(g['ab'][0], g['vw'] - max(v[2] for v in g['boxes'].values()))
                check(f'{name} lesson "Your turn": a bead is at least 100x56px to push; the layout uses the width (side margins under 60px)', g['bead'][0] >= 100 and g['bead'][1] >= 56 and gap < 60, (g['bead'], gap))
                await pg.screenshot(path=f'/tmp/toy-open/p17_lesson_{rods}_{w}.png'); break
        await pg.click('#lessonNext', force=True); await pg.wait_for_timeout(350)
    check(f'{name} lesson, {rods} rods: saw the intro, a demonstration and "Your turn"', seen[-1:] == ['Your'] and 'Watch' in seen, seen)
    if errs: print('errors:', errs)
    await ctx.close()
READER = ['#rdAns', '#rdPad .toy-keypad-mat', '#rdPad .g-check', '#game .tr-gbix .bix', '#game .tr-gbix .bubble', '#exitGame', '#rdFb']
async def reader(b, w, h, lo3, lo, hi, name):
    ctx, pg, errs = await page(b, w, h, 'bf_add_a')
    await pg.evaluate("void Games.open('reader')"); await pg.wait_for_timeout(700); done = set()
    for i in range(10):
        r = int(await pg.get_attribute('#rdAb', 'data-rods') or 1)
        if r not in done and await pg.locator('#rdCover.on').count() == 0:
            done.add(r); g = await pg.evaluate(GEO, ['#game .rd-ab', [x for x in READER if x != '#rdFb']]); bad = layout_ok(g, ['#rdAns', '#rdPad .toy-keypad-mat', '#rdPad .g-check']); want = lo3 if r == 3 else lo
            check(f'{name} Bead Detective, {r} rod(s): bead pitch {g["pitch"]:.0f}px (want {want}-{hi}), true proportions, nothing clipped or overlapping',
                  want <= g['pitch'] <= hi and abs(g['stretch']-1) < .01 and not bad and g['scroll'] == [w, h], (round(g['pitch'], 1), round(g['stretch'], 3), bad))
            await pg.screenshot(path=f'/tmp/toy-open/p17_reader_{r}_{w}.png')
        try: await pg.wait_for_selector('#rdCover.on', timeout=8000)
        except Exception: break
        cov = await pg.evaluate("(()=>{ const c=document.querySelector('#rdCover').getBoundingClientRect(), s=document.querySelector('#rdAb .abx-svg').getBoundingClientRect(); return c.left<=s.left && c.top<=s.top && c.right>=s.right && c.bottom>=s.bottom; })()")
        if not cov: check(f'{name} Bead Detective: the lid covers the whole soroban', False)
        v = (await pg.get_attribute('#rdAb .abx', 'aria-label')).split()[-1]
        if r == 3:   # a wrong answer on three rods: "It was 123" must fit beside the big soroban
            for ch in ('1' if v != '1' else '2'): await pg.click(f'#rdPad [data-k="{ch}"]')
            await pg.click('#rdPad [data-k=go]'); await pg.wait_for_timeout(400)
            g = await pg.evaluate(GEO, ['#game .rd-ab', READER]); bad = layout_ok(g, ['#rdFb'])
            check(f'{name} Bead Detective, wrong on 3 rods: "It was {v}" fits (nothing clipped or overlapping)', not bad and (await pg.text_content('#rdFb')).strip() == f'It was {v}', bad)
            await pg.screenshot(path=f'/tmp/toy-open/p17_reader_wrong_{w}.png'); break
        for ch in v: await pg.click(f'#rdPad [data-k="{ch}"]')
        await pg.click('#rdPad [data-k=go]')
        try: await pg.wait_for_selector('#rdCover:not(.on)', timeout=6000)
        except Exception: break
        await pg.wait_for_timeout(1900)
    check(f'{name} Bead Detective: checked with 1, 2 and 3 rods', done == {1, 2, 3}, sorted(done))
    if errs: print('errors:', errs)
    await ctx.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        await lesson(b, 820, 1180, 'bf_add_a', 3, 64, 70, 'portrait')
        await lesson(b, 820, 1180, 'four_digit', 4, 56, 70, 'portrait')
        await reader(b, 820, 1180, 56, 64, 70, 'portrait')
        await lesson(b, 1024, 1366, 'bf_add_a', 3, 64, 76, 'portrait 12.9"')
        await reader(b, 1024, 1366, 64, 64, 76, 'portrait 12.9"')
        # landscape is as it was in v4.0
        await lesson(b, 1180, 820, 'bf_add_a', 3, 56, 58, 'landscape')
        await lesson(b, 1366, 1024, 'bf_add_a', 3, 65, 68, 'landscape 12.9"')
        await reader(b, 1180, 820, 54, 54, 56, 'landscape')
        await reader(b, 1366, 1024, 62, 62, 64, 'landscape 12.9"')
        await b.close()
asyncio.run(main())
