// One place for everything the app saves on this device.
// Family-wide data (recorded voices, sounds, Bix's voice) is shared by every child.
// Each child keeps their own progress, history, practice days, stickers/garden/beads ("fun") and treat list.
// When the app moves to native iOS storage, only this file changes.
(function () {
  'use strict';
  const P = 'abacus.';
  // Settings that belong to one child; every other setting is family-wide.
  const CHILD_KEYS = ['name', 'count', 'operands', 'gap', 'gapMin', 'gapMax', 'flashSec', 'flashN', 'treats'];
  const PER_CHILD = ['progress', 'history', 'days', 'fun'];
  const LEGACY = ['settings', 'progress', 'history', 'days', 'fun'];   // single-child keys from v3.x and earlier

  function raw(k) { try { const v = localStorage.getItem(P + k); return v == null ? undefined : JSON.parse(v); } catch (e) { return undefined; } }
  function put(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} }
  function del(k) { try { localStorage.removeItem(P + k); } catch (e) {} }
  function newId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  const ck = (id, k) => 'c.' + id + '.' + k;

  let children = raw('children') || [];
  let active = raw('active');
  function saveChildren() { put('children', children); }
  function ensureChild() {
    if (!children.length) { const id = newId(); children = [{ id, name: '', created: Date.now() }]; saveChildren(); }
    if (!children.some(c => c.id === active)) { active = children[0].id; put('active', active); }
  }

  // Fold legacy single-child data into the active child (first launch after updating, or data written by tests).
  function migrateLegacy() {
    if (!LEGACY.some(k => raw(k) !== undefined)) return;
    const firstMigration = !children.length;
    if (firstMigration && raw('progress') !== undefined && raw('backup.v3') === undefined) {
      const b = {}; LEGACY.forEach(k => { const v = raw(k); if (v !== undefined) b[k] = v; }); put('backup.v3', b);
    }
    ensureChild();
    const s = raw('settings');
    if (s) {
      const fam = raw('family') || {}, pr = raw(ck(active, 'prefs')) || {};
      Object.keys(s).forEach(k => { (CHILD_KEYS.includes(k) ? pr : fam)[k] = s[k]; });
      put('family', fam); put(ck(active, 'prefs'), pr);
      const c = children.find(c => c.id === active); if (c && pr.name != null) { c.name = pr.name; saveChildren(); }
    }
    PER_CHILD.forEach(k => { const v = raw(k); if (v !== undefined) put(ck(active, k), v); });
    LEGACY.forEach(del);
  }
  migrateLegacy();
  ensureChild();

  const Store = {
    CHILD_KEYS,
    children() { return children.map(c => Object.assign({}, c)); },
    activeId() { return active; },
    activeChild() { return Object.assign({}, children.find(c => c.id === active)); },
    // Per-child keys ('progress','history','days','fun') read the active child; anything else is family-wide.
    get(k, d) { const v = PER_CHILD.includes(k) ? raw(ck(active, k)) : raw(k); return v === undefined ? d : v; },
    set(k, v) { PER_CHILD.includes(k) ? put(ck(active, k), v) : put(k, v); },
    remove(k) { PER_CHILD.includes(k) ? del(ck(active, k)) : del(k); },
    // The app works with one merged settings object; saving splits it back into family + this child.
    loadSettings(defaults) { return Object.assign({}, defaults, raw('family') || {}, raw(ck(active, 'prefs')) || {}); },
    saveSettings(s) {
      const fam = {}, pr = {};
      Object.keys(s).forEach(k => { (CHILD_KEYS.includes(k) ? pr : fam)[k] = s[k]; });
      put('family', fam); put(ck(active, 'prefs'), pr);
      const c = children.find(c => c.id === active);
      if (c && c.name !== (s.name || '')) { c.name = s.name || ''; saveChildren(); }
    },
    addChild() { const id = newId(); children.push({ id, name: '', created: Date.now() }); saveChildren(); return id; },
    switchTo(id) { if (children.some(c => c.id === id)) { active = id; put('active', id); return true; } return false; },
    removeChild(id) {
      PER_CHILD.concat('prefs').forEach(k => del(ck(id, k)));
      children = children.filter(c => c.id !== id); saveChildren();
      if (active === id) { del('active'); active = undefined; }
      ensureChild();
    },
    // Everything about every child, for the backup file.
    exportChildren() {
      return children.map(c => {
        const data = {}; PER_CHILD.concat('prefs').forEach(k => { const v = raw(ck(c.id, k)); if (v !== undefined) data[k] = v; });
        return Object.assign({}, c, { data });
      });
    },
    importChildren(list, activeId) {
      // A blank profile made on a freshly wiped device is replaced by the restored children.
      const incoming = new Set(list.map(c => c && c.id));
      children.filter(c => !incoming.has(c.id) && !c.name && raw(ck(c.id, 'progress')) === undefined).forEach(c => {
        PER_CHILD.concat('prefs').forEach(k => del(ck(c.id, k))); children = children.filter(x => x.id !== c.id);
      });
      list.forEach(c => {
        if (!c || !c.id) return;
        const i = children.findIndex(x => x.id === c.id), rec = { id: c.id, name: c.name || '', created: c.created || Date.now() };
        if (i >= 0) children[i] = rec; else children.push(rec);
        Object.entries(c.data || {}).forEach(([k, v]) => put(ck(c.id, k), v));
      });
      saveChildren();
      if (activeId && children.some(c => c.id === activeId)) { active = activeId; put('active', active); }
    },
  };
  window.Store = Store;
  window.__read = k => Store.get(k);   // used by the browser tests
  window.__legacy = k => { const v = k === 'settings' ? Store.loadSettings({}) : Store.get(k); return v === undefined ? null : JSON.stringify(v); };   // tests written for the single-child format
})();
