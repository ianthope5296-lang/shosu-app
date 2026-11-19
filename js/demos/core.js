/* demos/core.js : 「みる」教材の登録・表示と、共通のUI部品
 * Shosu.Demos.register(id, {title, mount(el, opts) -> {destroy()}})
 * Shosu.Demos.mount(el, id, opts) -> {destroy()}
 * Shosu.Demos.list() -> [{id, title}]
 * Shosu.Demos.ui   : h, button, stepper, keypad, askNumbers, askNumber, segmented
 * Shosu.Demos.num  : 小数を整数で安全にあつかう道具
 */
(function (S) {
  'use strict';
  var registry = {}, order = [];

  /* ---------- 小数の道具（浮動小数の誤差を出さない） ---------- */
  var num = {
    /* 小数部分のけた数 */
    scale: function (str) {
      str = String(str); var i = str.indexOf('.');
      return i < 0 ? 0 : str.length - i - 1;
    },
    /* '4.05' を 10^sc 倍した整数に（sc 省略時は自分のけた数） */
    toInt: function (str, sc) {
      str = String(str).trim();
      if (sc == null) sc = num.scale(str);
      var neg = str.charAt(0) === '-'; if (neg) str = str.slice(1);
      var i = str.indexOf('.');
      var ip = i < 0 ? str : str.slice(0, i), dp = i < 0 ? '' : str.slice(i + 1);
      while (dp.length < sc) dp += '0';
      dp = dp.slice(0, sc);
      var v = parseInt((ip || '0') + dp, 10) || 0;
      return neg ? -v : v;
    },
    /* 整数 n / 10^sc を文字列に。keepZeros で末尾の0を残す */
    fromInt: function (n, sc, keepZeros) {
      var neg = n < 0; n = Math.abs(Math.round(n));
      var str = String(n);
      if (sc > 0) {
        while (str.length <= sc) str = '0' + str;
        str = str.slice(0, str.length - sc) + '.' + str.slice(str.length - sc);
        if (!keepZeros) str = str.replace(/0+$/, '').replace(/\.$/, '');
      }
      return (neg ? '-' : '') + str;
    },
    trim: function (str) { return num.fromInt(num.toInt(str), num.scale(str)); },
    add: function (a, b) {
      var sc = Math.max(num.scale(a), num.scale(b));
      return num.fromInt(num.toInt(a, sc) + num.toInt(b, sc), sc);
    },
    sub: function (a, b) {
      var sc = Math.max(num.scale(a), num.scale(b));
      return num.fromInt(num.toInt(a, sc) - num.toInt(b, sc), sc);
    },
    cmp: function (a, b) {
      var sc = Math.max(num.scale(a), num.scale(b));
      var x = num.toInt(a, sc), y = num.toInt(b, sc);
      return x < y ? -1 : x > y ? 1 : 0;
    },
    /* 10^k 倍（k は負でもよい） */
    shift: function (str, k) {
      var sc = num.scale(str), n = num.toInt(str, sc);
      sc -= k;
      if (sc < 0) { n = n * Math.pow(10, -sc); sc = 0; }
      return num.fromInt(n, sc);
    },
    valid: function (str) { return /^\d+(\.\d+)?$/.test(String(str)); },
    /* 読み方：1.26 -> 一点二六 */
    read: function (str) {
      var K = ['れい', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
      str = String(str);
      var i = str.indexOf('.');
      var ip = i < 0 ? str : str.slice(0, i), dp = i < 0 ? '' : str.slice(i + 1);
      var n = parseInt(ip, 10) || 0, out = '';
      if (n === 0) out = 'れい';
      else {
        var units = [[1000, '千'], [100, '百'], [10, '十']];
        units.forEach(function (u) {
          var d = Math.floor(n / u[0]) % 10;
          if (d) out += (d === 1 ? '' : K[d]) + u[1];
        });
        if (n % 10) out += K[n % 10];
        if (n >= 10000) out = String(n);
      }
      if (dp) {
        out += '点';
        for (var j = 0; j < dp.length; j++) out += K[+dp.charAt(j)];
      }
      return out;
    }
  };

  /* ---------- DOM の道具 ---------- */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') for (var sk in v) e.style[sk] = v[sk];
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    if (kids != null) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }

  function button(label, onClick, opts) {
    opts = opts || {};
    var b = h('button', { type: 'button', 'class': 'sd-btn' + (opts.kind ? ' sd-btn-' + opts.kind : '') + (opts.cls ? ' ' + opts.cls : ''), title: opts.title, 'aria-label': opts.aria });
    if (label instanceof Node) b.appendChild(label); else b.textContent = label;
    b.addEventListener('click', function (ev) { if (!b.disabled && onClick) onClick(ev); });
    return b;
  }

  /* ＋/− つきの数 */
  function stepper(o) {
    var val = o.value || 0;
    var minus = button('−', function () { set(val - (o.step || 1), true); }, { kind: 'round', aria: 'へらす' });
    var plus = button('＋', function () { set(val + (o.step || 1), true); }, { kind: 'round', aria: 'ふやす' });
    var disp = h('span', { 'class': 'sd-stepper-val' });
    var el = h('span', { 'class': 'sd-stepper' + (o.vertical ? ' sd-stepper-v' : '') }, o.vertical ? [plus, disp, minus] : [minus, disp, plus]);
    if (o.color) disp.style.background = o.color;
    function render() {
      disp.textContent = o.format ? o.format(val) : String(val);
      minus.disabled = !o.allowUnder && o.min != null && val <= o.min;
      plus.disabled = !o.allowOver && o.max != null && val >= o.max;
    }
    function set(v, user) {
      if (user && o.onTry) { var r = o.onTry(v, val); if (r === false) return; if (typeof r === 'number') v = r; }
      if (o.min != null && v < o.min) v = o.min;
      if (o.max != null && v > o.max) v = o.max;
      val = v; render();
      if (user && o.onChange) o.onChange(val);
    }
    render();
    return { el: el, get: function () { return val; }, set: function (v) { set(v, false); } };
  }

  /* 数字キーパッド */
  function keypad(o) {
    o = o || {};
    var keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '.', '←'];
    var el = h('div', { 'class': 'sd-keypad' });
    keys.forEach(function (k) {
      var b = button(k === '←' ? '⌫' : k, function () { if (o.onKey) o.onKey(k); }, { cls: 'sd-key', aria: k === '←' ? '1文字けす' : k });
      if (k === '.' && o.allowDot === false) b.disabled = true;
      el.appendChild(b);
    });
    return el;
  }

  /* キーパッドつきの入力ダイアログ（いくつかの欄） */
  function askNumbers(o) {
    var fields = o.fields.map(function (f) { return { label: f.label, value: String(f.value == null ? '' : f.value), fresh: true }; });
    var cur = 0;
    var maxLen = o.maxLen || 7;
    var back = h('div', { 'class': 'sd-modal-back' });
    var msg = h('div', { 'class': 'sd-modal-msg' });
    var fieldEls = fields.map(function (f, i) {
      var v = h('span', { 'class': 'sd-field-val' });
      var e = h('button', { type: 'button', 'class': 'sd-field' }, [f.label ? h('span', { 'class': 'sd-field-label' }, f.label) : null, v]);
      e.addEventListener('click', function () { cur = i; render(); });
      return { el: e, v: v };
    });
    function render() {
      fieldEls.forEach(function (fe, i) {
        fe.v.textContent = fields[i].value || ' ';
        fe.el.classList.toggle('on', i === cur);
      });
    }
    function onKey(k) {
      var f = fields[cur];
      if (f.fresh) { f.fresh = false; if (k !== '←') f.value = ''; }
      msg.textContent = '';
      if (k === '←') f.value = f.value.slice(0, -1);
      else if (k === '.') { if (f.value.indexOf('.') < 0 && o.allowDot !== false) f.value = (f.value || '0') + '.'; }
      else if (f.value.length < maxLen) f.value = (f.value === '0' ? '' : f.value) + k;
      render();
    }
    function close() { document.removeEventListener('keydown', onDoc); if (back.parentNode) back.parentNode.removeChild(back); }
    function ok() {
      var vals = fields.map(function (f) { return f.value.replace(/\.$/, ''); });
      for (var i = 0; i < vals.length; i++) if (!num.valid(vals[i])) { cur = i; render(); msg.textContent = '数を入れてね'; return; }
      if (o.validate) { var err = o.validate(vals); if (err) { msg.textContent = err; return; } }
      close();
      if (o.onOK) o.onOK(vals);
    }
    function onDoc(ev) {
      if (/^[0-9.]$/.test(ev.key)) onKey(ev.key);
      else if (ev.key === 'Backspace') onKey('←');
      else if (ev.key === 'Enter') ok();
      else if (ev.key === 'Escape') close();
      else if (ev.key === 'Tab') { cur = (cur + 1) % fields.length; render(); ev.preventDefault(); }
    }
    document.addEventListener('keydown', onDoc);
    var box = h('div', { 'class': 'sd-modal', role: 'dialog' }, [
      h('div', { 'class': 'sd-modal-title' }, o.title || '数を入れよう'),
      h('div', { 'class': 'sd-fields' }, fieldEls.map(function (f) { return f.el; })),
      msg,
      keypad({ onKey: onKey, allowDot: o.allowDot }),
      h('div', { 'class': 'sd-row sd-modal-btns' }, [
        button('やめる', close, { kind: 'sub' }),
        button('けってい', ok, { kind: 'main' })
      ])
    ]);
    back.appendChild(box);
    back.addEventListener('click', function (ev) { if (ev.target === back) close(); });
    document.body.appendChild(back);
    render();
    return { close: close };
  }
  function askNumber(o) {
    return askNumbers({
      title: o.title, maxLen: o.maxLen, allowDot: o.allowDot,
      fields: [{ label: o.label, value: o.value }],
      validate: o.validate ? function (v) { return o.validate(v[0]); } : null,
      onOK: function (v) { if (o.onOK) o.onOK(v[0]); }
    });
  }

  /* えらぶボタンの列 */
  function segmented(options, value, onChange) {
    var el = h('div', { 'class': 'sd-seg', role: 'tablist' });
    var btns = options.map(function (op) {
      var b = button(op.label, function () { set(op.value, true); }, { cls: 'sd-seg-btn' });
      el.appendChild(b);
      return b;
    });
    function set(v, user) {
      value = v;
      btns.forEach(function (b, i) { b.classList.toggle('on', options[i].value === v); b.setAttribute('aria-selected', options[i].value === v); });
      if (user && onChange) onChange(v);
    }
    set(value, false);
    return { el: el, set: function (v) { set(v, false); }, get: function () { return value; } };
  }

  /* 位の名前（HTML） 例: p=-1 -> 1/10の位 */
  function placeNameEl(p, withSub) {
    var K = { '3': '千', '2': '百', '1': '十', '0': '一' };
    if (p >= 0) return h('span', { 'class': 'sd-pname' }, K[p] + 'の位');
    var sub = { '-1': '小数第一位', '-2': '小数第二位', '-3': '小数第三位' }[p];
    return h('span', { 'class': 'sd-pname' }, [
      h('span', { 'class': 'sd-frac' }, [h('span', null, '1'), h('span', null, String(Math.pow(10, -p)))]),
      'の位',
      withSub ? h('small', { 'class': 'sd-pname-sub' }, sub) : null
    ]);
  }
  function fracEl(a, b) { return h('span', { 'class': 'sd-frac' }, [h('span', null, String(a)), h('span', null, String(b))]); }
  function placeColor(p) { return S.Figures ? S.Figures.util.placeColor(p) : '#eee'; }

  function register(id, def) {
    if (!registry[id]) order.push(id);
    registry[id] = def;
  }
  function mount(el, id, opts) {
    var def = registry[id];
    el.innerHTML = '';
    if (!def) {
      el.appendChild(h('div', { 'class': 'sd-missing' }, '教材「' + id + '」がみつかりません'));
      return { destroy: function () { el.innerHTML = ''; } };
    }
    var wrap = h('div', { 'class': 'sd-demo sd-demo-' + id });
    el.appendChild(wrap);
    var inst;
    try {
      inst = def.mount(wrap, opts || {}) || {};
    } catch (e) {
      if (window.console) console.error('Demos.mount', id, e);
      wrap.appendChild(h('div', { 'class': 'sd-missing' }, '教材を表示できませんでした'));
      inst = {};
    }
    return {
      destroy: function () {
        try { if (inst.destroy) inst.destroy(); } catch (e) { /* ignore */ }
        document.querySelectorAll('.sd-modal-back').forEach(function (m) { m.parentNode.removeChild(m); });
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }
  function list() { return order.map(function (id) { return { id: id, title: registry[id].title }; }); }

  S.Demos = {
    register: register, mount: mount, list: list, num: num,
    ui: {
      h: h, button: button, stepper: stepper, keypad: keypad, askNumbers: askNumbers, askNumber: askNumber,
      segmented: segmented, placeNameEl: placeNameEl, fracEl: fracEl, placeColor: placeColor
    }
  };
})(window.Shosu = window.Shosu || {});
