import asyncio, os
from playwright.async_api import async_playwright
# Guard: audio must survive the app being backgrounded and reopened.
# Reproduces the two real failure modes seen on device:
#   1. context goes 'suspended' (app minimised / tab hidden) -> must resume on return
#   2. context dies / can't resume ('interrupted' on iOS) -> must be rebuilt, and the
#      already-decoded clips must still play on the new context (no silent faces).
# Also checks a tap revives a dead context, since that's what a child does when the voice is gone.
fails = []
def check(label, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if not ok and extra != '' else ''))
    if not ok: fails.append(label)

URL = 'http://localhost:%s/index.html' % os.environ.get('PORT', '8765')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
                                    args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL)
        await pg.wait_for_function("window.App && window.App.Speaker && window.Classroom && Classroom.Voice", timeout=20000)

        # first tap: unlock audio, then load Juni's lesson clips (decoded against the current context)
        await pg.evaluate("()=>{ const S=window.App.Speaker; S.unlock(); }")
        await pg.evaluate("async()=>{ try{ await Classroom.Voice.load('juni'); }catch(e){} }")
        await pg.wait_for_timeout(300)
        await pg.evaluate("async()=>{ const S=window.App.Speaker; if (S.ctx && S.ctx.state!=='running'){ try{ await S.ctx.resume(); }catch(e){} } }")
        await pg.wait_for_timeout(100)

        st0 = await pg.evaluate("()=>window.App.Speaker.ctx && window.App.Speaker.ctx.state")
        check('context is running after first tap', st0 == 'running', st0)

        # grab a real recorded clip id so we can prove playback works before/after
        probe = await pg.evaluate("""()=>{
          const V=window.Classroom.Voice;
          for (const k in V.map){ const ids=Object.keys(V.map[k]||{}); if (ids.length) return ids[0]; }
          return null;
        }""")
        check('a Juni clip is loaded to test with', bool(probe), probe)

        def can_play_js():
            # creates a source from a cached (old-context) buffer on the CURRENT context and starts it;
            # returns true only if nothing throws -> proves the clip is audible on whatever context is live now
            return """(id)=>{
              try{
                const S=window.App.Speaker, V=window.Classroom.Voice;
                const r=V.find('juni', id); if (!(r && r[0] && r[1])) return 'no-clip';
                const c=S.ctx; const s=c.createBufferSource(); s.buffer=r[0]; s.connect(c.destination);
                s.start(c.currentTime+0.01, r[1][0], Math.min(0.05, r[1][1])); s.stop(c.currentTime+0.06);
                return 'ok';
              }catch(e){ return 'throw:'+e.message; }
            }"""

        r0 = await pg.evaluate(can_play_js(), probe)
        check('clip plays normally before any backgrounding', r0 == 'ok', r0)

        # ---- failure mode 1: suspended (app minimised), then brought to foreground ----
        await pg.evaluate("async()=>{ try{ await window.App.Speaker.ctx.suspend(); }catch(e){} }")
        susp = await pg.evaluate("()=>window.App.Speaker.ctx.state")
        check('context is suspended after simulated minimise', susp == 'suspended', susp)
        # returning to foreground fires visibilitychange(visible)
        await pg.evaluate("()=>document.dispatchEvent(new Event('visibilitychange'))")
        await pg.wait_for_timeout(600)
        st1 = await pg.evaluate("()=>window.App.Speaker.ctx.state")
        check('context is running again after returning to foreground', st1 == 'running', st1)
        r1 = await pg.evaluate(can_play_js(), probe)
        check('clip plays after suspend/resume cycle', r1 == 'ok', r1)

        # ---- failure mode 2: dead context (iOS "interrupted" that won't resume) ----
        old_id = await pg.evaluate("""async()=>{
          const S=window.App.Speaker; S._mark=(S._mark||0)+1; S.ctx._mark=S._mark;
          try{ await S.ctx.close(); }catch(e){}
          return S.ctx._mark;
        }""")
        closed = await pg.evaluate("()=>window.App.Speaker.ctx.state")
        check('context is closed (simulating an unrecoverable interruption)', closed == 'closed', closed)
        # revive() must rebuild it
        await pg.evaluate("async()=>{ await window.App.Speaker.revive(); }")
        await pg.wait_for_timeout(400)
        rebuilt = await pg.evaluate("()=>{ const S=window.App.Speaker; return {state:S.ctx.state, isNew: S.ctx._mark!==S._mark}; }")
        check('a fresh context is built when the old one is dead', rebuilt.get('isNew') is True, rebuilt)
        check('rebuilt context is running', rebuilt.get('state') == 'running', rebuilt)
        r2 = await pg.evaluate(can_play_js(), probe)
        check('decoded clips still play on the rebuilt context (no silent faces)', r2 == 'ok', r2)

        # ---- a tap must revive a dead context too (what a child does when the voice is gone) ----
        await pg.evaluate("async()=>{ try{ await window.App.Speaker.ctx.close(); }catch(e){} }")
        c2 = await pg.evaluate("()=>window.App.Speaker.ctx.state")
        check('context dead again before tap test', c2 == 'closed', c2)
        await pg.evaluate("()=>document.body.click()")
        await pg.wait_for_timeout(500)
        st3 = await pg.evaluate("()=>window.App.Speaker.ctx.state")
        check('a tap revives the context', st3 == 'running', st3)
        r3 = await pg.evaluate(can_play_js(), probe)
        check('clip plays after tap-revive', r3 == 'ok', r3)

        check('no page errors', not errs, errs[:4])
        await b.close()
        print('errors: %s' % ('[]' if not fails else str(fails)))

asyncio.run(main())
