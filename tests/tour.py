import asyncio, re, sys
from playwright.async_api import async_playwright
SEED = """(()=>{ const days={}; for (const d of [1,2,3,5,6,8,9,10,11]) days['2026-11-'+String(d).padStart(2,'0')]=true; localStorage.setItem('abacus.days',JSON.stringify(days));
 localStorage.setItem('abacus.fun',JSON.stringify({wallet:{beads:17,total:40,goal:'t4',tickets:[]},garden:{'2026-11-10':'full','2026-11-11':'full'},
   stickers:{'animals:0':1,'animals:3':2,'animals:7':1,'ocean:1':1,'ocean:5':1,'space:0':1,'space:6':3,'treats:4':1,'treats:10':1,'toys:0':1,'toys:8':2},gold:{'space:6':true,'animals:7':true},best:{pop:14,reader:8,build2:21.4},albumSeen:9}));
 const pr={current:'bf_add_a',nodes:{}}; ['beads','add_direct','sub_direct','sf_add','sf_sub'].forEach((id,i)=>pr.nodes[id]={lesson:true,mastered:i<3?'parent':'auto',hist:Array.from({length:20},(_,k)=>({ok:k%7!==0,day:'2026-11-0'+(1+k%5)}))});
 pr.nodes.bf_add_a={lesson:true,mastered:null,hist:Array.from({length:8},(_,k)=>({ok:k!==2,day:'2026-11-11'}))};
 localStorage.setItem('abacus.progress',JSON.stringify(pr));
 localStorage.setItem('abacus.settings',JSON.stringify({name:'Mia',settingsVersion:5,sfx:false,speakFeedback:false})); })()"""
async def main():
    W,H = (int(sys.argv[1]), int(sys.argv[2])) if len(sys.argv)>2 else (1180,820)
    tag = sys.argv[3] if len(sys.argv)>3 else ''
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        pg = await b.new_page(viewport={'width':W,'height':H}); await pg.add_init_script(open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)),'seed_init.js')).read()); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:%s/index.html' % __import__('os').environ.get('PORT','8765')); await pg.wait_for_timeout(1200); await pg.evaluate(SEED); await pg.reload(); await pg.wait_for_timeout(1800)
        shot=lambda n: pg.screenshot(path=f'/tmp/t{tag}_{n}.png')
        await shot('home')
        # lesson
        await pg.evaluate("App.startMode('learn')"); await pg.click('#lessonNext'); await pg.wait_for_timeout(2600); await shot('lesson')
        await pg.click('#exitLesson'); await pg.wait_for_timeout(300)
        # drill
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(300)
        for i in range(3):
            terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
            ans=sum(int(t) for t in terms)+(1 if i==1 else 0)
            for ch in str(ans): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(1000)
        await pg.click('#pad [data-k="1"]'); await pg.click('#pad [data-k="2"]'); await shot('drill')
        await pg.click('#exitDrill'); await pg.wait_for_timeout(200)
        await pg.evaluate("App.startMode('listen')"); await pg.wait_for_timeout(500); await shot('listen'); await pg.click('#exitDrill')
        await pg.evaluate("(()=>{const s=JSON.parse(window.__legacy('settings'));s.flashSec=3;localStorage.setItem('abacus.settings',JSON.stringify(s));})()")
        await pg.reload(); await pg.wait_for_timeout(1500)
        await pg.evaluate("App.startMode('flash')"); await pg.wait_for_timeout(1000); await shot('flash'); await pg.click('#exitDrill')
        # summary
        await pg.evaluate("App.startMode('visual')"); await pg.wait_for_timeout(300)
        for i in range(10):
            terms = await pg.eval_on_selector_all('#problemArea .term', 'els=>els.map(e=>e.textContent.replace("−","-"))')
            ans=sum(int(t) for t in terms)+(1 if i in (3,7) else 0)
            for ch in str(ans): await pg.click(f'#pad [data-k="{ch}"]')
            await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(850)
        await pg.wait_for_selector('#summary.active'); await pg.wait_for_timeout(700); await shot('summary')
        await pg.wait_for_selector('#stickerReveal.active'); await shot('gift'); await pg.click('#rvPack', force=True); await pg.wait_for_timeout(700); await shot('gift_open'); await pg.click('#rvOk'); await pg.wait_for_timeout(2500)
        await pg.click('#fixBtn'); await pg.wait_for_timeout(300); await pg.click('#pad [data-k="1"]'); await pg.click('#pad [data-k=go]'); await pg.wait_for_timeout(3600); await shot('showme')
        await pg.click('#showmeClose'); await pg.wait_for_timeout(300)
        await pg.click('#exitDrill'); await pg.wait_for_timeout(300)
        # album, play, games, shop
        await pg.click('#doorRoom'); await pg.wait_for_timeout(500); await shot('room'); await pg.click('#roomStickers'); await pg.wait_for_timeout(400); await shot('album'); await pg.click('#exitAlbum'); await pg.click('#exitRoom')
        await pg.click('#doorPlay'); await pg.wait_for_timeout(400); await shot('play')
        await pg.click('.gcard[data-game=pop]'); await pg.wait_for_timeout(2200); await shot('pop'); await pg.click('#exitGame'); await pg.wait_for_timeout(300)
        await pg.click('.gcard[data-game=reader]'); await pg.wait_for_timeout(600); await shot('reader'); await pg.wait_for_timeout(1800); await shot('reader_cover'); await pg.click('#exitGame'); await pg.wait_for_timeout(300)
        await pg.click('.gcard[data-game=build]'); await pg.wait_for_timeout(700); await shot('build'); await pg.click('#exitGame'); await pg.wait_for_timeout(300); await pg.click('#exitPlay')
        await pg.click('#doorRoom'); await pg.click('#jar'); await pg.wait_for_timeout(500); await shot('shop')
        await pg.click('.tcard.tpick:has-text("bedtime story")'); await pg.click('.tcard.hi [data-get]'); await pg.wait_for_timeout(400); await shot('ask'); await pg.click('#askNo'); await pg.click('#exitShop'); await pg.click('#exitRoom')
        await pg.click('#grownups'); await shot('gate'); await pg.fill('#gateA', str(await pg.evaluate('window.__gateAnswer'))); await pg.click('#gateOk'); await pg.wait_for_timeout(700); await shot('parent')
        print('errors:', errs); await b.close()
asyncio.run(main())
