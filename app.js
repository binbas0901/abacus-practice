(function(){
'use strict';
const E = window.SorobanEngine, C = window.Curriculum;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NODES = C.NODES, NODE_IDX = Object.fromEntries(NODES.map((n,i)=>[n.id,i]));

/* ---------------- storage ---------------- */
const DEFAULTS = {
  count:10, operands:0, sfx:true, speakFeedback:true, name:'',
  gap:2, gapMin:0.5, gapMax:6, sayPlus:true, voice:'device', voiceRate:1.0, answerPause:0.5,
  flashSec:1.0, flashN:3, profiles:[], recPid:null, bixTalks:true, bixVoice:'sweet', settingsVersion:5,
};
// All saving goes through store.js: family-wide settings are shared, progress and treats are per child.
function load(k, d){ return Store.get(k, d); }
function save(k, v){ Store.set(k, v); }
let settings = Store.loadSettings(DEFAULTS);
if ((settings.settingsVersion||1) < 5){ settings = Object.assign({}, DEFAULTS, {voice:settings.voice||'device', gap:settings.gap||2, name:settings.name||''}); }
function saveSettings(){ Store.saveSettings(settings); }
let history = load('history', []);
let days = load('days', {});
// progress: {current:nodeId, nodes:{id:{lesson:bool, mastered:'auto'|'parent'|null, hist:[{ok,day}]}}}
let progress = load('progress', null);
// A device that has never been set up gets the first-time setup (name + where to start). Nothing is saved until then.
const firstRun = !progress;
if (!progress){ progress = { current: 'beads', nodes:{} }; }
function node(id){ return progress.nodes[id] || (progress.nodes[id] = {lesson:false, mastered:null, hist:[]}); }
function saveProgress(){ save('progress', progress); }
// A child who had mastered the old last skill moves on to the new levels (4–6) automatically.
if (!firstRun && C.advanceCurrent){ const nx=C.advanceCurrent(progress.current, id=>!!(progress.nodes[id]&&progress.nodes[id].mastered)); if (nx!==progress.current){ progress.current=nx; saveProgress(); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* ---------------- sound effects ---------------- */
const Diag = { lines:[], add(m){ const t=new Date().toLocaleTimeString(); this.lines.unshift(t+' '+m); this.lines=this.lines.slice(0,40); const el=document.getElementById('diagLog'); if(el) el.textContent=this.lines.join('\n'); } };
window.addEventListener('error', e=>Diag.add('ERROR '+e.message)); window.addEventListener('unhandledrejection', e=>Diag.add('REJECT '+(e.reason&&e.reason.message||e.reason)));
const Sfx = {
  tone(f, t0, dur, type='sine', vol=0.18){ try{ const c=Speaker.ensureCtx(); const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.value=f; g.gain.setValueAtTime(0.0001,t0); g.gain.exponentialRampToValueAtTime(vol,t0+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t0+dur); o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.05);}catch(e){} },
  ok(){ if(!settings.sfx) return; const t=Speaker.ctx?Speaker.ctx.currentTime:0; this.tone(523,t,0.18); this.tone(784,t+0.12,0.25); },
  bad(){ if(!settings.sfx) return; const t=Speaker.ctx?Speaker.ctx.currentTime:0; this.tone(196,t,0.3,'triangle',0.12); },
  tap(){ if(!settings.sfx) return; const t=Speaker.ctx?Speaker.ctx.currentTime:0; this.tone(880,t,0.05,'square',0.03); },
  star(){ if(!settings.sfx) return; const t=Speaker.ctx?Speaker.ctx.currentTime:0; [523,659,784,1047].forEach((f,i)=>this.tone(f,t+i*0.11,0.35)); },
  sweep(f1,f2,dur,type='sine',vol=0.16){ if(!settings.sfx) return; try{ const c=Speaker.ensureCtx(), t=c.currentTime; const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f1,t); o.frequency.exponentialRampToValueAtTime(f2,t+dur); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur+0.02); o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+dur+0.05);}catch(e){} },
  pop(){ this.sweep(950,260,0.09,'sine',0.2); },
  soft(){ this.sweep(330,220,0.14,'triangle',0.08); },
  boing(){ this.sweep(260,720,0.18,'sine',0.12); },
  sparkle(){ if(!settings.sfx) return; const t=Speaker.ctx?Speaker.ctx.currentTime:0; [1319,1568,2093,2637].forEach((f,i)=>this.tone(f,t+i*0.07,0.22,'sine',0.09)); },
};

/* ---------------- speech ----------------
   Voice kinds:
     'rec:<id>'    a family member's recorded words (IndexedDB), stitched: "plus" + "seventy" + "three"
     'rec:turns'   take turns: a different recorded person reads each problem
     'device'      the iPad/Mac built-in voice (auto-picks the best English one), or 'device:<voiceURI>'
     'ljspeech'    bundled synthetic voice (audio/voice-ljspeech.js), fallback when nothing else is available
   Clip voices are scheduled on the Web Audio clock so pacing is exact.                   */
const SPRITES = { ljspeech:'Built-in synthetic (Linda)' };
const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const RECORD_WORDS = [...ONES, ...TENS.slice(2), 'hundred', 'plus', 'minus', 'yes', 'not quite'];
function numberWords(n){ const out=[]; if(n>=100){ out.push(ONES[Math.floor(n/100)],'hundred'); n%=100; if(!n) return out; } if(n<20) out.push(ONES[n]); else { out.push(TENS[Math.floor(n/10)]); if(n%10) out.push(ONES[n%10]); } return out; }
function termTokens(d, first){ const w=numberWords(Math.abs(d)); if(first) return w; if(d<0) return ['minus',...w]; return settings.sayPlus ? ['plus',...w] : w; }
function termText(d, first){ return termTokens(d, first).join(' '); }

async function clipBytes(v){ if (!v) return null; if (v instanceof Blob) return await v.arrayBuffer(); if (v.buf) return v.buf.slice(0); if (v instanceof ArrayBuffer) return v.slice(0); return null; }
function decode(ctx, ab){ return new Promise((res,rej)=>{ try{ const p=ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }catch(e){ rej(e); } }); }
/* ---- audio helpers ---- */
async function resample(buf, rate){
  if (buf.sampleRate<=rate) return buf;
  try{
    const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext; const oc=new OAC(1, Math.ceil(buf.duration*rate), rate);
    const s=oc.createBufferSource(); s.buffer=buf; s.connect(oc.destination); s.start(0);
    return await new Promise((res,rej)=>{ oc.oncomplete=e=>res(e.renderedBuffer); const p=oc.startRendering(); if (p&&p.then) p.then(res,rej); });
  }catch(e){ return buf; }
}
function wavBytes(buf, a=0, b=null, gain=1){
  const d=buf.getChannelData(0), sr=buf.sampleRate; if (b===null) b=d.length; const n=b-a; const wav=new DataView(new ArrayBuffer(44+n*2));
  const str=(o,s)=>{ for(let i=0;i<s.length;i++) wav.setUint8(o+i,s.charCodeAt(i)); };
  str(0,'RIFF'); wav.setUint32(4,36+n*2,true); str(8,'WAVE'); str(12,'fmt '); wav.setUint32(16,16,true); wav.setUint16(20,1,true); wav.setUint16(22,1,true); wav.setUint32(24,sr,true); wav.setUint32(28,sr*2,true); wav.setUint16(32,2,true); wav.setUint16(34,16,true); str(36,'data'); wav.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){ const v=Math.max(-1,Math.min(1,d[a+i]*gain)); wav.setInt16(44+i*2, v<0?v*32768:v*32767, true); }
  return wav.buffer;
}
function b64(ab){ const u=new Uint8Array(ab); let s=''; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null, u.subarray(i,i+0x8000)); return btoa(s); }
function unb64(s){ const r=atob(s), u=new Uint8Array(r.length); for(let i=0;i<r.length;i++) u[i]=r.charCodeAt(i); return u.buffer; }

/* ---- voice profiles (each person's 33 recorded words) ----
   settings.profiles = [{id, name}]; clips are stored in IndexedDB under "<id>|<word>". */
function profiles(){ if (!Array.isArray(settings.profiles)) settings.profiles=[]; return settings.profiles; }
function profileName(pid){ const p=profiles().find(x=>x.id===pid); return p?p.name:'Voice'; }
function newProfileId(){ let i=1; while(profiles().some(p=>p.id==='p'+i)) i++; return 'p'+i; }

const ClipStore = {
  db:null,
  open(){ return this.db ? Promise.resolve(this.db) : new Promise((res,rej)=>{ const r=indexedDB.open('abacus-voice',1); r.onupgradeneeded=()=>r.result.createObjectStore('clips'); r.onsuccess=()=>{ this.db=r.result; res(this.db); }; r.onerror=()=>rej(r.error); }); },
  async tx(mode, fn){ const db=await this.open(); return new Promise((res,rej)=>{ const t=db.transaction('clips',mode); const out=fn(t.objectStore('clips')); t.oncomplete=()=>res(out); t.onerror=()=>rej(t.error); }); },
  put(pid, word, val){ return this.tx('readwrite', st=>st.put(val, pid+'|'+word)); },
  async getAll(){ const db=await this.open(); return new Promise((res,rej)=>{ const out={}; const req=db.transaction('clips').objectStore('clips').openCursor(); req.onsuccess=()=>{ const c=req.result; if(c){ out[c.key]=c.value; c.continue(); } else res(out); }; req.onerror=()=>rej(req.error); }); },
  async getProfile(pid){ const all=await this.getAll(); const out={}; for (const [k,v] of Object.entries(all)) if (k.startsWith(pid+'|')) out[k.slice(pid.length+1)]=v; return out; },
  async deleteProfile(pid){ const all=await this.getAll(); return this.tx('readwrite', st=>{ for (const k of Object.keys(all)) if (k.startsWith(pid+'|')) st.delete(k); }); },
  // One-time move of recordings made before profiles existed (keys without "|") into a first profile.
  async migrate(){
    let all; try{ all=await this.getAll(); }catch(e){ return; }
    const legacy=Object.keys(all).filter(k=>!k.includes('|'));
    if (legacy.length){
      if (!profiles().some(p=>p.id==='p1')) profiles().unshift({id:'p1', name:'My voice'});
      await this.tx('readwrite', st=>{ for (const k of legacy){ st.put(all[k], 'p1|'+k); st.delete(k); } });
      Diag.add(`moved ${legacy.length} earlier recordings into "${profileName('p1')}"`);
    }
    // Recordings whose person entry went missing (e.g. settings were reset) get a placeholder name back.
    const ids=new Set(Object.keys(all).filter(k=>k.includes('|')).map(k=>k.split('|')[0]));
    for (const id of ids) if (!profiles().some(p=>p.id===id)){ profiles().push({id, name:'Voice '+id.replace(/^p/,'')}); Diag.add('recovered recordings for '+id); }
    if (settings.voice==='mine') settings.voice = profiles().some(p=>p.id==='p1') ? 'rec:p1' : 'device';
    saveSettings();
  },
};

const Speaker = {
  ctx:null, sprite:{}, spriteMap:{}, recs:{}, recLoaded:{}, loading:{}, playing:[], ttsVoices:[], ttsReady:false, activePid:null, turn:0,
  init(){
    if ('speechSynthesis' in window){
      const loadV = () => { this.ttsVoices = speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang)); fillVoiceSelect(); };
      loadV(); speechSynthesis.onvoiceschanged = loadV;
    }
    this.prepare();
  },
  kind(){ const v=settings.voice||'device'; if (v.startsWith('rec:')) return 'rec'; if (SPRITES[v]) return 'sprite'; return 'device'; },
  recPids(){ const v=settings.voice||''; if (v==='rec:turns') return profiles().map(p=>p.id); return v.startsWith('rec:') ? [v.slice(4)] : []; },
  isComplete(pid){ const r=this.recs[pid]; return !!r && RECORD_WORDS.every(w=>r[w]); },
  ensureCtx(){ if (!this.ctx) this.ctx = new (window.AudioContext||window.webkitAudioContext)(); return this.ctx; },
  unlock(){ // must run inside a user gesture on iOS (a finger LIFT or click, not a touch-down)
    this.gestured=true;
    try{ const c=this.ensureCtx(); if (c.state==='suspended') c.resume(); const b=c.createBuffer(1,1,22050), s=c.createBufferSource(); s.buffer=b; s.connect(c.destination); s.start(0); }catch(e){}
    if ('speechSynthesis' in window && !this.ttsReady){
      // iOS: speech is unlocked only once an utterance really starts inside a tap. Speak something
      // tiny and silent, and never cancel() it (cancelling before it starts leaves speech locked).
      try{ speechSynthesis.resume(); const u=new SpeechSynthesisUtterance('a'); u.volume=0.01; u.rate=2; u.onstart=()=>{ this.ttsReady=true; Diag.add('tts unlocked'); }; u.onerror=(e)=>Diag.add('tts unlock error '+(e&&e.error)); speechSynthesis.speak(u); }catch(e){ Diag.add('unlock exc '+e.message); }
    }
  },
  async prepare(){ // load whatever the current voice needs
    const k=this.kind();
    if (k==='rec'){ for (const pid of this.recPids()) await this.loadRec(pid); return; }
    if (k==='sprite') return this.loadSprite(settings.voice);
  },
  async loadRec(pid, force){
    if (this.recLoaded[pid] && !force) return;
    const key='rec:'+pid; if (this.loading[key]) return this.loading[key];
    this.loading[key]=(async()=>{ try{
      const c=this.ensureCtx(); const stored=await ClipStore.getProfile(pid); const out={}; const bad=[];
      for (const [w,v] of Object.entries(stored)){ try{ out[w]=await decode(c, await clipBytes(v)); }catch(e){ bad.push(w); } }
      this.recs[pid]=out; this.recLoaded[pid]=true;
      const missing=RECORD_WORDS.filter(w=>!out[w]);
      Diag.add(`${profileName(pid)}: ${RECORD_WORDS.length-missing.length}/${RECORD_WORDS.length} words loaded`+(bad.length?`, failed: ${bad.join(', ')}`:'')+(missing.length&&missing.length<RECORD_WORDS.length?`, missing: ${missing.join(', ')}`:''));
    }catch(e){ Diag.add('load failed for '+profileName(pid)+': '+(e&&e.message||e)); } delete this.loading[key]; })();
    return this.loading[key];
  },
  // Choose which recorded voice reads the next problem (rotates for "Take turns").
  pickReader(advance=true){   // advance=false: look without using up a turn
    if (this.kind()!=='rec'){ this.activePid=null; return null; }
    const ready=this.recPids().filter(pid=>this.isComplete(pid));
    if (!ready.length){ this.activePid=null; return null; }
    this.activePid = settings.voice==='rec:turns' ? ready[(advance ? this.turn++ : this.turn) % ready.length] : ready[0];
    return this.activePid;
  },
  async loadSprite(key){
    if (!SPRITES[key] || this.sprite[key]) return;
    if (this.loading[key]) return this.loading[key];
    this.loading[key]=(async()=>{ try{
      const c=this.ensureCtx();
      const {map,b64}=await new Promise((res,rej)=>{ window.__VOICE_LOADED=(k,m,b)=>{ if(k===key) res({map:m,b64:b}); }; const s=document.createElement('script'); s.src='audio/voice-'+key+'.js'; s.onerror=()=>rej(new Error('no voice file')); document.head.appendChild(s); setTimeout(()=>rej(new Error('timeout')),60000); });
      this.sprite[key]=await decode(c, unb64(b64)); this.spriteMap[key]=map.sprite;
    }catch(e){ console.warn('sprite load failed', key, e); } delete this.loading[key]; })();
    return this.loading[key];
  },
  canSchedule(){
    const k=this.kind();
    if (k==='rec'){ if (!this.activePid || !this.isComplete(this.activePid)) this.pickReader(false); return !!this.activePid; }
    return k==='sprite' && !!this.sprite[settings.voice];
  },
  // Schedule one term at audio-clock time `when`; returns end time. Only when canSchedule().
  scheduleTerm(d, first, when){
    const c=this.ctx; let t=Math.max(when||0, c.currentTime+0.02); const rate=settings.voiceRate||1;
    if (this.kind()==='rec'){
      const r=this.recs[this.activePid];
      for (const w of termTokens(d, first)){ const b=r[w]; if(!b) continue; const s=c.createBufferSource(); s.buffer=b; s.playbackRate.value=rate; s.connect(c.destination); s.start(t); this.playing.push(s); t+=b.duration/rate+0.06; }
    } else {
      const buf=this.sprite[settings.voice], m=this.spriteMap[settings.voice];
      const a=Math.abs(d), pre=first?'n':d<0?'m':(settings.sayPlus?'p':'n');
      const ids = a<100 ? [pre+a] : [pre+Math.floor(a/100),'hundred'].concat(a%100?['n'+(a%100)]:[]);
      for (const id of ids){ const sp=m[id]; if(!sp) continue; const s=c.createBufferSource(); s.buffer=buf; s.playbackRate.value=rate; s.connect(c.destination); s.start(t, sp[0], sp[1]); this.playing.push(s); t+=sp[1]/rate+0.05; }
    }
    return t;
  },
  schedulePhrase(word, when){ // feedback words ('yes', 'not quite') for clip voices
    const c=this.ctx; const t=Math.max(when||0,c.currentTime+0.02);
    if (this.kind()==='rec'){ const b=(this.recs[this.activePid]||{})[word]; if (b){ const s=c.createBufferSource(); s.buffer=b; s.connect(c.destination); s.start(t); this.playing.push(s); return t+b.duration; } return t; }
    const m=this.spriteMap[settings.voice], id=word==='yes'?'yes':'notquite'; if (m&&m[id]){ const s=c.createBufferSource(); s.buffer=this.sprite[settings.voice]; s.connect(c.destination); s.start(t, m[id][0], m[id][1]); this.playing.push(s); return t+m[id][1]; }
    return t;
  },
  deviceVoice(){
    const v=settings.voice||'device'; const uri=v.startsWith('device:')?v.slice(7):'';
    return this.ttsVoices.find(x=>x.voiceURI===uri) || this.ttsVoices.find(x=>/Samantha/.test(x.name)) || this.ttsVoices.find(x=>/Karen|Moira|Daniel|Tessa|Alex|Ava|Allison|Zoe|Nicky/.test(x.name)) || this.ttsVoices.find(x=>x.default) || this.ttsVoices[0];
  },
  sayDevice(text){
    return new Promise(res=>{
      if (!('speechSynthesis' in window)) return res('no speechSynthesis');
      const go=()=>{
        try{ speechSynthesis.resume(); }catch(e){}
        const u=new SpeechSynthesisUtterance(text); const v=this.deviceVoice(); if (v) u.voice=v;
        u.rate=settings.voiceRate||1; u.pitch=1;
        let done=false, started=false; const fin=(why)=>{ if(!done){done=true;res(why);} }; u.onstart=()=>{started=true;}; u.onend=()=>fin(started?'ok':'ended-without-start'); u.onerror=(e)=>fin('error '+(e&&e.error)); setTimeout(()=>fin(started?'ok(timeout)':'TIMEOUT never started'), 2500+text.length*70);
        this.lastUtt=u; speechSynthesis.speak(u);
      };
      // Only cancel if one of OUR real utterances is still going; iOS drops a speak() issued right after cancel(), so wait a beat.
      if (this.lastUtt && speechSynthesis.speaking){ speechSynthesis.cancel(); setTimeout(go, 80); } else go();
    });
  },
  // Generic: say a term or feedback word now, with whatever voice is active.
  say(text, word){
    if (this.canSchedule() && this.ctx){
      const end = word ? this.schedulePhrase(word) : this.scheduleTerm(text, true);
      return new Promise(res=>setTimeout(res, Math.max(0,(end-this.ctx.currentTime)*1000)));
    }
    return this.sayDevice(word ? (word==='yes'?'Yes!':'Not quite') : termText(text, true));
  },
  stop(){ for (const s of this.playing){ try{ s.stop(); }catch(e){} } this.playing=[]; if ('speechSynthesis' in window && this.lastUtt && speechSynthesis.speaking){ speechSynthesis.cancel(); this.lastUtt=null; } }
};
function recCount(pid){ const r=Speaker.recs[pid]; return r ? RECORD_WORDS.filter(w=>r[w]).length : 0; }
function fillVoiceSelect(){
  const sel=$('#sVoice'); if(!sel) return; sel.innerHTML='';
  const add=(v,l)=>{ const o=document.createElement('option'); o.value=v; o.textContent=l; sel.appendChild(o); };
  const ready=profiles().filter(p=>Speaker.isComplete(p.id));
  profiles().forEach(p=>{ const n=recCount(p.id); add('rec:'+p.id, `Recorded: ${p.name}`+(Speaker.recLoaded[p.id] && n<RECORD_WORDS.length ? ` (${n}/${RECORD_WORDS.length} words)` : '')); });
  if (ready.length>=2) add('rec:turns', `Recorded: take turns (${ready.map(p=>p.name).join(', ')})`);
  add('device', 'This device’s voice (auto)');
  Speaker.ttsVoices.forEach(v=>add('device:'+v.voiceURI, 'Device: '+v.name));
  Object.entries(SPRITES).forEach(([k,l])=>add(k,l));
  sel.value = settings.voice; if (sel.value!==settings.voice) sel.value='device';
}

/* ---------------- voice recorder (parent mode) ---------------- */
const Recorder = {
  stream:null, rec:null, chunks:[], idx:0, clips:{}, pid:null,
  async select(pid){ this.pid=pid; settings.recPid=pid; saveSettings(); this.clips = pid ? await ClipStore.getProfile(pid) : {}; const first=RECORD_WORDS.findIndex(w=>!this.clips[w]); this.idx = first<0 ? 0 : first; this.render(); },
  async start(){
    if (!this.pid){ $('#recStatus').textContent='Add a person first.'; return false; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder){ $('#recStatus').textContent='Recording needs Safari on the hosted link, not a local file.'; return false; }
    try{ this.stream = this.stream || await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:true}}); }
    catch(e){ $('#recStatus').textContent='Microphone permission was not granted.'; return false; }
    await this.select(this.pid); return true;
  },
  render(){
    const has=!!this.pid; $('#recBody').style.display = has ? '' : 'none';
    if (!has) return;
    const w=RECORD_WORDS[this.idx]; $('#recWord').textContent=w; $('#recCount').textContent=(this.idx+1)+' / '+RECORD_WORDS.length;
    const done=RECORD_WORDS.filter(x=>this.clips[x]).length, all=done===RECORD_WORDS.length, nm=profileName(this.pid);
    $('#recStatus').textContent = all
      ? `${nm}: all ${RECORD_WORDS.length} words recorded. To redo one, find it with the arrows` + (this.stream ? ' and hold to record.' : ', tap "Start recording", then hold.')
      : `${nm}: ${done} of ${RECORD_WORDS.length} recorded.` + (this.stream ? (this.clips[w] ? ' This word is done; hold to redo it.' : ' Hold the button and say the word.') : ' Tap "Start recording" to use the microphone.');
    $('#recPlay').disabled=!this.clips[w];
  },
  begin(){ if(!this.stream) return; this.chunks=[]; const mt=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||''; this.rec=new MediaRecorder(this.stream, mt?{mimeType:mt}:{}); this.rec.ondataavailable=e=>{ if(e.data.size) this.chunks.push(e.data); }; this.rec.start(); $('#recBtn').classList.add('on'); },
  async end(){
    if(!this.rec || this.rec.state!=='recording') return; const rec=this.rec;
    await new Promise(res=>{ rec.onstop=res; rec.stop(); }); $('#recBtn').classList.remove('on');
    const blob=new Blob(this.chunks,{type:rec.mimeType||'audio/mp4'});
    const bytes = await this.clean(blob);
    const pid=this.pid, w=RECORD_WORDS[this.idx]; const val={buf:bytes, type:'audio/wav'}; await ClipStore.put(pid, w, val); this.clips[w]=val;
    Speaker.recLoaded[pid]=false; this.render(); await this.play();
    if (RECORD_WORDS.every(x=>this.clips[x])){
      await Speaker.loadRec(pid, true);
      if (Speaker.kind()!=='rec') { settings.voice='rec:'+pid; saveSettings(); }
      fillVoiceSelect(); renderProfiles();
      $('#recStatus').textContent = Speaker.isComplete(pid) ? `All ${RECORD_WORDS.length} words recorded for ${profileName(pid)}. Pick the voice above and tap Test to hear it.` : 'Some words could not be read back; see Sound check.';
      return;
    }
    const nxt=RECORD_WORDS.findIndex((x,i)=>i>this.idx && !this.clips[x]); this.idx = nxt>=0 ? nxt : Math.min(RECORD_WORDS.length-1, this.idx+1); this.render();
  },
  // decode, trim silence, normalise, store as 24 kHz WAV (small, decodes everywhere)
  async clean(blob){
    const c=Speaker.ensureCtx(); const raw=await blob.arrayBuffer();
    try{
      let buf=await decode(c, raw.slice(0)); buf=await resample(buf, 24000);
      const d=buf.getChannelData(0), sr=buf.sampleRate; let peak=0; for(let i=0;i<d.length;i++) peak=Math.max(peak,Math.abs(d[i]));
      const th=Math.max(0.02, peak*0.08); let a=0,b=d.length-1; while(a<b && Math.abs(d[a])<th) a++; while(b>a && Math.abs(d[b])<th) b--;
      a=Math.max(0,a-Math.floor(sr*0.03)); b=Math.min(d.length,b+Math.floor(sr*0.08)); if (b-a < sr*0.08){ a=0; b=d.length; }
      return wavBytes(buf, a, b, peak>0 ? 0.9/peak : 1);
    }catch(e){ Diag.add('clean failed, keeping raw: '+(e&&e.message||e)); return raw; }
  },
  async play(){ const w=RECORD_WORDS[this.idx]; const v=this.clips[w]; if(!v) return; const c=Speaker.ensureCtx(); try{ if (c.state!=='running') await c.resume(); const buf=await decode(c, await clipBytes(v)); const s=c.createBufferSource(); s.buffer=buf; s.connect(c.destination); s.start(); await new Promise(r=>setTimeout(r, buf.duration*1000)); }catch(e){ Diag.add('playback failed for '+w+': '+(e&&e.message||e)); } },
  prev(){ this.idx=Math.max(0,this.idx-1); this.render(); }, next(){ this.idx=Math.min(RECORD_WORDS.length-1,this.idx+1); this.render(); },
  stop(){ if(this.stream){ this.stream.getTracks().forEach(t=>t.stop()); this.stream=null; } },
};
async function renderProfiles(){
  const sel=$('#recWho'); sel.innerHTML='';
  for (const p of profiles()){ if (!Speaker.recLoaded[p.id]) await Speaker.loadRec(p.id); const o=document.createElement('option'); o.value=p.id; o.textContent=`${p.name} (${recCount(p.id)}/${RECORD_WORDS.length})`; sel.appendChild(o); }
  const pid = profiles().some(p=>p.id===Recorder.pid) ? Recorder.pid : profiles().some(p=>p.id===settings.recPid) ? settings.recPid : (profiles()[0]||{}).id || null;
  if (pid) sel.value=pid; $('#recName').value = pid ? profileName(pid) : '';
  $('#recWhoRow').style.display = profiles().length ? '' : 'none';
  if (pid!==Recorder.pid || !pid) await Recorder.select(pid); else Recorder.render();
}

/* ---------------- backup file (voices + progress) ---------------- */
const Backup = {
  file:null,
  async build(){
    const voices={profiles:profiles().map(p=>({id:p.id,name:p.name})), clips:{}};
    const c=Speaker.ensureCtx();
    for (const p of profiles()){
      const stored=await ClipStore.getProfile(p.id); voices.clips[p.id]={};
      for (const [w,v] of Object.entries(stored)){
        let bytes=await clipBytes(v);
        try{ let buf=await decode(c, bytes.slice(0)); if (buf.sampleRate>24000){ buf=await resample(buf, 24000); bytes=wavBytes(buf); } }catch(e){}
        voices.clips[p.id][w]=b64(bytes);
      }
    }
    saveSettings(); saveProgress(); save('history',history); save('days',days);
    const data={app:'abacus-practice', format:3, savedAt:new Date().toISOString(), settings, children:Store.exportChildren(), active:Store.activeId(), voices};
    const name=`abacus-backup-${todayKey()}.json`;
    this.file=new File([JSON.stringify(data)], name, {type:'application/json'});
    return this.file;
  },
  async save(){ // must run directly inside a tap (iOS share sheet needs it)
    const f=this.file; if (!f) return 'nothing';
    if (navigator.canShare && navigator.canShare({files:[f]})){ try{ await navigator.share({files:[f], title:'Abacus backup'}); return 'shared'; }catch(e){ if (e && e.name==='AbortError') return 'cancelled'; } }
    const url=URL.createObjectURL(f); const a=document.createElement('a'); a.href=url; a.download=f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 30000); return 'downloaded';
  },
  async restore(text, withProgress){
    const d=JSON.parse(text); if (d.app!=='abacus-practice') throw new Error('Not an Abacus Practice backup file');
    let n=0;
    if (d.voices && d.voices.profiles){
      for (const p of d.voices.profiles){
        const existing=profiles().find(x=>x.id===p.id);
        if (existing) existing.name=p.name; else profiles().push({id:p.id, name:p.name});
        await ClipStore.deleteProfile(p.id);
        for (const [w,s] of Object.entries((d.voices.clips||{})[p.id]||{})){ await ClipStore.put(p.id, w, {buf:unb64(s), type:'audio/wav'}); n++; }
        Speaker.recLoaded[p.id]=false;
      }
    }
    if (withProgress && d.format>=3 && Array.isArray(d.children)){
      const keep=profiles(); Store.importChildren(d.children, d.active);
      settings=Object.assign({}, Store.loadSettings(DEFAULTS), d.settings||{}, {profiles:keep});
      progress=Store.get('progress', {current:'beads', nodes:{}}); history=Store.get('history', []); days=Store.get('days', {}); Fun.replace(Store.get('fun', {}));
      saveSettings();
      return { voices:(d.voices&&d.voices.profiles||[]).length, clips:n };
    }
    if (withProgress){
      const keepProfiles=profiles(); settings=Object.assign({}, DEFAULTS, d.settings||{}, {profiles:keepProfiles});
      if (d.progress) progress=d.progress; if (d.history) history=d.history; if (d.days) days=d.days; if (d.fun) Fun.replace(d.fun);
      save('history',history); save('days',days); saveProgress();
    }
    saveSettings();
    return { voices:(d.voices&&d.voices.profiles||[]).length, clips:n };
  },
};

/* ---------------- screens ---------------- */
function show(id){ $$('.screen').forEach(s=>s.classList.toggle('active', s.id===id)); }

/* ---------------- home (Workshop: Bix, Today on the soroban, three doors) ---------------- */
function curIdx(){ return NODE_IDX[progress.current] ?? 0; }
function stars(nid){ const h=node(nid).hist.slice(-20); if(!h.length) return 0; const p=h.filter(x=>x.ok).length/h.length; return node(nid).mastered ? 3 : p>=0.8 ? 2 : h.length>=5 ? 1 : 0; }
// Home greetings: [bubble text, voice line]. Bubbles can use the name; the recorded voice never does.
const HOME_LINES = (n)=>{
  const nm = settings.name ? `, ${settings.name}` : '', h=new Date().getHours();
  const tod = h<12 ? ['Good morning'+nm+'! Ready to move some beads?','hello_morning'] : h<17 ? ['Good afternoon'+nm+'! Let\'s do some abacus!','hello_afternoon'] : ['Good evening'+nm+'! A little practice before bed?','hello_evening'];
  const L=[tod, [`You're back${nm}! I missed you!`,'hello_back'], [`Hi${nm}! Tap Start when you're ready!`,'hello_ready']];
  if (n.family===10) L.push(['Big friends make 10. Let\'s practise!','hello_big']);
  if (n.family===5) L.push(['Small friends make 5. Let\'s practise!','hello_small']);
  return L;
};
let greeted=false;
function greetIdx(){ return (Fun.data.seen++) % 2 === 0 ? 0 : 1; }
document.addEventListener('click', e=>{
  if (greeted || !$('#home').classList.contains('active')) return;
  const onButton = e.target.closest('button') && !e.target.closest('#bixHome');
  setTimeout(()=>{ if (!onButton && !greeted && $('#home').classList.contains('active')) renderHome(); }, 120);
}, true);
/* ---- Toy Table look for home, who, gate and first-run setup (TOY.* in toykit.js, styles in toy-home.css) ---- */
// Fun.Mascot (fun.js) still mounts the Workshop Bix and owns his bubble, taps and voice. On the rebuilt screens this
// draws TOY.bix over him and follows Mascot's moods and reactions; `rest` is his resting pose on that screen.
const TOY_BIX_MOOD = { cheer:'cheer', think:'think', concerned:'oops', wow:'wow', sleepy:'sleepy' };
function toyBix(el, rest, opts){
  if (!el) return;
  if (!el.querySelector('.bix')) Fun.Mascot.mount(el, Object.assign({size:96, keep:true}, opts||{}));
  const bx=el.querySelector('.bix'); el.classList.add('tb'); if (rest) el.dataset.rest=rest;
  let host=bx.querySelector('.tb-toy');
  const draw=()=>{ const m = bx.classList.contains('cheer') ? 'cheer' : bx.classList.contains('oops') ? 'oops' : TOY_BIX_MOOD[bx.dataset.mood] || el.dataset.rest || 'happy';
    if (host.dataset.m!==m){ host.dataset.m=m; host.innerHTML=TOY.bix(m, 320); } };
  if (!host){ host=document.createElement('span'); host.className='tb-toy'; host.setAttribute('aria-hidden','true'); bx.appendChild(host);
    new MutationObserver(draw).observe(bx, {attributes:true, attributeFilter:['class','data-mood']}); }
  draw();
}
window.ToyBix = toyBix;
// Today's steps are three lacquer beads on a rod: 1 red, 2 mustard, 3 indigo (the same colours as their number chips).
// A finished bead turns teal with a tick; the next one glows.
const STEP_COLORS = ['red','mustard','indigo'], KID_COLORS = ['red','indigo','teal','mustard'], NUM_WORD = ['No','One','Two','Three','Four','Five'];
function stepBead(s, nextI){
  const i = s.at, cur = i===nextI, col = STEP_COLORS[i%3];
  const state = s.done ? 'done' : cur ? 'now' : 'later', just = s.done && stepBead.seen && !stepBead.seen[i];
  return `<li class="step th-step ${state}${just?' just':''}${cur?' next':''}" data-n="${i+1}" data-c="${col}" aria-label="${esc(s.label)}${s.done?' (done)':cur?' (next)':''}">`
    + `<span class="th-bead">${TOY.bead(s.done ? 'teal' : col, 150, {tall:true})}${s.done ? `<span class="th-bead-ic">${TOY.icon('check', 44, '#fff', {stroke:3.4})}</span>` : ''}</span><span class="sl th-lab" data-n="${i+1}">${esc(s.label)}</span></li>`;
}
// The moon in the window fills as today's steps get done: thin crescent, half, gibbous, then full and proud.
const HOME_SPARKS = `<svg class="th-sparks" viewBox="0 0 430 200" aria-hidden="true">`
  + [[52,44,9],[118,26,6],[246,40,10],[306,104,7],[362,36,8],[88,118,6],[270,132,5]].map(([x,y,r],i)=>`<path d="M${x},${y-r} Q${x+r*.18},${y-r*.18} ${x+r},${y} Q${x+r*.18},${y+r*.18} ${x},${y+r} Q${x-r*.18},${y+r*.18} ${x-r},${y} Q${x-r*.18},${y-r*.18} ${x},${y-r}Z" fill="${i%3===1?'#F7C843':'#FFFDF6'}"/>`).join('') + `</svg>`;
function homeMoon(done, total){
  const full = done>=total, phase = full ? 1 : .36 + .39*done/Math.max(1,total-1), key = done+'/'+total, sky=$('#homeSky');
  if (sky.dataset.k===key) return; sky.dataset.k=key;
  sky.innerHTML = TOY.skyMoon(full ? 'proud' : done ? 'happy' : 'calm', phase) + (full ? HOME_SPARKS : '');
}
// The bubble as in the mockup: the greeting as a title, then the rest of what Bix says (the caption always holds the
// spoken line) and how many beads are left today. The moon gets one mention.
function homeBubble(text, steps){
  const t=$('#bixHome .bubble .ws-text'); if (!t || !settings.name) return;
  const n=steps.length, done=steps.filter(s=>s.done).length, left=n-done, m=/^(.*?[!.?])\s+(.*)$/.exec(text), title = m ? m[1] : text, rest = m ? m[2] : '';
  const sub = !left ? `${TOY.moonName} is full! ${rest.replace('My Room', 'My room')}`
    : rest + ' ' + (!done ? `${NUM_WORD[n]||n} beads to fill up ${TOY.moonName}!` : `${NUM_WORD[left]||left} more ${left===1?'bead':'beads'} to slide.`);
  t.innerHTML = `<span class="toy-bubble-title">${esc(title)}</span> <span class="th-bub-sub">${esc(sub.trim())}</span>`;
}
function renderHome(){
  const many = Store.children().length>1, tagName = settings.name || (many ? 'New child' : '');
  const tagCol = KID_COLORS[Math.max(0, Store.children().findIndex(c=>c.id===Store.activeId()))%KID_COLORS.length];
  const sk=$('#switchKid'); sk.style.display = many ? '' : 'none'; sk.innerHTML = many ? TOY.tag(tagName, {hang:true, color:tagCol}) : '';
  sk.setAttribute('aria-label', 'Switch child' + (tagName ? ` (now ${tagName})` : ''));
  $('#homeTag').innerHTML = !many && tagName ? TOY.tag(tagName, {hang:true, color:tagCol}) : '';
  const cur = NODES[curIdx()];
  const steps = todaySteps(); const allDone = steps.every(s=>s.done);
  // Bix
  const bh=$('#bixHome'); toyBix(bh, allDone ? 'proud' : 'wave');
  // Bix talks on the home screen once per visit to the app (the first time sound is allowed), and when today is finished.
  const canTalk = !!Speaker.gestured;   // sound is allowed once she has tapped
  const line = !settings.name ? ["I don't know your name yet! Tap me to tell me.", 'ask_name']
    : allDone ? [`All done today, ${settings.name}! Play a game or visit My Room.`, 'all_done']
    : (greeted ? HOME_LINES(cur)[2] : HOME_LINES(cur)[greetIdx()]);
  const speak = canTalk && (!greeted || (allDone && !renderHome.saidDone));
  Fun.Mascot.say(bh, line[0], 0, speak ? line[1] : null, line[1]);
  homeBubble(line[0], steps);
  if (speak){ greeted=true; if (allDone) renderHome.saidDone=true; }
  Fun.save();
  // Today: three beads on the rod, finished ones first (slid to the left like counted beads); the moon shows the same count
  const nextS = steps.find(s=>!s.done), nextI = nextS ? nextS.at : -1, left = steps.filter(s=>!s.done).length, started = left<steps.length;
  $('#home').classList.toggle('is-done', allDone);
  homeMoon(steps.length-left, steps.length);
  $('#todayTitle').textContent = allDone ? 'All done!' : 'Today';
  $('#greetSub').textContent = allDone ? 'See you tomorrow' : left===steps.length ? `${steps.length} little steps` : `${left} more to go`;
  const shown = steps.filter(s=>s.done).concat(steps.filter(s=>!s.done));
  $('#todaySteps').innerHTML = shown.map(s=>stepBead(s,nextI)).join('');
  stepBead.seen = steps.map(s=>s.done);   // a step that turns done since the last visit pops (by its place in the plan)
  const go=$('#todayGo'); go.classList.toggle('play', allDone);
  $('#todayGoIc').innerHTML = TOY.icon(allDone ? 'star' : 'play', 64, '#fff', {stroke:3, accent:'#fff'});
  $('#todayGoT').textContent = allDone ? 'Play' : (started ? 'Next' : 'Start');
  go.setAttribute('aria-label', allDone ? 'Play a game' : `${started?'Next':'Start'}: ${nextS.label}`);
  Treats.renderJar();
}
// Things on the home table that never change (kit drawings, no emoji).
$('#grownups').innerHTML = TOY.icon('lock', 30, 'currentColor');
$('#doorPracticeIc').innerHTML = TOY.icon('practice', 46, 'currentColor');
$('#doorPlayIc').innerHTML = TOY.icon('star', 46, 'currentColor', {accent:'#FFFDF6'});
$('#doorRoomIc').innerHTML = TOY.icon('room', 46, 'currentColor');
$('#homeShelf').innerHTML = TOY.prop('rainbow', 150) + TOY.prop('plant', 170);
$('#homeLoose').innerHTML = TOY.bead('mustard', 64) + TOY.bead('teal', 72) + TOY.bead('indigo', 58);
$('#homeBowl').innerHTML = TOY.prop('bowl', 190);
// Tapping Bix on the home screen asks for a name if the device doesn't have one yet.
$('#bixHome').addEventListener('pointerup', e=>{ if (settings.name || !e.target.closest('.bix')) return; setTimeout(openNameAsk, 250); });
function openNameAsk(){
  Fun.Mascot.say($('#bixHome'), "I don't know your name yet! Tap me to tell me.", 0, 'ask_name');
  toyBix($('#bixName'), 'happy', {bubble:false});
  $('#nameAskIn').value=''; $('#nameAsk').classList.add('active'); setTimeout(()=>$('#nameAskIn').focus(),200);
}
function saveAskedName(){ const n=$('#nameAskIn').value.trim().replace(/\s+/g,' ').slice(0,20); if(!n){ $('#nameAskIn').focus(); Fun.Mascot.react($('#bixName'),'oops'); return; } settings.name=n; saveSettings(); $('#nameAsk').classList.remove('active'); Sfx.ok(); renderHome(); Fun.Mascot.react($('#bixHome'),'cheer'); Fun.Mascot.say($('#bixHome'), `Hi, ${n}! Now I know you!`, 0, 'got_name'); }
$('#nameAskOk').addEventListener('click', saveAskedName);
$('#nameAskIn').addEventListener('keydown', e=>{ if(e.key==='Enter') saveAskedName(); });
$('#nameAskNo').addEventListener('click', ()=>$('#nameAsk').classList.remove('active'));
function hasLesson(n){ return !!(n.demos || n.kind==='numbers'); }
// Each kind of Today step: [icon name, label]. (On the home rod the bead colour comes from its place: STEP_COLORS.)
const STEP_INFO = { lesson:['book','Learn'], visual:['eye','Look'], listen:['ear','Listen'], flash:['bolt','Flash'], game:['game','Game'] };
// Three short steps a day: learn/practise, a game, then the other practice mode.
// The plan is made once per child per day (Fun.data is per child) and then frozen: unlocking a skill or a grown-up
// changing the skill mid-day never reshuffles it. Each step simply runs on whatever skill is current when tapped.
function todaySteps(){
  const F=Fun.data, day=todayKey(), n=NODES[curIdx()];
  if (!F.today || F.today.day!==day){
    const k = Object.keys(days).length;
    const drill = n.kind==='flash' ? 'flash' : (k%2===0 ? 'visual' : 'listen');
    const s1 = (!node(n.id).lesson && hasLesson(n)) ? 'lesson' : drill;
    const s3 = n.kind==='flash' ? (k%2===0?'visual':'listen') : (s1==='visual' ? 'listen' : 'visual');
    const gameIds = Games.family()===5 && curIdx()<NODE_IDX.sf_add ? ['build','reader'] : ['pop','reader','build'];
    const g = gameIds[k % gameIds.length];
    F.today = { day, celebrated:false, steps:[ {kind:s1}, {kind:'game', game:g}, {kind:s3} ].map(s=>Object.assign(s,{done:false})) };
    Fun.save();
  }
  return F.today.steps.map((s,at)=>{ const [icon,label]=STEP_INFO[s.kind]; const g=s.game&&Games.GAMES[s.game]; return Object.assign({}, s, { at, icon, label: g?g.name:label }); });
}
// Start a Today step. What actually runs is remembered (F.today.active), so finishing it ticks this step
// even when the step had to run something else (e.g. a Look step that first teaches a newly unlocked skill).
function startStep(s){
  const n=NODES[curIdx()], F=Fun.data;
  const ran = (kind)=>{ if (F.today) { F.today.active={ at:s.at, kind }; Fun.save(); } };
  if (s.kind==='lesson'){ ran('lesson'); return startMode('learn'); }
  if (s.kind==='game'){ ran('game'); return Games.open(s.game); }
  if ((s.kind==='visual'||s.kind==='listen') && hasLesson(n) && !node(n.id).lesson){ ran('lesson'); return startLesson(n); }   // learn a new skill before drilling it
  if (s.kind==='flash'){ ran('flash'); return startDrill('flash', n); }
  ran(s.kind); return startDrill(s.kind, n.kind==='flash' ? C.BY_ID.combined : n);
}
// Called whenever she finishes something: plants today's flower, gives a sticker, ticks today's step.
async function activityDone(kind, info={}){
  days[todayKey()]=true; save('days',days);
  const F=Fun.data; if (F.today && F.today.day===todayKey()){
    const a=F.today.active, own = a && a.kind===kind && F.today.steps[a.at] && !F.today.steps[a.at].done ? F.today.steps[a.at] : null;
    const st = own || F.today.steps.find(s=>!s.done && s.kind===kind); if (st) st.done=true; F.today.active=null; }
  Fun.save();
  await Fun.give({gold: !!info.gold});
  Treats.earn(Treats.EARN.activity + (info.gold ? Treats.EARN.gold : 0), info.gold ? 'finished + gold sticker' : 'for finishing');
  if (info.leveled){ await sleep(2300); Treats.earn(Treats.EARN.skill, 'new skill unlocked!'); }
  if (F.today && F.today.day===todayKey() && F.today.steps.every(s=>s.done) && !F.today.celebrated){
    F.today.celebrated=true; F.garden[todayKey()]='full'; Fun.save();
    await sleep(2300); Fun.confetti(120); Sfx.star();
    await Fun.give({gold:true, title:'Today’s practice is done!', voice:'today_done'});
    Treats.earn(Treats.EARN.today, 'Today’s practice done!');
  }
  if ($('#home').classList.contains('active')) renderHome();
}
$('#todayGo').addEventListener('click', ()=>{ Speaker.unlock(); const st=todaySteps(); const s=st.find(x=>!x.done); if (s) startStep(s); else goPlay(); });
function goPlay(){ Games.renderHub(); toySky('#playSky'); const bp=$('#bixPlay'); if (!bp.querySelector('.bix')) Fun.Mascot.mount(bp,{size:84}); ToyRoom.bix(bp); Fun.Mascot.say(bp, 'Pick a game! Every game gives a sticker.', 0, 'play_pick'); show('play'); }
function goAlbum(){ Fun.renderAlbum(); Fun.data.albumSeen=Fun.count(); Fun.save(); show('album'); }
$('#exitPlay').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#exitGame').addEventListener('click', ()=>{ Games.stop(); goPlay(); });
// The three doors. Practice opens the Practice door screen (#door).
function openPractice(){
  Speaker.unlock();
  if (typeof window.App.openDoor==='function') return window.App.openDoor();
  return show('door');
}
// Start a practice mode for the current skill (used by the Practice door and the tests).
function startMode(m){
  Speaker.unlock();
  const n=NODES[curIdx()];
  if (m==='play') return goPlay();
  if (m==='album') return goAlbum();
  if (m==='learn'){ const target = hasLesson(n) ? n : NODES.slice(0,curIdx()).reverse().find(x=>x.demos) || n; return startLesson(target); }
  if (m==='flash') return startDrill('flash', n.kind==='flash' ? n : NODES[curIdx()]);
  return startDrill(m, n.kind==='flash' ? C.BY_ID.combined : n);
}
$('#doorPractice').addEventListener('click', openPractice);
$('#doorPlay').addEventListener('click', ()=>{ Speaker.unlock(); goPlay(); });
$('#doorRoom').addEventListener('click', ()=>{ Speaker.unlock(); goRoom(); });

/* ---------------- My Room: sticker book, flower pot, treat jar (Toy Table look) ---------------- */
// The moon in the window of these screens: she fills as today's steps get done and is proud when they all are.
function toySky(sel){
  const el=$(sel); if (!el) return; const st=todaySteps(), done=st.filter(x=>x.done).length, full=st.length>0 && done===st.length;
  el.innerHTML = TOY.skyMoon(full ? 'proud' : done ? 'happy' : 'calm', 0.4 + 0.6*done/Math.max(1, st.length));
}
ToyRoom.sky = toySky;
// The sticker book lies open on the table; the first stickers she has earned are stuck on its pages (n = how many she has).
function bookSVG(n){
  const LAC=['red','mustard','teal','indigo','plum'], spots=[[52,84],[88,80],[124,84],[52,132],[88,128],[124,132],[178,84],[214,80],[250,84],[178,132],[214,128],[250,132]];
  let st='';
  spots.forEach((p,i)=>{ const [x,y]=p;
    if (i<n) st += `<g transform="translate(${x} ${y}) rotate(${(i*47)%25-12})"><circle cx="1.5" cy="2" r="15" fill="#3A1E06" opacity=".18"/><circle r="15" fill="#FFFDF6"/><circle r="11.5" fill="url(#toy-lac-${LAC[i%5]})"/><path d="M0,-6.6 l1.9,4 4.4,.6 -3.2,3 .8,4.4 L0,3.3 -3.9,5.4 -3.1,1 -6.3,-2 -1.9,-2.6Z" fill="#fff" opacity=".92"/><ellipse cx="-4.5" cy="-6.5" rx="4" ry="1.5" transform="rotate(-35 -4.5 -6.5)" fill="#fff" opacity=".7"/></g>`;
    else st += `<circle cx="${x}" cy="${y}" r="13.5" fill="#F6EEDC" stroke="#D2C4A6" stroke-width="2" stroke-dasharray="5 5"/>`; });
  const page = (d,d2,d3)=>`<path d="${d3}" fill="#CFC2A6"/><path d="${d2}" fill="#EDE4D0"/><path d="${d}" fill="#FFFDF6"/>`;
  return `<svg viewBox="0 0 300 214" width="300" height="214" aria-hidden="true">`
    + `<ellipse cx="166" cy="198" rx="150" ry="14" fill="url(#toy-g-shadow)" opacity=".5"/><ellipse cx="154" cy="196" rx="138" ry="11" fill="url(#toy-g-shadow)" opacity=".95"/>`
    + `<rect x="6" y="36" width="288" height="164" rx="14" fill="#1B2557"/><rect x="6" y="28" width="288" height="164" rx="14" fill="url(#toy-lac-indigo)"/><rect x="10" y="32" width="280" height="156" rx="11" fill="none" stroke="#96A5EA" stroke-width="2" opacity=".5"/>`
    + page('M150,46 C118,32 58,32 20,40 V174 C58,166 118,166 150,180Z','M150,50 C118,36 58,36 18,44 V178 C58,170 118,170 150,184Z','M150,54 C118,40 58,40 16,48 V182 C58,174 118,174 150,188Z')
    + page('M150,46 C182,32 242,32 280,40 V174 C242,166 182,166 150,180Z','M150,50 C182,36 242,36 282,44 V178 C242,170 182,170 150,184Z','M150,54 C182,40 242,40 284,48 V182 C242,174 182,174 150,188Z')
    + `<path d="M150,46 C140,42 130,39 120,37.5 V168 C130,170 140,174 150,180Z" fill="#3A1E06" opacity=".07"/><path d="M150,46 C157,43 164,41 170,39.5 V170.5 C164,172 157,175 150,180Z" fill="#3A1E06" opacity=".12"/><path d="M150,46 V180" stroke="#B9AA90" stroke-width="2"/>`
    + `<g stroke="#D9CEB8" stroke-width="4" stroke-linecap="round"><path d="M40,56 H96"/><path d="M168,56 H224"/></g>${st}`
    + `<path d="M160,40 V200 l7,-8 7,8 V38Z" fill="url(#toy-lac-red)"/><path d="M160,40 V200 l3,-3.5 V39.5Z" fill="#fff" opacity=".3"/></svg>`;
}
// On the wall shelf: the rainbow, a few standing books and the bead bowl.
const SHELF_BOOKS = `<svg class="tr-books" width="96" height="84" viewBox="0 0 96 84" aria-hidden="true">${[['red',4,18,16,66,0],['mustard',22,8,18,76,0],['teal',42,24,15,60,0],['plum',60,14,17,70,9]].map(b=>`<g transform="rotate(${b[5]} ${b[1]+b[3]} 84)"><rect x="${b[1]}" y="${b[2]}" width="${b[3]}" height="${b[4]}" rx="3" fill="url(#toy-lac-${b[0]})"/><rect x="${b[1]+b[3]-4}" y="${b[2]}" width="4" height="${b[4]}" rx="2" fill="#1A0606" opacity=".22"/><rect x="${b[1]+3}" y="${b[2]+8}" width="${b[3]-8}" height="5" rx="2" fill="#FFFDF6" opacity=".85"/><rect x="${b[1]+2}" y="${b[2]+2}" width="3" height="${b[4]-4}" rx="1.5" fill="#fff" opacity=".35"/></g>`).join('')}</svg>`;
$('#roomShelfArt').innerHTML = TOY.prop('rainbow', 124) + SHELF_BOOKS + TOY.prop('bowl', 116);
$('#exitRoom').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitAlbum').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitShop').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitPlay').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitGame').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#roomWishIc').innerHTML = TOY.icon('star', 30, '#4A2C06');
function renderRoom(){
  toySky('#roomSky'); $('#roomBookArt').innerHTML = bookSVG(Fun.count());
  const unseen = Fun.count() - (Fun.data.albumSeen||0), bd=$('#albumBadge');
  bd.textContent = unseen>0 ? `${unseen} new` : ''; bd.classList.toggle('on', unseen>0);
  $('#roomStickers').setAttribute('aria-label', `Sticker book: ${Fun.count()} stickers` + (unseen>0 ? `, ${unseen} new` : ''));
  const n = Fun.renderGarden($('#garden'), $('#gardenLabel'), days);
  $('#roomGarden').setAttribute('aria-label', `My garden: ${$('#gardenLabel').textContent}`);
  Treats.renderJar();
  $('#roomWish').classList.toggle('tr-nudge', !Treats.goal());   // nudge only to pick a goal, never to spend
  return n;
}
function goRoom(){
  renderRoom(); show('room');
  const br=$('#bixRoom'); if (!br.querySelector('.bix')) Fun.Mascot.mount(br, {size:110, keep:true}); ToyRoom.bix(br);
  const [text, vid] = Treats.jarLine(); Fun.Mascot.say(br, text, 0, vid);
}
$('#exitRoom').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#roomStickers').addEventListener('click', ()=>{ Sfx.tap(); goAlbum(); });
$('#roomGarden').addEventListener('click', ()=>{
  Sfx.boing(); const pot=$('#garden'); pot.classList.remove('wiggle'); void pot.offsetWidth; pot.classList.add('wiggle');
  const n=Object.keys(days).filter(k=>k.startsWith(todayKey().slice(0,8))).length, br=$('#bixRoom');
  Fun.Mascot.react(br,'happy');
  Fun.Mascot.say(br, n ? `${n} flower${n===1?'':'s'} this month! Every day you practise, a new one grows.` : 'Practise today and a flower will grow!', 0, null);
});
$('#jar').addEventListener('click', ()=>{ Sfx.tap(); Treats.open(); });
$('#roomWish').addEventListener('click', ()=>{ Sfx.tap(); Treats.wish(); });
$('#exitAlbum').addEventListener('click', ()=>goRoom());
$('#exitShop').addEventListener('click', ()=>goRoom());

/* ---------------- lesson ---------------- */
let lessonAb=null, L=null, lessonFrom='home';

/* ---- Bix's extra lines (door, lessons, games, gate): a small second voice pack, audio/bix-extra-<voice>.js ----
   Same voices as the main pack, built by tools/make_bix_extra.py. Plays through Fun.BixVoice so a newer line
   (from either pack) always replaces the one playing, and Bix's mouth moves while he talks. */
const BixExtra = {
  buf:{}, map:{}, loading:{},
  load(tag){
    if (this.buf[tag]) return Promise.resolve(); if (this.loading[tag]) return this.loading[tag];
    this.loading[tag]=new Promise(res=>{
      const prev=window.__BIX_EXTRA;
      window.__BIX_EXTRA=async(t, meta, b64)=>{
        if (t!==tag){ if (prev) prev(t, meta, b64); return; }
        try{ const ctx=Speaker.ensureCtx(); this.buf[tag]=await decode(ctx, unb64(b64)); this.map[tag]=meta.sprite; }catch(e){ Diag.add('bix extra decode failed'); }
        delete this.loading[tag]; res();
      };
      const s=document.createElement('script'); s.src=`audio/bix-extra-${tag}.js`; s.onerror=()=>{ delete this.loading[tag]; res(); }; document.head.appendChild(s);
    });
    return this.loading[tag];
  },
  async play(id, el){
    const BV=Fun.BixVoice; if (!id || !BV.enabled() || App.quietNow() || !Speaker.gestured) return;
    const ctx=Speaker.ensureCtx(), tag=BV.tag(); const my=++BV.seq; BV.queued++;
    try{ if (ctx.state!=='running'){ try{ await Promise.race([ctx.resume(), sleep(800)]); }catch(e){} } await this.load(tag); } finally { BV.queued--; }
    if (my!==BV.seq || ctx.state!=='running') return;
    const buf=this.buf[tag], sp=this.map[tag] && this.map[tag][id]; if (!buf || !sp) return;
    BV.stop();
    const s=ctx.createBufferSource(); s.buffer=buf; s.connect(ctx.destination); s.start(ctx.currentTime+0.02, sp[0], sp[1]); BV.src=s;
    const bx=el && el.querySelector('.bix, .ws-bix'); if (bx){ bx.classList.add('talking'); BV.talkingEl=bx; }
    await new Promise(r=>{ s.onended=r; setTimeout(r, sp[1]*1000+400); });
    if (BV.src===s){ BV.src=null; if (bx) bx.classList.remove('talking'); }
  },
};
// Bix says a line: the bubble shows the text and he says it out loud (main pack or extra pack, whichever has the id).
function bixSay(el, text, id, ms=0){
  const main = id && window.BIX_LINES && window.BIX_LINES[id];
  Fun.Mascot.say(el, text, ms, main ? id : null);
  if (id && !main) BixExtra.play(id, el);
  if (el) el.dataset.line = JSON.stringify([text, id||'']);
}
window.BixSay = bixSay;
// Tap Bix's bubble to hear the line again (children who cannot read yet).
document.addEventListener('click', e=>{
  const b=e.target.closest('.c-topbix .bubble, .lesson-bix .bubble, .gate-bix .bubble, .gmascot .bubble'); if (!b) return;
  const el=b.closest('[data-line]'); if (!el) return; try{ const [t,id]=JSON.parse(el.dataset.line); Speaker.unlock(); bixSay(el, t, id); }catch(err){}
});
function mountBix(el, size){ if (el && !el.querySelector('.bix, .ws-bix')) Fun.Mascot.mount(el, {size, keep:true}); }
const BACK_ICON = ()=>WS.icon('back', 30, 'currentColor', 3);
$$('.c-top .exit').forEach(b=>{ if (!b.innerHTML.trim()) b.innerHTML=BACK_ICON(); });

/* ---- Practice door: Look / Listen / Flash for the current skill, and "My path" ---- */
// Short names a child can read on the path rod (new skills fall back to their own short name).
const PATH_NAMES = { beads:'Beads', add_direct:'Adding', sub_direct:'Taking away', sf_add:'Small friends +', sf_sub:'Small friends −',
  bf_add_a:'Big friends +9…+6', bf_add_b:'Big friends +5…+1', bf_sub_a:'Big friends −9…−6', bf_sub_b:'Big friends −5…−1', combined:'Both friends', two_digit:'Two digits', anzan:'In my head',
  long_rows:'Long rows', rows_2d:'Two-digit rows', anzan_more:'In my head: 5', three_digit:'Three digits', times_a:'Times 2–5', times_b:'Times 6–9',
  anzan_2d:'In my head: 2 digits', four_digit:'Four digits', mul_2x1:'Times: 2 digits', mul_3x1:'Times: 3 digits' };
// Skill levels for grown-ups (Levels 4-6 carry node.level; the first twelve skills are Levels 1-3).
const OLD_LEVEL = { beads:1, add_direct:1, sub_direct:1, sf_add:1, sf_sub:1, bf_add_a:2, bf_add_b:2, bf_sub_a:2, bf_sub_b:2, combined:3, two_digit:3, anzan:3 };
function levelOf(n){ if (n.level) return n.level; if (OLD_LEVEL[n.id]) return OLD_LEVEL[n.id]; const i=NODE_IDX[n.id]; return i>0 ? levelOf(NODES[i-1]) : 1; }
// Which skill a door block drills: Look/Listen need a written-sum skill, Flash a mental-abacus one.
function doorDrillNode(m, n){
  const before=NODES.slice(0, NODE_IDX[n.id]+1).reverse();
  if (m==='flash') return (n.drill && n.drill.op==='mul') ? (before.find(x=>x.kind==='flash') || n) : n;
  if (n.kind==='flash') return before.find(x=>x.drill && !x.drill.flash && x.drill.op!=='mul') || C.BY_ID.combined;
  return n;
}
function pathName(n){ return PATH_NAMES[n.id] || n.short || n.title; }
function lessonTarget(n){ return hasLesson(n) ? n : NODES.slice(0, NODE_IDX[n.id]).reverse().find(x=>x.demos) || n; }
/* Toy Table pieces shared by the door, the path and lessons (local helpers; the drawings come from TOY). */
// Bix: Fun.Mascot keeps the behaviour (tap, voice, reactions); the figurine on the table is TOY.bix and follows his mood.
const TOY_MOOD_D = { concerned:'oops' };
function toyBixD(el, size, opts){
  if (!el) return;
  if (!el.querySelector('.bix')) Fun.Mascot.mount(el, Object.assign({size}, opts||{}));
  const bx=el.querySelector('.bix'); if (!bx || bx.querySelector('.toy-bix')) return;
  const fig=document.createElement('span'); fig.className='td-bixfig'; bx.appendChild(fig); bx.classList.add('td-bixed');
  const draw=()=>{ const m=bx.dataset.mood || bx.dataset.base || 'happy'; if (fig.dataset.m===m) return; fig.dataset.m=m; fig.innerHTML=TOY.bix(TOY_MOOD_D[m]||m, size); };
  draw(); new MutationObserver(draw).observe(bx, {attributes:true, attributeFilter:['data-mood']});
  const say=el.querySelector('.ws-say'); if (say) say.innerHTML=TOY.icon('speaker', 26, 'currentColor');
}
// The moon in the window fills with today's steps (she never shrinks: no plan yet = her resting crescent).
function toySky(el){
  const t=Fun.data && Fun.data.today, ok=t && t.day===todayKey() && t.steps && t.steps.length;
  const tot=ok ? t.steps.length : 3, done=ok ? t.steps.filter(x=>x.done).length : 0;
  el.innerHTML=TOY.skyMoon(done>=tot ? 'proud' : done ? 'happy' : 'calm', done>=tot ? 1 : .4+.45*done/tot);
}
function replay(el, cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
$('#exitDoor').innerHTML=TOY.icon('back', 32, 'currentColor'); $('#exitLesson').innerHTML=TOY.icon('back', 32, 'currentColor');

// The three ways to practise: wooden toy blocks with a lacquer face. [TOY icon, label, icon colour, accent]
const DOOR_TOYS = { visual:['eye','Look','#fff','#FFD25E'], listen:['ear','Listen','#4A2C06','#FFFDF6'], flash:['flash','Flash','#fff','#FFD25E'] };
function renderDoor(){
  $$('#door .door-block').forEach(b=>{ const [ic,lab,col,acc]=DOOR_TOYS[b.dataset.door];
    if (!b.dataset.drawn){ b.innerHTML=`<span class="td-toy-face">${TOY.icon(ic, 96, col, {accent:acc, stroke:2.3})}</span><span class="door-label">${lab}</span>`; b.dataset.drawn='1'; } });
  const all=$('#doorAll'); if (!all.innerHTML) all.innerHTML=TOY.icon('lock', 22, 'currentColor')+'<span>See all skills</span>';
  const props=$('#doorProps'); if (!props.innerHTML) props.innerHTML=TOY.prop('rainbow', 150)+TOY.prop('plant', 170);
  toySky($('#doorSky'));
  renderDoorPath();
  const bd=$('#bixDoor'); toyBixD(bd, 190, {keep:true});
  bixSay(bd, 'How do you want to play with numbers?', 'door_ask');
  $('#door').classList.toggle('intro', !renderDoor.seen); renderDoor.seen=true;
}
// My path: every skill is a bead on one brass rod that winds across the table. Learned beads are glossy teal, the
// current one is gold and glows, the ones still to come are bare wood. A small wooden flag starts each level.
function doorFlag(lv, x, y, k){
  return `<span class="dp-flag" style="left:${x}px;top:${y}px;width:${Math.round(112*k)}px" role="img" aria-label="Level ${lv}"><svg viewBox="0 0 112 150" aria-hidden="true">`
    + `<ellipse cx="30" cy="139" rx="34" ry="7" fill="url(#toy-g-shadow)" opacity=".5"/><ellipse cx="21" cy="138" rx="21" ry="5.5" fill="url(#toy-g-shadow)"/>`
    + `<ellipse cx="18" cy="135" rx="17" ry="6" fill="url(#toy-g-maple-side)"/><ellipse cx="18" cy="132" rx="17" ry="5.6" fill="url(#toy-g-maple)"/>`
    + `<rect x="13.5" y="12" width="9" height="121" rx="4" fill="url(#toy-g-post)"/>`
    + `<path d="M24,21 H106 L95,36.5 L106,52 H24Z" fill="#CDBFA4"/><path d="M22,18 H104 L93,33.5 L104,49 H22Z" fill="#FFFDF6"/><path d="M22,41 H98.5 L104,49 H22Z" fill="#F0E6D0"/>`
    + `<text x="58" y="40.5" text-anchor="middle" font-family="Fredoka,'Baloo 2',system-ui,sans-serif" font-weight="600" font-size="19" fill="#2B3674">Level ${lv}</text>`
    + `<circle cx="18" cy="11" r="8" fill="url(#toy-lac-red)"/><ellipse cx="15.4" cy="7.8" rx="3" ry="1.6" transform="rotate(-30 15.4 7.8)" fill="#fff" opacity=".85"/></svg></span>`;
}
function renderDoorPath(){
  const p=$('#doorPath'), ci=curIdx(), k=(innerWidth>=1300 && innerHeight>=960) ? 1.14 : 1, R=v=>Math.round(v*k);
  const SLOT=R(170), CUR=R(256), FLAG=R(100), HB=R(98), HC=R(122), AMP=R(13), Y0=R(78), H=R(268);
  let x=R(26), lvl=0, curX=0; const pts=[], out=[];
  NODES.forEach((n,i)=>{
    const lv=levelOf(n), label=esc(pathName(n)), name=label.split(' ').map(w=>`<span>${w}</span>`).join(' ');
    if (lv!==lvl){ lvl=lv; out.push(doorFlag(lv, x+R(10), Y0-R(92), k)); x+=FLAG; }
    const w=i===ci ? CUR : SLOT, cx=x+w/2, cy=Math.round(Y0+AMP*Math.sin(i*1.3+.5)); pts.push([cx, cy]); x+=w;
    const at=(h)=>`style="left:${cx}px;top:${cy-Math.round(h*.47)}px;width:${w}px"`;
    if (i<ci) out.push(`<div class="dp-node done" ${at(HB)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: learned">${TOY.bead('teal', HB, {tall:true})}<span class="dp-mark">${TOY.icon('check', R(34), '#fff', {stroke:3.6})}</span></button><span class="dp-name">${name}</span></div>`);
    else if (i===ci){ curX=cx;
      out.push(`<div class="dp-node cur" ${at(HC)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: you are here"><span class="dp-glow"></span>${TOY.bead('mustard', HC, {tall:true})}<span class="dp-mark">${TOY.icon('star', R(42), '#FFFDF6')}</span></button><span class="dp-name">${name}</span>`
        +`<button class="toy-block toy-block--teal toy-block--sm dp-learn" id="doorLearn">${TOY.icon('play', 26, '#fff')}<span class="toy-block-label">Learn it with Bix</span></button></div>`); }
    else out.push(`<div class="dp-node locked" ${at(HB)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: not yet">${TOY.bead('wood', HB, {tall:true})}<span class="dp-mark">${TOY.icon('lock', R(28), 'currentColor', {accent:'#F6D9AA'})}</span></button><span class="dp-name">${name}</span></div>`);
  });
  const W=x+R(26), ends=[[-30, pts[0][1]]].concat(pts, [[W+30, pts[pts.length-1][1]]]);
  const d=ends.map((q,i)=>{ if (!i) return `M${q[0]},${q[1]}`; const a=ends[i-1], mx=Math.round((a[0]+q[0])/2); return `C${mx},${a[1]} ${mx},${q[1]} ${q[0]},${q[1]}`; }).join(' ');
  const rod=`<svg class="dp-cord" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" aria-hidden="true"><path d="${d}" transform="translate(5,10)" stroke="#3A1E06" stroke-opacity=".16" stroke-width="15"/><path d="${d}" transform="translate(3,7)" stroke="#3A1E06" stroke-opacity=".2" stroke-width="9"/>`
    +`<path d="${d}" stroke="#8E6A1C" stroke-width="12"/><path d="${d}" stroke="#E2B54A" stroke-width="8"/><path d="${d}" transform="translate(0,-2)" stroke="#FFF1B8" stroke-width="2.4" stroke-opacity=".85"/></svg>`;
  p.innerHTML=`<div class="dp-row" style="width:${W}px;height:${H}px">${rod}${out.join('')}</div>`;
  p.scrollLeft=Math.max(0, curX-p.clientWidth*.42);
  p.querySelectorAll('.dp-node .dp-bead').forEach(b=>b.onclick=()=>{
    const i=NODE_IDX[b.dataset.node], bd=$('#bixDoor'); Sfx.tap();
    if (i>ci){ replay(b, 'td-shake'); bixSay(bd, 'Locked! Finish the skills before it to open it.', 'locked', 3500); }
    else if (i<ci){ replay(b, 'td-pop'); bixSay(bd, 'You already know this one. Great job!', 'path_done', 3500); }
    else bixSay(bd, 'This is your skill right now! Tap “Learn it with Bix”.', 'path_here', 3500);
  });
  $('#doorLearn').onclick=()=>{ Speaker.unlock(); startLesson(lessonTarget(NODES[curIdx()]), 'door'); };
}
window.addEventListener('resize', ()=>{ if ($('#door').classList.contains('active')) renderDoorPath(); });
window.renderDoor = renderDoor;
// Whoever opens the door (home calls show('door')), it draws itself fresh.
new MutationObserver(()=>{ const d=$('#door'); if (d.classList.contains('active')){ if (!d._shown){ d._shown=true; renderDoor(); } } else d._shown=false; })
  .observe($('#door'), {attributes:true, attributeFilter:['class']});
$$('#door .door-block').forEach(b=>b.addEventListener('click', ()=>{
  Speaker.unlock(); const m=b.dataset.door, n=NODES[curIdx()];
  if (!n.drill) return startLesson(lessonTarget(n), 'door');                  // nothing to drill yet (bead numbers): learn it
  startDrill(m, doorDrillNode(m, n));
}));
$('#exitDoor').addEventListener('click', ()=>{ Fun.BixVoice.stop(); renderHome(); show('home'); });
$('#doorAll').addEventListener('click', ()=>openGate('skills'));

/* ---- lesson: Bix shows each trick on a wooden soroban, then she tries it ---- */
// Number friends in lessons: the family as small lacquer chips in Bix's bubble, and the pair a step is about
// standing on the table next to Bix, holding hands around what they make.
function friendsHtml(n){
  const ps = n.family===5 ? TOY.FRIENDS.small : n.family===10 ? TOY.FRIENDS.big : [];
  const dot=v=>`<b class="toy-lac--${FRIEND_LAC[v]}">${v}</b>`;
  return ps.map(([a,b])=>`<span data-pair="${a}-${b}" aria-label="${a} and ${b}">${dot(a)}${dot(b)}</span>`).join('');
}
const FRIEND_LAC = {1:'red', 9:'red', 2:'plum', 8:'plum', 3:'teal', 7:'teal', 4:'indigo', 6:'indigo', 5:'mustard'};
function friendIn(text){ const m=/(?:Small|Big) friend of (\d) is (\d)/.exec(String(text||'').replace(/<[^>]+>/g,'')); return m ? [+m[1], +m[2]] : null; }
function friendOfSteps(steps){ for (const st of steps||[]){ const f=friendIn(st.say); if (f) return f; } return null; }
function lessonPair(f, mood){
  const el=$('#lessonPair'), key=f ? f.join('-')+(mood||'') : 'none'; if (el.dataset.k===key) return; el.dataset.k=key;
  el.classList.toggle('has-pair', !!f); $('#lesson').classList.toggle('with-pair', !!f);
  el.innerHTML = f ? TOY.pair(f[0], f[1], 150, {mood:mood||'happy'}) : '';
  const pk=f ? Math.min(f[0],f[1])+'-'+Math.max(f[0],f[1]) : ''; $$('#capFriends span').forEach(x=>x.classList.toggle('on', x.dataset.pair===pk));
}
// The speaker mark on the lesson bubble: shown only while the caption has a spoken line; tap the bubble to hear it again.
function capVoice(id, extra){
  const c=$('#lessonCap'), mark=$('#capSay'); c._v=null; mark.hidden=true; c.classList.remove('has-voice'); if (!id || !Fun.BixVoice.enabled()) return;
  const on=()=>{ c._v={id, extra}; mark.hidden=false; c.classList.add('has-voice'); };
  if (!extra){ if (window.BIX_LINES && window.BIX_LINES[id]) on(); return; }
  const tag=Fun.BixVoice.tag(), tok=c._vt=(c._vt||0)+1; BixExtra.load(tag).then(()=>{ if (c._vt===tok && BixExtra.map[tag] && BixExtra.map[tag][id]) on(); });
}
$('#capSay').innerHTML=TOY.icon('speaker', 26, 'currentColor');
$('#lessonCap').addEventListener('click', ()=>{ const v=$('#lessonCap')._v; if (!v) return; Speaker.unlock(); if (v.extra) BixExtra.play(v.id, $('#bixLesson')); else Fun.BixVoice.play(v.id, $('#bixLesson')); });
function startLesson(n, from){
  Speaker.unlock(); lessonFrom = from || 'home';
  // The practice soroban (AbacusInput via DemoAbacus): Bix moves it in demos, the child moves it on "Your turn".
  // Rods sized to the lesson's biggest number (at least 3, like practice), so the beads stay big enough to move.
  const rods=lessonRods(n);
  if (!lessonAb || lessonAb.rodsMade!==rods){ if (lessonAb) lessonAb.destroy(); lessonAb = DemoAbacus($('#lessonAbacus'), {rods, readout:true, onBead:()=>Sfx.tap(), onChange:(v)=>onLessonBeads(v)}); lessonAb.rodsMade=rods; }
  lessonAb.reset();
  L = { node:n, phase:'intro', page:0, pages:null, demoIdx:0, step:0, guidedIdx:0, steps:null, busy:false };
  $('#lessonTitle').textContent=n.title; $('#capFriends').innerHTML=friendsHtml(n);
  toyBixD($('#bixLesson'), 170, {bubble:false}); toySky($('#lessonSky'));
  // Room under the soroban is kept for the friends only in lessons where a friend rule can come up.
  let friendly=false; try{ friendly=[...(n.demos||[]), ...(n.guided||[])].some(pr=>friendOfSteps(lessonStep(n, pr).steps)); }catch(e){}
  $('#lesson').classList.toggle('may-pair', friendly); $('#lesson').dataset.rods=rods;
  $('#lessonPair').dataset.k=''; lessonPair(n.family && n.demos ? friendOfSteps(lessonStep(n, n.demos[0]).steps) : null);
  show('lesson'); renderLesson();
}
// One demo/guided pair of any skill -> {start, target, label, op, steps} (Curriculum.lessonStep knows multiplication).
function lessonStep(n, pair){
  if (C.lessonStep) return C.lessonStep(n, pair);
  const [x,y]=pair; return { start:x, target:x+y, label:`${x} ${y<0?'−':'+'} ${Math.abs(y)}`, op:y<0?'sub':'add', steps:C.explain(x,y) };
}
function lessonRods(n){
  let mx=0;
  try{ if (n.kind==='numbers') mx=Math.max(0, ...n.lesson.numbers); else for (const p of [...(n.demos||[]), ...(n.guided||[])]){ const ls=lessonStep(n, p); mx=Math.max(mx, ls.start||0, ls.target||0); } }catch(e){ mx=99999; }
  return Math.max(3, String(Math.floor(mx)).length);
}
function lessonTotal(){ const n=L.node; const demos=n.kind==='numbers'? n.lesson.numbers.length : n.demos.length; const guided=n.kind==='numbers'?0:n.guided.length; return demos+guided+1; }
function lessonDone(){ const n=L.node; const d=n.kind==='numbers'? L.phase==='numbers'?L.demoIdx:0 : L.phase==='demo'?L.demoIdx : L.phase==='guided'? n.demos.length+L.guidedIdx : L.phase==='done'? lessonTotal() : 0; return d; }
// The problem as wooden-tile maths: "+" in jade, "−" in red (same meaning as the number tiles).
function probHtml(p){ return esc(p).replace(/\+/g,'<i class="plus">+</i>').replace(/−/g,'<i class="minus">−</i>').replace(/×/g,'<i class="times">×</i>'); }
function cap(kind, text, prob){ $('#capKind').textContent=kind; const t=$('#capText'); t.classList.remove('tight'); t.innerHTML=text; if (capLines()>3) t.classList.add('tight'); if (prob!==undefined){ const el=$('#capProb'); el.dataset.p=prob||''; el.innerHTML = prob==='*' ? TOY.icon('star', 64, '#F2B632') : probHtml(prob||''); }
  capVoice(null); const f=friendIn(text); if (f) lessonPair(f, 'cheer'); }
// Bix's lesson bubble holds at most 3 lines: long explanations are split into extra pages (measured, so it fits every iPad size).
function capLines(){ const t=$('#capText'); if (!t || !t.offsetParent || !t.textContent.trim()) return 0; const lh=parseFloat(getComputedStyle(t).lineHeight)||30; return Math.round(t.getBoundingClientRect().height/lh); }
function fitPages(pieces, wrap){
  const t=$('#capText'), keep=t.innerHTML, out=[]; let cur='';
  const fits=h=>{ t.innerHTML=wrap(h); return capLines()<=3; };
  const split=p=>{ const parts=p.split(/(?<=[;:,])\s+/); return parts.length>1 ? parts : [p]; };
  const queue=pieces.slice();
  while (queue.length){
    const p=queue.shift(), next=cur ? cur+' '+p : p;
    if (fits(next)){ cur=next; continue; }
    if (cur){ out.push(cur); cur=''; queue.unshift(p); continue; }
    const sub=split(p); if (sub.length>1){ queue.unshift(...sub); continue; }
    out.push(p);   // one long clause: cap() makes the text a little smaller
  }
  if (cur) out.push(cur); t.innerHTML=keep; return out.map(wrap);
}
const sentences=txt=>String(txt||'').split(/(?<=[.!?])\s+/).filter(Boolean);
// The intro pages: what the skill is (a few sentences per page), then each step of the method on its own page.
function lessonPages(n){
  const pages=fitPages(sentences(n.intro).map(esc), h=>h).map(html=>({kind:'New skill', html}));
  if (Array.isArray(n.method)) n.method.forEach((m,i)=>fitPages(sentences(m).map(esc), h=>`<ol class="method" start="${i+1}"><li>${h}</li></ol>`).forEach(html=>pages.push({kind:`How to: step ${i+1} of ${n.method.length}`, html})));
  return pages;
}
// The one obvious next step is the teal block; "Skip" is plain wood.
function lessonBtn(label, icon, kind){ const b=$('#lessonNext'); b.className='toy-block td-next toy-block--'+(kind==='maple' ? 'wood' : 'teal'); b.innerHTML=(icon?TOY.icon(icon, 36, 'currentColor', {stroke:3.2}):'')+`<span class="toy-block-label">${label}</span>`; }
function lessonSay(id){ Fun.BixVoice.play(id, $('#bixLesson')); capVoice(id); }
// Lesson progress as beads on a brass rod (one per demo / try): done teal, the one you are on gold, the rest bare wood.
function renderLessonSteps(){
  const tot=lessonTotal()-1, done=Math.min(tot, lessonDone()), live=['numbers','demo','guided'].includes(L.phase);
  const el=$('#lessonSteps'); el.setAttribute('aria-label', L.phase==='done' ? 'All steps done' : live ? `Step ${done+1} of ${tot}` : `${tot} steps`);
  el.innerHTML=Array.from({length:tot},(_,i)=>{ const ok=i<done, cur=i===done&&live; return `<i class="ls-dot${ok?' ok':cur?' cur':''}">${TOY.bead(ok?'teal':cur?'mustard':'wood', 48, {tall:true, shadow:false})}</i>`; }).join('');
}
async function renderLesson(){
  const n=L.node; renderLessonSteps(); $('#lessonHint').style.display='none';
  $('#lesson').dataset.phase=L.phase; lessonAb.setReadOnly(!(L.phase==='numbers' || L.phase==='guided'));
  if (L.phase==='intro'){
    $('#capProb').innerHTML=''; $('#capProb').dataset.p='';
    if (!L.pages) L.pages=lessonPages(n);
    const pg=L.pages[Math.min(L.page, L.pages.length-1)], last=L.page>=L.pages.length-1;
    cap(pg.kind, pg.html, ''); lessonBtn(last?'Show me':'Next', last?'play':null);
    if (L.page===0){ lessonAb.reset(); BixExtra.play('learn_'+n.id, $('#bixLesson')); capVoice('learn_'+n.id, true); }
    return;
  }
  if (L.phase==='numbers'){ // beads node: set each number
    const v=n.lesson.numbers[L.demoIdx]; L.target=v; lessonAb.reset();
    cap('Your turn', `Show <b>${v}</b> on the abacus. Tap beads to move them.`, String(v)); lessonBtn('Skip', null, 'maple'); if (L.demoIdx===0) lessonSay('lesson_turn'); return;
  }
  if (L.phase==='demo'){
    const ls=lessonStep(n, n.demos[L.demoIdx]); L.steps=ls.steps; L.step=0; lessonAb.value=ls.start; if (!n.family) lessonPair(null);
    cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, '', ls.label); if (L.demoIdx===0) lessonSay('lesson_watch'); lessonBtn('Next', 'play');
    await playSteps(lessonAb, L.steps, (s)=>cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, s.say.replace(/(\d+)/g,'<b>$1</b>')));
    return;
  }
  if (L.phase==='guided'){
    const ls=lessonStep(n, n.guided[L.guidedIdx]); L.target=ls.target; lessonAb.value=ls.start;
    cap(`Your turn ${L.guidedIdx+1} of ${n.guided.length}`, guidedText(ls, n.guided[L.guidedIdx], ''), ls.label); { const f=friendOfSteps(ls.steps); if (f || !n.family) lessonPair(f); }
    lessonBtn('Skip', null, 'maple'); $('#lessonHint').style.display=''; if (L.guidedIdx===0) lessonSay('lesson_turn'); return;
  }
  if (L.phase==='done'){ cap('Done!', `You learned <b>${esc(n.title)}</b>. Now practise it with Look and Listen.`, '*'); lessonBtn('Finish', 'check'); node(n.id).lesson=true; saveProgress(); Sfx.star(); Fun.Mascot.react($('#bixLesson'), 'cheer', 2400); if (!L.awarded){ L.awarded=true; Fun.confetti(70); lessonSay('lesson_done'); setTimeout(()=>activityDone('lesson'), 2600); } return; }
}
$('#lessonHint').innerHTML=TOY.icon('eye', 30, 'currentColor')+'<span class="toy-block-label">Show me</span>';
let animToken=0;
async function playSteps(ab, steps, onStep){
  const my=++animToken; L.busy=true;
  for (const s of steps){ if (my!==animToken) return; onStep(s); for (const m of s.do){ if (my!==animToken) return; await ab.move(m.rod, m.delta, 450); } await sleep(s.do.length?600:900); }
  if (my===animToken) L.busy=false;
}
function onLessonBeads(v){
  if (L.busy) return;
  if (L.phase==='numbers' || L.phase==='guided'){
    if (v===L.target){ Sfx.ok(); lessonSay('lesson_yes'); Fun.Mascot.react($('#bixLesson'), 'happy'); cap('Yes!', `<b>${v}</b> — that's it.`); lessonAb.clearHighlights(); L.busy=true; setTimeout(()=>{ L.busy=false; advanceLesson(); }, 900); }
  }
}
function leaveLesson(){ animToken++; if (lessonFrom==='door'){ show('door'); } else if (lessonFrom==='parent'){ renderParent(); show('parent'); } else { renderHome(); show('home'); } }
function advanceLesson(){
  const n=L.node; animToken++; L.busy=false; lessonAb.clearHighlights();
  if (L.phase==='intro'){ if (L.pages && L.page<L.pages.length-1){ L.page++; renderLesson(); return; } L.phase = n.kind==='numbers' ? 'numbers' : 'demo'; L.demoIdx=0; }
  else if (L.phase==='numbers'){ L.demoIdx++; if (L.demoIdx>=n.lesson.numbers.length) L.phase='done'; }
  else if (L.phase==='demo'){ L.demoIdx++; if (L.demoIdx>=n.demos.length){ L.phase='guided'; L.guidedIdx=0; } }
  else if (L.phase==='guided'){ L.guidedIdx++; if (L.guidedIdx>=n.guided.length) L.phase='done'; }
  else if (L.phase==='done'){ leaveLesson(); return; }
  renderLesson();
}
$('#lessonNext').addEventListener('click', ()=>advanceLesson());
// Other screens and the tests can open any skill's lesson.
window.Lessons = { start: (n, from)=>startLesson(typeof n==='string' ? C.BY_ID[n] : n, from) };
// What to do on a "your turn" step, in words (multiplication starts from 0 and ends on the product).
function guidedText(ls, pair, lead){
  const [x,y]=pair;
  if (ls.op==='mul') return `${lead}Start at <b>0</b>. Work out <b>${x} × ${y}</b> on the abacus.`;
  return `${lead}${lead?'the abacus':'The abacus'} shows <b>${x}</b>. ${lead?(y<0?'Take away':'Add'):'Now '+(y<0?'take away':'add')} <b>${Math.abs(y)}</b>.`;
}
$('#lessonHint').addEventListener('click', async()=>{ if (L.busy) return; const gi=L.guidedIdx, pair=L.node.guided[gi], ls=lessonStep(L.node, pair); lessonAb.value=ls.start; lessonAb.setReadOnly(true); const tok=animToken+1; await playSteps(lessonAb, ls.steps, s=>cap('Show me', s.say.replace(/(\d+)/g,'<b>$1</b>'))); if (tok!==animToken || L.phase!=='guided' || L.guidedIdx!==gi) return; lessonAb.value=ls.start; lessonAb.setReadOnly(false); cap(`Your turn ${gi+1} of ${L.node.guided.length}`, guidedText(ls, pair, 'Now you: ')); });
$('#exitLesson').addEventListener('click', ()=>{ Fun.BixVoice.stop(); leaveLesson(); });

/* ---------------- practice (Look / Listen / Flash), answer tool, end of set, fix, level test ---------------- */
let mode='visual', drillNode=null, problems=[], idx=0, results=[], entry='', t0=0, reviewing=false, locked=false, wakeLock=null, reviewQueue=[];
let LT=null, pendingTest=null;   // LT: level test in progress {test, answers, start, tick}; pendingTest: node id whose test Bix offers
// Icons for static markup (index.html marks them with data-ic). The Toy Table screens (.tp) use the toy kit's icons;
// a name the toy kit does not have yet (print, share) falls back to the Workshop drawing.
const TOY_IC = new Set(TOY.ICONS);
function tpIcon(n, sz, stroke){ return TOY_IC.has(n) ? TOY.icon(n, sz, 'currentColor', stroke ? {stroke} : {}) : WS.icon(n, sz); }
function paintIcons(root){ (root||document).querySelectorAll('.pr-ic[data-ic]').forEach(el=>{ if (el.firstChild) return; const n=el.dataset.ic, sz=+(el.dataset.sz||0)||(n==='check'?32:n==='speaker'?26:28);
  el.innerHTML = el.closest('.tp, .tp-show') ? tpIcon(n, sz, +el.dataset.stroke||0) : WS.icon(n, sz); }); }
paintIcons();
$('#drillBowl').innerHTML = TOY.prop('bowl', 150);
$('#rvPack .bow').innerHTML = WS.bead('red',64)+WS.bead('red',64);
// Bix on the practice screens: the toy figurine + a paper bubble. He talks with a recorded line when one exists.
// He thinks while she works, cheers when it is right and is sheepish (never sad) when it is not.
const TOY_MOOD = { concerned:'oops' };
function bixArt(mood, size, opts){ return TOY.bix(TOY_MOOD[mood]||mood, size, opts).replace('class="toy-bix ', 'class="toy-bix bix '); }
// A rod bead (tall, seen on its rod): teal = right, red = one to fix, mustard = the one she is on, wood = still to come.
function rodBead(color, h, dim){ return TOY.bead(color, h, {tall:true, shadow:false, dim:!!dim}); }
// The answer-tool switch is a little thing on the table to pick up: a soroban ("Use the beads") or a set of keys ("Type it instead").
function switchArt(to){
  const sh='<ellipse cx="70" cy="101" rx="66" ry="9" fill="url(#toy-g-shadow)" opacity=".8"/>';
  if (to==='beads'){
    const bead=(x,y,c)=>`<g transform="translate(${x},${y}) scale(.62,.5)"><path d="M-8,-13 H8 Q12,-13 15,-10.5 L22.5,-2.5 Q25,0 22.5,2.5 L15,10.5 Q12,13 8,13 H-8 Q-12,13 -15,10.5 L-22.5,2.5 Q-25,0 -22.5,-2.5 L-15,-10.5 Q-12,-13 -8,-13Z" fill="url(#toy-lac-${c})"/><ellipse cx="-6" cy="-7" rx="8" ry="2.6" fill="#fff" opacity=".75"/></g>`;
    let rods=''; [38,70,102].forEach(x=>{ rods+=`<rect x="${x-1.5}" y="14" width="3" height="76" fill="#E6C690"/>`+bead(x,23,'mustard')+[0,1,2,3].map(k=>bead(x,56+k*8.6,'red')).join(''); });
    return `<svg width="140" height="110" viewBox="0 0 140 110" aria-hidden="true">${sh}<g transform="rotate(-3 70 55)"><rect x="12" y="10" width="116" height="90" rx="9" fill="#55331A"/><rect x="12" y="6" width="116" height="90" rx="9" fill="#7A4A24"/><rect x="13.5" y="7.5" width="113" height="87" rx="8" fill="none" stroke="#B98448" stroke-width="1.5" opacity=".6"/><rect x="21" y="14" width="98" height="74" rx="4" fill="#DDBB86"/><rect x="21" y="14" width="98" height="5" fill="#3A1E06" opacity=".22"/>${rods}<rect x="21" y="31" width="98" height="6" fill="#6A3F1E"/><circle cx="70" cy="34" r="1.6" fill="#FFF3D6"/></g></svg><span class="toy-chip">Use the beads</span>`;
  }
  let keys=''; for (let r=0;r<3;r++) for (let c=0;c<3;c++){ const x=29+c*28, y=14+r*26; keys+=`<rect x="${x}" y="${y+4}" width="24" height="20" rx="5" fill="#B98448"/><rect x="${x}" y="${y}" width="24" height="20" rx="5" fill="url(#toy-g-maple)"/><rect x="${x+2}" y="${y+2}" width="20" height="5" rx="2.5" fill="#FFF6E2" opacity=".6"/>`; }
  return `<svg width="140" height="110" viewBox="0 0 140 110" aria-hidden="true">${sh}<g transform="rotate(-3 70 55)"><rect x="18" y="8" width="104" height="92" rx="14" fill="#B5A688"/><rect x="18" y="5" width="104" height="92" rx="14" fill="#F4ECDC"/><rect x="23" y="10" width="94" height="82" rx="10" fill="none" stroke="#B89B6E" stroke-width="1.6" stroke-dasharray="5 4" opacity=".8"/>${keys}</g></svg><span class="toy-chip">Type it instead</span>`;
}
const PB = {
  base:null, cur:null, t:null,
  el(){ return $('#bixDrill'); },
  // One bubble for the whole practice screen: fixed width and place, a reserved two-line height and ALWAYS the speaker mark.
  // Only the words change (a soft fade); the bubble itself never pops, grows or moves.
  mount(){ const el=this.el(); if (el.querySelector('.tp-bubble')) return; el.innerHTML='<div class="tp-bubble toy-bubble toy-bubble--left on"><span class="tp-btxt"></span><span class="tp-say">'+TOY.icon('speaker',30,'currentColor')+'</span></div><span class="tp-bixfig"></span>';
    el.addEventListener('click', ()=>this.replay()); },
  // Tap Bix or his bubble: hear the line again (the recorded line when there is one, else the device voice reads the caption).
  replay(){
    const c=this.cur; if (!c || !c.text || (mode==='listen' && locked) || App.quietNow()) return;
    const vid=c.vid || (this.base && this.base.text===c.text && this.base.vid);
    Speaker.unlock();
    if (vid && window.BIX_LINES && window.BIX_LINES[vid]) Fun.BixVoice.play(vid, this.el());
    else if (Fun.BixVoice.enabled()){ Fun.BixVoice.stop(); Speaker.sayDevice(c.text); }
  },
  draw(mood){ const f=this.el().querySelector('.tp-bixfig'); if (f.dataset.mood!==mood){ f.dataset.mood=mood; f.innerHTML=bixArt(mood, 200); } },
  // set the line Bix comes back to (the instruction for this problem)
  setBase(text, mood, vid){ this.base={text, mood:mood||'happy', vid:vid||null}; this.show(text, mood, vid); },
  // say(text, mood, vid, ms): a reaction; after ms he returns to the base line
  say(text, mood, vid, ms){ this.show(text, mood||'happy', vid); clearTimeout(this.t); if (ms && this.base){ const b=this.base; this.t=setTimeout(()=>{ if (this.base===b) this.show(b.text, b.mood, null); }, ms); } },
  show(text, mood, vid){
    this.mount(); this.draw(mood||'happy'); this.cur={text, vid:vid||null};
    const b=this.el().querySelector('.tp-bubble'); b.classList.toggle('on', !!text); b.classList.toggle('empty', !text);
    const tx=b.querySelector('.tp-btxt'); if (tx.textContent!==(text||'')){ tx.textContent=text||''; this.fit(); tx.classList.remove('tp-fresh'); void tx.offsetWidth; tx.classList.add('tp-fresh'); }
    if (vid) Fun.BixVoice.play(vid, this.el());
  },
  // The bubble keeps a fixed two-line height (nothing below it jumps); a longer line gets slightly smaller letters.
  fit(){
    const tx=this.el().querySelector('.tp-btxt'); if (!tx) return; tx.style.fontSize='';
    const lines=()=>tx.scrollHeight/(parseFloat(getComputedStyle(tx).lineHeight)||25);
    let fs=parseFloat(getComputedStyle(tx).fontSize)||20;
    while (tx.scrollHeight && lines()>2.15 && fs>15){ fs-=1; tx.style.fontSize=fs+'px'; }
  },
};
PB.mount();   // mounted up front, so the first problem's tiles are sized with the bubble already in place

/* ---- the answer tool: keypad (the toy kit's wooden keys on felt, same key order as before) or on-screen soroban (AbacusInput) ---- */
const Keys = TOY.keypad($('#padKeys'), { order:'calc',
  onKey: k=>{ if (locked||demoing) return; Sfx.tap(); if (Tool.kind==='keys' && entry.length<6) setEntry(entry+k); },
  onBackspace: ()=>{ if (locked||demoing) return; Sfx.tap(); if (Tool.kind==='keys') setEntry(entry.slice(0,-1)); },
});
const Tool = {
  kind:'keys', ab:null, rods:0, sayT:null,
  // A child with a physical abacus types answers (beads one tap away); without one, the on-screen soroban is the default.
  preferred(){ const c=Fun.data.answerTool; if (c==='beads'||c==='keys') return c; return settings.hasAbacus===false ? 'beads' : 'keys'; },
  setRods:0,
  // Rods for one problem: enough for its answer (multiplication) or its biggest running total (up to 5 digits and more).
  rodsFor(p){ let run=0, mx=Math.abs(p.answer||0); if (p.op!=='mul') p.terms.forEach(t=>{ run+=t; mx=Math.max(mx, Math.abs(run)); }); return Math.max(3, String(mx).length); },
  // The whole set uses one abacus size, so the frame never jumps between problems.
  rodsForSet(){ return Math.max(this.setRods||0, problems[idx] ? this.rodsFor(problems[idx]) : 3); },
  ensureAb(rods){
    if (this.ab && this.rods===rods) return this.ab;
    if (this.ab) this.ab.destroy();
    this.rods=rods;
    this.ab = AbacusInput.create($('#abHost'), { rods, showReadout:false, scale:1.3,
      onBead:()=>Sfx.tap(), onChange:(v)=>this.changed(v) });
    return this.ab;
  },
  apply(){
    const beads=this.kind==='beads';
    $('#answerTool').classList.toggle('beads', beads); $('#answerTool').classList.toggle('keys', !beads);
    $('#readoutLabel').textContent = beads ? 'beads show' : '';
    const sw=$('#toolSwitch'), to=beads?'keys':'beads'; if (sw.dataset.to!==to){ sw.dataset.to=to; sw.innerHTML=switchArt(to); }
    if (beads && problems[idx]) this.ensureAb(this.rodsForSet());
    this.readout();
  },
  switchTo(kind){ this.kind=kind; Fun.data.answerTool=kind; Fun.save(); this.apply(); if (kind==='beads'){ this.ab.clear({animate:false}); this.readout(); PB.setBase(baseLine(), baseMood()); } else setEntry(''); markTiles(); },
  reset(){ verdict(null); setEntry(''); if (this.kind==='beads' && problems[idx]){ this.ensureAb(this.rodsForSet()).clear({animate:false}); } this.readout(); },
  // Listen / Flash: the keypad, the beads and Check wait (dimmed) until the numbers are done and Bix asks "Your answer?".
  setReady(on){ $('#answerTool').classList.toggle('waiting', !on); Keys.setEnabled(on); $('#checkBtn').disabled=!on; },
  value(){ return this.kind==='beads' ? (this.ab ? this.ab.value() : 0) : (entry==='' ? null : parseInt(entry,10)); },
  readout(){ if (this.kind==='beads'){ $('#answer').textContent = this.ab ? this.ab.value() : 0; } else $('#answer').textContent = entry || '?'; $('#readout').classList.toggle('empty', this.kind!=='beads' && !entry); $('#readout').dataset.len=$('#answer').textContent.length; },
  changed(v){
    this.readout(); markTiles();
    if (LT || demoing) return;
    clearTimeout(this.sayT); this.sayT=setTimeout(()=>{ if ($('#drill').classList.contains('active') && !locked && this.ab.moves().length) PB.say(`Your beads show ${this.ab.value()}. Tap Check!`, 'happy'); }, 900);
  },
};
$('#toolSwitch').addEventListener('click', ()=>{ Sfx.tap(); Tool.switchTo(Tool.kind==='beads' ? 'keys' : 'beads'); });

// Split the bead moves into one run per number: a run ends when the beads first show the running total.
function segmentMoves(terms, moves){
  const segs=[]; let start=0, run=0;
  for (let i=0;i<terms.length;i++){
    const target=run+terms[i]; let j=start;
    while (j<moves.length && moves[j].value!==target) j++;
    if (j>=moves.length) break;
    segs.push({from:run, term:terms[i], moves:moves.slice(start, j+1)}); run=target; start=j+1;
  }
  return segs;
}
// Gentle method feedback for a RIGHT answer made on the on-screen beads. Never turns a right answer wrong.
const RULE_RANK={direct:0, five:1, ten:2, combined:3};
function methodFeedback(p){
  if (Tool.kind!=='beads' || !Tool.ab || p.op==='mul') return null;
  const segs=segmentMoves(p.terms, Tool.ab.moves());
  if (segs.length<p.terms.length) return null;            // worked some of it in the head: nothing to say about the beads
  const res=segs.map(s=>AbacusInput.checkMethod(s.from, s.term, s.moves));
  const bad=res.find(r=>!r.ok);
  if (bad) return { ok:false, text:`Yes, ${p.answer}! ${bad.hint.replace(/ \(.*\)/, '')}` };   // the short form fits Bix's two-line bubble
  const best=res.slice().sort((a,b)=>Math.max(-1,...b.expected.rules.map(r=>RULE_RANK[r]))-Math.max(-1,...a.expected.rules.map(r=>RULE_RANK[r])))[0];
  const usedFriend=best && best.expected.rules.some(r=>r!=='direct');
  return { ok:true, text: usedFriend ? best.hint : null };
}

/* ---- problem tiles, bead rod, time beads ---- */
// The sum as written on the sheet: one number per line, its sign on the left (the first number has none).
function termHtml(i, sign, cls, n){ return `<div class="tp-term term${i===0?' first':''}" data-i="${i}"><span class="op ${cls}">${sign}</span><span class="num">${n}</span></div>`; }
function tileHtml(p){
  if (p.op==='mul') return termHtml(0, '', '', p.terms[0]) + termHtml(1, '×', 'times', p.terms[1]);
  return p.terms.map((t,i)=> i===0 ? termHtml(0, '', '', Math.abs(t)) : termHtml(i, t<0?'−':'+', t<0?'minus':'plus', Math.abs(t))).join('');
}
// Look + beads: the number being worked on is outlined; numbers already on the beads are ticked.
function markTiles(){
  const area=$('#problemArea'); const tiles=[...area.querySelectorAll('.term')]; if (!tiles.length) return;
  const p=problems[idx]; let reached=-1;
  if (Tool.kind==='beads' && Tool.ab && !LT && p && p.op!=='mul') reached=segmentMoves(p.terms, Tool.ab.moves()).length-1;
  const on = Tool.kind==='beads' && !LT && p && p.op!=='mul';
  const all=reached>=tiles.length-1;   // every number is on the beads: show the whole problem again for checking
  tiles.forEach((t,i)=>{ t.classList.toggle('done', on && !all && i<=reached); t.classList.toggle('now', on && i===reached+1); });
}
// Long rows (up to 10 numbers, up to 4 digits): always ONE column, read top to bottom; the tiles shrink to fit the height
// that is left under Bix's bubble (and above "Show me"), at every iPad size, so nothing ever scrolls.
// The room for the lines is what the sheet has left beside the rule and the answer box.
function tileRoom(area){
  const sheet=area.parentElement, cs=getComputedStyle(sheet);
  const gap=parseFloat(cs.rowGap)||0; let used=0, n=0;
  for (const ch of sheet.children){ if (ch===area || !ch.getClientRects().length) continue; used+=ch.offsetHeight; n++; }
  return sheet.clientHeight - (parseFloat(cs.paddingTop)||0) - (parseFloat(cs.paddingBottom)||0) - used - gap*n;
}
function fitTiles(){
  const area=$('#problemArea'); const tiles=[...area.querySelectorAll('.term')]; area.style.removeProperty('--th'); area.style.removeProperty('--tf');
  if (!tiles.length || area.style.display==='none' || !$('#drill').classList.contains('active')) return;
  const n=tiles.length, avail=tileRoom(area);
  const max=parseFloat(getComputedStyle(tiles[0]).height)||98, maxF=parseFloat(getComputedStyle(tiles[0]).fontSize)||84;
  const h=Math.max(36, Math.min(max, Math.floor(avail/n)));
  let f=maxF;
  if (h<max){ area.style.setProperty('--th', h+'px'); f=Math.min(maxF, Math.round(h*0.84)); area.style.setProperty('--tf', f+'px'); }
  // the digits stay as big as the line allows, smaller only if a long number would not fit the sheet's width
  while (f>20 && tiles.some(t=>t.scrollWidth>t.clientWidth+1)){ f-=2; area.style.setProperty('--tf', f+'px'); }
}
window.addEventListener('resize', ()=>{ if ($('#drill').classList.contains('active')){ fitTiles(); PB.fit(); } });
// Refit whenever the room changes (bubble mounted, "Show me" appears, fonts arrive, rotation).
if (window.ResizeObserver){ let q=0; const ro=new ResizeObserver(()=>{ if (q) return; q=requestAnimationFrame(()=>{ q=0; if ($('#drill').classList.contains('active') && mode==='visual') fitTiles(); }); }); ro.observe($('#sheet')); ro.observe($('#drill .tp-body')); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if ($('#drill').classList.contains('active')) fitTiles(); });
// The set as beads on a brass rod: finished ones have slid to the left (teal = right, red = one to fix),
// the one she is on glows in the middle, the rest wait on the right.
function renderStrip(popIdx){
  const st=$('#strip'); const fixing=reviewing && !LT; $('#fixLabel').hidden=!fixing; st.classList.toggle('fixing', fixing);
  const list = fixing ? reviewQueue : problems.map((_,i)=>i);
  const room=(st.clientWidth || 520)-24, h=Math.max(18, Math.min(st.clientHeight>80 ? 60 : 50, Math.floor(room*0.8/list.length/0.74)));
  st.innerHTML = list.map((i,k)=>{
    const p=problems[i], cur=i===idx, ok=results[i]===true||p._fixed, bad=results[i]===false&&!p._fixed;
    let svg, label=`Problem ${k+1}`;
    if (cur && !LT && (ok||bad)){ svg=rodBead(ok?'teal':'red', Math.round(h*1.16)); label+= ok?', right':', to fix'; }   // the verdict shows at once, on the bead she is on
    else if (cur){ svg=rodBead('mustard', Math.round(h*1.16)); label+=', now'; }
    else if (LT) svg=rodBead('indigo', h, results[i]===null||results[i]===undefined), label+= results[i]!=null?', done':'';
    else if (ok){ svg=rodBead('teal', h); label+=', right'; }
    else if (bad){ svg=rodBead('red', h); label+=', to fix'; }
    else svg=rodBead('red', h, true);
    const fx = i===popIdx ? (bad && !LT ? ' tp-wob' : ' tp-pop') : '';
    return `<span role="listitem" aria-label="${label}" class="tp-b${cur?' cur':''}${ok?' ok':''}${bad?' bad':''}${fx}">${svg}</span>`;
  }).join('');
}

/* ---- starting, stages ---- */
// The node's own drill is the default; a grown-up's own choice (a setting changed from its default) wins.
function drillConfig(n){
  const c=Object.assign({}, n.drill); if (c.op==='mul') return c;
  if (settings.operands>0){ c.operands=settings.operands; delete c.operandsMax; }
  if (mode==='flash'){ c.allowSubtraction=false;
    if (!n.drill.flash || settings.flashN!==DEFAULTS.flashN){ c.operands=settings.flashN; delete c.operandsMax; } }
  return c;
}
function flashSeconds(){ const d=drillNode && drillNode.drill; return (d && d.flashSec && settings.flashSec===DEFAULTS.flashSec) ? d.flashSec : settings.flashSec; }
function beginSet(){
  results = problems.map(()=>null); idx=0; t0=Date.now();
  Tool.setRods = Math.max(3, ...problems.map(p=>Tool.rodsFor(p)));
  Tool.kind = Tool.preferred(); Tool.apply();
  setStages(); show('drill');
}
async function startDrill(m, n){
  mode=m; drillNode=n; reviewing=false; locked=false; listenArmed=false; Speaker.turn=0; Speaker.unlock(); stopTest(); LT=null;
  try { problems = E.generateSet2(drillConfig(n), settings.count); } catch(e){ TOY.confirm('No problems to make', 'The grown-up settings for numbers and speed can’t make problems for this skill. Change them in Grown-ups → Practice.', {ok:'OK', cancel:'Close'}); return; }
  beginSet();
  presentProblem();                       // start speaking while we are still inside the tap
  if (mode==='listen') PB.say('Listen carefully!', 'happy', 'drill_listen', 2600);   // spoken before Ready; numbers stop Bix
  else PB.say(mode==='flash'?'Watch the numbers carefully!':'You can do it!', 'happy', mode==='flash' ? 'drill_flash' : 'drill_look', 2200);
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
// Show only the stage for the current mode (Look: number tiles; Listen: the listening card; Flash: the flash card). Used by drills, the fix pass and level tests.
function setStages(){
  $('#problemArea').innerHTML='';
  $('#problemArea').style.display = mode==='visual'?'':'none';
  $('#listenStage').style.display = mode==='listen'?'':'none';
  $('#flashStage').style.display = mode==='flash'?'':'none';
  $('#drill').dataset.mode = mode; $('#drill').classList.toggle('lt', !!LT);
  const speed = (mode==='listen'||mode==='flash') && !LT;
  $('#speedBtn').hidden=!speed; $('#speedPop').hidden=true; $('#speedBtn').setAttribute('aria-expanded','false');
  $('#listenSpeed').style.display = mode==='listen'?'flex':'none'; $('#flashSpeed').style.display = mode==='flash'?'flex':'none';
  if (mode==='listen') setupGapSlider(); if (mode==='flash') setupFlashSlider();
}
$('#speedBtn').addEventListener('click', ()=>{ const p=$('#speedPop'); p.hidden=!p.hidden; $('#speedBtn').setAttribute('aria-expanded', String(!p.hidden)); });
function endDrill(){ dictateToken++; demoToken++; demoing=false; Speaker.stop(); stopTest(); if (wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; } }
function stopTest(){ /* the level test keeps a silent, generous time measure only (LT.start); nothing ticks on screen */ }
function setEntry(v){ entry=v; Tool.readout(); }
function baseLine(){
  if (LT) return 'Take your time. Check each one.';
  if (reviewing) return 'This one was tricky. Want me to show you first?';
  if (mode==='listen') return '';
  if (mode==='flash') return '';
  const p=problems[idx];
  if (p && p.op==='mul') return Tool.kind==='beads' ? 'Work it out, then show the answer on the beads.' : 'Work it out, then type the answer.';
  return Tool.kind==='beads' ? 'Move the beads for each number, then tap Check.' : 'Solve it on your abacus, then type the answer.';
}
function baseMood(){ return LT ? 'happy' : 'think'; }   // Bix thinks along while she works
function presentProblem(){
  const p=problems[idx]; $('#feedback').textContent='';
  Tool.apply(); Tool.reset();
  $('#showMeBtn').style.display = reviewing && !LT ? '' : 'none'; $('#drill').classList.toggle('fixing', reviewing && !LT);
  renderStrip();
  const long = mode==='visual' && p.terms.length>4;
  $('#drill').classList.toggle('long', long);
  if (mode==='visual'){ const area=$('#problemArea'); area.innerHTML=tileHtml(p); const dg=Math.max(...p.terms.map(t=>String(Math.abs(t)).length)); area.classList.toggle('many', long); area.classList.toggle('wide', dg>=3); area.classList.toggle('xwide', dg>=4); markTiles(); locked=false; Tool.setReady(true); }
  PB.setBase(baseLine(), baseMood());
  if (mode==='visual') fitTiles();   // after the bubble and "Show me" are in place
  if (mode==='listen'){ if (!listenArmed) armListen(p); else dictate(p); }
  else if (mode==='flash') armFlash(p);
}
let dictateToken=0, listenArmed=false;
function armListen(p){ // show a "Ready" button; the tap that presses it starts the audio inside a user gesture (iOS needs this)
  locked=true; Tool.setReady(false); $('#replayBtn').disabled=true; $('#listenMsg').textContent='Tap when you are ready';
  const b=$('#listenGo'); b.style.display=''; b.onclick=()=>{ b.style.display='none'; listenArmed=true; Speaker.unlock(); dictate(p); };
}
async function dictate(p){
  Fun.BixVoice.stop();
  const my=++dictateToken; locked=true; Tool.setReady(false); $('#replayBtn').disabled=true; $('#listenGo').style.display='none';
  if (!p._reader){ await Speaker.prepare(); p._reader = Speaker.pickReader(); } else Speaker.activePid = p._reader;   // replay keeps the same reader
  if (my!==dictateToken) return;
  $('#listenMsg').textContent = p._reader ? `${profileName(p._reader)} is reading…` : 'Listen…';
  $('#listenStage').classList.add('reading');
  const gap=settings.gap; const pulse=(ms)=>{ $('#ear').classList.add('pulse'); setTimeout(()=>$('#ear').classList.remove('pulse'),ms); };
  const finishUI=()=>{ if (my!==dictateToken) return; $('#listenMsg').textContent='Your answer?'; $('#listenStage').classList.remove('reading'); locked=false; Tool.setReady(true); $('#replayBtn').disabled=p._replayed===true; };
  const watchdog=setTimeout(()=>{ if (my===dictateToken && locked){ Diag.add('watchdog: dictation did not finish; unlocking'); $('#listenMsg').textContent='Sound problem — tap "say it again"'; $('#listenStage').classList.remove('reading'); locked=false; Tool.setReady(true); $('#replayBtn').disabled=false; } }, (p.terms.length*gap+12)*1000);
  try{
    Speaker.stop();
    Diag.add(`dictate start voice=${settings.voice} kind=${Speaker.kind()} ctx=${Speaker.ctx?Speaker.ctx.state:'none'} tts=${('speechSynthesis' in window)?('voices '+speechSynthesis.getVoices().length+(speechSynthesis.speaking?' speaking':'')+(speechSynthesis.paused?' paused':'')):'n/a'}`);
    let scheduled=false;
    if (Speaker.kind()!=='device'){
      await Speaker.prepare(); if (my!==dictateToken) return;
      try{ if (Speaker.ctx && Speaker.ctx.state!=='running') await Promise.race([Speaker.ctx.resume(), sleep(1500)]); }catch(e){}
      scheduled = p.op!=='mul' && Speaker.canSchedule() && Speaker.ctx && Speaker.ctx.state==='running';   // clips have no "times": mul problems use the device voice
      Diag.add(`clips ready=${Speaker.canSchedule()} ctx=${Speaker.ctx?Speaker.ctx.state:'none'} -> ${scheduled?'audio clock':'device voice fallback'}`);
    }
    if (scheduled){
      // Each number starts `gap` seconds after the previous one started, but never before the
      // previous one has finished speaking (+ a short breath). No overlap at any speed.
      const MIN_PAUSE = 0.25;
      let prevStart=null, prevEnd=Speaker.ctx.currentTime+0.3, lastEnd=prevEnd; const sched=[];
      p.terms.forEach((d,i)=>{
        const when = i===0 ? prevEnd : Math.max(prevStart+gap, prevEnd+MIN_PAUSE);
        const end = Speaker.scheduleTerm(d, i===0, when);
        sched.push([when,end]); prevStart=when; prevEnd=end; lastEnd=end;
        setTimeout(()=>{ if(my===dictateToken) pulse((end-when)*1000); }, Math.max(0,(when-Speaker.ctx.currentTime)*1000));
      });
      Diag.add('schedule: '+sched.map(([w,e])=>`${(w-sched[0][0]).toFixed(2)}–${(e-sched[0][0]).toFixed(2)}`).join(', '));
      await sleep(Math.max(0,(lastEnd-Speaker.ctx.currentTime)*1000));
    } else {
      const words=i=>p.op==='mul' ? (i===0 ? termText(p.terms[0],true) : 'times '+termText(p.terms[i],true)) : termText(p.terms[i],i===0);
      for (let i=0;i<p.terms.length;i++){ if(my!==dictateToken) return; const started=Date.now(); pulse(800); const r=await Speaker.sayDevice(words(i)); Diag.add(`said "${words(i)}" ${r}`); const spent=(Date.now()-started)/1000; if(i<p.terms.length-1) await sleep(Math.max(150,(gap-spent)*1000)); }
    }
    if (my!==dictateToken) return; await sleep(settings.answerPause*1000);
    finishUI();
  }catch(e){ Diag.add('dictate error '+(e&&e.message||e)); finishUI(); }
  finally{ clearTimeout(watchdog); }
}
$('#replayBtn').addEventListener('click', ()=>{ const p=problems[idx]; if(p._replayed) return; p._replayed=true; dictate(p); });
function setupGapSlider(){ const s=$('#gapSlider'); s.min=settings.gapMin; s.max=settings.gapMax; s.value=settings.gap; s.style.direction='rtl'; $('#gapVal').textContent=settings.gap+'s'; s.oninput=()=>{ settings.gap=parseFloat(s.value); $('#gapVal').textContent=settings.gap+'s'; saveSettings(); }; }
function setupFlashSlider(){ const s=$('#flashSlider'); s.value=settings.flashSec; s.style.direction='rtl'; $('#flashVal').textContent=settings.flashSec.toFixed(1)+'s'; s.oninput=()=>{ settings.flashSec=parseFloat(s.value); $('#flashVal').textContent=settings.flashSec.toFixed(1)+'s'; saveSettings(); }; }
// Flash: she taps Ready (after clearing her abacus), numbers pop up one at a time with their + / − sign, then she answers.
function flashDots(n, on){ const w=n>8?22:30; $('#flashDots').innerHTML = Array.from({length:n},(_,i)=>TOY.bead('teal', w, {dim:i>=on, shadow:false})).join(''); }
function flashLen(el, t){ el.style.setProperty('--len', Math.max(2, String(Math.abs(t)).length+1)); }
function flashSign(t, i, p){ if (p && p.op==='mul') return i===0 ? String(t) : `<b class="times">×</b>${t}`; return (i===0 ? (t<0?'<b class="minus">−</b>':'') : `<b class="${t<0?'minus':'plus'}">${t<0?'−':'+'}</b>`) + Math.abs(t); }
function armFlash(p){
  ++dictateToken; locked=true; Tool.setReady(false); const el=$('#flashNum'); el.className='flash-num hint'; el.innerHTML=TOY.icon('flash', 72);
  flashDots(p.terms.length, 0); $('#flashAgain').style.display='none';
  $('#flashMsg').textContent = idx===0 && !reviewing ? 'Clear your abacus. Numbers pop up one at a time.' : 'Clear your abacus, then tap Ready.';
  const b=$('#flashGo'); b.style.display=''; b.onclick=()=>{ b.style.display='none'; Speaker.unlock(); flash(p); };
}
async function flash(p){
  const my=++dictateToken; locked=true; Tool.setReady(false); const el=$('#flashNum'); el.textContent=''; el.className='flash-num';
  $('#flashMsg').textContent='Watch…'; $('#flashGo').style.display='none'; $('#flashAgain').style.display='none'; flashDots(p.terms.length, 0); await sleep(600);
  for (let i=0;i<p.terms.length;i++){ if(my!==dictateToken) return; const t=p.terms[i]; el.className='flash-num pop'+(t<0?' neg':''); flashLen(el, t); el.innerHTML=flashSign(t,i,p); flashDots(p.terms.length, i+1); await sleep(flashSeconds()*1000); el.textContent=''; el.className='flash-num'; await sleep(180); }
  if(my!==dictateToken) return; el.className='flash-num ask'; el.textContent='= ?';
  $('#flashMsg').textContent = Tool.kind==='beads' ? 'What did you get? Show it on the beads.' : 'What did you get? Tap it in.'; $('#flashAgain').style.display = LT ? 'none' : ''; locked=false; Tool.setReady(true);
}
$('#flashAgain').addEventListener('click', ()=>{ if (mode==='flash' && problems[idx]) flash(problems[idx]); });
$('#checkBtn').addEventListener('click', ()=>{ if(locked||demoing) return; submit(); });
document.addEventListener('keydown', e=>{ if(!$('#drill').classList.contains('active')||locked||demoing) return; if (e.target && e.target.closest && e.target.closest('.abx-rod')) return; if(/^[0-9]$/.test(e.key)&&entry.length<6&&Tool.kind==='keys') setEntry(entry+e.key); else if(e.key==='Backspace'&&Tool.kind==='keys') setEntry(entry.slice(0,-1)); else if(e.key==='Enter') submit(); });
function shake(){ const t=Tool.kind==='beads' ? $('#abHost') : $('#readout'); t.classList.remove('tp-nudge'); void t.offsetWidth; t.classList.add('tp-nudge'); setTimeout(()=>t.classList.remove('tp-nudge'),460); }
// Right / wrong shows instantly where she is looking: the answer box turns teal (a small pop) or gets a red rim (a gentle shake),
// and her bead on the rod turns teal or red. Cleared when the next problem comes. Never used in the level test.
function verdict(v){ const r=$('#readout'); r.classList.remove('is-right','is-wrong'); if (!v) return; void r.offsetWidth; r.classList.add(v==='right'?'is-right':'is-wrong'); }
async function submit(){
  const val=Tool.value(); const p=problems[idx];
  if (val===null){ shake(); return; }
  if (Tool.kind==='beads' && !Tool.ab.moves().length && val===0){ PB.say('Move the beads first, then tap Check.', 'think', null, 2200); shake(); return; }
  locked=true; const fb=$('#feedback');
  if (LT){   // level test: no right/wrong on the screen, just on to the next one
    LT.answers[idx]={value:val, atMs:Date.now()-LT.start}; results[idx]=val===p.answer; Sfx.pop(); fb.textContent='Got it.';
    await sleep(350); return next();
  }
  const ok=val===p.answer;
  if (ok){
    fb.textContent='Yes!'; Sfx.ok();
    const mf=methodFeedback(p); if (mf) p._method=mf.ok;
    if (mf && mf.text) PB.say(mf.text, mf.ok?'cheer':'happy', null, mf.ok?1800:3600);
    else { const k=Math.floor(Math.random()*6); PB.say(['Yes!','Nice!','You got it!','Fantastic!','Super!','Wow!'][k], 'cheer', (Math.random()<0.35 && !settings.speakFeedback && mode!=='listen') ? 'yes_'+(k+1) : null, 1400); }
    verdict('right');
    if(!reviewing){ results[idx]=true; record(p,true); renderStrip(idx); } else { p._fixed=true; fb.textContent='Fixed!'; renderStrip(idx); }
    if(settings.speakFeedback) Speaker.say(null,'yes');
    await sleep(mf && mf.text && !mf.ok ? 2600 : 650);
  }
  else {
    fb.textContent='Not quite'; Sfx.bad(); verdict('wrong'); if (Tool.kind==='beads') shake();
    if (!reviewing) { const k=Math.floor(Math.random()*3); PB.say(['Oops! We\'ll fix it later.','Almost! Keep going.','That\'s OK. Next one!'][k], 'concerned', (!settings.speakFeedback && mode!=='listen') ? 'oops_'+(k+1) : null, 1800); }
    if(settings.speakFeedback) Speaker.say(null,'not quite');
    if(!reviewing){ results[idx]=false; p._given=String(val); record(p,false); renderStrip(idx); await sleep(900); }
    else {
      // In the fix pass a wrong answer is a teaching moment: watch the bead moves, then try the same problem again.
      const cb=$('#strip .tp-b.cur'); if (cb){ cb.innerHTML=rodBead('red', cb.querySelector('svg').getAttribute('height')|0); cb.classList.add('bad'); cb.classList.remove('tp-wob'); void cb.offsetWidth; cb.classList.add('tp-wob'); }
      PB.say('Let\'s watch the beads together.', 'happy', 'fix_watch', 0);
      await sleep(900); await showMe(p);
      if (!$('#drill').classList.contains('active')) return;
      presentProblem(); return;
    }
  }
  next();
}
function record(p, ok){ const st=node(drillNode.id); st.hist.push({ok, day:todayKey()}); st.hist=st.hist.slice(-40); }
function next(){
  if(reviewing){ const nxt=reviewQueue.find(i=>!problems[i]._fixed); if (nxt!==undefined){ idx=nxt; presentProblem(); } else finish(); return; } if(idx<problems.length-1){ idx++; presentProblem(); } else finish(); }
function checkMastery(nid){
  const st=node(nid); if (st.mastered) return false; const h=st.hist.slice(-20); if (h.length<20) return false;
  const acc=h.filter(x=>x.ok).length/h.length; const daysN=new Set(h.map(x=>x.day)).size;
  if (acc>=0.8 && daysN>=2){ st.mastered='auto'; if (NODE_IDX[nid]===curIdx() && curIdx()<NODES.length-1) progress.current=NODES[curIdx()+1].id; return true; }
  return false;
}

/* ---- end of set ---- */
// The wooden bowl the earned beads drop into: a back (rim + hollow) and a front lip, with the beads between them.
const BOWL_BACK = '<svg class="tp-bowlback" viewBox="0 0 400 264" aria-hidden="true"><ellipse cx="226" cy="238" rx="176" ry="24" fill="url(#toy-g-shadow)" opacity=".75"/><ellipse cx="204" cy="240" rx="128" ry="17" fill="url(#toy-g-shadow)"/>'
  + '<ellipse cx="200" cy="104" rx="190" ry="52" fill="#B98448"/><ellipse cx="200" cy="110" rx="172" ry="42" fill="#8E5E2C"/><ellipse cx="200" cy="118" rx="150" ry="30" fill="#7A4E22" opacity=".7"/></svg>';
const BOWL_FRONT = '<svg class="tp-bowlfront" viewBox="0 0 400 264" aria-hidden="true"><path d="M10,104 A190,52 0 0 0 390,104 Q384,236 200,244 Q16,236 10,104Z" fill="url(#toy-g-maple-side)"/>'
  + '<path d="M10,104 A190,52 0 0 0 390,104 Q384,228 200,236 Q16,228 10,104Z" fill="url(#toy-g-maple)"/><path d="M200,236 Q384,228 390,104 A190,52 0 0 1 300,146 Q300,214 200,236Z" fill="#8A5A2A" opacity=".2"/>'
  + '<path d="M10,104 A190,52 0 0 0 390,104 A190,60 0 0 1 10,104Z" fill="#E7BE86"/><path d="M16,100 A190,52 0 0 1 200,54" fill="none" stroke="#FFF0CF" stroke-width="5" stroke-linecap="round" opacity=".8"/>'
  + '<path d="M40,150 Q60,214 150,228" fill="none" stroke="#FFF3D6" stroke-width="6" stroke-linecap="round" opacity=".35"/></svg>';
// Where bead i lands: rows from the bottom of the heap up, a little turn each (percent of the bowl box).
function bowlSlot(i, total){
  const per = total<=14 ? [5,4,3,2] : total<=25 ? [7,6,5,4,3] : [9,8,7,6,5,4,3,3,3,3], bs = total<=14 ? .19 : total<=25 ? .145 : .112;
  let row=0, k=i; while (row<per.length-1 && k>=per[row]){ k-=per[row]; row++; }
  const m=per[row], x=50+(k%m-(m-1)/2)*bs*84+((i*37)%7-3)*.5, y=44-row*bs*47-Math.floor(k/m)*bs*40;
  return `left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;--r:${(i*53)%41-20}deg;--r0:${(i*71)%121-60}deg;--dx:${(i*29)%61-30}px;animation-delay:${(0.25+i*0.11).toFixed(2)}s`;
}
// Beads earned drop into the bowl (teal = right, then the golden ones); the red ones to fix wait on the felt mat beside it.
// list: 'jade' (right) | 'red' (to fix) | 'pale' (not yet)
function sumBeads(list, gold){
  gold=gold||0; const inBowl=list.filter(c=>c==='jade').length, total=inBowl+gold, bs = total<=14 ? .19 : total<=25 ? .145 : .112;
  const box=$('#sumStars'); box.style.setProperty('--bs', bs); let k=0, html=BOWL_BACK;
  list.forEach((c,i)=>{ if (c==='jade') html+=`<span role="listitem" aria-label="${i+1}: green" class="tp-b in" style="${bowlSlot(k++, total)}">${TOY.bead('teal', 80, {shadow:false})}</span>`; });
  for (let g=0; g<gold; g++) html+=`<span aria-hidden="true" class="tp-b tp-gold in" style="${bowlSlot(k++, total)}">${TOY.bead('mustard', 80, {shadow:false})}</span>`;
  box.innerHTML=html+BOWL_FRONT;
  const out=list.map((c,i)=>[c,i]).filter(x=>x[0]!=='jade'), w=out.length>8 ? 44 : 60;
  $('#sumFix').innerHTML=out.map(([c,i])=>`<span role="listitem" aria-label="${i+1}: ${c==='red'?'red, to fix':'not yet'}" class="tp-b out">${TOY.bead('red', w, {dim:c!=='red'})}</span>`).join('');
}
function sumBix(mood){ const el=$('#bixSum'); el.innerHTML=bixArt(mood, 210); return el; }
// Today's steps as the moon sees them: how many were done before this activity, and after it.
function todayMoon(kind){
  const t=Fun.data.today; if (!t || t.day!==todayKey() || !Array.isArray(t.steps) || !t.steps.length) return null;
  const total=t.steps.length, before=t.steps.filter(x=>x.done).length, a=t.active;
  const gain = kind && ((a && a.kind===kind && t.steps[a.at] && !t.steps[a.at].done) || t.steps.some(x=>!x.done && x.kind===kind)) ? 1 : 0;
  return { total, before, after:before+gain };
}
// The moon in the window gains a phase for the step just finished (she never shrinks); the same shows as phase moons on a plaque.
function drawMoon(sky, plaque, kind){
  const m=todayMoon(kind), name=TOY.moonName;
  if (!m){ sky.innerHTML=TOY.skyMoon('calm', .5); if (plaque) plaque.hidden=true; return; }
  const full=m.after>=m.total, ph=n=>n/m.total;
  sky.innerHTML = m.after>m.before ? TOY.skyMoon('calm', ph(m.before))+TOY.skyMoon(full?'proud':'happy', ph(m.after)) : TOY.skyMoon(full?'proud':m.after?'happy':'calm', ph(m.after));
  if (!plaque) return;
  plaque.hidden=false; plaque.setAttribute('role','img'); plaque.setAttribute('aria-label', `${name}: ${m.after} of ${m.total} today`);
  const svg=(n,cls)=>TOY.moonPhases(n, m.total).replace('class="toy-moonphases"', `class="toy-moonphases ${cls}"`).replace('role="img"', 'aria-hidden="true"');
  plaque.innerHTML=`<span class="tp-moonstack">${svg(m.before,'before')}${m.after>m.before ? svg(m.after,'after') : ''}</span>`;
}
let sumVoice=null;
$('#sumSay').addEventListener('click', ()=>{ if (sumVoice) Fun.BixVoice.play(sumVoice, $('#bixSum')); });
$('#bixSum').addEventListener('click', ()=>{ if (sumVoice) Fun.BixVoice.play(sumVoice, $('#bixSum')); });
function finish(){
  if (LT) return finishLevelTest();
  endDrill(); const correct=results.filter(r=>r===true).length; const secs=Math.round((Date.now()-t0)/1000); let leveled=false;
  if (!reviewing){
    const checked=problems.filter(p=>p._method!==undefined);
    history.unshift({ at:new Date().toISOString(), mode, node:drillNode.id, count:problems.length, correct, secs, gap:mode==='listen'?settings.gap:null,
      op:drillNode.drill&&drillNode.drill.op, tool:Tool.kind, methodChecked:checked.length, methodOk:checked.filter(p=>p._method).length,
      missed: problems.map((p,i)=>results[i]===false?{terms:p.terms,answer:p.answer,given:p._given,rules:p.rulesUsed,op:p.op}:null).filter(Boolean) });
    history=history.slice(0,200); save('history',history); days[todayKey()]=true; save('days',days);
    leveled = checkMastery(drillNode.id); saveProgress();
    if (leveled && C.levelTest && (()=>{ try{ return !!C.levelTest(drillNode.id); }catch(e){ return false; } })()) pendingTest=drillNode.id;
  }
  const pct=correct/problems.length; const n= pct>=0.9?3:pct>=0.7?2:1;
  const green=problems.filter((p,i)=>results[i]===true||p._fixed).length;
  const toFix=problems.map((p,i)=>results[i]===false&&!p._fixed?i:-1).filter(i=>i>=0);
  const allFixed = reviewing && !toFix.length;
  $('#sumScore').textContent = green ? `${green} green bead${green===1?'':'s'}!` : 'Good practice!';
  const vid = allFixed ? 'sum_fixed' : leveled ? 'sum_unlock' : n===3 ? 'sum_amazing' : n===2 ? 'sum_great' : 'sum_good';
  const say = { sum_fixed:'All fixed! You fixed every one. You’re a star!', sum_unlock:`Hooray! You unlocked a new skill: ${NODES[curIdx()].title}!`, sum_amazing:'Amazing work!',
    sum_great:'Great job! Want to fix the red ones with me?', sum_good:'Good practice! Every try makes you stronger.' }[vid];
  const fixLine = toFix.length && vid!=='sum_great' ? ` Let’s turn the ${toFix.length===1?'red one':toFix.length+' red ones'} green together.` : '';
  $('#sumNote').textContent = say + fixLine;
  // Golden beads earned here (handed out by activityDone below) all land in ONE place: the chip at the top right,
  // after the headline has settled (the floating "+n" toasts stay off this screen, see screens-practice.css).
  const gold = !reviewing ? Treats.EARN.activity + (n===3 ? Treats.EARN.gold : 0) + (leveled ? Treats.EARN.skill : 0) : 0;
  sumBeads(problems.map((p,i)=>results[i]===true||p._fixed?'jade':results[i]===false?'red':'pale'), gold);
  drawMoon($('#sumSky'), $('#sumMoons'), reviewing ? null : mode);
  $('#sumGold').hidden = !gold; $('#sumGold').innerHTML = gold ? TOY.bead('mustard', 44, {shadow:false})+`<span>+${gold} golden bead${gold===1?'':'s'}</span>` : '';
  $('#sumNew').hidden = !leveled; $('#sumNew').innerHTML = leveled ? TOY.icon('star', 30, '#C98A16')+'<span>New skill!</span>' : '';
  // one obvious next step: fix the red ones; then the level test; else play again — always beside "I'm done"
  $('#fixBtn').style.display = toFix.length ? '' : 'none';
  $('#testBtn').style.display = pendingTest && !toFix.length ? '' : 'none';
  $('#againBtn').style.display = toFix.length || pendingTest ? 'none' : '';
  $('#againBtn').innerHTML=tpIcon('retry',40)+'<span class="toy-block-label">Play again</span>';
  const mood = (n===3||leveled||allFixed) ? 'proud' : n===2 ? 'cheer' : 'happy';
  sumVoice=vid; $('#sumSay').style.visibility=''; show('summary'); const bs=sumBix(mood); Fun.BixVoice.play(vid, bs);
  if (n===3||leveled||allFixed){ Sfx.star(); if (n===3||leveled) Fun.confetti(); } else Sfx.ok();
  if (!reviewing) setTimeout(()=>activityDone(mode, {gold: n===3, leveled}), 2400);   // let the beads and Bix land first
}
$('#fixBtn').addEventListener('click', ()=>{
  reviewQueue=problems.map((p,i)=>results[i]===false&&!p._fixed?i:-1).filter(i=>i>=0); if(!reviewQueue.length) return;
  Speaker.unlock(); reviewing=true; idx=reviewQueue[0]; t0=Date.now();
  setStages(); show('drill');
  presentProblem();            // same mode as the drill: Listen re-reads the problem, Look shows it, Flash re-flashes it
  PB.say(reviewQueue.length===1 ? 'Let\'s fix this one!' : `Let's fix these ${reviewQueue.length}!`, 'happy', mode==='listen' ? null : (reviewQueue.length===1 ? 'fix_one' : 'fix_start'), 2200);
});
$('#showMeBtn').addEventListener('click', async()=>{ if(locked||demoing) return; locked=true; await showMe(problems[idx]); locked=false; if (Tool.kind==='beads' && $('#drill').classList.contains('active')){ Tool.reset(); markTiles(); PB.setBase('Your turn! Move the beads, then tap Check.', 'happy'); } });
$('#againBtn').addEventListener('click', ()=>startDrill(mode, drillNode));
$('#homeBtn').addEventListener('click', ()=>{ pendingTest=null; renderHome(); show('home'); });
$('#testBtn').addEventListener('click', ()=>{ const id=pendingTest; pendingTest=null; startLevelTest(id); });
$('#exitDrill').addEventListener('click', ()=>{ endDrill(); LT=null; renderHome(); show('home'); });

/* ---- show me: the bead moves for each number, on the Workshop soroban ---- */
let showAb=null, showToken=0, demoToken=0, demoing=false;
function stepHtml(s){ return esc(s.say).replace(/(\d+)/g,'<b>$1</b>'); }
// Animate a solution on an AbacusInput: set the first number, then each bead move from Curriculum.explain.
async function playSolution(ab, p, isLive, onText, onTerm){
  ab.clear({animate:false}); let total=0; onText('Watch.'); await sleep(500);
  const run=async(steps)=>{ for (const s of steps){ if(!isLive()) return; onText(stepHtml(s)); let v=ab.value(); for (const m of s.do){ if(!isLive()) return; v+=m.delta*Math.pow(10,m.rod); ab.setValue(Math.max(0,v)); if (ab===Tool.ab) Tool.readout(); await sleep(420); } await sleep(s.do.length?500:1100); } };
  if (p.op==='mul'){ onTerm(1); await run(C.explainMul ? C.explainMul(p.terms[0], p.terms[1]) : []); if (isLive() && ab.value()!==p.answer){ ab.setValue(p.answer); if (ab===Tool.ab) Tool.readout(); } if (isLive()) onText(`${p.terms[0]} × ${p.terms[1]} = <b>${p.answer}</b>.`); return; }
  for (let i=0;i<p.terms.length;i++){ const d=p.terms[i]; if(!isLive()) return; onTerm(i);
    if (i===0){ onText(`Start with <b>${d}</b>.`); ab.setValue(d); if (ab===Tool.ab) Tool.readout(); total=d; await sleep(900); continue; }
    await run(C.explain(total,d));
    total+=d; }
  if (isLive()) onText(`The answer is <b>${p.answer}</b>.`);
}
async function showMe(p){
  if (Tool.kind==='beads' && Tool.ab && $('#drill').classList.contains('active')) return showMeHere(p);
  $('#showme').classList.add('active');
  const rods=Tool.rodsForSet();
  if (!showAb || showAb.rods()!==rods){ if (showAb) showAb.destroy(); showAb=AbacusInput.create($('#showmeAbacus'), {rods, showReadout:false, scale:1.1, readOnly:true}); }
  $('#showmeBix').innerHTML=bixArt('happy', 96, {still:true});
  const probHtml=(k)=>p.op==='mul' ? `${p.terms[0]} <i>×</i> ${p.terms[1]}` : p.terms.map((t,i)=>`<span class="${i===k?'cur':''}">${i===0?t:(t<0?'<i class="minus">−</i>'+(-t):'<i class="plus">+</i>'+t)}</span>`).join('');
  const run = async()=>{ const my=++showToken; $('#showmeProb').innerHTML=probHtml(-1);
    await playSolution(showAb, p, ()=>my===showToken, h=>{ $('#showmeText').innerHTML=h; }, k=>{ $('#showmeProb').innerHTML=probHtml(k); });
    if (my===showToken) $('#showmeProb').innerHTML=probHtml(-1)+' <i>=</i> '+p.answer; };
  $('#showmeReplay').onclick=run;
  Fun.BixVoice.play('showme', $('#showmeBix'));
  await new Promise(res=>{ $('#showmeClose').onclick=()=>{ showToken++; $('#showme').classList.remove('active'); res(); }; run(); });
}
// With the on-screen beads in use, Bix demonstrates right on her abacus, then hands it back cleared.
async function showMeHere(p){
  const my=++demoToken; demoing=true; $('#answerTool').classList.add('demo');
  const live=()=>my===demoToken && $('#drill').classList.contains('active');
  const tiles=()=>[...$('#problemArea').querySelectorAll('.term')];
  PB.say('Watch the beads move.', 'happy', 'showme', 0);
  await sleep(700);
  await playSolution(Tool.ab, p, live, h=>{ if(live()){ const t=document.createElement('div'); t.innerHTML=h; PB.say(t.textContent, 'happy', null, 0); } }, k=>tiles().forEach((t,i)=>{ t.classList.toggle('now', i===k); t.classList.toggle('done', i<k); }));
  if (live()) await sleep(1400);
  if (my===demoToken){ demoing=false; $('#answerTool').classList.remove('demo'); }
}

/* ---- level test + certificate ---- */
function startLevelTest(nodeId){
  let test=null; try{ test=C.levelTest(nodeId, {timeScale:2}); }catch(e){ Diag.add('level test: '+(e&&e.message||e)); }
  if (!test) return false;
  endDrill(); Speaker.unlock();
  mode = test.kind==='flash' ? 'flash' : 'visual'; drillNode=C.BY_ID[nodeId]; reviewing=false; locked=false; listenArmed=false;
  problems=test.problems; LT={test, answers:[], start:Date.now()};   // timing is silent and generous: nothing counts down on screen
  beginSet();
  presentProblem();
  PB.say('Level test! Take your time.', 'happy', null, 2600);
  return true;
}
function certificates(){ const l=Store.get('certificates', []); return Array.isArray(l) ? l : []; }
function saveCertificate(c){
  const list=certificates().filter(x=>x.nodeId!==c.nodeId || x.accuracy>c.accuracy);
  if (!list.some(x=>x.nodeId===c.nodeId)) list.push(c);
  Store.set('certificates', list);
}
function finishLevelTest(){
  const lt=LT; endDrill(); LT=null;
  const score=C.scoreLevelTest(lt.test, lt.answers, Date.now()-lt.start);
  if (score.passed){
    const cert={ nodeId:lt.test.nodeId, title:lt.test.title, date:todayKey(), accuracy:Math.round(score.accuracy*100)/100 };
    saveCertificate(cert); showCertificate(cert);
    setTimeout(()=>{ if ($('#certificate').classList.contains('active')) activityDone('levelTest', {gold:true}); }, 2600);
    return;
  }
  // Not yet: show the beads she got, and point back to practice. No fix pass, no grade.
  const right=score.perProblem.map(x=>x.answer!==null && x.answer===x.expected);
  const green=right.filter(Boolean).length;
  $('#sumScore').textContent = green ? `${green} green bead${green===1?'':'s'}!` : 'Good try!';
  sumBeads(right.map(r=>r?'jade':'pale')); drawMoon($('#sumSky'), $('#sumMoons'), null);
  $('#sumNote').textContent = score.correctAny/score.total >= score.minAccuracy
    ? 'So many right! Let’s practise a little more to get quicker, then try the test again.'
    : `Almost there! Let’s practise ${lt.test.title} a little more, then try again.`;
  $('#sumGold').hidden=true; $('#sumNew').hidden=true; $('#fixBtn').style.display='none'; $('#testBtn').style.display='none';
  $('#againBtn').style.display=''; $('#againBtn').innerHTML=tpIcon('retry',40)+'<span class="toy-block-label">Practise</span>';   // practises the tested skill
  sumVoice=null; $('#sumSay').style.visibility='hidden'; show('summary'); sumBix('happy'); Sfx.ok();
}
function niceDate(key){ const [y,m,d]=key.split('-').map(Number); return new Date(y, m-1, d).toLocaleDateString(undefined, {year:'numeric', month:'long', day:'numeric'}); }
// A red wax seal with a golden bead pressed into it, on two indigo ribbon tails (the certificate's emblem).
function certSealSvg(size){
  let lobes=''; for (let i=0;i<14;i++){ const a=i/14*Math.PI*2; lobes+=`<circle cx="${(Math.cos(a)*45).toFixed(1)}" cy="${(Math.sin(a)*45).toFixed(1)}" r="10.5"/>`; }
  return `<svg width="${size}" height="${Math.round(size*1.3)}" viewBox="-62 -62 124 161" aria-hidden="true"><path d="M-24,30 L-38,92 L-19,80 L-8,96 L4,34Z" fill="#3F52A8"/><path d="M24,30 L40,90 L20,80 L10,96 L-2,34Z" fill="#28357A"/>`
    + `<ellipse cx="7" cy="12" rx="56" ry="50" fill="url(#toy-g-shadow)" opacity=".6"/><g fill="#B52323">${lobes}</g><circle r="47" fill="url(#toy-lac-red)"/><circle r="36" fill="none" stroke="#8A181D" stroke-width="2.5" opacity=".55"/><circle r="33" fill="none" stroke="#FF9B80" stroke-width="1.5" opacity=".5"/>`
    + TOY.bead('mustard', 58, {shadow:false}).replace('<svg ', '<svg x="-28" y="-16" ') + `<ellipse cx="-20" cy="-27" rx="15" ry="6" transform="rotate(-34 -20 -27)" fill="#fff" opacity=".55"/></svg>`;
}
function showCertificate(c){
  $('#certName').textContent = settings.name || 'Abacus star';
  $('#certSkill').textContent = c.title; $('#certDate').textContent = niceDate(c.date);
  $('#certBix').innerHTML = bixArt('proud', 190);
  $('#certBeads').innerHTML = ['mustard','teal','red','indigo','mustard'].map(k=>TOY.bead(k, 50, {tall:true, shadow:false})).join('');
  $('#certSeal').innerHTML = certSealSvg(92);
  drawMoon($('#certSky'), null, null);
  // In the Home Screen app (iOS standalone) window.print may do nothing, so the button saves a picture instead.
  const pic=standaloneApp(); certShown=c; certPic=pic ? certPicture(c) : null;
  $('#certPrint').innerHTML = tpIcon(pic ? 'share' : 'print', 40)+`<span class="toy-block-label">${pic ? 'Save picture' : 'Print'}</span>`;
  $('#certPrint').setAttribute('aria-label', pic ? 'Save a picture of the certificate' : 'Print the certificate');
  show('certificate'); Sfx.star(); Fun.confetti(110);
  Fun.BixVoice.play('lesson_done', $('#certificate'));
}
let certShown=null, certPic=null;
// Home Screen app or the native App Store wrapper (WKWebView): window.print does nothing there, so save a picture instead.
function standaloneApp(){ try{ return navigator.standalone===true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || !!(window.Capacitor || window.cordova || window.ReactNativeWebView || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bix)); }catch(e){ return false; } }
// A toy-kit drawing as a stand-alone picture: its SVG with the kit's shared gradients copied in.
async function toyImage(svgHtml){
  const d=document.getElementById('toy-defs'), defs=d ? d.innerHTML : '';
  const svg=svgHtml.replace(/^[^<]*<span[^>]*>/, '').replace(/<\/span>\s*$/, '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ').replace(/(<svg[^>]*>)/, '$1'+defs);
  const img=new Image(); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  await new Promise((ok,no)=>{ img.onload=ok; img.onerror=no; setTimeout(no, 1500); });
  return img;
}
// The certificate as a PNG (1600×1130), drawn on a canvas in the same keepsake look: paper on the maple table,
// a double rule, Bix, lacquered beads on a brass rod and the wax seal.
async function certPicture(c){
  const W=1600, H=1130, cv=document.createElement('canvas'); cv.width=W; cv.height=H; const g=cv.getContext('2d');
  const css=getComputedStyle(document.documentElement), v=n=>css.getPropertyValue('--toy-'+n).trim();
  try{ await Promise.all(['700 120px Fredoka','600 40px Fredoka','400 36px Andika'].map(f=>document.fonts.load(f))); }catch(e){}
  const rr=(x,y,w,h,r,fill)=>{ g.beginPath(); if (g.roundRect) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h); g.fillStyle=fill; g.fill(); };
  const line=(x,y,w,h,r,color,lw)=>{ g.beginPath(); if (g.roundRect) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h); g.lineWidth=lw; g.strokeStyle=color; g.stroke(); };
  const table=g.createLinearGradient(0,0,0,H); table.addColorStop(0, v('maple')||'#E2B782'); table.addColorStop(1, v('maple-dk')||'#CF9858'); rr(0,0,W,H,0,table);
  rr(58,62,W-100,H-100,22,'rgba(58,30,6,.28)');
  const paper=g.createLinearGradient(0,40,0,H-40); paper.addColorStop(0, v('paper')||'#FFFDF6'); paper.addColorStop(1, '#F8F0DD'); rr(40,40,W-80,H-80,22,paper);
  line(76,76,W-152,H-152,12,v('indigo')||'#3F52A8',7); line(96,96,W-192,H-192,6,v('mustard-dk')||'#C98A16',3);
  try{ const img=await toyImage(TOY.bix('proud', 240, {still:true})); g.drawImage(img, W/2-120, 104, 240, 240); }catch(e){ Diag.add('certificate picture: no Bix'); }
  const text=(t, font, color, y, maxW)=>{ let size=parseFloat(font.match(/(\d+)px/)[1]); const f=s=>font.replace(/\d+px/, s+'px');
    g.font=f(size); while (maxW && g.measureText(t).width>maxW && size>24){ size-=4; g.font=f(size); }
    g.fillStyle=color; g.textAlign='center'; g.textBaseline='alphabetic'; g.fillText(t, W/2, y); };
  text('Certificate of mastery', '600 46px Fredoka, sans-serif', '#8A5A1C', 408);
  text(settings.name || 'Abacus star', '700 124px Fredoka, sans-serif', v('indigo')||'#3F52A8', 544, 1240);
  text('has mastered', '400 40px Andika, sans-serif', v('ink-soft')||'#5B4A36', 618);
  text(c.title, '700 68px Fredoka, sans-serif', v('ink')||'#2B3674', 712, 1240);
  // five lacquered beads on a brass rod, and the wax seal (drawn by the kit)
  const rod=g.createLinearGradient(0,800,0,814); rod.addColorStop(0,'#FFF1B8'); rod.addColorStop(.35,'#E2B54A'); rod.addColorStop(.7,'#9C7420'); rod.addColorStop(1,'#C99A38'); rr(W/2-290,800,580,14,7,rod);
  try{ const cols=['mustard','teal','red','indigo','mustard']; for (let i=0;i<5;i++){ const img=await toyImage(TOY.bead(cols[i], 104, {tall:true, shadow:false})); g.drawImage(img, W/2-5*42+i*84+4, 807-49, 77, 104); } }catch(e){ Diag.add('certificate picture: no beads'); }
  try{ const img=await toyImage(certSealSvg(190)); g.drawImage(img, W-370, H-372, 190, 247); }catch(e){ Diag.add('certificate picture: no seal'); }
  text(niceDate(c.date)+'  ·  Bix Abacus', '400 36px Andika, sans-serif', v('ink-soft')||'#5B4A36', 936);
  return await new Promise((ok,no)=>{ try{ cv.toBlob(b=>b?ok(b):no(new Error('no picture')), 'image/png'); }catch(e){ no(e); } });
}
async function saveCertPicture(){
  let blob; try{ blob=await (certPic || (certPic=certPicture(certShown))); }catch(e){ Diag.add('certificate picture failed: '+(e&&e.message||e)); return; }
  const name='Bix certificate - '+(settings.name||'star')+' - '+certShown.title+'.png', file=new File([blob], name.replace(/[\\/:*?"<>|]/g,''), {type:'image/png'});
  if (navigator.canShare && navigator.share && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'Certificate'}); return; }catch(e){ if (e && e.name==='AbortError') return; Diag.add('share failed: '+(e&&e.name)); }
  }
  const url=URL.createObjectURL(blob);
  if (navigator.standalone===true){ certPicView(url); return; }   // iOS Home Screen app: no downloads; press-and-hold the picture to save it
  const a=document.createElement('a'); a.href=url; a.download=file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url), 30000);
}
function certPicView(url){
  let box=$('#certPic'); if (!box){ box=document.createElement('div'); box.id='certPic'; box.className='tp-certpic'; box.setAttribute('role','dialog'); box.setAttribute('aria-label','Certificate picture');
    box.innerHTML='<div class="tp-certpiccard toy-paper"><img alt="Certificate"><p class="toy-caption">Press and hold the picture, then choose “Save to Photos”.</p><button class="toy-block toy-block--teal toy-block--sm" id="certPicDone">'+TOY.icon('check',30,'currentColor')+'<span class="toy-block-label">Done</span></button></div>';
    $('#certificate').appendChild(box); box.querySelector('#certPicDone').addEventListener('click', ()=>box.classList.remove('on')); }
  box.querySelector('img').src=url; box.classList.add('on');
}
$('#certPrint').addEventListener('click', ()=>{ Sfx.tap(); openGate(()=>{ if (standaloneApp()) saveCertPicture(); else window.print(); }); });   // sharing leaves the app: grown-ups only
$('#certDone').addEventListener('click', ()=>{ renderHome(); show('home'); });
// Other screens (practice door, grown-ups) can start a level test or read this child's certificates.
window.LevelTest = { start: startLevelTest, certificates, show: c=>showCertificate(c), picture: c=>certPicture(c||certShown) };

/* ---------------- parent gate ---------------- */
let gateAnswer=0, gateNext=null, gateFrom='home', gateCb=null; $('#grownups').addEventListener('click', ()=>openGate());
// Grown-ups gate (Apple Kids Category parental gate). Two steps, both beyond this app's children:
//  1. press and hold a button for 3 seconds (the bar fills; letting go early starts again), then
//  2. a written instruction: "Type the fourth, first and second digits of 5 2 8 9 3". Our oldest children read big
//     numbers and add 4-digit sums, so a number in words or a sum is not enough; following an ordinal, re-ordering
//     instruction is an adult reading task that takes a grown-up about 5 seconds.
// Children who cannot read get a picture and Bix saying "Go get a grown-up!". window.__gateAnswer / __gateHold are test hooks.
const GATE_ORD=['first','second','third','fourth','fifth'], GATE_HOLD_MS=3000;
// A grown-up holding a child's hand, as two wooden peg dolls: the picture says "fetch a grown-up" without words.
const GATE_ART = (()=>{ const sh=(cx,cy,rx,ry,o)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#toy-g-shadow)" opacity="${o}"/>`;
  const doll=(x, base, w, h, r, col)=>{ const top=base-h, hy=top-r*.62;
    return `<path d="M${x-w},${base-8} Q${x-w-2},${top+h*.22} ${x-w*.5},${top+4} Q${x},${top-6} ${x+w*.5},${top+4} Q${x+w+2},${top+h*.22} ${x+w},${base-8} Q${x},${base+6} ${x-w},${base-8}Z" fill="url(#toy-lac-${col})"/>`
      + `<ellipse cx="${x-w*.42}" cy="${top+h*.34}" rx="${w*.16}" ry="${h*.2}" transform="rotate(14 ${x-w*.42} ${top+h*.34})" fill="#fff" opacity=".5"/>`
      + `<circle cx="${x+1.5}" cy="${hy+2.5}" r="${r}" fill="#B98448"/><circle cx="${x}" cy="${hy}" r="${r}" fill="url(#toy-g-maple)"/><ellipse cx="${x-r*.36}" cy="${hy-r*.42}" rx="${r*.34}" ry="${r*.2}" transform="rotate(-30 ${x-r*.36} ${hy-r*.42})" fill="#fff" opacity=".75"/>`; };
  return `<svg width="230" height="200" viewBox="0 0 230 200">` + sh(92,184,62,10,.5) + sh(78,183,44,8,.95) + sh(176,185,42,8,.5) + sh(166,184,30,6,.95)
    + `<path d="M108,116 Q126,140 144,140" fill="none" stroke="#1B2557" stroke-width="17" stroke-linecap="round"/><path d="M108,116 Q126,140 144,140" fill="none" stroke="#3A4B9C" stroke-width="13" stroke-linecap="round"/>`
    + doll(76, 184, 36, 104, 25, 'indigo') + doll(164, 184, 26, 64, 19, 'mustard')
    + `<circle cx="144" cy="140" r="9" fill="url(#toy-lac-mustard)"/></svg>`; })();
// A new question: 5 digits (1-9, so no leading-zero answers) and 3 different positions in a random order.
function gateQuestion(){
  const digits=Array.from({length:5}, ()=>1+Math.floor(Math.random()*9));
  let pos; do { pos=[0,1,2,3,4].sort(()=>Math.random()-0.5).slice(0,3); } while (pos[0]<pos[1] && pos[1]<pos[2]);   // never in plain left-to-right order
  gateAnswer=+pos.map(i=>digits[i]).join(''); window.__gateAnswer=gateAnswer;
  const ord=pos.map(i=>'<b>'+GATE_ORD[i]+'</b>');
  $('#gateQ').innerHTML='<small>Type these digits, in this order</small><span class="gw">The '+ord[0]+', '+ord[1]+' and '+ord[2]+' digits of</span>'
    +'<span class="gnum" aria-label="'+digits.join(' ')+'">'+digits.map(d=>'<i>'+d+'</i>').join('')+'</span>';
  $('#gateA').value='';
}
// Step 1 -> 2: show the question (after a full hold; tests may call window.__gateHold()).
function gateReveal(){ const c=$('#gateCard'); if (c.dataset.step==='ask') return; c.dataset.step='ask'; c.setAttribute('aria-labelledby','gateQ'); $('#gateMsg').textContent=''; gateQuestion(); setTimeout(()=>$('#gateA').focus(),50); }
window.__gateHold=gateReveal;
const GateHold={ t0:0, raf:0,
  start(){ if (this.t0 || $('#gateCard').dataset.step!=='hold') return; this.t0=performance.now(); $('#gateHold').classList.add('holding'); $('#gateMsg').textContent=''; $('#gateHoldL').textContent='Keep holding…'; this.tick(); },
  tick(){ const p=Math.min(1,(performance.now()-this.t0)/GATE_HOLD_MS); $('#gateHold').style.setProperty('--p', p.toFixed(3));
    if (p>=1){ this.reset(); Sfx.tap(); gateReveal(); return; } this.raf=requestAnimationFrame(()=>this.tick()); },
  stop(){ if (!this.t0) return; const early=performance.now()-this.t0 < GATE_HOLD_MS; this.reset(); if (early) $('#gateMsg').textContent='Keep holding until the bar is full.'; },
  reset(){ cancelAnimationFrame(this.raf); this.t0=0; const b=$('#gateHold'); b.classList.remove('holding'); b.style.setProperty('--p', 0); $('#gateHoldL').textContent='Hold'; },
};
$('#gateBack').innerHTML=TOY.icon('back', 30, 'currentColor');
(()=>{ const b=$('#gateHold'); b.querySelector('.gh-ic').innerHTML=TOY.icon('lock', 30, 'currentColor');
  b.addEventListener('pointerdown', e=>{ e.preventDefault(); try{ b.setPointerCapture(e.pointerId); }catch(err){} GateHold.start(); });
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev, ()=>GateHold.stop()));
  b.addEventListener('contextmenu', e=>e.preventDefault());
  b.addEventListener('keydown', e=>{ if ((e.key===' '||e.key==='Enter') && !e.repeat){ e.preventDefault(); GateHold.start(); } });
  b.addEventListener('keyup', e=>{ if (e.key===' '||e.key==='Enter') GateHold.stop(); });
})();
function openGate(next){
  const g=$('#gate');
  if (g.classList.contains('active')) return;
  gateNext = typeof next==='string' ? next : null; gateCb = typeof next==='function' ? next : null; const a=document.querySelector('.screen.active'); gateFrom = a ? a.id : 'home';
  GateHold.reset(); const c=$('#gateCard'); c.dataset.step='hold'; c.setAttribute('aria-labelledby','gateHoldT'); $('#gateMsg').textContent=''; $('#gateA').value='';
  gateAnswer=-1; window.__gateAnswer=null;
  if (!$('#gateArt').innerHTML) $('#gateArt').innerHTML=GATE_ART;
  show('gate'); const bg=$('#bixGate'); toyBix(bg, 'happy'); bixSay(bg, 'This part is for a grown-up. Go get a grown-up!', 'gate_grownup');
}
function leaveGate(){ gateCb=null; GateHold.reset(); Fun.BixVoice.stop(); if (gateFrom==='door') show('door'); else if (gateFrom && gateFrom!=='home' && gateFrom!=='gate' && $('#'+gateFrom)) show(gateFrom); else { renderHome(); show('home'); } }
$('#gateBack').addEventListener('click', leaveGate);
$('#gateOk').addEventListener('click', ()=>{
  if ($('#gateCard').dataset.step!=='ask') return;
  if($('#gateA').value.trim()!=='' && parseInt($('#gateA').value,10)===gateAnswer && gateCb){ const cb=gateCb; gateCb=null; Fun.BixVoice.stop(); GateHold.reset(); show(gateFrom); cb(); return; }   // a grown-up action, then back where we were
  if($('#gateA').value.trim()!=='' && parseInt($('#gateA').value,10)===gateAnswer){ Fun.BixVoice.stop(); renderParent(); show('parent'); $('#parent').scrollTop=0; if (gateNext==='skills') setTimeout(()=>$('#guSkills').scrollIntoView({block:'start'}), 60); }
  else { const c=$('#gateCard'); c.classList.remove('tg-shake'); void c.offsetWidth; c.classList.add('tg-shake'); gateQuestion(); $('#gateMsg').textContent='That wasn’t it. Here is a new number to try.'; setTimeout(()=>$('#gateA').focus(),50); }
});
$('#gateA').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#gateOk').click(); });

/* ---------------- parent ---------------- */
function bindRange(id,key,fmt){ const el=$(id), v=$(id+'V'); el.value=settings[key]; v.textContent=(fmt||(x=>x))(settings[key]); el.oninput=()=>{ settings[key]=parseFloat(el.value); v.textContent=(fmt||(x=>x))(settings[key]); saveSettings(); }; }
function bindSwitch(id,key,after){ const el=$(id); el.classList.toggle('on',!!settings[key]); el.onclick=()=>{ settings[key]=!settings[key]; el.classList.toggle('on',settings[key]); saveSettings(); if(after) after(); }; }
// One glance at whether this device is set up well. Each row: status, what it means, and a button to fix it.
async function renderChecklist(){
  const box=$('#setupList'); if(!box) return;
  // Home Screen advice only makes sense in a browser tab (not the Home Screen web app, not the App Store app).
  const standalone = (navigator.standalone===true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const nativeApp = !!(window.Capacitor || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bix));
  const browserTab = !standalone && !nativeApp;
  const n=NODES[curIdx()], learned=NODES.filter(x=>node(x.id).mastered).length;
  const treats=Treats.list(), isDefault = JSON.stringify(treats.map(t=>[t.emoji,t.name,t.price]))===JSON.stringify(Treats.DEFAULT_TREATS.map(t=>[t.emoji,t.name,t.price]));
  const vk=Speaker.kind(), voice = vk==='rec' ? (settings.voice==='rec:turns' ? 'Family voices taking turns' : `${profileName(settings.voice.slice(4))}'s recorded voice`) : vk==='sprite' ? 'Built-in recorded voice' : 'The device voice';
  const lb=settings.lastBackup ? new Date(settings.lastBackup) : null, days_ = lb ? Math.floor((Date.now()-lb)/864e5) : null;
  const rows=[
    [settings.name?'ok':'todo', 'Child’s name', settings.name ? settings.name : 'Not set yet. Bix will greet them by name.', settings.name?'':'<button class="btn small ghost" data-go="name">Set name</button>'],
    ['ok', 'Current skill', `${n.title} (${learned} skill${learned===1?'':'s'} learned). Check this matches their class.`, '<button class="btn small ghost" data-go="skill">Change</button> <button class="btn small ghost" data-go="check">Level check</button>'],
    browserTab ? ['warn', 'Open it from the Home Screen', 'You are using Bix Abacus in a browser tab. Adding it to the Home Screen keeps progress safer and opens it full screen: tap Share, then “Add to Home Screen”.', ''] : null,
    [isDefault?'warn':'ok', 'Treats', isDefault ? 'Starter list: a snack, a story, a game together, choosing dinner, a park trip, an ice cream outing. Change it to what motivates this child.' : `${treats.length} treats set.`, '<button class="btn small ghost" data-go="treats">Edit treats</button>'],
    ['ok', 'Listening voice', voice+'.', '<button class="btn small ghost" data-go="voice">Change</button>'],
    [lb ? (days_>30?'warn':'ok') : 'warn', 'Backup', lb ? `Last saved ${days_===0?'today':days_===1?'yesterday':days_+' days ago'}.` : 'Never saved. Save one so progress can be restored if the device is lost or reset.', '<button class="btn small ghost" data-go="backup">Back up</button>'],
  ];
  box.innerHTML = rows.filter(Boolean).map(([st,t,d,btn])=>`<div class="ck ${st}"><span class="ck-i" aria-label="${st==='ok'?'done':st==='warn'?'worth a look':'to do'}">${st==='ok'?WS.icon('check', 18, 'currentColor', 3.2):st==='warn'?'!':''}</span><div class="ck-t"><b>${t}</b><span>${d}</span></div><div class="ck-b">${btn}</div></div>`).join('');
  const go={ name:'#sName', skill:'#sNode', treats:'#tpList', voice:'#sVoice', backup:'#bkMake' };
  box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const k=b.dataset.go; if (k==='check'){ Recorder.stop(); return Setup.open('check'); } const el=$(go[k]); el.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>{ el.focus && el.focus(); el.classList.add('flashme'); setTimeout(()=>el.classList.remove('flashme'),1600); }, 400); });
}
/* ---- the weekly report for the child who is practising (ParentBrain does the thinking; this only draws) ---- */
const PBrain = window.ParentBrain;
// Multiplication misses ({op:'mul'} or from a times skill) are not bead moves: ParentBrain reads them as sums,
// so they are kept out of its analysis and counted here instead, labelled "34 × 6".
function isMulMiss(m, s){ const n=s && C.BY_ID[s.node]; return !!m && (m.op==='mul' || !!(n && n.drill && n.drill.op==='mul')); }
function reportData(){
  const h=history.map(s=>(s.missed||[]).some(m=>isMulMiss(m,s)) ? Object.assign({}, s, {missed:s.missed.filter(m=>!isMulMiss(m,s))}) : s);
  return { history:h, days, progress, settings };
}
function mulMissed(from, to){
  const g={};
  for (const s of history){ const d=new Date(s.at); if (isNaN(d)) continue; const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); if (k<from || k>to) continue;
    for (const m of (s.missed||[])) if (isMulMiss(m,s) && Array.isArray(m.terms) && m.terms.length>=2){ const label=`${Math.abs(m.terms[0])} × ${Math.abs(m.terms[1])}`; (g[label]=g[label]||{key:'mul:'+label, label, count:0}).count++; } }
  return Object.values(g);
}
// Certificates (stream B saves them when a level test is passed). Read defensively: an array of
// {nodeId,title,date,accuracy} for this child, wherever it ends up being kept.
function certificates(){
  const out=[], seen=new Set(), act=Store.activeId();
  const add=a=>{ if (!Array.isArray(a)) return; for (const c of a){ if (c && c.nodeId && !seen.has(c.nodeId)){ seen.add(c.nodeId); out.push(c); } } };
  try{
    const c=Store.get('certificates'); if (Array.isArray(c)) add(c); else if (c && typeof c==='object') add(c[act]);
    const f=Store.get('fun', {}); add(f && f.certificates); add(progress && progress.certificates);
  }catch(e){}
  return out;
}
// Tonight's tip: the same tip all day, and never yesterday's tip again (remembered per child).
function pickTip(data){
  const today=todayKey(), mem=Store.get('parentTips', {}) || {}, id=Store.activeId(), m=mem[id] || {};
  let tip;
  if (m.day===today && m.id){ tip=PBrain.tonightsTip(data, {lastTipId:m.prev||undefined}); if (tip.id!==m.id){ mem[id]=Object.assign({}, m, {id:tip.id}); Store.set('parentTips', mem); } }
  else { tip=PBrain.tonightsTip(data, {lastTipId:m.id||undefined}); mem[id]={day:today, id:tip.id, prev:m.id||null}; Store.set('parentTips', mem); }
  return tip;
}
function fmtRange(a, b){
  const A=new Date(a+'T12:00:00'), B=new Date(b+'T12:00:00'), mo=d=>d.toLocaleDateString('en-US',{month:'short'});
  return A.getMonth()===B.getMonth() ? `${mo(A)} ${A.getDate()} – ${B.getDate()}` : `${mo(A)} ${A.getDate()} – ${mo(B)} ${B.getDate()}`;
}
let lastReport=null;
function renderReport(){
  if (!PBrain) return;
  const data=reportData(), r=PBrain.weeklyReport(data), name=(settings.name||'').trim();
  lastReport=r; window.__report=r;
  $('#repTitle').textContent = name ? `${name}’s week` : 'This week';
  $('#repDates').textContent = fmtRange(r.weekStart, r.weekEnd);
  // children switcher (switching reloads the app as that child, then comes straight back here)
  const act=Store.activeId(), kids=Store.children();
  $('#repKids').innerHTML = kids.map(c=>`<button data-rk="${c.id}" aria-pressed="${c.id===act}">${esc(childLabel(c))}</button>`).join('')
    + `<button class="gu-add" id="repAdd" aria-label="Add a child">${WS.icon('plus', 18, 'currentColor', 2.6)}</button>`;
  $$('#repKids [data-rk]').forEach(b=>b.onclick=()=>{ if (b.dataset.rk===Store.activeId()) return; Recorder.stop(); Store.switchTo(b.dataset.rk); sessionStorage.setItem('abacus.who','1'); sessionStorage.setItem('abacus.reopen','parent'); location.reload(); });
  $('#repAdd').onclick=()=>$('#kidAdd').click();
  $('#repShare').innerHTML=WS.icon('share', 20, 'currentColor', 2.4)+'<span>Share report</span>';
  // days practised: one bead per day, oldest first
  const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const beads=r.days.map(d=>{ const w=new Date(d.date+'T12:00:00').getDay(); return `<span class="rd-day">${WS.bead(d.practiced?'jade':'pale', 36, {label:`${DOW[w]}, ${d.practiced?'practised':'not practised'}`})}<i aria-hidden="true">${DOW[w][0]}</i></span>`; }).join('');
  $('#repDays').innerHTML=`<span class="rep-k">Days practised</span><div class="rep-beads">${beads}</div><span class="rep-big" id="repDaysN">${r.daysPracticed} of 7 days${r.minutes?` · ${r.minutes} min`:''}</span>`;
  // mastered this week (+ certificates)
  const certs=certificates(), from=r.weekStart, to=r.weekEnd;
  const certFor=id=>certs.find(c=>c.nodeId===id);
  const weekCerts=certs.filter(c=>{ const d=String(c.date||'').slice(0,10); return d>=from && d<=to; });
  const mastered=r.masteredThisWeek.slice(); weekCerts.forEach(c=>{ if (!mastered.some(m=>m.nodeId===c.nodeId)) mastered.push({nodeId:c.nodeId, label:c.title||App.nodeTitle(c.nodeId)}); });
  let mh='<span class="rep-k">Mastered this week</span>';
  if (mastered.length){
    const m=mastered[0], c=certFor(m.nodeId);
    mh+=`<span class="rep-big" id="repMasteredN">${esc(m.label)}</span>`;
    mh+= c ? `<span class="rep-s">${WS.icon('star', 18, WS.colors.ochre)} Certificate earned${c.accuracy!=null?` · ${Math.round(c.accuracy<=1?c.accuracy*100:c.accuracy)}% right`:''}</span>` : `<span class="rep-s">A new skill, learned by practising</span>`;
    if (mastered.length>1) mh+=`<span class="rep-s">and ${mastered.slice(1).map(x=>esc(x.label)).join(', ')}</span>`;
  } else mh+=`<span class="rep-big quiet" id="repMasteredN">Nothing new yet</span><span class="rep-s">Skills move on at 80% on 2 days. Steady practice gets there.</span>`;
  $('#repMastered').innerHTML=mh;
  // working on now: accuracy bar with the 80% mark
  const cu=r.current, acc=cu.accuracy===null?null:Math.round(cu.accuracy*100);
  const need = acc===null ? 'Not practised yet. It moves on at 80% right on 2 different days.'
    : `${acc}% right · needs ${Math.round(cu.needed*100)}% on ${cu.daysNeeded} days to move on` + (cu.problems<cu.problemsNeeded ? ` (${cu.problems} of ${cu.problemsNeeded} problems so far)` : '');
  $('#repWorking').innerHTML=`<span class="rep-k">Working on now</span><span class="rep-big">${esc(cu.label)}</span>
    <div class="rep-bar" role="img" aria-label="${acc===null?'no answers yet':acc+'% right'}, 80% needed"><i style="width:${acc||0}%"></i><b style="left:${Math.round(cu.needed*100)}%"></b></div><span class="rep-s" id="repNeed">${need}</span>`;
  // tonight's tip
  const tip=pickTip(data); window.__tip=tip;
  $('#repTip').innerHTML=`<span class="tip-k">Tonight’s 2-minute tip</span><h3 class="tip-t" id="repTipTitle" data-tip="${esc(tip.id)}">${esc(tip.title)}</h3><p class="tip-x">${esc(tip.text)}</p><p class="tip-why">${esc(tip.why||'')}</p>
    <div class="tip-b"><button class="tip-watch" id="repWatch">${WS.icon('play', 18, 'currentColor')}<span>Watch Bix show it</span></button><button class="tip-more" id="repHow">How the abacus works</button></div>`;
  $('#repWatch').onclick=()=>{ Speaker.unlock(); Recorder.stop(); startLesson(lessonTarget(NODES[curIdx()]), 'parent'); };
  $('#repHow').onclick=()=>$('#guTech').scrollIntoView({behavior:'smooth', block:'start'});
  // missed most
  const mm=r.missedMost.concat(mulMissed(r.weekStart, r.weekEnd)).sort((a,b)=>b.count-a.count).slice(0,3);
  $('#repMissed').innerHTML='<h3>Missed most</h3>'+(mm.length ? mm.map(m=>`<div class="mm-row"><span>${esc(m.label)}</span><b class="${m.count>=3?'hot':''}">${m.count} time${m.count===1?'':'s'}</b></div>`).join('')
    : '<p class="rep-s">Nothing missed this week.</p>');
  // gentle alerts + treats waiting to be handed over
  const al=PBrain.stuckAlerts(data).sort((a,b)=>b.severity-a.severity).slice(0,2);
  const w=(Fun.data.wallet||{}), open=(w.tickets||[]).filter(x=>!x.given);
  let ah=al.map(a=>`<div class="rep-alert" data-kind="${a.kind}">${WS.icon('sprout', 30, WS.colors.ochre)}<div><b>${esc(a.message)}</b><span>${esc(a.suggestion)}</span></div></div>`).join('');
  if (open.length) ah+=`<button class="rep-alert as-btn" id="repTickets">${WS.icon('star', 30, WS.colors.ochre)}<div><b>${open.length} treat${open.length===1?'':'s'} to hand over</b><span>${esc(name||'They')} bought ${open.map(t=>esc(t.name)).join(', ')}. Tap to see the tickets.</span></div></button>`;
  if (!ah) ah=`<div class="rep-alert calm">${WS.icon('check', 30, WS.colors.jade, 3)}<div><b>Nothing to worry about</b><span>No stuck spots this week. Short, happy practice most days is the whole secret.</span></div></div>`;
  $('#repAlerts').innerHTML=ah;
  const tk=$('#repTickets'); if (tk) tk.onclick=()=>$('#guTreats').scrollIntoView({behavior:'smooth', block:'start'});
}
function toast(msg){ const t=$('#repToast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'), 3200); }
$('#repShare').addEventListener('click', async()=>{
  const r=lastReport || PBrain.weeklyReport(reportData()), text=PBrain.shareText(r, {childName:settings.name}); window.__shareText=text;
  const title=(settings.name?settings.name+'’s':'Our')+' abacus week';
  if (navigator.share){ try{ await navigator.share({title, text}); return; }catch(e){ if (e && e.name==='AbortError') return; } }
  try{ await navigator.clipboard.writeText(text); toast('Report copied. Paste it into a message.'); }
  catch(e){ toast(text); }
});
// After switching child from the report, come straight back to it.
setTimeout(()=>{ if (sessionStorage.getItem('abacus.reopen')==='parent'){ sessionStorage.removeItem('abacus.reopen'); renderParent(); show('parent'); } }, 0);
$('#parentDone').innerHTML=BACK_ICON();
$('#parent .gu-nav').addEventListener('click', e=>{ const a=e.target.closest('a'); if (!a) return; e.preventDefault(); const t=$(a.getAttribute('href')); if (t) t.scrollIntoView({behavior:'smooth', block:'start'}); });
async function renderParent(){
  renderReport();
  for (const pp of profiles()) { try{ await Speaker.loadRec(pp.id, true); }catch(e){} }
  const sel=$('#sNode'); sel.innerHTML=''; let og=null; NODES.forEach(n=>{ const lv=levelOf(n); if (!og || og.dataset.lv!=lv){ og=document.createElement('optgroup'); og.label='Level '+lv; og.dataset.lv=lv; sel.appendChild(og); } const o=document.createElement('option'); o.value=n.id; o.textContent=n.title; og.appendChild(o); }); sel.value=progress.current;
  sel.onchange=()=>{ setTimeout(renderChecklist,0); progress.current=sel.value; const ci=curIdx(); NODES.forEach((n,i)=>{ const st=node(n.id); if(i<ci){ if(!st.mastered) st.mastered='parent'; st.lesson=true; } else if (st.mastered==='parent'){ st.mastered=null; } }); saveProgress(); renderParent(); };
  $('#sName').value=settings.name||''; $('#sName').onchange=()=>{ settings.name=$('#sName').value.trim(); saveSettings(); renderChecklist(); };
  renderChecklist(); renderChildren();
  const tb=$('#nodeTable tbody'); tb.innerHTML='';
  NODES.forEach((n,i)=>{ if (i===0 || levelOf(NODES[i-1])!==levelOf(n)){ const lr=document.createElement('tr'); lr.className='lvl-row'; lr.innerHTML=`<th colspan="5">Level ${levelOf(n)}</th>`; tb.appendChild(lr); } const st=node(n.id); const h=st.hist.slice(-20); const acc=h.length?Math.round(100*h.filter(x=>x.ok).length/h.length):null; const dn=new Set(h.map(x=>x.day)).size;
    const tr=document.createElement('tr'); const status = st.mastered==='auto'?'<span class="pill good">learned</span>':st.mastered==='parent'?'<span class="pill good">learned (set by you)</span>':st.mastered==='placed'?'<span class="pill good">learned (level check)</span>':i===curIdx()?'<span class="pill">current</span>':'<span class="pill">locked</span>';
    tr.innerHTML=`<td>${esc(n.title)}</td><td>${st.lesson?`<span class="gu-tick" aria-label="done">${WS.icon('check', 18, 'currentColor', 3)}</span>`:'—'}</td><td>${acc===null?'—':`<span class="mini"><i style="width:${acc}%"></i></span>${acc}% (${h.length})`}</td><td>${dn||'—'}</td><td>${status} <button class="btn small ghost" data-toggle="${n.id}">${st.mastered?'un-learn':'mark learned'}</button></td>`;
    tb.appendChild(tr); });
  tb.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{ const st=node(b.dataset.toggle); st.mastered = st.mastered?null:'parent'; if(st.mastered) st.lesson=true; saveProgress(); renderParent(); });
  Treats.renderParent(); Treats.bindParent();
  bindSwitch('#sBixTalks','bixTalks', ()=>{ if(!settings.bixTalks) Fun.BixVoice.stop(); });
  $('#sBixVoice').innerHTML=Object.entries(Fun.BixVoice.voices).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#sBixVoice').value=Fun.BixVoice.tag();
  $('#sBixVoice').onchange=async()=>{ settings.bixVoice=$('#sBixVoice').value; saveSettings(); Fun.BixVoice.stop(); Speaker.unlock(); await Fun.BixVoice.load(); Fun.BixVoice.play('intro_hi'); };
  $('#sBixTest').onclick=async()=>{ Speaker.unlock(); await Fun.BixVoice.load(); Fun.BixVoice.play(['intro_hi','tap_3','tap_4','sum_amazing'][Math.floor(Math.random()*4)]); };
  $('#levelAgain').onclick=()=>{ Recorder.stop(); Setup.open('check'); };
  bindRange('#sCount','count'); bindRange('#sOperands','operands',x=>x===0?'auto':x); bindSwitch('#sSfx','sfx'); bindSwitch('#sSpeakFb','speakFeedback');
  const s=x=>x+' s'; bindRange('#sGap','gap',s); bindRange('#sGapMin','gapMin',s); bindRange('#sGapMax','gapMax',s); bindSwitch('#sSayPlus','sayPlus');
  bindRange('#sRate','voiceRate',x=>x.toFixed(2)+'×'); bindRange('#sPause','answerPause',s); bindRange('#sFlash','flashSec',x=>x.toFixed(1)+' s'); bindRange('#sFlashN','flashN');
  fillVoiceSelect(); $('#sVoice').onchange=async()=>{ settings.voice=$('#sVoice').value; saveSettings(); Speaker.activePid=null; await Speaker.prepare(); fillVoiceSelect(); $('#diagLog').textContent=Diag.lines.join('\n'); renderChecklist(); };
  $('#sVoiceTest').onclick=async()=>{ Speaker.unlock(); Speaker.stop(); await Speaker.prepare(); Speaker.pickReader(); if (Speaker.activePid) Diag.add('test: '+profileName(Speaker.activePid)+' reading'); const seq=[[7,true],[3,false],[-4,false],[12,false]];
    if (Speaker.canSchedule()){ const t0=Speaker.ctx.currentTime+0.1; seq.forEach(([d,f],i)=>Speaker.scheduleTerm(d,f,t0+i*1.3)); } else { for (const [d,f] of seq){ await Speaker.sayDevice(termText(d,f)); await sleep(300); } } };
  // recorder: who, add, rename, delete, record
  await renderProfiles();
  $('#recWho').onchange=async()=>{ await Recorder.select($('#recWho').value); $('#recName').value=profileName(Recorder.pid); };
  $('#recName').onchange=()=>{ const p=profiles().find(x=>x.id===Recorder.pid); if(!p) return; p.name=$('#recName').value.trim()||p.name; saveSettings(); renderProfiles(); fillVoiceSelect(); };
  $('#recAdd').onclick=async()=>{ const name=$('#recNew').value.trim(); if(!name){ $('#recNew').focus(); return; } const id=newProfileId(); profiles().push({id, name}); saveSettings(); $('#recNew').value=''; Recorder.pid=id; await renderProfiles(); fillVoiceSelect(); $('#recStatus').textContent=`Added ${name}. Tap "Start recording" and record the ${RECORD_WORDS.length} words.`; };
  $('#recDelete').onclick=async()=>{ const pid=Recorder.pid; if(!pid) return; if(!await WS.confirm(`Delete ${profileName(pid)}?`, `This deletes ${profileName(pid)} and all of their recordings from this device.`, {ok:'Delete', cancel:'Keep', danger:true})) return; await ClipStore.deleteProfile(pid); settings.profiles=profiles().filter(p=>p.id!==pid); if (settings.voice==='rec:'+pid || (settings.voice==='rec:turns' && profiles().filter(p=>Speaker.isComplete(p.id)).length<2)) settings.voice=profiles()[0]?'rec:'+profiles()[0].id:'device'; delete Speaker.recs[pid]; delete Speaker.recLoaded[pid]; saveSettings(); Recorder.pid=null; await renderProfiles(); fillVoiceSelect(); };
  $('#recStart').onclick=async()=>{ Speaker.unlock(); if (await Recorder.start()) $('#recStatus').textContent+=' — microphone ready'; };
  const rb=$('#recBtn'); rb.onpointerdown=e=>{ e.preventDefault(); if(!Recorder.stream){ $('#recStatus').textContent='Tap "Start recording" first.'; return; } Recorder.begin(); };
  rb.onpointerup=rb.onpointerleave=rb.onpointercancel=()=>Recorder.end();
  $('#recPrev').onclick=()=>Recorder.prev(); $('#recNext').onclick=()=>Recorder.next(); $('#recPlay').onclick=()=>Recorder.play();
  // backup
  $('#bkMake').onclick=async()=>{ const b=$('#bkMake'); b.disabled=true; b.textContent='Preparing…'; try{ const f=await Backup.build(); $('#bkSave').style.display=''; $('#bkInfo').textContent=`Ready: ${f.name} (${(f.size/1048576).toFixed(1)} MB, ${profiles().length} voice${profiles().length===1?'':'s'}, progress and settings). Tap "Save file", then choose "Save to Files".`; }catch(e){ $('#bkInfo').textContent='Could not prepare backup: '+(e&&e.message||e); } b.disabled=false; b.textContent='1. Prepare backup'; };
  $('#bkSave').onclick=async()=>{ const r=await Backup.save(); if (r==='shared'||r==='downloaded'){ settings.lastBackup=new Date().toISOString(); saveSettings(); renderChecklist(); } $('#bkInfo').textContent = r==='shared'?'Saved. Keep the file somewhere safe (Files → iCloud Drive is best).': r==='downloaded'?'Downloaded. Check your Downloads folder.' : r==='cancelled'?'Cancelled.':'Prepare the backup first.'; };
  $('#bkOpen').onclick=()=>$('#bkFile').click();
  $('#bkFile').onchange=async()=>{ const f=$('#bkFile').files[0]; $('#bkFile').value=''; if(!f) return; try{ const text=await f.text(); const withProgress=await WS.confirm('Restore progress and settings too?', 'Recorded voices are always restored. This backup can also bring back the children’s progress and settings, replacing what is on this device now.', {ok:'Voices, progress and settings', cancel:'Voices only'}); const r=await Backup.restore(text, withProgress); for (const pp of profiles()) await Speaker.loadRec(pp.id, true); Recorder.pid=null; await renderParent(); renderHome(); $('#bkInfo').textContent=`Restored ${r.voices} voice${r.voices===1?'':'s'} (${r.clips} recordings)`+(withProgress?', progress and settings.':'.'); }catch(e){ $('#bkInfo').textContent='Could not restore: '+(e&&e.message||e); } };
  $('#diagLog').textContent=Diag.lines.join('\n');
  $('#diagState').textContent=`voice=${settings.voice} kind=${Speaker.kind()} | AudioContext: ${Speaker.ctx?Speaker.ctx.state:'none'} | device voices: ${('speechSynthesis' in window)?speechSynthesis.getVoices().length:'n/a'} | chosen: ${Speaker.deviceVoice()?Speaker.deviceVoice().name:'none'} | clips: ${Speaker.canSchedule()?'ready':'not loaded'} | ${navigator.userAgent.slice(0,60)}`;
  $('#soundTest').onclick=async()=>{ Speaker.unlock(); Sfx.star(); await sleep(450); await Fun.BixVoice.load(); Fun.BixVoice.play('intro_hi'); Diag.add('sound test ctx='+(Speaker.ctx?Speaker.ctx.state:'none')); };
  $('#guVer').textContent='Bix Abacus v'+appVersion();
  $('#diagTts').onclick=async()=>{ Speaker.unlock(); const r=await Speaker.sayDevice('seven, plus three'); Diag.add('device test: '+r); $('#diagLog').textContent=Diag.lines.join('\n'); };
  $('#diagBeep').onclick=()=>{ Speaker.unlock(); Sfx.star(); Diag.add('beep ctx='+(Speaker.ctx?Speaker.ctx.state:'none')); $('#diagLog').textContent=Diag.lines.join('\n'); };
  const st=$('#sessions tbody'); st.innerHTML='';
  history.slice(0,20).forEach(h=>{ const tr=document.createElement('tr'); const when=new Date(h.at); const ws=when.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+when.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    const missed=(h.missed||[]).map(m=>'<span class="pill bad">'+(isMulMiss(m,h) ? m.terms.join(' × ') : m.terms.map((t,i)=>i===0?t:(t<0?' − '+(-t):' + '+t)).join(''))+' = '+m.answer+(m.given?' (said '+m.given+')':'')+'</span>').join(' ');
    const nn=C.BY_ID[h.node]||C.BY_ID[h.preset]||{short:h.preset||''};
    tr.innerHTML=`<td>${ws}</td><td>${h.mode==='listen'?'Listen'+(h.gap?' '+h.gap+'s':''):h.mode==='flash'?'Flash':'Look'}</td><td>${nn.short||''}</td><td>${h.correct}/${h.count}</td><td>${Math.floor(h.secs/60)}:${String(h.secs%60).padStart(2,'0')}</td><td>${missed||'—'}</td>`; st.appendChild(tr); });
}
$('#parentDone').addEventListener('click', ()=>{ Recorder.stop(); renderHome(); show('home'); });
// Grown-up icons in static markup (data-ic), drawn from the kit.
$$('#parent .gu-ic[data-ic]').forEach(el=>{ el.innerHTML=WS.icon(el.dataset.ic, 20, 'currentColor', 2.6); });
// The version lives only here in grown-ups (the child's home shows none): read from app.js's own ?v= cache tag.
function appVersion(){ const sc=document.querySelector('script[src*="app.js"]'); const m=sc && /[?&]v=([\w.]+)/.exec(sc.getAttribute('src')); return m ? m[1] : ''; }
// Sound diagnostics are for support only: five quick taps on the version line show them.
(()=>{ let taps=[]; $('#guVer').addEventListener('click', ()=>{ const now=Date.now(); taps=taps.filter(t=>now-t<1500).concat(now);
  if (taps.length>=5){ taps=[]; const d=$('#guDiag'); d.hidden=!d.hidden; if (!d.hidden){ $('#diagLog').textContent=Diag.lines.join('\n'); d.scrollIntoView({behavior:'smooth', block:'center'}); } } }); })();
/* ---------------- children on this device ---------------- */
function childLabel(c){ return c.name || 'New child'; }
function renderChildren(){
  const box=$('#kidsList'); if(!box) return; const act=Store.activeId();
  box.innerHTML=Store.children().map(c=>`<div class="kidrow"><span class="kidname">${esc(childLabel(c))}${c.id===act?' <em>(practising now)</em>':''}</span>${c.id===act?'':`<button class="btn small" data-kidgo="${c.id}">Switch to</button>`}<button class="btn small ghost" data-kidrm="${c.id}">Remove</button></div>`).join('');
  box.querySelectorAll('[data-kidgo]').forEach(b=>b.onclick=()=>{ Store.switchTo(b.dataset.kidgo); location.reload(); });
  box.querySelectorAll('[data-kidrm]').forEach(b=>b.onclick=async()=>{ const c=Store.children().find(x=>x.id===b.dataset.kidrm); if(!await WS.confirm(`Remove ${childLabel(c)} from this device?`, 'This erases their progress, stickers, beads, garden and treats. Recorded voices are kept.', {ok:'Remove', cancel:'Keep', danger:true})) return; Store.removeChild(c.id); location.reload(); });
}
$('#kidAdd').addEventListener('click', ()=>{ const id=Store.addChild(); Store.switchTo(id); location.reload(); });
// "Who's practising?" when more than one child uses this device. Each child is a wooden block with a bead in their own lacquer colour.
function showWho(){
  $('#whoList').innerHTML=Store.children().map((c,i)=>`<button type="button" class="who-card tw-card" data-who="${c.id}"><span class="tw-bead">${TOY.bead(KID_COLORS[i%KID_COLORS.length], 128, {tall:true})}</span><span class="tw-name">${esc(childLabel(c))}</span></button>`).join('');
  $$('#whoList [data-who]').forEach(b=>b.onclick=()=>{ Speaker.unlock(); Sfx.tap(); if(b.dataset.who===Store.activeId()){ sessionStorage.setItem('abacus.who','1'); show('home'); renderHome(); } else { sessionStorage.setItem('abacus.who','1'); Store.switchTo(b.dataset.who); location.reload(); } });
  if (!$('#whoSky').innerHTML){ $('#whoSky').innerHTML=TOY.skyMoon('calm', .5); $('#whoShelf').innerHTML=TOY.prop('rainbow', 150) + TOY.prop('plant', 170); }
  show('who');
  const bw=$('#bixWho'); toyBix(bw, 'wave');
  Fun.Mascot.say(bw, 'Who’s practising today?', 0, 'who_ask');
  if (!showWho.bound){ showWho.bound=true; $('#who').addEventListener('click', e=>{ if (!e.target.closest('button') && !showWho.spoke){ showWho.spoke=true; Fun.Mascot.say(bw, 'Who’s practising today?', 0, 'who_ask'); } }); }
}
$('#switchKid').addEventListener('click', ()=>{ sessionStorage.removeItem('abacus.who'); showWho(); });

/* ---------------- bridge for fun.js and games.js ---------------- */
window.App = {
  show, Sfx, Speaker, get settings(){ return settings; }, saveSettings,
  nodeIndex: ()=>curIdx(), idx: id=>NODE_IDX[id], currentNode: ()=>NODES[curIdx()],
  unlock: ()=>Speaker.unlock(), activityDone, goPlay, renderChecklist,
  goRoom, startMode, openPractice, renderHome: ()=>renderHome(),
  quietNow: ()=> $('#drill').classList.contains('active') && mode==='listen' && (locked || dictateToken>0 && $('#listenMsg').textContent!=='Your answer?'),
  nodes: ()=>NODES, nodeTitle: id=>(C.BY_ID[id]||{}).title||id,
  goHome(){ renderHome.introDone=false; renderHome(); show('home'); },
  // Apply the first-time setup (or a repeated level check): name, current skill, and what counts as learned.
  applySetup({name, current, how, mastered=[]}){
    if (name) settings.name=name;
    const ci=NODE_IDX[current] ?? 0, label = how==='check' ? 'placed' : 'parent';
    progress.current=current;
    NODES.forEach((n,i)=>{ const st=node(n.id);
      if (i<ci && (how!=='check' || mastered.includes(n.id) || n.id==='beads')){ st.mastered = st.mastered==='auto' ? 'auto' : label; st.lesson=true; }
      else if (i>=ci && st.mastered && st.mastered!=='auto'){ st.mastered=null; }
    });
    if (Fun.data.today) Fun.data.today=null;          // rebuild today's plan for the new starting point
    Fun.save(); saveSettings(); saveProgress();
  },
  async voiceReady(){ try{ await Speaker.prepare(); Speaker.pickReader(false); }catch(e){} },
  say(n){ try{ Speaker.stop(); return Speaker.say(n); }catch(e){} },
  gamePops: null, gameNumbers: null,   // tests can shorten a game round (Friend Pop friends, Bead Builder numbers)
};
/* ---------------- boot ---------------- */
window.__diag = Diag;
// Test hook: put a given problem on the practice screen (layout checks for long rows, 4-digit numbers, multiplication on beads).
window.__drillSet = (terms, op, tool)=>{ const p={terms, answer: op==='mul' ? terms[0]*terms[1] : terms.reduce((a,b)=>a+b,0)}; if (op) p.op=op;
  problems[idx]=p; Tool.setRods=Math.max(3, ...problems.map(q=>Tool.rodsFor(q))); if (tool) Tool.kind=tool; presentProblem(); };
window.__drillSay = text=>PB.say(text, 'happy', null, 0);
window.__drill = ()=>({ idx, reviewing, mode, levelTest: !!LT, tool: Tool.kind, terms: problems[idx]&&problems[idx].terms, op: problems[idx]&&problems[idx].op, answer: problems[idx]&&problems[idx].answer, strip: problems.map((p,i)=>[i===idx?'cur':'', results[i]===true||p._fixed?'ok':results[i]===false?'bad':'', p._fixed?'fixed':''].filter(Boolean).join(' ')) });
Setup.bind();
if (firstRun){ show('setup'); Setup.open(); }
else if (Store.children().length>1 && !sessionStorage.getItem('abacus.who')) showWho();
else { show('home'); renderHome(); }
setTimeout(()=>{ if (settings.bixTalks!==false) Fun.BixVoice.load(); }, 1500);
ClipStore.migrate().catch(e=>Diag.add('migrate failed '+(e&&e.message||e))).then(()=>{ saveSettings(); Speaker.init(); });
// iPad Safari only allows sound to start on a finger lift / click, so try on every tap until it's on.
['pointerdown','pointerup','touchend','click'].forEach(ev=>document.addEventListener(ev, ()=>{ if (!Speaker.ctx || Speaker.ctx.state!=='running' || (!Speaker.ttsReady && (Speaker.tries=(Speaker.tries||0)+1)<=4)) Speaker.unlock(); }, true));
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
