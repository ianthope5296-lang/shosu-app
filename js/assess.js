/* assess.js — 観点別評価の案・支援の提案・通知表の所見の案（担当R。PLAN「追加機能6」E・F・G、CONTRACTS「追加6」）
 *
 * Shosu.Assess.DEFAULTS                     はじめの基準
 * Shosu.Assess.settings() / setSettings(s)  localStorage 'shosu.assessSettings'（無ければメモリ）
 * Shosu.Assess.evaluate(student)            -> { know, think, attitude }  各 {grade:'A'|'B'|'C'|null, score, reasons:[text], enough}
 * Shosu.Assess.support(student)             -> [{kind:'skill'|'habit'|'extend', text}]（3〜5こ）
 * Shosu.Assess.comment(student, {length:'short'|'long', variant:n, cls:[同じ組の他の子の所見]}) -> text
 * Shosu.Assess.read(student)                -> 読みとった数字（下の read() の形。先生の画面の表示にも使える）
 * Shosu.Assess.count(text)                  所見の字数（1文字＝1字。半角の数字・記号も1字と数える）
 *
 * student = { profile, summary: LearnSummary, reflections: [Reflection...] }
 * LearnSummary は担当Q（js/summary.js）が作る。項目名がずれても吸収できるよう、読むのは read() の1か所だけ。
 * classic script。DOM を使わない純粋なロジック。Node でも require できる。絵文字は使わない。
 */
(function (S) {
  'use strict';

  /* ======================================================================
   * 基準と設定
   * ====================================================================== */
  var DEFAULTS = { know: { A: 0.9, B: 0.7 }, think: { A: 0.8, B: 0.55 }, attitude: { A: 0.75, B: 0.5 }, minLessons: 6 };
  var KEY = 'shosu.assessSettings';
  var mem = {};
  function store() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
      if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
    } catch (e) { /* なし */ }
    return null;
  }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function cleanSettings(s) {
    var out = copy(DEFAULTS);
    if (!isObj(s)) return out;
    ['know', 'think', 'attitude'].forEach(function (k) {
      var x = s[k];
      if (!isObj(x)) return;
      var A = ratio(x.A), B = ratio(x.B);
      if (A != null && A > 0) out[k].A = A;
      if (B != null && B >= 0) out[k].B = B;
      if (out[k].B > out[k].A) out[k].B = out[k].A;
    });
    var m = Number(s.minLessons);
    if (isFinite(m) && m >= 0 && m <= 10) out.minLessons = Math.round(m);
    return out;
  }
  function settings() {
    var L = store(), v = null;
    try { v = L ? L.getItem(KEY) : (KEY in mem ? mem[KEY] : null); } catch (e) { v = null; }
    if (v == null) return copy(DEFAULTS);
    try { return cleanSettings(JSON.parse(v)); } catch (e) { return copy(DEFAULTS); }
  }
  function setSettings(s) {
    var cur = settings(), merged = copy(cur);
    if (isObj(s)) {
      ['know', 'think', 'attitude'].forEach(function (k) { if (isObj(s[k])) { if (s[k].A != null) merged[k].A = s[k].A; if (s[k].B != null) merged[k].B = s[k].B; } });
      if (s.minLessons != null) merged.minLessons = s.minLessons;
    }
    var out = cleanSettings(merged), str = JSON.stringify(out), L = store();
    if (L) { try { L.setItem(KEY, str); } catch (e) { mem[KEY] = str; } } else mem[KEY] = str;
    return out;
  }

  /* ======================================================================
   * 小道具
   * ====================================================================== */
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function num(x) { var n = Number(x); return x !== null && x !== '' && typeof x !== 'boolean' && isFinite(n) ? n : null; }
  // 0〜1 の割合に（1より大きければ百分率とみなす）
  function ratio(x) { var n = num(x); if (n == null || n < 0) return null; return n > 1 ? clamp(n / 100, 0, 1) : n; }
  // o の中で、names のうち最初に値があるもの
  function pick(o, names) {
    if (!isObj(o)) return undefined;
    for (var i = 0; i < names.length; i++) if (o[names[i]] !== undefined && o[names[i]] !== null) return o[names[i]];
    return undefined;
  }
  function pnum(o, names) { return num(pick(o, names)); }
  function pct(r) { return Math.round(r * 100) + '%'; }
  function r3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
  function chars(s) { return Array.from ? Array.from(String(s || '')).length : String(s || '').length; }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  /* ======================================================================
   * 技能と時（recommend.js・lessons.js と同じ。読みこまれていればそちらに合わせる）
   * ====================================================================== */
  var SKILLS = [
    ['rep-001', 'hyoshikata', '表し方（0.01の何こ分）', 1, 'p.33〜35'],
    ['unit-m', 'hyoshikata', '単位のかんさん（m・cm）', 2, 'p.36'],
    ['numberline', 'hyoshikata', '数直線の読み', 2, 'p.36'],
    ['kui', 'hyoshikata', '0のある位（空位）', 2, 'p.36'],
    ['rep-0001', 'hyoshikata', '表し方（0.001の何こ分）', 3, 'p.37〜38'],
    ['unit-k', 'hyoshikata', '単位のかんさん（km・kg・mm など）', 3, 'p.37〜38'],
    ['place-name', 'shikumi', '位の名前', 4, 'p.39〜40'],
    ['compose', 'shikumi', '数の構成', 4, 'p.39〜40'],
    ['count-units', 'shikumi', '0.01（0.001）を何こ集めた数', 4, 'p.39〜40'],
    ['cmp-two', 'daisho', '大小（2つの数）', 5, 'p.41'],
    ['cmp-digits', 'daisho', '大小（けた数がちがう数）', 5, 'p.41'],
    ['order', 'daisho', 'ならべかえ（3つ以上）', 5, 'p.41'],
    ['times10', 'jubai', '10倍', 6, 'p.42'],
    ['times100', 'jubai', '100倍・1000倍', 6, 'p.42'],
    ['div10', 'jubai', '1/10', 6, 'p.42'],
    ['add-nocarry', 'tashizan', 'たし算（くり上がりなし）', 7, 'p.43〜44'],
    ['add-carry', 'tashizan', 'たし算（くり上がりあり）', 7, 'p.43〜44'],
    ['add-mis', 'tashizan', 'たし算（けたがそろっていない）', 7, 'p.43〜44'],
    ['add-trail0', 'tashizan', 'たし算（答えの終わりが0）', 7, 'p.43〜44'],
    ['sub-noborrow', 'hikizan', 'ひき算（くり下がりなし）', 8, 'p.45〜46'],
    ['sub-borrow', 'hikizan', 'ひき算（くり下がりあり）', 8, 'p.45〜46'],
    ['sub-multi', 'hikizan', 'ひき算（何回もくり下がる）', 8, 'p.45〜46'],
    ['sub-int', 'hikizan', 'ひき算（整数−小数）', 8, 'p.45〜46'],
    ['laws', 'kimari', '計算のきまり', 9, 'p.47']
  ].map(function (a) { return { id: a[0], tag: a[1], label: a[2], lesson: a[3], page: a[4] }; });
  var SK = {};
  SKILLS.forEach(function (s) { SK[s.id] = s; });
  // 知識・技能に入れる技能（表し方・しくみ・計算）と、思考・判断・表現に入れる技能
  var THINK_SKILLS = ['order', 'laws'];
  var LESSON_INFO = {
    1: ['0.1Lより少ないはしたの表し方', 'p.33〜35', 'ますの図'], 2: ['長さのはしたの表し方', 'p.36', '数直線'],
    3: ['0.01Lより少ないはしたの表し方', 'p.37〜38', 'ますの図'], 4: ['小数の位', 'p.39〜40', '位のブロック'],
    5: ['小数の大小', 'p.41', '大小くらべ'], 6: ['10倍・1/10の大きさ', 'p.42', '位のうつり方'],
    7: ['小数のたし算', 'p.43〜44', '筆算ステップ'], 8: ['小数のひき算', 'p.45〜46', '筆算ステップ'],
    9: ['計算のきまり', 'p.47', '計算のきまり'], 10: ['まとめ', 'p.48〜50', 'ふりかえり']
  };
  var DEMO_LABEL = { masu: 'ますの図', zoomline: '数直線', units: '単位', blocks: '位のブロック', compare: '大小くらべ', shift: '位のうつり方', hissan: '筆算ステップ', laws: '計算のきまり', furikaeri: 'ふりかえり' };
  var synced = false;
  function sync() {
    if (synced) return;
    var R = S.Recommend, L = S.Lessons;
    if (R && Array.isArray(R.SKILLS)) R.SKILLS.forEach(function (s) { if (SK[s.id]) { if (s.label) SK[s.id].label = s.label; if (s.page) SK[s.id].page = s.page; if (s.lesson) SK[s.id].lesson = s.lesson; } });
    if (Array.isArray(L) && L.length) {
      L.forEach(function (l) {
        if (!l || !LESSON_INFO[l.no]) return;
        if (l.title) LESSON_INFO[l.no][0] = l.title;
        if (l.page) LESSON_INFO[l.no][1] = l.page;
        if (l.demo && DEMO_LABEL[l.demo.id]) LESSON_INFO[l.no][2] = DEMO_LABEL[l.demo.id];
      });
      synced = true;
    }
  }
  function lessonInfo(no) { sync(); var x = LESSON_INFO[no] || ['', '', '']; return { title: x[0], page: x[1], demo: x[2] }; }
  function skillInfo(id) { sync(); return SK[id] || null; }

  /* 技能ごとの言い回し（支援と所見で使う）
   *   nat  … 所見の「〜でも」に入る、ことばの言い方
   *   tip  … 所見の「〜ことで」に入る、前向きな手立て
   *   focus… 支援の「〜の確認が必要」
   *   how  … 支援の「〜するとよい」 */
  var PHRASE = {
    'rep-001': ['0.01の何こ分で表す問題', 'ますの図で0.01の何こ分かを確かめる', '0.01がいくつ分かを数える見方', 'ますの図で0.01Lが何こ分かを1つずつ数えさせる'],
    'unit-m': ['mとcmの単位のかんさん', '1cmが0.01mであることを手がかりにする', '1cm＝0.01mの関係', '1mを100等分した図で、何cmが何mになるかを確かめる'],
    'numberline': ['数直線の読み取り', '1目もりの大きさを確かめてから読む', '1目もりがいくつかを確かめる手順', '数直線を大きくして、1目もりの大きさを声に出して確かめさせる'],
    'kui': ['0のある位の表し方', '位の表に数字を書き入れて確かめる', '空いた位に0を書く決まり', '位の表に数字を書き入れ、空いた位に0を入れる練習をする'],
    'rep-0001': ['0.001の何こ分で表す問題', '0.01をさらに10等分する見方を使う', '0.01を10等分すると0.001になる関係', 'ますの図の1目もりをさらに10等分して、0.001の何こ分かを数えさせる'],
    'unit-k': ['kmやkgなどの単位のかんさん', '1000等分の関係を図で確かめる', '1m＝0.001km などの1000等分の関係', '単位の図で、1000等分した1つ分がいくつかを確かめる'],
    'place-name': ['小数の位の名前', '位の表を使って確かめる', '小数第一位・第二位・第三位の名前と位置', '位の表に数を書き、位の名前を言いながら確かめる'],
    'compose': ['数の構成を考える問題', '位ごとに数を分けて考える', '位ごとに数を分けて考える見方', '位のブロックで、1・0.1・0.01・0.001がそれぞれ何こかを確かめる'],
    'count-units': ['0.01を何こ集めた数かを考える問題', '位のブロックで数を確かめる', '0.01や0.001を単位にして数える見方', '位のブロックで、0.01が何こ集まっているかを数えさせる'],
    'cmp-two': ['小数の大小くらべ', '小数点をそろえて上の位からくらべる', '小数点をそろえて上の位からくらべる手順', '小数点をそろえて縦に書き、上の位から1つずつくらべさせる'],
    'cmp-digits': ['けた数のちがう小数の大小くらべ', '小数点をそろえて上の位からくらべる', 'けた数がちがうときも小数点をそろえてくらべる手順', '小数点をそろえて縦に書き、空いた位に0をおぎなってくらべさせる'],
    'order': ['3つ以上の小数のならべかえ', '数直線に表して位置をくらべる', '数直線上の位置で大きさをとらえる見方', '数直線に数を書きこみ、位置を見てならべかえさせる'],
    'times10': ['10倍の大きさ', '位の表で数字の動きを確かめる', '10倍すると位が1つ上がるしくみ', '位の表で、数字が左へ1つ動くようすを確かめる'],
    'times100': ['100倍や1000倍の大きさ', '位の表で数字の動きを確かめる', '100倍・1000倍で位がいくつ上がるか', '位の表で、数字が左へ動く数を1つずつ確かめる'],
    'div10': ['1/10の大きさ', '位の表で数字の動きを確かめる', '1/10にすると位が1つ下がるしくみ', '位の表で、数字が右へ1つ動くようすを確かめる'],
    'add-nocarry': ['小数のたし算', '位をそろえて筆算する', '位をそろえて筆算に書く手順', '小数点をそろえて書き、同じ位どうしをたすことを確かめる'],
    'add-carry': ['くり上がりのある小数のたし算', '位をそろえて計算する', 'くり上がりを書きとめる手順', 'くり上がった1を小さく書きとめながら、1つずつ確かめる'],
    'add-mis': ['けた数のちがう小数のたし算', '小数点の位置をそろえて書く', 'けた数がちがうときに小数点をそろえて書く手順', '空いた位に0を書いて、小数点をそろえてから計算させる'],
    'add-trail0': ['答えの終わりが0になるたし算', '答えの0の消し方を確かめる', '答えの終わりの0を消す決まり', '答えを書いたあとに、終わりの0と小数点を見直させる'],
    'sub-noborrow': ['小数のひき算', '位をそろえて筆算する', '位をそろえて筆算に書く手順', '小数点をそろえて書き、同じ位どうしをひくことを確かめる'],
    'sub-borrow': ['くり下がりのある小数のひき算', '位をそろえて計算する', 'くり下がりのあるひき算で、位をそろえて書く手順', '1つずつ確かめる'],
    'sub-multi': ['何回もくり下がるひき算', '1つずつ位を確かめながら計算する', '何回もくり下がるときの手順', 'くり下がりを1回ずつ書きとめながら、1つずつ確かめる'],
    'sub-int': ['整数から小数をひく計算', '整数に小数点と0をつけて位をそろえる', '整数を「6.00」のように書きかえて位をそろえる手順', '整数に小数点と0を書き足してから計算させる'],
    'laws': ['計算のきまりを使った計算', 'たして切りのよい数になる組み合わせを見つける', '計算のきまりを使って順番をかえる考え方', 'たすとちょうどの数になる組み合わせをさがし、くふうして計算させる']
  };
  function phrase(id) { var p = PHRASE[id] || ['小数の計算', 'ていねいに確かめる', '計算の手順', '1つずつ確かめる']; return { nat: p[0], tip: p[1], focus: p[2], how: p[3] }; }

  /* ======================================================================
   * read(student) — LearnSummary・Reflection を読む（ここ1か所だけ）
   * 項目名のゆれを吸収する（例：n/total/count、ok/correct、first/firstRate、st が 'weak' でも 'にがて' でも 0 でも）。
   * 返す形：
   *   { lessons:[{no,tried,n,ok,firstOk,first,sec,hints}] ×10, tried, lessonN, lessonFirstOk,
   *     skills:{id:{st:'weak'|'soso'|'strong'|'unknown', acc, sp, n, h}},
   *     matome:{n, acc, full, hard:{n,acc}}, osusume:{n, acc, full, challenge:{n,acc}}, revenge:{n,acc}, story:{n,acc},
   *     review:{n,acc}, more:{n,acc}, make:{n, kinds, story, fig}, friend:{n, ok},
   *     plan:{days, done, items}, reflect:{n, evals:{double,single,triangle}, off, useT},
   *     hintRate (null=記録なし), speed (null=記録なし), days, stars,
   *     refl:{n, wCount, wLen, evalPairs:[{e, a}], useT, extra:{text:n}} }
   * ====================================================================== */
  function stat(o, nNames) {
    // {n, acc} にそろえる。o は数（回数）、{n,acc}、{n,ok}、配列（各回）のどれでも
    if (o == null) return { n: 0, acc: null, list: [] };
    if (typeof o === 'number') return { n: o, acc: null, list: [] };
    if (Array.isArray(o)) {
      var A = 0, W = 0;
      o.forEach(function (x) { var a = ratio(pick(x, ['acc', 'rate', 'r'])); var w = pnum(x, ['total', 'q', 'problems']) || 1; if (a != null) { A += a * w; W += w; } });
      return { n: o.length, acc: W ? A / W : null, list: o };
    }
    if (!isObj(o)) return { n: 0, acc: null, list: [] };
    var n = pnum(o, nNames || ['n', 'count', 'times', 'total', 'sessions']);
    var acc = ratio(pick(o, ['acc', 'rate', 'r', 'correctRate']));
    var okc = pnum(o, ['ok', 'correct', 'right', 'c']);
    var q = pnum(o, ['q', 'problems', 'total', 'n']);
    if (acc == null && okc != null && q) acc = clamp(okc / q, 0, 1);
    var list = Array.isArray(o.list) ? o.list : Array.isArray(o.sessions) ? o.sessions : [];
    if (n == null) n = list.length;
    return { n: n || 0, acc: acc, list: list, raw: o };
  }
  function stNorm(st, acc, n) {
    var m = { weak: 'weak', 'にがて': 'weak', w: 'weak', soso: 'soso', 'もう少し': 'soso', 'もうすこし': 'soso', s: 'soso', strong: 'strong', 'とくい': 'strong', good: 'strong', unknown: 'unknown', '-': 'unknown' };
    if (typeof st === 'string' && m[st]) return m[st];
    if (typeof st === 'number') return st < 0 ? 'unknown' : st === 0 ? 'weak' : st === 1 ? 'soso' : 'strong';
    if (acc == null || !(n >= 3)) return 'unknown';
    return acc < 0.6 ? 'weak' : acc >= 0.9 ? 'strong' : 'soso';
  }
  function readLesson(x, i) {
    var o = { no: i + 1, tried: false, n: 0, ok: 0, firstOk: null, first: null, sec: null, hints: null };
    if (x == null || x === 0 || x === false) return o;
    if (Array.isArray(x)) x = { n: x[0], ok: x[1], first: x[2], sec: x[3] };
    if (!isObj(x)) return o;
    o.no = pnum(x, ['no', 'lesson']) || i + 1;
    // summary.js（担当Q）：tried＝取り組んだ問題数、total＝その時の教科書の問題数。tried が true/false の形なら n/total を使う
    o.n = typeof x.tried === 'number' ? x.tried : (pnum(x, ['n', 'count', 'q', 'problems', 'total']) || 0);
    o.ok = Math.min(pnum(x, ['ok', 'correct', 'right', 'c']) || 0, o.n || Infinity);
    var fc = pnum(x, ['firstOk', 'firstCorrect', 'fok']);
    var fr = pick(x, ['first', 'firstRate', 'fr', 'firstAcc']);
    if (fc != null) o.firstOk = fc;
    else if (num(fr) != null) o.firstOk = Math.round(ratio(fr) * o.n);
    o.first = o.n ? (o.firstOk != null ? o.firstOk / o.n : o.ok / o.n) : null;
    if (o.firstOk != null) o.firstOk = Math.min(o.firstOk, o.n);
    o.sec = pnum(x, ['sec', 'avgSec', 'time', 'avg']);
    if (o.sec == null && pnum(x, ['ms', 'avgMs']) != null) o.sec = pnum(x, ['ms', 'avgMs']) / 1000;
    o.hints = pnum(x, ['hints', 'hint', 'h']);
    var tr = pick(x, ['tried', 'done', 'did']);
    o.tried = tr === undefined ? o.n > 0 : !!tr || o.n > 0;
    return o;
  }
  function parseAuto(list) {
    // 「教科書 第3時 5問中4問○」などから、その日の問題数と○の数
    var n = 0, ok = 0;
    (list || []).forEach(function (t) { var m = /(\d+)問中(\d+)問/.exec(String(t)); if (m) { n += +m[1]; ok += +m[2]; } });
    return n ? { n: n, ok: ok } : null;
  }
  var EVAL_VAL = { double: 0.95, single: 0.75, triangle: 0.45 };
  function readReflections(list) {
    var out = { n: 0, wCount: 0, wLen: 0, evalPairs: [], evals: { double: 0, single: 0, triangle: 0 }, useT: 0, extra: {}, extraN: 0 };
    if (!Array.isArray(list)) return out;
    var rs = list.filter(function (r) { return isObj(r); }).slice().sort(function (a, b) { return String(a.date) < String(b.date) ? -1 : String(a.date) > String(b.date) ? 1 : 0; });
    var prevT = null;
    rs.forEach(function (r) {
      out.n++;
      var w = isObj(r.w) ? r.w : {}, y = isObj(r.y) ? r.y : {}, me = isObj(r.meate) ? r.meate : {}, t = isObj(r.t) ? r.t : {};
      var wc = Array.isArray(w.choices) ? w.choices.length : 0, hasInk = !!(w.ink && w.ink.strokes && w.ink.strokes.length);
      if (wc > 0 || hasInk) out.wCount++;
      out.wLen += wc + (hasInk ? 1 : 0);
      if (EVAL_VAL[w.eval]) {
        out.evals[w.eval]++;
        var a = parseAuto(y.auto);
        if (a && a.n >= 2) out.evalPairs.push({ e: EVAL_VAL[w.eval], a: a.ok / a.n, ev: w.eval });
      }
      (Array.isArray(y.extra) ? y.extra : []).forEach(function (s) { out.extra[s] = (out.extra[s] || 0) + 1; out.extraN++; });
      // 前の T を生かしたか：前の T の文が、今回のめあて・やったことに入っている
      if (prevT && prevT.length) {
        var now = [].concat(me.choices || [], y.auto || []).join('\n');
        if (prevT.some(function (s) { return s && (now.indexOf(s) >= 0 || keyHit(s, now)); })) out.useT++;
      }
      prevT = Array.isArray(t.choices) ? t.choices : null;
    });
    return out;
  }
  function keyHit(s, now) { var m = /第(\d+)時/.exec(s); return !!(m && now.indexOf('第' + m[1] + '時') >= 0); }

  function read(student) {
    student = isObj(student) ? student : {};
    var sm = isObj(student.summary) ? student.summary : {};
    var m = {};
    // 各時
    var L = sm.lessons, arr = [];
    if (Array.isArray(L)) arr = L.slice(0, 10);
    else if (isObj(L)) for (var k = 1; k <= 10; k++) arr.push(L[k] != null ? L[k] : L['L' + k]);
    while (arr.length < 10) arr.push(null);
    m.lessons = arr.map(readLesson);
    m.tried = m.lessons.filter(function (l) { return l.tried; }).length;
    m.lessonN = 0; m.lessonFirstOk = 0; m.lessonOk = 0;
    m.lessons.forEach(function (l) { if (l.n) { m.lessonN += l.n; m.lessonFirstOk += l.firstOk != null ? l.firstOk : l.ok; m.lessonOk += l.ok; } });
    // 技能
    m.skills = {};
    var sks = sm.skills, list = [];
    if (Array.isArray(sks)) list = sks.filter(isObj).map(function (x) { return [x.id, x]; });
    else if (isObj(sks)) list = Object.keys(sks).map(function (id) { return [id, sks[id]]; });
    list.forEach(function (p) {
      if (!SK[p[0]] || !isObj(p[1])) return;
      var x = p[1], acc = ratio(pick(x, ['acc', 'rate', 'a'])), n = pnum(x, ['n', 'count']) || 0;
      m.skills[p[0]] = { st: stNorm(pick(x, ['st', 'status', 's']), acc, n), acc: acc, sp: pnum(x, ['sp', 'speed']), n: n, h: ratio(pick(x, ['h', 'hint', 'hintRate'])) };
    });
    // まとめ・おすすめ
    var mt = stat(sm.matome), os = stat(sm.osusume);
    function full(st) {
      var f = pnum(st.raw, ['fin', 'full', 'finished', 'complete', 'done', 'end']);
      if (f == null && st.list.length) f = st.list.filter(function (x) { return isObj(x) && (x.full || x.finished || x.complete || x.done); }).length;
      return f;
    }
    function sub(st, names, test) {
      var o = st.raw ? pick(st.raw, names) : undefined;
      var lvs = st.raw ? pick(st.raw, ['lv', 'levels', 'level']) : null;
      if (o === undefined && isObj(lvs)) o = pick(lvs, names);
      if (o !== undefined) return stat(o);
      var l = st.list.filter(function (x) { return isObj(x) && test(x); });
      return l.length ? stat(l) : { n: 0, acc: null };
    }
    m.matome = { n: mt.n, acc: mt.acc, full: full(mt), hard: sub(mt, ['hard', 'muzukashii'], function (x) { return x.level === 'hard' || x.lv === 'hard'; }) };
    m.osusume = { n: os.n, acc: os.acc, full: full(os), challenge: sub(os, ['challenge', 'ch', 'chosen'], function (x) { return !!x.challenge; }) };
    m.revenge = stat(pick(sm, ['revenge']) || (os.raw ? os.raw.revenge : null));
    m.story = stat(pick(sm, ['story', 'word', 'bunsho']));
    m.review = stat(sm.review); m.more = stat(sm.more);
    // 問題づくり・ともだち
    var mk = isObj(sm.make) ? sm.make : typeof sm.make === 'number' ? { n: sm.make } : {};
    var kinds = pick(mk, ['kinds', 'types', 'kind', 'type']);
    var kn = Array.isArray(kinds) ? kinds.length : isObj(kinds) ? Object.keys(kinds).filter(function (k2) { return kinds[k2]; }).length : num(kinds);
    var mkn = pnum(mk, ['n', 'count', 'made', 'total']) || 0;
    var story = pnum(mk, ['story', 'word', 'bun', 'bunsho']), fig = pnum(mk, ['fig', 'figure', 'zu', 'pic']);
    if (story == null && isObj(kinds)) story = num(kinds.story) || num(kinds.word) || 0;
    if (fig == null && isObj(kinds)) fig = (num(kinds.fig) || 0) + (num(kinds.figure) || 0) + (num(kinds.masu) || 0) + (num(kinds.numberline) || 0);
    if (story == null && Array.isArray(kinds)) story = kinds.some(function (s) { return /story|word|文章/.test(String(s)); }) ? 1 : 0;
    if (fig == null && Array.isArray(kinds)) fig = kinds.some(function (s) { return /fig|図/.test(String(s)); }) ? 1 : 0;
    m.make = { n: mkn, kinds: kn == null ? (mkn ? 1 : 0) : kn, story: story || 0, fig: fig || 0 };
    var fr = sm.friend;
    m.friend = typeof fr === 'number' ? { n: fr, ok: null } : { n: pnum(fr, ['n', 'answered', 'count']) || pnum(mk, ['friend', 'answered']) || 0, ok: pnum(fr, ['ok', 'correct', 'c']) };
    // 計画
    var pl = isObj(sm.plan) ? sm.plan : {};
    m.plan = { days: pnum(pl, ['days', 'n', 'planned', 'count']) || 0, done: pnum(pl, ['done', 'ok', 'kept', 'onPlan', 'allDone', 'achieved']) || 0, items: pnum(pl, ['items', 'avgItems', 'perDay']) };
    if (m.plan.done > m.plan.days) m.plan.done = m.plan.days;
    // ふりかえり（まとめの数字と、Reflection の両方。多い方を使う）
    var rf = isObj(sm.reflect) ? sm.reflect : {};
    m.refl = readReflections(student.reflections);
    var ev = pick(rf, ['ev', 'evals', 'eval', 'self']) || {};
    var evals = {
      double: Math.max(pnum(ev, ['double', '◎', 'd']) || 0, m.refl.evals.double),
      single: Math.max(pnum(ev, ['single', '○', 's']) || 0, m.refl.evals.single),
      triangle: Math.max(pnum(ev, ['triangle', '△', 't']) || 0, m.refl.evals.triangle)
    };
    m.reflect = {
      n: Math.max(pnum(rf, ['n', 'count', 'times']) || 0, m.refl.n),
      evals: evals,
      off: Math.max(pnum(rf, ['off', 'extra', 'outside', 'offApp']) || 0, m.refl.extraN),
      useT: Math.max(pnum(rf, ['prevT', 'useT', 'usedT', 'reuse', 'tUsed', 'nextUsed']) || 0, m.refl.useT),
      w: pnum(rf, ['w', 'wCount', 'wrote']),
      judged: pnum(rf, ['judged']) || 0, match: pnum(rf, ['match']) || 0
    };
    // W を書いた回：Reflection が届いていればそれを、無ければまとめの数字
    if (!m.refl.n && m.reflect.w != null && m.reflect.n) { m.refl.wCount = Math.min(m.reflect.w, m.reflect.n); m.refl.wLen = m.refl.wCount; m.refl.fromSummary = true; m.refl.n = m.reflect.n; }
    // 取り組み方（summary.habit：ぜんぶの問題の数・ヒント・最初×→やり直し○・考える問題）
    var hb = isObj(sm.habit) ? sm.habit : {};
    m.habit = { q: pnum(hb, ['q', 'n']) || 0, hint: ratio(pick(hb, ['hint', 'hintRate'])), miss: pnum(hb, ['miss', 'wrong']), fixed: pnum(hb, ['fixed', 'retryOk']), think: stat(pick(hb, ['think'])) };
    // ヒント・はやさ（技能ごと、または各時）
    var hW = 0, hS = 0, sW = 0, sS = 0;
    Object.keys(m.skills).forEach(function (id) {
      var x = m.skills[id];
      if (x.h != null && x.n) { hW += x.n; hS += x.h * x.n; }
      if (x.sp != null && x.n) { sW += x.n; sS += x.sp * x.n; }
    });
    var lh = 0, ln = 0;
    m.lessons.forEach(function (l) { if (l.hints != null && l.n) { lh += Math.min(l.hints, l.n); ln += l.n; } });
    var hr = ratio(pick(sm, ['hintRate'])) != null ? ratio(sm.hintRate) : isObj(sm.hints) ? ratio(pick(sm.hints, ['rate', 'r'])) : null;
    if (hr == null && m.habit.q && m.habit.hint != null) hr = m.habit.hint;
    m.hintRate = hr != null ? hr : hW ? hS / hW : ln ? lh / ln : null;
    m.speed = sW ? sS / sW : pnum(sm, ['speed']);
    m.days = pnum(sm, ['days', 'studyDays']) || Math.max(m.plan.days, m.reflect.n);
    m.stars = sm.stars;
    m.empty = !m.lessonN && !Object.keys(m.skills).length && !m.matome.n && !m.osusume.n && !m.reflect.n && !m.plan.days;
    return m;
  }

  // 最初×だった問題と、そのうちやり直して○にした数（summary.habit があればそれ、無ければ各時から）
  function retryOf(m) {
    if (m.habit && m.habit.miss != null && m.habit.fixed != null) return { wrong: m.habit.miss, fixed: Math.min(m.habit.fixed, m.habit.miss) };
    return { wrong: Math.max(0, m.lessonN - m.lessonFirstOk), fixed: Math.max(0, m.lessonOk - m.lessonFirstOk) };
  }
  // 技能のまとまり（tag）ごとの正答率（n の重みつき）
  function tagAcc(m) {
    var t = {};
    Object.keys(m.skills).forEach(function (id) {
      var x = m.skills[id], s = SK[id];
      if (x.acc == null || !x.n) return;
      t[s.tag] = t[s.tag] || { A: 0, n: 0 };
      t[s.tag].A += x.acc * x.n; t[s.tag].n += x.n;
    });
    Object.keys(t).forEach(function (k) { t[k].acc = t[k].A / t[k].n; });
    return t;
  }
  function weakSkills(m) {
    return Object.keys(m.skills).filter(function (id) { return m.skills[id].st === 'weak'; })
      .sort(function (a, b) { return (m.skills[a].acc || 0) - (m.skills[b].acc || 0) || SK[a].lesson - SK[b].lesson; });
  }
  // 加重平均（items:[{v, w}]。v が null のものは入れない＝「記録が無い」ものは重みを分け直す）
  function wavg(items) {
    var W = 0, A = 0;
    items.forEach(function (x) { if (x.v != null && x.w > 0) { W += x.w; A += clamp(x.v, 0, 1) * x.w; } });
    return W ? A / W : null;
  }
  function gradeOf(score, th) { if (score == null) return null; return score >= th.A - 1e-9 ? 'A' : score >= th.B - 1e-9 ? 'B' : 'C'; }
  // 自己評価と実際の一致（1回ごと：◎0.95・○0.75・△0.45 と、その日の正答率の差が 0.25 以内なら一致）
  function calib(m) {
    var pairs = m.refl.evalPairs;
    if (pairs.length) {
      var match = 0, diff = 0;
      pairs.forEach(function (p) { if (Math.abs(p.e - p.a) <= 0.25) match++; diff += p.e - p.a; });
      return { n: pairs.length, rate: match / pairs.length, bias: diff / pairs.length };
    }
    // 1回ごとの正答率が無ければ、まとめの judged/match（summary.js が日ごとにくらべた数）と、◎○△の平均と全体の正答率でみる
    var ev = m.reflect.evals, en = ev.double + ev.single + ev.triangle;
    var acc = m.lessonN ? m.lessonOk / m.lessonN : null;
    var e = en ? (ev.double * EVAL_VAL.double + ev.single * EVAL_VAL.single + ev.triangle * EVAL_VAL.triangle) / en : null;
    var bias = e != null && acc != null ? e - acc : 0;
    if (m.reflect.judged) return { n: m.reflect.judged, rate: clamp(m.reflect.match / m.reflect.judged, 0, 1), bias: bias };
    if (!en || acc == null) return null;
    return { n: en, rate: clamp(1 - Math.max(0, Math.abs(e - acc) - 0.1) / 0.4, 0, 1), bias: bias, rough: true };
  }
  // 考える問題（ならべかえ・計算のきまり・文章題・むずかしいレベル・ちょうせん・リベンジ）
  // まとめ・おすすめ・リベンジの回数しか分からないときは、1回＝5問とみなして重みにする。
  function thinkParts(m) {
    var parts = [];
    var ht = m.habit && m.habit.think, hq = ht && ht.raw ? pnum(ht.raw, ['q', 'n']) : 0;
    if (hq && ht.acc != null) parts.push({ name: 'ならべかえ・計算のきまり・ともだちの問題', acc: ht.acc, n: hq });
    else THINK_SKILLS.forEach(function (id) { var x = m.skills[id]; if (x && x.acc != null && x.n) parts.push({ name: SK[id].label.replace(/（.*）/, ''), acc: x.acc, n: x.n }); });
    [['文章題', m.story], ['むずかしいレベル', m.matome.hard], ['ちょうせん', m.osusume.challenge], ['リベンジ', m.revenge]].forEach(function (p) {
      var st = p[1];
      if (st && st.acc != null && st.n) parts.push({ name: p[0], acc: st.acc, n: st.raw && pnum(st.raw, ['q', 'problems']) ? pnum(st.raw, ['q', 'problems']) : st.n * (p[0] === '文章題' ? 1 : 5) });
    });
    var n = 0, A = 0;
    parts.forEach(function (p) { n += p.n; A += p.acc * p.n; });
    return { parts: parts, n: n, acc: n ? A / n : null };
  }

  /* ======================================================================
   * evaluate(student)
   *
   * 【知識・技能】score = 0.8 × 教科書の問題の「最初の答えで○」の割合（各時を問題数で重みづけ）
   *                     + 0.2 × 表し方・しくみ・計算の技能の正答率（技能の記録数で重みづけ。order・laws は除く）
   *   技能の記録が無ければ、教科書の問題だけ。教科書の問題も技能も無ければ grade:null。
   *   取り組んだ時が minLessons（はじめ6）未満なら enough:false（案は出す。理由に「材料が少ない」）。
   *   判定：A ≧ know.A（0.9）、B ≧ know.B（0.7）、それより下は C。
   *
   * 【思考・判断・表現】score = 0.55 × 考える問題の正答率（ならべかえ・計算のきまり・文章題・むずかしいレベル・ちょうせん・リベンジ）
   *                         + 0.20 × 問題づくり（種類 min(種類/3,1) × 0.7 ＋ 文章題か図の問題があれば 0.3。作っていなければ 0）
   *                         + 0.25 × ふりかえりで W（わかったこと・できたこと）を書いた割合（ふりかえり0回なら 0）
   *   考える問題の記録が無いときは、その分を除いて重みを分け直す（加重平均）。
   *   考える問題が5問未満、または取り組んだ時が minLessons 未満なら enough:false。判定：A ≧ 0.8、B ≧ 0.55。
   *
   * 【主体的に学習に取り組む態度】次の点（0〜1）の加重平均。記録の無いもの（null）は除いて重みを分け直す。
   *   計画     0.20  計画を立てた日 min(日数/5,1) × 0.5 ＋ 計画どおりの割合 × 0.5（立てていなければ 0）
   *   ふりかえり 0.15  min(回数/5,1)
   *   やり直し  0.15  最初×だった問題のうち、やり直して○にした割合（最初×が無ければ除く）
   *   ヒント    0.10  1 − min(ヒントを使った割合/0.5, 1)（少ないほど良い。記録が無ければ除く）
   *   自分で選ぶ 0.15  min((まとめ＋おすすめの回数)/4, 1)
   *   自己評価  0.10  ◎○△と実際の正答率が合っていた割合（ふりかえりに正答率が無いときは平均どうしでみる。◎○△が無ければ除く）
   *   前のT    0.15  min(前の「次にやりたいこと」を生かした回数/3, 1)（ふりかえりが2回未満なら除く）
   *   ふりかえり＋計画が4日分未満で、取り組んだ時も minLessons 未満なら enough:false。判定：A ≧ 0.75、B ≧ 0.5。
   * ====================================================================== */
  function evaluate(student) {
    var m = read(student), th = settings();
    var tried = m.tried, few = tried < th.minLessons;
    var fewText = '取り組んだ時が10時間中' + tried + '時間で、材料が少ない（' + th.minLessons + '時間以上で判定）';

    /* ---- 知識・技能 ---- */
    var know = { grade: null, score: null, reasons: [], enough: !few };
    var first = m.lessonN ? m.lessonFirstOk / m.lessonN : null;
    var tA = 0, tN = 0, tags = tagAcc(m);
    Object.keys(m.skills).forEach(function (id) { var x = m.skills[id]; if (THINK_SKILLS.indexOf(id) < 0 && x.acc != null && x.n) { tA += x.acc * x.n; tN += x.n; } });
    var tech = tN ? tA / tN : null;
    know.score = r3(first != null ? (tech != null ? 0.8 * first + 0.2 * tech : first) : tech);
    know.grade = gradeOf(know.score, th.know);
    if (first != null) know.reasons.push('教科書の問題で最初の答えが○ ' + pct(first) + '（' + m.lessonN + '問中' + m.lessonFirstOk + '問）');
    else know.reasons.push('教科書の問題の記録がまだない');
    if (tech != null) {
      var tagList = Object.keys(tags).filter(function (k) { return k !== 'kimari'; }).sort(function (a, b) { return tags[b].acc - tags[a].acc; });
      var TL = { hyoshikata: '表し方・単位', shikumi: 'しくみ', daisho: '大小', jubai: '10倍・1/10', tashizan: 'たし算', hikizan: 'ひき算' };
      var tx = '表し方・しくみ・計算の技能の正答率 ' + pct(tech);
      if (tagList.length >= 2 && tags[tagList[0]].acc - tags[tagList[tagList.length - 1]].acc >= 0.05) tx += '（高い：' + TL[tagList[0]] + ' ' + pct(tags[tagList[0]].acc) + '、低い：' + TL[tagList[tagList.length - 1]] + ' ' + pct(tags[tagList[tagList.length - 1]].acc) + '）';
      know.reasons.push(tx);
    }
    var lowL = m.lessons.filter(function (l) { return l.n >= 3 && l.first != null && l.first < th.know.B; });
    var highL = m.lessons.filter(function (l) { return l.n >= 3 && l.first != null && l.first >= th.know.A; });
    if (lowL.length) know.reasons.push('最初の答えの○が少なめの時：' + lowL.slice(0, 3).map(function (l) { return '第' + l.no + '時 ' + pct(l.first); }).join('、'));
    else if (highL.length >= 2) know.reasons.push('最初の答えで9割以上○の時：' + highL.slice(0, 4).map(function (l) { return '第' + l.no + '時'; }).join('・') + (highL.length > 4 ? ' など' + highL.length + '時間分' : ''));
    know.reasons.push(few ? fewText : '取り組んだ時 10時間中' + tried + '時間');

    /* ---- 思考・判断・表現 ---- */
    var think = { grade: null, score: null, reasons: [], enough: true };
    var tp = thinkParts(m);
    var makeV = m.make.n ? clamp(Math.min(m.make.kinds / 3, 1) * 0.7 + (m.make.story || m.make.fig ? 0.3 : 0), 0, 1) : 0;
    var rn = m.refl.n || m.reflect.n;
    var wRate = m.refl.n ? m.refl.wCount / m.refl.n : (m.reflect.n ? null : 0);
    var hasAny = tp.acc != null || m.make.n || rn || m.lessonN;
    think.score = hasAny ? r3(wavg([{ v: tp.acc, w: 0.55 }, { v: makeV, w: 0.2 }, { v: wRate, w: 0.25 }])) : null;
    think.grade = gradeOf(think.score, th.think);
    think.enough = !few && tp.n >= 5;
    if (tp.acc != null) think.reasons.push('考える問題（' + tp.parts.map(function (p) { return p.name; }).join('・') + '）の正答率 ' + pct(tp.acc) + '（約' + Math.round(tp.n) + '問）');
    else think.reasons.push('考える問題（ならべかえ・計算のきまり・ちょうせん など）の記録がまだない');
    if (m.make.n) think.reasons.push('問題づくり ' + m.make.n + '問（' + m.make.kinds + '種類' + (m.make.story || m.make.fig ? '、' + [m.make.story ? '文章題' : '', m.make.fig ? '図の問題' : ''].filter(Boolean).join('や') + 'あり' : '') + '）');
    else think.reasons.push('問題づくりはまだ（0問）');
    if (m.refl.n) think.reasons.push('ふりかえりで「わかったこと」を書いた回 ' + m.refl.n + '回中' + m.refl.wCount + '回（' + pct(wRate) + '）');
    else if (m.reflect.n) think.reasons.push('ふりかえり ' + m.reflect.n + '回（中身はまだ届いていない）');
    else think.reasons.push('ふりかえりはまだ');
    if (m.friend.n) think.reasons.push('ともだちの問題に答えた数 ' + m.friend.n + '問');
    if (!think.enough) think.reasons.push(few ? fewText : '考える問題が' + Math.round(tp.n) + '問で、材料が少ない');

    /* ---- 態度 ---- */
    var att = { grade: null, score: null, reasons: [], enough: true };
    var pd = m.plan.days, doneR = pd ? m.plan.done / pd : 0;
    var planV = pd ? Math.min(pd / 5, 1) * 0.5 + doneR * 0.5 : 0;
    var reflV = Math.min(m.reflect.n / 5, 1);
    var rt = retryOf(m), wrong = rt.wrong, fixed = rt.fixed;
    var retryV = wrong > 0 ? clamp(fixed / wrong, 0, 1) : null;
    var hintV = m.hintRate != null ? 1 - Math.min(m.hintRate / 0.5, 1) : null;
    var chosen = m.matome.n + m.osusume.n, chosenV = Math.min(chosen / 4, 1);
    var cb = calib(m), calibV = cb ? cb.rate : null;
    var useTV = m.reflect.n >= 2 ? Math.min(m.reflect.useT / 3, 1) : null;
    var attAny = !m.empty;
    att.score = attAny ? r3(wavg([{ v: planV, w: 0.2 }, { v: reflV, w: 0.15 }, { v: retryV, w: 0.15 }, { v: hintV, w: 0.1 }, { v: chosenV, w: 0.15 }, { v: calibV, w: 0.1 }, { v: useTV, w: 0.15 }])) : null;
    att.grade = gradeOf(att.score, th.attitude);
    att.enough = !(few && m.reflect.n + pd < 4);
    att.reasons.push(pd ? '計画を立てた日 ' + pd + '日、そのうち計画どおり ' + m.plan.done + '日' : '計画を立てた日はまだない');
    att.reasons.push('ふりかえり ' + m.reflect.n + '回' + (m.reflect.useT ? '（前の「次にやりたいこと」を生かした回 ' + m.reflect.useT + '回）' : ''));
    if (retryV != null) att.reasons.push('最初にまちがえた問題をやり直して○にした割合 ' + pct(retryV) + '（' + wrong + '問中' + Math.max(0, fixed) + '問）');
    var calibText = cb ? '自己評価（◎○△）と実際の正答率 ' + (cb.rate >= 0.7 ? 'おおむね合っている' : cb.bias > 0.15 ? '自己評価が高め' : cb.bias < -0.15 ? '自己評価がひかえめ' : 'ずれることがある') + '（' + cb.n + '回' + (cb.rough ? '・平均でみた' : '') + '）' : '';
    if (cb && cb.rate < 0.7) att.reasons.push(calibText);
    if (m.hintRate != null && m.hintRate >= 0.4) att.reasons.push('ヒントを使った問題の割合 ' + pct(m.hintRate) + '（多め）');
    if (chosen) att.reasons.push('自分で選んだまとめモード ' + m.matome.n + '回・おすすめモード ' + m.osusume.n + '回');
    else if (att.reasons.length < 4) att.reasons.push('まとめモード・おすすめモードはまだ');
    if (!att.enough) att.reasons.splice(Math.min(att.reasons.length, 4), 0, fewText);
    if (m.hintRate != null && m.hintRate < 0.4 && att.reasons.length < 5) att.reasons.push('ヒントを使った問題の割合 ' + pct(m.hintRate) + (m.hintRate <= 0.15 ? '（少なく、自分で考えている）' : ''));
    if (cb && cb.rate >= 0.7 && att.reasons.length < 5) att.reasons.push(calibText);
    att.reasons = att.reasons.slice(0, 5);
    know.reasons = know.reasons.slice(0, 5);
    think.reasons = think.reasons.slice(0, 5);
    return { know: know, think: think, attitude: att };
  }

  /* ======================================================================
   * support(student) — 支援の提案（3〜5こ。先生向け）
   * 1. にがての技能（正答率の低い順に2つまで）
   * 2. 取り組み方（ヒントが多い／時間がかかる／計画を立てない・多すぎる／ふりかえりが短い／自己評価がずれる）
   * 3. よくできる子（知識・技能が A 相当、考える問題も高い）：ちょうせん・説明役・問題づくり
   * 3こに足りないときは、データが少ない子への声かけ・次の時・ふりかえりの書き方で補う。
   * ====================================================================== */
  function support(student) {
    var m = read(student), th = settings(), ev = evaluate(student), out = [];
    var weak = weakSkills(m);
    weak.slice(0, 2).forEach(function (id) {
      var s = skillInfo(id), p = phrase(id), li = lessonInfo(s.lesson);
      var how = p.how;
      out.push({ kind: 'skill', skill: id, text: '「' + s.label + '」（第' + s.lesson + '時・教科書' + (s.page || li.page) + '）で、' + p.focus + 'の確認が必要。第' + s.lesson + '時の「みる」（' + li.demo + '）を使い、' + how + 'とよい。' });
    });
    var habits = [];
    if (m.hintRate != null && m.hintRate >= 0.4) habits.push('ヒントを使う問題が多い（' + pct(m.hintRate) + '）。手がかりを1つずつ示して、自分で考える時間をとるとよい。');
    if (m.speed != null && m.speed >= 1.5) habits.push('問題を解くのに目安の約' + (Math.round(m.speed * 10) / 10) + '倍の時間がかかっている。はじめに目安の時間を伝え、問題数をしぼって確実に取り組ませるとよい。');
    var activeDays = Math.max(m.days, m.reflect.n, m.tried);
    if (!m.empty && m.plan.days === 0 && activeDays >= 2) habits.push('学習の計画をまだ立てていない。1日にできる量と時間の見積もりを一緒に考え、短い計画から立てさせるとよい。');
    else if (m.plan.days >= 3 && (m.plan.done / m.plan.days < 0.4 || (m.plan.items != null && m.plan.items >= 5))) habits.push('計画どおりに終わった日が' + m.plan.days + '日中' + m.plan.done + '日で、計画が多すぎる傾向がある。1つの学習にかかる時間の見積もりを一緒に考え、量を調整するとよい。');
    if (m.refl.n >= 2 && m.refl.wCount / m.refl.n < 0.6) habits.push('ふりかえりの「わかったこと」が短い（' + m.refl.n + '回中' + m.refl.wCount + '回だけ記入）。「どこでつまずいたか」「何がわかったか」を一言で書く練習をするとよい。');
    var cb = calib(m);
    if (cb && cb.n >= 2 && cb.bias > 0.2) habits.push('自己評価（◎）が実際の正答率より高めになりやすい。ふりかえりのときに、○の数を一緒に確かめてから◎○△を選ばせるとよい。');
    else if (cb && cb.n >= 2 && cb.bias < -0.25) habits.push('実際はよくできているのに、自己評価がひかえめ。できたことを具体的に認め、自信につなげるとよい。');
    habits.forEach(function (t) { out.push({ kind: 'habit', text: t }); });
    var strong = (ev.know.score != null && ev.know.score >= th.know.A) && (ev.think.score == null || ev.think.score >= th.think.B);
    if (strong) {
      out.push({ kind: 'extend', text: '教科書の問題は確実にできている。おすすめモードの「ちょうせん」やまとめモードの「むずかしい」に取り組ませ、考えを広げるとよい。' });
      out.push({ kind: 'extend', text: '考え方を説明できる力がある。友だちに解き方を説明する役をまかせ、言葉で表す力をのばすとよい。' });
      if (out.length < 5) out.push({ kind: 'extend', text: m.make.n ? '問題づくりで、文章題や図を使った問題に発展させ、友だちと解き合う場を設けるとよい。' : '問題づくりに取り組ませ、学んだことを使った文章題を作って友だちと解き合うとよい。' });
    }
    // 足りないときに補う
    var nextNo = 0;
    for (var i = 0; i < 10; i++) if (!m.lessons[i].tried) { nextNo = i + 1; break; }
    var fill = [];
    if (m.empty || m.tried < th.minLessons) {
      var li = nextNo ? lessonInfo(nextNo) : null;
      fill.push({ kind: 'habit', text: '学習の記録がまだ少ない（取り組んだ時 ' + m.tried + 'つ）。' + (li ? '次は第' + nextNo + '時「' + li.title + '」（教科書' + li.page + '）から取り組むよう声をかけるとよい。' : 'まとめモードで全体を確かめさせるとよい。') });
    }
    if (m.plan.days === 0 && !habits.some(function (t) { return /計画/.test(t); })) fill.push({ kind: 'habit', text: '学習の計画づくりが必要。ホームの「きょうの計画」で、1日の量を一緒に決めるとよい。' });
    if (m.reflect.n < 2) fill.push({ kind: 'habit', text: 'ふりかえりの習慣づくりが必要。学習の終わりに「わかったこと」を1つ選んで送るよう声をかけるとよい。' });
    if (!weak.length && !strong) {
      var t = tagAcc(m), low = Object.keys(t).sort(function (a, b) { return t[a].acc - t[b].acc; })[0];
      var lowSk = low ? SKILLS.filter(function (s) { return s.tag === low; })[0] : null;
      if (lowSk && t[low].acc < 0.85) { var li2 = lessonInfo(lowSk.lesson); fill.push({ kind: 'skill', text: '大きなつまずきはない。比べると「' + ({ hyoshikata: '表し方・単位', shikumi: 'しくみ', daisho: '大小', jubai: '10倍・1/10', tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり' })[low] + '」（第' + lowSk.lesson + '時・教科書' + li2.page + '）の正答率がやや低いので、第' + lowSk.lesson + '時の「みる」（' + li2.demo + '）でもう一度確かめるとよい。' }); }
    }
    if (!strong) fill.push({ kind: 'extend', text: 'できるようになったことをふりかえりで認め、次の時のめあてを自分で選ばせるとよい。' });
    fill.push({ kind: 'extend', text: 'まちがえた問題を「ふくしゅう」でやり直し、できたことを確かめる時間をとるとよい。' });
    fill.forEach(function (f) { if (out.length < 3 && !out.some(function (o) { return o.text === f.text; })) out.push(f); });
    return out.slice(0, 5);
  }

  /* ======================================================================
   * comment(student, {length, variant, cls}) — 通知表の所見の案
   * 文の型：よいところ（技能・取り組み）→ 学び方（計画・ふりかえり・やり直し など）→ 今後への期待（課題を前向きに）
   *   各部分に「事実」（何をほめるか）を優先順に2〜3つ用意し、それぞれ短い言い方・長い言い方を2つずつ持つ。
   *   短い：よいところ＋学び方＋期待 の3文、長い：3文（字数が足りなければ学び方を2文）。
   *   組み合わせのうち、字数の範囲（短い60〜80、長い100〜150。1文字＝1字）に入るものだけを候補にする。
   *   並べる順：同じ組の所見（cls）と同じ文の数 → 事実の優先順位と言い方の番号。
   *   variant は、重なりの少ない候補（16こまで）を「前の案と同じ文が少ない順」に並べたときの何番目か（variant ごとに別の組み合わせ・言い方）。
   * ====================================================================== */
  var TAG_GOOD = {
    hyoshikata: {
      s: ['小数の表し方を理解し、正しく表すことができました。', 'はしたの量を、小数で正しく表すことができました。'],
      l: ['小数のしくみを、0.1や0.01がいくつ分かという見方で考え、正しく表すことができました。', 'かさや長さのはしたを、0.01や0.001の何こ分と考えて、小数で正しく表すことができました。']
    },
    shikumi: {
      s: ['小数の位の名前や数の構成を理解できました。', '小数のしくみを、位ごとに整理して理解できました。'],
      l: ['小数第一位、第二位、第三位という位の名前を理解し、数の構成を正しく考えることができました。', '小数を位ごとに分けて考え、0.01を何こ集めた数かを正しく説明することができました。']
    },
    daisho: {
      s: ['小数の大小を、位に着目して正しく判断できました。', '小数点をそろえて、大小を正しくくらべられました。'],
      l: ['小数点をそろえて上の位から順にくらべ、小数の大小を正しく判断することができました。', '数直線や位の表を使って、小数の大きさを正しくくらべることができました。']
    },
    jubai: {
      s: ['10倍や1/10の大きさを、位の動きで理解できました。', '10倍すると位が1つ上がることを理解できました。'],
      l: ['小数を10倍や1/10にすると、位が1つずつ動くことを理解し、正しく求めることができました。', '位の表を使って、10倍や1/10にしたときの数字の動きを正しくとらえることができました。']
    },
    tashizan: {
      s: ['位をそろえて、小数のたし算を正確に計算できました。', '小数のたし算の筆算を、正確に計算できました。'],
      l: ['小数のたし算を、整数と同じように位をそろえて筆算し、正確に計算することができました。', 'くり上がりのある小数のたし算も、位をそろえて筆算し、正確に計算することができました。']
    },
    hikizan: {
      s: ['位をそろえて、小数のひき算を正確に計算できました。', '小数のひき算の筆算を、正確に計算できました。'],
      l: ['小数のひき算を、整数と同じように位をそろえて筆算し、正確に計算することができました。', 'くり下がりのある小数のひき算も、位をそろえて筆算し、正確に計算することができました。']
    },
    kimari: {
      s: ['計算のきまりを使って、くふうして計算できました。', '計算のきまりを生かして、計算をくふうできました。'],
      l: ['小数のたし算でも計算のきまりが成り立つことに気づき、くふうして計算することができました。', '計算のきまりを使って、たす順番をかえるなど、くふうして計算することができました。']
    }
  };
  // 時の内容（所見で使う言い方。題名には「少ない」などの語が入るので、所見では使わない）
  var LESSON_CONTENT = {
    1: ['0.01の何こ分ではしたを表すこと', 'ますの図'], 2: ['長さのはしたを小数で表すこと', '数直線'], 3: ['0.001の何こ分ではしたを表すこと', 'ますの図'],
    4: ['小数の位の名前', '位の表'], 5: ['小数の大小のくらべ方', '数直線'], 6: ['10倍や1/10の大きさ', '位の表'], 7: ['小数のたし算', '筆算'],
    8: ['小数のひき算', '筆算'], 9: ['計算のきまり', '式'], 10: ['小数のまとめの問題', '図や表']
  };
  function goodFacts(m, ev) {
    var f = [], t = tagAcc(m), th = settings();
    var tags = Object.keys(t).filter(function (k) { return t[k].n >= 3 && t[k].acc >= 0.8; }).sort(function (a, b) { return t[b].acc - t[a].acc || t[b].n - t[a].n; });
    tags.slice(0, 2).forEach(function (k) { f.push({ key: 'tag-' + k, s: TAG_GOOD[k].s, l: TAG_GOOD[k].l }); });
    var tp = thinkParts(m);
    if (tp.acc != null && tp.acc >= 0.75 && tp.n >= 5) f.push({ key: 'think', s: ['むずかしい問題にも、進んで挑戦しました。', '考える問題に、筋道を立てて取り組みました。'], l: ['むずかしいレベルの問題やちょうせん問題にも進んで挑戦し、筋道を立てて考えることができました。', '考える問題に粘り強く取り組み、自分の考えを確かめながら答えを導くことができました。'] });
    if (m.make.n) {
      var rich = m.make.story || m.make.fig;
      f.push({ key: 'make', s: [rich ? '小数の文章題を、自分で作ることができました。' : '学習を生かして、小数の問題を作りました。', m.friend.n ? '自分で問題を作り、友だちと解き合いました。' : '自分で小数の問題を作ることができました。'],
        l: [rich ? '学習したことを生かして小数の文章題を作り、図を使って考え方を表すことができました。' : '学習したことを生かして、自分で小数の問題を作り、答えを確かめることができました。', m.friend.n ? '自分で小数の問題を作って友だちと解き合い、いろいろな考え方にふれることができました。' : '小数の問題を自分で作り、どんな問題にすればよいかを考えることができました。'] });
    }
    if (ev.know.score != null && ev.know.score >= th.know.B && m.lessonN >= 10) f.push({ key: 'know', s: ['教科書の問題に、正確に答えることができました。', '小数の意味を、確かに理解することができました。'], l: ['教科書の問題に最初から正確に答えることが多く、小数の意味やしくみを確かに理解することができました。', '一つ一つの時の学習で、小数の意味やしくみを確かめながら、正確に問題を解くことができました。'] });
    // データが少ない子：取り組んだ時の内容から
    var triedL = m.lessons.filter(function (l) { return l.tried; });
    var bestL = triedL.slice().sort(function (a, b) { return (b.first || 0) - (a.first || 0) || a.no - b.no; })[0];
    if (bestL && LESSON_CONTENT[bestL.no]) {
      var lc = LESSON_CONTENT[bestL.no][0], tool = LESSON_CONTENT[bestL.no][1];
      f.push({ key: 'lesson', s: [lc + 'を、' + tool + 'を使って考えました。', lc + 'について、考えることができました。'], l: ['第' + bestL.no + '時の学習では、' + lc + 'を、' + tool + 'を使って考え、確かめることができました。', lc + 'の学習に意欲的に取り組み、' + tool + 'を手がかりにして考えることができました。'] });
    }
    f.push({ key: 'generic', s: ['小数の学習に、意欲をもって取り組みました。', '小数のしくみに関心をもって、学習しました。'], l: ['小数の学習に意欲をもって取り組み、0.1より小さいはしたの表し方について考えることができました。', '小数のしくみに関心をもち、図や数直線を手がかりにして考えることができました。'] });
    return f.slice(0, 4);
  }
  var EXTRA_PHRASE = {
    '友だちに教えた': ['友だちに教えるなど、学びを生かしています。', '友だちに解き方を教えるなど、学んだことを進んで生かそうとしています。'],
    'ノートにまとめた': ['ノートにまとめるなど、学びを整理しています。', '学んだことをノートにまとめ、自分なりに整理しながら学習を進めています。'],
    '家の人に説明した': ['家の人に説明するなど、学びを生かしています。', '学んだことを家の人に説明するなど、自分の言葉で表そうとしています。'],
    '教科書を見直した': ['教科書を見直して、確かめながら学んでいます。', '分からないときは教科書を見直し、自分で確かめながら学習を進めています。'],
    '先生に質問した': ['分からないことを進んで質問しています。', '分からないことをそのままにせず、進んで質問して解決しようとしています。'],
    '友だちに聞いた': ['友だちと考えを伝え合いながら学んでいます。', '友だちと考えを伝え合いながら、分からないところを解決しようとしています。']
  };
  function wayFacts(m) {
    var f = [];
    var pd = m.plan.days;
    if (pd >= 3 && m.plan.done / pd >= 0.6) f.push({ key: 'plan', s: ['自分で計画を立てて、練習に取り組んでいます。', '計画を立てて、こつこつと学習を進めています。'], l: ['自分で計画を立てて練習に取り組み、計画にそって学習を進めることができました。', '毎回の学習の計画を自分で立て、見通しをもって練習を進めています。'] });
    else if (pd >= 2) f.push({ key: 'plan2', s: ['自分で学習の計画を立てて、取り組んでいます。', '毎回、学習の計画を立ててから取り組んでいます。'], l: ['毎回の学習の前に自分で計画を立て、めあてをもって練習に取り組んでいます。', '自分で学習の計画を立て、何をするかを決めてから練習に取り組んでいます。'] });
    var rt = retryOf(m), wrong = rt.wrong, fixed = rt.fixed;
    if (wrong >= 2 && fixed / wrong >= 0.5) f.push({ key: 'retry', s: ['まちがえた問題も、やり直して確実にしています。', 'まちがえた問題をやり直し、確かめています。'], l: ['まちがえた問題もそのままにせず、やり直して確実にできるようにしました。', 'まちがえた問題をやり直し、どこでまちがえたかを確かめながら学習しています。'] });
    if (m.refl.n >= 2 && m.refl.wCount / m.refl.n >= 0.6) f.push({ key: 'reflect', s: ['ふりかえりで、わかったことをまとめています。', '学習のあと、わかったことをふりかえっています。'], l: ['学習のふりかえりで、わかったことやできたことを自分の言葉でまとめています。', '毎回の学習をふりかえり、わかったことやできたことを書きとめています。'] });
    if (m.reflect.useT >= 1) f.push({ key: 'useT', s: ['前回のふりかえりを生かして学習しています。', '前回決めたことを、次の学習に生かしています。'], l: ['前回のふりかえりで決めたことを生かして、次の学習に取り組んでいます。', 'ふりかえりで書いた「次にやりたいこと」を、次の学習で実行しています。'] });
    if (m.matome.n + m.osusume.n >= 2) f.push({ key: 'chosen', s: ['まとめの問題にも、進んで取り組んでいます。', '自分で問題を選んで、進んで練習しています。'], l: ['まとめの問題やおすすめの問題にも、自分から進んで取り組んでいます。', '自分に合った問題を選び、まとめの問題にも進んで取り組んでいます。'] });
    var ex = Object.keys(m.refl.extra).filter(function (k) { return EXTRA_PHRASE[k]; }).sort(function (a, b) { return m.refl.extra[b] - m.refl.extra[a]; })[0];
    if (ex) f.push({ key: 'extra', s: [EXTRA_PHRASE[ex][0], EXTRA_PHRASE[ex][0]], l: [EXTRA_PHRASE[ex][1], EXTRA_PHRASE[ex][1]] });
    f.push({ key: 'generic', s: ['一つ一つの問題に、ていねいに取り組んでいます。', '自分の考えを確かめながら、学習しています。'], l: ['一つ一つの問題にていねいに向き合い、自分の考えを確かめながら学習しています。', '問題をよく読み、図などを手がかりにして、ていねいに考えようとしています。'] });
    return f.slice(0, 4);
  }
  function futureFacts(m, ev) {
    var f = [], th = settings();
    weakSkills(m).slice(0, 2).forEach(function (id) {
      var p = phrase(id);
      f.push({ key: 'weak-' + id, s: [p.nat + 'でも、さらに力がつくことを期待しています。', '今後は、' + p.nat + 'の力がのびることを期待しています。'],
        l: [p.nat + 'でも、' + p.tip + 'ことで、さらに力がつくことを期待しています。', '今後は、' + p.nat + 'で' + p.tip + 'ことを大切にし、さらに確かな力になることを期待しています。'] });
    });
    var cb = calib(m);
    if (m.hintRate != null && m.hintRate >= 0.4) f.push({ key: 'hint', s: ['自分で考える時間を大切にし、さらにのびることを期待しています。', '自分の力で考えることで、さらにのびると期待しています。'], l: ['問題をじっくり読み、自分の力で考える時間を大切にすることで、さらに力がのびることを期待しています。', '手がかりをもとに自分で考えをつくる経験を重ねることで、さらに力がのびることを期待しています。'] });
    if (cb && cb.n >= 2 && cb.bias > 0.2) f.push({ key: 'check', s: ['見直しを大切にすると、さらに力がつくと期待しています。', '答えを見直すことで、さらに確かな力になると期待しています。'], l: ['答えを見直す習慣を身につけることで、できるようになったことがさらに確かな力になることを期待しています。', '解いたあとに答えを確かめる習慣を大切にすることで、さらに確かな力になることを期待しています。'] });
    if (m.speed != null && m.speed >= 1.5) f.push({ key: 'speed', s: ['見通しをもって解く力も、のびることを期待しています。', '時間を意識して解く力も、のびることを期待しています。'], l: ['目安の時間を意識して取り組むことで、確かな力がさらに身につくことを期待しています。', '解き方の見通しをもって取り組むことで、さらに確かな力が身につくことを期待しています。'] });
    if (!m.empty && m.plan.days === 0 && Math.max(m.days, m.tried) >= 2) f.push({ key: 'plan', s: ['計画を立てる力も、さらにのびることを期待しています。', '計画を立てて、学習を進めることを期待しています。'], l: ['学習の計画を自分で立てて進めることで、さらに力がのびていくことを期待しています。', '自分で学習の計画を立て、見通しをもって取り組むことで、さらに力がのびることを期待しています。'] });
    if (m.refl.n >= 2 && m.refl.wCount / m.refl.n < 0.6) f.push({ key: 'refl', s: ['ふりかえりを書くことで、学びが深まると期待しています。', 'わかったことを書くと、学びが深まると期待しています。'], l: ['ふりかえりで、わかったことを自分の言葉で書くことで、学びがさらに深まることを期待しています。', 'わかったことやつまずいたところを書きとめることで、学びがさらに深まることを期待しています。'] });
    var strong = ev.know.score != null && ev.know.score >= th.know.A;
    if (strong || !f.length && !m.empty && m.tried >= th.minLessons) f.push({ key: 'extend', s: ['今後も、むずかしい問題への挑戦を期待しています。', '学んだことを友だちに伝える姿を期待しています。'], l: ['これからも、むずかしい問題に進んで挑戦し、考えをさらに深めていくことを期待しています。', '今後も、学んだことを友だちに説明したり、問題を作ったりして、考えを広げることを期待しています。'] });
    f.push({ key: 'generic', s: ['これからの学習でも、力をのばすことを期待しています。', '今後も、小数の力をさらにのばすことを期待しています。'], l: ['これからも一つ一つの時の学習に取り組み、小数の力を確かなものにしていくことを期待しています。', '今後も、学んだことを生かして、小数の力をさらに確かなものにしていくことを期待しています。'] });
    return f.slice(0, 3);
  }

  function splitSentences(t) { return String(t || '').split('。').map(function (s) { return s.trim(); }).filter(Boolean); }
  function bigrams(s) { var o = {}; for (var i = 0; i < s.length - 1; i++) o[s.substr(i, 2)] = 1; return o; }
  function sim(a, b) { var A = bigrams(a), B = bigrams(b), n = 0, t = 0, k; for (k in A) { t++; if (B[k]) n++; } for (k in B) if (!A[k]) t++; return t ? n / t : 0; }
  function clsTexts(cls) {
    var out = [];
    (Array.isArray(cls) ? cls : cls ? [cls] : []).forEach(function (c) {
      if (typeof c === 'string') out.push(c);
      else if (isObj(c)) ['short', 'long', 'edited', 'text'].forEach(function (k) { if (typeof c[k] === 'string') out.push(c[k]); });
    });
    return out;
  }

  var RANGE = { short: [60, 80], long: [100, 150] };
  function comment(student, opts) {
    opts = isObj(opts) ? opts : {};
    var len = opts.length === 'long' ? 'long' : 'short';
    var variant = Math.max(0, Math.floor(Number(opts.variant) || 0));
    var range = RANGE[len];
    var m = read(student), ev = evaluate(student);
    var goods = goodFacts(m, ev), ways = wayFacts(m), futs = futureFacts(m, ev);
    var key = len === 'long' ? 'l' : 's';
    // 同じ組の所見の文（数える）
    var used = {}, usedList = [];
    clsTexts(opts.cls).forEach(function (t) { splitSentences(t).forEach(function (s) { used[s] = (used[s] || 0) + 1; usedList.push(s); }); });
    function penalty(sents) {
      var p = 0;
      sents.forEach(function (s) {
        var core = s.replace(/。$/, '');
        if (used[core]) p += used[core];
        else if (usedList.length) { var best = 0; for (var i = 0; i < usedList.length; i++) { var x = sim(core, usedList[i]); if (x > best) best = x; } if (best > 0.6) p += 0.5; }
      });
      return p;
    }
    var cands = [], seen = {};
    function add(parts, pref) {
      var text = parts.join('');
      var c = chars(text);
      if (c < range[0] || c > range[1] || seen[text]) return;
      seen[text] = 1;
      cands.push({ text: text, pref: pref, pen: penalty(parts), parts: parts });
    }
    goods.forEach(function (g, gi) {
      g[key].forEach(function (gs, ga) {
        futs.forEach(function (f, fi) {
          f[key].forEach(function (fs, fa) {
            ways.forEach(function (w, wi) {
              w[key].forEach(function (ws, wa) {
                var pref = gi * 3 + fi * 3 + wi * 2 + (ga + wa + fa) * 0.4;
                add([gs, ws, fs], pref);
                if (len === 'long') {
                  // 字数が足りないとき：学び方を2文に
                  ways.forEach(function (w2, wj) {
                    if (wj <= wi || w2.key === 'generic') return;
                    add([gs, ws, w2[key][(wa + wj) % 2], fs], pref + 1.5 + wj);
                  });
                }
              });
            });
          });
        });
      });
    });
    if (!cands.length) return fallback(len, goods, ways, futs);
    cands.sort(function (a, b) { return a.pen - b.pen || a.pref - b.pref; });
    // variant：重なりのいちばん少ない候補の中から（2つ未満なら上位8つから）。文の型が前と同じになりにくいよう、言い方がかわる順に回す
    var low = cands.filter(function (c) { return c.pen === cands[0].pen; });
    var pool = low.length >= 2 ? low.slice(0, 16) : cands.slice(0, 8);
    // 前の variant と同じ文がなるべく少ないものを次に回す（別の言い方を押すたびに、文の組み合わせが大きくかわる）
    var order = [pool[0]], rest = pool.slice(1);
    while (rest.length) {
      var bi = 0, bs = Infinity;
      rest.forEach(function (c, i) {
        var shared = 0;
        order.forEach(function (o, j) { var w = j === order.length - 1 ? 3 : 1; c.parts.forEach(function (p) { if (o.parts.indexOf(p) >= 0) shared += w; }); });
        var sc = shared * 10 + c.pref;
        if (sc < bs) { bs = sc; bi = i; }
      });
      order.push(rest.splice(bi, 1)[0]);
    }
    return order[variant % order.length].text;
  }
  // 組み合わせが1つも範囲に入らないとき（ふつうは起きない）：決まった文で範囲に合わせる
  function fallback(len, goods, ways, futs) {
    var range = RANGE[len], key = len === 'long' ? 'l' : 's';
    var g = goods[goods.length - 1][key][0], w = ways[ways.length - 1][key][0], f = futs[futs.length - 1][key][0];
    var pads = ['これからの学習も楽しみにしています。', '毎時間、ていねいに学習しています。'], mid = '', i = 0;
    while (chars(g + w + mid + f) < range[0] && i < pads.length) mid += pads[i++];
    var t = g + w + mid + f;
    if (chars(t) > range[1]) t = g + f;
    if (chars(t) > range[1]) t = Array.from(t).slice(0, range[1] - 1).join('') + '。';
    return t;
  }

  var Assess = {
    DEFAULTS: DEFAULTS, settings: settings, setSettings: setSettings,
    evaluate: evaluate, support: support, comment: comment,
    read: read, count: chars, RANGE: RANGE, SKILLS: SKILLS,
    _: { tagAcc: tagAcc, weakSkills: weakSkills, calib: calib, thinkParts: thinkParts, hash: hash }
  };
  S.Assess = Assess;
  if (typeof module !== 'undefined' && module.exports) module.exports = Assess;
})((function () {
  var root = typeof window !== 'undefined' ? window : globalThis;
  return (root.Shosu = root.Shosu || {});
})());
