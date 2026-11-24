/* Abacus app design kit: characters.
   Plug in with: <script src="look/characters.js"></script>, then use
     <ab-juni pose="point" size="160"></ab-juni>
     <ab-bixi pose="confused" size="120"></ab-bixi>
   Attributes
     pose   juni: wave | point | clap | think      bixi: wave | confused | cheer | giggle   (unknown → wave)
     size   width in px (height follows the drawing). Default 160.
     flip   present = mirrored (e.g. Juni pointing left)
     idle   present = gentle float, so the character feels alive (off when the device asks for reduced motion)
   Changing pose in code (el.pose = 'cheer') swaps the drawing with a small pop.
   The art is found next to this file (look/art/), so the kit works from any page that loads it. */
(function () {
  if (window.customElements.get('ab-juni')) return;
  const BASE = new URL('.', document.currentScript.src).href;
  const CAST = {
    juni: { name: 'Juni', poses: { wave: 'waving', point: 'pointing', clap: 'clapping', think: 'thinking' } },
    bixi: { name: 'Bixi', poses: { wave: 'waving', confused: 'confused', cheer: 'cheering', giggle: 'giggling' } }
  };
  // Load every drawing once up front so a pose change never flashes empty.
  for (const who in CAST) for (const p in CAST[who].poses) { const i = new Image(); i.src = BASE + `art/${who}-${p}.webp`; }

  const CSS = `
    :host { display: inline-block; line-height: 0; }
    img { width: 100%; height: auto; display: block; user-select: none; -webkit-user-drag: none; }
    :host([flip]) img { transform: scaleX(-1); }
    :host([idle]) .wrap { animation: ab-float 3.2s ease-in-out infinite; }
    .pop { animation: ab-pop 0.35s ease-out; }
    @keyframes ab-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes ab-pop { 0% { transform: scale(0.92); } 60% { transform: scale(1.05); } 100% { transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { :host([idle]) .wrap, .pop { animation: none; } }`;

  class ABCharacter extends HTMLElement {
    static get observedAttributes() { return ['pose', 'size']; }
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML = `<style>${CSS}</style><div class="wrap"><img alt=""></div>`;
      this._img = this.shadowRoot.querySelector('img');
    }
    get who() { return this.constructor.who; }
    get pose() { const p = this.getAttribute('pose'); return CAST[this.who].poses[p] ? p : 'wave'; }
    set pose(v) { this.setAttribute('pose', v); }
    connectedCallback() { this._draw(false); }
    attributeChangedCallback(name, oldV, newV) { if (this.isConnected && oldV !== newV) this._draw(name === 'pose'); }
    _draw(pop) {
      const c = CAST[this.who], p = this.pose;
      this.style.width = (parseFloat(this.getAttribute('size')) || 160) + 'px';
      this._img.src = BASE + `art/${this.who}-${p}.webp`;
      this._img.alt = `${c.name}, ${c.poses[p]}`;
      if (pop) { this._img.classList.remove('pop'); void this._img.offsetWidth; this._img.classList.add('pop'); }
    }
  }
  class ABJuni extends ABCharacter { static get who() { return 'juni'; } }
  class ABBixi extends ABCharacter { static get who() { return 'bixi'; } }
  customElements.define('ab-juni', ABJuni);
  customElements.define('ab-bixi', ABBixi);
  window.ABKit = Object.assign(window.ABKit || {}, { cast: CAST });
})();
