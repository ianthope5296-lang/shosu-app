/* demos/compare.js : くらべっこ（位取り表で上の位からくらべる＋数直線） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util;
  var LABELS = ['あ', 'い', 'う'];
  var COLORS = ['#d9480f', '#1971c2', '#2b8a3e'];

  function digitAt(str, p) { return F.digitAt(str, p); }
  function pName(p) { return F.placeName(p); }

  D.register('compare', {
    title: 'くらべっこ',
    mount: function (el, opts) {
      var nums = (opts.numbers || ['0.43', '0.425', '0.432']).slice();
      var step = -1; // -1: まだ、0..: くらべている列
      var plan = null;

      var tableBox = h('div', { 'class': 'sd-cmp-table' });
      var msg = h('div', { 'class': 'sd-msg', 'aria-live': 'polite' });
      var lineBox = h('div', { 'class': 'sd-figbox' });
      var goBtn = ui.button('上の位からくらべる', function () { next(); }, { kind: 'main', cls: 'sd-btn-big' });
      var resetBtn = ui.button('はじめから', function () { step = -1; render(); }, { kind: 'sub' });
      var presetRow = h('div', { 'class': 'sd-row' }, [
        [['0.43', '0.425', '0.432']], [['0.43', '0.425']], [['0.5', '0.05', '0.005']], [['2.4', '2.38', '2.415']], [['0.7', '0.69', '0.701']]
      ].map(function (p) {
        return ui.button(p[0].join(' / '), function () { nums = p[0].slice(); step = -1; render(); }, { cls: 'sd-chip' });
      }));

      el.appendChild(h('div', { 'class': 'sd-lead' }, '数の大小は、上の位から順にくらべるよ。数をタップすると かえられるよ。'));
      el.appendChild(presetRow);
      el.appendChild(h('div', { 'class': 'sd-cols' }, [
        h('div', { 'class': 'sd-col-main' }, [tableBox]),
        h('div', { 'class': 'sd-col-side' }, [h('div', { 'class': 'sd-row' }, [goBtn, resetBtn]), msg])
      ]));
      el.appendChild(lineBox);

      function cols() {
        var top = 0;
        nums.forEach(function (n) { var ip = n.split('.')[0]; if (ip.length - 1 > top) top = ip.length - 1; });
        var bot = -1;
        nums.forEach(function (n) { var sc = num.scale(n); if (-sc < bot) bot = -sc; });
        bot = Math.min(bot, -3) ;
        var out = []; for (var p = Math.min(top, 1); p >= bot; p--) out.push(p);
        if (top > 1) out.unshift(2);
        return out;
      }
      function makePlan() {
        var ps = cols();
        var groups = [nums.map(function (n, i) { return i; })];
        var stepsOut = [];
        for (var c = 0; c < ps.length; c++) {
          var p = ps[c];
          if (!groups.some(function (g) { return g.length > 1; })) break;
          var info = { p: p, col: c, lines: [], zeros: [] };
          var ng = [];
          groups.forEach(function (g) {
            if (g.length < 2) { ng.push(g); return; }
            var byD = {};
            g.forEach(function (i) {
              var d = digitAt(nums[i], p);
              if (d === '') { d = '0'; if (p < 0) info.zeros.push(i); }
              (byD[d] = byD[d] || []).push(i);
            });
            var ds = Object.keys(byD).sort(function (a, b) { return b - a; });
            if (ds.length === 1) {
              info.lines.push(g.map(function (i) { return nums[i]; }).join(' と ') + ' は どれも ' + ds[0] + '。同じだから つぎの位へ。');
              ng.push(g);
            } else {
              info.lines.push(ds.map(function (d) { return byD[d].map(function (i) { return nums[i]; }).join(' と ') + ' は ' + d; }).join('、') + '。');
              info.lines.push(ds.join(' ＞ ') + ' だから ' + ds.map(function (d) { return byD[d].length > 1 ? '（' + byD[d].map(function (i) { return nums[i]; }).join(' と ') + '）' : nums[byD[d][0]]; }).join(' ＞ '));
              info.decided = true;
              ds.forEach(function (d) { ng.push(byD[d]); });
            }
          });
          groups = ng;
          stepsOut.push(info);
        }
        var sorted = nums.map(function (n, i) { return i; }).sort(function (a, b) { return num.cmp(nums[b], nums[a]); });
        var fin = '';
        sorted.forEach(function (i, k) {
          if (k) fin += num.cmp(nums[sorted[k - 1]], nums[i]) === 0 ? ' ＝ ' : ' ＞ ';
          fin += nums[i];
        });
        return { ps: ps, steps: stepsOut, final: fin, sorted: sorted };
      }
      function next() {
        if (step < plan.steps.length) step++;
        render();
      }
      function edit(i) {
        ui.askNumber({
          title: LABELS[i] + ' の数', value: nums[i], maxLen: 6,
          validate: function (v) {
            if (num.scale(v) > 3) return '小数第三位までにしてね';
            if (+v >= 100) return '100より小さい数にしてね';
            return null;
          },
          onOK: function (v) { nums[i] = num.trim(v); step = -1; render(); }
        });
      }
      function render() {
        plan = makePlan();
        var ps = plan.ps;
        var cur = step >= 0 && step < plan.steps.length ? plan.steps[step] : null;
        var done = step >= plan.steps.length;
        var shownZeros = {};
        plan.steps.forEach(function (st, k) { if (k <= step) st.zeros.forEach(function (i) { shownZeros[i + ',' + st.p] = 1; }); });
        var lastCol = plan.steps.length ? plan.steps[plan.steps.length - 1].col : -1;
        function passed(c) { return step >= 0 && cur && c < cur.col; }
        var t = h('table', { 'class': 'sd-table sd-ptable sd-cmp' });
        var hr = h('tr', null, h('th', { 'class': 'sd-rowhead' }, ''));
        ps.forEach(function (p, c) {
          hr.appendChild(h('th', { style: { background: ui.placeColor(p) }, 'class': cur && cur.col === c ? 'sd-hl' : '' }, ui.placeNameEl(p)));
        });
        t.appendChild(hr);
        nums.forEach(function (n, i) {
          var rank = done ? plan.sorted.indexOf(i) + 1 : 0;
          var lab = ui.button(h('span', null, [h('span', { 'class': 'sd-cmp-lab', style: { background: COLORS[i] } }, LABELS[i]), ' ' + n]), function () { edit(i); }, { cls: 'sd-cmp-num', aria: LABELS[i] + ' の数をかえる' });
          var tr = h('tr', null, h('th', { 'class': 'sd-rowhead' }, lab));
          ps.forEach(function (p, c) {
            var d = digitAt(n, p);
            var cls = 'sd-digitcell' + (p === 0 ? ' sd-dot-after' : '') + (cur && cur.col === c ? ' sd-hl' : '') + (passed(c) ? ' sd-done' : '');
            if (p === 0 && num.scale(n) === 0) cls = cls.replace(' sd-dot-after', '');
            var cell = h('td', { 'class': cls });
            if (d === '' && shownZeros[i + ',' + p]) cell.appendChild(h('span', { 'class': 'sd-faint' }, '0'));
            else if (d !== '') cell.appendChild(document.createTextNode(d));
            tr.appendChild(cell);
          });
          if (done) tr.appendChild(h('td', { 'class': 'sd-rank' }, rank + 'ばん'));
          t.appendChild(tr);
        });
        tableBox.innerHTML = '';
        tableBox.appendChild(t);

        msg.innerHTML = '';
        if (step < 0) msg.appendChild(h('div', null, 'どれがいちばん大きいかな？「上の位からくらべる」をおそう。'));
        else if (cur) {
          msg.appendChild(h('div', { 'class': 'sd-msg-head' }, [ui.placeNameEl(cur.p), ' でくらべる']));
          cur.zeros.forEach(function (i) { msg.appendChild(h('div', { 'class': 'sd-note' }, nums[i] + ' の ' + pName(cur.p) + ' は 0 と考えるよ。')); });
          cur.lines.forEach(function (l) { msg.appendChild(h('div', null, l)); });
        } else {
          msg.appendChild(h('div', { 'class': 'sd-msg-head' }, 'けっか'));
          msg.appendChild(h('div', { 'class': 'sd-big' }, plan.final));
        }
        goBtn.textContent = step < 0 ? '上の位からくらべる' : done ? 'おわり' : 'つぎの位へ';
        goBtn.disabled = done;

        // 数直線
        var vals = nums.map(Number);
        var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
        var lo, hi, st;
        var lo1 = Math.floor(mn * 10 + 1e-9) / 10, hi1 = Math.ceil(mx * 10 - 1e-9) / 10;
        if (hi1 <= lo1) hi1 = lo1 + 0.1;
        if (Math.round((hi1 - lo1) * 10) <= 1) { lo = lo1; hi = +(lo1 + 0.1).toFixed(1); st = 0.001; }
        else if (Math.floor(mn) === Math.floor(mx - 1e-9) || mx - mn <= 1) { lo = Math.floor(mn); hi = lo + 1; st = 0.01; if (mx > hi) { hi = lo + 2; st = 0.1; } }
        else { lo = Math.floor(mn); hi = Math.ceil(mx); st = 0.1; }
        lineBox.innerHTML = '';
        lineBox.appendChild(S.Figures.render({
          kind: 'numberline', min: lo, max: hi, step: st, labelEvery: 10,
          arrows: nums.map(function (n, i) { return { v: Number(n), label: n, color: COLORS[i] }; })
        }));
      }
      render();
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
