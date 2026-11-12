// Touchable, animatable soroban (DOM-based). Rod 0 is the rightmost rod (units).
// new Soroban(container, {rods:5, interactive:true, onChange:(value)=>{}})
(function (root) {
  'use strict';
  class Soroban {
    constructor(el, opts = {}) {
      this.el = el; this.rods = opts.rods || 5; this.interactive = opts.interactive !== false;
      this.onChange = opts.onChange || null; this.vals = new Array(this.rods).fill(0);
      this.el.classList.add('soroban'); this.render();
    }
    get value() { return this.vals.reduce((s, v, i) => s + v * Math.pow(10, i), 0); }
    set value(n) { n = Math.max(0, Math.floor(n)); for (let i = 0; i < this.rods; i++) { this.vals[i] = n % 10; n = Math.floor(n / 10); } this.update(); }
    setRod(i, v) { this.vals[i] = Math.max(0, Math.min(9, v)); this.update(); }
    reset() { this.vals.fill(0); this.update(); }
    render() {
      this.el.innerHTML = '';
      const frame = document.createElement('div'); frame.className = 'sb-frame';
      const bar = document.createElement('div'); bar.className = 'sb-bar';
      this.rodEls = [];
      for (let r = this.rods - 1; r >= 0; r--) {
        const rod = document.createElement('div'); rod.className = 'sb-rod'; rod.dataset.rod = r;
        const line = document.createElement('div'); line.className = 'sb-line'; rod.appendChild(line);
        const h = document.createElement('div'); h.className = 'sb-bead sb-heaven'; h.dataset.kind = 'h'; rod.appendChild(h);
        for (let k = 0; k < 4; k++) { const b = document.createElement('div'); b.className = 'sb-bead sb-earth'; b.dataset.kind = 'e'; b.dataset.k = k; rod.appendChild(b); }
        const lbl = document.createElement('div'); lbl.className = 'sb-label'; lbl.textContent = '0'; rod.appendChild(lbl);
        if (r === 0) rod.classList.add('sb-unit');
        frame.appendChild(rod); this.rodEls[r] = rod;
      }
      frame.appendChild(bar); this.el.appendChild(frame);
      if (this.interactive) {
        frame.addEventListener('pointerdown', e => {
          const bead = e.target.closest('.sb-bead'); if (!bead) return; e.preventDefault();
          const r = +bead.parentElement.dataset.rod; const v = this.vals[r]; const hv = v >= 5 ? 5 : 0, ev = v % 5;
          let nv;
          if (bead.dataset.kind === 'h') nv = (hv ? 0 : 5) + ev;
          else { const k = +bead.dataset.k; const ne = (k < ev) ? k : k + 1; nv = hv + ne; }
          this.vals[r] = nv; this.update(); if (this.onChange) this.onChange(this.value, r);
        });
      }
      this.update();
    }
    update() {
      for (let r = 0; r < this.rods; r++) {
        const rod = this.rodEls[r], v = this.vals[r], hv = v >= 5, ev = v % 5;
        rod.querySelector('.sb-heaven').classList.toggle('on', hv);
        rod.querySelectorAll('.sb-earth').forEach(b => b.classList.toggle('on', +b.dataset.k < ev));
        rod.querySelector('.sb-label').textContent = v;
      }
      this.el.classList.toggle('sb-show-labels', !!this.showLabels);
    }
    highlight(r, on = true) { if (this.rodEls[r]) this.rodEls[r].classList.toggle('hl', on); }
    clearHighlights() { this.rodEls.forEach(e => e.classList.remove('hl')); }
    // Animate a bead move on rod r by delta (+/-), with flash; resolves after the transition.
    async move(r, delta, ms = 500) {
      this.highlight(r, true);
      await new Promise(res => setTimeout(res, 120));
      this.setRod(r, this.vals[r] + delta);
      await new Promise(res => setTimeout(res, ms));
      this.highlight(r, false);
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = Soroban; else root.Soroban = Soroban;
})(typeof globalThis !== 'undefined' ? globalThis : this);
