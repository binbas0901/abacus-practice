"""Typing on an iPad (v4.2): the Grown-ups gate box and every other box open the keyboard from a tap on the box.
Touch context (has_touch, is_mobile, iPad user agent); boxes are tapped, never clicked.
What this can check: the box is a real input (text, numeric keypad, not read-only), nothing lies on top of it, a tap
gives it the focus, and the app never focuses a box outside a tap (on iOS that focuses without a keyboard, and the
box then ignores taps). What it cannot check: the iOS keyboard itself - headless Chrome has none; the keyboard is
faked with window.__kb(px) to check that the question, box and button stay in the part of the screen above it."""
import asyncio, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE); import kbfit
URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765'); OUT = '/tmp/toy-v42'; os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
# every focus() the app makes, with the event being handled at that moment (None = a timer or an animation frame)
SPY = """(()=>{ window.__foc=[]; const f=HTMLElement.prototype.focus; HTMLElement.prototype.focus=function(){ const e=window.event; if (/^(INPUT|TEXTAREA)$/.test(this.tagName)) window.__foc.push([this.id||this.tagName, e&&e.isTrusted?e.type:null]); return f.apply(this,arguments); }; })()"""
BOX = """(sel)=>{ const i=document.querySelector(sel), r=i.getBoundingClientRect(), t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2), cs=getComputedStyle(i);
  return {tag:i.tagName, type:i.type, ro:i.readOnly, dis:i.disabled, mode:i.getAttribute('inputmode'), pattern:i.getAttribute('pattern'), ac:i.getAttribute('autocomplete'), top:t===i, sel:cs.webkitUserSelect||cs.userSelect, pe:cs.pointerEvents, active:document.activeElement===i, w:r.width, h:r.height}; }"""
VIS = """(sels)=>{ const h=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--vv-h'))||innerHeight; return sels.map(s=>{ const e=document.querySelector(s), r=e.getBoundingClientRect(); return [s, Math.round(r.top), Math.round(r.bottom), r.width>0 && r.top>=0 && r.bottom<=h && r.left>=0 && r.right<=innerWidth]; }); }"""
KEYS = """(h)=>{ let k=document.querySelector('#fakeKb'); if(!h){ if(k) k.remove(); return; } if(!k){ k=document.createElement('div'); k.id='fakeKb'; document.body.appendChild(k); } k.style.cssText='position:fixed;left:0;right:0;bottom:0;height:'+h+'px;background:#C9CDD4;z-index:9999;display:flex;align-items:center;justify-content:center;font:600 30px system-ui;color:#555'; k.textContent='(keyboard, '+h+' px)'; }"""
ok = True
def check(name, cond, detail=''):
    global ok; ok = ok and bool(cond); print(('PASS' if cond else 'FAIL'), name, detail)
async def hold(ctx, pg, sel, ms):
    """A real finger: down, stay, (caller looks), up. Returns the lift."""
    box = await (await pg.query_selector(sel)).bounding_box(); x = box['x'] + box['width'] / 2; y = box['y'] + box['height'] / 2
    cdp = await ctx.new_cdp_session(pg); await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await pg.wait_for_timeout(ms)
    async def lift(): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(250)
    return lift
async def kb(pg, h): await pg.evaluate("h=>window.__kb(h)", h); await pg.evaluate(KEYS, h or 0); await pg.wait_for_timeout(200)
async def page(b, w, h, seed=True):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, user_agent=UA, service_workers='block')
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    if seed: await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read())
    await pg.add_init_script(SPY); await pg.goto(URL); await pg.wait_for_timeout(500); return ctx, pg, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        for (w, h, kbh, tag) in ([] if 'fit' in sys.argv else [(1180, 820, 420, 'landscape'), (820, 1180, 340, 'portrait')]):
            ctx, pg, errs = await page(b, w, h)
            # ---- Grown-ups gate ----
            await pg.tap('#grownups'); await pg.wait_for_selector('#gate.active'); await pg.wait_for_timeout(300)
            lift = await hold(ctx, pg, '#gateHold', 3400)
            st = await pg.evaluate("[document.querySelector('#gateCard').dataset.step, document.activeElement.id, window.__foc.length]")
            check(f'{tag} gate: question shows after the 3 s hold; the box is not focused from a timer while the finger is down', st == ['ask', '', 0], str(st))
            await lift()
            foc = await pg.evaluate("window.__foc"); box = await pg.evaluate(BOX, '#gateA')
            check(f'{tag} gate: lifting the finger focuses the box, inside that touch', box['active'] and foc == [['gateA', 'touchend']], str(foc))
            check(f'{tag} gate: the box is a real numeric text input (not read-only, inputmode numeric, pattern [0-9]*, autocomplete off)', box['tag'] == 'INPUT' and box['type'] == 'text' and not box['ro'] and not box['dis'] and box['mode'] == 'numeric' and box['pattern'] == '[0-9]*' and box['ac'] == 'off', str(box))
            check(f'{tag} gate: nothing lies on top of the box, text can be selected in it', box['top'] and box['sel'] == 'text' and box['pe'] != 'none' and box['h'] >= 60, '')
            await pg.screenshot(path=f'{OUT}/gate_{tag}_ask.png')
            # the box lost the focus (keyboard put away): one tap on the box brings it back
            await pg.evaluate("document.activeElement.blur(); window.__foc.length=0"); await pg.tap('#gateA'); await pg.wait_for_timeout(200)
            box = await pg.evaluate(BOX, '#gateA'); check(f'{tag} gate: a tap on the box focuses it', box['active'] and not box['ro'] and box['mode'] != 'none', '')
            # the box has the focus but (as on iOS after a focus outside a tap) no keyboard: a tap gives the focus back inside the touch
            await pg.evaluate("window.__foc.length=0"); await pg.tap('#gateA'); await pg.wait_for_timeout(200)
            foc = await pg.evaluate("window.__foc"); check(f'{tag} gate: a tap on a focused box with no keyboard focuses it again inside the touch', foc == [['gateA', 'touchend']] and await pg.evaluate("document.activeElement.id") == 'gateA', str(foc))
            # keyboard up: question, digits, box and Open all above it
            await kb(pg, kbh); vis = await pg.evaluate(VIS, ['#gateQ', '#gateQ .gnum', '#gateA', '#gateOk', '#gateBack'])
            check(f'{tag} gate: with the keyboard up ({kbh}px) the question, digits, box and Open are above it', all(v[3] for v in vis), str(vis))
            ov = await pg.evaluate("(()=>{ const a=document.querySelector('#gateBack').getBoundingClientRect(), c=document.querySelector('.tg-board').getBoundingClientRect(); return !(a.right<c.left||a.left>c.right||a.bottom<c.top||a.top>c.bottom); })()")
            check(f'{tag} gate: Back button is not under the paper', not ov)
            await pg.screenshot(path=f'{OUT}/gate_{tag}_keyboard.png')
            # typing with the keyboard up: a wrong number keeps the box focused (new question), the right one opens Grown-ups
            await pg.evaluate("window.__foc.length=0"); await pg.keyboard.type('000' if await pg.evaluate("window.__gateAnswer") != 0 else '111'); await pg.tap('#gateOk'); await pg.wait_for_timeout(300)
            foc = await pg.evaluate("window.__foc"); st = await pg.evaluate("[document.activeElement.id, document.querySelector('#gateA').value, document.querySelector('#gateMsg').textContent]")
            check(f'{tag} gate: wrong number: box still focused, emptied, never focused outside a tap', st[0] == 'gateA' and st[1] == '' and 'new number' in st[2] and all(f[1] for f in foc), str(st) + str(foc))
            vis = await pg.evaluate(VIS, ['#gateQ', '#gateA', '#gateOk', '#gateMsg']); check(f'{tag} gate: the "try again" line is above the keyboard too', all(v[3] for v in vis), str(vis))
            await pg.keyboard.type(str(await pg.evaluate("window.__gateAnswer"))); await pg.keyboard.press('Enter'); await pg.wait_for_selector('#parent.active'); await kb(pg, None)
            check(f'{tag} gate: the right digits and Enter open Grown-ups; the box gives up the focus', await pg.evaluate("document.activeElement.id") != 'gateA' and not await pg.evaluate("document.documentElement.classList.contains('kb-up')"))
            # ---- Grown-ups page: every box ----
            await pg.wait_for_timeout(500)
            for sel in ['#sName', '#recNew', '#tpList input[data-f=name]', '#tpList input[data-f=price]']:
                if not await pg.locator(sel).count(): check(f'{tag} grown-ups: {sel} exists', False); continue
                await pg.evaluate("s=>document.querySelector(s).scrollIntoView({block:'center'})", sel); await pg.wait_for_timeout(250); await pg.tap(sel); await pg.wait_for_timeout(150)
                box = await pg.evaluate(BOX, sel); check(f'{tag} grown-ups: tap on {sel} focuses it (real input, selectable, nothing on top)', box['active'] and box['top'] and box['sel'] == 'text' and not box['ro'] and box['mode'] != 'none', str(box))
                await kb(pg, kbh); vis = await pg.evaluate(VIS, [sel]); check(f'{tag} grown-ups: {sel} is above the keyboard', vis[0][3], str(vis)); await kb(pg, None)
            await pg.evaluate("document.activeElement.blur()")
            check(f'{tag} no box was ever focused outside a tap', all(f[1] for f in await pg.evaluate("window.__foc")), str(await pg.evaluate("window.__foc")))
            check(f'{tag} no page errors', not errs, str(errs)); await ctx.close()

            # ---- "What's your name?" (tap Bix on a device with no name yet) ----
            ctx, pg, errs = await page(b, w, h)
            await pg.evaluate("()=>{ const st=JSON.parse(window.__legacy('settings')||'{}'); st.name=''; st.settingsVersion=5; localStorage.setItem('abacus.settings', JSON.stringify(st)); }"); await pg.reload(); await pg.wait_for_timeout(600); await pg.evaluate("window.__foc.length=0")
            await pg.tap('#homeSky .toy-moon'); await pg.wait_for_selector('#nameAsk.active'); await pg.wait_for_timeout(300)
            foc = await pg.evaluate("window.__foc"); box = await pg.evaluate(BOX, '#nameAskIn')
            check(f'{tag} name dialog: opens with the box focused inside the tap on the moon', box['active'] and foc in ([['nameAskIn', 'touchend']], [['nameAskIn', 'click']]), str(foc))
            await pg.evaluate("document.activeElement.blur()"); await pg.tap('#nameAskIn'); await pg.wait_for_timeout(150); box = await pg.evaluate(BOX, '#nameAskIn')
            check(f'{tag} name dialog: a tap on the box focuses it (real text input, nothing on top)', box['active'] and box['top'] and box['type'] == 'text' and not box['ro'] and box['mode'] != 'none' and box['sel'] == 'text', str(box))
            await kb(pg, kbh); vis = await pg.evaluate(VIS, ['#nameAsk .tn-t', '#nameAskIn', '#nameAskOk', '#nameAskNo']); check(f'{tag} name dialog: title, box and buttons above the keyboard', all(v[3] for v in vis), str(vis))
            await pg.screenshot(path=f'{OUT}/name_{tag}_keyboard.png')
            await pg.keyboard.type('Mia'); await pg.tap('#nameAskOk'); await pg.wait_for_timeout(400); await kb(pg, None)
            check(f'{tag} name dialog: name saved, dialog and keyboard gone', await pg.locator('#nameAsk.active').count() == 0 and 'Mia' in await pg.text_content('#homeJuni') and await pg.evaluate("document.activeElement.id") != 'nameAskIn')
            check(f'{tag} name dialog: no page errors', not errs, str(errs)); await ctx.close()

            # ---- first-run setup: the child's name ----
            ctx, pg, errs = await page(b, w, h, seed=False)
            await pg.wait_for_selector('#setup.active'); await pg.wait_for_timeout(600)
            foc = await pg.evaluate("window.__foc"); check(f'{tag} setup: the name box is not focused from a timer on a touch screen', foc == [] and await pg.evaluate("document.activeElement.id") != 'suNameIn', str(foc))
            await pg.tap('#suNameIn'); await pg.wait_for_timeout(200); box = await pg.evaluate(BOX, '#suNameIn')
            check(f'{tag} setup: a tap on the name box focuses it (real text input, nothing on top)', box['active'] and box['top'] and box['type'] == 'text' and not box['ro'] and box['mode'] != 'none' and box['sel'] == 'text', str(box))
            await kb(pg, kbh); vis = await pg.evaluate(VIS, ['#suNameIn', '#suNameGo']); check(f'{tag} setup: the name box and its button are above the keyboard', all(v[3] for v in vis), str(vis))
            await pg.screenshot(path=f'{OUT}/setup_{tag}_keyboard.png')
            await pg.keyboard.type('Mia'); await pg.tap('#suNameGo'); await pg.wait_for_timeout(500); await kb(pg, None)
            check(f'{tag} setup: name accepted, next step shown, keyboard given up', not await pg.evaluate("document.querySelector('#suName').classList.contains('on')") and await pg.evaluate("document.activeElement.id") != 'suNameIn')
            check(f'{tag} setup: no page errors', not errs, str(errs)); await ctx.close()
        # v4.5: the compact layout above the keyboard, at the three sizes an older iPad reports (tests/kbfit.py)
        if 'old' not in sys.argv: await kbfit.keyboard_fit(b, check, full=True)
        print('errors: []'); await b.close()
    if not ok: print('FAIL p19_typing')
asyncio.run(main())
