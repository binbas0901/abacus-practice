import asyncio, json, os, re
from playwright.async_api import async_playwright
# Stream C: Practice door (Look / Listen / Flash, My path, Learn it with Bix), lessons, games, grown-ups gate, parent report.
res=[]
def check(label, ok, extra=''): res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
HERE=os.path.dirname(os.path.abspath(__file__)); URL='http://localhost:%s/index.html' % os.environ.get('PORT','8765')
SEED=open(os.path.join(HERE,'seed_report.js')).read()
# navigator.share stand-in: records what would be shared
SHARE="(()=>{ window.__shared=[]; navigator.share=(d)=>{ window.__shared.push(d); return Promise.resolve(); }; })()"
async def gate(pg):
    await pg.click('#grownups'); await pg.wait_for_selector('#gate.active')
    await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(300)
async def door(pg):
    await pg.evaluate("App.show('door')"); await pg.wait_for_selector('#door.active'); await pg.wait_for_timeout(250)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx=await b.new_context(viewport={'width':1180,'height':820}); errs=[]
        pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(SEED); await pg.add_init_script(SHARE)
        await pg.goto(URL); await pg.wait_for_timeout(900)

        # ---- the door draws itself when shown ----
        await door(pg)
        blocks=await pg.eval_on_selector_all('#door .door-block','els=>els.map(e=>e.textContent.trim())')
        check('door: Look, Listen, Flash blocks', blocks==['7+8−4Look','Listen','9Flash'] or [x[-6:].strip() for x in blocks]==['Look','Listen','Flash'], blocks)
        check('door: Bix asks how to play', 'How do you want to play' in (await pg.text_content('#bixDoor .bubble') or ''))
        nodes=await pg.eval_on_selector_all('#doorPath .dp-node','els=>els.map(e=>[e.className.split(" ")[1], e.querySelector(".dp-name").textContent])')
        check('path rod shows only nearby skills: 2 done, current, 2 locked', [n[0] for n in nodes]==['done','done','cur','locked','locked'], nodes)
        check('current skill is Big friends +9…+6 and has the star bead', nodes[2][1].startswith('Big friends') and await pg.locator('#doorPath .dp-node.cur .dp-bead svg').count()>=2)
        check('more skills hinted with … on both sides', await pg.locator('#doorPath .dp-more:has-text("…")').count()==2)
        check('Learn it with Bix button under the current skill', await pg.locator('#doorPath .dp-node.cur #doorLearn').count()==1)
        await pg.click('#doorPath .dp-node.locked .dp-bead >> nth=0'); await pg.wait_for_timeout(200)
        check('tapping a locked bead: Bix explains it is locked', 'Locked' in await pg.text_content('#bixDoor .bubble'))
        await pg.click('#doorPath .dp-node.done .dp-bead >> nth=0'); await pg.wait_for_timeout(200)
        check('tapping a learned bead: Bix praises', 'already know' in await pg.text_content('#bixDoor .bubble'))
        # each block starts its drill mode for the current skill
        for sel, m in (('#doorLook','visual'),('#doorListen','listen'),('#doorFlash','flash')):
            await door(pg); await pg.click(sel); await pg.wait_for_selector('#drill.active', timeout=5000)
            d=await pg.evaluate("window.__drill ? window.__drill() : null")
            check(f'{sel} starts the {m} drill', d and d.get('mode')==m, d and d.get('mode'))
            await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # Learn it with Bix -> lesson for the current skill -> back to the door
        await door(pg); await pg.click('#doorLearn'); await pg.wait_for_selector('#lesson.active')
        check('Learn it with Bix opens the lesson for the current skill', (await pg.text_content('#lessonTitle')).startswith('Big friends') and await pg.text_content('#capKind')=='New skill')
        check('lesson: wooden Workshop soroban', await pg.locator('#lessonAbacus.ws-soroban .sb-rod').count()==5)
        await pg.click('#lessonNext'); await pg.wait_for_timeout(300)
        check('lesson: Next shows a demonstration', (await pg.text_content('#capKind')).startswith('Watch 1 of'), await pg.text_content('#capKind'))
        await pg.click('#exitLesson'); await pg.wait_for_timeout(300)
        check('leaving a lesson started at the door returns to the door', await pg.locator('#door.active').count()==1)

        # ---- games hub and each game ----
        await pg.evaluate("App.goPlay()"); await pg.wait_for_selector('#play.active')
        cards=await pg.eval_on_selector_all('.gcard','els=>els.map(e=>e.dataset.game+":"+e.className)')
        check('play hub: three Workshop game blocks', len(cards)==3 and all('ws-block' in c for c in cards), cards)
        for g, name in (('pop','Friend Pop'),('reader','Bead Detective'),('build','Bead Builder')):
            await pg.click(f'.gcard[data-game={g}]'); await pg.wait_for_selector('#game.active'); await pg.wait_for_timeout(400)
            check(f'{name} opens', name in await pg.text_content('#gameTitle') and await pg.locator('#gameStage > *').count()>0)
            await pg.click('#exitGame'); await pg.wait_for_selector('#play.active')
        await pg.click('#exitPlay'); await pg.wait_for_timeout(300)

        # ---- gate: non-readers hear/see "get a grown-up"; See all skills goes through it ----
        await door(pg); await pg.click('#doorAll'); await pg.wait_for_selector('#gate.active')
        check('gate: Bix says go get a grown-up, with a picture', 'grown-up' in await pg.text_content('#bixGate .bubble') and await pg.locator('#gateArt svg').count()==1)
        check('gate: number in words', re.search(r'[a-z]', await pg.text_content('#gateQ .gw')) is not None)
        await pg.fill('#gateA','1'); await pg.click('#gateOk'); await pg.wait_for_timeout(200)
        check('gate: wrong answer stays locked with a new number', await pg.locator('#gate.active').count()==1 and await pg.input_value('#gateA')=='')
        await pg.click('#gateCancel'); await pg.wait_for_timeout(200)
        check('gate: Back returns to where it was opened (door)', await pg.locator('#door.active').count()==1)
        await pg.click('#doorAll'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_selector('#parent.active'); await pg.wait_for_timeout(500)
        inview=await pg.evaluate("(()=>{const r=document.querySelector('#guSkills').getBoundingClientRect(); return r.top>=-5 && r.top<innerHeight/2})()")
        check('See all skills: opens grown-ups at the skills list', inview)

        # ---- parent report from seeded history ----
        await pg.evaluate("document.querySelector('#parent').scrollTop=0")
        rep=await pg.evaluate("window.__report")
        check("report title: Mia's week", await pg.text_content('#repTitle')=='Mia’s week')
        check('days practised beads: 5 jade of 7', await pg.locator('#repDays .rep-beads .ws-bead').count()==7 and rep['daysPracticed']==5)
        check('days + minutes line', (await pg.text_content('#repDaysN'))=='5 of 7 days · 47 min', await pg.text_content('#repDaysN'))
        check('mastered this week: Small friends taking away', 'Small friends: taking away' in await pg.text_content('#repMastered'), await pg.text_content('#repMastered'))
        check('working on now: 72% with the 80% mark', '72% right' in await pg.text_content('#repNeed') and await pg.eval_on_selector('#repWorking .rep-bar b','e=>e.style.left')=='80%')
        mm=await pg.eval_on_selector_all('#repMissed .mm-row','els=>els.map(e=>e.textContent)')
        check('missed most: +7 big friend first, 5 times', len(mm)>=1 and mm[0].startswith('+7') and '5 times' in mm[0], mm)
        check('treat waiting card links to the tickets', 'Extra bedtime story' in await pg.text_content('#repAlerts'))
        # share
        await pg.click('#repShare'); await pg.wait_for_timeout(200)
        shared=await pg.evaluate("window.__shared"); expect=await pg.evaluate("ParentBrain.shareText(window.__report,{childName:'Mia'})")
        check('Share report sends ParentBrain.shareText', len(shared)==1 and shared[0]['text']==expect and expect.startswith("Mia's abacus week: practised 5 of 7 days, about 47 min."), shared)
        # fallback: no navigator.share -> copy
        await ctx.grant_permissions(['clipboard-read','clipboard-write'], origin=URL.rsplit('/',1)[0])
        await pg.evaluate("delete navigator.share; navigator.share=undefined"); await pg.click('#repShare'); await pg.wait_for_timeout(300)
        clip=await pg.evaluate("navigator.clipboard.readText()")
        check('without share: report copied + message', clip==expect and 'copied' in await pg.text_content('#repToast'), await pg.text_content('#repToast'))
        # tonight's tip: same all day, never yesterday's again
        tip1=await pg.get_attribute('#repTipTitle','data-tip'); mem=await pg.evaluate("Store.get('parentTips')"); cid=await pg.evaluate("Store.activeId()")
        check('tip shown and remembered for this child', tip1 and mem[cid]['id']==tip1, mem)
        await pg.click('#parentDone'); await gate(pg)
        check('same tip again later the same day', await pg.get_attribute('#repTipTitle','data-tip')==tip1)
        fresh=await pg.evaluate("ParentBrain.tonightsTip({history:Store.get('history'),days:Store.get('days'),progress:Store.get('progress'),settings:App.settings}).id")
        await pg.evaluate(f"(()=>{{ const m=Store.get('parentTips',{{}}); m[Store.activeId()]={{day:'2000-01-01', id:{json.dumps(fresh)}, prev:null}}; Store.set('parentTips', m); }})()")
        await pg.click('#parentDone'); await gate(pg)
        tip2=await pg.get_attribute('#repTipTitle','data-tip')
        check("next day: yesterday's tip is not repeated", tip2 and tip2!=fresh, [fresh, tip2])
        # certificates (stream B) read defensively
        await pg.evaluate("(()=>{ const d=new Date(), k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); Store.set('certificates',[{nodeId:'sf_sub',title:'Small friends: taking away',date:k,accuracy:0.92}]); })()")
        await pg.click('#parentDone'); await gate(pg)
        check('certificate shows under mastered', 'Certificate earned · 92% right' in await pg.text_content('#repMastered'), await pg.text_content('#repMastered'))
        await pg.evaluate("Store.set('certificates', {bogus:true})"); await pg.click('#parentDone'); await gate(pg)
        check('odd certificate data does not break the report', await pg.locator('#repDaysN').count()==1)
        # settings panels keep their controls
        ids=['setupList','sNode','sName','nodeTable','kidsList','kidAdd','tpBeads','tpList','sCount','sSfx','sBixTalks','sBixVoice','sVoice','recPanel','sessions','bkMake','diagLog']
        missing=[i for i in ids if not await pg.locator('#parent #'+i).count()]
        check('settings sit in grouped panels with every control', not missing and await pg.locator('#parent .gu-panel').count()>=8, missing)
        # children switcher: switch reloads into that child and comes back to the report
        await pg.evaluate("(()=>{ const id=Store.addChild(); window.__arjun=id; })()")
        arjun=await pg.evaluate("window.__arjun")
        await pg.evaluate(f"localStorage.setItem('abacus.c.{arjun}.prefs', JSON.stringify({{name:'Arjun'}})); localStorage.setItem('abacus.c.{arjun}.progress', JSON.stringify({{current:'add_direct',nodes:{{}}}})); localStorage.setItem('abacus.children', JSON.stringify(Store.children().map(c=>c.id==='{arjun}'?Object.assign(c,{{name:'Arjun'}}):c)))")
        await pg.click('#parentDone'); await pg.reload(); await pg.wait_for_timeout(900)
        if await pg.locator('#who.active').count(): await pg.click('#whoList .who-card:has-text("Mia")'); await pg.wait_for_timeout(1200)
        await gate(pg)
        kids=await pg.eval_on_selector_all('#repKids [data-rk]','els=>els.map(e=>e.textContent+":"+e.getAttribute("aria-pressed"))')
        check('children switcher lists both, Mia selected', kids==['Mia:true','Arjun:false'], kids)
        await pg.click('#repKids [data-rk]:has-text("Arjun")'); await pg.wait_for_selector('#parent.active', timeout=8000); await pg.wait_for_timeout(500)
        check("switching reloads into Arjun's report", await pg.text_content('#repTitle')=='Arjun’s week' and await pg.evaluate("Store.activeId()")==arjun, await pg.text_content('#repTitle'))
        check('Arjun has no practice yet: calm empty report', (await pg.text_content('#repDaysN')).startswith('0 of 7') and 'Nothing new yet' in await pg.text_content('#repMastered'))
        check('no page errors', not errs, errs)
        await b.close()
    print(f"\n{sum(res)}/{len(res)} passed")
asyncio.run(main())
