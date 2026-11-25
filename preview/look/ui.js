/* Abacus app design kit: everyday pieces (buttons, cards, speech bubbles, progress moons, chips, icons).
   Plug in with: <script src="look/ui.js"></script>
     <ab-button variant="primary" icon="play">Start lesson</ab-button>      variant: primary (orange, the ONE main action) | soft (purple) | plain (white)
                                                                             size: lg | md (default) | sm     disabled: present = greyed
     <ab-icon-button icon="close" label="Close lesson"></ab-icon-button>     round white button; label is read aloud, never shown
     <ab-card>…</ab-card>                                                    white rounded panel; pad="none|sm|md|lg"
     <ab-bubble tail="left" tone="juni">Seven needs three.</ab-bubble>       tone: juni (white) | bixi (orange) ; tail: left | right | bottom-left | bottom-right | top-left | none
        bubble.say("New line")          replace the text
        bubble.mark(i, n = 1)           karaoke: words before i fade, words i..i+n-1 light up (sync this to the voice); mark(-1) = all plain
     <ab-moons total="6" done="3"></ab-moons>                                Juni's progress moons: done = full gold, next = purple ring, rest = faint
     <ab-chip icon="star">24</ab-chip>                                       small white pill (name, stars)
     <ab-icon name="lock" size="24"></ab-icon>                               the kit's icon set, listed in ABKit.icons
   Clicks work as normal: el.addEventListener('click', …). */
(function () {
  if (window.customElements.get('ab-button')) return;
  const v = (n, fb) => `var(--ab-${n}, ${fb})`;
  const FONT = v('font', 'system-ui, sans-serif');

  // Icons: simple rounded strokes, drawn with currentColor so they take the text color.
  const I = {
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>',
    replay: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4.5h4.5"/>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H6M11 6l-6 6 6 6"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    star: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" fill="var(--ab-star, #F5A623)" stroke="#D9861A"/>',
    headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
    abacus: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M8 3v18M16 3v18"/>',
    sparkle: '<path d="M12 3c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6z"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    book: '<path d="M12 6c-2-1.3-5-1.3-8 0v12c3-1.3 6-1.3 8 0 2-1.3 5-1.3 8 0V6c-3-1.3-6-1.3-8 0z"/><path d="M12 6v12"/>'
  };
  const svg = (name, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

  const define = (tag, cls) => customElements.define(tag, cls);
  const shadow = (el, css, html) => { (el.shadowRoot || el.attachShadow({ mode: 'open' })).innerHTML = `<style>:host{font-family:${FONT}}${css}</style>${html}`; return el.shadowRoot; };

  /* ---------- ab-icon ---------- */
  define('ab-icon', class extends HTMLElement {
    static get observedAttributes() { return ['name', 'size']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() { shadow(this, ':host{display:inline-flex;line-height:0}', svg(this.getAttribute('name'), parseFloat(this.getAttribute('size')) || 24)); }
  });

  /* ---------- ab-button ---------- */
  const BTN = {
    primary: [v('orange', '#F08A1C'), '#FFFFFF', v('orange-deep', '#C66A0C')],
    soft: [v('purple-soft', '#EEE6FA'), v('purple', '#5B3596'), v('purple-line', '#DCD3EC')],
    plain: ['#FFFFFF', v('purple', '#5B3596'), v('purple-line', '#DCD3EC')]
  };
  const SIZE = { lg: [76, 28, 44, 28], md: [64, 23, 32, 24], sm: [56, 19, 24, 20] };   // height, font, side padding, icon
  define('ab-button', class extends HTMLElement {
    static get observedAttributes() { return ['variant', 'size', 'icon', 'icon-end', 'disabled']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const [bg, fg, edge] = BTN[this.getAttribute('variant')] || BTN.primary;
      const [h, fs, px, is] = SIZE[this.getAttribute('size')] || SIZE.md;
      const ic = this.getAttribute('icon'), ice = this.getAttribute('icon-end'), dis = this.hasAttribute('disabled');
      shadow(this, `
        :host{display:inline-flex}
        button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:12px;width:100%;
          min-height:${h}px;padding:0 ${px}px;border-radius:999px;background:${bg};color:${fg};font:900 ${fs}px ${FONT};
          box-shadow:0 6px 0 ${edge};cursor:pointer;transition:transform .08s,box-shadow .08s;-webkit-tap-highlight-color:transparent;white-space:nowrap}
        button:active{transform:translateY(4px);box-shadow:0 2px 0 ${edge}}
        button:focus-visible{outline:4px solid ${v('purple', '#5B3596')};outline-offset:4px}
        button[disabled]{opacity:.45;cursor:default;transform:none;box-shadow:0 6px 0 ${edge}}`,
        `<button part="button" ${dis ? 'disabled' : ''}>${ic ? svg(ic, is) : ''}<slot></slot>${ice ? svg(ice, is) : ''}</button>`);
    }
  });

  /* ---------- ab-icon-button ---------- */
  define('ab-icon-button', class extends HTMLElement {
    static get observedAttributes() { return ['icon', 'label', 'size']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const s = parseFloat(this.getAttribute('size')) || 56;
      shadow(this, `
        :host{display:inline-flex}
        button{all:unset;box-sizing:border-box;width:${s}px;height:${s}px;border-radius:50%;background:#fff;color:${v('purple', '#5B3596')};
          display:flex;align-items:center;justify-content:center;box-shadow:0 2px 0 rgba(46,35,72,.08),0 4px 12px rgba(91,53,150,.08);cursor:pointer;
          transition:transform .08s;-webkit-tap-highlight-color:transparent}
        button:active{transform:scale(.92)}
        button:focus-visible{outline:4px solid ${v('purple', '#5B3596')};outline-offset:3px}`,
        `<button part="button" aria-label="${(this.getAttribute('label') || '').replace(/"/g, '&quot;')}">${svg(this.getAttribute('icon'), Math.round(s * 0.43))}</button>`);
    }
  });

  /* ---------- ab-card ---------- */
  const PADS = { none: 0, sm: 16, md: 24, lg: 32 };
  define('ab-card', class extends HTMLElement {
    static get observedAttributes() { return ['pad']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const p = PADS[this.getAttribute('pad')] ?? PADS.md;
      shadow(this, `:host{display:block;box-sizing:border-box;background:#fff;border-radius:${v('radius-lg', '32px')};padding:${p}px;box-shadow:${v('shadow-card', '0 10px 30px rgba(91,53,150,.14)')};color:${v('ink', '#2E2348')}}`, '<slot></slot>');
    }
  });

  /* ---------- ab-chip ---------- */
  define('ab-chip', class extends HTMLElement {
    static get observedAttributes() { return ['icon']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const ic = this.getAttribute('icon');
      shadow(this, `:host{display:inline-flex;align-items:center;gap:8px;min-height:56px;padding:0 22px;border-radius:999px;background:#fff;
        box-shadow:0 2px 0 rgba(46,35,72,.08);font:800 20px ${FONT};color:${v('ink', '#2E2348')};box-sizing:border-box}`,
        `${ic ? svg(ic, 24) : ''}<slot></slot>`);
    }
  });

  /* ---------- ab-moons ---------- */
  define('ab-moons', class extends HTMLElement {
    static get observedAttributes() { return ['total', 'done', 'size']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const t = Math.max(1, parseInt(this.getAttribute('total')) || 6), d = Math.max(0, Math.min(t, parseInt(this.getAttribute('done')) || 0));
      const s = parseFloat(this.getAttribute('size')) || 24;
      let h = '';
      for (let i = 0; i < t; i++) h += `<span class="m ${i < d ? 'done' : i === d ? 'next' : 'todo'}"></span>`;
      shadow(this, `
        :host{display:inline-flex;gap:${Math.round(s * 0.38)}px;align-items:center}
        .m{width:${s}px;height:${s}px;border-radius:50%;box-sizing:border-box;transition:background .3s,border-color .3s}
        .done{background:${v('gold', '#F5D77A')};border:2px solid ${v('gold-line', '#E2B94B')};animation:fill .45s ease-out}
        .next{background:#fff;border:3px solid ${v('purple', '#5B3596')}}
        .todo{background:#F1ECF8;border:2px solid ${v('purple-line', '#DCD3EC')}}
        @keyframes fill{0%{transform:scale(.6)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
        @media (prefers-reduced-motion: reduce){.done{animation:none}}`,
        `<span role="img" aria-label="${d} of ${t} done" style="display:contents">${h}</span>`);
      // only the newest moon should pop when progress grows
      const grew = this._last !== undefined && d > this._last;
      this.shadowRoot.querySelectorAll('.done').forEach((m, i) => { if (!(grew && i === d - 1)) m.style.animation = 'none'; });
      this._last = d;
    }
  });

  /* ---------- ab-bubble ---------- */
  const TONE = { juni: ['#FFFFFF', v('ink', '#2E2348')], bixi: [v('orange-soft', '#FFF1DE'), v('orange-ink', '#7A4300')] };
  define('ab-bubble', class extends HTMLElement {
    static get observedAttributes() { return ['tone', 'tail', 'size']; }
    connectedCallback() {
      // When the page is still loading, the bubble's words haven't arrived yet: read them once the page is ready.
      const go = () => { if (this._text === undefined) this._text = this.textContent.trim(); this._r(); };
      if (document.readyState === 'loading' && this._text === undefined) document.addEventListener('DOMContentLoaded', go, { once: true }); else go();
    }
    attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const [bg, fg] = TONE[this.getAttribute('tone')] || TONE.juni, tail = this.getAttribute('tail') || 'left';
      const fs = parseFloat(this.getAttribute('size')) || 25;
      const T = {
        left: 'left:-10px;top:28px', right: 'right:-10px;top:28px', 'bottom-left': 'left:36px;bottom:-11px',
        'bottom-right': 'right:36px;bottom:-11px', 'top-left': 'left:36px;top:-11px', none: 'display:none'
      }[tail] || 'display:none';
      shadow(this, `
        :host{display:block;position:relative;box-sizing:border-box;padding:18px 24px;background:${bg};color:${fg};border-radius:26px;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};font:800 ${fs}px/1.38 ${FONT}}
        .tail{position:absolute;${T};width:24px;height:24px;background:${bg};transform:rotate(45deg);border-radius:4px}
        p{position:relative;margin:0}
        .w{border-radius:8px;transition:color .2s,background .2s}
        .said{color:${v('ink-faint', '#9A90B0')}}
        :host([tone="bixi"]) .said{color:#C9A27A}
        .now{color:${v('purple', '#5B3596')};background:${v('purple-soft', '#EEE6FA')};box-shadow:0 0 0 4px ${v('purple-soft', '#EEE6FA')}}`,
        `<div class="tail"></div><p aria-live="polite"></p>`);
      this._p = this.shadowRoot.querySelector('p'); this._fill();
    }
    _fill() {
      const words = (this._text || '').split(/\s+/).filter(Boolean);
      this._p.innerHTML = words.map((w, i) => `<span class="w" data-i="${i}">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
      this._words = [...this._p.querySelectorAll('.w')];
    }
    say(text) { this._text = String(text); if (this._p) this._fill(); }
    mark(i, n = 1) {
      (this._words || []).forEach((w, k) => { w.classList.toggle('said', i >= 0 && k < i); w.classList.toggle('now', i >= 0 && k >= i && k < i + n); });
    }
  });

  window.ABKit = Object.assign(window.ABKit || {}, { icons: Object.keys(I) });
})();
