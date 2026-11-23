import asyncio, os
from playwright.async_api import async_playwright
# Quick win (v4.54): the child's FIRST real interaction is one guaranteed soroban success, right after meeting Bixi and
# BEFORE the grown-up "do you have an abacus?" question / placement. Teach-Bixi framing: slide one earth bead up to make 1
# on the on-screen soroban (AbacusInput). This suite drives a fresh profile and asserts the beat appears in the right
# place, nudges the exact bead, succeeds on make-1, re-nudges on a pause, and stays robust with voice OFF and when audio
# fails/hangs (the v4.53 beat() pattern never blocks on audio).
PORT = os.environ.get('PORT', '8765')
URL = f'http://localhost:{PORT}/index.html'
SHOTS = '/tmp/v454'
TARGET = '#suWinHost .abx-bead[data-kind="e"][data-k="0"]'
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if extra else ''))
    if not ok: fails += 1

async def gate_to_name(pg):
    await pg.evaluate("localStorage.clear()"); await pg.reload()
    await pg.wait_for_selector('#gate.active', timeout=20000)
    await pg.evaluate('window.__gateHold()'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk')
    await pg.wait_for_selector('#suName.on', timeout=20000)

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width': 1180, 'height': 820})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL)

        # ---- 1. voice OFF: appears after meeting Bixi, before placement; nudges the right bead; make-1 advances ----
        await gate_to_name(pg)
        await pg.evaluate("App.settings.bixTalks=false")
        await pg.fill('#suNameIn', 'June'); await pg.click('#suNameGo')
        await pg.wait_for_selector('#setup.cl-bixi-here', timeout=20000)   # the meet beat ran: Bixi rolled in
        await pg.wait_for_selector('#suWin.on', timeout=20000)
        st = await pg.evaluate("""()=>({
          step: document.querySelector('#setup').dataset.step,
          abacusYet: document.querySelector('#suAbacus').classList.contains('on'),
          svg: document.querySelectorAll('#suWinHost .abx-svg').length,
          bixiHere: document.querySelector('#setup').classList.contains('cl-bixi-here')})""")
        check('quick win is the step right after meeting Bixi, BEFORE the abacus question/placement',
              st['step'] == 'suWin' and st['bixiHere'] and not st['abacusYet'], st)
        check('quick win shows the on-screen soroban (AbacusInput)', st['svg'] == 1, st)
        # the exact bead to move (earth k=0 = make 1) carries the animated nudge (pulsing ring + up-arrow)
        await pg.wait_for_selector(TARGET + '.qw-nudge', timeout=20000)
        nud = await pg.evaluate("(sel)=>{const b=document.querySelector(sel);return {nudge:b.classList.contains('qw-nudge'), ring:!!b.querySelector('.qw-ring'), arrow:!!b.querySelector('.qw-arrow')};}", TARGET)
        check('the exact bead (earth k=0) is nudged with a ring + up-arrow', nud['nudge'] and nud['ring'] and nud['arrow'], nud)
        jb = (await pg.text_content('#juniBubble .ctext') or '')
        check('Juni frames it on screen (teach-Bixi, make 1)', 'Bixi' in jb and '1' in jb, repr(jb))
        await pg.screenshot(path=f'{SHOTS}/qw_prompt.png')

        # a pause re-nudges: drop the highlight, wait, and it comes back on its own (idle re-nudge)
        await pg.evaluate("(sel)=>document.querySelector(sel).classList.remove('qw-nudge')", TARGET)
        reappeared = True
        try: await pg.wait_for_selector(TARGET + '.qw-nudge', timeout=9000)
        except Exception: reappeared = False
        check('if the child pauses, the nudge gently re-appears (idle re-nudge)', reappeared)

        # slide the bead up to make 1 -> readout shows 1 -> immediate success -> advances to the abacus question
        await pg.click(TARGET + ' .abx-lens')
        await pg.wait_for_timeout(200)
        ro = (await pg.text_content('#suWinHost .abx-readout') or '')
        check('making 1: the readout shows 1', '1' in ro, repr(ro))
        jbw = (await pg.text_content('#juniBubble .ctext') or '')
        check('making 1: Juni gives a specific process-praise line', 'did it' in jbw.lower() or 'made 1' in jbw.lower(), repr(jbw))
        await pg.screenshot(path=f'{SHOTS}/qw_success.png')
        await pg.wait_for_selector('#suAbacus.on', timeout=20000)
        check('success advances to the abacus question, with placement still to follow',
              await pg.locator('#suAbacus.on').count() == 1 and await pg.locator('#suWin.on').count() == 0)
        # the existing placement check still comes after
        await pg.click('[data-abacus=no]'); await pg.wait_for_selector('#suLevel.on', timeout=20000)
        await pg.click('[data-lv=check]'); await pg.wait_for_selector('#suCheck.on', timeout=20000)
        check('placement check still follows the quick win', await pg.locator('#suCheck.on').count() == 1)
        await pg.screenshot(path=f'{SHOTS}/qw_then_placement.png')

        # ---- 2. audio FAILS/HANGS with voice ON: the beat() pattern must still reach + pass the quick win ----
        await gate_to_name(pg)
        # voice on, but every clip rejects (fail) — stand in for a hung/failed clip; onboarding must never block on it
        await pg.evaluate("()=>{ window.App.settings.bixTalks=true; window.Classroom.Voice.play=function(){ return new Promise((_,rej)=>setTimeout(()=>rej(new Error('audio fail')),10)); }; }")
        await pg.fill('#suNameIn', 'Kai'); await pg.click('#suNameGo')
        await pg.wait_for_selector('#suWin.on', timeout=25000)
        check('audio fails: the quick win still appears (never blocks on audio)', await pg.locator('#suWin.on').count() == 1)
        jb2 = (await pg.text_content('#juniBubble .ctext') or '')
        check('audio fails: the words are still on screen (bubble shows the prompt)', 'Bixi' in jb2 and '1' in jb2, repr(jb2))
        await pg.wait_for_selector(TARGET + '.qw-nudge', timeout=20000)
        await pg.click(TARGET + ' .abx-lens')
        await pg.wait_for_selector('#suAbacus.on', timeout=25000)
        check('audio fails: making 1 still succeeds and advances', await pg.locator('#suAbacus.on').count() == 1)

        check('no page errors', not errs, errs[:3])
        await b.close()

asyncio.run(main())
print('\n' + ('ALL PASS' if not fails else 'FAILURES'))
import sys; sys.exit(1 if fails else 0)
