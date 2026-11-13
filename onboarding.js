// First-time setup for a new child on a new device: name, where to start (new / level check / grown-up picks),
// and a reminder to add the app to the Home Screen so Safari keeps the data.
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
  function say(t, ms = 0, vid) { root.Fun.Mascot.say(bix(), t, ms, vid); }

  function open(from) {
    const my = ++token; App().show('setup');
    if (!bix().querySelector('.bix')) root.Fun.Mascot.mount(bix(), { size: 104 });
    if (from === 'level' || from === 'check') { state.name = App().settings.name || ''; state.keepName = true; if (from === 'check') check(); else toLevel(); return; }
    state = { name: '', keepName: false };
    $('#suNameIn').value = ''; step('suName'); say("Hi! I'm Bix! Tap me to say hello! 👋");
    // iPads only allow sound after a tap, so Bix introduces himself on the first touch.
    const hello = () => { if (my !== token || state.introDone) return; state.introDone = true; say("Hi there! I'm Bix! I'm a little bead from an abacus, and I love numbers!", 0, 'intro_hi');
      root.Fun.Mascot.react(bix(), 'happy'); setTimeout(async () => { await root.Fun.BixVoice.load(); }, 0);
      const wait = () => root.Fun.BixVoice.busy() ? setTimeout(wait, 200) : (my === token && $('#suName').classList.contains('on') && say("What's your name? Type it in for me!", 0, 'intro_name'));
      setTimeout(wait, 900); };
    $('#setup').addEventListener('click', () => { App().unlock(); setTimeout(hello, 60); }, { once: true });
    setTimeout(() => { if (my === token) $('#suNameIn').focus(); }, 300);
  }
  function nameGo() {
    const n = $('#suNameIn').value.trim().replace(/\s+/g, ' ').slice(0, 20);
    if (!n) { say('Type your name first! 😊', 2500); $('#suNameIn').focus(); return; }
    state.name = n; App().Sfx.ok(); root.Fun.Mascot.react(bix(), 'happy'); toLevel();
  }
  function toLevel() { step('suLevel'); say(`Nice to meet you, ${state.name}! Where should we start?`, 0, 'intro_meet'); }

  /* ---------- grown-up picks the skill ---------- */
  function toPick() {
    const box = $('#suPickList'); box.innerHTML = '';
    App().nodes().forEach(n => {
      const b = document.createElement('button'); b.className = 'su-skill'; b.dataset.id = n.id;
      b.innerHTML = `<span class="ic">${n.icon}</span><span><b>${n.title}</b><small>${example(n)}</small></span>`;
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
      $('#suLevelName').textContent = `${n.icon} ${n.title}`;
      $('#suDots').innerHTML = CHECK.map((id, k) => `<i class="${k < li ? 'ok' : k === li ? 'cur' : ''}"></i>`).join('');
      const cfg = Object.assign({}, n.drill, { operands: 3 });
      let probs; try { probs = E.generateSet2(cfg, PER); } catch (e) { probs = []; }
      let right = 0;
      for (let k = 0; k < probs.length; k++) {
        if (my !== token) return;
        const p = probs[k];
        $('#suProb').innerHTML = p.terms.map(t => `<div class="term${t < 0 ? ' neg' : ''}">${t < 0 ? '−' + Math.abs(t) : t}</div>`).join('');
        $('#suFb').textContent = ''; $('#suFb').className = 'feedback';
        const a = await pad.ask(); if (my !== token) return;
        if (stopAt) break;
        if (a === p.answer) { right++; $('#suFb').textContent = '✓'; $('#suFb').className = 'feedback ok'; App().Sfx.ok(); }
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
  function makePad(el, ansEl) {
    el.innerHTML = [7, 8, 9, 4, 5, 6, 1, 2, 3].map(k => `<button data-k="${k}">${k}</button>`).join('') + '<button data-k="del" class="del">⌫</button><button data-k="0">0</button><button data-k="go" class="go">GO</button>';
    let val = '', waiting = null; const set = v => { val = v; ansEl.textContent = v || ' '; };
    el.onclick = e => { const b = e.target.closest('button'); if (!b || !waiting) return; const k = b.dataset.k; App().Sfx.tap();
      if (k === 'del') set(val.slice(0, -1)); else if (k === 'go') { if (val !== '') { const w = waiting; waiting = null; w(parseInt(val, 10)); } } else if (val.length < 4) set(val + k); };
    return { ask() { set(''); return new Promise(r => { waiting = r; }); } };
  }

  /* ---------- finish ---------- */
  function finish(current, how, headline, masteredIds) {
    token++;
    App().applySetup({ name: state.name, current, how, mastered: masteredIds });
    $('#suDoneH').textContent = headline;
    $('#suDoneP').textContent = `${state.name}, your first stop is ${App().nodeTitle(current)}. Tap Start each day for a short practice.`;
    const standalone = (window.navigator.standalone === true) || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    $('#suInstall').style.display = standalone ? 'none' : '';
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
    $('#suStart').onclick = () => App().goHome();
  }
  root.Setup = { open, bind };
})(typeof globalThis !== 'undefined' ? globalThis : this);
