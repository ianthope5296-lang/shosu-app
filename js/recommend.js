/* recommend.js — おすすめモードの分析と組み立て（担当O。PLAN「追加機能5」・CONTRACTS「追加5」）
 * Shosu.Recommend.SKILLS                 細かい技能（PLAN C）
 * Shosu.Recommend.skillOf(problem)       問題 → 技能id（教科書の問題・生成した問題どちらも）
 * Shosu.Recommend.profile()              記録（Store の全キー）から、技能ごとのできぐあい・はやさ・ヒント
 * Shosu.Recommend.build({minutes, weak, challenge, rng})   今日のおすすめの問題（PLAN D）
 * Shosu.Recommend.advice({problems, results, prev})       終わったときのアドバイス（PLAN F）
 * Shosu.Recommend.shouldSuggestMiru(skillId, mistakes)    同じ技能で2回まちがえたら「みる」へ（PLAN E）
 * Shosu.Recommend.saveResult(result) / lastResult()       localStorage 'shosu.recommend'
 * classic script。Node でも require できる（Store が無ければ記録なしとして動く）。
 */
(function (S) {
  'use strict';

  /* ---------- ほかのファイル ---------- */
  function need(name, file) {
    if (S[name]) return S[name];
    if (typeof require === 'function') { try { return require(file); } catch (e) { /* なし */ } }
    return null;
  }
  function Gen() { return need('Generators', './generators.js'); }
  function Mat() { return need('Matome', './matome.js'); }
  function lessons() {
    if (S.Lessons) return S.Lessons;
    var m = need('__lessons', './lessons.js');
    return (m && m.Lessons) || S.Lessons || [];
  }
  function topics() {
    if (!S.ReviewTopics) lessons();
    return S.ReviewTopics || [];
  }

  /* ---------- 細かい技能（PLAN C） ----------
   * lesson は「その技能を習う時」（出す範囲 frontier の判定に使う）。page は lessons.js の page（読み込み後に合わせる）。
   * up は「ちょうせん」で、その技能のむずかしいレベルが作れないときに代わりに出す、1つむずかしい技能。 */
  function sk(id, tag, label, short, lesson, page, gens, up) {
    return {
      id: id, tag: tag, label: label, short: short, lesson: lesson, page: page,
      gens: gens.map(function (n) { return { name: n, opts: { skill: id } }; }),
      review: tag === 'kimari' ? 'tashizan' : tag, up: up || null, lessons: [lesson]
    };
  }
  var SKILLS = [
    sk('rep-001', 'hyoshikata', '表し方（0.01の何こ分）', '0.01の何こ分', 1, 'p.33〜35', ['masuRead'], 'rep-0001'),
    sk('unit-m', 'hyoshikata', '単位のかんさん（m・cm）', '単位のかんさん（m・cm）', 2, 'p.36', ['unitConvert'], 'unit-k'),
    sk('numberline', 'hyoshikata', '数直線の読み', '数直線の読み', 2, 'p.36', ['numberlineRead']),
    sk('kui', 'hyoshikata', '0のある位（空位）', '0のある位', 2, 'p.36', ['masuRead', 'compose', 'decompose']),
    sk('rep-0001', 'hyoshikata', '表し方（0.001の何こ分）', '0.001の何こ分', 3, 'p.37〜38', ['masuRead'], 'kui'),
    sk('unit-k', 'hyoshikata', '単位のかんさん（km・kg・mm など）', '単位のかんさん（km・kg など）', 3, 'p.37〜38', ['unitConvert']),
    sk('place-name', 'shikumi', '位の名前', '位の名前', 4, 'p.39〜40', ['decompose']),
    sk('compose', 'shikumi', '数の構成', '数の構成', 4, 'p.39〜40', ['compose', 'decompose'], 'kui'),
    sk('count-units', 'shikumi', '0.01（0.001）を何こ集めた数', '何こ集めた数', 4, 'p.39〜40', ['countUnits']),
    sk('cmp-two', 'daisho', '大小（2つの数）', '大小（2つの数）', 5, 'p.41', ['compare'], 'cmp-digits'),
    sk('cmp-digits', 'daisho', '大小（けた数がちがう数）', '大小（けた数がちがう）', 5, 'p.41', ['compare']),
    sk('order', 'daisho', 'ならべかえ（3つ以上）', 'ならべかえ', 5, 'p.41', ['order']),
    sk('times10', 'jubai', '10倍', '10倍', 6, 'p.42', ['times10'], 'times100'),
    sk('times100', 'jubai', '100倍・1000倍', '100倍・1000倍', 6, 'p.42', ['times10']),
    sk('div10', 'jubai', '1/10', '1/10', 6, 'p.42', ['times10']),
    sk('add-nocarry', 'tashizan', 'たし算（くり上がりなし）', 'たし算', 7, 'p.43〜44', ['hissanAdd'], 'add-carry'),
    sk('add-carry', 'tashizan', 'たし算（くり上がりあり）', 'たし算（くり上がり）', 7, 'p.43〜44', ['hissanAdd']),
    sk('add-mis', 'tashizan', 'たし算（けたがそろっていない）', 'たし算（けたがちがう）', 7, 'p.43〜44', ['hissanAdd']),
    sk('add-trail0', 'tashizan', 'たし算（答えの終わりが0）', 'たし算（答えの0）', 7, 'p.43〜44', ['hissanAdd']),
    sk('sub-noborrow', 'hikizan', 'ひき算（くり下がりなし）', 'ひき算', 8, 'p.45〜46', ['hissanSub'], 'sub-borrow'),
    sk('sub-borrow', 'hikizan', 'ひき算（くり下がりあり）', 'ひき算（くり下がり）', 8, 'p.45〜46', ['hissanSub']),
    sk('sub-multi', 'hikizan', 'ひき算（何回もくり下がる）', 'ひき算（何回もくり下がる）', 8, 'p.45〜46', ['hissanSub']),
    sk('sub-int', 'hikizan', 'ひき算（整数−小数）', 'ひき算（整数−小数）', 8, 'p.45〜46', ['hissanSub']),
    sk('laws', 'kimari', '計算のきまり', '計算のきまり', 9, 'p.47', ['laws'])
  ];
  var BY_ID = {};
  SKILLS.forEach(function (s) { BY_ID[s.id] = s; });
  var TAG_LABELS = {
    hyoshikata: '表し方・単位', shikumi: 'しくみ', daisho: '大小', jubai: '10倍・1/10',
    tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり'
  };
  var DEMO_LABEL = {
    masu: 'ますの図', zoomline: '数直線', units: '単位', blocks: '位のブロック', compare: '大小くらべ',
    shift: '位のうつり方', hissan: '筆算ステップ', laws: '計算のきまり', furikaeri: 'ふりかえり'
  };

  // lessons.js の page・関係する時・ふくしゅうの id に合わせる（1回だけ）
  var synced = false;
  function sync() {
    if (synced) return;
    var ls = lessons();
    if (!ls || !ls.length) return;
    synced = true;
    var G = Gen();
    SKILLS.forEach(function (s) { s.lessons = []; });
    ls.forEach(function (l) {
      SKILLS.forEach(function (s) { if (s.lesson === l.no && l.page) s.page = l.page; });
      (l.problems || []).forEach(function (p) {
        var id = G && p ? G.skillOf(p) : null;
        if (id && BY_ID[id] && BY_ID[id].lessons.indexOf(l.no) < 0) BY_ID[id].lessons.push(l.no);
      });
    });
    SKILLS.forEach(function (s) {
      if (s.lessons.indexOf(s.lesson) < 0) s.lessons.unshift(s.lesson);
      s.lessons.sort(function (a, b) { return a - b; });
      var t = topics();
      var hit = t.filter(function (x) { return x.id === s.tag; })[0] ||
        t.filter(function (x) { return (x.gens || []).some(function (g) { return s.gens.some(function (sg) { return sg.name === g; }); }); })[0];
      if (hit) s.review = hit.id;
    });
  }
  function lessonByNo(no) { return lessons().filter(function (l) { return l.no === no; })[0] || null; }
  var lpIndex = null;
  function lessonProblem(pid) {
    if (!lpIndex || !lpIndex.__n) {
      lpIndex = { __n: 0 };
      lessons().forEach(function (l) { (l.problems || []).forEach(function (p) { if (p && p.id) { lpIndex[p.id] = { p: p, no: l.no }; lpIndex.__n++; } }); });
    }
    var x = lpIndex[pid];
    return x && typeof x === 'object' ? x : null;
  }

  function skillOf(p) {
    var G = Gen();
    if (!p) return null;
    if (p.skill && BY_ID[p.skill]) return p.skill;
    var id = G ? G.skillOf(p) : null;
    if (id && BY_ID[id]) return id;
    // 分からないときは、tag のいちばん基本の技能
    var first = SKILLS.filter(function (s) { return s.tag === p.tag; })[0];
    return first ? first.id : null;
  }

  /* ---------- 乱数・小道具 ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function wpick(rng, list) { // [[item, weight], ...]
    var sum = 0, i;
    for (i = 0; i < list.length; i++) sum += Math.max(0, list[i][1]);
    if (!(sum > 0)) return list.length ? list[Math.floor(rng() * list.length)][0] : null;
    var r = rng() * sum;
    for (i = 0; i < list.length; i++) { r -= Math.max(0, list[i][1]); if (r < 0) return list[i][0]; }
    return list[list.length - 1][0];
  }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  var DAY = 86400000;
  var MAX_MS = 30 * 60 * 1000; // 30分をこえるもの（放置）は使わない
  var BASE = { fill: 40, choice: 35, order: 45, hissan: 60 };

  /* ---------- 保存 ---------- */
  var mem = {};
  function ls() { try { return typeof localStorage !== 'undefined' ? localStorage : (typeof window !== 'undefined' ? window.localStorage : null); } catch (e) { return null; } }
  function getJSON(k, def) {
    var v = null, L = ls();
    try { v = L ? L.getItem(k) : (k in mem ? mem[k] : null); } catch (e) { v = null; }
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  }
  function trySet(k, obj) {
    var s;
    try { s = JSON.stringify(obj); } catch (e) { return false; }
    var L = ls();
    if (!L) { mem[k] = s; return true; }
    try { L.setItem(k, s); return true; } catch (e) { return false; }
  }

  /* ---------- 記録を読む ---------- */
  function recKeys() {
    var ks = null;
    try { ks = S.Store && S.Store.keys ? S.Store.keys() : null; } catch (e) { ks = null; }
    if (!Array.isArray(ks)) ks = getJSON('shosu.keys', []);
    return Array.isArray(ks) ? ks : [];
  }
  function recEntries(key) {
    var e = null;
    try { e = S.Store && S.Store.entries ? S.Store.entries(key) : null; } catch (x) { e = null; }
    if (isObj(e)) return e;
    var d = getJSON('shosu.rec.' + key, null);
    return d && isObj(d.entries) ? d.entries : {};
  }

  // 技能ごとの目安（その技能の問題の目安秒と、問題の形）。1回だけ作って覚えておく
  var estCache = {};
  function skillSample(id) {
    if (estCache[id]) return estCache[id];
    var s = BY_ID[id], G = Gen(), M = Mat(), out = { sec: 45, type: 'fill' };
    if (s && G && M) {
      try {
        var r = mulberry32(777), sum = 0, n = 0, types = {};
        for (var i = 0; i < 6; i++) {
          var g = s.gens[i % s.gens.length];
          var p = G.make(g.name, r, g.opts);
          sum += M.estimate(p, 'normal'); n++;
          types[p.type] = (types[p.type] || 0) + 1;
        }
        out.sec = Math.round(sum / n);
        out.type = Object.keys(types).sort(function (a, b) { return types[b] - types[a]; })[0];
      } catch (e) { /* 目安のまま */ }
    }
    estCache[id] = out;
    return out;
  }

  // 1問ずつの記録にする
  function readRecords() {
    sync();
    var out = { recs: [], frontier: 1, miru: {}, lessonTried: {} };
    var M = Mat();
    var keys = recKeys().slice();
    if (keys.indexOf('miru') < 0) keys.push('miru'); // Store は「みる」の記録を keys に入れない
    keys.forEach(function (key) {
      var ents = recEntries(key), m, pid;
      if (key === 'miru') {
        for (pid in ents) {
          if ((m = /^lesson-(\d+)$/.exec(pid))) { out.miru[+m[1]] = 1; out.frontier = Math.max(out.frontier, +m[1]); }
        }
        return;
      }
      var lessonNo = (m = /^lesson-(\d+)$/.exec(key)) ? +m[1] : 0;
      var reviewTag = (m = /^review-(.+)$/.exec(key)) ? m[1] : null;
      var any = false;
      for (pid in ents) {
        var e = ents[pid];
        if (!isObj(e)) continue;
        any = true;
        var t = Number(e.t) || Date.parse(e.at) || 0;
        var lp = lessonNo ? lessonProblem(pid) : null;
        var ok = typeof e.first === 'boolean' ? e.first : !!e.correct;
        var skill = typeof e.skill === 'string' && BY_ID[e.skill] ? e.skill : (lp ? skillOf(lp.p) : null);
        var tag = lp ? lp.p.tag : (typeof e.tag === 'string' && e.tag ? e.tag : reviewTag);
        var type = typeof e.type === 'string' && BASE[e.type] ? e.type : lp ? lp.p.type : skill ? skillSample(skill).type : null;
        var est = Number(e.est) > 0 ? Number(e.est) : lp && M ? M.estimate(lp.p, 'normal') : skill ? skillSample(skill).sec : (type ? BASE[type] : 45);
        var ms = Number(e.ms);
        if (!(ms > 0 && ms <= MAX_MS)) ms = null;
        // 「もっとれんしゅう」（lesson-N の more-…）は、その時の more の生成器の技能にしぼる
        var limit = null, gens = null;
        if (lessonNo && !lp) { limit = lessonNo; var L = lessonByNo(lessonNo); gens = L && L.more ? L.more : null; }
        out.recs.push({
          key: key, pid: pid, t: t, ok: ok, correct: !!e.correct, first: typeof e.first === 'boolean' ? e.first : null,
          hints: Number(e.hints) || 0, ms: ms, est: est, type: type, skill: skill, tag: tag,
          lesson: lp ? lp.no : 0, lp: lp, limit: limit, gens: gens
        });
      }
      if (any && lessonNo) { out.lessonTried[lessonNo] = 1; out.frontier = Math.max(out.frontier, lessonNo); }
    });
    out.frontier = clamp(out.frontier, 1, 10);
    return out;
  }

  // 技能の分からない記録（tag だけ）は、その tag の技能に等分して足す
  function spreadTargets(r) {
    var c = SKILLS.filter(function (s) {
      if (s.tag !== r.tag) return false;
      if (r.limit && s.lesson > r.limit) return false;
      if (r.gens && !s.gens.some(function (g) { return r.gens.indexOf(g.name) >= 0; })) return false;
      return true;
    });
    if (!c.length && r.tag) c = SKILLS.filter(function (s) { return s.tag === r.tag; });
    return c;
  }

  /* ---------- profile ----------
   * 1問の重み = 0.5^(日数/7)（半減期7日：先週の記録は今日の半分の重さ）。技能ごとに新しい20問まで。
   * acc      … 重みつき正答率（最初の答えで○か。first が無い古い記録は correct）
   * speed    … かかった時間 ÷ その問題の目安（matome.estimate）。ms の無い記録・30分超は使わない。1つの記録は 0.2〜4 にまるめる
   * hintRate … ヒントを1つ以上使った問題のわりあい
   * n        … 記録の数（tag だけの記録は、その tag の技能の数でわった分だけ数える）
   * status のしきい値（tools/recommend-test.js のサンプルの子で確かめた）：
   *   n < 3                                         → unknown（3問未満では、1問のまちがいで判定がゆれすぎる）
   *   acc < 0.6 または (acc < 0.75 かつ (speed > 1.6 または hintRate > 0.5))  → weak
   *       （5問中3問○はにがて。4問中3問○でも、目安の1.6倍以上かかる／半分以上ヒントを見るなら、まだ身についていない）
   *   acc >= 0.9 かつ speed <= 1.1（記録なしは問わない）かつ hintRate < 0.2 → strong
   *       （10問中9問○で、目安どおりの時間・ヒントなし。ちょうせんに回してよい）
   *   ほか → soso
   */
  var TH = { minN: 3, weakAcc: 0.6, sosoAcc: 0.75, slow: 1.6, hintHeavy: 0.5, strongAcc: 0.9, fast: 1.1, hintLow: 0.2, halfLifeDays: 7, lastN: 20 };
  function statusOf(x) {
    if (x.n < TH.minN) return 'unknown';
    var sp = x.speed == null ? 1 : x.speed;
    if (x.acc < TH.weakAcc || (x.acc < TH.sosoAcc && (sp > TH.slow || x.hintRate > TH.hintHeavy))) return 'weak';
    if (x.acc >= TH.strongAcc && sp <= TH.fast && x.hintRate < TH.hintLow) return 'strong';
    return 'soso';
  }

  function profile(opts) {
    opts = opts || {};
    var now = Number(opts.now) || Date.now();
    var data = readRecords();
    var per = {};
    SKILLS.forEach(function (s) { per[s.id] = []; });
    data.recs.forEach(function (r) {
      if (r.skill) per[r.skill].push({ r: r, share: 1 });
      else if (r.tag) {
        var c = spreadTargets(r);
        c.forEach(function (s) { per[s.id].push({ r: r, share: 1 / c.length }); });
      }
    });
    var skills = {};
    SKILLS.forEach(function (s) {
      var list = per[s.id].sort(function (a, b) { return b.r.t - a.r.t; });
      // 新しい20問分まで（share の合計で数える）
      var cut = [], cnt = 0;
      for (var i = 0; i < list.length && cnt < TH.lastN; i++) { cut.push(list[i]); cnt += list[i].share; }
      var W = 0, A = 0, H = 0, SW = 0, SP = 0, n = 0, lastAt = 0, lastOk = null;
      cut.forEach(function (x) {
        var age = Math.max(0, now - x.r.t) / DAY;
        var w = Math.pow(0.5, age / TH.halfLifeDays) * x.share;
        W += w; n += x.share;
        if (x.r.ok) A += w;
        if (x.r.hints > 0) H += w;
        if (x.r.ms != null && x.r.est > 0) { SW += w; SP += w * clamp(x.r.ms / 1000 / x.r.est, 0.2, 4); }
        if (x.r.t > lastAt) { lastAt = x.r.t; lastOk = x.r.ok; }
      });
      var o = {
        acc: W > 0 ? A / W : 0,
        speed: SW > 0 ? SP / SW : null,
        hintRate: W > 0 ? H / W : 0,
        n: Math.round(n * 10) / 10,
        lastAt: lastAt || null,
        lastOk: lastOk
      };
      o.status = statusOf(o);
      o.acc = Math.round(o.acc * 1000) / 1000;
      if (o.speed != null) o.speed = Math.round(o.speed * 100) / 100;
      o.hintRate = Math.round(o.hintRate * 1000) / 1000;
      skills[s.id] = o;
    });
    // 種類別の平均秒：目安5問分を前においてならす（記録が少ないうちは目安に近い）
    var K = 5, avgSec = {}, factor = {}, allR = 0, allN = 0;
    Object.keys(BASE).forEach(function (type) {
      var sr = 0, sn = 0;
      data.recs.forEach(function (r) {
        if (r.type !== type || r.ms == null || !(r.est > 0)) return;
        sr += clamp(r.ms / 1000 / r.est, 0.2, 4); sn++;
      });
      allR += sr; allN += sn;
      factor[type] = (sr + K) / (sn + K);
      avgSec[type] = Math.round(BASE[type] * factor[type]);
    });
    // 前にまちがえた教科書の問題（リベンジのもと）
    var mistakes = [];
    data.recs.forEach(function (r) {
      if (!r.lp || r.key.indexOf('lesson-') !== 0) return;
      if (r.ok && r.correct) return;
      mistakes.push({ pid: r.pid, lesson: r.lp.no, skill: r.skill, t: r.t, fixed: !!r.correct });
    });
    return {
      skills: skills, frontier: data.frontier, avgSec: avgSec, factor: factor,
      speedFactor: Math.round((allR + K) / (allN + K) * 100) / 100,
      records: data.recs.length, mistakes: mistakes, now: now
    };
  }

  /* ---------- 保存（'shosu.recommend'） ---------- */
  var KEY = 'shosu.recommend';
  function loadStore() {
    var d = getJSON(KEY, null);
    if (!isObj(d)) d = {};
    if (!Array.isArray(d.results)) d.results = [];
    d.results = d.results.filter(isObj);
    if (!isObj(d.prefs)) d.prefs = {};
    return d;
  }
  function saveStore(d) {
    var copy = { v: 1, results: d.results.slice(0, 5), prefs: d.prefs };
    if (trySet(KEY, copy)) return true;
    // 容量超過：古い結果からへらす
    while (copy.results.length > 1) { copy.results.pop(); if (trySet(KEY, copy)) return true; }
    if (copy.results.length) { copy.results[0] = { at: copy.results[0].at, total: copy.results[0].total, correct: copy.results[0].correct, avgSec: copy.results[0].avgSec, sigs: [] }; if (trySet(KEY, copy)) return true; }
    copy.results = [];
    return trySet(KEY, copy);
  }

  // 同じ問題・同じ数の問題を見分けるしるし（保存の容量をへらすため、短いハッシュにする）
  function hash(str) {
    var h1 = 5381, h2 = 52711;
    for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 31 + c) | 0; }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  }
  function sigKeys(p) {
    return sigRaw(p).map(hash);
  }
  function sigRaw(p) {
    var M = Mat(), out = [];
    try { out.push(M ? M.signature(p) : JSON.stringify([p.type, p.q, p.parts, p.items, p.a, p.b])); } catch (e) { /* なし */ }
    if (p.type === 'hissan') out.push('h' + p.op + [String(p.a), String(p.b)].sort().join(','));
    if (p.type === 'choice' && typeof p.q === 'string') {
      var m = /([\d.]+) □ ([\d.]+)$/.exec(p.q);
      if (m) out.push('c' + [m[1], m[2]].sort().join(','));
    }
    if (p.from) out.push('L' + p.from);
    return out;
  }

  function okOf(r) { return r ? (typeof r.first === 'boolean' ? r.first : !!r.correct) : null; }
  function msOf(r) { var v = r ? Number(r.ms) : NaN; return v > 0 && v <= MAX_MS ? v : null; }

  // 1回分の結果をまとめる（saveResult・advice の prev に使う形）
  function summarize(o) {
    o = o || {};
    var ps = o.problems || [], rs = o.results || [], M = Mat();
    var skills = {}, correct = 0, done = 0, msSum = 0, msN = 0, sigs = [], revenge = [];
    ps.forEach(function (p, i) {
      if (!p) return;
      sigKeys(p).forEach(function (k) { sigs.push(k); });
      var r = rs[i], ok = okOf(r), id = p.skill || skillOf(p);
      if (p.revenge && p.from) revenge.push({ pid: p.from, ok: ok === true });
      if (!r) return;
      done++;
      if (ok) correct++;
      var ms = msOf(r);
      if (ms != null) { msSum += ms; msN++; }
      if (!id) return;
      var x = skills[id] || (skills[id] = { n: 0, ok: 0, rs: 0, rn: 0, role: p.role || '' });
      x.n++; if (ok) x.ok++;
      if (ms != null) { var est = M ? M.estimate(p, p.level || 'normal') : BASE[p.type] || 45; x.rs += ms / 1000 / est; x.rn++; }
      if (p.role === 'weak') x.role = 'weak';
    });
    var sk2 = {};
    for (var id in skills) {
      var x = skills[id];
      sk2[id] = { n: x.n, ok: x.ok, ratio: x.rn ? Math.round(x.rs / x.rn * 100) / 100 : null, role: x.role };
    }
    return {
      v: 1, at: o.at || new Date().toISOString(), minutes: o.minutes || null,
      total: done, planned: ps.length, correct: correct,
      rate: done ? Math.round(correct / done * 100) : 0,
      avgSec: msN ? Math.round(msSum / msN / 1000) : null,
      skills: sk2, sigs: sigs, revenge: revenge, focus: o.focus || []
    };
  }

  function saveResult(result) {
    if (!isObj(result)) return false;
    if (Array.isArray(result.problems)) result = summarize(result);
    var d = loadStore();
    d.results.unshift(result);
    return saveStore(d);
  }
  function results() { return loadStore().results.slice(); }
  function lastResult() { return loadStore().results[0] || null; }
  function prefs() {
    var p = loadStore().prefs, ok = { few: 1, normal: 1, many: 1 };
    return {
      minutes: [5, 10, 15].indexOf(p.minutes) >= 0 ? p.minutes : 10,
      weak: ok[p.weak] ? p.weak : 'normal',
      challenge: ok[p.challenge] ? p.challenge : 'normal'
    };
  }
  function setPrefs(o) {
    var d = loadStore();
    for (var k in o) if (k === 'minutes' || k === 'weak' || k === 'challenge') d.prefs[k] = o[k];
    return saveStore(d);
  }

  /* ---------- build（PLAN D） ----------
   * わりあい：にがて few 0.4 / normal 0.6 / many 0.8。ちょうせん few 0〜0.05（切り捨て）/ normal 0.1（1問以上）/ many 0.2（切り上げ）。のこりが確認（1問以上）。
   * 範囲：frontier 以下の時の技能だけ。
   * にがて：weak・soso を、弱いほど重く選ぶ。weak の技能は1回目かんたん→2回目からふつう、soso はふつう。
   *         前にまちがえた教科書の問題（最近3回に出していない・リベンジで○になっていない）を「リベンジ」として入れる。
   * 確認：前に○だった（acc>=0.75）技能を、しばらく取り組んでいないものほど重く。ふつう。
   * ちょうせん：strong の技能をむずかしいで（作れなければ up の技能）。全部進めて strong が7わり以上なら、ちょうせんをふやす。
   * にがて候補が無く、まだ分からない技能が多い子は、確認の中で技能を広く出す。
   * 問題数：その子の種類別の速さ（profile.factor）を目安秒にかけて、minutes に合わせる（5分で5〜8問）。
   * 最近3回に出した問題（同じ数の筆算・大小も）は出さない。同じ技能は続けない。1つの技能は全体の4わり（にがて多めは5わり）まで。 */
  var WEAK_R = { few: 0.4, normal: 0.6, many: 0.8 };
  function chalCount(sel, N) {
    if (sel === 'few') return Math.floor(N * 0.05); // 0〜0.05（20問未満なら0問）
    if (sel === 'many') return Math.ceil(N * 0.2);
    return Math.max(1, Math.round(N * 0.1));
  }
  function weakness(x) {
    var sp = x.speed == null ? 1 : x.speed;
    return (1 - x.acc) + 0.25 * Math.max(0, sp - 1) + 0.3 * x.hintRate + (x.status === 'weak' ? 0.3 : 0) + 0.05;
  }
  function timeFactor(prof, type) {
    var f = prof && prof.factor && prof.factor[type] ? prof.factor[type] : 1;
    return 0.3 + 0.7 * clamp(f, 0.5, 2.5); // 目安とその子の速さを 3:7 でまぜる
  }

  function build(opts) {
    opts = opts || {};
    sync();
    var G = Gen(), M = Mat();
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var minutes = Number(opts.minutes) > 0 ? Number(opts.minutes) : 10;
    var weakSel = WEAK_R[opts.weak] ? opts.weak : 'normal';
    var chalSel = WEAK_R[opts.challenge] ? opts.challenge : 'normal';
    var prof = opts.profile || profile({ now: opts.now });
    var store = loadStore();
    var recent = store.results.slice(0, 3);
    var seen = {};
    recent.forEach(function (r) { (r.sigs || []).forEach(function (k) { seen[k] = 1; }); });
    var revengeDone = {};
    store.results.forEach(function (r) { (r.revenge || []).forEach(function (x) { if (x && x.ok) revengeDone[x.pid] = 1; }); });

    var range = SKILLS.filter(function (s) { return s.lesson <= prof.frontier; });
    var st = function (id) { return prof.skills[id] || { status: 'unknown', acc: 0, n: 0, hintRate: 0, speed: null, lastAt: null }; };
    var target = minutes * 60;
    var minN = Math.max(3, Math.round(minutes * 0.9)), maxN = Math.round(minutes * 1.6);
    var avgEst = range.reduce(function (a, s) { var x = skillSample(s.id); return a + x.sec * timeFactor(prof, x.type); }, 0) / range.length;
    var N = clamp(Math.round(target / avgEst), minN, maxN);

    var weakC = range.filter(function (s) { var x = st(s.id); return x.status === 'weak' || x.status === 'soso'; });
    var strongC = range.filter(function (s) { return st(s.id).status === 'strong'; });
    var unknownN = range.filter(function (s) { return st(s.id).status === 'unknown'; }).length;
    var okC = range.filter(function (s) { var x = st(s.id); return x.status !== 'unknown' && x.acc >= 0.75; });
    var broad = !weakC.length && unknownN >= range.length / 2;
    // 全部進めていて、にがてが無く、ほとんど（7わり以上）とくい → ちょうせん（むずかしい）をふやす
    var allStrong = prof.frontier >= 10 && !range.some(function (s) { return st(s.id).status === 'weak'; }) && strongC.length >= range.length * 0.7;

    var nC = strongC.length ? chalCount(chalSel, N) : 0;
    if (allStrong && nC < N) nC += Math.round(N * 0.2);
    var nW = weakC.length || prof.mistakes.length ? Math.round(N * WEAK_R[weakSel]) : 0;
    if (N - nW - nC < 1) { nW = Math.max(0, N - nC - 1); }
    if (N - nW - nC < 1) { nC = Math.max(0, N - nW - 1); }

    // 1つの技能は全体の4わりまで（範囲がせまい子は、範囲の技能で足りる数まで広げる）
    // にがて「多め」は5わりまで（1つの技能だけがにがての子でも、多めを選んだ分ふえるように）
    var cap = Math.max(2, Math.ceil(N * (weakSel === 'many' ? 0.5 : 0.4)), Math.ceil(maxN / range.length));
    var count = {}, items = [];
    function used(id) { return count[id] || 0; }
    function add(p, s, role, extra) {
      p.skill = s; p.role = role;
      if (!p.tag) p.tag = BY_ID[s].tag;
      if (extra) for (var k in extra) p[k] = extra[k];
      p.level = p.src && p.src.lv ? p.src.lv : 'normal';
      p.skillStatus = st(s).status; // 組み立てたときの判定（アドバイスのほめ方に使う）
      sigKeys(p).forEach(function (k) { seen[k] = 1; });
      count[s] = used(s) + 1;
      items.push(p);
    }
    function fresh(p) { return !sigKeys(p).some(function (k) { return seen[k]; }); }
    function makeFor(id, level) {
      var s = BY_ID[id];
      for (var t = 0; t < 30; t++) {
        var g = s.gens[Math.floor(rng() * s.gens.length)];
        var o = { skill: id };
        if (level !== 'normal') o.level = level;
        var p = G.make(g.name, rng, o);
        if (G.skillOf(p) !== id) continue;
        if (fresh(p)) return p;
      }
      return null;
    }

    // ---- にがて（リベンジ → 技能） ----
    var revenge = 0;
    if (nW > 0) {
      var cand = prof.mistakes.filter(function (m) {
        if (m.lesson > prof.frontier || revengeDone[m.pid]) return false;
        var lp = lessonProblem(m.pid);
        return lp && fresh(lp.p);
      });
      var nRev = Math.min(cand.length, Math.max(1, Math.round(nW * 0.34)));
      var weight = function (m) { var x = m.skill ? st(m.skill) : null; return (m.fixed ? 1 : 2) * (x && (x.status === 'weak' || x.status === 'soso') ? 2 : 1); };
      for (var i = 0; i < nRev && cand.length; i++) {
        var pickM = wpick(rng, cand.map(function (m) { return [m, weight(m) * (m.skill && used(m.skill) >= cap ? 0 : 1)]; }));
        if (!pickM) break;
        cand.splice(cand.indexOf(pickM), 1);
        var lp = lessonProblem(pickM.pid);
        var cp = JSON.parse(JSON.stringify(lp.p));
        var sid = pickM.skill || skillOf(cp);
        if (!sid || used(sid) >= cap) continue;
        add(cp, sid, 'weak', { revenge: true, from: pickM.pid, fromLesson: lp.no });
        revenge++;
      }
    }
    var weakSeen = {};
    function addWeak() {
      var c = weakC.filter(function (s) { return used(s.id) < cap; });
      if (!c.length) return false;
      for (var t = 0; t < 6; t++) {
        var s = wpick(rng, c.map(function (s2) { return [s2, weakness(st(s2.id)) / (1 + used(s2.id))]; }));
        var x = st(s.id);
        var level = x.status === 'weak' && !weakSeen[s.id] ? 'easy' : 'normal';
        var p = makeFor(s.id, level);
        if (p) { weakSeen[s.id] = 1; add(p, s.id, 'weak'); return true; }
        c = c.filter(function (y) { return y !== s; });
        if (!c.length) return false;
      }
      return false;
    }
    while (items.length < nW) if (!addWeak()) break;
    var weakMade = items.length;

    // ---- ちょうせん ----
    var chalFrom = [];
    function addChallenge() {
      var c = strongC.filter(function (s) { return used(s.id) < cap && chalFrom.indexOf(s.id) < 0; });
      if (!c.length) c = strongC.filter(function (s) { return used(s.id) < cap; });
      while (c.length) {
        var s = wpick(rng, c.map(function (s2) { return [s2, 1 / (1 + used(s2.id))]; }));
        var p = makeFor(s.id, 'hard'), id = s.id;
        if (p && p.src && p.src.lv !== 'hard' && s.up && BY_ID[s.up].lesson <= prof.frontier && used(s.up) < cap) {
          var q = makeFor(s.up, 'hard');
          if (q) { p = q; id = s.up; }
        }
        if (p) { chalFrom.push(s.id); add(p, id, 'challenge', { challengeFrom: s.id }); return true; }
        c = c.filter(function (y) { return y !== s; });
      }
      return false;
    }
    var chalMade = 0;
    for (var ci = 0; ci < nC; ci++) if (addChallenge()) chalMade++;

    // ---- 確認（のこり。1問以上） ----
    function addCheck() {
      var pool = okC.slice();
      if (broad || pool.length < 2) pool = range.slice();
      var c = pool.filter(function (s) { return used(s.id) < cap; });
      if (!c.length) c = range.filter(function (s) { return used(s.id) < cap; });
      while (c.length) {
        var s = wpick(rng, c.map(function (s2) {
          var x = st(s2.id);
          var age = x.lastAt ? Math.max(0, prof.now - x.lastAt) / DAY : 30;
          var w = x.status === 'unknown' ? (broad ? 3 : 0.5) : 1 + Math.min(age, 30) / 3;
          if (x.status === 'weak') w *= 0.3; // にがてはにがての部分で出す
          return [s2, w / (1 + used(s2.id) * 3)];
        }));
        var p = makeFor(s.id, 'normal');
        if (p) { add(p, s.id, 'check'); return true; }
        c = c.filter(function (y) { return y !== s; });
      }
      return false;
    }
    var want = Math.max(1, N - items.length);
    for (var k = 0; k < want; k++) if (!addCheck()) break;

    // ---- 時間に合わせる ----
    function secOf(p) { return Math.round(M.estimate(p, p.level) * timeFactor(prof, p.type)); }
    function totalSec() { return items.reduce(function (a, p) { return a + secOf(p); }, 0); }
    var guard = 0;
    while (items.length > minN && totalSec() > target + 25 && guard++ < 30) {
      // 確認（2問以上のとき）→ にがて（リベンジ以外）の順にへらす
      var roles = ['check', 'weak', 'challenge'], removed = false;
      for (var ri = 0; ri < roles.length && !removed; ri++) {
        var role = roles[ri];
        var idx = -1;
        for (var j = items.length - 1; j >= 0; j--) if (items[j].role === role && !items[j].revenge) { idx = j; break; }
        var left = items.filter(function (p) { return p.role === role; }).length;
        if (idx >= 0 && (role !== 'check' || left > 1)) { count[items[idx].skill]--; items.splice(idx, 1); removed = true; }
      }
      if (!removed) break;
    }
    guard = 0;
    while (items.length < maxN && totalSec() < target - 30 && guard++ < 30) {
      var r = weakC.length && items.filter(function (p) { return p.role === 'weak'; }).length < Math.round(items.length * WEAK_R[weakSel]) ? addWeak() : false;
      if (!r && !addCheck()) break;
    }
    while (items.length < minN && guard++ < 60) if (!addCheck() && !addWeak()) break;

    // ---- ならべる：同じ技能が続かないように（のこりの多い技能から、前と同じでないものを） ----
    var rest = items.slice(), list = [], prev = null;
    // にがて・ちょうせんが1問目にならないように、さいしょは確認から（あれば）
    while (rest.length) {
      var groups = {};
      rest.forEach(function (p) { (groups[p.skill] = groups[p.skill] || []).push(p); });
      var ids = Object.keys(groups).filter(function (id) { return id !== prev; });
      if (!ids.length) ids = Object.keys(groups);
      var maxLen = Math.max.apply(null, ids.map(function (id) { return groups[id].length; }));
      var top = ids.filter(function (id) { return groups[id].length === maxLen; });
      if (!list.length) {
        var chk = ids.filter(function (id) { return groups[id].some(function (p) { return p.role === 'check'; }); });
        // 1問目は確認（いちばん多い技能が半分をこえるときは、その技能を先に）
        if (chk.length && maxLen * 2 <= rest.length) top = chk;
      }
      var pickId = top[Math.floor(rng() * top.length)];
      var g = groups[pickId];
      var it = list.length ? g[Math.floor(rng() * g.length)] : (g.filter(function (p) { return p.role === 'check'; })[0] || g[0]);
      list.push(it); rest.splice(rest.indexOf(it), 1); prev = pickId;
    }

    var seconds = [];
    list.forEach(function (p, i) { p.id = 'R-' + (i + 1); seconds.push(secOf(p)); });
    var total = seconds.reduce(function (a, b) { return a + b; }, 0);

    // ---- 今日のおすすめの一言 ----
    var wc = {};
    list.forEach(function (p) { if (p.role === 'weak' && !p.revenge) wc[p.skill] = (wc[p.skill] || 0) + 1; });
    var focus = Object.keys(wc).sort(function (a, b) { return wc[b] - wc[a] || weakness(st(b)) - weakness(st(a)); }).slice(0, 2);
    var chal = {};
    list.forEach(function (p) { if (p.role === 'challenge') chal[p.challengeFrom || p.skill] = (chal[p.challengeFrom || p.skill] || 0) + 1; });
    var summary;
    if (focus.length) {
      summary = focus.map(function (id, i) {
        var w = st(id).status === 'weak' ? 'にがてな ' : 'もう少しの ';
        if (i > 0 && st(id).status === st(focus[0]).status) w = '';
        return w + BY_ID[id].short;
      }).join('と ') + 'を中心に';
    } else if (broad) summary = 'いろいろな問題で、今の力を たしかめよう';
    else summary = 'わすれていないか、いろいろな問題で たしかめよう';
    var cids = Object.keys(chal);
    if (cids.length) {
      var cn = cids.reduce(function (a, id) { return a + chal[id]; }, 0);
      summary += (focus.length ? '、' : '。') + 'とくいな ' + cids.slice(0, 2).map(function (id) { return BY_ID[id].short; }).join('と ') + 'に' + cn + '問ちょうせん';
    }
    if (revenge) summary += '（前にまちがえた教科書の問題の リベンジも' + revenge + '問）';
    else if (!focus.length) summary += '。';

    return {
      problems: list, seconds: seconds, total: total, summary: summary, focus: focus,
      minutes: minutes, frontier: prof.frontier,
      counts: {
        weak: list.filter(function (p) { return p.role === 'weak'; }).length,
        check: list.filter(function (p) { return p.role === 'check'; }).length,
        challenge: list.filter(function (p) { return p.role === 'challenge'; }).length,
        revenge: revenge
      }
    };
  }

  /* ---------- アクション（教科書・みる・れんしゅう・ふくしゅう） ---------- */
  function actionsFor(id) {
    sync();
    var s = BY_ID[id];
    if (!s) return [];
    var L = lessonByNo(s.lesson), page = (L && L.page) || s.page;
    var demo = L && L.demo && DEMO_LABEL[L.demo.id] ? '（' + DEMO_LABEL[L.demo.id] + '）' : '';
    var topic = topics().filter(function (t) { return t.id === s.review; })[0];
    var acts = [
      { kind: 'textbook', label: '教科書 ' + page + ' を見直そう', page: page, lesson: s.lesson },
      { kind: 'miru', label: '第' + s.lesson + '時の「みる」' + demo + 'で確かめよう', href: '#/lesson/' + s.lesson, lesson: s.lesson, tab: 'miru' },
      { kind: 'lesson', label: '第' + s.lesson + '時のれんしゅうを やり直そう', href: '#/lesson/' + s.lesson, lesson: s.lesson, tab: 'renshu' }
    ];
    if (topic) acts.push({ kind: 'review', label: 'ふくしゅう「' + topic.title + '」をやろう', href: '#/review/' + encodeURIComponent(topic.id), review: topic.id });
    return acts;
  }

  /* ---------- advice（PLAN F） ---------- */
  function advice(o) {
    o = o || {};
    sync();
    var ps = o.problems || [], rs = o.results || [], prev = isObj(o.prev) ? o.prev : null;
    var cur = summarize({ problems: ps, results: rs, minutes: o.minutes, focus: o.focus });
    var per = {}, M = Mat();
    ps.forEach(function (p, i) {
      var r = rs[i];
      if (!p || !r) return;
      var id = p.skill || skillOf(p);
      if (!id || !BY_ID[id]) return;
      var x = per[id] || (per[id] = { id: id, n: 0, ok: 0, wrong: 0, hints: 0, rs: 0, rn: 0, weakN: 0, weakOk: 0, was: null });
      if (p.role === 'weak' && p.skillStatus) x.was = p.skillStatus;
      var ok = okOf(r);
      x.n++; if (ok) x.ok++; else x.wrong++;
      x.hints += Number(r.hints) || 0;
      var ms = msOf(r);
      if (ms != null) { x.rs += ms / 1000 / (M ? M.estimate(p, p.level || 'normal') : 45); x.rn++; }
      if (p.role === 'weak') { x.weakN++; if (ok) x.weakOk++; }
    });
    var list = Object.keys(per).map(function (id) { var x = per[id]; x.ratio = x.rn ? x.rs / x.rn : null; return x; });

    // 改善（まちがい → 時間 → ヒント）
    var improve = [];
    list.filter(function (x) { return x.wrong > 0 || (x.ratio != null && x.ratio > 1.6) || (x.n && x.hints / x.n >= 1.5); })
      .sort(function (a, b) { return b.wrong - a.wrong || (a.ok / a.n) - (b.ok / b.n) || (b.ratio || 0) - (a.ratio || 0); })
      .slice(0, 3)
      .forEach(function (x) {
        var lb = BY_ID[x.id].label, text;
        if (x.wrong >= 2) text = lb + 'で まちがいが多かったよ。';
        else if (x.wrong === 1) text = lb + 'で 1問 まちがえたよ。';
        else if (x.ratio != null && x.ratio > 1.6) text = lb + 'は 時間が かかったね。やり方を もう一度 たしかめよう。';
        else text = lb + 'は ヒントを たくさん使ったね。ヒントなしで できるように なろう。';
        improve.push({ skill: x.id, text: text, actions: actionsFor(x.id) });
      });

    // ほめる
    var praise = [];
    list.filter(function (x) { return x.wrong === 0 && x.n > 0; })
      .sort(function (a, b) { return b.weakN - a.weakN || b.n - a.n || (a.ratio || 9) - (b.ratio || 9); })
      .forEach(function (x) {
        if (praise.length >= 3) return;
        var lb = BY_ID[x.id].label, pr = prev && prev.skills && prev.skills[x.id];
        if (x.weakN >= 1 && x.weakOk === x.weakN && x.was !== 'soso') praise.push('にがてだった ' + lb + 'が、' + (x.n >= 2 ? '全部' : '') + 'できたね！');
        else if (x.weakN >= 1 && x.weakOk === x.weakN) praise.push(lb + 'が、' + (x.n >= 2 ? '全部 ' : '') + 'しっかりできたね！');
        else if (pr && pr.ratio != null && x.ratio != null && x.ratio < pr.ratio * 0.85) praise.push(lb + 'は、はやく正確に なったね！');
        else if (x.ratio != null && x.ratio <= 1 && x.n >= 2) praise.push(lb + 'は、はやくて正確だね！');
        else if (x.n >= 2) praise.push(lb + 'は、全部できたね！');
      });
    if (!praise.length && cur.total) praise.push(cur.correct ? 'さいごまで よくがんばったね！' + cur.correct + '問 できたよ。' : 'さいごまで よくがんばったね！');

    // 前回とのちがい
    var compare = [];
    if (prev && prev.total > 0 && cur.total > 0) {
      var pr0 = typeof prev.rate === 'number' ? prev.rate : Math.round(prev.correct / prev.total * 100);
      if (cur.rate >= pr0 + 5) compare.push('正答率が ' + pr0 + '% から ' + cur.rate + '% に 上がったね！');
      else if (cur.rate <= pr0 - 5) compare.push('正答率は 前回 ' + pr0 + '%、今回 ' + cur.rate + '% だったよ。つぎで とりもどそう。');
      else compare.push('正答率は ' + cur.rate + '%（前回 ' + pr0 + '%）。安定して いるね。');
      if (prev.avgSec != null && cur.avgSec != null) {
        var d = prev.avgSec - cur.avgSec;
        if (d >= 3) compare.push('1問の時間が ' + d + '秒 はやくなったね！');
        else if (d <= -3) compare.push('1問の時間は ' + (-d) + '秒 長くなったよ。ていねいに といたのかな。');
        else compare.push('1問の時間は 前回と ほぼ同じ（' + cur.avgSec + '秒）だよ。');
      }
    }

    // 次の一歩
    var nextIds = improve.map(function (x) { return x.skill; }).slice(0, 2);
    if (!nextIds.length) {
      var prof = o.profile || null;
      if (!prof) { try { prof = profile(); } catch (e) { prof = null; } }
      if (prof) nextIds = Object.keys(prof.skills).filter(function (id) { return prof.skills[id].status === 'weak' && BY_ID[id].lesson <= prof.frontier; })
        .sort(function (a, b) { return weakness(prof.skills[b]) - weakness(prof.skills[a]); }).slice(0, 2);
    }
    var next = nextIds.length
      ? '次のおすすめモードでは、' + nextIds.map(function (id) { return BY_ID[id].short; }).join('と ') + 'を中心に出すよ。'
      : '次のおすすめモードでは、ちょうせん問題も ためしてみよう。';

    // 星の判定のもと（P が Stars.log('recommend', …) に使う）
    var allCorrectWeakSkill = list.some(function (x) { return x.weakN >= 2 && x.weakOk === x.weakN; });
    var improved = false;
    if (prev && prev.total > 0 && cur.total > 0 && prev.avgSec != null && cur.avgSec != null) {
      var prRate = typeof prev.rate === 'number' ? prev.rate : Math.round(prev.correct / prev.total * 100);
      improved = (cur.rate > prRate || (cur.rate === 100 && prRate === 100)) && cur.avgSec < prev.avgSec;
    }
    return {
      praise: praise, improve: improve, compare: compare, next: next,
      stars: { allCorrectWeakSkill: allCorrectWeakSkill, improved: improved },
      result: cur
    };
  }

  /* ---------- とちゅうの「みる」（PLAN E） ----------
   * mistakes：その技能のまちがいの数（数）、または [{skill, first|correct}] / [skillId] の配列、または {skillId: 数}。
   * 同じ技能で2回目のまちがい（最初の答えが×）から {lesson, href, label, tab:'miru'} を返す。 */
  function shouldSuggestMiru(skillId, mistakes) {
    sync();
    var s = BY_ID[skillId];
    if (!s) return null;
    var n = 0;
    if (typeof mistakes === 'number') n = mistakes;
    else if (Array.isArray(mistakes)) {
      mistakes.forEach(function (x) {
        if (x === skillId) n++;
        else if (isObj(x) && x.skill === skillId && okOf(x) === false) n++;
      });
    } else if (isObj(mistakes)) n = Number(mistakes[skillId]) || 0;
    if (n < 2) return null;
    var L = lessonByNo(s.lesson);
    var demo = L && L.demo && DEMO_LABEL[L.demo.id] ? '（' + DEMO_LABEL[L.demo.id] + '）' : '';
    return { lesson: s.lesson, href: '#/lesson/' + s.lesson, tab: 'miru', skill: skillId, label: '第' + s.lesson + '時の「みる」' + demo + 'で確かめよう' };
  }

  var R = {
    SKILLS: SKILLS,
    TAG_LABELS: TAG_LABELS,
    TH: TH,
    skill: function (id) { sync(); return BY_ID[id] || null; },
    skillOf: skillOf,
    profile: profile,
    build: build,
    advice: advice,
    actionsFor: actionsFor,
    shouldSuggestMiru: shouldSuggestMiru,
    summarize: summarize,
    saveResult: saveResult,
    lastResult: lastResult,
    results: results,
    prefs: prefs,
    setPrefs: setPrefs,
    signatures: sigKeys,
    _statusOf: statusOf
  };
  try { sync(); } catch (e) { /* lessons.js がまだなら、使うときに合わせる */ }
  S.Recommend = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
