import asyncio, os
from playwright.async_api import async_playwright
# First lesson (Beads & numbers) must start by NAMING THE PARTS of the abacus (abacus, rod, beam, heaven bead,
# earth beads) -- each glowing as Juni names it -- BEFORE the value demos and finger technique. This reproduces
# the real lesson flow and checks: the anatomy phase comes first, each step glows the right part and has a
# recorded Juni voice, and it then flows into the watch/value step.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

GLOW = {
  0: ("#lessonAbacus .abx-bead.abx-anat, #lessonAbacus .abx-beam.abx-anat", "whole abacus glows"),
  1: ('#lessonAbacus .abx-rod[data-rod="0"] .abx-rodline.abx-anat', "the rod glows"),
  2: ("#lessonAbacus .abx-beam.abx-anat", "the beam glows"),
  3: ('#lessonAbacus .abx-rod[data-rod="0"] .abx-bead[data-kind="h"].abx-anat', "the heaven bead glows"),
  4: ('#lessonAbacus .abx-rod[data-rod="0"] .abx-bead[data-kind="e"].abx-anat', "the earth beads glow"),
}
ANAT_KEYS = ['anat_abacus','anat_rod','anat_beam','anat_heaven','anat_earth']

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.App && window.Classroom && window.Lessons", timeout=20000)
        await pg.evaluate("""()=>{localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}));
                               localStorage.setItem('abacus.settings',JSON.stringify({name:'Mia',settingsVersion:6,voice:'ljspeech',sfx:false}));}""")
        await pg.reload(); await pg.wait_for_function("window.App && window.Classroom && window.Lessons", timeout=20000)
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.evaluate("async()=>{ try{ await window.Classroom.Voice.load('juni'); }catch(e){} }")
        await pg.wait_for_timeout(400)

        # all 5 anatomy lines must be recorded
        miss = await pg.evaluate("""(keys)=>{const V=window.Classroom.Voice,m=[];for(const k of keys){const r=V.find('juni',k);if(!(r&&r[0]&&r[1]))m.push(k);}return m;}""", ANAT_KEYS)
        check('all 5 anatomy lines have a recorded Juni voice', not miss, miss)

        # the FIRST thing the first lesson shows is the parts of the abacus (not the "worth 5 / worth 1" card)
        await pg.evaluate("()=>window.Lessons.start('beads','home')")
        await pg.wait_for_timeout(500)
        first_phase = await pg.evaluate("()=>document.querySelector('#lesson').dataset.phase")
        check('the FIRST thing lesson one shows is the parts of the abacus', first_phase == 'anatomy', first_phase)
        first_kind = (await pg.text_content('#capKind')) or ''
        check('the first card is labelled "Parts of the abacus" (not a value rule)', 'Parts of the abacus' in first_kind, first_kind)

        async def readout():
            return await pg.evaluate("()=>{const b=document.querySelector('#lessonAbacus .abx-readout b');return b?b.textContent.trim():'?';}")

        # step through all 5 parts, checking the caption, the right glow, and the demo for rod / heaven
        for i in range(5):
            kind = (await pg.text_content('#capKind')) or ''
            check(f'step {i}: labelled "Parts of the abacus"', 'Parts of the abacus' in kind, kind)
            await pg.wait_for_timeout(350)  # let reset+anatHL run
            sel, desc = GLOW[i]
            n = await pg.evaluate("(s)=>document.querySelectorAll(s).length", sel)
            check(f'step {i}: {desc}', n > 0, f'{sel} -> {n}')
            # only the current part glows (nothing stale from the previous step) for the single-element parts
            if i in (1, 2, 3):
                total = await pg.evaluate("()=>document.querySelectorAll('#lessonAbacus .abx-anat').length")
                check(f'step {i}: only the named part glows', total == 1, total)
            if i == 1:  # rod: a bead slides up and down (readout ticks to 1 during the slide)
                slid = False
                for _ in range(16):
                    if (await readout()) == '1': slid = True; break
                    await pg.wait_for_timeout(120)
                check('step 1: a bead slides on the rod (readout reaches 1)', slid)
            if i == 2:  # beam: a real colour highlight (not just a glow)
                fill = await pg.evaluate("()=>{const b=document.querySelector('#lessonAbacus .abx-beam.abx-anat');return b?getComputedStyle(b).fill:'';}")
                check('step 2: the beam takes a bright highlight colour', fill.replace(' ','') == 'rgb(242,182,50)', fill)
            if i == 3:  # heaven: the bead slides to the beam to show 5
                shown = False
                for _ in range(16):
                    if (await readout()) == '5': shown = True; break
                    await pg.wait_for_timeout(120)
                check('step 3: the heaven bead shows its value (readout reaches 5)', shown)
                await pg.screenshot(path='/tmp/anat_heaven.png')
            if i == 4:  # earth beads slide up and down like the heaven bead
                moved = False
                for _ in range(16):
                    if (await readout()) == '4': moved = True; break
                    await pg.wait_for_timeout(120)
                check('step 4: the earth beads slide up and down (readout reaches 4)', moved)
            await pg.evaluate("()=>document.querySelector('#lessonNext').click()")
            await pg.wait_for_timeout(350)

        # after the 5 parts it goes STRAIGHT to the finger step -- no redundant New-skill card, no watch demo
        ph = await pg.evaluate("()=>document.querySelector('#lesson').dataset.phase")
        check('after the parts, it goes straight to the finger step (no New-skill card, no watch)', ph == 'fingers', ph)
        kind = (await pg.text_content('#capKind')) or ''
        check('no leftover "New skill" or "Watch" card after the parts', ('New skill' not in kind) and ('Watch' not in kind), kind)
        stale = await pg.evaluate("()=>document.querySelectorAll('#lessonAbacus .abx-anat').length")
        check('the glow is cleared once the anatomy phase ends', stale == 0, stale)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
