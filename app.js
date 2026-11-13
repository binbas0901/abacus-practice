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
  profiles().forEach(p=>{ const n=recCount(p.id); add('rec:'+p.id, `🎙 ${p.name}`+(Speaker.recLoaded[p.id] && n<RECORD_WORDS.length ? ` (${n}/${RECORD_WORDS.length} words)` : '')); });
  if (ready.length>=2) add('rec:turns', `🎙 Take turns (${ready.map(p=>p.name).join(', ')})`);
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
      ? `${nm}: all ${RECORD_WORDS.length} words recorded. To redo one, find it with ◀ ▶` + (this.stream ? ' and hold to record.' : ', tap "Start recording", then hold.')
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
      $('#recStatus').textContent = Speaker.isComplete(pid) ? `All ${RECORD_WORDS.length} words recorded for ${profileName(pid)}. Pick the voice above and tap ▶︎ test to hear it.` : 'Some words could not be read back; see Sound check.';
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

/* ---------------- home ---------------- */
function curIdx(){ return NODE_IDX[progress.current] ?? 0; }
function stars(nid){ const h=node(nid).hist.slice(-20); if(!h.length) return 0; const p=h.filter(x=>x.ok).length/h.length; return node(nid).mastered ? 3 : p>=0.8 ? 2 : h.length>=5 ? 1 : 0; }
// Home greetings: [bubble text, voice line]. Bubbles can use the name; the recorded voice never does.
const HOME_LINES = (n)=>{
  const nm = settings.name ? `, ${settings.name}` : '', h=new Date().getHours();
  const tod = h<12 ? ['Good morning'+nm+'! Ready to move some beads?','hello_morning'] : h<17 ? ['Good afternoon'+nm+'! Let\'s do some abacus!','hello_afternoon'] : ['Good evening'+nm+'! A little practice before bed?','hello_evening'];
  const L=[tod, [`You're back${nm}! I missed you!`,'hello_back'], [`Hi${nm}! Ready for ${n.short}? Tap Start!`,'hello_ready']];
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
function renderHome(){
  $('#switchKid').style.display = Store.children().length>1 ? '' : 'none';
  const cur = NODES[curIdx()];
  $('#greetSub').textContent = `Skill: ${cur.icon} ${cur.title}`;
  // Bix
  const bh=$('#bixHome'); if (!bh.querySelector('.bix')) Fun.Mascot.mount(bh, {size:92, keep:true});
  const steps = todaySteps(); const allDone = steps.every(s=>s.done);
  // Bix talks on the home screen once per visit to the app (the first time sound is allowed), and when today is finished.
  const canTalk = !!Speaker.gestured;   // sound is allowed once she has tapped
  const line = !settings.name ? ["I don't know your name yet! Tap me to tell me. 😊", 'ask_name']
    : allDone ? [`All done today, ${settings.name}! 🌸 Play a game or collect stickers.`, 'all_done']
    : (greeted ? HOME_LINES(cur)[2] : HOME_LINES(cur)[greetIdx()]);
  const speak = canTalk && (!greeted || (allDone && !renderHome.saidDone));
  Fun.Mascot.say(bh, line[0], 0, speak ? line[1] : null);
  if (speak){ greeted=true; if (allDone) renderHome.saidDone=true; }
  Fun.save();
  // today's three steps
  $('#todayTitle').textContent = allDone ? 'Today’s practice — done! 🌸' : 'Today’s practice';
  const nextI = steps.findIndex(s=>!s.done);
  $('#todaySteps').innerHTML = steps.map((s,i)=>`<span class="step${s.done?' done':''}${i===nextI?' next':''}"><i class="sb">${s.done?'✓':s.icon}</i><span class="sl">${s.label}</span></span>`).join('');
  $('#todayGo').textContent = allDone ? 'Play 🎮' : (nextI===0 ? 'Start ▶' : 'Next ▶');
  // path
  const p=$('#path'); p.innerHTML='';
  NODES.forEach((n,i)=>{
    const el=document.createElement('button'); const st=node(n.id);
    el.className='node'+(i===curIdx()?' cur':'')+(i>curIdx()?' locked':'')+(st.mastered?' done':'');
    el.innerHTML=`${i===curIdx()?`<div class="here">${Fun.bixMini()}</div>`:''}<div class="ic">${n.icon}</div><div class="t">${n.short}</div><div class="stars">${'★'.repeat(stars(n.id))}</div>`;
    el.onclick=()=>{ if (i>curIdx()) { Sfx.tap(); Fun.Mascot.say(bh, 'Locked! Finish the skills before it to open it. 🔒', 3000, 'locked'); return; } openNodeMenu(n); };
    p.appendChild(el);
  });
  layoutPath(p);
  if (!renderHome.introDone){ p.classList.add('intro'); p.querySelectorAll('.node').forEach((el,i)=>el.style.animationDelay=(i*0.06)+'s'); renderHome.introDone=true; setTimeout(()=>p.classList.remove('intro'), 1500); }
  requestAnimationFrame(()=>{ layoutPath(p); drawWire(p); });
  Fun.renderGarden($('#garden'), $('#gardenLabel'), days); Treats.renderJar();
  const unseen = Fun.count() - (Fun.data.albumSeen||0); const bd=$('#albumBadge'); bd.textContent = unseen>0 ? '+'+unseen : ''; bd.classList.toggle('on', unseen>0);
}
// Lay the skill beads out as a snake that fits the screen: row 1 left->right, row 2 right->left, ...
function layoutPath(p){
  const nodes=[...p.querySelectorAll('.node')]; if (!nodes.length) return;
  const cs=getComputedStyle(p), w=(p.clientWidth || window.innerWidth) - parseFloat(cs.paddingLeft||0) - parseFloat(cs.paddingRight||0);
  const rows = Math.max(2, Math.ceil(nodes.length*124 / Math.max(1,w))), per = Math.ceil(nodes.length/rows);
  p.style.gridTemplateColumns = `repeat(${per}, 1fr)`;
  nodes.forEach((el,i)=>{ const r=Math.floor(i/per), c=i%per; el.style.gridRow = r+1; el.style.gridColumn = (r%2===0 ? c : per-1-c) + 1; });
}
// Thread a smooth wire through the centres of the skill beads (the bead-maze look).
function drawWire(p){
  const old=p.querySelector('.wire'); if (old) old.remove();
  const beads=[...p.querySelectorAll('.node .ic')]; if (beads.length<2 || !p.clientWidth) return;
  const pr=p.getBoundingClientRect();
  const pts=beads.map(b=>{ const r=b.getBoundingClientRect(); return [r.left-pr.left+p.scrollLeft+r.width/2, r.top-pr.top+r.height/2]; });
  const first=pts[0], last=pts[pts.length-1], prev=pts[pts.length-2];
  const lead = 46, endDir = Math.sign(last[0]-prev[0]) || 1;
  let d=`M ${first[0]-lead} ${first[1]} L ${first[0]} ${first[1]}`;
  for (let i=1;i<pts.length;i++){
    const [x0,y0]=pts[i-1], [x1,y1]=pts[i];
    if (Math.abs(x1-x0) < 30){            // U-turn down to the next row: loop out past the edge bead
      const dir = (i>=2 && pts[i-2][0] > x0) ? -1 : 1, bulge = 115*dir;
      d+=` C ${x0+bulge} ${y0}, ${x1+bulge} ${y1}, ${x1} ${y1}`;
    } else { const dx=(x1-x0)/2; d+=` C ${x0+dx} ${y0}, ${x1-dx} ${y1}, ${x1} ${y1}`; }
  }
  d+=` L ${last[0]+lead*endDir} ${last[1]}`;
  const ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg'); svg.setAttribute('class','wire');
  // small end caps so the wire looks fastened, like a bead-maze toy
  for (const [x,y] of [[first[0]-lead, first[1]], [last[0]+lead*endDir, last[1]]]){ const c=document.createElementNS(ns,'circle'); c.setAttribute('cx',x); c.setAttribute('cy',y); c.setAttribute('r',7); c.setAttribute('class','cap'); svg.appendChild(c); }
  svg.setAttribute('width', p.scrollWidth); svg.setAttribute('height', p.scrollHeight); svg.style.width=p.scrollWidth+'px'; svg.style.height=p.scrollHeight+'px';
  const path=document.createElementNS(ns,'path'); path.setAttribute('d', d); svg.appendChild(path); p.prepend(svg);
}
window.addEventListener('resize', ()=>{ if ($('#home').classList.contains('active')){ const p=$('#path'); layoutPath(p); requestAnimationFrame(()=>drawWire(p)); } });
// Tapping Bix on the home screen asks for a name if the device doesn't have one yet.
$('#bixHome').addEventListener('pointerup', ()=>{ if (settings.name) return; setTimeout(()=>{ Fun.Mascot.say($('#bixHome'), "I don't know your name yet! Tap me to tell me. 😊", 0, 'ask_name'); $('#nameAskIn').value=''; $('#nameAsk').classList.add('active'); setTimeout(()=>$('#nameAskIn').focus(),200); }, 250); });
function saveAskedName(){ const n=$('#nameAskIn').value.trim().replace(/\s+/g,' ').slice(0,20); if(!n){ $('#nameAskIn').focus(); return; } settings.name=n; saveSettings(); $('#nameAsk').classList.remove('active'); Sfx.ok(); renderHome(); Fun.Mascot.react($('#bixHome'),'cheer'); Fun.Mascot.say($('#bixHome'), `Hi, ${n}! Now I know you! 🎉`, 0, 'got_name'); }
$('#nameAskOk').addEventListener('click', saveAskedName);
$('#nameAskIn').addEventListener('keydown', e=>{ if(e.key==='Enter') saveAskedName(); });
$('#nameAskNo').addEventListener('click', ()=>$('#nameAsk').classList.remove('active'));
function hasLesson(n){ return !!(n.demos || n.kind==='numbers'); }
const STEP_INFO = { lesson:['📖','Learn'], visual:['👀','Look'], listen:['👂','Listen'], flash:['⚡️','Flash'], game:['🎮','Game'] };
// Three short steps a day: learn/practise, a game, then the other practice mode. Regenerated each day.
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
  // Keep the plan in step with the current skill (it can change mid-day: unlocked, or set by a grown-up).
  const needLesson = hasLesson(n) && !node(n.id).lesson; let changed=false;
  for (const s of F.today.steps){
    if (s.done) continue;
    if (s.kind==='lesson' && !needLesson){ const used=F.today.steps.map(x=>x.kind); s.kind = n.kind==='flash' ? 'flash' : (used.includes('visual') ? 'listen' : 'visual'); changed=true; }
  }
  const first=F.today.steps[0];
  if (needLesson && !first.done && first.kind!=='lesson' && !F.today.steps.some(x=>x.kind==='lesson')){ first.kind='lesson'; changed=true; }
  if (changed) Fun.save();
  return F.today.steps.map(s=>{ const [icon,label]=STEP_INFO[s.kind]; const g=s.game&&Games.GAMES[s.game]; return Object.assign({}, s, { icon: g?g.icon:icon, label: g?g.name:label }); });
}
function startStep(s){
  const n=NODES[curIdx()];
  if (s.kind==='lesson') return startLesson(n);
  if (s.kind==='game') return Games.open(s.game);
  if ((s.kind==='visual'||s.kind==='listen') && hasLesson(n) && !node(n.id).lesson) return startLesson(n);   // learn a new skill before drilling it
  if (s.kind==='flash') return startDrill('flash', n);
  return startDrill(s.kind, n.kind==='flash' ? C.BY_ID.combined : n);
}
// Called whenever she finishes something: plants today's flower, gives a sticker, ticks today's step.
async function activityDone(kind, info={}){
  days[todayKey()]=true; save('days',days);
  const F=Fun.data; if (F.today && F.today.day===todayKey()){ const st=F.today.steps.find(s=>!s.done && s.kind===kind); if (st) st.done=true; }
  Fun.save();
  await Fun.give({gold: !!info.gold});
  Treats.earn(Treats.EARN.activity + (info.gold ? Treats.EARN.gold : 0), info.gold ? 'finished + gold sticker' : 'for finishing');
  if (info.leveled){ await sleep(2300); Treats.earn(Treats.EARN.skill, 'new skill unlocked!'); }
  if (F.today && F.today.day===todayKey() && F.today.steps.every(s=>s.done) && !F.today.celebrated){
    F.today.celebrated=true; F.garden[todayKey()]='full'; Fun.save();
    await sleep(2300); Fun.confetti(120); Sfx.star();
    await Fun.give({gold:true, title:'Today’s practice is done! 🌸', voice:'today_done'});
    Treats.earn(Treats.EARN.today, 'Today’s practice done!');
  }
  if ($('#home').classList.contains('active')) renderHome();
}
$('#todayGo').addEventListener('click', ()=>{ Speaker.unlock(); const st=todaySteps(); const s=st.find(x=>!x.done); if (s) startStep(s); else goPlay(); });
function goPlay(){ Games.renderHub(); const bp=$('#bixPlay'); if (!bp.querySelector('.bix')) Fun.Mascot.mount(bp,{size:84}); Fun.Mascot.say(bp, 'Pick a game! Every game gives a sticker.', 0, 'play_pick'); show('play'); }
function goAlbum(){ Fun.renderAlbum(); Fun.data.albumSeen=Fun.count(); Fun.save(); show('album'); }
$('#exitPlay').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#exitGame').addEventListener('click', ()=>{ Games.stop(); goPlay(); });
$('#exitAlbum').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#jar').addEventListener('click', ()=>{ Sfx.tap(); Treats.open(); });
$('#exitShop').addEventListener('click', ()=>{ renderHome(); show('home'); });
$$('.tile').forEach(t=>t.addEventListener('click', ()=>{
  Speaker.unlock();
  const n=NODES[curIdx()]; const m=t.dataset.mode;
  if (m==='play') return goPlay();
  if (m==='album') return goAlbum();
  if (m==='learn'){ const target = hasLesson(n) ? n : NODES.slice(0,curIdx()).reverse().find(x=>x.demos) || n; startLesson(target); }
  else if (m==='flash') startDrill('flash', n.kind==='flash' ? n : NODES[curIdx()]);
  else startDrill(m, n.kind==='flash' ? C.BY_ID.combined : n);
}));
let menuNode=null;
function openNodeMenu(n){ menuNode=n; $('#nmTitle').textContent=n.icon+' '+n.title; $('#nmIntro').textContent=n.intro; $('#nmLearn').style.display=(n.demos||n.kind==='numbers')?'':'none'; $('#nmLook').style.display=(n.drill&&!n.drill.flash)?'':'none'; $('#nmListen').style.display=(n.drill&&!n.drill.flash)?'':'none'; $('#nodemenu').classList.add('active'); }
$('#nmClose').onclick=()=>$('#nodemenu').classList.remove('active');
$('#nmLearn').onclick=()=>{ $('#nodemenu').classList.remove('active'); startLesson(menuNode); };
$('#nmLook').onclick=()=>{ $('#nodemenu').classList.remove('active'); startDrill('visual', menuNode); };
$('#nmListen').onclick=()=>{ $('#nodemenu').classList.remove('active'); startDrill('listen', menuNode); };

/* ---------------- lesson ---------------- */
let lessonAb=null, L=null;
function friendsHtml(n){ if(n.family===5) return ['1 & 4','2 & 3'].map(x=>`<span>${x}</span>`).join(''); if(n.family===10) return ['1 & 9','2 & 8','3 & 7','4 & 6','5 & 5'].map(x=>`<span>${x}</span>`).join(''); return ''; }
function startLesson(n){
  Speaker.unlock();
  if (!lessonAb){ lessonAb = new Soroban($('#lessonAbacus'), {rods:5, interactive:true, onChange:(v)=>onLessonBeads(v)}); lessonAb.el.classList.add('big'); }
  lessonAb.showLabels=true; lessonAb.reset();
  L = { node:n, phase:'intro', demoIdx:0, step:0, guidedIdx:0, steps:null, busy:false };
  $('#lessonTitle').textContent=n.icon+' '+n.title; $('#capFriends').innerHTML=friendsHtml(n);
  show('lesson'); renderLesson();
}
function lessonTotal(){ const n=L.node; const demos=n.kind==='numbers'? n.lesson.numbers.length : n.demos.length; const guided=n.kind==='numbers'?0:n.guided.length; return demos+guided+1; }
function lessonDone(){ const n=L.node; const d=n.kind==='numbers'? L.phase==='numbers'?L.demoIdx:0 : L.phase==='demo'?L.demoIdx : L.phase==='guided'? n.demos.length+L.guidedIdx : L.phase==='done'? lessonTotal() : 0; return d; }
function cap(kind, text, prob){ $('#capKind').textContent=kind; $('#capText').innerHTML=text; $('#capProb').textContent = prob===undefined ? $('#capProb').textContent : (prob||''); }
async function renderLesson(){
  const n=L.node; $('#lessonProg').style.width=(100*lessonDone()/lessonTotal())+'%'; $('#lessonHint').style.display='none';
  if (L.phase==='intro'){ cap('New skill', n.intro, ''); $('#lessonNext').textContent='Show me ▶'; lessonAb.reset(); return; }
  if (L.phase==='numbers'){ // beads node: set each number
    const v=n.lesson.numbers[L.demoIdx]; L.target=v; lessonAb.reset();
    cap('Your turn', `Show <b>${v}</b> on the abacus. Tap beads to move them.`, String(v)); $('#lessonNext').textContent='Skip ▶'; return;
  }
  if (L.phase==='demo'){
    const [t,d]=n.demos[L.demoIdx]; L.steps=C.explain(t,d); L.step=0; lessonAb.value=t;
    cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, '', `${t} ${d<0?'−':'+'} ${Math.abs(d)}`); if (L.demoIdx===0) Fun.BixVoice.play('lesson_watch'); $('#lessonNext').textContent='Next ▶';
    await playSteps(lessonAb, L.steps, (s)=>cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, s.say.replace(/(\d+)/g,'<b>$1</b>')));
    return;
  }
  if (L.phase==='guided'){
    const [t,d]=n.guided[L.guidedIdx]; L.target=t+d; lessonAb.value=t;
    cap(`Your turn ${L.guidedIdx+1} of ${n.guided.length}`, `The abacus shows <b>${t}</b>. Now ${d<0?'take away':'add'} <b>${Math.abs(d)}</b>.`, `${t} ${d<0?'−':'+'} ${Math.abs(d)}`);
    $('#lessonNext').textContent='Skip ▶'; $('#lessonHint').style.display=''; if (L.guidedIdx===0) Fun.BixVoice.play('lesson_turn'); return;
  }
  if (L.phase==='done'){ cap('Done!', `You learned <b>${n.title}</b>. Now practise it with Look & Listen.`, '🎉'); $('#lessonNext').textContent='Finish ✓'; node(n.id).lesson=true; saveProgress(); Sfx.star(); if (!L.awarded){ L.awarded=true; Fun.confetti(70); Fun.BixVoice.play('lesson_done'); setTimeout(()=>activityDone('lesson'), 2600); } return; }
}
let animToken=0;
async function playSteps(ab, steps, onStep){
  const my=++animToken; L.busy=true;
  for (const s of steps){ if (my!==animToken) return; onStep(s); for (const m of s.do){ if (my!==animToken) return; await ab.move(m.rod, m.delta, 450); } await sleep(s.do.length?600:900); }
  if (my===animToken) L.busy=false;
}
function onLessonBeads(v){
  if (L.busy) return;
  if (L.phase==='numbers' || L.phase==='guided'){
    if (v===L.target){ Sfx.ok(); Fun.BixVoice.play('lesson_yes'); cap('Yes! ✓', `<b>${v}</b> — that's it.`); lessonAb.clearHighlights(); L.busy=true; setTimeout(()=>{ L.busy=false; advanceLesson(); }, 900); }
  }
}
function advanceLesson(){
  const n=L.node; animToken++; L.busy=false; lessonAb.clearHighlights();
  if (L.phase==='intro'){ L.phase = n.kind==='numbers' ? 'numbers' : 'demo'; L.demoIdx=0; }
  else if (L.phase==='numbers'){ L.demoIdx++; if (L.demoIdx>=n.lesson.numbers.length) L.phase='done'; }
  else if (L.phase==='demo'){ L.demoIdx++; if (L.demoIdx>=n.demos.length){ L.phase='guided'; L.guidedIdx=0; } }
  else if (L.phase==='guided'){ L.guidedIdx++; if (L.guidedIdx>=n.guided.length) L.phase='done'; }
  else if (L.phase==='done'){ renderHome(); show('home'); return; }
  renderLesson();
}
$('#lessonNext').addEventListener('click', ()=>advanceLesson());
$('#lessonHint').addEventListener('click', async()=>{ if (L.busy) return; const gi=L.guidedIdx; const [t,d]=L.node.guided[gi]; const steps=C.explain(t,d); lessonAb.value=t; const tok=animToken+1; await playSteps(lessonAb, steps, s=>cap('Show me', s.say.replace(/(\d+)/g,'<b>$1</b>'))); if (tok!==animToken || L.phase!=='guided' || L.guidedIdx!==gi) return; lessonAb.value=t; cap(`Your turn ${gi+1} of ${L.node.guided.length}`, `Now you: the abacus shows <b>${t}</b>. ${d<0?'Take away':'Add'} <b>${Math.abs(d)}</b>.`); });
$('#exitLesson').addEventListener('click', ()=>{ animToken++; renderHome(); show('home'); });

/* ---------------- drills ---------------- */
let mode='visual', drillNode=null, problems=[], idx=0, results=[], entry='', t0=0, tick=null, reviewing=false, locked=false, wakeLock=null, reviewQueue=[];
function drillConfig(n){ const c=Object.assign({}, n.drill); if (settings.operands>0) c.operands=settings.operands; if (mode==='flash'){ c.operands=settings.flashN; c.allowSubtraction=false; } return c; }
async function startDrill(m, n){
  mode=m; drillNode=n; reviewing=false; locked=false; listenArmed=false; Speaker.turn=0; Speaker.unlock();
  try { problems = E.generateSet2(drillConfig(n), settings.count); } catch(e){ alert('These settings cannot make problems for this skill.'); return; }
  results = problems.map(()=>null); idx=0; t0=Date.now(); clearInterval(tick); tick=setInterval(renderTimer,500);
  $('#drillLevel').textContent = n.icon+' '+n.short;
  setStages();
  const bd=$('#bixDrill'); if (!bd.querySelector('.bix')) Fun.Mascot.mount(bd,{size:70}); Fun.Mascot.say(bd, mode==='listen'?'Listen carefully!':mode==='flash'?'Watch the numbers!':'You can do it!', 2200, mode==='listen' ? null : mode==='flash' ? 'drill_flash' : 'drill_look');
  show('drill');
  presentProblem();                       // start speaking while we are still inside the tap
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
// Show only the stage for the current mode (Look: numbers; Listen: ear; Flash: dark stage). Used by drills and by the fix pass.
function setStages(){
  $('#problemArea').innerHTML='';
  $('#problemArea').style.display = mode==='visual'?'flex':'none';
  $('#listenStage').style.display = mode==='listen'?'flex':'none';
  $('#flashStage').style.display = mode==='flash'?'flex':'none';
  $('#flashSpeed').style.display = mode==='flash'?'flex':'none';
  if (mode==='listen') setupGapSlider(); if (mode==='flash') setupFlashSlider();
}
function endDrill(){ clearInterval(tick); dictateToken++; Speaker.stop(); if (wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; } }
function renderTimer(){ const s=Math.floor((Date.now()-t0)/1000); $('#timer').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
function renderStrip(){ const st=$('#strip'); st.innerHTML=''; problems.forEach((p,i)=>{ const d=document.createElement('div'); d.className='sq'+(i===idx?' cur':'')+(results[i]===true||p._fixed?' ok':results[i]===false?' bad':'')+(p._fixed?' fixed':''); d.textContent=i+1; st.appendChild(d); }); }
function setEntry(v){ entry=v; $('#answer').textContent=v||' '; }
function presentProblem(){
  const p=problems[idx]; setEntry(''); $('#feedback').textContent=''; $('#feedback').className='feedback'; $('#reveal').textContent=''; $('#showMeBtn').style.display=reviewing?'':'none'; renderStrip();
  if (mode==='visual'){ const area=$('#problemArea'); area.innerHTML=''; p.terms.forEach(t=>{ const d=document.createElement('div'); d.className='term'+(t<0?' neg':''); d.textContent=t<0?'−'+Math.abs(t):t; area.appendChild(d); }); locked=false; }
  else if (mode==='listen'){ if (!listenArmed) armListen(p); else dictate(p); }
  else armFlash(p);
}
let dictateToken=0, listenArmed=false;
function armListen(p){ // show a "Ready" button; the tap that presses it starts the audio inside a user gesture (iOS needs this)
  locked=true; $('#replayBtn').disabled=true; $('#listenMsg').textContent='Tap when you are ready';
  const b=$('#listenGo'); b.style.display=''; b.onclick=()=>{ b.style.display='none'; listenArmed=true; Speaker.unlock(); dictate(p); };
}
async function dictate(p){
  Fun.BixVoice.stop();
  const my=++dictateToken; locked=true; $('#replayBtn').disabled=true; $('#listenGo').style.display='none';
  if (!p._reader){ await Speaker.prepare(); p._reader = Speaker.pickReader(); } else Speaker.activePid = p._reader;   // replay keeps the same reader
  if (my!==dictateToken) return;
  $('#listenMsg').textContent = p._reader ? `${profileName(p._reader)} is reading…` : 'Listen…';
  const gap=settings.gap; const pulse=(ms)=>{ $('#ear').classList.add('pulse'); setTimeout(()=>$('#ear').classList.remove('pulse'),ms); };
  const finishUI=()=>{ if (my!==dictateToken) return; $('#listenMsg').textContent='Your answer?'; locked=false; $('#replayBtn').disabled=p._replayed===true; };
  const watchdog=setTimeout(()=>{ if (my===dictateToken && locked){ Diag.add('watchdog: dictation did not finish; unlocking'); $('#listenMsg').textContent='Sound problem — tap "say it again"'; locked=false; $('#replayBtn').disabled=false; } }, (p.terms.length*gap+12)*1000);
  try{
    Speaker.stop();
    Diag.add(`dictate start voice=${settings.voice} kind=${Speaker.kind()} ctx=${Speaker.ctx?Speaker.ctx.state:'none'} tts=${('speechSynthesis' in window)?('voices '+speechSynthesis.getVoices().length+(speechSynthesis.speaking?' speaking':'')+(speechSynthesis.paused?' paused':'')):'n/a'}`);
    let scheduled=false;
    if (Speaker.kind()!=='device'){
      await Speaker.prepare(); if (my!==dictateToken) return;
      try{ if (Speaker.ctx && Speaker.ctx.state!=='running') await Promise.race([Speaker.ctx.resume(), sleep(1500)]); }catch(e){}
      scheduled = Speaker.canSchedule() && Speaker.ctx && Speaker.ctx.state==='running';
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
      for (let i=0;i<p.terms.length;i++){ if(my!==dictateToken) return; const started=Date.now(); pulse(800); const r=await Speaker.sayDevice(termText(p.terms[i],i===0)); Diag.add(`said "${termText(p.terms[i],i===0)}" ${r}`); const spent=(Date.now()-started)/1000; if(i<p.terms.length-1) await sleep(Math.max(150,(gap-spent)*1000)); }
    }
    if (my!==dictateToken) return; await sleep(settings.answerPause*1000);
    finishUI();
  }catch(e){ Diag.add('dictate error '+(e&&e.message||e)); finishUI(); }
  finally{ clearTimeout(watchdog); }
}
$('#replayBtn').addEventListener('click', ()=>{ const p=problems[idx]; if(p._replayed) return; p._replayed=true; dictate(p); });
function setupGapSlider(){ const s=$('#gapSlider'); s.min=settings.gapMin; s.max=settings.gapMax; s.value=settings.gap; s.style.direction='rtl'; $('#gapVal').textContent=settings.gap+'s'; s.oninput=()=>{ settings.gap=parseFloat(s.value); $('#gapVal').textContent=settings.gap+'s'; saveSettings(); }; }
function setupFlashSlider(){ const s=$('#flashSlider'); s.value=settings.flashSec; s.style.direction='rtl'; $('#flashVal').textContent=settings.flashSec.toFixed(1)+'s'; s.oninput=()=>{ settings.flashSec=parseFloat(s.value); $('#flashVal').textContent=settings.flashSec.toFixed(1)+'s'; saveSettings(); }; }
// Flash: she taps Ready (after clearing her abacus), numbers pop up one at a time with their + / − sign, then she types the total.
function flashDots(n, on){ $('#flashDots').innerHTML = Array.from({length:n},(_,i)=>`<i class="${i<on?'on':''}"></i>`).join(''); }
function flashSign(t, i){ return (i===0 ? (t<0?'<b>−</b>':'') : `<b>${t<0?'−':'+'}</b>`) + Math.abs(t); }
function armFlash(p){
  ++dictateToken; locked=true; const el=$('#flashNum'); el.className='flash-num hint'; el.textContent='+ − +';
  flashDots(p.terms.length, 0); $('#flashAgain').style.display='none';
  $('#flashMsg').innerHTML = idx===0 && !reviewing ? 'Clear your abacus.<br>Numbers will pop up one at a time — add them all up!' : 'Clear your abacus, then tap Ready.';
  const b=$('#flashGo'); b.style.display=''; b.onclick=()=>{ b.style.display='none'; Speaker.unlock(); flash(p); };
}
async function flash(p){
  const my=++dictateToken; locked=true; const el=$('#flashNum'); el.textContent=''; el.className='flash-num';
  $('#flashMsg').textContent='Watch…'; $('#flashGo').style.display='none'; $('#flashAgain').style.display='none'; flashDots(p.terms.length, 0); await sleep(600);
  for (let i=0;i<p.terms.length;i++){ if(my!==dictateToken) return; const t=p.terms[i]; el.className='flash-num pop'+(t<0?' neg':''); el.innerHTML=flashSign(t,i); flashDots(p.terms.length, i+1); await sleep(settings.flashSec*1000); el.textContent=''; el.className='flash-num'; await sleep(180); }
  if(my!==dictateToken) return; el.className='flash-num ask'; el.textContent='= ?';
  $('#flashMsg').textContent='What did you get? Tap it in on the keypad.'; $('#flashAgain').style.display=''; locked=false;
}
$('#flashAgain').addEventListener('click', ()=>{ if (mode==='flash' && problems[idx]) flash(problems[idx]); });
$('#pad').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b||locked) return; const k=b.dataset.k; Sfx.tap(); if(k==='del') setEntry(entry.slice(0,-1)); else if(k==='go') submit(); else if(entry.length<4) setEntry(entry+k); });
document.addEventListener('keydown', e=>{ if(!$('#drill').classList.contains('active')||locked) return; if(/^[0-9]$/.test(e.key)&&entry.length<4) setEntry(entry+e.key); else if(e.key==='Backspace') setEntry(entry.slice(0,-1)); else if(e.key==='Enter') submit(); });
async function submit(){
  if (entry==='') return; const p=problems[idx]; const ok=parseInt(entry,10)===p.answer; locked=true; const fb=$('#feedback');
  const bd=$('#bixDrill');
  if (ok){ fb.textContent='Yes! ✓'; fb.className='feedback ok'; Sfx.ok(); Fun.Mascot.react(bd,'happy'); if (Math.random()<0.35) { const k=Math.floor(Math.random()*6); Fun.Mascot.say(bd, ['Yes!','Nice!','You got it!','Fantastic!','Super!','Wow!'][k], 1400, (!settings.speakFeedback && mode!=='listen') ? 'yes_'+(k+1) : null); } if(!reviewing){ results[idx]=true; record(p,true); } else { p._fixed=true; fb.textContent='Fixed! ✓'; renderStrip(); } if(settings.speakFeedback) Speaker.say(null,'yes'); await sleep(650); }
  else {
    fb.textContent='Not quite'; fb.className='feedback bad'; Sfx.bad(); Fun.Mascot.react(bd,'oops'); if (!reviewing) { const k=Math.floor(Math.random()*3); Fun.Mascot.say(bd, ['Oops! We\'ll fix it later.','Almost! Keep going.','That\'s OK. Next one!'][k], 1800, (!settings.speakFeedback && mode!=='listen') ? 'oops_'+(k+1) : null); } $('#answer').classList.add('shake'); setTimeout(()=>$('#answer').classList.remove('shake'),500);
    if(settings.speakFeedback) Speaker.say(null,'not quite');
    if(!reviewing){ results[idx]=false; p._given=entry; record(p,false); await sleep(800); }
    else {
      // In the fix pass a wrong answer is a teaching moment: watch the bead moves, then try the same problem again.
      Fun.Mascot.say(bd, 'Let\'s watch the beads together.', 2200, 'fix_watch');
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
function finish(){
  endDrill(); const correct=results.filter(r=>r===true).length; const secs=Math.round((Date.now()-t0)/1000); let leveled=false;
  if (!reviewing){
    history.unshift({ at:new Date().toISOString(), mode, node:drillNode.id, count:problems.length, correct, secs, gap:mode==='listen'?settings.gap:null,
      missed: problems.map((p,i)=>results[i]===false?{terms:p.terms,answer:p.answer,given:p._given,rules:p.rulesUsed}:null).filter(Boolean) });
    history=history.slice(0,200); save('history',history); days[todayKey()]=true; save('days',days);
    leveled = checkMastery(drillNode.id); saveProgress();
  }
  const pct=correct/problems.length; const n= pct>=0.9?3:pct>=0.7?2:1;
  $('#sumStars').innerHTML = [1,2,3].map(i=>`<span class="${i<=n?'':'off'}">★</span>`).join('');
  $('#sumTitle').textContent = pct===1?'Perfect!':pct>=0.9?'Excellent!':pct>=0.7?'Great job!':'Good practice!';
  $('#sumScore').textContent = correct+' / '+problems.length; $('#sumTime').textContent=Math.floor(secs/60)+' min '+(secs%60)+' sec';
  const allFixed = reviewing && problems.every((p,i)=>results[i]===true || p._fixed);
  $('#sumNote').textContent = leveled ? `🎉 You unlocked: ${NODES[curIdx()].title}!` : allFixed ? 'All fixed ✓ Great fixing!' : '';
  const toFix=problems.map((p,i)=>results[i]===false&&!p._fixed?i:-1).filter(i=>i>=0); $('#fixBtn').style.display=toFix.length?'':'none';
  const bs=$('#bixSum'); if (!bs.querySelector('.bix')) Fun.Mascot.mount(bs,{size:110});
  Fun.Mascot.say(bs, allFixed ? 'You fixed every one! 🌟' : leveled ? 'You unlocked a new skill! 🎉' : n===3 ? 'Amazing work!' : n===2 ? 'Great job! Fix the red ones with me?' : 'Good practice! Every try makes you stronger.', 0, allFixed ? 'sum_fixed' : leveled ? 'sum_unlock' : n===3 ? 'sum_amazing' : n===2 ? 'sum_great' : 'sum_good');
  show('summary'); Fun.Mascot.react(bs, n>=2||leveled?'cheer':'happy', 1800);
  if (n===3||leveled){ Sfx.star(); Fun.confetti(); } else Sfx.ok();
  if (!reviewing) setTimeout(()=>activityDone(mode, {gold: n===3, leveled}), 2400);   // let the stars and Bix land first
}
$('#fixBtn').addEventListener('click', ()=>{
  reviewQueue=problems.map((p,i)=>results[i]===false&&!p._fixed?i:-1).filter(i=>i>=0); if(!reviewQueue.length) return;
  Speaker.unlock(); reviewing=true; idx=reviewQueue[0]; t0=Date.now(); clearInterval(tick); tick=setInterval(renderTimer,500);
  setStages(); show('drill');
  Fun.Mascot.say($('#bixDrill'), reviewQueue.length===1 ? 'Let\'s fix this one!' : `Let's fix these ${reviewQueue.length}!`, 2200, mode==='listen' ? null : (reviewQueue.length===1 ? 'fix_one' : 'fix_start'));
  presentProblem();            // same mode as the drill: Listen re-reads the problem, Look shows it, Flash re-flashes it
});
$('#showMeBtn').addEventListener('click', async()=>{ if(locked) return; locked=true; await showMe(problems[idx]); locked=false; });
$('#againBtn').addEventListener('click', ()=>startDrill(mode, drillNode));
$('#homeBtn').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#exitDrill').addEventListener('click', ()=>{ endDrill(); renderHome(); show('home'); });

/* ---------------- show me (animated solution) ---------------- */
let showAb=null, showToken=0;
async function showMe(p){
  if (!showAb) showAb = new Soroban($('#showmeAbacus'), {rods:4, interactive:false}); showAb.showLabels=true;
  $('#showme').classList.add('active');
  const probHtml=(k)=>p.terms.map((t,i)=>`<span class="${i===k?'cur':''}">${i===0?t:(t<0?' − '+(-t):' + '+t)}</span>`).join('');
  const run = async()=>{ const my=++showToken; showAb.value=0; let total=0; $('#showmeText').textContent='Watch.'; $('#showmeProb').innerHTML=probHtml(-1); await sleep(500);
    for (let i=0;i<p.terms.length;i++){ const d=p.terms[i]; $('#showmeProb').innerHTML=probHtml(i); if (i===0){ $('#showmeText').innerHTML=`Start with <b>${d}</b>.`; showAb.value=d; total=d; await sleep(900); continue; }
      const steps=C.explain(total,d); for (const s of steps){ if(my!==showToken) return; $('#showmeText').innerHTML=s.say.replace(/(\d+)/g,'<b>$1</b>'); for(const m of s.do) await showAb.move(m.rod,m.delta,420); await sleep(s.do.length?500:800); } total+=d; }
    if(my===showToken){ $('#showmeText').innerHTML=`The answer is <b>${p.answer}</b>.`; $('#showmeProb').innerHTML=probHtml(-1)+' = '+p.answer; } };
  $('#showmeReplay').onclick=run;
  await new Promise(res=>{ $('#showmeClose').onclick=()=>{ showToken++; $('#showme').classList.remove('active'); res(); }; run(); });
}

/* ---------------- parent gate ---------------- */
let gateAnswer=0; $('#grownups').addEventListener('click', openGate);
// Grown-ups gate: a 3-digit number written in words, typed as digits. Soroban kids can multiply,
// so a sum is too easy; reading and converting "seven hundred forty-two" is an adult-level task (Apple guideline 1.3).
const GATE_ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const GATE_TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function numberWords(n){ const h=Math.floor(n/100), r=n%100; let s=h?GATE_ONES[h]+' hundred':''; if(r){ s+=(s?' ':'')+(r<20?GATE_ONES[r]:GATE_TENS[Math.floor(r/10)]+(r%10?'-'+GATE_ONES[r%10]:'')); } return s; }
function openGate(){ gateAnswer=100+Math.floor(Math.random()*900); window.__gateAnswer=gateAnswer;
  $('#gateQ').innerHTML='<small>Grown-ups: type this number in digits</small>'+numberWords(gateAnswer); $('#gateA').value=''; show('gate'); setTimeout(()=>$('#gateA').focus(),50); }
$('#gateCancel').addEventListener('click', ()=>show('home'));
$('#gateOk').addEventListener('click', ()=>{ if(parseInt($('#gateA').value,10)===gateAnswer){ renderParent(); show('parent'); } else { openGate(); } });
$('#gateA').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#gateOk').click(); });

/* ---------------- parent ---------------- */
function bindRange(id,key,fmt){ const el=$(id), v=$(id+'V'); el.value=settings[key]; v.textContent=(fmt||(x=>x))(settings[key]); el.oninput=()=>{ settings[key]=parseFloat(el.value); v.textContent=(fmt||(x=>x))(settings[key]); saveSettings(); }; }
function bindSwitch(id,key,after){ const el=$(id); el.classList.toggle('on',!!settings[key]); el.onclick=()=>{ settings[key]=!settings[key]; el.classList.toggle('on',settings[key]); saveSettings(); if(after) after(); }; }
// One glance at whether this device is set up well. Each row: status, what it means, and a button to fix it.
async function renderChecklist(){
  const box=$('#setupList'); if(!box) return;
  const standalone = (navigator.standalone===true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let persisted=null; try{ if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); }catch(e){}
  const n=NODES[curIdx()], learned=NODES.filter(x=>node(x.id).mastered).length;
  const treats=Treats.list(), isDefault = JSON.stringify(treats.map(t=>[t.emoji,t.name,t.price]))===JSON.stringify(Treats.DEFAULT_TREATS.map(t=>[t.emoji,t.name,t.price]));
  const vk=Speaker.kind(), voice = vk==='rec' ? (settings.voice==='rec:turns' ? 'Family voices taking turns' : `${profileName(settings.voice.slice(4))}'s recorded voice`) : vk==='sprite' ? 'Built-in recorded voice' : 'The device voice';
  const lb=settings.lastBackup ? new Date(settings.lastBackup) : null, days_ = lb ? Math.floor((Date.now()-lb)/864e5) : null;
  const rows=[
    [settings.name?'ok':'todo', 'Child’s name', settings.name ? settings.name : 'Not set yet. Bix will greet them by name.', settings.name?'':'<button class="btn small ghost" data-go="name">Set name</button>'],
    ['ok', 'Current skill', `${n.icon} ${n.title} (${learned} skill${learned===1?'':'s'} learned). Check this matches their class.`, '<button class="btn small ghost" data-go="skill">Change</button> <button class="btn small ghost" data-go="check">Level check</button>'],
    [standalone?'ok':'todo', 'Home Screen app', standalone ? 'Installed. Safari will keep the data.' : 'Running in a browser tab. Safari can delete data after about a week without use. In Safari: Share ⬆︎ → Add to Home Screen, then open it from the icon.', ''],
    [persisted===false && !standalone ? 'todo':'ok', 'Storage', persisted ? 'Protected by the browser.' : standalone ? 'Home Screen app storage.' : 'Not protected yet (install to the Home Screen).', ''],
    [isDefault?'warn':'ok', 'Treats', isDefault ? 'Starter list: a snack, a story, a game together, choosing dinner, a park trip, an ice cream outing. Change it to what motivates this child.' : `${treats.length} treats set.`, '<button class="btn small ghost" data-go="treats">Edit treats</button>'],
    ['ok', 'Listening voice', voice+'.', '<button class="btn small ghost" data-go="voice">Change</button>'],
    [lb ? (days_>30?'warn':'ok') : 'warn', 'Backup', lb ? `Last saved ${days_===0?'today':days_===1?'yesterday':days_+' days ago'}.` : 'Never saved. Save one so progress can be restored if the device is lost or reset.', '<button class="btn small ghost" data-go="backup">Back up</button>'],
  ];
  box.innerHTML = rows.map(([st,t,d,btn])=>`<div class="ck ${st}"><span class="ck-i">${st==='ok'?'✓':st==='warn'?'!':'○'}</span><div class="ck-t"><b>${t}</b><span>${d}</span></div><div class="ck-b">${btn}</div></div>`).join('');
  const go={ name:'#sName', skill:'#sNode', treats:'#tpList', voice:'#sVoice', backup:'#bkMake' };
  box.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>{ const k=b.dataset.go; if (k==='check'){ Recorder.stop(); return Setup.open('check'); } const el=$(go[k]); el.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>{ el.focus && el.focus(); el.classList.add('flashme'); setTimeout(()=>el.classList.remove('flashme'),1600); }, 400); });
}
async function renderParent(){
  for (const pp of profiles()) { try{ await Speaker.loadRec(pp.id, true); }catch(e){} }
  const sel=$('#sNode'); sel.innerHTML=''; NODES.forEach(n=>{ const o=document.createElement('option'); o.value=n.id; o.textContent=n.icon+' '+n.title; sel.appendChild(o); }); sel.value=progress.current;
  sel.onchange=()=>{ setTimeout(renderChecklist,0); progress.current=sel.value; const ci=curIdx(); NODES.forEach((n,i)=>{ const st=node(n.id); if(i<ci){ if(!st.mastered) st.mastered='parent'; st.lesson=true; } else if (st.mastered==='parent'){ st.mastered=null; } }); saveProgress(); renderParent(); };
  $('#sName').value=settings.name||''; $('#sName').onchange=()=>{ settings.name=$('#sName').value.trim(); saveSettings(); renderChecklist(); };
  renderChecklist(); renderChildren();
  const tb=$('#nodeTable tbody'); tb.innerHTML='';
  NODES.forEach((n,i)=>{ const st=node(n.id); const h=st.hist.slice(-20); const acc=h.length?Math.round(100*h.filter(x=>x.ok).length/h.length):null; const dn=new Set(h.map(x=>x.day)).size;
    const tr=document.createElement('tr'); const status = st.mastered==='auto'?'<span class="pill good">learned ✓</span>':st.mastered==='parent'?'<span class="pill good">learned (set by you)</span>':st.mastered==='placed'?'<span class="pill good">learned (level check)</span>':i===curIdx()?'<span class="pill">current</span>':'<span class="pill">locked</span>';
    tr.innerHTML=`<td>${n.icon} ${n.title}</td><td>${st.lesson?'✓':'—'}</td><td>${acc===null?'—':`<span class="mini"><i style="width:${acc}%"></i></span>${acc}% (${h.length})`}</td><td>${dn||'—'}</td><td>${status} <button class="btn small ghost" data-toggle="${n.id}" style="padding:4px 10px;min-height:30px;font-size:13px">${st.mastered?'un-learn':'mark learned'}</button></td>`;
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
  $('#recDelete').onclick=async()=>{ const pid=Recorder.pid; if(!pid) return; if(!confirm(`Delete ${profileName(pid)} and all of their recordings?`)) return; await ClipStore.deleteProfile(pid); settings.profiles=profiles().filter(p=>p.id!==pid); if (settings.voice==='rec:'+pid || (settings.voice==='rec:turns' && profiles().filter(p=>Speaker.isComplete(p.id)).length<2)) settings.voice=profiles()[0]?'rec:'+profiles()[0].id:'device'; delete Speaker.recs[pid]; delete Speaker.recLoaded[pid]; saveSettings(); Recorder.pid=null; await renderProfiles(); fillVoiceSelect(); };
  $('#recStart').onclick=async()=>{ Speaker.unlock(); if (await Recorder.start()) $('#recStatus').textContent+=' — microphone ready'; };
  const rb=$('#recBtn'); rb.onpointerdown=e=>{ e.preventDefault(); if(!Recorder.stream){ $('#recStatus').textContent='Tap "Start recording" first.'; return; } Recorder.begin(); };
  rb.onpointerup=rb.onpointerleave=rb.onpointercancel=()=>Recorder.end();
  $('#recPrev').onclick=()=>Recorder.prev(); $('#recNext').onclick=()=>Recorder.next(); $('#recPlay').onclick=()=>Recorder.play();
  // backup
  $('#bkMake').onclick=async()=>{ const b=$('#bkMake'); b.disabled=true; b.textContent='Preparing…'; try{ const f=await Backup.build(); $('#bkSave').style.display=''; $('#bkInfo').textContent=`Ready: ${f.name} (${(f.size/1048576).toFixed(1)} MB, ${profiles().length} voice${profiles().length===1?'':'s'}, progress and settings). Tap "Save file", then choose "Save to Files".`; }catch(e){ $('#bkInfo').textContent='Could not prepare backup: '+(e&&e.message||e); } b.disabled=false; b.textContent='1. Prepare backup'; };
  $('#bkSave').onclick=async()=>{ const r=await Backup.save(); if (r==='shared'||r==='downloaded'){ settings.lastBackup=new Date().toISOString(); saveSettings(); renderChecklist(); } $('#bkInfo').textContent = r==='shared'?'Saved. Keep the file somewhere safe (Files → iCloud Drive is best).': r==='downloaded'?'Downloaded. Check your Downloads folder.' : r==='cancelled'?'Cancelled.':'Prepare the backup first.'; };
  $('#bkOpen').onclick=()=>$('#bkFile').click();
  $('#bkFile').onchange=async()=>{ const f=$('#bkFile').files[0]; $('#bkFile').value=''; if(!f) return; try{ const text=await f.text(); const withProgress=confirm('Restore the children’s progress and settings from this backup too?\n\nOK = voices + progress + settings\nCancel = voices only'); const r=await Backup.restore(text, withProgress); for (const pp of profiles()) await Speaker.loadRec(pp.id, true); Recorder.pid=null; await renderParent(); renderHome(); $('#bkInfo').textContent=`Restored ${r.voices} voice${r.voices===1?'':'s'} (${r.clips} recordings)`+(withProgress?', progress and settings.':'.'); }catch(e){ $('#bkInfo').textContent='Could not restore: '+(e&&e.message||e); } };
  $('#diagLog').textContent=Diag.lines.join('\n');
  $('#diagState').textContent=`voice=${settings.voice} kind=${Speaker.kind()} | AudioContext: ${Speaker.ctx?Speaker.ctx.state:'none'} | device voices: ${('speechSynthesis' in window)?speechSynthesis.getVoices().length:'n/a'} | chosen: ${Speaker.deviceVoice()?Speaker.deviceVoice().name:'none'} | clips: ${Speaker.canSchedule()?'ready':'not loaded'} | ${navigator.userAgent.slice(0,60)}`;
  $('#diagTts').onclick=async()=>{ Speaker.unlock(); const r=await Speaker.sayDevice('seven, plus three'); Diag.add('device test: '+r); $('#diagLog').textContent=Diag.lines.join('\n'); };
  $('#diagBeep').onclick=()=>{ Speaker.unlock(); Sfx.star(); Diag.add('beep ctx='+(Speaker.ctx?Speaker.ctx.state:'none')); $('#diagLog').textContent=Diag.lines.join('\n'); };
  const st=$('#sessions tbody'); st.innerHTML='';
  history.slice(0,20).forEach(h=>{ const tr=document.createElement('tr'); const when=new Date(h.at); const ws=when.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' '+when.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    const missed=(h.missed||[]).map(m=>'<span class="pill bad">'+m.terms.map((t,i)=>i===0?t:(t<0?' − '+(-t):' + '+t)).join('')+' = '+m.answer+(m.given?' (said '+m.given+')':'')+'</span>').join(' ');
    const nn=C.BY_ID[h.node]||C.BY_ID[h.preset]||{short:h.preset||''};
    tr.innerHTML=`<td>${ws}</td><td>${h.mode==='listen'?'Listen'+(h.gap?' '+h.gap+'s':''):h.mode==='flash'?'Flash':'Look'}</td><td>${nn.short||''}</td><td>${h.correct}/${h.count}</td><td>${Math.floor(h.secs/60)}:${String(h.secs%60).padStart(2,'0')}</td><td>${missed||'—'}</td>`; st.appendChild(tr); });
}
$('#parentDone').addEventListener('click', ()=>{ Recorder.stop(); renderHome(); show('home'); });
/* ---------------- children on this device ---------------- */
function childLabel(c){ return c.name || 'New child'; }
function renderChildren(){
  const box=$('#kidsList'); if(!box) return; const act=Store.activeId();
  box.innerHTML=Store.children().map(c=>`<div class="kidrow"><span class="kidname">${esc(childLabel(c))}${c.id===act?' <em>(practising now)</em>':''}</span>${c.id===act?'':`<button class="btn small" data-kidgo="${c.id}">Switch to</button>`}<button class="btn small ghost" data-kidrm="${c.id}">Remove</button></div>`).join('');
  box.querySelectorAll('[data-kidgo]').forEach(b=>b.onclick=()=>{ Store.switchTo(b.dataset.kidgo); location.reload(); });
  box.querySelectorAll('[data-kidrm]').forEach(b=>b.onclick=()=>{ const c=Store.children().find(x=>x.id===b.dataset.kidrm); if(!confirm(`Remove ${childLabel(c)} from this device?\n\nThis erases their progress, stickers, beads, garden and treats. Recorded voices are kept.`)) return; Store.removeChild(c.id); location.reload(); });
}
$('#kidAdd').addEventListener('click', ()=>{ const id=Store.addChild(); Store.switchTo(id); location.reload(); });
// "Who's practising?" when more than one child uses this device.
function showWho(){
  $('#whoList').innerHTML=Store.children().map(c=>`<button class="who-card" data-who="${c.id}"><span class="who-bead"></span><span>${esc(childLabel(c))}</span></button>`).join('');
  $$('#whoList [data-who]').forEach(b=>b.onclick=()=>{ Speaker.unlock(); if(b.dataset.who===Store.activeId()){ sessionStorage.setItem('abacus.who','1'); show('home'); renderHome(); } else { sessionStorage.setItem('abacus.who','1'); Store.switchTo(b.dataset.who); location.reload(); } });
  show('who');
}
$('#switchKid').addEventListener('click', ()=>{ sessionStorage.removeItem('abacus.who'); showWho(); });

/* ---------------- bridge for fun.js and games.js ---------------- */
window.App = {
  show, Sfx, Speaker, get settings(){ return settings; }, saveSettings,
  nodeIndex: ()=>curIdx(), idx: id=>NODE_IDX[id], currentNode: ()=>NODES[curIdx()],
  unlock: ()=>Speaker.unlock(), activityDone, goPlay, renderChecklist,
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
  gameSeconds: null,
};
/* ---------------- boot ---------------- */
window.__diag = Diag;
window.__drill = ()=>({ idx, reviewing, mode, terms: problems[idx]&&problems[idx].terms, answer: problems[idx]&&problems[idx].answer, strip: [...document.querySelectorAll('#strip .sq')].map(e=>e.className.replace('sq','').trim()) });
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
