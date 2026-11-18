# Bixi's snack bar (energy bar): feeding on correct answers, the streak burst, fill + bead reward,
# never-drains-on-wrong, within-day persistence, and the daily reset. Look mode, audio off.
import asyncio, os, json
from playwright.async_api import async_playwright
PORT = os.environ.get('PORT', '8765')
SEED = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_init.js')).read()
res = []
def check(label, ok, extra=''): res.append(ok); print(('PASS ' if ok else 'FAIL ') + label + (('  ' + str(extra)) if extra else ''))
async def energy(pg): return await pg.evaluate("window.__energy()")
async def funrec(pg):
    v = await pg.evaluate("window.__legacy('fun')"); return json.loads(v) if v else {}
async def beads(pg): return (await funrec(pg)).get('wallet', {}).get('beads', 0)
async def drill(pg): return await pg.evaluate("window.__drill()")
async def solve(pg, correct=True):
    d = await drill(pg); a = d['answer']
    for ch in str(a if correct else a + 1): await pg.click(f'#pad [data-k="{ch}"]')
    await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1000)

async def enter(pg):
    await pg.evaluate("App.startMode('visual')"); await pg.wait_for_selector('#drill.active'); await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--autoplay-policy=no-user-gesture-required'])
        errs = []
        base = {'name': 'Mia', 'settingsVersion': 5, 'sfx': False, 'speakFeedback': False, 'gap': 0.5, 'voice': 'ljspeech', 'flashSec': 0.3, 'answerPause': 0, 'count': 20}
        async def newpage():
            ctx = await b.new_context(viewport={'width': 1180, 'height': 820}); pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errs.append(str(e))); await pg.add_init_script(SEED)
            await pg.goto(f'http://localhost:{PORT}/index.html'); await pg.wait_for_timeout(600)
            await pg.evaluate("s=>localStorage.setItem('abacus.settings', JSON.stringify(s))", base)
            await pg.reload(); await pg.wait_for_timeout(700); await enter(pg); return ctx, pg

        ctx, pg = await newpage()

        # 1. the bar shows on the practice screen and starts empty
        e = await energy(pg)
        check('snack bar is visible on the practice screen', e['vis'] != 'hidden', e['vis'])
        check('snack bar starts empty (0, width 0%)', e['n'] == 0 and e['width'] in ('0%', '0px', ''), e)

        # 2. each correct feeds Bixi; the third correct in a row is a streak burst (+2)
        await solve(pg); e1 = await energy(pg)
        await solve(pg); e2 = await energy(pg)
        await solve(pg); e3 = await energy(pg)
        check('correct answers feed Bixi, with a burst on the third (1, 2, 4)', e1['n'] == 1 and e2['n'] == 2 and e3['n'] == 4, [e1['n'], e2['n'], e3['n']])
        check('the bar fills visibly as he eats (width > 0%)', e3['width'] not in ('0%', '0px', ''), e3['width'])

        # 3. a wrong answer never drains the bar - it only cools the streak
        await solve(pg, correct=False); ew = await energy(pg)
        check('a wrong answer does not drain the bar', ew['n'] == 4 and ew['streak'] == 0, ew)
        await solve(pg); e5 = await energy(pg)
        check('after a miss the next correct adds a single bead, no burst', e5['n'] == 5 and e5['streak'] == 1, e5)

        # 4. fill him up -> full state at 100%, plus a one-time bead reward
        before = await beads(pg)
        for _ in range(8):
            if (await energy(pg))['full']: break
            await solve(pg)
        ef = await energy(pg); after = await beads(pg)
        check('bar fills to full at the goal (width 100%)', ef['full'] and ef['n'] == ef['goal'] and ef['width'] == '100%', ef)
        check('filling Bixi up awards a bead reward', after > before, [before, after])

        # 5. once full, extra correct answers never over-feed or re-reward
        await solve(pg); eo = await energy(pg); after2 = await beads(pg)
        check('already full: no over-feeding and no second reward', eo['n'] == eo['goal'] and after2 == after, [eo['n'], after, after2])

        # 6. the bar persists within the same day across a reload
        await pg.reload(); await pg.wait_for_timeout(700); await enter(pg)
        ep = await energy(pg)
        check('snack bar persists within the day (still full after reload)', ep['full'] and ep['n'] == ep['goal'], ep)

        # 7. a new day resets the bar to empty
        await pg.evaluate("window.__setFeedDay('2000-01-01')"); await enter(pg)
        er = await energy(pg)
        check('a new day resets the snack bar to empty', er['n'] == 0 and not er['full'], er)
        await ctx.close()

        print('errors:', errs); print('RESULT', sum(res), '/', len(res))
asyncio.run(main())
