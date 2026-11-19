/* generators.js — 似た問題の自動生成（担当D）
 * Shosu.Generators.make(name, rng?) -> problem
 * Shosu.Generators.names()
 * 小数の計算は、浮動小数の誤差をさけるため整数（100倍・1000倍）で行い、文字列にする。
 * 生成した問題には src（再検証用の元データ）を付ける。
 */
(function (S) {
  'use strict';

  // ---------- 小数のための道具 ----------
  var POW = [1, 10, 100, 1000, 10000, 100000, 1000000];

  // 整数 n を 10^e でわった小数を文字列に（末尾の0は取る）
  function fmt(n, e) {
    if (e === undefined) e = 3;
    var neg = n < 0;
    var s = String(Math.abs(Math.round(n)));
    while (s.length <= e) s = '0' + s;
    var ip = s.slice(0, s.length - e);
    var fp = s.slice(s.length - e).replace(/0+$/, '');
    var out = fp ? ip + '.' + fp : ip;
    return neg ? '-' + out : out;
  }

  // 小数の文字列を 10^e 倍した整数に
  function parse(str, e) {
    if (e === undefined) e = 3;
    str = String(str);
    var m = /^(\d*)(?:\.(\d*))?$/.exec(str);
    if (!m) throw new Error('bad decimal: ' + str);
    var ip = m[1] || '0';
    var fp = m[2] || '';
    if (fp.length > e) throw new Error('too many decimals: ' + str + ' (e=' + e + ')');
    while (fp.length < e) fp += '0';
    return parseInt(ip, 10) * POW[e] + (fp ? parseInt(fp, 10) : 0);
  }

  function decimals(str) {
    var i = String(str).indexOf('.');
    return i < 0 ? 0 : String(str).length - i - 1;
  }

  function ri(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  function shuffle(rng, arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // 重み付き選択 [[weight, value], ...]
  function wpick(rng, list) {
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += list[i][0];
    var r = rng() * sum;
    for (i = 0; i < list.length; i++) {
      r -= list[i][0];
      if (r < 0) return list[i][1];
    }
    return list[list.length - 1][1];
  }

  function hashStr(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  var PLACE_NAMES = ['一の位', '小数第一位', '小数第二位', '小数第三位'];
  var UNIT_STR = ['1', '0.1', '0.01', '0.001'];

  // 筆算のヒント（固定問題でも使う）
  function hissanHints(op, a, b) {
    var h = [];
    var da = decimals(a), db = decimals(b);
    if (da !== db) {
      h.push('小数点の位置をたてにそろえて書こう。' + (da === 0 || db === 0 ? '整数は「' + (da === 0 ? a : b) + '.00」と考えるといいよ。' : 'けたの数がちがうときは、右はしをそろえないよ。'));
    } else {
      h.push('小数点の位置をたてにそろえて書こう。');
    }
    if (op === '+') {
      h.push('整数のたし算と同じように、いちばん右の位から計算しよう。くり上がりに気をつけよう。');
    } else {
      h.push('整数のひき算と同じように、いちばん右の位から計算しよう。ひけないときは、1つ上の位からくり下げよう。');
    }
    h.push('答えの小数点は、上の小数点にそろえて打とう。小数点より右のいちばん後ろが0なら、0は消しておこう。');
    return h;
  }

  function finish(name, p) {
    p.id = 'G-' + name + '-' + hashStr(JSON.stringify(p.src) + p.type);
    p.src.gen = name;
    return p;
  }

  // ---------- 各生成器 ----------
  var gens = {};

  // ますの図を読む
  gens.masuRead = function (rng) {
    var level = rng() < 0.3 ? 3 : 2;
    var L, d1, d2, d3 = 0, total;
    for (var t = 0; t < 50; t++) {
      L = wpick(rng, [[2, 0], [4, 1], [3, 2], [2, 3]]);
      d1 = rng() < 0.15 ? 0 : ri(rng, 1, 9);
      d2 = ri(rng, 0, 9);
      if (level === 3) d3 = ri(rng, 1, 9);
      if (level === 2 && d2 === 0 && rng() < 0.8) d2 = ri(rng, 1, 9);
      total = L * 1000 + d1 * 100 + d2 * 10 + d3;
      if (total > 0 && !(level === 2 && d2 === 0 && d1 === 0)) break;
    }
    var fig = { kind: 'masu', unit: 'L', L: L, d1: d1, d2: d2, level: level };
    if (level === 3) fig.d3 = d3;
    var hints;
    if (level === 2) {
      hints = [
        '1Lますが何こ、0.1Lますが何こあるかな？',
        'いちばん右のますは、0.1Lを10等分しているよ。小さい目もり1つ分は0.01Lだね。',
        '0.01Lが何こ分かを数えて、1L・0.1Lの分と合わせよう。'
      ];
    } else {
      hints = [
        '1Lます、0.1Lます、0.01Lますがそれぞれ何こあるかな？',
        'いちばん右のますは、0.01Lを10等分しているよ。小さい目もり1つ分は0.001Lだね。',
        '0.001Lが何こ分かを数えて、ほかの分と合わせよう。'
      ];
    }
    return finish('masuRead', {
      type: 'fill', tag: 'hyoshikata',
      q: 'かさは何Lですか。',
      fig: fig,
      parts: [{ a: fmt(total, 3) }, 'L'],
      hints: hints,
      src: { L: L, d1: d1, d2: d2, d3: d3, level: level }
    });
  };

  // 単位のかんさん
  // 単位の大きさ（基本単位に対する10のべき）
  var UNITS = {
    km: { dim: 'len', k: 6 }, m: { dim: 'len', k: 3 }, cm: { dim: 'len', k: 1 }, mm: { dim: 'len', k: 0 },
    kg: { dim: 'wt', k: 3 }, g: { dim: 'wt', k: 0 },
    L: { dim: 'vol', k: 3 }, dL: { dim: 'vol', k: 2 }, mL: { dim: 'vol', k: 0 }
  };
  function unitAnswer(from, to) {
    // from: [[valueStr, unit], ...]
    var total = 0;
    for (var i = 0; i < from.length; i++) {
      var u = UNITS[from[i][1]];
      var dec = decimals(from[i][0]);
      total += parse(from[i][0], dec) * POW[u.k] / POW[dec];
    }
    return fmt(total, UNITS[to].k);
  }

  gens.unitConvert = function (rng) {
    var kind = wpick(rng, [
      [3, 'mcm'], [1, 'cm'], [2, 'mm'], [3, 'km'], [3, 'kgg'], [2, 'g'], [1, 'mL'], [2, 'rev']
    ]);
    var from, to, hints, n;
    switch (kind) {
      case 'mcm': // 2m83cm -> m
        n = ri(rng, 1, 99);
        from = [[String(ri(rng, 1, 9)), 'm'], [String(n), 'cm']];
        to = 'm';
        hints = ['1cm＝0.01m、10cm＝0.1m だよ。', n + 'cmは、0.01mが何こ分かな？', 'mの分と合わせて、小数で表そう。'];
        break;
      case 'cm':
        n = rng() < 0.4 ? ri(rng, 1, 9) : ri(rng, 11, 99);
        from = [[String(n), 'cm']];
        to = 'm';
        hints = ['1cm＝0.01m だよ。', n + 'cmは、0.01mが何こ分かな？'];
        break;
      case 'mm':
        n = rng() < 0.6 ? ri(rng, 1001, 9999) : ri(rng, 101, 999);
        if (n % 10 === 0) n += 1;
        from = [[String(n), 'mm']];
        to = 'm';
        hints = ['1mm＝0.001m だよ。', '1000mmで1mだね。' + n + 'mmは、1mが何こと、0.001mが何こ分かな？'];
        break;
      case 'km':
        n = wpick(rng, [[3, ri(rng, 1001, 9999)], [1, ri(rng, 10001, 99999)], [1, ri(rng, 101, 999)]]);
        if (n % 10 === 0 && rng() < 0.7) n += ri(rng, 1, 9);
        from = [[String(n), 'm']];
        to = 'km';
        hints = ['1m＝0.001km だよ。', '1000mで1kmだね。1kmが何こと、0.001kmが何こ分かな？', '位の表に数字をあてはめて考えよう。'];
        break;
      case 'kgg':
        n = rng() < 0.2 ? ri(rng, 1, 99) : ri(rng, 101, 999);
        from = [[String(rng() < 0.8 ? ri(rng, 1, 9) : ri(rng, 10, 49)), 'kg'], [String(n), 'g']];
        to = 'kg';
        hints = ['1g＝0.001kg だよ。', n + 'gは、0.001kgが何こ分かな？', 'kgの分と合わせて、小数で表そう。'];
        break;
      case 'g':
        n = ri(rng, 11, 999);
        from = [[String(n), 'g']];
        to = 'kg';
        hints = ['1g＝0.001kg だよ。', n + 'gは、0.001kgが何こ分かな？'];
        break;
      case 'mL':
        n = ri(rng, 11, 1999);
        from = [[String(n), 'mL']];
        to = 'L';
        hints = ['1000mL＝1L、1mL＝0.001L だよ。', n + 'mLは、0.001Lが何こ分かな？'];
        break;
      default: { // rev: km->m, kg->g, L->mL
        var r = pick(rng, [['km', 'm'], ['kg', 'g'], ['L', 'mL']]);
        var v = ri(rng, 1001, 9999);
        if (rng() < 0.5) v = v - (v % 10);
        var vs = fmt(v, 3);
        if (vs.indexOf('.') < 0) vs = fmt(v + 1, 3);
        from = [[vs, r[0]]];
        to = r[1];
        hints = ['1' + r[0] + '＝1000' + r[1] + ' だよ。', '0.001' + r[0] + 'は1' + r[1] + 'だね。' + vs + r[0] + 'は、0.001' + r[0] + 'が何こ分かな？'];
      }
    }
    var desc = from.map(function (f) { return f[0] + f[1]; }).join('');
    return finish('unitConvert', {
      type: 'fill', tag: 'hyoshikata',
      q: '□にあてはまる数を書きましょう。',
      parts: [desc + '＝', { a: unitAnswer(from, to) }, to],
      hints: hints,
      src: { from: from, to: to }
    });
  };

  // 1を□こ、0.1を□こ…合わせた数
  gens.compose = function (rng) {
    var c = [ri(rng, 0, 9), ri(rng, 0, 9), ri(rng, 0, 9), ri(rng, 1, 9)];
    if (rng() < 0.7 && c[1] === 0) c[1] = ri(rng, 1, 9);
    if (rng() < 0.7 && c[2] === 0) c[2] = ri(rng, 1, 9);
    if (rng() < 0.25) c[pick(rng, [1, 2])] = 0; // 空位
    if (rng() < 0.3) c[0] = 0;
    var useL3 = rng() < 0.2; // 小数第二位までの数
    if (useL3) c[3] = 0;
    if (c[0] + c[1] + c[2] + c[3] === 0) c[2] = 3;
    var txt = [];
    for (var i = 0; i < 4; i++) if (c[i]) txt.push(UNIT_STR[i] + 'を' + c[i] + 'こ');
    var total = c[0] * 1000 + c[1] * 100 + c[2] * 10 + c[3];
    var hints = [
      '1、0.1、0.01、0.001 は、それぞれ一の位、小数第一位、小数第二位、小数第三位だよ。',
      '位の表に、それぞれのこ数を書きこんでみよう。'
    ];
    if (c.indexOf(0) >= 0 && c.indexOf(0) < 3) hints.push('出てこない位には0を書くのをわすれないでね。');
    return finish('compose', {
      type: 'fill', tag: 'shikumi',
      q: '□にあてはまる数を書きましょう。',
      parts: [txt.join('、') + '合わせた数は', { a: fmt(total, 3) }, 'です。'],
      hints: hints,
      src: { counts: c }
    });
  };

  // 数を分ける（数の構成・位）
  gens.decompose = function (rng) {
    var d = [ri(rng, 1, 9), ri(rng, 1, 9), ri(rng, 0, 9), ri(rng, 1, 9)];
    if (rng() < 0.2) d[pick(rng, [1, 2])] = 0;
    var x = fmt(d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3], 3);
    var kind = wpick(rng, [[3, 'fill'], [2, 'choice'], [1, 'digit']]);
    var p;
    if (kind === 'fill') {
      var parts = [x + 'は、'];
      var first = true;
      for (var i = 0; i < 4; i++) {
        if (!d[i]) continue;
        parts.push((first ? '' : '、') + UNIT_STR[i] + 'を');
        parts.push({ a: String(d[i]) });
        parts.push('こ');
        first = false;
      }
      parts.push('合わせた数です。');
      p = {
        type: 'fill', tag: 'shikumi',
        q: '□にあてはまる数を書きましょう。',
        parts: parts,
        hints: ['位の表に' + x + 'を書いてみよう。', '一の位の数字は1のこ数、小数第一位の数字は0.1のこ数だよ。'],
        src: { x: x, kind: kind }
      };
    } else {
      // 数字が1回だけ出てくる位を選ぶ
      var cand = [];
      for (var j = 0; j < 4; j++) {
        var cnt = 0;
        for (var k = 0; k < 4; k++) if (d[k] === d[j]) cnt++;
        if (cnt === 1 && d[j] !== 0) cand.push(j);
      }
      if (!cand.length || kind === 'digit') {
        var pos = ri(rng, 1, 3);
        p = {
          type: 'fill', tag: 'shikumi',
          q: '□にあてはまる数字を書きましょう。',
          parts: [x + 'の' + PLACE_NAMES[pos] + 'の数字は', { a: String(d[pos]) }, 'です。'],
          hints: ['小数点のすぐ右が小数第一位（1/10の位）だよ。', 'そこから右へ、小数第二位（1/100の位）、小数第三位（1/1000の位）とつづくよ。'],
          src: { x: x, kind: 'digit', pos: pos }
        };
      } else {
        var pc = pick(rng, cand);
        p = {
          type: 'choice', tag: 'shikumi',
          q: x + 'の「' + d[pc] + '」は、何の位の数字ですか。',
          options: PLACE_NAMES.slice(),
          a: PLACE_NAMES[pc],
          hints: ['小数点のすぐ右が小数第一位（1/10の位）だよ。', '小数点から右へいくつ目かな？'],
          src: { x: x, kind: 'choice', pos: pc }
        };
      }
    }
    return finish('decompose', p);
  };

  // 0.01を何こ集めた数？
  gens.countUnits = function (rng) {
    var unitE = wpick(rng, [[1, 1], [3, 2], [3, 3]]); // 0.1 / 0.01 / 0.001
    var n = wpick(rng, [[3, ri(rng, 11, 99)], [4, ri(rng, 101, 999)], [2, ri(rng, 1001, 9999)]]);
    if (rng() < 0.15) n = ri(rng, 1, 9) * POW[unitE]; // 整数
    var x = fmt(n, unitE);
    var u = UNIT_STR[unitE];
    var reverse = rng() < 0.3;
    var p;
    if (!reverse) {
      p = {
        type: 'fill', tag: 'shikumi',
        q: '□にあてはまる数を書きましょう。',
        parts: [x + 'は、' + u + 'を', { a: String(n) }, 'こ集めた数です。'],
        hints: [
          '1は' + u + 'を' + POW[unitE] + 'こ集めた数だよ。',
          '位ごとに考えよう。それぞれの位の数は、' + u + 'が何こ分かな？',
          '全部のこ数を合わせよう。'
        ],
        src: { x: x, e: unitE, reverse: false }
      };
    } else {
      p = {
        type: 'fill', tag: 'shikumi',
        q: '□にあてはまる数を書きましょう。',
        parts: [u + 'を' + n + 'こ集めた数は', { a: x }, 'です。'],
        hints: [
          u + 'を' + POW[unitE] + 'こ集めると1になるよ。',
          n + 'こを、' + POW[unitE] + 'こずつのまとまりと、のこりに分けて考えよう。'
        ],
        src: { x: x, e: unitE, reverse: true, n: n }
      };
    }
    return finish('countUnits', p);
  };

  // 大小（不等号）
  function randDec(rng, maxInt, e) {
    return ri(rng, 0, maxInt) * 1000 + ri(rng, 0, POW[e] - 1) * POW[3 - e];
  }
  gens.compare = function (rng) {
    var x, y, t;
    var kind = wpick(rng, [[3, 'prefix'], [3, 'len'], [2, 'int'], [2, 'random']]);
    for (t = 0; t < 100; t++) {
      if (kind === 'prefix') { // 0.43 と 0.425 / 0.432
        var base = ri(rng, 0, 9) * 1000 + ri(rng, 1, 99) * 10;
        x = base;
        y = base + (rng() < 0.5 ? ri(rng, 1, 9) : -ri(rng, 1, 9));
      } else if (kind === 'len') { // 0.21 と 0.189
        var ip = ri(rng, 0, 9) * 1000;
        x = ip + ri(rng, 1, 9) * 100 + ri(rng, 0, 9) * 10;
        y = ip + ri(rng, 0, 9) * 100 + ri(rng, 10, 99);
      } else if (kind === 'int') { // 2.395 と 2.5
        var ii = ri(rng, 0, 9) * 1000;
        x = ii + ri(rng, 1, 9) * 100;
        y = ii + ri(rng, 100, 999);
      } else {
        x = randDec(rng, 9, ri(rng, 1, 3));
        y = randDec(rng, 9, ri(rng, 1, 3));
      }
      if (x !== y && x >= 0 && y >= 0 && x % 1000 !== 0 && y % 1000 !== 0) break;
    }
    if (rng() < 0.5) { t = x; x = y; y = t; }
    var xs = fmt(x, 3), ys = fmt(y, 3);
    return finish('compare', {
      type: 'choice', tag: 'daisho',
      q: '□にあてはまる不等号を選びましょう。　' + xs + ' □ ' + ys,
      fig: rng() < 0.4 ? { kind: 'placeTable', cols: ['1', '0.1', '0.01', '0.001'], rows: [xs, ys], highlightCol: null } : undefined,
      options: ['>', '<', '='],
      a: x > y ? '>' : '<',
      hints: [
        '小数点の位置をそろえて、たてにならべて書いてみよう。',
        '上の位（一の位→小数第一位→小数第二位…）から順にくらべよう。',
        'はじめて数字がちがう位で、数字が大きいほうが大きい数だよ。'
      ],
      src: { x: xs, y: ys }
    });
  };

  // 大きい順・小さい順にならべる
  gens.order = function (rng) {
    var cnt = ri(rng, 4, 5);
    var kind = rng() < 0.4 ? 'shift' : 'mix';
    var vals = [], t;
    if (kind === 'shift') { // 5, 0.5, 0.05 ... のように同じ数字
      var d = ri(rng, 1, 9);
      var pool = [d * 1000, d * 100, d * 10, d, 0, d * 10000, d * 1000 + d * 10, d * 100 + d];
      vals = shuffle(rng, pool.slice(0, 6)).slice(0, cnt);
    } else {
      var ip = ri(rng, 0, 3);
      for (t = 0; t < 200 && vals.length < cnt; t++) {
        var e = ri(rng, 1, 3);
        var v = (ip + ri(rng, 0, 1)) * 1000 + ri(rng, 1, POW[e] - 1) * POW[3 - e];
        if (vals.indexOf(v) < 0) vals.push(v);
      }
    }
    var dir = rng() < 0.6 ? 'desc' : 'asc';
    var items = vals.map(function (v) { return fmt(v, 3); });
    return finish('order', {
      type: 'order', tag: 'daisho',
      q: (dir === 'desc' ? '大きい順' : '小さい順') + 'にならべましょう。',
      items: items,
      dir: dir,
      hints: [
        '小数点の位置をそろえて、たてにならべて書いてみよう。',
        '上の位から順にくらべよう。',
        '数直線に表すと、右にあるほど大きい数だよ。'
      ],
      src: { items: items, dir: dir }
    });
  };

  // 10倍・100倍・1000倍・1/10
  gens.times10 = function (rng) {
    var op = wpick(rng, [[3, '10'], [2, '100'], [2, '1000'], [3, '1/10']]);
    var x;
    if (op === '1/10') {
      x = wpick(rng, [[3, ri(rng, 11, 99) * 10], [3, ri(rng, 101, 999) * 10], [1, ri(rng, 1001, 9999) * 10]]);
    } else {
      x = wpick(rng, [[3, ri(rng, 11, 99) * 10], [3, ri(rng, 101, 999) * 10], [2, ri(rng, 1001, 9999)], [1, ri(rng, 101, 999)]]);
    }
    if (x % 1000 === 0) x += 10;
    var xs = fmt(x, 3);
    var ans = op === '1/10' ? fmt(x, 4) : fmt(x * parseInt(op, 10), 3);
    var label = op === '1/10' ? '1/10にした数' : op + '倍した数';
    var hints = op === '1/10'
      ? ['1/10にすると、どの数字も位が1つ下がるよ。', '小数点が左に1つうつると考えてもいいね。', '位の表に書いて、数字を1つ右の位へうごかしてみよう。']
      : ['10倍すると、どの数字も位が1つ上がるよ。' + (op !== '10' ? op + '倍は、10倍を何回すること？' : ''),
         '小数点が右に' + (op.length - 1) + 'つうつると考えてもいいね。',
         '位の表に書いて、数字を左の位へうごかしてみよう。'];
    return finish('times10', {
      type: 'fill', tag: 'jubai',
      q: '□にあてはまる数を書きましょう。',
      fig: rng() < 0.3 ? { kind: 'placeTable', cols: ['1000', '100', '10', '1', '0.1', '0.01', '0.001'], rows: [xs], highlightCol: null } : undefined,
      parts: [xs + 'を' + label + 'は', { a: ans }, 'です。'],
      hints: hints,
      src: { x: xs, op: op }
    });
  };

  // 数直線を読む
  gens.numberlineRead = function (rng) {
    var kind = wpick(rng, [[1, 1], [4, 2], [3, 3]]); // 目もり 0.1 / 0.01 / 0.001
    var stepM = POW[3 - kind]; // 1000倍した目もり
    var big = stepM * 10;
    var span = kind === 1 ? 2 : (rng() < 0.5 ? 2 : 3); // 大目もり何つ分
    var min;
    if (kind === 1) min = ri(rng, 0, 5) * 1000;
    else if (kind === 2) min = ri(rng, 0, 50) * 100;
    else min = ri(rng, 0, 500) * 10;
    var max = min + big * span;
    var n = span * 10;
    var i;
    do { i = ri(rng, 1, n - 1); } while (i % 10 === 0);
    var v = min + i * stepM;
    var unit = pick(rng, ['', 'm', 'L', 'kg']);
    var label = 'あ';
    var fig = {
      kind: 'numberline', min: Number(fmt(min, 3)), max: Number(fmt(max, 3)),
      step: Number(fmt(stepM, 3)), labelEvery: 10,
      arrows: [{ v: Number(fmt(v, 3)), label: label }]
    };
    if (unit) fig.unit = unit;
    var parts = ['あの目もりが表す' + (unit ? '大きさ' : '数') + 'は', { a: fmt(v, 3) }];
    parts.push(unit ? unit + 'です。' : 'です。');
    return finish('numberlineRead', {
      type: 'fill', tag: 'hyoshikata',
      q: '数直線の目もりを読みましょう。',
      fig: fig,
      parts: parts,
      hints: [
        '数が書いてある目もりと目もりの間は、いくつに分かれているかな？',
        '小さい目もり1つ分は、いくつを表しているかな？',
        'あのすぐ左にある、数が書いてある目もりから、小さい目もりいくつ分かな？'
      ],
      src: { min: min, step: stepM, i: i, v: fmt(v, 3) }
    });
  };

  // 筆算（たし算）。100倍した整数で作る
  function dec2(rng) { // 小数第二位まで（第二位は0でない）
    var v;
    do { v = wpick(rng, [[6, ri(rng, 101, 999)], [2, ri(rng, 11, 99)], [1, ri(rng, 1001, 1999)]]); } while (v % 10 === 0);
    return v;
  }
  function dec1(rng) { // 小数第一位まで
    var v;
    do { v = wpick(rng, [[6, ri(rng, 11, 99)], [1, ri(rng, 101, 199)]]) * 10; } while (v % 100 === 0);
    return v;
  }
  gens.hissanAdd = function (rng) {
    var kind = wpick(rng, [[3, 'carry'], [2, 'basic'], [2, 'trail0'], [1, 'int'], [2, 'mis']]);
    var a, b, s, t;
    for (t = 0; t < 200; t++) {
      if (kind === 'basic' || kind === 'carry') {
        a = dec2(rng); b = dec2(rng);
        var carry = (a % 10 + b % 10 >= 10) || (Math.floor(a / 10) % 10 + Math.floor(b / 10) % 10 >= 10);
        if (kind === 'carry' ? !carry : carry) continue;
      } else if (kind === 'trail0') { // 9.23 + 0.47
        a = dec2(rng);
        s = (Math.floor(a / 10) + ri(rng, 3, 60)) * 10;
        if (s % 100 === 0) s += 10;
        b = s - a;
      } else if (kind === 'int') { // 5.04 + 2.96
        a = dec2(rng);
        s = (Math.ceil(a / 100) + ri(rng, 0, 5)) * 100;
        b = s - a;
      } else { // 4.05 + 3.1
        a = dec2(rng); b = dec1(rng);
      }
      if (b > 0 && a + b < 10000) break;
    }
    if (rng() < 0.5 && kind !== 'mis') { t = a; a = b; b = t; }
    if (kind === 'mis' && rng() < 0.3) { t = a; a = b; b = t; }
    var as = fmt(a, 2), bs = fmt(b, 2);
    return finish('hissanAdd', {
      type: 'hissan', tag: 'tashizan', op: '+', a: as, b: bs,
      hints: hissanHints('+', as, bs),
      src: { a: as, b: bs, kind: kind }
    });
  };

  gens.hissanSub = function (rng) {
    var kind = wpick(rng, [[3, 'borrow'], [1, 'basic'], [2, 'intA'], [2, 'mis'], [1, 'trail0'], [1, 'lt1']]);
    var a, b, d, t;
    for (t = 0; t < 200; t++) {
      if (kind === 'basic' || kind === 'borrow') {
        a = dec2(rng); b = dec2(rng);
        if (a < b) { d = a; a = b; b = d; }
        var br = (a % 10 < b % 10) || (Math.floor(a / 10) % 10 < Math.floor(b / 10) % 10);
        if (kind === 'borrow' ? !br : br) continue;
      } else if (kind === 'intA') { // 6 - 0.52
        a = ri(rng, 1, 9) * 100;
        b = rng() < 0.7 ? dec2(rng) : dec1(rng);
      } else if (kind === 'mis') { // 3.4 - 1.84 / 6.71 - 3.9
        if (rng() < 0.5) { a = dec1(rng); b = dec2(rng); } else { a = dec2(rng); b = dec1(rng); }
      } else if (kind === 'trail0') { // 0.54 - 0.34, 7.08 - 6.28
        b = dec2(rng);
        d = ri(rng, 1, 60) * 10;
        if (d % 100 === 0) d += 10;
        a = b + d;
      } else { // 5.03 - 4.25 (答えが1より小さい)
        b = dec2(rng);
        d = ri(rng, 11, 99);
        a = b + d;
      }
      if (a > b && b > 0 && a < 10000) break;
    }
    var as = fmt(a, 2), bs = fmt(b, 2);
    return finish('hissanSub', {
      type: 'hissan', tag: 'hikizan', op: '-', a: as, b: bs,
      hints: hissanHints('-', as, bs),
      src: { a: as, b: bs, kind: kind }
    });
  };

  // 計算のきまり
  gens.laws = function (rng) {
    var kind = wpick(rng, [[2, 'comm'], [3, 'assoc'], [3, 'swap']]);
    var p, a, b, c;
    if (kind === 'comm') {
      a = rng() < 0.5 ? dec2(rng) : dec1(rng);
      b = dec2(rng);
      var as = fmt(a, 2), bs = fmt(b, 2);
      p = {
        type: 'fill', tag: 'kimari',
        q: '□にあてはまる数を書きましょう。',
        parts: [as + '＋' + bs + '＝' + bs + '＋', { a: as }],
        hints: ['たし算では、たす順番をかえても答えは同じだよ。', '□＋○＝○＋□ のきまりだね。'],
        src: { kind: kind, nums: [as, bs] }
      };
    } else {
      // b + c がきりのよい数（整数）になる
      a = rng() < 0.6 ? dec2(rng) : dec1(rng);
      b = rng() < 0.6 ? dec2(rng) : dec1(rng);
      c = (Math.ceil(b / 100) + ri(rng, 0, 2)) * 100 - b;
      if (c === 0) c = 100;
      var A = fmt(a, 2), B = fmt(b, 2), C = fmt(c, 2);
      var bc = fmt(b + c, 2), total = fmt(a + b + c, 2);
      if (kind === 'assoc') {
        p = {
          type: 'fill', tag: 'kimari',
          q: 'くふうして計算しましょう。',
          parts: [A + '＋' + B + '＋' + C + '＝' + A + '＋(' + B + '＋' + C + ')＝' + A + '＋', { a: bc }, '＝', { a: total }],
          hints: ['( )の中を先に計算しよう。', B + '＋' + C + 'は、きりのよい数になるね。', '(□＋○)＋△＝□＋(○＋△) のきまりを使っているよ。'],
          src: { kind: kind, nums: [A, B, C] }
        };
      } else { // a + c をあとから…  例 8.62 + 2.5 + 1.38
        p = {
          type: 'fill', tag: 'kimari',
          q: 'くふうして計算しましょう。',
          parts: [B + '＋' + A + '＋' + C + '＝', { a: total }],
          hints: ['どの2つをたすと、きりのよい数になるかな？', 'たす順番をかえて、' + B + 'と' + C + 'を先にたしてみよう。', 'その答えに、のこりの数をたそう。'],
          src: { kind: kind, nums: [B, A, C] }
        };
      }
    }
    return finish('laws', p);
  };

  var NAMES = ['masuRead', 'unitConvert', 'compose', 'decompose', 'countUnits',
    'compare', 'order', 'times10', 'numberlineRead', 'hissanAdd', 'hissanSub', 'laws'];

  function make(name, rng) {
    if (!gens[name]) throw new Error('unknown generator: ' + name);
    var p = gens[name](typeof rng === 'function' ? rng : Math.random);
    if (p.fig === undefined) delete p.fig;
    return p;
  }

  var G = {
    make: make,
    names: function () { return NAMES.slice(); },
    hissanHints: hissanHints,
    util: { fmt: fmt, parse: parse, decimals: decimals, unitAnswer: unitAnswer }
  };
  S.Generators = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
