/* demos/masu.js : ますメーカー（opts.level 2|3） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;

  D.register('masu', {
    title: 'ますメーカー',
    mount: function (el, opts) {
      var level = opts.level === 3 ? 3 : 2;
      var unit = opts.unit || 'L';
      // 位ごとの個数  [1L, 0.1L, 0.01L, 0.001L]
      var units = level === 3 ? ['1', '0.1', '0.01', '0.001'] : ['1', '0.1', '0.01'];
      var places = level === 3 ? [0, -1, -2, -3] : [0, -1, -2];
      var init = opts.init || (level === 3 ? [1, 2, 3, 6] : [1, 2, 6]);
      var cnt = init.slice();
      var divided = false;
      var timer = null;

      var lead = h('div', { 'class': 'sd-lead' });
      var figBox = h('div', { 'class': 'sd-figbox sd-masu-fig' });
      var note = h('div', { 'class': 'sd-msg', 'aria-live': 'polite' });
      var steppers = [];
      var rowEls = [];
      var table = h('table', { 'class': 'sd-table sd-masu-table' });
      var tbody = h('tbody');
      table.appendChild(tbody);
      units.forEach(function (u, i) {
        var st = ui.stepper({
          value: cnt[i], min: 0, max: i === 0 ? 4 : 9, color: ui.placeColor(places[i]), allowOver: i > 0,
          onTry: function (v) { return tryChange(i, v); },
          onChange: function (v) { cnt[i] = v; update(); }
        });
        steppers.push(st);
        var valCell = h('td', { 'class': 'sd-masu-val' });
        var tr = h('tr', null, [
          h('td', { 'class': 'sd-masu-unit', style: { background: ui.placeColor(places[i]) } }, u + unit + 'が'),
          h('td', null, st.el),
          h('td', null, 'こで'),
          valCell
        ]);
        rowEls.push({ tr: tr, val: valCell });
        tbody.appendChild(tr);
      });
      var totalCell = h('td', { colspan: 4, 'class': 'sd-masu-total' });
      tbody.appendChild(h('tr', null, totalCell));
      var readEl = h('div', { 'class': 'sd-masu-read' });

      var divLabel = level === 3 ? '0.01' + unit + 'を10等分する' : '0.1' + unit + 'を10等分する';
      var divBtn = ui.button(divLabel, function () {
        divided = !divided;
        render(true);
      }, { kind: 'main' });
      var resetBtn = ui.button('はじめにもどす', function () {
        cnt = init.slice(); divided = false;
        steppers.forEach(function (st, i) { st.set(cnt[i]); });
        update();
      }, { kind: 'sub' });

      lead.textContent = level === 3
        ? '0.01' + unit + 'より少ないはしたは、0.01' + unit + 'を10等分して考えよう。'
        : '0.1' + unit + 'より少ないはしたは、0.1' + unit + 'を10等分して考えよう。';

      el.appendChild(lead);
      el.appendChild(h('div', { 'class': 'sd-cols' }, [
        h('div', { 'class': 'sd-col-main' }, [figBox, h('div', { 'class': 'sd-row sd-center' }, [divBtn, resetBtn]), note]),
        h('div', { 'class': 'sd-col-side' }, [table, readEl])
      ]));

      function tryChange(i, v) {
        if (v > 9 && i > 0) { // 10こで くり上がり
          if (i === 1 && cnt[0] >= 4) return false;
          cnt[i] = 0; cnt[i - 1]++;
          steppers[i].set(0); steppers[i - 1].set(cnt[i - 1]);
          update();
          note.textContent = units[i] + unit + 'が10こで ' + units[i - 1] + unit + 'になるよ！';
          note.classList.add('sd-msg-pop');
          return false;
        }
        return v;
      }
      function lastIdx() { return units.length - 1; }

      function update() { render(false); }

      function render(animate) {
        var spec = { kind: 'masu', unit: unit, level: level, L: cnt[0], d1: cnt[1], d2: cnt[2] || 0, d3: cnt[3] || 0 };
        spec.ticks = divided;
        spec.animTicks = !!animate && divided;
        if (divided) spec.partial = true;
        figBox.innerHTML = '';
        figBox.appendChild(S.Figures.render(spec));
        divBtn.textContent = divided ? '目もりをけす' : divLabel;
        // 表
        var sc = level === 3 ? 3 : 2, total = 0;
        units.forEach(function (u, i) {
          var v = num.toInt(u, sc) * cnt[i];
          total += v;
          rowEls[i].val.textContent = num.fromInt(v, sc) + unit;
        });
        var hidden = !divided; // 最後の行（はした）は目もりをつけてから
        rowEls[lastIdx()].tr.classList.toggle('sd-dim', hidden);
        var totStr = num.fromInt(total, sc);
        totalCell.innerHTML = '';
        totalCell.appendChild(document.createTextNode('合わせて '));
        totalCell.appendChild(h('b', { 'class': 'sd-big' }, hidden && cnt[lastIdx()] ? '?' : totStr));
        totalCell.appendChild(document.createTextNode(' ' + unit));
        readEl.innerHTML = '';
        if (!(hidden && cnt[lastIdx()])) {
          readEl.appendChild(h('span', null, ['読み方：', h('b', null, num.read(totStr) + (unit === 'L' ? 'リットル' : '')), '（' + totStr + unit + '）']));
        }
        note.classList.remove('sd-msg-pop');
        var small = units[lastIdx()], prev = units[lastIdx() - 1];
        if (!divided) {
          note.textContent = 'はしたの水は ' + prev + unit + 'より少ないね。何' + unit + 'かな？「10等分する」をおしてみよう。';
        } else {
          note.innerHTML = '';
          note.appendChild(document.createTextNode(prev + unit + 'を10等分した1こ分のかさは '));
          note.appendChild(h('b', null, small + unit));
          note.appendChild(document.createTextNode('（' + num.read(small) + (unit === 'L' ? 'リットル' : '') + '）。目もり ' + cnt[lastIdx()] + 'こ分で ' + num.fromInt(num.toInt(small, sc) * cnt[lastIdx()], sc) + unit + '。'));
        }
      }
      render(false);
      return { destroy: function () { if (timer) clearTimeout(timer); } };
    }
  });
})(window.Shosu = window.Shosu || {});
