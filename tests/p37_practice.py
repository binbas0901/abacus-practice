import asyncio, os
from playwright.async_api import async_playwright
# Phase 2 practice orchestrator: a level runs as 10 sets x 10, cycling listen/read/build; a set finishes ONLY when all 10
# are correct (a miss is re-queued and must be corrected); completing a set shows a set-complete step; 10 sets clear the
# level (node mastered, current advances). Everything here DRIVES THE REAL APP and asserts observed behaviour.
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
    await pg.mouse.click(600, 12)          # a real tap unlocks audio (as a child would), like the other suites
    await pg.wait_for_timeout(600)
    return ctx, pg, errs

# set a node's setsDone and make it the current skill, so the orchestrator and advancement are observable.
# Uses the app's own helpers (applySetup + the real completeSet), so state goes through Store exactly as in the app.
async def setup_node(pg, node, done):
    await pg.evaluate("""a=>{ const [node,done]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        for (let i=0;i<done;i++) window.__level.completeSet(node); }""", [node, done])
    await pg.wait_for_timeout(200)

async def answer_pad(pg, sel, v):
    for ch in str(v):
        await pg.click(f'{sel} [data-k="{ch}"]')
    await pg.click(f'{sel} [data-k="go"]')

async def listen_ready(pg):
    # ready to answer == the listen drill is asking and is not mid-dictation (App.quietNow() guards the gap)
    await pg.wait_for_function(
        "()=>{const m=document.querySelector('#listenMsg'); return m && /answer/i.test(m.textContent) && !window.App.quietNow();}",
        timeout=45000)

async def listen_answer(pg, value):
    await answer_pad(pg, '#pad', value)
    # let the app leave the 'answer' state (feedback, then the next dictation / polish / set-complete step),
    # so the next listen_ready() doesn't re-read the problem we just answered
    try:
        await pg.wait_for_function(
            "()=>window.App.quietNow() || document.querySelector('#summary.active') || document.querySelector('.toy-dialog')",
            timeout=8000)
    except Exception:
        pass

# Poll the reader cover state (asking phase == cover 'on'). Polling is used instead of wait_for_function
# because it is robust to the reader's animation frames.
async def cover_is(pg, on, timeout_ms=25000):
    for _ in range(int(timeout_ms / 250)):
        cls = await pg.evaluate("()=>{const c=document.querySelector('#rdCover'); return c ? c.className : null;}")
        if cls is not None and (('on' in cls.split()) == on):
            return True
        await pg.wait_for_timeout(250)
    return False

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ======== Check A: the orchestrator opens the RIGHT mechanic for each set type ========
        for done, want_screen, want_tag, want_type in [(0, 'drill', None, 'listen'),
                                                        (1, 'game', 'reader', 'read'),
                                                        (2, 'game', 'build', 'build')]:
            ctx, pg, errs = await new_page(b)
            await setup_node(pg, 'sub_direct', done)
            await pg.evaluate("window.__practice.start('sub_direct')")
            try:
                await pg.wait_for_selector(f'#{want_screen}.active', timeout=15000)
                tag = await pg.evaluate("()=>document.querySelector('#game') && document.querySelector('#game').dataset.game") if want_screen == 'game' else None
                ptype = await pg.evaluate("()=>window.__practice.type")
                on = await pg.evaluate("()=>window.__practice.on")
                ok = on and ptype == want_type and (want_tag is None or tag == want_tag)
                check(f'set {done} ({want_type}) opens the {want_tag or "listen drill"} mechanic', ok, {'screen': want_screen, 'tag': tag, 'type': ptype, 'on': on})
            except Exception as e:
                check(f'set {done} ({want_type}) opens the {want_tag or "listen drill"} mechanic', False, str(e)[:120])
            check(f'set {done}: no page errors', not errs, errs[:3])
            await ctx.close()

        # ======== Check B: read set (Bead Detective) re-queues a miss until it is read right (all-correct) ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', 0)
        # drive the REAL reader through the same runner the orchestrator uses, with a short n to keep the set quick
        await pg.evaluate("()=>{ window.__p37=null; window.__rej=null; window.addEventListener('unhandledrejection', e=>{window.__rej=String(e.reason);}); window.Games.runSet('read', 4, r=>{ window.__p37=r; }); }")
        requeued = False
        first_v = None
        for step in range(12):   # at most: 4 corrects + 1 forced miss + slack
            if await pg.evaluate("()=>window.__p37") is not None:
                break                                   # the whole set finished
            if not await cover_is(pg, True):
                break
            v = await pg.evaluate("()=>window.__rdVal")
            if step == 0:
                first_v = v
                wrong = (v % 9) + 1
                if wrong == v: wrong = (v % 9) + 2
                await answer_pad(pg, '#rdPad', wrong)      # a wrong read
                await cover_is(pg, False)                  # cover drops
                await cover_is(pg, True)                   # same number comes back
                again = await pg.evaluate("()=>window.__rdVal")
                requeued = (again == first_v)
                await answer_pad(pg, '#rdPad', again)      # now read it right
            else:
                await answer_pad(pg, '#rdPad', v)
            await pg.wait_for_timeout(300)
            done = await pg.evaluate("()=>window.__p37")
            if done is not None:
                break
        res = await pg.evaluate("()=>window.__p37")
        check('read: a wrong read re-queues the SAME number (must be corrected)', requeued, {'first': first_v})
        check('read: the set reports allCorrect only after every number is read right', bool(res) and res.get('allCorrect') is True, res)
        check('read: the set ran all 4 numbers', bool(res) and res.get('of') == 4, res)
        check('read: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check C: a BUILD set completes end-to-end through Practice -> setDone -> set-complete step ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', 2)        # set index 2 == build
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#game.active', timeout=15000)
        built = 0
        last_want = None
        for k in range(10):
            # wait for a FRESH number on a reset abacus (so we never poke the same item twice)
            await pg.wait_for_function(
                "lw=>{const n=document.querySelector('#bdNum'); if(!n||!window.__gameAb) return false; const t=n.textContent.trim(); return t!=='' && t!==String(lw) && window.__gameAb.value===0;}",
                arg=last_want, timeout=20000)
            want = await pg.evaluate("()=>parseInt(document.querySelector('#bdNum').textContent,10)")
            await pg.evaluate("w=>window.__gameAb.poke(w)", want)
            last_want = want
            built += 1
            await pg.wait_for_timeout(200)
        await pg.wait_for_selector('.toy-dialog', timeout=15000)
        title = await pg.text_content('.toy-dialog-title')
        check('build: 10 numbers built, set completes', built == 10, built)
        check('build: completing the set shows "Set 3 of 10 done!"', 'Set 3 of 10' in (title or ''), title)
        sd = await pg.evaluate("()=>window.__level.setsDone('sub_direct')")
        check('build: completeSet ran -> setsDone == 3', sd == 3, sd)
        check('build: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check D: a LISTEN set finishes ONLY at 10 correct; misses are re-queued via the polish pass ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', 0)        # set index 0 == listen
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        await pg.wait_for_selector('#listenGo', state='visible', timeout=15000)
        await pg.click('#listenGo')
        wrongs = {2, 6}
        for i in range(10):
            await listen_ready(pg)
            d = await pg.evaluate("()=>window.__drill()")
            await listen_answer(pg, d['answer'] + (1 if i in wrongs else 0))
        # wait for the set to settle after the 10th answer: with 2 misses it MUST enter the polish pass
        # (never jump straight to a set-complete step) — wait for whichever state actually arrives, then assert it.
        await pg.wait_for_function(
            "()=>window.__drill().reviewing || document.querySelector('#summary.active') || document.querySelector('.toy-dialog')",
            timeout=20000)
        state = await pg.evaluate("""()=>({rev: window.__drill().reviewing,
            sum: !!document.querySelector('#summary.active'),
            drill: !!document.querySelector('#drill.active'),
            dlg: !!document.querySelector('.toy-dialog')})""")
        check('listen: 8/10 does NOT finish the set (no set-complete step yet)', not state['dlg'], state)
        check('listen: a miss is re-queued -> polish pass runs, standard summary skipped', state['rev'] and state['drill'] and not state['sum'], state)
        for _ in range(2):      # correct the two re-queued problems
            await listen_ready(pg)
            d = await pg.evaluate("()=>window.__drill()")
            await listen_answer(pg, d['answer'])
        await pg.wait_for_selector('.toy-dialog', timeout=15000)
        title = await pg.text_content('.toy-dialog-title')
        check('listen: set completes only once all 10 are correct -> "Set 1 of 10 done!"', 'Set 1 of 10' in (title or ''), title)
        sd = await pg.evaluate("()=>window.__level.setsDone('sub_direct')")
        check('listen: completeSet ran -> setsDone == 1', sd == 1, sd)
        check('listen: no page errors', not errs, errs[:3])
        await ctx.close()

        # ======== Check E: finishing the 10th set CLEARS the level (node mastered, current advances) ========
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', 9)        # on the last set; set index 9 == listen
        nxt = await pg.evaluate("()=>{const N=window.App.nodes(); const i=window.App.idx('sub_direct'); return N[i+1] && N[i+1].id;}")
        b0 = await pg.evaluate("window.Treats.wallet().beads"); skillBonus = await pg.evaluate("window.Treats.EARN.skill")
        await pg.evaluate("window.__practice.start('sub_direct')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        await pg.wait_for_selector('#listenGo', state='visible', timeout=15000)
        await pg.click('#listenGo')
        for i in range(10):
            await listen_ready(pg)
            d = await pg.evaluate("()=>window.__drill()")
            await listen_answer(pg, d['answer'])
        # level-complete no longer pops a collectible sticker; it earns the skill-mastery bead bonus, then shows the card
        await pg.wait_for_selector('.toy-dialog', timeout=20000)
        title = await pg.text_content('.toy-dialog-title')
        check('level: the 10th set clears the level -> "Level complete!"', 'Level complete' in (title or ''), title)
        await pg.click('.toy-dialog [data-r="1"]')   # "Yay!"
        await pg.wait_for_timeout(500)
        after = await pg.evaluate("""()=>{const pr=JSON.parse(window.__legacy('progress'));
            return {mastered: pr.nodes['sub_direct'] && pr.nodes['sub_direct'].mastered, current: pr.current,
                    done: window.__level.setsDone('sub_direct')};}""")
        check('level: all 10 sets done', after['done'] == 10, after)
        check('level: the finished skill is marked mastered', bool(after['mastered']), after)
        check('level: current advances to the next skill', after['current'] == nxt, {'current': after['current'], 'expected': nxt})
        beadsAfter = await pg.evaluate("window.Treats.wallet().beads")
        check('level: mastering the skill earns the bead bonus (not a sticker)', beadsAfter == b0 + skillBonus, [b0, beadsAfter, skillBonus])
        check('level: no page errors', not errs, errs[:3])
        await ctx.close()

        await b.close()
    print('errors: %s' % ('[]' if not fails else str(fails)))
    if fails:
        raise SystemExit(1)

asyncio.run(main())
