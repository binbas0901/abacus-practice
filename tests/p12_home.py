import asyncio, json, os, datetime
from playwright.async_api import async_playwright
# Workshop home (Today beads + three doors), My Room (sticker book, flower pot, treat jar, "I wish for…"),
# Who's practising, and the "abacus at home?" setup question saved per child.
res=[]
def check(label, ok, extra=''): res.append(bool(ok)); print(('PASS ' if ok else 'FAIL ')+label+(('  '+str(extra)) if extra else ''))
URL='http://localhost:%s/index.html' % os.environ.get('PORT','8765')
SEED=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'seed_init.js')).read()
ym=datetime.date.today().strftime('%Y-%m'); today=datetime.date.today().day
PRACTISED=[d for d in range(1, today+1) if d%2==1]          # every other day this month, today if odd
STATE="""(()=>{ if (localStorage.getItem('abacus.p12')) return; localStorage.setItem('abacus.p12','1');
 localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}));
 localStorage.setItem('abacus.days', JSON.stringify(%s));
 localStorage.setItem('abacus.fun', JSON.stringify({stickers:{'animals:0':1,'ocean:1':1,'space:2':1}, gold:{}, garden:{'%s-01':'full'}, albumSeen:1, seen:0,
   wallet:{beads:12,total:20,goal:'t5',tickets:[]}}));
})()""" % (json.dumps({'%s-%02d' % (ym, d): True for d in PRACTISED}), ym)
async def no_overflow(pg):
    return await pg.evaluate("""(()=>{ const W=innerWidth,H=innerHeight; const bad=[];
      document.querySelectorAll('#home.active button, #home.active .hm-frame, #room.active button, #room.active .rm-shelf').forEach(e=>{ const r=e.getBoundingClientRect(); if(!r.width) return;
        if(r.left<-1||r.top<-1||r.right>W+1||r.bottom>H+1) bad.push((e.id||e.className)+' '+[r.left,r.top,r.right,r.bottom].map(Math.round)); });
      return bad; })()""")
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        errs=[]
        ctx=await b.new_context(viewport={'width':1180,'height':820}); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.add_init_script(SEED); await pg.add_init_script(STATE)
        await pg.goto(URL); await pg.wait_for_timeout(900)

        # ---------- home ----------
        steps=await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className)')
        check('home: Bix + greeting bubble + grown-ups lock', await pg.locator('#bixHome .bix.ws-bix').count()==1 and 'Mia' in await pg.text_content('#bixHome .bubble') and await pg.locator('#home #grownups[aria-label]').count()==1)
        check('home: Today with 3 lacquered beads on the rod; only the next one pulses, later ones faded',
              len(steps)==3 and 'next' in steps[0] and 'later' in steps[1] and 'later' in steps[2] and await pg.locator('#todaySteps .ws-pulse').count()==1 and await pg.locator('#todaySteps svg.ws-bead').count()==3, steps)
        check('home: one big Start and three doors (Practice / Play / My Room with bead chip)',
              (await pg.text_content('#todayGoT'))=='Start' and await pg.locator('.hm-doors > button').count()==3 and (await pg.text_content('#roomBeads')).strip()=='12')
        check('home: old skill path, mode tiles, jar and garden are gone from home',
              await pg.locator('#home #path, #home .tile, #home #jar, #home #garden').count()==0)
        check('home: no emoji in the UI text', not any(ord(c)>0x2600 for c in await pg.text_content('#home')))
        start=await pg.eval_on_selector('#todayGo','e=>{const r=e.getBoundingClientRect(); return [r.width,r.height]}')
        check('home: targets are big (Start >= 140px, doors >= 120px tall)', min(start)>=140 and await pg.evaluate("[...document.querySelectorAll('.hm-door')].every(e=>e.getBoundingClientRect().height>=120)"), start)
        check('home: one child -> no "Switch child"', not await pg.is_visible('#switchKid'))
        # a finished step turns jade with a check, the next one takes over
        await pg.evaluate("Fun.data.today.steps[0].done=true; Fun.save(); App.renderHome()"); await pg.wait_for_timeout(200)
        steps=await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className)')
        check('done step: jade bead + check, Start becomes Next for step 2', 'done' in steps[0] and 'next' in steps[1] and (await pg.text_content('#todayGoT'))=='Next' and '2 more' in await pg.text_content('#greetSub'), steps)
        await pg.evaluate("Fun.data.today.steps.forEach(s=>s.done=true); Fun.data.today.celebrated=true; Fun.save(); App.renderHome()"); await pg.wait_for_timeout(200)
        check('all done: "All done!", big button turns into Play', 'done' in await pg.text_content('#todayTitle') and (await pg.text_content('#todayGoT'))=='Play' and await pg.locator('#todayGo.play').count()==1)
        await pg.click('#todayGo'); await pg.wait_for_selector('#play.active'); await pg.click('#exitPlay'); await pg.wait_for_selector('#home.active')

        # ---------- Today's plan is frozen for the day; finished steps first; "Next" mid-day ----------
        await pg.evaluate("Fun.data.today=null; Fun.save(); App.renderHome()"); await pg.wait_for_timeout(150)
        plan=await pg.evaluate("Fun.data.today.steps.map(s=>s.kind+(s.game?':'+s.game:''))")
        await pg.evaluate("Fun.data.today.steps[1].done=true; Fun.save()")
        # mid-day unlock: today's lesson got learned elsewhere and the next skill opened (the old code reshuffled the plan here)
        await pg.evaluate("(()=>{ const p=Store.get('progress'); p.nodes[p.current]=Object.assign(p.nodes[p.current]||{hist:[]},{lesson:true,mastered:'auto'}); p.current='bf_add_b'; p.nodes.bf_add_b={lesson:true,hist:[]}; Store.set('progress',p); })()")
        await pg.reload(); await pg.wait_for_timeout(900)
        after=await pg.evaluate("Fun.data.today.steps.map(s=>s.kind+(s.game?':'+s.game:''))")
        cur=await pg.evaluate("App.currentNode().id")
        check('plan frozen after a mid-day unlock (same steps, same order)', after==plan and cur=='bf_add_b', f"{plan} -> {after} (now {cur})")
        steps=await pg.eval_on_selector_all('#todaySteps .step','els=>els.map(e=>e.className)')
        check('finished step shown first (jade + check), the next one after it', 'done' in steps[0] and 'next' in steps[1] and 'later' in steps[2] and await pg.locator('#todaySteps .step.done .hm-bead path[fill="#2F9E7E"]').count()==1, steps)
        check('main button reads "Next" mid-day', (await pg.text_content('#todayGoT'))=='Next' and 'Next' in await pg.get_attribute('#todayGo','aria-label'))
        await pg.evaluate("Fun.data.today.steps.forEach(s=>s.done=true); Fun.data.today.celebrated=true; Fun.save(); App.renderHome()"); await pg.wait_for_timeout(150)
        check('end of the day: Play', (await pg.text_content('#todayGoT'))=='Play')
        # the Switch child button and the version stay out of the child's way
        # the version is for grown-ups only (shown in Grown-ups, where 5 taps open diagnostics); #ver stays in the DOM as its source
        vis_ver=await pg.evaluate("[...document.querySelectorAll('#home *')].filter(e=>e.offsetParent!==null && e.children.length===0 && /\\bv\\d+\\.\\d+/.test(e.textContent)).map(e=>e.id||e.className)")
        check('no version text on the child home (#ver kept in the DOM, hidden)', not vis_ver and await pg.locator('#home #ver').count()==1 and not await pg.is_visible('#ver') and 'v' in (await pg.text_content('#ver')), vis_ver)
        check('dead skill menu (#nodemenu) is gone', await pg.locator('#nodemenu, #nmLearn').count()==0)

        # ---------- the three doors ----------
        await pg.click('#doorPractice'); await pg.wait_for_timeout(400)
        check('Practice door -> the Practice door screen', await pg.locator('#door.active').count()==1)
        await pg.evaluate("App.goHome()")
        await pg.click('#doorPlay'); await pg.wait_for_selector('#play.active')
        check('Play door -> games', await pg.locator('#play.active').count()==1)
        await pg.click('#exitPlay'); await pg.wait_for_selector('#home.active')
        await pg.click('#doorRoom'); await pg.wait_for_selector('#room.active'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/p12_room.png')

        # ---------- My Room ----------
        check('My Room: shelf with sticker book, flower pot and treat jar', await pg.locator('#room .rm-shelf').count()==1 and await pg.is_visible('#roomStickers') and await pg.is_visible('#roomGarden') and await pg.is_visible('#jar'))
        check('sticker book shows "2 new"', await pg.locator('#albumBadge.on').count()==1 and '2 new' in await pg.text_content('#albumBadge'), await pg.text_content('#albumBadge'))
        fl=await pg.locator('#garden .plot.bloom').count()
        check("flower pot: one flower per practice day this month (never wilts)", fl==len(PRACTISED) and await pg.locator('#garden .full').count()==1 and await pg.locator('#garden .wilt, #garden .soil').count()==0, f"{fl} flowers for {len(PRACTISED)} days | {await pg.text_content('#gardenLabel')}")
        check('sprout in the pot when today is not practised yet', (await pg.locator('#garden .sprout').count()==1) == (today%2==0))
        jb=await pg.locator('#jar .j-bead').count()
        check('treat jar: golden beads fill toward the goal line, goal tag shows the treat', 0<jb<21 and await pg.locator('#jar .j-goal').count()==1 and 'Park trip' in await pg.text_content('#jar .jar-sub') and (await pg.text_content('#jar .jar-n')).strip()=='12', jb)
        bub=await pg.text_content('#bixRoom .bubble')
        check('Bix says how many more beads', '8 more beads' in bub and 'Park trip' in bub, bub)
        check('My Room fits the screen', not await no_overflow(pg), await no_overflow(pg))
        await pg.click('#roomGarden'); await pg.wait_for_timeout(300)
        check('tapping the pot: Bix counts the flowers', f"{len([d for d in PRACTISED])} flower" in await pg.text_content('#bixRoom .bubble'), await pg.text_content('#bixRoom .bubble'))
        await pg.click('#roomStickers'); await pg.wait_for_selector('#album.active')
        check('sticker book opens, restyled (pages + slots), new count cleared', await pg.locator('#albumPages .ab-page').count()==5 and await pg.locator('.slot.has').count()==3)
        await pg.click('#exitAlbum'); await pg.wait_for_selector('#room.active')
        check('back from stickers -> My Room, badge gone', await pg.locator('#albumBadge.on').count()==0)
        await pg.click('#roomWish'); await pg.wait_for_selector('#shop.active')
        check('"Treats" (was "I wish for…") opens the treat list (Treats.wish hook)', 'Treats' in await pg.text_content('#roomWish') and await pg.locator('#shopCards .tcard').count()==6 and await pg.evaluate("typeof Treats.wish==='function'"))
        hi=await pg.eval_on_selector_all('#shopCards .tcard.hi .tname','els=>els.map(e=>e.textContent)')
        loud=await pg.locator('#shopCards .ws-btn:not(.maple)').count()
        check('shop highlights one card (the saving goal); at most one loud button', hi==['Park trip'] and loud<=1, f"{hi} loud={loud}")
        first=await pg.evaluate("(()=>{ const c=document.querySelector('#shopCards > .tcard'), r=c.getBoundingClientRect(); return [c.classList.contains('hi'), c.classList.contains('goal'), c.querySelector('.tname').textContent, r.top, r.bottom, innerHeight]; })()")
        check('shop: the saving-goal card comes first and is fully visible without scrolling', first[0] and first[1] and first[2]=='Park trip' and first[3]>=0 and first[4]<=first[5], first)
        others=await pg.locator('#shopCards .tcard:not(.hi) .ws-btn, #shopCards .tcard:not(.hi) [data-get], #shopCards .tcard:not(.hi) [data-goal]').count()
        check('shop: only the big card has buttons; the other treats are quiet tap-to-pick cards', others==0 and await pg.locator('#shopCards button.tcard.tpick[data-pick]').count()==5, others)
        await pg.click('#shopCards .tcard.tpick:has-text("Choose dinner")'); await pg.wait_for_timeout(200)
        first=await pg.evaluate("(()=>{ const c=document.querySelector('#shopCards > .tcard'); return [c.classList.contains('hi'), c.querySelector('.tname').textContent]; })()")
        goal_still=await pg.evaluate("Treats.wallet().goal")
        check('tapping a small card brings it up into the big card (nothing chosen or spent by that tap)', first==[True,'Choose dinner'] and goal_still=='t5' and await pg.locator('#shopCards .tcard.hi [data-goal]').count()==1 and await pg.locator('#shopCards .ws-btn:not(.maple)').count()<=1, f"{first} goal={goal_still}")
        bub=await pg.text_content('#bixShop .bubble')
        check('shop: Bix never says "Go get it"', 'get it' not in bub.lower(), bub)
        tg=await pg.eval_on_selector_all('#shop button, #room button','els=>els.filter(e=>e.getBoundingClientRect().width).map(e=>[e.id||e.textContent.trim(), Math.round(e.getBoundingClientRect().height)]).filter(x=>x[1]<60)')
        check('shop + room child targets are at least 60px tall', not tg, tg)
        await pg.click('#shopCards .tcard.tpick:has-text("Small snack")'); await pg.click('#shopCards .tcard.hi [data-get]'); await pg.click('#askYes'); await pg.wait_for_timeout(500)
        await pg.evaluate("Treats.wallet().goal=null; Treats.renderShop()")
        hi=await pg.eval_on_selector_all('#shopCards .tcard.hi .tname','els=>els.map(e=>e.textContent)')
        check('no goal: the cheapest treat she can get is the one highlighted', hi==['Small snack'] and await pg.locator('#shopCards .ws-btn:not(.maple)').count()==1, hi)
        await pg.evaluate("Treats.wallet().goal='t5'; Fun.save()")
        await pg.click('#exitShop'); await pg.wait_for_selector('#room.active')
        check('after getting a treat, the jar and chip show the new count', (await pg.text_content('#jar .jar-n')).strip()=='9')
        await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')
        check('home bead chip updated', (await pg.text_content('#roomBeads')).strip()=='9')

        # ---------- reduced motion ----------
        await pg.emulate_media(reduced_motion='reduce'); await pg.wait_for_timeout(100)
        anim=await pg.evaluate("[...document.querySelectorAll('#home .ws-pulse, #home .ws-bix-body')].map(e=>getComputedStyle(e).animationName)")
        check('reduced motion: no pulse / bob', all(a=='none' for a in anim), anim)
        await pg.emulate_media(reduced_motion='no-preference')
        await ctx.close()

        # ---------- layouts: portrait and iPad Pro ----------
        for W,H in [(820,1180),(1366,1024),(1180,820)]:
            ctx=await b.new_context(viewport={'width':W,'height':H}); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.add_init_script(SEED); await pg.add_init_script(STATE); await pg.goto(URL); await pg.wait_for_timeout(700)
            bad=await no_overflow(pg); await pg.click('#doorRoom'); await pg.wait_for_timeout(300); bad+=await no_overflow(pg)
            check(f'{W}x{H}: home and My Room fit, nothing off-screen', not bad, bad)
            await pg.click('#roomWish'); await pg.wait_for_selector('#shop.active'); await pg.wait_for_timeout(200)
            gb=await pg.evaluate("(()=>{ const c=document.querySelector('#shopCards > .tcard.hi.goal'); if(!c) return null; const r=c.getBoundingClientRect(); return [r.top, r.bottom, innerHeight]; })()")
            check(f'{W}x{H}: shop goal card first and fully on screen', gb and gb[0]>=0 and gb[1]<=gb[2], gb)
            await pg.click('#exitShop'); await pg.click('#exitRoom'); await pg.wait_for_selector('#home.active')
            if W==1366:
                gap=await pg.evaluate("(()=>{ const s=document.querySelector('#greetSub').getBoundingClientRect(), r=document.querySelector('.hm-rod').getBoundingClientRect(); return r.top-s.bottom; })()")
                check('iPad Pro: "3 little steps" sits well clear of the rod (>= 16px)', gap>=16, gap)
            await ctx.close()

        # ---------- first-time setup: "abacus at home?" saved per child ----------
        ctx=await b.new_context(viewport={'width':1180,'height':820}); pg=await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_timeout(700)
        answers={'Ava':('yes',True), 'Ben':('no',False), 'Cy':('unsure',None)}
        for i,(nm,(btn,want)) in enumerate(answers.items()):
            if i: await pg.evaluate("Store.switchTo(Store.addChild())"); await pg.reload(); await pg.wait_for_timeout(800)
            await pg.wait_for_selector('#suName.on'); await pg.fill('#suNameIn', nm); await pg.click('#suNameGo'); await pg.wait_for_selector('#suAbacus.on')
            q=await pg.text_content('#suAbacusH'); bq=await pg.text_content('#bixSetup .bubble')
            if i==0: await pg.screenshot(path='/tmp/p12_abacus.png')
            check(f'{nm}: "Does {nm} have an abacus at home?" (Yes / No / Not sure), Bix asks it out loud', nm in q and 'abacus at home' in bq and await pg.locator('#suAbacus [data-abacus]').count()==3, bq)
            await pg.click(f'[data-abacus={btn}]'); await pg.wait_for_selector('#suLevel.on'); await pg.click('[data-lv=new]'); await pg.wait_for_selector('#suDone.on'); await pg.click('#suStart'); await pg.wait_for_selector('#home.active')
        await pg.evaluate("Fun.BixVoice.load()"); await pg.wait_for_timeout(1500)
        check('Bix has recorded lines for the new questions (extra "home" pack)', await pg.evaluate("['who_ask','ask_abacus'].every(id=>!!Fun.BixVoice.find(id)[1])"))
        kids=await pg.evaluate("Store.children()")
        got={k['name']: json.loads(await pg.evaluate(f"localStorage.getItem('abacus.c.{k['id']}.prefs')") or '{}').get('hasAbacus','missing') for k in kids}
        fam=json.loads(await pg.evaluate("localStorage.getItem('abacus.family')") or '{}')
        check('hasAbacus saved per child (true / false / null), not family-wide', got=={'Ava':True,'Ben':False,'Cy':None} and 'hasAbacus' not in fam, got)
        check('App.settings.hasAbacus is the active child\'s answer', await pg.evaluate("App.settings.hasAbacus")is None)

        # ---------- setup: skill examples, the kit keypad, "Stop here", confetti behind the content ----------
        c3=await b.new_context(viewport={'width':1180,'height':820}); p3=await c3.new_page(); p3.on('pageerror', lambda e: errs.append(str(e)))
        await p3.goto(URL); await p3.wait_for_selector('#suName.on'); await p3.fill('#suNameIn','Kai'); await p3.click('#suNameGo'); await p3.click('[data-abacus=yes]'); await p3.wait_for_selector('#suLevel.on')
        await p3.click('[data-lv=pick]'); await p3.wait_for_selector('#suPick.on')
        ex=await p3.evaluate("Object.fromEntries([...document.querySelectorAll('#suPickList .su-skill')].map(b=>[b.dataset.id, b.querySelector('small').textContent]))")
        mul=[k for k in ['times_a','times_b','mul_2x1','mul_3x1'] if k in ex]
        check('setup skill list: multiplication examples use × (never +)', mul and all('×' in ex[k] and '+' not in ex[k] for k in mul), {k:ex[k] for k in mul})
        check('setup skill list: times tables read "3 × 4", 2-digit × 1-digit reads "23 × 3"', ex.get('times_a','').startswith('3 × 4') and ex.get('mul_2x1','').startswith('23 × 3'), [ex.get('times_a'), ex.get('mul_2x1')])
        lr=ex.get('long_rows','')
        check('setup skill list: long rows read as one row ("9 + 7 − 8 + 6 …")', lr.startswith('9 + 7 − 8 + 6') and lr.endswith('…'), lr)
        check('setup skill list: 3- and 4-digit examples', ex.get('three_digit','').startswith('125 + 341') and ex.get('four_digit','').startswith('1234 + 2345'), [ex.get('three_digit'), ex.get('four_digit')])
        small=await p3.evaluate("[...document.querySelectorAll('#setup .su-step.on button')].filter(e=>e.getBoundingClientRect().width).map(e=>[e.id||e.dataset.id, Math.round(e.getBoundingClientRect().height)]).filter(x=>x[1]<60)")
        check('setup skill list: every target at least 60px tall', not small, small)
        await p3.click('#suPickBack'); await p3.click('[data-lv=check]'); await p3.wait_for_selector('#suCheck.on')
        keys=await p3.eval_on_selector_all('#suPad .ws-keypad button','els=>els.map(e=>e.dataset.k)')
        check('level check uses the kit keypad (WS.keypad), no local copy', keys==['7','8','9','4','5','6','1','2','3','del','0'] and await p3.locator('#suPad > button').count()==0, keys)
        small=await p3.evaluate("[...document.querySelectorAll('#setup .su-step.on button')].filter(e=>e.getBoundingClientRect().width).map(e=>[e.id||e.dataset.k, Math.round(e.getBoundingClientRect().height)]).filter(x=>x[1]<60)")
        check('level check: every target at least 60px tall', not small, small)
        check('level check: the stop button says what it does ("Stop here")', (await p3.text_content('#suStop')).strip()=='Stop here' and 'Stop here' in (await p3.get_attribute('#suStop','aria-label')))
        await p3.click('#suPad [data-k="9"]'); await p3.click('#suPad [data-k="9"]'); await p3.click('#suGo'); await p3.wait_for_timeout(300)
        check('a wrong answer: Bix explains "Stop here"', 'Stop here' in await p3.text_content('#bixSetup .bubble'), await p3.text_content('#bixSetup .bubble'))
        await p3.wait_for_timeout(500); await p3.click('#suStop')
        await p3.wait_for_selector('#suDone.on', timeout=3000)
        check('"Stop here" ends the check at once (no extra answer needed)', await p3.locator('#suDone.on').count()==1)
        await p3.wait_for_timeout(2800)
        cf=await p3.evaluate("(()=>{ const box=Fun.confetti(40); const host=box.parentElement, cs=getComputedStyle(box);"
            " const xs=[...box.children].map(i=>parseFloat(i.style.left));"
            " box.style.pointerEvents='auto'; box.querySelectorAll('i').forEach(i=>{i.style.pointerEvents='auto'; i.style.animation='none'; i.style.top='0'; i.style.left='0'; i.style.width='100vw'; i.style.height='100vh';});"
            " const hit=t=>{ const r=document.querySelector(t).getBoundingClientRect(); const e=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(e && e.closest(t)); };"
            " const out=[host.matches('.screen.active'), cs.zIndex, getComputedStyle(host).isolation, hit('#suStart'), hit('#suDoneH'), xs.every(x=>x<=18||x>=82)];"
            " box.remove(); return out; })()")
        check('confetti: drawn behind the content of the active screen (buttons and text stay on top), edges only', cf==[True,'-1','isolate',True,True,True], cf)
        await p3.evaluate("Fun.confetti(30)"); await p3.wait_for_timeout(2900)
        check('confetti: a short burst (gone within 3 s)', await p3.locator('.ws-confetti').count()==0)
        await p3.emulate_media(reduced_motion='reduce')
        check('confetti: nothing with reduced motion', await p3.evaluate("Fun.confetti(30)===null && !document.querySelector('.ws-confetti')"))
        await p3.emulate_media(reduced_motion='no-preference'); await p3.evaluate("document.body.classList.add('ws-calm')")
        check('confetti: nothing in calm mode', await p3.evaluate("Fun.confetti(30)===null"))
        await c3.close()

        # ---------- Home Screen advice only in a browser tab ----------
        for label, init in [('browser tab', None), ('Home Screen app (standalone)', "Object.defineProperty(navigator,'standalone',{get:()=>true})"), ('native wrapper', "window.Capacitor={isNativePlatform:()=>true}")]:
            c2=await b.new_context(viewport={'width':1180,'height':820}); p2=await c2.new_page(); p2.on('pageerror', lambda e: errs.append(str(e)))
            if init: await p2.add_init_script(init)
            await p2.goto(URL); await p2.wait_for_selector('#suName.on'); await p2.fill('#suNameIn','Zoe'); await p2.click('#suNameGo'); await p2.click('[data-abacus=yes]'); await p2.click('[data-lv=new]'); await p2.wait_for_selector('#suDone.on')
            vis=await p2.is_visible('#suInstall')
            check(f'setup finish, {label}: Home Screen advice {"shown" if not init else "hidden"}', vis == (init is None) and await p2.is_visible('#suStart'))
            await c2.close()

        # ---------- who's practising + switch child ----------
        await pg.evaluate("sessionStorage.removeItem('abacus.who')"); await pg.reload(); await pg.wait_for_timeout(900)
        cards=await pg.eval_on_selector_all('#whoList .who-card','els=>els.map(e=>e.textContent.trim())')
        fills=await pg.eval_on_selector_all('#whoList .who-card','els=>els.map(e=>e.querySelector(".ws-bead path").getAttribute("fill"))')
        check("Who's practising: a card per child, each bead a different lacquer colour, Bix asks", cards==['Ava','Ben','Cy'] and len(set(fills))==3 and 'practising' in await pg.text_content('#bixWho .bubble'), f"{cards} {fills}")
        await pg.screenshot(path='/tmp/p12_who.png')
        await pg.click('#whoList .who-card:has-text("Ben")'); await pg.wait_for_timeout(1200)
        check('picking Ben opens his home; Switch child shows quietly', await pg.locator('#home.active').count()==1 and await pg.is_visible('#switchKid') and await pg.evaluate("App.settings.hasAbacus")==False)
        sk=await pg.eval_on_selector('#switchKid','e=>{const r=e.getBoundingClientRect(); return [r.width,r.height]}')
        check('Switch child is a real quiet button, at least 60px tall', sk[1]>=60 and sk[0]>=120, sk)
        await pg.click('#switchKid'); await pg.wait_for_selector('#who.active')
        check('Switch child -> back to the picker', True)
        await ctx.close()
        print('errors:', errs); print('RESULT', sum(res),'/',len(res)); await b.close()
asyncio.run(main())
