"""v4.5: typing with the iPad keyboard up. Headless Chrome has no software keyboard, so it is faked three ways:
  window.__kb(px)            the app treats the bottom px of the screen as covered (and a grey block is drawn there)
  a shorter browser window   innerHeight AND visualViewport.height shrink together after the focus, as in a home-screen
                             app on some iPads - found through the app's own detection (Typing.keyboard), no hook
  a slid page                nothing shrinks but the page was slid up under a focused box - the fallback
Measured at 1024x768 + 420px keyboard, 1180x820 + 400px, 768x1024 + 330px, with a 20px status bar (--sat):
the gate's question, five digit tiles, box and Open (and the name dialog, the first-run name step, every Grown-ups box
with its label / button, a dialog holding a box) are whole inside the part above the keyboard and below the status bar,
apart from each other; and after the box is left the screen is exactly as it was.
Used by p19_typing (everything) and p21_fit / p22_fit2 (gate and name dialog). Shots go to /tmp/toy-v45/."""
import os
HERE = os.path.dirname(os.path.abspath(__file__)); URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765'); OUT = '/tmp/toy-v45'; os.makedirs(OUT, exist_ok=True)
UA = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
CASES = [(1024, 768, 420), (1180, 820, 400), (768, 1024, 330)]
SAT = 20
KEYS = """(h)=>{ let k=document.querySelector('#fakeKb'); if(!h){ if(k) k.remove(); return; } if(!k){ k=document.createElement('div'); k.id='fakeKb'; document.body.appendChild(k); } k.style.cssText='position:fixed;left:0;right:0;bottom:0;height:'+h+'px;background:#C9CDD4;z-index:9999;pointer-events:none;display:flex;align-items:center;justify-content:center;font:600 30px system-ui;color:#555'; k.textContent='(keyboard, '+h+' px)'; }"""
# every element of every selector: whole inside [sat, visible height] x [0, width]; listed pairs must not overlap. Returns the problems.
FIT = """([sels, vis, sat, apart])=>{ const bad=[], all=[]; for (const s of sels){ const es=[...document.querySelectorAll(s)]; if(!es.length) bad.push(s+' missing');
    es.forEach((e,i)=>{ const r=e.getBoundingClientRect(); all.push([s+(es.length>1?'['+i+']':''), r, e]); if (!(r.width>0 && r.height>0)) bad.push(s+' not shown'); else if (r.top<sat-0.5 || r.bottom>vis+0.5 || r.left<-0.5 || r.right>innerWidth+0.5) bad.push(s+'['+i+'] outside: top '+Math.round(r.top)+' bottom '+Math.round(r.bottom)+' left '+Math.round(r.left)+' right '+Math.round(r.right)+' (visible '+sat+'..'+vis+')'); }); }
  if (apart) for (let i=0;i<all.length;i++) for (let j=i+1;j<all.length;j++){ const a=all[i], b=all[j]; if (a[2].contains(b[2]) || b[2].contains(a[2])) continue;
    if (a[1].left<b[1].right-0.5 && b[1].left<a[1].right-0.5 && a[1].top<b[1].bottom-0.5 && b[1].top<a[1].bottom-0.5) bad.push(a[0]+' overlaps '+b[0]); }
  return bad; }"""
STATE = """()=>{ const d=document.documentElement, cs=getComputedStyle(d); return {up:d.classList.contains('kb-up'), short:d.classList.contains('kb-short'), vh:parseFloat(cs.getPropertyValue('--vv-h'))||null, sy:window.scrollY, st:d.scrollTop+document.body.scrollTop, active:document.activeElement && document.activeElement.id}; }"""
RECTS = """(sels)=>sels.map(s=>{ const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })"""
ATTR = """(s)=>{ const i=document.querySelector(s); return {mode:i.getAttribute('inputmode'), pattern:i.getAttribute('pattern'), hint:i.getAttribute('enterkeyhint'), cap:i.getAttribute('autocapitalize'), corr:i.getAttribute('autocorrect')}; }"""
GATE = ['#gateQ .gw', '#gateQ .gnum i', '#gateA', '#gateOk', '#gateBack']
GATE_NORMAL = ['#gate', '.tg-card', '#bixGate .bix', '#bixGate .bubble', '#gateArt svg', '#gateA', '#gateOk', '#gateBack']
NAME = ['#nameAsk .tn-t', '#nameAskIn', '#nameAskOk', '#nameAskNo']

async def kb(pg, h):
    await pg.evaluate("h=>window.__kb(h)", h); await pg.evaluate(KEYS, h or 0); await pg.wait_for_timeout(250)
async def page(b, w, h, seed=True):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, has_touch=True, is_mobile=True, user_agent=UA, service_workers='block')
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    if seed: await pg.add_init_script(open(os.path.join(HERE, 'seed_init.js')).read())
    await pg.goto(URL); await pg.wait_for_timeout(500); await pg.evaluate("document.documentElement.style.setProperty('--sat','%dpx')" % SAT); return ctx, pg, errs
async def leave(pg):
    await pg.evaluate("document.activeElement && document.activeElement.blur()"); await kb(pg, None); await pg.wait_for_timeout(150)

async def gate(b, check, w, h, k, full):
    tag = f'{w}x{h} kb{k}'; vis = h - k
    ctx, pg, errs = await page(b, w, h)
    await pg.tap('#grownups'); await pg.wait_for_selector('#gate.active'); await pg.evaluate("window.__gateHold()"); await pg.wait_for_timeout(300); await pg.evaluate("document.activeElement.blur()"); await pg.wait_for_timeout(200)
    normal = await pg.evaluate(RECTS, GATE_NORMAL)
    # a hardware keyboard (or the floating one): the box has the focus, nothing shrinks -> the normal layout stays
    await pg.tap('#gateA'); await pg.wait_for_timeout(700); st = await pg.evaluate(STATE)
    check(f'{tag} gate: box focused and nothing shrinks (hardware / floating keyboard): normal layout kept, Bix stays', st['active'] == 'gateA' and not st['up'] and await pg.evaluate(RECTS, GATE_NORMAL) == normal, str(st))
    # the software keyboard
    await kb(pg, k); st = await pg.evaluate(STATE); bad = await pg.evaluate(FIT, [GATE, vis, SAT, True])
    check(f'{tag} gate: compact layout on, visible height {vis}', st['up'] and st['vh'] == vis, str(st))
    check(f'{tag} gate: question, 5 tiles, box, Open and Back whole inside the visible part, under the status bar, apart', not bad and await pg.locator('#gateQ .gnum i').count() == 5, str(bad))
    sz = await pg.evaluate("()=>{ const t=document.querySelector('#gateQ .gnum i'), o=document.querySelector('#gateOk').getBoundingClientRect(), a=document.querySelector('#gateA').getBoundingClientRect(), g=x=>{ const e=document.querySelector(x); return !e || e.getBoundingClientRect().width===0; }; return {digit:parseFloat(getComputedStyle(t).fontSize), open:o.height, box:a.height, sameRow:Math.abs((o.top+o.bottom)/2-(a.top+a.bottom)/2)<12, hidden:g('#bixGate .bix') && g('#bixGate .bubble') && g('#gateArt svg'), top:document.querySelector('.tg-board').getBoundingClientRect().top}; }")
    check(f'{tag} gate: digits 28px or more, Open 44px or more, box 44px or more, Open beside the box', sz['digit'] >= 28 and sz['open'] >= 44 and sz['box'] >= 44 and sz['sameRow'], str(sz))
    check(f'{tag} gate: Bix, his bubble and the two figures are put away; the block is pinned to the top', sz['hidden'] and SAT <= sz['top'] <= SAT + 16, str(sz))
    await pg.screenshot(path=f'{OUT}/gate_{w}x{h}_kb{k}.png')
    # leaving the box: the normal layout is back, exactly
    await leave(pg); st = await pg.evaluate(STATE); now = await pg.evaluate(RECTS, GATE_NORMAL)
    check(f'{tag} gate: after blur the normal layout is back exactly (Bix, bubble, figures, clipboard) and nothing is left scrolled', not st['up'] and st['vh'] is None and st['sy'] == 0 and st['st'] == 0 and now == normal, str(st) + str(now) + str(normal))
    await pg.screenshot(path=f'{OUT}/gate_{w}x{h}_after.png')
    # a wrong answer: the "try again" line fits too
    await pg.tap('#gateA'); await pg.wait_for_timeout(150); await kb(pg, k)
    await pg.keyboard.type('000' if await pg.evaluate("window.__gateAnswer") != 0 else '111'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
    bad = await pg.evaluate(FIT, [GATE + ['#gateMsg'], vis, SAT, True]); msg = await pg.text_content('#gateMsg')
    check(f'{tag} gate: Enter / Go is Open; after a wrong answer the new question and the "try again" line fit as well', 'new number' in msg and not bad, str(bad) + msg)
    await pg.screenshot(path=f'{OUT}/gate_{w}x{h}_kb{k}_wrong.png')
    await leave(pg); normal = await pg.evaluate(RECTS, GATE_NORMAL)   # the new question may wrap differently: measure again for the checks below
    if full:
        # found without the hook: the window gets shorter under the focused box (innerHeight and visualViewport together)
        await pg.tap('#gateA'); await pg.wait_for_timeout(200); await pg.set_viewport_size({'width': w, 'height': vis}); await pg.wait_for_timeout(500)
        st = await pg.evaluate(STATE); bad = await pg.evaluate(FIT, [GATE, vis, SAT, True]); inner = await pg.evaluate("innerHeight")
        check(f'{tag} gate: a keyboard that shrinks innerHeight as well ({inner}) is still found (full height remembered): compact layout, all inside', inner == vis and st['up'] and st['vh'] == vis and not bad, str(st) + str(bad))
        await pg.screenshot(path=f'{OUT}/gate_{w}x{h}_shrunk.png')
        await pg.evaluate("document.activeElement.blur()"); await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(500); st = await pg.evaluate(STATE)
        check(f'{tag} gate: keyboard down again: normal layout', not st['up'] and await pg.evaluate(RECTS, GATE_NORMAL) == normal, str(st))
        # nothing shrinks at all, but iOS slid the page up under the box: treated as a keyboard until the box is left
        await pg.evaluate("Typing.__shift=Typing.shift; Typing.shift=()=>(Typing.isBox(document.activeElement) ? 130 : 0)"); await pg.tap('#gateA'); await pg.wait_for_timeout(500); st = await pg.evaluate(STATE)
        bad = await pg.evaluate(FIT, [GATE, st['vh'] or 0, SAT, True])
        check(f'{tag} gate: page slid under a focused box with no size change: compact layout in an assumed visible part ({st["vh"]})', st['up'] and st['vh'] and h * .4 <= st['vh'] <= h * .7 and not bad, str(st) + str(bad))
        await pg.evaluate("Typing.shift=Typing.__shift"); await leave(pg); st = await pg.evaluate(STATE)
        check(f'{tag} gate: and normal again after blur', not st['up'] and await pg.evaluate(RECTS, GATE_NORMAL) == normal, str(st))
        # a clipped parent that iOS scrolled to show the box is put back
        await pg.tap('#gateA'); await kb(pg, k)
        sc = await pg.evaluate("()=>{ const c=document.querySelector('#gate'), f=document.createElement('div'); f.id='kbFill'; f.style.cssText='height:900px;flex:none'; c.appendChild(f); c.scrollTop=140; const was=c.scrollTop; window.__kb(%d); const mid=c.scrollTop; f.remove(); return [was, mid]; }" % k)
        check(f'{tag} gate: a clipped parent slid by iOS is slid back', sc[0] > 0 and sc[1] == 0, str(sc)); await leave(pg)
        at = await pg.evaluate(ATTR, '#gateA'); check(f'{tag} gate box asks for the number pad with Go', at['mode'] == 'numeric' and at['pattern'] == '[0-9]*' and at['hint'] == 'go' and at['corr'] == 'off', str(at))
    check(f'{tag} gate: no page errors', not errs, str(errs)); await ctx.close()

async def name_dialog(b, check, w, h, k, full):
    tag = f'{w}x{h} kb{k}'; vis = h - k
    ctx, pg, errs = await page(b, w, h)
    await pg.evaluate("()=>{ const st=JSON.parse(window.__legacy('settings')||'{}'); st.name=''; st.settingsVersion=5; localStorage.setItem('abacus.settings', JSON.stringify(st)); }"); await pg.reload(); await pg.wait_for_timeout(600); await pg.evaluate("document.documentElement.style.setProperty('--sat','%dpx')" % SAT)
    await pg.tap('#bixHome .bix'); await pg.wait_for_selector('#nameAsk.active'); await pg.wait_for_timeout(400); await pg.evaluate("document.activeElement.blur()"); await pg.wait_for_timeout(200)
    normal = await pg.evaluate(RECTS, ['#nameAsk', '#nameAsk .tn-card', '#bixName .bix'] + NAME)
    await pg.tap('#nameAskIn'); await pg.wait_for_timeout(200); await kb(pg, k); st = await pg.evaluate(STATE); bad = await pg.evaluate(FIT, [NAME + ['#nameAsk .tn-card'], vis, SAT, False]) + await pg.evaluate(FIT, [NAME, vis, SAT, True])
    check(f'{tag} name dialog: title, box, Later and That\'s me (the whole card) inside the visible part, under the status bar, apart', st['up'] and st['vh'] == vis and not bad, str(st) + str(bad))
    hb = await pg.evaluate("()=>[document.querySelector('#nameAskOk').getBoundingClientRect().height, document.querySelector('#nameAskIn').getBoundingClientRect().height]"); check(f'{tag} name dialog: buttons and box 44px or more', min(hb) >= 44, str(hb))
    await pg.screenshot(path=f'{OUT}/name_{w}x{h}_kb{k}.png')
    await leave(pg); st = await pg.evaluate(STATE); now = await pg.evaluate(RECTS, ['#nameAsk', '#nameAsk .tn-card', '#bixName .bix'] + NAME)
    check(f'{tag} name dialog: after blur the dialog is as it was', not st['up'] and st['sy'] == 0 and now == normal, str(now) + str(normal))
    at = await pg.evaluate(ATTR, '#nameAskIn'); check(f'{tag} name dialog box: words capitalised, no autocorrect, Done', at['cap'] == 'words' and at['corr'] == 'off' and at['hint'] == 'done', str(at))
    await pg.tap('#nameAskIn'); await kb(pg, k); await pg.keyboard.type('Mia'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400); await kb(pg, None); st = await pg.evaluate(STATE)
    check(f'{tag} name dialog: Done saves the name, dialog and keyboard layout gone', await pg.locator('#nameAsk.active').count() == 0 and 'Mia' in await pg.text_content('#bixHome .bubble') and not st['up'] and st['sy'] == 0, str(st))
    check(f'{tag} name dialog: no page errors', not errs, str(errs)); await ctx.close()

async def setup_name(b, check, w, h, k):
    tag = f'{w}x{h} kb{k}'; vis = h - k; S = ['#suNameIn', '#suNameGo', '#juniBubble']; N = ['#setup', '.to-namemat', '#suNameIn', '#suNameGo']   # (Juni leads the name step: her bubble changes size by itself)
    ctx, pg, errs = await page(b, w, h, seed=False)
    await pg.wait_for_selector('#setup.active'); await pg.wait_for_timeout(700); normal = await pg.evaluate(RECTS, N) + (await pg.evaluate(RECTS, ['#juniSetup']))[0][2:]
    await pg.tap('#suNameIn'); await pg.wait_for_timeout(200); await kb(pg, k); st = await pg.evaluate(STATE); bad = await pg.evaluate(FIT, [S + ['.to-namemat'], vis, SAT, False]) + await pg.evaluate(FIT, [S, vis, SAT, True])
    check(f'{tag} first-run name step: Juni\'s question, the name box and Next inside the visible part, under the status bar, apart', st['up'] and not bad, str(st) + str(bad))
    await pg.screenshot(path=f'{OUT}/setup_{w}x{h}_kb{k}.png')
    await leave(pg); st = await pg.evaluate(STATE); now = await pg.evaluate(RECTS, N) + (await pg.evaluate(RECTS, ['#juniSetup']))[0][2:]
    check(f'{tag} first-run name step: after blur the page is as it was', not st['up'] and st['sy'] == 0 and now == normal, str(now) + str(normal))
    at = await pg.evaluate(ATTR, '#suNameIn'); check(f'{tag} first-run name box: words capitalised, no autocorrect, Done', at['cap'] == 'words' and at['corr'] == 'off' and at['hint'] == 'done', str(at))
    await pg.tap('#suNameIn'); await kb(pg, k); await pg.keyboard.type('Mia'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(500); await kb(pg, None)
    check(f'{tag} first-run name step: Done goes on to the next step', not await pg.evaluate("document.querySelector('#suName').classList.contains('on')"))
    check(f'{tag} first-run name step: no page errors', not errs, str(errs)); await ctx.close()

async def grown_ups(b, check, w, h, k):
    tag = f'{w}x{h} kb{k}'; vis = h - k
    ctx, pg, errs = await page(b, w, h)
    await pg.tap('#grownups'); await pg.wait_for_selector('#gate.active'); await pg.evaluate("window.__gateHold()"); await pg.wait_for_timeout(300)
    await pg.tap('#gateA'); await pg.keyboard.type(str(await pg.evaluate("window.__gateAnswer"))); await pg.keyboard.press('Enter'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(600)
    # box, what must be seen with it (label / button / its table row), where the page is scrolled to before the tap, expected attributes
    boxes = [('#sName', ['label[for=sName]'], 'end', dict(cap='words', corr='off', hint='done')),
             ('#recNew', ['#recAdd'], 'start', dict(cap='words', corr='off', hint='done')),
             ('#recName', ['label[for=recName]'], 'end', dict(cap='words', corr='off', hint='done')),
             ('#tpList tr:last-child input[data-f=name]', ['#tpList tr:last-child [data-del]'], 'end', dict(cap='words', corr='off', hint='done')),
             ('#tpList tr:last-child input[data-f=price]', ['#tpList tr:last-child [data-del]'], 'start', dict(mode='numeric', pattern='[0-9]*', hint='done'))]
    for (sel, withit, block, want) in boxes:
        if not await pg.locator(sel).count() or not await pg.evaluate("s=>document.querySelector(s).offsetParent!==null", sel):
            if sel == '#recName': continue          # only shown once a person has been added
            check(f'{tag} grown-ups: {sel} exists', False); continue
        await pg.evaluate("([s,b])=>{ const p=document.querySelector('#parent'); p.style.scrollBehavior='auto'; document.querySelector(s).scrollIntoView({block:b}); }", [sel, block]); await pg.wait_for_timeout(250)
        await pg.tap(sel); await pg.wait_for_timeout(200); await kb(pg, k); st = await pg.evaluate(STATE)
        navb = await pg.evaluate("Math.round(document.querySelector('.gu-nav').getBoundingClientRect().bottom)"); bad = await pg.evaluate(FIT, [[sel] + withit, vis, max(SAT, navb), False])
        pr = await pg.evaluate(RECTS, ['#parent'])
        check(f'{tag} grown-ups {sel}: the box with its label / button is above the keyboard and below the tab bar; only the page itself scrolled', st['up'] and st['active'] is not None and not bad and st['sy'] == 0 and pr[0][1] == SAT and pr[0][3] == vis - SAT, str(st) + str(bad) + str(pr))
        if sel in ('#sName', '#recNew', '#tpList tr:last-child input[data-f=price]'): await pg.screenshot(path=f'{OUT}/grown_{w}x{h}_{sel.split("=")[-1].strip("#]")}_kb{k}.png')
        if sel == '#sName':
            mv = await pg.evaluate("async()=>{ const p=document.querySelector('#parent'), a=p.scrollTop; p.scrollTop=a+90; const b=p.scrollTop; await new Promise(r=>setTimeout(r,800)); return [a, b, p.scrollTop]; }")
            check(f'{tag} grown-ups: the page can still be scrolled by hand while the keyboard is up (it is not pulled back)', mv[1] != mv[0] and mv[2] == mv[1], str(mv))
        at = await pg.evaluate(ATTR, sel); check(f'{tag} grown-ups {sel}: asks for the right keyboard {want}', all(at[x] == v for x, v in want.items()), str(at))
        if sel != '#recNew':
            await pg.keyboard.press('Enter'); await pg.wait_for_timeout(150); check(f'{tag} grown-ups {sel}: Done leaves the box', not await pg.evaluate("Typing.isBox(document.activeElement)"))
        await leave(pg); st = await pg.evaluate(STATE); pr = await pg.evaluate(RECTS, ['#parent'])
        check(f'{tag} grown-ups {sel}: after blur the page fills the screen again', not st['up'] and st['sy'] == 0 and pr[0] == [0, 0, w, h], str(pr))
    # a dialog that holds a box
    await pg.evaluate("()=>{ TOY.confirm('Name this backup', 'Type a name for it.', {ok:'Save', cancel:'Cancel'}); const p=document.querySelector('.toy-dialog-panel'), i=document.createElement('input'); i.id='dlgIn'; i.type='text'; i.className='to-input'; i.style.cssText='width:100%;margin-top:8px'; p.insertBefore(i, p.querySelector('.toy-dialog-btns')); }")
    await pg.tap('#dlgIn'); await pg.wait_for_timeout(200); await kb(pg, k); D = ['.toy-dialog-title', '#dlgIn', '.toy-dialog-btns button']; bad = await pg.evaluate(FIT, [D + ['.toy-dialog-panel'], vis, SAT, False]) + await pg.evaluate(FIT, [D, vis, SAT, True])
    check(f'{tag} a dialog with a box: title, box and both buttons (the whole sheet) above the keyboard, under the status bar', not bad, str(bad)); await pg.screenshot(path=f'{OUT}/dialog_{w}x{h}_kb{k}.png')
    await leave(pg); await pg.tap('.toy-dialog-btns [data-r="0"]'); await pg.wait_for_timeout(200)
    check(f'{tag} grown-ups: no page errors', not errs, str(errs)); await ctx.close()

async def keyboard_fit(b, check, full=True):
    for (w, h, k) in CASES:
        await gate(b, check, w, h, k, full); await name_dialog(b, check, w, h, k, full)
        if full: await setup_name(b, check, w, h, k); await grown_ups(b, check, w, h, k)
