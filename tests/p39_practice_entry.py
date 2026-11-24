import asyncio, os
from playwright.async_api import async_playwright
# Practice-first entry (v4.42): tapping the home "Practice" door launches the level run. A returning child on a
# learned level goes straight to the Reading/Listening picker; a first-time (untaught) level is TAUGHT first
# (welcome lesson) before the picker; a mental-math (flash) level runs the flash drill directly. DRIVES THE REAL APP.
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

# make node current; learned=True skips the first-time welcome lesson
async def setup_node(pg, node, learned=True, reading=0, listening=0):
    await pg.evaluate("""a=>{ const [node,learned,r,l]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        if (learned) window.__markLearned(node); else window.__unlearn(node);
        for (let i=0;i<r;i++) window.__level.bumpMode(node,'reading');
        for (let i=0;i<l;i++) window.__level.bumpMode(node,'listening');
        window.App.show('home'); }""", [node, learned, reading, listening])
    await pg.wait_for_timeout(300)

async def door_visible(pg):
    home = await pg.evaluate("()=>!!document.querySelector('#home.active')")
    vis = await pg.evaluate("()=>{const b=document.querySelector('#homeKit'); return !!b && b.offsetParent!==null;}")   # the kit home is the practice entry now
    return home, vis

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])

        # ---- returning child, learned level, nothing done yet -> straight to the picker ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', learned=True)
        home, vis = await door_visible(pg)
        check('returning: on home before tapping Practice', home, home)
        check('returning: the Practice door is visible on home', vis, vis)
        await pg.evaluate("document.getElementById('doorPractice').click()")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        st = await pg.evaluate("()=>({on: window.__practice.on, lesson: !!document.querySelector('#lesson.active')})")
        check('returning: tapping Practice goes straight to the picker (no lesson)', st['on'] is True and st['lesson'] is False, st)
        cards = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>e.getAttribute("data-mode"))')
        check('returning: picker offers Reading and Listening', cards == ['reading', 'listening'], cards)
        check('returning: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- picker reflects progress: Reading finished -> its card marked done, Listening still open ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'sub_direct', learned=True, reading=7, listening=3)
        await pg.evaluate("document.getElementById('doorPractice').click()")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        marks = await pg.evaluate("""()=>{const c=[...document.querySelectorAll('#ppCards .pp-card')];
            const by=m=>c.find(x=>x.dataset.mode===m);
            return {readingDone: by('reading') && by('reading').classList.contains('is-done'),
                    listeningDone: by('listening') && by('listening').classList.contains('is-done')};}""")
        check('progress: the finished Reading mode is marked done on the picker', marks['readingDone'] is True, marks)
        check('progress: the unfinished Listening mode is NOT marked done', marks['listeningDone'] is False, marks)
        check('progress: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- first-time (untaught) level -> welcome lesson before the picker ----
        # add_direct is a non-flash skill that has a welcome lesson (demos); applySetup leaves the current node untaught.
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'add_direct', learned=False)
        await pg.evaluate("document.getElementById('doorPractice').click()")
        await pg.wait_for_function("()=>!!document.querySelector('#lesson.active')", timeout=15000)
        st = await pg.evaluate("()=>({lesson:!!document.querySelector('#lesson.active'), pick:!!document.querySelector('#practicePick.active'), on:window.__practice.on})")
        check('first-time: tapping Practice teaches the welcome lesson first', st['lesson'] is True and st['pick'] is False, st)
        check('first-time: a Skip control is available on the lesson', (await pg.evaluate("()=>{const b=document.querySelector('#lessonSkip'); return !!b && b.offsetParent!==null;}")), True)
        # skipping the welcome lesson drops into the picker (not stuck on the lesson)
        await pg.evaluate("()=>{const b=document.querySelector('#lessonSkip'); if(b) b.click();}")
        await pg.wait_for_function("()=>!!document.querySelector('#practicePick.active')", timeout=15000)
        after = await pg.evaluate("()=>({pick:!!document.querySelector('#practicePick.active'), learned:(window.__prog('add_direct').node||{}).lesson})")
        check('first-time: Skip goes to the picker and marks the welcome seen', after['pick'] is True and after['learned'] is True, after)
        check('first-time: no page errors', not errs, errs[:3])
        await ctx.close()

        # ---- mental-math (flash) level -> flash drill directly, no picker ----
        ctx, pg, errs = await new_page(b)
        await setup_node(pg, 'anzan', learned=True)
        is_flash = await pg.evaluate("()=>window.__level.isFlashNode('anzan')")
        if is_flash:
            await pg.evaluate("document.getElementById('doorPractice').click()")
            await pg.wait_for_function("()=>!!document.querySelector('#drill.active')", timeout=15000)
            st = await pg.evaluate("()=>({ptype: window.__practice.type, mode:(document.querySelector('#drill')||{dataset:{}}).dataset.mode, pick:!!document.querySelector('#practicePick.active')})")
            check('flash level: Practice runs the flash drill directly (no picker)', st['ptype'] == 'flash' and st['pick'] is False, st)
            check('flash level: the drill is in flash mode', st['mode'] == 'flash', st)
            check('flash level: no page errors', not errs, errs[:3])
        else:
            check('flash level: anzan is a flash node', False, 'anzan not flagged kind:flash')
        await ctx.close()

        await b.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + str(fails)))
    print('errors:', [] if not fails else fails)

asyncio.run(main())
