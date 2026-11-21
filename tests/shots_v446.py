import asyncio, os
from playwright.async_api import async_playwright
# Screenshots for the v4.46 timing feature. Proves (mid-set) that NO timer is visible, and captures the
# set-complete reveal, a "New best!" state, and the mode-complete (7/7) total. Runs at 1024 and 1180 wide.
PORT = os.environ.get('PORT', '8765')
URL = 'http://localhost:%s/index.html' % PORT
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = open(os.path.join(ROOT, 'tests', 'seed_init.js')).read()
OUT = '/tmp/v446'
os.makedirs(OUT, exist_ok=True)
SETTINGS = ("()=>localStorage.setItem('abacus.settings', JSON.stringify("
            "{name:'Mia', settingsVersion:9, speakFeedback:false, sfx:false, voice:'device', gap:0.2, bixVoice:'sweet'}))")

async def new_page(b, w):
    ctx = await b.new_context(viewport={'width': w, 'height': 820})
    pg = await ctx.new_page()
    await pg.add_init_script(SEED)
    await pg.goto(URL)
    await pg.wait_for_function("window.App && window.__level && window.__practice && window.__times && window.TimeModel", timeout=30000)
    await pg.evaluate(SETTINGS)
    await pg.reload()
    await pg.wait_for_function("window.App && window.__level && window.__practice && window.__times && window.TimeModel", timeout=30000)
    await pg.mouse.click(600, 12)
    await pg.wait_for_timeout(600)
    return ctx, pg

async def setup_node(pg, node, reading=0, listening=0):
    await pg.evaluate("""a=>{ const [node,r,l]=a;
        window.App.applySetup({name:'Mia', current:node, how:'parent'});
        window.__markLearned(node);
        for (let i=0;i<r;i++) window.__level.bumpMode(node,'reading');
        for (let i=0;i<l;i++) window.__level.bumpMode(node,'listening'); }""", [node, reading, listening])
    await pg.wait_for_timeout(150)

async def answer_pad(pg, v):
    for ch in str(v):
        await pg.evaluate("c=>{const b=[...document.querySelectorAll('#pad [data-k]')].find(x=>x.dataset.k===c); if(b) b.click();}", ch)
    await pg.evaluate("()=>{const g=[...document.querySelectorAll('#pad [data-k]')].find(x=>x.dataset.k==='go'); if(g) g.click();}")

async def drive_reading(pg, upto=10):
    await pg.wait_for_selector('#drill.active', timeout=15000)
    for i in range(upto):
        await pg.wait_for_function("i=>{const d=window.__drill(); return d && d.mode==='visual' && d.idx===i && !d.reviewing && d.answer!=null;}", arg=i, timeout=15000)
        d = await pg.evaluate("()=>window.__drill()")
        await answer_pad(pg, d['answer'])
        if i < upto - 1:
            await pg.wait_for_function("i=>{const d=window.__drill(); return d.idx>i || d.reviewing || document.querySelector('.toy-dialog');}", arg=i, timeout=15000)

async def shot(pg, name):
    await pg.wait_for_timeout(450)
    path = os.path.join(OUT, name)
    await pg.screenshot(path=path)
    print('wrote', path)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        for w in (1024, 1180):
            # --- mid-set: NO visible timer while solving ---
            ctx, pg = await new_page(b, w)
            await setup_node(pg, 'sub_direct')
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("()=>window.__practice.runMode('reading')")
            await pg.wait_for_function("()=>window.__drill() && window.__drill().mode==='visual' && window.__drill().answer!=null", timeout=15000)
            # answer a few so it clearly reads as mid-solving, then capture
            d = await pg.evaluate("()=>window.__drill()")
            await answer_pad(pg, d['answer'])
            await pg.wait_for_function("()=>{const d=window.__drill(); return d.idx>0;}", timeout=15000)
            await shot(pg, 'midset_no_timer_%d.png' % w)
            await ctx.close()

            # --- set-complete reveal (normal set): "Set done — M:SS" ---
            ctx, pg = await new_page(b, w)
            await setup_node(pg, 'sub_direct')
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("()=>window.__practice.runMode('reading')")
            await drive_reading(pg)
            await pg.wait_for_selector('.toy-dialog', timeout=20000)
            await shot(pg, 'setdone_reveal_%d.png' % w)
            await ctx.close()

            # --- "New best!" state: seed a slow prior best so a real (fast) set beats it ---
            ctx, pg = await new_page(b, w)
            await setup_node(pg, 'sub_direct')
            await pg.evaluate("""()=>window.Store.set('times', {sub_direct:{reading:{bestSet:999000, recentSets:[999000], run:{sum:0,sets:0}, bestTotal:null}}})""")
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("()=>window.__practice.runMode('reading')")
            await drive_reading(pg)
            await pg.wait_for_selector('.toy-dialog', timeout=20000)
            await shot(pg, 'newbest_%d.png' % w)
            await ctx.close()

            # --- mode-complete (7/7): session 7 of a timed run shows the total ---
            ctx, pg = await new_page(b, w)
            await setup_node(pg, 'sub_direct', reading=6)   # six Reading sessions already counted
            # the current timed run already has six sets banked, so the 7th completes it and reveals the total
            await pg.evaluate("""()=>window.Store.set('times', {sub_direct:{reading:{bestSet:38000, recentSets:[42000,40000,41000,39000,38000], run:{sum:243000,sets:6}, bestTotal:null}}})""")
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await pg.evaluate("()=>window.__practice.runMode('reading')")
            await drive_reading(pg)
            await pg.wait_for_selector('.toy-dialog', timeout=20000)
            await shot(pg, 'modecomplete_7of7_%d.png' % w)
            await ctx.close()

            # --- bonus: the picker 'Best:' line ---
            ctx, pg = await new_page(b, w)
            await setup_node(pg, 'sub_direct', reading=2, listening=1)
            await pg.evaluate("""()=>window.Store.set('times', {sub_direct:{reading:{bestSet:72000, recentSets:[72000], run:{sum:72000,sets:1}, bestTotal:null}, listening:{bestSet:95000, recentSets:[95000], run:{sum:95000,sets:1}, bestTotal:null}}})""")
            await pg.evaluate("window.__practice.start('sub_direct')")
            await pg.wait_for_selector('#practicePick.active', timeout=15000)
            await shot(pg, 'picker_best_%d.png' % w)
            await ctx.close()

        await b.close()

asyncio.run(main())
