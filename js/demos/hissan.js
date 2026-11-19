/* demos/hissan.js : 筆算ステップ（opts.op '+'|'-', opts.presets ['2.25+1.34', ...]） */
(function (S) {
  'use strict';
  var D = S.Demos, ui = D.ui, h = ui.h, num = D.num;
  var F = S.Figures.util;

  function intDigits(str) { return String(str).split('.')[0].replace(/^0+(?=\d)/, '').length; }
  function digitOf(str, p) { var d = F.digitAt(str, p); return d === '' ? null : +d; }

  /* 計算の流れをすべて作る */
  function build(a, b, op) {
    var sa = num.scale(a), sb = num.scale(b), sc = Math.max(sa, sb);
    var A = num.toInt(a, sc), B = num.toInt(b, sc);
    var R = op === '+' ? A + B : A - B;
    var rs = num.fromInt(R, sc, true);
    var top = Math.max(intDigits(a), intDigits(b), intDigits(rs)) - 1;
    var ps = []; for (var p = top; p >= -sc; p--) ps.push(p);
    var cols = [];
    var work = {}; ps.forEach(function (p) { work[p] = digitOf(a, p) || 0; });
    var marks = {}; // 繰り下がりで変わった上の数
    var carry = 0;
    var ans = {};
    for (var i = ps.length - 1; i >= 0; i--) {
      p = ps[i];
      var da = digitOf(a, p), db = digitOf(b, p);
      var info = { p: p, da: da, db: db };
      if (op === '+') {
        var sum = (da || 0) + (db || 0) + carry;
        info.carryIn = carry;
        info.sum = sum;
        ans[p] = sum % 10;
        carry = Math.floor(sum / 10);
        info.carryOut = carry;
      } else {
        var bb = db || 0;
        info.top = work[p];
        if (work[p] < bb) {
          var k = p + 1;
          while (work[k] === 0) k++;
          info.borrowFrom = k;
          info.chain = [];
          work[k]--; marks[k] = work[k];
          for (var q = k - 1; q > p; q--) { work[q] = 9; marks[q] = 9; info.chain.push(q); }
          work[p] += 10; marks[p] = work[p];
          info.borrowed = true;
        }
        info.topNow = work[p];
        ans[p] = work[p] - bb;
      }
      info.ans = ans[p];
      info.marks = JSON.parse(JSON.stringify(marks));
      cols.push(info);
    }
    // 答えの先頭の0（一の位より上）はかかない
    var lead = {};
    for (i = 0; i < ps.length; i++) { p = ps[i]; if (p > 0 && ans[p] === 0) lead[p] = true; else break; }
    // 末尾の0（小数部分）
    var trail = [];
    for (i = ps.length - 1; i >= 0; i--) { p = ps[i]; if (p < 0 && ans[p] === 0) trail.push(p); else break; }
    return { a: a, b: b, op: op, sa: sa, sb: sb, sc: sc, ps: ps, cols: cols, ans: ans, lead: lead, trail: trail, result: num.fromInt(R, sc) };
  }

  function stepList(m) {
    var st = [{ kind: 'start' }, { kind: 'align' }];
    m.cols.forEach(function (c, i) {
      // 一の位より上で、上も下も数がない列はとばす
      if (c.p > 0 && c.da == null && c.db == null && !c.carryIn) return;
      st.push({ kind: 'col', idx: i });
    });
    if (m.sc > 0) st.push({ kind: 'point' });
    if (m.trail.length) st.push({ kind: 'zero' });
    st.push({ kind: 'done' });
    return st;
  }

  D.register('hissan', {
    title: '筆算ステップ',
    mount: function (el, opts) {
      var op = opts.op === '-' ? '-' : '+';
      var presets = opts.presets || (op === '+' ? ['2.25+1.34', '4.25+2.18', '9.23+0.47', '4.05+3.1'] : ['3.46-2.14', '1.25-0.67', '6-0.52', '5.03-4.25']);
      var model, steps, si = 0;
      var OPS = op === '+' ? '＋' : '−';

      var exprEl = h('div', { 'class': 'sd-hs-expr' });
      var gridBox = h('div', { 'class': 'sd-hs-gridbox' });
      var msg = h('div', { 'class': 'sd-msg sd-hs-msg', 'aria-live': 'polite' });
      var prevBtn = ui.button('もどる', function () { if (si > 0) { si--; render(); } }, { kind: 'sub' });
      var nextBtn = ui.button('つぎへ ▶', function () { if (si < steps.length - 1) { si++; render(); } }, { kind: 'main', cls: 'sd-btn-big' });
      var againBtn = ui.button('はじめから', function () { si = 0; render(); }, { kind: 'sub' });
      var presetRow = h('div', { 'class': 'sd-row' });
      var chips = [];
      presets.forEach(function (p) {
        var b = ui.button(p.replace('+', ' ＋ ').replace('-', ' − '), function () { load(p); }, { cls: 'sd-chip' });
        b._p = p; chips.push(b); presetRow.appendChild(b);
      });
      presetRow.appendChild(ui.button('じぶんで式をつくる', function () {
        ui.askNumbers({
          title: '式をつくろう（' + OPS + '）', maxLen: 6,
          fields: [{ label: op === '+' ? 'たされる数' : 'ひかれる数', value: '' }, { label: op === '+' ? 'たす数' : 'ひく数', value: '' }],
          validate: function (v) {
            if (num.scale(v[0]) > 3 || num.scale(v[1]) > 3) return '小数第三位までにしてね';
            if (+v[0] >= 1000 || +v[1] >= 1000) return '1000より小さい数にしてね';
            if (op === '-' && num.cmp(v[0], v[1]) < 0) return 'ひかれる数を大きくしてね';
            return null;
          },
          onOK: function (v) { load(num.trim(v[0]) + op + num.trim(v[1])); }
        });
      }, { kind: 'sub' }));

      el.appendChild(presetRow);
      el.appendChild(h('div', { 'class': 'sd-cols sd-hs-cols' }, [
        h('div', { 'class': 'sd-col-main' }, [exprEl, gridBox]),
        h('div', { 'class': 'sd-col-side' }, [msg, h('div', { 'class': 'sd-row' }, [prevBtn, nextBtn, againBtn])])
      ]));

      function load(p) {
        var parts = p.split(op === '+' ? '+' : '-');
        model = build(parts[0], parts[1], op);
        steps = stepList(model);
        si = 0;
        chips.forEach(function (c) { c.classList.toggle('on', c._p === p); });
        render();
      }

      /* マス目を作る。rows: [{cells:{p:{d, faint, cross, small, dot, slash, hl}}, op, cls}] */
      function grid(ps, rows, extraCls) {
        var g = h('div', { 'class': 'sd-hs-grid ' + (extraCls || '') });
        g.style.gridTemplateColumns = 'var(--hs-opw) repeat(' + ps.length + ', var(--hs-cw))';
        rows.forEach(function (r) {
          g.appendChild(h('div', { 'class': 'sd-hs-cell sd-hs-op ' + (r.cls || '') }, r.op || ''));
          ps.forEach(function (p) {
            var c = r.cells[p] || {};
            var cell = h('div', { 'class': 'sd-hs-cell ' + (r.cls || '') + (c.hl ? ' sd-hl' : '') + (p === 0 ? ' sd-hs-ones' : '') });
            if (c.small != null) cell.appendChild(h('span', { 'class': 'sd-hs-small' + (c.smallNew ? ' sd-pop' : '') }, String(c.small)));
            if (c.d != null) cell.appendChild(h('span', { 'class': 'sd-hs-d' + (c.faint ? ' sd-faint' : '') + (c.cross ? ' sd-cross' : '') + (c.slash ? ' sd-slash' : '') + (c.isNew ? ' sd-pop' : '') }, String(c.d)));
            if (c.dot) cell.appendChild(h('span', { 'class': 'sd-hs-dot' + (c.dotFaint ? ' sd-faint' : '') + (c.dotNew ? ' sd-drop' : '') + (c.dotSlash ? ' sd-slash-dot' : '') }));
            g.appendChild(cell);
          });
        });
        return g;
      }

      function render() {
        var m = model, s = steps[si];
        exprEl.innerHTML = '';
        exprEl.appendChild(h('span', null, m.a + ' ' + OPS + ' ' + m.b + ' ＝ ' + (s.kind === 'done' ? m.result : '')));
        gridBox.innerHTML = '';
        msg.innerHTML = '';
        prevBtn.disabled = si === 0;
        nextBtn.disabled = si === steps.length - 1;
        againBtn.disabled = si === 0;

        if (s.kind === 'start') {
          msg.appendChild(h('div', { 'class': 'sd-msg-head' }, '筆算でしよう'));
          msg.appendChild(h('div', null, '「つぎへ」をおして、1つずつ進めよう。'));
          gridBox.appendChild(h('div', { 'class': 'sd-hs-placeholder' }, m.a + ' ' + OPS + ' ' + m.b));
          return;
        }
        var colDone = {}; // idx -> true（計算ずみ）
        var curCol = null;
        var colIdxShown = -1;
        for (var k = 0; k <= si; k++) if (steps[k].kind === 'col') colIdxShown = steps[k].idx;
        var allCols = si > 0 && steps.slice(si).every(function (x) { return x.kind !== 'col'; });
        if (allCols) colIdxShown = m.cols.length - 1;
        m.cols.forEach(function (c, i) { if (i <= colIdxShown) colDone[c.p] = c; });
        if (s.kind === 'col') curCol = m.cols[s.idx];
        var pointShown = steps.slice(0, si + 1).some(function (x) { return x.kind === 'point'; }) || (m.sc === 0);
        var zeroShown = steps.slice(0, si + 1).some(function (x) { return x.kind === 'zero'; });
        var lastMarks = {};
        if (op === '-') {
          var lc = null; m.cols.forEach(function (c, i) { if (i <= colIdxShown) lc = c; });
          if (lc) lastMarks = lc.marks;
        }
        var considerZeros = op === '-' && m.sa < m.sc; // 6 → 6.00

        var rowBorrow = { cells: {}, cls: 'sd-hs-mini' };
        var rowA = { cells: {} }, rowB = { cells: {}, op: OPS }, rowC = { cells: {}, cls: 'sd-hs-mini' }, rowR = { cells: {}, cls: 'sd-hs-ans' };
        m.ps.forEach(function (p) {
          var da = digitOf(m.a, p), db = digitOf(m.b, p);
          var hl = curCol && curCol.p === p;
          if (da != null) rowA.cells[p] = { d: da, hl: hl };
          else if (p < 0 && considerZeros) rowA.cells[p] = { d: 0, faint: true, hl: hl };
          else rowA.cells[p] = { hl: hl };
          if (db != null) rowB.cells[p] = { d: db, hl: hl };
          else rowB.cells[p] = { hl: hl };
          if (op === '-' && lastMarks[p] != null) {
            rowA.cells[p].cross = true;
            rowBorrow.cells[p] = { small: lastMarks[p], smallNew: curCol && curCol.borrowed && (curCol.p === p || curCol.borrowFrom === p || curCol.chain.indexOf(p) >= 0) };
          }
          var c = colDone[p];
          if (c) {
            if (!(m.lead[p])) rowR.cells[p] = { d: c.ans, isNew: curCol === c, slash: zeroShown && m.trail.indexOf(p) >= 0, hl: hl };
            else rowR.cells[p] = { hl: hl };
          } else rowR.cells[p] = { hl: hl };
        });
        // くり上がり
        if (op === '+') m.cols.forEach(function (c, i) {
          if (i <= colIdxShown && c.carryOut) rowC.cells[c.p + 1] = { small: c.carryOut, smallNew: curCol === c };
        });
        // 小数点
        var one = 0;
        if (m.sa > 0 || considerZeros) { rowA.cells[one].dot = true; rowA.cells[one].dotFaint = considerZeros; }
        if (m.sb > 0) rowB.cells[one].dot = true;
        if (pointShown && m.sc > 0) {
          rowR.cells[one] = rowR.cells[one] || {};
          rowR.cells[one].dot = true;
          rowR.cells[one].dotNew = s.kind === 'point';
          if (zeroShown && m.trail.length === m.sc) rowR.cells[one].dotSlash = true; // 小数部分がすべて0
        }
        var rows = [];
        if (op === '-') rows.push(rowBorrow);
        rows.push(rowA, rowB);
        if (op === '+') rows.push(rowC);
        rows.push({ cells: {}, cls: 'sd-hs-line' });
        rows.push(rowR);
        var main = grid(m.ps, rows);
        var wrap = h('div', { 'class': 'sd-hs-pair' });
        var mainWrap = h('div', { 'class': 'sd-hs-ok' }, [main]);
        wrap.appendChild(mainWrap);

        var head = '', lines = [];
        if (s.kind === 'align') {
          head = '① 位をそろえて書く';
          lines.push('小数点の位置をそろえて、同じ位どうしを たてにならべて書くよ。');
          if (considerZeros) lines.push(m.a + ' は ' + num.fromInt(num.toInt(m.a, m.sc), m.sc, true) + ' と考えると、計算しやすいね。');
          if (m.sa !== m.sb) {
            mainWrap.insertBefore(h('div', { 'class': 'sd-hs-tag sd-ok' }, '○ 小数点をそろえる'), main);
            wrap.appendChild(wrongExample(m));
            lines.push('右はしをそろえて書くのは まちがい。ちがう位どうしを 計算してしまうよ。');
          }
        } else if (s.kind === 'col') {
          head = '② 下の位から計算する';
          lines = colText(m, curCol);
        } else if (s.kind === 'point') {
          head = '③ 小数点をうつ';
          lines.push('答えの小数点は、上の小数点に そろえてうつよ。');
        } else if (s.kind === 'zero') {
          head = '④ 終わりの0を消す';
          lines.push('小数点より右の 終わりの0は、/ で消しておこう。');
          if (m.trail.length === m.sc) lines.push('小数部分がぜんぶ0なので、小数点も消すよ。');
        } else if (s.kind === 'done') {
          head = 'できた！';
          lines.push('答えは ' + m.result + '。');
          if (op === '+') lines.push('整数のたし算と同じように、位ごとに計算できたね。');
          else lines.push('整数のひき算と同じように、位ごとに計算できたね。');
        }
        gridBox.appendChild(wrap);
        msg.appendChild(h('div', { 'class': 'sd-msg-head' }, head));
        lines.forEach(function (l) { msg.appendChild(h('div', null, l)); });
      }

      function wrongExample(m) {
        var la = m.a.replace('.', '').length, lb = m.b.replace('.', '').length;
        var n = Math.max(la, lb);
        var ps = []; for (var i = n - 1; i >= 0; i--) ps.push(i);
        function rowOf(str) {
          var ds = str.replace('.', ''), cells = {};
          var dotIdx = str.indexOf('.');
          for (var j = 0; j < ds.length; j++) {
            var p = ds.length - 1 - j;
            cells[p] = { d: ds.charAt(j) };
            if (dotIdx >= 0 && j === dotIdx - 1) cells[p].dot = true;
          }
          return cells;
        }
        var g = grid(ps, [{ cells: rowOf(m.a) }, { cells: rowOf(m.b), op: OPS }, { cells: {}, cls: 'sd-hs-line' }, { cells: {}, cls: 'sd-hs-ans' }], 'sd-hs-small-grid');
        return h('div', { 'class': 'sd-hs-ng' }, [h('div', { 'class': 'sd-hs-tag sd-ng' }, '× 右はしをそろえる'), g]);
      }

      function colText(m, c) {
        var name = F.placeName(c.p), out = [];
        if (op === '+') {
          var terms = [c.da || 0, c.db || 0];
          var expr = terms.join('＋') + (c.carryIn ? '＋' + c.carryIn + '（くり上がり）' : '');
          out.push(name + '：' + expr + '＝' + c.sum);
          if (c.carryOut) out.push(c.ans + ' を書いて、1 を ' + F.placeName(c.p + 1) + ' にくり上げる。');
        } else {
          var bb = c.db || 0;
          if (c.borrowed) {
            out.push(name + '：' + c.top + ' から ' + bb + ' はひけないね。');
            if (c.chain.length) out.push(F.placeName(c.p + 1) + ' が 0 なので、' + F.placeName(c.borrowFrom) + ' から くり下げるよ。');
            else out.push(F.placeName(c.borrowFrom) + ' から 1 くり下げて、');
            out.push(c.topNow + '−' + bb + '＝' + c.ans);
          } else {
            out.push(name + '：' + c.topNow + '−' + bb + '＝' + c.ans);
          }
        }
        if (c.p === 0 && c.ans === 0 && m.ps[0] === 0) out.push('一の位の 0 は 書いておくよ。');
        return out;
      }

      load(opts.start || presets[0]);
      return { destroy: function () {} };
    }
  });
})(window.Shosu = window.Shosu || {});
