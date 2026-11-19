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

        # seed progress so 'anzan' is the current skill and its intro has NOT been seen (anzan not mastered, so
        # advanceCurrent won't skip past it; everything before it mastered so it's reachable)
        await pg.evaluate("""()=>{
          const NS=window.Curriculum.NODES, i=NS.findIndex(n=>n.id==='anzan'), nodes={};
          for (let j=0;j<i;j++) nodes[NS[j].id]={lesson:true, mastered:'parent', hist:[]};
          nodes['anzan']={lesson:false, mastered:null, hist:[]};
          localStorage.setItem('abacus.progress', JSON.stringify({current:'anzan', nodes}));
          localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:6, speakFeedback:false, gap:0.4, voice:'ljspeech', sfx:false, flashSec:1.0}));
        }""")
        await pg.reload()
        await pg.wait_for_function("window.App && window.Classroom", timeout=20000)
        await pg.wait_for_timeout(800)

        cur = await pg.evaluate("()=>window.Curriculum.NODES[(window.App.nodeIndex&&window.App.nodeIndex())||0].id")
        check('current skill is the mental-math node (anzan)', cur == 'anzan', cur)

        # the anzan intro line must be recorded (the card would be silent otherwise) -- load the pack first
        await pg.evaluate("async()=>{ try{ await window.Classroom.Voice.load('juni'); }catch(e){} }")
        await pg.wait_for_timeout(300)
        clip = await pg.evaluate("()=>{const r=window.Classroom.Voice.find('juni','intro_anzan');return !!(r&&r[0]&&r[1]);}")
        check('anzan intro has a recorded Juni voice line', clip)

        # unlock audio, then start the Flash mode -> should show the New-skill intro CARD, not jump to the drill
        await pg.evaluate("()=>window.App.Speaker.unlock()")
        await pg.evaluate("()=>window.App.startMode('flash')")
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

        # second entry: the card is one-time, so Flash now goes straight to the drill
        await pg.evaluate("()=>{ if (window.App.renderHome) window.App.renderHome(); }")
        await pg.evaluate("()=>window.App.startMode('flash')")
        await pg.wait_for_timeout(600)
        second_direct = await pg.evaluate("""()=>document.querySelector('#drill').classList.contains('active')
                                              && !document.querySelector('#lesson').classList.contains('active')""")
        check('second time, Flash skips the card and goes straight to the drill', second_direct)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
