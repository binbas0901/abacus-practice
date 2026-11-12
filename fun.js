// Fun layer: Bix the bead mascot, sticker album, practice garden, confetti.
// Reads the app through window.App at call time (app.js defines it before boot).
(function (root) {
  'use strict';
  const $ = s => document.querySelector(s);
  const App = () => root.App;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  /* ---------------- data ---------------- */
  const KEY = 'abacus.fun';
  const data = (() => { try { return Object.assign({ stickers: {}, gold: {}, garden: {}, best: {}, today: null, seen: 0 }, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return { stickers: {}, gold: {}, garden: {}, best: {}, today: null, seen: 0 }; } })();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {} }
  function replace(d) { Object.keys(data).forEach(k => delete data[k]); Object.assign(data, { stickers: {}, gold: {}, garden: {}, best: {}, today: null, seen: 0 }, d || {}); save(); }

  /* ---------------- Bix, the bead mascot (original character) ---------------- */
  let uid = 0;
  function bixSVG() {
    const u = 'bx' + (uid++);
    return `<svg class="bix" viewBox="0 0 120 120" role="img" aria-label="Bix">
<defs><radialGradient id="${u}" cx="36%" cy="30%" r="78%"><stop offset="0" stop-color="#FFE0D4"/><stop offset=".5" stop-color="#F06449"/><stop offset="1" stop-color="#A9361F"/></radialGradient></defs>
<g class="b-body">
  <rect x="56.5" y="6" width="7" height="24" rx="3.5" fill="#7A4A22"/><circle cx="60" cy="8" r="6.5" fill="#FFC83D"/><circle cx="58" cy="6" r="2" fill="#fff" opacity=".7"/>
  <path class="b-arm b-armL" d="M16 70 Q4 62 8 48" stroke="#A9361F" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path class="b-arm b-armR" d="M104 70 Q116 62 112 48" stroke="#A9361F" stroke-width="6" fill="none" stroke-linecap="round"/>
  <ellipse cx="45" cy="103" rx="11" ry="6" fill="#7A4A22"/><ellipse cx="75" cy="103" rx="11" ry="6" fill="#7A4A22"/>
  <path d="M6 63 C 27 24, 93 24, 114 63 C 93 102, 27 102, 6 63 Z" fill="url(#${u})"/>
  <path d="M12 63 L108 63" stroke="#fff" stroke-opacity=".16" stroke-width="3"/>
  <g class="b-eyes"><ellipse cx="45" cy="56" rx="9.5" ry="10.5" fill="#fff"/><ellipse cx="75" cy="56" rx="9.5" ry="10.5" fill="#fff"/>
    <circle cx="46.5" cy="58" r="5.2" fill="#2A2118"/><circle cx="76.5" cy="58" r="5.2" fill="#2A2118"/><circle cx="48.5" cy="55.5" r="1.9" fill="#fff"/><circle cx="78.5" cy="55.5" r="1.9" fill="#fff"/></g>
  <ellipse cx="32" cy="71" rx="6.5" ry="3.6" fill="#FF9AA2" opacity=".85"/><ellipse cx="88" cy="71" rx="6.5" ry="3.6" fill="#FF9AA2" opacity=".85"/>
  <path class="b-smile" d="M51 72 Q60 81 69 72" stroke="#2A2118" stroke-width="3.6" fill="none" stroke-linecap="round"/>
  <path class="b-grin" d="M49 71 Q60 88 71 71 Z" fill="#2A2118"/><path class="b-grin" d="M53 76 Q60 84 67 76 Z" fill="#FF7F8E"/>
  <path class="b-oh" d="M56 75 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0" fill="#2A2118"/>
</g></svg>`;
  }
  const TAP_LINES = [
    '4 and 6 are big friends. Together they make 10!', '2 and 3 are small friends. They make 5!', 'The top bead is worth 5. Each bottom bead is 1.',
    'Thumb pushes beads up. Pointer finger pushes them down!', '7 needs 3 to make 10!', '9 needs 1 to make 10!', '1 and 4 make 5. Small friends!',
    'Hee hee, that tickles!', 'Beads are my cousins 😄', 'Work left to right, like reading!', 'Close your eyes and picture the beads. That is mental math!', '5 and 5 are friends with each other!',
  ];
  const Mascot = {
    mount(el, opts = {}) {
      if (!el) return;
      el.classList.add('bixwrap'); if (opts.size) el.style.setProperty('--bix', opts.size + 'px');
      el.innerHTML = bixSVG() + (opts.bubble === false ? '' : '<div class="bubble"></div>');
      el.querySelector('.bix').addEventListener('pointerdown', () => {
        Mascot.react(el, 'happy'); const a = App(); if (a) a.Sfx.boing();
        Mascot.say(el, pick(TAP_LINES), opts.keep ? 0 : 3500);
      });
    },
    react(el, state, ms = 1300) {
      const s = el && el.querySelector('.bix'); if (!s) return;
      s.classList.remove('happy', 'cheer', 'oops'); void s.getBoundingClientRect(); s.classList.add(state);
      clearTimeout(s._t); s._t = setTimeout(() => s.classList.remove(state), ms);
    },
    say(el, text, ms = 3500) {
      const b = el && el.querySelector('.bubble'); if (!b) return;
      b.textContent = text; b.classList.add('on'); b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
      clearTimeout(b._t); if (ms) b._t = setTimeout(() => b.classList.remove('on'), ms);
    },
    quiet(el) { const b = el && el.querySelector('.bubble'); if (b) b.classList.remove('on'); },
  };

  /* ---------------- stickers ---------------- */
  const PACKS = [
    { id: 'animals', name: 'Animals', items: ['🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🦄', '🦉', '🐢', '🦋', '🐰'] },
    { id: 'ocean', name: 'Ocean', items: ['🐳', '🐬', '🦈', '🐠', '🐡', '🦀', '🐚', '🦑', '🐧', '🦭', '🐙', '🦞'] },
    { id: 'space', name: 'Space', items: ['🚀', '🪐', '🌙', '⭐️', '☄️', '🛸', '🌍', '🌞', '🌈', '🔭', '🌠', '🛰️'] },
    { id: 'treats', name: 'Treats', items: ['🍓', '🍉', '🍩', '🧁', '🍪', '🍭', '🍦', '🥨', '🍒', '🥝', '🍕', '🥞'] },
    { id: 'toys', name: 'Toys', items: ['🎈', '🎨', '🧸', '🪁', '🎸', '🏰', '🎠', '🎡', '⚽️', '🎁', '🪀', '🎪'] },
  ];
  const ALL = PACKS.flatMap(p => p.items.map((e, i) => ({ id: p.id + ':' + i, emoji: e, pack: p.id, packName: p.name })));
  const BYID = Object.fromEntries(ALL.map(s => [s.id, s]));
  function count() { return Object.keys(data.stickers).filter(k => BYID[k]).length; }
  function draw(gold) {
    const have = new Set(Object.keys(data.stickers));
    const fresh = ALL.filter(s => !have.has(s.id));
    const pool = (fresh.length && Math.random() < 0.85) ? fresh : ALL;
    const s = pick(pool); const isNew = !have.has(s.id);
    data.stickers[s.id] = (data.stickers[s.id] || 0) + 1; if (gold) data.gold[s.id] = true; save();
    return Object.assign({}, s, { gold: !!gold, isNew, n: data.stickers[s.id] });
  }
  // Reveal queue: one overlay at a time; give() resolves when that sticker has been collected.
  const queue = []; let showing = false;
  function give(opts = {}) {
    const s = draw(opts.gold);
    return new Promise(res => { queue.push({ s, title: opts.title, res }); if (!showing) next(); });
  }
  function next() {
    const item = queue.shift(); if (!item) { showing = false; return; }
    showing = true; const { s } = item;
    const ov = $('#stickerReveal'); const pack = $('#rvPack'), face = $('#rvFace');
    $('#rvTitle').textContent = item.title || (s.gold ? 'A GOLD sticker!' : 'You earned a sticker!');
    face.textContent = s.emoji; face.classList.toggle('gold', s.gold);
    $('#rvName').textContent = ''; $('#rvOk').style.visibility = 'hidden';
    pack.classList.remove('open'); pack.classList.toggle('gold', s.gold); ov.classList.add('active');
    const open = () => {
      if (pack.classList.contains('open')) return;
      pack.classList.add('open'); const a = App(); if (a) a.Sfx.sparkle();
      $('#rvName').textContent = `${s.packName} sticker` + (s.isNew ? ' — NEW!' : ` — you have ${s.n}`);
      setTimeout(() => { $('#rvOk').style.visibility = 'visible'; }, 350);
    };
    pack.onclick = open; $('#rvOk').onclick = () => { ov.classList.remove('active'); item.res(s); setTimeout(next, 250); };
  }
  function renderAlbum() {
    $('#albumCount').textContent = `${count()} / ${ALL.length}`;
    const box = $('#albumPages'); box.innerHTML = '';
    for (const p of PACKS) {
      const got = p.items.filter((_, i) => data.stickers[p.id + ':' + i]).length;
      const pg = document.createElement('div'); pg.className = 'apage';
      pg.innerHTML = `<div class="ahead">${p.name} <span>${got}/${p.items.length}</span></div><div class="agrid">` +
        p.items.map((e, i) => { const id = p.id + ':' + i, n = data.stickers[id]; return n ? `<div class="slot has${data.gold[id] ? ' gold' : ''}"><span>${e}</span>${n > 1 ? `<b>×${n}</b>` : ''}</div>` : `<div class="slot"><span>?</span></div>`; }).join('') + '</div>';
      box.appendChild(pg);
    }
  }

  /* ---------------- garden (replaces calendar dots; no wilting) ---------------- */
  const FLOWERS = ['🌷', '🌻', '🌼', '🌸', '🌺', '🪻', '🌹', '💐'];
  function renderGarden(el, labelEl, days) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
    el.innerHTML = ''; let n = 0;
    for (let d = 1; d <= today; d++) {
      const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const c = document.createElement('span'); c.className = 'plot';
      if (days[key]) { n++; c.textContent = FLOWERS[(d * 7 + m) % FLOWERS.length]; c.classList.add('bloom'); if (data.garden[key] === 'full') c.classList.add('full'); }
      else if (d === today) { c.textContent = '🌱'; c.classList.add('sprout'); }
      else c.classList.add('soil');
      el.appendChild(c);
    }
    labelEl.textContent = n === 0 ? 'Practise to grow a flower!' : `${n} flower${n === 1 ? '' : 's'} this month`;
  }

  /* ---------------- confetti ---------------- */
  function confetti(n = 90) {
    const box = document.createElement('div'); box.className = 'confetti';
    const colors = ['#F06449', '#FFC83D', '#1F8A7A', '#4A90E2', '#38B26A', '#C86DD7'];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i'); p.style.left = (Math.random() * 100) + '%'; p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.5) + 's'; p.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
      p.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px'); p.style.setProperty('--r', (Math.random() * 900 - 450) + 'deg');
      if (i % 3 === 0) p.style.borderRadius = '50%'; box.appendChild(p);
    }
    document.body.appendChild(box); setTimeout(() => box.remove(), 4200);
  }

  root.Fun = { data, save, replace, Mascot, give, renderAlbum, renderGarden, confetti, ALL, PACKS, count };
})(typeof globalThis !== 'undefined' ? globalThis : this);
