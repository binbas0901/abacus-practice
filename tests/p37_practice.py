import asyncio, os
from playwright.async_api import async_playwright
# Practice orchestrator (v4.42): a learned level opens the Reading/Listening picker; Reading -> Bead Detective,
# Listening -> the listen drill; a session finishes only when all answers are correct (misses fixed after the set);
# finishing a session counts toward that mode's 7; the level clears only when BOTH modes reach 7 (mastered, advance).
# Everything here DRIVES THE REAL APP.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails.append(label)

PORT = os.environ.get('PORT', '8765')
URL = 'http://localhost:%s/index.html' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = open(os.path.join(ROOT, 'tests', 'seed_init.js')).read()
SETTINGS = ("()=>localStorage.setItem('abacus.settings', JSON.stringify("
            "{name:'Mia', settingsVersion:9, speakFeedback:false, sfx:false, voice:'device', gap:0.2, bixVoice:'sweet'}))")

async def new_page(b):
    ctx = await b.new_context(viewport={'width': 1180, 'height': 820})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(SEED)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.evaluate(SETTINGS)
    await pg.reload()
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.mouse.click(600, 12)
    await pg.wait_for_timeout(600)
    return ctx, pg, errs

# Make node the current (learned) skill with r Reading and l Listening sessions already done.
async def setup_node(pg, node, reading=0, listening=0):
    await pg.evaluate("""a=>{ const [node,r,l]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        window.__markLearned(node);
        for (let i=0;i<r;i++) window.__level.bumpMode(node,'reading');
        for (let i=0;i<l;i++) window.__level.bumpMode(node,'listening'); }""", [node, reading, listening])
    await pg.wait_for_timeout(150)

async def answer_pad(pg, sel, v):
    # click via JS so an off-screen pad (reader fits the pad below the fold at this
    # viewport) doesn't fail Playwright's visibility/scroll checks
    for ch in str(v):
        await pg.evaluate("a=>{const [sel,c]=a; const b=[...document.querySelectorAll(sel+' [data-k]')].find(x=>x.dataset.k===c); if(b) b.click();}", [sel, ch])
    await pg.evaluate("sel=>{const g=[...document.querySelectorAll(sel+' [data-k]')].find(x=>x.dataset.k==='go'); if(g) g.click();}", sel)

async def listen_ready(pg):
    await pg.wait_for_function(
        "()=>{const m=document.querySelector('#listenMsg'); return m && /answer/i.test(m.textContent) && !window.App.quietNow();}",
        timeout=45000)

async def listen_answer(pg, value):
    await answer_pad(pg, '#pad', value)
    try:
        await pg.wait_for_function(
            "()=>window.App.quietNow() || document.querySelector('#summary.active') || document.querySelector('.toy-dialog')",
            timeout=8000)
    except Exception:
        pass

async def cover_is(pg, on, timeout_ms=25000):
    for _ in range(int(timeout_ms / 250)):
        cls = await pg.evaluate("()=>{const c=document.querySelector('#rdCover'); return c ? c.className : null;}")
        if cls is not None and (('on' in cls.split()) == on):
            return True
        await pg.wait_for_timeout(250)
    return False

async def drive_listen_set(pg, wrongs=()):
    await pg.wait_for_selector('#drill.active', timeout=15000)
    await pg.wait_for_selector('#listenGo', state='visible', timeout=15000)
    await pg.evaluate("()=>{const g=document.querySelector('#listenGo'); if(g) g.click();}")
    for i in range(10):
        await listen_ready(pg)
        d = await pg.evaluate("()=>window.__drill()")
        await listen_answer(pg, d['answer'] + (1 if i in wrongs else 0))
    # correct any re-queued misses in the polish pass
    for _ in range(len(wrongs)):
        await listen_ready(pg)
        d = await pg.evaluate("()=>window.__drill()")
        await listen_answer(pg, d['answer'])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ======== Check A: a learned level opens the picker; each mode opens the right mechanic ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        check('a learned level opens the Reading/Listening picker', True)
        cards = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>e.getAttribute("data-mode"))')
        check('picker shows Reading and Listening', cards == ['reading', 'listening'], cards)
        await pg.evaluate("window.__practice.runMode('reading')")
        await pg.wait_for_selector('#game.active', timeout=15000)
        tag = await pg.evaluate("()=>document.querySelector('#game').dataset.game")
        ptype = await pg.evaluate("()=>window.__practice.type")
        check('Reading opens the Bead Detective (reader) mechanic', tag == 'reader' and ptype == 'reading', {'tag': tag, 'type': ptype})
        check('A: no page errors', not errs, errs[:3])
        await ctx.close()

        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        ptype = await pg.evaluate("()=>window.__practice.type")
        check('Listening opens the listen drill', ptype == 'listening' and (await pg.evaluate("()=>window.__practice.on")), ptype)
        check('A2: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check B: the reader (Reading) re-queues a miss until it is read right (all-correct after the set) ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("()=>{ window.__p37=null; window.addEventListener('unhandledrejection', e=>{window.__rej=String(e.reason);}); window.Games.runSet('read', 4, r=>{ window.__p37=r; }); }")
        requeued = False; first_v = None
        for step in range(12):
            if await pg.evaluate("()=>window.__p37") is not None:
                break
            if not await cover_is(pg, True):
                break
            v = await pg.evaluate("()=>window.__rdVal")
            if step == 0:
                first_v = v
                wrong = (v % 9) + 1
                if wrong == v: wrong = (v % 9) + 2
                await answer_pad(pg, '#rdPad', wrong)
                await cover_is(pg, False); await cover_is(pg, True)
                again = await pg.evaluate("()=>window.__rdVal")
                requeued = (again == first_v)
                await answer_pad(pg, '#rdPad', again)
            else:
                await answer_pad(pg, '#rdPad', v)
            await pg.wait_for_timeout(300)
            if await pg.evaluate("()=>window.__p37") is not None:
                break
        res = await pg.evaluate("()=>window.__p37")
        check('read: a wrong read re-queues the SAME number (fixed before the set ends)', requeued, {'first': first_v})
        check('read: the set reports allCorrect only after every number is read right', bool(res) and res.get('allCorrect') is True, res)
        check('B: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check C: a finished Listening session counts toward that mode (misses fixed in the polish pass) ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct')
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await drive_listen_set(pg, wrongs={2, 6})
        await pg.wait_for_selector('.toy-dialog', timeout=20000)
        title = await pg.text_content('.toy-dialog-title')
        check('listen: a finished session shows "Listening: 1 of 7 done!"', 'Listening: 1 of 7' in (title or ''), title)
        md = await pg.evaluate("()=>window.__level.modeDone('sub_direct','listening')")
        check('listen: the session counted -> Listening 1/7', md == 1, md)
        check('C: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check D: the level clears only when BOTH modes reach 7 (mastered, current advances, bead bonus) ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', reading=7, listening=6)
        pre = await pg.evaluate("()=>window.__level.levelComplete('sub_direct')")
        check('Reading 7/7 + Listening 6/7 -> level NOT complete yet', pre is False, pre)
        nxt = await pg.evaluate("()=>{const N=window.App.nodes(); const i=window.App.idx('sub_direct'); return N[i+1] && N[i+1].id;}")
        b0 = await pg.evaluate("window.Treats.wallet().beads")
        skillBonus = await pg.evaluate("window.Treats.EARN.skill")
        setBonus = await pg.evaluate("window.Treats.EARN.set")
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("window.__practice.runMode('listening')")
        await drive_listen_set(pg)
        await pg.wait_for_selector('.toy-dialog', timeout=20000)
        title = await pg.text_content('.toy-dialog-title')
        check('the last session clears the level -> "Level complete!"', 'Level complete' in (title or ''), title)
        await pg.evaluate("()=>{const btns=[...document.querySelectorAll('.toy-dialog [data-r]')]; const ok=btns.find(b=>b.dataset.r==='1')||btns[0]; if(ok) ok.click();}")
        await pg.wait_for_timeout(500)
        after = await pg.evaluate("""()=>{const pr=window.__prog('sub_direct');
            return {mastered: pr.node && pr.node.mastered, current: pr.current,
                    r: window.__level.modeDone('sub_direct','reading'), l: window.__level.modeDone('sub_direct','listening')};}""")
        check('level: both modes finished at 7/7', after['r'] == 7 and after['l'] == 7, after)
        check('level: the finished skill is marked mastered', bool(after['mastered']), after)
        check('level: current advances to the next skill', after['current'] == nxt, {'current': after['current'], 'expected': nxt})
        beadsAfter = await pg.evaluate("window.Treats.wallet().beads")
        # the final session pays its own session reward AND the skill-mastery bonus
        check('level: mastering the skill earns the session + mastery bead bonus',
              beadsAfter == b0 + setBonus + skillBonus, {'b0': b0, 'after': beadsAfter, 'set': setBonus, 'skill': skillBonus})
        check('D: no page errors', not errs, errs[:3])
        await ctx.close()

        await b.close()
    print('errors: %s' % ('[]' if not fails else str(fails)))
    if fails:
        raise SystemExit(1)

asyncio.run(main())
