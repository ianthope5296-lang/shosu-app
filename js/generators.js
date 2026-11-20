/* generators.js — 似た問題の自動生成（担当D）
 * Shosu.Generators.make(name, rng?, {level:'easy'|'normal'|'hard'}?) -> problem
 *   level を省略（または 'normal'）すると今までと同じ問題（教科書レベル）。
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

  // =====================================================================
  // レベル対応（まとめモード用。担当I）
  //   make(name, rng, {level:'easy'|'normal'|'hard'})
  //   normal（と省略時）は上の生成器をそのまま使う（教科書と同じレベル）。
  //   easy / hard は下の生成器を使う。src.lv にレベルを入れる。
  // =====================================================================
  var LV = { easy: {}, hard: {} };

  // 位ごとのくり上がり・くり下がりの回数（同じ倍率の整数で）
  function carryCount(a, b) {
    var c = 0, k = 0;
    while (a > 0 || b > 0 || c) {
      var s = a % 10 + b % 10 + c;
      c = s >= 10 ? 1 : 0;
      if (c) k++;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
      if (!a && !b && !c) break;
    }
    return k;
  }
  function borrowCount(a, b) { // a >= b
    var br = 0, k = 0;
    while (a > 0 || b > 0) {
      var d = a % 10 - br - b % 10;
      br = d < 0 ? 1 : 0;
      if (br) k++;
      a = Math.floor(a / 10); b = Math.floor(b / 10);
    }
    return k;
  }
  function nonTen(rng, lo, hi) { var v; do { v = ri(rng, lo, hi); } while (v % 10 === 0); return v; }

  var MASU2_HINTS = [
    '1Lますが何こ、0.1Lますが何こあるかな？',
    'いちばん右のますは、0.1Lを10等分しているよ。小さい目もり1つ分は0.01Lだね。',
    '0.01Lが何こ分かを数えて、1L・0.1Lの分と合わせよう。'
  ];
  var LAW_OPTS = ['□＋○＝○＋□', '(□＋○)＋△＝□＋(○＋△)'];
  var T10_UP = function (op) {
    return ['10倍すると、どの数字も位が1つ上がるよ。' + (op !== '10' ? op + '倍は、10倍を何回すること？' : ''),
      '小数点が右に' + (op.length - 1) + 'つうつると考えてもいいね。',
      '位の表に書いて、数字を左の位へうごかしてみよう。'];
  };
  var T10_DOWN = ['1/10にすると、どの数字も位が1つ下がるよ。', '小数点が左に1つうつると考えてもいいね。', '位の表に書いて、数字を1つ右の位へうごかしてみよう。'];
  var ORDER_HINTS = [
    '小数点の位置をそろえて、たてにならべて書いてみよう。',
    '上の位から順にくらべよう。',
    '数直線に表すと、右にあるほど大きい数だよ。'
  ];
  var COMPARE_HINTS = [
    '小数点の位置をそろえて、たてにならべて書いてみよう。',
    '上の位（一の位→小数第一位→小数第二位…）から順にくらべよう。',
    'はじめて数字がちがう位で、数字が大きいほうが大きい数だよ。'
  ];

  function lvFinish(name, lv, p) { p.src.lv = lv; return finish(name, p); }
  function compareProblem(name, lv, x, y, rng, cols, hints) {
    if (rng() < 0.5) { var t = x; x = y; y = t; }
    var xs = fmt(x, 3), ys = fmt(y, 3);
    return lvFinish(name, lv, {
      type: 'choice', tag: 'daisho',
      q: '□にあてはまる不等号を選びましょう。　' + xs + ' □ ' + ys,
      fig: cols && rng() < 0.35 ? { kind: 'placeTable', cols: cols, rows: [xs, ys], highlightCol: null } : undefined,
      options: ['>', '<', '='],
      a: x > y ? '>' : '<',
      hints: hints || COMPARE_HINTS,
      src: { x: xs, y: ys }
    });
  }
  function orderProblem(lv, vals, rng, hints) {
    var dir = rng() < 0.6 ? 'desc' : 'asc';
    var items = vals.map(function (v) { return fmt(v, 3); });
    return lvFinish('order', lv, {
      type: 'order', tag: 'daisho',
      q: (dir === 'desc' ? '大きい順' : '小さい順') + 'にならべましょう。',
      items: items, dir: dir,
      hints: hints || ORDER_HINTS,
      src: { items: items, dir: dir }
    });
  }
  function times10Problem(lv, x, op, rng, cols) { // x は1000倍した整数
    var xs = fmt(x, 3);
    var ans = op === '1/10' ? fmt(x, 4) : fmt(x * parseInt(op, 10), 3);
    var label = op === '1/10' ? '1/10にした数' : op + '倍した数';
    return lvFinish('times10', lv, {
      type: 'fill', tag: 'jubai',
      q: '□にあてはまる数を書きましょう。',
      fig: cols && rng() < 0.3 ? { kind: 'placeTable', cols: cols, rows: [xs], highlightCol: null } : undefined,
      parts: [xs + 'を' + label + 'は', { a: ans }, 'です。'],
      hints: op === '1/10' ? T10_DOWN : T10_UP(op),
      src: { x: xs, op: op }
    });
  }
  function hissanProblem(name, lv, op, a, b, e, kind) { // a, b は 10^e 倍
    var as = fmt(a, e), bs = fmt(b, e);
    return lvFinish(name, lv, {
      type: 'hissan', tag: op === '+' ? 'tashizan' : 'hikizan', op: op, a: as, b: bs,
      hints: hissanHints(op, as, bs),
      src: { a: as, b: bs, kind: kind }
    });
  }

  // ---- かんたん：くり上がりのない2つの数（10^e 倍の整数）----
  function easyAddPair(rng, e) {
    var a = 0, b = 0, i, da, db;
    var oa = ri(rng, 0, 7), ob = ri(rng, 0, 8 - oa);
    a = oa; b = ob;
    for (i = 1; i <= e; i++) {
      if (i < e) { da = ri(rng, 0, 9); db = ri(rng, 0, 9 - da); }
      else { da = ri(rng, 1, 8); db = ri(rng, 1, 9 - da); }
      a = a * 10 + da; b = b * 10 + db;
    }
    return [a, b];
  }
  function easySubPair(rng, e) {
    var a, b, i, da, db;
    var ob = ri(rng, 0, 7), oa = ri(rng, ob, 9);
    a = oa; b = ob;
    for (i = 1; i <= e; i++) {
      if (i < e) { db = ri(rng, 0, 9); da = ri(rng, db, 9); }
      else { db = ri(rng, 1, 8); da = ri(rng, db + 1, 9); }
      a = a * 10 + da; b = b * 10 + db;
    }
    return [a, b];
  }

  LV.easy.masuRead = function (rng) {
    var L = wpick(rng, [[3, 0], [4, 1], [2, 2]]);
    var d1 = rng() < 0.15 ? 0 : ri(rng, 1, 9);
    var d2 = ri(rng, 1, 9);
    return lvFinish('masuRead', 'easy', {
      type: 'fill', tag: 'hyoshikata',
      q: 'かさは何Lですか。',
      fig: { kind: 'masu', unit: 'L', L: L, d1: d1, d2: d2, level: 2 },
      parts: [{ a: fmt(L * 1000 + d1 * 100 + d2 * 10, 3) }, 'L'],
      hints: MASU2_HINTS,
      src: { L: L, d1: d1, d2: d2, d3: 0, level: 2 }
    });
  };

  LV.easy.unitConvert = function (rng) {
    var kind = wpick(rng, [[3, 'mcm'], [2, 'cm'], [2, 'ldl'], [2, 'rev']]);
    var from, to, hints, n;
    if (kind === 'mcm') {
      n = ri(rng, 11, 99);
      from = [[String(ri(rng, 1, 9)), 'm'], [String(n), 'cm']]; to = 'm';
      hints = ['1cm＝0.01m、10cm＝0.1m だよ。', n + 'cmは、0.01mが何こ分かな？', 'mの分と合わせて、小数で表そう。'];
    } else if (kind === 'cm') {
      n = rng() < 0.5 ? nonTen(rng, 11, 99) : nonTen(rng, 101, 999);
      from = [[String(n), 'cm']]; to = 'm';
      hints = ['1cm＝0.01m、100cm＝1m だよ。', n + 'cmは、0.01mが何こ分かな？'];
    } else if (kind === 'ldl') {
      n = ri(rng, 1, 9);
      from = [[String(ri(rng, 1, 9)), 'L'], [String(n), 'dL']]; to = 'L';
      hints = ['1dL＝0.1L だよ。', n + 'dLは、0.1Lが何こ分かな？', 'Lの分と合わせて、小数で表そう。'];
    } else {
      var vs = fmt(nonTen(rng, 101, 999), 2);
      from = [[vs, 'm']]; to = 'cm';
      hints = ['1m＝100cm だよ。', '0.01mは1cmだね。' + vs + 'mは、0.01mが何こ分かな？'];
    }
    return lvFinish('unitConvert', 'easy', {
      type: 'fill', tag: 'hyoshikata',
      q: '□にあてはまる数を書きましょう。',
      parts: [from.map(function (f) { return f[0] + f[1]; }).join('') + '＝', { a: unitAnswer(from, to) }, to],
      hints: hints,
      src: { from: from, to: to }
    });
  };

  function numberlineProblem(lv, min, max, stepM, i, rng) {
    var v = min + i * stepM;
    var unit = pick(rng, ['', 'm', 'L', 'kg']);
    var fig = {
      kind: 'numberline', min: Number(fmt(min, 3)), max: Number(fmt(max, 3)),
      step: Number(fmt(stepM, 3)), labelEvery: 10,
      arrows: [{ v: Number(fmt(v, 3)), label: 'あ' }]
    };
    if (unit) fig.unit = unit;
    return lvFinish('numberlineRead', lv, {
      type: 'fill', tag: 'hyoshikata',
      q: '数直線の目もりを読みましょう。',
      fig: fig,
      parts: ['あの目もりが表す' + (unit ? '大きさ' : '数') + 'は', { a: fmt(v, 3) }, unit ? unit + 'です。' : 'です。'],
      hints: [
        '数が書いてある目もりと目もりの間は、いくつに分かれているかな？',
        '小さい目もり1つ分は、いくつを表しているかな？',
        'あのすぐ左にある、数が書いてある目もりから、小さい目もりいくつ分かな？'
      ],
      src: { min: min, step: stepM, i: i, v: fmt(v, 3) }
    });
  }
  LV.easy.numberlineRead = function (rng) {
    if (rng() < 0.5) return numberlineProblem('easy', 0, 1000, 100, ri(rng, 1, 9), rng);
    var min = ri(rng, 0, 8) * 100, i;
    do { i = ri(rng, 1, 19); } while (i % 10 === 0);
    return numberlineProblem('easy', min, min + 200, 10, i, rng);
  };

  LV.easy.compose = function (rng) {
    var c = [ri(rng, 0, 9), ri(rng, 1, 9), ri(rng, 1, 9)];
    var txt = [];
    for (var i = 0; i < 3; i++) if (c[i]) txt.push(UNIT_STR[i] + 'を' + c[i] + 'こ');
    return lvFinish('compose', 'easy', {
      type: 'fill', tag: 'shikumi',
      q: '□にあてはまる数を書きましょう。',
      parts: [txt.join('、') + '合わせた数は', { a: fmt(c[0] * 1000 + c[1] * 100 + c[2] * 10, 3) }, 'です。'],
      hints: ['1、0.1、0.01 は、それぞれ一の位、小数第一位、小数第二位だよ。', '位の表に、それぞれのこ数を書きこんでみよう。'],
      src: { counts: [c[0], c[1], c[2], 0] }
    });
  };

  // 数を分ける（hard でも使う）。d = [一の位(0〜99), 第一位, 第二位, 第三位]
  function digitAt(d, pos) { return pos === 0 ? d[0] % 10 : d[pos]; }
  function decomposeProblem(lv, d, kind, rng, nPlaces) {
    var x = fmt(d[0] * 1000 + d[1] * 100 + d[2] * 10 + d[3], 3);
    var p, i;
    var names = PLACE_NAMES.slice(0, nPlaces);
    if (kind === 'fill') {
      var parts = [x + 'は、'], first = true;
      for (i = 0; i < 4; i++) {
        if (!d[i]) continue;
        parts.push((first ? '' : '、') + UNIT_STR[i] + 'を');
        parts.push({ a: String(d[i]) });
        parts.push('こ');
        first = false;
      }
      parts.push('合わせた数です。');
      p = {
        type: 'fill', tag: 'shikumi', q: '□にあてはまる数を書きましょう。', parts: parts,
        hints: ['位の表に' + x + 'を書いてみよう。', '一の位の数字は1のこ数、小数第一位の数字は0.1のこ数だよ。'],
        src: { x: x, kind: 'fill' }
      };
    } else if (kind === 'split') {
      var ip = d[0], frac = fmt(d[1] * 100 + d[2] * 10 + d[3], 3);
      p = {
        type: 'fill', tag: 'shikumi', q: '□にあてはまる数を書きましょう。',
        parts: [x + 'は、' + ip + 'と', { a: frac }, 'を合わせた数です。'],
        hints: [x + 'を、整数の部分と小数の部分に分けてみよう。', '小数の部分は「0.」から書きはじめよう。0の位もわすれずにね。'],
        src: { x: x, kind: 'split' }
      };
    } else if (kind === 'choice') {
      var cand = [];
      for (i = 0; i < nPlaces; i++) {
        var dg = digitAt(d, i), cnt = 0;
        for (var k = 0; k < nPlaces; k++) if (digitAt(d, k) === dg) cnt++;
        if (d[0] >= 10 && String(Math.floor(d[0] / 10)) === String(dg)) cnt++;
        if (cnt === 1 && dg !== 0) cand.push(i);
      }
      if (!cand.length) return decomposeProblem(lv, d, 'digit', rng, nPlaces);
      var pc = pick(rng, cand);
      p = {
        type: 'choice', tag: 'shikumi',
        q: x + 'の「' + digitAt(d, pc) + '」は、何の位の数字ですか。',
        options: names.slice(), a: names[pc],
        hints: ['小数点のすぐ右が小数第一位（1/10の位）だよ。', '小数点から右へいくつ目かな？'],
        src: { x: x, kind: 'choice', pos: pc }
      };
    } else { // digit
      var pos = src_pos(rng, d, Math.min(nPlaces, decimals(x) + 1), lv);
      p = {
        type: 'fill', tag: 'shikumi', q: '□にあてはまる数字を書きましょう。',
        parts: [x + 'の' + PLACE_NAMES[pos] + 'の数字は', { a: String(digitAt(d, pos)) }, 'です。'],
        hints: ['小数点のすぐ右が小数第一位（1/10の位）だよ。', 'そこから右へ、小数第二位（1/100の位）、小数第三位（1/1000の位）とつづくよ。'],
        src: { x: x, kind: 'digit', pos: pos }
      };
    }
    return lvFinish('decompose', lv, p);
  }
  function src_pos(rng, d, nPlaces, lv) {
    if (lv === 'hard') { // 0 の位を聞くことが多い
      var zeros = [];
      for (var i = 1; i < nPlaces; i++) if (d[i] === 0) zeros.push(i);
      if (zeros.length && rng() < 0.7) return pick(rng, zeros);
    }
    return ri(rng, 1, nPlaces - 1);
  }
  LV.easy.decompose = function (rng) {
    var d = [ri(rng, 1, 9), ri(rng, 1, 9), ri(rng, 1, 9), 0];
    return decomposeProblem('easy', d, wpick(rng, [[3, 'fill'], [2, 'choice'], [1, 'digit']]), rng, 3);
  };

  function countUnitsProblem(lv, n, unitE, reverse) {
    var x = fmt(n, unitE), u = UNIT_STR[unitE];
    var p = !reverse ? {
      type: 'fill', tag: 'shikumi', q: '□にあてはまる数を書きましょう。',
      parts: [x + 'は、' + u + 'を', { a: String(n) }, 'こ集めた数です。'],
      hints: ['1は' + u + 'を' + POW[unitE] + 'こ集めた数だよ。', '位ごとに考えよう。それぞれの位の数は、' + u + 'が何こ分かな？', '全部のこ数を合わせよう。'],
      src: { x: x, e: unitE, reverse: false }
    } : {
      type: 'fill', tag: 'shikumi', q: '□にあてはまる数を書きましょう。',
      parts: [u + 'を' + n + 'こ集めた数は', { a: x }, 'です。'],
      hints: [u + 'を' + POW[unitE] + 'こ集めると1になるよ。', n + 'こを、' + POW[unitE] + 'こずつのまとまりと、のこりに分けて考えよう。'],
      src: { x: x, e: unitE, reverse: true, n: n }
    };
    return lvFinish('countUnits', lv, p);
  }
  LV.easy.countUnits = function (rng) {
    var e = rng() < 0.4 ? 1 : 2;
    var n = e === 1 ? nonTen(rng, 11, 99) : (rng() < 0.5 ? nonTen(rng, 11, 99) : nonTen(rng, 101, 999));
    return countUnitsProblem('easy', n, e, rng() < 0.3);
  };

  function easyFrac(rng, e) { return e === 1 ? ri(rng, 1, 9) * 100 : nonTen(rng, 11, 99) * 10; }
  LV.easy.compare = function (rng) {
    var e = rng() < 0.5 ? 1 : 2, x, y, ip;
    do {
      ip = ri(rng, 0, 9);
      x = ip * 1000 + easyFrac(rng, e);
      y = (rng() < 0.6 ? ip : ri(rng, 0, 9)) * 1000 + easyFrac(rng, e);
    } while (x === y);
    return compareProblem('compare', 'easy', x, y, rng, ['1', '0.1', '0.01']);
  };

  LV.easy.order = function (rng) { // 3つ（まとめのかんたんでは使わない）
    var e = rng() < 0.5 ? 1 : 2, ip = ri(rng, 0, 5), vals = [];
    while (vals.length < 3) {
      var v = (ip + (rng() < 0.3 ? 1 : 0)) * 1000 + easyFrac(rng, e);
      if (vals.indexOf(v) < 0) vals.push(v);
    }
    return orderProblem('easy', vals, rng);
  };

  LV.easy.times10 = function (rng) {
    var op = wpick(rng, [[3, '10'], [2, '100'], [3, '1/10']]), x;
    if (op === '10') x = rng() < 0.4 ? nonTen(rng, 11, 99) * 100 : (rng() < 0.5 ? nonTen(rng, 11, 99) : nonTen(rng, 101, 999)) * 10;
    else if (op === '100') x = (rng() < 0.4 ? nonTen(rng, 11, 99) : nonTen(rng, 101, 999)) * 10;
    else x = rng() < 0.6 ? nonTen(rng, 11, 99) * 100 : nonTen(rng, 2, 99) * 1000;
    return times10Problem('easy', x, op, rng, ['10', '1', '0.1', '0.01']);
  };

  LV.easy.hissanAdd = function (rng) {
    var e = rng() < 0.75 ? 2 : 1, ab = easyAddPair(rng, e);
    return hissanProblem('hissanAdd', 'easy', '+', ab[0], ab[1], e, 'easy');
  };
  LV.easy.hissanSub = function (rng) {
    var e = rng() < 0.75 ? 2 : 1, ab = easySubPair(rng, e);
    return hissanProblem('hissanSub', 'easy', '-', ab[0], ab[1], e, 'easy');
  };

  LV.easy.laws = function (rng) {
    var kind = wpick(rng, [[3, 'comm'], [2, 'which'], [2, 'ident']]);
    function n1() { return rng() < 0.5 ? fmt(nonTen(rng, 11, 99), 1) : fmt(nonTen(rng, 101, 999), 2); }
    var A = n1(), B = n1(), C = n1(), p;
    if (kind === 'comm') {
      p = {
        type: 'fill', tag: 'kimari', q: '□にあてはまる数を書きましょう。',
        parts: [A + '＋' + B + '＝' + B + '＋', { a: A }],
        hints: ['たし算では、たす順番をかえても答えは同じだよ。', '□＋○＝○＋□ のきまりだね。'],
        src: { kind: kind, nums: [A, B] }
      };
    } else if (kind === 'ident') {
      p = {
        type: 'fill', tag: 'kimari', q: '□にあてはまる数を書きましょう。',
        parts: ['(' + A + '＋' + B + ')＋' + C + '＝' + A + '＋(', { a: B }, '＋' + C + ')'],
        hints: ['3つの数のたし算では、どこを先にたしても答えは同じだよ。', '(□＋○)＋△＝□＋(○＋△) のきまりだね。'],
        src: { kind: kind, nums: [A, B, C] }
      };
    } else {
      var assoc = rng() < 0.5;
      p = {
        type: 'choice', tag: 'kimari',
        q: (assoc ? '(' + A + '＋' + B + ')＋' + C + '＝' + A + '＋(' + B + '＋' + C + ')' : A + '＋' + B + '＝' + B + '＋' + A) + ' は、どのきまりを表していますか。',
        options: LAW_OPTS.slice(), a: LAW_OPTS[assoc ? 1 : 0],
        hints: [assoc ? '3つの数のたし算で、どこを先に計算しているかが変わっているね。' : '2つの数の順番が入れかわっているね。'],
        src: { kind: kind, nums: [A, B, C] }
      };
    }
    return lvFinish('laws', 'easy', p);
  };

  // ---- むずかしい ----
  LV.hard.masuRead = function (rng) {
    var L = ri(rng, 1, 3), kind = wpick(rng, [[3, 'z1'], [3, 'z2'], [1, 'z12']]);
    var d1 = kind === 'z2' ? ri(rng, 1, 9) : 0;
    var d2 = kind === 'z1' ? ri(rng, 1, 9) : 0;
    var d3 = ri(rng, 1, 9);
    return lvFinish('masuRead', 'hard', {
      type: 'fill', tag: 'hyoshikata',
      q: 'かさは何Lですか。',
      fig: { kind: 'masu', unit: 'L', L: L, d1: d1, d2: d2, d3: d3, level: 3 },
      parts: [{ a: fmt(L * 1000 + d1 * 100 + d2 * 10 + d3, 3) }, 'L'],
      hints: [
        '1Lます、0.1Lます、0.01Lますがそれぞれ何こあるかな？',
        'いちばん右のますは、0.01Lを10等分しているよ。小さい目もり1つ分は0.001Lだね。',
        'ないますの位には、0を書いておこう。'
      ],
      src: { L: L, d1: d1, d2: d2, d3: d3, level: 3 }
    });
  };

  LV.hard.unitConvert = function (rng) {
    var kind = wpick(rng, [[3, 'kmm'], [3, 'kgg'], [2, 'Lml'], [1, 'mmm'], [3, 'rev'], [2, 'mkm'], [2, 'cmm']]);
    var from, to, hints, n, big;
    var small = function () { return rng() < 0.5 ? ri(rng, 1, 9) : nonTen(rng, 11, 99); };
    switch (kind) {
      case 'kmm': n = small(); big = ri(rng, 1, 9);
        from = [[String(big), 'km'], [String(n), 'm']]; to = 'km';
        hints = ['1m＝0.001km だよ。', n + 'mは、0.001kmが何こ分かな？', '位の表に書くと、0になる位があるね。']; break;
      case 'kgg': n = small(); big = ri(rng, 1, 9);
        from = [[String(big), 'kg'], [String(n), 'g']]; to = 'kg';
        hints = ['1g＝0.001kg だよ。', n + 'gは、0.001kgが何こ分かな？', '位の表に書くと、0になる位があるね。']; break;
      case 'Lml': n = small(); big = ri(rng, 1, 3);
        from = [[String(big), 'L'], [String(n), 'mL']]; to = 'L';
        hints = ['1mL＝0.001L だよ。', n + 'mLは、0.001Lが何こ分かな？', '位の表に書くと、0になる位があるね。']; break;
      case 'mmm': n = small(); big = ri(rng, 1, 9);
        from = [[String(big), 'm'], [String(n), 'mm']]; to = 'm';
        hints = ['1mm＝0.001m だよ。', n + 'mmは、0.001mが何こ分かな？', '位の表に書くと、0になる位があるね。']; break;
      case 'mkm': n = ri(rng, 1, 12) * 1000 + small();
        from = [[String(n), 'm']]; to = 'km';
        hints = ['1000m＝1km、1m＝0.001km だよ。', n + 'mは、1kmが何こと、0.001kmが何こ分かな？', '位の表に数字をあてはめて考えよう。']; break;
      case 'cmm': n = ri(rng, 1, 12) * 100 + ri(rng, 1, 9);
        from = [[String(n), 'cm']]; to = 'm';
        hints = ['100cm＝1m、1cm＝0.01m だよ。', n + 'cmは、1mが何こと、0.01mが何こ分かな？']; break;
      default: {
        var r = pick(rng, [['km', 'm'], ['kg', 'g'], ['L', 'mL']]);
        var v = ri(rng, 1, 9) * 1000 + wpick(rng, [[1, ri(rng, 1, 9) * 10], [1, ri(rng, 1, 9)], [1, ri(rng, 1, 9) * 100 + ri(rng, 1, 9)]]);
        var vs = fmt(v, 3);
        from = [[vs, r[0]]]; to = r[1];
        hints = ['1' + r[0] + '＝1000' + r[1] + ' だよ。', '0.001' + r[0] + 'は1' + r[1] + 'だね。' + vs + r[0] + 'は、0.001' + r[0] + 'が何こ分かな？'];
      }
    }
    return lvFinish('unitConvert', 'hard', {
      type: 'fill', tag: 'hyoshikata',
      q: '□にあてはまる数を書きましょう。',
      parts: [from.map(function (f) { return f[0] + f[1]; }).join('') + '＝', { a: unitAnswer(from, to) }, to],
      hints: hints,
      src: { from: from, to: to }
    });
  };

  LV.hard.numberlineRead = function (rng) {
    var c = ri(rng, 1, 9), i;
    do { i = ri(rng, 1, 19); } while (i % 10 === 0);
    if (rng() < 0.6) return numberlineProblem('hard', c * 1000 - 10, c * 1000 + 10, 1, i, rng);
    return numberlineProblem('hard', c * 1000 - 100, c * 1000 + 100, 10, i, rng);
  };

  LV.hard.compose = function (rng) {
    var c, hints;
    if (rng() < 0.5) { // 空位
      c = [ri(rng, 1, 9), ri(rng, 1, 9), ri(rng, 1, 9), ri(rng, 1, 9)];
      var z = wpick(rng, [[2, [1]], [2, [2]], [1, [1, 2]]]);
      z.forEach(function (k) { c[k] = 0; });
      hints = ['1、0.1、0.01、0.001 は、それぞれ一の位、小数第一位、小数第二位、小数第三位だよ。', '位の表に、それぞれのこ数を書きこんでみよう。', '出てこない位には0を書くのをわすれないでね。'];
    } else { // 10こ以上
      c = [ri(rng, 0, 5), ri(rng, 0, 9), ri(rng, 0, 9), ri(rng, 0, 9)];
      var bigPos = ri(rng, 1, 3);
      c[bigPos] = ri(rng, 11, 39);
      if (bigPos < 3 && rng() < 0.5) c[3] = 0;
      if (c[0] + c[1] + c[2] + c[3] === c[bigPos]) c[0] = ri(rng, 1, 5);
      hints = ['それぞれの位のこ数を、1つずつ数にして考えよう。', UNIT_STR[bigPos] + 'を10こ集めると、' + UNIT_STR[bigPos - 1] + 'になるよ。', UNIT_STR[bigPos] + 'を' + c[bigPos] + 'こ集めた数を先にもとめてから、のこりを合わせよう。'];
    }
    var txt = [];
    for (var i = 0; i < 4; i++) if (c[i]) txt.push(UNIT_STR[i] + 'を' + c[i] + 'こ');
    return lvFinish('compose', 'hard', {
      type: 'fill', tag: 'shikumi',
      q: '□にあてはまる数を書きましょう。',
      parts: [txt.join('、') + '合わせた数は', { a: fmt(c[0] * 1000 + c[1] * 100 + c[2] * 10 + c[3], 3) }, 'です。'],
      hints: hints,
      src: { counts: c }
    });
  };

  LV.hard.decompose = function (rng) {
    var d, kind = wpick(rng, [[3, 'digit'], [2, 'fill'], [2, 'split'], [2, 'choice']]);
    if (rng() < 0.5) d = [ri(rng, 1, 9), 0, ri(rng, 1, 9), 0];          // 3.04
    else d = [ri(rng, 1, 9), ri(rng, 0, 9), ri(rng, 0, 9), ri(rng, 1, 9)]; // 7.305
    if (d[3] && d[1] && d[2]) d[pick(rng, [1, 2])] = 0;
    if (kind !== 'fill' && rng() < 0.3) d[0] = ri(rng, 10, 29);
    return decomposeProblem('hard', d, kind, rng, 4);
  };

  LV.hard.countUnits = function (rng) {
    var e = rng() < 0.4 ? 2 : 3, n;
    if (e === 2) n = ri(rng, 1, 19) * 100 + ri(rng, 1, 9);                     // 3.04 -> 304
    else n = ri(rng, 1, 9) * 1000 + wpick(rng, [[2, ri(rng, 1, 9) * 100 + ri(rng, 1, 9)], [1, ri(rng, 1, 9) * 10], [1, nonTen(rng, 11, 99)]]); // 7.305, 2.05, 4.036
    return countUnitsProblem('hard', n, e, rng() < 0.4);
  };

  LV.hard.compare = function (rng) {
    var kind = wpick(rng, [[3, 'zero'], [2, 'near'], [2, 'int'], [1, 'twoInt']]);
    var x, y, ip = ri(rng, 0, 9), a = ri(rng, 1, 9), b = ri(rng, 1, 9);
    if (kind === 'zero') {
      var f = pick(rng, [[a * 100, a * 10], [a * 10, a], [a * 100 + b, a * 100 + b * 10], [a * 100 + b, a * 10 + b], [a * 10 + b, a * 100 + b * 10]]);
      x = ip * 1000 + f[0]; y = ip * 1000 + f[1];
    } else if (kind === 'near') {
      x = ip * 1000 + a * 100 + (rng() < 0.5 ? b * 10 : 0);
      y = x - ri(rng, 1, 9);
    } else if (kind === 'int') {
      ip = ri(rng, 1, 9); x = ip * 1000;
      y = rng() < 0.5 ? x - pick(rng, [1, 10, ri(rng, 2, 9), nonTen(rng, 11, 99)]) : x + pick(rng, [1, 10, ri(rng, 2, 9)]);
    } else {
      x = ri(rng, 10, 19) * 1000 + a * 100;
      y = ri(rng, 1, 9) * 1000 + nonTen(rng, 11, 99) * 10 + ri(rng, 0, 9);
    }
    return compareProblem('compare', 'hard', x, y, rng, kind === 'twoInt' ? ['10', '1', '0.1', '0.01', '0.001'] : ['1', '0.1', '0.01', '0.001'],
      ['小数点の位置をそろえて、たてにならべて書いてみよう。', 'けたの数がちがうときは、ない位に0があると考えよう。', '上の位から順にくらべて、はじめて数字がちがう位で決まるよ。']);
  };

  LV.hard.order = function (rng) {
    var cnt = ri(rng, 5, 6), cands;
    if (rng() < 0.6) {
      var ip = ri(rng, 0, 9), p = ri(rng, 1, 9), q;
      do { q = ri(rng, 1, 9); } while (q === p);
      cands = [p * 100, p * 10, p, p * 100 + q * 10, p * 100 + q, p * 10 + q, q * 100 + p * 10, q * 100 + p, q * 10 + p, p * 100 + q * 10 + p]
        .map(function (f) { return ip * 1000 + f; });
      if (ip > 0) cands.push(ip * 1000);
    } else {
      var c = ri(rng, 1, 9) * 1000;
      cands = [0, -10, 10, -1, 1, 100, -100, 9, -9, 90, -90, 11].map(function (f) { return c + f; });
    }
    var vals = shuffle(rng, cands).slice(0, cnt);
    return orderProblem('hard', vals, rng, [
      '小数点の位置をそろえて、位の表に書いてみよう。',
      'ない位には0があると考えて、上の位から順にくらべよう。',
      'まず、いちばん大きい数（小さい数）を見つけて、のこりの数でまたくらべよう。'
    ]);
  };

  LV.hard.times10 = function (rng) {
    var op = wpick(rng, [[3, '10'], [2, '100'], [2, '1000'], [3, '1/10']]), x, t;
    for (t = 0; t < 50; t++) {
      if (op === '10') x = pick(rng, [ri(rng, 1, 9) * 1000 + ri(rng, 1, 9) * 10, ri(rng, 1, 9) * 10 + ri(rng, 1, 9), ri(rng, 1, 9) * 1000 + ri(rng, 1, 9) * 100 + ri(rng, 1, 9), ri(rng, 1, 9) * 1000 + ri(rng, 1, 9)]);
      else if (op === '100') x = pick(rng, [ri(rng, 1, 9) * 10 + ri(rng, 1, 9), ri(rng, 1, 9) * 100 + ri(rng, 1, 9), ri(rng, 1, 9) * 1000 + ri(rng, 1, 9) * 10, ri(rng, 1, 9) * 10]);
      else if (op === '1000') x = pick(rng, [ri(rng, 1, 9) * 10, ri(rng, 1, 9) * 100 + ri(rng, 1, 9), ri(rng, 1, 9) * 1000 + ri(rng, 1, 9), ri(rng, 1, 9)]);
      else x = pick(rng, [ri(rng, 1, 9) * 1000 + ri(rng, 1, 9) * 10, ri(rng, 10, 99) * 1000 + ri(rng, 1, 9) * 100, ri(rng, 1, 9) * 100, ri(rng, 10, 99) * 1000 + ri(rng, 1, 9) * 10]);
      if (x % 1000 !== 0) break;
    }
    var inverse = rng() < 0.4;
    if (!inverse) return times10Problem('hard', x, op, rng, ['1000', '100', '10', '1', '0.1', '0.01', '0.001']);
    // ある数を□倍すると y になった。ある数は？
    var xs = fmt(x, 3);
    var y = op === '1/10' ? fmt(x, 4) : fmt(x * parseInt(op, 10), 3);
    var how = op === '1/10' ? '1/10にする' : op + '倍する';
    return lvFinish('times10', 'hard', {
      type: 'fill', tag: 'jubai',
      q: 'ある数を' + how + 'と、' + y + 'になりました。ある数はいくつですか。',
      parts: ['ある数は', { a: xs }, 'です。'],
      hints: op === '1/10'
        ? ['1/10にすると、位が1つ下がったね。もとの数にもどすには、どうすればいいかな？', '小数点を、反対の向き（右）に1つうつして考えよう。', '答えを1/10にして、' + y + 'になるかたしかめよう。']
        : [op + '倍すると、位が' + (op.length - 1) + 'つ上がったね。もとの数にもどすには、どうすればいいかな？', '小数点を、反対の向き（左）に' + (op.length - 1) + 'つうつして考えよう。', '答えを' + op + '倍して、' + y + 'になるかたしかめよう。'],
      src: { x: xs, op: op, inverse: true, y: y }
    });
  };

  function hardHissanOk(op, a, b) { // a, b は100倍
    var misDec = (a % 10 === 0) !== (b % 10 === 0) || a % 100 === 0 || b % 100 === 0;
    if (op === '+') return misDec || carryCount(a, b) >= 2 || (a + b) % 100 === 0;
    return misDec || borrowCount(a, b) >= 2;
  }
  LV.hard.hissanAdd = function (rng) {
    var kind = wpick(rng, [[3, 'mis'], [3, 'chain'], [2, 'int'], [1, 'intB'], [2, 'big']]);
    var a, b, t, s;
    for (t = 0; t < 300; t++) {
      if (kind === 'mis') { a = dec2(rng); b = rng() < 0.7 ? dec1(rng) : ri(rng, 11, 49) * 100 + ri(rng, 1, 9) * 10; }
      else if (kind === 'chain') { a = dec2(rng); b = dec2(rng); if (carryCount(a, b) < 2) continue; }
      else if (kind === 'int') { a = dec2(rng); s = (Math.ceil(a / 100) + ri(rng, 1, 6)) * 100; b = s - a; }
      else if (kind === 'intB') { a = ri(rng, 2, 15) * 100; b = rng() < 0.6 ? dec2(rng) : dec1(rng); }
      else { a = ri(rng, 10, 49) * 100 + nonTen(rng, 1, 99); b = dec2(rng); if (carryCount(a, b) < 2) continue; }
      if (b > 0 && a + b < 10000 && hardHissanOk('+', a, b)) break;
    }
    if (rng() < 0.5) { t = a; a = b; b = t; }
    return hissanProblem('hissanAdd', 'hard', '+', a, b, 2, kind);
  };
  LV.hard.hissanSub = function (rng) {
    var kind = wpick(rng, [[3, 'intA'], [3, 'chain'], [2, 'mis'], [2, 'tenth']]);
    var a, b, t, d;
    for (t = 0; t < 300; t++) {
      if (kind === 'intA') { a = ri(rng, 1, 15) * 100; b = rng() < 0.7 ? dec2(rng) : dec1(rng); }
      else if (kind === 'chain') {
        a = rng() < 0.5 ? ri(rng, 2, 9) * 100 + ri(rng, 1, 9) : dec2(rng); // 7.03 のように0をはさむ
        b = dec2(rng);
        if (a <= b || borrowCount(a, b) < 2) continue;
      } else if (kind === 'mis') {
        if (rng() < 0.6) { a = dec1(rng); b = dec2(rng); } else { a = dec2(rng); b = dec1(rng); }
      } else { // 10.1 − 9.95
        a = ri(rng, 1, 10) * 100 + ri(rng, 0, 9) * 10;
        d = nonTen(rng, 1, 99); b = a - d;
        if (b % 10 === 0) continue;
      }
      if (a > b && b > 0 && a < 10000 && hardHissanOk('-', a, b)) break;
    }
    return hissanProblem('hissanSub', 'hard', '-', a, b, 2, kind);
  };

  LV.hard.laws = function (rng) {
    var kind = wpick(rng, [[2, 'swap'], [2, 'swap4'], [2, 'reorder']]), p;
    function pairTo(x) { var c = (Math.ceil(x / 100) + ri(rng, 0, 2)) * 100 - x; return c === 0 ? 100 : c; }
    var A = dec2(rng), C = pairTo(A), B = rng() < 0.5 ? dec2(rng) : dec1(rng);
    var f = function (v) { return fmt(v, 2); };
    if (kind === 'swap') {
      p = {
        type: 'fill', tag: 'kimari', q: 'くふうして計算しましょう。',
        parts: [f(A) + '＋' + f(B) + '＋' + f(C) + '＝', { a: f(A + B + C) }],
        hints: ['どの2つをたすと、きりのよい数になるかな？', 'たす順番をかえて、きりのよい数になる2つを先にたしてみよう。', 'その答えに、のこりの数をたそう。'],
        src: { kind: kind, nums: [f(A), f(B), f(C)] }
      };
    } else if (kind === 'swap4') {
      var D = pairTo(B);
      p = {
        type: 'fill', tag: 'kimari', q: 'くふうして計算しましょう。',
        parts: [f(A) + '＋' + f(B) + '＋' + f(C) + '＋' + f(D) + '＝', { a: f(A + B + C + D) }],
        hints: ['たすと、きりのよい数になる2つの組を見つけよう。', '2組に分けて、それぞれ先に計算しよう。', 'きりのよい数どうしをたそう。'],
        src: { kind: kind, nums: [f(A), f(B), f(C), f(D)] }
      };
    } else {
      p = {
        type: 'fill', tag: 'kimari', q: 'くふうして計算しましょう。',
        parts: [f(A) + '＋' + f(B) + '＋' + f(C) + '＝' + f(A) + '＋' + f(C) + '＋' + f(B) + '＝', { a: f(A + C) }, '＋' + f(B) + '＝', { a: f(A + B + C) }],
        hints: ['たす順番をかえても、答えは同じだよ。', f(A) + '＋' + f(C) + 'は、きりのよい数になるね。', 'その答えに' + f(B) + 'をたそう。'],
        src: { kind: kind, nums: [f(A), f(B), f(C)] }
      };
    }
    return lvFinish('laws', 'hard', p);
  };

  // ---- 3つの数のたし算 ----
  gens.threeSum = function (rng, lv) {
    lv = lv || 'normal';
    var e = 2, nums, t;
    for (t = 0; t < 300; t++) {
      if (lv === 'easy') { // 小数第一位まで、くり上がりなし
        e = 1;
        var ones = [ri(rng, 0, 3), ri(rng, 0, 3), ri(rng, 0, 3)], ten = [ri(rng, 1, 7)];
        ten.push(ri(rng, 1, 8 - ten[0])); ten.push(ri(rng, 1, 9 - ten[0] - ten[1]));
        nums = [0, 1, 2].map(function (i) { return ones[i] * 10 + ten[i]; });
        if (ten[1] < 1 || ten[2] < 1) continue;
      } else if (lv === 'normal') {
        nums = [dec2(rng), rng() < 0.5 ? dec2(rng) : dec1(rng), dec2(rng)];
      } else {
        nums = shuffle(rng, [dec2(rng), dec1(rng), pick(rng, [dec2(rng), ri(rng, 2, 9) * 100, ri(rng, 11, 29) * 100 + nonTen(rng, 1, 99)])]);
      }
      var s = nums[0] + nums[1] + nums[2];
      if (s < 10000 && (lv !== 'hard' || s % 10 !== 0 || rng() < 0.5)) break;
    }
    var ns = nums.map(function (n) { return fmt(n, e); });
    var total = fmt(nums[0] + nums[1] + nums[2], e);
    var p = {
      type: 'fill', tag: 'tashizan', q: '計算しましょう。',
      parts: [ns.join('＋') + '＝', { a: total }],
      hints: ['3つの数のたし算は、前から2つずつ順に計算しよう。', 'まず ' + ns[0] + '＋' + ns[1] + ' を、小数点の位置をそろえて計算しよう。', 'その答えに' + ns[2] + 'をたそう。答えの小数点より右のいちばん後ろが0なら、0は消しておこう。'],
      src: { nums: ns }
    };
    if (lv !== 'normal') p.src.lv = lv;
    return finish('threeSum', p);
  };

  // ---- 文章題（かさ・長さ・重さ・道のり）----
  // r: 数ごとの範囲（100倍の整数）。conv があれば2つめの数は小さい単位（cm・g・mL）の整数で、r はその単位の範囲。
  var WORD_ADD = [
    { u: 'L', r: [[30, 900], [30, 500]], q: function (a, b) { return '水そうに水が' + a + 'L入っています。そこに' + b + 'Lの水を入れると、水は全部で何Lになりますか。'; }, ans: ['全部で', 'Lになります。'], h: '「全部で」だから、たし算だね。' },
    { u: 'm', r: [[50, 500], [50, 500]], q: function (a, b) { return '赤いリボンが' + a + 'm、青いリボンが' + b + 'mあります。リボンは合わせて何mですか。'; }, ans: ['合わせて', 'mです。'], h: '「合わせて」だから、たし算だね。' },
    { u: 'kg', r: [[20, 150], [100, 600]], q: function (a, b) { return '重さ' + a + 'kgのかごに、みかんを' + b + 'kg入れました。全体の重さは何kgになりますか。'; }, ans: ['全体の重さは', 'kgです。'], h: '全体の重さは、かごの重さとみかんの重さを合わせた重さだね。' },
    { u: 'km', r: [[50, 600], [50, 600]], q: function (a, b) { return '家から公園まで' + a + 'km、公園から図書館まで' + b + 'kmあります。家から公園を通って図書館まで行くと、道のりは何kmですか。'; }, ans: ['道のりは', 'kmです。'], h: '2つの道のりを合わせるから、たし算だね。' }
  ];
  var WORD_ADD_CONV = [
    { u: 'm', s: 'cm', k: 100, r: [[100, 500], [11, 99]], q: function (a, b) { return 'ひもが2本あります。1本は' + a + 'm、もう1本は' + b + 'cmです。2本合わせると何mですか。'; }, ans: ['合わせて', 'mです。'], h: '「合わせると」だから、たし算だね。' },
    { u: 'kg', s: 'g', k: 1000, r: [[50, 300], [110, 950]], q: function (a, b) { return '重さ' + a + 'kgのかばんに、' + b + 'gの本を入れました。全体の重さは何kgですか。'; }, ans: ['全体の重さは', 'kgです。'], h: '全体の重さは、かばんと本の重さを合わせた重さだね。' },
    { u: 'L', s: 'mL', k: 1000, r: [[50, 200], [110, 950]], q: function (a, b) { return 'ジュースが' + a + 'Lあります。さらに' + b + 'mL買ってきました。ジュースは全部で何Lになりましたか。'; }, ans: ['全部で', 'Lになりました。'], h: '「全部で」だから、たし算だね。' }
  ];
  var WORD_ADD3 = [
    { u: 'm', r: [[50, 400], [50, 400], [50, 400]], q: function (a, b, c) { return '赤いリボンが' + a + 'm、青いリボンが' + b + 'm、黄色いリボンが' + c + 'mあります。リボンは全部で何mですか。'; }, ans: ['全部で', 'mです。'], h: '「全部で」だから、3つの数のたし算だね。' },
    { u: 'L', r: [[50, 300], [50, 300], [50, 300]], q: function (a, b, c) { return 'からのバケツに水を、1回目に' + a + 'L、2回目に' + b + 'L、3回目に' + c + 'L入れました。水は全部で何Lになりましたか。'; }, ans: ['全部で', 'Lになりました。'], h: '「全部で」だから、3つの数のたし算だね。' }
  ];
  var WORD_SUB = [
    { u: 'L', r: [[100, 200], [10, 150]], q: function (a, b) { return 'ジュースが' + a + 'Lあります。' + b + 'L飲むと、のこりは何Lですか。'; }, ans: ['のこりは', 'Lです。'], h: '「のこり」をもとめるから、ひき算だね。' },
    { u: 'm', r: [[100, 600], [50, 500]], q: function (a, b) { return '赤いテープは' + a + 'm、青いテープは' + b + 'mです。赤いテープは青いテープより何m長いですか。'; }, ans: ['赤いテープのほうが', 'm長い。'], h: '「何m長い」は、2つの長さのちがいだから、ひき算だね。' },
    { u: 'kg', r: [[100, 300], [10, 250]], q: function (a, b) { return 'さとうが' + a + 'kgあります。りょうりに' + b + 'kg使いました。のこりは何kgですか。'; }, ans: ['のこりは', 'kgです。'], h: '「のこり」をもとめるから、ひき算だね。' },
    { u: 'km', r: [[100, 600], [30, 500]], q: function (a, b) { return '家から駅まで' + a + 'kmあります。家から' + b + 'km歩きました。駅まであと何kmですか。'; }, ans: ['あと', 'kmです。'], h: '「あと何km」は、全部の道のりから歩いた道のりをひいてもとめるよ。' }
  ];
  var WORD_SUB_CONV = [
    { u: 'm', s: 'cm', k: 100, r: [[100, 300], [11, 99]], q: function (a, b) { return a + 'mのテープから' + b + 'cm切り取りました。のこりは何mですか。'; }, ans: ['のこりは', 'mです。'], h: '「のこり」をもとめるから、ひき算だね。' },
    { u: 'kg', s: 'g', k: 1000, r: [[100, 800], [110, 950]], q: function (a, b) { return '重さ' + a + 'kgの荷物から、' + b + 'gの本を取り出しました。荷物の重さは何kgになりましたか。'; }, ans: ['荷物の重さは', 'kgです。'], h: '取り出したあとの重さだから、ひき算だね。' },
    { u: 'L', s: 'mL', k: 1000, r: [[100, 500], [110, 950]], q: function (a, b) { return '水が' + a + 'L入っています。そのうち' + b + 'mL使うと、のこりは何Lですか。'; }, ans: ['のこりは', 'Lです。'], h: '「のこり」をもとめるから、ひき算だね。' }
  ];
  var WORD_SUB2 = [
    { u: 'L', r: [[100, 200], [10, 60], [10, 60]], q: function (a, b, c) { return 'ジュースが' + a + 'Lあります。きのう' + b + 'L飲み、きょう' + c + 'L飲みました。のこりは何Lですか。'; }, ans: ['のこりは', 'Lです。'], h: '飲んだ分を、はじめの量から順にひいていこう。' },
    { u: 'm', r: [[300, 1000], [50, 300], [50, 300]], q: function (a, b, c) { return a + 'mのロープから、' + b + 'mと' + c + 'mを切り取りました。のこりは何mですか。'; }, ans: ['のこりは', 'mです。'], h: '切り取った分を、はじめの長さから順にひいていこう。' }
  ];

  // 範囲 [lo, hi]（100倍）で、小数第e位までの数（e=2:第二位が0でない、e=1:第一位まで、e=0:整数）
  function rd(rng, lo, hi, e) {
    var unit = e === 2 ? 1 : e === 1 ? 10 : 100;
    var ok = function (v) { return v >= lo && v <= hi && v > 0 && (e === 2 ? v % 10 !== 0 : e === 1 ? v % 100 !== 0 : true); };
    for (var t = 0; t < 60; t++) {
      var v = ri(rng, lo, hi); v -= v % unit;
      if (ok(v)) return v;
    }
    for (var w = lo; w <= hi; w++) if (w % unit === 0 && ok(w)) return w;
    return lo;
  }
  function e12(rng) { return rng() < 0.6 ? 2 : 1; }

  function wordProblem(name, lv, sc, vals, op, conv) {
    // vals: 表示する数（文字列）。conv があれば2つめは小さい単位
    var tag = op === '+' ? 'tashizan' : 'hikizan';
    var opc = op === '+' ? '＋' : '−';
    var exprNums = vals.slice();
    if (conv) exprNums[1] = vals[1] + '/' + conv.k;
    var shown = vals.map(function (v, i) { return v + (conv && i === 1 ? conv.s : sc.u); });
    var tot = parse(vals[0], 3);
    for (var i = 1; i < vals.length; i++) {
      var v = conv && i === 1 ? parse(vals[1], 0) * POW[3] / conv.k : parse(vals[i], 3);
      tot = op === '+' ? tot + v : tot - v;
    }
    var hints = [];
    if (conv) hints.push('単位を' + sc.u + 'にそろえよう。' + vals[1] + conv.s + 'は何' + sc.u + 'かな？');
    hints.push(sc.h);
    if (!conv) hints.push('式は ' + vals.join(opc) + ' だね。小数点の位置をそろえて計算しよう。');
    else hints.push('小数点の位置をそろえて計算しよう。');
    var p = {
      type: 'fill', tag: tag, q: sc.q.apply(null, vals),
      parts: [sc.ans[0], { a: fmt(tot, 3) }, sc.ans[1]],
      hints: hints,
      src: { expr: exprNums.join(op), show: shown, unit: sc.u }
    };
    if (lv !== 'normal') p.src.lv = lv;
    return finish(name, p);
  }

  // 2つの数（100倍）。easy はくり上がり・くり下がりなし
  function wordPair(rng, sc, lv, op) {
    var a, b, t, e = e12(rng), ea, eb;
    for (t = 0; t < 400; t++) {
      ea = lv === 'easy' ? e : e12(rng); eb = lv === 'easy' ? e : e12(rng);
      a = rd(rng, sc.r[0][0], sc.r[0][1], ea);
      b = rd(rng, sc.r[1][0], op === '-' ? Math.min(sc.r[1][1], a - 1) : sc.r[1][1], eb);
      if (op === '-' && !(a > b)) continue;
      if (lv !== 'easy') break;
      if (op === '+' && carryCount(a, b) === 0) break;
      if (op === '-' && borrowCount(a, b) === 0 && (e === 2 ? a % 10 > b % 10 : Math.floor(a / 10) % 10 > Math.floor(b / 10) % 10)) break;
    }
    return [a, b];
  }

  gens.wordAdd = function (rng, lv) {
    lv = lv || 'normal';
    var sc, ab, t;
    if (lv !== 'hard') {
      sc = pick(rng, WORD_ADD); ab = wordPair(rng, sc, lv, '+');
      return wordProblem('wordAdd', lv, sc, [fmt(ab[0], 2), fmt(ab[1], 2)], '+');
    }
    var kind = wpick(rng, [[2, 'conv'], [2, 'three'], [1, 'mis']]);
    if (kind === 'conv') {
      sc = pick(rng, WORD_ADD_CONV);
      var a = rd(rng, sc.r[0][0], sc.r[0][1], e12(rng));
      var b = sc.k === 100 ? nonTen(rng, sc.r[1][0], sc.r[1][1]) : ri(rng, sc.r[1][0] / 10, sc.r[1][1] / 10) * 10;
      return wordProblem('wordAdd', lv, sc, [fmt(a, 2), String(b)], '+', sc);
    }
    if (kind === 'three') {
      sc = pick(rng, WORD_ADD3);
      var es = shuffle(rng, [2, 1, 2]);
      var v3 = sc.r.map(function (r, i) { return fmt(rd(rng, r[0], r[1], es[i]), 2); });
      return wordProblem('wordAdd', lv, sc, v3, '+');
    }
    sc = pick(rng, WORD_ADD);
    var es2 = shuffle(rng, [2, rng() < 0.7 ? 1 : 0]);
    ab = [rd(rng, sc.r[0][0], sc.r[0][1], es2[0]), rd(rng, sc.r[1][0], sc.r[1][1], es2[1])];
    return wordProblem('wordAdd', lv, sc, [fmt(ab[0], 2), fmt(ab[1], 2)], '+');
  };

  gens.wordSub = function (rng, lv) {
    lv = lv || 'normal';
    var sc, ab, a, b, c, t;
    if (lv !== 'hard') {
      sc = pick(rng, WORD_SUB); ab = wordPair(rng, sc, lv, '-');
      return wordProblem('wordSub', lv, sc, [fmt(ab[0], 2), fmt(ab[1], 2)], '-');
    }
    var kind = wpick(rng, [[2, 'conv'], [2, 'intA'], [1, 'two']]);
    if (kind === 'conv') {
      sc = pick(rng, WORD_SUB_CONV);
      for (t = 0; t < 100; t++) {
        a = rd(rng, sc.r[0][0], sc.r[0][1], pick(rng, [0, 1, 2]));
        b = sc.k === 100 ? nonTen(rng, sc.r[1][0], sc.r[1][1]) : ri(rng, sc.r[1][0] / 10, sc.r[1][1] / 10) * 10;
        if (a * (sc.k === 100 ? 1 : 10) > b) break; // 単位をそろえて a > b
      }
      return wordProblem('wordSub', lv, sc, [fmt(a, 2), String(b)], '-', sc);
    }
    if (kind === 'two') {
      sc = pick(rng, WORD_SUB2);
      for (t = 0; t < 100; t++) {
        a = rd(rng, sc.r[0][0], sc.r[0][1], pick(rng, [0, 1]));
        b = rd(rng, sc.r[1][0], sc.r[1][1], 2);
        c = rd(rng, sc.r[2][0], sc.r[2][1], 1);
        if (a > b + c) break;
      }
      return wordProblem('wordSub', lv, sc, [fmt(a, 2), fmt(b, 2), fmt(c, 2)], '-');
    }
    sc = pick(rng, WORD_SUB);
    for (t = 0; t < 100; t++) {
      a = rd(rng, sc.r[0][0], sc.r[0][1], 0);
      b = rd(rng, sc.r[1][0], Math.min(sc.r[1][1], a - 1), e12(rng));
      if (a > b) break;
    }
    return wordProblem('wordSub', lv, sc, [fmt(a, 2), fmt(b, 2)], '-');
  };

  var NAMES = ['masuRead', 'unitConvert', 'compose', 'decompose', 'countUnits',
    'compare', 'order', 'times10', 'numberlineRead', 'hissanAdd', 'hissanSub', 'laws',
    'threeSum', 'wordAdd', 'wordSub'];
  var LEVELS = ['easy', 'normal', 'hard'];

  // make(name, rng?, {level}?)  level 省略・'normal' は今までと同じ問題
  function make(name, rng, opts) {
    if (!gens[name]) throw new Error('unknown generator: ' + name);
    var r = typeof rng === 'function' ? rng : Math.random;
    var lv = opts && (opts.level === 'easy' || opts.level === 'hard') ? opts.level : null;
    var p = lv && LV[lv][name] ? LV[lv][name](r) : gens[name](r, lv || undefined);
    if (p.fig === undefined) delete p.fig;
    return p;
  }

  var G = {
    make: make,
    names: function () { return NAMES.slice(); },
    LEVELS: LEVELS,
    hissanHints: hissanHints,
    util: { fmt: fmt, parse: parse, decimals: decimals, unitAnswer: unitAnswer, carryCount: carryCount, borrowCount: borrowCount }
  };
  S.Generators = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
