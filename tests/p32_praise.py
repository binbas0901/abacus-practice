import asyncio, os
from playwright.async_api import async_playwright
# In the lesson "your turn", JUNI (the teacher) must give the encouragement -- not Bixi -- and it must VARY,
# not the same "that's it" every time. Drives the beads your-turn, answers several correct, and inspects which
# voice spoke each time (by instrumenting Classroom.Voice.play / Fun.BixVoice.play).
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
        await pg.wait_for_function("window.App && window.Classroom && window.Lessons", timeout=30000)
        await pg.evaluate("""()=>{localStorage.setItem('abacus.progress',JSON.stringify({current:'beads',nodes:{}}));
                               localStorage.setItem('abacus.settings',JSON.stringify({name:'Mia',settingsVersion:6,voice:'ljspeech',sfx:false}));}""")
        await pg.reload(); await pg.wait_for_function("window.App && window.Classroom && window.Lessons", timeout=30000)
        await pg.wait_for_function("typeof window.__lesson === 'function'", timeout=30000)
        await pg.wait_for_timeout(400)
        await pg.evaluate("()=>window.App.Speaker.unlock()")

        # record every voice line played, tagged by speaker
        await pg.evaluate("""()=>{
          window.__plays=[];
          const V=window.Classroom.Voice, oP=V.play.bind(V);
          V.play=(c,k,f)=>{ window.__plays.push(c+':'+k); return oP(c,k,f); };
          const B=window.Fun.BixVoice, oB=B.play.bind(B);
          B.play=(k,el)=>{ window.__plays.push('bix:'+k); return oB(k,el); };
        }""")

        await pg.evaluate("()=>window.Lessons.start('beads','home')")
        await pg.wait_for_timeout(400)
        # advance to the "your turn" (numbers) phase
        for _ in range(24):
            if (await pg.evaluate("()=>window.__lesson().phase")) == 'numbers': break
            await pg.evaluate("()=>document.querySelector('#lessonNext').click()")
            await pg.wait_for_timeout(300)
        check('reached the your-turn phase', await pg.evaluate("()=>window.__lesson().phase") == 'numbers')
        await pg.wait_for_timeout(300)

        # the "your turn" cue is Juni's, not Bixi's
        plays = await pg.evaluate("()=>window.__plays.slice()")
        check('the your-turn cue is spoken by Juni (juni:juni_turn)', any(p == 'juni:juni_turn' for p in plays), plays[-5:])
        check('Bixi does NOT give the your-turn cue', 'bix:lesson_turn' not in plays)

        # answer several numbers correctly and watch the praise
        for _ in range(6):
            if (await pg.evaluate("()=>window.__lesson().phase")) != 'numbers': break
            await pg.evaluate("()=>window.__lessonSet(window.__lesson().target)")
            await pg.wait_for_timeout(1050)  # praise plays, then advanceLesson (900ms) moves on

        plays = await pg.evaluate("()=>window.__plays.slice()")
        praise = [p for p in plays if ':praise_' in p]
        check('several correct answers produced praise lines', len(praise) >= 4, len(praise))
        check('every praise line is spoken by JUNI, never Bixi', all(p.startswith('juni:praise_') for p in praise), praise)
        check('Bixi never says the old stock praise (lesson_yes)', 'bix:lesson_yes' not in plays)
        check('the encouragement VARIES (not the same line every time)', len(set(praise)) >= 3, praise)
        # no two in a row are identical
        no_imm_repeat = all(praise[i] != praise[i-1] for i in range(1, len(praise)))
        check('no praise line repeats twice in a row', no_imm_repeat, praise)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
