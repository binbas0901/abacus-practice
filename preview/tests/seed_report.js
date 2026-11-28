// Seed a child "Mia" with a week of practice (before the app loads): tests/p14_door.py and screenshots.
(()=>{ if (localStorage.getItem('abacus.children')) return;
  const day=(n)=>{ const d=new Date(); d.setDate(d.getDate()-n); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const at=(n)=>{ const d=new Date(); d.setDate(d.getDate()-n); d.setHours(17,30,0,0); return d.toISOString(); };
  const pr={current:'bf_add_a',nodes:{}};
  ['beads','add_direct','sub_direct','sf_add'].forEach(id=>pr.nodes[id]={lesson:true,mastered:'parent',hist:[]});
  // sf_sub learned this week by practice: 20 answers, 90%, over two days
  const h=[]; for(let i=0;i<20;i++) h.push({ok:i%10!==3, day:day(i<10?4:3)}); pr.nodes.sf_sub={lesson:true,mastered:'auto',hist:h};
  // current skill: 18 answers, 13 right (72%), on 2 days
  const c=[]; for(let i=0;i<18;i++) c.push({ok:![1,4,7,11,15].includes(i), day:day(i<9?1:0)}); pr.nodes.bf_add_a={lesson:true,mastered:null,hist:c};
  const miss7={terms:[8,7],answer:15,given:'5',rules:['ten']}, miss6={terms:[9,6],answer:15,given:'5',rules:['ten']}, miss4={terms:[8,-4],answer:4,given:'9',rules:['five']};
  const history=[
    {at:at(0),mode:'visual',node:'bf_add_a',count:10,correct:7,secs:540,missed:[miss7,miss7,miss6]},
    {at:at(1),mode:'listen',node:'bf_add_a',count:10,correct:7,secs:600,missed:[miss7,miss6,miss7]},
    {at:at(3),mode:'visual',node:'sf_sub',count:10,correct:9,secs:480,missed:[miss4]},
    {at:at(4),mode:'visual',node:'sf_sub',count:10,correct:9,secs:500,missed:[miss4]},
    {at:at(6),mode:'flash',node:'sf_sub',count:10,correct:10,secs:420,missed:[]},
    {at:at(6),mode:'visual',node:'sf_sub',count:10,correct:8,secs:300,missed:[miss7]},
  ];
  const days={}; [0,1,3,4,6].forEach(n=>days[day(n)]=true);
  localStorage.setItem('abacus.settings', JSON.stringify({name:'Mia', settingsVersion:5, sfx:false, speakFeedback:false}));
  localStorage.setItem('abacus.progress', JSON.stringify(pr));
  localStorage.setItem('abacus.history', JSON.stringify(history));
  localStorage.setItem('abacus.days', JSON.stringify(days));
  localStorage.setItem('abacus.fun', JSON.stringify({stickers:{'animals:0':1},gold:{},garden:{},best:{pop:9},today:null,seen:3,wallet:{beads:12,total:20,goal:null,tickets:[{id:'k1',tid:'t2',emoji:'📖',name:'Extra bedtime story',price:10,at:new Date().toISOString(),given:false}]}}));
})();
