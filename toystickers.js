// Toy Table stickers and small pictures: drawn from the kit's materials (lacquer gradients, soft shade, one specular).
// No emoji anywhere: every sticker in the album and every treat picture is one of these drawings.
//   TOY.sticker(id, size, {gold})   a die-cut sticker ("animals:0" .. "toys:11"): white rim, pack-coloured ground, drawing
//   TOY.pic(key, size)              the bare drawing (no sticker rim), e.g. TOY.pic('icecream', 96)
//   TOY.picOf(emoji)                the drawing key for a stored emoji (older treat lists), or null when there is none
//   TOY.present(size, {gold, open}) the wrapped present of the sticker reveal
//   TOY.STICKERS                    [{id:'animals', name:'Animals', items:[keys...]}, ...]
(function (root) {
  'use strict';
  const TOY = root.TOY; if (!TOY) return;
  const INK = '#2A1A12';
  const L = c => `url(#toy-lac-${c})`;
  const r1 = n => Math.round(n * 10) / 10;
  const c = (x, y, r, f, o) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}"${o ? ` opacity="${o}"` : ''}/>`;
  const e = (x, y, rx, ry, f, rot, o) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"${rot ? ` transform="rotate(${rot} ${x} ${y})"` : ''}${o ? ` opacity="${o}"` : ''}/>`;
  const p = (d, f, x) => `<path d="${d}" fill="${f}"${x ? ' ' + x : ''}/>`;
  const st = (d, col, w, x) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${x ? ' ' + x : ''}/>`;
  const SH = 'url(#toy-g-shade)';
  // volume: the same shape again with the kit's bottom shade
  const ball = (x, y, r, f) => c(x, y, r, f) + c(x, y, r, SH, .55);
  const egg = (x, y, rx, ry, f, rot) => e(x, y, rx, ry, f, rot) + e(x, y, rx, ry, SH, rot, .55);
  const vol = (d, f) => p(d, f) + p(d, SH, 'opacity=".55"');
  const hi = (x, y, rx, ry, rot, o) => e(x, y, rx, ry, '#fff', rot == null ? -30 : rot, o || .7);
  const eye = (x, y, r) => { r = r || 3.4; return c(x, y, r, INK) + c(r1(x - r * .3), r1(y - r * .35), r1(r * .36), '#fff'); };
  const eyes = (x1, x2, y, r) => eye(x1, y, r) + eye(x2, y, r);
  const smile = (x, y, w) => { w = w || 6; return st(`M${x - w},${y} Q${x},${r1(y + w * .9)} ${x + w},${y}`, INK, 2.4); };
  const blush = (x1, x2, y) => e(x1, y, 5, 3, '#FF9F9A', 0, .55) + e(x2, y, 5, 3, '#FF9F9A', 0, .55);
  const ring = (n, cx, cy, R, f) => Array.from({ length: n }, (_, i) => f(r1(cx + R * Math.cos(i * 2 * Math.PI / n)), r1(cy + R * Math.sin(i * 2 * Math.PI / n)), i, r1(i * 360 / n))).join('');
  const starD = (cx, cy, R) => 'M' + Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? R * .46 : R; return r1(cx + q * Math.cos(a)) + ',' + r1(cy + q * Math.sin(a)); }).join(' L') + 'Z';
  const spark = (x, y, r, f) => p(`M${x},${y - r} Q${r1(x + r * .2)},${r1(y - r * .2)} ${x + r},${y} Q${r1(x + r * .2)},${r1(y + r * .2)} ${x},${y + r} Q${r1(x - r * .2)},${r1(y + r * .2)} ${x - r},${y} Q${r1(x - r * .2)},${r1(y - r * .2)} ${x},${y - r}Z`, f || '#FFFDF6');
  const O = '#F09A2E', BR = '#8A5A32', TAN = '#F0C9A0', GRY = '#9AA3AE', GRN = '#5DAA4A', W = '#FFFDF6', PINK = '#F7B6CC', BIS = '#E0A868';

  const G = {
    /* ---- animals ---- */
    fox: () => p('M20,34 L28,8 L46,26Z', O) + p('M80,34 L72,8 L54,26Z', O) + p('M25,28 L29,15 L38,25Z', '#5A2A10') + p('M75,28 L71,15 L62,25Z', '#5A2A10')
      + vol('M50,24 C76,24 88,46 82,58 C74,76 58,86 50,86 C42,86 26,76 18,58 C12,46 24,24 50,24Z', O)
      + p('M18,58 C26,76 42,86 50,86 C58,86 74,76 82,58 C66,58 56,64 50,74 C44,64 34,58 18,58Z', W) + c(50, 75, 4.2, INK) + eyes(37, 63, 51, 3.6) + hi(36, 33, 9, 3),
    panda: () => c(25, 27, 12, INK) + c(75, 27, 12, INK) + ball(50, 55, 32, W) + e(37, 52, 9, 11, INK, -20) + e(63, 52, 9, 11, INK, 20)
      + c(38, 52, 3.6, '#fff') + c(62, 52, 3.6, '#fff') + c(38.6, 52.6, 1.9, INK) + c(61.4, 52.6, 1.9, INK) + e(50, 65, 5, 3.4, INK) + smile(50, 70, 5) + hi(40, 31, 9, 3),
    koala: () => ball(21, 38, 15, GRY) + ball(79, 38, 15, GRY) + c(21, 38, 8, '#F4C7C9') + c(79, 38, 8, '#F4C7C9') + ball(50, 56, 30, GRY)
      + e(50, 61, 7.5, 10, '#3A3F4A') + hi(48, 56, 2.4, 1.4, -20, .6) + eyes(35, 65, 52, 3.4) + blush(31, 69, 62) + hi(40, 34, 9, 3),
    tiger: () => c(25, 28, 11, O) + c(75, 28, 11, O) + c(25, 28, 5.5, '#FFE6C9') + c(75, 28, 5.5, '#FFE6C9') + ball(50, 55, 32, O) + e(50, 69, 16, 12, W)
      + st('M50,23 v11 M40,25 l2,9 M60,25 l-2,9 M18,50 h9 M82,50 h-9 M19,61 h8 M81,61 h-8', INK, 3.4) + eyes(37, 63, 52, 3.6) + p('M45.5,63 h9 l-4.5,5Z', INK) + smile(50, 71, 5) + hi(36, 36, 8, 2.6),
    lion: () => ring(12, 50, 54, 31, (x, y) => c(x, y, 11, '#C96F1E')) + ball(50, 54, 27, '#F2B23E') + e(50, 66, 12, 9, '#FFE9BD')
      + eyes(40, 60, 50, 3.4) + p('M45.5,60 h9 l-4.5,5Z', '#7A3A12') + smile(50, 67, 5) + blush(33, 67, 60) + hi(41, 36, 8, 2.6),
    frog: () => ball(32, 32, 13, GRN) + ball(68, 32, 13, GRN) + egg(50, 60, 35, 26, GRN) + c(32, 31, 8, '#fff') + c(68, 31, 8, '#fff') + c(33, 32, 4, INK) + c(67, 32, 4, INK)
      + c(31.6, 30.4, 1.4, '#fff') + c(65.6, 30.4, 1.4, '#fff') + st('M28,62 Q50,82 72,62', INK, 2.8) + blush(24, 76, 62) + e(50, 74, 14, 5, '#BFE6A8', 0, .6),
    monkey: () => ball(15, 52, 11, BR) + ball(85, 52, 11, BR) + c(15, 52, 5.5, TAN) + c(85, 52, 5.5, TAN) + ball(50, 52, 30, BR)
      + c(40, 47, 12, TAN) + c(60, 47, 12, TAN) + e(50, 62, 22, 18, TAN) + eyes(40, 60, 48, 3.4) + c(47.5, 58, 1.3, INK) + c(52.5, 58, 1.3, INK) + smile(50, 66, 8) + hi(40, 28, 8, 2.6),
    unicorn: () => p('M50,4 L58,32 H42Z', L('mustard')) + st('M45,22 l9,-4 M43,29 l12,-5', '#C98A16', 2)
      + c(22, 46, 11, '#6FC3E8') + c(18, 60, 10, L('plum')) + c(23, 73, 8, '#E58AC0') + p('M28,38 L31,18 L42,32Z', W) + p('M72,38 L69,18 L58,32Z', W)
      + ball(50, 58, 28, W) + eyes(40, 60, 58, 3.4) + blush(33, 67, 66) + smile(50, 68, 5) + hi(42, 38, 8, 2.6),
    owl: () => p('M22,34 L20,12 L40,26Z', BR) + p('M78,34 L80,12 L60,26Z', BR) + ball(50, 56, 32, BR) + e(50, 70, 18, 15, '#E9C99A')
      + st('M40,66 q4,4 8,0 M52,66 q4,4 8,0 M46,74 q4,4 8,0', '#C9A06A', 2) + c(37, 48, 13, W) + c(63, 48, 13, W) + c(37, 48, 6.4, INK) + c(63, 48, 6.4, INK)
      + c(35, 46, 2.2, '#fff') + c(61, 46, 2.2, '#fff') + p('M45,55 h10 l-5,9Z', L('mustard')),
    turtle: () => egg(28, 70, 9, 6, '#8CCB7A') + egg(64, 70, 9, 6, '#8CCB7A') + ball(82, 56, 11, '#8CCB7A') + vol('M12,62 Q12,24 46,24 Q78,24 78,62Z', '#3E9B6A')
      + st('M46,24 V62 M28,32 L36,62 M64,32 L56,62 M16,48 H76', '#2C7A50', 2.4) + p('M10,60 H80 q0,9 -10,9 H20 q-10,0 -10,-9Z', '#BFD98A') + eye(85, 54, 2.6) + smile(86, 60, 3) + hi(32, 34, 9, 3),
    butterfly: () => egg(31, 38, 19, 17, L('plum'), -20) + egg(69, 38, 19, 17, L('plum'), 20) + egg(34, 67, 14, 12, L('mustard'), 20) + egg(66, 67, 14, 12, L('mustard'), -20)
      + c(30, 37, 6, W, .85) + c(70, 37, 6, W, .85) + c(34, 67, 4, '#fff', .8) + c(66, 67, 4, '#fff', .8) + st('M47,26 q-6,-12 -14,-12 M53,26 q6,-12 14,-12', INK, 2.4) + c(33, 14, 2.6, INK) + c(67, 14, 2.6, INK)
      + egg(50, 52, 5.5, 24, '#4A3220') + eyes(48, 52, 34, 1.4),
    rabbit: () => egg(37, 24, 8.5, 22, W, -8) + egg(63, 24, 8.5, 22, W, 8) + e(37, 26, 4, 15, PINK, -8) + e(63, 26, 4, 15, PINK, 8) + ball(50, 62, 27, W)
      + eyes(40, 60, 60, 3.4) + p('M46.5,66 h7 l-3.5,4Z', '#E58AA0') + smile(50, 72, 4.5) + blush(32, 68, 68) + hi(42, 44, 8, 2.6),
    /* ---- ocean ---- */
    whale: () => st('M38,30 q-8,-12 -15,-8 M38,30 q4,-14 13,-11', '#8EC9F0', 3.6)
      + vol('M10,54 C10,34 38,28 58,34 C72,38 80,50 78,58 C76,72 56,80 38,78 C22,76 10,68 10,54Z', L('indigo')) + p('M76,55 C84,50 86,40 93,35 C94,46 91,53 87,57 C91,61 93,66 91,73 C84,68 80,63 76,59Z', L('indigo'))
      + p('M15,64 C26,77 54,80 72,67 C56,73 32,73 15,64Z', '#CFE2F7') + eye(27, 52, 3.2) + smile(24, 60, 4) + hi(36, 38, 10, 3),
    dolphin: () => p('M46,36 C50,20 58,17 64,17 C59,26 61,34 63,40Z', '#4A8FC0')
      + vol('M10,58 C20,36 52,28 74,40 C82,44 88,44 93,37 C93,50 87,59 77,61 C60,76 34,76 20,68 C14,66 10,63 10,58Z', '#5FA8D8')
      + p('M18,65 C34,74 58,74 75,61 C56,67 36,68 18,65Z', '#E4F2FB') + eye(27, 53, 3) + smile(21, 60, 4) + hi(44, 40, 11, 3),
    shark: () => p('M46,42 L57,18 L64,44Z', '#7A8798') + vol('M8,56 C22,40 56,36 80,48 L93,37 C91,50 91,58 93,71 L80,62 C58,76 24,74 8,56Z', '#8D9AAB')
      + p('M12,58 C30,72 58,72 79,62 C56,66 32,66 12,58Z', W) + st('M17,60 l3,4 3,-4 3,4 3,-4 3,4', '#fff', 1.8) + st('M44,50 v8 M49,50 v8', '#6B7888', 2) + eye(27, 51, 2.8) + hi(42, 43, 10, 2.6),
    fish: () => p('M68,52 L91,34 Q86,52 91,70Z', L('red')) + p('M38,34 Q50,20 60,35Z', L('red')) + egg(45, 52, 29, 20, L('mustard'))
      + st('M42,35 Q49,52 42,69 M54,37 Q60,52 54,67', '#fff', 4.5, 'opacity=".65"') + eye(28, 48, 3.6) + smile(27, 58, 4) + hi(36, 40, 9, 3),
    puffer: () => ring(14, 50, 54, 30, (x, y, i, a) => `<path d="M-4,0 L0,-9 L4,0Z" fill="#C99A22" transform="translate(${x},${y}) rotate(${a + 90})"/>`) + ball(50, 54, 28, '#E9C24A') + e(50, 65, 18, 12, '#FFF6D8')
      + eyes(39, 61, 48, 3.8) + c(50, 60, 3.2, '#7A3A12') + blush(31, 69, 58) + hi(40, 34, 8, 2.6),
    crab: () => st('M28,54 Q18,52 17,44 M72,54 Q82,52 83,44', '#B52323', 5) + st('M30,66 l-12,8 M34,72 l-10,10 M70,66 l12,8 M66,72 l10,10', '#B52323', 4)
      + ball(17, 36, 11, L('red')) + ball(83, 36, 11, L('red')) + p('M17,36 L8,26 L20,28Z', '#fff', 'opacity=".9"') + p('M83,36 L92,26 L80,28Z', '#fff', 'opacity=".9"')
      + st('M42,48 v-10 M58,48 v-10', '#B52323', 3) + c(42, 35, 5.5, '#fff') + c(58, 35, 5.5, '#fff') + c(42.6, 35.6, 2.6, INK) + c(57.4, 35.6, 2.6, INK)
      + egg(50, 60, 27, 18, L('red')) + smile(50, 62, 7) + hi(38, 50, 9, 2.6),
    shell: () => vol('M50,84 C24,80 12,56 18,40 C24,26 40,20 50,20 C60,20 76,26 82,40 C88,56 76,80 50,84Z', '#F4B6C2')
      + st('M50,82 V22 M50,82 L30,28 M50,82 L70,28 M50,82 L18,44 M50,82 L82,44', '#D98AA0', 2.4) + p('M40,80 h20 l-3,9 h-14Z', '#E9A0B4') + hi(34, 36, 8, 3),
    squid: () => st('M36,54 q-5,16 -10,28 M43,56 q-2,18 -4,30 M50,56 v32 M57,56 q2,18 4,30 M64,54 q5,16 10,28', '#7A45A8', 6)
      + vol('M50,8 C70,18 72,44 67,58 H33 C28,44 30,18 50,8Z', L('plum')) + c(42, 44, 5.4, '#fff') + c(58, 44, 5.4, '#fff') + c(42.6, 44.8, 2.6, INK) + c(57.4, 44.8, 2.6, INK) + smile(50, 52, 4) + hi(42, 22, 7, 2.6),
    penguin: () => egg(23, 58, 6.5, 17, '#2B3348', 16) + egg(77, 58, 6.5, 17, '#2B3348', -16) + e(40, 89, 9, 4.5, L('mustard')) + e(60, 89, 9, 4.5, L('mustard'))
      + egg(50, 55, 27, 33, '#2B3348') + e(50, 62, 18, 24, W) + eyes(42, 58, 40, 3.2) + p('M45,46 h10 l-5,7Z', L('mustard')) + blush(36, 64, 50) + hi(40, 27, 7, 2.6, -30, .5),
    seal: () => ball(50, 54, 31, '#A9B4C2') + e(50, 65, 17, 12, '#DDE4EC') + e(50, 59, 5.5, 3.8, INK) + st('M34,64 h-12 M34,68 l-11,4 M66,64 h12 M66,68 l11,4', '#6B7888', 1.6)
      + eyes(37, 63, 49, 4) + smile(50, 66, 4.5) + blush(30, 70, 57) + hi(40, 32, 9, 3),
    octopus: () => st('M30,58 q-12,10 -6,24 M40,64 q-6,12 0,24 M50,66 v22 M60,64 q6,12 0,24 M70,58 q12,10 6,24', '#C7558A', 8)
      + ball(50, 42, 27, '#E0699A') + eyes(41, 59, 42, 3.8) + smile(50, 51, 5) + blush(33, 67, 49) + hi(40, 24, 9, 3),
    lobster: () => st('M44,34 q-10,-14 -22,-18 M56,34 q10,-14 22,-18', '#B52323', 2.4) + st('M42,46 Q30,44 26,36 M58,46 Q70,44 74,36', '#B52323', 5)
      + egg(22, 28, 10, 14, L('red'), -30) + egg(78, 28, 10, 14, L('red'), 30) + st('M40,60 l-12,6 M40,68 l-12,8 M60,60 l12,6 M60,68 l12,8', '#B52323', 3.4)
      + egg(50, 54, 13, 22, L('red')) + p('M40,72 h20 l-3,8 h-14Z', '#B52323') + p('M36,80 Q50,96 64,80 Q50,86 36,80Z', L('red')) + st('M40,60 h20 M41,67 h18', '#8A181D', 1.8) + eyes(45, 55, 42, 2.6) + hi(45, 38, 4, 2),
    /* ---- space (dark ground) ---- */
    rocket: () => p('M42,68 Q50,98 58,68Z', L('mustard')) + p('M46,68 Q50,86 54,68Z', '#FFF6C8') + p('M38,52 L22,78 L39,70Z', L('red')) + p('M62,52 L78,78 L61,70Z', L('red'))
      + vol('M50,8 C65,22 67,50 62,70 H38 C33,50 35,22 50,8Z', W) + p('M50,8 C58,16 62,25 63.6,34 H36.4 C38,25 42,16 50,8Z', L('red')) + c(50, 46, 9.5, '#B8C4E8') + c(50, 46, 7, L('indigo')) + hi(47, 43, 3, 1.4) + hi(42, 26, 3, 8, 12, .5),
    planet: () => `<ellipse cx="50" cy="54" rx="43" ry="11" transform="rotate(-18 50 54)" fill="none" stroke="#F4B6C2" stroke-width="6"/>` + c(50, 52, 25, L('mustard'))
      + st('M27,46 Q50,54 73,42 M28,60 Q50,68 72,56', '#C98A16', 3, 'opacity=".6"') + `<path d="M7,54 A43,11 0 0 0 93,54" transform="rotate(-18 50 54)" fill="none" stroke="#F4B6C2" stroke-width="6" stroke-linecap="round"/>` + hi(40, 36, 9, 3.4),
    moon: () => vol('M62,14 A37,37 0 1 0 86,64 A29,29 0 0 1 62,14Z', L('moon')) + c(34, 60, 5, '#E2C272', .6) + c(46, 76, 3.4, '#E2C272', .6) + eyes(36, 50, 46, 3) + smile(41, 54, 4.5) + blush(30, 54, 52)
      + p(starD(76, 30, 9), L('mustard')) + spark(84, 52, 4),
    star: () => p(starD(51.5, 56, 39), '#B8860F') + p(starD(50, 54, 39), L('mustard')) + eyes(42, 58, 54, 3.6) + smile(50, 60, 6) + blush(35, 65, 61) + hi(42, 34, 7, 2.6),
    comet: () => p('M58,50 L8,92 L34,60 L12,66 L44,36Z', '#8EC9F0', 'opacity=".85"') + p('M56,46 L22,78 L42,52Z', '#DDF1FB', 'opacity=".9"') + ball(66, 36, 16, L('moon')) + hi(60, 28, 6, 2.4) + spark(84, 62, 5) + spark(30, 28, 4),
    ufo: () => p('M38,60 L24,94 H76 L62,60Z', '#F7E08A', 'opacity=".45"') + p('M32,46 A18,18 0 0 1 68,46Z', '#BFE4F2') + ball(50, 42, 7, '#7BC96F') + eyes(47.5, 52.5, 41, 1.6)
      + egg(50, 52, 38, 12, GRY) + e(50, 49, 30, 6, '#D9E0E8') + c(22, 54, 3.6, L('mustard')) + c(40, 59, 3.6, L('red')) + c(60, 59, 3.6, L('teal')) + c(78, 54, 3.6, L('mustard')) + hi(42, 36, 5, 2),
    earth: () => c(50, 52, 31, '#3F8FD8') + p('M32,32 C42,26 52,30 54,38 C56,46 46,50 40,58 C36,64 28,60 24,52 C20,44 24,36 32,32Z', GRN) + p('M62,52 C70,48 78,52 78,60 C78,70 68,78 60,76 C54,74 56,58 62,52Z', GRN)
      + p('M60,26 C66,26 72,30 74,36 C68,38 62,34 60,26Z', GRN) + c(50, 52, 31, SH, .5) + e(34, 70, 9, 3, '#fff', 0, .8) + e(66, 42, 8, 2.6, '#fff', 0, .8) + hi(38, 32, 9, 3.4),
    sun: () => ring(12, 50, 52, 34, (x, y, i, a) => `<path d="M-5,0 L0,-11 L5,0Z" fill="url(#toy-lac-mustard)" transform="translate(${x},${y}) rotate(${a + 90})"/>`) + c(50, 52, 25, L('mustard'))
      + eyes(42, 58, 50, 3.4) + smile(50, 56, 6) + blush(35, 65, 57) + hi(42, 36, 7, 2.6),
    rainbow: () => st('M15,70 A35,35 0 0 1 85,70', '#E5402F', 8) + st('M23,70 A27,27 0 0 1 77,70', '#F2B632', 8) + st('M31,70 A19,19 0 0 1 69,70', '#1FA595', 8) + st('M39,70 A11,11 0 0 1 61,70', '#6F84E0', 8)
      + c(14, 72, 9, W) + c(24, 76, 8, W) + c(86, 72, 9, W) + c(76, 76, 8, W) + c(19, 68, 7, W) + c(81, 68, 7, W),
    telescope: () => st('M50,58 L33,92 M50,58 L67,92 M50,58 V90', '#D9A66A', 5) + `<g transform="rotate(-30 50 48)"><rect x="12" y="43" width="12" height="11" rx="2" fill="#B8860F"/><rect x="20" y="39" width="46" height="19" rx="5" fill="url(#toy-lac-indigo)"/><rect x="60" y="34" width="22" height="29" rx="6" fill="url(#toy-lac-mustard)"/><rect x="26" y="42" width="30" height="3.4" rx="1.7" fill="#fff" opacity=".5"/></g>` + spark(22, 22, 6) + spark(36, 12, 3.4),
    shootingstar: () => st('M56,44 L10,86', '#F7E08A', 8, 'opacity=".5"') + st('M52,36 L14,62', '#FFFDF6', 5, 'opacity=".55"') + st('M64,50 L34,92', '#FFFDF6', 5, 'opacity=".4"') + p(starD(66, 34, 22), L('mustard')) + hi(60, 26, 5, 2) + spark(24, 28, 4),
    satellite: () => `<g transform="rotate(-22 50 52)"><rect x="6" y="44" width="30" height="16" rx="2" fill="url(#toy-lac-indigo)"/><rect x="64" y="44" width="30" height="16" rx="2" fill="url(#toy-lac-indigo)"/><path d="M16,44 v16 M26,44 v16 M74,44 v16 M84,44 v16 M6,52 h30 M64,52 h30" stroke="#B8C4E8" stroke-width="1.4" fill="none"/><rect x="34" y="49" width="32" height="6" fill="#9AA3AE"/><rect x="38" y="38" width="24" height="28" rx="6" fill="#DDE4EC"/><rect x="38" y="38" width="24" height="28" rx="6" fill="url(#toy-g-shade)" opacity=".55"/><circle cx="50" cy="52" r="6" fill="url(#toy-lac-mustard)"/><path d="M50,38 V26" stroke="#DDE4EC" stroke-width="3"/><circle cx="50" cy="24" r="4" fill="url(#toy-lac-red)"/></g>` + spark(82, 78, 4),
    /* ---- treats ---- */
    strawberry: () => vol('M50,92 C28,78 16,56 22,42 C28,30 44,30 50,36 C56,30 72,30 78,42 C84,56 72,78 50,92Z', L('red')) + ring(6, 50, 60, 15, (x, y) => e(x, y, 1.8, 2.8, '#FBE08A')) + e(50, 60, 1.8, 2.8, '#FBE08A') + e(50, 80, 1.8, 2.8, '#FBE08A')
      + p('M50,36 L32,26 L45,27 L50,14 L55,27 L68,26Z', '#4E9A54') + hi(34, 46, 7, 3),
    watermelon: () => p('M8,38 A42,42 0 0 0 92,38Z', '#3E9B6A') + p('M14,38 A36,36 0 0 0 86,38Z', W) + vol('M19,38 A31,31 0 0 0 81,38Z', L('red'))
      + [[34, 48], [50, 46], [66, 48], [42, 58], [58, 58], [50, 66]].map(q => e(q[0], q[1], 2, 3.2, INK)).join('') + e(34, 42, 8, 1.8, '#fff', 0, .5),
    donut: bg => ball(50, 55, 33, BIS) + p('M50,24 C70,24 82,38 80,54 C79,62 72,60 70,68 C68,76 58,82 50,80 C42,82 32,76 30,68 C28,60 21,62 20,54 C18,38 30,24 50,24Z', '#F08AB0') + c(50, 54, 10.5, '#C98A4E') + c(50, 53, 9, bg)
      + [[36, 38, 20, '#fff'], [58, 34, -30, '#F7E08A'], [70, 50, 60, '#6FC3E8'], [32, 56, -50, '#F7E08A'], [44, 70, 10, '#fff'], [62, 68, -20, '#6FC3E8']].map(q => `<rect x="${q[0] - 4}" y="${q[1] - 1.4}" width="8" height="2.8" rx="1.4" fill="${q[3]}" transform="rotate(${q[2]} ${q[0]} ${q[1]})"/>`).join('') + hi(38, 32, 8, 2.6),
    cupcake: () => vol('M28,58 H72 L65,90 H35Z', L('indigo')) + st('M38,60 l3,28 M50,60 v28 M62,60 l-3,28', '#96A5EA', 2.4) + egg(50, 56, 27, 10, PINK) + egg(50, 46, 21, 9.5, PINK) + egg(50, 37, 14, 8.5, PINK)
      + c(50, 27, 6.5, L('red')) + hi(48, 25, 2.2, 1.2) + hi(38, 44, 6, 2),
    cookie: () => ball(50, 54, 33, '#D9A05B') + [[38, 42, 5], [58, 38, 4.4], [66, 56, 5], [46, 60, 4.6], [34, 64, 4], [56, 74, 4.6]].map(q => c(q[0], q[1], q[2], '#6A3F1E')).join('') + hi(36, 34, 9, 3, -30, .45),
    lollipop: () => `<rect x="47" y="56" width="6" height="40" rx="3" fill="#FFFDF6"/><rect x="47" y="56" width="6" height="40" rx="3" fill="url(#toy-g-shade)" opacity=".5"/>` + c(50, 38, 27, L('red'))
      + st('M50,35 a3.5,3.5 0 1 1 -3.5,3.5 a10,10 0 1 1 10,10 a17,17 0 1 1 -17,-17', '#fff', 4.6, 'opacity=".85"') + hi(38, 22, 8, 3),
    icecream: () => vol('M33,54 H67 L50,94Z', BIS) + st('M38,58 L56,78 M46,54 L61,68 M62,58 L44,78 M54,54 L39,68', '#B9722E', 1.8, 'opacity=".7"') + ball(50, 40, 21, PINK)
      + p('M29,44 q6,12 13,4 q6,10 12,2 q8,8 17,-6 q-2,14 -21,15 q-17,0 -21,-15Z', PINK) + c(60, 20, 6.5, L('red')) + hi(40, 30, 8, 3) + hi(58, 18, 2.2, 1.2),
    pretzel: () => st('M28,84 C54,72 72,50 64,36 C58,26 42,28 42,42 M72,84 C46,72 28,50 36,36 C42,26 58,28 58,42', '#9A5A1E', 11) + st('M28,84 C54,72 72,50 64,36 C58,26 42,28 42,42 M72,84 C46,72 28,50 36,36 C42,26 58,28 58,42', '#C98A3E', 7)
      + [[40, 34], [60, 34], [50, 60], [36, 76], [64, 76], [34, 50], [66, 50]].map(q => c(q[0], q[1], 1.8, '#fff')).join(''),
    cherries: () => st('M50,16 Q36,34 32,56 M50,16 Q62,36 68,58', '#4E9A54', 4) + p('M50,16 Q66,6 80,14 Q66,26 50,16Z', '#4E9A54') + c(32, 68, 17, L('red')) + c(68, 70, 17, L('red')) + hi(26, 60, 5, 2.2) + hi(62, 62, 5, 2.2),
    kiwi: () => ball(50, 54, 33, '#8A6A3A') + c(50, 54, 28, '#9CCB5A') + c(50, 54, 10, '#F4F0D0') + ring(12, 50, 54, 17, (x, y, i, a) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="3" fill="${INK}" transform="rotate(${a + 90} ${x} ${y})"/>`) + hi(38, 36, 8, 2.6, -30, .45),
    pizza: () => vol('M50,92 L16,26 Q50,10 84,26Z', '#F2C24A') + p('M16,26 Q50,10 84,26 L80,35 Q50,21 20,35Z', '#D9914A') + c(43, 42, 7.5, L('red')) + c(61, 50, 6.5, L('red')) + c(48, 66, 6, L('red'))
      + e(56, 36, 3, 1.6, GRN, 30) + e(40, 56, 3, 1.6, GRN, -20) + e(56, 64, 3, 1.6, GRN, 60) + hi(34, 28, 8, 2.2, -14, .5),
    pancakes: () => e(50, 84, 40, 9, '#D9CEB8') + e(50, 81, 40, 9, W) + [72, 60, 48].map(y => e(50, y + 5, 31, 10, '#B9722E') + e(50, y, 31, 10, '#EDB868')).join('')
      + p('M24,48 Q50,36 76,48 Q78,56 70,54 Q68,66 62,56 Q50,60 40,56 Q36,68 30,54 Q22,56 24,48Z', '#8A4A1E') + `<rect x="43" y="38" width="14" height="9" rx="2.4" fill="#FBE08A"/>` + hi(36, 44, 6, 1.8, -10, .5),
    /* ---- toys ---- */
    balloon: () => st('M50,72 q-9,10 0,22', '#7A5A22', 2.4) + p('M45,65 h10 l-5,8Z', '#B52323') + egg(50, 40, 26, 28, L('red')) + hi(40, 26, 8, 4),
    palette: bg => vol('M50,18 C78,18 90,40 86,56 C82,70 66,62 60,70 C54,78 62,88 48,88 C24,88 12,68 14,50 C16,32 30,18 50,18Z', '#E0B67A') + c(66, 58, 5.5, bg)
      + c(34, 40, 7.5, L('red')) + c(52, 33, 7.5, L('mustard')) + c(70, 41, 7.5, L('teal')) + c(29, 60, 7.5, L('indigo')) + c(42, 74, 6.5, L('plum')) + hi(32, 37, 2.6, 1.4) + hi(50, 30, 2.6, 1.4),
    teddy: () => ball(25, 28, 12, '#B9824A') + ball(75, 28, 12, '#B9824A') + c(25, 28, 6, '#E9C99A') + c(75, 28, 6, '#E9C99A') + ball(50, 53, 31, '#B9824A') + e(50, 63, 13.5, 10.5, '#E9C99A')
      + e(50, 59, 4.8, 3.4, INK) + eyes(38, 62, 49, 3.4) + smile(50, 65, 4.5) + hi(40, 32, 8, 2.6),
    kite: () => st('M50,80 q9,6 0,13 q-8,4 -2,6', '#7A5A22', 2.4) + p('M52,86 l8,-4 0,8Z', L('red')) + p('M48,93 l-8,-4 0,8Z', L('mustard'))
      + p('M50,8 L80,42 L50,42Z', L('red')) + p('M50,8 L20,42 L50,42Z', L('mustard')) + p('M20,42 L50,82 L50,42Z', L('teal')) + p('M80,42 L50,82 L50,42Z', L('indigo')) + st('M50,8 V82 M20,42 H80', '#fff', 1.6, 'opacity=".6"') + hi(38, 28, 6, 2),
    guitar: () => p('M56,46 L80,14 L87,19 L63,51Z', '#7A4A24') + p('M77,8 l13,9 -5,7 -13,-9Z', '#4A2A10') + ball(40, 66, 22, '#D98A3E') + ball(55, 46, 15, '#D98A3E') + c(44, 62, 7, '#4A2A10')
      + st('M40,68 L82,14 M44,70 L85,17', '#FFF6DF', 1, 'opacity=".8"') + `<rect x="30" y="72" width="16" height="4" rx="2" fill="#4A2A10" transform="rotate(-38 38 74)"/>` + hi(30, 54, 6, 2.4),
    castle: () => `<rect x="30" y="46" width="40" height="42" fill="#DDE4EC"/><rect x="30" y="40" width="8" height="8" fill="#DDE4EC"/><rect x="46" y="40" width="8" height="8" fill="#DDE4EC"/><rect x="62" y="40" width="8" height="8" fill="#DDE4EC"/>`
      + `<rect x="16" y="36" width="18" height="52" rx="2" fill="#C5CDD8"/><rect x="66" y="36" width="18" height="52" rx="2" fill="#C5CDD8"/><rect x="16" y="36" width="68" height="52" fill="url(#toy-g-shade)" opacity=".4"/>`
      + p('M12,37 L25,14 L38,37Z', L('red')) + p('M62,37 L75,14 L88,37Z', L('red')) + p('M43,88 V70 a7,7 0 0 1 14,0 V88Z', '#7A4A24') + `<rect x="22" y="48" width="6" height="9" rx="3" fill="#2B3674"/><rect x="72" y="48" width="6" height="9" rx="3" fill="#2B3674"/>`
      + st('M50,40 V24', '#7A4A24', 2) + p('M50,24 l11,4 -11,4Z', L('mustard')),
    carousel: () => `<rect x="16" y="80" width="68" height="9" rx="4" fill="#E0B67A"/><rect x="16" y="85" width="68" height="4" rx="2" fill="#B98448"/>` + st('M28,42 V80 M50,42 V80 M72,42 V80', '#C99A22', 3.4)
      + egg(39, 64, 9, 6, W) + c(46, 59, 4, W) + egg(61, 58, 9, 6, PINK) + c(68, 53, 4, PINK) + p('M10,42 L50,14 L90,42Z', L('red')) + p('M50,14 L38,42 H26Z', W) + p('M50,14 L62,42 H74Z', W)
      + `<rect x="10" y="40" width="80" height="6" rx="3" fill="url(#toy-lac-mustard)"/>` + c(50, 12, 4.5, L('mustard')),
    ferriswheel: () => st('M50,46 L31,92 M50,46 L69,92', '#7A4A24', 5) + `<circle cx="50" cy="46" r="31" fill="none" stroke="#9AA3AE" stroke-width="4"/>` + st('M19,46 H81 M50,15 V77 M28,24 L72,68 M72,24 L28,68', '#C5CDD8', 2)
      + ring(8, 50, 46, 31, (x, y, i) => c(x, y, 6.5, L(['red', 'mustard', 'teal', 'indigo', 'plum', 'red', 'mustard', 'teal'][i]))) + c(50, 46, 6, L('mustard')),
    ball: () => c(50, 54, 33, W) + p('M50,54 L50,21 A33,33 0 0 1 78.6,37.5Z', L('red')) + p('M50,54 L78.6,70.5 A33,33 0 0 1 50,87Z', L('teal')) + p('M50,54 L21.4,70.5 A33,33 0 0 1 21.4,37.5Z', L('mustard'))
      + c(50, 54, 33, SH, .45) + c(50, 54, 5, '#fff') + hi(38, 34, 9, 3.4),
    present: () => `<rect x="16" y="46" width="68" height="46" rx="8" fill="#9E690D"/><rect x="16" y="42" width="68" height="46" rx="8" fill="url(#toy-lac-mustard)"/><rect x="12" y="30" width="76" height="20" rx="7" fill="#C98A16"/><rect x="12" y="26" width="76" height="20" rx="7" fill="url(#toy-lac-mustard)"/>`
      + `<rect x="43" y="26" width="14" height="62" fill="url(#toy-lac-red)"/>` + p('M50,26 C36,4 16,10 28,22 Q38,28 50,26Z M50,26 C64,4 84,10 72,22 Q62,28 50,26Z', L('red')) + c(50, 25, 6, '#B52323') + hi(28, 31, 10, 2.6, -8),
    yoyo: () => st('M52,32 Q38,22 44,10', '#7A5A22', 2.4) + `<circle cx="44" cy="7" r="4" fill="none" stroke="#7A5A22" stroke-width="2.4"/>` + ball(52, 60, 28, L('teal')) + c(52, 60, 16, W, .92) + c(52, 60, 7, L('mustard')) + hi(40, 42, 8, 3),
    tent: () => `<rect x="16" y="50" width="68" height="38" fill="#FFFDF6"/><rect x="16" y="50" width="11" height="38" fill="url(#toy-lac-red)"/><rect x="73" y="50" width="11" height="38" fill="url(#toy-lac-red)"/><rect x="16" y="50" width="68" height="38" fill="url(#toy-g-shade)" opacity=".35"/>`
      + p('M40,88 V68 Q50,56 60,68 V88Z', '#2B3674') + p('M8,52 L50,18 L92,52Z', L('red')) + p('M50,18 L40,52 H28Z', W) + p('M50,18 L60,52 H72Z', W) + st('M50,18 V6', '#7A4A24', 2) + p('M50,6 l12,4 -12,4Z', L('mustard')),
  };

  const STICKERS = [
    { id: 'animals', name: 'Animals', bg: '#DCEFD0', items: ['fox', 'panda', 'koala', 'tiger', 'lion', 'frog', 'monkey', 'unicorn', 'owl', 'turtle', 'butterfly', 'rabbit'] },
    { id: 'ocean', name: 'Ocean', bg: '#CDE8F6', items: ['whale', 'dolphin', 'shark', 'fish', 'puffer', 'crab', 'shell', 'squid', 'penguin', 'seal', 'octopus', 'lobster'] },
    { id: 'space', name: 'Space', bg: '#2B3674', items: ['rocket', 'planet', 'moon', 'star', 'comet', 'ufo', 'earth', 'sun', 'rainbow', 'telescope', 'shootingstar', 'satellite'] },
    { id: 'treats', name: 'Treats', bg: '#FFE4D8', items: ['strawberry', 'watermelon', 'donut', 'cupcake', 'cookie', 'lollipop', 'icecream', 'pretzel', 'cherries', 'kiwi', 'pizza', 'pancakes'] },
    { id: 'toys', name: 'Toys', bg: '#FFF0BF', items: ['balloon', 'palette', 'teddy', 'kite', 'guitar', 'castle', 'carousel', 'ferriswheel', 'ball', 'present', 'yoyo', 'tent'] },
  ];
  // Emoji that older data may hold (the sticker set was emoji; treat lists store one per treat) -> drawing key.
  const EMOJI = ['\u{1F98A}', '\u{1F43C}', '\u{1F428}', '\u{1F42F}', '\u{1F981}', '\u{1F438}', '\u{1F435}', '\u{1F984}', '\u{1F989}', '\u{1F422}', '\u{1F98B}', '\u{1F430}',
    '\u{1F433}', '\u{1F42C}', '\u{1F988}', '\u{1F420}', '\u{1F421}', '\u{1F980}', '\u{1F41A}', '\u{1F991}', '\u{1F427}', '\u{1F9AD}', '\u{1F419}', '\u{1F99E}',
    '\u{1F680}', '\u{1FA90}', '\u{1F319}', '\u{2B50}', '\u{2604}', '\u{1F6F8}', '\u{1F30D}', '\u{1F31E}', '\u{1F308}', '\u{1F52D}', '\u{1F320}', '\u{1F6F0}',
    '\u{1F353}', '\u{1F349}', '\u{1F369}', '\u{1F9C1}', '\u{1F36A}', '\u{1F36D}', '\u{1F366}', '\u{1F968}', '\u{1F352}', '\u{1F95D}', '\u{1F355}', '\u{1F95E}',
    '\u{1F388}', '\u{1F3A8}', '\u{1F9F8}', '\u{1FA81}', '\u{1F3B8}', '\u{1F3F0}', '\u{1F3A0}', '\u{1F3A1}', '\u{26BD}', '\u{1F381}', '\u{1FA80}', '\u{1F3AA}'];
  const KEYS = STICKERS.flatMap(s => s.items), OF = {};
  EMOJI.forEach((ch, i) => { OF[ch] = KEYS[i]; });
  Object.assign(OF, { '\u{1F368}': 'icecream', '\u{1F367}': 'icecream', '\u{1F36C}': 'lollipop', '\u{1F370}': 'cupcake', '\u{1F382}': 'cupcake', '\u{1F3C0}': 'ball', '\u{1F3D0}': 'ball', '\u{1F31F}': 'star', '\u{1F43B}': 'teddy', '\u{1F407}': 'rabbit', '\u{1F41F}': 'fish' });
  const picOf = ch => OF[String(ch || '').replace(/[️‍]/g, '')] || null;

  function pic(key, size, bg) {
    size = size || 96; const g = G[key] || G.present;
    return `<svg class="toy-pic" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">${g(bg || '#FFFDF6')}</svg>`;
  }
  const BYID = {}; STICKERS.forEach(s => s.items.forEach((k, i) => { BYID[s.id + ':' + i] = { key: k, pack: s }; }));
  function sticker(id, size, opts) {
    size = size || 96; opts = opts || {};
    const it = BYID[id] || { key: G[id] ? id : 'present', pack: STICKERS[4] }, bg = it.pack.bg, dark = it.pack.id === 'space';
    const stars = dark ? [[22, 30, 1.6], [80, 24, 1.3], [84, 70, 1.5], [18, 72, 1.2], [50, 14, 1.2]].map(q => c(q[0], q[1], q[2], '#FFF6D0', .8)).join('') : '';
    return `<svg class="toy-sticker${opts.gold ? ' toy-sticker--gold' : ''}" width="${size}" height="${size}" viewBox="-8 -8 116 116" role="img" aria-label="${it.key}${opts.gold ? ', gold' : ''}">`
      + `<ellipse cx="54" cy="104" rx="42" ry="6" fill="url(#toy-g-shadow)" opacity=".7"/>`
      + (opts.gold ? c(50, 50, 56, 'url(#toy-g-moonglow)', .9) + c(50, 51.5, 53, '#9E690D') + c(50, 50, 53, L('mustard')) : c(50, 51.5, 53, '#D9CEB8') + c(50, 50, 53, '#FFFDF6'))
      + c(50, 50, 46, bg) + (dark ? '' : c(50, 50, 46, '#fff', .25)) + stars
      + `<g transform="translate(9 9) scale(.82)">${(G[it.key] || G.present)(bg)}</g>`
      + (opts.gold ? spark(92, 14, 7, '#FFFDF6') + spark(10, 84, 5, '#FFFDF6') : '') + `</svg>`;
  }
  // The wrapped present of the sticker reveal: a lacquered box with a ribbon and bow (gold wrapping for a gold sticker).
  function present(size, opts) {
    size = size || 210; opts = opts || {}; const box = opts.gold ? 'mustard' : 'teal', dk = opts.gold ? '#9E690D' : '#137A70', rb = 'red';
    return `<svg class="toy-present" width="${size}" height="${size}" viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="112" cy="186" rx="84" ry="11" fill="url(#toy-g-shadow)" opacity=".6"/><ellipse cx="102" cy="184" rx="70" ry="9" fill="url(#toy-g-shadow)" opacity=".95"/>`
      + `<rect x="30" y="86" width="140" height="98" rx="14" fill="${dk}"/><rect x="30" y="80" width="140" height="98" rx="14" fill="url(#toy-lac-${box})"/><rect x="30" y="80" width="140" height="98" rx="14" fill="url(#toy-g-shade)" opacity=".5"/>`
      + `<rect x="88" y="80" width="24" height="98" fill="url(#toy-lac-${rb})"/>`
      + `<g class="toy-present-lid"><rect x="20" y="58" width="160" height="38" rx="12" fill="${dk}"/><rect x="20" y="52" width="160" height="38" rx="12" fill="url(#toy-lac-${box})"/><rect x="88" y="52" width="24" height="38" fill="url(#toy-lac-${rb})"/>`
      + `<path d="M100,52 C74,10 34,22 56,44 Q76,56 100,52Z M100,52 C126,10 166,22 144,44 Q124,56 100,52Z" fill="url(#toy-lac-${rb})"/><path d="M100,52 C86,32 62,28 60,38 M100,52 C114,32 138,28 140,38" fill="none" stroke="#8A181D" stroke-width="3" opacity=".5" stroke-linecap="round"/>`
      + `<circle cx="100" cy="50" r="11" fill="#B52323"/><circle cx="100" cy="49" r="10" fill="url(#toy-lac-${rb})"/><ellipse cx="46" cy="62" rx="18" ry="4" transform="rotate(-6 46 62)" fill="#fff" opacity=".6"/></g>`
      + (opts.gold ? spark(170, 36, 10, '#FFFDF6') + spark(26, 30, 7, '#FFFDF6') + spark(184, 120, 6, '#FFFDF6') : '') + `</svg>`;
  }
  Object.assign(TOY, { sticker, pic, picOf, present, STICKERS, PICS: Object.keys(G) });
})(window);
