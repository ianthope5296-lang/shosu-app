/* demos/blocks.js : ブロックと位取り表（1・0.1・0.01・0.001 の 10倍・1/10 の関係） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util, s = F.s, txt = F.txt;
  var KEYS = ['1', '0.1', '0.01', '0.001'], PL = [0, -1, -2, -3];

  function relationSvg() {
    var W = 900, H = 250, gap = 220, x0 = 120, cy = 128;
    var svg = F.root(W, H, 'sd-rel', 1.0);
    KEYS.forEach(function (k, i) {
      var cx = x0 + i * gap;
      var bg = F.blockGroup(k, 1);
      var sc = k === '0.001' ? 2.2 : 0.72;
      var g = s('g', { transform: 'translate(' + (cx - bg.w * sc / 2) + ',' + (cy + 10) + ') scale(' + sc + ')' });
      g.appendChild(bg.g);
      svg.appendChild(s('rect', { x: cx - 62, y: cy - 66, width: 124, height: 120, rx: 12, fill: '#fff', stroke: '#aaa' }));
      svg.appendChild(g);
      svg.appendChild(s('rect', { x: cx - 46, y: cy + 22, width: 92, height: 36, rx: 8, fill: ui.placeColor(PL[i]), stroke: '#777' }));
      svg.appendChild(txt(cx, cy + 48, k, { 'font-size': 26, 'font-weight': 'bold' }));
      if (i < KEYS.length - 1) {
        var ax = cx + 40, bx = cx + gap - 40;
        // 上の弧：1/10（右へ）
        svg.appendChild(s('path', { d: 'M' + ax + ' ' + (cy - 70) + ' Q' + (cx + gap / 2) + ' ' + (cy - 140) + ' ' + bx + ' ' + (cy - 70), fill: 'none', stroke: '#1971c2', 'stroke-width': 3.5 }));
        svg.appendChild(s('path', { d: 'M' + bx + ' ' + (cy - 70) + ' l-15 -5 l6 -12 z', fill: '#1971c2' }));
        svg.appendChild(F.frac(cx + gap / 2, cy - 108, '1', '10', 22, { fill: '#1971c2' }));
        // 下の弧：10倍（左へ）
        svg.appendChild(s('path', { d: 'M' + bx + ' ' + (cy + 62) + ' Q' + (cx + gap / 2) + ' ' + (cy + 128) + ' ' + ax + ' ' + (cy + 62), fill: 'none', stroke: '#e8590c', 'stroke-width': 3.5 }));
        svg.appendChild(s('path', { d: 'M' + ax + ' ' + (cy + 62) + ' l15 5 l-6 12 z', fill: '#e8590c' }));
        svg.appendChild(txt(cx + gap / 2, cy + 110, '10倍', { 'font-size': 22, 'font-weight': 'bold', fill: '#e8590c' }));
      }
    });
    return svg;
  }

  D.register('blocks', {
    title: 'ブロックと位取り表',
    mount: function (el, opts) {
      var digits = (opts.digits || [2, 3, 8, 6]).slice();
      var showCount = false;

      var relBox = h('div', { 'class': 'sd-figbox sd-rel-box' }, relationSvg());
      var blockBox = h('div', { 'class': 'sd-figbox sd-blocks-box' });
      var numEl = h('div', { 'class': 'sd-bignum' });
      var dials = h('div', { 'class': 'sd-dials' });
      var expl = h('div', { 'class': 'sd-msg', 'aria-live': 'polite' });
      var steps = [];
      PL.forEach(function (p, i) {
        var st = ui.stepper({ value: digits[i], min: 0, max: 9, vertical: true, color: ui.placeColor(p), onChange: function (v) { digits[i] = v; render(); } });
        steps.push(st);
        var col = h('div', { 'class': 'sd-dial' }, [ui.placeNameEl(p, true), st.el]);
        dials.appendChild(col);
        if (p === 0) dials.appendChild(h('div', { 'class': 'sd-dial-dot' }, '.'));
      });
      var countBtn = ui.button('0.001が何こ？', function () { showCount = !showCount; render(); }, { kind: 'main' });
      var presets = h('div', { 'class': 'sd-row' }, [['2.386', [2, 3, 8, 6]], ['3.495', [3, 4, 9, 5]], ['7.305', [7, 3, 0, 5]], ['3.254', [3, 2, 5, 4]]].map(function (p) {
        return ui.button(p[0], function () { digits = p[1].slice(); steps.forEach(function (st, i) { st.set(digits[i]); }); render(); }, { cls: 'sd-chip' });
      }));

      el.appendChild(h('div', { 'class': 'sd-cols' }, [
        h('div', { 'class': 'sd-col-main' }, [relBox, blockBox]),
        h('div', { 'class': 'sd-col-side' }, [numEl, dials, presets, h('div', { 'class': 'sd-row' }, countBtn)])
      ]));
      el.appendChild(expl);

      function render() {
        var str = digits[0] + '.' + digits[1] + digits[2] + digits[3];
        var counts = {}; KEYS.forEach(function (k, i) { counts[k] = digits[i]; });
        blockBox.innerHTML = '';
        blockBox.appendChild(S.Figures.render({ kind: 'blocks', counts: counts }));
        numEl.textContent = num.trim(str);
        expl.innerHTML = '';
        var parts = [];
        KEYS.forEach(function (k, i) {
          parts.push(h('span', { 'class': 'sd-tag', style: { background: ui.placeColor(PL[i]) } }, k + 'が' + digits[i] + 'こ'));
          if (i < 3) parts.push('、');
        });
        parts.push('で ' + num.trim(str) + '。');
        expl.appendChild(h('div', null, parts));
        var names = [];
        PL.forEach(function (p, i) {
          names.push(h('span', { 'class': 'sd-pn-item' }, [ui.placeNameEl(p), ' の数字は ', h('b', null, String(digits[i]))]));
        });
        expl.appendChild(h('div', { 'class': 'sd-pn-list' }, names));
        if (showCount) {
          var n = digits[0] * 1000 + digits[1] * 100 + digits[2] * 10 + digits[3];
          expl.appendChild(h('div', { 'class': 'sd-count' }, [num.trim(str) + ' は 0.001を ', h('b', { 'class': 'sd-big' }, n + 'こ'), ' 集めた数。（1は0.001が1000こ、0.1は100こ、0.01は10こ）']));
        }
        countBtn.textContent = showCount ? '0.001の数をかくす' : '0.001が何こ？';
      }
      render();
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
