// Golden beads and the Treat Shop: real-world rewards the family chooses.
// The child earns beads for finishing things; treats cost beads; tickets go to a grown-up to hand over.
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const App = () => root.App;
  const F = () => root.Fun;

  const DEFAULT_TREATS = [
    { id: 't1', emoji: '🍪', name: 'Small snack', price: 3 },
    { id: 't2', emoji: '📖', name: 'Extra bedtime story', price: 5 },
    { id: 't3', emoji: '🎲', name: 'Game with a grown-up', price: 8 },
    { id: 't4', emoji: '🍽️', name: 'Choose dinner', price: 12 },
    { id: 't5', emoji: '🛝', name: 'Park trip', price: 20 },
    { id: 't6', emoji: '🍦', name: 'Ice cream outing', price: 30 },
  ];
  // How beads are earned (shown to grown-ups too)
  const EARN = { activity: 1, gold: 1, today: 3, skill: 5 };

  function list() { const s = App().settings; if (!Array.isArray(s.treats) || !s.treats.length) s.treats = DEFAULT_TREATS.map(t => Object.assign({}, t)); return s.treats; }
  function wallet() { const d = F().data; if (!d.wallet) d.wallet = { beads: 0, total: 0, goal: null, tickets: [] }; return d.wallet; }
  function byId(id) { return list().find(t => t.id === id); }
  function goal() { const w = wallet(); return w.goal && byId(w.goal) ? byId(w.goal) : null; }

  /* ---------- earning ---------- */
  function earn(n, why) {
    if (!n) return; const w = wallet(); w.beads += n; w.total += n; F().save();
    float(n, why); renderJar();
  }
  // A golden bead pops up with "+n" (and why, as a caption).
  function float(n, sub) {
    const W = root.WS, el = document.createElement('div'); el.className = 'beadfloat ws-pop';
    el.innerHTML = `<div class="bf-row">${W ? W.bead('ochre', 76) : ''}<span>+${typeof n === 'number' ? n : String(n).replace(/[^0-9]/g, '')}</span></div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    document.body.appendChild(el); try { App().Sfx.sparkle(); } catch (e) {}
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- the treat jar on the My Room shelf ---------- */
  const JAR_ROWS = 7, JAR_PER = 3, JAR_FULL = JAR_ROWS * JAR_PER;
  function jarSVG(shown, goalLine) {
    let beads = '';
    for (let k = 0; k < shown; k++) {
      const r = Math.floor(k / JAR_PER), c = k % JAR_PER, off = r % 2 ? 16 : 0;
      const x = 46 + c * 46 + off - (r % 2 ? 8 : 0), y = 250 - r * 26;
      beads += `<path class="j-bead${k === shown - 1 ? ' j-last' : ''}" d="M${x} ${y} Q${x + 24} ${y - 18} ${x + 48} ${y} Q${x + 24} ${y + 18} ${x} ${y}Z"/>`;
    }
    const lineY = 250 - JAR_ROWS * 26 + 8;
    return `<svg class="jarsvg" viewBox="0 0 230 280" width="230" height="280" aria-hidden="true">
      <rect class="j-lid" x="58" y="14" width="114" height="34" rx="10"/>
      <path class="j-glass" d="M50 52 H180 Q200 52 200 76 V250 Q200 276 174 276 H56 Q30 276 30 250 V76 Q30 52 50 52Z"/>
      ${beads}${goalLine ? `<path class="j-goal" d="M44 ${lineY} H186"/>` : ''}
      <path class="j-edge" d="M50 52 H180 Q200 52 200 76 V250 Q200 276 174 276 H56 Q30 276 30 250 V76 Q30 52 50 52Z"/>
      <rect class="j-shine" x="44" y="70" width="18" height="150" rx="9"/></svg>`;
  }
  function renderJar() {
    const el = $('#jar'); if (!el) return; const w = wallet(), g = goal(), W = root.WS;
    const cap = g ? g.price : 30, frac = Math.max(0, Math.min(1, w.beads / cap));
    const shown = w.beads > 0 ? Math.max(1, Math.round(frac * JAR_FULL)) : 0, ready = !!(g && w.beads >= g.price);
    el.innerHTML = jarSVG(shown, !!g)
      + `<span class="jar-n ws-chip">${W.bead('ochre', 30)}<b>${w.beads}</b></span>`
      + `<span class="jar-sub jar-tag${ready ? ' ready' : ''}${g ? '' : ' none'}">${g ? `<span class="jt-emoji">${g.emoji}</span><span>${esc(g.name)}</span>` : `${W.icon('star', 30, W.colors.ochre)}<span>Pick a treat</span>`}</span>`;
    el.classList.toggle('ready', ready);
    el.setAttribute('aria-label', `Treat jar: ${w.beads} golden beads` + (g ? `, saving for ${g.name}` : ''));
    const chip = $('#roomBeads'); if (chip) chip.innerHTML = `${W.bead('ochre', 26)}<b>${w.beads}</b>`;
  }
  // What Bix says in My Room about the jar: [caption, voice line id]. The caption always contains the spoken line.
  function jarLine() {
    const w = wallet(), g = goal();
    if (!g) return ['Pick a treat to save for! Tap “I wish for”.', 'shop_pick'];
    const more = g.price - w.beads;
    if (more <= 0) return [`You have enough for ${g.name}! Go get it!`, 'shop_ready'];
    return [`Just ${more} more bead${more === 1 ? '' : 's'} for ${g.name}! You can do it!`, 'shop_saving'];
  }

  /* ---------- the treat list ("I wish for…") ---------- */
  function renderShop() {
    const w = wallet(), g = goal(), W = root.WS; $('#shopBeads').textContent = w.beads;
    const bi = $('#shopBeadIc'); if (bi && !bi.firstChild) bi.innerHTML = W.bead('ochre', 30);
    const box = $('#shopCards'); box.innerHTML = '';
    for (const t of list().slice().sort((a, b) => a.price - b.price)) {
      const can = w.beads >= t.price, pct = Math.min(100, Math.round(100 * w.beads / t.price)), isGoal = g && g.id === t.id;
      const c = document.createElement('div'); c.className = 'tcard ws-card' + (can ? ' can' : '') + (isGoal ? ' goal' : '');
      c.innerHTML = `${isGoal ? `<div class="tgoal">${W.icon('star', 18, '#3D2412')}Saving for this</div>` : ''}<div class="temoji">${t.emoji}</div><div class="tname">${esc(t.name)}</div>
        <div class="tprice">${W.bead('ochre', 28)}<b>${t.price}</b></div><div class="tbar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <div class="tneed">${can ? 'You have enough!' : `${t.price - w.beads} more to go`}</div>
        <div class="tbtns">${can ? `<button class="ws-btn small" data-get="${t.id}">Get it!</button>` : ''}${isGoal ? '' : `<button class="ws-btn small maple" data-goal="${t.id}">Save for this</button>`}</div>`;
      box.appendChild(c);
    }
    box.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { wallet().goal = b.dataset.goal; F().save(); App().Sfx.ok(); F().Mascot.say($('#bixShop'), `Great choice! Let's save for ${byId(b.dataset.goal).name}!`, 3000, 'shop_choice'); F().Mascot.react($('#bixShop'), 'happy'); renderShop(); renderJar(); });
    box.querySelectorAll('[data-get]').forEach(b => b.onclick = () => ask(byId(b.dataset.get)));
    const open = w.tickets.filter(x => !x.given);
    $('#shopTickets').innerHTML = open.length ? `<div class="tk-head">Show a grown-up:</div>` + open.map(x => `<div class="ticket">${x.emoji} ${esc(x.name)}</div>`).join('') : '';
  }
  function ask(t) {
    const m = $('#shopAsk'); $('#askText').innerHTML = `Get <b>${t.emoji} ${esc(t.name)}</b> for <b class="ask-price">${root.WS.bead('ochre', 34)}${t.price}</b>?`; m.classList.add('active');
    $('#askNo').onclick = () => m.classList.remove('active');
    $('#askYes').onclick = () => { m.classList.remove('active'); buy(t); };
  }
  function buy(t) {
    const w = wallet(); if (w.beads < t.price) return;
    w.beads -= t.price; w.tickets.push({ id: 'k' + Date.now(), tid: t.id, emoji: t.emoji, name: t.name, price: t.price, at: new Date().toISOString(), given: false });
    if (w.goal === t.id) w.goal = null; F().save();
    F().confetti(110); App().Sfx.star();
    const bx = $('#bixShop'); F().Mascot.react(bx, 'cheer', 2200); F().Mascot.say(bx, `Yum! ${t.name}! Show your ticket to a grown-up!`, 0, 'shop_yum');
    renderShop(); renderJar();
  }
  function open() {
    const bx = $('#bixShop'); if (!bx.querySelector('.bix')) F().Mascot.mount(bx, { size: 84 });
    const g = goal(), w = wallet();
    F().Mascot.say(bx, g ? (w.beads >= g.price ? `You have enough for ${g.name}! Go get it!` : `${g.price - w.beads} more beads for ${g.name}. Keep practising to fill the jar. You can do it!`) : 'Pick a treat to save for!', 0, g ? (w.beads >= g.price ? 'shop_ready' : 'shop_saving') : 'shop_pick');
    renderShop(); App().show('shop');
  }
  // "I wish for…" in My Room. For now it opens the treat list, where the child picks what to save for or gets a treat.
  // Later milestone: a wish the child makes here goes to a grown-up for approval (replace this one function).
  function wish() { open(); }

  /* ---------- grown-ups ---------- */
  function renderParent() {
    const w = wallet();
    $('#tpBeads').textContent = w.beads; $('#tpTotal').textContent = `${w.total} earned in total`;
    const tb = $('#tpList'); tb.innerHTML = '';
    list().forEach((t, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="txt" style="width:58px;min-width:0;text-align:center;font-size:22px" value="${t.emoji}" data-f="emoji"></td><td><input class="txt" value="${esc(t.name)}" data-f="name"></td><td><input class="txt" type="number" min="1" style="width:80px;min-width:0" value="${t.price}" data-f="price" aria-label="Price in golden beads"> <span class="tp-bead">${root.WS.bead('ochre', 30, { label: 'golden beads' })}</span></td><td><button class="btn small ghost" data-del>Remove</button></td>`;
      tr.querySelectorAll('input').forEach(inp => inp.onchange = () => { const f = inp.dataset.f; t[f] = f === 'price' ? Math.max(1, parseInt(inp.value, 10) || 1) : (inp.value.trim() || t[f]); App().saveSettings(); renderJar(); if (App().renderChecklist) App().renderChecklist(); });
      tr.querySelector('[data-del]').onclick = async () => { if (!await root.WS.confirm(`Remove ${t.name}?`, 'It comes off the treat list. Tickets already bought stay.', { ok: 'Remove', cancel: 'Keep', danger: true })) return; list().splice(i, 1); if (w.goal === t.id) w.goal = null; App().saveSettings(); F().save(); renderParent(); renderJar(); };
      tb.appendChild(tr);
    });
    const open = w.tickets.filter(x => !x.given), done = w.tickets.filter(x => x.given).slice(-8).reverse();
    $('#tpTickets').innerHTML = (open.length ? open.map(x => `<div class="ticket">${x.emoji} ${esc(x.name)} <span class="note">${new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> <button class="btn small" data-give="${x.id}">Given</button></div>`).join('') : '<div class="note">Nothing waiting.</div>')
      + (done.length ? `<div class="note" style="margin-top:8px">Recently given: ${done.map(x => x.emoji).join(' ')}</div>` : '');
    $('#tpTickets').querySelectorAll('[data-give]').forEach(b => b.onclick = () => { const k = w.tickets.find(x => x.id === b.dataset.give); if (k) { k.given = true; k.givenAt = new Date().toISOString(); F().save(); renderParent(); } });
  }
  function bindParent() {
    $('#tpAdd').onclick = () => { const ids = new Set(list().map(t => t.id)); let i = 1; while (ids.has('t' + i)) i++; list().push({ id: 't' + i, emoji: '🎁', name: 'New treat', price: 10 }); App().saveSettings(); renderParent(); };
    $('#tpDefaults').onclick = async () => { if (!await root.WS.confirm('Reset the treat list?', 'This puts back the original six treats and removes any you added or changed.', { ok: 'Reset list', cancel: 'Keep my list' })) return; App().settings.treats = DEFAULT_TREATS.map(t => Object.assign({}, t)); App().saveSettings(); renderParent(); renderJar(); };
    document.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => { const w = wallet(); w.beads = Math.max(0, w.beads + parseInt(b.dataset.adj, 10)); F().save(); renderParent(); renderJar(); });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  root.Treats = { EARN, DEFAULT_TREATS, list, wallet, goal, earn, float, renderJar, jarLine, renderShop, open, wish, renderParent, bindParent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
