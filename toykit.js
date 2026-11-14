// Toy Table kit — the drawings every screen shares in the "Toy Table" look: Bix the figurine, the number
// friends, lacquered beads, the icon set, and a few small widgets. Pure functions return SVG / HTML strings
// (same spirit as WS in kit.js), so screens stay plain HTML. Styles live in toy.css; rules in design/BRIEF2.md.
//
//   TOY.defs()                         inject the shared <defs> + wood/felt grain once (runs by itself on load)
//   TOY.bix(mood, size, opts)          happy | wave | cheer | think | oops | sleepy | wow | proud   opts.still: no idle motion
//   TOY.moon(mood, size, opts)        the calm second lead: calm | happy | proud | sleepy | wow | wink
//                                      opts.phase 0..1 (crescent -> full, default 1), opts.sky (no stand, for the window), opts.stars
//   TOY.moonName                       her display name (placeholder "Juni"; set it before drawing)
//   TOY.moonPhases(done, total, opts)  a row (or opts.arc) of small phase moons; finished ones glow
//   TOY.skyMoon(mood, phase)           the moon wrapped for the window slot of .toy-scene
//   TOY.buddy(n, size, mood, opts)     number friends 1-9; mood happy | wave | cheer | wow | oops | sleepy | think
//                                      opts.prop: 'glasses' | 'magnifier' | 'book'
//   TOY.pair(a, b, size)               two friends holding hands, with the number they make together
//   TOY.bead(color, size, {dim,tall})  red | mustard | indigo | teal | plum | wood
//   TOY.rodProgress(done, total, cur)  progress beads on a brass rod
//   TOY.icon(name, size, color, opts)  see TOY.ICONS
//   TOY.bubble(html, {title, tail})    tail: 'left' | 'right' | 'side' | 'none'
//   TOY.block(label, {color, icon, small, sub, attrs})
//   TOY.start(label, {icon, small, attrs})   the round teal button on its wooden ring
//   TOY.tag(name, {color, hang}) / TOY.iconButton(icon, label, attrs) / TOY.prop('plant'|'rainbow'|'bowl', size)
//   TOY.keypad(container, {onKey, onBackspace, onCheck, order, mat})  -> { el, setEnabled, destroy }
//   TOY.confirm(title, msg, {ok, cancel, danger})  -> Promise<boolean>   (same API as WS.confirm)
//
// Performance: no SVG filters anywhere. Soft shadows and highlights are radial gradients; wood grain is drawn
// once on a canvas and reused as a CSS background (--toy-grain).
(function () {
  'use strict';

  // ---------- lacquer colours ----------
  const LAC = {
    red:     { hi: '#FF8F70', mid: '#E5402F', lo: '#B52323', deep: '#8A181D', arm: '#D63A2C', ink: '#FFFFFF', line: '#7A1216', mouth: '#4E0D10', blush: '#FFAE9C' },
    mustard: { hi: '#FFE9A6', mid: '#F2B632', lo: '#C98A16', deep: '#9E690D', arm: '#E9A923', ink: '#4A2C06', line: '#7A4E08', mouth: '#4A2606', blush: '#FF9FA8' },
    indigo:  { hi: '#96A5EA', mid: '#3F52A8', lo: '#28357A', deep: '#1B2557', arm: '#3A4B9C', ink: '#FFFFFF', line: '#141C48', mouth: '#10163A', blush: '#FF9FA8' },
    teal:    { hi: '#95EDDC', mid: '#1FA595', lo: '#137A70', deep: '#0C5A54', arm: '#1B978A', ink: '#FFFFFF', line: '#083F3B', mouth: '#06302D', blush: '#FF9FA8' },
    plum:    { hi: '#DDB4F5', mid: '#9255C4', lo: '#6A3596', deep: '#4A2270', arm: '#8549B6', ink: '#FFFFFF', line: '#35164F', mouth: '#2A1040', blush: '#FF9FA8' },
    moon:    { hi: '#FFFFF6', mid: '#FBEFC2', lo: '#EDD288', deep: '#CFA650', arm: '#F3DFA0', ink: '#4A2C10', line: '#7A5A22', mouth: '#4A3212', blush: '#FFB09A' },
    wood:    { hi: '#FFF3DC', mid: '#EFD2A4', lo: '#D2A670', deep: '#B08448', arm: '#DDB580', ink: '#4A2C10', line: '#7A4A24', mouth: '#4A2C10', blush: '#F0B090' },
  };
  const INK = '#2B3674', FACE = '#2A1614';
  const FONT = "Fredoka,'Baloo 2',system-ui,sans-serif";
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r1 = v => Math.round(v * 10) / 10;

  // ---------- shared defs (one hidden SVG) + grain ----------
  function defsMarkup() {
    const lac = Object.keys(LAC).map(k => { const c = LAC[k];
      return `<radialGradient id="toy-lac-${k}" cx=".5" cy=".5" r=".75" fx=".3" fy=".22"><stop offset="0" stop-color="${c.hi}"/><stop offset=".4" stop-color="${c.mid}"/><stop offset=".8" stop-color="${c.lo}"/><stop offset="1" stop-color="${c.deep}"/></radialGradient>`; }).join('');
    return lac
      + '<linearGradient id="toy-g-maple" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6D9AA"/><stop offset="1" stop-color="#DDAE72"/></linearGradient>'
      + '<linearGradient id="toy-g-maple-side" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C79356"/><stop offset="1" stop-color="#A97540"/></linearGradient>'
      + '<linearGradient id="toy-g-post" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F6DAAC"/><stop offset=".45" stop-color="#E6BC82"/><stop offset="1" stop-color="#B98448"/></linearGradient>'
      + '<linearGradient id="toy-g-brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF1B8"/><stop offset=".35" stop-color="#E2B54A"/><stop offset=".7" stop-color="#9C7420"/><stop offset="1" stop-color="#C99A38"/></linearGradient>'
      + '<radialGradient id="toy-g-eye" cx=".45" cy=".4" r=".65"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".8" stop-color="#FBF3EC"/><stop offset="1" stop-color="#E0CCC0"/></radialGradient>'
      + '<radialGradient id="toy-g-shadow"><stop offset="0" stop-color="#3A1E06" stop-opacity=".62"/><stop offset=".55" stop-color="#3A1E06" stop-opacity=".34"/><stop offset="1" stop-color="#3A1E06" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="toy-g-soft"><stop offset="0" stop-color="#fff" stop-opacity=".62"/><stop offset=".6" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="toy-g-glow"><stop offset="0" stop-color="#FFF3B0" stop-opacity=".95"/><stop offset=".55" stop-color="#FFE28A" stop-opacity=".45"/><stop offset="1" stop-color="#FFE28A" stop-opacity="0"/></radialGradient>'
      + '<linearGradient id="toy-g-shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#1A0606" stop-opacity="0"/><stop offset="1" stop-color="#1A0606" stop-opacity=".3"/></linearGradient>'
      + '<linearGradient id="toy-g-rim" x1="0" y1="0" x2="1" y2="1"><stop offset=".6" stop-color="#FFD9A8" stop-opacity="0"/><stop offset="1" stop-color="#FFD9A8" stop-opacity=".5"/></linearGradient>'
      + '<linearGradient id="toy-g-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7FB487"/><stop offset="1" stop-color="#3E7A54"/></linearGradient>'
      + '<linearGradient id="toy-g-pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FBF4E8"/><stop offset="1" stop-color="#CDBFA8"/></linearGradient>'
      + '<radialGradient id="toy-g-moonnight" cx=".5" cy=".5" r=".75" fx=".3" fy=".22"><stop offset="0" stop-color="#B9C0EC"/><stop offset=".5" stop-color="#949DD6"/><stop offset="1" stop-color="#6C75B4"/></radialGradient>'
      + '<radialGradient id="toy-g-moonday" cx=".5" cy=".5" r=".75" fx=".3" fy=".22"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#E6F0F4"/><stop offset="1" stop-color="#C9DCE6"/></radialGradient>'
      + '<linearGradient id="toy-g-lampshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9A8"/><stop offset=".55" stop-color="#FFF6CF"/><stop offset="1" stop-color="#F8C866"/></linearGradient>'
      + '<radialGradient id="toy-g-moonglow"><stop offset=".5" stop-color="#FFF6C8" stop-opacity=".9"/><stop offset=".72" stop-color="#FFEEA8" stop-opacity=".3"/><stop offset="1" stop-color="#FFE9A0" stop-opacity="0"/></radialGradient>'
      + '<radialGradient id="toy-g-moondim" cx=".5" cy=".5" r=".7" fx=".34" fy=".26"><stop offset="0" stop-color="#EDE6D6"/><stop offset=".6" stop-color="#D4CAB6"/><stop offset="1" stop-color="#B3A78F"/></radialGradient>'
      + `<clipPath id="toy-bix-clip"><path d="${BIX_BODY}"/></clipPath>`;
  }

  // Wood grain, drawn once: long wavy streaks that tile in both directions.
  function makeGrain() {
    const W = 512, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); if (!g) return null;
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 300; i++) {
      const y0 = rnd() * H, amp = .4 + rnd() * rnd() * 3.2, k = 1 + Math.floor(rnd() * 2), ph = rnd() * 6.28, k2 = 1 + Math.floor(rnd() * 4), ph2 = rnd() * 6.28;
      const light = rnd() < .3, a = light ? .05 + rnd() * .12 : .03 + rnd() * .12, lw = .5 + rnd() * rnd() * 2.2;
      const col = light ? '255,238,204' : '132,76,28';
      for (let wrap = -1; wrap <= 1; wrap++) {
        const yy = y0 + wrap * H; if (yy < -12 || yy > H + 12) continue;
        for (let x = 0; x < W; x += 16) {
          const f = t => yy + amp * Math.sin(t / W * 6.283 * k + ph);
          const al = a * (.45 + .55 * (.5 + .5 * Math.sin((x + 8) / W * 6.283 * k2 + ph2)));
          g.strokeStyle = `rgba(${col},${al.toFixed(3)})`; g.lineWidth = lw;
          g.beginPath(); g.moveTo(x, f(x)); g.lineTo(x + 16.5, f(x + 16.5)); g.stroke();
        }
      }
    }
    return cv.toDataURL('image/png');
  }
  function makeFelt() {
    const S = 96, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
    const g = cv.getContext('2d'); if (!g) return null;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 2600; i++) {
      const light = rnd() < .45;
      g.fillStyle = light ? `rgba(255,252,240,${(.12 + rnd() * .3).toFixed(2)})` : `rgba(140,112,70,${(.05 + rnd() * .15).toFixed(2)})`;
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
    }
    return cv.toDataURL('image/png');
  }
  let defsDone = false;
  function defs() {
    if (defsDone || typeof document === 'undefined' || !document.body) return;
    defsDone = true;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="toy-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${defsMarkup()}</defs></svg>`;
    document.body.insertBefore(holder.firstChild, document.body.firstChild);
    try {
      const root = document.documentElement.style, grain = makeGrain(), felt = makeFelt();
      if (grain) root.setProperty('--toy-grain', `url(${grain})`);
      if (felt) root.setProperty('--toy-felt-grain', `url(${felt})`);
    } catch (e) { /* toy.css has a plain fallback */ }
  }

  // ---------- small drawing helpers ----------
  const shadow = (cx, cy, rx, ry, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#toy-g-shadow)"${op != null ? ` opacity="${op}"` : ''}/>`;
  const soft = (cx, cy, rx, ry, rot, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="url(#toy-g-soft)"${op != null ? ` opacity="${op}"` : ''}/>`;
  const spec = (cx, cy, rx, ry, rot, op) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${cx} ${cy})" fill="#fff" opacity="${op == null ? .9 : op}"/>`;
  function star(cx, cy, r, fill) {
    let d = '';
    for (let i = 0; i < 10; i++) { const a = (-90 + i * 36) * Math.PI / 180, rr = i % 2 ? r * .5 : r; d += (i ? 'L' : 'M') + r1(cx + rr * Math.cos(a)) + ',' + r1(cy + rr * Math.sin(a)); }
    return `<path d="${d}Z" fill="${fill}" stroke="${fill}" stroke-width="${r1(r * .3)}" stroke-linejoin="round"/>`;
  }
  const sparkle = (cx, cy, r, fill) => `<path d="M${cx},${cy - r} Q${cx + r * .18},${cy - r * .18} ${cx + r},${cy} Q${cx + r * .18},${cy + r * .18} ${cx},${cy + r} Q${cx - r * .18},${cy + r * .18} ${cx - r},${cy} Q${cx - r * .18},${cy - r * .18} ${cx},${cy - r}Z" fill="${fill}"/>`;
  // a lacquered limb: dark outline, colour, a thin sheen, and a ball hand
  function limb(d, hx, hy, L, w, hr, col) {
    w = w || 15; hr = hr == null ? 15 : hr;
    return `<path d="${d}" fill="none" stroke="${L.deep}" stroke-width="${w + 4}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="${L.arm}" stroke-width="${w}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#fff" stroke-width="${r1(w * .2)}" stroke-linecap="round" opacity=".28" transform="translate(${r1(-w * .16)},${r1(-w * .2)})"/>`
      + (hr ? `<circle cx="${hx}" cy="${hy}" r="${hr}" fill="url(#toy-lac-${col})"/>` + spec(r1(hx - hr * .36), r1(hy - hr * .42), r1(hr * .38), r1(hr * .2), -30, .8) : '');
  }
  const foot = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy + ry * .25}" rx="${rx}" ry="${ry}" fill="url(#toy-g-maple-side)"/><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${r1(ry * .92)}" fill="url(#toy-g-maple)"/>`
    + `<ellipse cx="${r1(cx - rx * .28)}" cy="${r1(cy - ry * .4)}" rx="${r1(rx * .42)}" ry="${r1(ry * .28)}" fill="#fff" opacity=".55"/>`;

  // ---------- Bix: a red soroban bead figurine ----------
  const BIX_BODY = 'M-36,-72 Q0,-79 36,-72 C72,-62 106,-24 114,-5 Q119,4 111,13 C92,40 62,66 36,72 Q0,79 -36,72 C-62,66 -92,40 -111,13 Q-119,4 -114,-5 C-106,-24 -72,-62 -36,-72Z';
  const R = LAC.red;
  const ARM = {
    restL: ['M-98,6 Q-124,22 -122,48', -122, 53], restR: ['M98,6 Q124,22 122,48', 122, 53],
    waveR: ['M96,-2 Q124,-12 128,-44', 128, -50],
    upL: ['M-92,-14 Q-130,-36 -126,-82', -126, -88], upR: ['M92,-14 Q130,-36 126,-82', 126, -88],
    outL: ['M-98,2 Q-126,0 -138,-24', -140, -29], outR: ['M98,2 Q126,0 138,-24', 140, -29],
    hipL: ['M-102,0 Q-150,20 -98,42', -90, 44], hipR: ['M102,0 Q150,20 98,42', 90, 44],
    chinR: ['M102,4 Q132,58 58,64', 50, 62],
    headR: ['M96,-8 Q146,-44 100,-70', 92, -73],
    yawnR: ['M102,4 Q136,52 62,50', 54, 47],
    hangL: ['M-98,10 Q-120,30 -112,60', -112, 65], hangR: ['M98,10 Q120,30 112,60', 112, 65],
    shrugL: ['M-98,6 Q-128,14 -138,-6', -140, -11],
  };
  const BROW = {
    happy: ['M-56,-46 Q-40,-55 -22,-48', 'M24,-51 Q42,-60 58,-50'],
    cheer: ['M-60,-56 Q-40,-70 -18,-60', 'M20,-62 Q42,-73 62,-58'],
    think: ['M-58,-47 Q-40,-51 -20,-45', 'M22,-60 Q42,-73 62,-60'],
    oops: ['M-60,-46 Q-44,-56 -22,-55', 'M24,-58 Q46,-60 62,-50'],
    wow: ['M-60,-62 Q-40,-76 -18,-66', 'M20,-68 Q42,-80 62,-66'],
    sleepy: ['M-62,-30 Q-44,-42 -22,-39', 'M24,-40 Q46,-44 64,-32'],
    proud: ['M-58,-40 Q-40,-51 -20,-45', 'M22,-47 Q42,-54 60,-43'],
  };
  const MOUTH = {
    happy: `<path d="M-22,31 Q4,41 33,23 Q31,54 4,55 Q-16,54 -22,31Z" fill="${R.mouth}"/><path d="M-8,50 Q6,40 22,47 Q14,55 4,55 Q-3,55 -8,50Z" fill="#FF8D86"/>`
      + `<path d="M-25,29 Q4,42 34,22" fill="none" stroke="${R.mouth}" stroke-width="4.5" stroke-linecap="round"/><path d="M33,17 Q39,20 37,27" fill="none" stroke="${R.line}" stroke-width="3.5" stroke-linecap="round"/>`,
    wave: `<path d="M-26,28 Q4,40 37,20 Q38,60 5,62 Q-22,60 -26,28Z" fill="${R.mouth}"/><path d="M-21,31 Q4,42 34,24 L33,31 Q5,47 -19,38Z" fill="#fff"/>`
      + `<path d="M-10,56 Q6,45 25,52 Q16,62 5,62 Q-4,62 -10,56Z" fill="#FF8D86"/><path d="M-29,26 Q4,41 38,19" fill="none" stroke="${R.mouth}" stroke-width="4.5" stroke-linecap="round"/>`
      + `<path d="M41,19 Q46,23 43,30" fill="none" stroke="${R.line}" stroke-width="3.5" stroke-linecap="round"/>`,
    cheer: `<path d="M-36,22 Q2,34 42,20 Q44,70 3,72 Q-36,70 -36,22Z" fill="${R.mouth}"/><path d="M-31,25 Q2,37 38,23 L37,31 Q3,46 -29,34Z" fill="#fff"/>`
      + `<path d="M-16,65 Q3,50 26,61 Q16,72 3,72 Q-9,72 -16,65Z" fill="#FF8D86"/><path d="M-39,20 Q2,35 44,17" fill="none" stroke="${R.mouth}" stroke-width="4.5" stroke-linecap="round"/>`,
    think: `<path d="M2,37 Q18,47 32,35" fill="none" stroke="${R.mouth}" stroke-width="5.5" stroke-linecap="round"/><path d="M32,29 Q38,33 35,40" fill="none" stroke="${R.line}" stroke-width="3.5" stroke-linecap="round"/>`,
    oops: `<path d="M-24,38 Q-13,29 -2,38 Q9,47 20,38 Q26,33 31,36" fill="none" stroke="${R.mouth}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    sleepy: `<ellipse cx="2" cy="42" rx="15" ry="18" fill="${R.mouth}"/><path d="M-9,53 Q2,44 13,53 Q8,60 2,60 Q-4,60 -9,53Z" fill="#FF8D86"/><path d="M-8,29 Q2,26 12,29" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>`,
    wow: `<ellipse cx="3" cy="44" rx="15" ry="19" fill="${R.mouth}"/><path d="M-8,56 Q3,46 14,56 Q9,63 3,63 Q-3,63 -8,56Z" fill="#FF8D86"/>`,
    proud: `<path d="M-30,30 Q4,58 40,26" fill="none" stroke="${R.mouth}" stroke-width="6" stroke-linecap="round"/><path d="M-36,25 Q-30,26 -28,33" fill="none" stroke="${R.line}" stroke-width="3.5" stroke-linecap="round"/>`
      + `<path d="M40,20 Q45,24 42,31" fill="none" stroke="${R.line}" stroke-width="3.5" stroke-linecap="round"/>`,
  };
  // e: { t:'open'|'arcUp'|'arcDown', px, py, s, ps }
  function bixEyes(e) {
    const st = `fill="none" stroke="#4E0D10" stroke-width="6.5" stroke-linecap="round"`;
    if (e.t === 'arcUp') return `<g ${st}><path d="M-60,-3 Q-36,-34 -12,-3"/><path d="M14,-4 Q38,-35 62,-4"/></g>`;
    if (e.t === 'arcDown') return `<g ${st}><path d="M-60,-12 Q-36,9 -12,-12"/><path d="M14,-13 Q38,8 62,-13"/></g>`
      + `<g fill="none" stroke="#4E0D10" stroke-width="3.5" stroke-linecap="round"><path d="M-58,-9 l-7,4"/><path d="M60,-10 l7,4"/></g>`;
    const s = e.s || 1, ps = e.ps || 1, px = e.px || 0, py = e.py || 0;
    const one = (cx, cy, rx, ry, pr, ox) => {
      const X = cx + ox + px, Y = cy + 1 + py, P = pr * ps;
      return `<g transform="translate(${cx},${cy}) scale(${s}) translate(${-cx},${-cy})">`
        + `<ellipse cx="${cx + 1.5}" cy="${cy + 3.5}" rx="${rx + .5}" ry="${ry + .5}" fill="#5C0A10" opacity=".38"/>`
        + `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#toy-g-eye)"/>`
        + `<circle cx="${X}" cy="${Y}" r="${r1(P)}" fill="${FACE}"/>`
        + `<circle cx="${r1(X - P * .38)}" cy="${r1(Y - P * .45)}" r="${r1(P * .38)}" fill="#fff"/><circle cx="${r1(X + P * .4)}" cy="${r1(Y + P * .4)}" r="${r1(P * .17)}" fill="#fff" opacity=".85"/>`
        + (e.blink === false ? '' : `<ellipse class="toy-lid" cx="${cx}" cy="${cy}" rx="${rx + 1}" ry="${ry + 1}" fill="#D2392B"/>`)
        + `</g>`;
    };
    return one(-36, -8, 26, 29, 15.5, 6) + one(38, -9, 25, 28, 15, 5);
  }
  const zed = (x, y, s, op) => `<path d="M${x},${y} h${s} l${-s},${s} h${s}" fill="none" stroke="${INK}" stroke-width="${r1(s * .3)}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
  const BIX = {
    happy: { back: ['restL', 'restR'], eyes: {}, brow: 'happy', mouth: 'happy' },
    wave: { back: ['restL', 'waveR'], eyes: { px: 1 }, brow: 'cheer', mouth: 'wave', tilt: -3,
      fx: `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".9"><path d="M150,-76 Q158,-58 152,-40"/><path d="M104,-78 Q98,-62 103,-46"/></g>` },
    cheer: { back: ['upL', 'upR'], eyes: { t: 'arcUp' }, brow: 'cheer', mouth: 'cheer', lift: 14,
      fx: star(-78, -140, 15, '#F2B632') + star(84, -152, 12, '#1FA595') + sparkle(0, -160, 13, '#FFFDF6') + sparkle(-150, -40, 9, '#FFFDF6') + sparkle(152, -30, 10, '#FFFDF6')
        + `<circle cx="-46" cy="-158" r="5.5" fill="#3F52A8"/><circle cx="46" cy="-132" r="5" fill="#E5402F"/><circle cx="-150" cy="-110" r="5" fill="#1FA595"/><circle cx="150" cy="-118" r="5.5" fill="#F2B632"/>` },
    think: { back: ['restL'], front: ['chinR'], eyes: { px: 2, py: -9, blink: false }, brow: 'think', mouth: 'think', tilt: 4,
      fx: `<g fill="#FFFDF6" stroke="#E6DAC0" stroke-width="2"><circle cx="100" cy="-84" r="6"/><circle cx="116" cy="-106" r="9.5"/><circle cx="134" cy="-140" r="19"/></g>`
        + `<path d="M127,-146 q1,-9 9,-8 q7,1 5,8 q-2,4 -6,6 v3" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="135" cy="-129" r="2.6" fill="${INK}"/>` },
    oops: { back: ['shrugL'], front: ['headR'], eyes: { px: -10, py: 4 }, brow: 'oops', mouth: 'oops', tilt: -5,
      fx: `<path d="M-92,-96 q-10,14 -1,20 q9,-6 1,-20Z" fill="#BFE4F2" stroke="#7FB9D6" stroke-width="2" stroke-linejoin="round"/><path d="M-118,-70 q-7,10 -1,14 q7,-4 1,-14Z" fill="#BFE4F2" stroke="#7FB9D6" stroke-width="2" stroke-linejoin="round"/>` },
    sleepy: { back: ['hangL'], front: ['yawnR'], eyes: { t: 'arcDown' }, brow: 'sleepy', mouth: 'sleepy', tilt: -6, sink: 3,
      fx: zed(84, -98, 13, .9) + zed(108, -128, 17, .75) + zed(136, -164, 21, .55) },
    wow: { back: ['outL', 'outR'], eyes: { s: 1.16, ps: .7, py: -1 }, brow: 'wow', mouth: 'wow', lift: 5,
      fx: `<g fill="none" stroke="#FFFDF6" stroke-width="6" stroke-linecap="round"><path d="M-60,-112 L-70,-136"/><path d="M0,-124 L0,-150"/><path d="M60,-112 L70,-136"/><path d="M-108,-82 L-126,-98"/><path d="M108,-82 L126,-98"/></g>` },
    proud: { front: ['hipL', 'hipR'], eyes: { t: 'arcUp' }, brow: 'proud', mouth: 'proud', tilt: 3, faceY: -5,
      fx: star(118, -116, 21, '#F2B632') + `<circle cx="113" cy="-122" r="4" fill="#fff" opacity=".8"/>` + sparkle(148, -84, 8, '#FFFDF6') + sparkle(86, -146, 7, '#FFFDF6') },
  };
  function bix(mood, size, opts) {
    const key = BIX[mood] ? mood : 'happy', M = BIX[key]; size = size || 120; opts = opts || {};
    const lift = M.lift || 0, sink = M.sink || 0, sh = 1 - lift / 40;
    const arms = list => (list || []).map(n => limb(ARM[n][0], ARM[n][1], ARM[n][2], R, 15, 15, 'red')).join('');
    const brow = BROW[M.brow].map(d => `<path d="${d}" fill="none" stroke="${R.line}" stroke-width="5.5" stroke-linecap="round"/>`).join('');
    const body = `<path d="${BIX_BODY}" fill="url(#toy-lac-red)"/><g clip-path="url(#toy-bix-clip)">`
      + `<path d="M-120,2 Q0,26 120,2 V90 H-120Z" fill="#5C0A10" opacity=".2"/>`
      + `<path d="M-116,2 Q0,26 116,2" fill="none" stroke="#FFD0BE" stroke-width="3" opacity=".5"/>`
      + `<path d="M-84,46 C-60,64 -36,71 0,76 C40,73 64,63 90,40" fill="none" stroke="#FFB27A" stroke-width="5" opacity=".42" stroke-linecap="round"/>`
      + soft(-50, -44, 52, 20, -27) + spec(-66, -38, 13, 5, -40, .92) + `<circle cx="-44" cy="-56" r="3.5" fill="#fff" opacity=".9"/>`
      + `<ellipse cx="0" cy="-74" rx="30" ry="5" fill="#5C0A10" opacity=".22"/></g>`;
    const blush = `<ellipse cx="-78" cy="24" rx="21" ry="11" fill="#FFAE9C" opacity=".62"/><ellipse cx="76" cy="22" rx="21" ry="11" fill="#FFAE9C" opacity=".62"/>`
      + `<ellipse cx="-78" cy="24" rx="13" ry="6" fill="#FFBFAE" opacity=".6"/><ellipse cx="76" cy="22" rx="13" ry="6" fill="#FFBFAE" opacity=".6"/>`;
    const peg = `<rect x="-9" y="-100" width="18" height="34" rx="6" fill="url(#toy-g-post)"/><circle cx="0" cy="-104" r="14" fill="url(#toy-g-maple-side)"/><circle cx="-1" cy="-106" r="13" fill="url(#toy-g-maple)"/><ellipse cx="-5" cy="-111" rx="5" ry="3" fill="#fff" opacity=".7"/>`;
    const face = `<g transform="translate(0,${M.faceY || 0})">${blush}${bixEyes(M.eyes)}${brow}<g class="toy-bix-mouth">${MOUTH[M.mouth]}</g></g>`;
    return `<span class="toy-bix toy-bix--${key}${opts.still ? ' toy-still' : ''}"><svg width="${size}" height="${size}" viewBox="-160 -190 320 320" role="img" aria-label="${esc(opts.label || 'Bix')}">`
      + shadow(40, 100, r1(128 * sh), r1(15 * sh), .4) + shadow(6, 98, r1(92 * sh), r1(12 * sh), .95)
      + `<g transform="translate(0,${sink - lift})">`
      + `<rect x="-44" y="60" width="13" height="28" rx="6" fill="${R.deep}"/><rect x="32" y="60" width="13" height="28" rx="6" fill="${R.deep}"/>`
      + foot(-42, 87, 29, 12.5) + foot(42, 87, 29, 12.5)
      + `<g transform="rotate(${M.tilt || 0} 0 70)"><g class="toy-bix-breathe">${arms(M.back)}${peg}${body}${face}${arms(M.front)}</g></g>`
      + `</g>${M.fx || ''}</svg></span>`;
  }

  // ---------- number friends 1-9 ----------
  // Big friends (make 10) share a lacquer colour: 1&9 red, 2&8 plum, 3&7 teal, 4&6 indigo, 5&5 gold.
  // Small friends (make 5) share a hat: 1&4 a wooden knob, 2&3 a brass ring. 5 sits on a brass rod stub.
  // Every number has its own bead silhouette and grows a little with its value.
  const SH = {
    1: { c: 'red', k: .76, W: 46, H: 46, B: 46, d: 'M0,-46 C25.4,-46 46,-25.4 46,0 C46,25.4 25.4,46 0,46 C-25.4,46 -46,25.4 -46,0 C-46,-25.4 -25.4,-46 0,-46Z', ey: -15, dx: 15, fs: 1.08, my: 1, ny: 37, ns: 29, sp: [-21, -25, -38], sy: 6, hat: 'knob' },
    2: { c: 'plum', k: .76, W: 46, H: 56, B: 56, d: 'M0,-56 C30,-56 46,-14 46,14 C46,42 26,56 0,56 C-26,56 -46,42 -46,14 C-46,-14 -30,-56 0,-56Z', ey: -15, dx: 15, fs: 1.05, my: 3, ny: 44, ns: 31, sp: [-20, -32, -55], sy: 12, hat: 'ring' },
    3: { c: 'teal', k: .8, W: 50, H: 54, B: 52, d: 'M-50,30 C-50,-20 -30,-54 0,-54 C30,-54 50,-20 50,30 Q50,52 28,52 H-28 Q-50,52 -50,30Z', ey: -16, dx: 16, fs: 1.05, my: 2, ny: 42, ns: 32, sp: [-24, -29, -55], sy: 14, hat: 'ring' },
    4: { c: 'indigo', k: .84, W: 55, H: 60, B: 60, d: 'M0,-60 Q8,-60 14,-53 L50,-9 Q57,0 50,9 L14,53 Q8,60 0,60 Q-8,60 -14,53 L-50,9 Q-57,0 -50,-9 L-14,-53 Q-8,-60 0,-60Z', ey: -15, dx: 15, fs: 1, my: 2, ny: 41, ns: 29, sp: [-22, -27, -50], sy: 0, hat: 'knob', facet: 'M0,-60 Q8,-60 14,-53 L50,-9 Q57,0 50,9 L14,53 Q8,60 0,60 Q9,0 0,-60Z' },
    5: { c: 'mustard', k: .9, W: 66, H: 48, B: 48, d: 'M-20,-46 Q0,-50 20,-46 C42,-40 60,-14 65,-3 Q68,2 64,8 C54,26 38,42 20,46 Q0,50 -20,46 C-38,42 -54,26 -64,8 Q-68,2 -65,-3 C-60,-14 -42,-40 -20,-46Z', ey: -16, dx: 17, fs: 1, my: 0, ny: 37, ns: 29, sp: [-32, -24, -33], sy: 2, hat: 'rod', seam: 'M-65,2 Q0,15 65,2' },
    6: { c: 'indigo', k: .93, W: 48, H: 50, B: 50, d: 'M-24,-50 H24 Q48,-50 48,-26 V26 Q48,50 24,50 H-24 Q-48,50 -48,26 V-26 Q-48,-50 -24,-50Z', ey: -17, dx: 16, fs: 1, my: 2, ny: 41, ns: 32, sp: [-25, -35, -24], sy: 8 },
    7: { c: 'teal', k: .97, W: 40, H: 62, B: 62, d: 'M0,-62 C24,-62 40,-46 40,-24 V24 C40,46 24,62 0,62 C-24,62 -40,46 -40,24 V-24 C-40,-46 -24,-62 0,-62Z', ey: -24, dx: 14, fs: .95, my: -5, ny: 42, ns: 34, sp: [-19, -42, -62], sy: 6 },
    8: { c: 'plum', k: 1.0, W: 48, H: 67, B: 68, d: 'M0,-66 C22,-66 37,-50 37,-31 C37,-20 33,-12 30,-7 C40,0 48,12 48,24 C48,50 28,68 0,68 C-28,68 -48,50 -48,24 C-48,12 -40,0 -30,-7 C-33,-12 -37,-20 -37,-31 C-37,-50 -22,-66 0,-66Z', ey: -36, dx: 13, fs: .92, my: -19, ny: 45, ns: 34, sp: [-17, -48, -45], sp2: [-27, 6, -45], sy: 14 },
    9: { c: 'red', k: 1.04, W: 50, H: 62, B: 62, d: 'M-8,-57 Q0,-62 8,-57 L44,-36 Q50,-32 50,-24 V24 Q50,32 44,36 L8,57 Q0,62 -8,57 L-44,36 Q-50,32 -50,24 V-24 Q-50,-32 -44,-36Z', ey: -22, dx: 16, fs: 1, my: -3, ny: 43, ns: 36, sp: [-27, -32, -60], sy: 6, facet: 'M-50,26 Q-50,32 -44,36 L-8,57 Q0,62 8,57 L44,36 Q50,32 50,26 Q0,44 -50,26Z' },
  };
  function buddyFace(S, L, mood, look, prop) {
    const dx = S.dx, shut = mood === 'sleepy', up = mood === 'cheer';
    const big = mood === 'wow' ? 1.12 : 1, pr = mood === 'wow' ? 5 : 7;
    const px = look * 3 + (mood === 'oops' ? -3 : 0), py = mood === 'think' ? -4 : mood === 'oops' ? 3 : 0;
    const eye = sx => {
      const cx = sx * dx;
      if (shut) return `<path d="M${cx - 10},-1 Q${cx},9 ${cx + 10},-1" fill="none" stroke="${L.mouth}" stroke-width="4" stroke-linecap="round"/>`;
      if (up) return `<path d="M${cx - 10},3 Q${cx},-12 ${cx + 10},3" fill="none" stroke="${L.mouth}" stroke-width="4.5" stroke-linecap="round"/>`;
      const X = cx + px + (sx < 0 ? 1.5 : -1.5) * (look ? 0 : 1), Y = 1 + py;
      return `<g transform="translate(${cx},0) scale(${big}) translate(${-cx},0)"><ellipse cx="${cx + 1}" cy="2.4" rx="12" ry="13.5" fill="${L.deep}" opacity=".5"/><ellipse cx="${cx}" cy="0" rx="11.5" ry="13" fill="url(#toy-g-eye)"/>`
        + `<circle cx="${r1(X)}" cy="${Y}" r="${pr}" fill="${FACE}"/><circle cx="${r1(X - pr * .4)}" cy="${r1(Y - pr * .45)}" r="${r1(pr * .4)}" fill="#fff"/><circle cx="${r1(X + pr * .4)}" cy="${r1(Y + pr * .45)}" r="${r1(pr * .17)}" fill="#fff" opacity=".8"/></g>`;
    };
    const my = S.my - S.ey;   // mouth centre relative to the eye line
    const mouth = {
      happy: `<path d="M-10,${my} Q0,${my + 13} 10,${my}Z" fill="${L.mouth}" stroke="${L.mouth}" stroke-width="3.5" stroke-linejoin="round"/><path d="M-5,${my + 5.5} Q0,${my + 2.5} 5,${my + 5.5} Q0,${my + 8.5} -5,${my + 5.5}Z" fill="#FF8D86"/>`,
      cheer: `<path d="M-12,${my - 1} Q0,${my + 20} 12,${my - 1}Z" fill="${L.mouth}" stroke="${L.mouth}" stroke-width="3.5" stroke-linejoin="round"/><path d="M-6,${my + 8} Q0,${my + 3} 6,${my + 8} Q0,${my + 13} -6,${my + 8}Z" fill="#FF8D86"/>`,
      wow: `<ellipse cx="0" cy="${my + 5}" rx="6" ry="7.5" fill="${L.mouth}"/>`,
      oops: `<path d="M-11,${my + 5} Q-5.5,${my} 0,${my + 5} Q5.5,${my + 10} 11,${my + 4}" fill="none" stroke="${L.mouth}" stroke-width="4" stroke-linecap="round"/>`,
      sleepy: `<ellipse cx="0" cy="${my + 6}" rx="4.5" ry="5.5" fill="${L.mouth}"/>`,
      think: `<path d="M-3,${my + 5} Q5,${my + 1} 12,${my + 5}" fill="none" stroke="${L.mouth}" stroke-width="4" stroke-linecap="round"/>`,
    };
    const brows = mood === 'oops' ? `<g fill="none" stroke="${L.line}" stroke-width="3.5" stroke-linecap="round"><path d="M${-dx - 9},-18 Q${-dx},-23 ${-dx + 8},-24"/><path d="M${dx - 8},-24 Q${dx},-23 ${dx + 9},-18"/></g>`
      : mood === 'wow' || mood === 'cheer' ? `<g fill="none" stroke="${L.line}" stroke-width="3.5" stroke-linecap="round"><path d="M${-dx - 8},-21 Q${-dx},-27 ${-dx + 8},-22"/><path d="M${dx - 8},-22 Q${dx},-27 ${dx + 8},-21"/></g>` : '';
    const glasses = prop === 'glasses' || prop === 'book' ? `<g fill="none" stroke="${INK}" stroke-width="3.6"><circle cx="${-dx}" cy="0" r="15.5"/><circle cx="${dx}" cy="0" r="15.5"/><path d="M${-dx + 15.5},-1 Q0,-6 ${dx - 15.5},-1" stroke-linecap="round"/></g>`
      + `<path d="M${-dx - 10},-8 q4,-5 10,-5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>` : '';
    const blush = `<ellipse cx="${-dx - 12}" cy="${my + 1}" rx="7.5" ry="4.2" fill="${L.blush}" opacity=".5"/><ellipse cx="${dx + 12}" cy="${my + 1}" rx="7.5" ry="4.2" fill="${L.blush}" opacity=".5"/>`;
    return `<g transform="translate(0,${S.ey}) scale(${S.fs})">${blush}${eye(-1)}${eye(1)}${brows}${glasses}${mouth[mood] || mouth.happy}</g>`;
  }
  // One friend standing at (cx, ground). o.hands = { L:[x,y], R:[x,y] } pins a hand (outer coordinates).
  function buddyG(n, cx, gy, mood, o) {
    n = SH[n] ? n : 1; o = o || {}; mood = mood || 'happy';
    const S = SH[n], L = LAC[S.c], k = S.k, leg = 11;
    const lift = mood === 'cheer' ? 7 : 0, cy = gy - leg - S.B * k - lift, sh = 1 - lift / 30;
    const sxL = cx - S.W * k * .86, sxR = cx + S.W * k * .86, sY = cy + S.sy * k;
    const upR = mood === 'wave' || mood === 'cheer' || o.prop === 'magnifier', upL = mood === 'cheer';
    const out = mood === 'wow' || mood === 'oops';
    const hands = o.hands || {};
    const hL = hands.L || (upL ? [sxL - 15, sY - 27] : out ? [sxL - 21, sY - 6] : [sxL - 13, sY + 22]);
    const hR = hands.R || (upR ? [sxR + 15, sY - 27] : out ? [sxR + 21, sY - 6] : [sxR + 13, sY + 22]);
    const arm = (sx, h, dir) => {
      const mx = (sx + h[0]) / 2 + dir * 7, myy = (sY + h[1]) / 2 + (h[1] < sY ? 5 : -3);
      return limb(`M${r1(sx)},${r1(sY)} Q${r1(mx)},${r1(myy)} ${r1(h[0])},${r1(h[1])}`, r1(h[0]), r1(h[1]), L, 7, 7.5, S.c);
    };
    const fx = 12 * k + 5, by = cy + S.B * k;
    const legs = `<rect x="${r1(cx - fx - 3.5)}" y="${r1(by - 5)}" width="7" height="${leg + 5 + lift}" rx="3.5" fill="${L.deep}"/><rect x="${r1(cx + fx - 3.5)}" y="${r1(by - 5)}" width="7" height="${leg + 5 + lift}" rx="3.5" fill="${L.deep}"/>`
      + foot(r1(cx - fx - 1), gy - 4.5 - lift, 12.5, 6) + foot(r1(cx + fx + 1), gy - 4.5 - lift, 12.5, 6);
    const hat = S.hat === 'knob' ? `<rect x="-4.5" y="${-S.H - 13}" width="9" height="17" rx="3.5" fill="url(#toy-g-post)"/><circle cx="0" cy="${-S.H - 16}" r="8.5" fill="url(#toy-g-maple-side)"/><circle cx="-.6" cy="${-S.H - 17}" r="7.8" fill="url(#toy-g-maple)"/><ellipse cx="-3" cy="${-S.H - 20}" rx="3" ry="1.8" fill="#fff" opacity=".7"/>`
      : S.hat === 'ring' ? `<rect x="-5" y="${-S.H - 4}" width="10" height="8" rx="3" fill="url(#toy-g-brass)"/><circle cx="0" cy="${-S.H - 13}" r="8.5" fill="none" stroke="#8E6A1C" stroke-width="5.6"/><circle cx="0" cy="${-S.H - 13}" r="8.5" fill="none" stroke="#E8BD52" stroke-width="3.6"/><path d="M-7,${-S.H - 17} a8.5,8.5 0 0 1 8,-4.5" fill="none" stroke="#FFF1B8" stroke-width="1.8" stroke-linecap="round"/>`
        : S.hat === 'rod' ? `<rect x="-4.5" y="${-S.H - 15}" width="9" height="19" rx="2" fill="url(#toy-g-post)"/><rect x="-7.5" y="${-S.H - 19}" width="15" height="7" rx="3.5" fill="url(#toy-g-brass)"/>` : '';
    const sp = S.sp, body = `<g transform="translate(${r1(cx)},${r1(cy)}) scale(${k})">${hat}`
      + `<path d="${S.d}" fill="url(#toy-lac-${S.c})"/><path d="${S.d}" fill="url(#toy-g-shade)"/><path d="${S.d}" fill="url(#toy-g-rim)"/>`
      + (S.facet ? `<path d="${S.facet}" fill="#1A0606" opacity=".16"/>` : '')
      + (S.seam ? `<path d="${S.seam}" fill="none" stroke="#fff" stroke-width="2.2" opacity=".45"/>` : '')
      + soft(sp[0] + 4, sp[1] + 2, 24, 11, sp[2], .9) + spec(sp[0], sp[1], 9, 3.6, sp[2], .92) + `<circle cx="${sp[0] + 12}" cy="${sp[1] - 11}" r="2.2" fill="#fff" opacity=".85"/>`
      + (S.sp2 ? soft(S.sp2[0] + 4, S.sp2[1] + 3, 20, 9, S.sp2[2], .7) + spec(S.sp2[0], S.sp2[1], 7, 2.8, S.sp2[2], .7) : '')
      + buddyFace(S, L, mood, o.look || 0, o.prop)
      + (o.prop === 'book' ? '' : `<text x="1.2" y="${S.ny + 2}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${S.ns}" fill="${L.deep}" opacity=".55">${n}</text><text x="0" y="${S.ny}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${S.ns}" fill="${L.ink}">${n}</text>`)
      + `</g>`;
    let front = '';
    if (o.prop === 'magnifier') {
      const x = hR[0], y = hR[1];
      front = `<path d="M${r1(x)},${r1(y)} L${r1(x + 9)},${r1(y - 16)}" stroke="#7A4A24" stroke-width="6.5" stroke-linecap="round"/><circle cx="${r1(x + 15)}" cy="${r1(y - 30)}" r="15" fill="#DDF3F8" opacity=".75"/>`
        + `<circle cx="${r1(x + 15)}" cy="${r1(y - 30)}" r="15" fill="none" stroke="#9C7420" stroke-width="6"/><circle cx="${r1(x + 15)}" cy="${r1(y - 30)}" r="15" fill="none" stroke="#E8BD52" stroke-width="3.4"/>`
        + `<path d="M${r1(x + 6)},${r1(y - 35)} q3,-7 10,-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="${r1(x)}" cy="${r1(y)}" r="7.5" fill="url(#toy-lac-${S.c})"/>`;
    } else if (o.prop === 'book') {
      const y = cy + (S.ny - 16) * k;
      front = `<g transform="translate(${r1(cx)},${r1(y)})"><path d="M-27,-9 Q-13,-15 0,-9 Q13,-15 27,-9 V13 Q13,7 0,13 Q-13,7 -27,13Z" fill="#B52323"/><path d="M-24,-11 Q-12,-16 0,-10 Q12,-16 24,-11 V9 Q12,4 0,10 Q-12,4 -24,9Z" fill="#FFFDF6"/>`
        + `<path d="M0,-10 V10" stroke="#D9CEB8" stroke-width="2"/><g stroke="#C9BBA0" stroke-width="1.6" stroke-linecap="round"><path d="M-19,-6 q7,-3 14,0M-19,-1 q7,-3 14,0M5,-6 q7,-3 14,0M5,-1 q7,-3 14,0"/></g>`
        + `<circle cx="-27" cy="4" r="7.5" fill="url(#toy-lac-${S.c})"/><circle cx="27" cy="4" r="7.5" fill="url(#toy-lac-${S.c})"/></g>`;
    }
    const zz = mood === 'sleepy' ? zed(r1(cx + S.W * k * .7), r1(cy - S.H * k - 8), 7, .85) + zed(r1(cx + S.W * k * .7 + 12), r1(cy - S.H * k - 24), 9, .6) : '';
    const drop = mood === 'oops' ? `<path d="M${r1(cx - S.W * k * .8)},${r1(cy - S.H * k - 4)} q-5,8 0,11 q5,-3 0,-11Z" fill="#BFE4F2" stroke="#7FB9D6" stroke-width="1.5" stroke-linejoin="round"/>` : '';
    return shadow(r1(cx + 10), gy + 1, r1((S.W * k + 26) * sh), r1(7.5 * sh), .4) + shadow(r1(cx + 2), gy, r1((S.W * k * .8 + 8) * sh), r1(5.5 * sh), .95)
      + (o.prop === 'book' ? '' : arm(sxL, hL, -1) + arm(sxR, hR, 1)) + legs + body + front + zz + drop;
  }
  function buddy(n, size, mood, opts) {
    size = size || 96; n = SH[n] ? +n : 1;
    return `<span class="toy-buddy toy-buddy--${n}"><svg width="${size}" height="${size}" viewBox="-84 -142 168 168" role="img" aria-label="${n}">${buddyG(n, 0, 16, mood, opts)}</svg></span>`;
  }
  function pair(a, b, size, opts) {
    size = size || 110; a = SH[a] ? +a : 1; b = SH[b] ? +b : 1; opts = opts || {};
    const A = SH[a], B = SH[b], gap = 34, wa = A.W * A.k, wb = B.W * B.k, tot = wa * 2 + wb * 2 + gap, gy = 16;
    const ax = -tot / 2 + wa, bx = tot / 2 - wb, mid = ax + wa + gap / 2;
    const hy = gy - 11 - Math.min(A.B * A.k, B.B * B.k) * .72, sum = a + b;
    const g = buddyG(a, ax, gy, opts.mood || 'happy', { look: 1, hands: { R: [mid - 9, hy] } }) + buddyG(b, bx, gy, opts.mood || 'happy', { look: -1, hands: { L: [mid + 9, hy] } });
    const disc = opts.sum === false ? '' : `<circle cx="${r1(mid + 1)}" cy="${r1(hy + 2.5)}" r="14" fill="url(#toy-g-maple-side)"/><circle cx="${r1(mid)}" cy="${r1(hy)}" r="14" fill="url(#toy-g-maple)"/><circle cx="${r1(mid)}" cy="${r1(hy)}" r="12.6" fill="none" stroke="#FFF3D8" stroke-width="1.4" opacity=".8"/>`
      + `<text x="${r1(mid)}" y="${r1(hy + 5.6)}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${sum > 9 ? 15 : 17}" fill="${INK}">${sum}</text>`;
    return `<span class="toy-pair"><svg width="${Math.round(size * 1.88)}" height="${size}" viewBox="-158 -142 316 168" role="img" aria-label="${a} and ${b} make ${sum}">${g}${disc}</svg></span>`;
  }

  // ---------- the moon: the calm second lead (glazed cream ceramic; the lit part is glazed, the rest is matte) ----------
  // Lit shape for a waxing moon of radius r: p = 0..1 of the disc lit, growing from the right edge.
  function litPath(r, p, cx, cy) {
    cx = cx || 0; cy = cy || 0;
    if (p >= .995) return `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0Z`;
    const tx = r1(Math.abs(1 - 2 * p) * r);
    return `M${cx},${cy - r} A${r},${r} 0 0 1 ${cx},${cy + r} A${tx},${r} 0 0 ${p < .5 ? 0 : 1} ${cx},${cy - r}Z`;
  }
  const ML = LAC.moon, MEYE = '#3A2A1A';
  const MOON = {
    calm: { eyes: 'lid', mouth: 'smile' },
    happy: { eyes: 'open', mouth: 'grin' },
    proud: { eyes: 'up', mouth: 'grin', stars: true },
    sleepy: { eyes: 'down', mouth: 'tiny', zz: true },
    wow: { eyes: 'round', mouth: 'o', spark: true },
    wink: { eyes: 'wink', mouth: 'grin', twinkle: true },
  };
  function moonFace(M, narrow, thin) {
    const D = narrow ? 12.5 : 15, BL = narrow ? 21 : 27;
    const arcUp = cx => `<path d="M${cx - 8},-3 Q${cx},-14 ${cx + 8},-3" fill="none" stroke="${MEYE}" stroke-width="3.6" stroke-linecap="round"/>`;
    const arcDn = cx => `<path d="M${cx - 8},-8 Q${cx},1 ${cx + 8},-8" fill="none" stroke="${MEYE}" stroke-width="3.4" stroke-linecap="round"/><path d="M${cx + (cx < 0 ? -8 : 8)},-7 l${cx < 0 ? -3.5 : 3.5},2.5" stroke="${MEYE}" stroke-width="2.2" stroke-linecap="round"/>`;
    const open = (cx, rx, ry) => `<ellipse cx="${cx}" cy="-6" rx="${rx}" ry="${ry}" fill="${MEYE}"/><circle cx="${cx - rx * .3}" cy="${r1(-6 - ry * .38)}" r="${r1(rx * .42)}" fill="#fff"/><circle cx="${cx + rx * .35}" cy="${r1(-6 + ry * .4)}" r="${r1(rx * .18)}" fill="#fff" opacity=".8"/>`;
    const lid = cx => open(cx, 6.2, 7) + `<path d="M${cx - 9.5},-12 Q${cx},-20.5 ${cx + 9.5},-12" fill="none" stroke="${ML.line}" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`;
    const E = { lid: lid(-D) + lid(D), open: open(-D, 6.4, 8.2) + open(D, 6.4, 8.2), up: arcUp(-D) + arcUp(D), down: arcDn(-D) + arcDn(D),
      round: open(-D, 8, 9.4) + open(D, 8, 9.4) + `<g fill="none" stroke="${ML.line}" stroke-width="2.6" stroke-linecap="round"><path d="M${-D - 8},-21 Q${-D},-25 ${-D + 7},-22"/><path d="M${D - 7},-22 Q${D},-25 ${D + 8},-21"/></g>`,
      wink: open(-D, 6.4, 8.2) + arcUp(D) };
    const Mo = { smile: `<path d="M-7,10 Q0,16 7,10" fill="none" stroke="${ML.mouth}" stroke-width="3" stroke-linecap="round"/>`,
      grin: `<path d="M-9,8 Q0,20 9,8Z" fill="${ML.mouth}" stroke="${ML.mouth}" stroke-width="3" stroke-linejoin="round"/><path d="M-4.5,13 Q0,10.5 4.5,13 Q0,16 -4.5,13Z" fill="#FF8D86"/>`,
      tiny: `<ellipse cx="0" cy="12" rx="3.4" ry="4" fill="${ML.mouth}"/>`, o: `<ellipse cx="0" cy="13" rx="5" ry="6.4" fill="${ML.mouth}"/>` };
    return (thin ? '' : `<ellipse cx="${-BL}" cy="7" rx="8.5" ry="5" fill="${ML.blush}" opacity=".55"/><ellipse cx="${BL}" cy="7" rx="8.5" ry="5" fill="${ML.blush}" opacity=".55"/>`) + E[M.eyes] + Mo[M.mouth];
  }
  // a little star companion with a face
  const starPal = (cx, cy, r) => `<g transform="translate(${cx},${cy})">${star(1, 1.5, r, '#B8860F')}${star(0, 0, r, '#F7C843')}<ellipse cx="${r1(-r * .3)}" cy="${r1(-r * .42)}" rx="${r1(r * .3)}" ry="${r1(r * .13)}" transform="rotate(-30 ${r1(-r * .3)} ${r1(-r * .42)})" fill="#fff" opacity=".8"/>`
    + `<circle cx="${r1(-r * .24)}" cy="${r1(r * .02)}" r="${r1(r * .11)}" fill="${MEYE}"/><circle cx="${r1(r * .24)}" cy="${r1(r * .02)}" r="${r1(r * .11)}" fill="${MEYE}"/><path d="M${r1(-r * .16)},${r1(r * .26)} Q0,${r1(r * .44)} ${r1(r * .16)},${r1(r * .26)}" fill="none" stroke="${MEYE}" stroke-width="${r1(r * .11)}" stroke-linecap="round"/></g>`;
  // The face is always whole and centred: her night side is a soft matte (periwinkle at night, milky by day), light enough
  // for the eyes to read, so every phase from a thin crescent to full keeps her expression.
  function moon(mood, size, opts) {
    const key = MOON[mood] ? mood : 'calm', M = MOON[key]; size = size || 120; opts = opts || {};
    const p = Math.max(0, Math.min(1, opts.phase == null ? 1 : +opts.phase)), r = 50, sky = !!opts.sky, cy = sky ? 0 : -8, full = p >= .995;
    const t = Math.max(0, Math.min(1, (1 - p) * 2)), sx = -21 + 52 * t, sy = cy - 27 - 4 * t;
    const craters = p > .8 ? `<g fill="#E2C272" opacity=".5"><ellipse cx="29" cy="${cy + 27}" rx="8" ry="6.4"/><ellipse cx="34" cy="${cy - 26}" rx="5.5" ry="4.6"/><ellipse cx="14" cy="${cy + 38}" rx="3.6" ry="3"/></g><g fill="#fff" opacity=".5"><ellipse cx="30" cy="${cy + 29.5}" rx="6" ry="3.4"/><ellipse cx="34.6" cy="${cy - 24.4}" rx="4" ry="2.4"/></g>` : '';
    const stand = sky ? '' : shadow(10, 80, 64, 9, .5) + shadow(2, 79, 42, 7, .95)
      + `<rect x="-6" y="${cy + 44}" width="12" height="26" rx="4" fill="url(#toy-g-post)"/><ellipse cx="0" cy="77" rx="33" ry="9" fill="url(#toy-g-maple-side)"/><ellipse cx="0" cy="73.5" rx="33" ry="8.4" fill="url(#toy-g-maple)"/><ellipse cx="-10" cy="71" rx="13" ry="2.6" fill="#fff" opacity=".5"/>`;
    const withStars = opts.stars != null ? opts.stars : M.stars;
    const fx2 = (withStars ? starPal(-66, cy - 44, 16) + starPal(68, cy + 26, 12) : '')
      + (M.spark ? sparkle(-62, cy - 44, 10, '#FFFDF6') + sparkle(64, cy - 50, 8, '#FFFDF6') + sparkle(70, cy + 22, 6, '#FFFDF6') : '')
      + (M.twinkle ? sparkle(60, cy - 44, 11, '#FFFDF6') + sparkle(74, cy - 22, 5.5, '#FFFDF6') : '')
      + (M.zz ? zed(48, cy - 62, 8, .85) + zed(62, cy - 80, 11, .6) : '');
    const name = opts.label || TOY.moonName, lit = litPath(r, p, 0, cy);
    return `<span class="toy-moon toy-moon--${key}${sky ? ' toy-moon--sky' : ''}${opts.still ? ' toy-still' : ''}"><svg width="${size}" height="${size}" viewBox="${sky ? '-80 -80 160 160' : '-90 -100 180 190'}" role="img" aria-label="${esc(name)}">`
      + stand + `<circle class="toy-moon-halo" cx="0" cy="${cy}" r="${r1(66 + 12 * p)}" fill="url(#toy-g-moonglow)" opacity="${r1(.7 + .3 * p)}"/>`
      + (full ? '' : `<circle class="toy-moon-dark" cx="0" cy="${cy}" r="${r}" fill="url(#toy-g-moonnight)"/><circle class="toy-moon-day" cx="0" cy="${cy}" r="${r}" fill="url(#toy-g-moonday)"/>`)
      + (p > .01 ? `<path d="${lit}" fill="url(#toy-lac-moon)"/><path d="${lit}" fill="url(#toy-g-shade)" opacity=".5"/>` : '')
      + `<circle cx="0" cy="${cy}" r="${r - .8}" fill="none" stroke="${ML.deep}" stroke-width="1.6" opacity=".45"/>`
      + craters + (p > .12 ? soft(r1(sx + 4), r1(sy + 3), r1(10 + 12 * Math.min(1, p * 1.6)), 10, -35, .95) + spec(r1(sx), r1(sy), 8.5, 3.4, -38, .95) + `<circle cx="${r1(sx + 12)}" cy="${r1(sy - 9)}" r="2.2" fill="#fff" opacity=".9"/>` : '')
      + `<g class="toy-moon-face" transform="translate(0,${cy + 2}) scale(1.08)">${moonFace(M)}</g>${fx2}</svg></span>`;
  }
  // Today's steps as a phase: a real crescent, then half, gibbous, and full when every step is done (she never shrinks).
  const stepPhase = (done, total) => (total > 0 && done >= total ? 1 : .24 + .52 * Math.min(1, done / Math.max(1, total - 1)));
  const skyMoon = (mood, phase) => `<div class="toy-sky-moon"><div class="toy-sky-moon-in">${moon(mood || 'calm', 160, { sky: true, stars: false, phase: phase == null ? 1 : phase })}</div></div>`;
  // Progress as phases: moon i shows (i+1)/total of the disc; finished ones are glazed and glow, the rest are matte.
  function moonPhases(done, total, opts) {
    opts = opts || {}; total = Math.max(1, total | 0); done = Math.max(0, Math.min(total, done | 0));
    const r = 20, step = opts.step || 58, W = total * step + 16, arc = opts.arc ? 18 : 0, H = 66 + arc;
    let g = '';
    for (let i = 0; i < total; i++) {
      const cx = 8 + step / 2 + i * step, u = total > 1 ? (i / (total - 1)) * 2 - 1 : 0, cy = r1(31 + arc * u * u), p = i === total - 1 ? 1 : .18 + .82 * (i + 1) / total, on = i < done;
      if (on) g += `<circle cx="${cx}" cy="${cy}" r="${r + 12}" fill="url(#toy-g-moonglow)"/>` + shadow(cx + 3, cy + r + 2, r, 4, .6)
        + (p >= .995 ? '' : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#toy-g-moonnight)"/>`)
        + `<path d="${litPath(r, p, cx, cy)}" fill="url(#toy-lac-moon)"/>` + spec(r1(cx + (p < .7 ? 9 : -7)), cy - 11, 4.6, 1.9, -35, .95)
        + (i === total - 1 ? `<g transform="translate(${cx},${cy + 1}) scale(.56)">${moonFace(MOON.happy)}</g>` : '');
      else g += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#B98448"/><circle cx="${cx + 1.5}" cy="${cy + 2.5}" r="${r - 2}" fill="#D2A066"/>`
        + `<path d="${litPath(r - 5, p, cx + 1, cy + 2)}" fill="#E7BE86" opacity=".7"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFF0CF" stroke-width="1.6" opacity=".55"/>`;
    }
    return `<svg class="toy-moonphases" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${done} of ${total} done">${g}</svg>`;
  }
  // ---------- beads ----------
  const WB = 'M-8,-13 H8 Q12,-13 15,-10.5 L22.5,-2.5 Q25,0 22.5,2.5 L15,10.5 Q12,13 8,13 H-8 Q-12,13 -15,10.5 L-22.5,2.5 Q-25,0 -22.5,-2.5 L-15,-10.5 Q-12,-13 -8,-13Z';
  const TB = 'M-46,-11 Q-46,-18 -41,-24 Q-22,-50 -7,-60 Q0,-65 7,-60 Q22,-50 41,-24 Q46,-18 46,-11 V11 Q46,18 41,24 Q22,50 7,60 Q0,65 -7,60 Q-22,50 -41,24 Q-46,18 -46,11Z';
  const wideBead = c => `<path d="${WB}" fill="url(#toy-lac-${c})"/>`
    + `<path d="M-24.5,0 Q0,3.5 24.5,0 Q25,1 22.5,2.5 L15,10.5 Q12,13 8,13 H-8 Q-12,13 -15,10.5 L-22.5,2.5 Q-25,1 -24.5,0Z" fill="#1A0606" opacity="${c === 'wood' ? .14 : .28}"/>`
    + `<path d="M-23,0 Q0,3.5 23,0" fill="none" stroke="#fff" stroke-width="1.2" opacity=".5"/><ellipse cx="-6" cy="-7.5" rx="8" ry="2.4" transform="rotate(-8 -6 -7.5)" fill="#fff" opacity=".8"/>`
    + `<ellipse cx="0" cy="-12.6" rx="6" ry="1.6" fill="#2A0D08" opacity="${c === 'wood' ? .25 : .45}"/>`;
  const tallBead = c => `<path d="${TB}" fill="url(#toy-lac-${c})"/>`
    + `<path d="M0,-63.5 Q4,-64 7,-60 Q22,-50 41,-24 Q46,-18 46,-11 V11 Q46,18 41,24 Q22,50 7,60 Q4,64 0,63.5 Q9,0 0,-63.5Z" fill="#1A0606" opacity="${c === 'wood' ? .13 : .26}"/>`
    + `<path d="M0,-63 Q9,0 0,63" fill="none" stroke="#fff" stroke-width="3" opacity=".38"/>`
    + soft(-22, -14, 13, 32, 44, .8) + spec(-27, -13, 2.8, 11, 44, .9)
    + `<ellipse cx="-45.5" cy="0" rx="3.4" ry="10" fill="#2A0D08" opacity="${c === 'wood' ? .3 : .5}"/>`;
  function bead(color, size, opts) {
    opts = opts || {}; size = size || 64;
    const c = opts.dim ? 'wood' : (LAC[color] ? color : 'red');
    const a11y = opts.label ? `role="img" aria-label="${esc(opts.label)}"` : 'aria-hidden="true"';
    if (opts.tall) return `<svg class="toy-bead" width="${Math.round(size * .74)}" height="${size}" viewBox="-52 -68 108 146" ${a11y}>${opts.shadow === false ? '' : shadow(6, 68, 46, 8, .7)}${tallBead(c)}</svg>`;
    return `<svg class="toy-bead" width="${size}" height="${Math.round(size * .64)}" viewBox="-28 -15.5 58 37" ${a11y}>${opts.shadow === false ? '' : shadow(3, 14.5, 26, 5.5, .8)}${wideBead(c)}</svg>`;
  }

  // ---------- progress beads on a rod: done slide left (teal), the current one glows, the rest wait on the right ----------
  function rodProgress(done, total, current) {
    total = Math.max(1, total | 0); done = Math.max(0, Math.min(total, done | 0));
    const cur = current == null ? (done < total ? done : -1) : current;
    const step = 31, gap = 96, x0 = 44, W = x0 * 2 + total * step + gap, cy = 46;
    let beads = '', i;
    const one = (x, c, sc) => `<g transform="translate(${r1(x)},${cy}) scale(${sc || .36},${(sc || .36) * 1.36})">${tallBead(c)}</g>`;
    for (i = 0; i < total; i++) {
      if (i < done && i !== cur) beads += one(x0 + step / 2 + i * step, 'teal');
      else if (i === cur) beads += `<circle cx="${x0 + done * step + gap / 2}" cy="${cy}" r="46" fill="url(#toy-g-glow)"/>` + one(x0 + done * step + gap / 2, 'mustard', .42);
      else beads += one(x0 + gap + step / 2 + i * step, 'wood');
    }
    const post = x => `<rect x="${x - 10}" y="8" width="20" height="76" rx="8" fill="url(#toy-g-post)"/><ellipse cx="${x}" cy="13" rx="8" ry="3.2" fill="#FFF0CF" opacity=".85"/>`;
    return `<svg class="toy-rodprogress" width="${W}" height="96" viewBox="0 0 ${W} 96" role="img" aria-label="${done} of ${total} done">`
      + shadow(W / 2 + 6, 88, W / 2 - 14, 7, .55)
      + `<rect x="28" y="${cy - 5}" width="${W - 56}" height="10" rx="5" fill="url(#toy-g-brass)"/>${beads}${post(30)}${post(W - 30)}</svg>`;
  }

  // ---------- icons: chunky rounded strokes on a 24 grid, with one golden accent ----------
  const ACC = '#FFD25E';
  const ICON = {
    practice: (c, a) => `<rect x="3" y="4" width="18" height="16" rx="3.6"/><path d="M3,9.6H21"/><path d="M9,4V20M15,4V20" stroke-width="1.5"/><g fill="${a}" stroke="none"><ellipse cx="9" cy="6.9" rx="2.5" ry="1.7"/><ellipse cx="15" cy="12.6" rx="2.5" ry="1.7"/><ellipse cx="9" cy="16.6" rx="2.5" ry="1.7"/><ellipse cx="15" cy="16.6" rx="2.5" ry="1.7"/></g>`,
    play: c => `<path d="M8.5,6V18L18.5,12Z" fill="${c}"/>`,
    room: (c, a) => `<path d="M3.5,11.4 L12,4 L20.5,11.4"/><path d="M6.2,10 V19.6 H17.8 V10"/><rect x="10.1" y="13.6" width="3.8" height="6" rx="1" fill="${a}" stroke="none"/>`,
    lock: (c, a) => `<rect x="5.2" y="10.6" width="13.6" height="10" rx="3" fill="${c}"/><path d="M8.2,10.4 V8 a3.8,3.8 0 0 1 7.6,0 V10.4"/><circle cx="12" cy="15.6" r="1.8" fill="${a}" stroke="none"/>`,
    close: () => `<path d="M6.5,6.5 L17.5,17.5 M17.5,6.5 L6.5,17.5" stroke-width="3.2"/>`,
    back: () => `<path d="M14.5,5.5 L8,12 L14.5,18.5" stroke-width="3.2"/>`,
    backspace: () => `<path d="M9.2,5.5 H18.6 a2.4,2.4 0 0 1 2.4,2.4 V16.1 a2.4,2.4 0 0 1 -2.4,2.4 H9.2 L3,12Z"/><path d="M11.6,9.6 l4.8,4.8 M16.4,9.6 l-4.8,4.8"/>`,
    check: () => `<path d="M5,12.8 L10,17.6 L19.5,7" stroke-width="3.4"/>`,
    speaker: (c, a) => `<path d="M4,9.6 H7.4 L11.8,5.8 V18.2 L7.4,14.4 H4Z" fill="${c}"/><path d="M15.4,9.2 a4,4 0 0 1 0,5.6"/><path d="M18,6.6 a7.6,7.6 0 0 1 0,10.8" stroke="${a}"/>`,
    star: c => `<path d="M12,3.4 l2.6,5.4 5.9,.8 -4.3,4.1 1.05,5.9 L12,16.8 6.75,19.6 7.8,13.7 3.5,9.6 9.4,8.8Z" fill="${c}"/>`,
    book: (c, a) => `<path d="M12,7.2 C10,5.6 7,5.1 3.5,5.6 V17.8 C7,17.3 10,17.9 12,19.4 C14,17.9 17,17.3 20.5,17.8 V5.6 C17,5.1 14,5.6 12,7.2Z"/><path d="M12,7.2 V19.4"/><path d="M15,9.6 q1.6,-.7 3,-.7M15,12.6 q1.6,-.7 3,-.7" stroke="${a}" stroke-width="1.8"/>`,
    eye: (c, a) => `<path d="M2.5,12 C5,7.6 8.5,5.6 12,5.6 S19,7.6 21.5,12 C19,16.4 15.5,18.4 12,18.4 S5,16.4 2.5,12Z"/><circle cx="12" cy="12" r="3.3" fill="${c}"/><circle cx="10.9" cy="10.9" r="1.1" fill="${a}" stroke="none"/>`,
    ear: (c, a) => `<path d="M6.6,10 a5.6,5.6 0 1 1 11.2,0 c0,4.4 -4.6,4.8 -4.6,8.4 a3,3 0 0 1 -6,0"/><path d="M9.8,10.4 a2.6,2.6 0 0 1 5.2,0 c0,1.6 -1.6,2 -2,3.2" stroke="${a}" stroke-width="2"/>`,
    flash: (c, a) => `<path d="M13.6,2.8 L5.2,13.4 H11 L10.2,21.2 L18.8,10.2 H12.8Z" fill="${a}"/>`,
    gear: (c, a) => `<g stroke-width="3.2">${[0, 45, 90, 135].map(r => `<path d="M12,3.2 V20.8" transform="rotate(${r} 12 12)"/>`).join('')}</g><circle cx="12" cy="12" r="5.6" fill="${c}"/><circle cx="12" cy="12" r="2.3" fill="${a}" stroke="none"/>`,
    retry: () => `<path d="M4.5,12 a7.5,7.5 0 1 0 2.4,-5.5"/><path d="M4,4.6 V9 H8.4"/>`,
    plus: () => `<path d="M12,5.5 V18.5 M5.5,12 H18.5" stroke-width="3.2"/>`,
  };
  ICON.soroban = ICON.practice; ICON.home = ICON.room; ICON.bolt = ICON.flash; ICON.abacus = ICON.practice;
  function icon(name, size, color, opts) {
    size = size || 28; color = color || 'currentColor'; opts = opts || {};
    const f = ICON[name]; if (!f) return '';
    return `<svg class="toy-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${opts.stroke || 2.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${f(color, opts.accent || ACC)}</svg>`;
  }

  // ---------- small HTML pieces (styles in toy.css) ----------
  const attrs = a => a ? ' ' + a : '';
  function bubble(html, opts) {
    opts = opts || {};
    return `<div class="toy-bubble toy-bubble--${opts.tail || 'left'}">${opts.title ? `<span class="toy-bubble-title">${opts.title}</span>` : ''}<span class="toy-bubble-text">${html}</span></div>`;
  }
  function block(label, opts) {
    opts = opts || {}; const color = opts.color || 'indigo';
    const ic = opts.icon ? icon(opts.icon, opts.small ? 30 : 46, 'currentColor', { accent: color === 'mustard' || color === 'wood' ? '#FFFDF6' : ACC }) : '';
    return `<button type="button" class="toy-block toy-block--${color}${opts.small ? ' toy-block--sm' : ''}"${attrs(opts.attrs)}>${ic}<span class="toy-block-label">${esc(label)}${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}</span></button>`;
  }
  function start(label, opts) {
    opts = opts || {}; const ic = opts.icon || 'play', sm = opts.small;
    return `<button type="button" class="toy-start${sm ? ' toy-start--sm' : ''}"${label && !opts.showLabel && sm ? ` aria-label="${esc(label)}"` : ''}${attrs(opts.attrs)}><span class="toy-start-dome">${icon(ic, 64, '#fff', { stroke: 3 })}${label && !sm ? `<span class="toy-start-label">${esc(label)}</span>` : ''}</span></button>`;
  }
  function tag(name, opts) {
    opts = opts || {}; const c = LAC[opts.color] ? opts.color : 'red';
    return `<span class="toy-tag${opts.hang ? ' toy-tag--hang' : ''}"><span class="toy-tag-bead toy-lac--${c}">${esc(String(name || '?').trim().charAt(0).toUpperCase())}</span><span class="toy-tag-name">${esc(name)}</span></span>`;
  }
  const iconButton = (name, label, a) => `<button type="button" class="toy-iconbtn" aria-label="${esc(label || name)}"${attrs(a)}>${icon(name, 30, 'currentColor')}</button>`;

  // ---------- table props (decoration only) ----------
  function prop(name, size) {
    size = size || 160;
    if (name === 'rainbow') return `<svg class="toy-prop" width="${size}" height="${Math.round(size * .56)}" viewBox="676 134 182 102" aria-hidden="true">${shadow(775, 224, 96, 10, .8)}`
      + `<g fill="none"><path d="M697,220 A70,70 0 0 1 837,220" stroke="#D2463A" stroke-width="17"/><path d="M716,220 A51,51 0 0 1 818,220" stroke="#EDB23A" stroke-width="17"/><path d="M735,220 A32,32 0 0 1 799,220" stroke="#2C9E90" stroke-width="17"/><path d="M754,220 A13,13 0 0 1 780,220" stroke="#3F52A8" stroke-width="17"/><path d="M693,214 A74,74 0 0 1 760,146" stroke="#fff" stroke-width="3" opacity=".45" stroke-linecap="round"/></g></svg>`;
    if (name === 'plant') return `<svg class="toy-prop" width="${size}" height="${size}" viewBox="852 34 200 200" aria-hidden="true">${shadow(962, 224, 70, 9, .7)}`
      + `<g fill="url(#toy-g-leaf)"><path d="M940,160 C900,140 884,96 898,62 C930,84 948,120 944,160Z"/><path d="M948,158 C936,110 950,62 982,40 C996,84 984,128 954,160Z"/><path d="M956,160 C972,120 1004,100 1040,104 C1030,140 996,160 958,164Z"/><path d="M938,164 C912,150 880,154 862,172 C888,186 920,182 940,168Z" opacity=".9"/></g>`
      + `<g stroke="#2F6142" stroke-width="2" fill="none" opacity=".5"><path d="M942,158 C926,124 912,96 900,68"/><path d="M952,158 C960,112 970,76 981,46"/><path d="M958,161 C986,136 1010,118 1036,106"/></g>`
      + `<path d="M908,160 H1000 L990,222 Q954,232 918,222Z" fill="url(#toy-g-pot)"/><rect x="902" y="152" width="104" height="16" rx="8" fill="#FFF9EE"/><rect x="902" y="162" width="104" height="6" rx="3" fill="#B9AA90" opacity=".5"/></svg>`;
    // a small table lamp (evening scenes): maple foot, brass stem, a warm glowing shade. Pair it with --toy-lamp-x on the scene.
    if (name === 'lamp') return `<svg class="toy-prop toy-lamp" width="${Math.round(size * .75)}" height="${size}" viewBox="0 0 150 200" aria-hidden="true">${shadow(86, 188, 60, 9, .55)}${shadow(76, 187, 40, 7, .95)}`
      + `<circle cx="75" cy="62" r="74" fill="url(#toy-g-moonglow)" opacity=".8"/>`
      + `<ellipse cx="75" cy="184" rx="36" ry="9" fill="url(#toy-g-maple-side)"/><ellipse cx="75" cy="180" rx="36" ry="8.5" fill="url(#toy-g-maple)"/><ellipse cx="64" cy="177" rx="14" ry="2.6" fill="#fff" opacity=".5"/>`
      + `<rect x="70" y="100" width="10" height="80" rx="4" fill="#B8860F"/><rect x="71.5" y="100" width="3" height="80" rx="1.5" fill="#FBE08A" opacity=".8"/><ellipse cx="75" cy="122" rx="9" ry="7" fill="#C99A22"/><ellipse cx="72" cy="119.5" rx="3.4" ry="2" fill="#FFF3C4" opacity=".9"/>`
      + `<ellipse cx="75" cy="104" rx="52" ry="9" fill="#E9A93C"/><path d="M40,22 H110 L128,104 Q75,116 22,104Z" fill="url(#toy-g-lampshade)"/><path d="M40,22 H110 L113,36 Q75,42 37,36Z" fill="#fff" opacity=".28"/>`
      + `<ellipse cx="75" cy="22" rx="35" ry="6" fill="#F6CF78"/><ellipse cx="75" cy="22" rx="28" ry="4" fill="#FFF8DC"/><path d="M36,40 L27,92" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>`
      + `<path d="M22,104 Q75,116 128,104" fill="none" stroke="#C98A1E" stroke-width="3" opacity=".7"/></svg>`;
    if (name === 'bowl') { const b = (c, t) => `<g transform="${t}">${wideBead(c)}</g>`;
      return `<svg class="toy-prop" width="${size}" height="${Math.round(size * .6)}" viewBox="962 664 200 120" aria-hidden="true">${shadow(1072, 756, 100, 20, .8)}`
        + `<path d="M976,700 Q980,760 1060,762 Q1140,760 1144,700Z" fill="url(#toy-g-maple-side)"/><path d="M976,700 Q980,756 1060,758 Q1140,756 1144,700Z" fill="url(#toy-g-maple)"/><ellipse cx="1060" cy="700" rx="84" ry="24" fill="#B98448"/><ellipse cx="1060" cy="704" rx="76" ry="19" fill="#8E5E2C"/>`
        + b('red', 'translate(1026,700) scale(1.25) rotate(-14)') + b('indigo', 'translate(1092,702) scale(1.25) rotate(10)') + b('mustard', 'translate(1060,692) scale(1.3) rotate(4)') + b('teal', 'translate(1004,706) scale(1.05) rotate(20)') + b('red', 'translate(1116,708) rotate(-22)')
        + `<path d="M976,700 A84,24 0 0 0 1144,700 A84,30 0 0 1 976,700Z" fill="#DDAE72"/><path d="M980,694 A84,24 0 0 1 1060,676" fill="none" stroke="#FFF0CF" stroke-width="3" opacity=".8" stroke-linecap="round"/></svg>`; }
    return '';
  }

  // ---------- keypad: wooden keys on a felt mat (always the app's order: 7-8-9 / 4-5-6 / 1-2-3, then 0 and delete) ----------
  // Keys carry data-k="0".."9" / data-k="del"; the round check button (data-k="check") sits beside the mat when onCheck is given.
  function keypad(container, opts) {
    opts = opts || {};
    const order = [7, 8, 9, 4, 5, 6, 1, 2, 3];
    const el = document.createElement('div');
    el.className = 'toy-keypad-wrap';
    el.innerHTML = `<div class="${opts.mat === false ? '' : 'toy-felt '}toy-keypad-mat"><div class="toy-keypad" role="group" aria-label="${esc(opts.label || 'Number keys')}">`
      + order.map(d => `<button type="button" class="toy-key" data-k="${d}">${d}</button>`).join('')
      + '<button type="button" class="toy-key toy-key--zero" data-k="0">0</button>'
      + `<button type="button" class="toy-key toy-key--del" data-k="del" aria-label="Delete">${icon('backspace', 40, 'currentColor', { stroke: 2.4 })}</button></div></div>`
      + (opts.onCheck ? start(opts.checkLabel || 'Check', { icon: 'check', small: true, attrs: 'data-k="check"' }) : '');
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return;
      const k = b.dataset.k;
      if (k === 'del') { if (opts.onBackspace) opts.onBackspace(); } else if (k === 'check') { if (opts.onCheck) opts.onCheck(); } else if (opts.onKey) opts.onKey(k);
    });
    container.appendChild(el);
    return {
      el,
      setEnabled(on) { el.classList.toggle('off', !on); el.querySelectorAll('button').forEach(b => { b.disabled = !on; }); },
      destroy() { el.remove(); },
    };
  }

  // ---------- dialog: a paper sheet on the table (same API as WS.confirm) ----------
  // Resolves true for the main button, false for the other one, Escape, or a tap outside. Text is escaped.
  function confirm(title, message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'toy-dialog'; back.setAttribute('role', 'presentation');
      const id = 'toydlg' + Date.now().toString(36);
      const paras = String(message || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
      back.innerHTML = `<div class="toy-dialog-panel toy-paper" role="alertdialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}m">`
        + `<h2 class="toy-dialog-title" id="${id}t">${esc(title)}</h2><div class="toy-dialog-msg" id="${id}m">${paras}</div>`
        + `<div class="toy-dialog-btns"><button type="button" class="toy-block toy-block--wood toy-block--sm" data-r="0"><span class="toy-block-label">${esc(opts.cancel || 'Cancel')}</span></button>`
        + `<button type="button" class="toy-block toy-block--${opts.danger ? 'red' : 'teal'} toy-block--sm" data-r="1"><span class="toy-block-label">${esc(opts.ok || 'OK')}</span></button></div></div>`;
      const prev = document.activeElement;
      const done = r => { document.removeEventListener('keydown', onKey, true); back.remove(); if (prev && prev.focus) try { prev.focus(); } catch (e) { /* gone */ } resolve(r); };
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Tab') {
          const bs = back.querySelectorAll('button'), first = bs[0], last = bs[bs.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      back.addEventListener('click', e => { const b = e.target.closest('button[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === back) done(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(back);
      back.querySelector(opts.danger ? '[data-r="0"]' : '[data-r="1"]').focus();
    });
  }

  const TOY = {
    colors: LAC, defs, bix, moon, moonName: 'Juni', moonPhases, skyMoon, stepPhase, buddy, pair, bead, rodProgress, icon, bubble, block, start, tag, iconButton, prop, keypad, confirm,
    MOODS: Object.keys(BIX), MOON_MOODS: Object.keys(MOON), ICONS: ['practice', 'play', 'room', 'lock', 'close', 'back', 'backspace', 'check', 'speaker', 'star', 'book', 'eye', 'ear', 'flash', 'gear', 'retry', 'plus'],
    FRIENDS: { small: [[1, 4], [2, 3]], big: [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]] },
  };
  if (typeof window !== 'undefined') {
    window.TOY = TOY;
    if (document.body) defs(); else document.addEventListener('DOMContentLoaded', defs);
  }
})();
