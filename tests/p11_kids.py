import asyncio, json
from playwright.async_api import async_playwright
# Sibling profiles + storage layer: existing single-child data must move into child 1 with nothing lost.
res=[]
def check(label, ok, extra=''): res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
LEGACY = r"""(()=>{ if (localStorage.getItem('abacus.children')) return;
 localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false, voice:'ljspeech', gap:1.5,
   treats:[{id:'t9',emoji:'🐔',name:'Chick-fil-A',price:30}], profiles:[{id:'p1',name:'Dad'}]}));
 const pr={current:'bf_add_a',nodes:{}}; ['beads','add_direct','sub_direct','sf_add','sf_sub'].forEach(id=>pr.nodes[id]={lesson:true,mastered:'parent',hist:[]});
 localStorage.setItem('abacus.progress', JSON.stringify(pr));
 localStorage.setItem('abacus.history', JSON.stringify([{day:'2026-11-10',node:'sf_sub',mode:'visual',n:10,ok:9}]));
 localStorage.setItem('abacus.days', JSON.stringify({'2026-11-10':1}));
 localStorage.setItem('abacus.fun', JSON.stringify({stickers:{s1:1,s2:1}, beads:17, garden:{'2026-11-10':'🌻'}}));
})()"""
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_timeout(300)
    await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_timeout(500)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1180,'height':820}); pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(LEGACY)
        await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(1500)
        kids=await pg.evaluate("Store.children()"); act=await pg.evaluate("Store.activeId()")
        check('old data becomes child 1 named Mia', len(kids)==1 and kids[0]['name']=='Mia', kids)
        pr=await pg.evaluate("Store.get('progress')"); fun=await pg.evaluate("Store.get('fun')"); s=await pg.evaluate("App.settings")
        check('progress kept', pr and pr['current']=='bf_add_a' and len(pr['nodes'])>=5)
        check('history and days kept', len(await pg.evaluate("Store.get('history')"))==1 and '2026-11-10' in await pg.evaluate("Store.get('days')"))
        check('stickers, beads, garden kept', fun.get('stickers',{}).get('s1')==1 and fun.get('beads')==17)
        check('custom treats kept (per child)', s.get('treats',[{}])[0].get('name')=='Chick-fil-A')
        check('voice profiles and settings kept (family)', s.get('profiles',[{}])[0].get('name')=='Dad' and s.get('voice')=='ljspeech' and s.get('gap')==1.5)
        check('one-time backup of old data saved', await pg.evaluate("!!localStorage.getItem('abacus.backup.v3')"))
        check('old keys cleared', await pg.evaluate("['settings','progress','history','days','fun'].every(k=>localStorage.getItem('abacus.'+k)===null)"))
        check('home shows, no switch button with one child', await pg.is_visible('#home') and not await pg.is_visible('#switchKid'))
        # add a second child
        await gate(pg)
        check('Children section lists Mia', 'Mia' in (await pg.text_content('#kidsList')))
        await pg.click('#kidAdd'); await pg.wait_for_timeout(1500)
        check('new child starts with first-time setup', await pg.is_visible('#setup'))
        await pg.fill('#suNameIn','Arjun'); await pg.click('#suNameGo'); await pg.wait_for_timeout(2500)
        await pg.click('[data-lv=pick]'); await pg.wait_for_timeout(1500); await pg.click('.su-skill[data-id=add_direct]'); await pg.wait_for_timeout(500)
        await pg.click('#suStart'); await pg.wait_for_timeout(1500)
        pr2=await pg.evaluate("Store.get('progress')"); fun2=await pg.evaluate("Store.get('fun',{})"); s2=await pg.evaluate("App.settings")
        check('Arjun has his own progress', pr2['current']=='add_direct', pr2['current'])
        check('Arjun starts with no stickers or beads', not fun2.get('stickers') and not fun2.get('beads'))
        check('Arjun gets starter treats, not Mia\'s', s2.get('treats') is None or all(t['name']!='Chick-fil-A' for t in s2.get('treats') or []))
        check('family voices still shared', (s2.get('profiles') or [{}])[0].get('name')=='Dad')
        # next launch: who's practising?
        pg2=await ctx.new_page(); pg2.on('pageerror', lambda e: errs.append(str(e))); await pg2.goto('http://localhost:8765/index.html'); await pg2.wait_for_timeout(1500)
        cards=await pg2.eval_on_selector_all('#whoList .who-card','els=>els.map(e=>e.textContent.trim())')
        check("next launch asks who's practising", await pg2.is_visible('#who') and cards==['Mia','Arjun'], cards)
        await pg2.screenshot(path='/tmp/kids_who.png')
        await pg2.click('#whoList .who-card:has-text("Mia")'); await pg2.wait_for_timeout(1800)
        check('picking Mia opens her home with her progress', await pg2.is_visible('#home') and (await pg2.evaluate("Store.get('progress')"))['current']=='bf_add_a' and (await pg2.evaluate("Store.get('fun')")).get('beads')==17)
        check('switch button shows with two children', await pg2.is_visible('#switchKid'))
        await pg2.click('#switchKid'); await pg2.wait_for_timeout(500)
        check('switch button returns to the picker', await pg2.is_visible('#who'))
        await pg2.click('#whoList .who-card:has-text("Arjun")'); await pg2.wait_for_timeout(1800)
        check('Arjun again has his own progress', (await pg2.evaluate("Store.get('progress')"))['current']=='add_direct')
        # export / import round trip (backup file contents)
        exp=await pg2.evaluate("Store.exportChildren()")
        check('backup export holds both children with their data', len(exp)==2 and all('progress' in c['data'] for c in exp))
        # remove Arjun
        pg2.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await gate(pg2); arjun=[c for c in exp if c['name']=='Arjun'][0]['id']
        await pg2.click(f'[data-kidrm="{arjun}"]'); await pg2.wait_for_timeout(1800)
        kids=await pg2.evaluate("Store.children()")
        check('removing Arjun leaves only Mia, picker gone', len(kids)==1 and kids[0]['name']=='Mia' and await pg2.is_visible('#home'), kids)
        check('Mia untouched after removal', (await pg2.evaluate("Store.get('fun')")).get('beads')==17)
        await pg2.evaluate("Store.importChildren(%s, null)" % json.dumps(exp)); kids=await pg2.evaluate("Store.children()")
        check('restoring the backup brings Arjun back', len(kids)==2)
        print('errors:', errs); print('RESULT', sum(res),'/',len(res)); await b.close()
asyncio.run(main())
