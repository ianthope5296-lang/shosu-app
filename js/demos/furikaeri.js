/* demos/furikaeri.js : ふりかえり（2.81 の3つの見方と、10倍・1/10 の関係） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util, s = F.s, txt = F.txt;

  /* 100マスの正方形(1)・10マスの列(0.1)・1マス(0.01) で表す */
  function gridPic(n100, mode) {
    var ones = Math.floor(n100 / 100), tenths = Math.floor(n100 / 10) % 10, hund = n100 % 10;
    var c = 11, gap = 18;
    var parts = [];
    var i;
    for (i = 0; i < ones; i++) parts.push({ type: 1 });
    for (i = 0; i < tenths; i++) parts.push({ type: 0.1 });
    if (hund) parts.push({ type: 0.01, n: hund });
    var x = 20, y0 = 50;
    var g = s('g');
    var segs = { 1: [], 0.1: [], 0.01: [] };
    var count = 0;
    parts.forEach(function (pt, k) {
      var prev = parts[k - 1];
      if (prev && prev.type !== pt.type) x += gap;
      var col = mode === 3 ? '#ffe3a3' : pt.type === 1 ? F.placeColor(0) : pt.type === 0.1 ? F.placeColor(-1) : F.placeColor(-2);
      if (mode === 1) col = pt.type === 1 ? '#ffd8a8' : '#a5d8ff';
      var startX = x;
      var w = pt.type === 1 ? 10 * c : c;
      var cells = pt.type === 1 ? 100 : pt.type === 0.1 ? 10 : pt.n;
      g.appendChild(s('rect', { x: x, y: y0 + (pt.type === 0.01 ? (10 - cells) * c : 0), width: w, height: pt.type === 0.01 ? cells * c : 10 * c, fill: col, stroke: '#555', 'stroke-width': 1.6 }));
      var gl = s('g', { stroke: 'rgba(0,0,0,0.25)', 'stroke-width': 0.8 });
      if (pt.type === 1) for (i = 1; i < 10; i++) {
        gl.appendChild(s('line', { x1: x + i * c, y1: y0, x2: x + i * c, y2: y0 + 10 * c }));
        gl.appendChild(s('line', { x1: x, y1: y0 + i * c, x2: x + 10 * c, y2: y0 + i * c }));
      } else {
        var top = pt.type === 0.01 ? (10 - cells) : 0;
        for (i = top + 1; i < 10; i++) gl.appendChild(s('line', { x1: x, y1: y0 + i * c, x2: x + c, y2: y0 + i * c }));
      }
      g.appendChild(gl);
      count += cells;
      segs[pt.type].push([startX, x + w]);
      x += w + (pt.type === 1 ? 10 : 4);
      if (mode === 3) g.appendChild(txt(x - (w + (pt.type === 1 ? 10 : 4)) / 2 - 2, y0 + 10 * c + 26, String(count), { 'font-size': pt.type === 1 ? 18 : 12, fill: '#b35c00' }));
    });
    var W = x + 20, H = y0 + 10 * c + 70;
    function brace(a, b, label, y, color) {
      g.appendChild(s('path', { d: 'M' + a + ' ' + (y - 8) + ' v8 H' + b + ' v-8', fill: 'none', stroke: color || '#333', 'stroke-width': 2.2 }));
      g.appendChild(txt((a + b) / 2, y + 26, label, { 'font-size': 22, 'font-weight': 'bold', fill: color || '#333' }));
    }
    var by = y0 + 10 * c + 14;
    function span(t) { var l = segs[t]; return l.length ? [l[0][0], l[l.length - 1][1]] : null; }
    if (mode === 1) {
      var sp1 = span(1), rest = [span(0.1), span(0.01)].filter(Boolean);
      if (sp1) brace(sp1[0], sp1[1], String(ones), by, '#d9480f');
      if (rest.length) brace(rest[0][0], rest[rest.length - 1][1], num.fromInt(n100 % 100, 2), by, '#1971c2');
    } else if (mode === 2) {
      [[1, ones, '1'], [0.1, tenths, '0.1'], [0.01, hund, '0.01']].forEach(function (q) {
        var sp = span(q[0]); if (sp) brace(sp[0], sp[1], q[2] + 'が' + q[1] + 'こ', by);
      });
    }
    var svg = F.root(W, H, 'sd-furi-pic', 1.25);
    svg.appendChild(g);
    return svg;
  }

  function chainTable(n100) {
    var base = String(n100);
    var rows = [base, num.shift(base, -1), num.shift(base, -2), num.shift(base, -3)];
    var cols = ['100', '10', '1', '0.1', '0.01', '0.001'];
    var svg = S.Figures.render({ kind: 'placeTable', cols: cols, rows: rows });
    var cw = 100, hh = 66, rh = 72, W = cw * cols.length + 4, H = hh + rh * rows.length + 4;
    var hlRow = 2;
    svg.insertBefore(s('rect', { x: 2, y: 2 + hh + rh * hlRow, width: W - 4, height: rh, fill: '#fff3bf', opacity: 0.9 }), svg.childNodes[cols.length * 2] || null);
    var ext = 230;
    svg.setAttribute('viewBox', '0 0 ' + (W + ext) + ' ' + H);
    svg.style.maxWidth = Math.round((W + ext) * 1.05) + 'px';
    for (var i = 0; i < rows.length - 1; i++) {
      var y1 = 2 + hh + rh * i + rh / 2, y2 = y1 + rh;
      var x = W + 12;
      svg.appendChild(s('path', { d: 'M' + x + ' ' + (y1 + 6) + ' Q' + (x + 50) + ' ' + ((y1 + y2) / 2) + ' ' + x + ' ' + (y2 - 6), fill: 'none', stroke: '#1971c2', 'stroke-width': 3 }));
      svg.appendChild(s('path', { d: 'M' + x + ' ' + (y2 - 6) + ' l12 -4 l-5 -10 z', fill: '#1971c2' }));
      svg.appendChild(F.frac(x + 62, (y1 + y2) / 2 + 2, '1', '10', 17, { fill: '#1971c2' }));
      var x2 = W + 110;
      svg.appendChild(s('path', { d: 'M' + x2 + ' ' + (y2 - 6) + ' Q' + (x2 + 50) + ' ' + ((y1 + y2) / 2) + ' ' + x2 + ' ' + (y1 + 6), fill: 'none', stroke: '#e8590c', 'stroke-width': 3 }));
      svg.appendChild(s('path', { d: 'M' + x2 + ' ' + (y1 + 6) + ' l12 4 l-5 10 z', fill: '#e8590c' }));
      svg.appendChild(txt(x2 + 78, (y1 + y2) / 2 + 8, '10倍', { 'font-size': 18, 'font-weight': 'bold', fill: '#e8590c' }));
    }
    return svg;
  }

  D.register('furikaeri', {
    title: 'ふりかえり',
    mount: function (el, opts) {
      var n100 = Math.round(Number(opts.number || '2.81') * 100);
      var view = 1;
      var picBox = h('div', { 'class': 'sd-figbox' });
      var viewText = h('div', { 'class': 'sd-msg sd-furi-text', 'aria-live': 'polite' });
      var tableBox = h('div', { 'class': 'sd-figbox' });
      var tableText = h('div', { 'class': 'sd-msg' });
      var seg = ui.segmented([
        { value: 1, label: '見方1' }, { value: 2, label: '見方2' }, { value: 3, label: '見方3' }
      ], view, function (v) { view = v; render(); });
      var numSeg = ui.segmented(['2.81', '1.36', '4.07'].map(function (n) { return { value: Math.round(Number(n) * 100), label: n }; }), n100, function (v) { n100 = v; render(); });

      el.appendChild(h('div', { 'class': 'sd-row' }, [h('span', { 'class': 'sd-lead' }, 'いろいろな見方をしてみよう'), numSeg.el]));
      el.appendChild(h('div', { 'class': 'sd-cols' }, [
        h('div', { 'class': 'sd-col-main' }, [seg.el, picBox, viewText]),
        h('div', { 'class': 'sd-col-side' }, [tableBox, tableText])
      ]));

      function render() {
        var str = num.fromInt(n100, 2);
        var ones = Math.floor(n100 / 100), t = Math.floor(n100 / 10) % 10, hd = n100 % 10;
        picBox.innerHTML = '';
        picBox.appendChild(gridPic(n100, view));
        viewText.innerHTML = '';
        var texts = {
          1: [h('b', null, str), ' は、', h('b', null, String(ones)), ' と ', h('b', null, num.fromInt(n100 % 100, 2)), ' を合わせた数'],
          2: [h('b', null, str), ' は、1を' + ones + 'こ、0.1を' + t + 'こ、0.01を' + hd + 'こ 合わせた数'],
          3: [h('b', null, str), ' は、0.01を ', h('b', { 'class': 'sd-big' }, n100 + 'こ'), ' 集めた数']
        };
        viewText.appendChild(h('div', null, texts[view]));
        viewText.appendChild(h('div', { 'class': 'sd-note' }, '図の 大きな正方形が1、たての1列が0.1、1マスが0.01'));
        tableBox.innerHTML = '';
        tableBox.appendChild(chainTable(n100));
        tableText.innerHTML = '';
        tableText.appendChild(h('div', null, [String(n100) + ' → ' + num.shift(String(n100), -1) + ' → ' + str + ' → ' + num.shift(String(n100), -3)]));
        tableText.appendChild(h('div', null, ['1/10 にすると、どの数字も位が1つ下がる。10倍すると、位が1つ上がる。']));
      }
      render();
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
