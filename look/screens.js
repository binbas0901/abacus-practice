/* Abacus app design kit: whole screens, built only from kit pieces.
   Needs tokens.css, characters.js, abacus.js and ui.js loaded first. Plug in with: <script src="look/screens.js"></script>

   <ab-home-screen name="June" stars="24" lesson-title="Big friends of 10" lesson-text="…" done="3" total="6"
                   greeting="Hi June! …" bixi-line="Psst… …"></ab-home-screen>
     Fills its box (give it a size, or it fills the window). Sends 'ab-action' with detail.action =
     start | practice | listen | play | profile | grownups

   <ab-lesson-screen lesson-title="Big friends of 10" done="3" total="6" rods="3" value="7" sum="7 + 3"
                     primary-label="My turn!" secondary-label="Show me again"></ab-lesson-screen>
     Code (the engine drives the screen; the screen never decides anything):
       el.abacus            the <ab-abacus> (setValue, setRod, highlight, interactive…)
       el.juni / el.bixi    the characters (el.juni.pose = 'clap')
       el.say(text)         Juni's line            el.bubble.mark(i) lights word i as the voice plays
       el.bixiSay(text)     Bixi's line ('' hides it)
       el.setSum('7 + 3')   el.setStep(done, total)
     Sends 'ab-action': close | hear | primary | secondary

   <ab-tile icon="abacus" tone="purple|orange">Practice</ab-tile>   big square choice button (used on home) */
(function () {
  if (window.customElements.get('ab-home-screen')) return;
  const v = (n, fb) => `var(--ab-${n}, ${fb})`;
  const FONT = v('font', 'system-ui, sans-serif');
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const act = (el, action) => el.dispatchEvent(new CustomEvent('ab-action', { detail: { action }, bubbles: true, composed: true }));

  /* ---------- ab-tile ---------- */
  customElements.define('ab-tile', class extends HTMLElement {
    static get observedAttributes() { return ['icon', 'tone']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const orange = this.getAttribute('tone') === 'orange';
      (this.shadowRoot || this.attachShadow({ mode: 'open' })).innerHTML = `<style>
        :host{display:block}
        button{all:unset;box-sizing:border-box;width:100%;min-height:136px;border-radius:28px;background:#fff;cursor:pointer;
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px 8px;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};font:800 21px ${FONT};color:${v('ink', '#2E2348')};
          transition:transform .1s;-webkit-tap-highlight-color:transparent}
        button:active{transform:scale(.96)}
        button:focus-visible{outline:4px solid ${v('purple', '#5B3596')};outline-offset:4px}
        .c{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          background:${orange ? v('orange-soft', '#FFF1DE') : v('purple-soft', '#EEE6FA')};color:${orange ? v('orange-deep', '#C66A0C') : v('purple', '#5B3596')}}
        </style><button part="button"><span class="c"><ab-icon name="${esc(this.getAttribute('icon'))}" size="34"></ab-icon></span><slot></slot></button>`;
    }
  });

  const SKY = `
    .sky{position:absolute;inset:0 0 auto 0;height:52%;background:${v('purple-soft', '#EEE6FA')};border-radius:0 0 50% 50%/0 0 90px 90px;pointer-events:none}
    .star{position:absolute;width:7px;height:7px;border-radius:50%;background:#fff;opacity:.9}`;
  const STARS = '<i class="star" style="left:10%;top:13%"></i><i class="star" style="left:44%;top:11%"></i><i class="star" style="left:88%;top:36%"></i><i class="star" style="left:5%;top:44%"></i><i class="star" style="left:63%;top:6%"></i>';

  /* ---------- ab-home-screen ---------- */
  customElements.define('ab-home-screen', class extends HTMLElement {
    static get observedAttributes() { return ['name', 'stars', 'lesson-label', 'lesson-title', 'lesson-text', 'done', 'total', 'greeting', 'bixi-line']; }
    connectedCallback() { this._r(); } attributeChangedCallback() { if (this.isConnected) this._r(); }
    _r() {
      const a = k => this.getAttribute(k), name = a('name') || 'friend';
      // Progress moons: a level can have many sets (10-14+); cap the row at 10 and scale so it never crowds the card.
      let mt = Math.max(1, parseInt(a('total')) || 6), md = Math.max(0, Math.min(mt, parseInt(a('done')) || 0));
      if (mt > 10) { md = Math.round(md / mt * 10); mt = 10; }
      const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;min-height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:max(20px,env(safe-area-inset-top)) 32px 20px;box-sizing:border-box}
        header{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .right{display:flex;gap:12px;align-items:center}
        .prof{all:unset;cursor:pointer;display:flex;align-items:center;gap:12px;min-height:56px;padding:0 22px 0 8px;border-radius:999px;background:#fff;box-shadow:0 2px 0 rgba(46,35,72,.08);font:800 20px ${FONT}}
        .ava{width:40px;height:40px;border-radius:50%;background:#F9C784;color:#7A4300;display:flex;align-items:center;justify-content:center;font-weight:900}
        main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:28px;align-items:center;padding:4px 0 132px}
        .teacher{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;min-height:0}
        .teacher ab-bubble{align-self:flex-end;max-width:340px}
        .col{display:flex;flex-direction:column;gap:20px}
        .lab{font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:${v('purple', '#5B3596')}}
        h1{margin:4px 0;font-size:clamp(28px,3.6cqw,42px);line-height:1.05;font-weight:900}
        .txt{margin:0 0 14px;font-size:18px;line-height:1.38;font-weight:600;color:${v('ink-soft', '#5E5478')}}
        .row{display:flex;align-items:center;gap:12px;margin-bottom:18px;font-size:15px;font-weight:700;color:${v('ink-soft', '#5E5478')}}
        .moonlab{white-space:nowrap}
        .tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
        .tiles ab-tile::part(button){min-height:112px}
        .bixi{position:absolute;right:22px;bottom:8px;display:flex;align-items:flex-end;gap:6px;pointer-events:none;z-index:3}
        .bixi ab-bubble{max-width:230px;margin-bottom:14px}
        ab-button.go{width:100%}
        @container (max-height: 760px) {
          main{gap:20px;padding-bottom:120px}
          h1{font-size:clamp(24px,3cqw,34px);margin:2px 0}
          .txt{font-size:16px;margin:0 0 10px}
          .row{margin-bottom:12px}
          .tiles ab-tile::part(button){min-height:94px;border-radius:22px}
        }
        @container (max-aspect-ratio: 1/1) {
          main{grid-template-columns:1fr;align-content:center;gap:16px}
          .teacher{flex-direction:row;align-items:flex-end;justify-content:center}
          .teacher ab-juni{order:-1}
          .teacher ab-bubble{align-self:center}
          .bixi{bottom:10px}
        }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <header>
            <button class="prof" data-a="profile"><span class="ava">${esc(name[0] || '?').toUpperCase()}</span>${esc(name)}</button>
            <div class="right"><ab-chip icon="star">${esc(a('stars') || '0')}</ab-chip><ab-icon-button icon="lock" label="Grown-ups" data-a="grownups"></ab-icon-button></div>
          </header>
          <main>
            <div class="teacher">
              <ab-bubble tail="bottom-left" size="22">${esc(a('greeting') || `Hi ${name}! Ready to learn something new?`)}</ab-bubble>
              <ab-juni pose="wave" size="260" idle></ab-juni>
            </div>
            <div class="col">
              <ab-card pad="md">
                <div class="lab">${esc(a('lesson-label') || "Today's practice")}</div>
                <h1>${esc(a('lesson-title') || 'Your next skill')}</h1>
                ${a('lesson-text') ? `<p class="txt">${esc(a('lesson-text'))}</p>` : ''}
                <div class="row"><ab-moons total="${mt}" done="${md}" size="18"></ab-moons><span class="moonlab">Juni's moon is filling up</span></div>
                <ab-button class="go" size="lg" icon="play" data-a="start">Start</ab-button>
              </ab-card>
              <div class="tiles">
                <ab-tile icon="book" data-a="learn">Learn</ab-tile>
                <ab-tile icon="star" tone="orange" data-a="play">Play</ab-tile>
                <ab-tile icon="heart" data-a="room">My Room</ab-tile>
              </div>
            </div>
          </main>
        </div>
        ${a('bixi-line') === '' ? '' : `<div class="bixi"><ab-bubble tone="bixi" tail="bottom-right" size="16">${esc(a('bixi-line') || 'Psst… help me today?')}</ab-bubble><ab-bixi pose="wave" size="112"></ab-bixi></div>`}`;
      root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(this, b.dataset.a)));
      this._fit();
    }
    _fit() {
      // size Juni to the space she has
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); const portrait = r.height > r.width;
        j.setAttribute('size', Math.round(Math.max(150, Math.min(portrait ? r.width * 0.3 : r.width * 0.3, r.height * (portrait ? 0.24 : 0.5))))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
  });

  /* ---------- ab-lesson-screen ---------- */
  customElements.define('ab-lesson-screen', class extends HTMLElement {
    static get observedAttributes() { return ['lesson-title', 'done', 'total', 'primary-label', 'secondary-label']; }
    connectedCallback() { if (!this._built) this._build(); }
    attributeChangedCallback(n) {
      if (!this._built) return;
      const a = k => this.getAttribute(k), q = s => this.shadowRoot.querySelector(s);
      if (n === 'lesson-title') q('.ttl').textContent = a('lesson-title') || '';
      if (n === 'done' || n === 'total') this.setStep(a('done'), a('total'));
      if (n === 'primary-label' || n === 'secondary-label') this._buttons();
    }
    _build() {
      this._built = true;
      const a = k => this.getAttribute(k);
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};color:${v('ink', '#2E2348')};font-family:${FONT}}
        ${SKY}
        .sky{height:34%;border-radius:0 0 50% 50%/0 0 70px 70px}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:14px;padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        header{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .mid{display:flex;align-items:center;gap:16px;min-height:56px;padding:0 24px;border-radius:999px;background:#fff;box-shadow:0 2px 0 rgba(46,35,72,.08)}
        .ttl{font-size:20px;font-weight:900}
        .talk{display:flex;align-items:center;gap:14px}
        .talk ab-bubble{flex:1;min-width:0}
        .sum{flex:none;min-width:150px;height:92px;padding:0 22px;box-sizing:border-box;border-radius:26px;background:${v('purple', '#5B3596')};color:#fff;
          display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;white-space:nowrap}
        .sum:empty{display:none}
        .stage{flex:1;min-height:0;position:relative;display:flex;align-items:center;justify-content:center}
        .bx{position:absolute;right:0;bottom:0;display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:210px}
        .bx[hidden]{display:none}
        .act{display:flex;justify-content:center;gap:18px;flex-wrap:wrap}
        .act ab-button[hidden]{display:none}
        @media (max-aspect-ratio: 1/1){ .sum{height:72px;font-size:34px;min-width:120px} .bx{width:170px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <header>
            <ab-icon-button icon="close" label="Close lesson" data-a="close"></ab-icon-button>
            <div class="mid"><span class="ttl">${esc(a('lesson-title') || '')}</span><ab-moons size="18" total="${esc(a('total') || 6)}" done="${esc(a('done') || 0)}"></ab-moons></div>
            <ab-icon-button icon="speaker" label="Hear Juni again" data-a="hear"></ab-icon-button>
          </header>
          <div class="talk">
            <ab-juni pose="point" size="130"></ab-juni>
            <ab-bubble tail="left"></ab-bubble>
            <div class="sum">${esc(a('sum') || '')}</div>
          </div>
          <div class="stage">
            <ab-abacus rods="${esc(a('rods') || 3)}" value="${esc(a('value') || 0)}" labels></ab-abacus>
            <div class="bx" hidden><ab-bubble tone="bixi" tail="bottom-right" size="17"></ab-bubble><ab-bixi pose="confused" size="130"></ab-bixi></div>
          </div>
          <div class="act">
            <ab-button variant="soft" icon="replay" data-a="secondary"></ab-button>
            <ab-button icon-end="arrow" data-a="primary"></ab-button>
          </div>
        </div>`;
      root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(this, b.dataset.a)));
      this._buttons();
      // keep the abacus as big as the stage allows, leaving room for Bixi on the right
      const stage = root.querySelector('.stage'), ab = this.abacus;
      const fit = () => {
        const r = stage.getBoundingClientRect(), rods = +(ab.getAttribute('rods') || 3);
        const W = (rods - 1) * 125 + 236, H = 394, bxW = this.shadowRoot.querySelector('.bx').offsetWidth || 210;
        const room = r.width - 2 * (bxW + 8);   // Bixi's corner is always kept free, so the abacus never jumps when he talks
        ab.setAttribute('size', Math.max(240, Math.floor(Math.min(room, r.height * W / H, 820))));
      };
      new ResizeObserver(fit).observe(stage); this._fit = fit;
    }
    _buttons() {
      const q = s => this.shadowRoot.querySelector(s), p = this.getAttribute('primary-label'), s = this.getAttribute('secondary-label');
      const P = q('[data-a="primary"]'), S = q('[data-a="secondary"]');
      P.textContent = p ?? 'My turn!'; P.hidden = p === '';
      S.textContent = s ?? 'Show me again'; S.hidden = s === '';
    }
    get abacus() { return this.shadowRoot.querySelector('ab-abacus'); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
    get bubble() { return this.shadowRoot.querySelector('.talk ab-bubble'); }
    get bixiBubble() { return this.shadowRoot.querySelector('.bx ab-bubble'); }
    get bixiShown() { return !this.shadowRoot.querySelector('.bx').hidden; }
    say(text) { this.bubble.say(text); this.bubble.mark(-1); }
    bixiSay(text) { const bx = this.shadowRoot.querySelector('.bx'); bx.hidden = !text; if (text) this.bixiBubble.say(text); this._fit && this._fit(); }
    setSum(t) { this.shadowRoot.querySelector('.sum').textContent = t || ''; }
    setStep(done, total) { const m = this.shadowRoot.querySelector('ab-moons'); if (total != null) m.setAttribute('total', total); m.setAttribute('done', done); }
  });

  /* ---------- ab-welcome-screen ----------
     The very first screen on a fresh download: Juni says hello and asks the child's name.
     Built once (it holds a live text input), then driven by the engine:
       el.juni / el.bubble   the character and her speech bubble
       el.say(text)          set Juni's words (the engine plays the matching voice clip)
       el.value              the typed name (trimmed); el.value = '' to clear
       el.focusInput()       put the cursor in the field; el.shake() nudges on an empty submit
     Sends 'ab-action' with detail.action = submit (button tap or Enter). */
  customElements.define('ab-welcome-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;
          padding:max(24px,env(safe-area-inset-top)) 28px max(24px,env(safe-area-inset-bottom));box-sizing:border-box}
        .teacher{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:100%}
        .teacher ab-bubble{max-width:min(88cqw,520px)}
        .card{width:min(90cqw,440px)}
        .prompt{margin:0 0 14px;font-size:16px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;
          color:${v('purple', '#5B3596')};text-align:center}
        .field{display:flex;flex-direction:column;gap:16px}
        input{all:unset;box-sizing:border-box;width:100%;height:64px;padding:0 22px;border-radius:20px;
          background:${v('cream', '#FFF7EC')};border:3px solid ${v('purple-line', '#DCD3EC')};
          font:800 20px ${FONT};color:${v('ink', '#2E2348')};text-align:center;-webkit-tap-highlight-color:transparent}
        input::placeholder{color:${v('ink-faint', '#9A90B0')};font-weight:700}
        input:focus{border-color:${v('purple', '#5B3596')};background:#fff}
        ab-button.go{width:100%}
        @keyframes ab-wk-shake{10%,90%{transform:translateX(-5px)}30%,70%{transform:translateX(6px)}50%{transform:translateX(-6px)}}
        .shake{animation:ab-wk-shake .3s}
        @container (max-height: 620px){ .wrap{gap:16px} .prompt{margin-bottom:10px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="teacher">
            <ab-bubble tail="bottom-left" size="24">Hi! I'm Juni.</ab-bubble>
            <ab-juni pose="wave" size="200" idle></ab-juni>
          </div>
          <ab-card pad="lg" class="card">
            <div class="field">
              <input type="text" maxlength="20" autocomplete="off" autocorrect="off" autocapitalize="words"
                spellcheck="false" enterkeyhint="done" placeholder="Type your name" aria-label="Your name">
              <ab-button class="go" size="lg" icon-end="arrow" data-a="submit">Let's go</ab-button>
            </div>
          </ab-card>
        </div>`;
      root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(this, b.dataset.a)));
      const inp = root.querySelector('input');
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act(this, 'submit'); } });
      this._fit();
    }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; const portrait = r.height >= r.width;
        j.setAttribute('size', Math.round(Math.max(140, Math.min(portrait ? r.width * 0.42 : r.width * 0.24, r.height * 0.3)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bubble() { return this.shadowRoot.querySelector('ab-bubble'); }
    get value() { return (this.shadowRoot.querySelector('input').value || '').trim().replace(/\s+/g, ' ').slice(0, 20); }
    set value(x) { this.shadowRoot.querySelector('input').value = x || ''; }
    say(text) { this.bubble.say(text); }
    focusInput() { const i = this.shadowRoot.querySelector('input'); setTimeout(() => { try { i.focus(); } catch (e) {} }, 60); }
    shake() { const c = this.shadowRoot.querySelector('.card'); if (!c) return; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  });

  /* ---------- ab-greeting-screen ----------
     The true first screen on a fresh download: a warm hello from Juni (with Bixi waving beside her), no input and
     no lock — just one "Let's go". The grown-up gate comes after this. Built once; driven by the engine:
       el.juni / el.bixi / el.bubble   the characters and Juni's bubble
       el.say(text)                    set Juni's words (engine plays the matching voice clip)
     Sends 'ab-action' with detail.action = start ("Let's go") | hear (child taps Juni to hear her again). */
  customElements.define('ab-greeting-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:30px;
          padding:max(24px,env(safe-area-inset-top)) 28px max(28px,env(safe-area-inset-bottom));box-sizing:border-box}
        .cast{display:flex;align-items:flex-end;justify-content:center;gap:18px;max-width:100%}
        .juni{cursor:pointer;-webkit-tap-highlight-color:transparent}
        ab-bubble{max-width:min(88cqw,560px)}
        ab-button.go{min-width:min(80cqw,360px)}
        @container (max-height: 620px){ .wrap{gap:18px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <ab-bubble tail="bottom-left" size="26">Hi! I'm Juni. Welcome to abacus class!</ab-bubble>
          <div class="cast">
            <ab-juni class="juni" pose="wave" size="220" idle></ab-juni>
            <ab-bixi pose="wave" size="150" idle></ab-bixi>
          </div>
          <ab-button class="go" size="lg" icon-end="arrow" data-a="start">Let's go</ab-button>
        </div>`;
      root.querySelector('[data-a="start"]').addEventListener('click', () => act(this, 'start'));
      root.querySelector('.juni').addEventListener('click', () => act(this, 'hear'));
      this._fit();
    }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni'), b = this.shadowRoot.querySelector('ab-bixi');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; const portrait = r.height >= r.width;
        const js = Math.round(Math.max(150, Math.min(portrait ? r.width * 0.38 : r.width * 0.22, r.height * 0.32)));
        j.setAttribute('size', js); b.setAttribute('size', Math.round(js * 0.68)); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
    get bubble() { return this.shadowRoot.querySelector('ab-bubble'); }
    say(text) { this.bubble.say(text); }
  });

  /* ---------- ab-meet-screen ----------
     A short dialogue cutscene (after the name): Juni greets the child, introduces Bixi, he says hi and asks for help.
     Both characters are on screen; only the current speaker's bubble shows. No input — the engine runs the beats
     and then advances. Driven by the engine:
       el.juni / el.bixi    the characters (el.bixi.pose = 'cheer')
       el.say(text)         Juni speaks (her bubble on, Bixi's off)
       el.bixiSay(text)     Bixi speaks (his bubble on, Juni's off) */
  customElements.define('ab-meet-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;align-items:center;justify-content:center;
          padding:max(24px,env(safe-area-inset-top)) 28px max(28px,env(safe-area-inset-bottom));box-sizing:border-box}
        .cast{display:flex;align-items:flex-end;justify-content:center;gap:40px;max-width:100%}
        .who{position:relative;display:flex;flex-direction:column;align-items:center}
        .who ab-bubble{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);margin-bottom:14px;
          width:max-content;max-width:min(72cqw,320px);opacity:0;transition:opacity .18s;pointer-events:none}
        .who ab-bubble.on{opacity:1}
        @container (max-aspect-ratio: 1/1){ .cast{gap:22px} .who ab-bubble{max-width:min(80cqw,280px)} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap"><div class="cast">
          <div class="who"><ab-bubble class="jb" tail="bottom-left" size="23"></ab-bubble><ab-juni pose="wave" size="220" idle></ab-juni></div>
          <div class="who"><ab-bubble class="bb" tone="bixi" tail="bottom-right" size="21"></ab-bubble><ab-bixi pose="wave" size="150" idle></ab-bixi></div>
        </div></div>`;
      this._fit();
    }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni'), b = this.shadowRoot.querySelector('ab-bixi');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; const portrait = r.height >= r.width;
        const js = Math.round(Math.max(150, Math.min(portrait ? r.width * 0.36 : r.width * 0.22, r.height * 0.34)));
        j.setAttribute('size', js); b.setAttribute('size', Math.round(js * 0.68)); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
    get _jb() { return this.shadowRoot.querySelector('.jb'); }
    get _bb() { return this.shadowRoot.querySelector('.bb'); }
    say(text) { this._jb.say(text); this._jb.classList.add('on'); this._bb.classList.remove('on'); }
    bixiSay(text) { this._bb.say(text); this._bb.classList.add('on'); this._jb.classList.remove('on'); }
  });

  /* ---------- ab-activity-screen ----------
     A kit frame around a live interactive tool (e.g. the quick-win soroban). The tool is LIGHT-DOM content
     slotted in, so it keeps its own stylesheet; the component supplies the sky, Juni + bubble, and Bixi.
       el.say(text)      Juni speaks (top bubble)
       el.bixiSay(text)  Bixi speaks (corner bubble; '' hides it)
       el.juni / el.bixi the characters   —   put the tool host inside as a child (default slot). */
  customElements.define('ab-activity-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .sky{height:34%;border-radius:0 0 50% 50%/0 0 70px 70px}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:10px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .talk{display:flex;align-items:center;gap:14px;min-height:0}
        .talk ab-bubble{flex:1;min-width:0}
        .stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
        ::slotted(*){max-width:100%}
        .bx{position:absolute;right:18px;bottom:12px;display:flex;flex-direction:column;align-items:flex-end;gap:8px;width:210px;z-index:3;pointer-events:none}
        .bx ab-bubble{max-width:200px}
        .bx[hidden]{display:none}
        @container (max-aspect-ratio: 1/1){ .bx{width:150px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="talk">
            <ab-juni pose="point" size="120" idle></ab-juni>
            <ab-bubble tail="left" size="20"></ab-bubble>
          </div>
          <div class="stage"><slot></slot></div>
        </div>
        <div class="bx" hidden><ab-bubble tone="bixi" tail="bottom-right" size="18"></ab-bubble><ab-bixi pose="cheer" size="120"></ab-bixi></div>`;
      this._fit();
    }
    _fit() {
      const j = this.shadowRoot.querySelector('.talk ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return;
        j.setAttribute('size', Math.round(Math.max(96, Math.min(r.width * 0.12, r.height * 0.18)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    get juni() { return this.shadowRoot.querySelector('.talk ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('.bx ab-bixi'); }
    get bubble() { return this.shadowRoot.querySelector('.talk ab-bubble'); }
    say(text) { this.bubble.say(text); }
    bixiSay(text) { const bx = this.shadowRoot.querySelector('.bx'); bx.hidden = !text; if (text) this.shadowRoot.querySelector('.bx ab-bubble').say(text); }
  });

  /* ---------- ab-choose-screen ----------
     A question with a few choices (abacus? / starting point / pick a skill). The engine configures it and reacts:
       el.say(text)                     Juni speaks
       el.configure({heading, layout, options})   layout: 'cards' (2-3 big) | 'list' (scrolling); options: [{id,label,sub}]
       el.back = true/false             show a back arrow (emits ab-choose id="__back")
     Sends 'ab-choose' with detail.id = the chosen option's id. */
  customElements.define('ab-choose-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;gap:18px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(24px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px;align-self:stretch}
        .top .back{visibility:hidden}
        :host([data-back]) .top .back{visibility:visible}
        .talk{display:flex;align-items:center;gap:14px;flex:1;min-width:0}
        .talk ab-bubble{flex:1;min-width:0}
        .mid{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;width:100%}
        .heading{margin:0;font-size:clamp(22px,3cqw,30px);font-weight:900;text-align:center}
        .heading:empty{display:none}
        .opts{display:flex;justify-content:center;gap:16px;width:100%;min-height:0}
        .opts.cards{flex-wrap:wrap;align-items:stretch}
        .opts.list{flex-direction:column;align-items:stretch;max-width:600px;overflow:auto;padding:4px}
        .opt{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border-radius:26px;padding:22px 20px;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};display:flex;flex-direction:column;gap:6px;
          transition:transform .08s;-webkit-tap-highlight-color:transparent;border:3px solid transparent}
        .opt:active{transform:scale(.97)}
        .opt:focus-visible{outline:none;border-color:${v('purple', '#5B3596')}}
        .opt .ol{font-size:21px;font-weight:900}
        .opt .os{font-size:15px;font-weight:600;color:${v('ink-soft', '#5E5478')}}
        .opts.cards .opt{flex:1 1 0;min-width:150px;max-width:260px;align-items:center;text-align:center}
        .opts.list .opt{flex-direction:row;align-items:center;gap:14px;text-align:left}
        .opts.list .opt .n{flex:none;width:44px;height:44px;border-radius:50%;background:${v('purple-soft', '#EEE6FA')};
          color:${v('purple', '#5B3596')};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:19px}
        .opts.list .opt .ol{font-size:19px}
        @container (max-aspect-ratio: 1/1){ .opts.cards{flex-direction:column;align-items:center} .opts.cards .opt{width:100%;max-width:440px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button class="back" icon="back" label="Back" data-back-btn></ab-icon-button>
            <div class="talk"><ab-juni pose="point" size="110" idle></ab-juni><ab-bubble tail="left" size="20"></ab-bubble></div>
          </div>
          <div class="mid"><h2 class="heading"></h2><div class="opts cards"></div></div>
        </div>`;
      root.querySelector('[data-back-btn]').addEventListener('click', () => this._emit('__back'));
      this._fit();
    }
    _emit(id) { this.dispatchEvent(new CustomEvent('ab-choose', { detail: { id }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('.talk ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return;
        j.setAttribute('size', Math.round(Math.max(90, Math.min(r.width * 0.11, r.height * 0.16)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    set back(on) { if (on) this.setAttribute('data-back', ''); else this.removeAttribute('data-back'); }
    configure({ heading = '', layout = 'cards', options = [] }) {
      this.shadowRoot.querySelector('.heading').textContent = heading;
      const box = this.shadowRoot.querySelector('.opts'); box.className = 'opts ' + layout;
      box.innerHTML = options.map((o, i) => `<button class="opt" data-id="${esc(o.id)}">`
        + (layout === 'list' ? `<span class="n">${i + 1}</span>` : '')
        + `<span class="ol">${esc(o.label)}</span>${o.sub ? `<span class="os">${esc(o.sub)}</span>` : ''}</button>`).join('');
      box.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => this._emit(b.dataset.id)));
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
  });

  /* ---------- ab-who-screen ----------
     "Who's practising today?" — the child switcher behind the profile chip. Kid-facing (switch only; add/remove live
     behind the grown-up gate). The engine configures it and reacts:
       el.configure({children:[{id,name,color,initial,active}]})   el.say(text)   el.juni / el.bixi
     Sends 'ab-action' with detail.action = pick (detail.id) | back. */
  customElements.define('ab-who-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:14px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(24px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .talk{display:flex;align-items:center;gap:14px;min-width:0}
        .talk ab-bubble{max-width:min(70cqw,520px)}
        .mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:auto}
        .cards{display:flex;flex-wrap:wrap;gap:20px;justify-content:center;align-content:center;max-width:720px}
        .card{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border-radius:26px;padding:22px 18px 18px;width:150px;
          display:flex;flex-direction:column;align-items:center;gap:12px;box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};
          border:3px solid transparent;transition:transform .08s;-webkit-tap-highlight-color:transparent;position:relative}
        .card:active{transform:scale(.97)}
        .card:focus-visible{outline:none;border-color:${v('purple', '#5B3596')}}
        .card.active{border-color:${v('purple', '#5B3596')}}
        .av{width:84px;height:84px;border-radius:50%;display:flex;align-items:center;justify-content:center;
          font-size:38px;font-weight:900;color:#fff;box-shadow:inset 0 -6px 0 rgba(0,0,0,.12)}
        .nm{font-size:19px;font-weight:900;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .now{position:absolute;top:10px;right:10px;background:${v('purple', '#5B3596')};color:#fff;font-size:12px;font-weight:800;
          padding:3px 9px;border-radius:999px}
        .card:not(.active) .now{display:none}
        .bx{position:absolute;right:20px;bottom:12px;z-index:3;pointer-events:none}
        @container (max-aspect-ratio: 1/1){ .bx{display:none} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back" data-a="back"></ab-icon-button>
            <div class="talk"><ab-juni pose="point" size="110" idle></ab-juni><ab-bubble tail="left" size="20"></ab-bubble></div>
          </div>
          <div class="mid"><div class="cards"></div></div>
          <div class="bx"><ab-bixi pose="wave" size="112"></ab-bixi></div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      this._fit();
    }
    _emit(action, id) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action, id }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; j.setAttribute('size', Math.round(Math.max(90, Math.min(r.width * 0.11, r.height * 0.16)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ children = [] }) {
      const box = this.shadowRoot.querySelector('.cards');
      box.innerHTML = children.map(c => `<button class="card${c.active ? ' active' : ''}" data-id="${esc(c.id)}">`
        + `<span class="av" style="background:${esc(c.color || '#5B3596')}">${esc(c.initial || '?')}</span>`
        + `<span class="nm">${esc(c.name || 'New child')}</span><span class="now">Now</span></button>`).join('');
      box.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => this._emit('pick', b.dataset.id)));
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
  });

  /* ---------- ab-done-screen ----------
     The last setup screen: celebration + where they'll start + (in a browser tab) add-to-Home-Screen advice + "Let's go".
       el.configure({headline, subtitle, showInstall})   el.say(text)   el.juni / el.bixi
     Sends 'ab-action' with detail.action = start. */
  customElements.define('ab-done-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;
          padding:max(24px,env(safe-area-inset-top)) 28px max(28px,env(safe-area-inset-bottom));box-sizing:border-box}
        .cast{display:flex;align-items:flex-end;justify-content:center;gap:16px}
        h1{margin:0;font-size:clamp(26px,4cqw,40px);font-weight:900;text-align:center}
        .sub{margin:0;font-size:18px;font-weight:600;line-height:1.4;color:${v('ink-soft', '#5E5478')};text-align:center;max-width:560px}
        .install{font-size:14px;font-weight:600;line-height:1.45;color:${v('ink-soft', '#5E5478')};background:#fff;border-radius:18px;
          padding:14px 18px;max-width:520px;text-align:center;box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')}}
        .install[hidden]{display:none}
        .install b{color:${v('ink', '#2E2348')}}
        ab-button.go{min-width:min(80cqw,340px)}
        @container (max-height: 620px){ .wrap{gap:12px} .cast ab-juni{}}
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="cast"><ab-juni pose="clap" size="190" idle></ab-juni><ab-bixi pose="cheer" size="130" idle></ab-bixi></div>
          <h1></h1>
          <p class="sub"></p>
          <div class="install" hidden><b>Grown-up:</b> add this to the Home Screen so progress is kept safe — tap the Share button, then <b>Add to Home Screen</b>, and open it from the new icon.</div>
          <ab-button class="go" size="lg" icon-end="arrow" data-a="start">Let's go!</ab-button>
        </div>`;
      root.querySelector('[data-a="start"]').addEventListener('click', () => this.dispatchEvent(new CustomEvent('ab-action', { detail: { action: 'start' }, bubbles: true, composed: true })));
      this._fit();
    }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni'), b = this.shadowRoot.querySelector('ab-bixi');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return;
        const js = Math.round(Math.max(130, Math.min(r.width * 0.2, r.height * 0.26))); j.setAttribute('size', js); b.setAttribute('size', Math.round(js * 0.7)); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ headline = '', subtitle = '', showInstall = false }) {
      this.shadowRoot.querySelector('h1').textContent = headline;
      this.shadowRoot.querySelector('.sub').textContent = subtitle;
      this.shadowRoot.querySelector('.install').hidden = !showInstall;
    }
    say() {}
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
  });

  /* ---------- ab-check-screen ----------
     The level check: the engine walks the skills, showing a problem at a time; the child answers on the slotted
     pad or soroban. The component is only chrome — the engine owns the loop and the level decision.
       el.setSkill(name) / el.setProgress(done,total) / el.setProblem(html) / el.setAnswer(text)
       el.feedback('ok'|'no'|'') / el.hint(text)
       el.ansEl / el.goBtn   the answer readout + Check button (passed to the pad builders)
     Sends 'ab-action' with detail.action = stop ("Stop here"). The pad/soroban is a light-DOM child (default slot). */
  customElements.define('ab-check-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .sky{height:30%;border-radius:0 0 50% 50%/0 0 60px 60px}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:12px;
          padding:max(18px,env(safe-area-inset-top)) 24px max(18px,env(safe-area-inset-bottom));box-sizing:border-box}
        header{display:flex;align-items:center;gap:14px}
        .skill{font-size:20px;font-weight:900;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        ab-button.stop{flex:none}
        .card{background:#fff;border-radius:26px;box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};
          padding:18px 22px;display:flex;flex-direction:column;align-items:center;gap:8px}
        .prob{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;justify-content:center;font-weight:900;font-size:clamp(28px,5cqw,44px)}
        .prob .term{display:inline-flex;align-items:baseline;gap:6px}
        .prob .term i{font-style:normal;color:${v('purple', '#5B3596')};font-size:.7em}
        .prob .term.neg i{color:${v('orange-deep', '#C66A0C')}}
        .ansrow{display:flex;align-items:center;gap:14px;min-height:46px}
        .fb{font-size:20px;font-weight:900;min-width:28px;text-align:center}
        .fb.ok{color:#2FA36B}
        .ans{min-width:90px;height:46px;padding:0 16px;border-radius:14px;background:${v('purple-soft', '#EEE6FA')};
          color:${v('purple', '#5B3596')};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900}
        .note{text-align:center;font-size:15px;font-weight:800;color:${v('ink-soft', '#5E5478')};min-height:20px}
        .note:empty{min-height:0}
        .entry{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:18px}
        ::slotted(*){max-width:100%}
        .go{all:unset;box-sizing:border-box;flex:none;width:76px;height:76px;border-radius:50%;background:${v('orange', '#F08A1C')};color:#fff;
          display:flex;align-items:center;justify-content:center;box-shadow:0 6px 0 ${v('orange-deep', '#C66A0C')};cursor:pointer;-webkit-tap-highlight-color:transparent}
        .go:active{transform:translateY(4px);box-shadow:0 2px 0 ${v('orange-deep', '#C66A0C')}}
        .go[disabled]{opacity:.45;cursor:default}
        .go:focus-visible{outline:4px solid ${v('purple', '#5B3596')};outline-offset:4px}
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <header>
            <span class="skill"></span>
            <ab-moons class="dots" size="16"></ab-moons>
            <ab-button class="stop" variant="soft" size="sm" data-a="stop">Stop here</ab-button>
          </header>
          <div class="card">
            <div class="prob"></div>
            <div class="ansrow"><span class="fb"></span><span class="ans">&nbsp;</span></div>
          </div>
          <div class="note"></div>
          <div class="entry"><slot></slot><button class="go" aria-label="Check" disabled><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button></div>
        </div>`;
      root.querySelector('[data-a="stop"]').addEventListener('click', () => this.dispatchEvent(new CustomEvent('ab-action', { detail: { action: 'stop' }, bubbles: true, composed: true })));
    }
    setSkill(t) { this.shadowRoot.querySelector('.skill').textContent = t || ''; }
    setProgress(done, total) { const m = this.shadowRoot.querySelector('.dots'); m.setAttribute('total', total); m.setAttribute('done', done); }
    setProblem(html) { this.shadowRoot.querySelector('.prob').innerHTML = html; }
    setAnswer(t) { this.shadowRoot.querySelector('.ans').textContent = (t == null || t === '') ? ' ' : t; }
    feedback(state, html) { const f = this.shadowRoot.querySelector('.fb'); f.className = 'fb' + (state === 'ok' ? ' ok' : ''); f.innerHTML = html != null ? html : (state === 'ok' ? '✓' : state === 'no' ? 'Next one!' : ''); }
    setNote(t, ms) { const n = this.shadowRoot.querySelector('.note'); n.textContent = t || ''; clearTimeout(this._noteT); if (t && ms) this._noteT = setTimeout(() => { n.textContent = ''; }, ms); }
    get ansEl() { return this.shadowRoot.querySelector('.ans'); }
    get goBtn() { return this.shadowRoot.querySelector('.go'); }
  });

  /* ---------- ab-practice-pick ----------
     "Pick how to practise" — reading / listening / (mental). Each card shows its progress (sessions done of total,
     pips, best time). The engine configures it and reacts:
       el.configure({title, cards:[{mode,label,icon,done,total,best,full}], watch})   el.say(text)   el.juni
     Sends 'ab-action' with detail.action = back | watch | pick (detail.mode). */
  customElements.define('ab-practice-pick', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:14px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .title{font-size:clamp(20px,2.6cqw,26px);font-weight:900}
        .teacher{display:flex;align-items:center;gap:14px}
        .teacher ab-bubble{max-width:min(78cqw,520px)}
        .mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
        .cards{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;width:100%;max-width:760px}
        .card{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border-radius:28px;padding:24px 20px;
          flex:1 1 0;min-width:180px;max-width:240px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};border:3px solid transparent;transition:transform .08s;position:relative;-webkit-tap-highlight-color:transparent}
        .card:active{transform:scale(.97)}
        .card:focus-visible{outline:none;border-color:${v('purple', '#5B3596')}}
        .card.full{border-color:${v('gold', '#F5A623')}}
        .ic{width:64px;height:64px;border-radius:50%;background:${v('purple-soft', '#EEE6FA')};color:${v('purple', '#5B3596')};display:flex;align-items:center;justify-content:center}
        .card.orange .ic{background:${v('orange-soft', '#FFF1DE')};color:${v('orange-deep', '#C66A0C')}}
        .lab{font-size:21px;font-weight:900}
        .prog{font-size:14px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        .pips{display:flex;gap:5px;flex-wrap:wrap;justify-content:center;max-width:150px}
        .pip{width:9px;height:9px;border-radius:50%;background:${v('purple-line', '#DCD3EC')}}
        .pip.on{background:${v('gold', '#F5A623')}}
        .best{font-size:12px;font-weight:700;color:${v('ink-faint', '#9A90B0')}}
        .best:empty{display:none}
        .done-badge{position:absolute;top:12px;right:12px;width:26px;height:26px;border-radius:50%;background:${v('gold', '#F5A623')};color:#fff;display:flex;align-items:center;justify-content:center}
        .card:not(.full) .done-badge{display:none}
        .watch{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;align-self:center;color:${v('purple', '#5B3596')};font-weight:800;font-size:15px;padding:8px 14px;border-radius:999px}
        .watch:focus-visible{outline:3px solid ${v('purple', '#5B3596')};outline-offset:2px}
        .extra{min-height:24px;display:flex;justify-content:center}
        @container (max-aspect-ratio: 1/1){ .cards{flex-direction:column;align-items:center} .card{width:100%;max-width:420px;flex-direction:row;justify-content:flex-start;text-align:left} .card .pips{justify-content:flex-start} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back" data-a="back"></ab-icon-button>
            <span class="title"></span>
          </div>
          <div class="teacher"><ab-juni pose="point" size="96" idle></ab-juni><ab-bubble tail="left" size="19"></ab-bubble></div>
          <div class="mid"><div class="cards"></div></div>
          <div class="extra"></div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      this._fit();
    }
    _emit(action, mode) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action, mode }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; j.setAttribute('size', Math.round(Math.max(80, Math.min(r.width * 0.09, r.height * 0.14)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ title = 'Practice', cards = [], watch = false } = {}) {
      this.shadowRoot.querySelector('.title').textContent = title;
      const check = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      const box = this.shadowRoot.querySelector('.cards');
      box.innerHTML = cards.map(c => {
        const total = c.total || 7, done = Math.max(0, Math.min(total, c.done || 0));
        const pips = Array.from({ length: total }, (_, i) => `<span class="pip${i < done ? ' on' : ''}"></span>`).join('');
        return `<button class="card${c.full ? ' full' : ''}${c.mode === 'mental' ? ' orange' : ''}" data-mode="${esc(c.mode)}">`
          + `<span class="done-badge">${check}</span>`
          + `<span class="ic"><ab-icon name="${esc(c.icon || 'abacus')}" size="32"></ab-icon></span>`
          + `<span class="lab">${esc(c.label)}</span>`
          + `<span class="prog">${c.full ? 'Done!' : done + ' / ' + total}</span>`
          + `<span class="pips">${pips}</span>`
          + `<span class="best">${c.best ? esc(c.best) : ''}</span></button>`;
      }).join('');
      box.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => this._emit('pick', b.dataset.mode)));
      const ex = this.shadowRoot.querySelector('.extra');
      ex.innerHTML = watch ? `<button class="watch" data-a="watch"><ab-icon name="play" size="20"></ab-icon>Watch the lesson again</button>` : '';
      if (watch) ex.querySelector('[data-a="watch"]').addEventListener('click', () => this._emit('watch'));
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
  });

  /* ---------- ab-room-screen ----------
     "My Room" — the rewards room: Juni's moon window, a golden-bead treat jar and a flower garden
     (both SLOTTED so the engine keeps drawing them live via Treats.renderJar / Fun.renderGarden and
     their existing click listeners), plus the "Treats" button.
       el.configure({title, beads, nudge})   el.say(text)   el.juni / el.bixi
       slots: slot="garden" (live #roomGarden), slot="jar" (live #jar)
     Sends 'ab-action' with detail.action = back | treats. */
  customElements.define('ab-room-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:14px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .title{font-size:clamp(20px,2.6cqw,26px);font-weight:900;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .teacher{display:flex;align-items:center;gap:14px}
        .teacher ab-bubble{max-width:min(78cqw,520px)}
        .mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;gap:40px;flex-wrap:wrap}
        .thing{display:flex;flex-direction:column;align-items:center;gap:10px}
        .thing .cap{font-size:15px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        ::slotted(*){max-width:100%}
        .foot{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;min-height:0}
        .bx{z-index:3;pointer-events:none}
        @container (max-aspect-ratio: 1/1){ .mid{flex-direction:column;gap:22px} .bx{display:none} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back home" data-a="back"></ab-icon-button>
            <span class="title">My room</span>
            <ab-chip icon="star"><span class="beads">0</span></ab-chip>
          </div>
          <div class="teacher"><ab-juni pose="point" size="96" idle></ab-juni><ab-bubble tail="left" size="19"></ab-bubble></div>
          <div class="mid">
            <div class="thing"><slot name="garden"></slot><span class="cap">My garden</span></div>
            <div class="thing"><slot name="jar"></slot><span class="cap">Treat jar</span></div>
          </div>
          <div class="foot">
            <span class="bx"><ab-bixi pose="wave" size="112"></ab-bixi></span>
            <ab-button class="treats" variant="primary" icon="star" data-a="treats">Treats</ab-button>
          </div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      root.querySelector('[data-a="treats"]').addEventListener('click', () => this._emit('treats'));
      this._fit();
    }
    _emit(action) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; j.setAttribute('size', Math.round(Math.max(80, Math.min(r.width * 0.09, r.height * 0.14)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ title = 'My room', beads = 0, nudge = false } = {}) {
      this.shadowRoot.querySelector('.title').textContent = title;
      this.shadowRoot.querySelector('.beads').textContent = String(beads);
      this.shadowRoot.querySelector('.treats').classList.toggle('nudge', !!nudge);
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
  });

  /* ---------- ab-shop-screen ----------
     The Treat Shop (Bix's stall): golden-bead wallet, treat cards, "show a grown-up" tickets.
     One featured card carries the loud buttons (Get it / Save for this); the rest are quiet pick
     cards that bring a treat into the featured slot. The engine (inside treats.js) owns the money.
       el.configure({title, beads, featuredId, goalId, treats:[{id,name,emoji,price,have,can}], tickets:[{name}]})
       el.say(text)   Bix speaks     el.bixi   the character
     Sends 'ab-action' with detail.action = back | pick (id) | goal (id) | buy (id). */
  customElements.define('ab-shop-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:12px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .title{font-size:clamp(20px,2.6cqw,26px);font-weight:900;flex:1;min-width:0}
        .teacher{display:flex;align-items:center;gap:14px}
        .teacher ab-bubble{max-width:min(78cqw,520px)}
        .tickets{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-height:0}
        .tickets:empty{display:none}
        .tk-head{font-size:14px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        .ticket{display:inline-flex;align-items:center;gap:6px;background:#fff;border-radius:999px;padding:6px 14px;
          font-size:15px;font-weight:800;box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')}}
        .mid{flex:1;min-height:0;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:4px}
        .cards{display:flex;gap:16px;justify-content:center;flex-wrap:wrap;width:100%;max-width:820px}
        .card{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border-radius:26px;padding:18px 16px;
          width:150px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};border:3px solid transparent;
          transition:transform .08s;position:relative;-webkit-tap-highlight-color:transparent}
        .card:active{transform:scale(.97)}
        .card:focus-visible{outline:none;border-color:${v('purple', '#5B3596')}}
        .card.goal{border-color:${v('gold', '#F5A623')}}
        .art{font-size:48px;line-height:1}
        .nm{font-size:17px;font-weight:900}
        .price{display:inline-flex;align-items:center;gap:4px;font-size:15px;font-weight:900;color:${v('orange-ink', '#7A4300')}}
        .bar{width:100%;height:9px;border-radius:999px;background:${v('purple-line', '#DCD3EC')};overflow:hidden}
        .bar i{display:block;height:100%;background:${v('gold', '#F5A623')}}
        .card.hi{width:min(94%,300px);padding:24px 22px;gap:12px;border-color:transparent}
        .card.hi.goal{border-color:${v('gold', '#F5A623')}}
        .card.hi .art{font-size:92px}
        .card.hi .nm{font-size:22px}
        .card.hi .price{font-size:20px}
        .tgoal{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:900;color:${v('orange-deep', '#C66A0C')};
          letter-spacing:.04em;text-transform:uppercase}
        .need{font-size:14px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        .card.hi.can .need{color:#2FA36B}
        .btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:4px}
        @container (max-aspect-ratio: 1/1){ .cards{flex-direction:column;align-items:center} .card{width:100%;max-width:420px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back to My Room" data-a="back"></ab-icon-button>
            <span class="title">Treats</span>
            <ab-chip icon="star"><b class="beads">0</b></ab-chip>
          </div>
          <div class="teacher"><ab-bixi pose="wave" size="84" idle></ab-bixi><ab-bubble tone="bixi" tail="left" size="18"></ab-bubble></div>
          <div class="tickets"></div>
          <div class="mid"><div class="cards"></div></div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      this._fit();
    }
    _emit(action, id) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action, id }, bubbles: true, composed: true })); }
    _fit() {
      const b = this.shadowRoot.querySelector('.teacher ab-bixi');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; b.setAttribute('size', Math.round(Math.max(72, Math.min(r.width * 0.09, r.height * 0.14)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ title = 'Treats', beads = 0, featuredId = null, goalId = null, treats = [], tickets = [] } = {}) {
      this.shadowRoot.querySelector('.title').textContent = title;
      this.shadowRoot.querySelector('.beads').textContent = beads;
      const tk = this.shadowRoot.querySelector('.tickets');
      tk.innerHTML = tickets.length
        ? `<span class="tk-head">Show a grown-up:</span>` + tickets.map(x =>
            `<span class="ticket"><ab-icon name="star" size="18"></ab-icon>${esc(x.name)}</span>`).join('')
        : '';
      const feat = treats.find(t => t.id === featuredId) || treats[0] || null;
      const rest = treats.filter(t => !feat || t.id !== feat.id);
      const box = this.shadowRoot.querySelector('.cards');
      const bead = '<ab-icon name="star" size="18"></ab-icon>';
      const bigCard = t => {
        const isGoal = goalId && goalId === t.id, can = !!t.can;
        const need = can ? 'You have enough' : `${t.price - (t.have || 0)} more to go`;
        const getBtn = can ? `<ab-button size="sm" variant="${isGoal ? 'primary' : 'soft'}" data-get="${esc(t.id)}">Get it</ab-button>` : '';
        const goalBtn = isGoal ? '' : `<ab-button size="sm" variant="soft" icon="star" data-goal="${esc(t.id)}">Save for this</ab-button>`;
        return `<div class="card hi${can ? ' can' : ''}${isGoal ? ' goal' : ''}">`
          + (isGoal ? `<span class="tgoal"><ab-icon name="star" size="14"></ab-icon>Saving for this</span>` : '')
          + `<span class="art">${esc(t.emoji || '🎁')}</span>`
          + `<span class="nm">${esc(t.name)}</span>`
          + `<span class="price">${bead}${t.price}</span>`
          + `<span class="bar"><i style="width:${Math.min(100, Math.round(100 * (t.have || 0) / t.price))}%"></i></span>`
          + `<span class="need">${esc(need)}</span>`
          + `<span class="btns">${goalBtn}${getBtn}</span></div>`;
      };
      const smallCard = t => {
        const isGoal = goalId && goalId === t.id;
        return `<button class="card${isGoal ? ' goal' : ''}" data-pick="${esc(t.id)}" aria-label="${esc(t.name)}: ${t.price} golden beads">`
          + `<span class="art">${esc(t.emoji || '🎁')}</span>`
          + `<span class="nm">${esc(t.name)}</span>`
          + `<span class="price">${bead}${t.price}</span>`
          + `<span class="bar"><i style="width:${Math.min(100, Math.round(100 * (t.have || 0) / t.price))}%"></i></span></button>`;
      };
      box.innerHTML = (feat ? bigCard(feat) : '') + rest.map(smallCard).join('');
      box.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => this._emit('pick', b.dataset.pick)));
      box.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => this._emit('goal', b.dataset.goal)));
      box.querySelectorAll('[data-get]').forEach(b => b.addEventListener('click', () => this._emit('buy', b.dataset.get)));
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get bixi() { return this.shadowRoot.querySelector('.teacher ab-bixi'); }
  });

  /* ---------- ab-play-screen ----------
     The "Play" games hub: a grid of game tiles. Juni leads from the top; Bixi waves in the corner.
     Rendering/launching still live in games.js; the engine just configures the frame:
       el.configure({games:[{id,label,desc,icon,chip,isNew,tone}], bixiLine})
       el.say(text)  Juni's line    el.bixiSay(text)  Bixi corner line ('' hides)   el.juni / el.bixi
     Sends 'ab-action' with detail.action = back | pick (detail.gameId). */
  customElements.define('ab-play-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:14px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .title{font-size:clamp(20px,2.6cqw,26px);font-weight:900}
        .teacher{display:flex;align-items:center;gap:14px}
        .teacher ab-bubble{max-width:min(78cqw,520px)}
        .mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
        .cards{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;width:100%;max-width:820px}
        .card{all:unset;box-sizing:border-box;cursor:pointer;background:#fff;border-radius:28px;padding:24px 20px;
          flex:1 1 0;min-width:190px;max-width:250px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;
          box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};border:3px solid transparent;transition:transform .08s;position:relative;-webkit-tap-highlight-color:transparent}
        .card:active{transform:scale(.97)}
        .card:focus-visible{outline:none;border-color:${v('purple', '#5B3596')}}
        .ic{width:64px;height:64px;border-radius:50%;background:${v('purple-soft', '#EEE6FA')};color:${v('purple', '#5B3596')};display:flex;align-items:center;justify-content:center}
        .card.orange .ic{background:${v('orange-soft', '#FFF1DE')};color:${v('orange-deep', '#C66A0C')}}
        .lab{font-size:21px;font-weight:900}
        .desc{font-size:14px;font-weight:600;line-height:1.35;color:${v('ink-soft', '#5E5478')}}
        .chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        .chip:empty{display:none}
        .new{font-size:13px;font-weight:900;color:${v('orange-deep', '#C66A0C')};background:${v('orange-soft', '#FFF1DE')};padding:3px 10px;border-radius:999px}
        .bixi{position:absolute;right:22px;bottom:12px;display:flex;align-items:flex-end;gap:6px;pointer-events:none;z-index:3}
        .bixi ab-bubble{max-width:220px;margin-bottom:14px}
        @container (max-aspect-ratio: 1/1){
          .cards{flex-direction:column;align-items:center}
          .card{width:100%;max-width:440px;flex-direction:row;justify-content:flex-start;text-align:left}
          .bixi{display:none}
        }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back home" data-a="back"></ab-icon-button>
            <span class="title">Play</span>
          </div>
          <div class="teacher"><ab-juni pose="point" size="96" idle></ab-juni><ab-bubble tail="left" size="19"></ab-bubble></div>
          <div class="mid"><div class="cards"></div></div>
          <div class="bixi"><ab-bubble tone="bixi" tail="bottom-right" size="16" style="display:none"></ab-bubble><ab-bixi pose="wave" size="112"></ab-bixi></div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      this._fit();
    }
    _emit(action, gameId) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action, gameId }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('.teacher ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; j.setAttribute('size', Math.round(Math.max(80, Math.min(r.width * 0.09, r.height * 0.14)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    configure({ games = [], bixiLine = '' } = {}) {
      const box = this.shadowRoot.querySelector('.cards');
      box.innerHTML = games.map(g => {
        const tag = g.chip ? `<span class="chip"><ab-icon name="star" size="16"></ab-icon>${esc(g.chip)}</span>`
                  : g.isNew ? `<span class="new">New!</span>` : '';
        return `<button class="card${g.tone === 'orange' ? ' orange' : ''}" data-game="${esc(g.id)}" aria-label="${esc(g.label)}: ${esc(g.desc || '')}">`
          + `<span class="ic"><ab-icon name="${esc(g.icon || 'star')}" size="32"></ab-icon></span>`
          + `<span class="lab">${esc(g.label)}</span>`
          + (g.desc ? `<span class="desc">${esc(g.desc)}</span>` : '')
          + tag
          + `</button>`;
      }).join('');
      box.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => this._emit('pick', b.dataset.game)));
      this.bixiSay(bixiLine);
    }
    say(text) { this.shadowRoot.querySelector('.teacher ab-bubble').say(text); }
    bixiSay(text) { const b = this.shadowRoot.querySelector('.bixi ab-bubble'); b.style.display = text ? '' : 'none'; if (text) b.say(text); }
    get juni() { return this.shadowRoot.querySelector('.teacher ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('.bixi ab-bixi'); }
  });

  /* ---------- ab-album-screen ----------
     "My stickers" — the sticker book. One page per pack; collected stickers are drawn, empty
     spots are inviting dashed wells (never locked/grey). Read-only: the only control is Back.
       el.configure({ title, count, total, packs })   el.say(text)   el.juni
         packs: [{ name, got, total, full, items:[{ has, gold, n, svg }] }]  (svg = TOY.sticker string, '' when empty)
     Sends 'ab-action' with detail.action = back. */
  customElements.define('ab-album-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .sky{height:30%;border-radius:0 0 50% 50%/0 0 60px 60px}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;gap:12px;
          padding:max(20px,env(safe-area-inset-top)) 28px max(22px,env(safe-area-inset-bottom));box-sizing:border-box}
        .top{display:flex;align-items:center;gap:14px}
        .title{font-size:clamp(20px,2.6cqw,26px);font-weight:900;flex:1;min-width:0}
        .top ab-chip{flex:none}
        .teacher{display:flex;align-items:center;gap:14px}
        .teacher ab-bubble{max-width:min(78cqw,520px)}
        .book{flex:1;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 2px 8px;
          display:flex;flex-direction:column;gap:18px}
        .page{background:#fff;border-radius:${v('radius-lg', '32px')};box-shadow:${v('shadow-soft', '0 6px 18px rgba(91,53,150,.12)')};
          padding:18px 20px;border:3px solid transparent}
        .page.full{border-color:${v('gold', '#F5A623')}}
        .phead{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:14px}
        .phead h2{margin:0;font-size:20px;font-weight:900}
        .pgot{font-size:14px;font-weight:800;color:${v('ink-soft', '#5E5478')}}
        .page.full .pgot{color:${v('orange-deep', '#C66A0C')}}
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:12px;justify-items:center}
        .slot{position:relative;width:86px;height:86px;display:flex;align-items:center;justify-content:center}
        .slot svg{width:100%;height:100%}
        .slot.empty{border-radius:50%;background:${v('purple-soft', '#EEE6FA')};
          border:2px dashed ${v('purple-line', '#DCD3EC')};color:${v('ink-faint', '#9A90B0')}}
        .slot.empty ab-icon{opacity:.5}
        .slot .mult{position:absolute;right:-2px;bottom:-2px;min-width:22px;height:22px;padding:0 5px;border-radius:999px;
          background:${v('purple', '#5B3596')};color:#fff;font:900 13px ${FONT};display:flex;align-items:center;justify-content:center;box-sizing:border-box}
        .slot.gold .mult{background:${v('star', '#F5A623')};color:#4A2D00}
        @container (max-aspect-ratio: 1/1){ .teacher ab-bubble{max-width:min(86cqw,420px)} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <div class="top">
            <ab-icon-button icon="back" label="Back to My Room" data-a="back"></ab-icon-button>
            <span class="title">My stickers</span>
            <ab-chip icon="star"><b class="count">0</b>&nbsp;<span class="of">of 0</span></ab-chip>
          </div>
          <div class="teacher"><ab-juni pose="point" size="96" idle></ab-juni><ab-bubble tail="left" size="19"></ab-bubble></div>
          <div class="book"></div>
        </div>`;
      root.querySelector('[data-a="back"]').addEventListener('click', () => this._emit('back'));
      this._fit();
    }
    _emit(action) { this.dispatchEvent(new CustomEvent('ab-action', { detail: { action }, bubbles: true, composed: true })); }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; j.setAttribute('size', Math.round(Math.max(80, Math.min(r.width * 0.09, r.height * 0.14)))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    // Clone the shared toy <defs> sprite into THIS shadow root once, so TOY.sticker's url(#...) fills resolve.
    _ensureDefs() {
      if (this._defsDone) return;
      const src = document.getElementById('toy-defs');
      if (src) { this.shadowRoot.appendChild(src.cloneNode(true)); this._defsDone = true; }
    }
    configure({ title = 'My stickers', count = 0, total = 0, packs = [] } = {}) {
      this.shadowRoot.querySelector('.title').textContent = title;
      this.shadowRoot.querySelector('.count').textContent = count;
      this.shadowRoot.querySelector('.of').textContent = 'of ' + total;
      this.renderGrid(packs);
    }
    renderGrid(packs = []) {
      this._ensureDefs();
      const spark = '<ab-icon name="sparkle" size="30"></ab-icon>';
      const book = this.shadowRoot.querySelector('.book');
      book.innerHTML = packs.map(p => {
        const slots = (p.items || []).map(it => it.has
          ? `<div class="slot has${it.gold ? ' gold' : ''}">${it.svg || ''}${it.n > 1 ? `<b class="mult">×${it.n}</b>` : ''}</div>`
          : `<div class="slot empty" aria-label="not found yet">${spark}</div>`).join('');
        return `<section class="page${p.full ? ' full' : ''}">`
          + `<div class="phead"><h2>${esc(p.name)}</h2><span class="pgot">${esc(p.got)} of ${esc(p.total)}</span></div>`
          + `<div class="grid">${slots}</div></section>`;
      }).join('');
    }
    say(text) { this.shadowRoot.querySelector('ab-bubble').say(text); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
  });

  /* ---------- ab-gate-screen ----------
     The grown-up gate (Apple Kids-category parental gate). Two steps, both beyond a young child:
       1. press and hold for 3 seconds (the bar fills; letting go early restarts), then
       2. an adult reading task — "type the Nth, Mth and Kth digits of 5 2 8 9 3".
     The hold timer lives inside the component; the engine owns the question + the answer check:
       el.say(text)          Juni's line (engine plays the voice clip)
       el.reset()            back to the hold step, cleared
       el.setQuestion(html)  put the generated question in the ask step, clear the field
       el.setStep('ask')     reveal the question step; el.focusAnswer() focuses the field
       el.setMessage(text)   status line; el.shake() nudges the card on a wrong answer
       el.answer             the typed answer (string)
     Sends 'ab-action' with detail.action = back | held (hold complete) | submit (Open / Enter). */
  customElements.define('ab-gate-screen', class extends HTMLElement {
    connectedCallback() { if (!this._built) this._build(); }
    _build() {
      this._built = true; this._step = 'hold'; this._t0 = 0; this._raf = 0;
      const HOLD_MS = 3000;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>
        :host{display:block;position:relative;width:100%;height:100%;overflow:hidden;background:${v('cream', '#FFF7EC')};
          color:${v('ink', '#2E2348')};font-family:${FONT};container-type:size}
        ${SKY}
        .wrap{position:relative;height:100%;display:flex;flex-direction:column;padding:max(20px,env(safe-area-inset-top)) 32px 24px;box-sizing:border-box}
        header{display:flex}
        main{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:28px;align-items:center;padding:4px 0 16px}
        .teacher{display:flex;flex-direction:column;align-items:center;gap:8px;min-height:0}
        .teacher ab-bubble{max-width:360px}
        .card{width:100%;max-width:520px;justify-self:center}
        .lab{font-size:15px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:${v('purple', '#5B3596')};text-align:center;margin-bottom:16px}
        .htitle{font-size:22px;font-weight:900;text-align:center;margin:0 0 18px;line-height:1.22}
        .hold{all:unset;box-sizing:border-box;position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center;gap:10px;
          width:100%;min-height:76px;border-radius:999px;background:${v('orange', '#F08A1C')};color:#fff;box-shadow:0 6px 0 ${v('orange-deep', '#C66A0C')};
          cursor:pointer;-webkit-tap-highlight-color:transparent;font:900 24px ${FONT};user-select:none;touch-action:none}
        .hold:focus-visible{outline:4px solid ${v('purple', '#5B3596')};outline-offset:4px}
        .hold.holding{box-shadow:0 2px 0 ${v('orange-deep', '#C66A0C')};transform:translateY(4px)}
        .fill{position:absolute;inset:0;transform-origin:left;transform:scaleX(0);background:rgba(255,255,255,.32);pointer-events:none}
        .hlabel{position:relative;display:flex;align-items:center;gap:10px;z-index:1}
        .hold-step[hidden],.ask-step[hidden]{display:none}
        .q{text-align:center;margin-bottom:16px}
        .q small{display:block;font-size:14px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:${v('ink-soft', '#5E5478')};margin-bottom:8px}
        .q .gw{display:block;font-size:19px;font-weight:800;line-height:1.3;margin-bottom:14px}
        .q .gw b{color:${v('purple', '#5B3596')}}
        .q .gnum{display:flex;gap:8px;justify-content:center}
        .q .gnum i{display:flex;align-items:center;justify-content:center;width:46px;height:56px;border-radius:14px;background:${v('cream', '#FFF7EC')};
          border:2px solid ${v('purple-line', '#DCD3EC')};font-style:normal;font-weight:900;font-size:28px}
        .ans{all:unset;box-sizing:border-box;display:block;width:168px;height:64px;margin:0 auto 16px;padding:0 16px;border-radius:18px;
          background:${v('cream', '#FFF7EC')};border:3px solid ${v('purple-line', '#DCD3EC')};font:900 30px ${FONT};color:${v('ink', '#2E2348')};text-align:center}
        .ans:focus{border-color:${v('purple', '#5B3596')};background:#fff}
        ab-button.open{width:100%}
        .msg{min-height:22px;margin-top:14px;text-align:center;font-size:15px;font-weight:800;color:#C0392B}
        .msg:empty{min-height:0}
        @keyframes ab-gshake{10%,90%{transform:translateX(-5px)}30%,70%{transform:translateX(6px)}50%{transform:translateX(-6px)}}
        .shake{animation:ab-gshake .3s}
        .bixi{position:absolute;right:22px;bottom:10px;z-index:3;pointer-events:none}
        @container (max-aspect-ratio: 1/1){
          main{grid-template-columns:1fr;align-content:center;gap:16px}
          .teacher{flex-direction:row;align-items:flex-end;justify-content:center}
          .teacher ab-juni{order:-1}
          .bixi{display:none}
        }
        @container (max-height: 640px){ main{gap:14px} .htitle{margin-bottom:12px} .teacher ab-bubble{max-width:300px} }
        </style>
        <div class="sky">${STARS}</div>
        <div class="wrap">
          <header><ab-icon-button icon="back" label="Back" data-a="back"></ab-icon-button></header>
          <main>
            <div class="teacher">
              <ab-bubble tail="bottom-left" size="22">This part is for a grown-up. Can you go and get one?</ab-bubble>
              <ab-juni pose="point" size="200" idle></ab-juni>
            </div>
            <ab-card pad="lg" class="card">
              <div class="lab">For grown-ups</div>
              <div class="hold-step">
                <p class="htitle">Press and hold for 3 seconds</p>
                <button class="hold" type="button"><i class="fill"></i><span class="hlabel"><ab-icon name="lock" size="26"></ab-icon><span class="htxt">Hold</span></span></button>
              </div>
              <div class="ask-step" hidden>
                <div class="q"></div>
                <input class="ans" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="?" aria-label="Your answer">
                <ab-button class="open" size="md" data-a="submit">Open</ab-button>
              </div>
              <div class="msg" role="status" aria-live="polite"></div>
            </ab-card>
          </main>
          <div class="bixi"><ab-bixi pose="wave" size="112"></ab-bixi></div>
        </div>`;
      root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => act(this, b.dataset.a)));
      const hold = root.querySelector('.hold');
      const start = () => { if (this._step !== 'hold' || this._t0) return; this._t0 = performance.now(); hold.classList.add('holding'); this._setMsg(''); this._htxt('Keep holding…'); this._tick(HOLD_MS); };
      const stop = () => { if (!this._t0) return; const early = performance.now() - this._t0 < HOLD_MS; this._resetHold(); if (early) this._setMsg('Keep holding until the bar is full.'); };
      hold.addEventListener('pointerdown', e => { e.preventDefault(); try { hold.setPointerCapture(e.pointerId); } catch (x) {} start(); });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => hold.addEventListener(ev, stop));
      hold.addEventListener('contextmenu', e => e.preventDefault());
      hold.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
      hold.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
      root.querySelector('.ans').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act(this, 'submit'); } });
      this._fit();
    }
    _tick(ms) {
      const p = Math.min(1, (performance.now() - this._t0) / ms);
      this.shadowRoot.querySelector('.fill').style.transform = 'scaleX(' + p.toFixed(3) + ')';
      if (p >= 1) { this._resetHold(); act(this, 'held'); return; }
      this._raf = requestAnimationFrame(() => this._tick(ms));
    }
    _resetHold() { cancelAnimationFrame(this._raf); this._t0 = 0; const h = this.shadowRoot.querySelector('.hold'); h.classList.remove('holding'); this.shadowRoot.querySelector('.fill').style.transform = 'scaleX(0)'; this._htxt('Hold'); }
    _htxt(t) { const s = this.shadowRoot.querySelector('.htxt'); if (s) s.textContent = t; }
    _setMsg(t) { const m = this.shadowRoot.querySelector('.msg'); if (m) m.textContent = t || ''; }
    _fit() {
      const j = this.shadowRoot.querySelector('ab-juni');
      const set = () => { const r = this.getBoundingClientRect(); if (!r.width) return; const portrait = r.height >= r.width;
        j.setAttribute('size', Math.round(Math.max(140, Math.min(portrait ? r.width * 0.3 : r.width * 0.22, r.height * (portrait ? 0.26 : 0.46))))); };
      if (!this._ro) { this._ro = new ResizeObserver(set); this._ro.observe(this); } set();
    }
    setStep(s) { this._step = s; this.shadowRoot.querySelector('.hold-step').hidden = s !== 'hold'; this.shadowRoot.querySelector('.ask-step').hidden = s !== 'ask'; }
    setQuestion(html) { this.shadowRoot.querySelector('.q').innerHTML = html; const i = this.shadowRoot.querySelector('.ans'); if (i) i.value = ''; }
    setMessage(t) { this._setMsg(t); }
    shake() { const c = this.shadowRoot.querySelector('.card'); if (!c) return; c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
    focusAnswer() { const i = this.shadowRoot.querySelector('.ans'); setTimeout(() => { try { i.focus(); } catch (e) {} }, 60); }
    reset() { this._resetHold(); this.setStep('hold'); this._setMsg(''); const i = this.shadowRoot.querySelector('.ans'); if (i) i.value = ''; }
    get answer() { return (this.shadowRoot.querySelector('.ans').value || '').trim(); }
    get juni() { return this.shadowRoot.querySelector('ab-juni'); }
    get bixi() { return this.shadowRoot.querySelector('ab-bixi'); }
    get bubble() { return this.shadowRoot.querySelector('ab-bubble'); }
    say(text) { this.bubble.say(text); }
  });
})();
