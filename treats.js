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
    const el = document.createElement('div'); el.className = 'beadfloat tr-float';
    el.innerHTML = `<div class="bf-row">${root.TOY ? root.TOY.bead('mustard', 76) : ''}<span>+${typeof n === 'number' ? n : String(n).replace(/[^0-9]/g, '')}</span></div>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    document.body.appendChild(el); try { App().Sfx.sparkle(); } catch (e) {}
    setTimeout(() => el.remove(), 2200);
  }

  /* ---------- the treat jar on the My Room shelf ---------- */
  const JAR_ROWS = 7, JAR_PER = 3, JAR_FULL = JAR_ROWS * JAR_PER;
  // A glass jar with a wooden lid: golden beads pile up inside; the dashed line is how many the saved-for treat needs.
  function jarSVG(shown, goalLine) {
    const R = root.ToyRoom; let beads = '';
    for (let k = 0; k < shown; k++) {
      const r = Math.floor(k / JAR_PER), c = k % JAR_PER;
      const x = 69 + c * 46 + (r % 2 ? 7 : -3) + ((k * 53) % 7) - 3, y = 256 - r * 25, rot = ((k * 37) % 23) - 11;
      beads += `<g class="j-bead${k === shown - 1 ? ' j-last' : ''}" transform="translate(${x} ${y}) rotate(${rot}) scale(1.02)">${R.wideBead('mustard')}</g>`;
    }
    const lineY = 256 - JAR_ROWS * 25 + 10, body = 'M52 58 H178 Q200 58 200 82 V248 Q200 274 174 274 H56 Q30 274 30 248 V82 Q30 58 52 58Z';
    return `<svg class="jarsvg" viewBox="0 0 230 290" width="230" height="290" aria-hidden="true">
      ${R.shadowE(134, 280, 100, 12, .5)}${R.shadowE(120, 278, 76, 9, .95)}
      <path class="j-glass" d="${body}"/><ellipse cx="115" cy="266" rx="74" ry="7" fill="#7FA9BC" opacity=".3"/>
      ${beads}${goalLine ? `<path class="j-goal" d="M40 ${lineY} H190"/>` : ''}
      <path class="j-edge" d="${body}"/><path class="j-edge-hi" d="${body}"/>
      <rect class="j-shine" x="43" y="80" width="13" height="150" rx="6.5"/><rect class="j-shine" x="60" y="86" width="5" height="60" rx="2.5" opacity=".5"/><rect class="j-shine" x="186" y="96" width="5" height="70" rx="2.5" opacity=".55"/>
      <rect x="50" y="46" width="130" height="18" rx="9" fill="#DCEEF3" stroke="#8FB7C8" stroke-width="2"/><rect x="58" y="49" width="70" height="4" rx="2" fill="#fff" opacity=".9"/>
      <rect x="54" y="24" width="122" height="26" rx="9" fill="url(#toy-g-maple-side)"/><rect x="54" y="19" width="122" height="24" rx="9" fill="url(#toy-g-maple)"/><rect x="62" y="22" width="60" height="4" rx="2" fill="#fff" opacity=".55"/>
      <circle cx="116" cy="13" r="11" fill="url(#toy-g-maple-side)"/><circle cx="115" cy="11" r="10" fill="url(#toy-g-maple)"/><ellipse cx="111" cy="7" rx="4" ry="2.2" fill="#fff" opacity=".7"/></svg>`;
  }
  function renderJar() {
    const el = $('#jar'); if (!el) return; const w = wallet(), g = goal(), K = root.TOY;
    const cap = g ? g.price : 30, frac = Math.max(0, Math.min(1, w.beads / cap));
    const shown = w.beads > 0 ? Math.max(1, Math.round(frac * JAR_FULL)) : 0, ready = !!(g && w.beads >= g.price);
    el.innerHTML = jarSVG(shown, !!g)
      + `<span class="jar-n">${K.bead('mustard', 34)}<b>${w.beads}</b></span>`
      + `<span class="jar-sub jar-tag${ready ? ' ready' : ''}${g ? '' : ' none'}">${g ? `<span class="jt-ic">${treatArt(g, 44)}</span><span class="jt-name">${esc(g.name)}</span>` : `<span class="jt-ic">${K.icon('star', 30, '#C98A16')}</span><span class="jt-name">Pick a treat</span>`}</span>`;
    el.classList.toggle('ready', ready);
    el.setAttribute('aria-label', `Treat jar: ${w.beads} golden beads` + (g ? `, saving for ${g.name}` : ''));
    const chip = $('#roomBeads'); if (chip) chip.innerHTML = `${K.bead('mustard', 30, { shadow: false })}<b>${w.beads}</b>`;
  }
  // What Bix says in My Room about the jar: [caption, voice line id]. The caption always contains the spoken line.
  function jarLine() {
    const w = wallet(), g = goal();
    if (!g) return ['Pick a treat to save for! Tap “Treats”.', 'shop_pick'];
    const more = g.price - w.beads;
    if (more <= 0) return [`Your jar is full enough for ${g.name}!`, null];   // no "go get it": the child decides, without a push
    return [`Just ${more} more bead${more === 1 ? '' : 's'} for ${g.name}! You can do it!`, 'shop_saving'];
  }

  /* ---------- treat pictures: small toys drawn from kit materials (lacquer, wood, paper). The family's own treats get the present. ---------- */
  const sh2 = (rx) => `<ellipse cx="56" cy="92" rx="${rx + 8}" ry="6" fill="url(#toy-g-shadow)" opacity=".45"/><ellipse cx="51" cy="91" rx="${rx}" ry="5" fill="url(#toy-g-shadow)" opacity=".95"/>`;
  const hi = (x, y, rx, ry, rot) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})" fill="#fff" opacity=".8"/>`;
  const PICS = {
    cookie: () => sh2(34) + `<ellipse cx="50" cy="56" rx="38" ry="36" fill="#9E690D"/><ellipse cx="50" cy="52" rx="38" ry="35" fill="url(#toy-lac-wood)"/><ellipse cx="50" cy="52" rx="38" ry="35" fill="#C98A16" opacity=".42"/>`
      + [[34, 40, 6], [58, 34, 5], [66, 56, 6.5], [44, 62, 5.5], [28, 58, 4], [52, 48, 4]].map(c => `<circle cx="${c[0] + 1}" cy="${c[1] + 1.5}" r="${c[2]}" fill="#4A2C06"/><circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="#7A4A24"/><circle cx="${c[0] - 1.5}" cy="${c[1] - 1.5}" r="${c[2] * .3}" fill="#fff" opacity=".4"/>`).join('') + hi(30, 30, 10, 3.6, -38),
    book: () => sh2(34) + `<rect x="18" y="16" width="64" height="76" rx="8" fill="#1B2557"/><rect x="24" y="20" width="60" height="70" rx="4" fill="#FFFDF6"/><path d="M26 86 H84 M26 82 H84" stroke="#D9CEB8" stroke-width="1.6"/>`
      + `<rect x="14" y="12" width="64" height="74" rx="8" fill="url(#toy-lac-indigo)"/><rect x="14" y="12" width="12" height="74" rx="6" fill="#1B2557" opacity=".55"/>`
      + `<path d="M58 34 a16 16 0 1 0 6 26 a13 13 0 0 1 -6 -26Z" fill="url(#toy-lac-moon)"/><circle cx="38" cy="38" r="2.4" fill="#FBEFC2"/><circle cx="34" cy="60" r="1.8" fill="#FBEFC2"/><circle cx="62" cy="70" r="2" fill="#FBEFC2"/>` + hi(36, 22, 10, 3, -20),
    dice: () => sh2(32) + `<rect x="16" y="24" width="68" height="68" rx="16" fill="#8A181D"/><rect x="16" y="18" width="68" height="68" rx="16" fill="url(#toy-lac-red)"/>`
      + [[34, 36], [66, 36], [50, 52], [34, 68], [66, 68]].map(c => `<circle cx="${c[0]}" cy="${c[1] + 1.5}" r="6.5" fill="#8A181D"/><circle cx="${c[0]}" cy="${c[1]}" r="6.5" fill="#FFFDF6"/>`).join('') + hi(34, 25, 12, 3.4, -18),
    plate: () => sh2(38) + `<ellipse cx="50" cy="60" rx="42" ry="30" fill="#CDBFA8"/><ellipse cx="50" cy="55" rx="42" ry="30" fill="#FFFDF6"/><ellipse cx="50" cy="55" rx="29" ry="20" fill="#EFE6D2"/><ellipse cx="50" cy="57" rx="26" ry="17" fill="#FFFDF6"/>`
      + `<path d="M22 60 a30 12 0 0 0 56 0 a30 26 0 0 0 -56 0Z" fill="#8A181D"/><path d="M22 56 a28 26 0 0 1 56 0Z" fill="url(#toy-lac-red)"/><rect x="20" y="54" width="60" height="7" rx="3.5" fill="url(#toy-g-brass)"/><circle cx="50" cy="28" r="6" fill="url(#toy-g-brass)"/>` + hi(36, 38, 9, 3, -30),
    park: () => sh2(30) + `<rect x="44" y="52" width="13" height="40" rx="5" fill="url(#toy-g-post)"/><circle cx="34" cy="48" r="22" fill="url(#toy-g-leaf)"/><circle cx="66" cy="46" r="21" fill="url(#toy-g-leaf)"/><circle cx="50" cy="30" r="25" fill="url(#toy-g-leaf)"/>`
      + `<circle cx="50" cy="30" r="25" fill="#fff" opacity=".1"/><circle cx="62" cy="42" r="5" fill="url(#toy-lac-red)"/><circle cx="36" cy="50" r="4.5" fill="url(#toy-lac-red)"/><circle cx="46" cy="22" r="4.5" fill="url(#toy-lac-red)"/>` + hi(38, 16, 10, 3.4, -30),
    icecream: () => sh2(22) + `<path d="M31 46 H69 L52 92 Q50 95 48 92Z" fill="url(#toy-g-maple-side)"/><path d="M33 44 H67 L51 88 Q50 90 49 88Z" fill="url(#toy-g-maple)"/><path d="M38 52 L58 70 M48 46 L63 58 M62 52 L44 70 M52 46 L38 58" stroke="#B98448" stroke-width="2" opacity=".7"/>`
      + `<circle cx="50" cy="30" r="25" fill="url(#toy-lac-plum)"/><path d="M26 36 q6 12 14 4 q6 10 12 2 q8 10 22 -6 q-4 16 -24 17 q-20 0 -24 -17Z" fill="url(#toy-lac-plum)"/><circle cx="60" cy="9" r="7" fill="url(#toy-lac-red)"/>` + hi(38, 17, 10, 3.6, -34) + hi(57, 6, 2.6, 1.2, -30),
    gift: () => sh2(34) + `<rect x="16" y="46" width="68" height="46" rx="8" fill="#9E690D"/><rect x="16" y="42" width="68" height="46" rx="8" fill="url(#toy-lac-mustard)"/><rect x="12" y="30" width="76" height="20" rx="7" fill="#C98A16"/><rect x="12" y="26" width="76" height="20" rx="7" fill="url(#toy-lac-mustard)"/>`
      + `<rect x="43" y="26" width="14" height="62" fill="url(#toy-lac-red)"/><path d="M50 26 C36 4 16 10 28 22 Q38 28 50 26Z M50 26 C64 4 84 10 72 22 Q62 28 50 26Z" fill="url(#toy-lac-red)"/><circle cx="50" cy="25" r="6" fill="#B52323"/>` + hi(28, 31, 10, 2.6, -8),
  };
  const PIC_OF = { '\u{1F36A}': 'cookie', '\u{1F4D6}': 'book', '\u{1F4DA}': 'book', '\u{1F3B2}': 'dice', '\u{1F37D}': 'plate', '\u{1F6DD}': 'park', '\u{1F333}': 'park', '\u{1F366}': 'icecream', '\u{1F368}': 'icecream' };
  // A stored treat keeps its emoji as a key only; what shows is always a drawing: one of the treat pictures above,
  // else the matching sticker drawing (TOY.picOf), else the wrapped present.
  function treatArt(t, size) {
    const ch = String(t && t.emoji || '').replace(/[\uFE0F\u200D]/g, ''), key = PIC_OF[ch], alt = !key && root.TOY.picOf ? root.TOY.picOf(ch) : null;
    if (alt) return root.TOY.pic(alt, size).replace('class="toy-pic"', 'class="toy-pic tr-pic"');
    return `<svg class="tr-pic" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${PICS[key || 'gift']()}</svg>`;
  }
  // The pictures a grown-up can choose for a treat (value = the stored key, label = a plain word).
  const PICK = [['\u{1F381}', 'Present'], ['\u{1F36A}', 'Snack'], ['\u{1F4D6}', 'Story'], ['\u{1F3B2}', 'Game'], ['\u{1F37D}', 'Dinner'], ['\u{1F6DD}', 'Park'], ['\u{1F366}', 'Ice cream'],
    ['\u{1F355}', 'Pizza'], ['\u{1F9C1}', 'Cupcake'], ['\u{1F36D}', 'Lollipop'], ['\u{26BD}', 'Ball'], ['\u{1F9F8}', 'Teddy'], ['\u{1F388}', 'Balloon'], ['\u{1FA81}', 'Kite'], ['\u{1F3A1}', 'Fair'], ['\u{2B50}', 'Star']];

  /* ---------- the treat list ("Treats") ---------- */
  // One big card comes first and is the only one with buttons: the saving goal, or (with no goal) the cheapest treat she can
  // get now, or else the cheapest one. Every other treat is a small quiet card: tapping it brings it up into the big card
  // (nothing is chosen or spent by that tap). So the screen has one obvious next step and never pushes her to spend.
  let picked = null;   // the treat tapped into the big card (view state only)
  function featured() {
    if (picked && byId(picked)) return byId(picked);
    const g = goal(); if (g) return g;
    const byPrice = list().slice().sort((a, b) => a.price - b.price), w = wallet();
    return byPrice.find(t => w.beads >= t.price) || byPrice[0] || null;
  }
  // The price as beads on a brass rod: the golden beads she has are slid to the left, the ones still to earn are bare wood.
  // Long prices (more than 30) show a plain rod that fills.
  function priceRod(t, have) {
    if (t.price > 30) return `<div class="tbar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(100 * have / t.price))}%"></i></div>`;
    let b = ''; for (let k = 0; k < t.price; k++) b += `<i${k < have ? ' class="on"' : ''}></i>`;
    return `<div class="trod${t.price > 16 ? ' many' : ''}" aria-hidden="true">${b}</div>`;
  }
  const lenClass = n => { n = String(n).length; return n > 26 ? ' xlong' : n > 16 ? ' long' : ''; };
  function renderShop() {
    const w = wallet(), g = goal(), K = root.TOY, top = featured(); $('#shopBeads').textContent = w.beads;
    const bi = $('#shopBeadIc'); if (bi && !bi.firstChild) bi.innerHTML = K.bead('mustard', 40);
    const box = $('#shopCards'); box.innerHTML = '';
    const rest = list().slice().sort((a, b) => a.price - b.price).filter(t => !top || t.id !== top.id);
    for (const t of (top ? [top] : []).concat(rest)) {
      const can = w.beads >= t.price, pct = Math.min(100, Math.round(100 * w.beads / t.price)), isGoal = !!(g && g.id === t.id), hi = top && top.id === t.id;
      const need = can ? 'You have enough' : `${t.price - w.beads} more to go`;
      if (hi) {
        // The big card: the treat on the stall's counter. One loud button at most: "Get it" (teal) when it is the goal and she has enough, else "Save for this".
        const c = document.createElement('div'); c.className = 'tcard hi' + (can ? ' can' : '') + (isGoal ? ' goal' : '');
        const getBtn = can ? `<button type="button" class="toy-block toy-block--sm ${isGoal ? 'toy-block--teal' : 'toy-block--wood'}" data-get="${t.id}">Get it</button>` : '';
        const goalBtn = isGoal ? '' : `<button type="button" class="toy-block toy-block--sm toy-block--mustard" data-goal="${t.id}">${K.icon('star', 26, '#4A2C06')}Save for this</button>`;
        c.innerHTML = `${isGoal ? `<div class="tgoal">${K.icon('star', 18, '#4A2C06')}Saving for this</div>` : ''}<div class="tart">${treatArt(t, 132)}</div>
          <div class="tmain"><div class="tname${lenClass(t.name)}">${esc(t.name)}</div><div class="tprice">${K.bead('mustard', 34)}<b>${t.price}</b></div>
          ${priceRod(t, w.beads)}<div class="tneed">${need}</div></div>
          <div class="tbtns">${goalBtn}${getBtn}</div>`;
        box.appendChild(c);
      } else {
        const c = document.createElement('button'); c.type = 'button'; c.className = 'tcard tpick' + (can ? ' can' : '') + (isGoal ? ' goal' : '');
        c.dataset.pick = t.id; c.setAttribute('aria-label', `${t.name}: ${t.price} golden beads. ${need}`);
        c.innerHTML = `<div class="tart">${treatArt(t, 92)}</div><div class="tname${lenClass(t.name)}">${esc(t.name)}</div><div class="tprice">${K.bead('mustard', 26)}<b>${t.price}</b></div>
          <div class="tbar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
        box.appendChild(c);
      }
    }
    box.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { picked = b.dataset.pick; App().Sfx.tap(); renderShop();
      const t = byId(picked), more = t.price - wallet().beads; F().Mascot.say($('#bixShop'), more > 0 ? `${t.name}: ${more} more bead${more === 1 ? '' : 's'}.` : `${t.name}. You have enough beads.`, 0, null); const sb = $('#shop .sh-body'); if (sb && sb.scrollTo) sb.scrollTo({ top: 0, behavior: 'smooth' }); });
    box.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { wallet().goal = b.dataset.goal; picked = null; F().save(); App().Sfx.ok(); F().Mascot.say($('#bixShop'), `Great choice! Let's save for ${byId(b.dataset.goal).name}!`, 3000, 'shop_choice'); F().Mascot.react($('#bixShop'), 'happy'); renderShop(); renderJar(); });
    box.querySelectorAll('[data-get]').forEach(b => b.onclick = () => ask(byId(b.dataset.get)));
    const open = w.tickets.filter(x => !x.given);
    $('#shopTickets').innerHTML = open.length ? `<div class="tk-head">Show a grown-up:</div>` + open.map(x => `<div class="ticket">${K.icon('star', 22, '#C98A16')}<span>${esc(x.name)}</span></div>`).join('') : '';
  }
  function ask(t) {
    const m = $('#shopAsk'); $('#askText').innerHTML = `Get <b>${esc(t.name)}</b> for <b class="ask-price">${root.TOY.bead('mustard', 38)}${t.price}</b>?`; m.classList.add('active');
    $('#askNo').onclick = () => m.classList.remove('active');
    $('#askYes').onclick = () => { m.classList.remove('active'); buy(t); };
  }
  function buy(t) {
    const w = wallet(); if (w.beads < t.price) return;
    w.beads -= t.price; w.tickets.push({ id: 'k' + Date.now(), tid: t.id, emoji: t.emoji, name: t.name, price: t.price, at: new Date().toISOString(), given: false });
    if (w.goal === t.id) w.goal = null; picked = null; F().save();
    F().confetti(110); App().Sfx.star();
    const bx = $('#bixShop'); F().Mascot.react(bx, 'cheer', 2200); F().Mascot.say(bx, `Yum! ${t.name}! Show your ticket to a grown-up!`, 0, 'shop_yum');
    renderShop(); renderJar();
  }
  function open() {
    const bx = $('#bixShop'); if (!bx.querySelector('.bix')) F().Mascot.mount(bx, { size: 84 });
    const g = goal(), w = wallet();
    if (!g) F().Mascot.say(bx, 'Pick a treat to save for!', 0, 'shop_pick');
    else if (w.beads >= g.price) F().Mascot.say(bx, `You have enough for ${g.name}. Get it now, or keep saving. You choose!`, 0, null);
    else F().Mascot.say(bx, `${g.price - w.beads} more beads for ${g.name}. Keep practising to fill the jar. You can do it!`, 0, 'shop_saving');
    picked = null; renderShop(); App().show('shop');
  }
  // The "Treats" button in My Room (it will become "I wish for…" when wishes exist). For now it opens the treat list, where the child picks what to save for or gets a treat.
  // Later milestone: a wish the child makes here goes to a grown-up for approval (replace this one function).
  function wish() { open(); }

  /* ---------- grown-ups ---------- */
  function renderParent() {
    const w = wallet();
    $('#tpBeads').textContent = w.beads; $('#tpTotal').textContent = `${w.total} earned in total`;
    const tb = $('#tpList'); tb.innerHTML = '';
    list().forEach((t, i) => {
      const tr = document.createElement('tr');
      const cur = String(t.emoji || '').replace(/[\uFE0F\u200D]/g, ''), known = PICK.some(o => o[0] === cur);
      tr.innerHTML = `<td><span class="tp-pick"><span class="tp-pic">${treatArt(t, 44)}</span><select class="txt" data-f="emoji" aria-label="Picture for ${esc(t.name)}">${(known ? PICK : [[cur, 'Present']].concat(PICK.slice(1))).map(o => `<option value="${o[0]}"${o[0] === cur ? ' selected' : ''}>${o[1]}</option>`).join('')}</select></span></td><td><input class="txt" value="${esc(t.name)}" data-f="name"></td><td><input class="txt" type="number" min="1" style="width:80px;min-width:0" value="${t.price}" data-f="price" aria-label="Price in golden beads"> <span class="tp-bead">${root.TOY.bead('mustard', 34, { label: 'golden beads' })}</span></td><td><button class="btn small ghost" data-del>Remove</button></td>`;
      tr.querySelectorAll('input, select').forEach(inp => inp.onchange = () => { const f = inp.dataset.f; t[f] = f === 'price' ? Math.max(1, parseInt(inp.value, 10) || 1) : (inp.value.trim() || t[f]); if (f === 'emoji') tr.querySelector('.tp-pic').innerHTML = treatArt(t, 44); App().saveSettings(); renderJar(); if (App().renderChecklist) App().renderChecklist(); });
      tr.querySelector('[data-del]').onclick = async () => { if (!await root.TOY.confirm(`Remove ${t.name}?`, 'It comes off the treat list. Tickets already bought stay.', { ok: 'Remove', cancel: 'Keep', danger: true })) return; list().splice(i, 1); if (w.goal === t.id) w.goal = null; App().saveSettings(); F().save(); renderParent(); renderJar(); };
      tb.appendChild(tr);
    });
    const open = w.tickets.filter(x => !x.given), done = w.tickets.filter(x => x.given).slice(-8).reverse();
    $('#tpTickets').innerHTML = (open.length ? open.map(x => `<div class="ticket"><span class="tp-pic">${treatArt(x, 34)}</span>${esc(x.name)} <span class="note">${new Date(x.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> <button class="btn small" data-give="${x.id}">Given</button></div>`).join('') : '<div class="note">Nothing waiting.</div>')
      + (done.length ? `<div class="note tp-given" style="margin-top:8px">Recently given: ${done.map(x => `<span class="tp-pic" title="${esc(x.name)}">${treatArt(x, 30)}</span>`).join('')}</div>` : '');
    $('#tpTickets').querySelectorAll('[data-give]').forEach(b => b.onclick = () => { const k = w.tickets.find(x => x.id === b.dataset.give); if (k) { k.given = true; k.givenAt = new Date().toISOString(); F().save(); renderParent(); } });
  }
  function bindParent() {
    $('#tpAdd').onclick = () => { const ids = new Set(list().map(t => t.id)); let i = 1; while (ids.has('t' + i)) i++; list().push({ id: 't' + i, emoji: '\u{1F381}', name: 'New treat', price: 10 }); App().saveSettings(); renderParent(); };
    $('#tpDefaults').onclick = async () => { if (!await root.TOY.confirm('Reset the treat list?', 'This puts back the original six treats and removes any you added or changed.', { ok: 'Reset list', cancel: 'Keep my list' })) return; App().settings.treats = DEFAULT_TREATS.map(t => Object.assign({}, t)); App().saveSettings(); renderParent(); renderJar(); };
    document.querySelectorAll('[data-adj]').forEach(b => b.onclick = () => { const w = wallet(); w.beads = Math.max(0, w.beads + parseInt(b.dataset.adj, 10)); F().save(); renderParent(); renderJar(); });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  root.Treats = { EARN, DEFAULT_TREATS, list, wallet, goal, earn, float, renderJar, jarLine, renderShop, open, wish, renderParent, bindParent };
})(typeof globalThis !== 'undefined' ? globalThis : this);
