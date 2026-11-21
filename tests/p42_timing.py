import asyncio, os, re
from playwright.async_api import async_playwright
# Practice timing (v4.46): a SILENT stopwatch measures the child's solving time per set of 10 (Reading AND Listening).
# HARD REQUIREMENT: nothing timing-related shows ANYWHERE while the child is solving — the elapsed time is revealed
# ONLY on the set-complete screen. This test drives the REAL app and asserts:
#   (a) NO timer/clock/elapsed value is visible during the set (both modes),
#   (b) a time ("Set done — M:SS") appears on set-complete,
#   (c) `times` persists to the store with bestSet set,
#   (d) bestSet only improves on a faster set,
#   (e) after 7 sets the run resets and bestTotal is set.
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

async def new_page(b, w=1180):
    ctx = await b.new_context(viewport={'width': w, 'height': 820})
    pg = await ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.add_init_script(SEED)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__level && window.__practice && window.__times && window.TimeModel", timeout=30000)
    await pg.evaluate(SETTINGS)
    await pg.reload()
    await pg.wait_for_function("window.App && window.__level && window.__practice && window.__times && window.TimeModel", timeout=30000)
    await pg.mouse.click(600, 12)
    await pg.wait_for_timeout(600)
    return ctx, pg, errs

async def setup_node(pg, node, reading=0, listening=0):
    await pg.evaluate("""a=>{ const [node,r,l]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        window.__markLearned(node);
        for (let i=0;i<r;i++) window.__level.bumpMode(node,'reading');
        for (let i=0;i<l;i++) window.__level.bumpMode(node,'listening'); }""", [node, reading, listening])
    await pg.wait_for_timeout(150)

async def answer_pad(pg, sel, v):
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

async def drive_listen_set(pg, wrongs=()):
    await pg.wait_for_selector('#drill.active', timeout=15000)
    await pg.wait_for_selector('#listenGo', state='visible', timeout=15000)
    await pg.evaluate("()=>{const g=document.querySelector('#listenGo'); if(g) g.click();}")
    for i in range(10):
        await listen_ready(pg)
        d = await pg.evaluate("()=>window.__drill()")
        await listen_answer(pg, d['answer'] + (1 if i in wrongs else 0))
    for _ in range(len(wrongs)):
        await listen_ready(pg)
        d = await pg.evaluate("()=>window.__drill()")
        await listen_answer(pg, d['answer'])

async def drive_reading_set(pg, wrongs=()):
    await pg.wait_for_selector('#drill.active', timeout=15000)
    for i in range(10):
        await pg.wait_for_function(
            "i=>{const d=window.__drill(); return d && d.mode==='visual' && d.idx===i && !d.reviewing && d.answer!=null;}",
            arg=i, timeout=15000)
        d = await pg.evaluate("()=>window.__drill()")
        await answer_pad(pg, '#pad', d['answer'] + (1 if i in wrongs else 0))
        await pg.wait_for_function(
            "i=>{const d=window.__drill(); return d.idx>i || d.reviewing || document.querySelector('.toy-dialog');}",
            arg=i, timeout=15000)
    for _ in range(len(wrongs)):
        await pg.wait_for_function(
            "()=>{const d=window.__drill(); return (d.reviewing && d.mode==='visual' && d.answer!=null) || document.querySelector('.toy-dialog');}",
            timeout=15000)
        if await pg.evaluate("()=>!!document.querySelector('.toy-dialog')"):
            break
        d = await pg.evaluate("()=>window.__drill()")
        cur = d['idx']
        await answer_pad(pg, '#pad', d['answer'])
        await pg.wait_for_function("c=>{const d=window.__drill(); return d.idx!==c || document.querySelector('.toy-dialog');}", arg=cur, timeout=15000)

# Scan the live practice screen for ANYTHING that looks like a visible timer/clock/elapsed value.
NO_TIMER_JS = r"""
()=>{
  const drill = document.querySelector('#drill');
  if (!drill) return {bad:['no #drill']};
  const bad = [];
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && +s.opacity>0.01; };
  // 1) any element whose id/class names it a timer/clock/stopwatch/elapsed, if visible
  drill.querySelectorAll('[class*="timer" i],[class*="clock" i],[class*="stopwatch" i],[class*="elapsed" i],[id*="timer" i],[id*="clock" i],[id*="elapsed" i]').forEach(el=>{ if (vis(el)) bad.push('named:'+(el.id||el.className)); });
  // 2) any visible leaf showing an M:SS time string
  drill.querySelectorAll('*').forEach(el=>{
    if (el.children.length) return;                    // leaves only, so we read the smallest piece of text
    const t = (el.textContent||'').trim();
    if (/(^|\s)\d{1,2}:\d{2}(\s|$)/.test(t) && vis(el)) bad.push('timeText:'+t.slice(0,24));
  });
  return {bad};
}
"""

async def assert_no_timer(pg, label):
    res = await pg.evaluate(NO_TIMER_JS)
    running = await pg.evaluate("()=>window.__times.SetClock.running")
    check(label + ': no visible timer/clock/elapsed anywhere on the drill screen', not res['bad'], res['bad'])
    check(label + ': the silent stopwatch IS running in the background', running is True, running)

async def times_entry(pg, node, mode):
    return await pg.evaluate("a=>{const [n,m]=a; const t=window.__read('times')||{}; return (t[n]&&t[n][m])||null;}", [node, mode])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        for mode in ('reading', 'listening'):
            # ===== real set end-to-end: no mid-set timer, a time on set-complete, persisted bestSet =====
            ctx, pg, errs = await new_page(b)
            await setup_node(pg, 'sub_direct')
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("m=>window.__practice.runMode(m)", mode)
            await pg.wait_for_selector('#drill.active', timeout=15000)

            if mode == 'listening':
                await pg.wait_for_selector('#listenGo', state='visible', timeout=15000)
                await pg.evaluate("()=>{const g=document.querySelector('#listenGo'); if(g) g.click();}")
                await listen_ready(pg)
            else:
                await pg.wait_for_function("()=>window.__drill() && window.__drill().mode==='visual' && window.__drill().answer!=null", timeout=15000)
            # mid-set: assert there is NO visible timer while the child is solving
            await assert_no_timer(pg, mode)
            # no set-complete dialog has appeared yet
            dlg = await pg.evaluate("()=>!!document.querySelector('.toy-dialog')")
            check(mode + ': no set-complete reveal mid-set', dlg is False, dlg)

            # finish the whole set
            if mode == 'listening':
                # already clicked Go + one listen_ready above; answer all 10
                for i in range(10):
                    if i > 0:
                        await listen_ready(pg)
                    d = await pg.evaluate("()=>window.__drill()")
                    await listen_answer(pg, d['answer'])
            else:
                await drive_reading_set(pg)

            await pg.wait_for_selector('.toy-dialog', timeout=20000)
            body = await pg.text_content('.toy-dialog-msg')
            m = re.search(r'Set done\s*[—-]\s*(\d{1,2}:\d{2})', body or '')
            check(mode + ': set-complete shows "Set done — M:SS"', bool(m), body)
            entry = await times_entry(pg, 'sub_direct', mode)
            check(mode + ': times persisted to the store with bestSet set',
                  bool(entry) and isinstance(entry.get('bestSet'), (int, float)) and entry['bestSet'] >= 0, entry)
            check(mode + ': the stopwatch stopped at set-complete', (await pg.evaluate("()=>window.__times.SetClock.running")) is False)
            check(mode + ': no page errors (real set)', not errs, errs[:3])
            await ctx.close()

            # ===== deterministic model+store wiring: bestSet only improves; run resets at 7, bestTotal set =====
            # A fresh browser context = clean localStorage, so this node's times start empty.
            ctx, pg, errs = await new_page(b)
            node = 'sub_direct'
            async def rec(ms):
                return await pg.evaluate("a=>{const [n,m,ms]=a; return window.__times.recordSetTime(n,m,ms);}", [node, mode, ms])
            await rec(60000)                                   # first set -> best 60s
            e = await times_entry(pg, node, mode)
            check(mode + ': first set sets bestSet', e['bestSet'] == 60000, e)
            await rec(70000)                                   # slower -> best unchanged
            e = await times_entry(pg, node, mode)
            check(mode + ': a slower set does NOT lower bestSet', e['bestSet'] == 60000, e)
            r = await rec(50000)                               # faster -> best improves, flagged
            e = await times_entry(pg, node, mode)
            check(mode + ': a faster set improves bestSet', e['bestSet'] == 50000, e)
            check(mode + ': a faster set is flagged isBestSet (New best!)', r['isBestSet'] is True, r)
            # four more sets to reach 7 total -> run resets, bestTotal set
            for _ in range(4):
                r = await rec(50000)
            e = await times_entry(pg, node, mode)
            total = 60000 + 70000 + 50000 + 50000 + 50000 + 50000 + 50000
            check(mode + ': after 7 sets the run resets to {sum:0,sets:0}', e['run'] == {'sum': 0, 'sets': 0}, e['run'])
            check(mode + ': after 7 sets bestTotal is set to the run total', e['bestTotal'] == total, e)
            check(mode + ': the 7th set is flagged modeComplete', r['modeComplete'] is True, r)
            check(mode + ': recentSets is capped at 5', len(e['recentSets']) == 5, e['recentSets'])
            check(mode + ': no page errors (model wiring)', not errs, errs[:3])
            await ctx.close()

        await b.close()
    print('errors: %s' % ('[]' if not fails else str(fails)))
    if fails:
        raise SystemExit(1)

asyncio.run(main())
