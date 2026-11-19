/* demos/shift.js : 10倍・1/10マシン（位取り表の数字が左右の位へ動く） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util;
  var PL = [3, 2, 1, 0, -1, -2, -3];
  var NC = PL.length;

  function colOf(p) { return 3 - p; }
  function leftPct(p) { return (colOf(p) * 100 / NC) + '%'; }

  D.register('shift', {
    title: '10倍・1/10マシン',
    mount: function (el, opts) {
      var start = opts.number || '0.58';
      var cur = start;
      var items = []; // {d, p, el}
      var fillers = [];
      var timers = [];
      var busy = false;

      var board = h('div', { 'class': 'sd-shift-board' });
      var head = h('div', { 'class': 'sd-shift-head' });
      PL.forEach(function (p) { head.appendChild(h('div', { 'class': 'sd-shift-th', style: { background: ui.placeColor(p) } }, ui.placeNameEl(p))); });
      var arrowBox = h('div', { 'class': 'sd-shift-arrows' });
      var row = h('div', { 'class': 'sd-shift-row' });
      PL.forEach(function (p) { row.appendChild(h('div', { 'class': 'sd-shift-td', style: { left: leftPct(p), width: (100 / NC) + '%' } })); });
      var dot = h('div', { 'class': 'sd-shift-dot', style: { left: leftPct(-1) } });
      row.appendChild(dot);
      board.appendChild(head);
      board.appendChild(arrowBox);
      board.appendChild(row);

      var exprEl = h('div', { 'class': 'sd-shift-expr', 'aria-live': 'polite' });
      var msg = h('div', { 'class': 'sd-msg' });
      var opBtns = h('div', { 'class': 'sd-row sd-center' }, [
        ui.button('10倍', function () { op(1); }, { kind: 'main', cls: 'sd-btn-big' }),
        ui.button('100倍', function () { op(2); }, { kind: 'main', cls: 'sd-btn-big' }),
        ui.button('1000倍', function () { op(3); }, { kind: 'main', cls: 'sd-btn-big' }),
        ui.button(h('span', null, [ui.fracEl(1, 10)]), function () { op(-1); }, { kind: 'warm', cls: 'sd-btn-big', aria: '10分の1' }),
        ui.button(h('span', null, [ui.fracEl(1, 100)]), function () { op(-2); }, { kind: 'warm', cls: 'sd-btn-big', aria: '100分の1' })
      ]);
      var numRow = h('div', { 'class': 'sd-row sd-center' }, ['0.58', '3.92', '0.74', '1.58', '26.95'].map(function (n) {
        return ui.button(n, function () { setNum(n); }, { cls: 'sd-chip' });
      }).concat([
        ui.button('じぶんで入れる', function () {
          ui.askNumber({
            title: '数を入れよう', value: '', maxLen: 7,
            validate: function (v) {
              if (num.scale(v) > 3) return '小数第三位までにしてね';
              if (+v >= 10000) return '10000より小さい数にしてね';
              if (+v === 0) return '0より大きい数にしてね';
              return null;
            },
            onOK: function (v) { setNum(num.trim(v)); }
          });
        }, { kind: 'sub' }),
        ui.button('もとにもどす', function () { setNum(start); }, { kind: 'sub' })
      ]));

      el.appendChild(h('div', { 'class': 'sd-lead' }, '10倍、100倍、1/10 にすると、数字は位取り表の上で どう動くかな？'));
      el.appendChild(numRow);
      el.appendChild(board);
      el.appendChild(exprEl);
      el.appendChild(opBtns);
      el.appendChild(msg);

      function later(fn, ms) { timers.push(setTimeout(fn, ms)); }

      function parse(str) {
        var sc = num.scale(str), n = String(num.toInt(str, sc));
        var out = [];
        for (var i = 0; i < n.length; i++) out.push({ d: n.charAt(i), p: n.length - 1 - i - sc });
        // 先頭と末尾の0（の位置）はつめる
        while (out.length > 1 && out[0].d === '0') out.shift();
        while (out.length > 1 && out[out.length - 1].d === '0' && out[out.length - 1].p < 0) out.pop();
        return out;
      }
      function digitEl(d, p, filler) {
        var e = h('div', { 'class': 'sd-shift-digit' + (filler ? ' sd-filler' : ''), style: { left: leftPct(p), width: (100 / NC) + '%' } }, d);
        return e;
      }
      function placeFillers(anim) {
        fillers.forEach(function (f) { if (f.parentNode) f.parentNode.removeChild(f); });
        fillers = [];
        var hi = items[0].p, lo = items[items.length - 1].p, p;
        var add = [];
        if (hi < 0) for (p = 0; p > hi; p--) add.push(p);
        if (lo > 0) for (p = lo - 1; p >= 0; p--) add.push(p);
        add.forEach(function (pp) {
          var f = digitEl('0', pp, true);
          if (anim) f.classList.add('sd-fadein');
          row.appendChild(f); fillers.push(f);
        });
        dot.style.visibility = lo < 0 ? 'visible' : 'hidden';
      }
      function setNum(n) {
        timers.forEach(clearTimeout); timers = []; busy = false;
        cur = n; start = start || n;
        items.forEach(function (it) { if (it.el.parentNode) it.el.parentNode.removeChild(it.el); });
        items = parse(n).map(function (it) { it.el = digitEl(it.d, it.p); row.appendChild(it.el); return it; });
        placeFillers(false);
        arrowBox.innerHTML = '';
        exprEl.innerHTML = '';
        exprEl.appendChild(h('span', { 'class': 'sd-big' }, n));
        msg.textContent = 'ボタンをおして、数字の動きを見よう。';
      }
      function op(k) {
        if (busy) return;
        var hi = items[0].p, lo = items[items.length - 1].p;
        if (hi + k > 3 || lo + k < -3) { msg.textContent = '表からはみ出してしまうよ。ほかのボタンをためそう。'; return; }
        busy = true;
        var before = cur;
        var after = num.shift(cur, k);
        // 矢印
        var svg = F.s('svg', { viewBox: '0 0 700 70', 'class': 'sd-shift-svg', preserveAspectRatio: 'none' });
        var color = k > 0 ? '#e8590c' : '#1971c2';
        items.forEach(function (it) {
          var x1 = colOf(it.p) * 100 + 50, x2 = colOf(it.p + k) * 100 + 50;
          var dy = 14 + Math.abs(k) * 14;
          svg.appendChild(F.s('path', { d: 'M' + x1 + ' 66 Q' + ((x1 + x2) / 2) + ' ' + (66 - dy * 2) + ' ' + x2 + ' 66', fill: 'none', stroke: color, 'stroke-width': 3, 'class': 'sd-shift-arc', 'vector-effect': 'non-scaling-stroke' }));
          svg.appendChild(F.s('circle', { cx: x2, cy: 64, r: 5, fill: color }));
        });
        arrowBox.innerHTML = '';
        arrowBox.appendChild(svg);
        fillers.forEach(function (f) { f.classList.add('sd-fadeout'); });
        items.forEach(function (it) { it.p += k; it.el.style.left = leftPct(it.p); it.el.classList.add('sd-moving'); });
        dot.classList.add('sd-dot-pulse');
        var label = k > 0 ? Math.pow(10, k) + '倍' : null;
        exprEl.innerHTML = '';
        if (k > 0) exprEl.appendChild(h('span', null, [before + ' を ' + label + ' すると ']));
        else exprEl.appendChild(h('span', null, [before + ' の ', ui.fracEl(1, Math.pow(10, -k)), ' は ']));
        var res = h('b', { 'class': 'sd-big sd-hidden' }, after);
        exprEl.appendChild(res);
        msg.innerHTML = '';
        later(function () {
          items.forEach(function (it) { it.el.classList.remove('sd-moving'); });
          dot.classList.remove('sd-dot-pulse');
          placeFillers(true);
          res.classList.remove('sd-hidden');
          var n = Math.abs(k), word = n === 1 ? '1つ' : n === 2 ? '2つ' : '3つ';
          msg.appendChild(h('div', null, k > 0
            ? ['どの数字も 位が ', h('b', null, word + '上がる'), '。小数点は ' + (n === 1 ? '右へ1けた' : '右へ' + n + 'けた') + ' うつったように見えるね。']
            : ['どの数字も 位が ', h('b', null, word + '下がる'), '。小数点は 左へ' + n + 'けた うつったように見えるね。']));
          cur = after;
          busy = false;
        }, 950);
      }
      setNum(start);
      return { destroy: function () { timers.forEach(clearTimeout); } };
    }
  });
})(window.Shosu = window.Shosu || {});
