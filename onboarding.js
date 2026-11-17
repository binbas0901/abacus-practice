// First-time setup for a new child on a new device, led by Juni the teacher (the moon). Juni welcomes the child,
// asks their name, introduces Bixi the classmate (the bead), then a grown-up helps pick the starting point.
// Only when it runs in a browser tab, a reminder to add it to the Home Screen.
//
// Juni and Bixi both speak through the two-speaker Classroom system (classroom.js): each beat shows the right
// speaker's bubble (with the who chip + talking mouth) and plays the recorded clip, staying silent if a clip
// is missing. The recorded lines are keyed in audio/lines-manifest.js (window.LINES_MANIFEST).
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const App = () => root.App;
  const CL = () => root.Classroom;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Skills the level check walks through, in teaching order (beads and mental abacus are not checked).
  const CHECK = ['add_direct', 'sub_direct', 'sf_add', 'sf_sub', 'bf_add_a', 'bf_add_b', 'bf_sub_a', 'bf_sub_b', 'combined', 'two_digit'];
  const PER = 3;
  let token = 0, state = { name: '', keepName: false };

  /* ---------------- staging ---------------- */
  const setup = () => $('#setup');
  function step(id) { $$('#setup .su-step').forEach(s => s.classList.toggle('on', s.id === id)); setup().dataset.step = id; setup().classList.toggle('toy-scene--calm', id === 'suCheck' || id === 'suPick'); }
  function juniFig() { return $('#juniSetup'); }
  function bixiFig() { return $('#bixSetup'); }
  function juniBub() { return $('#juniBubble'); }
  function bixiBub() { return $('#bixiSetupBubble'); }

  // Say a Juni line: hide Bixi's bubble, show Juni's (her name chip + talking mouth on the moon), play the clip.
  // opts.text overrides the on-screen words (e.g. to keep the child's name) while the generic clip still plays.
  function juniSay(key, opts = {}) {
    bixiBub().classList.remove('on'); juniFig()._last = key;
    if (!CL()) return Promise.resolve();
    return CL().say(key, Object.assign({ who: 'juni', figure: juniFig(), bubble: juniBub() }, opts));
  }
  function bixiSay(key, opts = {}) {
    juniBub().classList.remove('on'); bixiFig()._last = key;
    if (!CL()) return Promise.resolve();
    return CL().say(key, Object.assign({ who: 'bixi', figure: bixiFig(), bubble: bixiBub() }, opts));
  }
  function bixiRest(mood) { if (root.Fun && root.Fun.Mascot) root.Fun.Mascot.rest(bixiFig(), mood, { keep: false, bubble: false }); }
  // Show Juni's bubble with ad-hoc UI words and no clip (nothing recorded says exactly this), so the audio never
  // mismatches the text. Juni's name chip still marks it as hers.
  function juniShow(text, ms) { bixiBub().classList.remove('on'); if (CL()) CL().showBubble(juniBub(), text, 'juni', ms || 0); }

  function stage() {
    if (!$('#setupShelf').innerHTML) $('#setupShelf').innerHTML = root.TOY.prop('rainbow', 150) + root.TOY.prop('plant', 170);
    // Juni is the large central lead here (not the small window moon), so the window slot stays empty.
    $('#setupSky').innerHTML = '';
    juniFig().innerHTML = root.TOY.moon('calm', 260, { phase: 1 });
    wireTaps();
  }
  // Tapping Juni or Bixi replays their last line (children who cannot read yet hear it again).
  function wireTaps() {
    const j = juniFig(); if (j && !j._tap) { j._tap = true; j.addEventListener('click', () => { App().unlock(); if (j._last && CL()) CL().Voice.play('juni', j._last, j); }); }
    const b = bixiFig(); if (b && !b._tap) { b._tap = true; b.addEventListener('click', () => { App().unlock(); if (b._last && CL()) CL().Voice.play('bixi', b._last, b); }); }
  }
  function focusName() { setTimeout(() => root.Typing.focus($('#suNameIn')), 60); }
  const onStep = id => setup().dataset.step === id;

  /* ---------------- open ---------------- */
  function open(from) {
    const my = ++token; App().show('setup');
    stage();
    juniBub().classList.remove('on'); bixiBub().classList.remove('on');
    setup().classList.remove('cl-bixi-here', 'cl-bixi-side');
    // Re-entry from the Grown-ups page (re-run level check / grown-up chooses): keep the name, skip the whole intro.
    if (from === 'level' || from === 'check') {
      state.name = App().settings.name || ''; state.keepName = true;
      setup().classList.add('cl-bixi-here', 'cl-bixi-side'); bixiRest('happy');
      if (from === 'check') check(); else toLevel();
      return;
    }
    state = { name: '', keepName: false, introDone: false };
    $('#suNameIn').value = ''; step('suName');
    // Show Juni's first words straight away (silent until the first tap: iPad only allows sound after a touch).
    juniSay('j_intro_hello');
    const begin = () => { if (my !== token || state.introDone) return; state.introDone = true; intro(my); };
    setup().addEventListener('click', () => { App().unlock(); setTimeout(begin, 60); }, { once: true });
  }
  // Juni's spoken welcome, then she asks the name. Audio begins on the first tap (the clips play in order).
  async function intro(my) {
    if (!onStep('suName')) return;   // the first tap landed on a control that already moved us on
    await juniSay('j_intro_hello'); if (my !== token || !onStep('suName')) return;
    await juniSay('j_intro_welcome'); if (my !== token || !onStep('suName')) return;
    await sleep(150);
    await juniSay('j_intro_name'); if (my !== token || !onStep('suName')) return;
    focusName();
  }

  function nameGo() {
    const n = $('#suNameIn').value.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!n) { juniShow('Type your name first!', 2600); root.Typing.focus($('#suNameIn')); return; }
    $('#suNameIn').blur();
    state.name = n; App().Sfx.ok();
    meetAndBixi(token, n);
  }
  // Juni greets the named child, then introduces Bixi, who rolls in. Then on to the grown-up setup.
  async function meetAndBixi(my, n) {
    step('suMeet');
    await juniSay('j_intro_meet', { text: `Lovely to meet you, ${n}!` }); if (my !== token) return;
    await sleep(150);
    await juniSay('j_intro_bixi1'); if (my !== token) return;
    // Bixi rolls in from the side (classroom roll move; silent under reduced motion, he just appears).
    setup().classList.add('cl-bixi-here'); bixiRest('happy');
    await sleep(120);
    if (CL()) await CL().move(bixiFig(), 'rollback'); if (my !== token) return;
    await bixiSay('b_intro_hi'); if (my !== token) return;
    await juniSay('j_intro_bixi2'); if (my !== token) return;
    await juniSay('j_intro_help'); if (my !== token) return;
    await bixiSay('b_intro_help'); if (my !== token) return;
    // Bixi settles to the side as the smaller sidekick; Juni stays the lead.
    setup().classList.add('cl-bixi-side');
    await sleep(200); if (my !== token) return;
    toAbacus();
  }

  /* ---------- is there a real abacus at home? (decides the default answer tool in practice) ---------- */
  async function toAbacus() {
    const my = token;
    $('#suAbacusH').textContent = `${state.name}’s abacus`;
    step('suAbacus');
    await juniSay('j_intro_grownup'); if (my !== token || !onStep('suAbacus')) return;
    await sleep(120);
    juniSay('j_onboard_abacus');
  }
  function abacusAnswer(v) {
    App().settings.hasAbacus = v === 'yes' ? true : v === 'no' ? false : null; App().saveSettings();
    App().Sfx.tap(); toLevel();
  }
  function toLevel() { step('suLevel'); juniShow(`Where should we start${state.name ? ', ' + state.name : ''}?`); }

  /* ---------- grown-up picks the skill ---------- */
  function toPick() {
    const box = $('#suPickList'); box.innerHTML = '';
    const T = root.TOY, fam = n => n.kind === 'flash' ? 'teal' : n.family === 10 ? 'red' : n.family === 5 ? 'mustard' : 'indigo';
    App().nodes().forEach((n, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'su-skill to-skill'; b.dataset.id = n.id;
      b.innerHTML = `<span class="to-skill-bead c-${fam(n)}">${T.bead(fam(n), 72)}<i>${i + 1}</i></span><span class="to-skill-t"><b>${n.title}</b><small>${example(n)}</small></span>`;
      b.onclick = () => finish(n.id, 'parent', `We'll start with ${n.title}.`);
      box.appendChild(b);
    });
    step('suPick'); juniSay('j_intro_pick');
  }
  function example(n) {
    if (n.kind === 'numbers') return 'Showing numbers on the abacus';
    if (n.kind === 'flash') return 'Numbers flash; answer in your head';
    if (!n.demos || !n.demos.length) return '';
    const D = n.demos, sign = d => `${d < 0 ? '−' : '+'} ${Math.abs(d)}`;
    // Multiplication nodes keep their demos as [a, b] pairs: a × b.
    if (n.drill && n.drill.op === 'mul') return D.slice(0, 2).map(([a, b]) => `${a} × ${b}`).join(',  ');
    // Row nodes chain their demos (each start is the last total): show them as one row, "9 + 7 − 8 + 6 …".
    const chained = D.length >= 3 && D.every(([t, d], i) => i === 0 || t === D[i - 1][0] + D[i - 1][1]);
    if (chained) return `${D[0][0]} ${D.map(([, d]) => sign(d)).join(' ')}${(n.drill && n.drill.operands > D.length + 1) ? ' …' : ''}`;
    return D.slice(0, 2).map(([t, d]) => `${t} ${sign(d)}`).join(',  ');
  }

  /* ---------- level check ---------- */
  async function check() {
    const my = ++token; const E = root.SorobanEngine, C = root.Curriculum;
    step('suCheck'); juniSay('j_intro_abacususe');
    const pad = makePad($('#suPad'), $('#suAns'));
    // "Stop here": the check ends now and practice starts at this level (it does not wait for the next answer).
    let stopAt = false, hinted = false; const mastered = [];
    $('#suStop').onclick = () => { if (my !== token) return; App().Sfx.tap(); stopAt = true; pad.cancel(); };
    for (let li = 0; li < CHECK.length; li++) {
      const n = C.BY_ID[CHECK[li]];
      $('#suLevelName').textContent = n.title;
      $('#suDots').innerHTML = CHECK.map((id, k) => `<i class="${k < li ? 'ok' : k === li ? 'cur' : ''}">${root.TOY.bead(k < li ? 'teal' : 'mustard', k === li ? 46 : 34, { dim: k > li })}</i>`).join('');
      const cfg = Object.assign({}, n.drill, { operands: 3 });
      let probs; try { probs = E.generateSet2(cfg, PER); } catch (e) { probs = []; }
      let right = 0;
      for (let k = 0; k < probs.length; k++) {
        if (my !== token) return;
        if (stopAt) break;
        const p = probs[k];
        $('#suProb').innerHTML = p.terms.map((t, i) => `<span class="term to-term${t < 0 ? ' neg' : ''}">${i === 0 ? '' : `<i>${t < 0 ? '−' : '+'}</i>`}<b>${Math.abs(t)}</b></span>`).join('');
        $('#suFb').textContent = ''; $('#suFb').className = 'to-fb';
        const a = await pad.ask(); if (my !== token) return;
        if (stopAt) break;
        if (a === p.answer) { right++; $('#suFb').innerHTML = root.TOY.bead('teal', 58); $('#suFb').className = 'to-fb ok to-pop'; App().Sfx.ok(); }
        else { $('#suFb').textContent = 'Next one!'; $('#suFb').className = 'to-fb'; App().Sfx.tap();
          if (!hinted) { hinted = true; juniShow('Too tricky? Tap “Stop here” and we’ll start with this one.'); } }
        await sleep(600);
      }
      if (my !== token) return;
      if (stopAt || right < PER) {
        const start = li === 0 ? 'beads' : CHECK[li];
        if (li === 0) return finish('beads', 'check', "Let's start with the beads!", []);
        return finish(start, 'check', `You're ready for ${n.title}!`, ['beads', ...mastered]);
      }
      mastered.push(CHECK[li]);
      if (li < CHECK.length - 1) { juniShow(['Wow!', 'You know this!', 'Super!', 'Next level!'][li % 4], 1500); }
    }
    finish('anzan', 'check', 'Amazing! You are ready for mental abacus!', ['beads', ...mastered]);
  }
  // The kit's one keypad (TOY.keypad, calculator order: 7-8-9 / 4-5-6 / 1-2-3, then delete and a wide 0). The round teal Check button sits beside the mat.
  function makePad(el, ansEl) {
    const go = $('#suGo');
    let val = '', waiting = null; const set = v => { val = v; ansEl.textContent = v || ' '; go.disabled = !v; };
    el.innerHTML = '';
    root.TOY.keypad(el, { label: 'Number keys',
      onKey(d) { if (!waiting) return; App().Sfx.tap(); if (val.length < 4) set(val + d); },
      onBackspace() { if (!waiting) return; App().Sfx.tap(); set(val.slice(0, -1)); } });
    go.onclick = () => { if (!waiting || val === '') return; App().Sfx.tap(); const w = waiting; waiting = null; go.disabled = true; w(parseInt(val, 10)); };
    return { ask() { set(''); return new Promise(r => { waiting = r; }); },
      cancel() { if (!waiting) return; const w = waiting; waiting = null; go.disabled = true; w(null); } };
  }

  /* ---------- finish ---------- */
  // Home Screen advice only makes sense in a plain browser tab: not when opened from the Home Screen icon, and never inside the App Store app.
  function inBrowserTab() {
    const nav = window.navigator || {}, mm = q => !!(window.matchMedia && window.matchMedia(q).matches);
    if (nav.standalone === true || mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)') || mm('(display-mode: minimal-ui)')) return false;
    if (window.Capacitor || window.cordova || window.__TAURI__ || window.ReactNativeWebView) return false;
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.bix) return false;
    return true;
  }
  async function finish(current, how, headline, masteredIds) {
    const my = ++token;
    App().applySetup({ name: state.name, current, how, mastered: masteredIds });
    $('#suDoneH').textContent = headline;
    $('#suDoneP').textContent = `${state.name}, your first stop is ${App().nodeTitle(current)}. Tap Start each day for a short practice.`;
    $('#suInstall').style.display = inBrowserTab() ? '' : 'none';
    step('suDone'); root.Fun.confetti(70); App().Sfx.star();
    // Juni calls it done, Bixi cheers; then the child taps Start to go in.
    await juniSay('j_intro_begin'); if (my !== token) return;
    bixiSay('b_intro_go');
  }

  function bind() {
    $('#suNameGo').onclick = nameGo;
    $('#suNameIn').addEventListener('keydown', e => { if (e.key === 'Enter') nameGo(); });
    $$('#suLevel [data-lv]').forEach(b => b.onclick = () => {
      App().unlock(); const lv = b.dataset.lv;
      if (lv === 'new') finish('beads', 'new', 'Welcome to the abacus!', []);
      else if (lv === 'check') check();
      else toPick();
    });
    $('#suPickBack').onclick = toLevel;
    $$('#suAbacus [data-abacus]').forEach(b => b.onclick = () => { App().unlock(); abacusAnswer(b.dataset.abacus); });
    // Kit drawings for the choices (no emoji).
    const T = root.TOY, WALNUT = '#7A4A24';
    const art = { yes: T.icon('practice', 84, WALNUT), no: `<span class="to-cross">${T.icon('practice', 84, '#C4A988', { accent: '#E2CDAE' })}${T.icon('close', 50, '#2B3674')}</span>`, unsure: `<span class="to-q">?</span>`,
      new: T.bead('red', 96, { tall: true }), check: T.icon('practice', 84, WALNUT), pick: T.icon('lock', 76, WALNUT) };
    $$('#setup .su-art').forEach(el => { el.innerHTML = art[el.dataset.art] || ''; });
    $$('#setup .su-ic-next').forEach(el => { el.innerHTML = T.icon('play', 34, '#fff'); });
    $('#suPickBack').innerHTML = T.icon('back', 30, 'currentColor');
    $('#suShareIc').innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2B3674" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3.5M7.5 7.5 12 3l4.5 4.5M6 11v8.5h12V11"/></svg>`;
    $('#suGoIc').innerHTML = T.icon('check', 64, '#fff', { stroke: 3.4 });
    $('#suStart').onclick = () => App().goHome();
  }
  root.Setup = { open, bind, inBrowserTab };
})(typeof globalThis !== 'undefined' ? globalThis : this);
