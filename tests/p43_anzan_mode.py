import asyncio, os, json
from playwright.async_api import async_playwright
# Mental Math (anzan) as a REQUIRED third practice mode (v4.51). Drives the real app.
#  (a) gating: not eligible -> 2 cards; eligible (combined mastered) -> 3 cards (Reading/Listening/Mental math).
#  (b) content by band: L3 -> anzan (3x1-digit), L4 -> anzan_more (5x1-digit), L5 -> anzan_2d (3x2-digit).
#  (c) session + correction pass: a miss does NOT interrupt; it is re-flashed AFTER the set; the session counts.
#  (d) REQUIRED completion: at an eligible level, Reading(7)+Listening(7) with ZERO Mental Math does NOT clear the
#      level; adding Mental Math(7) DOES. At a non-eligible level, Reading(7)+Listening(7) DOES clear.
#  (e) advanceCurrent skips the off-path flash nodes.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails.append(label)

PORT = os.environ.get('PORT', '8765')
URL = 'http://localhost:%s/index.html' % PORT
SET = {'name': 'Mia', 'settingsVersion': 9, 'speakFeedback': False, 'sfx': False, 'voice': 'device', 'gap': 0.2, 'flashSec': 0.25, 'flashGap': 0.05, 'bixVoice': 'sweet'}
L1 = ['beads', 'add_direct', 'sub_direct', 'sf_add', 'sf_sub']
L2 = ['bf_add_a', 'bf_add_b', 'bf_sub_a', 'bf_sub_b']
THRU_COMBINED = L1 + L2 + ['combined']

def seed_js(current, mastered_ids, lessons=()):
    nodes = {}
    for i in mastered_ids: nodes[i] = {'lesson': True, 'mastered': 'parent', 'hist': []}
    for i in lessons:
        if i not in nodes: nodes[i] = {'lesson': True, 'mastered': None, 'hist': []}
    return ("()=>{localStorage.setItem('abacus.progress', JSON.stringify(%s));"
            "localStorage.setItem('abacus.settings', JSON.stringify(%s));}" % (
                json.dumps({'current': current, 'nodes': nodes}), json.dumps(SET)))

async def boot(b, seedjs):
    ctx = await b.new_context(viewport={'width': 1180, 'height': 820})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.evaluate(seedjs)
    await pg.reload()
    await pg.wait_for_function("window.App && window.__level && window.__practice", timeout=30000)
    await pg.mouse.click(600, 12)
    await pg.wait_for_timeout(400)
    return ctx, pg, errs

async def pad(pg, v):
    for ch in str(v):
        await pg.evaluate("c=>{const b=[...document.querySelectorAll('#pad [data-k]')].find(x=>x.dataset.k===c); if(b) b.click();}", ch)
    await pg.evaluate("()=>{const g=[...document.querySelectorAll('#pad [data-k]')].find(x=>x.dataset.k==='go'); if(g) g.click();}")

async def flash_one(pg, delta=0):
    # one flash problem: tap Ready, wait for the ask state, answer (delta added for a deliberate miss)
    await pg.wait_for_selector('#flashGo', state='visible', timeout=20000)
    await pg.evaluate("()=>{const g=document.querySelector('#flashGo'); if(g) g.click();}")
    await pg.wait_for_function("()=>document.querySelector('#flashNum') && document.querySelector('#flashNum').classList.contains('ask')", timeout=25000)
    d = await pg.evaluate("()=>window.__drill()")
    await pad(pg, d['answer'] + delta)
    return d

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ===== (a) gating =====
        ctx, pg, errs = await boot(b, seed_js('two_digit', L1 + L2, lessons=['combined', 'two_digit']))
        await pg.evaluate("()=>window.__practice.start('two_digit')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        cards = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>e.getAttribute("data-mode"))')
        check('not eligible (combined not mastered): picker shows 2 cards, no Mental Math', cards == ['reading', 'listening'], cards)
        check('a: no page errors', not errs, errs[:3])
        await ctx.close()

        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED, lessons=['two_digit']))
        check('anzanEligible true once combined is mastered', (await pg.evaluate("()=>window.__level.anzanEligible()")) is True)
        await pg.evaluate("()=>window.__practice.start('two_digit')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        cards = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>e.getAttribute("data-mode"))')
        check('eligible: picker shows 3 cards incl. Mental Math', cards == ['reading', 'listening', 'mental'], cards)
        labs = await pg.eval_on_selector_all('#ppCards .pp-card .pp-lab', 'els=>els.map(e=>e.textContent)')
        check('the third card is labelled Mental math', labs[-1] == 'Mental math', labs)
        check('eligible level total is 21 sessions (3 modes x 7)', (await pg.evaluate("()=>window.__level.levelTotalCount('two_digit')")) == 21)
        check('a2: no page errors', not errs, errs[:3])
        await ctx.close()

        # ===== (b) content by band =====
        BANDS = [('two_digit', 'anzan', 3, 1), ('long_rows', 'anzan_more', 5, 1), ('three_digit', 'anzan_2d', 3, 2)]
        for cur, want, nterms, digits in BANDS:
            ctx, pg, errs = await boot(b, seed_js(cur, THRU_COMBINED, lessons=[cur, want]))
            await pg.evaluate("()=>window.__practice.start(window.__prog().current)")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("()=>window.__practice.runMode('mental')")
            await pg.wait_for_selector('#drill.active', timeout=15000)
            await pg.wait_for_function("()=>window.__drill() && window.__drill().terms", timeout=15000)
            d = await pg.evaluate("()=>window.__drill()")
            dmode = await pg.evaluate("()=>document.querySelector('#drill').dataset.mode")
            terms = d['terms'] or []
            maxd = max(len(str(abs(t))) for t in terms) if terms else 0
            check('band %s: Mental Math runs in flash mode' % cur, dmode == 'flash', dmode)
            check('band %s -> %s content: %d terms' % (cur, want, nterms), len(terms) == nterms, terms)
            check('band %s -> %s digit width %d' % (cur, want, digits), maxd == digits, {'terms': terms, 'maxd': maxd})
            check('band %s: no page errors' % cur, not errs, errs[:3])
            await ctx.close()

        # ===== (c) session + correction pass (miss re-flashed AFTER the set), session counts =====
        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED, lessons=['two_digit', 'anzan']))
        await pg.evaluate("()=>window.__practice.start('two_digit')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("()=>window.__practice.runMode('mental')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        # problem 0: answer WRONG, then confirm the drill advances (no inline re-queue of the same one)
        await flash_one(pg, delta=1)
        advanced = await pg.evaluate("()=>new Promise(res=>{const t=setInterval(()=>{const d=window.__drill(); if(d.idx>0 || d.reviewing){clearInterval(t);res(true);}},120); setTimeout(()=>{clearInterval(t);res(false);},9000);})")
        check('mental: a miss does NOT interrupt — the drill moves to the next problem', advanced, advanced)
        strip0 = (await pg.evaluate("()=>window.__drill()"))['strip'][0]
        check('mental: the missed problem shows a RED result bead during the set', 'bad' in strip0, strip0)
        # finish problems 1..9 correctly
        for i in range(1, 10):
            await pg.wait_for_function("i=>{const d=window.__drill(); return d && d.idx===i && !d.reviewing;}", arg=i, timeout=20000)
            await flash_one(pg, delta=0)
            await pg.wait_for_function("i=>{const d=window.__drill(); return d.idx>i || d.reviewing || document.querySelector('.toy-dialog');}", arg=i, timeout=20000)
        reviewing = await pg.evaluate("()=>window.__drill().reviewing===true || !!document.querySelector('.toy-dialog')")
        check('mental: after the set, a correction pass runs for the miss (re-flashed AFTER the set)', reviewing, reviewing)
        # the correction pass re-flashes -> a Ready button is shown again for the missed problem
        if not await pg.evaluate("()=>!!document.querySelector('.toy-dialog')"):
            reflash = await pg.evaluate("()=>{const g=document.querySelector('#flashGo'); return window.__drill().reviewing===true && g && g.offsetParent!==null;}")
            check('mental: the correction re-flashes (Ready shown in the review pass)', reflash, reflash)
            await flash_one(pg, delta=0)  # fix the miss
        await pg.wait_for_selector('.toy-dialog', timeout=20000)
        title = await pg.text_content('.toy-dialog-title')
        body = await pg.text_content('.toy-dialog') or ''
        check('mental: a finished session shows "Mental math: 1 of 7 done!"', 'Mental math: 1 of 7' in (title or ''), title)
        check('mental: the set-complete reveal shows the silent timer ("Set done")', 'Set done' in body, body[:80])
        md = await pg.evaluate("()=>window.__level.modeDone('two_digit','mental')")
        check('mental: the session counted -> Mental 1/7', md == 1, md)
        check('c: no page errors', not errs, errs[:3])
        await ctx.close()

        # ===== (d) REQUIRED completion =====
        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED, lessons=['two_digit']))
        res = await pg.evaluate("""()=>{const id='two_digit', L=window.__level;
            for(let i=0;i<7;i++){L.bumpMode(id,'reading'); L.bumpMode(id,'listening');}
            const rl = L.levelComplete(id);
            for(let i=0;i<7;i++) L.bumpMode(id,'mental');
            const all = L.levelComplete(id);
            return {rl, all, done:L.levelDoneCount(id)};}""")
        check('REQUIRED: eligible level with Reading7+Listening7 and ZERO Mental Math does NOT clear', res['rl'] is False, res)
        check('REQUIRED: adding Mental Math 7/7 clears the eligible level', res['all'] is True, res)
        check('REQUIRED: eligible level done-count reaches 21', res['done'] == 21, res)
        await ctx.close()

        ctx, pg, errs = await boot(b, seed_js('sub_direct', ['beads', 'add_direct'], lessons=['sub_direct']))
        res = await pg.evaluate("""()=>{const id='sub_direct', L=window.__level;
            const elig=L.anzanEligible();
            for(let i=0;i<7;i++){L.bumpMode(id,'reading'); L.bumpMode(id,'listening');}
            return {elig, rl:L.levelComplete(id), total:L.levelTotalCount(id)};}""")
        check('non-eligible level: Mental Math NOT required (anzanEligible false)', res['elig'] is False, res)
        check('non-eligible level: Reading7+Listening7 DOES clear the level', res['rl'] is True, res)
        check('non-eligible level total is 14 sessions', res['total'] == 14, res)
        check('d: no page errors', not errs, errs[:3])
        await ctx.close()

        # ===== (e) advanceCurrent skips off-path flash nodes =====
        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED + ['two_digit'], lessons=[]))
        pure = await pg.evaluate("()=>[window.Curriculum.advanceCurrent('two_digit', id=>id==='two_digit'), window.Curriculum.advanceCurrent('anzan', ()=>false)]")
        check('advanceCurrent: finishing two_digit advances past anzan to long_rows', pure[0] == 'long_rows', pure)
        check('advanceCurrent: a child parked on the flash node anzan is moved off it', pure[1] == 'long_rows', pure)
        cur = await pg.evaluate("()=>window.__prog().current")
        check('on load, current advanced off the flash node (two_digit mastered -> long_rows)', cur == 'long_rows', cur)
        check('e: no page errors', not errs, errs[:3])
        await ctx.close()

        # ===== (f) DEFECT GUARD: Mental Math hides "Use the beads" — the abacus can never be revealed =====
        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED, lessons=['two_digit', 'anzan']))
        await pg.evaluate("()=>window.__practice.start('two_digit')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        await pg.evaluate("()=>window.__practice.runMode('mental')")
        await pg.wait_for_selector('#drill.active', timeout=15000)
        await pg.wait_for_function("()=>document.querySelector('#drill').dataset.mode==='flash'", timeout=15000)
        sw_vis = await pg.evaluate("()=>{const s=document.querySelector('#toolSwitch'); if(!s) return false; const r=s.getBoundingClientRect(); return s.offsetParent!==null && r.height>0 && r.width>0;}")
        check('Mental Math: the "Use the beads" switch is NOT present/visible', sw_vis is False, sw_vis)
        # even force-clicking it must not reveal an on-screen soroban
        await pg.evaluate("()=>{const s=document.querySelector('#toolSwitch'); if(s) s.click();}")
        await pg.wait_for_timeout(300)
        revealed = await pg.evaluate("""()=>{const at=document.querySelector('#answerTool');
            const host=document.querySelector('#abHost');
            const hostShown = host && host.offsetParent!==null && host.getBoundingClientRect().height>0;
            return {beads: at && at.classList.contains('beads'), hostShown: !!hostShown, mode: document.querySelector('#drill').dataset.mode};}""")
        check('Mental Math: tapping the switch does NOT reveal a visible abacus', revealed['beads'] is False and revealed['hostShown'] is False, revealed)
        check('f: no page errors', not errs, errs[:3])
        await ctx.close()

        # ===== (g) DEFECT GUARD: a level-up advances past the optional flash node (never parks current on anzan) =====
        # Drive the real Practice level-up path (levelDone): fill all three required modes, then start -> levelComplete -> levelDone.
        ctx, pg, errs = await boot(b, seed_js('two_digit', THRU_COMBINED, lessons=['two_digit']))
        await pg.evaluate("()=>{const id='two_digit', L=window.__level; for(let i=0;i<7;i++){L.bumpMode(id,'reading');L.bumpMode(id,'listening');L.bumpMode(id,'mental');}}")
        await pg.evaluate("()=>window.__practice.start('two_digit')")   # levelComplete -> levelDone advances current
        await pg.wait_for_timeout(700)
        cur = await pg.evaluate("()=>window.__prog().current")
        check('level-up: current advances to the next PHYSICAL skill (long_rows), not the optional anzan node', cur == 'long_rows', cur)
        mastered = await pg.evaluate("()=>{const p=window.__prog('two_digit'); return !!(p.node && p.node.mastered);}")
        check('level-up: the finished skill (two_digit) is marked mastered', mastered is True, mastered)
        # dismiss the "Level complete!" dialog, then tapping Practice must NOT drop into a standalone anzan flash drill
        await pg.evaluate("()=>{const d=document.querySelector('.toy-dialog'); if(d){const okb=[...d.querySelectorAll('[data-r]')]; (okb.find(x=>x.dataset.r==='1')||okb[0]||{click:()=>{}}).click();}}")
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.__practice.start()")
        await pg.wait_for_timeout(600)
        after = await pg.evaluate("""()=>({cur:window.__prog().current,
            flashDrill: document.querySelector('#drill').classList.contains('active') && document.querySelector('#drill').dataset.mode==='flash',
            ptype: window.__practice.type, pnode: window.__practice.node})""")
        check('after level-up, tapping Practice does NOT enter a standalone anzan flash drill', after['flashDrill'] is False and after['pnode'] != 'anzan', after)
        check('g: no page errors', not errs, errs[:3])
        await ctx.close()

        await b.close()
    print('errors: %s' % ('[]' if not fails else str(fails)))
    if fails:
        raise SystemExit(1)

asyncio.run(main())
