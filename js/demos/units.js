/* demos/units.js : 単位のかんさん表（km/m, kg/g, m/mm, L/mL） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;

  var KINDS = {
    km: { big: 'km', small: 'm', label: 'km と m', presets: [1425, 42195, 3050, 800] },
    kg: { big: 'kg', small: 'g', label: 'kg と g', presets: [1264, 875, 2005, 3400] },
    mm: { big: 'm', small: 'mm', label: 'm と mm', presets: [1435, 2600, 45] },
    L: { big: 'L', small: 'mL', label: 'L と mL', presets: [1500, 2350, 80] }
  };
  var PLACES = [1, 0, -1, -2, -3];

  D.register('units', {
    title: '単位のかんさん',
    mount: function (el, opts) {
      var kind = KINDS[opts.kind] ? opts.kind : 'km';
      var val = opts.value || KINDS[kind].presets[0];

      var seg = ui.segmented(Object.keys(KINDS).map(function (k) { return { value: k, label: KINDS[k].label }; }), kind, function (k) {
        kind = k; val = KINDS[k].presets[0]; render();
      });
      var presetRow = h('div', { 'class': 'sd-row' });
      var tableBox = h('div', { 'class': 'sd-units-table' });
      var eq = h('div', { 'class': 'sd-units-eq', 'aria-live': 'polite' });
      var note = h('div', { 'class': 'sd-msg' });

      el.appendChild(h('div', { 'class': 'sd-lead' }, '位取り表にならべると、小さい単位の数を 大きい単位の小数で表せるよ。'));
      el.appendChild(seg.el);
      el.appendChild(presetRow);
      el.appendChild(tableBox);
      el.appendChild(eq);
      el.appendChild(note);

      function render() {
        var K = KINDS[kind];
        presetRow.innerHTML = '';
        K.presets.forEach(function (p) {
          var b = ui.button(p + K.small, function () { val = p; render(); }, { cls: 'sd-chip' + (p === val ? ' on' : '') });
          presetRow.appendChild(b);
        });
        presetRow.appendChild(ui.button('じぶんで入れる', function () {
          ui.askNumber({
            title: '何' + K.small + 'かな？', label: K.small, value: '', allowDot: false, maxLen: 5,
            validate: function (v) { return (+v < 1 || +v > 99999) ? '1から99999までの数にしてね' : null; },
            onOK: function (v) { val = +v; render(); }
          });
        }, { kind: 'main' }));

        // 表
        var str = String(val);
        var digits = {}; // place -> digit
        for (var i = 0; i < str.length; i++) digits[str.length - 1 - i - 3] = str.charAt(i);
        var top = 0; PLACES.forEach(function (p) { if (digits[p] && digits[p] !== '0' && p > top) top = p; });
        var t = h('table', { 'class': 'sd-table sd-ptable' });
        var r1 = h('tr', null, h('th', { 'class': 'sd-rowhead' }, ''));
        var r2 = h('tr', null, h('th', { 'class': 'sd-rowhead' }, K.big));
        var r3 = h('tr', null, h('th', { 'class': 'sd-rowhead' }, K.small));
        var r4 = h('tr', null, h('th', { 'class': 'sd-rowhead' }, ''));
        PLACES.forEach(function (p) {
          var bg = { background: ui.placeColor(p) };
          r1.appendChild(h('th', { style: bg }, ui.placeNameEl(p)));
          r2.appendChild(h('td', { style: bg, 'class': 'sd-unitcell' }, num.fromInt(Math.pow(10, p + 3), 3) + K.big));
          r3.appendChild(h('td', { style: bg, 'class': 'sd-unitcell' }, Math.pow(10, p + 3) + K.small));
          var d = digits[p];
          var show = p <= top || (d && d !== '0');
          var cell = h('td', { 'class': 'sd-digitcell' + (p === 0 ? ' sd-dot-after' : '') });
          if (show) {
            var dd = d || '0';
            var trailing = p < 0 && val % Math.pow(10, p + 4) === 0;
            cell.appendChild(h('span', { 'class': trailing && dd === '0' ? 'sd-faint' : '' }, dd));
          }
          r4.appendChild(cell);
        });
        t.appendChild(r1); t.appendChild(r2); t.appendChild(r3); t.appendChild(r4);
        tableBox.innerHTML = '';
        tableBox.appendChild(t);

        var big = Math.floor(val / 1000), small = val % 1000;
        var dec = num.fromInt(val, 3);
        eq.innerHTML = '';
        eq.appendChild(h('span', null, val + K.small));
        eq.appendChild(h('span', { 'class': 'sd-eqop' }, '＝'));
        eq.appendChild(h('span', null, (big ? big + K.big : '') + (small || !big ? small + K.small : '')));
        eq.appendChild(h('span', { 'class': 'sd-eqop' }, '＝'));
        eq.appendChild(h('b', { 'class': 'sd-big' }, dec + K.big));
        note.innerHTML = '';
        note.appendChild(h('div', null, '1' + K.big + ' ＝ 1000' + K.small + ' だから、'));
        note.appendChild(h('div', null, '100' + K.small + ' ＝ 0.1' + K.big + '、 10' + K.small + ' ＝ 0.01' + K.big + '、 1' + K.small + ' ＝ 0.001' + K.big));
        if (/0$/.test(num.fromInt(val, 3, true))) {
          note.appendChild(h('div', null, '小数の終わりの0は書かなくてよいよ。（' + num.fromInt(val, 3, true) + ' → ' + dec + '）'));
        }
      }
      render();
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
