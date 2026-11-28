import asyncio, os
from playwright.async_api import async_playwright
# The onboarding level-check must match the "abacus at home?" answer: a child who said NO gets the on-screen
# soroban to work on (not a keypad + "use your abacus" with nothing there); YES keeps the keypad they type into.
PORT = os.environ.get('PORT', '8765')
URL = f'http://localhost:{PORT}/index.html'
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if extra else ''))
    if not ok: fails += 1

def digit(v, rod): return (v // 10 ** rod) % 10
async def tap(pg, rod, kind, k=0):
    sel = f'#suPad .to-beadhost .abx-rod[data-rod="{rod}"] .abx-bead[data-kind="{kind}"]' + (f'[data-k="{k}"]' if kind == 'e' else '') + ' .abx-lens'
    await pg.click(sel)
async def do_action(pg, cur, a):
    rod, d = a['rod'], a['delta']; v = digit(cur, rod); e = v % 5
    if a['bead'] == 'heaven': await tap(pg, rod, 'h')
    else: await tap(pg, rod, 'e', e + d - 1 if d > 0 else e + d)
    return cur + d * 10 ** rod
async def by_method(pg, cur, term):
    plan = await pg.evaluate(f"AbacusInput.checkMethod({cur},{term},[]).expected.beads")
    for a in plan: cur = await do_action(pg, cur, a)
    return cur

async def to_check(pg, abacus):
    await pg.evaluate("localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#gate.active', timeout=20000)
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk')
    await pg.wait_for_selector('#suName.on', timeout=20000)
    try: await pg.evaluate("App.settings.bixTalks=false")   # keep the intro fast + deterministic (audio pacing is covered elsewhere)
    except Exception: pass
    await pg.fill('#suNameIn', 'Leo'); await pg.click('#suNameGo')
    # Quick win (v4.54): make 1 on the on-screen soroban to advance to the abacus question.
    await pg.wait_for_selector('#suWin.on', timeout=20000)
    await pg.click('#suWinHost .abx-bead[data-kind="e"][data-k="0"] .abx-lens')
    await pg.wait_for_selector('#suAbacus.on'); await pg.click(f'[data-abacus={abacus}]')
    await pg.wait_for_selector('#suLevel.on'); await pg.click('[data-lv=check]')
    await pg.wait_for_selector('#suCheck.on'); await pg.wait_for_timeout(500)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width': 1180, 'height': 820})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)

        # NO abacus at home -> on-screen soroban, no keypad, no "use your abacus" line
        await to_check(pg, 'no')
        beads = await pg.eval_on_selector_all('#suPad .abx-svg', 'e=>e.length')
        keys = await pg.eval_on_selector_all('#suPad .toy-key', 'e=>e.length')
        bub = (await pg.text_content('#juniBubble .ctext') or '').strip()
        check('no-abacus placement shows an on-screen soroban', beads >= 1, f'svg={beads}')
        check('no-abacus placement has no keypad', keys == 0, f'keys={keys}')
        check('no-abacus placement does NOT tell the child to use a physical abacus', 'Use your abacus for each one' not in bub, repr(bub))
        # and the child can actually solve a problem on it
        terms = await pg.evaluate("""()=>[...document.querySelectorAll('#suProb .term')].map(t=>{const v=parseInt(t.querySelector('b').textContent,10);return t.classList.contains('neg')?-v:v;})""")
        answer = sum(terms); cur = 0
        for t in terms: cur = await by_method(pg, cur, t)
        shown = (await pg.text_content('#suAns')).strip()
        check('building the sum on the beads shows the answer', shown == str(answer), f'shown={shown} answer={answer}')
        await pg.click('#suGo')
        ok = False
        try:
            await pg.wait_for_selector('#suFb.ok', timeout=4000); ok = True
        except Exception: ok = False
        check('submitting the soroban value is read + accepted as correct', ok)

        # YES abacus at home -> keypad path unchanged
        await to_check(pg, 'yes')
        beads2 = await pg.eval_on_selector_all('#suPad .abx-svg', 'e=>e.length')
        keys2 = await pg.eval_on_selector_all('#suPad .toy-key', 'e=>e.length')
        bub2 = (await pg.text_content('#juniBubble .ctext') or '').strip()
        check('has-abacus placement keeps the keypad', keys2 >= 9, f'keys={keys2}')
        check('has-abacus placement has no on-screen soroban', beads2 == 0, f'svg={beads2}')
        check('has-abacus placement keeps the "use your abacus" line', 'Use your abacus for each one' in bub2, repr(bub2))

        check('no page errors', not errs, errs[:3])
        await b.close()
    print(f"\n{'ALL PASS' if fails == 0 else str(fails) + ' FAIL'}")
    raise SystemExit(1 if fails else 0)

asyncio.run(main())
