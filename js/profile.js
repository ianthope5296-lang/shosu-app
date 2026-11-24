/* Shosu.Profile — じぶんのこと（組・出席番号・名前）（担当Q・追加6）
 *
 * Profile.get() -> {cls:1..9, no:1..45, name:'山田花子'} | null     localStorage 'shosu.profile'
 * Profile.set(p) -> 保存したプロフィール | null（形が正しくないとき）
 * Profile.label(p?) -> '4年1組 12番 山田花子'（未設定なら ''）
 * Profile.valid(p) / clean(p) / clear()
 * Profile.onChange(fn) -> はずす関数
 * Profile.mountForm(el, {onSave(p), onCancel?, compact?, saveLabel?}) -> {destroy()}   入力フォーム（DOM）
 * Profile.openDialog({onSave(p), onClose?, title?, note?}) -> {close()}   入力フォームをダイアログで
 *   組：1〜9組のボタン、出席番号：1〜45のボタン（数字キーでも入る）、名前：キーボード（IMEで日本語）
 * classic script。Node でも require できる（DOM を使う部分は呼ばなければ動かない）。絵文字は使わない。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;
  var KEY = 'shosu.profile';
  var CLS_MAX = 9, NO_MAX = 45, NAME_MAX = 30;
  var mem = null, memOnly = false;
  var listeners = [];

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function intIn(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }
  function badChars(s) { return /[\u0000-\u001f\u007f\u2028\u2029<>]/.test(s); }
  function cleanName(s) {
    if (typeof s !== 'string') return '';
    return s.replace(/[\u0000-\u001f\u007f\u2028\u2029<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }
  function valid(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
    if (!intIn(p.cls, 1, CLS_MAX) || !intIn(p.no, 1, NO_MAX)) return false;
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > NAME_MAX || badChars(p.name)) return false;
    return true;
  }
  function clean(p) {
    if (!p || typeof p !== 'object') return null;
    var o = { cls: Number(p.cls), no: Number(p.no), name: cleanName(p.name) };
    return valid(o) ? o : null;
  }
  function get() {
    var raw = null, s = ls();
    try { raw = s ? s.getItem(KEY) : mem; } catch (e) { raw = mem; }
    if (raw == null && memOnly) raw = mem;
    if (!raw) return null;
    try { return clean(JSON.parse(raw)); } catch (e) { return null; }
  }
  function set(p) {
    var c = clean(p);
    if (!c) return null;
    var str = JSON.stringify(c), s = ls();
    mem = str;   // localStorage が使えないときだけ使う
    memOnly = false;
    try { if (s) s.setItem(KEY, str); } catch (e) { memOnly = true; /* 容量超過：このページの間だけ */ }
    listeners.slice().forEach(function (fn) { try { fn(c); } catch (e) {} });
    return c;
  }
  function clear() {
    var s = ls();
    mem = null; memOnly = false;
    try { if (s) s.removeItem(KEY); } catch (e) {}
    listeners.slice().forEach(function (fn) { try { fn(null); } catch (e) {} });
  }
  function label(p) {
    p = p === undefined ? get() : clean(p);
    if (!p) return '';
    return '4年' + p.cls + '組 ' + p.no + '番 ' + p.name;
  }
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  /* ---------- 入力フォーム ---------- */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, fn) {
    var b = h('button', 'btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function mountForm(el, opts) {
    opts = opts || {};
    var cur = get() || {};
    var cls = cur.cls || null, no = cur.no || null;
    var wrap = h('div', 'pf-form' + (opts.compact ? ' pf-compact' : ''));
    el.appendChild(wrap);

    // 組
    var r1 = h('div', 'pf-row');
    var l1 = h('div', 'pf-label', '組');
    r1.appendChild(l1);
    var g1 = h('div', 'pf-cls');
    g1.setAttribute('role', 'group');
    g1.setAttribute('aria-label', '組');
    var clsBtns = [];
    for (var c = 1; c <= CLS_MAX; c++) {
      (function (c) {
        var b = btn(c + '組', 'pf-cls-btn', function () { cls = c; mark(); clearMsg(); });
        b.dataset.v = c;
        clsBtns.push(b);
        g1.appendChild(b);
      })(c);
    }
    r1.appendChild(g1);
    wrap.appendChild(r1);

    // 出席番号
    var r2 = h('div', 'pf-row');
    r2.appendChild(h('div', 'pf-label', '出席番号'));
    var r2b = h('div', 'pf-no-wrap');
    var noShow = h('div', 'pf-no-show');
    noShow.setAttribute('aria-live', 'polite');
    r2b.appendChild(noShow);
    var g2 = h('div', 'pf-no');
    g2.setAttribute('role', 'group');
    g2.setAttribute('aria-label', '出席番号');
    var noBtns = [];
    for (var n = 1; n <= NO_MAX; n++) {
      (function (n) {
        var b = btn(String(n), 'pf-no-btn', function () { no = n; typed = ''; mark(); clearMsg(); });
        b.dataset.v = n;
        noBtns.push(b);
        g2.appendChild(b);
      })(n);
    }
    r2b.appendChild(g2);
    r2.appendChild(r2b);
    wrap.appendChild(r2);
    // 数字キーで番号を入れる（名前の欄に入力中は使わない）
    var typed = '', typedAt = 0;
    function onKey(e) {
      if (!wrap.isConnected) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!/^[0-9]$/.test(e.key)) return;
      var now = Date.now();
      if (now - typedAt > 1200) typed = '';
      typedAt = now;
      typed = (typed + e.key).slice(-2);
      var v = parseInt(typed, 10);
      if (v >= 1 && v <= NO_MAX) { no = v; mark(); clearMsg(); }
      else if (typed.length === 2) { typed = e.key; v = parseInt(typed, 10); if (v >= 1) { no = v; mark(); } }
    }
    document.addEventListener('keydown', onKey);

    // 名前
    var r3 = h('div', 'pf-row');
    var l3 = h('label', 'pf-label', '名前');
    r3.appendChild(l3);
    var inp = h('input', 'pf-name');
    inp.type = 'text';
    inp.id = 'pf-name-' + Math.floor(Math.random() * 1e6);
    l3.htmlFor = inp.id;
    inp.maxLength = NAME_MAX;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.placeholder = 'れい：山田 花子';
    inp.value = cur.name || '';
    inp.setAttribute('lang', 'ja');
    inp.addEventListener('input', clearMsg);
    var composing = false;
    inp.addEventListener('compositionstart', function () { composing = true; });
    inp.addEventListener('compositionend', function () { composing = false; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !composing && !e.isComposing) { e.preventDefault(); doSave(); } });
    var nameBox = h('div', 'pf-name-wrap');
    nameBox.appendChild(inp);
    nameBox.appendChild(h('div', 'pf-hint', 'キーボードで入力してね（' + NAME_MAX + '文字まで）'));
    r3.appendChild(nameBox);
    wrap.appendChild(r3);

    // ほぞん
    var bar = h('div', 'pf-bar');
    var msg = h('div', 'pf-msg');
    msg.setAttribute('role', 'status');
    var saveB = btn(opts.saveLabel || 'これでOK', 'primary pf-save', doSave);
    bar.appendChild(msg);
    if (opts.onCancel) bar.appendChild(btn('やめる', 'pf-cancel', function () { opts.onCancel(); }));
    bar.appendChild(saveB);
    wrap.appendChild(bar);

    function mark() {
      clsBtns.forEach(function (b) { var on = +b.dataset.v === cls; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      noBtns.forEach(function (b) { var on = +b.dataset.v === no; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      noShow.textContent = no ? no + '番' : '番号をえらんでね';
      noShow.classList.toggle('pf-empty', !no);
    }
    function clearMsg() { msg.textContent = ''; msg.className = 'pf-msg'; [g1, g2, inp].forEach(function (x) { x.classList.remove('pf-need'); }); }
    function doSave() {
      var name = cleanName(inp.value);
      var need = [];
      if (!cls) { need.push('組'); g1.classList.add('pf-need'); }
      if (!no) { need.push('出席番号'); g2.classList.add('pf-need'); }
      if (!name) { need.push('名前'); inp.classList.add('pf-need'); }
      if (need.length) { msg.textContent = need.join('と') + 'を 入れてね'; msg.className = 'pf-msg warn'; return; }
      var p = set({ cls: cls, no: no, name: name });
      if (!p) { msg.textContent = '入れられない文字があるよ'; msg.className = 'pf-msg warn'; return; }
      msg.textContent = 'ほぞんしたよ：' + label(p);
      msg.className = 'pf-msg good';
      if (opts.onSave) opts.onSave(p);
    }
    mark();
    if (opts.focusName) setTimeout(function () { try { inp.focus(); } catch (e) {} }, 0);
    return {
      el: wrap,
      destroy: function () { document.removeEventListener('keydown', onKey); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  // 入力フォームをダイアログで出す（ふりかえり・問題づくりから）。opts.onSave(p) / opts.onClose()
  function openDialog(opts) {
    opts = opts || {};
    var back = h('div', 'pf-modal-back');
    var box = h('div', 'pf-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'じぶんのこと');
    box.appendChild(h('h2', 'pf-modal-title', opts.title || 'じぶんのことを入れよう'));
    if (opts.note) box.appendChild(h('p', 'pf-modal-note', opts.note));
    back.appendChild(box);
    document.body.appendChild(back);
    var form = null;
    function close() { if (form) form.destroy(); form = null; if (back.parentNode) back.parentNode.removeChild(back); document.removeEventListener('keydown', onEsc); if (opts.onClose) opts.onClose(); }
    function onEsc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onEsc);
    form = mountForm(box, { compact: true, focusName: false, onCancel: close, saveLabel: 'これでOK',
      onSave: function (p) { var f = opts.onSave; opts.onClose = null; close(); if (f) f(p); } });
    return { close: close };
  }

  var Profile = {
    KEY: KEY, CLS_MAX: CLS_MAX, NO_MAX: NO_MAX, NAME_MAX: NAME_MAX,
    get: get, set: set, clear: clear, label: label, valid: valid, clean: clean, onChange: onChange,
    mountForm: hasDOM ? mountForm : function () { return { el: null, destroy: function () {} }; },
    openDialog: hasDOM ? openDialog : function () { return { close: function () {} }; }
  };
  S.Profile = Profile;
  if (typeof module === 'object' && module.exports) module.exports = Profile;
})(typeof window !== 'undefined' ? window : globalThis);
