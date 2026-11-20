#!/usr/bin/env node
/* matome-test.js — まとめモードの問題選びのテスト（担当I）
 * 使い方: node tools/matome-test.js
 * 失敗が1つでもあれば終了コード1。
 */
'use strict';
var path = require('path');
var G = require(path.join(__dirname, '..', 'js', 'generators.js'));
var M = require(path.join(__dirname, '..', 'js', 'matome.js'));
var C = require(path.join(__dirname, 'check-lessons.js'));

var fails = [], passed = 0;
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }

// ---------- 約束（CONTRACTS 追加2）----------
ok(JSON.stringify(M.LEVELS) === JSON.stringify([{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }]), 'LEVELS');
ok(JSON.stringify(M.TIMES) === JSON.stringify([5, 10, 15, 20]), 'TIMES');
ok(JSON.stringify(M.TAGS) === JSON.stringify(['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan', 'kimari']), 'TAGS');
ok(typeof M.build === 'function' && typeof M.estimate === 'function', 'build / estimate');
M.TAGS.forEach(function (t) { ok(typeof M.TAG_LABELS[t] === 'string', 'TAG_LABELS ' + t); });

// 問題数の範囲（5分で6〜8問、20分で25〜30問）
var RANGE = { 5: [6, 8], 10: [12, 16], 15: [18, 23], 20: [25, 30] };
var SEEDS = 40;
var counts = {}, typeCount = {}, genCount = {};

M.LEVELS.forEach(function (L) {
  var lv = L.id;
  M.TIMES.forEach(function (min) {
    var ns = [];
    for (var s = 0; s < SEEDS; s++) {
      var where = lv + ' ' + min + '分 seed' + s;
      var r = M.build({ level: lv, minutes: min, rng: C.mulberry32(1000 + s) });
      var ps = r.problems, n = ps.length;
      ns.push(n);
      ok(n >= RANGE[min][0] && n <= RANGE[min][1], where + ': 問題数 ' + n + ' が範囲外 ' + RANGE[min]);
      ok(Array.isArray(r.seconds) && r.seconds.length === n, where + ': seconds の数');
      var sum = r.seconds.reduce(function (a, b) { return a + b; }, 0);
      ok(sum === r.total, where + ': total が seconds の合計でない');
      var maxSec = Math.max.apply(null, r.seconds);
      ok(r.total <= min * 60 + maxSec / 2, where + ': 目安時間をこえすぎ ' + r.total);
      ok(r.total >= min * 60 - maxSec, where + ': 目安時間に足りない ' + r.total);

      var sigs = {}, tagN = {};
      ps.forEach(function (p, i) {
        var w = where + ' #' + (i + 1);
        ok(p.id === 'M-' + (i + 1), w + ': id ' + p.id);
        ok(M.TAGS.indexOf(p.tag) >= 0, w + ': tag ' + p.tag);
        ok(r.seconds[i] === M.estimate(p, lv), w + ': seconds と estimate がちがう');
        var sig = M.signature(p);
        ok(!sigs[sig], w + ': 同じ問題が重なっている');
        sigs[sig] = 1;
        tagN[p.tag] = (tagN[p.tag] || 0) + 1;
        if (i > 0) {
          ok(p.tag !== ps[i - 1].tag, w + ': 同じ内容が続いている ' + p.tag);
          ok(p.src.gen !== ps[i - 1].src.gen, w + ': 同じ生成器が続いている ' + p.src.gen);
        }
        // 問題の形と答え（check-lessons の検査を使う）
        C.checkProblem(w, p);
        C.verifyGen(p.src.gen, p, w, lv);
        C.levelRules(p.src.gen, p, w, lv);
        // レベルの決まり
        if (lv === 'easy') ok(p.type !== 'order', w + ': かんたんにならべかえ');
        if (lv !== 'hard') ok(['wordAdd', 'wordSub', 'threeSum'].indexOf(p.src.gen) < 0, w + ': 文章題・3つの数は むずかしいだけ');
        typeCount[lv] = typeCount[lv] || {};
        typeCount[lv][p.type] = (typeCount[lv][p.type] || 0) + 1;
        genCount[lv] = genCount[lv] || {};
        genCount[lv][p.src.gen] = (genCount[lv][p.src.gen] || 0) + 1;
      });
      // 内容の偏りがない
      var vals = M.TAGS.map(function (t) { return tagN[t] || 0; });
      var mx = Math.max.apply(null, vals), mn = Math.min.apply(null, vals);
      ok(mx - mn <= 2, where + ': 内容が偏っている ' + JSON.stringify(tagN));
      if (n >= 7) ok(mn >= 1 || n < 9, where + ': 出ていない内容がある ' + JSON.stringify(tagN));
      if (n >= 14) ok(mn >= 1, where + ': 出ていない内容がある ' + JSON.stringify(tagN));
    }
    ns.sort(function (a, b) { return a - b; });
    counts[lv + ' ' + min] = ns[0] === ns[ns.length - 1] ? String(ns[0]) : ns[0] + '〜' + ns[ns.length - 1];
  });
});
C.takeErrors().forEach(function (e) { fails.push('問題の検査: ' + e); });

// むずかしいには文章題・3つ以上のならべかえ・3つの数のたし算が出る
['wordAdd', 'wordSub', 'threeSum', 'order'].forEach(function (g) { ok((genCount.hard || {})[g] > 0, 'むずかしいに ' + g + ' が出ない'); });

// ---------- weak（×が多かった内容を少し多めに）----------
function avgTags(level, minutes, weak) {
  var sum = {};
  M.TAGS.forEach(function (t) { sum[t] = 0; });
  for (var s = 0; s < 100; s++) {
    M.build({ level: level, minutes: minutes, weak: weak, rng: C.mulberry32(50000 + s) }).problems.forEach(function (p) { sum[p.tag]++; });
  }
  M.TAGS.forEach(function (t) { sum[t] /= 100; });
  return sum;
}
var weakInfo = [];
[['normal', 20, 'hikizan'], ['easy', 20, 'daisho'], ['hard', 10, 'shikumi']].forEach(function (c) {
  var weak = {}; weak[c[2]] = 1;
  var base = avgTags(c[0], c[1], {}), wk = avgTags(c[0], c[1], weak);
  var others = M.TAGS.filter(function (t) { return t !== c[2]; });
  var otherAvg = others.reduce(function (a, t) { return a + wk[t]; }, 0) / others.length;
  var total = M.TAGS.reduce(function (a, t) { return a + wk[t]; }, 0);
  ok(wk[c[2]] > base[c[2]] * 1.2, c.join(' ') + ': weak で多くならない ' + base[c[2]] + ' → ' + wk[c[2]]);
  ok(wk[c[2]] <= otherAvg * 1.7, c.join(' ') + ': weak が多すぎる ' + wk[c[2]] + ' / ' + otherAvg);
  ok(wk[c[2]] / total <= 0.22, c.join(' ') + ': weak の割合が大きすぎる');
  others.forEach(function (t) { ok(wk[t] >= base[t] * 0.75, c.join(' ') + ': ほかの内容が減りすぎ ' + t); });
  weakInfo.push(c[0] + ' ' + c[1] + '分 ' + c[2] + ' ' + base[c[2]].toFixed(1) + '→' + wk[c[2]].toFixed(1) + '問（ほか平均 ' + otherAvg.toFixed(1) + '）');
});
// 割合が小さいと、ほんの少しだけ
(function () {
  var a = avgTags('normal', 20, {}).kimari, b = avgTags('normal', 20, { kimari: 0.2 }).kimari, c = avgTags('normal', 20, { kimari: 1 }).kimari;
  ok(a <= b && b < c, 'weak の割合に合わせて多くなる ' + a + ' ' + b + ' ' + c);
  var d = avgTags('normal', 20, { kimari: 'x', hikizan: -1 });
  ok(Math.abs(d.kimari - a) < 0.5, 'weak のおかしな値は無視する');
})();

// ---------- 再現・rng ----------
['easy', 'normal', 'hard'].forEach(function (lv) {
  var a = JSON.stringify(M.build({ level: lv, minutes: 10, rng: C.mulberry32(7) }));
  var b = JSON.stringify(M.build({ level: lv, minutes: 10, rng: C.mulberry32(7) }));
  var c = JSON.stringify(M.build({ level: lv, minutes: 10, rng: C.mulberry32(8) }));
  ok(a === b, lv + ': 同じ rng で同じ問題にならない');
  ok(a !== c, lv + ': ちがう rng で同じ問題');
  // rng を渡したら Math.random を使わない
  var orig = Math.random;
  Math.random = function () { throw new Error('Math.random を使った'); };
  try { M.build({ level: lv, minutes: 5, rng: C.mulberry32(9) }); ok(true); }
  catch (e) { ok(false, lv + ': rng を渡しても ' + e.message); }
  finally { Math.random = orig; }
  // JSON にして戻しても同じ（つづきから用に保存できる）
  var r = M.build({ level: lv, minutes: 5, rng: C.mulberry32(10) });
  ok(JSON.stringify(JSON.parse(JSON.stringify(r.problems))) === JSON.stringify(r.problems), lv + ': JSON で保存できない');
});
// rng・weak・minutes 省略でも動く
var r0 = M.build({ level: 'normal', minutes: 5 });
ok(r0.problems.length >= 6 && r0.problems.length <= 8, 'rng 省略');
ok(M.build({}).problems.length > 0, 'opts 省略');
ok(M.estimate({ type: 'hissan', op: '+', a: '1.2', b: '3.4' }, 'easy') < M.estimate({ type: 'hissan', op: '+', a: '1.2', b: '3.4' }, 'hard'), 'estimate のレベル');

// ---------- 結果 ----------
console.log('問題数（' + SEEDS + '通り）:');
M.LEVELS.forEach(function (L) {
  console.log('  ' + L.label + ': ' + M.TIMES.map(function (m) { return m + '分 ' + counts[L.id + ' ' + m] + '問'; }).join('、'));
});
console.log('問題の形: ' + M.LEVELS.map(function (L) {
  var t = typeCount[L.id] || {};
  return L.label + ' ' + Object.keys(t).map(function (k) { return k + ' ' + t[k]; }).join(' ');
}).join(' / '));
console.log('weak: ' + weakInfo.join('、'));
if (fails.length) {
  console.log('\n失敗 ' + fails.length + ' 件:');
  fails.slice(0, 60).forEach(function (f) { console.log('  x ' + f); });
  process.exit(1);
}
console.log('\n' + passed + ' 件の確認に通りました。');
