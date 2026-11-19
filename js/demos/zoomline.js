/* demos/zoomline.js : 数直線ズーム（0〜3m のテープを 0.1m の区間に拡大） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util, s = F.s, txt = F.txt;

  D.register('zoomline', {
    title: '数直線ズーム',
    mount: function (el, opts) {
      var maxM = opts.max || 3;
      var v = opts.value != null ? Math.round(opts.value * 100) : 283; // cm（0.01m 単位）
      var zoomed = false;

      var figBox = h('div', { 'class': 'sd-figbox' });
      var info = h('div', { 'class': 'sd-msg', 'aria-live': 'polite' });
      var valEl = h('div', { 'class': 'sd-zoom-val' });
      var slider = h('input', { type: 'range', min: 1, max: maxM * 100 - 1, step: 1, value: v, 'class': 'sd-range', 'aria-label': '長さ' });
      slider.addEventListener('input', function () { v = +slider.value; render(false); });
      function nudge(d) { return function () { v = Math.max(1, Math.min(maxM * 100 - 1, v + d)); slider.value = v; render(false); }; }
      var zoomBtn = ui.button('ズーム', function () { zoomed = !zoomed; render(true); }, { kind: 'main', cls: 'sd-btn-big' });

      el.appendChild(h('div', { 'class': 'sd-lead' }, 'テープの長さは何mかな？ 0.1mより短いはしたを、ズームして調べよう。'));
      el.appendChild(figBox);
      el.appendChild(h('div', { 'class': 'sd-row sd-center' }, [
        zoomBtn,
        ui.button('−0.1m', nudge(-10), { kind: 'sub' }),
        ui.button('−0.01m', nudge(-1), { kind: 'sub' }),
        valEl,
        ui.button('＋0.01m', nudge(1), { kind: 'sub' }),
        ui.button('＋0.1m', nudge(10), { kind: 'sub' }),
        slider
      ]));
      el.appendChild(info);

      function render(anim) {
        var W = 1000, x0 = 60, x1 = 920, L = x1 - x0;
        var per = L / (maxM * 10); // 0.1m の幅
        var a = Math.floor(v / 10) * 10; // 区間の左（cm）
        var svg = F.root(W, zoomed ? 400 : 190, 'sd-zoom-svg', 0.9);
        var X = function (cm) { return x0 + cm / 10 * per; };
        // 上のテープ
        var ty = 70, th = 40;
        svg.appendChild(s('rect', { x: x0, y: ty, width: L, height: th, fill: '#fff', stroke: '#333', 'stroke-width': 2 }));
        svg.appendChild(s('rect', { x: x0, y: ty, width: X(v) - x0, height: th, fill: '#ffc9a8', stroke: '#333', 'stroke-width': 2 }));
        for (var i = 0; i <= maxM * 10; i++) {
          var x = x0 + i * per, maj = i % 10 === 0, mid = i % 5 === 0;
          svg.appendChild(s('line', { x1: x, y1: ty + th, x2: x, y2: ty + th + (maj ? 18 : mid ? 12 : 8), stroke: '#333', 'stroke-width': maj ? 2.2 : 1.3 }));
          if (maj) svg.appendChild(txt(x, ty + th + 42, String(i / 10), { 'font-size': 24 }));
        }
        svg.appendChild(txt(x1 + 34, ty + th + 42, 'm', { 'font-size': 24 }));
        // 1m を10等分のしるし
        svg.appendChild(s('path', { d: 'M' + x0 + ' ' + (ty - 8) + ' q' + (per / 2) + ' -18 ' + per + ' 0', fill: 'none', stroke: '#1971c2', 'stroke-width': 2 }));
        svg.appendChild(txt(x0 + per / 2, ty - 26, '0.1m', { 'font-size': 18, fill: '#1971c2' }));
        // 区間のハイライト
        svg.appendChild(s('rect', { x: X(a), y: ty - 6, width: per, height: th + 12, fill: 'none', stroke: '#f08c00', 'stroke-width': 4, rx: 3 }));
        if (!zoomed) {
          svg.appendChild(txt(X(v), ty - 12, '?', { 'font-size': 26, 'font-weight': 'bold', fill: '#d9480f' }));
        }
        if (zoomed) {
          var g = s('g', { 'class': anim ? 'sd-zoom-in' : '' });
          var zy = 300, zx0 = 100, zx1 = 900, zl = zx1 - zx0, zp = zl / 10;
          g.appendChild(s('polygon', {
            points: [X(a), ty + th + 6, X(a) + per, ty + th + 6, zx1, zy - 46, zx0, zy - 46].join(' '),
            fill: '#fff4d6', stroke: '#f08c00', 'stroke-width': 1.5, 'stroke-dasharray': '6 5'
          }));
          var zf = v - a; // 0〜9
          g.appendChild(s('rect', { x: zx0, y: zy - 46, width: zf * zp, height: 34, fill: '#ffc9a8', stroke: '#333', 'stroke-width': 1.5 }));
          g.appendChild(s('rect', { x: zx0, y: zy - 46, width: zl, height: 34, fill: 'none', stroke: '#333', 'stroke-width': 2 }));
          for (var j = 0; j <= 10; j++) {
            var zx = zx0 + j * zp, end = j === 0 || j === 10, half = j === 5;
            g.appendChild(s('line', { x1: zx, y1: zy - 12, x2: zx, y2: zy - 12 + (end ? 20 : half ? 15 : 10), stroke: '#333', 'stroke-width': end ? 2.4 : 1.5 }));
            if (end) g.appendChild(txt(zx, zy + 34, num.fromInt(a + j, 2), { 'font-size': 24, 'font-weight': 'bold' }));
                      }
          g.appendChild(txt(zx1 + 34, zy + 34, 'm', { 'font-size': 24 }));
          // 0.01m のしるし
          g.appendChild(s('path', { d: 'M' + zx0 + ' ' + (zy - 52) + ' q' + (zp / 2) + ' -16 ' + zp + ' 0', fill: 'none', stroke: '#1971c2', 'stroke-width': 2 }));
          g.appendChild(txt(zx0 + zp / 2, zy - 72, '0.01m', { 'font-size': 18, fill: '#1971c2' }));
          // 値の矢印
          var vx = zx0 + zf * zp;
          g.appendChild(s('line', { x1: vx, y1: zy + 44, x2: vx, y2: zy + 66, stroke: '#d9480f', 'stroke-width': 3 }));
          g.appendChild(s('path', { d: 'M' + vx + ' ' + (zy + 40) + ' l-8 14 h16 z', fill: '#d9480f' }));
          g.appendChild(s('rect', { x: vx - 50, y: zy + 66, width: 100, height: 34, rx: 17, fill: '#fff', stroke: '#d9480f', 'stroke-width': 2.5 }));
          g.appendChild(txt(vx, zy + 91, num.fromInt(v, 2) + 'm', { 'font-size': 22, 'font-weight': 'bold', fill: '#d9480f' }));
          svg.appendChild(g);
        }
        figBox.innerHTML = '';
        figBox.appendChild(svg);

        var str = num.fromInt(v, 2), m = Math.floor(v / 100), cm = v % 100;
        valEl.textContent = zoomed ? str + 'm' : '?m';
        zoomBtn.textContent = zoomed ? 'もとにもどす' : 'ズーム';
        info.innerHTML = '';
        var lines = [];
        lines.push(h('div', null, ['1mを10等分した1こ分は ', h('b', null, '0.1m'), '。']));
        if (!zoomed) {
          lines.push(h('div', null, ['テープのはしは ' + num.fromInt(a, 2) + 'mと ' + num.fromInt(a + 10, 2) + 'mの間。0.1mより短いはしたは どう表すかな？']));
        } else {
          lines.push(h('div', null, ['0.1mを10等分した1こ分は ', h('b', null, '0.01m'), '（1cm）。']));
          lines.push(h('div', null, [num.fromInt(a, 2) + 'mと、0.01mが' + (v - a) + 'こで ', h('b', { 'class': 'sd-big' }, str + 'm'), '（' + num.read(str) + 'メートル）']));
          lines.push(h('div', null, m + 'm' + cm + 'cm ＝ ' + str + 'm'));
        }
        lines.forEach(function (l) { info.appendChild(l); });
      }
      render(false);
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
