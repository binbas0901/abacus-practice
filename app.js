(function(){
'use strict';
const E = window.SorobanEngine, C = window.Curriculum, TM = window.TimeModel;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const esc = s => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NODES = C.NODES, NODE_IDX = Object.fromEntries(NODES.map((n,i)=>[n.id,i]));

/* ---------------- storage ---------------- */
const DEFAULTS = {
  count:10, operands:0, sfx:true, speakFeedback:true, name:'',
  termGap:0.65, sayPlus:true, voice:'juni', voiceRate:1.0, answerPause:0.5,
  flashSec:1.0, flashGap:0.2, flashN:3, profiles:[], recPid:null, bixTalks:true, bixVoice:'gigi', settingsVersion:6,
  bixiMistakes:true, bixiSilly:'normal',   // classroom: Bixi makes mistakes in lessons; how often Bixi's silliness fires
};
// All saving goes through store.js: family-wide settings are shared, progress and treats are per child.
function load(k, d){ return Store.get(k, d); }
function save(k, v){ Store.set(k, v); }
let settings = Store.loadSettings(DEFAULTS);
if ((settings.settingsVersion||1) < 5){ settings = Object.assign({}, DEFAULTS, {voice:settings.voice||'device', name:settings.name||''}); }
// v6: Juni (a real voice) replaces the old synthetic default for anyone who was still on it ('device' was the default).
// A deliberately chosen voice (e.g. 'ljspeech' or a recorded family voice) is left alone. The version bump and save
// happen after the gap->termGap migration below, so saving here doesn't pre-empt that one-time conversion.
const needsV6 = (settings.settingsVersion||1) < 6;
if (needsV6 && settings.voice==='device') settings.voice='juni';
function saveSettings(){ Store.saveSettings(settings); }
/* Speed settings, one source of truth for the speed panel on the Listen / Flash screens and for Grown-ups. Per child.
     voiceRate  how fast the numbers are said: 70%-150% in steps of 10; 100% is the recording exactly as it is
     termGap    silence between one number and the next (and before "equals"): 0.05 s - 1.20 s in steps of 0.05
     flashSec   how long each Flash number stays;  flashGap  the blank between two Flash numbers                    */
const SPEED = {
  voiceRate:{ min:0.7, max:1.5, step:0.1, def:1, fmt:v=>Math.round(v*100)+'%', label:'How fast I say the numbers', lowIsFast:false },
  termGap:{ min:0.05, max:1.2, step:0.05, def:0.65, fmt:v=>v.toFixed(2)+'s', label:'Pause between numbers', lowIsFast:true },
  flashSec:{ min:0.3, max:3, step:0.1, def:1, fmt:v=>v.toFixed(1)+'s', label:'How long each number shows', lowIsFast:true },
  flashGap:{ min:0.05, max:1, step:0.05, def:0.2, fmt:v=>v.toFixed(2)+'s', label:'Pause between numbers', lowIsFast:true },
};
function snapSpeed(k, v){ const s=SPEED[k]; v=parseFloat(v); if (!isFinite(v)) v=s.def; return +Math.min(s.max, Math.max(s.min, s.min+Math.round((v-s.min)/s.step)*s.step)).toFixed(2); }
// Before v4.2 the Listen pace was "seconds from the start of one number to the start of the next" (settings.gap, 0.5-12,
// default 2). It is now the silence between numbers: an untouched 2 becomes the new default 0.65 s, anything else loses
// the 0.9 s a spoken number takes on average and goes to the nearest step. Done once per child (termGap is then saved).
(()=>{ const had=Store.loadSettings({});
  if (had.termGap==null) settings.termGap = (had.gap==null || had.gap===2) ? SPEED.termGap.def : snapSpeed('termGap', had.gap-0.9);
  Object.keys(SPEED).forEach(k=>{ settings[k]=snapSpeed(k, settings[k]); });
  delete settings.gap; delete settings.gapMin; delete settings.gapMax;
})();
if (needsV6){ settings.settingsVersion=6; saveSettings(); }   // persist the v6 voice upgrade after the gap->termGap conversion
let history = load('history', []);
let days = load('days', {});
// progress: {current:nodeId, nodes:{id:{lesson:bool, mastered:'auto'|'parent'|null, hist:[{ok,day}]}}}
let progress = load('progress', null);
// A device that has never been set up gets the first-time setup (name + where to start). Nothing is saved until then.
const firstRun = !progress;
if (!progress){ progress = { current: 'beads', nodes:{} }; }
function node(id){ return progress.nodes[id] || (progress.nodes[id] = {lesson:false, mastered:null, hist:[]}); }
function saveProgress(){ save('progress', progress); }
// Move `current` to the next node the child should sit on, via the pure curriculum walk: it skips mastered nodes AND
// the off-path flash/anzan (optional) nodes, so a level-up never parks the child on a standalone flash node. Does NOT
// save — the caller persists. Used on load and on every level-up (levelDone / checkMastery).
function advancePastMastered(){ if (!C.advanceCurrent) return; const nx=C.advanceCurrent(progress.current, id=>!!(progress.nodes[id]&&progress.nodes[id].mastered)); if (nx!==progress.current) progress.current=nx; }

// ---- Practice-first level model (redesign) ----
// A level (one skill) is 10 sets of 10 problems = 100. The 10 sets cycle through three REQUIRED types,
// v4.43 model: two modes — Reading + Listening — 7 sessions each; BOTH must be finished to clear a level.
// A session is a set of SET_LEN problems; a miss does NOT interrupt — misses are corrected in a pass AFTER the
// set (the existing drill/game fix pass). Per-mode counts live in node(id).modes = {reading, listening}. A third
// mode (flash/anzan) is added in a later slice; PRACTICE_MODES is kept extensible for it.
const MODE_SESSIONS = 7, SET_LEN = 10, PRACTICE_MODES = ['reading', 'listening'];
// At the first (no-sums) level there is no arithmetic to "read" or "listen" to yet, so the picker uses plain action
// names that match the activity each card launches: Reading -> read a number off the beads, Listening -> hear a number
// and make it. Used BOTH as the picker card label and as the activity's own on-screen title, so the two always agree.
const L1_LABELS = { reading: 'Read the beads', listening: 'Make the number' };
function _modes(id){ const nd = node(id); nd.modes = nd.modes || {}; return nd.modes; }
function modeDone(id, mode){ return Math.min(MODE_SESSIONS, _modes(id)[mode] || 0); }
function modeComplete(id, mode){ return modeDone(id, mode) >= MODE_SESSIONS; }
function bumpMode(id, mode){ const m = _modes(id); m[mode] = Math.min(MODE_SESSIONS, (m[mode] || 0) + 1); saveProgress(); return m[mode]; }
function isFlashNode(id){ const n = NODES[NODE_IDX[id]]; return !!(n && n.kind === 'flash'); }
// Mental Math (anzan) becomes a REQUIRED third mode once the child has mastered `combined` — the last single-digit
// complement skill ("both friends"), the spec's "single-digit complement add/subtract is automatic" gate. Below that
// gate a level clears on Reading(7)+Listening(7) only; at or after it, every level also needs Mental Math(7).
function anzanEligible(){ const c = progress.nodes && progress.nodes.combined; return !!(c && c.mastered); }
// The REQUIRED modes for a (non-flash) level: Reading + Listening always, plus Mental Math once eligible.
function levelModes(){ return anzanEligible() ? ['reading', 'listening', 'mental'] : ['reading', 'listening']; }
// A level is finished when every required mode reaches 7 sessions. (Standalone flash nodes are off-path now, but the
// legacy single-flash-track branch is kept for back-compat / any saved child still sitting on a flash node.)
function levelComplete(id){ return isFlashNode(id) ? modeComplete(id, 'flash') : levelModes().every(m => modeComplete(id, m)); }
function levelDoneCount(id){ return isFlashNode(id) ? modeDone(id, 'flash') : levelModes().reduce((s, m) => s + modeDone(id, m), 0); }
function levelTotalCount(id){ return isFlashNode(id) ? MODE_SESSIONS : MODE_SESSIONS * levelModes().length; }
window.__level = { MODE_SESSIONS, SET_LEN, PRACTICE_MODES, modeDone, modeComplete, bumpMode, isFlashNode, anzanEligible, levelModes, levelComplete, levelDoneCount, levelTotalCount,
  // back-compat shims for untouched callers (e.g. the home moon): "sets" now means this level's sessions (0..14, or 0..21 once Mental Math is required).
  get LEVEL_SETS(){ return MODE_SESSIONS * levelModes().length; }, setsDone: id => levelDoneCount(id),
  // Seeding/compat helper: advance one session, filling the required modes evenly (each reaches 7 at full completion).
  completeSet: id => { if (isFlashNode(id)) return bumpMode(id, 'flash'), levelDoneCount(id);
    const modes = levelModes().filter(m => !modeComplete(id, m));
    if (modes.length){ const least = modes.reduce((a, b) => modeDone(id, b) < modeDone(id, a) ? b : a); bumpMode(id, least); }
    return levelDoneCount(id); } };

// ---- Set stopwatch (v4.46): a SILENT, background measure of the child's SOLVING time for one set ----
// Owner's hard requirement: NO clock/timer/elapsed value is shown ANYWHERE while the child is practising. This object
// never touches the DOM — it only accumulates ms. pause()/resume() stack (a depth counter), so the demo pause and the
// tab-hidden pause compose cleanly, and the clock only runs when depth===0. The elapsed total is read once, at stop(),
// on the set-complete screen. Pauses during show-me/demo playback and while the tab is hidden keep idle time (and the
// gap between sittings) out of the score, so the number is "time spent solving", never wall-clock.
const SetClock = {
  running: false, depth: 0, acc: 0, since: 0,
  start(){ this.running = true; this.depth = 0; this.acc = 0; this.since = Date.now(); },
  pause(){ if (this.running && this.depth === 0) this.acc += Date.now() - this.since; this.depth++; },      // stackable
  resume(){ if (this.depth > 0 && --this.depth === 0 && this.running) this.since = Date.now(); },
  stop(){ if (!this.running) return 0; if (this.depth === 0) this.acc += Date.now() - this.since; const ms = this.acc; this.running = false; this.depth = 0; this.acc = 0; this.since = 0; return ms; },
};
// Save one finished set's solving time into the per-child `times` store and return the reveal result (pure model does the maths).
function recordSetTime(nodeId, mode, elapsed){
  const times = load('times', {});
  const r = TM.updateSetTime(times, nodeId, mode, elapsed, MODE_SESSIONS);
  save('times', times);
  return r;
}
function bestSetMs(nodeId, mode){ return TM.bestSet(load('times', {}), nodeId, mode); }
window.__times = { SetClock, recordSetTime, bestSetMs };   // for browser tests

// ---- Practice orchestrator (v4.43): run a level as Reading(7)+Listening(7) sessions; both required; correction pass after each set ----
// Reuses the existing mechanics: listen -> the drill (with its fix pass looping misses until correct); read -> Bead
// Detective (reader, with a miss re-queued); build -> Bead Builder (inherently all-correct). A guard (Practice.on) keeps
// every existing drill/game flow unchanged when a practice level is NOT running.
const Practice = {
  on: false, node: null, mode: null, type: null, _savedCount: null,
  nodeObj(id){ return NODES[NODE_IDX[id]]; },
  start(nodeId){ this.node = nodeId || NODES[curIdx()].id; this.on = true; Speaker.unlock(); this.enter(); },
  stop(){ this.on = false; if (this._savedCount != null){ settings.count = this._savedCount; this._savedCount = null; } },
  // Entry: a not-yet-learned level gets its one-time welcome lesson (with a Skip) first; then the mode picker.
  enter(){
    if (!this.on) return;
    const id = this.node, n = this.nodeObj(id);
    if (levelComplete(id)) return this.levelDone();
    if (n && hasLesson(n) && !node(id).lesson){ this.type = 'lesson'; return startLesson(n, 'practice'); }   // first time at this level
    this.pick();
  },
  // The simple Reading / Listening picker. (Mental-math "flash" nodes skip it and run the flash track.)
  pick(){
    if (!this.on) return;
    if (levelComplete(this.node)) return this.levelDone();
    if (isFlashNode(this.node)) return this.runMode('flash');
    renderPracticePick(this.node); show('practicePick');
  },
  runMode(mode){
    if (!this.on) return;
    if (levelComplete(this.node)) return this.levelDone();
    if (mode !== 'flash' && modeComplete(this.node, mode)) return this.pick();
    this.mode = mode; const n = this.nodeObj(this.node);
    this._savedCount = settings.count; settings.count = SET_LEN;
    // Mental Math: a REQUIRED third track at eligible levels. It reuses the Flash drill verbatim, SOURCED from the
    // current band's off-path flash node (anzan / anzan_more / anzan_2d). The intro card shows once (startFlash ->
    // startLesson for an unseen flash node), then the flash drill routes through finish() -> setDone() like the others.
    if (mode === 'mental'){ this.type = 'mental'; const aid = C.anzanForLevel(levelOf(n)); return startFlash(this.nodeObj(aid) || n, 'practice'); }
    if (mode === 'flash'){ this.type = 'flash'; return startFlash(n); }
    if (mode === 'listening'){
      this.type = 'listening';
      if (n && n.drill) return startDrill('listen', n);                 // listen drill -> finish() -> Practice.setDone()
      return MakeTeach.start(n, () => this.makeTeachDone());            // no-sums level: Juni-led "Make the number" TEACHING (mirrors reading); no timer, no score
    }
    this.type = 'reading';
    if (n && n.drill) return startDrill('visual', n);                   // Reading: the whole sum is shown with +/- signs; child solves it and types the answer (misses fixed after the set)
    // No-sums level: brand-new child. "Read the beads" is Juni-led interactive TEACHING, not a quiz — no timer, no score.
    return ReadTeach.start(n, () => this.teachDone());
  },
  setDone(){ this.sessionDone(); },                                     // the listen drill's finish() calls this
  // Level-1 "Read the beads" teaching finished: advance reading progress by one session (so level mastery still
  // works), with NO timer reveal (teaching isn't timed) — celebrate() shows the X-of-7 progress with t=null.
  teachDone(){ if (!this.on) return; this.celebrate('reading', bumpMode(this.node, 'reading'), null); },
  // Level-1 "Make the number" teaching finished: advance listening progress by one session (mirror teachDone, no timer).
  makeTeachDone(){ if (!this.on) return; this.celebrate('listening', bumpMode(this.node, 'listening'), null); },
  sessionDone(){
    if (!this.on) return;
    if (this._savedCount != null){ settings.count = this._savedCount; this._savedCount = null; }
    const mode = this.mode || 'reading';
    // Stop the silent stopwatch and fold this set's solving time into the store BEFORE the reveal. flash stays untimed.
    const elapsed = SetClock.stop();
    const t = (mode === 'reading' || mode === 'listening' || mode === 'mental') ? recordSetTime(this.node, mode, elapsed) : null;
    this.celebrate(mode, bumpMode(this.node, mode), t);
  },
  async celebrate(mode, n, t){
    stopVoices();
    try { Treats.earn(Treats.EARN.set, 'for a good practice set'); } catch (e) {}   // real practice earns a bead toward a treat
    if (levelComplete(this.node)) return this.levelDone();
    Fun.confetti(70); Sfx.star(); juniNarrate('j_end_good');
    const label = mode === 'reading' ? 'Reading' : mode === 'listening' ? 'Listening' : 'Mental math';
    const left = MODE_SESSIONS - n;
    // The reveal: the set's solving time (and a warm "New best!" only when a real record was beaten), then the
    // "more to go" / "finished" line, then — when the 7th set lands — the whole-run total. Nothing was shown mid-set.
    const lines = [];
    if (t) lines.push(`Set done — ${TM.fmt(t.setMs)}${t.isBestSet ? '   ⭐ New best!' : ''}`);
    if (t && t.modeComplete){
      lines.push(`${label} finished!`);
      lines.push(`You finished all ${MODE_SESSIONS}! Total solving time ${TM.fmt(t.total)}${t.isBestTotal ? '   ⭐ New best time!' : ''}`);
    } else {
      lines.push(left ? `${left} more ${label} session${left === 1 ? '' : 's'} to go.` : `${label} finished!`);
    }
    const body = lines.join('\n');
    const go = await TOY.confirm(`${label}: ${n} of ${MODE_SESSIONS} done!`, body, { ok: 'Keep going', cancel: 'Done for now' });
    if (!this.on) return;
    if (!go){ this.stop(); renderHome(); show('home'); return; }
    if (mode !== 'flash' && modeComplete(this.node, mode)) this.pick();   // this mode finished -> back to the picker for the other
    else this.runMode(mode);
  },
  async levelDone(){
    const id = this.node, st = node(id);
    if (!st.mastered) st.mastered = 'auto'; st.lesson = true;
    if (NODE_IDX[id] === curIdx()) advancePastMastered();   // advance past optional/flash nodes — never park current on a standalone anzan node
    saveProgress(); this.stop(); stopVoices();
    juniNarrate('j_unlock');                                      // Juni's unlock line, then the level card
    try { Treats.earn(Treats.EARN.skill, 'you mastered a new skill!'); } catch (e) {}   // mastering a skill earns more beads
    await sleep(1200);                                            // let Juni's unlock line land before the card
    Fun.confetti(120); Sfx.star();
    const finishedWhat = anzanEligible() ? 'Reading, Listening and Mental Math' : 'Reading and Listening';
    await TOY.confirm('Level complete!', `You finished ${finishedWhat} — you unlocked a new skill!`, { ok: 'Yay!', cancel: 'Back' });
    renderHome(); show('home');
  }
};
window.__practice = Practice;
// A child who had mastered the old last skill moves on to the new levels (4–6) automatically.
if (!firstRun && C.advanceCurrent){ const nx=C.advanceCurrent(progress.current, id=>!!(progress.nodes[id]&&progress.nodes[id].mastered)); if (nx!==progress.current){ progress.current=nx; saveProgress(); } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});
function todayKey(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* ---------------- typing into a box on an iPad ----------------
   iOS opens the keyboard only for a focus made while a touch is being handled (finger lift, click). A focus() from a
   timer or an animation frame gives the box the focus WITHOUT a keyboard, and after that a tap on the box opens
   nothing either, because the box already has the focus. So on a touch device a box is only ever focused inside a tap:
     Typing.focus(el)      now, if a tap is being handled (or the device has no touch screen); otherwise not at all
     Typing.afterTap(el)   now if possible, else at the next finger lift (the end of the press that opened the box)
   A tap on a box that has the focus but no keyboard takes the focus away and gives it back, which opens the keyboard.
   While the keyboard is up, html.kb-up is set and --vv-h / --vv-top give the part of the screen above it, so the
   screen with the box can lay itself out there (styles.css, toy-home.css). window.__kb(px) fakes a keyboard in tests. */
const Typing = {
  touch: navigator.maxTouchPoints>0, pending:null, fake:null,
  isBox(el){ return !!el && (el.tagName==='TEXTAREA' || (el.tagName==='INPUT' && !/^(range|checkbox|radio|button|submit|file|color)$/.test(el.type))) && !el.readOnly && !el.disabled; },
  inTap(){ const e=window.event; return !!e && e.isTrusted && /^(touchend|mouseup|click|keydown|keyup)$/.test(e.type); },
  focus(el){ if (!el || (this.touch && !this.inTap())) return false; el.focus(); return document.activeElement===el; },
  afterTap(el, still){ this.pending=null; if (!this.focus(el)) this.pending={el, still}; },
  /* How much of the screen the keyboard covers. The full height is remembered per screen width while no box has the
     focus: in a home-screen app on some iPads innerHeight shrinks together with visualViewport.height, so the
     difference of those two says "no keyboard" while half the screen is covered. A hardware keyboard, or the floating /
     split keyboard, covers nothing (at most a ~55px bar): that stays under 120 and the normal layout is kept. */
  full:{}, guess:0, held:[],
  viewH(){ const v=window.visualViewport; return v ? v.height*v.scale : innerHeight; },
  fullH(){ const d=document.documentElement; return Math.max(innerHeight, d.clientHeight, this.full[innerWidth]||0); },
  note(lower){ const d=document.documentElement, h=Math.round(Math.max(innerHeight, d.clientHeight, this.viewH())), w=innerWidth; if (lower || h>(this.full[w]||0)) this.full[w]=h; },
  shift(){ const v=window.visualViewport, d=document.documentElement; return Math.max(window.scrollY||0, d.scrollTop||0, document.body.scrollTop||0, v ? v.offsetTop : 0); },
  keyboard(){ if (this.fake!==null) return this.fake;
    const kb=Math.max(0, Math.round(this.fullH() - this.viewH())); if (kb>120){ this.guess=0; return kb; }
    // Nothing got smaller, yet iOS slid the page up under a focused box: a keyboard is there. Assume the usual size until the box is left.
    if (this.touch && !this.guess && this.shift()>40) this.guess=Math.round(this.fullH()*(innerWidth>this.fullH() ? .54 : .34));
    return this.guess || kb; },
  onTap(e){
    const p=this.pending, live=q=>q.el.isConnected && q.el.offsetParent!==null && (!q.still || q.still());
    if (p){ this.pending=null; if (live(p)){ this.focus(p.el); this.again={el:p.el, still:p.still, t:Date.now()}; } }
    // The same tap goes on (mouse events, click) and may take the focus to what was tapped: give it back to the box.
    else if (this.again && e.type!=='touchend'){ const g=this.again; if (e.type==='click') this.again=null; if (Date.now()-g.t<1000 && live(g) && document.activeElement!==g.el && !this.isBox(document.activeElement)) this.focus(g.el); }
    const t=e.target;
    if (e.type==='touchend' && this.isBox(t) && document.activeElement===t && this.keyboard()<=120){ t.blur(); t.focus(); }
  },
  /* Called on every focus change and viewport change. Keyboard up: html.kb-up (+ kb-short under 620px, kb-tiny under
     300px) and --vv-h / --vv-top = the part of the screen that is left, in layout-viewport coordinates, which is what
     position:fixed uses - so the screen with the box sits exactly there however far iOS slid the page. */
  layout(){
    const d=document.documentElement, v=window.visualViewport, a=document.activeElement, box=this.isBox(a);
    if (!box){ this.guess=0; if (this.fake===null){ this.note(false); clearTimeout(this.noteT); this.noteT=setTimeout(()=>{ if (!this.isBox(document.activeElement)) this.note(true); }, 1200); } }
    const kb=box ? this.keyboard() : 0, up=box && kb>120;
    if (up!==d.classList.contains('kb-up')) d.classList.toggle('kb-up', up);
    if (!up){ this.seenBox=null; if (this.was){ this.was=false; this.slides=0; d.classList.remove('kb-short','kb-tiny'); d.style.removeProperty('--vv-h'); d.style.removeProperty('--vv-top'); this.unslide(); } return; }
    this.was=true;
    const h=Math.round(this.fullH()-kb), top=this.fake===null && v ? Math.max(0, Math.round(v.offsetTop)) : 0;
    d.classList.toggle('kb-short', h<620); d.classList.toggle('kb-tiny', h<300); d.style.setProperty('--vv-h', h+'px'); d.style.setProperty('--vv-top', top+'px');
    // iOS slides things up to show the box (the page, and any clipped parent of the box). The screen now fits above the keyboard: slide them back.
    for (let p=a.parentElement; p && p!==document.body; p=p.parentElement) if ((p.scrollTop || p.scrollLeft) && !this.scroller(p)){ p.scrollTop=0; p.scrollLeft=0; if (this.held.indexOf(p)<0) this.held.push(p); }
    if (this.fake===null && (window.scrollY>0 || top>0) && (this.slides=(this.slides||0)+1)<=3) window.scrollTo(0,0);
    // A box in a part that scrolls (the Grown-ups page): bring its whole row - label, box, its button - into what is left, inside that part only.
    const sc=a.closest('#parent, .toy-dialog-panel, [data-kb-scroll]');
    const key=h+'/'+top, moved=this.seenBox!==a || this.seenKey!==key; this.seenBox=a; this.seenKey=key;   // once per box and keyboard size: the page can still be scrolled by hand while typing
    if (sc && moved && this.scroller(sc)){ const row=a.closest('.field, .recrow, tr, label')||a, r=row.getBoundingClientRect(), b=a.getBoundingClientRect(), c=sc.getBoundingClientRect(), pad=12;
      const nav=sc.querySelector('.gu-nav'), nb=nav && getComputedStyle(nav).position==='sticky' ? nav.getBoundingClientRect().bottom : 0, ct=Math.max(c.top, Math.min(nb, c.top+c.height/2))+pad, cb=c.bottom-pad;   // the tab bar stays stuck at the top
      const lo=Math.min(r.top, b.top), hi=Math.max(r.bottom, b.bottom), room=cb-ct;
      let dy=0; if (hi-lo>room) dy=(b.top+b.bottom)/2-(ct+cb)/2; else if (lo<ct || hi>cb) dy=(lo+hi)/2-(ct+cb)/2;
      if (Math.abs(dy)>1){ const sb=sc.style.scrollBehavior; sc.style.scrollBehavior='auto'; sc.scrollTop+=dy; sc.style.scrollBehavior=sb; } }
  },
  scroller(p){ const o=getComputedStyle(p).overflowY; return o==='auto' || o==='scroll'; },
  // Keyboard gone: whatever iOS slid, slide back, so the screen is where it was.
  unslide(){ this.held.forEach(p=>{ if (p.isConnected && !this.scroller(p)){ p.scrollTop=0; p.scrollLeft=0; } }); this.held=[];
    const d=document.documentElement; if (window.scrollY || d.scrollTop || document.body.scrollTop){ window.scrollTo(0,0); d.scrollTop=0; document.body.scrollTop=0; }
    const app=document.getElementById('app'); if (app && (app.scrollTop || app.scrollLeft)){ app.scrollTop=0; app.scrollLeft=0; }
    document.querySelectorAll('.screen.active').forEach(sn=>{ if ((sn.scrollTop || sn.scrollLeft) && !this.scroller(sn)){ sn.scrollTop=0; sn.scrollLeft=0; } }); },
  init(){
    ['touchend','mouseup','click'].forEach(ev=>document.addEventListener(ev, e=>this.onTap(e), true));
    // A button beside the box (Open, Next, That's me) must not take the focus from it: the keyboard would close and the
    // screen move back under the finger before the tap lands. (Safari on iOS leaves the focus alone; other browsers do not.)
    document.addEventListener('mousedown', e=>{ const a=document.activeElement, bt=e.target.closest && e.target.closest('button');
      if (this.again && Date.now()-this.again.t<1000 && a===this.again.el && !this.isBox(e.target)) return e.preventDefault();   // the tap that opened the box
      if (bt && this.isBox(a) && bt.closest('#gate, #nameAsk, #setup')===a.closest('#gate, #nameAsk, #setup') && a.closest('#gate, #nameAsk, #setup')) e.preventDefault(); }, true);
    const lay=()=>this.layout(), soon=()=>{ lay(); [120, 450, 900].forEach(ms=>setTimeout(lay, ms)); };
    this.note(true);
    document.addEventListener('focusin', soon); window.addEventListener('resize', lay); window.addEventListener('orientationchange', soon);
    // Leaving a box: put back anything iOS slid, now and once the keyboard has gone down.
    document.addEventListener('focusout', ()=>{ soon(); [60, 350, 700].forEach(ms=>setTimeout(()=>{ if (!this.isBox(document.activeElement)) this.unslide(); }, ms)); });
    // While a box has the focus look again a few times a second: not every iPad reports the keyboard arriving.
    setInterval(()=>{ if (this.isBox(document.activeElement)) lay(); }, 300);
    if (window.visualViewport){ visualViewport.addEventListener('resize', lay); visualViewport.addEventListener('scroll', lay); }
    // Grown-ups boxes: the keyboard's Done / Enter finishes the box (saves it, keyboard down); in "Add a person" it presses Add.
    document.addEventListener('keydown', e=>{ const t=e.target; if (e.key!=='Enter' || !this.isBox(t) || t.tagName!=='INPUT' || !t.closest('#parent')) return;
      e.preventDefault(); if (t.id==='recNew' && t.value.trim()) document.getElementById('recAdd').click(); else t.blur(); });
    window.__kb=px=>{ this.fake = px==null ? null : px; this.layout(); };
  },
};
Typing.init(); window.Typing=Typing;

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
   After the last number every voice says "equals": the person's own recording, else the built-in clip
   (audio/voice-ljspeech-extra.js, also used by 'ljspeech'), else the device voice.
   Clip voices are scheduled on the Web Audio clock so pacing is exact.                   */
const SPRITES = { juni:'Juni (teacher)', ljspeech:'Built-in synthetic (Linda)' };
const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const RECORD_WORDS = [...ONES, ...TENS.slice(2), 'hundred', 'plus', 'minus', 'yes', 'not quite'];   // a voice is usable once these 33 are recorded
// Words a person can also record. Without them their voice still reads the numbers; "equals" (said after the last
// number in Listen) then comes from the built-in clip, audio/voice-ljspeech-extra.js, or failing that the device voice.
const RECORD_EXTRA = ['equals'], RECORD_ALL = RECORD_WORDS.concat(RECORD_EXTRA);
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
// Speak faster or slower WITHOUT changing the pitch (a plain playbackRate would make the voice squeak or growl).
// Overlap-add with a small search for the best-matching continuation (WSOLA): 30 ms frames, half overlapped.
// x: samples, sr: sample rate, rate: 1.5 = one and a half times as fast. Returns new samples, x itself at 100%.
function stretchSamples(x, sr, rate){
  if (Math.abs(rate-1)<0.005) return x;
  const N=Math.round(sr*0.03)&~1, Hs=N>>1, Ha=Hs*rate, D=Math.round(sr*0.008), st=sr>30000?2:1;
  if (x.length<N*2) return x;
  const w=new Float32Array(N); for (let i=0;i<N;i++) w[i]=0.5-0.5*Math.cos(2*Math.PI*i/N);
  const outLen=Math.max(1, Math.round(x.length/rate)), y=new Float32Array(outLen+N);
  for (let i=0;i<N;i++) y[i]=x[i]*(i<Hs?1:w[i]);   // the first half frame is kept whole (no fade-in)
  let prev=0;
  for (let k=1;;k++){
    const target=Math.round(k*Ha), nat=prev+Hs; if (target+N+D>=x.length || nat+N>=x.length || k*Hs+N>y.length) break;
    let best=0, bestC=-Infinity;
    for (let d=-D; d<=D; d+=st){ const a=target+d; if (a<0) continue; let c=0; for (let i=0;i<N;i+=st) c+=x[a+i]*x[nat+i]; if (c>bestC){ bestC=c; best=d; } }
    prev=target+best; const o=k*Hs; for (let i=0;i<N;i++) y[o+i]+=x[prev+i]*w[i];
  }
  return y.subarray(0, outLen);
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
  ensureCtx(){ if (!this.ctx || this.ctx.state==='closed') this.ctx = this.makeCtx(); return this.ctx; },
  makeCtx(){
    const c = new (window.AudioContext||window.webkitAudioContext)();
    // iOS drops the context to 'suspended' (app backgrounded) or 'interrupted' (a call / Control Center / another app
    // took audio) and fires statechange; nudge it back to running once the child has tapped at least once.
    c.onstatechange = ()=>{ try{ Diag.add('ctx '+c.state); }catch(e){} if (this.gestured && c.state!=='running' && c.state!=='closed'){ try{ c.resume().catch(()=>{}); }catch(e){} } };
    return c;
  },
  // Bring audio back after the app returns from the background. A plain resume() revives a 'suspended' context, but an
  // 'interrupted' one (iOS, after a call or app switch) frequently can't be resumed and has to be rebuilt. Rebuilding
  // is safe: the decoded clips replay on the new context, and the next play() call picks it up via ensureCtx().
  async revive(){
    if (!this.gestured) return;                       // nothing can play before the first tap anyway
    const c = this.ensureCtx();
    if (c.state==='running') return;
    try{ await Promise.race([c.resume(), sleep(400)]); }catch(e){}
    if (c.state==='running') return;
    try{ c.close(); }catch(e){}
    this.playing=[]; this.fitted={};                  // old sources + speed-stretched buffers belonged to the dead context
    this.ctx = this.makeCtx();
    try{ await Promise.race([this.ctx.resume(), sleep(400)]); }catch(e){}
    try{ const b=this.ctx.createBuffer(1,1,22050), s=this.ctx.createBufferSource(); s.buffer=b; s.connect(this.ctx.destination); s.start(0); }catch(e){}
    try{ Diag.add('ctx rebuilt -> '+this.ctx.state); }catch(e){}
  },
  // Self-heal after the app returns from the background. iOS frequently refuses to resume/rebuild audio OUTSIDE a real
  // finger gesture, so a revive() fired by visibilitychange/pageshow/focus can quietly fail and leave faces moving with
  // no sound. Arm a one-shot, capture-phase listener on the first touch/click after return: it unlocks INSIDE that
  // gesture (the reliable iOS path), re-primes speechSynthesis (which a plain revive() leaves alone once unlocked) by
  // clearing ttsReady first, rebuilds the context via revive(), then removes itself. Idempotent; re-armed on each
  // hide->show, so audio comes back the instant the child taps the screen. Best-effort: never throws, never blocks UI.
  armResume(){
    if (this._resumeArmed) return; this._resumeArmed=true;
    const evs=['pointerdown','touchend','click'];
    const fire=()=>{
      evs.forEach(ev=>document.removeEventListener(ev, fire, true));
      this._resumeArmed=false;
      this.ttsReady=false;                              // force unlock() to re-prime the device voice inside this gesture
      try{ this.unlock(); }catch(e){}                   // resume/rebuild + speech unlock, all inside the real gesture
      try{ this.revive(); }catch(e){}                   // rebuild the context if iOS left it interrupted/dead
      try{ Diag.add('return-gesture resume fired'); }catch(e){}
    };
    evs.forEach(ev=>document.addEventListener(ev, fire, true));
  },
  unlock(){ // must run inside a user gesture on iOS (a finger LIFT or click, not a touch-down)
    this.gestured=true;
    try{ const c=this.ensureCtx(); if (c.state!=='running') c.resume(); const b=c.createBuffer(1,1,22050), s=c.createBufferSource(); s.buffer=b; s.connect(c.destination); s.start(0); }catch(e){}
    if ('speechSynthesis' in window && !this.ttsReady){
      // iOS: speech is unlocked only once an utterance really starts inside a tap. Speak something
      // tiny and silent, and never cancel() it (cancelling before it starts leaves speech locked).
      try{ speechSynthesis.resume(); const u=new SpeechSynthesisUtterance('a'); u.volume=0.01; u.rate=2; u.onstart=()=>{ this.ttsReady=true; Diag.add('tts unlocked'); }; u.onerror=(e)=>Diag.add('tts unlock error '+(e&&e.error)); speechSynthesis.speak(u); }catch(e){ Diag.add('unlock exc '+e.message); }
    }
  },
  async prepare(){ // load whatever the current voice needs
    const k=this.kind();
    if (k==='rec'){ for (const pid of this.recPids()) await this.loadRec(pid); return this.loadExtra(); }
    if (k==='sprite'){ await this.loadSprite(settings.voice); return this.loadExtra(); }
  },
  // One voice file: audio/voice-<key>.js calls window.__VOICE_LOADED(key, {sprite}, mp3 base64).
  voiceFile(key, ms){ return new Promise((res,rej)=>{ const prev=window.__VOICE_LOADED; window.__VOICE_LOADED=(k,m,b)=>{ if(k===key) res({map:m,b64:b}); else if (prev) prev(k,m,b); }; const s=document.createElement('script'); s.src='audio/voice-'+key+'.js'; s.onerror=()=>rej(new Error('no voice file')); document.head.appendChild(s); setTimeout(()=>rej(new Error('timeout')),ms); }); },
  // The small pack with the built-in "equals" (kept apart from the big number sprite, which is never rebuilt).
  async loadExtra(){
    if (this.extra) return; if (this.loading.extra) return this.loading.extra;
    this.loading.extra=(async()=>{ try{ const c=this.ensureCtx(); const {map,b64}=await this.voiceFile('ljspeech-extra', 15000); this.extra={ buf:await decode(c, unb64(b64)), map:map.sprite }; }catch(e){ Diag.add('extra words not loaded: '+(e&&e.message||e)); } delete this.loading.extra; })();
    return this.loading.extra;
  },
  async loadRec(pid, force){
    if (this.recLoaded[pid] && !force) return;
    const key='rec:'+pid; if (this.loading[key]) return this.loading[key];
    this.loading[key]=(async()=>{ try{
      const c=this.ensureCtx(); const stored=await ClipStore.getProfile(pid); const out={}; const bad=[];
      for (const [w,v] of Object.entries(stored)){ try{ out[w]=await decode(c, await clipBytes(v)); }catch(e){ bad.push(w); } }
      this.recs[pid]=out; this.recLoaded[pid]=true; this.fitted={};
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
      const {map,b64}=await this.voiceFile(key, 60000);
      this.sprite[key]=await decode(c, unb64(b64)); this.spriteMap[key]=map.sprite;
    }catch(e){ console.warn('sprite load failed', key, e); } delete this.loading[key]; })();
    return this.loading[key];
  },
  canSchedule(){
    const k=this.kind();
    if (k==='rec'){ if (!this.activePid || !this.isComplete(this.activePid)) this.pickReader(false); return !!this.activePid; }
    return k==='sprite' && !!this.sprite[settings.voice];
  },
  // One clip at audio-clock time t, at the chosen voice speed; returns how long it lasts. At 100% the recording is played
  // exactly as it is (for a sprite: its slice [off, off+dur]). At any other speed the clip is first made longer or shorter
  // with the pitch kept (stretchSamples) and then played whole at normal rate, so nothing is cut early or late.
  fitted:{}, fitRate:1,
  playClip(key, buf, t, off, dur){
    if (!buf) return dur || 0;                                                  // never start a source with no buffer
    const c=this.ctx, rate=snapSpeed('voiceRate', settings.voiceRate); let b=buf, whole=off===undefined;
    if (rate!==1){
      if (this.fitRate!==rate){ this.fitted={}; this.fitRate=rate; }
      b=this.fitted[key];
      if (!b){ const sr=buf.sampleRate, a=whole?0:Math.round(off*sr), n=whole?buf.length:Math.round(dur*sr), y=stretchSamples(buf.getChannelData(0).subarray(a, a+n), sr, rate); b=c.createBuffer(1, y.length, sr); b.getChannelData(0).set(y); this.fitted[key]=b; }
      whole=true;
    }
    const s=c.createBufferSource(); s.buffer=b; s.connect(c.destination); if (whole) s.start(t); else s.start(t, off, dur); this.playing.push(s);
    return whole ? b.duration : dur;
  },
  // Schedule one term at audio-clock time `when`; returns end time. Only when canSchedule().
  hasTimes(){ const m=this.spriteMap[settings.voice]; return !!(m && m.t2 && m.t9); },   // voice has "times N" clips -> multiplication can be spoken in-voice (not device)
  scheduleTerm(d, first, when, kind){
    const c=this.ctx; let t=Math.max(when||0, c.currentTime+0.02);
    if (this.kind()==='rec'){
      const r=this.recs[this.activePid];
      for (const w of termTokens(d, first)){ const b=r[w]; if(!b) continue; t+=this.playClip('rec:'+this.activePid+':'+w, b, t)+0.06; }
    } else {
      const buf=this.sprite[settings.voice], m=this.spriteMap[settings.voice];
      const a=Math.abs(d), pre = kind==='times' ? 't' : (first?'n':d<0?'m':(settings.sayPlus?'p':'n'));
      const ids = kind==='times' ? ['t'+a] : (a<100 ? [pre+a] : [pre+Math.floor(a/100),'hundred'].concat(a%100?['n'+(a%100)]:[]));
      for (const id of ids){ const sp=m[id]; if(!sp) continue; t+=this.playClip(settings.voice+':'+id, buf, t, sp[0], sp[1])+0.05; }
    }
    return t;
  },
  // "equals" after the last number, on the audio clock at `when`, at the Listen voice speed. Returns [end time, source],
  // or null when no clip is loaded (the caller then uses the device voice).
  scheduleEquals(when){
    const c=this.ctx, t=Math.max(when||0, c.currentTime+0.02);
    const own = this.kind()==='rec' && (this.recs[this.activePid]||{}).equals;
    if (own) return [t+this.playClip('rec:'+this.activePid+':equals', own, t), 'own recording'];
    // A sprite voice (e.g. Juni) that has its own "equals" uses it, so the word matches the numbers' voice.
    if (this.kind()==='sprite'){ const sm=this.spriteMap[settings.voice], se=sm&&sm.equals; if (se) return [t+this.playClip(settings.voice+':equals', this.sprite[settings.voice], t, se[0], se[1]), 'sprite voice']; }
    const x=this.extra, sp=x && x.map.equals;
    return sp ? [t+this.playClip('extra:equals', x.buf, t, sp[0], sp[1]), 'built-in clip'] : null;
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
        u.rate=snapSpeed('voiceRate', settings.voiceRate); u.pitch=1;   // the device voice keeps its pitch at any rate
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
  async select(pid){ this.pid=pid; settings.recPid=pid; saveSettings(); this.clips = pid ? await ClipStore.getProfile(pid) : {}; const first=RECORD_ALL.findIndex(w=>!this.clips[w]); this.idx = first<0 ? 0 : first; this.render(); },
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
    const w=RECORD_ALL[this.idx]; $('#recWord').textContent=w; $('#recCount').textContent=(this.idx+1)+' / '+RECORD_ALL.length;
    const done=RECORD_WORDS.filter(x=>this.clips[x]).length, all=done===RECORD_WORDS.length, nm=profileName(this.pid), more=RECORD_EXTRA.filter(x=>!this.clips[x]);
    $('#recStatus').textContent = all && more.length
      ? `${nm}: all ${RECORD_WORDS.length} number words recorded. One more: “${more[0]}”, said after the last number` + (RECORD_EXTRA.includes(w) ? (this.stream ? '. Hold the button and say it.' : '. Tap "Start recording", then hold.') : '. Find it with the arrows.') + ' Until then the built-in voice says it.'
      : all
      ? `${nm}: all ${RECORD_ALL.length} words recorded. To redo one, find it with the arrows` + (this.stream ? ' and hold to record.' : ', tap "Start recording", then hold.')
      : `${nm}: ${done} of ${RECORD_WORDS.length} recorded.` + (this.stream ? (this.clips[w] ? ' This word is done; hold to redo it.' : ' Hold the button and say the word.') : ' Tap "Start recording" to use the microphone.');
    $('#recPlay').disabled=!this.clips[w];
  },
  begin(){ if(!this.stream) return; this.chunks=[]; const mt=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t))||''; this.rec=new MediaRecorder(this.stream, mt?{mimeType:mt}:{}); this.rec.ondataavailable=e=>{ if(e.data.size) this.chunks.push(e.data); }; this.rec.start(); $('#recBtn').classList.add('on'); },
  async end(){
    if(!this.rec || this.rec.state!=='recording') return; const rec=this.rec;
    await new Promise(res=>{ rec.onstop=res; rec.stop(); }); $('#recBtn').classList.remove('on');
    const blob=new Blob(this.chunks,{type:rec.mimeType||'audio/mp4'});
    const bytes = await this.clean(blob);
    const pid=this.pid, w=RECORD_ALL[this.idx]; const wasDone=RECORD_WORDS.every(x=>this.clips[x]); const val={buf:bytes, type:'audio/wav'}; await ClipStore.put(pid, w, val); this.clips[w]=val;
    Speaker.recLoaded[pid]=false; this.render(); await this.play();
    if (RECORD_WORDS.every(x=>this.clips[x])){
      await Speaker.loadRec(pid, true);
      if (Speaker.kind()!=='rec') { settings.voice='rec:'+pid; saveSettings(); }
      fillVoiceSelect(); renderProfiles();
      if (!Speaker.isComplete(pid)){ $('#recStatus').textContent='Some words could not be read back; see Sound check.'; return; }
      // The numbers are done: offer "equals" next (optional), once, straight after the last number word.
      const more=RECORD_ALL.findIndex(x=>!this.clips[x]);
      if (more>=0 && !wasDone){ this.idx=more; this.render(); return; }
      if (more<0) $('#recStatus').textContent=`All ${RECORD_ALL.length} words recorded for ${profileName(pid)}. Pick the voice above and tap Test to hear it.`;
      return;
    }
    const nxt=RECORD_ALL.findIndex((x,i)=>i>this.idx && !this.clips[x]); this.idx = nxt>=0 ? nxt : Math.min(RECORD_ALL.length-1, this.idx+1); this.render();
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
  async play(){ const w=RECORD_ALL[this.idx]; const v=this.clips[w]; if(!v) return; const c=Speaker.ensureCtx(); try{ if (c.state!=='running') await c.resume(); const buf=await decode(c, await clipBytes(v)); const s=c.createBufferSource(); s.buffer=buf; s.connect(c.destination); s.start(); await new Promise(r=>setTimeout(r, buf.duration*1000)); }catch(e){ Diag.add('playback failed for '+w+': '+(e&&e.message||e)); } },
  prev(){ this.idx=Math.max(0,this.idx-1); this.render(); }, next(){ this.idx=Math.min(RECORD_ALL.length-1,this.idx+1); this.render(); },
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
  // Read a chosen file before anything is asked or changed. Anything that is not one of our backups gets one plain sentence.
  check(text){
    let d=null; try{ d=JSON.parse(text); }catch(e){}
    if (!d || typeof d!=='object' || Array.isArray(d) || d.app!=='abacus-practice' || !(d.voices || d.children || d.progress)) throw new Error('This is not a Bix Abacus backup file');
    const kids=(d.format>=3 && Array.isArray(d.children)) ? d.children.filter(c=>c && c.id) : null;
    return { d, kids, voices:(d.voices && d.voices.profiles || []).length, hasProgress: !!(kids ? kids.length : d.progress) };
  },
  // What to restore: resolves 'all', 'voices' or null (Cancel, Escape or a tap outside: nothing is changed).
  ask(info){
    const names=(info.kids||[]).map(c=>c.name || 'New child'), when=info.d.savedAt ? niceDate(String(info.d.savedAt).slice(0,10)) : '';
    const holds=[ info.kids ? `${names.length} ${names.length===1?'child':'children'}${names.length ? ' ('+names.join(', ')+')' : ''}` : (info.hasProgress ? 'progress' : ''), info.voices ? `${info.voices} recorded voice${info.voices===1?'':'s'}` : '' ].filter(Boolean).join(' and ');
    const lines=[ `This backup${when ? ' from '+when : ''} holds ${holds || 'no progress and no voices'}.` ];
    if (info.kids) lines.push('Restoring progress replaces the children in the file with their saved copy, and the settings with the saved settings. Other children already on this device are kept.');
    else if (info.hasProgress) lines.push('Restoring progress replaces the progress and settings on this device with the saved copy.');
    if (info.voices) lines.push('Recorded voices in the file replace the same voices on this device.');
    return new Promise(resolve=>{
      const back=document.createElement('div'); back.className='toy-dialog'; back.setAttribute('role','presentation');
      const btn=(r, label, col)=>`<button type="button" class="toy-block toy-block--${col} toy-block--sm" data-r="${r}"><span class="toy-block-label">${esc(label)}</span></button>`;
      back.innerHTML=`<div class="toy-dialog-panel toy-paper" role="alertdialog" aria-modal="true" aria-labelledby="bkAskT" aria-describedby="bkAskM"><h2 class="toy-dialog-title" id="bkAskT">Restore this backup?</h2>`
        + `<div class="toy-dialog-msg" id="bkAskM">${lines.map(l=>`<p>${esc(l)}</p>`).join('')}</div><div class="toy-dialog-btns bk-ask-btns">${btn('0','Cancel','wood')}`
        + (info.voices && info.hasProgress ? btn('v','Voices only','wood') : '') + btn('1', info.hasProgress ? (info.voices ? 'Restore everything' : 'Restore progress') : 'Restore voices', 'teal') + `</div></div>`;
      const prev=document.activeElement;
      const done=r=>{ document.removeEventListener('keydown', onKey, true); back.remove(); if (prev && prev.focus) try{ prev.focus(); }catch(e){} resolve(r); };
      const onKey=e=>{ if (e.key==='Escape'){ e.preventDefault(); done(null); } };
      back.addEventListener('click', e=>{ const b=e.target.closest('button[data-r]'); if (b) done(b.dataset.r==='1' ? (info.hasProgress ? 'all' : 'voices') : b.dataset.r==='v' ? 'voices' : null); else if (e.target===back) done(null); });
      document.addEventListener('keydown', onKey, true); document.body.appendChild(back); back.querySelector('[data-r="0"]').focus();
    });
  },
  async restore(text, withProgress){
    const d=this.check(text).d;
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
function stopVoices(){ try{ if(window.Classroom) Classroom.Voice.stop(); }catch(e){} try{ Fun.BixVoice.stop(); }catch(e){} }   // cut any line from both systems
function show(id){ $$('.screen').forEach(s=>s.classList.toggle('active', s.id===id)); }

/* ---------------- home (Workshop: Bix, Today on the soroban, three doors) ---------------- */
function curIdx(){ return NODE_IDX[progress.current] ?? 0; }
function stars(nid){ const h=node(nid).hist.slice(-20); if(!h.length) return 0; const p=h.filter(x=>x.ok).length/h.length; return node(nid).mastered ? 3 : p>=0.8 ? 2 : h.length>=5 ? 1 : 0; }
// Home greeting: Juni (the teacher, the moon in the window) leads and greets FIRST; then Bixi (the classmate,
// the bead on the table) adds a short countdown. Each helper returns [voice key, bubble caption].
// The caption can use the child's name; the recorded voice line never does (voices/CONTRACT.md).
function juniGreet(allDone){
  const nm = settings.name ? `, ${settings.name}` : '';
  if (allDone) return ['j_end_amazing', `Amazing work${nm}! You filled me all the way up today.`];
  const h = new Date().getHours(), back = (Fun.data.seen % 2) === 1;       // alternate a warm welcome-back with the time-of-day hello
  if (back) return ['j_hello_back', `You're back${nm}! I missed you!`];
  if (h < 12) return ['j_hello_morning', `Good morning${nm}! Ready to move some beads?`];
  if (h < 17) return ['j_hello_afternoon', `Good afternoon${nm}! Let's do some abacus!`];
  return ['j_hello_evening', `Good evening${nm}! A little practice before bed?`];
}
// Bixi counts how many step-beads are left to fill up Juni. His recorded lines say "Juni", so when the owner
// renames the moon the caption uses the real name and the clip stays silent (bubble still shows).
function bixiCount(steps, allDone){
  if (allDone) return ['b_home_alldone', "You did all of today's practice! Want to play a game?"];
  const left = steps.filter(s=>!s.done).length, k = Math.min(3, Math.max(1, left)), spoken = TOY.moonName === 'Juni';
  return [spoken ? 'b_home_steps' + k : null, `${NUM_WORD[left] || left} ${left === 1 ? 'bead' : 'beads'} to fill up ${TOY.moonName}!`];
}
let greeted=false;
// Speak the home greeting in order: Juni first (her bubble + talking moon), then Bixi (his bubble + talking mouth).
let homeGreetSeq = 0;
async function speakHomeGreeting(jKey, jText, bKey, bText){
  const CLr = window.Classroom; if (!CLr) return showHomeBubbles(jText, bText);
  const seq = ++homeGreetSeq;
  const jb = $('#homeJuni'), sky = $('#homeSky'), bh = $('#bixHome');
  Fun.Mascot.quiet(bh);                                   // Bixi stays a quiet, waving sidekick; Juni is the lead and the only greeter
  try{ await CLr.say(jKey, { who:'juni', text:jText, bubble:jb, figure:sky, ms:0 }); }catch(e){}   // a failed/hung greeting clip must never surface as an uncaught rejection
}
// Show Juni's greeting bubble without playing audio (returning to home, or before the first tap). Juni leads; Bixi has no competing bubble.
function showHomeBubbles(jText, bText){
  const CLr = window.Classroom; if (!CLr) return;
  CLr.showBubble($('#homeJuni'), jText, 'juni', 0);
}
document.addEventListener('click', e=>{
  if (greeted || !$('#home').classList.contains('active')) return;
  const onButton = e.target.closest('button') && !e.target.closest('#bixHome');
  setTimeout(()=>{ if (!onButton && !greeted && $('#home').classList.contains('active')) renderHome(); }, 120);
}, true);
/* ---- Toy Table look for home, who, gate and first-run setup (TOY.* in toykit.js, styles in toy-home.css) ---- */
// Bix everywhere is Fun.Mascot (fun.js), which draws TOY.bix; rest(el, mood) mounts him once and sets his resting pose.
const toyBix = (el, rest, opts)=>Fun.Mascot.rest(el, rest, Object.assign({size:96, keep:true}, opts||{}));
// Today's steps are three lacquer beads on a rod: 1 red, 2 mustard, 3 indigo (the same colours as their number chips).
// A finished bead turns teal with a tick; the next one glows.
const STEP_COLORS = ['red','mustard','indigo'], KID_COLORS = ['red','indigo','teal','mustard'], NUM_WORD = ['No','One','Two','Three','Four','Five'];
function stepBead(s, nextI){
  const i = s.at, cur = i===nextI, col = STEP_COLORS[i%3];
  const state = s.done ? 'done' : cur ? 'now' : 'later', just = s.done && stepBead.seen && !stepBead.seen[i];
  return `<li class="step th-step ${state}${just?' just':''}${cur?' next':''}" data-n="${i+1}" data-c="${col}" aria-label="${esc(s.label)}${s.done?' (done)':cur?' (next)':''}">`
    + `<span class="th-bead">${TOY.bead(s.done ? 'teal' : col, 150, {tall:true})}${s.done ? `<span class="th-bead-ic">${TOY.icon('check', 44, '#fff', {stroke:3.4})}</span>` : ''}</span><span class="sl th-lab" data-n="${i+1}"${String(s.label).length>9 ? ' data-long' : ''}>${esc(s.label)}</span></li>`;
}
// The moon in the window fills as today's steps get done: thin crescent, half, gibbous, then full and proud.
const HOME_SPARKS = `<svg class="th-sparks" viewBox="0 0 430 200" aria-hidden="true">`
  + [[52,44,9],[118,26,6],[246,40,10],[306,104,7],[362,36,8],[88,118,6],[270,132,5]].map(([x,y,r],i)=>`<path d="M${x},${y-r} Q${x+r*.18},${y-r*.18} ${x+r},${y} Q${x+r*.18},${y+r*.18} ${x},${y+r} Q${x-r*.18},${y+r*.18} ${x-r},${y} Q${x-r*.18},${y-r*.18} ${x},${y-r}Z" fill="${i%3===1?'#F7C843':'#FFFDF6'}"/>`).join('') + `</svg>`;
function homeMoon(done, total){
  const full = done>=total, phase = TOY.stepPhase(done, total), key = done+'/'+total, sky=$('#homeSky');
  if (sky.dataset.k===key) return; sky.dataset.k=key;
  sky.innerHTML = TOY.skyMoon(full ? 'proud' : done ? 'happy' : 'calm', phase) + (full ? HOME_SPARKS : '');
}
function renderHome(opts){
  const many = Store.children().length>1, tagName = settings.name || (many ? 'New child' : '');
  const tagCol = KID_COLORS[Math.max(0, Store.children().findIndex(c=>c.id===Store.activeId()))%KID_COLORS.length];
  const sk=$('#switchKid'); sk.style.display = many ? '' : 'none'; sk.innerHTML = many ? TOY.tag(tagName, {hang:true, color:tagCol}) : '';
  sk.setAttribute('aria-label', 'Switch child' + (tagName ? ` (now ${tagName})` : ''));
  $('#homeTag').innerHTML = !many && tagName ? TOY.tag(tagName, {hang:true, color:tagCol}) : '';
  const cur = NODES[curIdx()];
  // Practice-first home: the level's own progress drives everything (10 sets to a level, then the trophy).
  const L = window.__level, done = Math.min(L.setsDone(cur.id), L.LEVEL_SETS), total = L.LEVEL_SETS, allDone = L.levelComplete(cur.id);
  // Bixi (the classmate) sits small on the table; Juni (the teacher) leads from the window.
  const bh=$('#bixHome'); toyBix(bh, allDone ? 'proud' : 'wave', {bubble:false});
  // The moon in the window fills as this level's practice sets are cleared (Juni full + proud at 10/10).
  $('#home').classList.toggle('is-done', allDone);
  homeMoon(done, total); wireMoonTap('#homeSky'); armBixiIdle();
  // Greeting: Juni speaks (her bubble + the glowing moon), spoken once per app visit (the first time sound is
  // allowed) and again when the level is finished; otherwise the bubble just shows. Bixi stays a silent sidekick.
  const canTalk = !!Speaker.gestured;   // sound is allowed once the child has tapped once
  if (!settings.name){
    // Juni leads the name ask from the window; tapping the moon opens the box. Bixi stays a quiet sidekick.
    Fun.Mascot.quiet(bh);
    juniSayOn($('#homeJuni'), $('#homeSky'), 'j_home_name', "I don't know your name yet. Tap me and tell me!");
  } else {
    const [jKey, jText] = juniGreet(allDone);
    const speak = canTalk && (!greeted || (allDone && !renderHome.saidDone));
    if (opts && opts.quietGreet){ showHomeBubbles(jText, ''); }
    else if (speak){ Fun.data.seen++; greeted=true; if (allDone) renderHome.saidDone=true; speakHomeGreeting(jKey, jText, null, ''); }
    else { showHomeBubbles(jText, ''); }
  }
  Fun.save();
  renderTrophy(done, total, allDone);
  // Per-mode label so the home reflects the Reading/Listening structure, not just a raw session count.
  { const lab = $('#homeTrophy .th-trophy-lab'), Lv = window.__level, T = Lv.MODE_SESSIONS;
    if (lab && !Lv.isFlashNode(cur.id)){
      const base = `Read ${Lv.modeDone(cur.id,'reading')}/${T} · Listen ${Lv.modeDone(cur.id,'listening')}/${T}`;
      lab.textContent = allDone ? 'Level done!' : (Lv.anzanEligible() ? `${base} · Mental ${Lv.modeDone(cur.id,'mental')}/${T}` : base); } }
  Treats.renderJar();
  driveHomeKit(done, total, allDone);   // new look: drive the <ab-home-screen> component from the same state
}
// Kit home (new look): populate <ab-home-screen> from the current state and route its taps to the engine.
// Staged migration — the old #homeOld markup stays hidden in the DOM (its load-time handlers remain valid) until
// this is approved, then it gets removed with a deliberate contract-baseline update.
let homeKitWired = false;
function driveHomeKit(done, total, allDone){
  const el = document.getElementById('homeKit'); if (!el) return;
  const cur = NODES[curIdx()];
  const beads = (Fun.data.wallet && Fun.data.wallet.beads) || 0;
  const greet = juniGreet(allDone)[1];
  const set = (k,v)=>{ v=String(v); if (el.getAttribute(k)!==v) el.setAttribute(k,v); };
  set('name', settings.name || 'friend');
  set('stars', beads);
  set('lesson-label', "Today's lesson");
  set('lesson-title', cur.title);
  set('lesson-text', cur.intro || '');
  set('done', done); set('total', total);
  set('greeting', greet);
  set('bixi-line', 'Psst… practice with me today?');
  if (!homeKitWired){
    homeKitWired = true;
    el.addEventListener('ab-action', (e)=>{
      const a = e.detail && e.detail.action; Speaker.unlock();
      if (a==='start') return Practice.start();          // primary: the current level's flow (lesson first time, then the picker)
      if (a==='practice') return startMode('visual');    // direct reading/visual drill
      if (a==='listen') return startMode('listen');      // direct listening drill
      if (a==='play') return goPlay();                   // games hub
      if (a==='grownups') return openGate();             // grown-ups gate
      if (a==='profile') return showWho();               // switch / manage child
    });
  }
}
// The level trophy sits above the big Practice button: ten little beads fill as sets are cleared, the cup lights
// at 10/10. This is the child's motivator — one clear goal, no scattered tiles.
const TROPHY_SVG = '<svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden="true">'
  + '<path class="th-cup-handle" d="M14 16 H8 a7 7 0 0 0 7 11" fill="none" stroke-width="4" stroke-linecap="round"/>'
  + '<path class="th-cup-handle" d="M50 16 H56 a7 7 0 0 1-7 11" fill="none" stroke-width="4" stroke-linecap="round"/>'
  + '<path class="th-cup-bowl" d="M14 12 h36 v8 a18 18 0 0 1-36 0 z"/>'
  + '<rect class="th-cup-stem" x="29" y="37" width="6" height="9"/>'
  + '<rect class="th-cup-base" x="20" y="46" width="24" height="7" rx="3"/>'
  + '<path class="th-cup-star" d="M32 15 l2.1 4.2 4.6.7-3.3 3.2.8 4.6-4.2-2.2-4.2 2.2.8-4.6-3.3-3.2 4.6-.7 z"/>'
  + '</svg>';
function renderTrophy(done, total, full){
  const t=$('#homeTrophy'); if (!t) return;
  const pips = Array.from({length:total},(_,i)=>`<i class="th-pip${i<done?' on':''}"></i>`).join('');
  t.classList.toggle('full', full);
  t.innerHTML = `<span class="th-cup${full?' lit':''}">${TROPHY_SVG}</span>`
    + `<span class="th-pips">${pips}</span>`
    + `<span class="th-trophy-lab">${full ? 'Level done!' : done + ' / ' + total}</span>`;
  t.setAttribute('aria-label', full ? 'Level complete — trophy earned!' : `Level progress: ${done} of ${total} practice sets done`);
}
// Things on the home table that never change (kit drawings, no emoji).
$('#grownups').innerHTML = TOY.icon('lock', 30, 'currentColor');
$('#doorPracticeIc').innerHTML = TOY.icon('practice', 64, '#fff', {stroke:3, accent:'#fff'});
$('#doorPlayIc').innerHTML = TOY.icon('star', 46, 'currentColor', {accent:'#FFFDF6'});
$('#doorRoomIc').innerHTML = TOY.icon('room', 46, 'currentColor');
$('#homeShelf').innerHTML = TOY.prop('rainbow', 150) + TOY.prop('plant', 170);
$('#homeLoose').innerHTML = TOY.bead('mustard', 64) + TOY.bead('teal', 72) + TOY.bead('indigo', 58);
$('#homeBowl').innerHTML = TOY.prop('bowl', 190);
// Juni (the moon) asks for a name when the device doesn't have one yet; tapping the moon opens the box
// (wired in wireMoonTap, which opens it during the tap so the keyboard may open with it: see Typing).
function openNameAsk(){
  toyBix($('#bixName'), 'happy', {bubble:false});
  $('#nameAskIn').value=''; $('#nameAsk').classList.add('active'); Typing.afterTap($('#nameAskIn'), ()=>$('#nameAsk').classList.contains('active'));
}
function saveAskedName(){ const n=$('#nameAskIn').value.trim().replace(/\s+/g,' ').slice(0,20); if(!n){ Typing.focus($('#nameAskIn')); Fun.Mascot.react($('#bixName'),'oops'); return; } settings.name=n; saveSettings(); $('#nameAskIn').blur(); $('#nameAsk').classList.remove('active'); Sfx.ok(); homeGreetSeq++; renderHome({quietGreet:true}); Fun.Mascot.react($('#bixHome'),'cheer'); juniSayOn($('#homeJuni'), $('#homeSky'), 'j_intro_meet', `Hi, ${n}! Lovely to meet you!`); }
$('#nameAskOk').addEventListener('click', saveAskedName);
$('#nameAskIn').addEventListener('keydown', e=>{ if(e.key==='Enter') saveAskedName(); });
$('#nameAskNo').addEventListener('click', ()=>{ $('#nameAskIn').blur(); $('#nameAsk').classList.remove('active'); });
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
    // A skill with no sums yet (bead numbers) is practised by making numbers (Bead Builder) and reading them (Bead Detective).
    const plan = n.drill ? [ {kind:s1}, {kind:'game', game:g}, {kind:s3} ]
      : s1==='lesson' ? [ {kind:'lesson'}, {kind:'game', game:'build'}, {kind:'game', game:'reader'} ]
      : (k%2===0 ? ['build','reader','build'] : ['reader','build','reader']).map(x=>({kind:'game', game:x}));
    F.today = { day, celebrated:false, steps:plan.map(s=>Object.assign(s,{done:false})) };
    Fun.save();
  }
  return F.today.steps.map((s,at)=>{ const [icon,label]=STEP_INFO[s.kind]; const g=s.game&&Games.GAMES[s.game]; return Object.assign({}, s, { at, icon, label: g?g.name:label }); });
}
// Start a Today step. What actually runs is remembered (F.today.active), so finishing it ticks this step
// even when the step had to run something else (e.g. a Look step that first teaches a newly unlocked skill).
// Mental-math (flash / anzan) nodes: show Juni's voiced "New skill" intro card once, then flow straight into the
// flash drill. Reuses the lesson intro machinery (startLesson -> intro phase -> advanceLesson sends flash nodes
// into the drill). After the first time (node.lesson set), Flash goes straight to the drill.
function startFlash(n, from){
  n = (n && n.kind==='flash') ? n : NODES[curIdx()];
  if (n && n.kind==='flash' && n.intro && !node(n.id).lesson) return startLesson(n, from);
  return startDrill('flash', n);
}
function startStep(s){
  const n=NODES[curIdx()], F=Fun.data;
  const ran = (kind)=>{ if (F.today) { F.today.active={ at:s.at, kind }; Fun.save(); } };
  if (s.kind==='lesson'){ ran('lesson'); return startMode('learn'); }
  if (s.kind==='game'){ ran('game'); return Games.open(s.game, {from:'home'}); }
  if (!n.drill && s.kind!=='lesson'){                                        // a plan made before this skill had bead games: never a drill without sums
    if (hasLesson(n) && !node(n.id).lesson){ ran('lesson'); return startLesson(n); }
    ran('game'); return Games.open(s.kind==='listen' ? 'build' : 'reader', {from:'home'});
  }
  if ((s.kind==='visual'||s.kind==='listen') && hasLesson(n) && !node(n.id).lesson){ ran('lesson'); return startLesson(n); }   // learn a new skill before drilling it
  if (s.kind==='flash'){ ran('flash'); return startFlash(n); }
  ran(s.kind); return startDrill(s.kind, n.kind==='flash' ? C.BY_ID.combined : n);
}
// Called whenever she finishes something: plants today's flower, gives a sticker, ticks today's step.
async function activityDone(kind, info={}){
  days[todayKey()]=true; save('days',days);
  const F=Fun.data; if (F.today && F.today.day===todayKey()){
    const a=F.today.active, own = a && a.kind===kind && F.today.steps[a.at] && !F.today.steps[a.at].done ? F.today.steps[a.at] : null;
    const st = own || F.today.steps.find(s=>!s.done && s.kind===kind); if (st) st.done=true; F.today.active=null; }
  Fun.save();
  // Rewards no longer trickle out per activity: beads come only from finishing a practice SET (Practice.celebrate)
  // and mastering a skill (Practice.levelDone). Games, lessons and "just showing up" earn nothing, and there is no
  // collectible sticker album. activityDone now only records the day and refreshes the home screen.
  if ($('#home').classList.contains('active')){ renderHome(); setTimeout(()=>{ if ($('#home').classList.contains('active')) maybeBixiMoment($('#bixHome')); }, 900); }   // a Bixi moment between activities
}
// (The old "Today" Start button is gone — the big Practice button, #doorPractice, launches the level run below.)
function goPlay(){ stopVoices(); Games.renderHub(); toySky('#playSky'); const bp=$('#bixPlay'); toyBix(bp, 'happy', {size:84, keep:false, bubble:false});
  // Juni leads the hub invite from the window; Bixi is the quiet, reacting sidekick (his joke moment still fires after her line).
  Fun.Mascot.quiet(bp); juniSayOn($('#playJuni'), $('#playSky'), 'j_play_pick', 'Pick a game! Every game gives you a sticker.');   // caption matches the recorded clip
  show('play'); setTimeout(()=>{ if ($('#play').classList.contains('active')) maybeBixiMoment(bp); }, 2600); }
function goAlbum(){ Fun.renderAlbum(); Fun.data.albumSeen=Fun.count(); Fun.save(); show('album'); }
$('#exitPlay').addEventListener('click', ()=>{ stopVoices(); renderHome(); show('home'); });
$('#exitGame').addEventListener('click', ()=>{ stopVoices(); if (Practice.on){ Games.stop(); if (!isFlashNode(Practice.node)) return Practice.pick(); Practice.stop(); renderHome(); show('home'); return; } Games.stop(); Games.leave(); });   // G3: Back during a practice set returns to the Reading/Listening picker (never home mid-session, never the Play hub)
// The three doors. Practice opens the Practice door screen (#door).
function openPractice(){ stopVoices();
  Speaker.unlock();
  if (typeof window.App.openDoor==='function') return window.App.openDoor();
  return show('door');
}
// Start a practice mode for the current skill (used by the Practice door and the tests).
function startMode(m){ stopVoices();
  Speaker.unlock();
  const n=NODES[curIdx()];
  if (m==='play') return goPlay();
  if (m==='album') return goAlbum();
  if (m==='learn'){ const target = hasLesson(n) ? n : NODES.slice(0,curIdx()).reverse().find(x=>x.demos) || n; return startLesson(target); }
  if (m==='flash') return startFlash(n.kind==='flash' ? n : NODES[curIdx()], 'door');
  return startDrill(m, n.kind==='flash' ? C.BY_ID.combined : n);
}
// Practice-first: the home Practice door launches the guided 10x10 level run (listen/read/build), resuming at the next set.
$('#doorPractice').addEventListener('click', ()=>{ Speaker.unlock(); Practice.start(); });
$('#doorPlay').addEventListener('click', ()=>{ Speaker.unlock(); goPlay(); });
$('#doorRoom').addEventListener('click', ()=>{ Speaker.unlock(); goRoom(); });

/* ---------------- My Room: sticker book, flower pot, treat jar (Toy Table look) ---------------- */
// The moon in the window of these screens: she fills as today's steps get done and is proud when they all are.
function toySky(sel){
  const el = typeof sel==='string' ? $(sel) : sel; if (!el) return; const st=todaySteps(), tot=st.length||3, done=st.filter(x=>x.done).length, full=st.length>0 && done===st.length;
  el.innerHTML = TOY.skyMoon(full ? 'proud' : done ? 'happy' : 'calm', TOY.stepPhase(done, tot));
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
$('#roomShelfArt').innerHTML = TOY.prop('rainbow', 124) + SHELF_BOOKS + TOY.prop('bowl', 116); $('#roomLamp').innerHTML = TOY.prop('lamp', 200);
$('#exitRoom').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitAlbum').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitShop').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitPlay').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#exitGame').innerHTML = TOY.icon('back', 30, 'currentColor');
$('#roomWishIc').innerHTML = TOY.icon('star', 30, '#4A2C06');
function renderRoom(){
  toySky('#roomSky');
  // The garden is the one progress visual: it grows a flower for every skill mastered (not for days shown up).
  const masteredN = NODES.filter(nd => node(nd.id).mastered).length;
  const n = Fun.renderGarden($('#garden'), $('#gardenLabel'), masteredN);
  $('#roomGarden').setAttribute('aria-label', `My garden: ${$('#gardenLabel').textContent}`);
  Treats.renderJar();
  $('#roomWish').classList.toggle('tr-nudge', !Treats.goal());   // nudge only to pick a goal, never to spend
  return n;
}
function goRoom(){ stopVoices();
  renderRoom(); show('room');
  // Bixi shrinks to a quiet sidekick on the table; Juni leads the jar line from the window moon.
  const br=$('#bixRoom'); toyBix(br, 'happy', {size:84, bubble:false}); Fun.Mascot.quiet(br);
  const [text, vid] = Treats.jarLine();   // Treats.jarLine() feeds only here: its state (via vid) picks Juni's key, caption keeps its dynamic text
  const jKey = vid==='shop_pick' ? 'j_room_jar_pick' : vid==='shop_saving' ? 'j_room_jar_saving' : 'j_room_jar_full';
  const jText = vid==='shop_pick' ? 'Pick a treat to save for. Tap Treats.' : vid==='shop_saving' ? text : 'Your jar is full enough for your treat!';
  juniSayOn($('#roomJuni'), $('#roomSky'), jKey, jText);
}
$('#exitRoom').addEventListener('click', ()=>{ stopVoices(); renderHome(); show('home'); });
$('#roomGarden').addEventListener('click', ()=>{
  Sfx.boing(); const pot=$('#garden'); pot.classList.remove('wiggle'); void pot.offsetWidth; pot.classList.add('wiggle');
  const n=Object.keys(days).filter(k=>k.startsWith(todayKey().slice(0,8))).length, br=$('#bixRoom');
  Fun.Mascot.react(br,'happy');   // Bixi gives the happy wiggle; Juni says the garden line (caption keeps the "N flowers" count)
  if (n) juniSayOn($('#roomJuni'), $('#roomSky'), 'j_room_garden', `${n} flower${n===1?'':'s'} this month! Every day you practise, a new one grows.`);
  else juniSayOn($('#roomJuni'), $('#roomSky'), 'j_room_garden_none', 'Practise today and a flower will grow!');
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
    let ctx=Speaker.ensureCtx(); const tag=BV.tag(); const my=++BV.seq; BV.queued++;
    // iOS may have left the context suspended/interrupted after a background trip; revive() resumes or rebuilds it.
    // Re-fetch the live context after, since a rebuild swaps Speaker.ctx (the old one is closed and would throw).
    try{ if (ctx.state!=='running'){ try{ await Speaker.revive(); }catch(e){} ctx=Speaker.ensureCtx(); } await this.load(tag); } finally { BV.queued--; }
    if (my!==BV.seq || ctx.state!=='running') return;                 // still not running: stay silent, never mouth to a dead context
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
const BACK_ICON = ()=>TOY.icon('back', 30, 'currentColor', {stroke:3});
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
function replay(el, cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
$('#exitDoor').innerHTML=TOY.icon('back', 32, 'currentColor'); $('#exitLesson').innerHTML=TOY.icon('back', 32, 'currentColor');

// The three ways to practise: wooden toy blocks with a lacquer face. [TOY icon, label, icon colour, accent]
const DOOR_TOYS = { visual:['eye','Look','#fff','#FFD25E','Look: read the numbers'], listen:['ear','Listen','#4A2C06','#FFFDF6','Listen: hear the numbers'], flash:['flash','Flash','#fff','#FFD25E','Flash: numbers pop up fast'] };
// A skill with no sums yet (bead numbers): the same three blocks offer what works for it. [.., what it opens]
const DOOR_BEADS = { visual:['book','Learn','#fff','#FFD25E','Learn: Juni shows you the beads','learn'], listen:['practice','Make','#4A2C06','#FFFDF6','Make: make numbers on the abacus','build'], flash:['eye','Read','#fff','#FFD25E','Read: read numbers from the beads','reader'] };
function renderDoor(){
  const sums=!!NODES[curIdx()].drill, set=sums ? DOOR_TOYS : DOOR_BEADS, key=sums ? '1' : 'beads';
  $$('#door .door-block').forEach(b=>{ const [ic,lab,col,acc,aria]=set[b.dataset.door];
    if (b.dataset.drawn!==key){ b.innerHTML=`<span class="td-toy-face">${TOY.icon(ic, 96, col, {accent:acc, stroke:2.3})}</span><span class="door-label">${lab}</span>`; b.setAttribute('aria-label', aria); b.dataset.drawn=key; } });
  const all=$('#doorAll'); if (!all.innerHTML) all.innerHTML=TOY.icon('lock', 22, 'currentColor')+'<span>See all skills</span>';
  const props=$('#doorProps'); if (!props.innerHTML) props.innerHTML=TOY.prop('rainbow', 150)+TOY.prop('plant', 170);
  toySky($('#doorSky'));
  renderDoorPath();
  // Bixi stays on the table as a quiet, waving sidekick; Juni (the moon) leads the line from the window.
  const bd=$('#bixDoor'); toyBix(bd, 'wave', {size:190}); Fun.Mascot.quiet(bd);
  // Coming straight back from the Learn screen is not a fresh visit -- don't replay Juni's door greeting (BB: repeating it is bad design); clear the stale bubble instead.
  if (renderDoor.skipGreet){ renderDoor.skipGreet=false; const jb=$('#doorJuni'); if (jb){ jb.classList.remove('on'); jb.textContent=''; } }
  else if (sums) juniSayOn($('#doorJuni'), $('#doorSky'), 'j_door_play', 'How would you like to practise today?');
  else juniSayOn($('#doorJuni'), $('#doorSky'), 'j_door_first', "Tap Learn and I'll show you the beads. More practice opens as you learn new skills.");
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
    // Off-path flash/anzan nodes (optional:true) are NOT mandatory rungs — the Mental Math mode sources its content
    // from them, but the child is never parked on them. Draw them as a ghosted, owl/flash-marked side bead (the
    // `optional` class is appended AFTER done/locked so the mandatory-state class stays second — the path and the
    // picker then agree: these are extra, not a step to clear). advanceCurrent skips them, so one is never `cur`.
    const opt = n.optional ? ' optional' : '', optFlag = !!n.optional;
    if (i<ci) out.push(`<div class="dp-node done${opt}" ${at(HB)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: ${optFlag?'extra mental-math practice':'learned'}">${TOY.bead(optFlag?'mustard':'teal', HB, {tall:true})}<span class="dp-mark">${optFlag?TOY.icon('flash', R(30), '#fff'):TOY.icon('check', R(34), '#fff', {stroke:3.6})}</span></button><span class="dp-name">${name}</span></div>`);
    else if (i===ci){ curX=cx;
      out.push(`<div class="dp-node cur" ${at(HC)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: you are here"><span class="dp-glow"></span>${TOY.bead('mustard', HC, {tall:true})}<span class="dp-mark">${TOY.icon('star', R(42), '#FFFDF6')}</span></button><span class="dp-name">${name}</span>`
        +`<button class="toy-block toy-block--teal toy-block--sm dp-learn" id="doorLearn">${TOY.icon('play', 26, '#fff')}<span class="toy-block-label">Learn it</span></button></div>`); }
    else out.push(`<div class="dp-node locked${opt}" ${at(HB)}><button class="dp-bead" data-node="${n.id}" aria-label="${label}: ${optFlag?'extra mental-math practice':'not yet'}">${TOY.bead(optFlag?'mustard':'wood', HB, {tall:true})}<span class="dp-mark">${optFlag?TOY.icon('flash', R(26), '#fff'):TOY.icon('lock', R(28), 'currentColor', {accent:'#F6D9AA'})}</span></button><span class="dp-name">${name}</span></div>`);
  });
  const W=x+R(26), ends=[[-30, pts[0][1]]].concat(pts, [[W+30, pts[pts.length-1][1]]]);
  const d=ends.map((q,i)=>{ if (!i) return `M${q[0]},${q[1]}`; const a=ends[i-1], mx=Math.round((a[0]+q[0])/2); return `C${mx},${a[1]} ${mx},${q[1]} ${q[0]},${q[1]}`; }).join(' ');
  const rod=`<svg class="dp-cord" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" aria-hidden="true"><path d="${d}" transform="translate(5,10)" stroke="#3A1E06" stroke-opacity=".16" stroke-width="15"/><path d="${d}" transform="translate(3,7)" stroke="#3A1E06" stroke-opacity=".2" stroke-width="9"/>`
    +`<path d="${d}" stroke="#8E6A1C" stroke-width="12"/><path d="${d}" stroke="#E2B54A" stroke-width="8"/><path d="${d}" transform="translate(0,-2)" stroke="#FFF1B8" stroke-width="2.4" stroke-opacity=".85"/></svg>`;
  p.innerHTML=`<div class="dp-row" style="width:${W}px;height:${H}px">${rod}${out.join('')}</div>`;
  p.scrollLeft=Math.max(0, curX-p.clientWidth*.42);
  p.querySelectorAll('.dp-node .dp-bead').forEach(b=>b.onclick=()=>{
    const i=NODE_IDX[b.dataset.node], bd=$('#bixDoor'); Sfx.tap();
    // Juni leads the word from the window; Bixi stays quiet but still reacts beside her.
    if (i>ci){ replay(b, 'td-shake'); Fun.Mascot.react(bd, 'oops'); juniSayOn($('#doorJuni'), $('#doorSky'), 'j_path_locked', 'Not yet! Finish the skills before it to open this one.', 3500); }
    else if (i<ci){ replay(b, 'td-pop'); Fun.Mascot.react(bd, 'cheer'); juniSayOn($('#doorJuni'), $('#doorSky'), 'j_path_done', 'You’ve already learned this one. Well done!', 3500); }
    else { Fun.Mascot.react(bd, 'happy'); juniSayOn($('#doorJuni'), $('#doorSky'), 'j_path_here', 'This is your skill right now. Tap Learn to start.', 3500); }
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
  if (!n.drill){ const to=DOOR_BEADS[m][5];                                   // nothing to drill yet (bead numbers): learn, make or read
    return to==='learn' ? startLesson(lessonTarget(n), 'door') : Games.open(to, {from:'door'}); }
  if (m==='flash') return startFlash(doorDrillNode(m, n), 'door');              // mental-math: Juni's intro card first (once), then the drill
  startDrill(m, doorDrillNode(m, n));
}));
$('#exitDoor').addEventListener('click', ()=>{ stopVoices(); renderHome(); show('home'); });
$('#doorAll').addEventListener('click', ()=>openGate('skills'));

// ---- Reading / Listening practice picker (redesign v4.43) ----
function renderPracticePick(id){
  const cur = NODES[NODE_IDX[id]], T = window.__level.MODE_SESSIONS;
  const tt = $('#ppTitle'); if (tt) tt.textContent = cur ? cur.title : 'Practice';
  const card = (mode, lab, done) => {
    const full = done >= T;
    const best = bestSetMs(id, mode);   // a target to beat; absent until the first set is finished
    const bestLab = best != null ? `Best: ${TM.fmt(best)}` : '';
    return `<button class="pp-card pp-card--${mode}${full?' is-done':''}" data-mode="${mode}" aria-label="${lab}: ${done} of ${T} sessions done${best!=null?`, best set ${TM.fmt(best)}`:''}">`
      + `<span class="pp-lab">${lab}</span>`
      + `<span class="pp-prog">${full?'Done!':done+' / '+T}</span>`
      + `<span class="pp-pips">${Array.from({length:T},(_,i)=>`<i class="pp-pip${i<done?' on':''}"></i>`).join('')}</span>`
      + `<span class="pp-best"${bestLab?'':' hidden'}>${bestLab}</span></button>`;
  };
  // At the first (no-sums) level the cards use plain action names so the card and the activity it opens share a name.
  const noSums = cur && !cur.drill;
  const readLab = noSums ? L1_LABELS.reading : 'Reading', listenLab = noSums ? L1_LABELS.listening : 'Listening';
  let html = card('reading', readLab, modeDone(id,'reading')) + card('listening', listenLab, modeDone(id,'listening'));
  // Mental Math: a third card, shown ONLY once the child is eligible (combined mastered). Hidden otherwise — never a locked/greyed card.
  if (anzanEligible()) html += card('mental','Mental math', modeDone(id,'mental'));
  $('#ppCards').innerHTML = html;
  // "Watch the lesson again": a returning child can replay the current skill's tutorial. Shown only when the skill has
  // a lesson; replays via the same path as the door's Learn door, then returns here (from:'practice').
  const ex = $('#ppExtra');
  if (ex){
    const n = NODES[curIdx()];
    if (n && hasLesson(n)){
      ex.innerHTML = `<button class="pp-watch" id="ppWatch" aria-label="Watch the lesson again">${TOY.icon('play', 30, 'currentColor', {stroke:2.6})}<span>Watch the lesson again</span></button>`;
      $('#ppWatch').onclick = ()=>{ Sfx.tap(); Speaker.unlock(); startLesson(lessonTarget(NODES[curIdx()]), 'practice'); };
    } else ex.innerHTML = '';
  }
  const jb = $('#ppJuni'); if (jb){ const c = jb.querySelector('.ctext'); if (c) c.textContent = anzanEligible() ? 'Pick how to practise — Reading, Listening or Mental math.' : noSums ? 'Pick how to practise — read the beads, or make a number.' : 'Pick how to practise — Reading or Listening.'; jb.classList.add('on'); }
  toySky('#ppSky');
}
$('#exitPick').innerHTML = TOY.icon('back', 32, 'currentColor');
$('#exitPick').addEventListener('click', ()=>{ stopVoices(); Practice.stop(); renderHome(); show('home'); });
$('#exitReadTeach').innerHTML = TOY.icon('back', 32, 'currentColor');   // v4.61: the back button was a blank wooden disc (icon never injected)
$('#ppCards').addEventListener('click', (e)=>{ const b=e.target.closest('.pp-card'); if (!b) return; Sfx.tap(); Practice.runMode(b.dataset.mode); });
// Skip the one-time welcome lesson and jump straight into practice.
if ($('#lessonSkip')) $('#lessonSkip').addEventListener('click', ()=>{ if (!L) return; node(L.node.id).lesson=true; saveProgress(); animToken++; stopVoices(); leaveLesson(); });

/* ---- lesson: Bix shows each trick on a wooden soroban, then she tries it ---- */
// Number friends in lessons: the lesson's friend pairs as small lacquer chips in Bix's bubble, and the pair a step is about
// standing on the table next to Bix, holding hands around what they make.
function friendsHtml(n){
  const ps = n.family===5 ? TOY.FRIENDS.small : n.family===10 ? TOY.FRIENDS.big : [];
  const dot=v=>`<b class="toy-lac--${TOY.friendColor(v)}">${v}</b>`;
  return ps.map(([a,b])=>`<span data-pair="${a}-${b}" aria-label="${a} and ${b}">${dot(a)}${dot(b)}</span>`).join('');
}
function friendIn(text){ const m=/(?:small|big) friend of (\d) is (\d)/i.exec(String(text||'').replace(/<[^>]+>/g,'')); return m ? [+m[1], +m[2]] : null; }
function friendOfSteps(steps){ for (const st of steps||[]){ const f=friendIn(st.say); if (f) return f; } return null; }
function lessonPair(f, mood){
  const el=$('#lessonPair'), key=f ? f.join('-')+(mood||'') : 'none'; if (el.dataset.k===key) return; el.dataset.k=key;
  el.classList.toggle('has-pair', !!f); $('#lesson').classList.toggle('with-pair', !!f);
  el.innerHTML = f ? TOY.pair(f[0], f[1], 150, {mood:mood||'happy'}) : '';
  const pk=f ? Math.min(f[0],f[1])+'-'+Math.max(f[0],f[1]) : ''; $$('#capFriends span').forEach(x=>x.classList.toggle('on', x.dataset.pair===pk));
}
// The speaker mark on the lesson bubble: shown only while the caption has a spoken line; tap the bubble to hear it again.
// src: undefined = Bix main pack, true = Bix extra pack, 'juni' = Juni (classroom) line. Tap the bubble to hear it again.
function capVoice(id, src){
  const c=$('#lessonCap'), mark=$('#capSay'); c._v=null; mark.hidden=true; c.classList.remove('has-voice'); if (!id || !Fun.BixVoice.enabled()) return;
  const on=()=>{ c._v={id, src}; mark.hidden=false; c.classList.add('has-voice'); };
  if (src==='juni'){ if (CL() && CL().lineInfo(id)) on(); return; }           // Juni's lines always have text; the icon replays her clip (silent until recorded)
  if (!src){ if (window.BIX_LINES && window.BIX_LINES[id]) on(); return; }
  const tag=Fun.BixVoice.tag(), tok=c._vt=(c._vt||0)+1; BixExtra.load(tag).then(()=>{ if (c._vt===tok && BixExtra.map[tag] && BixExtra.map[tag][id]) on(); });
}
$('#capSay').innerHTML=TOY.icon('speaker', 26, 'currentColor');
$('#lessonCap').addEventListener('click', ()=>{ const v=$('#lessonCap')._v; if (!v) return; Speaker.unlock(); if (v.src==='juni'){ CL() && CL().Voice.play('juni', v.id, $('#lessonSky')); } else if (v.src) BixExtra.play(v.id, $('#bixLesson')); else Fun.BixVoice.play(v.id, $('#bixLesson')); });
function startLesson(n, from){
  Speaker.unlock(); lessonFrom = from || 'home';
  // The practice soroban (AbacusInput via DemoAbacus): Bix moves it in demos, the child moves it on "Your turn".
  // Rods sized to the lesson's biggest number (at least 3, like practice), so the beads stay big enough to move.
  const rods=lessonRods(n);
  if (!lessonAb || lessonAb.rodsMade!==rods){ if (lessonAb) lessonAb.destroy(); lessonAb = DemoAbacus($('#lessonAbacus'), {rods, readout:true, onBead:()=>Sfx.tap(), onChange:(v)=>onLessonBeads(v)}); lessonAb.rodsMade=rods; }
  lessonAb.reset();
  if (L) clearTimeout(L.skipT), clearTimeout(L.tryT);
  L = { node:n, phase:'intro', page:0, pages:null, demoIdx:0, watchIdx:0, anatIdx:0, fingerIdx:0, step:0, guidedIdx:0, steps:null, busy:false, marks:[], did:0, skipped:0, tries:0 };
  if (n.id==='beads') L.phase='anatomy';   // first lesson opens by introducing the abacus and its parts, before the "worth 5 / worth 1" card
  $('#lessonTitle').textContent=n.title; $('#capFriends').innerHTML=friendsHtml(n);
  toyBix($('#bixLesson'), 'happy', {size:116, keep:false, bubble:false}); toySky($('#lessonSky'));   // Bixi is the small classmate; Juni (the moon) leads
  $('#lesson').classList.add('cl-juni-forward'); wireMoonTap('#lessonSky');   // Juni leans in from the window to lead
  $('#lessonCap').classList.add('cl-bubble'); $('#lessonCap').dataset.who='juni';   // the board is Juni's: she leads the lesson
  $('#bixiBubble').classList.remove('on'); $('#bixiBubble').dataset.who='bixi';
  if (window.Classroom) wireBixiTap();
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
function lessonTotal(){ const n=L.node; if (n.kind==='flash') return L.pages?L.pages.length:1; const demos=n.kind==='numbers'? n.lesson.numbers.length : n.demos.length; const guided=n.kind==='numbers'?0:n.guided.length; return demos+guided+1+(hasInterlude(n)?1:0); }
function lessonDone(){ const n=L.node; if (n.kind==='flash') return L.phase==='intro'?L.page:(L.pages?L.pages.length:1); const d=n.kind==='numbers'? L.phase==='numbers'?L.demoIdx : L.phase==='done'?lessonTotal() : 0 : L.phase==='demo'?L.demoIdx : L.phase==='guided'? n.demos.length+L.guidedIdx : L.phase==='help'? n.demos.length+n.guided.length : L.phase==='done'? lessonTotal() : 0; return d; }
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
function lessonBtn(label, icon, kind){ const b=$('#lessonNext'); clearTimeout(L.skipT); clearTimeout(L.tryT); b.style.visibility=''; b.className='toy-block td-next toy-block--'+(kind==='maple' ? 'wood' : 'teal'); b.innerHTML=(icon?TOY.icon(icon, 36, 'currentColor', {stroke:3.2}):'')+`<span class="toy-block-label">${label}</span>`; }
// "Your turn": the beads are the way forward, so there is no big button. Skip is a small wooden one that only
// turns up after a while, or after two tries that ended on another number.
const SKIP_MS = 10000;
function turnIdx(){ return L.phase==='numbers' ? L.demoIdx : L.node.demos.length+L.guidedIdx; }
function turnTotal(n){ return n.kind==='numbers' ? n.lesson.numbers.length : n.guided.length; }
function lessonSkip(){
  lessonBtn('Skip', null, 'maple'); const b=$('#lessonNext'), l=L, at=l.phase+turnIdx(); b.classList.add('td-skip'); b.style.visibility='hidden'; l.tries=0;
  l.showSkip=()=>{ if (L===l && l.phase+turnIdx()===at && !l.won && $('#lesson').classList.contains('active')) b.style.visibility=''; };
  l.skipT=setTimeout(l.showSkip, window.App.lessonSkipMs ?? SKIP_MS);
}
// Learned = she really did most of the "Your turn" steps (two in three); skipped ones do not count.
function lessonLearned(){ const t=turnTotal(L.node); return L.did*3 >= t*2; }
function lessonSay(id){ Fun.BixVoice.play(id, $('#bixLesson')); capVoice(id); }
// Juni's varied encouragement for a correct "your turn" — rotate so she never repeats the same line twice running
// (replaces Bixi saying one stock "that's it" every time). Keyed lines live in the juni-praise voice pack.
const PRAISE_LINES=[
  {k:'praise_1', text:"That's it!"}, {k:'praise_2', text:"Lovely work!"}, {k:'praise_3', text:"You've got it!"},
  {k:'praise_4', text:"Perfect!"}, {k:'praise_5', text:"Yes, exactly right!"}, {k:'praise_6', text:"Nicely done!"},
  {k:'praise_7', text:"You did it!"}, {k:'praise_8', text:"Wonderful!"},
];
let praiseBag=[];
function nextPraise(){
  if (!praiseBag.length){
    praiseBag=PRAISE_LINES.map((_,i)=>i);
    for (let i=praiseBag.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [praiseBag[i],praiseBag[j]]=[praiseBag[j],praiseBag[i]]; }
    if (praiseBag[praiseBag.length-1]===nextPraise.last && praiseBag.length>1){ [praiseBag[praiseBag.length-1],praiseBag[0]]=[praiseBag[0],praiseBag[praiseBag.length-1]]; }   // no repeat across a reshuffle
  }
  const idx=praiseBag.pop(); nextPraise.last=idx; return PRAISE_LINES[idx];
}
/* ---- classroom lesson flow (Part 4): Juni leads; Bixi (the bead) is the classmate who sometimes slips ---- */
// The scripted dialogue for a node from lessons.json (window.LESSONS), grouped by act. Null if there is none.
function lessonScript(nodeId){
  const L0 = (window.LESSONS||{})[nodeId]; if (!L0 || !Array.isArray(L0.steps)) return null;
  const by = {watch:[]};
  for (const s of L0.steps){ if (s.act==='watch') by.watch.push(s); else by[s.act]=s; }
  return by;
}
// Juni narrates (plays her clip + moves her mouth) WITHOUT touching the caption, so the existing captions/tests stay intact.
function juniNarrate(key){ if (!key || !window.Classroom) return; Promise.resolve(Classroom.Voice.play('juni', key, juniFig())).catch(()=>{}); }   // a failed clip must not surface as an uncaught rejection
// The Bixi interlude runs once, after the guided turns, when the node has a bixi_wrong step and the grown-up left mistakes on.
function hasInterlude(n){ return settings.bixiMistakes!==false && n && n.kind!=='numbers' && !!(lessonScript(n.id)||{}).bixi_wrong && (n.guided&&n.guided.length || n.demos&&n.demos.length); }
// A visibly-wrong but correctable value for Bixi to land on (the narration explains the real slip).
function bixiWrongValue(start, target, maxV){ let w = target>0 ? target-1 : target+1; if (w===target || w<0) w=target+1; if (w>maxV) w=Math.max(0, target-1); if (w===target) w=start; return Math.max(0, Math.min(maxV, w)); }
// The example the interlude works on (the first guided pair, else the first demo).
function interludeExample(n){ const pair = (n.guided&&n.guided[0]) || (n.demos&&n.demos[0]); return pair ? lessonStep(n, pair) : null; }
// Lesson progress as beads on a brass rod (one per demo / try): done teal, the one you are on gold, the rest bare wood.
function renderLessonSteps(){
  const tot=lessonTotal()-1, done=Math.min(tot, lessonDone()), live=['numbers','demo','guided'].includes(L.phase);
  const el=$('#lessonSteps'); el.setAttribute('aria-label', L.phase==='done' ? 'All steps done' : live ? `Step ${done+1} of ${tot}` : `${tot} steps`);
  el.innerHTML=Array.from({length:tot},(_,i)=>{ const skip=i<done&&L.marks[i]===false, ok=i<done&&!skip, cur=i===done&&live; return `<i class="ls-dot${ok?' ok':skip?' skip':cur?' cur':''}">${TOY.stateBead(ok?'done':cur?'now':'todo', 48, {dim:false})}</i>`; }).join('');
}
async function renderLesson(){
  const n=L.node; renderLessonSteps(); $('#lessonHint').style.display='none';
  // R2 (mental-math bridge): the board fades through a flash node's demo AND guided turns (easing off the visual crutch);
  // every other phase, and every non-flash lesson, shows it full.
  { const ab$=$('#lessonAbacus'); if (ab$){ ab$.style.transition='opacity .7s ease'; if (!(n.kind==='flash' && (L.phase==='demo' || L.phase==='guided'))) ab$.style.opacity=''; } }
  $('#lesson').dataset.phase=L.phase; lessonAb.setReadOnly(!(L.phase==='numbers' || L.phase==='guided')); renderBackBtn();
  if (L.phase!=='fingers') hideHand();
  if (L.phase!=='anatomy') anatHL(null);
  if (L.phase==='intro'){
    $('#capProb').innerHTML=''; $('#capProb').dataset.p='';
    if (!L.pages) L.pages=lessonPages(n);
    const pg=L.pages[Math.min(L.page, L.pages.length-1)], last=L.page>=L.pages.length-1;
    cap(pg.kind, pg.html, ''); lessonBtn(last?(n.kind==='flash'?'Start':'Show me'):'Next', last?'play':null);
    if (L.page===0){ lessonAb.reset();
      const ok='intro_'+n.id;   // Juni reads the "New skill" card itself: each lesson has its own recorded line (intro_<nodeId>) matching the rule on screen (Voice.play auto-loads the juni-intro pack)
      juniNarrate(ok); capVoice(ok,'juni'); }
    return;
  }
  if (L.phase==='anatomy'){ // first lesson: Juni names each part of the abacus (it glows) before any values or finger moves
    const s=ANATOMY_STEPS[L.anatIdx]||ANATOMY_STEPS[0], last=L.anatIdx>=ANATOMY_STEPS.length-1;
    cap(`Parts of the abacus ${L.anatIdx+1} of ${ANATOMY_STEPS.length}`, s.text.replace(/\b(abacus|rod|beam|heaven bead|earth beads?)\b/gi, m=>`<b>${m}</b>`), '');
    lessonBtn(last?'Show me':'Next', 'play'); lessonAb.setReadOnly(true);
    const my=++animToken, live=()=>my===animToken;
    (async()=>{
      lessonAb.reset(); await sleep(80); if(!live())return;
      anatHL(s.part); juniNarrate(s.k); capVoice(s.k,'juni');
      let clipMs = navigator.webdriver ? 700 : 2600;
      try{ if(!navigator.webdriver){ const r=Classroom.Voice.find('juni', s.k); if (r&&r[1]&&r[1][1]) clipMs=Math.round(r[1][1]*1000); } }catch(e){}
      if (s.show!=null){                         // heaven bead: slide it to the beam so the readout shows its value (5)
        await sleep(Math.round(clipMs*0.5)); if(!live())return; await lessonAb.move(0, s.show, 650, live);
      } else if (s.cycle){                        // rod / earth beads: slide up to the beam and back down, a couple of times
        await sleep(Math.round(clipMs*0.3));
        for (let i=0;i<2 && live();i++){ await lessonAb.move(0, s.cycle, 500, live); if(!live())break; await sleep(160); await lessonAb.move(0, -s.cycle, 500, live); if(!live())break; await sleep(160); }
      }
    })();
    return;
  }
  if (L.phase==='watch'){ // beads node: Juni SHOWS the bead values (move the 5-bead, then a 1-bead) before the child's turn
    const sc=lessonScript(n.id), ws=(sc&&sc.watch)||[], w=ws[L.watchIdx]||{}, last=L.watchIdx>=ws.length-1;
    const m=(w.text||'').match(/\d+/), target=m?+m[0]:1;   // the number this step shows (5-bead -> 5, 1-bead -> 1)
    cap(`Watch ${L.watchIdx+1} of ${ws.length}`, (w.text||'').replace(/\b(\d+)\b/g,'<b>$1</b>'), ''); lessonBtn(last?'Your turn':'Next', 'play'); lessonAb.setReadOnly(true);
    const my=++animToken, live=()=>my===animToken;
    (async()=>{
      lessonAb.reset(); await sleep(400); if(!live())return;                 // bead starts away from the bar
      let clipMs = navigator.webdriver ? 700 : 1800;                          // tests: quick; real: pace to her clip
      try{ if(!navigator.webdriver){ const r=Classroom.Voice.find('juni', w.id); if (r&&r[1]&&r[1][1]) clipMs=Math.round(r[1][1]*1000); } }catch(e){}
      if (w.id) juniNarrate(w.id);
      const t=w.text||'', dot=t.indexOf('. '), frac=dot>0?Math.min(0.72,Math.max(0.30,(dot+2)/t.length)):0.45;   // move the bead only when she reaches the second sentence ("pull it down / push it up"), not before
      await sleep(Math.round(clipMs*frac)); if(!live())return;
      await lessonAb.move(0, target, 700, live);
    })();
    return;
  }
  if (L.phase==='fingers'){ // first lesson: Juni shows which finger moves which bead, with the real hand
    const s=FINGER_STEPS[L.fingerIdx]||FINGER_STEPS[0], last=L.fingerIdx>=FINGER_STEPS.length-1;
    cap(`Your fingers ${L.fingerIdx+1} of ${FINGER_STEPS.length}`, s.text.replace(/\b(thumb|pointer|earth beads?|heaven bead|beam)\b/gi, m=>`<b>${m}</b>`), ''); lessonBtn(last?'Your turn':'Next', 'play'); lessonAb.setReadOnly(true);
    const my=++animToken, live=()=>my===animToken;
    (async()=>{
      lessonAb.reset(); if (s.from) lessonAb.value=s.from; await sleep(60); if(!live())return; placeHand(s.pose, s.zone);
      let clipMs = navigator.webdriver ? 700 : 2400; try{ if(!navigator.webdriver){ const r=Classroom.Voice.find('juni', s.k); if (r&&r[1]&&r[1][1]) clipMs=Math.round(r[1][1]*1000); } }catch(e){}
      await sleep(360); if(!live())return; juniNarrate(s.k); capVoice(s.k,'juni');
      if (s.val!=null){ await sleep(Math.round(clipMs*0.5)); if(!live())return; pushHand(s.dir); await lessonAb.move(0, s.val-(s.from||0), 650, live); }
    })();
    return;
  }
  if (L.phase==='numbers'){ // beads node: set each number
    const v=n.lesson.numbers[L.demoIdx]; L.target=v; lessonAb.reset();
    cap('Your turn', `Show <b>${v}</b> on the abacus. Tap beads to move them.`, String(v)); lessonSkip(); $('#lessonHint').style.display=''; if (L.demoIdx===0){ juniNarrate('juni_turn'); capVoice('juni_turn','juni'); } return;   // Juni gives the "your turn" cue (number-agnostic); "Show me" lets a stuck child be shown how to form this number
  }
  if (L.phase==='demo'){
    const ls=lessonStep(n, n.demos[L.demoIdx]); L.steps=ls.steps; L.step=0; lessonAb.value=ls.start; if (!n.family) lessonPair(null);
    const ab$=$('#lessonAbacus'), flash=n.kind==='flash';
    if (ab$ && flash) ab$.style.opacity = L.demoIdx===0 ? '1' : '0.5';   // R2: watch the first sum on full beads, then the board fades as the demos go on — easing toward picturing it
    cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, '', ls.label); lessonBtn('Next', 'play');   // Juni now narrates each step in sync (playSteps); no separate whole-demo clip
    await playSteps(lessonAb, L.steps, (s)=>cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, s.say.replace(/(\d+)/g,'<b>$1</b>')));
    if (ab$ && flash && L.demoIdx>=n.demos.length-1){ await sleep(450); if (L.phase==='demo'){ ab$.style.opacity='0.12'; cap(`Watch ${L.demoIdx+1} of ${n.demos.length}`, 'Now hold that picture in your mind — the beads are still there, just invisible.', ls.label); } }   // R2: last demo fades out, inviting the mental picture before the flash drill
    return;
  }
  if (L.phase==='guided'){
    const ls=lessonStep(n, n.guided[L.guidedIdx]); L.target=ls.target; lessonAb.value=ls.start;
    // R2: on a flash (mental-math) node the board stays a faint-but-usable ghost through the guided turns, fading further
    // each turn (opacity never blocks taps), so the child acts on less and less of a crutch before the boardless flash drill.
    { const ab$=$('#lessonAbacus'); if (ab$ && n.kind==='flash'){ const t = n.guided.length>1 ? L.guidedIdx/(n.guided.length-1) : 0; ab$.style.opacity = (0.55 - 0.25*t).toFixed(2); } }
    cap(`Your turn ${L.guidedIdx+1} of ${n.guided.length}`, guidedText(ls, n.guided[L.guidedIdx], ''), ls.label); { const f=friendOfSteps(ls.steps); if (f || !n.family) lessonPair(f); }
    lessonSkip(); $('#lessonHint').style.display=''; if (L.guidedIdx===0){ const sc=lessonScript(n.id), yt=sc&&sc.your_turn&&sc.your_turn.id; if (yt){ juniNarrate(yt); capVoice(yt,'juni'); } else { juniNarrate('juni_turn'); capVoice('juni_turn','juni'); } } return;
  }
  if (L.phase==='help'){   // Bixi the classmate makes the classic slip; the child helps fix it (Part 4)
    const sc=lessonScript(n.id), ex=interludeExample(n);
    if (!sc || !sc.bixi_wrong || !ex){ L.phase='done'; return renderLesson(); }
    const rods=+($('#lesson').dataset.rods)||3, maxV=Math.pow(10, rods)-1, wrong=bixiWrongValue(ex.start, ex.target, maxV);
    L.target=ex.target; $('#lessonHint').style.display='none'; lessonBtn('', null); $('#lessonNext').style.visibility='hidden';
    const f=friendOfSteps(ex.steps); if (f || !n.family) lessonPair(f);
    const tok=++animToken; L.helpStage='watch'; L.busy=true;
    lessonAb.setReadOnly(true); lessonAb.value=ex.start;
    cap('Help Bixi', `It's Bixi's turn to try <b>${probHtml(ex.label)}</b>. Let's watch.`, ex.label);
    (async()=>{
      await sleep(700); if (tok!==animToken || L.phase!=='help') return;
      lessonAb.poke(wrong); Fun.Mascot.react($('#bixLesson'), 'oops', 1400); CL() && CL().move($('#bixLesson'), 'dizzy');
      bixiSay((sc.bixi_wrong||{}).id, {text:(sc.bixi_wrong||{}).text, ms:4200});
      await sleep(1800); if (tok!==animToken || L.phase!=='help') return;
      L.helpStage='ask'; L.busy=false; lessonAb.poke(ex.start); lessonAb.setReadOnly(false);
      $('#bixiBubble').classList.remove('on');
      cap('Help Bixi', (sc.ask_help&&sc.ask_help.text ? esc(sc.ask_help.text) : `Can you help Bixi? Show <b>${esc(ex.label)}</b> the right way.`), ex.label);
      juniNarrate((sc.ask_help||{}).id); lessonSkip();
    })();
    return;
  }
  if (L.phase==='done' && !lessonLearned()){   // mostly skipped: kind words, no sticker, no golden bead, the Today step stays open
    cap('Good try!', `Good practice! Every try makes you stronger. Let’s do <b>${esc(n.title)}</b> again later.`, ''); lessonBtn('OK', 'check'); Fun.Mascot.react($('#bixLesson'), 'happy', 1600);
    if (!L.told){ L.told=true; juniNarrate('j_end_good'); } return; }
  if (L.phase==='done'){ cap('Done!', `You learned <b>${esc(n.title)}</b>. Now practise it with Look and Listen.`, '*'); lessonBtn('Finish', 'check'); node(n.id).lesson=true; saveProgress(); Sfx.star(); Fun.Mascot.react($('#bixLesson'), 'cheer', 2400); if (!L.awarded){ L.awarded=true; Fun.confetti(70); const cl=(lessonScript(n.id)||{}).close; if (cl) juniNarrate(cl.id); else lessonSay('lesson_done'); setTimeout(()=>activityDone('lesson'), 2600); } return; }
}
$('#lessonHint').innerHTML=TOY.icon('eye', 30, 'currentColor')+'<span class="toy-block-label">Show me</span>';
let animToken=0;
// Juni narrates each step in her own voice, and the beads move WITH her words (not ahead or behind):
// the clip plays, the moves land in the back half of the clip (where "add five, take away two" is said),
// and the step holds until her line finishes. Falls back to a word-count estimate when a clip is missing or muted.
// Each lesson step carries a stable key (step.k); her recording is filed under that key, not the sentence,
// so rewording a caption or restyling the app never breaks playback — only re-recording that key does.
// Finger-technique step (first lesson only): Juni shows which finger moves which bead, with the real hand image.
// First lesson only: Juni names the parts of the abacus BEFORE any values or finger moves, so the words
// (heaven bead, earth beads, beam, rod) are introduced before they're used later. Each step glows its part.
const ANATOMY_STEPS=[
  { k:'anat_abacus', text:'This is your abacus. Every bead on it helps you count.',        part:'all'    },
  { k:'anat_rod',    text:'Each line of beads slides up and down on a rod.',                part:'rod',    cycle:1 },
  { k:'anat_beam',   text:'The bar across the middle is the beam.',                         part:'beam'   },
  { k:'anat_heaven', text:'Above the beam is the heaven bead. It is worth five.',           part:'heaven', show:5 },
  { k:'anat_earth',  text:'Below the beam are the earth beads. Each one is worth one.',     part:'earth',  cycle:4 },
];
// Glow one named part of the lesson abacus (units rod for the beads). null clears it.
function anatHL(part){
  const ab=$('#lessonAbacus'); if(!ab) return;
  ab.querySelectorAll('.abx-anat').forEach(e=>e.classList.remove('abx-anat'));
  if(!part) return;
  const rod0=ab.querySelector('.abx-rod[data-rod="0"]');
  if (part==='all') ab.querySelectorAll('.abx-bead,.abx-beam').forEach(e=>e.classList.add('abx-anat'));
  else if (part==='beam'){ const b=ab.querySelector('.abx-beam'); if(b) b.classList.add('abx-anat'); }
  else if (part==='rod'){ const rl=rod0&&rod0.querySelector('.abx-rodline'); if(rl) rl.classList.add('abx-anat'); }
  else if (part==='heaven'){ const h=rod0&&rod0.querySelector('.abx-bead[data-kind="h"]'); if(h) h.classList.add('abx-anat'); }
  else if (part==='earth'){ (rod0||ab).querySelectorAll('.abx-bead[data-kind="e"]').forEach(e=>e.classList.add('abx-anat')); }
}
const FINGER_STEPS=[
  { k:'fingers_intro',   text:'You move the beads with just two fingers — your thumb and your pointer.', pose:'thumb',   zone:'earth' },
  { k:'fingers_thumb',   text:'Your thumb pushes the little earth beads up to the beam.',               pose:'thumb',   zone:'earth', from:0, val:1, dir:'up'   },
  { k:'fingers_pointer', text:'Your pointer pushes them back down, away from the beam.',                pose:'pointer', zone:'earth', from:1, val:0, dir:'down' },
  { k:'fingers_heaven',  text:'Your pointer also moves the big heaven bead on top — pull it down to make five.', pose:'pointer', zone:'heaven', from:0, val:5, dir:'down' },
  { k:'fingers_recap',   text:"Thumb for up, pointer for down. That's the whole secret!",               pose:'thumb',   zone:'earth' },
];
function hideHand(){ const h=$('#lessonHand'); if (h) h.style.opacity=0; }
function placeHand(pose, zone){
  const h=$('#lessonHand'), ab=$('#lessonAbacus'), left=ab&&ab.closest('.lesson-left'); if(!h||!ab||!left) return;
  h.src='img/hands/'+(pose==='thumb'?'hand-thumb.png':'hand-pointer.png');
  const svg=ab.querySelector('.abx-svg'); if(!svg) return;
  let rod=null, maxx=-1; ab.querySelectorAll('.abx-rod').forEach(g=>{ const r=g.getBoundingClientRect(); if(r.left>maxx){maxx=r.left; rod=g;} });   // units = rightmost rod
  const lr=left.getBoundingClientRect(), sr=svg.getBoundingClientRect(), rr=(rod||svg).getBoundingClientRect();
  const hw=Math.max(90, Math.round(sr.width*0.5)); h.style.width=hw+'px';
  const hh=hw*1448/1086, tipX=0.5, tipY=0.1;   // fingertip sits ~10% down, ~mid across the image
  const rodCx=rr.left+rr.width/2-lr.left;
  const targetY=(zone==='heaven'? sr.top+sr.height*0.30 : sr.top+sr.height*0.70)-lr.top;
  h.style.left=Math.round(rodCx-hw*tipX)+'px';
  h.style.top=Math.round(targetY-hh*tipY)+'px';
  h.style.transform='translateY(0)'; h.style.opacity=1;
}
function pushHand(dir){ const h=$('#lessonHand'); if(h) h.style.transform = dir==='up'?'translateY(-30px)':'translateY(30px)'; }
function narrateStep(s){ try{ if (s && s.k && window.Classroom) Classroom.Voice.play('juni', s.k, juniFig()); }catch(e){} }
function lessonClipMs(s){
  const text = s && s.say;
  try{
    if (navigator.webdriver){ const w=(String(text||'').trim().match(/\S+/g)||[]).length; return Math.max(400, Math.min(1200, Math.round(w*120))); }   // automated tests: keep demos quick, no real audio to wait on
    if (s && s.k && window.Classroom){ const V=Classroom.Voice, r=V.find('juni', s.k);
      // When her clip will actually play, wait its FULL spoken length so the next line never cuts it off mid-sentence.
      if (r && r[0] && r[1] && r[1][1] && V.enabled() && typeof Speaker!=='undefined' && Speaker.gestured) return Math.round(r[1][1]*1000) + 150; }
  }catch(e){}
  const w=(String(text||'').trim().match(/\S+/g)||[]).length; return Math.max(700, Math.round(w*220));   // no audio: calm, readable pace
}
async function playSteps(ab, steps, onStep){
  const my=++animToken; L.busy=true;
  // Each run has its own token, checked after every wait (inside ab.move too): a demo that was left behind
  // (Next tapped mid-move) never touches the beads of the next one.
  const live=()=>my===animToken;
  for (const s of steps){
    if (!live()) return; onStep(s);
    const dur=lessonClipMs(s); narrateStep(s);
    if (s.do.length){
      const lead=Math.max(250, Math.round(dur*0.45));             // let her set up the move, then the beads move as she says it
      await sleep(lead); if (!live()) return;
      for (const m of s.do){ if (!live()) return; await ab.move(m.rod, m.delta, 450, live); if (!live()) return; }
      const rest=dur - lead - s.do.length*450; if (rest>0){ await sleep(rest); if (!live()) return; }
      await sleep(450);
    } else { await sleep(dur + 350); }                            // a talking-only step: hold for her whole line
  }
  if (live()) L.busy=false;
}
function onLessonBeads(v){
  if (L.busy) return;
  if (L.phase==='help'){
    if (L.helpStage!=='ask' || v!==L.target) return;              // only the child's fix counts
    clearTimeout(L.skipT); $('#lessonNext').style.visibility='hidden'; L.marks[turnIdx()]=true; L.did++; L.won=true; L.helpStage='done';
    const sc=lessonScript(L.node.id)||{}; Sfx.ok(); Fun.Mascot.react($('#bixLesson'), 'cheer', 1800);
    cap('Help Bixi', `<b>${v}</b> — that's it. You put it right.`, '');
    bixiSay((sc.bixi_thanks||{}).id, {text:(sc.bixi_thanks||{}).text, ms:4000});
    lessonAb.clearHighlights(); L.busy=true;
    setTimeout(()=>{ juniNarrate((sc.close||{}).id); L.busy=false; advanceLesson(); }, 1900);
    return;
  }
  if (L.phase==='numbers' || L.phase==='guided'){
    clearTimeout(L.tryT);
    if (v!==L.target){ const l=L, at=l.phase+turnIdx();   // the beads rest on another number: a try. After two, Skip turns up.
      l.tryT=setTimeout(()=>{ if (L!==l || l.phase+turnIdx()!==at || l.busy || lessonAb.value===l.target) return; if (++l.tries>=2 && l.showSkip) l.showSkip(); }, 1500); }
    if (v===L.target){ clearTimeout(L.skipT); $('#lessonNext').style.visibility='hidden'; L.marks[turnIdx()]=true; L.did++; L.won=true; Sfx.ok();
      const pr=nextPraise();   // Juni (the teacher) gives a different word of encouragement each time — never Bixi, never the same line twice running
      cap('Yes!', `<b>${v}</b> — ${pr.text}`); juniNarrate(pr.k); capVoice(pr.k,'juni');
      Fun.Mascot.react($('#bixLesson'), 'happy'); lessonAb.clearHighlights(); L.busy=true; setTimeout(()=>{ L.busy=false; advanceLesson(); }, 900); }
  }
}
function leaveLesson(){ animToken++;
  if (lessonFrom==='practice'){ lessonFrom='home'; const learned = !!(Practice.node && node(Practice.node).lesson); if (learned && Practice.on) return Practice.pick(); Practice.stop(); renderHome(); show('home'); return; }   // learned -> the Reading/Listening picker; exited early or mostly-skipped -> home (no re-loop)
  if (lessonFrom==='door'){ renderDoor.skipGreet=true; show('door'); } else if (lessonFrom==='parent'){ renderParent(); show('parent'); } else { renderHome(); show('home'); } }
// Whether there is a previous step to go back to (false only on the very first step of the lesson).
function lessonCanBack(){
  if (!L) return false;
  if (L.phase==='anatomy') return L.anatIdx>0;   // anatomy is the first phase (beads)
  if (L.phase==='intro') return L.page>0;        // intro is the first phase (demo nodes)
  return true;                                   // every later phase has a step before it
}
// Clear a completed your-turn mark so stepping back lets the child redo that number cleanly (keeps the tally honest).
function clearMark(i){ if (i>=0 && L.marks[i]!==undefined){ if (L.marks[i]===true) L.did=Math.max(0,L.did-1); else L.skipped=Math.max(0,L.skipped-1); L.marks[i]=undefined; } }
// Go back one step. renderLesson re-runs the step fresh, so the voice + bead animation re-sync on the way back too.
function lessonBack(){
  if (!L || !lessonCanBack()) return;
  const n=L.node; animToken++; L.busy=false; L.won=false; if (lessonAb) lessonAb.clearHighlights();
  switch (L.phase){
    case 'intro':   L.page=Math.max(0, L.page-1); break;
    case 'anatomy': L.anatIdx=Math.max(0, L.anatIdx-1); break;
    case 'fingers': if (L.fingerIdx>0) L.fingerIdx--; else { L.phase='anatomy'; L.anatIdx=ANATOMY_STEPS.length-1; } break;
    case 'watch':   if (L.watchIdx>0) L.watchIdx--; else { L.phase='anatomy'; L.anatIdx=ANATOMY_STEPS.length-1; } break;
    case 'numbers': if (L.demoIdx>0) L.demoIdx--; else { L.phase='fingers'; L.fingerIdx=FINGER_STEPS.length-1; } break;
    case 'demo':    if (L.demoIdx>0) L.demoIdx--; else { L.phase='intro'; L.pages=L.pages||lessonPages(n); L.page=L.pages.length-1; } break;
    case 'guided':  if (L.guidedIdx>0) L.guidedIdx--; else { L.phase='demo'; L.demoIdx=n.demos.length-1; } break;
    case 'help':    L.phase='guided'; L.guidedIdx=n.guided.length-1; break;
    case 'done':    if (n.kind==='numbers'){ L.phase='numbers'; L.demoIdx=n.lesson.numbers.length-1; } else { L.phase='guided'; L.guidedIdx=n.guided.length-1; } break;
  }
  if (L.phase==='numbers' || L.phase==='guided') clearMark(turnIdx());   // redo the landed-on turn fresh
  $('#lessonNext').style.visibility=''; renderLesson();
}
function renderBackBtn(){ const b=$('#lessonBack'); if (!b) return; if (!b.innerHTML.trim()) b.innerHTML=BACK_ICON()+'<span class="toy-block-label">Back</span>'; b.style.display = lessonCanBack() ? '' : 'none'; }
function advanceLesson(){
  const n=L.node; animToken++; L.busy=false; L.won=false; lessonAb.clearHighlights();
  if ((L.phase==='numbers' || L.phase==='guided') && L.marks[turnIdx()]===undefined){ L.marks[turnIdx()]=false; L.skipped++; }   // skipped: not done
  if (L.phase==='intro'){ if (L.pages && L.page<L.pages.length-1){ L.page++; renderLesson(); return; }
    if (n.kind==='flash' && (!n.demos || !n.demos.length)){ node(n.id).lesson=true; saveProgress(); stopVoices(); return startDrill('flash', n); }   // a flash node with no teaching material: the card IS the lesson, straight to the drill
    if (n.kind==='numbers'){ const sc=lessonScript(n.id); if (sc && sc.watch && sc.watch.length){ L.phase='watch'; L.watchIdx=0; } else { L.phase='numbers'; L.demoIdx=0; } }
    else { L.phase='demo'; L.demoIdx=0; } }   // demo nodes AND mental-math (flash) nodes with demos: first lesson watches the sums build on beads + a few guided turns, THEN the flash drill (repeat visits skip straight to it via startFlash)
  else if (L.phase==='anatomy'){ L.anatIdx++; if (L.anatIdx>=ANATOMY_STEPS.length){ L.phase='fingers'; L.fingerIdx=0; } }   // the parts now teach the values too, so go straight to the finger step (no separate New-skill card or watch demo)
  else if (L.phase==='watch'){ const sc=lessonScript(n.id), ws=(sc&&sc.watch)||[]; L.watchIdx++; if (L.watchIdx>=ws.length){ L.phase='fingers'; L.fingerIdx=0; } }
  else if (L.phase==='fingers'){ L.fingerIdx++; if (L.fingerIdx>=FINGER_STEPS.length){ L.phase='numbers'; L.demoIdx=0; } }
  else if (L.phase==='numbers'){ L.demoIdx++; if (L.demoIdx>=n.lesson.numbers.length) L.phase='done'; }
  else if (L.phase==='demo'){ L.demoIdx++; if (L.demoIdx>=n.demos.length){ L.phase='guided'; L.guidedIdx=0; } }
  else if (L.phase==='guided'){ L.guidedIdx++; if (L.guidedIdx>=n.guided.length) L.phase = hasInterlude(n) ? 'help' : 'done'; }
  else if (L.phase==='help'){ L.phase='done'; }
  else if (L.phase==='done'){ if (n.kind==='flash'){ node(n.id).lesson=true; saveProgress(); stopVoices(); return startDrill('flash', n); } leaveLesson(); return; }   // mental-math: after the bridge lesson, into the flash drill
  renderLesson();
}
$('#lessonNext').addEventListener('click', ()=>{ if (L.won) return; advanceLesson(); });   // (the step she just got right moves on by itself)
$('#lessonBack').addEventListener('click', ()=>{ Speaker.unlock(); lessonBack(); });        // go back a step if the child missed something
// Other screens and the tests can open any skill's lesson.
window.Lessons = { start: (n, from)=>startLesson(typeof n==='string' ? C.BY_ID[n] : n, from) };
// What to do on a "your turn" step, in words (multiplication starts from 0 and ends on the product).
function guidedText(ls, pair, lead){
  const [x,y]=pair;
  if (ls.op==='mul') return `${lead}Start at <b>0</b>. Work out <b>${x} × ${y}</b> on the abacus.`;
  return `${lead}${lead?'the abacus':'The abacus'} shows <b>${x}</b>. ${lead?(y<0?'Take away':'Add'):'Now '+(y<0?'take away':'add')} <b>${Math.abs(y)}</b>.`;
}
// The move-steps that FORM a single-digit number v on the units rod, as a "Show me" demo (numbers phase, first lesson).
// Same {k, say, do} shape playSteps consumes: heaven bead first (five), then earth beads. Narration is in words a
// six-year-old follows. Keys are stable (not the sentence) so Juni's clips can be recorded against them later;
// until recorded, playSteps shows the caption silently (same as the quick-win fallback).
function makeNumberSteps(v){
  const steps=[];
  if (v>=5){
    steps.push({ k:'show.heaven', say:'Slide the heaven bead down — that’s five.', do:[{rod:0, delta:5}] });
    const more=v-5;
    if (more>0) steps.push({ k:`show.more.${more}`, say:`Slide up ${more} more earth bead${more>1?'s':''} — now it’s ${v}.`, do:[{rod:0, delta:more}] });
  } else {
    steps.push({ k:`show.earth.${v}`, say:`Slide up ${v} earth bead${v>1?'s':''} — that’s ${v}.`, do:[{rod:0, delta:v}] });
  }
  return steps;
}
$('#lessonHint').addEventListener('click', async()=>{ if (L.busy) return;
  if (L.phase==='numbers'){   // "Your turn — Show N": Juni demonstrates forming N on the abacus, then the child tries again (not auto-completed)
    const di=L.demoIdx, v=L.node.lesson.numbers[di]; L.target=v;
    const steps=makeNumberSteps(v);
    L.busy=true; lessonAb.reset(); lessonAb.setReadOnly(true);   // busy before reset so the reset-to-0 doesn't register as a try
    const tok=animToken+1;
    await playSteps(lessonAb, steps, s=>cap('Show me', s.say.replace(/(\d+)/g,'<b>$1</b>')));
    if (tok!==animToken || L.phase!=='numbers' || L.demoIdx!==di) return;   // phase/number changed (Next, Back, exit): bail, leave beads to whoever took over
    lessonAb.reset(); lessonAb.setReadOnly(false);
    cap('Your turn', `Show <b>${v}</b> on the abacus. Tap beads to move them.`, String(v)); lessonSkip();   // back to "Your turn", abacus reset, re-pressable
    return;
  }
  const gi=L.guidedIdx, pair=L.node.guided[gi], ls=lessonStep(L.node, pair); lessonAb.value=ls.start; lessonAb.setReadOnly(true); const tok=animToken+1; await playSteps(lessonAb, ls.steps, s=>cap('Show me', s.say.replace(/(\d+)/g,'<b>$1</b>'))); if (tok!==animToken || L.phase!=='guided' || L.guidedIdx!==gi) return; lessonAb.value=ls.start; lessonAb.setReadOnly(false); cap(`Your turn ${gi+1} of ${L.node.guided.length}`, guidedText(ls, pair, 'Now you: ')); });
$('#exitLesson').addEventListener('click', ()=>{ stopVoices(); leaveLesson(); });

/* ---------------- Juni the teacher: a speaker in her own right (Part 2) ---------------- */
// Juni leads from the window. juniSay shows her bubble (the lesson caption) and animates her mouth on the sky moon.
const CL = ()=>window.Classroom;
function juniFig(){ return $('#lessonSky'); }
function juniSay(key, o={}){ if (!CL()) return Promise.resolve(); return Promise.resolve(CL().say(key, Object.assign({who:'juni', figure:juniFig()}, o))).catch(()=>{}); }
function bixiFig(){ return $('#bixLesson'); }
function bixiSay(key, o={}){ if (!CL()) return Promise.resolve(); return Promise.resolve(CL().say(key, Object.assign({who:'bixi', figure:bixiFig()}, o, {bubble:null}))).catch(()=>{}); }   // Bixi in lessons: voice + animation only, NEVER a banner
// Juni leads a line on ANY screen: pass her bubble element + the screen's moon figure. Falls back to a silent bubble
// if the clip isn't recorded yet. One voice at a time is enforced in the Classroom/Fun audio layers.
function juniSayOn(bubble, figure, key, text, ms){
  if (!CL()){ if (bubble){ if (text!=null) bubble.textContent = text; bubble.classList.add('on'); } return Promise.resolve(); }
  // never surface a failed clip as an uncaught rejection: these are fire-and-forget on every screen (incl. the first-run gate)
  return Promise.resolve(CL().say(key, { who:'juni', text, bubble, figure, ms: ms||0 })).catch(()=>{});
}
// Tapping the moon plays one of Juni's calm lines; mark her tappable where she can be tapped (home, lesson).
function wireMoonTap(sel){ const sky=$(sel); if (!sky) return;
  sky.classList.add('cl-moon-tap');
  const m=sky.querySelector('.toy-moon'); if (m && !m.getAttribute('role')){ m.setAttribute('role','button'); m.setAttribute('aria-label', TOY.moonName); m.tabIndex=0; }
  if (sky._cltap) return; sky._cltap=true;
  sky.addEventListener('click', ()=>{
    // On home, before we know the child's name, a moon tap opens the name box instead of playing a fact.
    if (sel==='#homeSky' && !settings.name){ if (!$('#nameAsk').classList.contains('active')){ Speaker.unlock(); openNameAsk(); } return; }
    if (!CL()) return; Speaker.unlock(); CL().Silly.tapJuni({figure:sky, bubble:sel==='#lessonSky'?$('#lessonCap'):sel==='#homeSky'?$('#homeJuni'):$('#bixHome .bubble')}); });
}
// Tapping Bixi (the bead) in a lesson plays one of his tap lines in his own bubble.
function wireBixiTap(){ const el=$('#bixLesson'); if (!el || el._cltap) return; el._cltap=true;
  el.addEventListener('click', ()=>{ if (!CL() || (L && L.busy)) return; Speaker.unlock(); CL().Silly.tapBixi({figure:el, bubble:$('#bixiBubble'), ms:3200}); });
}
/* ---- Bixi moments + jokes between activities (Part 6). Never during a sum: only called on home / the play hub. ---- */
let bixiIdleT=null;
// A short Bixi bit or joke, honouring the silliness setting and never repeating until the pool is exhausted (see Classroom.Silly).
function maybeBixiMoment(el){ if (!CL()) return; const fig=el||$('#bixHome'); const card=fig && document.getElementById(fig.id+'Card'); CL().Silly.between({figure:fig, bubble:card || (fig && fig.querySelector('.bubble')), ms:6000}); }
// When home sits idle, Bixi dozes off (a calm move, no words). Any tap wakes him with a start.
function armBixiIdle(){ clearTimeout(bixiIdleT); if (!CL() || CL().Silly.level()==='quiet' || reduced()) return;
  bixiIdleT=setTimeout(()=>{ if ($('#home').classList.contains('active')) CL().move($('#bixHome'), 'sleep', 3200); }, 30000); }
function reduced(){ return document.body.classList.contains('ws-calm') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
// Any interaction on home wakes a dozing Bixi (with a start) and re-arms the idle timer.
document.addEventListener('pointerdown', ()=>{ if (!$('#home').classList.contains('active')) return; clearTimeout(bixiIdleT);
  const f=$('#bixHome .bix'); if (f && f.classList.contains('cl-sleep') && CL()) CL().move($('#bixHome'), 'wake', 1300); armBixiIdle(); }, true);

/* ---------------- practice (Look / Listen / Flash), answer tool, end of set, fix, level test ---------------- */
let mode='visual', drillNode=null, problems=[], idx=0, results=[], entry='', t0=0, reviewing=false, locked=false, wakeLock=null, reviewQueue=[];
let LT=null, pendingTest=null;   // LT: level test in progress {test, answers, start, tick}; pendingTest: node id whose test Bix offers
// Icons for static markup (index.html marks them with data-ic). The Toy Table screens (.tp) use the toy kit's icons;
// a name the toy kit does not have yet (print, share) falls back to the Workshop drawing.
function tpIcon(n, sz, stroke){ return TOY.icon(n, sz, 'currentColor', stroke ? {stroke} : {}); }
function paintIcons(root){ (root||document).querySelectorAll('.pr-ic[data-ic]').forEach(el=>{ if (el.firstChild) return; const n=el.dataset.ic, sz=+(el.dataset.sz||0)||(n==='check'?32:n==='speaker'?26:28);
  el.innerHTML = tpIcon(n, sz, +el.dataset.stroke||0); }); }
paintIcons();
$('#drillBowl').innerHTML = TOY.prop('bowl', 150);
$('#rvOkIc').innerHTML = TOY.icon('book', 30, 'currentColor');
// Bix on the practice screens: the toy figurine + a paper bubble. He talks with a recorded line when one exists.
// He thinks while she works, cheers when it is right and is sheepish (never sad) when it is not.
const bixArt = Fun.Mascot.art;   // a Bix drawing that can talk, for the practice screens (they place him themselves)
// A rod bead (tall, seen on its rod): teal = right, walnut = one to polish, mustard = the one she is on, wood = still to come.
function rodBead(color, h, dim){ return TOY.bead(color, h, {tall:true, shadow:false, dim:!!dim}); }
// The answer-tool switch is a little thing on the table to pick up: a soroban ("Use the beads") or a set of keys ("Type it instead").
function switchArt(to){
  const sh='<ellipse cx="70" cy="101" rx="66" ry="9" fill="url(#toy-g-shadow)" opacity=".8"/>';
  if (to==='beads'){
    return `<span class="tp-switch-ab">${TOY.soroban(123, 104)}</span><span class="toy-chip">Use the beads</span>`;
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
    // the words get smaller until they fit the bubble (two lines; three or four short ones in a slim column)
    let fs=parseFloat(getComputedStyle(tx).fontSize)||20;
    while (tx.scrollHeight && tx.scrollHeight>tx.clientHeight+2 && fs>14){ fs-=1; tx.style.fontSize=fs+'px'; }
  },
};
PB.mount();   // mounted up front, so the first problem's tiles are sized with the bubble already in place
// Juni is the lead teacher in Practice: her words show in #drillJuni and the window moon (#drillSky) talks. Bixi (PB) stays
// mounted as the reacting sidekick (his cheer/groan is reactVoice; his bubble hides when it has no line). Reuse recorded j_*
// keys where we have them; otherwise pass text only (silent until the recording stream ships that clip).
const JB = {
  base:null, cur:null, t:null,
  bubble(){ return $('#drillJuni'); },
  figure(){ return $('#drillSky'); },
  show(text, key){ this.cur={text:text||'', key:key||null}; const b=this.bubble(); if (b) b.classList.toggle('empty', !text); juniSayOn(this.bubble(), this.figure(), key||null, text==null?'':text, 0); },
  // the line Juni returns to for this problem (the instruction); silent is fine
  setBase(text, key){ this.base={text:text||'', key:key||null}; this.show(text, key); },
  // a reaction; after ms she returns to the base instruction
  say(text, key, ms){ this.show(text, key); clearTimeout(this.t); if (ms && this.base){ const b=this.base; this.t=setTimeout(()=>{ if (this.base===b) this.show(b.text, null); }, ms); } },
  replay(){ const c=this.cur; if (!c || !c.key || !CL() || App.quietNow()) return; Speaker.unlock(); CL().say(c.key, {who:'juni', figure:this.figure()}); },
  clear(){ clearTimeout(this.t); this.base=null; this.cur=null; const b=this.bubble(); if (b){ b.classList.remove('on'); b.classList.add('empty'); const t=b.querySelector('.ctext'); if (t) t.textContent=''; } },
};
if ($('#drillJuni')) $('#drillJuni').addEventListener('click', ()=>JB.replay());

/* ---- the answer tool: keypad (the toy kit's wooden keys on felt, same key order as before) or on-screen soroban (AbacusInput) ---- */
const Keys = TOY.keypad($('#padKeys'), { 
  onKey: k=>{ if (locked||demoing) return; Sfx.tap(); if (Tool.kind==='keys' && entry.length<entryMax()) setEntry(entry+k); },
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
    this.rods=rods; $('#drill').dataset.rods=rods;   // the layout knows how wide the soroban is (toy-practice.css)
    this.ab = AbacusInput.create($('#abHost'), { rods, showReadout:false, scale:1.3,
      onBead:()=>Sfx.tap(), onChange:(v)=>this.changed(v) });
    const vb=this.ab.el.querySelector('svg').viewBox.baseVal; $('#drill').style.setProperty('--abk', (vb.height/vb.width).toFixed(3));   // the soroban's own height/width, so the layout can size it without stretching
    return this.ab;
  },
  apply(){
    const beads=this.kind==='beads';
    $('#answerTool').classList.toggle('beads', beads); $('#answerTool').classList.toggle('keys', !beads);
    $('#drill').classList.toggle('tb', beads);   // beads layout: a narrow clipboard and a big soroban (toy-practice.css)
    $('#readoutLabel').textContent = beads ? 'beads show' : '';
    const sw=$('#toolSwitch'), to=beads?'keys':'beads'; if (sw.dataset.to!==to){ sw.dataset.to=to; sw.innerHTML=switchArt(to); }
    if (beads && problems[idx]) this.ensureAb(this.rodsForSet());
    this.readout();
  },
  switchTo(kind){ if (kind==='beads' && mode==='flash') return;   // Mental Math / Flash: never reveal the abacus — it would defeat mental math
    this.kind=kind; Fun.data.answerTool=kind; Fun.save(); this.apply(); if (kind==='beads'){ if (this.ab) this.ab.clear({animate:false}); this.readout(); JB.setBase(baseLine()); } else setEntry(''); markTiles(); },
  reset(){ verdict(null); setEntry(''); if (this.kind==='beads' && problems[idx]){ this.ensureAb(this.rodsForSet()).clear({animate:false}); } this.readout(); },
  // Listen / Flash: the keypad, the beads and Check wait (dimmed) until the numbers are done and Bix asks "Your answer?".
  setReady(on){ $('#answerTool').classList.toggle('waiting', !on); Keys.setEnabled(on); $('#checkBtn').disabled=!on; },
  value(){ return this.kind==='beads' ? (this.ab ? this.ab.value() : 0) : (entry==='' ? null : parseInt(entry,10)); },
  readout(){ if (this.kind==='beads'){ $('#answer').textContent = this.ab ? this.ab.value() : 0; } else $('#answer').textContent = entry || '?'; $('#readout').classList.toggle('empty', this.kind!=='beads' && !entry); $('#readout').dataset.len=$('#answer').textContent.length; },
  changed(v){
    this.readout(); markTiles();
    if (LT || demoing) return;
    clearTimeout(this.sayT); this.sayT=setTimeout(()=>{ if ($('#drill').classList.contains('active') && !locked && this.ab.moves().length) JB.say(`Your beads show ${this.ab.value()}. Tap Check!`, null); }, 900);
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
// Juni's recorded praise for a clean friend move (caption matches the clip in audio/lines-manifest.js).
const PRAISE_TEXT={ j_praise_sf:'You used a small friend. Nice work.', j_praise_bf:'You used a big friend. Nice work.', j_praise_both:'Both friends together. Two tricks in one move.' };
const PRAISE_KEY=[null, 'j_praise_sf', 'j_praise_bf', 'j_praise_both'];   // by RULE_RANK: five->sf, ten->bf, combined->both
function methodFeedback(p){
  if (Tool.kind!=='beads' || !Tool.ab || p.op==='mul') return null;
  const segs=segmentMoves(p.terms, Tool.ab.moves());
  if (segs.length<p.terms.length) return null;            // worked some of it in the head: nothing to say about the beads
  const res=segs.map(s=>AbacusInput.checkMethod(s.from, s.term, s.moves));
  const bad=res.find(r=>!r.ok);
  if (bad) return { ok:false, text:`Yes, ${p.answer}! ${bad.hint.replace(/ \(.*\)/, '')}` };   // the short form fits the two-line bubble
  const best=res.slice().sort((a,b)=>Math.max(-1,...b.expected.rules.map(r=>RULE_RANK[r]))-Math.max(-1,...a.expected.rules.map(r=>RULE_RANK[r])))[0];
  const rank=best ? Math.max(-1,...best.expected.rules.map(r=>RULE_RANK[r])) : -1;
  const usedFriend=rank>=1;   // a non-direct rule (small/big/combined friend) was the headline move
  return { ok:true, text: usedFriend ? best.hint : null, key: usedFriend ? PRAISE_KEY[rank] : null };
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
  // The digits fill more of each line for the short Reading/Look sums (v4.47: bigger numbers; v4.48: bigger still, the wider
   // clipboard gives the width headroom so the taller digits don't get clipped); long rows keep the airier ratio.
  const ratio = $('#drill').classList.contains('long') ? 0.84 : 0.98;
  if (h<max){ area.style.setProperty('--th', h+'px'); f=Math.min(maxF, Math.round(h*ratio)); area.style.setProperty('--tf', f+'px'); }
  // the digits stay as big as the line allows, smaller only if a long number would not fit the sheet's width
  while (f>20 && tiles.some(t=>t.scrollWidth>t.clientWidth+1)){ f-=2; area.style.setProperty('--tf', f+'px'); }
}
window.addEventListener('resize', ()=>{ if ($('#drill').classList.contains('active')){ fitTiles(); PB.fit(); } });
// Refit whenever the room changes (bubble mounted, "Show me" appears, fonts arrive, rotation).
if (window.ResizeObserver){ let q=0; const ro=new ResizeObserver(()=>{ if (q) return; q=requestAnimationFrame(()=>{ q=0; if ($('#drill').classList.contains('active') && mode==='visual') fitTiles(); }); }); ro.observe($('#sheet')); ro.observe($('#drill .tp-body')); }
if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if ($('#drill').classList.contains('active')) fitTiles(); });
// The set as beads on a brass rod: finished ones have slid to the left (green = right, red = one to polish — a
// traffic-light verdict), the one she is on glows in the middle, the rest wait on the right.
function renderStrip(popIdx){
  const st=$('#strip'); const fixing=reviewing && !LT; $('#fixLabel').hidden=!fixing; st.classList.toggle('fixing', fixing);
  const list = fixing ? reviewQueue : problems.map((_,i)=>i);
  const room=(st.clientWidth || 520)-24, h=Math.max(18, Math.min(st.clientHeight>80 ? 60 : 50, Math.floor(room*0.8/list.length/0.74)));
  st.innerHTML = list.map((i,k)=>{
    const p=problems[i], cur=i===idx, ok=results[i]===true||p._fixed, bad=results[i]===false&&!p._fixed;
    let svg, label=`Problem ${k+1}`;
    if (cur && !LT && (ok||bad)){ svg=rodBead(ok?'green':'red', Math.round(h*1.16)); label+= ok?', right':', to polish'; }   // the verdict shows at once, on the bead she is on (green = right, red = wrong)
    else if (cur){ svg=rodBead('mustard', Math.round(h*1.16)); label+=', now'; }
    else if (LT) svg=rodBead('indigo', h, results[i]===null||results[i]===undefined), label+= results[i]!=null?', done':'';
    else if (ok){ svg=rodBead('green', h); label+=', right'; }
    else if (bad){ svg=rodBead('red', h); label+=', to polish'; }
    else svg=rodBead('wood', h, true);
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
function flashSeconds(){ const d=drillNode && drillNode.drill;
  let base = (d && d.flashSec && settings.flashSec===DEFAULTS.flashSec && !settings.flashOwn) ? d.flashSec : settings.flashSec;   // a skill's own pace, until someone picks one
  // Gentle first exposure (R3): until the child picks their own flash speed, the first few mental sets at a node run
  // SLOWER, easing toward the base pace — a first-timer shouldn't meet 1s/number cold. Never speeds anything up.
  if (!settings.flashOwn && mode==='flash' && drillNode){
    const done = (modeDone(drillNode.id,'mental')||0) + (modeDone(drillNode.id,'flash')||0);
    const ramp = [2.5, 2.0, 1.5];   // set 0, 1, 2 at this node
    if (done < ramp.length) base = Math.max(base, ramp[done]);
  }
  return Math.min(3.0, Math.max(0.3, base));
}
function beginSet(){
  results = problems.map(()=>null); idx=0; t0=Date.now(); feedStreak=0; bixiSlipDone=false;
  Tool.setRods = Math.max(3, ...problems.map(p=>Tool.rodsFor(p)));
  Tool.kind = Tool.preferred();
  if (Practice.on && (Practice.type === 'reading' || Practice.type === 'listening' || Practice.type === 'mental')) Tool.kind = 'keys';   // Reading, Listening & Mental Math answer on the number pad (the abacus is hidden in Mental Math)
  // Start the silent set stopwatch as the first problem of a timed practice set is shown. It runs in the background
  // through the whole set (including the after-set polish pass) and stops at sessionDone(). Nothing of it shows on screen.
  // Mental Math is a 7-set mode too, so it is timed like Reading/Listening (reveal only after the set, best logged).
  if (Practice.on && (Practice.type === 'reading' || Practice.type === 'listening' || Practice.type === 'mental')) SetClock.start();
  Tool.apply();
  setStages(); toySky('#drillSky'); show('drill');
  PB.show('');   // Bixi mounts as the quiet, reacting sidekick (figure only; his bubble stays empty — Juni leads)
  JB.clear();    // start Juni's bubble empty until the first line
}
async function startDrill(m, n){
  if (!n || !n.drill){                                                       // no sums for this skill (bead numbers): its lesson, or making numbers
    if (n && hasLesson(n) && !node(n.id).lesson) return startLesson(n);
    return Games.open('build', {from:'home'});
  }
  mode=m; drillNode=n; reviewing=false; locked=false; listenArmed=false; Speaker.turn=0; Speaker.unlock(); stopTest(); LT=null;
  try { problems = E.generateSet2(drillConfig(n), settings.count); } catch(e){ TOY.confirm('No problems to make', 'The grown-up settings for numbers and speed can’t make problems for this skill. Change them in Grown-ups → Practice.', {ok:'OK', cancel:'Close'}); return; }
  beginSet();
  presentProblem();                       // start speaking while we are still inside the tap
  if (mode==='listen') JB.say('Listen carefully to each number.', 'j_start_listen', 2600);   // Juni leads; spoken before Ready, numbers stop her (caption matches the recorded clip)
  else if (mode==='flash') JB.say('Watch the numbers carefully!', 'j_start_flash', 2200);
  else JB.say(Tool.kind==='beads' ? 'Use your abacus for each one. Slow and careful.' : 'Look at each problem and work it out. Take your time.', Tool.kind==='beads' ? 'j_start_lookbeads' : 'j_start_look', 2200);   // caption matches the recorded clip
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){}
}
// Show only the stage for the current mode (Look: number tiles; Listen: the listening card; Flash: the flash card). Used by drills, the fix pass and level tests.
function setStages(){
  $('#problemArea').innerHTML='';
  $('#problemArea').style.display = mode==='visual'?'':'none';
  $('#listenStage').style.display = mode==='listen'?'':'none';
  $('#flashStage').style.display = mode==='flash'?'':'none';
  $('#drill').dataset.mode = mode; $('#drill').classList.toggle('lt', !!LT);
  const energy=$('#drillEnergy'); if (energy) energy.style.display = mode==='listen' ? 'none' : '';   // Listening is stripped to one big number + the pad: no snack bar
  SpeedPanel.close(); $('#speedGear').hidden = !(mode==='listen' || mode==='flash') || !!LT;   // the speed gear: Listen and Flash sets only
}
function endDrill(){ SpeedPanel.close(); dictateToken++; demoToken++; demoing=false; Speaker.stop(); stopTest(); if (wakeLock){ wakeLock.release().catch(()=>{}); wakeLock=null; } }
function stopTest(){ /* the level test keeps a silent, generous time measure only (LT.start); nothing ticks on screen */ }
function setEntry(v){ entry=v; Tool.readout(); }
// The keypad takes one digit more than the answer has (room for a slip, not for a row of digits).
function entryMax(){ const p=problems[idx]; return p ? String(Math.abs(p.answer)).length+1 : 6; }
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
  const p=problems[idx]; $('#feedback').textContent=''; submitting=false;
  Tool.apply(); Tool.reset();
  $('#showMeBtn').style.display = ((reviewing || (p && p._tries)) && !LT) ? '' : 'none'; $('#drill').classList.toggle('fixing', reviewing && !LT);   // "Show me" appears once the child has missed this problem (not before — try first)
  renderStrip();
  const long = mode==='visual' && p.terms.length>4;
  $('#drill').classList.toggle('long', long);
  if (mode==='visual'){ const area=$('#problemArea'); area.innerHTML=tileHtml(p); const dg=Math.max(...p.terms.map(t=>String(Math.abs(t)).length)); area.classList.toggle('many', long); area.classList.toggle('wide', dg>=3); area.classList.toggle('xwide', dg>=4); markTiles(); locked=false; Tool.setReady(true); }
  JB.setBase(baseLine());            // Juni gives the per-problem instruction (silent; she leads the screen)
  // Slice 3: in Look mode Juni SPEAKS the prompt now and then (every third problem; the mode-intro covers the first),
  // so she has a warm voice presence without nagging a fast child. Listen/Flash keep their own spoken cues.
  if (mode==='visual' && !LT && !reviewing && idx>0 && idx%3===0 && !(p && p._tries)){
    if (Tool.kind==='beads') JB.say('Move the beads, then tap Check.', 'j_prompt_beads', 2200);
    else JB.say((idx%2) ? 'Work it out — you\'ve got this.' : 'Solve it, then tell me the answer.', (idx%2)?'j_prompt_solve2':'j_prompt_solve1', 2200);
  }
  if (mode==='visual') fitTiles();   // after the bubble and "Show me" are in place
  if (mode==='listen'){ if (!listenArmed) armListen(p); else dictate(p); }
  else if (mode==='flash') armFlash(p);
  renderEnergy();                      // keep Bixi's snack bar showing today's progress
}
let dictateToken=0, listenArmed=false, submitting=false;   // submitting: an answer is being marked (the speed gear waits)
function armListen(p){ // show a "Ready" button; the tap that presses it starts the audio inside a user gesture (iOS needs this)
  locked=true; Tool.setReady(false); $('#replayBtn').disabled=true; $('#listenMsg').textContent='Tap when you are ready';
  $('#listenStage').dataset.lstate='ready';   // v4.47: the card shows only the ear + Ready; secondary controls hide
  const ln=$('#listenNum'); if (ln){ ln.textContent=''; ln.className='flash-num'; }
  const b=$('#listenGo'); b.style.display=''; b.onclick=()=>{ SpeedPanel.close(); b.style.display='none'; listenArmed=true; Speaker.unlock(); dictate(p); };
  // Speed is saved per child and used right away — no speed panel each time; the gear (shown during the drill) opens it to adjust.
}
// Say a problem: "seven", "plus five", "minus two", "equals" - with settings.termGap of silence after each number (and
// before "equals") and at settings.voiceRate. Used by Listen and by "Try it" in the speed panel. alive() turns false
// when the reading was stopped; returns false then. window.__lastSchedule = [[start, end], ...] in seconds, for tests.
async function speakTerms(p, alive, pulse){
  const gap=snapSpeed('termGap', settings.termGap); pulse=pulse||(()=>{});
  let scheduled=false;
  if (Speaker.kind()!=='device'){
    await Speaker.prepare(); if (!alive()) return false;
    try{ if (Speaker.ctx && Speaker.ctx.state!=='running') await Promise.race([Speaker.ctx.resume(), sleep(1500)]); }catch(e){}
    scheduled = (p.op!=='mul' || Speaker.hasTimes()) && Speaker.canSchedule() && Speaker.ctx && Speaker.ctx.state==='running';   // mul uses in-voice "times N" clips when present, else device voice
    Diag.add(`clips ready=${Speaker.canSchedule()} ctx=${Speaker.ctx?Speaker.ctx.state:'none'} -> ${scheduled?'audio clock':'device voice fallback'}`);
  }
  if (scheduled){
    // On the audio clock: each number starts `gap` seconds after the one before it has finished. No overlap at any speed.
    let prevEnd=Speaker.ctx.currentTime+0.3, lastEnd=prevEnd; const sched=[];
    p.terms.forEach((d,i)=>{
      const when = i===0 ? prevEnd : prevEnd+gap;
      const end = Speaker.scheduleTerm(d, i===0, when);
      sched.push([when,end]); prevEnd=end; lastEnd=end;
      setTimeout(()=>{ if(alive()) pulse((end-when)*1000, d, i); }, Math.max(0,(when-Speaker.ctx.currentTime)*1000));
    });
    // "equals" follows the last number after the same silence.
    const eqWhen=prevEnd+gap, eq=Speaker.scheduleEquals(eqWhen);
    if (eq){ sched.push([eqWhen, eq[0]]); lastEnd=eq[0]; setTimeout(()=>{ if(alive()) pulse((eq[0]-eqWhen)*1000, null, -1); }, Math.max(0,(eqWhen-Speaker.ctx.currentTime)*1000)); }
    window.__lastSchedule=sched.map(([w,e])=>[+(w-sched[0][0]).toFixed(3), +(e-sched[0][0]).toFixed(3)]);
    Diag.add('schedule: '+sched.map(([w,e])=>`${(w-sched[0][0]).toFixed(2)}–${(e-sched[0][0]).toFixed(2)}`).join(', '));
    Diag.add('equals: '+(eq ? eq[1] : 'device voice'));
    if (eq) await sleep(Math.max(0,(lastEnd-Speaker.ctx.currentTime)*1000));
    else { await sleep(Math.max(0,(eqWhen-Speaker.ctx.currentTime)*1000)); if (!alive()) return false; pulse(800, null, -1); const r=await Speaker.sayDevice('equals'); Diag.add(`said "equals" ${r}`); }
  } else {
    const words=i=>p.op==='mul' ? (i===0 ? termText(p.terms[0],true) : 'times '+termText(p.terms[i],true)) : termText(p.terms[i],i===0);
    const t0=performance.now(), sched=[]; window.__lastSchedule=sched;
    const one=async (text, term, i)=>{ pulse(800, term, i); const a=(performance.now()-t0)/1000; const r=await Speaker.sayDevice(text); sched.push([+a.toFixed(3), +((performance.now()-t0)/1000).toFixed(3)]); Diag.add(`said "${text}" ${r}`); };
    for (let i=0;i<p.terms.length;i++){ if(!alive()) return false; await one(words(i), p.terms[i], i); await sleep(gap*1000); }   // the silence starts when the voice has finished
    if (!alive()) return false; await one('equals', null, -1);
  }
  return alive();
}
async function dictate(p){
  Fun.BixVoice.stop();
  // v4.48: the pad / beads go LIVE the instant dictation starts — the child keys or beads along while listening (they
  // used to stay dimmed until the whole number had been read). "Say it again" and marking the answer are unchanged.
  const my=++dictateToken; locked=false; Tool.setReady(true); $('#replayBtn').disabled=true; $('#listenGo').style.display='none';
  if (!p._reader){ await Speaker.prepare(); p._reader = Speaker.pickReader(); } else Speaker.activePid = p._reader;   // replay keeps the same reader
  if (my!==dictateToken) return;
  $('#listenMsg').textContent = p._reader ? `${profileName(p._reader)} is reading…` : 'Listen…';
  $('#listenStage').classList.add('reading'); $('#listenStage').dataset.lstate='reading';   // v4.47: hero = the big number; the ear pulses
  const bigNum=$('#listenNum');
  const showBig=(term, i)=>{ if (!bigNum) return; if (term==null){ bigNum.className='flash-num eq'; bigNum.textContent='='; } else { bigNum.className='flash-num pop'+(term<0?' neg':''); flashLen(bigNum, term); bigNum.innerHTML=flashSign(term, i, p); } };
  const pulse=(ms, term, i)=>{ $('#ear').classList.add('pulse'); setTimeout(()=>$('#ear').classList.remove('pulse'),ms); showBig(term, i); };
  const finishUI=()=>{ if (my!==dictateToken) return; $('#listenMsg').textContent='Your answer?'; $('#listenStage').classList.remove('reading'); $('#listenStage').dataset.lstate='answer'; if (bigNum){ bigNum.textContent=''; bigNum.className='flash-num'; } locked=false; Tool.setReady(true); $('#replayBtn').disabled=p._replayed===true; };
  const watchdog=setTimeout(()=>{ if (my===dictateToken && locked){ Diag.add('watchdog: dictation did not finish; unlocking'); $('#listenMsg').textContent='Sound problem — tap "say it again"'; $('#listenStage').classList.remove('reading'); $('#listenStage').dataset.lstate='answer'; locked=false; Tool.setReady(true); $('#replayBtn').disabled=false; } }, ((p.terms.length+1)*(settings.termGap+4)+12)*1000);
  try{
    Speaker.stop();
    Diag.add(`dictate start voice=${settings.voice} kind=${Speaker.kind()} ctx=${Speaker.ctx?Speaker.ctx.state:'none'} tts=${('speechSynthesis' in window)?('voices '+speechSynthesis.getVoices().length+(speechSynthesis.speaking?' speaking':'')+(speechSynthesis.paused?' paused':'')):'n/a'}`);
    if (!await speakTerms(p, ()=>my===dictateToken, pulse)) return;
    if (my!==dictateToken) return; await sleep(settings.answerPause*1000);
    finishUI();
  }catch(e){ Diag.add('dictate error '+(e&&e.message||e)); finishUI(); }
  finally{ clearTimeout(watchdog); }
}
// "Say it again" is a user gesture — iOS needs the AudioContext/speechSynthesis UNLOCK to run inside it, or a replay after a
// pause/interruption plays nothing. (v4.47 item 6: the Ready tap unlocked, but this replay path did not.)
$('#replayBtn').addEventListener('click', ()=>{ const p=problems[idx]; if(p._replayed) return; p._replayed=true; Speaker.unlock(); dictate(p); });
// Flash: she taps Ready (after clearing her abacus), numbers pop up one at a time with their + / − sign, then she answers.
function flashDots(n, on){ const w=n>8?22:30; $('#flashDots').innerHTML = Array.from({length:n},(_,i)=>TOY.bead('teal', w, {dim:i>=on, shadow:false})).join(''); }
function flashLen(el, t){ el.style.setProperty('--len', Math.max(2, String(Math.abs(t)).length+1)); }
function flashSign(t, i, p){ if (p && p.op==='mul') return i===0 ? String(t) : `<b class="times">×</b>${t}`; return (i===0 ? (t<0?'<b class="minus">−</b>':'') : `<b class="${t<0?'minus':'plus'}">${t<0?'−':'+'}</b>`) + Math.abs(t); }
function armFlash(p){
  ++dictateToken; locked=true; Tool.setReady(false); const el=$('#flashNum'); el.className='flash-num hint'; el.innerHTML=TOY.icon('flash', 72);
  flashDots(p.terms.length, 0); $('#flashAgain').style.display='none';
  $('#flashMsg').textContent = idx===0 && !reviewing ? 'Clear your abacus. Numbers pop up one at a time.' : 'Clear your abacus, then tap Ready.';
  const b=$('#flashGo'); b.style.display=''; b.onclick=()=>{ SpeedPanel.close(); b.style.display='none'; Speaker.unlock(); flash(p); };
  // Speed is saved per child and used right away — no speed panel each time; the gear opens it to adjust.
}
/* ---- Speed panel: how fast the numbers come, on the Listen and Flash screens ----
   Two controls per mode (SPEED): Listen = voice speed + pause between numbers, Flash = time on screen + pause between
   numbers. Each is a bead on a brass rod with the exact value on a chip, wooden - / + discs (one step), a tortoise at
   the slow end and a hare at the fast end. Values are settings.* (per child), the same ones Grown-ups edits.
   Before a set: opened by armListen / armFlash, and the set's own Ready button sits in the panel as "Start".
   During a set: the gear disc opens it (no grown-ups gate - the owner's decision); whatever is being said or flashed
   stops, and Done starts the current problem again from its first number. "Try it" plays 3 + 4 - 2 at the chosen speed. */
const SPEED_ART = {
  tortoise: sz=>`<svg width="${sz}" height="${Math.round(sz*.75)}" viewBox="0 0 48 36" aria-hidden="true"><ellipse cx="24" cy="33.5" rx="18" ry="2" fill="rgba(58,30,6,.18)"/><rect x="10" y="24" width="8" height="8" rx="3.5" fill="#7DBE7B"/><rect x="28" y="24" width="8" height="8" rx="3.5" fill="#7DBE7B"/><path d="M36,22 q8,-7 10,0 q0,5 -6,5 h-5z" fill="#8FCB8C"/><circle cx="42.6" cy="20.6" r="1.2" fill="#28357A"/><path d="M5,27 Q4,8 21,8 Q38,8 38,27 Z" fill="#1FA595"/><path d="M5,27 Q4,8 21,8 Q38,8 38,27" fill="none" stroke="#16897C" stroke-width="1.6"/><path d="M12,14 q8,-5 17,-1" fill="none" stroke="#B6F5EA" stroke-width="2.2" stroke-linecap="round" opacity=".7"/><path d="M14,27 L18,17 H25 L29,27 M18,17 L15,11 M25,17 L28,11" fill="none" stroke="#16897C" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
  hare: sz=>`<svg width="${sz}" height="${Math.round(sz*.75)}" viewBox="0 0 48 36" aria-hidden="true"><ellipse cx="24" cy="33.5" rx="17" ry="2" fill="rgba(58,30,6,.18)"/><path d="M2,15 h7 M1,21 h9 M3,27 h6" stroke="#B58A2A" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="21" r="3.6" fill="#FFFDF6" stroke="#C99A38" stroke-width="1.2"/><ellipse cx="25" cy="23" rx="12" ry="8.4" fill="#F1C24E"/><ellipse cx="18" cy="30.6" rx="7" ry="2.6" fill="#D9A22E"/><ellipse cx="34" cy="31" rx="4.6" ry="2.2" fill="#D9A22E"/><ellipse cx="33.5" cy="7.5" rx="2.7" ry="7.5" transform="rotate(-24 33.5 7.5)" fill="#F1C24E"/><ellipse cx="39" cy="7" rx="2.7" ry="7.5" transform="rotate(-6 39 7)" fill="#E9B43C"/><circle cx="39" cy="17" r="6.6" fill="#F1C24E"/><circle cx="41.4" cy="15.8" r="1.3" fill="#28357A"/><circle cx="45.2" cy="18.4" r="1.1" fill="#C0552F"/><path d="M19,18 q6,-4 12,-2" fill="none" stroke="#FFF1B8" stroke-width="2" stroke-linecap="round" opacity=".8"/></svg>`,
};
const SpeedPanel = {
  kind:null, go:null, home:null, resume:null, tok:0,
  isOpen(){ return !$('#speedPop').hidden; },
  keys(){ return this.kind==='flash' ? ['flashSec','flashGap'] : ['voiceRate','termGap']; },
  value(k){ return snapSpeed(k, k==='flashSec' ? flashSeconds() : settings[k]); },
  set(k, v){ v=snapSpeed(k, v); if (v!==this.value(k)){ settings[k]=v; if (k==='flashSec') settings.flashOwn=true; saveSettings(); this.stopTry(); Sfx.tap(); } this.paint(k); },
  paint(k){ const el=$(`#spCtrls [data-k="${k}"]`), s=SPEED[k], v=this.value(k), r=el.querySelector('input'); el.querySelector('.sp-val').textContent=s.fmt(v); r.value=v; r.setAttribute('aria-valuetext', s.fmt(v)); el.querySelector('[data-d="-1"]').disabled=v<=s.min; el.querySelector('[data-d="1"]').disabled=v>=s.max; },
  build(){
    $('#spCtrls').innerHTML=this.keys().map(k=>{ const s=SPEED[k], lo=s.lowIsFast?'hare':'tortoise', hi=s.lowIsFast?'tortoise':'hare', nm=n=>n==='hare'?'fast':'slow';
      return `<div class="sp-ctrl" data-k="${k}"><label class="sp-label" for="sp_${k}">${s.label}</label><output class="sp-val" for="sp_${k}"></output><div class="sp-row">`
        + `<button type="button" class="toy-iconbtn sp-step" data-d="-1" aria-label="${s.label}: one step down">${TOY.icon('minus', 30, 'currentColor')}</button><span class="sp-end" data-end="${nm(lo)}">${SPEED_ART[lo](50)}</span>`
        + `<input type="range" id="sp_${k}" min="${s.min}" max="${s.max}" step="${s.step}">`
        + `<span class="sp-end" data-end="${nm(hi)}">${SPEED_ART[hi](50)}</span><button type="button" class="toy-iconbtn sp-step" data-d="1" aria-label="${s.label}: one step up">${TOY.icon('plus', 30, 'currentColor')}</button></div></div>`; }).join('');
    this.keys().forEach(k=>this.paint(k));
  },
  open(kind, goBtn){
    if (this.isOpen()) this.close();
    this.kind=kind; this.build(); const pop=$('#speedPop'), flashK=kind==='flash';
    if (!$('#bixSpeed').firstChild) $('#bixSpeed').innerHTML=TOY.moon('happy', 92, {still:true});   // Juni's moon fronts the speed panel; the subtitle is her first-person voice
    $('#spSub').textContent = (flashK ? 'How fast should the numbers pop up?' : 'How fast should I say the numbers?') + (goBtn ? ' Then tap Start.' : ' Then tap Done.');
    $('#spPreview').hidden=!flashK; $('#spPreview').textContent=''; $('#spTry .pr-ic').innerHTML=TOY.icon(flashK ? 'eye' : 'speaker', 28, 'currentColor'); $('#spTry').querySelector('.toy-block-label').textContent='Try it';
    if (goBtn){ this.go=goBtn; this.home={parent:goBtn.parentNode, next:goBtn.nextSibling}; this.goLabel=goBtn.querySelector('.toy-block-label').textContent; goBtn.querySelector('.toy-block-label').textContent='Start'; $('#spGoSlot').appendChild(goBtn); }
    $('#spDone').hidden=!!goBtn; pop.hidden=false; $('#drill').classList.add('sp-open'); $('#speedGear').setAttribute('aria-expanded','true');
  },
  close(){
    if (!this.isOpen()) return; this.stopTry();
    if (this.go){ this.go.querySelector('.toy-block-label').textContent=this.goLabel; this.home.parent.insertBefore(this.go, this.home.next); this.go=null; }
    this.resume=null; $('#speedPop').hidden=true; $('#drill').classList.remove('sp-open'); $('#speedGear').setAttribute('aria-expanded','false');
  },
  done(){ const r=this.resume; this.close(); Speaker.unlock(); if (r) r(); },
  // The gear: stop what is being said / flashed, show the panel; Done starts the same problem again from the top.
  gear(){
    if (this.isOpen()){ if (!this.go) this.done(); return; }
    const p=problems[idx]; if (LT || demoing || submitting || !p || !(mode==='listen' || mode==='flash') || !$('#drill').classList.contains('active')) return;
    const waiting = $(mode==='listen' ? '#listenGo' : '#flashGo').style.display!=='none';   // still at "Ready": nothing to stop
    if (!waiting){
      dictateToken++; Speaker.stop(); Fun.BixVoice.stop(); locked=true; Tool.setReady(false);
      if (mode==='listen'){ $('#listenStage').classList.remove('reading'); $('#listenStage').dataset.lstate='ready'; $('#listenMsg').textContent='Paused'; $('#replayBtn').disabled=true; }
      else { const el=$('#flashNum'); el.textContent=''; el.className='flash-num'; $('#flashMsg').textContent='Paused'; $('#flashAgain').style.display='none'; }
    }
    Sfx.tap(); this.open(mode, null); this.resume = waiting ? null : ()=>{ if (mode==='listen') dictate(p); else flash(p); };
  },
  async tryIt(){
    const my=++this.tok, alive=()=>my===this.tok && this.isOpen(), sample={terms:[3,4,-2]}; Speaker.unlock(); Speaker.stop(); Fun.BixVoice.stop();
    if (this.kind==='flash'){ const el=$('#spPreview'); for (let i=0;i<3;i++){ if (!alive()) return; el.innerHTML=flashSign(sample.terms[i], i); await sleep(this.value('flashSec')*1000); if (!alive()) return; el.textContent=''; await sleep(this.value('flashGap')*1000); } return; }
    await speakTerms(sample, alive);
  },
  stopTry(){ this.tok++; Speaker.stop(); $('#spPreview').textContent=''; },
  init(){
    $('#spCtrls').addEventListener('click', e=>{ const b=e.target.closest('.sp-step'); if (!b) return; const k=b.closest('.sp-ctrl').dataset.k; this.set(k, this.value(k)+(+b.dataset.d)*SPEED[k].step); });
    $('#spCtrls').addEventListener('input', e=>{ const c=e.target.closest('.sp-ctrl'); if (c) this.set(c.dataset.k, e.target.value); });
    $('#spTry').addEventListener('click', ()=>this.tryIt()); $('#spDone').addEventListener('click', ()=>this.done()); $('#speedGear').addEventListener('click', ()=>this.gear());
    document.addEventListener('keydown', e=>{ if (e.key==='Escape' && this.isOpen() && !this.go) this.done(); });
  },
};
SpeedPanel.init();
async function flash(p){
  const my=++dictateToken; locked=true; Tool.setReady(false); const el=$('#flashNum'); el.textContent=''; el.className='flash-num';
  $('#flashMsg').textContent='Watch…'; $('#flashGo').style.display='none'; $('#flashAgain').style.display='none'; flashDots(p.terms.length, 0); await sleep(600);
  for (let i=0;i<p.terms.length;i++){ if(my!==dictateToken) return; const t=p.terms[i]; el.className='flash-num pop'+(t<0?' neg':''); flashLen(el, t); el.innerHTML=flashSign(t,i,p); flashDots(p.terms.length, i+1); await sleep(flashSeconds()*1000); el.textContent=''; el.className='flash-num'; await sleep(settings.flashGap*1000); }
  if(my!==dictateToken) return; el.className='flash-num ask'; el.textContent='';   /* the answer slot already shows "?" (no third question mark) */
  $('#flashMsg').textContent = Tool.kind==='beads' ? 'What did you get? Show it on the beads.' : 'What did you get? Tap it in.'; $('#flashAgain').style.display = LT ? 'none' : ''; locked=false; Tool.setReady(true);
}
$('#flashAgain').addEventListener('click', ()=>{ if (mode==='flash' && problems[idx]) flash(problems[idx]); });
$('#checkBtn').addEventListener('click', ()=>{ if(locked||demoing) return; submit(); });
document.addEventListener('keydown', e=>{ if(!$('#drill').classList.contains('active')||locked||demoing) return; if (e.target && e.target.closest && e.target.closest('.abx-rod')) return; if(/^[0-9]$/.test(e.key)&&entry.length<entryMax()&&Tool.kind==='keys') setEntry(entry+e.key); else if(e.key==='Backspace'&&Tool.kind==='keys') setEntry(entry.slice(0,-1)); else if(e.key==='Enter') submit(); });
function shake(){ const t=Tool.kind==='beads' ? $('#abHost') : $('#readout'); t.classList.remove('tp-nudge'); void t.offsetWidth; t.classList.add('tp-nudge'); setTimeout(()=>t.classList.remove('tp-nudge'),460); }
// Right / wrong shows instantly where she is looking: the answer box turns teal (a small pop) or keeps its dashed rim and wobbles gently ("not yet", never red),
// and her bead on the rod turns teal or stays raw walnut (one to polish). Cleared when the next problem comes. Never used in the level test.
function verdict(v){ const r=$('#readout'); r.classList.remove('is-right','is-wrong');
  if (Tool.kind==='beads' && Tool.ab) Tool.ab.feedback(v==='right'?'right':v==='wrong'?'wrong':null);   // tint the placed beads green (right) / red (wrong)
  if (!v) return; void r.offsetWidth; r.classList.add(v==='right'?'is-right':'is-wrong'); }
// Bixi's spoken reactions in Practice (his own voice, no-repeat until the pool is used up).
// His cheer pool deliberately SKIPS b_react_yes1 ("Yes!") so his PEER reaction is never the verdict word itself —
// Juni owns "Yes!". It draws from yes2..yes6 ("Nice!", "You got it!", "Fantastic!", "Super!", "Wow!"); the miss pool
// (notyet1..3: "Oops! We'll polish it later." / "Almost! Keep going." / "That's okay. Next one!") is a gentle commiserate,
// never the word "not quite".
const _bixiReact={yes:[],notyet:[]};
function bixiReactKey(kind){ let pool=_bixiReact[kind];
  if(!pool.length){ const nums = kind==='yes' ? [2,3,4,5,6] : [1,2,3]; pool=_bixiReact[kind]=nums.slice();
    for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; } }
  return 'b_react_'+kind+pool.pop(); }
// Juni (the TEACHER) delivers the VERDICT — "Yes!" on a right answer, "Not quite" on a miss — the SAME in every mode
// (Reading, Listening, Flash). Juni has no recorded verdict clip of her own, so the word is spoken by the lesson/narrator
// voice (settings.voice) — the teacher voice the child hears read the problems. Returns a promise that resolves when the
// word has finished, so Bixi's peer reaction can follow cleanly instead of talking over it.
function juniVerdict(kind){ // kind: 'yes' | 'notyet'
  if(!settings.speakFeedback) return Promise.resolve();
  return Speaker.say(null, kind==='yes'?'yes':'not quite');
}
// Bixi (the CLASSMATE) REACTS alongside her — a warm cheer on a right answer, a commiserating line on a miss. It is his
// own recorded reaction (never the verdict word), and it plays the SAME in every mode; it stays silent (a graceful no-op)
// if his voice isn't loaded, and it never falls back to the narrator saying the verdict.
function reactVoice(kind){ // kind: 'yes' | 'notyet'
  if(!settings.speakFeedback) return;
  if(CL()) CL().say(bixiReactKey(kind), {who:'bixi', figure:$('#bixDrill')});   // figure: Bixi hops/mouth-moves with his reaction (was voice-only, detached)
}

/* ---------------- Bixi's snack bar: she feeds him by solving problems (per child, resets each day) ---------------- */
// Never punishing: a wrong answer only cools the streak, it never drains the bar; stopping early keeps what she fed him.
const FEED_GOAL = 10;        // correct answers to fill Bixi up for the day
let feedStreak = 0;          // consecutive corrects; every third is a "burst" (the race-to-feed feeling)
let bixiSlipDone = false;    // Slice 5: Bixi's playful "oops, I got one wrong" beat fires at most once per set
function feedState(){ const F=Fun.data; if (!F.feed || F.feed.day!==todayKey()) F.feed={ day:todayKey(), n:0, full:false }; return F.feed; }
function renderEnergy(){
  const el=$('#drillEnergy'); if (!el) return;
  const s=feedState(), pct=Math.min(1, s.n/FEED_GOAL)*100;
  const face=el.querySelector('.tp-en-face'); if (face && !face.firstChild) face.innerHTML=bixArt('happy', 34);
  const fill=el.querySelector('.tp-en-fill'); if (fill) fill.style.width=pct+'%';
  el.classList.toggle('full', !!s.full);
  el.setAttribute('aria-label', 'Bixi’s snack bar: ' + (s.full ? 'full' : s.n + ' of ' + FEED_GOAL));
}
function pulseEnergy(cls){ const el=$('#drillEnergy'); if(!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el['_'+cls]); el['_'+cls]=setTimeout(()=>el.classList.remove(cls), 650); }
// Returns true if it played a Bixi voice line (fill or streak pipe-up), so the caller skips the ordinary cheer
// and Bixi never talks over himself.
function feedBixi(){
  const s=feedState();
  if (s.full){ pulseEnergy('fed'); return false; }          // already full today: a little shine, never over-feed
  feedStreak++;
  const burst = feedStreak % 3 === 0;                  // on a roll: a bigger bite
  s.n = Math.min(FEED_GOAL, s.n + (burst ? 2 : 1));
  pulseEnergy('fed'); if (burst) pulseEnergy('burst');
  if (s.n >= FEED_GOAL && !s.full){ s.full=true; Fun.save(); renderEnergy(); bixiFull(); return true; }
  Fun.save(); renderEnergy();
  // Slice 3: on a 3-in-a-row streak, Bixi pipes up — voice + figure only, never a banner (bigger line from 6+)
  if (burst && settings.speakFeedback){ try{ if (Fun.BixVoice && Fun.BixVoice.play){ Fun.BixVoice.play(feedStreak>=6?'bx_drill_streak_big':'bx_drill_streak', $('#bixDrill')); return true; } }catch(e){} }
  return false;
}
function bixiFull(){
  pulseEnergy('full');
  // Bixi NEVER gets a speech banner: animate the figure + play his (Gigi) voice, no bubble text.
  PB.draw('proud');
  try{ if (Fun.BixVoice && Fun.BixVoice.play) Fun.BixVoice.play('bx_drill_full', PB.el()); }catch(e){}
  // Feeding Bixi is just encouragement during the set; beads are earned for finishing the whole set, not per streak.
  try{ Sfx.ok(); }catch(e){}
}

// Slice 5: Bixi's rare, once-per-set playful slip. Mid-set, after a clean correct answer, he "admits" he got one
// wrong (voice + an oops wobble, NEVER a banner — Bixi only speaks and animates). Gated behind the same
// "Bixi mistakes" family setting as the lesson interlude, and off in level tests / the polish pass. Deterministic
// (fires on the midpoint problem) so it stays rare and testable; skipped if that answer was a snack-bar milestone.
function bixiSlipBeat(){
  if (bixiSlipDone || settings.bixiMistakes===false || !settings.speakFeedback || LT || reviewing) return false;
  if (idx !== Math.floor(problems.length/2)) return false;
  bixiSlipDone=true;
  try{ if (Fun.Mascot && Fun.Mascot.react) Fun.Mascot.react($('#bixDrill'), 'oops', 1400); }catch(e){}
  try{ if (CL() && CL().move) CL().move($('#bixDrill'), 'dizzy'); }catch(e){}
  try{ if (Fun.BixVoice && Fun.BixVoice.play){ Fun.BixVoice.play('bx_drill_oops_me', $('#bixDrill')); return true; } }catch(e){}
  return false;
}
async function submit(){
  const val=Tool.value(); const p=problems[idx];
  if (val===null){ shake(); return; }
  if (Tool.kind==='beads' && !Tool.ab.moves().length && val===0){ JB.say('Move the beads first, then tap Check.', null, 2200); shake(); return; }
  locked=true; submitting=true; const fb=$('#feedback');
  if (LT){   // level test: no right/wrong on the screen, just on to the next one
    LT.answers[idx]={value:val, atMs:Date.now()-LT.start}; results[idx]=val===p.answer; Sfx.pop(); fb.textContent='Got it.';
    await sleep(350); return next();
  }
  const ok=val===p.answer;
  if (ok){
    fb.textContent='Yes!'; Sfx.ok();
    const mf=methodFeedback(p); if (mf) p._method=mf.ok;
    // Juni gives the method win: a clean friend-move maps to a recorded praise clip; a correction keeps the dynamic hint as her text.
    if (mf && mf.text){
      if (mf.ok && mf.key) JB.say(PRAISE_TEXT[mf.key], mf.key, 1800);
      else JB.say(mf.text, null, mf.ok?1800:3600);
    }
    else JB.say('Yes! Well done.', null, 1400);
    verdict('right');
    if(!reviewing){ results[idx]=true; record(p,true); renderStrip(idx); } else { p._fixed=true; fb.textContent='Polished!'; renderStrip(idx); }
    await juniVerdict('yes');   // Juni (teacher) delivers the spoken verdict — same in Reading and Listening
    let slip=false;
    if (!feedBixi()){ slip=bixiSlipBeat(); if (!slip) reactVoice('yes'); }   // milestone -> streak/full line; else the rare slip beat, else the ordinary cheer (never two Bixi voices)
    await sleep(slip ? 2000 : (mf && mf.text && !mf.ok ? 2600 : 650));
  }
  else {
    feedStreak=0;        // a miss only cools the streak — the bar never drains
    fb.textContent='Not quite'; Sfx.bad(); verdict('wrong'); if (Tool.kind==='beads') shake();
    p._tries=(p._tries||0)+1;
    await juniVerdict('notyet');   // Juni (teacher) delivers the spoken verdict — same in Reading and Listening
    // Bixi commiserates WITH her (his own reaction, never the verdict word): a warm, specific "shake it off" line on the
    // first miss of a problem, the pooled reaction otherwise.
    if (settings.speakFeedback && p._tries===1 && Fun.BixVoice && Fun.BixVoice.play){ try{ Fun.BixVoice.play((idx%2)?'bx_drill_miss_b':'bx_drill_miss_a', $('#bixDrill')); }catch(e){ reactVoice('notyet'); } }
    else reactVoice('notyet');
    // NO-FAIL (matches Level 1): never skip a missed problem. Fix pass always teaches; first pass gives a
    // second try, then shows the beads. The miss is recorded once (first attempt) so mastery still reflects
    // first-try skill; the eventual correct answer records a success too (so a child who learns isn't stuck).
    if (reviewing){ await teachAndRetry(p); return; }
    if (p._tries===1){ results[idx]=false; p._given=String(val); record(p,false); renderStrip(idx); }
    if (p._tries>=2){ await teachAndRetry(p); return; }   // second miss (or they didn't tap "Show me"): watch the beads
    JB.say('Not quite — have another try.', 'j_try_again', 1700);   // first miss: stay on the problem, try again
    await sleep(800);
    if (!$('#drill').classList.contains('active')) return;
    presentProblem(); return;   // re-arm the SAME problem; "Show me" is now visible
  }
  next();
}
// A missed problem's teaching beat, shared by the fix pass and a repeated first-pass miss: red bead, watch the
// bead-by-bead solution, then retry the same problem (no-fail).
async function teachAndRetry(p){
  const cb=$('#strip .tp-b.cur'); if (cb){ const sv=cb.querySelector('svg'); cb.innerHTML=rodBead('red', sv?sv.getAttribute('height')|0:0); cb.classList.add('bad'); cb.classList.remove('tp-wob'); void cb.offsetWidth; cb.classList.add('tp-wob'); }
  JB.say('Let\'s watch the beads together.', 'j_showme', 0);
  await sleep(900); await showMe(p);
  if (!$('#drill').classList.contains('active')) return;
  presentProblem();
}
function record(p, ok){ const st=node(drillNode.id); st.hist.push({ok, day:todayKey()}); st.hist=st.hist.slice(-40); }
function next(){
  if(reviewing){ const nxt=reviewQueue.find(i=>!problems[i]._fixed); if (nxt!==undefined){ idx=nxt; presentProblem(); } else finish(); return; } if(idx<problems.length-1){ idx++; presentProblem(); } else finish(); }
function checkMastery(nid){
  const st=node(nid); if (st.mastered) return false; const h=st.hist.slice(-20); if (h.length<20) return false;
  const acc=h.filter(x=>x.ok).length/h.length; const daysN=new Set(h.map(x=>x.day)).size;
  if (acc>=0.8 && daysN>=2){ st.mastered='auto'; if (NODE_IDX[nid]===curIdx()) advancePastMastered(); return true; }   // skip optional/flash nodes when advancing
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
// Beads earned drop into the bowl (green = right, then the golden ones); the ones to polish (red) wait on the felt mat beside it.
// list: 'jade' (right) | 'fix' (to polish) | 'pale' (not yet)
function sumBeads(list, gold){
  gold=gold||0; const inBowl=list.filter(c=>c==='jade').length, total=inBowl+gold, bs = total<=14 ? .19 : total<=25 ? .145 : .112;
  const box=$('#sumStars'); box.style.setProperty('--bs', bs); let k=0, html=BOWL_BACK;
  list.forEach((c,i)=>{ if (c==='jade') html+=`<span role="listitem" aria-label="${i+1}: shiny" class="tp-b in" style="${bowlSlot(k++, total)}">${TOY.bead('green', 80, {shadow:false})}</span>`; });
  for (let g=0; g<gold; g++) html+=`<span aria-hidden="true" class="tp-b tp-gold in" style="${bowlSlot(k++, total)}">${TOY.bead('mustard', 80, {shadow:false})}</span>`;
  box.innerHTML=html+BOWL_FRONT;
  const out=list.map((c,i)=>[c,i]).filter(x=>x[0]!=='jade'), w=out.length>8 ? 44 : 60;
  $('#sumFix').innerHTML=out.map(([c,i])=>`<span role="listitem" aria-label="${i+1}: ${c==='fix'?'to polish':'not yet'}" class="tp-b out">${TOY.bead('red', w, {dim:c!=='fix'})}</span>`).join('');
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
  const full=m.after>=m.total, ph=n=>TOY.stepPhase(n, m.total);
  sky.innerHTML = m.after>m.before ? TOY.skyMoon('calm', ph(m.before))+TOY.skyMoon(full?'proud':'happy', ph(m.after)) : TOY.skyMoon(full?'proud':m.after?'happy':'calm', ph(m.after));
  if (!plaque) return;
  plaque.hidden=false; plaque.setAttribute('role','img'); plaque.setAttribute('aria-label', `${name}: ${m.after} of ${m.total} today`);
  const svg=(n,cls)=>TOY.moonPhases(n, m.total).replace('class="toy-moonphases"', `class="toy-moonphases ${cls}"`).replace('role="img"', 'aria-hidden="true"');
  plaque.innerHTML=`<span class="tp-moonstack">${svg(m.before,'before')}${m.after>m.before ? svg(m.after,'after') : ''}</span>`;
}
let sumSpeak=null;   // the end-of-set line(s), spoken by Juni (the lead) on her moon; the words on screen stay in #sumNote
// Juni's end-of-set clips; sum_amazing/great/good reuse her recorded praise, the rest arrive on the recording stream.
const SUM_JKEY = { sum_amazing:'j_end_amazing', sum_great:'j_end_great', sum_good:'j_end_good', sum_fixed:'j_sum_fixed', sum_unlock:'j_unlock', fix_one:'j_fix_one', fix_start:'j_fix_start' };
const POLISH_LINE = { fix_one:'Let’s polish this one together.', fix_start:'Let’s polish these together.' };
// Replay the summary line on Juni's moon (tapping the speaker, the bubble, or Bixi beside it).
function saySummary(){ if (!sumSpeak || !sumSpeak.length || !CL()) return; Speaker.unlock(); CL().sequence(sumSpeak.map(it=>({key:it.key, text:it.text})), { who:'juni', figure:$('#sumJuniMoon'), ms:0 }); }
$('#sumSay').addEventListener('click', saySummary);
$('#bixSum').addEventListener('click', saySummary);
function finish(){
  if (LT) return finishLevelTest();
  if (Practice.on){   // practice set: no standard summary — polish any misses to all-correct, then hand back to the level flow
    const toFix = problems.map((p,i)=>results[i]===false && !p._fixed ? i : -1).filter(i=>i>=0);
    if (!reviewing && toFix.length){
      reviewQueue = toFix; reviewing = true; idx = reviewQueue[0]; t0 = Date.now();
      setStages(); toySky('#drillSky'); show('drill'); presentProblem();
      const one = reviewQueue.length===1; JB.say(POLISH_LINE[one?'fix_one':'fix_start'], one?'j_fix_one':'j_fix_start', 2200);
      return;
    }
    endDrill(); Practice.setDone(); return;
  }
  endDrill(); const correct=results.filter(r=>r===true).length; const secs=Math.round((Date.now()-t0)/1000); let leveled=false;
  if (!reviewing){
    const checked=problems.filter(p=>p._method!==undefined);
    history.unshift({ at:new Date().toISOString(), mode, node:drillNode.id, count:problems.length, correct, secs, gap:mode==='listen'?settings.termGap:null,
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
  $('#sumScore').textContent = green ? `${green} shiny bead${green===1?'':'s'}!` : 'Good practice!';
  const vid = allFixed ? 'sum_fixed' : leveled ? 'sum_unlock' : n===3 ? 'sum_amazing' : n===2 ? 'sum_great' : 'sum_good';
  const say = { sum_fixed:'All polished! So shiny!', sum_unlock:`Hooray! You unlocked a new skill: ${NODES[curIdx()].title}!`, sum_amazing:'Amazing work!',
    sum_great:'Great job! Want to polish these with me?', sum_good:'Good practice! Every try makes you stronger.' }[vid];
  // ...and, when some are left to polish, the same sentence Bix says next (and again when the polish pass starts)
  const fixVid = toFix.length && vid!=='sum_great' ? (toFix.length===1 ? 'fix_one' : 'fix_start') : null;
  const fixLine = fixVid ? ' ' + POLISH_LINE[fixVid] : '';
  $('#sumNote').textContent = say + fixLine;
  // Golden beads earned here (handed out by activityDone below) all land in ONE place: the chip at the top right,
  // after the headline has settled (the floating "+n" toasts stay off this screen, see screens-practice.css).
  const gold = 0;   // beads are earned via Practice.celebrate (set) / levelDone (skill), not on this summary screen
  sumBeads(problems.map((p,i)=>results[i]===true||p._fixed?'jade':results[i]===false?'fix':'pale'), gold);
  drawMoon($('#sumSky'), $('#sumMoons'), reviewing ? null : mode);
  $('#sumGold').hidden = !gold; $('#sumGold').innerHTML = gold ? TOY.bead('mustard', 44, {shadow:false})+`<span>+${gold} golden bead${gold===1?'':'s'}</span>` : '';
  $('#sumNew').hidden = !leveled; $('#sumNew').innerHTML = leveled ? TOY.icon('star', 30, '#C98A16')+'<span>New skill!</span>' : '';
  // one obvious next step: fix the ones to polish; then the level test; else play again — always beside "I'm done"
  $('#fixBtn').style.display = toFix.length ? '' : 'none';
  // one phrase family for the ones not right yet: "to polish" on the mat, "Polish this / these with Bix" on the button
  { const fl=$('#fixBtn .toy-block-label'); if (fl) fl.textContent = toFix.length===1 ? 'Polish this with Bix' : 'Polish these with Bix';
    const cap=toFix.length===1 ? 'Bead to polish' : 'Beads to polish', fc=$('#summary .tp-fixcap'); if (fc) fc.textContent=cap; $('#sumFix').setAttribute('aria-label', cap); }
  $('#testBtn').style.display = pendingTest && !toFix.length ? '' : 'none';
  $('#againBtn').style.display = toFix.length || pendingTest ? 'none' : '';
  $('#againBtn').innerHTML=tpIcon('retry',40)+'<span class="toy-block-label">Play again</span>';
  const mood = (n===3||leveled||allFixed) ? 'proud' : n===2 ? 'cheer' : 'happy';
  // Juni is the lead voice at the summary: she speaks the praise (and the polish line) on her moon; Bixi stays as the sidekick.
  sumSpeak = (fixVid ? [{key:SUM_JKEY[vid], text:say}, {key:SUM_JKEY[fixVid], text:POLISH_LINE[fixVid]}] : [{key:SUM_JKEY[vid], text:say}]);
  $('#sumJuniMoon').innerHTML = TOY.moon(mood==='cheer'?'happy':mood, 120);
  $('#sumSay').style.visibility=''; show('summary'); sumBix(mood); saySummary();
  if (n===3||leveled||allFixed){ Sfx.star(); if (n===3||leveled) Fun.confetti(); } else Sfx.ok();
  if (!reviewing) setTimeout(()=>activityDone(mode, {gold: n===3, leveled}), 2400);   // let the beads and Bix land first
}
$('#fixBtn').addEventListener('click', ()=>{
  reviewQueue=problems.map((p,i)=>results[i]===false&&!p._fixed?i:-1).filter(i=>i>=0); if(!reviewQueue.length) return;
  Speaker.unlock(); reviewing=true; idx=reviewQueue[0]; t0=Date.now();
  setStages(); toySky('#drillSky'); show('drill');
  presentProblem();            // same mode as the drill: Listen re-reads the problem, Look shows it, Flash re-flashes it
  { const one = reviewQueue.length===1; JB.say(POLISH_LINE[one?'fix_one':'fix_start'], one?'j_fix_one':'j_fix_start', 2200); }   // Juni leads the polish pass
});
$('#showMeBtn').addEventListener('click', async()=>{ if(locked||demoing) return; locked=true; await showMe(problems[idx]); locked=false; if (Tool.kind==='beads' && $('#drill').classList.contains('active')){ Tool.reset(); markTiles(); JB.setBase('Your turn! Move the beads, then tap Check.'); } });
$('#againBtn').addEventListener('click', ()=>startDrill(mode, drillNode));
$('#homeBtn').addEventListener('click', ()=>{ stopVoices(); pendingTest=null; Practice.stop(); renderHome(); show('home'); });
$('#testBtn').addEventListener('click', ()=>{ const id=pendingTest; pendingTest=null; startLevelTest(id); });
$('#exitDrill').addEventListener('click', ()=>{ stopVoices(); endDrill(); LT=null;
  if (Practice.on && !isFlashNode(Practice.node)){                                   // Back from a Reading/Listening session returns to the picker, not home
    if (Practice._savedCount != null){ settings.count = Practice._savedCount; Practice._savedCount = null; }
    return Practice.pick();
  }
  Practice.stop(); renderHome(); show('home');
});

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
  if (Tool.kind==='beads' && Tool.ab && $('#drill').classList.contains('active')) return showMeHere(p);   // delegate; it pauses the set clock itself
  SetClock.pause();   // a worked demo is not solving time — hold the silent stopwatch while it plays
  $('#showme').classList.add('active');
  const rods=Tool.rodsForSet();
  if (!showAb || showAb.rods()!==rods){ if (showAb) showAb.destroy(); showAb=AbacusInput.create($('#showmeAbacus'), {rods, showReadout:false, scale:1.75, readOnly:true}); }
  $('#showmeBix').innerHTML=TOY.moon('happy', 96);   // Juni's moon leads the worked demo (Bixi no longer fronts it)
  const probHtml=(k)=>p.op==='mul' ? `${p.terms[0]} <i>×</i> ${p.terms[1]}` : p.terms.map((t,i)=>`<span class="${i===k?'cur':''}">${i===0?t:(t<0?'<i class="minus">−</i>'+(-t):'<i class="plus">+</i>'+t)}</span>`).join('');
  const run = async()=>{ const my=++showToken; $('#showmeProb').innerHTML=probHtml(-1);
    await playSolution(showAb, p, ()=>my===showToken, h=>{ $('#showmeText').innerHTML=h; }, k=>{ $('#showmeProb').innerHTML=probHtml(k); });
    if (my===showToken) $('#showmeProb').innerHTML=probHtml(-1)+' <i>=</i> '+p.answer; };
  $('#showmeReplay').onclick=run;
  juniSayOn(null, $('#showmeBix'), 'j_showme', 'Watch the beads move.', 0);   // Juni: reuse j_showme
  await new Promise(res=>{ $('#showmeClose').onclick=()=>{ showToken++; $('#showme').classList.remove('active'); res(); }; run(); });
  SetClock.resume();
}

/* ---------------- Level-1 "Read the beads": interactive teaching (v4.58) ----------------
   For a brand-new child at a no-sums level, "Read the beads" is NOT the Bead Detective recognition quiz.
   It is a Juni-led, NO-FAIL teaching flow: she shows a bead's worth, demonstrates, hands it to the child,
   ladders 1-4 -> 5 -> 6, and checks reading with count-together help on a wrong tap. No score, no timer.
   Reuses DemoAbacus (board + Juni demos via .move / child moves via setReadOnly(false)+onChange),
   juniSayOn (Juni voice+caption, silent fallback), and onboarding's duration-aware beat timing so captions
   aren't truncated and advance cleanly with voice off. Completion -> Practice.teachDone() advances reading
   progress by one session, so level mastery (7) still works.
   SEAM: start() could branch to a lighter path on repeat visits later (a follow-up; not built yet). */
const ReadTeach = (function(){
  let ab=null, onDoneCb=null, alive=false, token=0, stuckT=null, waitNextRes=null, waitKind=null, bixIdleT=null, teachMode='read', stuckKey='j_rt_stuck';   // waitKind: test hook — what the flow is waiting on ('next' | 'bead:N' | 'read:N' | null). teachMode: 'read' (Read the beads) | 'make' (Make the number) — same engine, two scripts.
  // Bixi is the classmate who reacts. To keep ONE voice at a time, success = an instant silent bounce; his spoken
  // cheer (cheerBix) is played only AFTER Juni's verdict and is given time to finish before the next line.
  const BX_CHEERS=['bx_rt_nice','bx_rt_yes','bx_rt_got','bx_rt_woo','bx_rt_cool','bx_rt_me'];
  function bixReact(state,ms){ try{ Fun.Mascot.react($bix(), state||'cheer', ms); }catch(e){} }
  function bixSay(id,ms){ try{ Fun.Mascot.say($bix(), (window.BIX_LINES&&window.BIX_LINES[id])||'', ms||1800, id); }catch(e){} }
  const pickCheer=()=>BX_CHEERS[Math.floor(Math.random()*BX_CHEERS.length)];
  async function cheerBix(){ bixReact('cheer'); bixSay(pickCheer(),1600); await sleep(1150); }   // spoken cheer after Juni; finishes before the next line
  function bixClipMs(id){ try{ const r=Fun.BixVoice&&Fun.BixVoice.find&&Fun.BixVoice.find(id); if (r&&r[1]&&typeof r[1][1]==='number') return Math.round(r[1][1]*1000); }catch(e){} return 0; }
  // Bixi says ONE specific line (voice + bounce, NO speech bubble — Juni owns the banner) and we wait for it to finish.
  // He only ever speaks in the gaps between Juni's lines (after a verdict, or in a Next-wait), so it's one voice at a time.
  async function bixLine(id, mood){ if (!alive) return; bixReact(mood||'cheer');
    try{ if (Fun.BixVoice && Fun.BixVoice.play) Fun.BixVoice.play(id, $bix()); }catch(e){}
    const ms = (voiceOn() && bixClipMs(id)) ? Math.min(bixClipMs(id)+300, 5600) : 900; await sleep(ms); }
  const gap=()=>sleep(120);   // a short breath between spoken lines so voices never butt together
  function bixIdleStart(){ clearInterval(bixIdleT); bixIdleT=setInterval(()=>{ if (alive && $bix()) bixReact('happy'); }, 4000); }
  function bixIdleStop(){ clearInterval(bixIdleT); bixIdleT=null; }
  const $sky=()=>$('#rtSky'), $bub=()=>$('#rtJuni'), $bix=()=>$('#rtBix'), $next=()=>$('#rtNext'), $pad=()=>$('#rtPad'), $count=()=>$('#rtCount');
  // timing (ported from onboarding.beat): a PLAYING clip runs to completion; the cap only fires if audio hangs/off.
  const SAY_BUFFER=1800, SAY_CEILING=6500, SAY_FLOOR=650, SAY_OFF=950;
  const voiceOn=()=> !!(settings.bixTalks!==false && typeof Speaker!=='undefined' && Speaker && Speaker.gestured && !navigator.webdriver);
  function clipMs(key){ try{ const V=CL()&&CL().Voice; if (V&&V.find){ const r=V.find('juni',key); if (r&&r[1]&&typeof r[1][1]==='number') return Math.round(r[1][1]*1000); } }catch(e){} return 0; }
  function say(key, text){ return juniSayOn($bub(), $sky(), key, text, 0); }
  function beat(key, text){ const p=say(key,text); if (!alive) return Promise.resolve(); if (!voiceOn()) return sleep(SAY_OFF);
    const cap=(clipMs(key) ? clipMs(key)+SAY_BUFFER : SAY_CEILING);
    return Promise.race([ Promise.all([Promise.resolve(p).catch(()=>{}), sleep(SAY_FLOOR)]), sleep(cap) ]); }
  // child-paced "Next"
  function showNext(on){ const b=$next(); if (b) b.classList.toggle('on', !!on); }
  function waitNext(){ return new Promise(res=>{ waitNextRes=res; waitKind='next'; showNext(true); }); }
  function onNextClick(){ if (!waitNextRes) return; Sfx.tap(); const r=waitNextRes; waitNextRes=null; waitKind=null; showNext(false); r(); }
  function clearPad(){ const p=$pad(); if (p){ p.innerHTML=''; p.onclick=null; } }
  // child pushes beads to a target (no-fail; stuck ~6.5s -> Juni demonstrates, then they retry)
  function waitBead(target, demoFn){
    return new Promise(res=>{
      const my=token; ab.setReadOnly(false); waitKind='bead:'+target;
      const cur0 = (typeof ab.value === 'number' ? ab.value : 0);
      $count().textContent = String(cur0);   // reflect whatever is already on the board (so the card is never stuck on 0 if a bead moved early)
      const done=()=>{ clearTimeout(stuckT); ab.setReadOnly(true); ab._rtOnChange=null; waitKind=null; };
      const win=()=>{ done(); Sfx.ok(); bixReact('cheer'); res(true); };
      ab._rtOnChange=(v)=>{ if (token!==my) return; $count().textContent = String(v); if (v===target) win(); };
      if (cur0===target){ win(); return; }   // child already built it (e.g. pushed the bead before Juni finished)
      clearTimeout(stuckT);
      stuckT=setTimeout(async()=>{ if (token!==my || !alive) return; await beat(stuckKey,'Here — watch me do it.'); if (token!==my) return;
        ab.setReadOnly(true); await demoFn(); if (token!==my) return; await sleep(500); ab.reset(); $count().textContent='0'; ab.setReadOnly(false); }, 6500);
    });
  }
  // a few friendly choices including the answer (single digit, within the taught range)
  function choices(answer){
    const set=new Set([answer]);
    while (set.size<3){ const d=answer + (Math.random()<0.5?-1:1)*(1+Math.floor(Math.random()*2)); if (d>=1 && d<=9) set.add(d); }
    const arr=[...set]; for (let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    return arr;
  }
  // count-together help (no-fail): Juni counts the beads at the bar; heaven bead is 5, then +1 per earth bead.
  async function countTogether(answer){
    const my=token; await beat('j_rt_count','Let’s count together.'); if (token!==my || !alive) return;
    ab.highlight && ab.highlight(0, true);
    const start = answer>=5 ? 5 : 1;
    for (let k=start;k<=answer;k++){ if (token!==my) return; const c=$count(); c.textContent=k; c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); await sleep(680); }
    await sleep(300); $count().textContent=''; ab.clearHighlights && ab.clearHighlights();
  }
  // child reads the shown beads by tapping a number; wrong tap -> count-together, then a gentle hint, retry (no fail)
  function waitRead(answer){
    return new Promise(res=>{
      const my=token, pad=$pad(); pad.innerHTML=''; waitKind='read:'+answer;
      const btns=choices(answer).map(d=>{ const b=document.createElement('button'); b.type='button'; b.className='rt-choice'; b.textContent=d; b.dataset.d=d; pad.appendChild(b); return b; });
      pad.onclick=async(e)=>{ const b=e.target.closest('.rt-choice'); if (!b || token!==my || b.disabled) return; const d=+b.dataset.d;
        if (d===answer){ Sfx.ok(); b.classList.add('ok'); bixReact('cheer'); pad.onclick=null; waitKind=null; await sleep(320); res(true); }
        else { Sfx.tap(); b.classList.add('miss'); b.disabled=true; await countTogether(answer); if (token!==my) return; btns.forEach(x=>{ if (+x.dataset.d===answer) x.classList.add('hint'); }); } };
    });
  }
  // Demo a bead move WHILE Juni narrates it: start her line, let her get a couple of words in, then move the
  // bead + reveal the number, then wait for her line to finish. Keeps word and action in sync (no "number pops,
  // then it gets spoken" and no overlap with the next line).
  async function demoMove(key, text, lead, moveFn, val){
    const my=token; const p=beat(key, text); await sleep(lead); if (token!==my) return;
    await moveFn(); if (token!==my) return; $count().textContent=String(val);
    await Promise.resolve(p).catch(()=>{});
  }
  // Level-1 cards are PRACTICE, not teaching — the opening lesson ("Watch the lesson again") teaches the fundamentals
  // (bead values, the 5-bead, how to make/read). These two flows just practise the two directions: no re-explaining.
  const PR_YES=['j_pr_yes1','j_pr_yes2','j_pr_yes3','j_pr_yes4'];
  const PR_BIX=['bx_try_woo','bx_try_smart','bx_try_strong'];
  let yesIdx=0; const nextYes=()=>PR_YES[(yesIdx++)%PR_YES.length];
  const pick1=a=>a[Math.floor(Math.random()*a.length)];
  function pickRounds(k){ const pool=[1,2,3,4,5,6,7,8,9]; for(let i=pool.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]]; } return pool.slice(0,k); }
  async function demoBuild(N){ ab.reset(); if (N>=5){ await ab.move(0,+5,560,()=>alive); for(let k=0;k<N-5;k++){ await ab.move(0,+1,380,()=>alive); } } else { for(let k=0;k<N;k++){ await ab.move(0,+1,400,()=>alive); } } }
  const ROUNDS=5;
  // READING practice: a number is shown on the beads; the child reads it by tapping the number. No-fail (count together, retry).
  async function runRead(){
    const my=token;
    await beat('j_pr_read_intro','Let’s read some beads together!'); if (token!==my) return;
    await gap(); await bixLine('bx_hi_class','happy'); if (token!==my) return;
    await gap(); if (token!==my) return;   // after the opening line, go straight into the first number — no "Next" tap (the first round starts on its own)
    const nums = pickRounds(ROUNDS);
    for (let i=0;i<nums.length;i++){ if (token!==my) return; const N=nums[i];
      ab.reset(); ab.setReadOnly(true); ab.input.setValue(N,{animate:true}); $count().textContent='';
      await beat('j_pr_read_ask','What number is this?'); if (token!==my) return;
      await waitRead(N); if (token!==my) return;
      clearPad(); await gap(); await beat(nextYes(),'Yes!'); if (token!==my) return;
      if (i===1 || i===nums.length-1){ await bixLine(pick1(PR_BIX),'cheer'); if (token!==my) return; }   // Bixi pipes up now and then, not every round
      await gap();
    }
    Fun.confetti(70); Sfx.star(); bixReact('cheer',2200);
    await beat('j_pr_read_done','Lovely reading! You’re getting quick at it.'); if (token!==my) return;
    await bixLine('bx_done_readstar','cheer'); await sleep(300);
    finish();
  }
  // MAKING practice: Juni says a number; the child builds it on the beads. No-fail (stuck -> Juni builds it, then retry).
  async function runMake(){
    const my=token;
    await beat('j_pr_make_intro','Let’s make some numbers! I’ll say one, and you build it.'); if (token!==my) return;
    await gap(); await bixLine('bx_mk_cheerme','happy'); if (token!==my) return;
    await gap(); if (token!==my) return;   // after the opening line, go straight into the first number — no "Next" tap (the first round starts on its own)
    const nums = pickRounds(ROUNDS);
    for (let i=0;i<nums.length;i++){ if (token!==my) return; const N=nums[i];
      ab.reset(); ab.setReadOnly(true); $count().textContent='';
      await beat('j_pr_make_'+N,'Can you make '+N+'?'); if (token!==my) return;
      await waitBead(N, async()=>{ await demoBuild(N); }); if (token!==my) return;
      await gap(); await beat(nextYes(),'Yes!'); if (token!==my) return;
      if (i===1 || i===nums.length-1){ await bixLine(pick1(PR_BIX),'cheer'); if (token!==my) return; }
      await gap();
    }
    Fun.confetti(70); Sfx.star(); bixReact('cheer',2200);
    await beat('j_pr_make_done','Great building! A little practice every day and you’ll fly.'); if (token!==my) return;
    await bixLine('bx_done_proud','cheer'); await sleep(300);
    finish();
  }
  function start(node, onDone, which){
    token++; alive=true; onDoneCb=onDone; teachMode = which||'read'; stuckKey = teachMode==='make' ? 'j_mk_stuck' : 'j_rt_stuck';
    try { Speaker.unlock && Speaker.unlock(); } catch(e){}
    try { Fun.BixVoice && Fun.BixVoice.load && Fun.BixVoice.load(); } catch(e){}   // preload Bixi's (Gigi) voice for the lesson
    try { toySky($sky()); } catch(e){}
    try { toyBix($bix(), 'happy', {size:132, keep:false}); } catch(e){}
    bixIdleStart();
    const t=$('#rtTitle'); if (t) t.textContent = (typeof L1_LABELS!=='undefined' && L1_LABELS[teachMode==='make'?'listening':'reading']) || (teachMode==='make'?'Make the number':'Read the beads');
    const host=$('#rtAbacus');
    if (!ab){ ab=DemoAbacus(host, {rods:1, readout:false, onBead:()=>Sfx.tap(), onChange:(v)=>{ if (ab && ab._rtOnChange) ab._rtOnChange(v); }}); }
    ab.reset(); ab.setReadOnly(true); $count().textContent=''; clearPad(); showNext(false);
    if (!start._wired){ start._wired=true;
      $next().addEventListener('click', onNextClick);
      $('#exitReadTeach').addEventListener('click', ()=>{ Sfx.tap(); stop(); if (Practice && Practice.on) Practice.pick(); else { renderHome(); show('home'); } });
    }
    show('readTeach');
    (teachMode==='make'?runMake:runRead)().catch(()=>{});
  }
  function finish(){ const cb=onDoneCb; alive=false; onDoneCb=null; token++; clearTimeout(stuckT); bixIdleStop(); waitNextRes=null; if (cb) cb(); }
  function stop(){ alive=false; onDoneCb=null; token++; clearTimeout(stuckT); bixIdleStop(); waitNextRes=null; clearPad(); }
  return { start, stop, _run:runRead, _runMake:runMake,
    // test hooks: inspect what the flow is waiting on, and simulate the child's bead-moves / number-taps
    _waiting:()=>waitKind, _alive:()=>alive,
    _poke:(v)=>{ if (ab) ab.poke(v); },
    _pick:(d)=>{ const b=$pad().querySelector('.rt-choice[data-d="'+d+'"]'); if (b) b.click(); return !!b; },
    _choices:()=>[...$pad().querySelectorAll('.rt-choice')].map(b=>+b.dataset.d) };
})();
window.ReadTeach = ReadTeach;
// "Make the number" uses the same teaching engine, launched in 'make' mode (second script, shared DOM/abacus/buttons).
window.MakeTeach = { start:(n,cb)=>ReadTeach.start(n,cb,'make'), stop:ReadTeach.stop, _run:ReadTeach._runMake,
  _waiting:ReadTeach._waiting, _alive:ReadTeach._alive, _poke:ReadTeach._poke, _pick:ReadTeach._pick, _choices:ReadTeach._choices };

// With the on-screen beads in use, Bix demonstrates right on her abacus, then hands it back cleared.
async function showMeHere(p){
  const my=++demoToken; demoing=true; SetClock.pause(); $('#answerTool').classList.add('demo');   // hold the silent set clock during the demo
  const live=()=>my===demoToken && $('#drill').classList.contains('active');
  const tiles=()=>[...$('#problemArea').querySelectorAll('.term')];
  JB.say('Watch the beads move.', 'j_showme', 0);   // Juni narrates the demo; reuse j_showme
  await sleep(700);
  await playSolution(Tool.ab, p, live, h=>{ if(live()){ const t=document.createElement('div'); t.innerHTML=h; JB.say(t.textContent, null, 0); } }, k=>tiles().forEach((t,i)=>{ t.classList.toggle('now', i===k); t.classList.toggle('done', i<k); }));
  if (live()) await sleep(1400);
  SetClock.resume();   // pairs this call's pause; resume whatever token state, so the clock never stays stuck
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
  JB.say('Level test! Take your time.', null, 2600);   // Juni leads the level test
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
  $('#sumScore').textContent = green ? `${green} shiny bead${green===1?'':'s'}!` : 'Good try!';
  sumBeads(right.map(r=>r?'jade':'pale')); drawMoon($('#sumSky'), $('#sumMoons'), null);
  $('#sumNote').textContent = score.correctAny/score.total >= score.minAccuracy
    ? 'So many right! Let’s practise a little more to get quicker, then try the test again.'
    : `Almost there! Let’s practise ${lt.test.title} a little more, then try again.`;
  $('#sumGold').hidden=true; $('#sumNew').hidden=true; $('#fixBtn').style.display='none'; $('#testBtn').style.display='none';
  $('#againBtn').style.display=''; $('#againBtn').innerHTML=tpIcon('retry',40)+'<span class="toy-block-label">Practise</span>';   // practises the tested skill
  sumSpeak=null; $('#sumSay').style.visibility='hidden'; $('#sumJuniMoon').innerHTML=TOY.moon('happy', 120); show('summary'); sumBix('happy'); Sfx.ok();
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
$('#certDone').addEventListener('click', ()=>{ stopVoices(); renderHome(); show('home'); });
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
function gateReveal(){ const c=$('#gateCard'); if (c.dataset.step==='ask') return; c.dataset.step='ask'; c.setAttribute('aria-labelledby','gateQ'); $('#gateMsg').textContent=''; gateQuestion();
  // The finger is still on the Hold button here. The box gets the focus when it lifts (a touch iOS accepts for opening
  // the keyboard); with a mouse or a keyboard, straight away. Never from a timer: see Typing.
  Typing.afterTap($('#gateA'), ()=>$('#gate').classList.contains('active') && c.dataset.step==='ask'); }
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
  // Leaving a practice set for the gate: whatever is being read or flashed stops, and the problem waits at "Ready" again.
  if (gateFrom==='drill' && (mode==='listen' || mode==='flash') && problems[idx]){ dictateToken++; Speaker.stop(); Fun.BixVoice.stop(); if (mode==='listen') armListen(problems[idx]); else armFlash(problems[idx]); }
  GateHold.reset(); const c=$('#gateCard'); c.dataset.step='hold'; c.setAttribute('aria-labelledby','gateHoldT'); $('#gateMsg').textContent=''; $('#gateA').value='';
  gateAnswer=-1; window.__gateAnswer=null;
  if (!$('#gateArt').innerHTML) $('#gateArt').innerHTML=GATE_ART;
  toySky('#gateSky'); show('gate'); const bg=$('#bixGate'); toyBix(bg, 'happy'); Fun.Mascot.quiet(bg);
  juniSayOn($('#gateJuni'), $('#gateSky'), 'j_gate_grownup', 'This part is for a grown-up. Can you go and get one?');
}
function leaveGate(){ gateCb=null; $('#gateA').blur(); GateHold.reset(); Fun.BixVoice.stop();
  if (gateFrom==='setup' && !settings.name){ Setup.open(); return; }   // first-run setup stays behind the gate: don't strand on a blank setup
  if (gateFrom==='door') show('door'); else if (gateFrom && gateFrom!=='home' && gateFrom!=='gate' && $('#'+gateFrom)) show(gateFrom); else { renderHome(); show('home'); } }
$('#gateBack').addEventListener('click', leaveGate);
$('#gateOk').addEventListener('click', ()=>{
  if ($('#gateCard').dataset.step!=='ask') return;
  const right=$('#gateA').value.trim()!=='' && parseInt($('#gateA').value,10)===gateAnswer; if (right) $('#gateA').blur();   // the keyboard goes away with the gate
  if(right && gateCb){ const cb=gateCb; gateCb=null; Fun.BixVoice.stop(); GateHold.reset(); show(gateFrom); cb(); return; }   // a grown-up action, then back where we were
  if(right){ Fun.BixVoice.stop(); renderParent(); show('parent'); $('#parent').scrollTop=0; if (gateNext==='skills') setTimeout(()=>$('#guSkills').scrollIntoView({block:'start'}), 60); }
  else { const c=$('#gateCard'); c.classList.remove('tg-shake'); void c.offsetWidth; c.classList.add('tg-shake'); gateQuestion(); $('#gateMsg').textContent='That wasn’t it. Here is a new number to try.'; Typing.focus($('#gateA')); }
});
$('#gateA').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#gateOk').click(); });

/* ---------------- parent ---------------- */
function bindRange(id,key,fmt){ const el=$(id), v=$(id+'V'); el.value=settings[key]; v.textContent=(fmt||(x=>x))(settings[key]); el.oninput=()=>{ settings[key]=SPEED[key] ? snapSpeed(key, el.value) : parseFloat(el.value); if (key==='flashSec') settings.flashOwn=true; v.textContent=(fmt||(x=>x))(settings[key]); saveSettings(); }; }
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
  box.innerHTML = rows.filter(Boolean).map(([st,t,d,btn])=>`<div class="ck ${st}"><span class="ck-i" aria-label="${st==='ok'?'done':st==='warn'?'worth a look':'to do'}">${st==='ok'?TOY.icon('check', 18, 'currentColor', {stroke:3.4}):st==='warn'?'!':''}</span><div class="ck-t"><b>${t}</b><span>${d}</span></div><div class="ck-b">${btn}</div></div>`).join('');
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
// Small drawings for the grown-ups area that the kit does not have (see "Kit requests"): a share glyph, and beads threaded on a brass rod.
const KID_LAC=['red','indigo','teal','mustard'];
const guShare=(size)=>`<svg class="toy-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12,14.6 V3.6 M7.8,7.6 L12,3.4 L16.2,7.6"/><path d="M6,11.6 V18 a2.2,2.2 0 0 0 2.2,2.2 H15.8 a2.2,2.2 0 0 0 2.2,-2.2 V11.6"/></svg>`;
const guRodBeads=(n, color, size)=>`<span class="gu-rodbeads" aria-hidden="true">${Array.from({length:n}, ()=>TOY.bead(color, size||22, {tall:true, shadow:false})).join('')}</span>`;
function renderReport(){
  if (!PBrain) return;
  const data=reportData(), r=PBrain.weeklyReport(data), name=(settings.name||'').trim();
  lastReport=r; window.__report=r;
  $('#repTitle').textContent = name ? `${name}’s week` : 'This week';
  $('#repDates').textContent = fmtRange(r.weekStart, r.weekEnd);
  // children switcher (switching reloads the app as that child, then comes straight back here)
  const act=Store.activeId(), kids=Store.children();
  $('#repKids').innerHTML = kids.map((c,i)=>`<button data-rk="${c.id}" aria-pressed="${c.id===act}"><span class="gu-kbead toy-lac--${KID_LAC[i%KID_LAC.length]}" data-i="${esc(childLabel(c).trim().charAt(0).toUpperCase())}" aria-hidden="true"></span>${esc(childLabel(c))}</button>`).join('')
    + `<button class="gu-add" id="repAdd" aria-label="Add a child">${TOY.icon('plus', 22, 'currentColor')}</button>`;
  $$('#repKids [data-rk]').forEach(b=>b.onclick=()=>{ if (b.dataset.rk===Store.activeId()) return; Recorder.stop(); Store.switchTo(b.dataset.rk); sessionStorage.setItem('abacus.who','1'); sessionStorage.setItem('abacus.reopen','parent'); location.reload(); });
  $('#repAdd').onclick=()=>$('#kidAdd').click();
  $('#repShare').innerHTML=guShare(22)+'<span>Share report</span>';
  // days practised: one bead per day on a rod, oldest first (teal = practised)
  const DOW=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const beads=r.days.map(d=>{ const w=new Date(d.date+'T12:00:00').getDay(); return `<span class="rd-day${d.practiced?' on':''}">${TOY.bead('teal', 50, {tall:true, dim:!d.practiced, label:`${DOW[w]}, ${d.practiced?'practised':'not practised'}`})}<i aria-hidden="true">${DOW[w][0]}</i></span>`; }).join('');
  $('#repDays').innerHTML=`<span class="rep-k">Days practised</span><span class="rep-big" id="repDaysN">${r.daysPracticed} of 7 days${r.minutes?` · ${r.minutes} min`:''}</span><div class="rep-beads"><span class="rd-post" aria-hidden="true"></span>${beads}<span class="rd-post" aria-hidden="true"></span></div>`;
  // mastered this week (+ certificates)
  const certs=certificates(), from=r.weekStart, to=r.weekEnd;
  const certFor=id=>certs.find(c=>c.nodeId===id);
  const weekCerts=certs.filter(c=>{ const d=String(c.date||'').slice(0,10); return d>=from && d<=to; });
  const mastered=r.masteredThisWeek.slice(); weekCerts.forEach(c=>{ if (!mastered.some(m=>m.nodeId===c.nodeId)) mastered.push({nodeId:c.nodeId, label:c.title||App.nodeTitle(c.nodeId)}); });
  let mh='<span class="rep-k">Mastered this week</span>';
  if (mastered.length){
    const m=mastered[0], c=certFor(m.nodeId);
    mh+=`<span class="rep-big" id="repMasteredN">${esc(m.label)}</span>`;
    mh+= c ? `<span class="rep-s rep-cert">${TOY.icon('star', 20, '#C98A16')} Certificate earned${c.accuracy!=null?` · ${Math.round(c.accuracy<=1?c.accuracy*100:c.accuracy)}% right`:''}</span>` : `<span class="rep-s">A new skill, learned by practising</span>`;
    if (mastered.length>1) mh+=`<span class="rep-s">and ${mastered.slice(1).map(x=>esc(x.label)).join(', ')}</span>`;
  } else mh+=`<span class="rep-big quiet" id="repMasteredN">Nothing new yet</span><span class="rep-s">Skills move on at 80% on 2 days. Steady practice gets there.</span>`;
  $('#repMastered').innerHTML=mh;
  // working on now: a bead slides along the rod to the accuracy; the flag marks the 80% needed
  const cu=r.current, acc=cu.accuracy===null?null:Math.round(cu.accuracy*100), goal=Math.round(cu.needed*100);
  const need = acc===null ? 'Not practised yet. It moves on at 80% right on 2 different days.'
    : `${acc}% right · needs ${goal}% on ${cu.daysNeeded} days to move on` + (cu.problems<cu.problemsNeeded ? ` (${cu.problems} of ${cu.problemsNeeded} problems so far)` : '');
  $('#repWorking').innerHTML=`<span class="rep-k">Working on now</span><span class="rep-big">${esc(cu.label)}</span>
    <div class="rep-bar${acc===null?' none':acc>=goal?' there':''}" role="img" aria-label="${acc===null?'no answers yet':acc+'% right'}, ${goal}% needed"><i style="width:${acc||0}%"></i><b style="left:${goal}%"><u>${goal}%</u></b></div><span class="rep-s" id="repNeed">${need}</span>`;
  // tonight's tip: the moon keeps the long view, so she signs it
  const tip=pickTip(data); window.__tip=tip;
  $('#repTip').innerHTML=`<div class="tip-head"><span class="tip-moon">${TOY.moon('calm', 92, {still:true})}</span><div><span class="tip-k">Tonight’s 2-minute tip</span><h3 class="tip-t" id="repTipTitle" data-tip="${esc(tip.id)}">${esc(tip.title)}</h3></div></div><p class="tip-x">${esc(tip.text)}</p><p class="tip-why">${esc(tip.why||'')}</p>
    <div class="tip-b"><button class="tip-watch" id="repWatch">${TOY.icon('play', 22, 'currentColor')}<span>Watch Bix show it</span></button><button class="tip-more" id="repHow">How the abacus works</button></div>`;
  $('#repWatch').onclick=()=>{ Speaker.unlock(); Recorder.stop(); startLesson(lessonTarget(NODES[curIdx()]), 'parent'); };
  $('#repHow').onclick=()=>$('#guTech').scrollIntoView({behavior:'smooth', block:'start'});
  // missed most: one small bead per miss (up to 8 drawn; the number is always written)
  const mm=r.missedMost.concat(mulMissed(r.weekStart, r.weekEnd)).sort((a,b)=>b.count-a.count).slice(0,3);
  $('#repMissed').innerHTML='<h3>Missed most</h3>'+(mm.length ? mm.map(m=>`<div class="mm-row"><span>${esc(m.label)}</span>${guRodBeads(Math.min(m.count, 8), 'mustard', 24)}<b>${m.count} time${m.count===1?'':'s'}</b></div>`).join('')
    : '<p class="rep-s">Nothing missed this week.</p>');
  // gentle alerts + treats waiting to be handed over
  const al=PBrain.stuckAlerts(data).sort((a,b)=>b.severity-a.severity).slice(0,2);
  const w=(Fun.data.wallet||{}), open=(w.tickets||[]).filter(x=>!x.given);
  let ah=al.map(a=>`<div class="rep-alert" data-kind="${a.kind}"><span class="ra-ic">${TOY.bead('mustard', 34)}</span><div><b>${esc(a.message)}</b><span>${esc(a.suggestion)}</span></div></div>`).join('');
  if (open.length) ah+=`<button class="rep-alert as-btn" id="repTickets"><span class="ra-ic">${TOY.icon('star', 30, '#C98A16')}</span><div><b>${open.length} treat${open.length===1?'':'s'} to hand over</b><span>${esc(name||'They')} bought ${open.map(t=>esc(t.name)).join(', ')}. Tap to see the tickets.</span></div></button>`;
  if (!ah) ah=`<div class="rep-alert calm"><span class="ra-ic ra-ok">${TOY.icon('check', 22, '#fff', {stroke:3.4})}</span><div><b>Nothing to worry about</b><span>No stuck spots this week. Short, happy practice most days is the whole secret.</span></div></div>`;
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
$('#parentDone').innerHTML=TOY.icon('back', 30, 'currentColor');
$('#parent .gu-nav').addEventListener('click', e=>{ const a=e.target.closest('a'); if (!a) return; e.preventDefault(); const t=$(a.getAttribute('href')); if (t) t.scrollIntoView({behavior:'smooth', block:'start'}); });
async function renderParent(){
  renderReport();
  for (const pp of profiles()) { try{ await Speaker.loadRec(pp.id, true); }catch(e){} }
  const sel=$('#sNode'); sel.innerHTML=''; let og=null; NODES.forEach(n=>{ const lv=levelOf(n); if (!og || og.dataset.lv!=lv){ og=document.createElement('optgroup'); og.label='Level '+lv; og.dataset.lv=lv; sel.appendChild(og); } const o=document.createElement('option'); o.value=n.id; o.textContent=n.title; og.appendChild(o); }); sel.value=progress.current;
  { const nt=$('#sNodeNote'), t=(C.BY_ID[progress.current]||{}).parentNote||''; nt.textContent=t; nt.hidden=!t; }   // what a class would call this skill
  sel.onchange=()=>{ setTimeout(renderChecklist,0); progress.current=sel.value; const ci=curIdx(); NODES.forEach((n,i)=>{ const st=node(n.id); if(i<ci){ if(!st.mastered) st.mastered='parent'; st.lesson=true; } else if (st.mastered==='parent'){ st.mastered=null; } }); saveProgress(); renderParent(); };
  $('#sName').value=settings.name||''; $('#sName').onchange=()=>{ settings.name=$('#sName').value.trim(); saveSettings(); renderChecklist(); };
  renderChecklist(); renderChildren();
  const tb=$('#nodeTable tbody'); tb.innerHTML='';
  NODES.forEach((n,i)=>{ if (i===0 || levelOf(NODES[i-1])!==levelOf(n)){ const lr=document.createElement('tr'); lr.className='lvl-row'; lr.innerHTML=`<th colspan="5">Level ${levelOf(n)}</th>`; tb.appendChild(lr); } const st=node(n.id); const h=st.hist.slice(-20); const acc=h.length?Math.round(100*h.filter(x=>x.ok).length/h.length):null; const dn=new Set(h.map(x=>x.day)).size;
    const tr=document.createElement('tr'); const status = st.mastered==='auto'?'<span class="pill good">learned</span>':st.mastered==='parent'?'<span class="pill good">learned (set by you)</span>':st.mastered==='placed'?'<span class="pill good">learned (level check)</span>':i===curIdx()?'<span class="pill">current</span>':'<span class="pill">locked</span>';
    tr.innerHTML=`<td>${esc(n.title)}</td><td>${st.lesson?`<span class="gu-tick" aria-label="done">${TOY.icon('check', 20, 'currentColor', {stroke:3.2})}</span>`:'—'}</td><td>${acc===null?'—':`<span class="mini" aria-hidden="true"><i style="width:${acc}%"></i></span>${acc}% (${h.length})`}</td><td>${dn||'—'}</td><td>${status} <button class="gu-link" data-toggle="${n.id}" aria-label="${st.mastered?'Un-learn':'Mark learned'}: ${esc(n.title)}">${st.mastered?'un-learn':'mark learned'}</button></td>`;
    tb.appendChild(tr); });
  tb.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{ const st=node(b.dataset.toggle); st.mastered = st.mastered?null:'parent'; if(st.mastered) st.lesson=true; saveProgress(); renderParent(); });
  Treats.renderParent(); Treats.bindParent();
  bindSwitch('#sBixTalks','bixTalks', ()=>{ if(!settings.bixTalks){ Fun.BixVoice.stop(); if (CL()) CL().stop(); } });
  bindSwitch('#sBixiMistakes','bixiMistakes');
  $('#sBixiSilly').value = settings.bixiSilly || 'normal';
  $('#sBixiSilly').onchange = ()=>{ settings.bixiSilly = $('#sBixiSilly').value; saveSettings(); };
  $('#sBixVoice').innerHTML=Object.entries(Fun.BixVoice.voices).map(([k,v])=>`<option value="${k}">${v}</option>`).join('');
  $('#sBixVoice').value=Fun.BixVoice.tag();
  $('#sBixVoice').onchange=async()=>{ settings.bixVoice=$('#sBixVoice').value; saveSettings(); keepVoiceOffline(); Fun.BixVoice.stop(); Speaker.unlock(); await Fun.BixVoice.load(); Fun.BixVoice.play('intro_hi'); };
  $('#sBixTest').onclick=async()=>{ Speaker.unlock(); await Fun.BixVoice.load(); Fun.BixVoice.play(['intro_hi','tap_3','tap_4','sum_amazing'][Math.floor(Math.random()*4)]); };
  $('#levelAgain').onclick=()=>{ Recorder.stop(); Setup.open('check'); };
  bindRange('#sCount','count'); bindRange('#sOperands','operands',x=>x===0?'auto':x); bindSwitch('#sSfx','sfx'); bindSwitch('#sSpeakFb','speakFeedback');
  const s=x=>x+' s'; bindSwitch('#sSayPlus','sayPlus');
  // The four speed settings are the ones the speed panel on the Listen / Flash screens edits (SPEED): same steps, same units.
  bindRange('#sGap','termGap',SPEED.termGap.fmt); bindRange('#sRate','voiceRate',SPEED.voiceRate.fmt); bindRange('#sFlash','flashSec',SPEED.flashSec.fmt); bindRange('#sFlashGap','flashGap',SPEED.flashGap.fmt);
  bindRange('#sPause','answerPause',s); bindRange('#sFlashN','flashN');
  fillVoiceSelect(); $('#sVoice').onchange=async()=>{ settings.voice=$('#sVoice').value; saveSettings(); Speaker.activePid=null; await Speaker.prepare(); fillVoiceSelect(); $('#diagLog').textContent=Diag.lines.join('\n'); renderChecklist(); };
  $('#sVoiceTest').onclick=async()=>{ Speaker.unlock(); Speaker.stop(); await Speaker.prepare(); Speaker.pickReader(); if (Speaker.activePid) Diag.add('test: '+profileName(Speaker.activePid)+' reading'); const seq=[[7,true],[3,false],[-4,false],[12,false]];
    if (Speaker.canSchedule()){ const t0=Speaker.ctx.currentTime+0.1; seq.forEach(([d,f],i)=>Speaker.scheduleTerm(d,f,t0+i*1.3)); } else { for (const [d,f] of seq){ await Speaker.sayDevice(termText(d,f)); await sleep(300); } } };
  // recorder: who, add, rename, delete, record
  await renderProfiles();
  $('#recWho').onchange=async()=>{ await Recorder.select($('#recWho').value); $('#recName').value=profileName(Recorder.pid); };
  $('#recName').onchange=()=>{ const p=profiles().find(x=>x.id===Recorder.pid); if(!p) return; p.name=$('#recName').value.trim()||p.name; saveSettings(); renderProfiles(); fillVoiceSelect(); };
  $('#recAdd').onclick=async()=>{ const name=$('#recNew').value.trim(); if(!name){ $('#recNew').focus(); return; } const id=newProfileId(); profiles().push({id, name}); saveSettings(); $('#recNew').value=''; Recorder.pid=id; await renderProfiles(); fillVoiceSelect(); $('#recStatus').textContent=`Added ${name}. Tap "Start recording" and record the ${RECORD_WORDS.length} words.`; };
  $('#recDelete').onclick=async()=>{ const pid=Recorder.pid; if(!pid) return; if(!await TOY.confirm(`Delete ${profileName(pid)}?`, `This deletes ${profileName(pid)} and all of their recordings from this device.`, {ok:'Delete', cancel:'Keep', danger:true})) return; await ClipStore.deleteProfile(pid); settings.profiles=profiles().filter(p=>p.id!==pid); if (settings.voice==='rec:'+pid || (settings.voice==='rec:turns' && profiles().filter(p=>Speaker.isComplete(p.id)).length<2)) settings.voice=profiles()[0]?'rec:'+profiles()[0].id:'device'; delete Speaker.recs[pid]; delete Speaker.recLoaded[pid]; saveSettings(); Recorder.pid=null; await renderProfiles(); fillVoiceSelect(); };
  $('#recStart').onclick=async()=>{ Speaker.unlock(); if (await Recorder.start()) $('#recStatus').textContent+=' — microphone ready'; };
  const rb=$('#recBtn'); rb.onpointerdown=e=>{ e.preventDefault(); if(!Recorder.stream){ $('#recStatus').textContent='Tap "Start recording" first.'; return; } Recorder.begin(); };
  rb.onpointerup=rb.onpointerleave=rb.onpointercancel=()=>Recorder.end();
  $('#recPrev').onclick=()=>Recorder.prev(); $('#recNext').onclick=()=>Recorder.next(); $('#recPlay').onclick=()=>Recorder.play();
  // backup
  $('#bkMake').onclick=async()=>{ const b=$('#bkMake'); b.disabled=true; b.textContent='Preparing…'; try{ const f=await Backup.build(); $('#bkSave').style.display=''; $('#bkInfo').textContent=`Ready: ${f.name} (${(f.size/1048576).toFixed(1)} MB, ${profiles().length} voice${profiles().length===1?'':'s'}, progress and settings). Tap "Save file", then choose "Save to Files".`; }catch(e){ $('#bkInfo').textContent='Could not prepare backup: '+(e&&e.message||e); } b.disabled=false; b.textContent='1. Prepare backup'; };
  $('#bkSave').onclick=async()=>{ const r=await Backup.save(); if (r==='shared'||r==='downloaded'){ settings.lastBackup=new Date().toISOString(); saveSettings(); renderChecklist(); } $('#bkInfo').textContent = r==='shared'?'Saved. Keep the file somewhere safe (Files → iCloud Drive is best).': r==='downloaded'?'Downloaded. Check your Downloads folder.' : r==='cancelled'?'Cancelled.':'Prepare the backup first.'; };
  $('#bkOpen').onclick=()=>$('#bkFile').click();
  $('#bkFile').onchange=async()=>{ const f=$('#bkFile').files[0]; $('#bkFile').value=''; if(!f) return;
    let text, info; try{ text=await f.text(); info=Backup.check(text); }catch(e){ $('#bkInfo').textContent='This is not a Bix Abacus backup file. Nothing was changed.'; return; }
    const what=await Backup.ask(info); if (!what){ $('#bkInfo').textContent='Nothing was restored.'; return; }
    const withProgress = what==='all';
    try{ const r=await Backup.restore(text, withProgress) || {voices:info.voices, clips:0}; for (const pp of profiles()) await Speaker.loadRec(pp.id, true); Recorder.pid=null; await renderParent(); renderHome();
      $('#bkInfo').textContent=`Restored ${r.voices} voice${r.voices===1?'':'s'} (${r.clips} recordings)`+(withProgress?', progress and settings.':'.'); }
    catch(e){ Diag.add('restore failed: '+(e&&e.message||e)); $('#bkInfo').textContent='Could not restore this backup. Nothing else was changed.'; } };
  $('#diagLog').textContent=Diag.lines.join('\n');
  $('#diagState').textContent=`voice=${settings.voice} kind=${Speaker.kind()} | AudioContext: ${Speaker.ctx?Speaker.ctx.state:'none'} | device voices: ${('speechSynthesis' in window)?speechSynthesis.getVoices().length:'n/a'} | chosen: ${Speaker.deviceVoice()?Speaker.deviceVoice().name:'none'} | clips: ${Speaker.canSchedule()?'ready':'not loaded'} | ${navigator.userAgent.slice(0,60)}`;
  $('#soundTest').onclick=async()=>{ Speaker.unlock(); Sfx.star(); await sleep(450); await Fun.BixVoice.load(); Fun.BixVoice.play('intro_hi'); Diag.add('sound test ctx='+(Speaker.ctx?Speaker.ctx.state:'none')); };
  $('#guVer').textContent='Bix Abacus v'+appVersion(); if (!$('#guSign').firstChild) $('#guSign').innerHTML=TOY.bix('happy', 54, {still:true});
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
$$('#parent .gu-ic[data-ic]').forEach(el=>{ el.innerHTML=TOY.icon(el.dataset.ic, 22, 'currentColor', {stroke:2.8}); });
// The version lives only here in grown-ups (the child's home shows none): read from app.js's own ?v= cache tag.
function appVersion(){ const sc=document.querySelector('script[src*="app.js"]'); const m=sc && /[?&]v=([\w.]+)/.exec(sc.getAttribute('src')); return m ? m[1] : ''; }
// Sound diagnostics are for support only: five quick taps on the version line show them.
(()=>{ let taps=[]; $('#guVer').addEventListener('click', ()=>{ const now=Date.now(); taps=taps.filter(t=>now-t<1500).concat(now);
  if (taps.length>=5){ taps=[]; const d=$('#guDiag'); d.hidden=!d.hidden; if (!d.hidden){ $('#diagLog').textContent=Diag.lines.join('\n'); d.scrollIntoView({behavior:'smooth', block:'center'}); } } }); })();
/* ---------------- children on this device ---------------- */
function childLabel(c){ return c.name || 'New child'; }
function renderChildren(){
  const box=$('#kidsList'); if(!box) return; const act=Store.activeId();
  box.innerHTML=Store.children().map((c,i)=>`<div class="kidrow"><span class="gu-kbead toy-lac--${KID_LAC[i%KID_LAC.length]}" data-i="${esc(childLabel(c).trim().charAt(0).toUpperCase())}" aria-hidden="true"></span><span class="kidname">${esc(childLabel(c))}${c.id===act?' <em>(practising now)</em>':''}</span>${c.id===act?'':`<button class="btn small" data-kidgo="${c.id}">Switch to</button>`}<button class="btn small ghost" data-kidrm="${c.id}">Remove</button></div>`).join('');
  box.querySelectorAll('[data-kidgo]').forEach(b=>b.onclick=()=>{ Store.switchTo(b.dataset.kidgo); location.reload(); });
  box.querySelectorAll('[data-kidrm]').forEach(b=>b.onclick=async()=>{ const c=Store.children().find(x=>x.id===b.dataset.kidrm); if(!await TOY.confirm(`Remove ${childLabel(c)} from this device?`, 'This erases their progress, stickers, beads, garden and treats. Recorded voices are kept.', {ok:'Remove', cancel:'Keep', danger:true})) return; Store.removeChild(c.id); location.reload(); });
}
$('#kidAdd').addEventListener('click', ()=>{ const id=Store.addChild(); Store.switchTo(id); location.reload(); });
// "Who's practising?" when more than one child uses this device. Each child is a wooden block with a bead in their own lacquer colour.
function showWho(){
  $('#whoList').innerHTML=Store.children().map((c,i)=>`<button type="button" class="who-card tw-card" data-who="${c.id}"><span class="tw-bead">${TOY.bead(KID_COLORS[i%KID_COLORS.length], 128, {tall:true})}</span><span class="tw-name">${esc(childLabel(c))}</span></button>`).join('');
  $$('#whoList [data-who]').forEach(b=>b.onclick=()=>{ Speaker.unlock(); Sfx.tap(); if(b.dataset.who===Store.activeId()){ sessionStorage.setItem('abacus.who','1'); show('home'); renderHome(); } else { sessionStorage.setItem('abacus.who','1'); Store.switchTo(b.dataset.who); location.reload(); } });
  if (!$('#whoSky').innerHTML){ $('#whoSky').innerHTML=TOY.skyMoon('calm', 1);   /* nobody is picked yet: a neutral full moon, not somebody's phase */ $('#whoShelf').innerHTML=TOY.prop('rainbow', 150) + TOY.prop('plant', 170); }
  show('who');
  const bw=$('#bixWho'); toyBix(bw, 'wave'); Fun.Mascot.quiet(bw);
  // Juni (the moon) asks; her clip is already recorded (j_onboard_who). Bixi waves quietly beside the mat.
  juniSayOn($('#whoJuni'), $('#whoSky'), 'j_onboard_who', 'Who’s practising today?');
  if (!showWho.bound){ showWho.bound=true; $('#who').addEventListener('click', e=>{ if (!e.target.closest('button') && !showWho.spoke){ showWho.spoke=true; juniSayOn($('#whoJuni'), $('#whoSky'), 'j_onboard_who', 'Who’s practising today?'); } }); }
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
  gamePops: null, gameNumbers: null, gameReads: null,   // tests can shorten a game round (Friend Pop friends, Bead Builder numbers, Bead Detective numbers)
  // A bead game finished. On a skill with no sums (bead numbers) the numbers she made / read are its practice record,
  // so the usual mastery rule (checkMastery) opens the next skill. Returns true when it just did.
  gameResult(id, marks){
    const n=NODES[curIdx()]; if (n.drill || (id!=='build' && id!=='reader') || !marks || !marks.length) return false;
    const st=node(n.id), day=todayKey(); marks.forEach(ok=>st.hist.push({ok:!!ok, day})); st.hist=st.hist.slice(-40);
    const leveled=checkMastery(n.id); saveProgress(); return leveled;
  },
  goDoor(){ renderDoor.skipGreet=true; show('door'); },   // returning from Make/Read is not a fresh door visit -- don't replay Juni's greeting
  openGate,   // first-run onboarding gates its setup behind the grown-up challenge
};
// A voice that is not in the default offline install (Boy) is saved for offline use when it is the chosen one:
// asked of the service worker when a grown-up picks it and at every start (so a new app version keeps it).
function keepVoiceOffline(){
  const tag=settings.bixVoice; if (!tag || tag==='sweet' || tag==='gigi' || !('serviceWorker' in navigator)) return;   // sweet + gigi are precached in sw.js FILES
  navigator.serviceWorker.ready.then(reg=>{ if (reg.active) reg.active.postMessage({type:'cache-voice', tag}); }).catch(()=>{});
}
/* ---------------- boot ---------------- */
window.__diag = Diag;
// Test hook: put a given problem on the practice screen (layout checks for long rows, 4-digit numbers, multiplication on beads).
window.__drillSet = (terms, op, tool)=>{ const p={terms, answer: op==='mul' ? terms[0]*terms[1] : terms.reduce((a,b)=>a+b,0)}; if (op) p.op=op;
  problems[idx]=p; Tool.setRods=Math.max(3, ...problems.map(q=>Tool.rodsFor(q))); if (tool) Tool.kind=tool; presentProblem(); };
window.__drillSay = text=>PB.say(text, 'happy', null, 0);
// Test hooks for lessons: where the lesson is, and "she moved the beads to v".
window.__lesson = ()=>L ? { phase:L.phase, target:L.target, demoIdx:L.demoIdx, guidedIdx:L.guidedIdx, busy:!!L.busy, value: lessonAb ? lessonAb.value : null, did:L.did||0, skipped:L.skipped||0 } : null;
window.__lessonSet = v=>{ if (lessonAb) lessonAb.poke(v); };
// Test hook: finish the current lesson as a true (learned) completion and run the real end path (advanceLesson -> leaveLesson).
window.__lessonFinish = ()=>{ if (!L) return null; node(L.node.id).lesson=true; saveProgress(); L.phase='done'; advanceLesson(); return true; };
window.__prog = (id)=>({ current: progress.current, node: id ? (progress.nodes[id]||null) : undefined });   // test hook: current skill + a node's saved flags
window.__markLearned = (id)=>{ node(id).lesson=true; saveProgress(); };   // test hook: mark a skill's welcome-lesson as already seen
window.__unlearn = (id)=>{ node(id).lesson=false; saveProgress(); };        // test hook: reset a skill to first-time (welcome-lesson not yet seen)
window.__drill = ()=>({ idx, reviewing, mode, levelTest: !!LT, tool: Tool.kind, terms: problems[idx]&&problems[idx].terms, op: problems[idx]&&problems[idx].op, answer: problems[idx]&&problems[idx].answer, tries: (problems[idx]||{})._tries||0, showMe: $('#showMeBtn')&&$('#showMeBtn').style.display!=='none', len: problems.length, strip: problems.map((p,i)=>[i===idx?'cur':'', results[i]===true||p._fixed?'ok':results[i]===false?'bad':'', p._fixed?'fixed':''].filter(Boolean).join(' ')) });
window.__drillAnswer = async(v)=>{ setEntry(String(v)); await submit(); };   // test hook: submit an answer through the real drill path
// Test hook: Bixi's snack bar — live state plus the goal and streak, for the energy-bar suite.
window.__energy = ()=>{ const el=document.querySelector('#drillEnergy'), s=feedState(); return { n:s.n, full:!!s.full, goal:FEED_GOAL, streak:feedStreak, width: el?el.querySelector('.tp-en-fill').style.width:null, vis: el?getComputedStyle(el).visibility:null }; };
window.__setFeedDay = d=>{ feedState(); Fun.data.feed.day=d; Fun.save(); };   // test hook: age the snack bar to another day
const APP_VERSION='4.94';
{ const _v=document.getElementById('ver'); if (_v) _v.textContent='v'+APP_VERSION; }   // show the real version on Home so updates are visible at a glance
// Bixi's reserved speech card (home/play/room): give each his face once; his lines render here instead of a bubble that floats over Juni.
['bixHomeCard','bixPlayCard','bixRoomCard'].forEach(id=>{ const c=document.getElementById(id), f=c&&c.querySelector('.bix-card-face'); if (f && !f.firstChild){ try{ f.innerHTML=bixArt('happy',34); }catch(e){} } });
Setup.bind();
if (firstRun){ show('setup'); Setup.open(); }
else if (Store.children().length>1 && !sessionStorage.getItem('abacus.who')) showWho();
else { show('home'); renderHome(); }
setTimeout(()=>{ if (settings.bixTalks!==false) Fun.BixVoice.load(); }, 1500);
ClipStore.migrate().catch(e=>Diag.add('migrate failed '+(e&&e.message||e))).then(()=>{ saveSettings(); Speaker.init(); });
// iPad Safari only allows sound to start on a finger lift / click, so try on every tap until it's on.
['pointerdown','pointerup','touchend','click'].forEach(ev=>document.addEventListener(ev, ()=>{ if (!Speaker.ctx || Speaker.ctx.state!=='running' || (!Speaker.ttsReady && (Speaker.tries=(Speaker.tries||0)+1)<=4)){ Speaker.unlock(); Speaker.revive(); } }, true));
// Coming back from the background (minimise/reopen, tab switch, phone call, Control Center) can leave the audio context
// suspended or 'interrupted' so faces move but no sound comes out. Revive it the moment the app is shown again.
document.addEventListener('visibilitychange', ()=>{
  // A hidden tab is not solving time: hold the silent set clock so a gap between sittings never counts.
  if (document.hidden){
    SetClock.pause();
    Speaker.armResume();                 // arm the next-tap self-heal while we're away (iOS kills audio in the background)
  } else {
    SetClock.resume();
    Speaker.revive();                    // try to bring audio back right away (works when iOS allows a non-gesture resume)
    Speaker.armResume();                 // and guarantee it comes back on the child's first tap if the non-gesture revive failed
  }
});
// focus / pageshow fire on some returns where visibilitychange does not; revive now and arm the gesture fallback too.
window.addEventListener('pageshow', ()=>{ Speaker.revive(); Speaker.armResume(); });
window.addEventListener('focus', ()=>{ Speaker.revive(); Speaker.armResume(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Auto-update: when a NEW service worker takes control (sw.js does skipWaiting + clients.claim on deploy),
  // reload once so the device runs the new build instead of stale cached files. Only wire this when a worker
  // already controls the page — i.e. this is an update, not the first-ever install — so first load never reloads.
  let swReloading=false;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if (swReloading) return; swReloading=true; location.reload(); });
  }
  navigator.serviceWorker.register('sw.js').then(reg=>{
    keepVoiceOffline(reg);
    try{ reg.update(); }catch(e){}
    setInterval(()=>{ try{ reg.update(); }catch(e){} }, 30*60*1000);   // check for a new build every 30 min while open
  }).catch(()=>{});
}
})();
