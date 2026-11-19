import asyncio, os
from playwright.async_api import async_playwright
# Guard: every lesson line the app can SAY aloud must have a recording.
# Walks every demo of every node through the real curriculum, collects each step's
# stable key (step.k), and asserts Classroom.Voice.find('juni', k) returns a clip.
# If a reword, a new node, or any other change adds a line with no recording, this
# FAILS the build here instead of the child hearing silence in the app.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.Curriculum && window.Classroom && Classroom.Voice", timeout=20000)
        # make sure the lesson voice pack is loaded before we probe it
        await pg.evaluate("async()=>{ try{ await Classroom.Voice.load('juni'); }catch(e){} }")
        await pg.wait_for_timeout(300)

        # enumerate every demo line the curriculum can produce, with its stable key
        data = await pg.evaluate("""()=>{
          const C = window.Curriculum, out = [];
          for (const n of C.NODES){
            for (const pair of (n.demos||[])){
              let ls; try{ ls = C.lessonStep(n, pair); }catch(e){ continue; }
              for (const s of (ls.steps||[])) if (s.say) out.push({node:n.id, k:s.k||null, say:s.say});
            }
          }
          return out;
        }""")

        nokey = [d for d in data if not d['k']]
        check('every demo step has a stable key (step.k)', not nokey, [d['node']+': '+d['say'][:40] for d in nokey[:6]])

        # keys must be unique per distinct sentence (no two different lines share a key)
        k2s = {}
        clash = []
        for d in data:
            if not d['k']: continue
            if d['k'] in k2s and k2s[d['k']] != d['say']: clash.append((d['k'], k2s[d['k']], d['say']))
            else: k2s[d['k']] = d['say']
        check('keys are 1:1 with sentences (no collisions)', not clash, clash[:4])

        # the real lookup path: each key must resolve to a recorded clip in the pack
        probe = await pg.evaluate("""(keys)=>{
          const V = window.Classroom.Voice, miss = [];
          for (const k of keys){ const r = V.find('juni', k); if (!(r && r[0] && r[1])) miss.push(k); }
          return miss;
        }""", sorted(k2s.keys()))
        check('every demo line resolves to a recorded clip (no silent lines)', not probe,
              [k + ' = ' + k2s.get(k, '')[:40] for k in probe[:10]])

        # every node that SHOWS a New-skill intro card must have its intro line recorded -- now including the
        # flash/mental (anzan) nodes, which show a voiced intro card before the drill (v4.28).
        intro_need = await pg.evaluate("""()=>window.Curriculum.NODES.filter(n=>n.intro).map(n=>'intro_'+n.id)""")
        intro_miss = await pg.evaluate("""(keys)=>{const V=window.Classroom.Voice,m=[];for(const k of keys){const r=V.find('juni',k);if(!(r&&r[0]&&r[1]))m.push(k);}return m;}""", intro_need)
        check('every lesson intro card has a recorded voice line', not intro_miss, intro_miss)
        # the finger-technique step lines must all be recorded
        fing = ['fingers_intro','fingers_thumb','fingers_pointer','fingers_heaven','fingers_recap']
        fmiss = await pg.evaluate("""(keys)=>{const V=window.Classroom.Voice,m=[];for(const k of keys){const r=V.find('juni',k);if(!(r&&r[0]&&r[1]))m.push(k);}return m;}""", fing)
        check('finger-technique step lines all have a voice', not fmiss, fmiss)
        # the locked-practice banner has a voice too
        banner = await pg.evaluate("""()=>{const r=window.Classroom.Voice.find('juni','j_door_first');return !!(r&&r[0]&&r[1]);}""")
        check('practice "sums come soon" banner has a voice line', banner)

        check('no page errors', not errs, errs[:3])
        await b.close()

asyncio.run(main())
print('\n' + ('ALL PASS' if not fails else 'FAILURES: ' + '; '.join(fails)))
import sys; sys.exit(1 if fails else 0)
