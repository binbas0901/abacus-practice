// First-time setup for a new child on a new device: name, whether there is an abacus at home, where to start
// (new / level check / grown-up picks). Only when it runs in a browser tab, a reminder to add it to the Home Screen.
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const App = () => root.App;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // Skills the level check walks through, in teaching order (beads and mental abacus are not checked).
  const CHECK = ['add_direct', 'sub_direct', 'sf_add', 'sf_sub', 'bf_add_a', 'bf_add_b', 'bf_sub_a', 'bf_sub_b', 'combined', 'two_digit'];
  const PER = 3;
  let token = 0, state = { name: '', keepName: false };

  function step(id) { $$('#setup .su-step').forEach(s => s.classList.toggle('on', s.id === id)); }
  function bix() { return $('#bixSetup'); }
  function say(t, ms = 0, vid, replay) { root.Fun.Mascot.say(bix(), t, ms, vid, replay); }

  function open(from) {
    const my = ++token; App().show('setup');
    if (!bix().querySelector('.bix')) root.Fun.Mascot.mount(bix(), { size: 104 });
    if (from === 'level' || from === 'check') { state.name = App().settings.name || ''; state.keepName = true; if (from === 'check') check(); else toLevel(); return; }
    state = { name: '', keepName: false };
    $('#suNameIn').value = ''; step('suName'); say("Hi! I'm Bix! What's your name?");
    // iPads only allow sound after a tap, so Bix introduces himself on the first touch.
    const hello = () => { if (my !== token || state.introDone || !$('#suName').classList.contains('on')) return; state.introDone = true; say("Hi there! I'm Bix! I'm a little bead from an abacus, and I love numbers!", 0, 'intro_hi');
      root.Fun.Mascot.react(bix(), 'happy'); setTimeout(async () => { await root.Fun.BixVoice.load(); }, 0);
      const wait = () => root.Fun.BixVoice.busy() ? setTimeout(wait, 200) : (my === token && $('#suName').classList.contains('on') && say("What's your name? Type it in for me!", 0, 'intro_name'));
      setTimeout(wait, 900); };
    $('#setup').addEventListener('click', () => { App().unlock(); setTimeout(hello, 60); }, { once: true });
    setTimeout(() => { if (my === token) $('#suNameIn').focus(); }, 300);
  }
  function nameGo() {
    const n = $('#suNameIn').value.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!n) { say('Type your name first!', 2500); root.Fun.Mascot.react(bix(), 'oops'); $('#suNameIn').focus(); return; }
    state.name = n; App().Sfx.ok(); root.Fun.Mascot.react(bix(), 'happy'); toAbacus();
  }

  /* ---------- is there a real abacus at home? (decides the default answer tool in practice) ---------- */
  function toAbacus() {
    $('#suAbacusH').textContent = `${state.name}’s abacus`;   // a short label: Bix asks the question out loud
    step('suAbacus'); say('Do you have an abacus at home?', 0, 'ask_abacus');
  }
  function abacusAnswer(v) {
    App().settings.hasAbacus = v === 'yes' ? true : v === 'no' ? false : null; App().saveSettings();
    App().Sfx.tap(); toLevel();
  }
  function toLevel() { step('suLevel'); say(`Nice to meet you, ${state.name}! Where should we start?`, 0, 'intro_meet'); }

  /* ---------- grown-up picks the skill ---------- */
  function toPick() {
    const box = $('#suPickList'); box.innerHTML = '';
    const W = root.WS, fam = n => n.kind === 'flash' ? 'jade' : n.family === 10 ? 'red' : n.family === 5 ? 'ochre' : 'indigo';
    App().nodes().forEach((n, i) => {
      const b = document.createElement('button'); b.className = 'su-skill'; b.dataset.id = n.id;
      b.innerHTML = `<span class="ic su-skill-bead c-${fam(n)}">${W.bead(fam(n), 64)}<i>${i + 1}</i></span><span><b>${n.title}</b><small>${example(n)}</small></span>`;
      b.onclick = () => finish(n.id, 'parent', `We'll start with ${n.title}.`);
      box.appendChild(b);
    });
    step('suPick'); say('Grown-up: pick the skill they are working on now.', 0, 'intro_pick');
  }
  function example(n) {
    if (n.kind === 'numbers') return 'Showing numbers on the abacus';
    if (n.kind === 'flash') return 'Numbers flash; answer in your head';
    if (!n.demos) return '';
    return n.demos.slice(0, 2).map(([t, d]) => `${t} ${d < 0 ? '−' : '+'} ${Math.abs(d)}`).join(',  ');
  }

  /* ---------- level check ---------- */
  async function check() {
    const my = ++token; const E = root.SorobanEngine, C = root.Curriculum;
    step('suCheck'); say('Use your abacus for each one. No rush!', 0, 'intro_check');
    const pad = makePad($('#suPad'), $('#suAns'));
    $('#suStop').onclick = () => { stopAt = true; };
    let stopAt = false; const mastered = [];
    for (let li = 0; li < CHECK.length; li++) {
      const n = C.BY_ID[CHECK[li]];
      $('#suLevelName').textContent = n.title;
      $('#suDots').innerHTML = CHECK.map((id, k) => `<i class="${k < li ? 'ok' : k === li ? 'cur' : ''}">${root.WS.bead(k < li ? 'jade' : k === li ? 'indigo' : 'pale', k === li ? 40 : 30)}</i>`).join('');
      const cfg = Object.assign({}, n.drill, { operands: 3 });
      let probs; try { probs = E.generateSet2(cfg, PER); } catch (e) { probs = []; }
      let right = 0;
      for (let k = 0; k < probs.length; k++) {
        if (my !== token) return;
        const p = probs[k];
        $('#suProb').innerHTML = p.terms.map((t, i) => root.WS.tile(t, i === 0).replace('class="ws-tile', `class="term${t < 0 ? ' neg' : ''} ws-tile`)).join('');
        $('#suFb').textContent = ''; $('#suFb').className = 'feedback';
        const a = await pad.ask(); if (my !== token) return;
        if (stopAt) break;
        if (a === p.answer) { right++; $('#suFb').innerHTML = root.WS.bead('jade', 54); $('#suFb').className = 'feedback ok ws-pop'; App().Sfx.ok(); }
        else { $('#suFb').textContent = 'Next one!'; $('#suFb').className = 'feedback'; App().Sfx.tap(); }
        await sleep(600);
      }
      if (my !== token) return;
      if (stopAt || right < PER) {
        const start = li === 0 ? 'beads' : CHECK[li];
        if (li === 0) return finish('beads', 'check', "Let's start with the beads!", []);
        return finish(start, 'check', `You're ready for ${n.title}!`, ['beads', ...mastered]);
      }
      mastered.push(CHECK[li]);
      if (li < CHECK.length - 1) { root.Fun.Mascot.react(bix(), 'happy'); say(['Wow!', 'You know this!', 'Super!', 'Next level!'][li % 4], 1500); }
    }
    finish('anzan', 'check', 'Amazing! You are ready for mental abacus!', ['beads', ...mastered]);
  }
  // The keypad matches the practice keypad: 7-8-9 / 4-5-6 / 1-2-3, then ⌫ and a wide 0. The red Check button sits outside the grid.
  function makePad(el, ansEl) {
    const W = root.WS, go = $('#suGo');
    el.innerHTML = [7, 8, 9, 4, 5, 6, 1, 2, 3].map(k => `<button data-k="${k}">${k}</button>`).join('') + `<button data-k="del" class="del" aria-label="Delete">${W.icon('back', 30, W.colors.ink, 3)}</button><button data-k="0" class="zero">0</button>`;
    let val = '', waiting = null; const set = v => { val = v; ansEl.textContent = v || ' '; go.disabled = !v; };
    el.onclick = e => { const b = e.target.closest('button'); if (!b || !waiting) return; const k = b.dataset.k; App().Sfx.tap();
      if (k === 'del') set(val.slice(0, -1)); else if (val.length < 4) set(val + k); };
    go.onclick = () => { if (!waiting || val === '') return; App().Sfx.tap(); const w = waiting; waiting = null; go.disabled = true; w(parseInt(val, 10)); };
    return { ask() { set(''); return new Promise(r => { waiting = r; }); } };
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
  function finish(current, how, headline, masteredIds) {
    token++;
    App().applySetup({ name: state.name, current, how, mastered: masteredIds });
    $('#suDoneH').textContent = headline;
    $('#suDoneP').textContent = `${state.name}, your first stop is ${App().nodeTitle(current)}. Tap Start each day for a short practice.`;
    $('#suInstall').style.display = inBrowserTab() ? '' : 'none';
    step('suDone'); root.Fun.Mascot.react(bix(), 'cheer', 2000); say(null, 0, 'intro_done'); root.Fun.confetti(70); App().Sfx.star();
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
    const W = root.WS, K = W.colors;
    const art = { yes: W.icon('abacus', 84, '#5E3519'), no: `<span class="su-cross">${W.icon('abacus', 84, '#B3BEC7')}${W.icon('close', 46, K.red, 3.4)}</span>`, unsure: `<span class="su-q">?</span>`,
      new: W.icon('sprout', 76, K.jade, 2.2), check: W.icon('abacus', 80, '#5E3519'), pick: W.icon('lock', 70, K.indigo, 2.2) };
    $$('#setup .su-art').forEach(el => { el.innerHTML = art[el.dataset.art] || ''; });
    $$('#setup .su-ic-next').forEach(el => { el.innerHTML = W.icon('play', 30, '#fff'); });
    $('#suPickBack').innerHTML = W.icon('back', 28, '#F4E3C3', 3);
    $('#suShareIc').innerHTML = W.icon('share', 20, K.indigo);
    $('#suGoIc').innerHTML = W.icon('check', 30, '#fff', 3.2);
    $('#suStart').onclick = () => App().goHome();
  }
  root.Setup = { open, bind, inBrowserTab };
})(typeof globalThis !== 'undefined' ? globalThis : this);
