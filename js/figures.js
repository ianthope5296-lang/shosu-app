/* figures.js : ます・数直線・位取り表・ブロック・テープの SVG 図
 * Shosu.Figures.render(spec) -> SVGElement （viewBox で伸縮。幅は親に合わせる）
 */
(function (S) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var FONT = '"UD デジタル 教科書体 N-R","UD Digi Kyokasho N-R","UD デジタル 教科書体 NK-R","BIZ UDPGothic","Meiryo",sans-serif';

  /* ---------- 小さな道具 ---------- */
  function s(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }
  function txt(x, y, str, attrs) {
    var a = { x: x, y: y, 'text-anchor': 'middle', 'font-size': 20, fill: '#222' };
    if (attrs) for (var k in attrs) a[k] = attrs[k];
    return s('text', a, String(str));
  }
  function root(w, h, cls, scale) {
    var svg = s('svg', {
      xmlns: NS, viewBox: '0 0 ' + r1(w) + ' ' + r1(h), 'class': 'shosu-fig ' + (cls || ''),
      role: 'img', preserveAspectRatio: 'xMidYMid meet'
    });
    svg.style.width = '100%';
    svg.style.height = 'auto';
    svg.style.maxWidth = Math.round(w * (scale || 1.25)) + 'px';
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    svg.style.fontFamily = FONT;
    svg.style.overflow = 'visible';
    return svg;
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function decOf(v) {
    var str = String(v);
    if (/e/i.test(str)) str = Number(v).toFixed(10).replace(/0+$/, '');
    var i = str.indexOf('.');
    return i < 0 ? 0 : str.length - i - 1;
  }
  function pow10(n) { return Math.pow(10, n); }
  /* 整数 n を 10^dec で割った値の文字列（末尾の0はとる） */
  function fmtInt(n, dec) {
    var neg = n < 0; n = Math.abs(Math.round(n));
    var str = String(n);
    if (dec > 0) {
      while (str.length <= dec) str = '0' + str;
      str = str.slice(0, str.length - dec) + '.' + str.slice(str.length - dec);
      str = str.replace(/0+$/, '').replace(/\.$/, '');
    }
    return (neg ? '-' : '') + str;
  }
  function fmt(v, dec) { // 浮動小数を安全に文字列へ
    if (dec == null) dec = Math.min(6, decOf(v));
    return fmtInt(Math.round(v * pow10(dec)), dec);
  }

  var PLACE_COLORS = {
    '3': 'var(--c-thousands,#f6d5c3)', '2': 'var(--c-hundreds,#c6e3f5)', '1': 'var(--c-tens,#cdeac0)',
    '0': 'var(--c-ones,#fff3a6)', '-1': 'var(--c-tenths,#e3dcf5)', '-2': 'var(--c-hundredths,#cfc3ee)',
    '-3': 'var(--c-thousandths,#bdb3d8)'
  };
  function placeColor(p) { return PLACE_COLORS[String(p)] || '#eee'; }
  function placeOf(col) { // '0.01' -> -2, '100' -> 2
    var v = Number(col);
    return Math.round(Math.log(v) / Math.LN10);
  }
  var KANJI_PLACE = { '3': '千', '2': '百', '1': '十', '0': '一' };
  var SUB_NAME = { '-1': '小数第一位', '-2': '小数第二位', '-3': '小数第三位' };
  function placeName(p) { // 文字列の名前
    if (p >= 0) return KANJI_PLACE[p] + 'の位';
    return '1/' + pow10(-p) + 'の位';
  }

  /* 分数を縦に書く（中心 x, 分数線の y） */
  function frac(x, y, num, den, size, attrs) {
    size = size || 18;
    var g = s('g', attrs || {});
    var col = (attrs && attrs.fill) || '#222';
    var w = String(den).length * size * 0.62 + 6;
    g.appendChild(txt(x, y - 4, num, { 'font-size': size, fill: col, 'font-weight': attrs && attrs['font-weight'] }));
    g.appendChild(s('line', { x1: x - w / 2, y1: y, x2: x + w / 2, y2: y, stroke: col, 'stroke-width': 1.6 }));
    g.appendChild(txt(x, y + size * 0.95, den, { 'font-size': size, fill: col, 'font-weight': attrs && attrs['font-weight'] }));
    g._w = w;
    return g;
  }
  /* 位の名前を描く（分数つき） */
  function placeLabel(x, y, p, size, sub) {
    size = size || 18;
    var g = s('g');
    if (p >= 0) {
      g.appendChild(txt(x, y + size * 0.35, placeName(p), { 'font-size': size }));
    } else {
      var den = String(pow10(-p));
      var fw = den.length * size * 0.62 + 6;
      var tw = size * 1.9;
      var total = fw + tw;
      var fx = x - total / 2 + fw / 2;
      g.appendChild(frac(fx, y, '1', den, size * 0.85));
      g.appendChild(txt(x - total / 2 + fw + tw / 2 + 2, y + size * 0.35, 'の位', { 'font-size': size }));
      if (sub) g.appendChild(txt(x, y + size * 1.75, '(' + SUB_NAME[p] + ')', { 'font-size': size * 0.62, fill: '#555' }));
    }
    return g;
  }

  /* ---------- ます ---------- */
  var WATER = '#8fd3f4', WATER_TOP = '#3fa7dc';
  function cup(x, yb, w, h, ratio, ticks, label, opts) {
    opts = opts || {};
    var g = s('g', { 'class': 'fig-cup' });
    g.appendChild(s('rect', { x: x, y: yb - h, width: w, height: h, fill: '#fff' }));
    if (ratio > 0) {
      var wh = h * Math.min(1, ratio);
      g.appendChild(s('rect', { 'class': 'fig-water', x: x, y: yb - wh, width: w, height: wh, fill: WATER }));
      g.appendChild(s('line', { x1: x, y1: yb - wh, x2: x + w, y2: yb - wh, stroke: WATER_TOP, 'stroke-width': 2 }));
    }
    if (ticks) {
      var tg = s('g', { 'class': 'fig-ticks' + (opts.anim ? ' fig-ticks-anim' : '') });
      for (var i = 1; i < ticks; i++) {
        var ty = yb - h * i / ticks;
        var len = (i * 2 === ticks) ? w * 0.42 : w * 0.26;
        var ln = s('line', { x1: x, y1: r1(ty), x2: r1(x + len), y2: r1(ty), stroke: '#1d4f73', 'stroke-width': 1.8 });
        if (opts.anim) ln.setAttribute('style', 'animation-delay:' + (i * 0.12) + 's');
        tg.appendChild(ln);
      }
      g.appendChild(tg);
    }
    g.appendChild(s('path', {
      d: 'M' + (x - 2) + ' ' + (yb - h - 6) + ' V' + (yb + 1.5) + ' H' + (x + w + 2) + ' V' + (yb - h - 6),
      fill: 'none', stroke: '#333', 'stroke-width': 3, 'stroke-linejoin': 'round'
    }));
    if (label) g.appendChild(txt(x + w / 2, yb + 30, label, { 'font-size': opts.labelSize || 22, 'font-weight': 'bold' }));
    return g;
  }

  function masu(sp) {
    var unit = sp.unit || 'L';
    var level = sp.level || 2;
    var L = sp.L || 0, d1 = sp.d1 || 0, d2 = sp.d2 || 0, d3 = sp.d3 || 0;
    var ticksOn = sp.ticks !== false;
    var items = [];
    var i;
    var big = { w: 92, h: 200 }, mid = { w: 58, h: 112 }, sm = { w: 38, h: 66 };
    for (i = 0; i < L; i++) items.push({ size: big, ratio: 1, ticks: 10, label: '1' + unit });
    for (i = 0; i < d1; i++) items.push({ size: mid, ratio: 1, ticks: 0, label: '0.1' + unit });
    if (level === 3) {
      for (i = 0; i < d2; i++) items.push({ size: sm, ratio: 1, ticks: 0, label: '0.01' + unit, small: true });
      if (d3 > 0 || sp.partial === true) items.push({ size: sm, ratio: d3 / 10, ticks: ticksOn ? 10 : 0, label: '0.01' + unit, small: true, partial: true });
    } else {
      if ((d2 > 0 || sp.partial === true) && sp.partial !== false) items.push({ size: mid, ratio: d2 / 10, ticks: ticksOn ? 10 : 0, label: '0.1' + unit, partial: true });
    }
    if (!items.length) items.push({ size: mid, ratio: 0, ticks: 0, label: '0.1' + unit });
    var gap = 22, pad = 14, x = pad;
    var top = 16, yb = top + big.h;
    if (!L) yb = top + (items.some(function (t) { return t.size === mid; }) ? mid.h : sm.h) + 6;
    var g = s('g');
    items.forEach(function (it) {
      var c = cup(x, yb, it.size.w, it.size.h, it.ratio, it.ticks, sp.labels === false ? null : it.label,
        { anim: it.partial && sp.animTicks, labelSize: it.small ? 17 : 22 });
      if (it.partial) c.setAttribute('class', 'fig-cup fig-cup-partial');
      g.appendChild(c);
      x += it.size.w + gap;
    });
    var W = x - gap + pad, H = yb + 42;
    var svg = root(W, H, 'fig-masu', 1.15);
    svg.appendChild(g);
    return svg;
  }

  /* ---------- 数直線 ---------- */
  function numberline(sp) {
    var step = sp.step || 0.1;
    var D = Math.max(decOf(step), decOf(sp.min), decOf(sp.max));
    var f = pow10(D);
    var minI = Math.round(sp.min * f), maxI = Math.round(sp.max * f), stI = Math.round(step * f);
    var n = Math.max(1, Math.round((maxI - minI) / stI));
    var le = sp.labelEvery || 10;
    var sp1 = sp.spacing || Math.max(7, Math.min(70, 960 / n));
    var len = n * sp1;
    var padL = 46, padR = sp.unit ? 70 : 46;
    var hasPts = sp.points && sp.points.length;
    var y = (hasPts ? 92 : 52);
    var X = function (vI) { return padL + (vI - minI) / stI * sp1; };
    var g = s('g');
    g.appendChild(s('line', { x1: padL - 14, y1: y, x2: padL + len + 14, y2: y, stroke: '#222', 'stroke-width': 2.4 }));
    var labelSet = null;
    if (sp.labelValues) {
      labelSet = {};
      sp.labelValues.forEach(function (v) { labelSet[Math.round(v * f)] = 1; });
    }
    for (var i = 0; i <= n; i++) {
      var vI = minI + i * stI;
      var major = (vI % (stI * le) === 0);
      var mid = !major && le % 2 === 0 && (vI % (stI * le / 2) === 0);
      var tl = major ? 13 : mid ? 9 : 5.5;
      var x = r1(X(vI));
      g.appendChild(s('line', { x1: x, y1: y - tl, x2: x, y2: y + tl, stroke: '#222', 'stroke-width': major ? 2.2 : 1.4 }));
      var showLabel = labelSet ? labelSet[vI] : (major && !sp.hideLabels);
      if (showLabel) g.appendChild(txt(x, y - 22, fmtInt(vI, D), { 'font-size': 22 }));
    }
    if (sp.unit) g.appendChild(txt(padL + len + 30, y + 7, sp.unit, { 'font-size': 22, 'text-anchor': 'start' }));
    if (sp.highlight) {
      var hx1 = X(Math.round(sp.highlight.from * f)), hx2 = X(Math.round(sp.highlight.to * f));
      g.insertBefore(s('rect', { x: hx1, y: y - 16, width: hx2 - hx1, height: 32, fill: '#ffe08a', opacity: 0.7, rx: 4 }), g.firstChild);
    }
    var maxLevel = 0;
    if (sp.arrows && sp.arrows.length) {
      var arr = sp.arrows.map(function (a) {
        var lab = String(a.label != null ? a.label : '');
        return { x: X(a.v * f), label: lab, w: Math.max(36, lab.length * 13 + 16), color: a.color };
      }).sort(function (a, b) { return a.x - b.x; });
      var levels = [];
      arr.forEach(function (a) {
        var lv = 0;
        while (levels[lv] != null && a.x - a.w / 2 < levels[lv] + 6) lv++;
        levels[lv] = a.x + a.w / 2;
        a.lv = lv; if (lv > maxLevel) maxLevel = lv;
      });
      arr.forEach(function (a) {
        var col = a.color || '#d9480f';
        var ly = y + 62 + a.lv * 44;
        g.appendChild(s('line', { x1: a.x, y1: y + 9, x2: a.x, y2: ly - 18, stroke: col, 'stroke-width': 3 }));
        g.appendChild(s('path', { d: 'M' + a.x + ' ' + (y + 4) + ' l-7 13 h14 z', fill: col }));
        if (a.label.length <= 1) {
          g.appendChild(s('circle', { cx: a.x, cy: ly, r: 17, fill: '#fff', stroke: col, 'stroke-width': 2.5 }));
        } else {
          g.appendChild(s('rect', { x: a.x - a.w / 2, y: ly - 17, width: a.w, height: 34, rx: 17, fill: '#fff', stroke: col, 'stroke-width': 2.5 }));
        }
        g.appendChild(txt(a.x, ly + 7, a.label, { 'font-size': 20, 'font-weight': 'bold', fill: col }));
      });
    }
    if (hasPts) {
      sp.points.forEach(function (p) {
        var px = X(p.v * f);
        g.appendChild(s('circle', { cx: px, cy: y, r: 7, fill: p.color || '#1971c2', stroke: '#fff', 'stroke-width': 2 }));
        if (p.label != null) g.appendChild(txt(px, y - 52, p.label, { 'font-size': 20, 'font-weight': 'bold', fill: p.color || '#1971c2' }));
      });
    }
    var H = y + (sp.arrows && sp.arrows.length ? 86 + maxLevel * 44 : 26);
    var svg = root(padL + len + padR, H, 'fig-numberline', 1.2);
    svg.appendChild(g);
    return svg;
  }

  /* ---------- 位取り表 ---------- */
  function splitNum(str) {
    str = String(str);
    var i = str.indexOf('.');
    return { ip: i < 0 ? str : str.slice(0, i), dp: i < 0 ? '' : str.slice(i + 1) };
  }
  function digitAt(str, p) {
    var n = splitNum(str);
    if (p >= 0) {
      var k = n.ip.length - 1 - p;
      return k >= 0 ? n.ip.charAt(k) : '';
    }
    return n.dp.charAt(-p - 1) || '';
  }
  function placeTable(sp) {
    var cols = sp.cols || ['1', '0.1', '0.01', '0.001'];
    var rows = sp.rows || [];
    var ps = cols.map(placeOf);
    var cw = sp.cellWidth || 92, hh = sp.sub ? 84 : 66, rh = 72;
    var lw = sp.rowLabels ? 70 : 0;
    var W = lw + cw * cols.length + 4, H = hh + rh * Math.max(1, rows.length) + 4;
    var svg = root(W, H, 'fig-placetable', 1.1);
    var hl = sp.highlightCol;
    var hlIdx = [];
    [].concat(hl == null ? [] : hl).forEach(function (h) {
      var idx = typeof h === 'number' ? h : cols.indexOf(String(h));
      if (idx >= 0) hlIdx.push(idx);
    });
    var ox = 2 + lw, oy = 2;
    ps.forEach(function (p, c) {
      var x = ox + c * cw;
      svg.appendChild(s('rect', { x: x, y: oy, width: cw, height: hh, fill: placeColor(p), stroke: '#555', 'stroke-width': 1.5 }));
      svg.appendChild(s('rect', { x: x, y: oy + hh, width: cw, height: rh * Math.max(1, rows.length), fill: '#fff', stroke: '#555', 'stroke-width': 1.5 }));
      svg.appendChild(placeLabel(x + cw / 2, oy + (p < 0 ? 30 : hh / 2), p, 19, sp.sub));
    });
    rows.forEach(function (r, ri) {
      var y = oy + hh + rh * ri;
      if (ri > 0) svg.appendChild(s('line', { x1: ox, y1: y, x2: ox + cw * cols.length, y2: y, stroke: '#999', 'stroke-width': 1 }));
      if (sp.rowLabels) svg.appendChild(txt(lw / 2 + 2, y + rh / 2 + 8, sp.rowLabels[ri] || '', { 'font-size': 22, 'font-weight': 'bold' }));
      ps.forEach(function (p, c) {
        var d = digitAt(r, p);
        if (d) svg.appendChild(txt(ox + c * cw + cw / 2, y + rh / 2 + 15, d, { 'font-size': 44 }));
      });
      var one = ps.indexOf(0);
      if (one >= 0 && one < ps.length - 1 && splitNum(r).dp.length) {
        svg.appendChild(s('circle', { cx: ox + (one + 1) * cw, cy: y + rh / 2 + 14, r: 5, fill: '#222' }));
      }
    });
    hlIdx.forEach(function (c) {
      svg.appendChild(s('rect', { x: ox + c * cw + 2, y: oy + 2, width: cw - 4, height: hh + rh * Math.max(1, rows.length) - 4, fill: 'none', stroke: '#f08c00', 'stroke-width': 5, rx: 6 }));
    });
    return svg;
  }

  /* ---------- ブロック（斜めから見た図） ---------- */
  var DX = 0.5, DY = -0.38;
  function box(x, y, w, h, d, color, u, cls) {
    var g = s('g', { 'class': cls || '' });
    var ddx = d * DX, ddy = d * DY;
    var stroke = '#555';
    function poly(pts, fill, extra) {
      var a = { points: pts.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join(' '), fill: fill, stroke: stroke, 'stroke-width': 1.2, 'stroke-linejoin': 'round' };
      if (extra) for (var k in extra) a[k] = extra[k];
      return s('polygon', a);
    }
    var front = [[x, y], [x + w, y], [x + w, y - h], [x, y - h]];
    var top = [[x, y - h], [x + w, y - h], [x + w + ddx, y - h + ddy], [x + ddx, y - h + ddy]];
    var right = [[x + w, y], [x + w + ddx, y + ddy], [x + w + ddx, y - h + ddy], [x + w, y - h]];
    g.appendChild(poly(front, color));
    g.appendChild(poly(top, color)); g.appendChild(poly(top, 'rgba(255,255,255,0.45)'));
    g.appendChild(poly(right, color)); g.appendChild(poly(right, 'rgba(0,0,0,0.16)'));
    if (u) {
      var gl = s('g', { stroke: 'rgba(60,60,60,0.45)', 'stroke-width': 0.7 });
      var i, t;
      for (i = u; i < w - 0.1; i += u) { // 縦線（前・上）
        gl.appendChild(s('line', { x1: x + i, y1: y, x2: x + i, y2: y - h }));
        gl.appendChild(s('line', { x1: x + i, y1: y - h, x2: x + i + ddx, y2: y - h + ddy }));
      }
      for (i = u; i < h - 0.1; i += u) { // 横線（前・右）
        gl.appendChild(s('line', { x1: x, y1: y - i, x2: x + w, y2: y - i }));
        gl.appendChild(s('line', { x1: x + w, y1: y - i, x2: x + w + ddx, y2: y - i + ddy }));
      }
      for (i = u; i < d - 0.1; i += u) { // 奥行き方向
        t = i / d;
        gl.appendChild(s('line', { x1: x + ddx * t, y1: y - h + ddy * t, x2: x + w + ddx * t, y2: y - h + ddy * t }));
        gl.appendChild(s('line', { x1: x + w + ddx * t, y1: y + ddy * t, x2: x + w + ddx * t, y2: y - h + ddy * t }));
      }
      g.appendChild(gl);
    }
    return g;
  }
  var U = 8; // 0.001 の立方体の1辺
  var BLOCK_DEF = {
    '1': { w: 10 * U, h: 10 * U, d: 10 * U, p: 0 },
    '0.1': { w: 10 * U, h: U, d: 10 * U, p: -1 },
    '0.01': { w: 10 * U, h: U, d: U, p: -2 },
    '0.001': { w: U, h: U, d: U, p: -3 }
  };
  /* 1種類のブロックの集まりを描く。戻り値 {g, w, h}（左下が原点） */
  function blockGroup(key, n) {
    var b = BLOCK_DEF[key], g = s('g'), col = placeColor(b.p);
    var ddx = b.d * DX, ddy = -b.d * DY;
    var i, w = 0, h = 0;
    if (key === '1') {
      var perRow = 5, rows = Math.ceil(n / perRow) || 0;
      for (i = 0; i < n; i++) {
        var r = Math.floor(i / perRow), c = i % perRow;
        var x = c * (b.w + 10), y = -(rows - 1 - r) * (b.h + ddy + 10);
        g.appendChild(box(x, y, b.w, b.h, b.d, col, U));
      }
      w = Math.min(n, perRow) * (b.w + 10) - 10 + ddx; h = rows * (b.h + ddy + 10) - 10;
    } else if (key === '0.1' || key === '0.01') {
      var gap = key === '0.1' ? 3 : 5;
      for (i = 0; i < n; i++) g.appendChild(box(0, -i * (b.h + gap), b.w, b.h, b.d, col, U));
      w = b.w + ddx; h = n ? n * (b.h + gap) - gap + ddy : 0;
    } else {
      var per = 5;
      for (i = 0; i < n; i++) {
        var rr = Math.floor(i / per), cc = i % per;
        g.appendChild(box(cc * (U + 6), -rr * (U + 8), b.w, b.h, b.d, col, 0));
      }
      w = Math.min(n, per) * (U + 6) - 6 + U * DX; h = Math.ceil(n / per) * (U + 8) - 8 + U * -DY;
    }
    return { g: g, w: Math.max(w, 0), h: Math.max(h, 0) };
  }
  function blocks(sp) {
    var counts = sp.counts || {};
    var keys = ['1', '0.1', '0.01', '0.001'].filter(function (k) { return !sp.hideZero || counts[k]; });
    var groups = keys.map(function (k) { return { k: k, n: counts[k] || 0, bg: blockGroup(k, counts[k] || 0) }; });
    var maxH = Math.max(90, Math.max.apply(null, groups.map(function (g) { return g.bg.h; })));
    var x = 14, gap = 40, base = maxH + 16;
    var svg = s('g');
    groups.forEach(function (gr) {
      var gw = Math.max(gr.bg.w, 90);
      var off = (gw - gr.bg.w) / 2;
      gr.bg.g.setAttribute('transform', 'translate(' + r1(x + off) + ',' + r1(base) + ')');
      svg.appendChild(gr.bg.g);
      if (sp.labels !== false) {
        var cx = x + gw / 2;
        svg.appendChild(s('rect', { x: cx - 44, y: base + 12, width: 88, height: 34, rx: 8, fill: placeColor(BLOCK_DEF[gr.k].p), stroke: '#777' }));
        svg.appendChild(txt(cx, base + 37, gr.k, { 'font-size': 22, 'font-weight': 'bold' }));
        svg.appendChild(txt(cx, base + 74, gr.n + 'こ', { 'font-size': 22, fill: gr.n ? '#222' : '#999' }));
      }
      x += gw + gap;
    });
    var W = x - gap + 14, H = base + (sp.labels !== false ? 86 : 16);
    var out = root(W, H, 'fig-blocks', 1.1);
    out.appendChild(svg);
    return out;
  }

  /* ---------- テープ図 ---------- */
  function tape(sp) {
    var from = sp.from || 0, to = sp.to == null ? 1 : sp.to;
    var D = Math.max(1, decOf(from), decOf(to));
    var f = 10; // 0.1 ごとの目もり
    var n = Math.round((to - from) * f);
    var len = 900, padL = 40, padR = sp.unit ? 70 : 40;
    var X = function (v) { return padL + (v - from) / (to - from) * len; };
    var y0 = 56, th = 44;
    var svg = root(padL + len + padR, y0 + th + 70, 'fig-tape', 1.2);
    svg.appendChild(s('rect', { x: padL, y: y0, width: len, height: th, fill: '#fff', stroke: '#333', 'stroke-width': 2 }));
    if (sp.value != null) {
      svg.appendChild(s('rect', { 'class': 'fig-tape-fill', x: padL, y: y0, width: r1(X(sp.value) - padL), height: th, fill: sp.color || '#ffc9a8', stroke: '#333', 'stroke-width': 2 }));
      var vx = X(sp.value);
      svg.appendChild(s('path', { d: 'M' + r1(vx) + ' ' + (y0 - 4) + ' l-8 -14 h16 z', fill: '#d9480f' }));
      svg.appendChild(txt(vx, y0 - 24, (sp.valueLabel != null ? sp.valueLabel : fmt(sp.value) + (sp.unit || '')), { 'font-size': 22, 'font-weight': 'bold', fill: '#d9480f' }));
    }
    var ly = y0 + th;
    for (var i = 0; i <= n; i++) {
      var vI = Math.round(from * f) + i;
      var major = vI % 10 === 0, mid = vI % 5 === 0;
      var x = r1(X(vI / f));
      svg.appendChild(s('line', { x1: x, y1: ly, x2: x, y2: ly + (major ? 16 : mid ? 11 : 7), stroke: '#333', 'stroke-width': major ? 2 : 1.2 }));
      if (major) svg.appendChild(txt(x, ly + 40, fmtInt(vI, 1), { 'font-size': 22 }));
    }
    if (sp.unit) svg.appendChild(txt(padL + len + 30, ly + 40, sp.unit, { 'font-size': 22, 'text-anchor': 'start' }));
    return svg;
  }

  var KINDS = { masu: masu, numberline: numberline, placeTable: placeTable, blocks: blocks, tape: tape };

  function render(spec) {
    var fn = spec && KINDS[spec.kind];
    if (!fn) {
      var d = document.createElement('div');
      d.textContent = '（図: ' + (spec && spec.kind) + '）';
      return d;
    }
    try {
      return fn(spec);
    } catch (e) {
      if (window.console) console.error('Figures.render', spec, e);
      var er = document.createElement('div');
      er.textContent = '（図を表示できません）';
      return er;
    }
  }

  S.Figures = {
    render: render,
    util: {
      s: s, txt: txt, root: root, frac: frac, placeLabel: placeLabel, placeName: placeName,
      placeColor: placeColor, placeOf: placeOf, fmtInt: fmtInt, fmt: fmt, decOf: decOf,
      cup: cup, box: box, blockGroup: blockGroup, BLOCK_DEF: BLOCK_DEF, digitAt: digitAt, FONT: FONT
    }
  };
})(window.Shosu = window.Shosu || {});
