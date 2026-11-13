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
    float(`+${n} 🟡`, why); renderJar();
  }
  function float(text, sub) {
    const el = document.createElement('div'); el.className = 'beadfloat';
    el.innerHTML = `<div>${text}</div>${sub ? `<small>${sub}</small>` : ''}`;
    document.body.appendChild(el); try { App().Sfx.sparkle(); } catch (e) {}
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- the jar on the home screen ---------- */
  function jarSVG(pct) {
    const h = Math.round(64 * Math.max(0, Math.min(1, pct))); const y = 86 - h;
    return `<svg viewBox="0 0 80 96" class="jarsvg"><defs>
      <clipPath id="jarclip"><path d="M18 24 Q12 30 12 42 L12 80 Q12 90 24 90 L56 90 Q68 90 68 80 L68 42 Q68 30 62 24 Z"/></clipPath>
      <pattern id="beadpat" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#F2B21B"/><ellipse cx="6" cy="5" rx="5" ry="3.6" fill="#FFD54F"/><ellipse cx="4.5" cy="3.8" rx="1.6" ry="1" fill="#FFF3C4"/></pattern></defs>
      <rect x="12" y="${y}" width="56" height="${h + 6}" fill="url(#beadpat)" clip-path="url(#jarclip)"/>
      <path d="M18 24 Q12 30 12 42 L12 80 Q12 90 24 90 L56 90 Q68 90 68 80 L68 42 Q68 30 62 24 Z" fill="rgba(255,255,255,.25)" stroke="#9C7A4A" stroke-width="3.5"/>
      <rect x="20" y="10" width="40" height="14" rx="4" fill="#C8875A" stroke="#9C5E35" stroke-width="3"/>
      <path d="M20 40 Q22 34 26 32" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".7"/></svg>`;
  }
  function renderJar() {
    const el = $('#jar'); if (!el) return; const w = wallet(), g = goal();
    const pct = g ? w.beads / g.price : Math.min(1, w.beads / 30);
    el.innerHTML = `${jarSVG(pct)}<div class="jar-txt"><div class="jar-n">${w.beads} <span>🟡</span></div><div class="jar-sub">${g ? (w.beads >= g.price ? `${g.emoji} ready! Tap me!` : `Saving for ${g.emoji} ${w.beads}/${g.price}`) : 'Treat Shop'}</div></div>`;
    el.classList.toggle('ready', !!(g && w.beads >= g.price));
  }

  /* ---------- shop ---------- */
  function renderShop() {
    const w = wallet(), g = goal(); $('#shopBeads').textContent = w.beads;
    const box = $('#shopCards'); box.innerHTML = '';
    for (const t of list().slice().sort((a, b) => a.price - b.price)) {
      const can = w.beads >= t.price, pct = Math.min(100, Math.round(100 * w.beads / t.price)), isGoal = g && g.id === t.id;
      const c = document.createElement('div'); c.className = 'tcard' + (can ? ' can' : '') + (isGoal ? ' goal' : '');
      c.innerHTML = `${isGoal ? '<div class="tgoal">⭐ Saving for this</div>' : ''}<div class="temoji">${t.emoji}</div><div class="tname">${esc(t.name)}</div>
        <div class="tprice">${t.price} 🟡</div><div class="tbar"><i style="width:${pct}%"></i></div>
        <div class="tneed">${can ? 'You have enough!' : `${t.price - w.beads} more to go`}</div>
        <div class="tbtns">${can ? `<button class="btn small coral" data-get="${t.id}">Get it!</button>` : ''}${isGoal ? '' : `<button class="btn small ghost" data-goal="${t.id}">Save for this</button>`}</div>`;
      box.appendChild(c);
    }
    box.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { wallet().goal = b.dataset.goal; F().save(); App().Sfx.ok(); F().Mascot.say($('#bixShop'), `Great choice! Let's save for ${byId(b.dataset.goal).emoji}!`, 3000, 'shop_choice'); F().Mascot.react($('#bixShop'), 'happy'); renderShop(); renderJar(); });
    box.querySelectorAll('[data-get]').forEach(b => b.onclick = () => ask(byId(b.dataset.get)));
    const open = w.tickets.filter(x => !x.given);
    $('#shopTickets').innerHTML = open.length ? `<div class="tk-head">🎟 Show a grown-up:</div>` + open.map(x => `<div class="ticket">${x.emoji} ${esc(x.name)}</div>`).join('') : '';
  }
  function ask(t) {
    const m = $('#shopAsk'); $('#askText').innerHTML = `Get <b>${t.emoji} ${esc(t.name)}</b> for <b>${t.price} 🟡</b>?`; m.classList.add('active');
    $('#askNo').onclick = () => m.classList.remove('active');
    $('#askYes').onclick = () => { m.classList.remove('active'); buy(t); };
  }
  function buy(t) {
    const w = wallet(); if (w.beads < t.price) return;
    w.beads -= t.price; w.tickets.push({ id: 'k' + Date.now(), tid: t.id, emoji: t.emoji, name: t.name, price: t.price, at: new Date().toISOString(), given: false });
    if (w.goal === t.id) w.goal = null; F().save();
    F().confetti(110); App().Sfx.star();
    const bx = $('#bixShop'); F().Mascot.react(bx, 'cheer', 2200); F().Mascot.say(bx, `Yum! ${t.emoji} Show your ticket to a grown-up!`, 0, 'shop_yum');
    renderShop(); renderJar();
  }
  function open() {
    const bx = $('#bixShop'); if (!bx.querySelector('.bix')) F().Mascot.mount(bx, { size: 80 });
    const g = goal(), w = wallet();
    F().Mascot.say(bx, g ? (w.beads >= g.price ? `You can get ${g.emoji} now!` : `${g.price - w.beads} more beads for ${g.emoji}. You can do it!`) : 'Pick a treat to save for!', 0, g ? (w.beads >= g.price ? 'shop_ready' : 'shop_saving') : 'shop_pick');
    renderShop(); App().show('shop');
  }

  /* ---------- grown-ups ---------- */
  function renderParent() {
    const w = wallet();
    $('#tpBeads').textContent = w.beads; $('#tpTotal').textContent = `${w.total} earned in total`;
    const tb = $('#tpList'); tb.innerHTML = '';
    list().forEach((t, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><input class="txt" style="width:58px;min-width:0;text-align:center;font-size:22px" value="${t.emoji}" data-f="emoji"></td><td><input class="txt" value="${esc(t.name)}" data-f="name"></td><td><input class="txt" type="number" min="1" style="width:80px;min-width:0" value="${t.price}" data-f="price"> 🟡</td><td><button class="btn small ghost" data-del style="padding:4px 10px;min-height:30px;font-size:13px">Remove</button></td>`;
      tr.querySelectorAll('input').forEach(inp => inp.onchange = () => { const f = inp.dataset.f; t[f] = f === 'price' ? Math.max(1, parseInt(inp.value, 10) || 1) : (inp.value.trim() || t[f]); App().saveSettings(); renderJar(); if (App().renderChecklist) App().renderChecklist(); });
      tr.querySelector('[data-del]').onclick = () => { if (!confirm(`Remove ${t.emoji} ${t.name}?`)) return; list().splice(i, 1); if (w.goal === t.id) w.goal = null; App().saveSettings(); F().save(); renderParent(); renderJar(); };
      tb.appendChild(tr);
    });
    const open = w.tickets.filter(x => !x.given), done = w.tickets.filter(x => x.given).slice(-8).reverse();
    $('#tpTickets').innerHTML = (open.length ? open.map(x => `<div class="ticket">${x.emoji} ${esc(x.name)} <span class="note">${new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> <button class="btn small" data-give="${x.id}" style="padding:4px 12px;min-height:30px;font-size:13px">Given ✓</button></div>`).join('') : '<div class="note">Nothing waiting.</div>')
      + (done.length ? `<div class="note" style="margin-top:8px">Recently given: ${done.map(x => x.emoji).join(' ')}</div>` : '');
    $('#tpTickets').querySelectorAll('[data-give]').forEach(b => b.onclick = () => { const k = w.tickets.find(x => x.id === b.dataset.give); if (k) { k.given = true; k.givenAt = new Date().toISOString(); F().save(); renderParent(); } });
  }
  function bindParent() {
    $('#tpAdd').onclick = () => { const ids = new Set(list().map(t => t.id)); let i = 1; while (ids.has('t' + i)) i++; list().push({ id: 't' + i, emoji: '🎁', name: 'New treat', price: 10 }); App().saveSettings(); renderParent(); };
    $('#tpDefaults').onclick = () => { if (!confirm('Put the treat list back to the original six?')) return; App().settings.treats = DEFAULT_TREATS.map(t => Object.assign({}, t)); App().saveSettings(); renderParent(); renderJar(); };
    document.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => { const w = wallet(); w.beads = Math.max(0, w.beads + parseInt(b.dataset.adj, 10)); F().save(); renderParent(); renderJar(); });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  root.Treats = { EARN, DEFAULT_TREATS, list, wallet, earn, float, renderJar, renderShop, open, renderParent, bindParent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
