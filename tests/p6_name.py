import asyncio, re, json
from playwright.async_api import async_playwright
def check(label, ok, extra=''): print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width':1180,'height':820}, accept_downloads=True); pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read())
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1000)
        bub = await pg.text_content('#bixHome .bubble')
        check('existing device without a name: Bix asks for it', "don't know your name" in bub, bub)
        await pg.screenshot(path='/tmp/nm_home.png')
        await pg.click('#bixHome .bix'); await pg.wait_for_selector('#nameAsk.active'); await pg.wait_for_timeout(300); await pg.screenshot(path='/tmp/nm_ask.png')
        await pg.fill('#nameAskIn','Mia'); await pg.click('#nameAskOk'); await pg.wait_for_timeout(500)
        st=json.loads(await pg.evaluate("localStorage.getItem('abacus.settings')")); pr=json.loads(await pg.evaluate("localStorage.getItem('abacus.progress')"))
        check('name saved, progress untouched, Bix greets her', st.get('name')=='Mia' and pr['current']=='bf_add_a' and 'Mia' in await pg.text_content('#bixHome .bubble'), f"{st.get('name')} | {pr['current']} | {await pg.text_content('#bixHome .bubble')}")
        await pg.click('#bixHome .bix'); await pg.wait_for_timeout(600)
        check('once named, tapping Bix no longer opens the name box', await pg.locator('#nameAsk.active').count()==0)
        # checklist
        await pg.click('#grownups'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(800)
        rows = await pg.eval_on_selector_all('#setupList .ck','els=>els.map(e=>[e.className.replace("ck ",""), e.querySelector("b").textContent, e.querySelector(".ck-t span").textContent])')
        for r in rows: print('     ', r[0].ljust(4), r[1].ljust(16), r[2][:90])
        await pg.screenshot(path='/tmp/nm_check.png')
        st_map={r[1]:r[0] for r in rows}
        check('checklist: name ok, treats + backup flagged, home screen flagged in a browser', st_map.get('Child’s name')=='ok' and st_map.get('Treats')=='warn' and st_map.get('Backup')=='warn' and st_map.get('Home Screen app')=='todo')
        await pg.click('#bkMake'); await pg.wait_for_function("document.querySelector('#bkSave').style.display===''", timeout=20000)
        async with pg.expect_download() as dl: await pg.click('#bkSave')
        await dl.value; await pg.wait_for_timeout(500)
        bk = await pg.eval_on_selector('#setupList .ck:nth-child(7) .ck-t span','e=>e.textContent')
        check('after a backup the checklist shows it', 'today' in bk, bk)
        await pg.click('#setupList [data-go=skill]'); await pg.wait_for_timeout(900)
        check('"Change" jumps to the current-skill picker', await pg.evaluate("(()=>{const r=document.querySelector('#sNode').getBoundingClientRect(); return r.top>0 && r.bottom<innerHeight})()"))
        print('errors:', errs); await b.close()
asyncio.run(main())
