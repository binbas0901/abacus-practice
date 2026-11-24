/* Abacus app design kit: the soroban.
   Plug in with: <script src="look/abacus.js"></script>, then
     <ab-abacus value="7" rods="5"></ab-abacus>
   Attributes
     value        the number shown (ones on the rightmost rod). Changing it slides the beads.
     rods         how many rods (default 5)
     size         width in px (default 760; everything scales)
     labels       present = place names under the rods (ones, tens, hundreds…)
     interactive  present = the child can tap beads to set a number (fires 'change')
     highlight    "<place> <bead> [up|down]"  place 0 = ones, 1 = tens…;  bead h = heaven, e1-e4 = earth (e1 nearest the beam)
                  e.g. highlight="1 e1 up" rings the tens rod's top earth bead with an arrow pointing up.  "" clears.
   Code
     await el.setValue(10)                       slide to a number (resolves when the beads stop)
     await el.setRod(place, {heaven, earth})     set one rod: heaven true/false, earth 0-4
     el.highlight(place, bead, arrow) / el.clearHighlight()
     el.value                                    the number shown now
   Events
     'change'  {detail:{value}} after a child moves beads
     'bead'    {detail:{place, bead}} every bead that moves (hook a click sound to this)
   Colors come from tokens.css (--ab-heaven, --ab-earth, --ab-wood…), with built-in fallbacks. */
(function () {
  if (window.customElements.get('ab-abacus')) return;
  const PITCH = 125, PAD = 92, IN = 26;                 // rod spacing, rod-area padding, frame thickness
  const H = 360, BEAM_Y = 112, BEAM_H = 16;
  const HEAVEN = { up: 54, down: 91 };
  const EARTH_UP = [149, 193, 237, 281], EARTH_DOWN = [176, 220, 264, 308];
  const PLACE_NAMES = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands', 'hundred-thousands', 'millions'];
  const MOVE_MS = 420;
  const v = (name, fb) => `var(--ab-${name}, ${fb})`;

  const CSS = `
    :host { display: inline-block; line-height: 0; -webkit-tap-highlight-color: transparent; }
    svg { width: 100%; height: auto; display: block; overflow: visible; }
    .bead { transition: transform ${MOVE_MS}ms cubic-bezier(.3,1.25,.5,1); }
    :host([interactive]) .bead { cursor: pointer; }
    .ring { animation: ab-pulse 1.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    .arrow { animation: ab-nudge 1.4s ease-in-out infinite; }
    @keyframes ab-pulse { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
    @keyframes ab-nudge { 0%,100% { transform: translateY(0); } 50% { transform: translateY(var(--nudge, -8px)); } }
    @media (prefers-reduced-motion: reduce) { .bead { transition-duration: 1ms; } .ring, .arrow { animation: none; } }
    .lab { font: 800 17px ${v('font', 'system-ui, sans-serif')}; fill: ${v('ink-soft', '#5E5478')}; }`;

  function beadShape(kind) {
    const [t, b, o] = kind === 'h' ? [v('heaven', '#E0584A'), v('heaven-dark', '#B93A2E'), v('heaven-line', '#9C2F25')]
                                    : [v('earth', '#FFD84D'), v('earth-dark', '#EDB51C'), v('earth-line', '#B88A0E')];
    return `<polygon points="-43,0 -14,-22 14,-22 43,0" fill="${t}" stroke="${o}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<polygon points="-43,0 43,0 14,22 -14,22" fill="${b}" stroke="${o}" stroke-width="1.5" stroke-linejoin="round"/>`
      + `<ellipse cx="-14" cy="-10" rx="9" ry="3.5" fill="#fff" opacity=".6"/>`
      + `<rect x="-46" y="-25" width="92" height="50" fill="transparent"/>`;   // bigger tap area
  }

  class ABAbacus extends HTMLElement {
    static get observedAttributes() { return ['value', 'rods', 'size', 'labels', 'highlight']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._state = [];          // per place (0 = ones): {h:bool, e:0-4}
      this._timer = null;
    }
    get rods() { return Math.max(1, Math.min(13, parseInt(this.getAttribute('rods')) || 5)); }
    get value() { return this._state.reduce((s, r, p) => s + (r.h * 5 + r.e) * Math.pow(10, p), 0); }
    set value(n) { this.setAttribute('value', n); }

    connectedCallback() { this._build(); }
    attributeChangedCallback(name, oldV, newV) {
      if (!this.isConnected || oldV === newV) return;
      if (name === 'value') this.setValue(parseInt(newV) || 0);
      else if (name === 'highlight') this._applyHighlightAttr();
      else this._build();
    }

    _build() {
      const n = this.rods, W = (n - 1) * PITCH + PAD * 2 + IN * 2, labels = this.hasAttribute('labels');
      const HT = H + (labels ? 34 : 0);
      this.style.width = (parseFloat(this.getAttribute('size')) || 760) + 'px';
      const xs = [...Array(n).keys()].map(p => IN + PAD + (n - 1 - p) * PITCH);   // place p → rod x (ones rightmost)
      this._x = p => xs[p];
      let s = `<svg viewBox="0 0 ${W} ${HT}" role="img"><style></style>`;
      s += `<rect x="4" y="4" width="${W - 8}" height="${H - 8}" rx="22" fill="${v('wood', '#8A4F26')}"/>`;
      s += `<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="18" fill="none" stroke="${v('wood-light', '#A9683A')}" stroke-width="3"/>`;
      s += `<rect x="${IN}" y="${IN}" width="${W - IN * 2}" height="${H - IN * 2}" rx="8" fill="${v('abacus-back', '#FBF1E2')}"/>`;
      for (let p = 0; p < n; p++) s += `<rect x="${xs[p] - 3}" y="${IN}" width="6" height="${H - IN * 2}" fill="${v('wood-dark', '#6B3A1C')}"/>`;
      s += `<rect x="${IN}" y="${BEAM_Y}" width="${W - IN * 2}" height="${BEAM_H}" fill="${v('wood-dark', '#6B3A1C')}"/>`;
      for (let p = 0; p < n; p += 3) s += `<circle cx="${xs[p]}" cy="${BEAM_Y + BEAM_H / 2}" r="4.5" fill="#fff"/>`;   // unit dots
      s += `<g class="hl"></g>`;
      for (let p = 0; p < n; p++) {
        s += `<g class="bead" data-p="${p}" data-b="h" transform="translate(${xs[p]} 0)"><g class="by" style="transform:translateY(${HEAVEN.up}px)">${beadShape('h')}</g></g>`;
        for (let k = 0; k < 4; k++)
          s += `<g class="bead" data-p="${p}" data-b="e${k + 1}" transform="translate(${xs[p]} 0)"><g class="by" style="transform:translateY(${EARTH_DOWN[k]}px)">${beadShape('e')}</g></g>`;
        if (labels) s += `<text class="lab" x="${xs[p]}" y="${H + 24}" text-anchor="middle">${PLACE_NAMES[p] || ''}</text>`;
      }
      s += `</svg>`;
      this.shadowRoot.innerHTML = `<style>${CSS}</style>` + s;
      // transitions live on the inner group so the rod's x position never animates
      this.shadowRoot.querySelectorAll('.bead').forEach(g => { g.classList.remove('bead'); g.querySelector('.by').classList.add('bead'); });
      this._state = [...Array(n)].map(() => ({ h: false, e: 0 }));
      this._svg = this.shadowRoot.querySelector('svg');
      this._svg.addEventListener('pointerdown', e => this._tap(e));
      this._render(false, parseInt(this.getAttribute('value')) || 0);
      this._applyHighlightAttr();
    }

    _digits(n) { n = Math.max(0, Math.floor(n)); return this._state.map((_, p) => Math.floor(n / Math.pow(10, p)) % 10); }

    _render(animate, n) {
      const d = this._digits(n);
      this._state = d.map(x => ({ h: x >= 5, e: x % 5 }));
      return this._paint(animate);
    }

    _paint(animate, notify) {
      const root = this.shadowRoot;
      if (!animate) root.querySelectorAll('.by').forEach(g => g.style.transitionDuration = '0ms');
      let moved = 0;
      this._state.forEach((r, p) => {
        const set = (b, y) => {
          const g = root.querySelector(`[data-p="${p}"][data-b="${b}"] .by`), want = `translateY(${y}px)`;
          if (g.style.transform !== want) { g.style.transform = want; moved++; if (notify !== false && animate) this.dispatchEvent(new CustomEvent('bead', { detail: { place: p, bead: b } })); }
        };
        set('h', r.h ? HEAVEN.down : HEAVEN.up);
        for (let k = 0; k < 4; k++) set(`e${k + 1}`, k < r.e ? EARTH_UP[k] : EARTH_DOWN[k]);
      });
      if (!animate) { void this._svg.getBoundingClientRect(); root.querySelectorAll('.by').forEach(g => g.style.transitionDuration = ''); }
      this._svg.setAttribute('aria-label', `Abacus showing ${this.value}`);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      return new Promise(res => setTimeout(res, animate && moved && !reduce ? MOVE_MS + 40 : 0));
    }

    setValue(n) { return this._render(true, n); }
    setRod(place, { heaven, earth } = {}) {
      const r = this._state[place]; if (!r) return Promise.resolve();
      if (heaven !== undefined) r.h = !!heaven;
      if (earth !== undefined) r.e = Math.max(0, Math.min(4, earth));
      return this._paint(true);
    }

    _tap(e) {
      if (!this.hasAttribute('interactive')) return;
      const g = e.target.closest('[data-p]'); if (!g) return;
      e.preventDefault();
      const p = +g.dataset.p, b = g.dataset.b, r = this._state[p];
      if (b === 'h') r.h = !r.h;
      else { const k = +b.slice(1); r.e = r.e >= k ? k - 1 : k; }   // tap a counted bead: it and those below drop; else push up to it
      this._paint(true).then(() => {});
      this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value } }));
    }

    highlight(place, bead, arrow) {
      const hl = this.shadowRoot.querySelector('.hl'); if (!hl) return;
      const x = this._x(place); if (x === undefined) return this.clearHighlight();
      const r = this._state[place], k = bead === 'h' ? 0 : parseInt(String(bead).replace('e', '')) || 1;
      const y = bead === 'h' ? (r.h ? HEAVEN.down : HEAVEN.up) : (k - 1 < r.e ? EARTH_UP[k - 1] : EARTH_DOWN[k - 1]);
      const P = v('purple', '#5B3596');
      let s = `<ellipse class="ring" cx="${x}" cy="${y}" rx="56" ry="34" fill="none" stroke="${P}" stroke-width="5" stroke-dasharray="10 7"/>`;
      if (arrow === 'up' || arrow === 'down') {
        const up = arrow === 'up', ax = x + 64, y1 = y + (up ? 26 : -26), y2 = y + (up ? -34 : 34), hy = up ? 16 : -16;
        s += `<g class="arrow" style="--nudge:${up ? -8 : 8}px"><path d="M${ax} ${y1} L${ax} ${y2}" stroke="${P}" stroke-width="6" stroke-linecap="round" fill="none"/>`
          + `<path d="M${ax - 14} ${y2 + hy} L${ax} ${y2} L${ax + 14} ${y2 + hy}" stroke="${P}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></g>`;
      }
      hl.innerHTML = s;
    }
    clearHighlight() { const hl = this.shadowRoot.querySelector('.hl'); if (hl) hl.innerHTML = ''; }
    _applyHighlightAttr() {
      const a = (this.getAttribute('highlight') || '').trim();
      if (!a) return this.clearHighlight();
      const [p, b, arrow] = a.split(/\s+/); this.highlight(parseInt(p) || 0, b || 'e1', arrow);
    }
  }
  customElements.define('ab-abacus', ABAbacus);
})();
