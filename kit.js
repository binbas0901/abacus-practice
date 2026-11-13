// Workshop kit — drawings every screen shares: Bix in his poses, lacquered beads, and one icon set.
// Returns SVG strings, so screens stay plain HTML. Colours come from workshop.css tokens.
// Usage:  el.innerHTML = WS.bix('cheer', 120);  WS.bead('jade', 76);  WS.icon('eye', 28, '#fff');
(function () {
  'use strict';
  const C = {
    red: '#E2452F', indigo: '#2A3A86', ochre: '#E8A93A', jade: '#2F9E7E', walnut: '#B07A45', locked: '#D9C4A0',
    pale: '#CBD4DB', white: '#FFFFFF', ink: '#1E2433', bix: '#EE5A3C', bixSeam: '#C7432A', feet: '#5B3A24', bulb: '#F2B635',
  };
  const DARK = { red: '#A92E1C', indigo: '#1C2763', ochre: '#C48A22', jade: '#1F7A5F', walnut: '#8C5C2E', locked: '#BFA77F', pale: '#B3BEC7', white: '#C9D3D9' };

  // ---------- Bix: a soroban bead with a face ----------
  // moods: happy | cheer | think | concerned | wow | sleepy ;  opts.look: -1 left, 0, 1 right
  const EYES = {
    open: (dx, dy) => `<circle cx="37" cy="47" r="9" fill="#fff"/><circle cx="${39 + dx}" cy="${48 + dy}" r="4.6" fill="${C.ink}"/><circle cx="63" cy="47" r="9" fill="#fff"/><circle cx="${65 + dx}" cy="${48 + dy}" r="4.6" fill="${C.ink}"/>`,
    closed: () => `<path d="M30 47 Q37 40 44 47" stroke="${C.ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M56 47 Q63 40 70 47" stroke="${C.ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    sleepy: () => `<path d="M30 48 Q37 52 44 48" stroke="${C.ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M56 48 Q63 52 70 48" stroke="${C.ink}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
  };
  const MOUTH = {
    happy: `<path d="M42 66 Q50 74 58 66" stroke="${C.ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    cheer: `<path d="M38 62 Q50 80 62 62Z" fill="${C.ink}"/>`,
    think: `<path d="M44 68 Q50 66 56 68" stroke="${C.ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    concerned: `<path d="M43 69 Q50 64 57 69" stroke="${C.ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`,
    wow: `<ellipse cx="50" cy="68" rx="5" ry="6" fill="${C.ink}"/>`,
    sleepy: `<path d="M45 68 Q50 70 55 68" stroke="${C.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  };
  function bix(mood, size, opts) {
    mood = MOUTH[mood] ? mood : 'happy'; size = size || 96; opts = opts || {};
    const look = opts.look || 0;
    const eyes = mood === 'cheer' ? EYES.closed() : mood === 'sleepy' ? EYES.sleepy()
      : EYES.open(look * 2, mood === 'think' ? -3 : mood === 'concerned' ? 2 : 0);
    const sparkle = mood === 'cheer' ? `<g stroke="${C.ochre}" stroke-width="3" stroke-linecap="round"><line x1="10" y1="18" x2="17" y2="25"/><line x1="90" y1="18" x2="83" y2="25"/><line x1="3" y1="40" x2="11" y2="40"/><line x1="97" y1="40" x2="89" y2="40"/></g>` : '';
    // .m-rest is the mood's mouth; .m-a / .m-b alternate while talking (see workshop.css .ws-bix.talking)
    return `<span class="ws-bix ws-bix-${mood}"><svg width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="Bix">`
      + sparkle
      + `<line x1="50" y1="9" x2="50" y2="28" stroke="${C.feet}" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="9" r="6.5" fill="${C.bulb}"/>`
      + `<g class="ws-bix-body"><path d="M5 55 Q50 8 95 55 Q50 100 5 55Z" fill="${C.bix}"/><path d="M8 55 Q50 44 92 55" stroke="${C.bixSeam}" stroke-width="3" fill="none"/>`
      + `<ellipse cx="34" cy="31" rx="13" ry="4.5" fill="#fff" opacity=".28" transform="rotate(-18 34 31)"/>`
      + eyes
      + `<g class="m-rest">${MOUTH[mood]}</g><g class="m-a">${MOUTH.happy}</g><g class="m-b">${MOUTH.wow}</g></g>`
      + `<ellipse cx="38" cy="92" rx="9" ry="5" fill="${C.feet}"/><ellipse cx="62" cy="92" rx="9" ry="5" fill="${C.feet}"/>`
      + `</svg></span>`;
  }

  // ---------- a lacquered soroban bead (lens shape) ----------
  // color: red|indigo|ochre|jade|walnut|locked|pale|white  ;  opts.ring: outline colour name ; opts.label for screen readers
  function bead(color, width, opts) {
    opts = opts || {}; width = width || 76; const h = Math.round(width * 104 / 170);
    const fill = C[color] || color, ring = opts.ring ? (C[opts.ring] || opts.ring) : null;
    const a11y = opts.label ? `role="img" aria-label="${opts.label}"` : 'aria-hidden="true"';
    return `<svg class="ws-bead" width="${width}" height="${h}" viewBox="0 0 170 104" ${a11y}>`
      + `<path d="M4 52 Q85 -12 166 52 Q85 116 4 52Z" fill="${fill}"${ring ? ` stroke="${ring}" stroke-width="10"` : ''}/>`
      + (color === 'white' || ring ? '' : `<path d="M8 52 Q85 34 162 52" stroke="${DARK[color] || 'rgba(0,0,0,.18)'}" stroke-width="3" fill="none"/><ellipse cx="62" cy="31" rx="24" ry="7" fill="#fff" opacity=".28"/>`)
      + `</svg>`;
  }

  // ---------- icons: one stroke set, 24-unit grid ----------
  const I = {
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    ear: '<path d="M6 8.5a6 6 0 1 1 12 0c0 6-6 6-6 10a3 3 0 0 1-6 0"/><path d="M15 8.5a3 3 0 1 0-6 0"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    game: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6C2.6 9.4 2 14.5 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.4-1.4a2 2 0 0 1 1.4-.6h4.4a2 2 0 0 1 1.4.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.5-.6-6.6-.7-7.3A4 4 0 0 0 17.3 5z"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    retry: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>',
    speaker: '<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    keypad: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h8"/>',
    share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>',
    sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5 4 5c0 5 3 7 8 7z"/><path d="M12 14c0-3 2.5-6 8-6 0 4-3 6-8 6z"/>',
    jar: '<path d="M8 3h8v3H8z"/><path d="M7 6h10a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/><path d="M5 13h14"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  const FILLED = {
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"/>',
  };
  function icon(name, size, color, strokeWidth) {
    size = size || 24; color = color || 'currentColor';
    if (FILLED[name]) return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" aria-hidden="true">${FILLED[name]}</svg>`;
    if (name === 'abacus') return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="3" y="5" width="26" height="22" rx="4" stroke="${color}" stroke-width="2.4"/><path d="M3 13h26" stroke="${color}" stroke-width="2.4"/><path d="M10 5v22M16 5v22M22 5v22" stroke="${color}" stroke-width="1.6"/><ellipse cx="10" cy="9" rx="3.4" ry="2.2" fill="${C.ochre}"/><ellipse cx="16" cy="18" rx="3.4" ry="2.2" fill="${C.ochre}"/><ellipse cx="22" cy="21" rx="3.4" ry="2.2" fill="${C.ochre}"/></svg>`;
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${strokeWidth || 2.2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;
  }

  // A speech bubble with the "Bix says this out loud" mark.
  function bubble(text) { return `<span class="ws-bubble"><span class="ws-text">${text}</span><span class="ws-say">${icon('speaker', 24, C.indigo)}</span></span>`; }
  // A number tile: first term has no sign; later terms show + / − / ×.
  function tile(term, first) {
    if (first) return `<div class="ws-tile first">${Math.abs(term)}</div>`;
    const neg = term < 0;
    return `<div class="ws-tile"><span class="${neg ? 'minus' : 'plus'}">${neg ? '−' : '+'}</span><span>${Math.abs(term)}</span></div>`;
  }

  window.WS = { colors: C, bix, bead, icon, bubble, tile, ICONS: Object.keys(I).concat(Object.keys(FILLED), 'abacus') };
})();

// ---------- dialog (added by the door / grown-ups stream) ----------
// A Workshop-styled yes/no dialog instead of the browser's confirm():
//   if (await WS.confirm('Remove Mia?', 'This erases…', { ok:'Remove', cancel:'Keep', danger:true })) …
// Resolves true for the main button, false for the other one, Escape, or a tap outside the panel.
// Text is escaped; message may contain line breaks (each becomes a paragraph).
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function confirm(title, message, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const back = document.createElement('div');
      back.className = 'ws-dialog'; back.setAttribute('role', 'presentation');
      const id = 'wsdlg' + Date.now().toString(36);
      const paras = String(message || '').split(/\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('');
      back.innerHTML = `<div class="ws-dialog-panel ws-panel ws-grownup" role="alertdialog" aria-modal="true" aria-labelledby="${id}t" aria-describedby="${id}m">`
        + `<h2 class="ws-dialog-title" id="${id}t">${esc(title)}</h2><div class="ws-dialog-msg" id="${id}m">${paras}</div>`
        + `<div class="ws-dialog-btns"><button type="button" class="ws-dialog-btn quiet" data-r="0">${esc(opts.cancel || 'Cancel')}</button>`
        + `<button type="button" class="ws-dialog-btn ${opts.danger ? 'danger' : 'main'}" data-r="1">${esc(opts.ok || 'OK')}</button></div></div>`;
      const prev = document.activeElement;
      const done = r => { document.removeEventListener('keydown', onKey, true); back.remove(); if (prev && prev.focus) try { prev.focus(); } catch (e) { /* gone */ } resolve(r); };
      const onKey = e => {
        if (e.key === 'Escape') { e.preventDefault(); done(false); }
        else if (e.key === 'Tab') {   // keep focus inside the dialog
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
  window.WS.confirm = confirm;
})();
