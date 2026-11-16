import asyncio, os
from playwright.async_api import async_playwright
# Classroom: the two-character layer (Juni teaches, Bixi is the classmate).
# Covers: a bixi_wrong/ask_help lesson plays and resolves; mistakes-off skips it;
# the joke scheduler never repeats until the pool is exhausted; both speakers' bubbles render.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')
HERE = os.path.dirname(os.path.abspath(__file__))

async def unlock(pg):
    await pg.mouse.click(600, 12); await pg.wait_for_timeout(250)

async def reset(pg, **settings):
    # clean slate between sub-tests: reload (drops any reward overlay / lesson state), set settings, unlock.
    base = {'name': 'Mia', 'settingsVersion': 6, 'voice': 'juni', 'sfx': False, 'bixiMistakes': True, 'bixiSilly': 'normal'}
    base.update(settings)
    import json
    await pg.evaluate("s=>localStorage.setItem('abacus.settings', s)", json.dumps(base))
    await pg.reload(); await pg.wait_for_selector('#home.active'); await pg.wait_for_timeout(600); await unlock(pg)

async def drive_to_help(pg, cap=50):
    for _ in range(cap):
        st = await pg.evaluate("__lesson()")
        if not st: return None
        if st['phase'] in ('help', 'done'): return st
        if st['phase'] in ('guided', 'numbers'):
            await pg.evaluate("__lessonSet(__lesson().target)"); await pg.wait_for_timeout(1100)
        else:
            await pg.click('#lessonNext'); await pg.wait_for_timeout(320)
    return await pg.evaluate("__lesson()")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        errs = []
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read())
        await pg.goto(URL)
        await pg.evaluate("localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:6, voice:'juni', sfx:false, bixiMistakes:true, bixiSilly:'normal'}))")
        await pg.reload(); await pg.wait_for_timeout(900); await unlock(pg)

        # 1 + 4: the Bixi interlude plays and resolves, both bubbles render with the right speaker.
        await pg.evaluate("Lessons.start('sf_add')"); await pg.wait_for_selector('#lesson.active'); await pg.wait_for_timeout(400)
        st = await drive_to_help(pg)
        check('a lesson with a bixi_wrong step reaches the help phase', st and st['phase'] == 'help', st and st['phase'])
        await pg.wait_for_timeout(900)
        slip = await pg.evaluate("()=>{const b=document.querySelector('#bixiBubble');return [b.classList.contains('on'), b.dataset.who, (b.querySelector('.ctext').textContent||'').length>0];}")
        check('Bixi (the classmate) slips: his own bubble shows, marked who=bixi, with text', slip == [True, 'bixi', True], slip)
        await pg.wait_for_function("document.querySelector('#lessonAbacus') && !document.querySelector('#lessonAbacus.ab-ro')", timeout=8000)
        ask = await pg.evaluate("()=>[document.querySelector('#lessonCap').dataset.who, document.querySelector('#capKind').textContent]")
        check('Juni asks for help: the teacher caption is marked who=juni (Juni and Bixi bubbles both render)', ask[0] == 'juni' and ask[1] == 'Help Bixi', ask)
        await pg.screenshot(path='/tmp/toy-classroom/p24_bixi_mistake.png')
        await pg.evaluate("__lessonSet(__lesson().target)"); await pg.wait_for_timeout(2600)
        done = await pg.evaluate("__lesson()")
        learned = await pg.evaluate("(()=>{const p=JSON.parse(window.__legacy('progress'));return !!(p.nodes.sf_add&&p.nodes.sf_add.lesson);})()")
        check('the child fixes it and the lesson resolves to done, counted as learned', done and done['phase'] == 'done' and learned, [done and done['phase'], learned])

        # 2: mistakes off -> the interlude is skipped.
        await reset(pg, bixiMistakes=False)
        await pg.evaluate("Lessons.start('sf_add')"); await pg.wait_for_selector('#lesson.active'); await pg.wait_for_timeout(300)
        seen = set()
        for _ in range(60):
            s2 = await pg.evaluate("__lesson()")
            if not s2: break
            seen.add(s2['phase'])
            if s2['phase'] == 'done': break
            if s2['phase'] in ('guided', 'numbers', 'help'):
                await pg.evaluate("__lessonSet(__lesson().target)"); await pg.wait_for_timeout(1050)
            else:
                await pg.click('#lessonNext'); await pg.wait_for_timeout(300)
        check('mistakes off: the bixi_wrong/ask_help step is skipped, the lesson still reaches done', 'help' not in seen and 'done' in seen, sorted(seen))
        await reset(pg)

        # 3: the joke scheduler never repeats until the pool is exhausted.
        res = await pg.evaluate("""()=>{
          localStorage.removeItem('abacus.classroom');
          const S=window.Classroom.Silly, pool=S.jokeBases().length, seq=[];
          for (let i=0;i<pool*2;i++) seq.push(S.drawJoke());
          const a=seq.slice(0,pool), bl=seq.slice(pool,pool*2);
          return {pool, uniqA:new Set(a).size, uniqB:new Set(bl).size, nullAny:seq.some(x=>!x)};
        }""")
        check('joke pool is non-trivial', res['pool'] >= 10, res['pool'])
        check('joke scheduler: no repeat until the pool is exhausted (first pass all distinct)', res['uniqA'] == res['pool'] and not res['nullAny'], res)
        check('joke scheduler: the pool reshuffles and the next pass is again all distinct', res['uniqB'] == res['pool'], res)

        # 4 (extra): quiet silliness never fires a between-activity moment.
        q = await pg.evaluate("""async()=>{
          const S=window.Classroom.Silly; window.Classroom.Voice.stop();
          const old=S.level; // force quiet
          App.settings.bixiSilly='quiet'; App.saveSettings();
          let fired=false; for (let i=0;i<6;i++){ const r=await S.between({}); if (r) fired=true; }
          return fired;
        }""")
        check('silliness quiet: Bixi never fires a bit/joke between activities', q == False, q)

        check('no page or console errors', not errs, errs[:5])
        print('errors:', errs[:5])
        await b.close()
    if fails:
        print('FAILED:', fails)

asyncio.run(main())
