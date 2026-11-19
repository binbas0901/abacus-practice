import asyncio, os
from playwright.async_api import async_playwright
# Practice-first entry: tapping the home "Practice" door launches the guided 10x10 orchestrator, resuming at the next
# unfinished set, with the right mechanic for that set's type (listen -> drill, read/build -> game). DRIVES THE REAL APP.
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

async def setup_node(pg, node, done):
    await pg.evaluate("""a=>{ const [node,done]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        for (let i=0;i<done;i++) window.__level.completeSet(node);
        window.App.show('home'); }""", [node, done])
    await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        cases = [
            (0, 'listen', '#drill.active', 'listen'),
            (1, 'read',   '#game.active',  'read'),
            (2, 'build',  '#game.active',  'build'),
        ]
        for done, label, sel, ptype in cases:
            ctx, pg, errs = await new_page(b)
            await setup_node(pg, 'sub_direct', done)
            home = await pg.evaluate("()=>!!document.querySelector('#home.active')")
            check(f'{label}-set: on home before tapping Practice', home, home)
            vis = await pg.evaluate("()=>{const b=document.querySelector('#doorPractice'); return !!b && b.offsetParent!==null;}")
            check(f'{label}-set: the Practice door is visible on home', vis, vis)
            await pg.click('#doorPractice')
            await pg.wait_for_selector(sel, timeout=15000)
            st = await pg.evaluate("()=>({on: window.__practice.on, type: window.__practice.type})")
            check(f'{label}-set: tapping Practice starts the orchestrated run', st['on'] is True, st)
            check(f'{label}-set: resumes at the right set type ({ptype})', st['type'] == ptype, st)
            check(f'{label}-set: no page errors', not errs, errs[:3])
            await ctx.close()

        await b.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + str(fails)))

asyncio.run(main())
