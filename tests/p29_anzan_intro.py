import asyncio, os
from playwright.async_api import async_playwright
# Mental-math (anzan) nodes now show Juni's voiced "New skill" intro card before the flash drill the first time,
# then go straight to the drill. Drives the real flow: card shows the rule + a recorded Juni voice, Start launches
# the flash drill, and a second entry skips the card.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, has_touch=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.Curriculum && window.App && window.Classroom", timeout=20000)

        # v4.51: flash/anzan nodes are OFF the mandatory path (advanceCurrent skips them); the Mental Math MODE is a
        # required third practice track, reached from the picker's "Mental math" card once eligible (combined mastered).
        # Seed everything through `combined` mastered (so eligible) with current = two_digit (a Level-3 physical skill),
        # and the anzan content node's intro NOT seen, so the Mental Math card shows the one-time intro card first.
        await pg.evaluate("""()=>{
          const NS=window.Curriculum.NODES, i=NS.findIndex(n=>n.id==='two_digit'), nodes={};
          for (let j=0;j<i;j++){ if (NS[j].kind!=='flash') nodes[NS[j].id]={lesson:true, mastered:'parent', hist:[]}; }
          nodes['two_digit']={lesson:true, mastered:null, hist:[]};   // current physical skill, learned, not mastered
          // leave 'anzan' (the Level-3 Mental Math content node) absent so its intro has not been seen
          localStorage.setItem('abacus.progress', JSON.stringify({current:'two_digit', nodes}));
          localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:6, speakFeedback:false, gap:0.4, voice:'ljspeech', sfx:false, flashSec:1.0}));
        }""")
        await pg.reload()
        await pg.wait_for_function("window.App && window.Classroom && window.__practice", timeout=20000)
        await pg.wait_for_timeout(800)

        cur = await pg.evaluate("()=>window.Curriculum.NODES[(window.App.nodeIndex&&window.App.nodeIndex())||0].id")
        check('current skill is a physical Level-3 skill (two_digit); flash nodes are off-path', cur == 'two_digit', cur)
        elig = await pg.evaluate("()=>window.__level.anzanEligible()")
        check('Mental Math is unlocked (combined mastered)', elig is True, elig)

        # the anzan intro line must be recorded (the card would be silent otherwise) -- load the pack first
        await pg.evaluate("async()=>{ try{ await window.Classroom.Voice.load('juni'); }catch(e){} }")
        await pg.wait_for_timeout(300)
        clip = await pg.evaluate("()=>{const r=window.Classroom.Voice.find('juni','intro_anzan');return !!(r&&r[0]&&r[1]);}")
        check('anzan intro has a recorded Juni voice line', clip)

        # unlock audio, open the picker, then tap Mental Math -> should show the New-skill intro CARD, not jump to the drill
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.evaluate("()=>window.__practice.start('two_digit')")
        await pg.wait_for_selector('#practicePick.active', timeout=15000)
        mental = await pg.eval_on_selector_all('#ppCards .pp-card', 'els=>els.map(e=>e.getAttribute("data-mode"))')
        check('the picker shows the Mental Math card when eligible', 'mental' in mental, mental)
        await pg.evaluate("()=>window.__practice.runMode('mental')")
        await pg.wait_for_timeout(700)

        lesson_active = await pg.evaluate("()=>document.querySelector('#lesson').classList.contains('active')")
        check('Flash on a mental-math skill shows the intro card first (lesson screen)', lesson_active)
        kind = (await pg.text_content('#capKind')) or ''
        check('the card is labelled a New skill', 'New skill' in kind, kind)
        body = (await pg.text_content('#capText')) or ''
        check('the card shows the mental-math rule text', 'Picture the beads' in body, body[:60])
        drill_hidden = await pg.evaluate("()=>!document.querySelector('#drill').classList.contains('active')")
        check('the flash drill has NOT started yet (card comes first)', drill_hidden)

        # tap through the card (there may be 1+ pages) until it hands off to the drill
        for _ in range(4):
            if await pg.evaluate("()=>document.querySelector('#drill').classList.contains('active')"):
                break
            await pg.evaluate("()=>document.querySelector('#lessonNext').click()")
            await pg.wait_for_timeout(500)

        drill_active = await pg.evaluate("()=>document.querySelector('#drill').classList.contains('active')")
        check('Start launches the flash drill after the card', drill_active)
        dmode = await pg.evaluate("()=>document.querySelector('#drill').dataset.mode")
        check('the drill is in flash mode', dmode == 'flash', dmode)
        seen = await pg.evaluate("""()=>{ try{ return !!progress.nodes.anzan.lesson; }catch(e){ try{ return !!Store.get('progress').nodes.anzan.lesson; }catch(e2){ return 'noaccess'; } } }""")
        check('the intro is marked seen after the card', seen is True, seen)

        # second entry: the card is one-time, so Mental Math now goes straight to the drill (back to picker, tap it again)
        await pg.evaluate("()=>{ const x=document.querySelector('#exitDrill'); if(x) x.click(); }")
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.__practice.runMode('mental')")
        await pg.wait_for_timeout(600)
        second_direct = await pg.evaluate("""()=>document.querySelector('#drill').classList.contains('active')
                                              && !document.querySelector('#lesson').classList.contains('active')""")
        check('second time, Mental Math skips the card and goes straight to the drill', second_direct)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
