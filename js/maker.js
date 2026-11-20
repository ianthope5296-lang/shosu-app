/* maker.js — もんだいづくり「作る画面」（担当F）
 * Shosu.Maker.mount(el, route) -> { destroy() }
 *   route: 'make' | 'make/<kind>' | 'my' | 'edit/<id>'
 * 種類をえらぶ → 作る → ためしに解く → できあがり（みんなに見せる／リンクをコピー／ほぞん）
 * 使うもの：Shosu.Share（encode/url/validate/toProblem/answerText/MAX_LEN）、
 *           Shosu.Store（myList/mySave/myDelete）、Shosu.Problems、Shosu.Figures、Shosu.Present.drawInk（あれば）
 */
(function (S) {
  'use strict';

  /* ---------- 種類 ---------- */
  var KINDS = [
    { id: 'hissan', label: '筆算', desc: 'たし算・ひき算の筆算。2つの数を入れると、答えはアプリが計算するよ。', color: '#d27a2c' },
    { id: 'fill', label: '文章題・□うめ', desc: '問題文を手で書こう。答えの数と単位をえらぶよ。', color: '#4a7fc1' },
    { id: 'compare', label: '大小くらべ', desc: '2つの数をくらべる問題。＞・＜・＝はアプリが決めるよ。', color: '#4e9a68' },
    { id: 'masu', label: 'ますの図', desc: 'ますに水を入れて「何Lかな？」の問題を作ろう。', color: '#2b8a9e' },
    { id: 'numberline', label: '数直線', desc: '目もりをタップして↑をおこう。↑の数を答える問題だよ。', color: '#8a68b5' }
  ];
  function kindInfo(id) { for (var i = 0; i < KINDS.length; i++) if (KINDS[i].id === id) return KINDS[i]; return null; }

  var UNITS = [['L', 'L'], ['mL', 'mL'], ['m', 'm'], ['cm', 'cm'], ['mm', 'mm'], ['km', 'km'], ['kg', 'kg'], ['g', 'g'], ['こ', 'こ'], ['倍', '倍'], ['', 'なし']];

  var LINES = [
    { key: '0-1', label: '0〜1', sub: '0.1ずつ', min: '0', max: '1', step: '0.1' },
    { key: '0-2', label: '0〜2', sub: '0.1ずつ', min: '0', max: '2', step: '0.1' },
    { key: '0-0.1', label: '0〜0.1', sub: '0.01ずつ', min: '0', max: '0.1', step: '0.01' },
    { key: '2.8-2.9', label: '2.8〜2.9', sub: '0.01ずつ', min: '2.8', max: '2.9', step: '0.01' },
    { key: '0-0.01', label: '0〜0.01', sub: '0.001ずつ', min: '0', max: '0.01', step: '0.001' },
    { key: '2.39-2.41', label: '2.39〜2.41', sub: '0.001ずつ', min: '2.39', max: '2.41', step: '0.001' }
  ];
  var ARROW_NAMES = ['あ', 'い', 'う'];

  var INK = { q: { w: 800, h: 300 }, hint: { w: 800, h: 200 }, author: { w: 400, h: 120 } };

  /* ---------- 小数を整数であつかう（浮動小数の誤差を出さない） ---------- */
  var N = {
    scale: function (s) { s = String(s); var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; },
    toInt: function (s, sc) {
      s = String(s);
      if (sc == null) sc = N.scale(s);
      var i = s.indexOf('.');
      var ip = i < 0 ? s : s.slice(0, i), dp = i < 0 ? '' : s.slice(i + 1);
      while (dp.length < sc) dp += '0';
      return parseInt((ip || '0') + dp.slice(0, sc), 10) || 0;
    },
    fromInt: function (n, sc) {
      var neg = n < 0, s = String(Math.abs(n));
      if (sc > 0) {
        while (s.length <= sc) s = '0' + s;
        s = (s.slice(0, s.length - sc) + '.' + s.slice(s.length - sc)).replace(/0+$/, '').replace(/\.$/, '');
      }
      return (neg ? '-' : '') + s;
    },
    cmp: function (a, b) {
      var sc = Math.max(N.scale(a), N.scale(b)), x = N.toInt(a, sc), y = N.toInt(b, sc);
      return x < y ? -1 : x > y ? 1 : 0;
    },
    add: function (a, b) { var sc = Math.max(N.scale(a), N.scale(b)); return N.fromInt(N.toInt(a, sc) + N.toInt(b, sc), sc); },
    sub: function (a, b) { var sc = Math.max(N.scale(a), N.scale(b)); return N.fromInt(N.toInt(a, sc) - N.toInt(b, sc), sc); },
    valid: function (s) { return /^\d+(\.\d+)?$/.test(String(s)); }
  };

  /* ---------- DOM の道具 ---------- */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function link(label, cls, href) { var a = h('a', cls, label); a.href = href; return a; }
  function toast(msg) {
    var t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2600);
  }
  function confirmDialog(message, okLabel, onOk) {
    var back = h('div', 'modal-back mk-modal-back');
    var box = h('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.appendChild(h('div', 'modal-msg', message));
    var row = h('div', 'modal-row');
    row.appendChild(button('やめる', '', function () { back.remove(); }));
    row.appendChild(button(okLabel || 'OK', 'danger', function () { back.remove(); onOk(); }));
    box.appendChild(row);
    back.appendChild(box);
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function fmtDate(t) {
    var d = new Date(t || Date.now());
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function share() { return S.Share; }
  function store() { return S.Store; }
  function inkHasStrokes(ink) { return !!(ink && ink.strokes && ink.strokes.some(function (s) { return s && s.length; })); }

  /* ---------- インクを絵にする（Present.drawInk があればそれを使う） ---------- */
  function drawInk(ink, opts) {
    opts = opts || {};
    if (S.Present && typeof S.Present.drawInk === 'function') {
      try { var c0 = S.Present.drawInk(ink, opts); if (c0) return c0; } catch (e) { console.warn('Present.drawInk', e); }
    }
    var w = ink && ink.w || 400, hh = ink && ink.h || 120;
    var dw = opts.width || w, sc = dw / w, dh = Math.round(hh * sc);
    var r = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    var c = document.createElement('canvas');
    c.width = Math.round(dw * r); c.height = Math.round(dh * r);
    c.style.width = dw + 'px'; c.style.height = dh + 'px';
    var ctx = c.getContext('2d');
    ctx.setTransform(r * sc, 0, 0, r * sc, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = opts.color || '#1f2a44';
    ctx.lineWidth = Math.max(5, 2.2 / sc);
    ((ink && ink.strokes) || []).forEach(function (st) {
      if (!st || !st.length) return;
      if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0].x, st[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y);
      for (var i = 1; i < st.length; i++) ctx.lineTo(st[i].x, st[i].y);
      ctx.stroke();
    });
    c.className = 'mk-ink-img';
    return c;
  }

  /* ---------- 手書き欄（えんぴつ・けしゴム・1画もどす・ぜんぶけす） ----------
   * 座標は論理サイズ（w×h）で持つ。表示は親の幅に合わせて拡大・縮小する。
   * けしゴムは「さわった線を1本ずつ消す」方式（リンクに入れられる形のまま）。 */
  function InkPad(o) {
    var W = o.w, H = o.h;
    var strokes = (o.ink && o.ink.strokes ? o.ink.strokes : []).map(function (s) { return s.map(function (p) { return { x: p.x, y: p.y }; }); });
    var history = [];
    var erasing = false, cur = null, activeId = null, eraseSnap = null, erasedAny = false;
    var listeners = [];
    var lw = o.lineWidth || 5;

    var wrap = h('div', 'mk-pad' + (o.cls ? ' ' + o.cls : ''));
    var bar = h('div', 'mk-pad-bar');
    var title = h('span', 'mk-pad-label', o.label || '');
    bar.appendChild(title);
    if (o.note) bar.appendChild(h('span', 'mk-pad-note', o.note));
    var tools = h('span', 'mk-pad-tools');
    var bPen = button('えんぴつ', 'mk-tool on', function () { setErase(false); });
    var bEra = button('けしゴム', 'mk-tool', function () { setErase(true); });
    var bUndo = button('1画もどす', 'mk-tool', undo);
    var bAll = button('ぜんぶけす', 'mk-tool', function () {
      if (!strokes.length) return;
      history.push(strokes.slice()); strokes = []; redraw(); changed();
    });
    if (o.compact) { bUndo.textContent = 'もどす'; bAll.textContent = 'けす'; }
    if (!o.compact) { tools.appendChild(bPen); tools.appendChild(bEra); }
    tools.appendChild(bUndo); tools.appendChild(bAll);
    bar.appendChild(tools);

    var area = h('div', 'mk-pad-area');
    area.style.aspectRatio = W + ' / ' + H;
    var canvas = document.createElement('canvas');
    canvas.className = 'mk-pad-canvas';
    canvas.style.touchAction = 'none';
    var ph = h('div', 'mk-pad-ph', o.placeholder || '');
    area.appendChild(canvas);
    area.appendChild(ph);
    wrap.appendChild(bar);
    wrap.appendChild(area);
    var ctx = canvas.getContext('2d');
    var dispW = 0, dispH = 0;

    function setErase(v) {
      erasing = v;
      bPen.classList.toggle('on', !v); bEra.classList.toggle('on', v);
      area.classList.toggle('erasing', v);
    }
    function undo() {
      if (!history.length) return;
      strokes = history.pop(); redraw(); changed();
    }
    function changed() {
      ph.hidden = strokes.length > 0;
      bUndo.disabled = !history.length;
      bAll.disabled = !strokes.length;
      for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) { console.error(e); } }
    }
    function fit() {
      var cw = Math.floor(area.clientWidth);
      if (!cw) return;
      var chh = Math.round(cw * H / W);
      if (cw === dispW && chh === dispH) return;
      dispW = cw; dispH = chh;
      var r = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      canvas.width = Math.round(cw * r); canvas.height = Math.round(chh * r);
      canvas.style.width = cw + 'px'; canvas.style.height = chh + 'px';
      redraw();
    }
    function setT() {
      var r = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      var sc = dispW / W;
      ctx.setTransform(r * sc, 0, 0, r * sc, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = ctx.fillStyle = '#1f2a44';
      ctx.lineWidth = lw;
    }
    function drawStroke(st) {
      if (!st.length) return;
      if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0].x, st[0].y, lw / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y);
      for (var i = 1; i < st.length; i++) ctx.lineTo(st[i].x, st[i].y);
      ctx.stroke();
    }
    function redraw() {
      if (!dispW) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setT();
      strokes.forEach(drawStroke);
    }
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (rect.width ? W / rect.width : 1);
      var y = (e.clientY - rect.top) * (rect.height ? H / rect.height : 1);
      return { x: Math.round(Math.max(0, Math.min(W, x))), y: Math.round(Math.max(0, Math.min(H, y))) };
    }
    function penSeen() {
      try { return !!(S.Pad && S.Pad.penSeen && S.Pad.penSeen()); } catch (e) { return false; }
    }
    var localPen = false;
    function accept(e) {
      if (e.pointerType === 'pen') { localPen = true; return true; }
      if (e.pointerType === 'touch' && (localPen || penSeen())) return false;
      if (e.pointerType === 'mouse' && e.button !== 0) return false;
      return true;
    }
    function distSeg(p, a, b) {
      var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      var t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
      var qx = a.x + t * dx - p.x, qy = a.y + t * dy - p.y;
      return Math.sqrt(qx * qx + qy * qy);
    }
    function eraseAt(p) {
      var R = Math.max(14, W / 50);
      var keep = strokes.filter(function (st) {
        if (st.length === 1) return distSeg(p, st[0], st[0]) > R;
        for (var i = 1; i < st.length; i++) if (distSeg(p, st[i - 1], st[i]) <= R) return false;
        return true;
      });
      if (keep.length !== strokes.length) { strokes = keep; erasedAny = true; redraw(); }
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!accept(e) || activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      var p = pos(e);
      if (erasing) {
        eraseSnap = strokes.slice(); erasedAny = false;
        eraseAt(p);
      } else {
        history.push(strokes.slice());
        cur = [p];
        strokes = strokes.concat([cur]);
        setT(); drawStroke(cur);
        ph.hidden = true;
      }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== activeId) return;
      e.preventDefault();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) {
        var p = pos(evs[i]);
        if (erasing) { eraseAt(p); continue; }
        if (!cur) continue;
        var last = cur[cur.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) continue;
        cur.push(p);
        setT();
        ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    });
    function end(e) {
      if (e.pointerId !== activeId) return;
      activeId = null;
      if (erasing) {
        if (erasedAny) { history.push(eraseSnap); changed(); }
        eraseSnap = null;
      } else if (cur) {
        cur = null; redraw(); changed();
      }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(area); }
    else window.addEventListener('resize', fit);
    setTimeout(fit, 0);
    changed();

    return {
      el: wrap,
      ink: function () { return { w: W, h: H, strokes: strokes.map(function (s) { return s.map(function (p) { return { x: p.x, y: p.y }; }); }) }; },
      isEmpty: function () { return !strokes.length; },
      onChange: function (fn) { listeners.push(fn); },
      flag: function (on) { wrap.classList.toggle('mk-need', !!on); },
      destroy: function () { if (ro) ro.disconnect(); else window.removeEventListener('resize', fit); }
    };
  }

  /* ---------- 数字キー ---------- */
  function keypad(onKey) {
    var el;
    if (S.Demos && S.Demos.ui && S.Demos.ui.keypad) {
      el = S.Demos.ui.keypad({ onKey: onKey });
    } else {
      el = h('div', 'sd-keypad');
      ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '←'].forEach(function (k) {
        var b = h('button', 'sd-btn sd-key', k === '←' ? '⌫' : k);
        b.type = 'button';
        b.addEventListener('click', function () { onKey(k); });
        el.appendChild(b);
      });
    }
    el.classList.add('mk-keypad');
    var keys = el.querySelectorAll('button');
    if (keys.length === 12) {
      keys[10].textContent = '．';
      keys[10].setAttribute('aria-label', '小数点');
      keys[11].innerHTML = '<span class="mk-bs">⌫</span><small>1字けす</small>';
      keys[11].setAttribute('aria-label', '1字けす');
    }
    return el;
  }

  /* 数の入力欄（タップでえらび、数字キーで入れる） */
  function NumField(o) {
    var val = o.value || '';
    var el = h('button', 'mk-num' + (o.cls ? ' ' + o.cls : ''));
    el.type = 'button';
    if (o.label) el.appendChild(h('span', 'mk-num-label', o.label));
    var v = h('span', 'mk-num-val');
    el.appendChild(v);
    function render() {
      v.textContent = val || '？';
      el.classList.toggle('empty', !val);
    }
    render();
    return {
      el: el,
      get: function () { return val; },
      set: function (s) { val = s; render(); },
      focus: function (on) { el.classList.toggle('on', !!on); el.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    };
  }

  /* 数字キーの1回分を反映。エラーならメッセージを返す */
  function applyKey(val, k, maxDec, maxInt) {
    maxInt = maxInt || 3;
    if (k === '←') return { val: val.slice(0, -1) };
    if (k === '.') {
      if (val.indexOf('.') >= 0) return { val: val, err: '小数点は1つだけだよ。' };
      return { val: (val || '0') + '.' };
    }
    var i = val.indexOf('.');
    if (i >= 0 && val.length - i - 1 >= maxDec) {
      return { val: val, err: maxDec === 2 ? 'たし算・ひき算の筆算は、小数第二位（1/100の位）までにしよう。' : '小数第三位（1/1000の位）までにしよう。' };
    }
    if (i < 0 && val.replace(/^0+/, '').length >= maxInt && val !== '0') return { val: val, err: '整数の部分は' + maxInt + 'けたまでにしよう。' };
    if (val === '0') return { val: k };
    return { val: val + k };
  }

  /* ---------- 星（Shosu.Stars：担当H） ---------- */
  function starBadge() {
    if (!(S.Stars && S.Stars.badge)) return null;
    try { var b = S.Stars.badge(); if (!b) return null; var w = h('span', 'topbar-stars'); w.appendChild(b); return w; }
    catch (e) { console.error('Stars.badge', e); return null; }
  }
  function starLog(type, data) {
    if (!(S.Stars && S.Stars.log)) return [];
    try { return S.Stars.log(type, data) || []; } catch (e) { console.error('Stars.log', e); return []; }
  }

  function deviceId() {
    try { return S.Session && S.Session.deviceId ? S.Session.deviceId() : null; } catch (e) { return null; }
  }

  /* ---------- 作りかけ（ページ内で覚えておく） ---------- */
  var draft = null; // {kind, up, editId}

  function blankUp(kind) {
    var up = { v: 1, kind: kind, author: null, hint: null };
    if (kind === 'hissan') { up.op = '+'; up.a = ''; up.b = ''; }
    if (kind === 'fill') { up.q = null; up.answer = ''; up.unit = 'L'; }
    if (kind === 'compare') { up.a = ''; up.b = ''; }
    if (kind === 'masu') { up.level = 2; up.L = 1; up.d1 = 2; up.d2 = 6; up.d3 = 0; }
    if (kind === 'numberline') { up.min = '0'; up.max = '1'; up.step = '0.1'; up.labelEvery = 10; up.arrows = []; }
    return up;
  }

  /* 答えの計算 */
  function hissanAns(up) {
    if (!N.valid(up.a) || !N.valid(up.b)) return null;
    return up.op === '-' ? N.sub(up.a, up.b) : N.add(up.a, up.b);
  }
  function masuAns(up) {
    var s = String(up.L || 0) + '.' + (up.d1 || 0) + (up.d2 || 0) + (up.level === 3 ? (up.d3 || 0) : '');
    return N.fromInt(N.toInt(s), N.scale(s));
  }
  function sym(c) { return c > 0 ? '＞' : c < 0 ? '＜' : '＝'; }
  function sortedArrows(up) {
    return (up.arrows || []).slice().sort(function (a, b) { return N.cmp(a, b); });
  }
  function answerText(up) {
    switch (up.kind) {
      case 'hissan': var a = hissanAns(up); return a == null ? '' : a;
      case 'fill': return up.answer ? up.answer + (up.unit ? ' ' + up.unit : '') : '';
      case 'compare': return N.valid(up.a) && N.valid(up.b) ? up.a + ' ' + sym(N.cmp(up.a, up.b)) + ' ' + up.b : '';
      case 'masu': return masuAns(up) + ' L';
      case 'numberline':
        return sortedArrows(up).map(function (v, i) { return ARROW_NAMES[i] + '　' + v; }).join('、　');
    }
    return '';
  }

  /* 検証：[{where, msg}] を返す（空なら OK） */
  function problems(up) {
    var out = [];
    function bad(where, msg) { out.push({ where: where, msg: msg }); }
    if (up.kind === 'hissan') {
      if (!up.a) bad('a', up.op === '-' ? 'ひかれる数を入れてね。' : '上の数を入れてね。');
      else if (!N.valid(up.a)) bad('a', '上の数が、とちゅうになっているよ。');
      if (!up.b) bad('b', up.op === '-' ? 'ひく数を入れてね。' : '下の数を入れてね。');
      else if (!N.valid(up.b)) bad('b', '下の数が、とちゅうになっているよ。');
      if (!out.length) {
        if (N.cmp(up.a, '0') === 0 || N.cmp(up.b, '0') === 0) bad('b', '0 ではない数にしよう。');
        else if (up.op === '-' && N.cmp(up.a, up.b) < 0) bad('b', 'ひかれる数のほうが小さいと、答えがマイナスになって計算できないよ。2つの数を入れかえよう。');
        else if (N.scale(up.a) === 0 && N.scale(up.b) === 0) bad('a', 'どちらかを小数にしよう。');
      }
    } else if (up.kind === 'fill') {
      if (!inkHasStrokes(up.q)) bad('q', '問題文を書いてね。');
      if (!up.answer) bad('answer', '答えの数を入れてね。');
      else if (!N.valid(up.answer)) bad('answer', '答えの数が、とちゅうになっているよ。');
    } else if (up.kind === 'compare') {
      if (!up.a) bad('a', '左の数を入れてね。'); else if (!N.valid(up.a)) bad('a', '左の数が、とちゅうになっているよ。');
      if (!up.b) bad('b', '右の数を入れてね。'); else if (!N.valid(up.b)) bad('b', '右の数が、とちゅうになっているよ。');
      if (!out.length && N.scale(up.a) === 0 && N.scale(up.b) === 0) bad('a', 'どちらかを小数にしよう。');
    } else if (up.kind === 'masu') {
      if (N.cmp(masuAns(up), '0') === 0) bad('masu', '水を入れてね（＋をおそう）。');
    } else if (up.kind === 'numberline') {
      if (!up.arrows || !up.arrows.length) bad('arrows', '数直線の目もりをタップして、↑をおいてね。');
    }
    if (!inkHasStrokes(up.author)) bad('author', '名前を書いてね。');
    return out;
  }

  /* ---------- 画面 ---------- */
  function mount(el, route) {
    var alive = true;
    var cleanups = [];
    route = String(route || 'make').replace(/^#?\/?/, '');
    var parts = route.split('/');

    function clear() {
      while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } }
      el.innerHTML = '';
    }
    function topbar(title, backLabel, backHref, right) {
      var bar = h('header', 'topbar mk-topbar');
      var back = typeof backHref === 'string' ? link(backLabel, 'btn back', backHref) : button(backLabel, 'back', backHref);
      bar.appendChild(back);
      var t = h('div', 'topbar-title');
      t.appendChild(h('h1', null, title));
      bar.appendChild(t);
      var sb = starBadge();
      if (sb) bar.appendChild(sb);
      if (right) bar.appendChild(right);
      return bar;
    }

    /* ===== 1. 種類をえらぶ ===== */
    function viewChoose() {
      clear();
      var myN = 0;
      try { myN = store() && store().myList ? store().myList().length : 0; } catch (e) {}
      var right = link('つくった問題' + (myN ? '（' + myN + '）' : ''), 'btn back mk-my-link', '#/my');
      el.appendChild(topbar('もんだいをつくる', '◀ ホーム', '#/', right));
      var main = h('main', 'mk mk-choose');
      main.appendChild(h('p', 'mk-lead', 'どんな問題を作るか、えらんでね。作った問題は、友だちにリンクで送れるよ。'));
      if (draft && !draft.editId && draft.up && draft.up.kind) {
        var info = kindInfo(draft.up.kind);
        var nb = h('div', 'mk-draft-note');
        nb.appendChild(h('span', null, '作りかけの「' + (info ? info.label : '') + '」の問題があるよ。'));
        nb.appendChild(link('つづきを作る', 'btn primary small', '#/make/' + draft.up.kind));
        nb.appendChild(button('すてる', 'small', function () { draft = null; nb.remove(); }));
        main.appendChild(nb);
      }
      var grid = h('div', 'mk-kind-grid');
      KINDS.forEach(function (k) {
        var c = link('', 'mk-kind-card', '#/make/' + k.id);
        c.style.setProperty('--kc', k.color);
        var pic = h('div', 'mk-kind-pic');
        pic.appendChild(kindPicture(k.id));
        c.appendChild(pic);
        c.appendChild(h('div', 'mk-kind-name', k.label));
        c.appendChild(h('div', 'mk-kind-desc', k.desc));
        grid.appendChild(c);
      });
      main.appendChild(grid);
      el.appendChild(main);
    }

    function kindPicture(id) {
      var d = h('div', 'mk-pic mk-pic-' + id);
      if (id === 'hissan') {
        d.innerHTML = '<div class="mk-pic-h"><span></span><span>4.25</span><span>＋</span><span>2.18</span><i></i><span></span><span class="r">6.43</span></div>';
      } else if (id === 'fill') {
        d.innerHTML = '<div class="mk-pic-f"><span class="scrib">ジュースが…</span><span class="ans"><b>□</b> L</span></div>';
      } else if (id === 'compare') {
        d.innerHTML = '<div class="mk-pic-c"><span>0.43</span><b>＞</b><span>0.425</span></div>';
      } else if (id === 'masu' && S.Figures) {
        d.appendChild(S.Figures.render({ kind: 'masu', unit: 'L', level: 2, L: 1, d1: 2, d2: 6, labels: false }));
      } else if (id === 'numberline' && S.Figures) {
        d.appendChild(S.Figures.render({ kind: 'numberline', min: 0, max: 1, step: 0.1, labelEvery: 10, arrows: [{ v: 0.3, label: 'あ' }] }));
      }
      return d;
    }

    /* ===== 2. 作る ===== */
    function viewEdit(kind, editId) {
      clear();
      var info = kindInfo(kind);
      if (!info) { viewChoose(); return; }
      if (!draft || !draft.up || draft.up.kind !== kind || (draft.editId || null) !== (editId || null)) {
        if (!editId) draft = { up: blankUp(kind), editId: null };
      }
      var up = draft.up;
      el.appendChild(topbar((editId ? 'なおす：' : '作る：') + info.label, editId ? '◀ つくった問題' : '◀ えらびなおす', editId ? '#/my' : '#/make'));
      var main = h('main', 'mk mk-edit mk-k-' + kind);
      main.style.setProperty('--kc', info.color);
      el.appendChild(main);

      var keyTarget = null;  // 数字キーの入力先 {field, key, maxDec}
      var numFields = [];
      var msgEl = h('div', 'mk-msg');
      msgEl.setAttribute('role', 'status');
      var ansEl = h('div', 'mk-answer');
      var refresh = function () {};
      var pads = {};

      function say(msg) { msgEl.textContent = msg || ''; msgEl.classList.toggle('show', !!msg); }
      function selectField(nf) {
        keyTarget = nf;
        numFields.forEach(function (f) { f.field.focus(f === nf); });
      }
      function addField(opts) {
        var nf = { field: NumField({ label: opts.label, value: up[opts.key], cls: opts.cls }), key: opts.key, maxDec: opts.maxDec || 3, maxInt: opts.maxInt || 3 };
        nf.field.el.addEventListener('click', function () { selectField(nf); say(''); });
        numFields.push(nf);
        return nf;
      }
      function onKey(k) {
        if (!keyTarget) { say('入れたいところを先にタップしてね。'); return; }
        var r = applyKey(String(up[keyTarget.key] || ''), k, keyTarget.maxDec, keyTarget.maxInt);
        say(r.err || '');
        up[keyTarget.key] = r.val;
        keyTarget.field.set(r.val);
        keyTarget.field.el.classList.remove('mk-need-f');
        changed();
      }
      function onDocKey(e) {
        var t = e.target;
        if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
        if (!numFields.length || document.querySelector('.mk-modal-back, .modal-back')) return;
        if (/^[0-9.]$/.test(e.key)) { onKey(e.key); e.preventDefault(); }
        else if (e.key === 'Backspace') { onKey('←'); e.preventDefault(); }
        else if (e.key === 'Tab' && numFields.length > 1) {
          var i = numFields.indexOf(keyTarget);
          selectField(numFields[(i + 1) % numFields.length]); e.preventDefault();
        }
      }
      document.addEventListener('keydown', onDocKey);
      cleanups.push(function () { document.removeEventListener('keydown', onDocKey); });

      var top = h('div', 'mk-top');
      main.appendChild(top);
      var left = h('section', 'mk-card mk-left');
      var right = h('section', 'mk-card mk-right');
      top.appendChild(left); top.appendChild(right);

      /* --- 種類ごと --- */
      if (kind === 'hissan') {
        left.appendChild(h('h2', 'mk-h', '① たし算かひき算かをえらぶ　② 数を入れる'));
        var seg = h('div', 'mk-seg');
        var bAdd = button('たし算 ＋', 'mk-seg-btn', function () { setOp('+'); });
        var bSub = button('ひき算 −', 'mk-seg-btn', function () { setOp('-'); });
        seg.appendChild(bAdd); seg.appendChild(bSub);
        left.appendChild(seg);
        var fa = addField({ key: 'a', maxDec: 2, cls: 'mk-num-h' });
        var fb = addField({ key: 'b', maxDec: 2, cls: 'mk-num-h' });
        var opEl = h('div', 'mk-h-op');
        var grid = h('div', 'mk-hissan');
        grid.appendChild(h('div', 'mk-h-op'));
        grid.appendChild(fa.field.el);
        grid.appendChild(opEl);
        grid.appendChild(fb.field.el);
        grid.appendChild(h('div', 'mk-h-line'));
        grid.appendChild(h('div', 'mk-h-op'));
        var hAns = h('div', 'mk-h-ans');
        grid.appendChild(hAns);
        left.appendChild(grid);
        var swap = button('⇅ 2つの数を入れかえる', 'small mk-swap', function () {
          var t = up.a; up.a = up.b; up.b = t; fa.field.set(up.a); fb.field.set(up.b); say(''); changed();
        });
        left.appendChild(swap);
        var setOp = function (op) {
          up.op = op;
          bAdd.classList.toggle('on', op === '+'); bSub.classList.toggle('on', op === '-');
          opEl.textContent = op === '-' ? '−' : '＋';
          say(''); changed();
        };
        refresh = function () {
          bAdd.classList.toggle('on', up.op !== '-'); bSub.classList.toggle('on', up.op === '-');
          opEl.textContent = up.op === '-' ? '−' : '＋';
          var a = hissanAns(up);
          var neg = a != null && a.charAt(0) === '-';
          hAns.textContent = a == null ? '' : neg ? '？' : a;
          swap.hidden = !(up.op === '-' && neg);
          setAnswer(a == null ? '' : neg ? '' : a, neg ? 'ひかれる数のほうが小さいよ。⇅で入れかえよう。' : '');
        };
        selectField(up.a ? fb : fa);
      } else if (kind === 'compare') {
        left.appendChild(h('h2', 'mk-h', 'くらべる2つの数を入れよう'));
        var ca = addField({ key: 'a', cls: 'mk-num-c', maxInt: 4 });
        var cb = addField({ key: 'b', cls: 'mk-num-c', maxInt: 4 });
        var row = h('div', 'mk-compare');
        var symEl = h('div', 'mk-c-sym', '□');
        row.appendChild(ca.field.el); row.appendChild(symEl); row.appendChild(cb.field.el);
        left.appendChild(row);
        left.appendChild(h('p', 'mk-tip', '□には ＞・＜・＝ のどれかが入るよ。ともだちはそれをえらんで答えるよ。'));
        refresh = function () {
          var ok = N.valid(up.a) && N.valid(up.b);
          symEl.textContent = ok ? sym(N.cmp(up.a, up.b)) : '□';
          symEl.classList.toggle('done', ok);
          setAnswer(ok ? answerText(up) : '');
        };
        selectField(up.a ? cb : ca);
      } else if (kind === 'fill') {
        pads.q = InkPad({ w: INK.q.w, h: INK.q.h, ink: up.q, label: '問題文', note: '（手で書こう）', cls: 'mk-pad-q', placeholder: 'ここに問題文を書こう。答えのところは □ にしてね。', lineWidth: 4.5 });
        pads.q.onChange(function () { up.q = pads.q.isEmpty() ? null : pads.q.ink(); pads.q.flag(false); changed(); });
        cleanups.push(pads.q.destroy);
        left.appendChild(pads.q.el);
      } else if (kind === 'masu') {
        buildMasu(left, right);
      } else if (kind === 'numberline') {
        buildLine(left, right);
      }

      /* 右側：数字キー（数を入れる種類） */
      if (kind === 'hissan' || kind === 'compare' || kind === 'fill') {
        if (kind === 'fill') {
          right.appendChild(h('h2', 'mk-h', '答え'));
          var fAns = addField({ key: 'answer', cls: 'mk-num-ans', label: '数', maxInt: 4 });
          var unitWrap = h('div', 'mk-units');
          var ubtns = UNITS.map(function (u) {
            var b = button(u[1], 'mk-unit', function () { up.unit = u[0]; markUnits(); changed(); });
            unitWrap.appendChild(b);
            return b;
          });
          var markUnits = function () { ubtns.forEach(function (b, i) { b.classList.toggle('on', UNITS[i][0] === (up.unit || '')); }); };
          var ansRow = h('div', 'mk-ans-row');
          ansRow.appendChild(fAns.field.el);
          var unitShow = h('span', 'mk-unit-show');
          ansRow.appendChild(unitShow);
          right.appendChild(ansRow);
          right.appendChild(h('div', 'mk-sub', '単位'));
          right.appendChild(unitWrap);
          refresh = function () { markUnits(); unitShow.textContent = up.unit || ''; ansEl.hidden = true; };
          selectField(fAns);
        }
        if (kind === 'fill') right.appendChild(msgEl);
        right.appendChild(keypad(onKey));
      }
      if (kind !== 'fill') left.appendChild(msgEl);
      if (kind !== 'fill') left.appendChild(ansEl);

      /* --- ヒント・名前 --- */
      var bottom = h('div', 'mk-bottom');
      pads.hint = InkPad({ w: INK.hint.w, h: INK.hint.h, ink: up.hint, label: 'ヒント', note: '（なくてもいいよ）', cls: 'mk-pad-hint', placeholder: 'こまったときのヒントを書けるよ', lineWidth: 4.5 });
      pads.hint.onChange(function () { up.hint = pads.hint.isEmpty() ? null : pads.hint.ink(); changed(); });
      pads.author = InkPad({ w: INK.author.w, h: INK.author.h, ink: up.author, label: '作った人の名前', note: '（かならず）', cls: 'mk-pad-name', placeholder: '名前を書いてね', compact: true, lineWidth: 4 });
      pads.author.onChange(function () { up.author = pads.author.isEmpty() ? null : pads.author.ink(); pads.author.flag(false); changed(); });
      cleanups.push(pads.hint.destroy, pads.author.destroy);
      var hb = h('section', 'mk-card mk-hint-card'); hb.appendChild(pads.hint.el);
      var nb = h('section', 'mk-card mk-name-card'); nb.appendChild(pads.author.el);
      bottom.appendChild(hb); bottom.appendChild(nb);
      main.appendChild(bottom);

      /* --- 下のバー：長さの目安・ためしに解く --- */
      var foot = h('div', 'mk-foot');
      var meter = h('div', 'mk-meter');
      var meterBar = h('div', 'mk-meter-bar'), meterFill = h('div', 'mk-meter-fill'), meterText = h('span', 'mk-meter-text');
      meterBar.appendChild(meterFill);
      meter.appendChild(h('span', 'mk-meter-label', 'リンクの長さ'));
      meter.appendChild(meterBar); meter.appendChild(meterText);
      if (!share() || !share().encode) meter.hidden = true;
      var footMsg = h('div', 'mk-foot-msg');
      var goBtn = button('ためしに解く ▶', 'primary mk-go', tryIt);
      foot.appendChild(meter); foot.appendChild(footMsg); foot.appendChild(goBtn);
      main.appendChild(foot);

      var tooLong = false, measureTimer = null, measureSeq = 0;
      function measure() {
        var sh = share();
        if (!sh || !sh.encode) return;
        var seq = ++measureSeq;
        // とちゅうの問題でも長さを測れるように、足りないところは仮の値で埋める（長さは絵でほぼ決まる）
        var test = clone(finalUp(up));
        var dot = function (w, hh) { return { w: w, h: hh, strokes: [[{ x: 10, y: 10 }, { x: 20, y: 20 }]] }; };
        if (!inkHasStrokes(test.author)) test.author = dot(INK.author.w, INK.author.h);
        if (test.kind === 'fill' && !inkHasStrokes(test.q)) test.q = dot(INK.q.w, INK.q.h);
        ['a', 'b', 'answer'].forEach(function (k) { if (k in test && !N.valid(test[k])) test[k] = '1'; });
        if (test.kind === 'hissan' && N.cmp(test.a, test.b) < 0) { var t0 = test.a; test.a = test.b; test.b = t0; }
        if (test.kind === 'numberline' && !test.arrows.length) test.arrows = [test.min];
        var max = sh.MAX_LEN || 6000;
        var p;
        try { p = sh.encode(test); } catch (e) { p = Promise.reject(e); }
        Promise.resolve(p).then(function (token) {
          if (!alive || seq !== measureSeq) return;
          showMeter(String(token || '').length, max, false);
        }, function (err) {
          if (!alive || seq !== measureSeq) return;
          var m = String(err && (err.code || err.message) || err);
          if (/TOO_LONG/i.test(m)) showMeter(max + 1, max, true);
          // それ以外（とちゅうの問題で検証に通らない等）は表示を変えない
        });
      }
      function showMeter(len, max, over) {
        var r = len / max;
        tooLong = over || r > 1;
        meterFill.style.width = Math.min(100, Math.round(r * 100)) + '%';
        meter.classList.toggle('mid', !tooLong && r >= 0.7);
        meter.classList.toggle('full', tooLong);
        meterText.textContent = tooLong ? 'いっぱい！もう少し短く書こう' : r >= 0.7 ? 'そろそろいっぱい' : 'もう少し書ける';
      }
      function changed() {
        refresh();
        footMsg.textContent = '';
        if (measureTimer) clearTimeout(measureTimer);
        measureTimer = setTimeout(measure, 600);
      }
      cleanups.push(function () { if (measureTimer) clearTimeout(measureTimer); });

      function setAnswer(text, warn) {
        ansEl.innerHTML = '';
        ansEl.hidden = false;
        if (warn) { ansEl.appendChild(h('span', 'mk-answer-warn', warn)); return; }
        ansEl.appendChild(h('span', 'mk-answer-label', '答え：'));
        if (text) {
          ansEl.appendChild(h('span', 'mk-answer-val', text));
          ansEl.appendChild(h('span', 'mk-answer-note', '（アプリが計算したよ）'));
        } else {
          ansEl.appendChild(h('span', 'mk-answer-note', kind === 'numberline' ? '↑をおくと、アプリが答えを出すよ' : kind === 'masu' ? '水を入れると、アプリが答えを出すよ' : '数を入れると、アプリが答えを出すよ'));
        }
      }

      function tryIt() {
        var errs = problems(up);
        main.querySelectorAll('.mk-need-f').forEach(function (e) { e.classList.remove('mk-need-f'); });
        if (errs.length) {
          footMsg.textContent = errs[0].msg + (errs.length > 1 ? '（ほかにも ' + (errs.length - 1) + 'つ）' : '');
          errs.forEach(function (er) {
            if (er.where === 'author') pads.author.flag(true);
            if (er.where === 'q' && pads.q) pads.q.flag(true);
            numFields.forEach(function (f) { if (f.key === er.where) f.field.el.classList.add('mk-need-f'); });
          });
          var first = errs[0].where;
          var target = first === 'author' ? pads.author.el : first === 'q' && pads.q ? pads.q.el : null;
          numFields.forEach(function (f) { if (f.key === first) { target = f.field.el; selectField(f); } });
          if (first !== 'author' && first !== 'q') say(errs[0].msg);
          if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
        if (tooLong) { footMsg.textContent = 'リンクが長すぎるよ。問題文やヒントを、もう少し短く書こう。'; return; }
        var sh = share();
        if (sh && sh.validate) {
          var v;
          try { v = sh.validate(finalUp(up)); } catch (e) { v = { ok: false, error: String(e) }; }
          if (v && v.ok === false) {
            console.warn('Share.validate', v.error);
            footMsg.textContent = 'この問題はまだ作れないみたい。もう一度たしかめてね。';
            return;
          }
        }
        viewTry(kind, editId);
      }

      /* ますの図 */
      function buildMasu(left, right) {
        left.appendChild(h('h2', 'mk-h', 'ますの図（プレビュー）'));
        var fig = h('div', 'mk-fig mk-fig-masu');
        left.appendChild(fig);
        right.appendChild(h('h2', 'mk-h', 'ますに水を入れよう'));
        var lv = h('div', 'mk-seg');
        var b2 = button('0.01Lまで', 'mk-seg-btn', function () { setLevel(2); });
        var b3 = button('0.001Lまで', 'mk-seg-btn', function () { setLevel(3); });
        lv.appendChild(b2); lv.appendChild(b3);
        right.appendChild(lv);
        var rows = h('div', 'mk-steps');
        right.appendChild(rows);
        function setLevel(n) {
          if (up.level === n) return;
          if (n === 3) { up.d3 = 0; } else { up.d3 = 0; }
          up.level = n; buildRows(); changed();
        }
        function stepRow(label, key, max, color) {
          var r = h('div', 'mk-step');
          var lab = h('div', 'mk-step-label');
          lab.innerHTML = label;
          r.appendChild(lab);
          var minus = button('−', 'mk-round', function () { if (up[key] > 0) { up[key]--; upd(); changed(); } });
          var val = h('span', 'mk-step-val');
          if (color) val.style.background = color;
          var plus = button('＋', 'mk-round', function () { if (up[key] < max) { up[key]++; upd(); changed(); } else say(max === 3 ? '1Lますは3こまでにしよう。' : '9こまでだよ。10こになったら、1つ上の大きいますにしよう。'); });
          minus.setAttribute('aria-label', 'へらす'); plus.setAttribute('aria-label', 'ふやす');
          function upd() { val.textContent = up[key] || 0; minus.disabled = !(up[key] > 0); }
          upd();
          r.appendChild(minus); r.appendChild(val); r.appendChild(plus);
          return r;
        }
        function buildRows() {
          rows.innerHTML = '';
          b2.classList.toggle('on', up.level !== 3); b3.classList.toggle('on', up.level === 3);
          var pc = function (p) { return S.Figures && S.Figures.util ? S.Figures.util.placeColor(p) : '#fff'; };
          rows.appendChild(stepRow('1Lます', 'L', 3, pc(0)));
          rows.appendChild(stepRow('0.1Lます', 'd1', 9, pc(-1)));
          if (up.level === 3) {
            rows.appendChild(stepRow('0.01Lます', 'd2', 9, pc(-2)));
            rows.appendChild(stepRow('0.001L<small>（0.01Lますの目もり）</small>', 'd3', 9, pc(-3)));
          } else {
            rows.appendChild(stepRow('0.01L<small>（0.1Lますの目もり）</small>', 'd2', 9, pc(-2)));
          }
        }
        buildRows();
        refresh = function () {
          fig.innerHTML = '';
          if (S.Figures) fig.appendChild(S.Figures.render({ kind: 'masu', unit: 'L', level: up.level, L: up.L, d1: up.d1, d2: up.d2, d3: up.level === 3 ? up.d3 : 0 }));
          var a = masuAns(up);
          setAnswer(N.cmp(a, '0') === 0 ? '' : a + ' L');
        };
      }

      /* 数直線 */
      function buildLine(left, right) {
        right.remove();
        top.classList.add('mk-top-wide');
        left.appendChild(h('h2', 'mk-h', '① はんいをえらぶ'));
        var chips = h('div', 'mk-chips');
        var cbtns = LINES.map(function (L) {
          var b = button('', 'mk-chip', function () {
            if (up.min === L.min && up.max === L.max && up.step === L.step) return;
            up.min = L.min; up.max = L.max; up.step = L.step; up.labelEvery = 10; up.arrows = [];
            say(''); changed();
          });
          b.appendChild(h('b', null, L.label));
          b.appendChild(h('small', null, L.sub));
          chips.appendChild(b);
          return b;
        });
        left.appendChild(chips);
        left.appendChild(h('h2', 'mk-h', '② 目もりをタップして ↑ をおく（1〜3本。もう一度タップで消える）'));
        var fig = h('div', 'mk-fig mk-fig-line');
        left.appendChild(fig);
        var D = 0, minI = 0, stI = 1, ticks = [];
        fig.addEventListener('click', function (e) {
          var svg = fig.querySelector('svg');
          if (!svg || !ticks.length || !svg.getScreenCTM) return;
          var m = svg.getScreenCTM();
          if (!m) return;
          var pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
          var x = pt.matrixTransform(m.inverse()).x;
          var best = 0, bd = Infinity;
          ticks.forEach(function (tx, i) { var d = Math.abs(tx - x); if (d < bd) { bd = d; best = i; } });
          var gapPx = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 50;
          if (bd > Math.max(gapPx * 0.6, 14)) return;
          var v = N.fromInt(minI + best * stI, D);
          var arr = up.arrows || [];
          var idx = -1;
          arr.forEach(function (a, i) { if (N.cmp(a, v) === 0) idx = i; });
          if (idx >= 0) { arr.splice(idx, 1); say(''); }
          else if (arr.length >= 3) { say('↑は3本までだよ。消したい↑の目もりを、もう一度タップしてね。'); return; }
          else { arr.push(v); say(''); }
          up.arrows = arr;
          changed();
        });
        refresh = function () {
          cbtns.forEach(function (b, i) { var L = LINES[i]; b.classList.toggle('on', up.min === L.min && up.max === L.max && up.step === L.step); });
          D = Math.max(N.scale(up.step), N.scale(up.min), N.scale(up.max));
          minI = N.toInt(up.min, D); stI = N.toInt(up.step, D);
          fig.innerHTML = '';
          var arrows = sortedArrows(up).map(function (v, i) { return { v: parseFloat(v), label: ARROW_NAMES[i] }; });
          if (S.Figures) {
            var svg = S.Figures.render({ kind: 'numberline', min: parseFloat(up.min), max: parseFloat(up.max), step: parseFloat(up.step), labelEvery: up.labelEvery || 10, arrows: arrows });
            fig.appendChild(svg);
            ticks = [];
            var lines = svg.querySelectorAll ? svg.querySelectorAll('line') : [];
            for (var i = 1; i < lines.length; i++) {
              if (lines[i].getAttribute('stroke') !== '#222') continue;
              if (lines[i].getAttribute('x1') !== lines[i].getAttribute('x2')) continue;
              ticks.push(parseFloat(lines[i].getAttribute('x1')));
            }
          }
          setAnswer(arrows.length ? answerText(up) : '');
        };
      }

      refresh();
      changed();
    }

    /* 保存・送信用に整える */
    function finalUp(up) {
      var o = { v: 1, kind: up.kind, author: up.author, hint: inkHasStrokes(up.hint) ? up.hint : null };
      var aid = deviceId();
      if (aid) o.aid = aid; // 作った端末（ともだちの問題で「作った人」を区別する）
      if (up.kind === 'hissan') { o.op = up.op === '-' ? '-' : '+'; o.a = up.a; o.b = up.b; }
      if (up.kind === 'fill') { o.q = up.q; o.answer = up.answer; o.unit = up.unit || ''; }
      if (up.kind === 'compare') { o.a = up.a; o.b = up.b; }
      if (up.kind === 'masu') { o.level = up.level === 3 ? 3 : 2; o.L = up.L | 0; o.d1 = up.d1 | 0; o.d2 = up.d2 | 0; o.d3 = o.level === 3 ? (up.d3 | 0) : 0; }
      if (up.kind === 'numberline') { o.min = up.min; o.max = up.max; o.step = up.step; o.labelEvery = up.labelEvery || 10; o.arrows = sortedArrows(up); } // あ・い・う は小さい順
      return o;
    }

    /* ===== 3. ためしに解く ===== */
    function viewTry(kind, editId) {
      clear();
      var up = finalUp(draft.up);
      var info = kindInfo(kind);
      var right = button('できあがり ▶', 'primary mk-bar-go', function () { viewDone(kind, editId); });
      el.appendChild(topbar('ためしに解く：' + info.label, '◀ なおす', function () { viewEdit(kind, editId); }, right));
      var main = h('main', 'mk mk-try');
      main.appendChild(h('p', 'mk-lead', '自分の問題を解いてみよう。まちがいを見つけたら「◀ なおす」で直せるよ。'));
      var card = h('section', 'mk-card mk-try-card');
      var area = h('div', 'mk-try-area');
      card.appendChild(area);
      main.appendChild(card);
      var foot = h('div', 'mk-try-foot');
      foot.appendChild(button('◀ なおす', '', function () { viewEdit(kind, editId); }));
      foot.appendChild(button('できあがり ▶', 'primary mk-go', function () { viewDone(kind, editId); }));
      main.appendChild(foot);
      el.appendChild(main);
      var sh = share();
      if (!sh || !sh.toProblem || !S.Problems) {
        area.appendChild(h('div', 'empty-note', 'ためしに解く画面は、いま使えません。「できあがり」に進んでね。'));
        return;
      }
      var handle = null;
      try {
        var p = sh.toProblem(up);
        handle = S.Problems.render(area, p, {
          onResult: function () {},
          onNext: function () { viewDone(kind, editId); }
        });
      } catch (e) {
        console.error('toProblem', e);
        area.appendChild(h('div', 'empty-note', 'この問題をひょうじできませんでした。「◀ なおす」でたしかめてね。'));
      }
      cleanups.push(function () { if (handle && handle.destroy) handle.destroy(); });
    }

    /* リンクを作る（encode） */
    function encodeUp(up) {
      var sh = share();
      if (!sh || !sh.encode) return Promise.reject(new Error('NO_SHARE'));
      try { return Promise.resolve(sh.encode(up)); } catch (e) { return Promise.reject(e); }
    }
    function urlOf(token) {
      var sh = share();
      if (sh && sh.url) return sh.url(token);
      return location.origin + location.pathname + '#/q/' + token;
    }
    function encodeErr(err, msgEl) {
      var m = String(err && (err.code || err.message) || err);
      console.warn('Share.encode', err);
      var t = /TOO_LONG/i.test(m) ? 'リンクが長すぎるよ。問題文やヒントを、もう少し短く書こう。' : 'リンクを作れませんでした。';
      if (msgEl) msgEl.textContent = t; else toast(t);
    }
    /* リンクをコピー。失敗したら textarea に出して全選択 */
    function copyLink(up, holder) {
      return encodeUp(up).then(function (token) {
        var url = urlOf(token);
        function fallback() {
          holder.innerHTML = '';
          holder.hidden = false;
          holder.appendChild(h('div', 'mk-linkbox-msg', 'うまくコピーできなかったよ。下のリンクがえらばれているので、Ctrl＋C でコピーしてね。'));
          var ta = h('textarea', 'mk-linkbox-ta');
          ta.value = url; ta.readOnly = true; ta.rows = 3;
          ta.addEventListener('focus', function () { ta.select(); });
          holder.appendChild(ta);
          setTimeout(function () { ta.focus(); ta.select(); }, 30);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(url).then(function () {
            toast('リンクをコピーしたよ。Teams や Classroom にはりつけてね。');
            holder.hidden = true;
            made(up, token);
          }, function () { fallback(); made(up, token); });
        }
        fallback();
        made(up, token);
      }, function (err) { encodeErr(err); });
    }
    // 問題を作った（ほぞん・リンクのコピー）。星は同じ token で1回だけ（担当Hの Stars が判定）
    function made(up, token) {
      starLog('made', { kind: up.kind, token: token });
    }
    // 自分の問題を「みんなに見せる」
    function showToAll(up) {
      return encodeUp(up).then(function (token) {
        starLog('present', { token: token });
        location.hash = '#/q/' + token;
      }, function (err) { encodeErr(err); });
    }

    /* ===== 4. できあがり ===== */
    function viewDone(kind, editId) {
      clear();
      var up = finalUp(draft.up);
      var info = kindInfo(kind);
      el.appendChild(topbar('できあがり！', '◀ ためしに解く', function () { viewTry(kind, editId); }));
      var main = h('main', 'mk mk-done');
      main.style.setProperty('--kc', info.color);
      var card = h('section', 'mk-card mk-done-card');
      card.appendChild(h('div', 'mk-done-title', '問題ができたね！'));
      var sum = h('div', 'mk-done-sum');
      sum.appendChild(h('span', 'mk-badge', info.label));
      sum.appendChild(h('span', 'mk-done-ans', '答え：' + answerText(up)));
      card.appendChild(sum);
      var who = h('div', 'mk-done-who');
      who.appendChild(h('span', 'mk-sub', '作った人'));
      var nameImg = h('span', 'mk-name-img');
      nameImg.appendChild(drawInk(up.author, { width: 260, height: 78, trim: true, lineWidth: 6 }));
      who.appendChild(nameImg);
      card.appendChild(who);

      var acts = h('div', 'mk-done-acts');
      var bShow = button('', 'mk-big-act act-show', function () { draft.shown = true; showToAll(up); });
      bShow.innerHTML = '<span class="mk-act-t">みんなに見せる</span><small>大きな画面に問題を出す</small>';
      var linkBox = h('div', 'mk-linkbox'); linkBox.hidden = true;
      var bCopy = button('', 'mk-big-act act-copy', function () { copyLink(up, linkBox); });
      bCopy.innerHTML = '<span class="mk-act-t">リンクをコピー</span><small>Teams・Classroom にはって送る</small>';
      var saved = h('div', 'mk-saved');
      var bSave = button('', 'mk-big-act act-save', function () {
        var st = store();
        if (!st || !st.mySave) { toast('この端末にはほぞんできません。'); return; }
        try {
          var id = st.mySave(up, editId || undefined);
          if (!id) { toast('ほぞんできませんでした。この端末の空きがないかもしれません。'); return; }
          editId = id;
          draft.editId = editId;
          encodeUp(up).then(function (token) { made(up, token); }, function () {});
          bSave.classList.add('done');
          bSave.querySelector('small').textContent = 'ほぞんしたよ！';
          saved.innerHTML = '';
          saved.appendChild(link('つくった問題の一覧を見る ▶', 'btn small', '#/my'));
          toast('ほぞんしたよ');
        } catch (e) {
          console.error('mySave', e);
          toast('ほぞんできませんでした');
        }
      });
      bSave.innerHTML = '<span class="mk-act-t">ほぞん</span><small>' + (editId ? 'なおした問題を上書きする' : 'この端末の「つくった問題」に入れる') + '</small>';
      acts.appendChild(bShow); acts.appendChild(bCopy); acts.appendChild(bSave);
      card.appendChild(acts);
      card.appendChild(linkBox);
      card.appendChild(saved);
      main.appendChild(card);
      var more = h('div', 'mk-done-more');
      more.appendChild(button('◀ もう一度なおす', '', function () { viewEdit(kind, editId); }));
      more.appendChild(button('べつの問題を作る', '', function () { draft = null; if (location.hash === '#/make') viewChoose(); else location.hash = '#/make'; }));
      main.appendChild(more);
      el.appendChild(main);
    }

    /* ===== 5. つくった問題 ===== */
    function viewMy() {
      clear();
      el.appendChild(topbar('つくった問題', '◀ ホーム', '#/', link('＋ 新しく作る', 'btn back', '#/make')));
      var main = h('main', 'mk mk-my');
      el.appendChild(main);
      var st = store();
      var list = [];
      try { list = st && st.myList ? st.myList() : []; } catch (e) { console.error(e); }
      if (!list.length) {
        var em = h('div', 'empty-note mk-empty');
        em.appendChild(h('div', null, 'まだないよ。問題を作って「ほぞん」すると、ここにならぶよ。'));
        em.appendChild(link('もんだいをつくる', 'btn primary', '#/make'));
        main.appendChild(em);
        return;
      }
      list = list.slice().sort(function (a, b) { return (b.updated || b.created || 0) - (a.updated || a.created || 0); });
      var ul = h('div', 'mk-list');
      list.forEach(function (it) {
        var up = it.up || {};
        var info = kindInfo(up.kind) || { label: '？', color: '#888' };
        var row = h('div', 'mk-row');
        row.style.setProperty('--kc', info.color);
        row.appendChild(h('span', 'mk-badge', info.label));
        var nm = h('span', 'mk-row-name');
        if (up.author) nm.appendChild(drawInk(up.author, { width: 150, height: 44, trim: true, lineWidth: 6 }));
        row.appendChild(nm);
        var mid = h('span', 'mk-row-mid');
        mid.appendChild(h('span', 'mk-row-ans', '答え：' + answerText(up)));
        mid.appendChild(h('span', 'mk-row-date', fmtDate(it.created) + ' に作った' + (it.updated && it.updated !== it.created ? '（' + fmtDate(it.updated) + ' になおした）' : '')));
        row.appendChild(mid);
        var acts = h('span', 'mk-row-acts');
        var lb = h('div', 'mk-linkbox mk-row-linkbox'); lb.hidden = true;
        acts.appendChild(button('みせる', 'small primary', function () { showToAll(up); }));
        acts.appendChild(button('リンク', 'small', function () { copyLink(up, lb); }));
        acts.appendChild(link('なおす', 'btn small', '#/edit/' + encodeURIComponent(it.id)));
        acts.appendChild(button('けす', 'small danger', function () {
          confirmDialog('この問題をけします。もとにもどせないよ。いいですか？', 'けす', function () {
            try { st.myDelete(it.id); } catch (e) { console.error(e); }
            if (draft && draft.editId === it.id) draft = null;
            toast('けしました');
            viewMy();
          });
        }));
        row.appendChild(acts);
        ul.appendChild(row);
        ul.appendChild(lb);
      });
      main.appendChild(ul);
    }

    /* ===== 6. なおす ===== */
    function viewEditSaved(id) {
      var st = store(), found = null;
      try { (st && st.myList ? st.myList() : []).forEach(function (it) { if (String(it.id) === String(id)) found = it; }); } catch (e) {}
      if (!found || !found.up || !kindInfo(found.up.kind)) {
        clear();
        el.appendChild(topbar('なおす', '◀ つくった問題', '#/my'));
        var m = h('main', 'mk');
        m.appendChild(h('div', 'empty-note', 'この問題は見つかりませんでした。'));
        el.appendChild(m);
        return;
      }
      if (!draft || draft.editId !== found.id) {
        var up = Object.assign(blankUp(found.up.kind), clone(found.up));
        if (up.kind === 'numberline') up.arrows = (up.arrows || []).map(String);
        draft = { up: up, editId: found.id };
      }
      if (draft.shown) { draft.shown = false; viewDone(found.up.kind, found.id); }
      else viewEdit(found.up.kind, found.id);
    }

    /* ルート */
    try {
      if (parts[0] === 'my') viewMy();
      else if (parts[0] === 'edit' && parts[1]) viewEditSaved(decodeURIComponent(parts[1]));
      else if (parts[0] === 'make' && parts[1] && kindInfo(parts[1])) {
        // 「みんなに見せる」からもどってきたときは、作りかけ（ほぞん後も）をそのまま開く
        if (draft && draft.up && draft.up.kind === parts[1]) {
          if (draft.shown) { draft.shown = false; viewDone(parts[1], draft.editId); }
          else viewEdit(parts[1], draft.editId);
        } else viewEdit(parts[1], null);
      }
      else {
        if (draft && draft.editId) draft = null; // ほぞんずみなら、えらぶ画面では作りかけにしない
        viewChoose();
      }
    } catch (e) {
      console.error('Maker', e);
      el.appendChild(h('div', 'empty-note', '画面を表示できませんでした。'));
    }

    return {
      destroy: function () {
        alive = false;
        clear();
        document.querySelectorAll('.mk-modal-back').forEach(function (m) { m.remove(); });
      }
    };
  }

  S.Maker = { mount: mount, kinds: KINDS.map(function (k) { return { id: k.id, label: k.label }; }), _answerText: answerText };
})(window.Shosu = window.Shosu || {});
