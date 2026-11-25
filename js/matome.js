/* matome.js — まとめモードの問題選びと時間（担当I）
 * Shosu.Matome.build({level, minutes, weak?, rng?}) -> { problems, seconds, total }
 * Shosu.Matome.estimate(problem, level) -> 秒
 * 7つの内容（TAGS）を順番にかわるがわる出す。×が多かった内容（weak）は少し多めに出す。
 * 問題そのもの（src つき）を返すので、つづきから用にはそのまま保存すればよい。
 * 追加8（担当U）：level 'oni'（鬼ムズ）は 7つの内容のかわりに、鬼ムズの4種類（ONI_GENS）を順番に出す。weak は見ない。
 *   level が 'normal'・'hard'・'oni' のとき、fill で答えのスロットに小数点があるものに pointMode:'tap' を付ける
 *   （小数点を自分で打つ。'easy' は今までどおり小数点を印刷）。
 */
(function (S) {
  'use strict';

  var LEVELS = [{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }, { id: 'oni', label: '鬼ムズ' }];
  var TIMES = [5, 10, 15, 20];
  var TAGS = ['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan', 'kimari'];
  var TAG_LABELS = {
    hyoshikata: '表し方・単位', shikumi: 'しくみ・数の構成', daisho: '大小', jubai: '10倍・1/10',
    tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり', oni: '鬼ムズ'
  };
  // 鬼ムズ：この順番にかわるがわる出す（skill は 'oni-add','oni-muldiv','oni-mix','oni-idea'）
  var ONI_GENS = ['oniAdd', 'oniMulDiv', 'oniMix', 'oniIdea'];
  // 鬼ムズの1問の目安（秒）
  var ONI_SEC = { oniAdd: 70, oniMulDiv: 70, oniMix: 80, oniIdea: 90 };
  var ONI_WORD = 90, ONI_CHOICE = 70;
  var TAP_LEVELS = { normal: 1, hard: 1, oni: 1 };

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
    if (ONI_SEC[gen]) {
      if (gen === 'oniIdea' && p.type === 'choice') return ONI_CHOICE;
      if (/^word/.test(p.src.kind || '')) return ONI_WORD;
      return ONI_SEC[gen];
    }
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

  // 答えのスロットに小数点がある fill に、小数点を自分で打つしるしを付ける
  function markTap(p, level) {
    if (!TAP_LEVELS[level] || p.type !== 'fill' || !Array.isArray(p.parts)) return p;
    var dot = p.parts.some(function (x) { return x && typeof x === 'object' && String(x.a).indexOf('.') >= 0; });
    if (dot) p.pointMode = 'tap';
    return p;
  }

  // 鬼ムズ：4種類を順番に。時間に合う数（最低3問）
  function buildOni(minutes, rng) {
    var Gen = G(), target = minutes * 60, seen = {}, lastKind = {};
    var problems = [], seconds = [], total = 0;
    for (var i = 0; i < 200; i++) {
      var name = ONI_GENS[i % ONI_GENS.length], p = null;
      for (var t = 0; t < 40; t++) {
        var c = Gen.make(name, rng);
        if (seen[signature(c)]) continue;
        p = c;
        if (c.src.kind !== lastKind[name] || t >= 6) break; // 同じ種類の問題はなるべく続けない
      }
      if (!p) continue;
      var sec = estimate(p, 'oni');
      if (problems.length >= 3 && total + sec / 2 > target) break;
      seen[signature(p)] = true;
      lastKind[name] = p.src.kind;
      p.id = 'M-' + (problems.length + 1);
      problems.push(markTap(p, 'oni'));
      seconds.push(sec);
      total += sec;
    }
    return { problems: problems, seconds: seconds, total: total };
  }

  /* 鬼ムズの「だん」（追加9）：鬼1＝計算（けた数を多く）、鬼2＝文章題・くふう、鬼3＝ひらめき中心。
     さいごに「ボス問題」を1問（p.boss = true）。stage がないときは今までと同じ。 */
  var ONI_STAGES = {
    1: { gens: ['oniAdd', 'oniMulDiv', 'oniAdd', 'oniMulDiv', 'oniMix'], ok: function (p) { return !/^word/.test(p.src.kind || ''); },
         boss: 'oniAdd', bossOk: function (p) { return p.src.kind === 'mix4' || p.src.kind === 'add4'; } },
    2: { gens: ['oniAdd', 'oniMix', 'oniMulDiv', 'oniMix'], ok: function (p) { return p.src.gen === 'oniMix' || /^word/.test(p.src.kind || ''); },
         boss: 'oniAdd', bossOk: function (p) { return p.src.kind === 'word' && (p.src.ops || []).length >= 3; } },
    3: { gens: ['oniIdea', 'oniMix', 'oniIdea', 'oniMulDiv', 'oniIdea'], ok: function () { return true; },
         boss: 'oniIdea', bossOk: function (p) { return p.src.kind === 'card' || p.src.kind === 'mushikui'; } }
  };
  var BOSS_EXTRA = 30; // ボス問題は目安を少し長く
  function buildOniStage(minutes, rng, stage) {
    var cf = ONI_STAGES[stage], Gen = G(), seen = {}, lastKind = {};
    var problems = [], seconds = [], total = 0, t, c, p;
    // 先にボス問題を作って、その時間をとっておく
    var boss = null;
    for (t = 0; t < 300; t++) { c = Gen.make(cf.boss, rng); boss = c; if (cf.bossOk(c)) break; }
    var bossSec = estimate(boss, 'oni') + BOSS_EXTRA;
    seen[signature(boss)] = true;
    var target = minutes * 60 - bossSec;
    for (var i = 0; i < 200; i++) {
      var name = cf.gens[i % cf.gens.length];
      p = null;
      for (t = 0; t < 60; t++) {
        c = Gen.make(name, rng);
        if (seen[signature(c)]) continue;
        if (!cf.ok(c) && t < 50) continue;
        p = c;
        if (c.src.kind !== lastKind[name] || t >= 6) break;
      }
      if (!p) continue;
      var sec = estimate(p, 'oni');
      if (problems.length >= 2 && total + sec / 2 > target) break;
      seen[signature(p)] = true;
      lastKind[name] = p.src.kind;
      p.id = 'M-' + (problems.length + 1);
      problems.push(markTap(p, 'oni'));
      seconds.push(sec);
      total += sec;
    }
    boss.boss = true;
    boss.id = 'M-BOSS';
    problems.push(markTap(boss, 'oni'));
    seconds.push(bossSec);
    total += bossSec;
    return { problems: problems, seconds: seconds, total: total };
  }

  function build(opts) {
    opts = opts || {};
    if (opts.level === 'oni' && ONI_STAGES[opts.stage]) return buildOniStage(Number(opts.minutes) > 0 ? Number(opts.minutes) : 10, typeof opts.rng === 'function' ? opts.rng : Math.random, opts.stage);
    if (opts.level === 'oni') return buildOni(Number(opts.minutes) > 0 ? Number(opts.minutes) : 10, typeof opts.rng === 'function' ? opts.rng : Math.random);
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
      problems.push(markTap(p, level));
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
    ONI_GENS: ONI_GENS,
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
