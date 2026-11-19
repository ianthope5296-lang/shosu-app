/* demos/laws.js : 計算のきまり（交換のきまり・結合のきまり） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var SHAPES = [
    { key: 'sq', ch: '□', name: '□', color: '#ffd8a8' },
    { key: 'tr', ch: '△', name: '△', color: '#b2f2bb' },
    { key: 'ci', ch: '○', name: '○', color: '#a5d8ff' }
  ];

  D.register('laws', {
    title: '計算のきまり',
    mount: function (el, opts) {
      var vals = (opts.values || ['3.7', '6.4', '3.6']).slice();
      var shown = { k: false, a: false };

      var slots = h('div', { 'class': 'sd-row sd-center sd-laws-slots' });
      var lawK = h('div', { 'class': 'sd-law' });
      var lawA = h('div', { 'class': 'sd-law' });
      var tip = h('div', { 'class': 'sd-msg', 'aria-live': 'polite' });
      var presets = h('div', { 'class': 'sd-row sd-center' }, [['3.7', '6.4', '3.6'], ['3.48', '0.75', '1.25'], ['8.62', '2.5', '1.38'], ['1.6', '2.7', '0.4']].map(function (p) {
        return ui.button(p.join(', '), function () { vals = p.slice(); shown = { k: false, a: false }; render(); }, { cls: 'sd-chip' });
      }));

      el.appendChild(h('div', { 'class': 'sd-lead' }, '□、△、○ に数を入れて、きまりが小数でも なりたつか たしかめよう。'));
      el.appendChild(slots);
      el.appendChild(presets);
      el.appendChild(lawK);
      el.appendChild(lawA);
      el.appendChild(tip);

      function chip(i, v) {
        var sh = SHAPES[i];
        return h('span', { 'class': 'sd-shape sd-shape-' + sh.key, style: { background: sh.color } }, v == null ? sh.ch : v);
      }
      function sum(a, b) { return num.add(a, b); }

      function render() {
        slots.innerHTML = '';
        SHAPES.forEach(function (sh, i) {
          slots.appendChild(ui.button(h('span', { 'class': 'sd-slot-inner' }, [chip(i), h('span', { 'class': 'sd-slot-eq' }, '＝'), h('b', null, vals[i])]), function () {
            ui.askNumber({
              title: sh.ch + ' に入れる数', value: vals[i], maxLen: 6,
              validate: function (v) { if (num.scale(v) > 3) return '小数第三位までにしてね'; if (+v >= 1000) return '1000より小さい数にしてね'; return null; },
              onOK: function (v) { vals[i] = num.trim(v); shown = { k: false, a: false }; render(); }
            });
          }, { cls: 'sd-slot', aria: sh.ch + 'の数をかえる' }));
        });

        var a = vals[0], b = vals[1], c = vals[2];
        // 交換のきまり
        lawK.innerHTML = '';
        lawK.appendChild(h('div', { 'class': 'sd-law-title' }, ['交換のきまり　', chip(0), ' ＋ ', chip(1), ' ＝ ', chip(1), ' ＋ ', chip(0)]));
        var kl = sum(a, b), kr = sum(b, a);
        var kBody = h('div', { 'class': 'sd-law-body' }, [
          h('div', { 'class': 'sd-law-side' }, [chip(0, a), ' ＋ ', chip(1, b), ' ＝ ', shown.k ? h('b', { 'class': 'sd-pop' }, kl) : '?']),
          h('div', { 'class': 'sd-law-side' }, [chip(1, b), ' ＋ ', chip(0, a), ' ＝ ', shown.k ? h('b', { 'class': 'sd-pop' }, kr) : '?']),
          shown.k ? h('div', { 'class': 'sd-law-ok sd-pop' }, num.cmp(kl, kr) === 0 ? '同じ！' : 'ちがう') : ui.button('計算する', function () { shown.k = true; render(); }, { kind: 'main' })
        ]);
        lawK.appendChild(kBody);

        // 結合のきまり
        lawA.innerHTML = '';
        lawA.appendChild(h('div', { 'class': 'sd-law-title' }, ['結合のきまり　(', chip(0), ' ＋ ', chip(1), ') ＋ ', chip(2), ' ＝ ', chip(0), ' ＋ (', chip(1), ' ＋ ', chip(2), ')']));
        var ab = sum(a, b), bc = sum(b, c), l = sum(ab, c), r = sum(a, bc);
        var aBody = h('div', { 'class': 'sd-law-body' }, [
          h('div', { 'class': 'sd-law-side' }, ['(', chip(0, a), ' ＋ ', chip(1, b), ') ＋ ', chip(2, c), ' ＝ ', shown.a ? h('span', { 'class': 'sd-pop' }, [h('span', { 'class': 'sd-paren' }, ab), ' ＋ ' + c + ' ＝ ', h('b', null, l)]) : '?']),
          h('div', { 'class': 'sd-law-side' }, [chip(0, a), ' ＋ (', chip(1, b), ' ＋ ', chip(2, c), ') ＝ ', shown.a ? h('span', { 'class': 'sd-pop' }, [a + ' ＋ ', h('span', { 'class': 'sd-paren' }, bc), ' ＝ ', h('b', null, r)]) : '?']),
          shown.a ? h('div', { 'class': 'sd-law-ok sd-pop' }, num.cmp(l, r) === 0 ? '同じ！' : 'ちがう') : ui.button('計算する', function () { shown.a = true; render(); }, { kind: 'main' })
        ]);
        lawA.appendChild(aBody);

        tip.innerHTML = '';
        tip.appendChild(h('div', null, 'たし算では、たす順番をかえても、どこを先に計算しても、答えは同じになるよ。'));
        var easy = [];
        if (num.scale(bc) === 0) easy.push([1, 2, bc]);
        if (num.scale(ab) === 0) easy.push([0, 1, ab]);
        var ac = sum(a, c);
        if (num.scale(ac) === 0) easy.push([0, 2, ac]);
        if (easy.length && (shown.a || shown.k)) {
          var e = easy[0];
          tip.appendChild(h('div', null, ['くふう：', chip(e[0], vals[e[0]]), ' ＋ ', chip(e[1], vals[e[1]]), ' ＝ ' + e[2] + ' のように、整数になる組を先に計算すると かんたん！']));
        }
      }
      render();
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
