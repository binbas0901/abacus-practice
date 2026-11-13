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
// Each kind of step is a lacquered bead whose colour means something: red = learn (the main new thing), indigo = Look, ochre = Listen, jade = Flash / Play.
const STEP_LOOK = { lesson:['book','red'], visual:['eye','indigo'], listen:['ear','ochre'], flash:['bolt','jade'], game:['game','jade'] };
function stepBead(s, i, nextI){
  const [ic, col] = STEP_LOOK[s.kind] || ['star','indigo'], cur = i===nextI, w = cur ? 170 : s.done ? 136 : 150;
  const bead = s.done ? WS.bead('jade', w) : WS.bead(col, w);
  const icon = s.done ? WS.icon('check', 40, '#fff', 3.2) : WS.icon(ic, cur ? 40 : 34, cur ? (col==='ochre' ? '#3D2412' : '#fff') : '#6E4126', 2.4);
  const state = s.done ? 'done' : cur ? 'now' : 'later', just = s.done && stepBead.seen && !stepBead.seen[i];
  return `<li class="step hm-step ${state}${just?' just':''}${s.done?' done':''}${cur?' next':''}" aria-label="${esc(s.label)}${s.done?' (done)':cur?' (next)':''}"><span class="hm-bead${cur?' ws-pulse':''}">${bead}<span class="hm-bead-ic">${icon}</span></span><span class="sl hm-step-l">${esc(s.label)}</span></li>`;
}
function renderHome(){
  $('#switchKid').style.display = Store.children().length>1 ? '' : 'none';
  const cur = NODES[curIdx()];
  // Bix
  const bh=$('#bixHome'); if (!bh.querySelector('.bix')) Fun.Mascot.mount(bh, {size:92, keep:true});
  const steps = todaySteps(); const allDone = steps.every(s=>s.done);
  // Bix talks on the home screen once per visit to the app (the first time sound is allowed), and when today is finished.
  const canTalk = !!Speaker.gestured;   // sound is allowed once she has tapped
  const line = !settings.name ? ["I don't know your name yet! Tap me to tell me.", 'ask_name']
    : allDone ? [`All done today, ${settings.name}! Play a game or visit My Room.`, 'all_done']
    : (greeted ? HOME_LINES(cur)[2] : HOME_LINES(cur)[greetIdx()]);
  const speak = canTalk && (!greeted || (allDone && !renderHome.saidDone));
  Fun.Mascot.say(bh, line[0], 0, speak ? line[1] : null, line[1]);
  if (speak){ greeted=true; if (allDone) renderHome.saidDone=true; }
  Fun.save();
  // Today: three beads on the soroban rod
  const nextI = steps.findIndex(s=>!s.done), left = steps.filter(s=>!s.done).length;
  $('#todayTitle').textContent = allDone ? 'All done!' : 'Today';
  $('#greetSub').textContent = allDone ? 'See you tomorrow' : left===steps.length ? `${steps.length} little steps` : `${left} more to go`;
  $('#todaySteps').innerHTML = steps.map((s,i)=>stepBead(s,i,nextI)).join('');
  stepBead.seen = steps.map(s=>s.done);   // a step that turns done since the last visit pops
  const go=$('#todayGo'); go.classList.toggle('play', allDone);
  $('#todayGoIc').innerHTML = allDone ? WS.icon('game', 44, '#fff', 2.2) : WS.icon('play', 44, '#fff');
  $('#todayGoT').textContent = allDone ? 'Play' : (nextI===0 ? 'Start' : 'Next');
  go.setAttribute('aria-label', allDone ? 'Play a game' : `${nextI===0?'Start':'Next'}: ${steps[nextI].label}`);
  Treats.renderJar();
}
// Icons for the home screen (kit drawings, no emoji).
$('#grownups').innerHTML = WS.icon('lock', 26, '#56627A');
$('#doorPracticeIc').innerHTML = WS.icon('abacus', 56, '#F4E3C3');
$('#doorPlayIc').innerHTML = WS.icon('game', 54, '#fff', 2);
$('#doorRoomIc').innerHTML = WS.icon('home', 54, '#3D2412', 2);
// Tapping Bix on the home screen asks for a name if the device doesn't have one yet.
$('#bixHome').addEventListener('pointerup', e=>{ if (settings.name || !e.target.closest('.bix')) return; setTimeout(openNameAsk, 250); });
function openNameAsk(){
  Fun.Mascot.say($('#bixHome'), "I don't know your name yet! Tap me to tell me.", 0, 'ask_name');
  const nb=$('#bixName'); if (!nb.querySelector('.bix')) Fun.Mascot.mount(nb, {size:96, bubble:false});
  $('#nameAskIn').value=''; $('#nameAsk').classList.add('active'); setTimeout(()=>$('#nameAskIn').focus(),200);
}
function saveAskedName(){ const n=$('#nameAskIn').value.trim().replace(/\s+/g,' ').slice(0,20); if(!n){ $('#nameAskIn').focus(); Fun.Mascot.react($('#bixName'),'oops'); return; } settings.name=n; saveSettings(); $('#nameAsk').classList.remove('active'); Sfx.ok(); renderHome(); Fun.Mascot.react($('#bixHome'),'cheer'); Fun.Mascot.say($('#bixHome'), `Hi, ${n}! Now I know you!`, 0, 'got_name'); }
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
    await Fun.give({gold:true, title:'Today’s practice is done!', voice:'today_done'});
    Treats.earn(Treats.EARN.today, 'Today’s practice done!');
  }
  if ($('#home').classList.contains('active')) renderHome();
}
$('#todayGo').addEventListener('click', ()=>{ Speaker.unlock(); const st=todaySteps(); const s=st.find(x=>!x.done); if (s) startStep(s); else goPlay(); });
function goPlay(){ Games.renderHub(); const bp=$('#bixPlay'); if (!bp.querySelector('.bix')) Fun.Mascot.mount(bp,{size:84}); Fun.Mascot.say(bp, 'Pick a game! Every game gives a sticker.', 0, 'play_pick'); show('play'); }
function goAlbum(){ Fun.renderAlbum(); Fun.data.albumSeen=Fun.count(); Fun.save(); show('album'); }
$('#exitPlay').addEventListener('click', ()=>{ renderHome(); show('home'); });
$('#exitGame').addEventListener('click', ()=>{ Games.stop(); goPlay(); });
// The three doors. Practice opens the Practice door screen (#door) when it exists; until then, the current skill's menu.
function openPractice(){
  Speaker.unlock();
  if (typeof window.App.openDoor==='function') return window.App.openDoor();
  if ($('#door')) return show('door');
  openNodeMenu(NODES[curIdx()]);
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

/* ---------------- My Room: sticker book, flower pot, treat jar ---------------- */
const BOOK_SVG = `<svg viewBox="0 0 240 210" width="240" height="210" aria-hidden="true"><rect x="22" y="20" width="200" height="186" rx="14" fill="#1C2763"/><rect x="30" y="14" width="200" height="186" rx="14" fill="#2A3A86"/><rect x="30" y="14" width="26" height="186" rx="10" fill="#1C2763"/><circle cx="140" cy="86" r="40" fill="#E8A93A"/><path d="M140 60 l8 16 18 3 -13 12 3 18 -16 -9 -16 9 3 -18 -13 -12 18 -3z" fill="#FFFFFF"/><circle cx="98" cy="160" r="16" fill="#2F9E7E"/><circle cx="140" cy="164" r="13" fill="#E2452F"/><circle cx="180" cy="158" r="17" fill="#F4E3C3"/></svg>`;
$('#roomBookArt').innerHTML = BOOK_SVG;
$('#exitRoom').innerHTML = WS.icon('back', 28, '#F4E3C3', 3);
$('#exitAlbum').innerHTML = WS.icon('back', 28, '#F4E3C3', 3);
$('#exitShop').innerHTML = WS.icon('back', 28, '#F4E3C3', 3);
$('#roomWishIc').innerHTML = WS.icon('star', 26, '#3D2412');
function renderRoom(){
  const unseen = Fun.count() - (Fun.data.albumSeen||0), bd=$('#albumBadge');
  bd.textContent = unseen>0 ? `${unseen} new` : ''; bd.classList.toggle('on', unseen>0);
  $('#roomStickers').setAttribute('aria-label', `Sticker book: ${Fun.count()} stickers` + (unseen>0 ? `, ${unseen} new` : ''));
  const n = Fun.renderGarden($('#garden'), $('#gardenLabel'), days);
  $('#roomGarden').setAttribute('aria-label', `My garden: ${$('#gardenLabel').textContent}`);
  Treats.renderJar();
  const ready = $('#jar').classList.contains('ready'), noGoal = !Treats.goal();
  $('#roomWish').classList.toggle('ws-pulse', noGoal || ready);
  return n;
}
function goRoom(){
  renderRoom(); show('room');
  const br=$('#bixRoom'); if (!br.querySelector('.bix')) Fun.Mascot.mount(br, {size:110, keep:true});
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
let menuNode=null;
function openNodeMenu(n){ menuNode=n; $('#nmTitle').textContent=n.icon+' '+n.title; $('#nmIntro').textContent=n.intro; $('#nmLearn').style.display=(n.demos||n.kind==='numbers')?'':'none'; $('#nmLook').style.display=(n.drill&&!n.drill.flash)?'':'none'; $('#nmListen').style.display=(n.drill&&!n.drill.flash)?'':'none'; $('#nodemenu').classList.add('active'); }
$('#nmClose').onclick=()=>$('#nodemenu').classList.remove('active');
$('#nmLearn').onclick=()=>{ $('#nodemenu').classList.remove('active'); startLesson(menuNode); };
$('#nmLook').onclick=()=>{ $('#nodemenu').classList.remove('active'); startDrill('visual', menuNode); };
$('#nmListen').onclick=()=>{ $('#nodemenu').classList.remove('active'); startDrill('listen', menuNode); };

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
  const b=e.target.closest('.c-topbix .bubble, .lesson-bix .bubble, .gate-bix .bubble'); if (!b) return;
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
const DOOR_ART = {
  visual: ()=>`<span class="door-tiles" aria-hidden="true"><span>7</span><span><i class="plus">+</i>8</span><span><i class="minus">−</i>4</span></span>`,
  listen: ()=>`<svg class="door-art" width="132" height="114" viewBox="0 0 120 104" aria-hidden="true"><rect class="a-maple" x="10" y="30" width="100" height="66" rx="16"/><circle class="a-wood" cx="44" cy="63" r="20"/><circle class="a-maple" cx="44" cy="63" r="9"/><rect class="a-wood" x="74" y="48" width="24" height="8" rx="4"/><rect class="a-wood" x="74" y="62" width="24" height="8" rx="4"/><rect class="a-wood" x="74" y="76" width="24" height="8" rx="4"/><path class="a-wood-s" d="M30 30 L70 6" stroke-width="5" stroke-linecap="round"/><g class="door-waves"><path class="a-ink-s" d="M92 18 q8 8 0 16" stroke-width="4" fill="none" stroke-linecap="round"/><path class="a-ink-s" d="M102 10 q14 16 0 32" stroke-width="4" fill="none" stroke-linecap="round"/></g></svg>`,
  flash: ()=>`<svg class="door-art" width="132" height="114" viewBox="0 0 120 104" aria-hidden="true"><rect class="a-maple" x="22" y="14" width="76" height="76" rx="16"/><text class="a-num" x="60" y="72" text-anchor="middle">9</text><g class="door-rays a-ochre-s" stroke-width="5" stroke-linecap="round"><line x1="10" y1="10" x2="18" y2="18"/><line x1="110" y1="10" x2="102" y2="18"/><line x1="4" y1="52" x2="14" y2="52"/><line x1="116" y1="52" x2="106" y2="52"/><line x1="10" y1="94" x2="18" y2="86"/><line x1="110" y1="94" x2="102" y2="86"/></g></svg>`,
};
const DOOR_LABEL = { visual:['eye','Look'], listen:['ear','Listen'], flash:['bolt','Flash'] };
function renderDoor(){
  const n=NODES[curIdx()];
  $$('#door .door-block').forEach(b=>{ const m=b.dataset.door, [ic,lab]=DOOR_LABEL[m];
    if (!b.dataset.drawn){ b.innerHTML=DOOR_ART[m]()+`<span class="door-label">${WS.icon(ic, 36, 'currentColor', 2.4)}${lab}</span>`; b.dataset.drawn='1'; } });
  const all=$('#doorAll'); if (!all.innerHTML) all.innerHTML=WS.icon('lock', 18, 'currentColor')+'<span>See all skills</span>';
  renderDoorPath();
  const bd=$('#bixDoor'); mountBix(bd, 72);
  bixSay(bd, 'How do you want to play with numbers?', 'door_ask');
  $('#door').classList.toggle('intro', !renderDoor.seen); renderDoor.seen=true;
}
function renderDoorPath(){
  const ci=curIdx(), from=Math.max(0, ci-2), to=Math.min(NODES.length-1, ci+2), out=[];
  const more=(side)=>`<span class="dp-more dp-${side}" aria-hidden="true">…</span>`;
  out.push(from>0 ? more('l') : '<span class="dp-more dp-l" aria-hidden="true"></span>');
  for (let i=from;i<=to;i++){
    const n=NODES[i], name=esc(pathName(n)), far=Math.abs(i-ci)>1 ? ' far' : '';
    if (i<ci) out.push(`<div class="dp-node done${far}"><button class="dp-bead" data-node="${n.id}" aria-label="${name}: learned">${WS.bead('jade', 100)}<span class="dp-mark">${WS.icon('check', 28, '#fff', 3.4)}</span></button><span class="dp-name">${name}</span></div>`);
    else if (i===ci){ const t=lessonTarget(n), fresh=!node(t.id).lesson;
      out.push(`<div class="dp-node cur"><button class="dp-bead" data-node="${n.id}" aria-label="${name}: you are here"><svg class="ws-bead" width="170" height="104" viewBox="0 0 170 104" aria-hidden="true"><path class="a-indigo a-ring" d="M4 52 Q85 -12 166 52 Q85 116 4 52Z" stroke-width="7"/><ellipse cx="62" cy="30" rx="24" ry="7" fill="#fff" opacity=".25"/></svg><span class="dp-mark">${WS.icon('star', 40, WS.colors.ochre)}</span></button><span class="dp-name">${name}</span>`
        +`<button class="ws-btn small dp-learn${fresh?' ws-nudge':''}" id="doorLearn">${WS.icon('play', 22, '#fff')}Learn it with Bix</button></div>`); }
    else out.push(`<div class="dp-node locked${far}"><button class="dp-bead" data-node="${n.id}" aria-label="${name}: not yet">${WS.bead('locked', 100)}<span class="dp-mark">${WS.icon('lock', 24, 'currentColor', 2.4)}</span></button><span class="dp-name">${name}</span></div>`);
  }
  out.push(to<NODES.length-1 ? more('r') : '<span class="dp-more dp-r" aria-hidden="true"></span>');
  const p=$('#doorPath'); p.innerHTML='<div class="dp-row"><div class="dp-rod" aria-hidden="true"></div>'+out.join('')+'</div>';
  p.querySelectorAll('.dp-node .dp-bead').forEach(b=>b.onclick=()=>{
    const i=NODE_IDX[b.dataset.node], bd=$('#bixDoor'); Sfx.tap();
    if (i>ci){ b.classList.remove('ws-shake'); void b.offsetWidth; b.classList.add('ws-shake'); bixSay(bd, 'Locked! Finish the skills before it to open it.', 'locked', 3500); }
    else if (i<ci){ b.classList.remove('ws-pop'); void b.offsetWidth; b.classList.add('ws-pop'); bixSay(bd, 'You already know this one. Great job!', 'path_done', 3500); }
    else bixSay(bd, 'This is your skill right now! Tap “Learn it with Bix”.', 'path_here', 3500);
  });
  $('#doorLearn').onclick=()=>{ Speaker.unlock(); startLesson(lessonTarget(NODES[curIdx()]), 'door'); };
}
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
function friendsHtml(n){ if(n.family===5) return ['1 & 4','2 & 3'].map(x=>`<span>${x}</span>`).join(''); if(n.family===10) return ['1 & 9','2 & 8','3 & 7','4 & 6','5 & 5'].map(x=>`<span>${x}</span>`).join(''); return ''; }
function startLesson(n, from){
  Speaker.unlock(); lessonFrom = from || 'home';
  if (!lessonAb){ lessonAb = new Soroban($('#lessonAbacus'), {rods:5, interactive:true, onChange:(v)=>onLessonBeads(v)}); lessonAb.el.classList.add('big','ws-soroban'); }
  lessonAb.showLabels=true; lessonAb.reset();
  L = { node:n, phase:'intro', demoIdx:0, step:0, guidedIdx:0, steps:null, busy:false };
  $('#lessonTitle').textContent=n.title; $('#capFriends').innerHTML=friendsHtml(n);
  const bl=$('#bixLesson'); if (!bl.querySelector('.bix, .ws-bix')) Fun.Mascot.mount(bl, {size:96, bubble:false});
  show('lesson'); renderLesson();
}
// One demo/guided pair of any skill -> {start, target, label, op, steps} (Curriculum.lessonStep knows multiplication).
function lessonStep(n, pair){
  if (C.lessonStep) return C.lessonStep(n, pair);
  const [x,y]=pair; return { start:x, target:x+y, label:`${x} ${y<0?'−':'+'} ${Math.abs(y)}`, op:y<0?'sub':'add', steps:C.explain(x,y) };
}
function lessonTotal(){ const n=L.node; const demos=n.kind==='numbers'? n.lesson.numbers.length : n.demos.length; const guided=n.kind==='numbers'?0:n.guided.length; return demos+guided+1; }
function lessonDone(){ const n=L.node; const d=n.kind==='numbers'? L.phase==='numbers'?L.demoIdx:0 : L.phase==='demo'?L.demoIdx : L.phase==='guided'? n.demos.length+L.guidedIdx : L.phase==='done'? lessonTotal() : 0; return d; }
// The problem as wooden-tile maths: "+" in jade, "−" in red (same meaning as the number tiles).
function probHtml(p){ return esc(p).replace(/\+/g,'<i class="plus">+</i>').replace(/−/g,'<i class="minus">−</i>').replace(/×/g,'<i class="times">×</i>'); }
function cap(kind, text, prob){ $('#capKind').textContent=kind; $('#capText').innerHTML=text; if (prob!==undefined){ const el=$('#capProb'); el.dataset.p=prob||''; el.innerHTML = prob==='*' ? WS.icon('star', 64, WS.colors.ochre) : probHtml(prob||''); } }
function lessonBtn(label, icon, kind){ const b=$('#lessonNext'); b.className='ws-btn big'+(kind?' '+kind:''); b.innerHTML=(icon?WS.icon(icon, 30, 'currentColor', 3):'')+`<span>${label}</span>`; }
function lessonSay(id){ Fun.BixVoice.play(id, $('#bixLesson')); }
async function renderLesson(){
  const n=L.node; $('#lessonProg').style.width=(100*lessonDone()/lessonTotal())+'%'; $('#lessonHint').style.display='none';
  $('#lesson').dataset.phase=L.phase;
  if (L.phase==='intro'){ cap('New skill', esc(n.intro)+(Array.isArray(n.method) ? '<ol class="method">'+n.method.map(m=>`<li>${esc(m)}</li>`).join('')+'</ol>' : ''), ''); lessonBtn('Show me', 'play', 'ws-nudge'); lessonAb.reset(); BixExtra.play('learn_'+n.id, $('#bixLesson')); return; }
  if (L.phase==='numbers'){ // beads node: set each number
    const v=n.lesson.numbers[L.demoIdx]; L.target=v; lessonAb.reset();
    cap('Your turn', `Show <b>${v}</b> on the abacus. Tap beads to move them.`, String(v)); lessonBtn('Skip', null, 'maple'); if (L.demoIdx===0) lessonSay('lesson_turn'); return;
  }
  if (L.phase==='demo'){
    const ls=lessonStep(n, n.demos[L.demoIdx]); L.steps=ls.steps; L.step=0; lessonAb.value=ls.start;
    cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, '', ls.label); if (L.demoIdx===0) lessonSay('lesson_watch'); lessonBtn('Next', 'play');
    await playSteps(lessonAb, L.steps, (s)=>cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, s.say.replace(/(\d+)/g,'<b>$1</b>')));
    if (L.phase==='demo' && !L.busy) $('#lessonNext').classList.add('ws-nudge');
    return;
  }
  if (L.phase==='guided'){
    const ls=lessonStep(n, n.guided[L.guidedIdx]); L.target=ls.target; lessonAb.value=ls.start;
    cap(`Your turn ${L.guidedIdx+1} of ${n.guided.length}`, guidedText(ls, n.guided[L.guidedIdx], ''), ls.label);
    lessonBtn('Skip', null, 'maple'); $('#lessonHint').style.display=''; if (L.guidedIdx===0) lessonSay('lesson_turn'); return;
  }
  if (L.phase==='done'){ cap('Done!', `You learned <b>${esc(n.title)}</b>. Now practise it with Look and Listen.`, '*'); lessonBtn('Finish', 'check', 'jade ws-nudge'); node(n.id).lesson=true; saveProgress(); Sfx.star(); Fun.Mascot.react($('#bixLesson'), 'cheer', 2400); if (!L.awarded){ L.awarded=true; Fun.confetti(70); lessonSay('lesson_done'); setTimeout(()=>activityDone('lesson'), 2600); } return; }
}
$('#lessonHint').innerHTML=WS.icon('eye', 26, 'currentColor')+'<span>Show me</span>';
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
  if (L.phase==='intro'){ L.phase = n.kind==='numbers' ? 'numbers' : 'demo'; L.demoIdx=0; }
  else if (L.phase==='numbers'){ L.demoIdx++; if (L.demoIdx>=n.lesson.numbers.length) L.phase='done'; }
  else if (L.phase==='demo'){ L.demoIdx++; if (L.demoIdx>=n.demos.length){ L.phase='guided'; L.guidedIdx=0; } }
  else if (L.phase==='guided'){ L.guidedIdx++; if (L.guidedIdx>=n.guided.length) L.phase='done'; }
  else if (L.phase==='done'){ leaveLesson(); return; }
  renderLesson();
}
$('#lessonNext').addEventListener('click', ()=>advanceLesson());
// What to do on a "your turn" step, in words (multiplication starts from 0 and ends on the product).
function guidedText(ls, pair, lead){
  const [x,y]=pair;
  if (ls.op==='mul') return `${lead}Start at <b>0</b>. Work out <b>${x} × ${y}</b> on the abacus.`;
  return `${lead}${lead?'the abacus':'The abacus'} shows <b>${x}</b>. ${lead?(y<0?'Take away':'Add'):'Now '+(y<0?'take away':'add')} <b>${Math.abs(y)}</b>.`;
}
$('#lessonHint').addEventListener('click', async()=>{ if (L.busy) return; const gi=L.guidedIdx, pair=L.node.guided[gi], ls=lessonStep(L.node, pair); lessonAb.value=ls.start; const tok=animToken+1; await playSteps(lessonAb, ls.steps, s=>cap('Show me', s.say.replace(/(\d+)/g,'<b>$1</b>'))); if (tok!==animToken || L.phase!=='guided' || L.guidedIdx!==gi) return; lessonAb.value=ls.start; cap(`Your turn ${gi+1} of ${L.node.guided.length}`, guidedText(ls, pair, 'Now you: ')); });
$('#exitLesson').addEventListener('click', ()=>{ Fun.BixVoice.stop(); leaveLesson(); });

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
let gateAnswer=0, gateNext=null, gateFrom='home'; $('#grownups').addEventListener('click', ()=>openGate());
// Grown-ups gate: a 3-digit number written in words, typed as digits. Soroban kids can multiply,
// so a sum is too easy; reading and converting "seven hundred forty-two" is an adult-level task (Apple guideline 1.3).
// Children who cannot read get a picture and Bix saying "Go get a grown-up!".
const GATE_ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const GATE_TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function numberWords(n){ const h=Math.floor(n/100), r=n%100; let s=h?GATE_ONES[h]+' hundred':''; if(r){ s+=(s?' ':'')+(r<20?GATE_ONES[r]:GATE_TENS[Math.floor(r/10)]+(r%10?'-'+GATE_ONES[r%10]:'')); } return s; }
// A grown-up holding a child's hand: the picture says "fetch a grown-up" without words.
const GATE_ART = `<svg width="190" height="200" viewBox="0 0 190 200"><ellipse class="a-line" cx="95" cy="190" rx="80" ry="8"/>
  <circle class="a-indigo" cx="62" cy="34" r="22"/><path class="a-indigo" d="M30 84a32 32 0 0 1 64 0v60H30z"/><rect class="a-indigo-dk" x="36" y="140" width="20" height="46" rx="8"/><rect class="a-indigo-dk" x="68" y="140" width="20" height="46" rx="8"/>
  <path class="a-indigo-s" d="M90 92 Q112 118 128 120" stroke-width="13" fill="none" stroke-linecap="round"/>
  <circle class="a-ochre" cx="140" cy="94" r="16"/><path class="a-ochre" d="M118 136a22 22 0 0 1 44 0v26h-44z"/><rect class="a-ochre-dk" x="122" y="158" width="14" height="28" rx="6"/><rect class="a-ochre-dk" x="144" y="158" width="14" height="28" rx="6"/></svg>`;
function openGate(next){
  const g=$('#gate');
  if (!g.classList.contains('active')){ gateNext = typeof next==='string' ? next : null; const a=document.querySelector('.screen.active'); gateFrom = a ? a.id : 'home'; }
  gateAnswer=100+Math.floor(Math.random()*900); window.__gateAnswer=gateAnswer;
  $('#gateQ').innerHTML='<small>Grown-ups: type this number in digits</small><span class="gw">'+numberWords(gateAnswer)+'</span>'; $('#gateA').value='';
  if (!g.classList.contains('active')){
    if (!$('#gateArt').innerHTML) $('#gateArt').innerHTML=GATE_ART;
    show('gate'); const bg=$('#bixGate'); mountBix(bg, 80); bixSay(bg, 'This part is for a grown-up. Go get a grown-up!', 'gate_grownup');
  }
  setTimeout(()=>$('#gateA').focus(),50);
}
function leaveGate(){ Fun.BixVoice.stop(); if (gateFrom==='door') show('door'); else if (gateFrom && gateFrom!=='home' && gateFrom!=='gate' && $('#'+gateFrom)) show(gateFrom); else { renderHome(); show('home'); } }
$('#gateCancel').addEventListener('click', leaveGate);
$('#gateBack').addEventListener('click', leaveGate);
$('#gateOk').addEventListener('click', ()=>{
  if(parseInt($('#gateA').value,10)===gateAnswer){ Fun.BixVoice.stop(); renderParent(); show('parent'); $('#parent').scrollTop=0; if (gateNext==='skills') setTimeout(()=>$('#guSkills').scrollIntoView({block:'start'}), 60); }
  else { const c=$('#gate .gate-card'); c.classList.remove('ws-shake'); void c.offsetWidth; c.classList.add('ws-shake'); openGate(); }
});
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
/* ---- the weekly report for the child who is practising (ParentBrain does the thinking; this only draws) ---- */
const PB = window.ParentBrain;
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
  if (m.day===today && m.id){ tip=PB.tonightsTip(data, {lastTipId:m.prev||undefined}); if (tip.id!==m.id){ mem[id]=Object.assign({}, m, {id:tip.id}); Store.set('parentTips', mem); } }
  else { tip=PB.tonightsTip(data, {lastTipId:m.id||undefined}); mem[id]={day:today, id:tip.id, prev:m.id||null}; Store.set('parentTips', mem); }
  return tip;
}
function fmtRange(a, b){
  const A=new Date(a+'T12:00:00'), B=new Date(b+'T12:00:00'), mo=d=>d.toLocaleDateString('en-US',{month:'short'});
  return A.getMonth()===B.getMonth() ? `${mo(A)} ${A.getDate()} – ${B.getDate()}` : `${mo(A)} ${A.getDate()} – ${mo(B)} ${B.getDate()}`;
}
let lastReport=null;
function renderReport(){
  if (!PB) return;
  const data=reportData(), r=PB.weeklyReport(data), name=(settings.name||'').trim();
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
  const al=PB.stuckAlerts(data).sort((a,b)=>b.severity-a.severity).slice(0,2);
  const w=(Fun.data.wallet||{}), open=(w.tickets||[]).filter(x=>!x.given);
  let ah=al.map(a=>`<div class="rep-alert" data-kind="${a.kind}">${WS.icon('sprout', 30, WS.colors.ochre)}<div><b>${esc(a.message)}</b><span>${esc(a.suggestion)}</span></div></div>`).join('');
  if (open.length) ah+=`<button class="rep-alert as-btn" id="repTickets">${WS.icon('star', 30, WS.colors.ochre)}<div><b>${open.length} treat${open.length===1?'':'s'} to hand over</b><span>${esc(name||'They')} bought ${open.map(t=>esc(t.name)).join(', ')}. Tap to see the tickets.</span></div></button>`;
  if (!ah) ah=`<div class="rep-alert calm">${WS.icon('check', 30, WS.colors.jade, 3)}<div><b>Nothing to worry about</b><span>No stuck spots this week. Short, happy practice most days is the whole secret.</span></div></div>`;
  $('#repAlerts').innerHTML=ah;
  const tk=$('#repTickets'); if (tk) tk.onclick=()=>$('#guTreats').scrollIntoView({behavior:'smooth', block:'start'});
}
function toast(msg){ const t=$('#repToast'); t.textContent=msg; t.classList.add('on'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('on'), 3200); }
$('#repShare').addEventListener('click', async()=>{
  const r=lastReport || PB.weeklyReport(reportData()), text=PB.shareText(r, {childName:settings.name}); window.__shareText=text;
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
    const tr=document.createElement('tr'); const status = st.mastered==='auto'?'<span class="pill good">learned ✓</span>':st.mastered==='parent'?'<span class="pill good">learned (set by you)</span>':st.mastered==='placed'?'<span class="pill good">learned (level check)</span>':i===curIdx()?'<span class="pill">current</span>':'<span class="pill">locked</span>';
    tr.innerHTML=`<td>${esc(n.title)}</td><td>${st.lesson?'✓':'—'}</td><td>${acc===null?'—':`<span class="mini"><i style="width:${acc}%"></i></span>${acc}% (${h.length})`}</td><td>${dn||'—'}</td><td>${status} <button class="btn small ghost" data-toggle="${n.id}" style="padding:4px 10px;min-height:30px;font-size:13px">${st.mastered?'un-learn':'mark learned'}</button></td>`;
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
    const missed=(h.missed||[]).map(m=>'<span class="pill bad">'+(isMulMiss(m,h) ? m.terms.join(' × ') : m.terms.map((t,i)=>i===0?t:(t<0?' − '+(-t):' + '+t)).join(''))+' = '+m.answer+(m.given?' (said '+m.given+')':'')+'</span>').join(' ');
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
// "Who's practising?" when more than one child uses this device. Each child is a bead in their own lacquer colour.
const WHO_COLORS = ['red','indigo','jade','ochre'];
function showWho(){
  $('#whoList').innerHTML=Store.children().map((c,i)=>`<button class="who-card ws-card" data-who="${c.id}"><span class="who-bead wh-bead">${WS.bead(WHO_COLORS[i%WHO_COLORS.length], 150)}</span><span class="wh-name">${esc(childLabel(c))}</span></button>`).join('');
  $$('#whoList [data-who]').forEach(b=>b.onclick=()=>{ Speaker.unlock(); Sfx.tap(); if(b.dataset.who===Store.activeId()){ sessionStorage.setItem('abacus.who','1'); show('home'); renderHome(); } else { sessionStorage.setItem('abacus.who','1'); Store.switchTo(b.dataset.who); location.reload(); } });
  show('who');
  const bw=$('#bixWho'); if (!bw.querySelector('.bix')) Fun.Mascot.mount(bw, {size:110, keep:true});
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
