/* matome.js — まとめモードの問題選びと時間（担当I）
 * Shosu.Matome.build({level, minutes, weak?, rng?}) -> { problems, seconds, total }
 * Shosu.Matome.estimate(problem, level) -> 秒
 * 7つの内容（TAGS）を順番にかわるがわる出す。×が多かった内容（weak）は少し多めに出す。
 * 問題そのもの（src つき）を返すので、つづきから用にはそのまま保存すればよい。
 */
(function (S) {
  'use strict';

  var LEVELS = [{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }];
  var TIMES = [5, 10, 15, 20];
  var TAGS = ['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan', 'kimari'];
  var TAG_LABELS = {
    hyoshikata: '表し方・単位', shikumi: 'しくみ・数の構成', daisho: '大小', jubai: '10倍・1/10',
    tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり'
  };

  // 内容ごとの生成器と重み（レベル別）
  var POOLS = {
    easy: {
      hyoshikata: [['masuRead', 1], ['unitConvert', 1], ['numberlineRead', 1]],
      shikumi: [['compose', 1], ['decompose', 1], ['countUnits', 1]],
      daisho: [['compare', 1]],                         // かんたんは2つの数の大小だけ
      jubai: [['times10', 1]],
      tashizan: [['hissanAdd', 1]],
      hikizan: [['hissanSub', 1]],
      kimari: [['laws', 1]]
    },
    normal: {
      hyoshikata: [['masuRead', 1], ['unitConvert', 1], ['numberlineRead', 1]],
      shikumi: [['compose', 1], ['decompose', 1], ['countUnits', 1]],
      daisho: [['compare', 1], ['order', 1]],
      jubai: [['times10', 1]],
      tashizan: [['hissanAdd', 1]],
      hikizan: [['hissanSub', 1]],
      kimari: [['laws', 1]]
    },
    hard: {
      hyoshikata: [['masuRead', 1], ['unitConvert', 1], ['numberlineRead', 1]],
      shikumi: [['compose', 1], ['decompose', 1], ['countUnits', 1]],
      daisho: [['compare', 1], ['order', 1]],
      jubai: [['times10', 1]],
      tashizan: [['hissanAdd', 2], ['wordAdd', 2], ['threeSum', 1]],
      hikizan: [['hissanSub', 2], ['wordSub', 2]],
      kimari: [['laws', 1]]
    }
  };

  // 1問の目安（秒）。5分で6〜8問、20分で25〜30問になるように合わせてある
  var BASE = { fill: 40, choice: 35, order: 45, hissan: 60 };
  var WORD = 70, THREE = 55, EXTRA_SLOT = 10;
  var FACTOR = { easy: 0.9, normal: 0.95, hard: 0.97 };

  function G() {
    if (S.Generators) return S.Generators;
    if (typeof require === 'function') return require('./generators.js');
    throw new Error('Shosu.Generators がありません');
  }

  function estimate(p, level) {
    var gen = p && p.src && p.src.gen;
    var s;
    if (gen === 'wordAdd' || gen === 'wordSub') s = WORD;
    else if (gen === 'threeSum') s = THREE;
    else s = BASE[p.type] || 40;
    if (p.type === 'fill' && Array.isArray(p.parts)) {
      var n = p.parts.filter(function (x) { return x && typeof x === 'object'; }).length;
      if (n > 1) s += EXTRA_SLOT * Math.min(n - 1, 3);
    }
    return Math.round(s * (FACTOR[level] || 1));
  }

  // 同じ問題かどうか（数・文が同じなら同じ）
  function signature(p) {
    return JSON.stringify([p.type, p.q || '', p.parts || null, p.items ? p.items.slice().sort() : null, p.op || '', p.a || '', p.b || '', p.fig || null]);
  }

  function wpick(rng, list) {
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += list[i][1];
    var r = rng() * sum;
    for (i = 0; i < list.length; i++) { r -= list[i][1]; if (r < 0) return list[i][0]; }
    return list[list.length - 1][0];
  }

  function build(opts) {
    opts = opts || {};
    var level = opts.level === 'easy' || opts.level === 'hard' ? opts.level : 'normal';
    var minutes = Number(opts.minutes) > 0 ? Number(opts.minutes) : 10;
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var weak = opts.weak || {};
    var pool = POOLS[level];
    var target = minutes * 60;
    var Gen = G();

    // 内容の重み：×の割合 0〜1 で 1〜1.5 倍
    var w = {}, credit = {}, sumW = 0;
    TAGS.forEach(function (t) {
      var x = Number(weak[t]);
      x = isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
      w[t] = 1 + 0.5 * x;
      credit[t] = rng() * 0.5; // はじめの順番をばらす
      sumW += w[t];
    });
    // にがてな内容は先に出しはじめる（短い時間でも1回多く出るように）
    TAGS.forEach(function (t) { credit[t] += (w[t] - 1) * sumW / 4; });

    var genUse = {};   // 内容ごとに、生成器を使った回数
    var lastGen = {};  // 内容ごとに、前に使った生成器
    var seen = {};
    var problems = [], seconds = [], total = 0, prevTag = null;

    for (var guard = 0; guard < 200; guard++) {
      // 次の内容：ためた点がいちばん多いもの（前と同じ内容はのぞく）
      TAGS.forEach(function (t) { credit[t] += w[t] + (rng() - 0.5) * 0.4; });
      var best = null;
      TAGS.forEach(function (t) {
        if (t === prevTag) return;
        if (best === null || credit[t] > credit[best]) best = t;
      });
      credit[best] -= sumW;

      var p = makeFor(best);
      if (!p) continue;
      var sec = estimate(p, level);
      // 目安の時間をこえすぎないところで止める（最低3問）
      if (problems.length >= 3 && total + sec / 2 > target) break;
      seen[signature(p)] = true;
      p.id = 'M-' + (problems.length + 1);
      problems.push(p);
      seconds.push(sec);
      total += sec;
      prevTag = best;
    }
    return { problems: problems, seconds: seconds, total: total };

    function makeFor(tag) {
      var list = pool[tag];
      var use = genUse[tag] || (genUse[tag] = {});
      // 使った回数が少ない生成器を優先し、前と同じ生成器はなるべくさける
      var cand = list.map(function (g) {
        var n = use[g[0]] || 0;
        var k = g[1] / (1 + n);
        if (list.length > 1 && lastGen[tag] === g[0]) k *= 0.25;
        return [g[0], k];
      });
      for (var t = 0; t < 40; t++) {
        var name = wpick(rng, cand);
        var p = Gen.make(name, rng, { level: level });
        if (seen[signature(p)]) continue;
        use[name] = (use[name] || 0) + 1;
        lastGen[tag] = name;
        if (!p.tag) p.tag = tag;
        return p;
      }
      return null;
    }
  }

  var M = {
    LEVELS: LEVELS,
    TIMES: TIMES,
    TAGS: TAGS,
    TAG_LABELS: TAG_LABELS,
    POOLS: POOLS,
    build: build,
    estimate: estimate,
    signature: signature
  };
  S.Matome = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
