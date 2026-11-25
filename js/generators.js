/* generators.js — 似た問題の自動生成（担当D）
 * Shosu.Generators.make(name, rng?, {level:'easy'|'normal'|'hard'}?) -> problem
 *   level を省略（または 'normal'）すると今までと同じ問題（教科書レベル）。
 * Shosu.Generators.names()
 * Shosu.Generators.make(name, rng, {level, skill}) / skillOf(problem) / skillIds() / skillGens(skill)
 *   細かい技能（おすすめモード用。担当O）。下の「細かい技能」を見よ。
 * 小数の計算は、浮動小数の誤差をさけるため整数（100倍・1000倍）で行い、文字列にする。
 * 生成した問題には src（再検証用の元データ）を付ける。
 * 鬼ムズ（追加8）：make('oniAdd'|'oniMulDiv'|'oniMix'|'oniIdea', rng)。oniNames() で名前。names() には入れない。
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
    var d2 = L === 0 && d1 === 0 ? ri(rng, 2, 9) : ri(rng, 1, 9);
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
      else if (op === '1000') x = pick(rng, [ri(rng, 2, 9) * 10, ri(rng, 1, 9) * 100 + ri(rng, 1, 9), ri(rng, 1, 9) * 1000 + ri(rng, 1, 9), ri(rng, 1, 9)]);
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

  // ヒントの式に答えと同じ数が出ないように（2.2−1.1 など）作り直す
  function answerInHints(p) {
    var a = p.parts[1].a;
    return p.hints.some(function (h) { return (h.match(/\d+(?:\.\d+)?/g) || []).indexOf(a) >= 0; });
  }
  gens.wordSub = function (rng, lv) {
    var p;
    for (var t = 0; t < 30; t++) { p = wordSub1(rng, lv); if (!answerInHints(p)) break; }
    return p;
  };
  function wordSub1(rng, lv) {
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
  }

  // =====================================================================
  // 細かい技能（おすすめモード用。担当O）
  //   skillOf(problem) -> 技能id … 問題の中身（数・図・文）から判定する。教科書の問題（src なし）にも使える。
  //   make(name, rng, {level, skill}) … その技能になる問題だけを作る（同じ生成器で作って、合うものを選ぶ）。
  //     そのレベルで作れない技能（かんたんの「くり上がりあり」など）は、ふつう → もう1つのレベル の順で作る。
  //     作った問題の src.skill に技能id、src.lv に実際のレベル（ふつうは無し）が入る。
  //   skill を省略したときは、今までと同じ問題（乱数の使い方も同じ）。
  // =====================================================================
  var SKILL_GENS = {
    'rep-001': ['masuRead'], 'rep-0001': ['masuRead'], 'kui': ['masuRead', 'compose', 'decompose'],
    'unit-m': ['unitConvert'], 'unit-k': ['unitConvert'], 'numberline': ['numberlineRead'],
    'place-name': ['decompose'], 'compose': ['compose', 'decompose'], 'count-units': ['countUnits'],
    'cmp-two': ['compare'], 'cmp-digits': ['compare'], 'order': ['order'],
    'times10': ['times10'], 'times100': ['times10'], 'div10': ['times10'],
    'add-nocarry': ['hissanAdd'], 'add-carry': ['hissanAdd'], 'add-mis': ['hissanAdd'], 'add-trail0': ['hissanAdd'],
    'sub-noborrow': ['hissanSub'], 'sub-borrow': ['hissanSub'], 'sub-multi': ['hissanSub'], 'sub-int': ['hissanSub'],
    'laws': ['laws']
  };
  var ADD_RANK = ['add-nocarry', 'add-carry', 'add-trail0', 'add-mis'];
  var SUB_RANK = ['sub-noborrow', 'sub-borrow', 'sub-multi', 'sub-int'];

  function textOf(p) {
    var t = typeof p.q === 'string' ? p.q : '';
    (p.parts || []).forEach(function (x) { if (typeof x === 'string') t += x; });
    return t;
  }
  function slotsOf(p) {
    return (p.parts || []).filter(function (x) { return x && typeof x === 'object' && x.a != null; }).map(function (x) { return String(x.a); });
  }
  // 小数部分に「0の位」（左右に0でない数字がある0）があるか。1.02、7.305 など
  function hasKui(str) {
    str = String(str);
    var m = /^(\d+)(?:\.(\d+))?$/.exec(str);
    if (!m || !m[2]) return false;
    var ip = m[1].replace(/^0+/, ''), fp = m[2];
    for (var i = 0; i < fp.length; i++) {
      if (fp[i] !== '0') continue;
      var left = ip + fp.slice(0, i), right = fp.slice(i + 1);
      if (/[1-9]/.test(left) && /[1-9]/.test(right)) return true;
    }
    return false;
  }
  // 2つの数の筆算の技能（a, b は小数の文字列）
  function hissanSkill(op, a, b) {
    var e = Math.max(decimals(a), decimals(b));
    var A = parse(a, e), B = parse(b, e);
    if (op === '+') {
      if (decimals(a) !== decimals(b)) return 'add-mis';
      if (e > 0 && (A + B) % 10 === 0) return 'add-trail0';
      return carryCount(A, B) ? 'add-carry' : 'add-nocarry';
    }
    if (decimals(a) === 0 && decimals(b) > 0) return 'sub-int';
    if (A < B) return 'sub-borrow';
    var k = borrowCount(A, B);
    return k === 0 ? 'sub-noborrow' : k === 1 ? 'sub-borrow' : 'sub-multi';
  }
  // いくつかの数を順に計算して、いちばんむずかしい技能を返す（3つの数のたし算・文章題）
  function chainSkill(op, nums) {
    var rank = op === '+' ? ADD_RANK : SUB_RANK, best = -1, acc = nums[0];
    for (var i = 1; i < nums.length; i++) {
      var sk = hissanSkill(op, acc, nums[i]);
      best = Math.max(best, rank.indexOf(sk));
      var e = Math.max(decimals(acc), decimals(nums[i]));
      var v = op === '+' ? parse(acc, e) + parse(nums[i], e) : parse(acc, e) - parse(nums[i], e);
      if (v < 0) break;
      acc = fmt(v, e);
    }
    return rank[Math.max(0, best)];
  }
  var SMALL_UNIT = { cm: 100, mm: 1000, g: 1000, mL: 1000 };
  // 文章の数（単位つき）を取り出す。大きい単位の数とまざっていれば、小さい単位（cm・g・mL）をそろえる
  function wordNums(text) {
    var re = /(\d+(?:\.\d+)?)(km|kg|mL|mm|cm|dL|m|g|L)?/g, m, out = [];
    while ((m = re.exec(text))) out.push([m[1], m[2] || '']);
    var hasBig = out.some(function (x) { return x[1] === 'm' || x[1] === 'kg' || x[1] === 'L'; });
    return out.map(function (x) {
      if (hasBig && SMALL_UNIT[x[1]]) return fmt(Math.round(parse(x[0], 3) / SMALL_UNIT[x[1]]), 3);
      return x[0];
    });
  }
  function exprNums(expr, op) { // src.expr '2.15-85/100' など
    return String(expr).split(op).map(function (t) {
      var m = /^([\d.]+)\/(\d+)$/.exec(t);
      if (!m) return t;
      return fmt(Math.round(parse(m[1], 3) / parseInt(m[2], 10)), 3);
    });
  }
  function unitSkill(units) {
    for (var i = 0; i < units.length; i++) if (/^(km|kg|mm|mL|g)$/.test(units[i])) return 'unit-k';
    return 'unit-m';
  }
  function masuSkill(f) {
    var v = fmt((f.L || 0) * 1000 + (f.d1 || 0) * 100 + (f.d2 || 0) * 10 + (f.level === 3 ? f.d3 || 0 : 0), 3);
    if (hasKui(v)) return 'kui';
    return f.level === 3 ? 'rep-0001' : 'rep-001';
  }
  function cmpSkill(q) {
    var m = /([\d.]+) □ ([\d.]+)$/.exec(q || '');
    if (!m) return 'cmp-digits';
    return decimals(m[1]) === decimals(m[2]) ? 'cmp-two' : 'cmp-digits';
  }
  function jubaiSkill(t) {
    if (/(100|1000)倍/.test(t)) return 'times100';
    if (/1\/10/.test(t)) return 'div10';
    return 'times10';
  }
  function composeSkill(p) {
    var x = /^([\d.]+)は、/.exec(String((p.parts || [])[0] || ''));
    var num = x ? x[1] : slotsOf(p)[0];
    if (/^[\d.]+は、\d+と$/.test(p.parts && p.parts[0] || '')) return 'compose'; // 2.81は、2と□
    return num && hasKui(num) ? 'kui' : 'compose';
  }
  function maxDecimals(t) {
    var m = t.match(/\d+(?:\.\d+)?/g) || [];
    return m.reduce(function (a, s) { return Math.max(a, decimals(s)); }, 0);
  }

  function skillOf(p) {
    if (!p || typeof p !== 'object') return null;
    var src = p.src || {}, gen = src.gen, t = textOf(p);
    if (ONI_SKILL[gen]) return src.skill || ONI_SKILL[gen]; // 鬼ムズ
    if (p.type === 'hissan' && p.a != null && p.b != null) {
      try { return hissanSkill(p.op === '-' ? '-' : '+', String(p.a), String(p.b)); } catch (e) { return p.op === '-' ? 'sub-borrow' : 'add-carry'; }
    }
    switch (gen) {
      case 'masuRead': return masuSkill(p.fig || src);
      case 'unitConvert': return unitSkill((src.from || []).map(function (f) { return f[1]; }).concat([src.to]));
      case 'numberlineRead': return 'numberline';
      case 'compose': return composeSkill(p);
      case 'decompose': return p.type === 'choice' || src.kind === 'digit' ? 'place-name' : composeSkill(p);
      case 'countUnits': return 'count-units';
      case 'compare': return cmpSkill(p.q);
      case 'order': return 'order';
      case 'times10': return jubaiSkill(t);
      case 'laws': return 'laws';
      case 'threeSum': try { return chainSkill('+', src.nums); } catch (e) { return 'add-carry'; }
      case 'wordAdd': try { return chainSkill('+', exprNums(src.expr, '+')); } catch (e) { return 'add-carry'; }
      case 'wordSub': try { return chainSkill('-', exprNums(src.expr, '-')); } catch (e) { return 'sub-borrow'; }
    }
    // 教科書の問題など（src なし）：tag と中身から
    var tag = p.tag;
    if (p.fig && p.fig.kind === 'masu') return masuSkill(p.fig);
    if (p.fig && p.fig.kind === 'numberline' && (tag === 'hyoshikata' || tag === 'daisho' || !tag)) return 'numberline';
    switch (tag) {
      case 'hyoshikata': {
        if (/こ集め/.test(t)) return maxDecimals(t) >= 3 ? 'rep-0001' : 'rep-001';
        if (p.type === 'choice' && /読み方/.test(t)) return maxDecimals(t) >= 3 ? 'rep-0001' : 'rep-001';
        var units = [], re = /\d(km|kg|mL|mm|cm|dL|m|g|L)/g, m;
        while ((m = re.exec(t))) units.push(m[1]);
        (p.parts || []).forEach(function (x) { if (typeof x === 'string' && /^(km|kg|mL|mm|cm|dL|m|g|L)$/.test(x)) units.push(x); });
        if (/何(km|kg|mL|mm|cm|dL|m|g|L)/.test(t)) units.push(/何(km|kg|mL|mm|cm|dL|m|g|L)/.exec(t)[1]);
        if (units.length) return unitSkill(units);
        return 'rep-001';
      }
      case 'shikumi':
        if (/こ集め/.test(t) || /倍です|1\/です/.test(t)) return 'count-units'; // 0.01を何こ集めた数・1は0.01の100倍
        if (/の位/.test(t)) return 'place-name';
        return composeSkill(p);
      case 'daisho':
        if (p.type === 'order') return 'order';
        if (p.type === 'choice') return cmpSkill(p.q);
        return 'order';
      case 'jubai': return jubaiSkill(t);
      case 'tashizan': case 'hikizan': {
        var op = tag === 'tashizan' ? '+' : '-';
        var ex = /(\d+(?:\.\d+)?)\s*[＋+]\s*(\d+(?:\.\d+)?)/.exec(t);
        if (op === '+' && ex) { try { return hissanSkill('+', ex[1], ex[2]); } catch (e) { /* 下へ */ } }
        var ns = wordNums(typeof p.q === 'string' ? p.q : t);
        if (ns.length >= 2 && ns.length <= 3) { try { return chainSkill(op, ns); } catch (e) { /* 下へ */ } }
        return op === '+' ? 'add-carry' : 'sub-borrow';
      }
      case 'kimari': return 'laws';
    }
    if (p.type === 'order') return 'order';
    return null;
  }

  function makeSkill(name, r, lv, skill) {
    var list = SKILL_GENS[skill];
    if (!list) throw new Error('unknown skill: ' + skill);
    if (list.indexOf(name) < 0) throw new Error('skill ' + skill + ' は ' + name + ' では作れません');
    var order = lv === 'easy' ? ['easy', 'normal', 'hard'] : lv === 'hard' ? ['hard', 'normal', 'easy'] : ['normal', 'easy', 'hard'];
    var last = null;
    for (var k = 0; k < order.length; k++) {
      var L = order[k];
      for (var t = 0; t < 400; t++) {
        var p = L !== 'normal' && LV[L][name] ? LV[L][name](r) : gens[name](r);
        last = p;
        if (skillOf(p) === skill) {
          if (p.fig === undefined) delete p.fig;
          p.src.skill = skill;
          return p;
        }
      }
    }
    if (last && last.fig === undefined) delete last.fig;
    return last;
  }

  // =====================================================================
  // 鬼ムズ（まとめモードの level 'oni'。追加8・担当U）
  //   make('oniAdd'|'oniMulDiv'|'oniMix'|'oniIdea', rng) … level・skill は見ない（いつも鬼ムズ）。
  //   tag は 'oni'、src.skill は 'oni-add' など、src.kind は問題の種類。4年の範囲をこえるものは beyond:true。
  //   ヒントは3段階（何を考えるか → 途中まで → 見つけ方）。答えそのものはヒントに出さない。explain は正解後の説明。
  //   数は 1000倍した整数で計算する（浮動小数を使わない）。
  // =====================================================================
  var ONI_NAMES = ['oniAdd', 'oniMulDiv', 'oniMix', 'oniIdea'];
  var ONI_SKILL = { oniAdd: 'oni-add', oniMulDiv: 'oni-muldiv', oniMix: 'oni-mix', oniIdea: 'oni-idea' };
  var BEYOND = 'まだ習っていないけど、0.1や0.01の何こ分で考えればできるよ。';
  var UNIT_OF = ['1', '0.1', '0.01', '0.001'];
  var TEN_TEXT = ['', '0.1が10こで1だよ。', '0.01が100こで1、10こで0.1だよ。', '0.001が1000こで1、100こで0.1、10こで0.01だよ。'];

  function F(v) { return fmt(v, 3); }            // 1000倍の整数 → 小数の文字列
  function decOf(v) { return decimals(F(v)); }    // 1000倍の整数の小数のけた数
  function cnt(v) { return v / POW[3 - decOf(v)]; } // 「0.01 が何こ」の「何こ」（いちばん下の位の単位で）
  function opc(op) { return op === '+' ? '＋' : '−'; }
  // [lo, hi]（1000倍）の中で、小数第e位まで（第e位は0でない。e=0 は整数）の数
  function oniNum(rng, lo, hi, e) {
    var u = POW[3 - e], a = Math.ceil(lo / u), b = Math.floor(hi / u);
    for (var t = 0; t < 200; t++) {
      var k = ri(rng, a, b);
      if (e === 0 || k % 10 !== 0) return k * u;
    }
    return (a % 10 === 0 ? a + 1 : a) * u; // ここにはふつう来ない
  }
  function padTo(s, e) { var p = s.split('.'), f = p[1] || ''; while (f.length < e) f += '0'; return p[0] + '.' + f; }
  function chainText(nums, ops) {
    var s = F(nums[0]);
    for (var i = 1; i < nums.length; i++) s += opc(ops[i - 1]) + F(nums[i]);
    return s;
  }
  function chainSteps(nums, ops) {
    var acc = nums[0], out = [];
    for (var i = 1; i < nums.length; i++) { acc = ops[i - 1] === '+' ? acc + nums[i] : acc - nums[i]; out.push(acc); }
    return out;
  }
  function exprFill(q, text, ans) { return { type: 'fill', tag: 'oni', q: q, parts: [text + '＝', { a: F(ans) }] }; }

  // ヒントに答えが出ていないか（1けたの整数の答えは見ない）
  function oniLeak(p) {
    var ans = [];
    if (p.type === 'fill') p.parts.forEach(function (x) { if (x && typeof x === 'object') ans.push(String(x.a)); });
    if (p.type === 'choice') ans.push(p.a, p.src.ansVal);
    return ans.some(function (a) {
      if (!a || (a.length < 2 && a.indexOf('.') < 0)) return false;
      return p.hints.some(function (h) {
        if (p.type === 'choice' && h.indexOf(p.a) >= 0) return true;
        return (h.match(/\d+(?:\.\d+)?/g) || []).indexOf(a) >= 0;
      });
    });
  }
  function oniMake(name, one, rng) {
    var p;
    for (var t = 0; t < 60; t++) { p = one(rng); if (!oniLeak(p)) break; }
    p.tag = 'oni';
    p.src.skill = ONI_SKILL[name];
    if (!p.beyond) delete p.beyond;
    return finish(name, p);
  }

  // ---------- ① たし算・ひき算（大きな数、小数第三位、3〜4この数、文章題）----------
  var ONI_WORD_UNITS = {
    L: { big: 'L', small: 'mL', dl: true },
    km: { big: 'km', small: 'm' },
    kg: { big: 'kg', small: 'g' }
  };
  var ONI_WORDS = [
    { u: 'L', ops: ['-', '+', '-'], start: [8000, 30000], q: function (v) { return '水そうに水が' + v[0] + '入っています。はじめに' + v[1] + '使い、つぎに' + v[2] + '入れて、さいごに' + v[3] + '使いました。水そうの水は何Lになりましたか。'; }, ans: ['水そうの水は', 'Lになりました。'] },
    { u: 'L', ops: ['-', '-', '-'], start: [5000, 20000], q: function (v) { return 'お楽しみ会のために、ジュースを' + v[0] + '用意しました。ゆいさんのはんが' + v[1] + '、そうたさんのはんが' + v[2] + '、先生が' + v[3] + '飲みました。ジュースののこりは何Lですか。'; }, ans: ['のこりは', 'Lです。'] },
    { u: 'km', ops: ['+', '+', '+'], start: [1000, 9000], q: function (v) { return '家から公園まで' + v[0] + '、公園から図書館まで' + v[1] + '、図書館から駅まで' + v[2] + '、駅から家まで' + v[3] + 'あります。家から公園・図書館・駅を通って家にもどると、道のりは全部で何kmですか。'; }, ans: ['道のりは全部で', 'kmです。'] },
    { u: 'km', ops: ['-', '-'], start: [10000, 30000], q: function (v) { return 'ハイキングコースは全部で' + v[0] + 'あります。午前中に' + v[1] + '、お昼ごはんのあとに' + v[2] + '歩きました。ゴールまで、のこりは何kmですか。'; }, ans: ['のこりは', 'kmです。'] },
    { u: 'kg', ops: ['+', '+', '-'], start: [500, 3000], q: function (v) { return 'リュックサックの重さは' + v[0] + 'です。そこに' + v[1] + 'の本と' + v[2] + 'の水とうを入れ、あとで' + v[3] + 'のおべんとうを取り出しました。リュックサック全体の重さは何kgになりましたか。'; }, ans: ['全体の重さは', 'kgになりました。'] },
    { u: 'kg', ops: ['-', '-', '+'], start: [5000, 20000], q: function (v) { return '小麦粉が' + v[0] + 'ありました。パンを作るのに' + v[1] + '、クッキーを作るのに' + v[2] + '使いました。そのあと' + v[3] + '買い足しました。小麦粉は何kgになりましたか。'; }, ans: ['小麦粉は', 'kgになりました。'] }
  ];
  function wordQty(rng, form, lo, hi) { // 1000倍（小さい単位の数）
    if (form === 'dec') return oniNum(rng, lo, hi, ri(rng, 1, 3));
    if (form === 'mix') return ri(rng, Math.max(1, Math.floor(lo / 1000)), Math.max(1, Math.floor(hi / 1000))) * 1000 + wpick(rng, [[2, ri(rng, 1, 9)], [3, ri(rng, 10, 99)], [4, ri(rng, 100, 999)]]);
    if (form === 'small') return wpick(rng, [[1, ri(rng, 10, 99)], [4, ri(rng, 100, 999)]]);
    return ri(rng, 1, 9) * 100; // dL
  }
  function wordShow(v, form, U) {
    if (form === 'dec') return F(v) + U.big;
    if (form === 'mix') return Math.floor(v / 1000) + U.big + (v % 1000) + U.small;
    if (form === 'small') return v + U.small;
    return (v / 100) + 'dL';
  }
  function oniAddWord(rng) {
    var sc = pick(rng, ONI_WORDS), U = ONI_WORD_UNITS[sc.u], vals, forms, t;
    for (t = 0; t < 500; t++) {
      forms = [rng() < 0.6 ? 'dec' : 'mix'];
      var opts = U.dl ? ['dec', 'dec', 'mix', 'small', 'dl'] : ['dec', 'dec', 'mix', 'small'];
      for (var i = 0; i < sc.ops.length; i++) forms.push(pick(rng, opts));
      var conv = forms.filter(function (f) { return f !== 'dec'; }).length;
      if (conv < 1 || conv > 3 || forms.indexOf('dec') < 0) continue;
      vals = forms.map(function (f, k) { return k === 0 ? wordQty(rng, f, sc.start[0], sc.start[1]) : wordQty(rng, f, 150, 4500); });
      if (vals.some(function (v, k) { return forms[k] === 'mix' && v % 1000 === 0; })) continue;
      var steps = chainSteps(vals, sc.ops);
      if (steps.some(function (s) { return s <= 0; })) continue;
      var last = steps[steps.length - 1];
      if (last % 1000 === 0 || last >= 1000000) continue;
      break;
    }
    var shows = vals.map(function (v, k) { return wordShow(v, forms[k], U); });
    var ans = chainSteps(vals, sc.ops).pop();
    var expr = chainText(vals, sc.ops);
    var ci = forms.indexOf(forms.filter(function (f) { return f !== 'dec'; })[0]);
    var hasDl = forms.indexOf('dl') >= 0;
    return {
      type: 'fill', tag: 'oni',
      q: sc.q(shows),
      parts: [sc.ans[0], { a: F(ans) }, sc.ans[1]],
      hints: [
        '単位を' + U.big + 'にそろえよう。「' + shows[ci] + '」は何' + U.big + 'かな？　1' + U.small + '＝0.001' + U.big + (hasDl ? '、1dL＝0.1L' : '') + 'だよ。',
        '単位をそろえると、式は ' + expr + ' になるね。',
        '前から順に、小数点の位置をたてにそろえて計算しよう。ひけない位は、1つ上の位からくり下げるよ。'
      ],
      explain: '単位を' + U.big + 'にそろえると、' + expr + '＝' + F(ans) + '（' + U.big + '）だよ。',
      src: { kind: 'word', u: U.big, show: shows, ops: sc.ops.slice(), expr: vals.map(F).join('|') }
    };
  }
  function oniAdd1(rng) {
    var kind = wpick(rng, [[3, 'mix3'], [2, 'mix4'], [2, 'intSub'], [1, 'add4'], [3, 'word']]);
    if (kind === 'word') return oniAddWord(rng);
    var nums, ops, es, t, n, i;
    for (t = 0; t < 2000; t++) {
      if (kind === 'mix3') ops = pick(rng, [['+', '-'], ['-', '+'], ['-', '-']]);
      else if (kind === 'mix4') ops = pick(rng, [['+', '-', '+'], ['-', '+', '-'], ['+', '+', '-'], ['-', '-', '+'], ['+', '-', '-']]);
      else if (kind === 'add4') ops = ['+', '+', '+'];
      else ops = rng() < 0.5 ? ['-', '-'] : ['-', '-', '-'];
      n = ops.length + 1;
      es = [];
      for (i = 0; i < n; i++) es.push(ri(rng, 1, 3));
      if (kind === 'intSub') es[0] = 0;
      if (es.indexOf(3) < 0) es[ri(rng, 1, n - 1)] = 3;
      if (es.filter(function (e, k) { return es.indexOf(e) === k; }).length < 2) continue;
      nums = [];
      if (kind === 'intSub') nums.push(rng() < 0.6 ? pick(rng, [10, 20, 30, 50, 100]) * 1000 : oniNum(rng, 11000, 99000, 0));
      else nums.push(oniNum(rng, 10000, 299999, es[0]));
      for (i = 1; i < n; i++) nums.push(rng() < 0.4 ? oniNum(rng, 100, 9999, es[i]) : oniNum(rng, 10000, kind === 'intSub' ? 39999 : 79999, es[i]));
      var steps = chainSteps(nums, ops);
      if (steps.some(function (s) { return s <= 0; })) continue;
      var fin = steps[steps.length - 1];
      if (fin >= 1000000 || fin === 0) continue;
      var acc = nums[0], k = 0;
      for (i = 1; i < n; i++) {
        k += ops[i - 1] === '+' ? (kind === 'add4' ? carryCount(acc, nums[i]) : 0) : borrowCount(acc, nums[i]);
        acc = ops[i - 1] === '+' ? acc + nums[i] : acc - nums[i];
      }
      if (k < (kind === 'add4' ? 3 : 2)) continue;
      break;
    }
    var st = chainSteps(nums, ops), ans = st[st.length - 1];
    var maxE = Math.max.apply(null, nums.map(decOf));
    var shortN = nums.filter(function (v) { return decOf(v) < maxE; })[0];
    var h1 = 'けたの数がちがう数は、小数点の位置をたてにそろえて書こう。' + (shortN !== undefined ? F(shortN) + 'は「' + padTo(F(shortN), maxE) + '」と考えるといいよ。' : '');
    var h2 = '前から順に計算しよう。はじめの ' + F(nums[0]) + opc(ops[0]) + F(nums[1]) + ' は ' + F(st[0]) + ' だね。';
    var h3 = kind === 'add4'
      ? 'くり上がりの1を わすれないように、小さく書いておこう。のこりの数も 同じように順に たしていこう。'
      : 'ひけない位は、1つ上の位から1くり下げよう。上の位が0のときは、さらに上の位から順にくり下げるよ。';
    var ex = [], acc2 = nums[0];
    for (var j = 1; j < nums.length; j++) { ex.push(F(acc2) + opc(ops[j - 1]) + F(nums[j]) + '＝' + F(st[j - 1])); acc2 = st[j - 1]; }
    var p = exprFill('計算しましょう。', chainText(nums, ops), ans);
    p.hints = [h1, h2, h3];
    p.explain = '前から順に、' + ex.join('、') + '。小数点の位置をそろえて計算するよ。';
    p.src = { kind: kind, nums: nums.map(F), ops: ops };
    return p;
  }
  gens.oniAdd = function (rng) { return oniMake('oniAdd', oniAdd1, rng); };

  // ---------- ② 小数×整数・小数÷整数（わりきれるもの。4年の後半の内容）----------
  var ONI_WMUL = [
    { u: 'm', q: function (a, m) { return 'リボンを1人に' + a + 'mずつ、' + m + '人に配ります。リボンは全部で何mいりますか。'; }, ans: ['全部で', 'mいります。'] },
    { u: 'L', q: function (a, m) { return '1本' + a + 'Lのジュースが' + m + '本あります。ジュースは全部で何Lですか。'; }, ans: ['全部で', 'Lです。'] },
    { u: 'kg', q: function (a, m) { return '1こ' + a + 'kgのかんづめが' + m + 'こあります。かんづめの重さは全部で何kgですか。'; }, ans: ['全部で', 'kgです。'] }
  ];
  var ONI_WDIV = [
    { u: 'L', q: function (a, d) { return a + 'Lのジュースを' + d + '人で同じように分けます。1人分は何Lですか。'; }, ans: ['1人分は', 'Lです。'] },
    { u: 'm', q: function (a, d) { return a + 'mのリボンを' + d + '等分します。1本の長さは何mですか。'; }, ans: ['1本の長さは', 'mです。'] },
    { u: 'kg', q: function (a, d) { return a + 'kgのさとうを、' + d + 'つのふくろに同じ重さずつ入れます。1ふくろは何kgですか。'; }, ans: ['1ふくろは', 'kgです。'] }
  ];
  function mulHints(as, m, A, e) {
    var u = UNIT_OF[e];
    return [
      as + '×' + m + ' は、' + u + ' が ' + A + 'こ の ' + m + 'つ分 と考えよう。' + BEYOND,
      A + '×' + m + '＝' + (A * m) + '。' + u + ' が ' + (A * m) + 'こ は いくつかな？',
      TEN_TEXT[e] + 'だから、' + (A * m) + ' の右から' + e + 'けたのところに小数点を打てばいいね。小数点より右のいちばん後ろの0は消そう。'
    ];
  }
  function divHints(ds, d, N, q, e) {
    var u = UNIT_OF[e];
    return [
      ds + '÷' + d + ' は、' + u + ' が ' + N + 'こ を ' + d + 'つに同じ数ずつ分ける と考えよう。' + BEYOND,
      N + '÷' + d + '＝' + q + '。' + u + ' が ' + q + 'こ は いくつかな？',
      TEN_TEXT[e] + 'だから、' + q + ' の右から' + e + 'けたのところに小数点を打てばいいね。一の位が0なら「0.」と書くよ。'
    ];
  }
  function oniMulDiv1(rng) {
    var kind = wpick(rng, [[3, 'mul1'], [2, 'mul2'], [3, 'div'], [1, 'wordMul'], [1, 'wordDiv']]);
    var e, A, m, t, p, sc;
    if (kind === 'mul1' || kind === 'mul2' || kind === 'wordMul') {
      var two = kind === 'mul2' || (kind === 'wordMul' && rng() < 0.4);
      for (t = 0; t < 200; t++) {
        if (!two && rng() < 0.15) { var sp = pick(rng, [[125, 3, 8], [25, 2, 4], [375, 3, 8], [75, 2, 4], [125, 3, 4], [25, 2, 8]]); A = sp[0]; e = sp[1]; m = sp[2]; break; }
        if (two) { e = rng() < 0.6 ? 2 : 1; m = ri(rng, 11, 25); A = e === 1 ? ri(rng, 11, 99) : ri(rng, 11, 499); }
        else { e = wpick(rng, [[2, 1], [3, 2], [2, 3]]); m = ri(rng, 2, 9); A = e === 1 ? ri(rng, 11, 299) : e === 2 ? ri(rng, 11, 999) : ri(rng, 11, 2999); }
        if (A % 10 !== 0) break;
      }
      var a = A * POW[3 - e], as = F(a), ans = a * m;
      if (kind === 'wordMul') {
        sc = pick(rng, ONI_WMUL);
        p = { type: 'fill', tag: 'oni', q: sc.q(as, m), parts: [sc.ans[0], { a: F(ans) }, sc.ans[1]] };
        p.hints = mulHints(as, m, A, e);
        p.hints[0] = '「1つ分の量 × いくつ分」で、式は ' + as + '×' + m + ' だね。' + p.hints[0];
      } else {
        p = exprFill('計算しましょう。', as + '×' + m, ans);
        p.hints = mulHints(as, m, A, e);
      }
      p.explain = as + '×' + m + ' は、' + UNIT_OF[e] + ' が ' + A + '×' + m + '＝' + (A * m) + 'こ分だから、' + F(ans) + ' だよ。';
      p.src = { kind: kind, op: '*', a: as, b: String(m) };
    } else {
      var q, d, N;
      for (t = 0; t < 400; t++) {
        e = wpick(rng, [[3, 1], [3, 2], [1, 3]]);
        d = ri(rng, 2, 9);
        q = e === 1 ? ri(rng, 11, 99) : e === 2 ? ri(rng, 1, 499) : ri(rng, 1, 299);
        if (q % 10 === 0) continue;
        N = q * d;
        if (N % 10 !== 0) break;
      }
      var ds = F(N * POW[3 - e]), qa = q * POW[3 - e];
      if (kind === 'wordDiv') {
        sc = pick(rng, ONI_WDIV);
        p = { type: 'fill', tag: 'oni', q: sc.q(ds, d), parts: [sc.ans[0], { a: F(qa) }, sc.ans[1]] };
        p.hints = divHints(ds, d, N, q, e);
        p.hints[0] = '同じように分けるから、式は ' + ds + '÷' + d + ' だね。' + p.hints[0];
      } else {
        p = exprFill('計算しましょう。', ds + '÷' + d, qa);
        p.hints = divHints(ds, d, N, q, e);
      }
      p.explain = ds + '÷' + d + ' は、' + UNIT_OF[e] + ' が ' + N + '÷' + d + '＝' + q + 'こ分だから、' + F(qa) + ' だよ。';
      p.src = { kind: kind, op: '/', a: ds, b: String(d) };
    }
    p.beyond = true;
    return p;
  }
  gens.oniMulDiv = function (rng) { return oniMake('oniMulDiv', oniMulDiv1, rng); };

  // ---------- ③ まじった式・計算のくふう・□をつかう式 ----------
  function oniMix1(rng) {
    var kind = wpick(rng, [[2, 'parenMul'], [2, 'kufuMul'], [2, 'kufuAdd'], [2, 'parenSub'], [1, 'kufuSub'], [2, 'order'], [1, 'divMix'], [4, 'box']]);
    var a, b, c, d, m, t, s, p, ans, txt, u;
    switch (kind) {
      case 'parenMul': {
        var intSum = rng() < 0.5, op = rng() < 0.75 ? '+' : '-';
        for (t = 0; t < 300; t++) {
          a = oniNum(rng, 1010, 8990, 2);
          if (intSum) {
            if (op === '+') b = ri(rng, 0, 4) * 1000 + (1000 - a % 1000);
            else b = ri(rng, 0, Math.floor(a / 1000) - 1) * 1000 + a % 1000;
          } else b = oniNum(rng, 110, 4990, ri(rng, 1, 2));
          s = op === '+' ? a + b : a - b;
          if (b <= 0 || s < 1000 || (s % 1000 === 0) !== intSum) continue;
          break;
        }
        m = ri(rng, 2, 9); ans = s * m;
        u = UNIT_OF[decOf(s)];
        p = exprFill('計算しましょう。', '(' + F(a) + opc(op) + F(b) + ')×' + m, ans);
        p.hints = [
          '( )の中を先に計算しよう。' + (intSum ? '' : BEYOND),
          F(a) + opc(op) + F(b) + '＝' + F(s) + ' だね。',
          intSum ? 'つぎに、その答えに' + m + 'をかけよう。整数のかけ算になるね。' : F(s) + '×' + m + ' は、' + u + ' が ' + cnt(s) + 'こ の ' + m + 'つ分 と考えよう。'
        ];
        p.explain = '( )の中を先に計算して ' + F(s) + '。' + F(s) + '×' + m + '＝' + F(ans) + ' だよ。';
        p.beyond = !intSum;
        p.src = { kind: kind };
        break;
      }
      case 'kufuMul': {
        var pr = pick(rng, [[250, 4], [500, 2], [125, 8], [2500, 4], [1250, 8], [200, 5], [400, 5]]);
        a = pr[0]; m = pr[1];
        var P = a * m / 1000; // 1, 2, 10
        var X = oniNum(rng, 1100, 99900, ri(rng, 1, 2));
        ans = X * P;
        txt = rng() < 0.5 ? F(a) + '×' + F(X) + '×' + m : m + '×' + F(X) + '×' + F(a);
        u = UNIT_OF[decOf(a)];
        p = exprFill('くふうして計算しましょう。', txt, ans);
        p.hints = [
          'かけ算は、かける順番をかえても答えは同じだよ。かけると きりのよい数になる2つを 先に計算しよう。' + BEYOND,
          F(a) + '×' + m + ' は、' + u + ' が ' + cnt(a) + '×' + m + '＝' + (cnt(a) * m) + 'こ分 だね。',
          P === 1 ? '1に どんな数をかけても、答えは その数のままだね。' : P === 2 ? 'のこりの数を 2倍しよう。' : '10倍すると、どの数字も位が1つ上がるよ。'
        ];
        p.explain = F(a) + '×' + m + '＝' + P + ' を先に計算すると、' + P + '×' + F(X) + '＝' + F(ans) + ' だよ。';
        p.beyond = true;
        p.src = { kind: kind };
        break;
      }
      case 'kufuAdd': {
        for (t = 0; t < 200; t++) {
          a = oniNum(rng, 1010, 9990, 2);
          c = (Math.ceil(a / 1000) + ri(rng, 0, 5)) * 1000 - a;
          b = oniNum(rng, 1100, 9900, ri(rng, 1, 2));
          d = (Math.ceil(b / 1000) + ri(rng, 0, 4)) * 1000 - b;
          if (c > 100 && d > 100 && decOf(c) === 2) break;
        }
        ans = a + b + c + d;
        p = exprFill('くふうして計算しましょう。', F(a) + '＋' + F(b) + '＋' + F(c) + '＋' + F(d), ans);
        p.hints = [
          'たす順番をかえても、答えは同じだよ。たすと きりのよい数（整数）になる組を さがそう。',
          F(a) + ' と組にすると、小数の部分がちょうど1になる数は どれかな？',
          '2つずつ組にして たしてから、その2つの答えを たそう。'
        ];
        p.explain = '(' + F(a) + '＋' + F(c) + ')＋(' + F(b) + '＋' + F(d) + ')＝' + F(a + c) + '＋' + F(b + d) + '＝' + F(ans) + ' だよ。';
        p.src = { kind: kind };
        break;
      }
      case 'parenSub': case 'kufuSub': {
        for (t = 0; t < 300; t++) {
          a = oniNum(rng, 5100, 39900, ri(rng, 1, 2));
          if (kind === 'parenSub') {
            b = ri(rng, 1, Math.max(1, Math.floor(a / 1000) - 2)) * 1000 + a % 1000;
            c = oniNum(rng, 110, 9900, ri(rng, 1, 2));
          } else {
            b = oniNum(rng, 1010, 9990, ri(rng, 1, 2));
            c = (Math.ceil(b / 1000) + ri(rng, 0, 3)) * 1000 - b;
            if (c < 100) continue;
          }
          if (b <= 0 || a - b - c <= 0) continue;
          break;
        }
        ans = a - b - c;
        if (kind === 'parenSub') {
          p = exprFill('くふうして計算しましょう。', F(a) + '−(' + F(b) + '＋' + F(c) + ')', ans);
          p.hints = [
            'まとめてひくのと、1つずつ順にひくのは 同じだよ。' + F(a) + '−' + F(b) + '−' + F(c) + ' と考えてもいいね。',
            F(a) + '−' + F(b) + ' を先に計算すると、きりのよい数になるね。',
            'その答えから ' + F(c) + ' をひこう。'
          ];
          p.explain = F(a) + '−' + F(b) + '−' + F(c) + '＝' + F(a - b) + '−' + F(c) + '＝' + F(ans) + ' だよ。';
        } else {
          p = exprFill('くふうして計算しましょう。', F(a) + '−' + F(b) + '−' + F(c), ans);
          p.hints = [
            'ひく数を先に たしてから まとめてひいても、答えは同じだよ。',
            F(b) + '＋' + F(c) + ' を先に計算すると、きりのよい数になるね。',
            'その答えを ' + F(a) + ' からひこう。'
          ];
          p.explain = F(a) + '−(' + F(b) + '＋' + F(c) + ')＝' + F(a) + '−' + F(b + c) + '＝' + F(ans) + ' だよ。';
        }
        p.src = { kind: kind };
        break;
      }
      case 'order': case 'divMix': {
        var op2 = rng() < 0.6 ? '+' : '-', mid, midTxt, midH;
        for (t = 0; t < 300; t++) {
          if (kind === 'order') {
            b = oniNum(rng, 110, 4990, ri(rng, 1, 2)); m = ri(rng, 2, 9); mid = b * m;
          } else {
            var e2 = ri(rng, 1, 2), qq = e2 === 1 ? ri(rng, 11, 99) : ri(rng, 11, 299);
            if (qq % 10 === 0) continue;
            m = ri(rng, 2, 9);
            if ((qq * m) % 10 === 0) continue;
            mid = qq * POW[3 - e2]; b = mid * m;
          }
          a = oniNum(rng, op2 === '-' ? mid + 1000 : 1100, op2 === '-' ? mid + 30000 : 30000, ri(rng, 1, 3));
          if (op2 === '-' && a <= mid) continue;
          break;
        }
        ans = op2 === '+' ? a + mid : a - mid;
        midTxt = kind === 'order' ? F(b) + '×' + m : F(b) + '÷' + m;
        txt = op2 === '+' ? (rng() < 0.5 ? F(a) + '＋' + midTxt : midTxt + '＋' + F(a)) : F(a) + '−' + midTxt;
        u = kind === 'order' ? UNIT_OF[decOf(b)] : UNIT_OF[decOf(mid)];
        midH = kind === 'order'
          ? F(b) + '×' + m + ' は、' + u + ' が ' + cnt(b) + '×' + m + '＝' + (cnt(b) * m) + 'こ分 だね。'
          : F(b) + '÷' + m + ' は、' + u + ' が ' + (b / POW[3 - decOf(mid)]) + 'こ を ' + m + 'つに分けた1つ分 だね。';
        p = exprFill('計算しましょう。', txt, ans);
        p.hints = [
          (kind === 'order' ? '×' : '÷') + 'と' + opc(op2) + 'がまじった式では、' + (kind === 'order' ? '×' : '÷') + 'を先に計算するよ。' + BEYOND,
          midH,
          op2 === '+' ? 'その答えと ' + F(a) + ' を たそう。' : F(a) + ' から その答えを ひこう。'
        ];
        p.explain = midTxt + '＝' + F(mid) + ' を先に計算して、' + (op2 === '+' ? F(a) + '＋' + F(mid) : F(a) + '−' + F(mid)) + '＝' + F(ans) + ' だよ。';
        p.beyond = true;
        p.src = { kind: kind };
        break;
      }
      default: { // box
        var bk = wpick(rng, [[2, 'boxA'], [2, 'boxB'], [2, 'boxC'], [2, 'boxP'], [1, 'boxM']]), x, parts, hints, eq;
        for (t = 0; t < 300; t++) {
          if (bk === 'boxA') { x = oniNum(rng, 1010, 49999, ri(rng, 1, 3)); b = oniNum(rng, 1010, 29999, ri(rng, 1, 3)); c = x + b; }
          else if (bk === 'boxB') { x = oniNum(rng, 10100, 59999, ri(rng, 1, 3)); b = oniNum(rng, 1010, x - 500, ri(rng, 1, 3)); c = x - b; }
          else if (bk === 'boxC') { a = oniNum(rng, 10000, 59999, ri(rng, 0, 3)); c = oniNum(rng, 1010, a - 500, ri(rng, 1, 3)); x = a - c; }
          else if (bk === 'boxP') { var K = ri(rng, 3, 12); m = ri(rng, 3, 9); b = oniNum(rng, 110, K * 1000 - 100, ri(rng, 1, 3)); x = K * 1000 - b; c = K * m * 1000; }
          else { var e3 = ri(rng, 1, 2), qx = e3 === 1 ? ri(rng, 11, 99) : ri(rng, 11, 499); m = ri(rng, 2, 9); if (qx % 10 === 0 || (qx * m) % 10 === 0) continue; x = qx * POW[3 - e3]; c = x * m; }
          if (x > 0 && c > 0 && F(x) !== F(c) && x % 1000 !== 0) break;
        }
        if (bk === 'boxA') {
          parts = [{ a: F(x) }, '＋' + F(b) + '＝' + F(c)];
          hints = ['□に ' + F(b) + ' をたすと ' + F(c) + ' になるね。たし算とひき算の関係を使おう。', '□は、' + F(c) + '−' + F(b) + ' で もとめられるよ。', '小数点の位置をそろえて計算しよう。答えが出たら、□に入れて たしかめよう。'];
        } else if (bk === 'boxB') {
          parts = [{ a: F(x) }, '−' + F(b) + '＝' + F(c)];
          hints = ['□から ' + F(b) + ' をひくと ' + F(c) + ' になるね。ひく前の数に もどすには どうすればいいかな？', '□は、' + F(c) + '＋' + F(b) + ' で もとめられるよ。', '小数点の位置をそろえて計算しよう。答えが出たら、□に入れて たしかめよう。'];
        } else if (bk === 'boxC') {
          parts = [F(a) + '−', { a: F(x) }, '＝' + F(c)];
          hints = [F(a) + ' から□をひくと ' + F(c) + ' になるね。□は、ひかれる数とのこりの数の ちがいだよ。', '□は、' + F(a) + '−' + F(c) + ' で もとめられるよ。', '小数点の位置をそろえて計算しよう。答えが出たら、□に入れて たしかめよう。'];
        } else if (bk === 'boxP') {
          parts = ['(', { a: F(x) }, '＋' + F(b) + ')×' + m + '＝' + F(c)];
          hints = ['( )の中を1つのかたまりと考えよう。（かたまり）×' + m + '＝' + F(c) + ' だね。', 'かたまりは ' + F(c) + '÷' + m + ' で もとめられるね。', 'かたまりが分かったら、□＋' + F(b) + '＝（かたまり） の□を もとめよう。'];
        } else {
          var em = decOf(x), N2 = c / POW[3 - em];
          parts = [{ a: F(x) }, '×' + m + '＝' + F(c)];
          hints = ['□×' + m + '＝' + F(c) + ' だから、□は ' + F(c) + '÷' + m + ' で もとめられるね。' + BEYOND, F(c) + '÷' + m + ' は、' + UNIT_OF[em] + ' が ' + N2 + 'こ を ' + m + 'つに分けた1つ分 と考えよう。', N2 + '÷' + m + ' を計算して、' + UNIT_OF[em] + ' が何こ分かを 小数になおそう。'];
        }
        p = { type: 'fill', tag: 'oni', q: '□にあてはまる数を書きましょう。', parts: parts, hints: hints };
        eq = parts.map(function (y) { return typeof y === 'string' ? y : '□'; }).join('');
        p.explain = eq.replace('□', F(x)) + ' だから、□は ' + F(x) + ' だよ。';
        p.beyond = bk === 'boxM';
        p.src = { kind: bk };
      }
    }
    return p;
  }
  gens.oniMix = function (rng) { return oniMake('oniMix', oniMix1, rng); };

  // ---------- ④ ひらめき ----------
  function perms(arr) {
    if (arr.length <= 1) return [arr.slice()];
    var out = [];
    arr.forEach(function (x, i) {
      perms(arr.slice(0, i).concat(arr.slice(i + 1))).forEach(function (r) { out.push([x].concat(r)); });
    });
    return out;
  }
  // カードで作れる数（1000倍）。k は整数部分のけた数。いちばん右は0にしない、2けた以上ならいちばん左も0にしない
  function cardValues(cards, k) {
    var out = [];
    perms(cards).forEach(function (r) {
      if (r[r.length - 1] === 0) return;
      if (k >= 2 && r[0] === 0) return;
      out.push(parseInt(r.join(''), 10) * POW[3 - (r.length - k)]);
    });
    return out;
  }
  function cardIdea(rng) {
    var mode = wpick(rng, [[2, 'max'], [2, 'min'], [3, 'near']]), cards, k, vals, ans, T, n, t, lo, hi;
    for (t = 0; t < 500; t++) {
      n = ri(rng, 3, 5);
      var pool = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, n);
      if (rng() < 0.55) pool[ri(rng, 0, n - 1)] = 0;
      cards = pool;
      k = n === 3 ? ri(rng, 1, 2) : n === 4 ? ri(rng, 1, 3) : ri(rng, 2, 3);
      vals = cardValues(cards, k);
      var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      if (mode === 'max') { ans = mx; break; }
      if (mode === 'min') { ans = mn; break; }
      var tlo = Math.ceil(mn / 1000), thi = Math.floor(mx / 1000);
      if (tlo > thi) continue;
      T = ri(rng, tlo, thi) * 1000;
      var best = null, bd = Infinity, tie = false;
      lo = null; hi = null;
      vals.forEach(function (v) {
        var dd = Math.abs(v - T);
        if (dd < bd) { bd = dd; best = v; tie = false; } else if (dd === bd && v !== best) tie = true;
        if (v < T && (lo === null || v > lo)) lo = v;
        if (v > T && (hi === null || v < hi)) hi = v;
      });
      if (tie || best === mx || best === mn || lo === null || hi === null) continue;
      ans = best;
      break;
    }
    var form = '', i;
    for (i = 0; i < n; i++) form += (i === k ? '.' : '') + '□';
    var has0 = cards.indexOf(0) >= 0;
    var rule = has0 ? (k >= 2 ? '（いちばん左と いちばん右には、0のカードを おけません）' : '（いちばん右には、0のカードを おけません）') : '';
    var cardTxt = cards.map(function (x) { return '［' + x + '］'; }).join('') + '［．］';
    var what = mode === 'max' ? 'いちばん大きい数' : mode === 'min' ? 'いちばん小さい数' : F(T) + 'に いちばん近い数';
    var sorted = cards.slice().sort(function (x, y) { return y - x; });
    var hints, explain;
    if (mode === 'max') {
      hints = ['大きい数にするには、上の位ほど 大きい数字のカードを おこう。',
        'いちばん上の位には、いちばん大きい「' + sorted[0] + '」を おくといいね。',
        has0 ? 'いちばん右に0をおけないので、0を どこにおけば いちばん大きくなるか考えよう。' : 'のこりのカードも、大きい順に 左から おこう。'];
      explain = '上の位から 大きい数字を順におくと、いちばん大きい数は ' + F(ans) + ' だよ。';
    } else if (mode === 'min') {
      var first = String(F(ans)).replace('.', '')[0];
      hints = ['小さい数にするには、上の位ほど 小さい数字のカードを おこう。' + (has0 && k === 1 ? '一の位は 0 でもいいよ。' : ''),
        'いちばん上の位には「' + first + '」を おくといいね。',
        'のこりのカードを 小さい順に おこう。' + (has0 ? 'いちばん右に0をおけないことに 気をつけよう。' : '')];
      explain = '上の位から 小さい数字を順におくと、いちばん小さい数は ' + F(ans) + ' だよ。';
    } else {
      hints = [F(T) + ' より少し小さい数と、少し大きい数を それぞれ作って くらべよう。',
        '上の位から、' + F(T) + ' にできるだけ近くなるように カードを えらぼう。上の位が ' + F(T) + ' より小さいときは のこりを大きく、大きいときは のこりを小さくするよ。',
        '作った2つの数と ' + F(T) + ' のちがいを ひき算で もとめよう。ちがいが小さいほうが 答えだよ。'];
      explain = F(T) + ' より小さいほうで いちばん近いのは ' + F(lo) + '（ちがい ' + F(T - lo) + '）、大きいほうで いちばん近いのは ' + F(hi) + '（ちがい ' + F(hi - T) + '）。だから ' + F(ans) + ' だよ。';
    }
    return {
      type: 'fill', tag: 'oni',
      q: 'カード ' + cardTxt + ' を全部1回ずつ使って、「' + form + '」の形の小数を作ります。' + rule + what + 'を書きましょう。',
      parts: [what + 'は', { a: F(ans) }, 'です。'],
      hints: hints, explain: explain,
      src: { kind: 'card', mode: mode, cards: cards, k: k, target: mode === 'near' ? F(T) : null }
    };
  }

  function d2s(v) { return Math.floor(v / 100) + '.' + (v % 100 < 10 ? '0' : '') + (v % 100); } // 100倍 → 「1.05」
  function mushikui(rng) {
    var op, a, b, c, strs, hide, t, sol = 0;
    for (t = 0; t < 400; t++) {
      op = rng() < 0.6 ? '+' : '-';
      a = ri(rng, 101, 899); b = ri(rng, 101, 899);
      if (op === '-' && a < b) { var tt = a; a = b; b = tt; }
      c = op === '+' ? a + b : a - b;
      if (a % 10 === 0 || b % 10 === 0 || c % 10 === 0 || c >= 1000 || c < 11) continue;
      if (op === '+' ? carryCount(a, b) < 1 : borrowCount(a, b) < 1) continue;
      strs = [d2s(a), d2s(b), d2s(c)];
      var pos = [];
      [0, 1, 2].forEach(function (w) { for (var i = 0; i < 4; i++) if (i !== 1) pos.push([w, i]); });
      var kk = rng() < 0.7 ? 3 : 4;
      hide = shuffle(rng, pos).slice(0, kk);
      var who = {}; hide.forEach(function (h) { who[h[0]] = 1; });
      if (Object.keys(who).length < 2) continue;
      // 解の数（□に0〜9を入れて全部ためす）
      sol = 0;
      var total = Math.pow(10, kk);
      for (var z = 0; z < total; z++) {
        var ch = strs.map(function (s) { return s.split(''); }), zz = z;
        hide.forEach(function (h) { ch[h[0]][h[1]] = String(zz % 10); zz = Math.floor(zz / 10); });
        var v = ch.map(function (x) { return parseInt(x.join('').replace('.', ''), 10); });
        if ((op === '+' ? v[0] + v[1] : v[0] - v[1]) === v[2]) sol++;
        if (sol > 1) break;
      }
      if (sol === 1) break;
    }
    // 表示（□はスロット）
    var parts = [], buf = '';
    var seq = [[0, strs[0]], [-1, op === '+' ? '＋' : '−'], [1, strs[1]], [-1, '＝'], [2, strs[2]]];
    seq.forEach(function (sg) {
      if (sg[0] < 0) { buf += sg[1]; return; }
      sg[1].split('').forEach(function (chr, i) {
        var hidden = hide.some(function (h) { return h[0] === sg[0] && h[1] === i; });
        if (hidden) { if (buf) parts.push(buf); buf = ''; parts.push({ a: chr }); } else buf += chr;
      });
    });
    if (buf) parts.push(buf);
    var word = op === '+' ? 'くり上がり' : 'くり下がり';
    return {
      type: 'fill', tag: 'oni',
      q: '□にあてはまる数字を書きましょう。（□には 0〜9 の数字が1つずつ入ります）',
      parts: parts,
      hints: ['たての筆算の形に書いて、いちばん右の位（小数第二位）から順に考えよう。',
        '小数第二位の計算で、' + word + 'があるかどうかを たしかめよう。' + (op === '+' ? 'くり上がった1は、小数第一位に たすよ。' : 'くり下げたら、小数第一位は1へるよ。'),
        '□に入る数字がきまったら、全部うめた式で たしかめ算をしよう。' + (op === '+' ? 'ひき算で' : 'たし算で') + 'たしかめてもいいね。'],
      explain: strs[0] + (op === '+' ? '＋' : '−') + strs[1] + '＝' + strs[2] + ' だよ。',
      src: { kind: 'mushikui', op: op, nums: strs }
    };
  }

  function seqIdea(rng) {
    var rule = wpick(rng, [[3, 'add'], [2, 'sub'], [2, 'x10'], [2, 'x2'], [2, 'diff2']]), terms, blank, t, d, i;
    for (t = 0; t < 300; t++) {
      terms = [];
      if (rule === 'add' || rule === 'sub') {
        d = pick(rng, [15, 25, 35, 45, 50, 75, 125, 150, 175, 250, 350, 450]);
        var s0 = rule === 'add' ? oniNum(rng, 100, 5000, ri(rng, 1, 3)) : oniNum(rng, 5 * d + 500, 9000, ri(rng, 1, 3));
        for (i = 0; i < 5; i++) terms.push(rule === 'add' ? s0 + i * d : s0 - i * d);
        blank = ri(rng, 2, 4);
      } else if (rule === 'x10') {
        var s1 = rng() < 0.5 ? ri(rng, 1, 9) : ri(rng, 11, 99);
        if (s1 % 10 === 0) continue;
        for (i = 0; i < 5; i++) terms.push(s1 * POW[i]);
        if (rng() < 0.5) terms.reverse();
        blank = ri(rng, 1, 4);
      } else if (rule === 'x2') {
        var s2 = rng() < 0.3 ? pick(rng, [125, 25, 75, 375, 15, 35]) : ri(rng, 11, 400);
        if (s2 % 10 === 0 && rng() < 0.7) continue;
        for (i = 0; i < 5; i++) terms.push(s2 * POW[0] * Math.pow(2, i));
        blank = ri(rng, 2, 4);
      } else {
        var s3 = oniNum(rng, 1000, 5000, ri(rng, 1, 2)), d0 = pick(rng, [10, 20, 50, 100, 5, 25]), cc = pick(rng, [10, 20, 50, 100, 5]);
        terms.push(s3);
        for (i = 1; i < 5; i++) terms.push(terms[i - 1] + d0 + (i - 1) * cc);
        blank = 4;
      }
      if (terms.every(function (v) { return v > 0 && v < 1000000; })) break;
    }
    // 知っている となりどうし（□をふくまない）
    var pi = 0;
    while (pi === blank || pi + 1 === blank) pi++;
    var x0 = F(terms[pi]), x1 = F(terms[pi + 1]);
    var hints, explain;
    if (rule === 'add' || rule === 'sub') {
      hints = ['となりどうしの数の ちがいを 調べよう。', x0 + ' から ' + x1 + ' へは ' + F(d) + (rule === 'add' ? ' ふえて' : ' へって') + 'いるね。',
        '□のとなりの数に 同じだけ' + (rule === 'add' ? 'たして' : 'ひいて') + 'みよう。後ろの数から もどって考えてもいいね。'];
      explain = F(d) + 'ずつ' + (rule === 'add' ? 'ふえて' : 'へって') + 'いるので、□は ' + F(terms[blank]) + ' だよ。';
    } else if (rule === 'x10') {
      var up = terms[1] > terms[0];
      hints = ['数字のならびは同じで、小数点の位置が かわっているね。', x0 + ' を' + (terms[pi + 1] > terms[pi] ? '10倍' : '1/10に') + 'すると ' + x1 + ' だね。',
        up ? '10倍すると、どの数字も位が1つ上がるよ。' : '1/10にすると、どの数字も位が1つ下がるよ。'];
      explain = (up ? '10倍' : '1/10') + 'ずつに なっているので、□は ' + F(terms[blank]) + ' だよ。';
    } else if (rule === 'x2') {
      hints = ['となりの数が 何倍に なっているか 調べよう。' + BEYOND, x0 + ' の2倍が ' + x1 + ' だね。' + x0 + ' は ' + UNIT_OF[decOf(terms[pi])] + ' が ' + cnt(terms[pi]) + 'こ分だよ。',
        '□の前の数を 2倍しよう（後ろの数を 半分にしても いいね）。'];
      explain = '2倍ずつに なっているので、□は ' + F(terms[blank]) + ' だよ。';
    } else {
      hints = ['となりどうしの数の ちがいを 調べよう。ちがいにも きまりがあるよ。',
        'ちがいは ' + F(terms[1] - terms[0]) + '、' + F(terms[2] - terms[1]) + '、' + F(terms[3] - terms[2]) + ' と かわっているね。',
        'つぎの ちがいは いくつになるかな？ それを さいごの数に たそう。'];
      explain = 'ちがいが ' + F(terms[2] - terms[1] - (terms[1] - terms[0])) + 'ずつ ふえていくので、つぎのちがいは ' + F(terms[4] - terms[3]) + '。□は ' + F(terms[blank]) + ' だよ。';
    }
    var parts = [], buf = '';
    terms.forEach(function (v, k) {
      if (k > 0) buf += '、';
      if (k === blank) { if (buf) parts.push(buf); buf = ''; parts.push({ a: F(v) }); } else buf += F(v);
    });
    if (buf) parts.push(buf);
    var p = {
      type: 'fill', tag: 'oni', q: 'きまりを見つけて、□にあてはまる数を書きましょう。', parts: parts,
      hints: hints, explain: explain,
      src: { kind: 'seq', rule: rule, terms: terms.map(F), blank: blank }
    };
    if (rule === 'x2') p.beyond = true;
    return p;
  }

  function unitsIdea(rng) {
    var kind = wpick(rng, [[2, 'collect2'], [2, 'tobun'], [1, 'rev'], [2, 'countOf'], [2, 'sumCount']]), A, B, x, y, ans, q, hints, explain, slotTxt;
    if (kind === 'collect2' || kind === 'tobun') {
      A = ri(rng, 11, 999); B = ri(rng, 1, 99);
      if (A % 10 === 0) A++;
      ans = A * 10 + B * 100;
      q = kind === 'collect2'
        ? '0.01を' + A + 'こと、0.1を' + B + 'こ合わせた数はいくつですか。'
        : '1を100等分した1つ分を' + A + 'こと、1を10等分した1つ分を' + B + 'こ合わせた数はいくつですか。';
      hints = [kind === 'tobun' ? '1を100等分した1つ分は0.01、1を10等分した1つ分は0.1だよ。' : '0.01が10こで0.1、100こで1だよ。',
        '0.01を' + A + 'こ集めた数を、1が何こ、0.1が何こ、0.01が何こ…と分けて考えよう。',
        'どちらも 0.01が何こ分かに そろえて たすと 計算しやすいよ。'];
      explain = '0.01が ' + A + '＋' + (B * 10) + '＝' + (A + B * 10) + 'こ分だから、' + F(ans) + ' だよ。';
      slotTxt = ['', 'です。'];
    } else if (kind === 'rev') {
      for (var t = 0; t < 100; t++) { B = ri(rng, 11, 99); A = ri(rng, 11, 999); if (A % 10 !== 0 && B * 100 > A * 10 + 100) break; }
      ans = B * 100 - A * 10;
      q = '0.1を' + B + 'こ集めた数から、0.01を' + A + 'こ集めた数をひくといくつですか。';
      hints = ['0.1は 0.01の10こ分だよ。', '0.1を' + B + 'こ集めた数は、0.01が何こ分かな？', 'どちらも 0.01が何こ分かに そろえて ひき算しよう。'];
      explain = '0.01が ' + (B * 10) + '−' + A + '＝' + (B * 10 - A) + 'こ分だから、' + F(ans) + ' だよ。';
      slotTxt = ['', 'です。'];
    } else if (kind === 'countOf') {
      var e = rng() < 0.7 ? 2 : 3;
      x = oniNum(rng, 1100, 39990, ri(rng, 1, e));
      ans = x / POW[3 - e] * 1000;
      q = F(x) + 'は、' + UNIT_OF[e] + 'を何こ集めた数ですか。';
      hints = ['1は' + UNIT_OF[e] + 'の' + POW[e] + 'こ分、0.1は' + UNIT_OF[e] + 'の' + POW[e - 1] + 'こ分だよ。',
        F(x) + ' を、1が何こ、0.1が何こ…と 位ごとに分けてみよう。',
        'それぞれを ' + UNIT_OF[e] + 'が何こ分かに なおして 合わせよう。小数点がない位にも 気をつけよう。'];
      explain = F(x) + ' は ' + UNIT_OF[e] + 'が ' + F(ans) + 'こ分 だよ。';
      slotTxt = [UNIT_OF[e] + 'を', 'こ集めた数です。'];
    } else {
      x = oniNum(rng, 1100, 9900, 1); y = oniNum(rng, 10, 990, 2);
      ans = (x + y) / 10 * 1000;
      q = F(x) + 'と' + F(y) + 'をたした数は、0.01を何こ集めた数ですか。';
      hints = ['まず ' + F(x) + '＋' + F(y) + ' を、小数点の位置をそろえて計算しよう。', '1は0.01の100こ分、0.1は0.01の10こ分だよ。', '答えの数を 位ごとに分けて、0.01が何こ分かに なおそう。'];
      explain = F(x) + '＋' + F(y) + '＝' + F(x + y) + '。これは 0.01が ' + F(ans) + 'こ分 だよ。';
      slotTxt = ['0.01を', 'こ集めた数です。'];
    }
    return {
      type: 'fill', tag: 'oni', q: q, parts: [slotTxt[0], { a: F(ans) }, slotTxt[1]].filter(function (s) { return s !== ''; }),
      hints: hints, explain: explain, src: { kind: 'units', sub: kind }
    };
  }

  // 「どれがいちばん大きい（小さい）？」 いろいろな表し方
  function reprOf(rng, v) {
    var list = [['plain', F(v)]];
    if (v % 100 === 0) list.push(['c01', '0.1を' + (v / 100) + 'こ集めた数']);
    if (v % 10 === 0) list.push(['c001', '0.01を' + (v / 10) + 'こ集めた数']);
    list.push(['c0001', '0.001を' + v + 'こ集めた数']);
    if (v % 10 === 0) list.push(['x10', F(v / 10) + 'を10倍した数']);
    list.push(['d10', F(v * 10) + 'の1/10']);
    if (v % 10 === 0 && v % 1000 !== 0 && v >= 1000) list.push(['comp', '1を' + Math.floor(v / 1000) + 'こと0.01を' + ((v % 1000) / 10) + 'こ合わせた数']);
    return list;
  }
  function choiceIdea(rng) {
    var big = rng() < 0.6, vals, reps, t;
    for (t = 0; t < 300; t++) {
      var I = ri(rng, 1, 9);
      vals = [];
      while (vals.length < 4) {
        var v = I * 1000 + oniNum(rng, 10, 990, ri(rng, 1, 3));
        if (vals.indexOf(v) < 0) vals.push(v);
      }
      var kinds = {}, plain = 0;
      reps = vals.map(function (v) {
        var r = pick(rng, reprOf(rng, v));
        kinds[r[0]] = 1; if (r[0] === 'plain') plain++;
        return r[1];
      });
      if (Object.keys(kinds).length >= 3 && plain <= 1) break;
    }
    var ai = 0;
    vals.forEach(function (v, i) { if (big ? v > vals[ai] : v < vals[ai]) ai = i; });
    var other = vals.map(function (v, i) { return i; }).filter(function (i) { return i !== ai && reps[i] !== F(vals[i]); })[0];
    if (other === undefined) other = ai === 0 ? 1 : 0;
    var order = shuffle(rng, [0, 1, 2, 3]);
    return {
      type: 'choice', tag: 'oni',
      q: 'つぎの中で、いちばん' + (big ? '大きい' : '小さい') + '数はどれですか。',
      options: order.map(function (i) { return reps[i]; }),
      a: reps[ai],
      hints: ['それぞれを、ふつうの小数に なおしてから くらべよう。',
        '「' + reps[other] + '」は ' + F(vals[other]) + ' だね。ほかも 同じように なおそう。',
        '小数点の位置をそろえて、上の位から順に くらべよう。'],
      explain: order.map(function (i) { return reps[i] + '＝' + F(vals[i]); }).join('、') + '。いちばん' + (big ? '大きい' : '小さい') + 'のは「' + reps[ai] + '」だよ。',
      src: { kind: 'choice', vals: vals.map(F), ansVal: F(vals[ai]) }
    };
  }

  function oniIdea1(rng) {
    var kind = wpick(rng, [[3, 'card'], [2, 'mushikui'], [2, 'seq'], [2, 'units'], [2, 'choice']]);
    if (kind === 'card') return cardIdea(rng);
    if (kind === 'mushikui') return mushikui(rng);
    if (kind === 'seq') return seqIdea(rng);
    if (kind === 'units') return unitsIdea(rng);
    return choiceIdea(rng);
  }
  gens.oniIdea = function (rng) { return oniMake('oniIdea', oniIdea1, rng); };

  var NAMES = ['masuRead', 'unitConvert', 'compose', 'decompose', 'countUnits',
    'compare', 'order', 'times10', 'numberlineRead', 'hissanAdd', 'hissanSub', 'laws',
    'threeSum', 'wordAdd', 'wordSub'];
  var LEVELS = ['easy', 'normal', 'hard'];

  // make(name, rng?, {level, skill}?)  level 省略・'normal' は今までと同じ問題。skill は上の技能id
  function make(name, rng, opts) {
    if (!gens[name]) throw new Error('unknown generator: ' + name);
    var r = typeof rng === 'function' ? rng : Math.random;
    if (ONI_SKILL[name]) return gens[name](r); // 鬼ムズ（level・skill は見ない）
    var lv = opts && (opts.level === 'easy' || opts.level === 'hard') ? opts.level : null;
    if (opts && opts.skill) return makeSkill(name, r, lv || 'normal', opts.skill);
    var p = lv && LV[lv][name] ? LV[lv][name](r) : gens[name](r, lv || undefined);
    if (p.fig === undefined) delete p.fig;
    return p;
  }

  var G = {
    make: make,
    names: function () { return NAMES.slice(); },
    LEVELS: LEVELS,
    hissanHints: hissanHints,
    skillOf: skillOf,
    skillGens: function (skill) { return SKILL_GENS[skill] ? SKILL_GENS[skill].slice() : []; },
    skillIds: function () { return Object.keys(SKILL_GENS); },
    oniNames: function () { return ONI_NAMES.slice(); },  // 鬼ムズの生成器（names() には入れない）
    ONI_SKILL: ONI_SKILL,
    util: { fmt: fmt, parse: parse, decimals: decimals, unitAnswer: unitAnswer, carryCount: carryCount, borrowCount: borrowCount, hasKui: hasKui }
  };
  S.Generators = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
