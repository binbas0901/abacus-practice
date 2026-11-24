import asyncio, os
from playwright.async_api import async_playwright
# v4.77: the arithmetic drills are NO-FAIL in the moment (like Level 1). A wrong answer keeps the child on the
# SAME problem (second try, then "Show me"/watch-the-beads), never skipping ahead; a correct answer advances.
# Drives the real drill via the __drill() state hook + __drillAnswer() submit hook.
PORT = os.environ.get('PORT', '8777')
URL = f'http://localhost:{PORT}/index.html'
fails = 0
def check(label, ok, extra=''):
    global fails
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if (not ok and extra != '') else ''))
    if not ok: fails += 1

SEED = """()=>{ try{window.Fun.data.answerTool='keys';}catch(e){}
  localStorage.setItem('abacus.settings', JSON.stringify({name:'June',settingsVersion:6,voice:'juni',sfx:false,hasAbacus:true}));
  localStorage.setItem('abacus.progress', JSON.stringify({current:'sf_add', nodes:{
    beads:{lesson:true,mastered:true,hist:[],modes:{reading:7,listening:7}},
    sf_add:{lesson:true,mastered:null,hist:[]}}})); }"""

async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await (await b.new_context(viewport={'width':1180,'height':820})).new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function('window.App && window.__practice && window.__drill && window.__drillAnswer && window.Fun', timeout=30000)
        await pg.evaluate(SEED)
        await pg.reload(); await pg.wait_for_function('window.App && window.__practice && window.__drill && window.Fun', timeout=30000)
        await pg.wait_for_timeout(300); await pg.evaluate('()=>window.App.Speaker.unlock()')
        await pg.evaluate("()=>{ try{window.Fun.data.answerTool='keys';}catch(e){} window.__practice.start('sf_add'); }")
        await pg.wait_for_timeout(200)
        await pg.evaluate("()=>window.__practice.runMode('reading')")
        try:
            await pg.wait_for_function("()=>{const d=window.__drill(); return d.mode==='visual' && d.answer!=null;}", timeout=8000)
        except Exception:
            check('arithmetic drill started in visual mode', False, await pg.evaluate('()=>window.__drill()'));
            print(f'\n{fails} FAIL(S)'); await b.close(); return 1
        d0 = await pg.evaluate('()=>window.__drill()'); ans = d0['answer']; idx0 = d0['idx']
        check('drill shows "Show me" only after a miss (hidden at first)', not d0['showMe'])
        # a WRONG answer must NOT advance
        await pg.evaluate('(w)=>window.__drillAnswer(w)', ans + 1); await pg.wait_for_timeout(1800)
        d1 = await pg.evaluate('()=>window.__drill()')
        check('wrong answer keeps the child on the SAME problem (no-fail)', d1['idx'] == idx0, d1)
        check('the miss is counted once (tries>=1)', d1['tries'] >= 1)
        check('"Show me" help appears after the miss', d1['showMe'])
        check('no page errors on a miss', not errs, errs[:2])
        # a CORRECT answer advances
        await pg.evaluate('(a)=>window.__drillAnswer(a)', ans); await pg.wait_for_timeout(1800)
        d2 = await pg.evaluate('()=>window.__drill()')
        check('correct answer advances to the next problem', d2['idx'] > idx0, d2)
        await b.close()
    print(('\nALL PASS' if not fails else f'\n{fails} FAIL(S)'))
    return 1 if fails else 0

import sys
sys.exit(asyncio.run(main()))
