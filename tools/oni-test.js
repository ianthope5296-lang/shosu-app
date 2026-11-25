#!/usr/bin/env node
/* oni-test.js — 鬼ムズの問題のテスト（追加8・担当U）
 * 使い方: node tools/oni-test.js
 * 4種類 × 500回：形式・答え（別の計算で検算）・ヒント3段・ヒントに答えが出ていない・
 * 数字カードの最大最小・虫食い算の解が1つ・matome.build('oni') の問題数と交互・pointMode。
 * 失敗が1つでもあれば終了コード1。
 */
'use strict';
var path = require('path');
var G = require(path.join(__dirname, '..', 'js', 'generators.js'));
var M = require(path.join(__dirname, '..', 'js', 'matome.js'));
var C = require(path.join(__dirname, 'check-lessons.js'));

var fails = [], passed = 0;
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }
function slots(p) { return (p.parts || []).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return String(x.a); }); }

var NAMES = ['oniAdd', 'oniMulDiv', 'oniMix', 'oniIdea'];
var SKILL = { oniAdd: 'oni-add', oniMulDiv: 'oni-muldiv', oniMix: 'oni-mix', oniIdea: 'oni-idea' };
ok(JSON.stringify(G.oniNames()) === JSON.stringify(NAMES), 'oniNames');
NAMES.forEach(function (n) { ok(G.names().indexOf(n) < 0, n + ' が names() に入っている（教科書・おすすめの生成器と分ける）'); });
ok(G.skillIds().every(function (s) { return !/^oni/.test(s); }), 'skillIds に鬼ムズが入っている');

// ---------- 4種類 × 500回 ----------
var N = 500, kinds = {}, examples = {}, beyondN = {}, cardN = 0, mushiN = 0;
NAMES.forEach(function (name, gi) {
  var rng = C.mulberry32(20261125 + gi * 97), uniq = {};
  kinds[name] = {}; examples[name] = []; beyondN[name] = 0;
  for (var i = 0; i < N; i++) {
    var w = name + ' #' + i, p;
    try { p = G.make(name, rng); } catch (e) { ok(false, w + ': 例外 ' + e.message); continue; }
    // 形式・検算（check-lessons の検査：表示された式・文・カードから BigInt で求めなおす）
    C.checkProblem(w, p);
    C.verifyGen(name, p, w, 'oni');
    C.levelRules(name, p, w, 'oni');
    ok(p.tag === 'oni' && p.src.skill === SKILL[name] && G.skillOf(p) === SKILL[name], w + ': tag / skill');
    ok(Array.isArray(p.hints) && p.hints.length === 3 && p.hints.every(function (h) { return typeof h === 'string' && h.length >= 8; }), w + ': ヒントが3段でない');
    ok(new Set(p.hints).size === 3, w + ': 同じヒントがある');
    ok(typeof p.explain === 'string' && p.explain.length >= 8, w + ': explain');
    // 正解後の説明には答えが出る（説明として答えを示す）
    if (p.type === 'fill') ok(slots(p).every(function (a) { return p.explain.indexOf(a) >= 0; }) || p.src.kind === 'mushikui', w + ': explain に答えがない');
    if (p.beyond) beyondN[name]++;
    // 浮動小数を使っていない（JSON で戻しても同じ・答えは数字と小数点だけ）
    ok(JSON.stringify(JSON.parse(JSON.stringify(p))) === JSON.stringify(p), w + ': JSON');
    // 数字カード：最大・最小・いちばん近い数を、すべての並べ方から求めなおす（ここでも別に）
    if (p.src.kind === 'card') {
      cardN++;
      var vals = C.oniCardValues(p.src.cards, p.src.k), a = C.D(slots(p)[0]);
      var bigger = vals.filter(function (v) { return v > a; }).length, smaller = vals.filter(function (v) { return v < a; }).length;
      ok(vals.some(function (v) { return v === a; }), w + ': カードで作れない数が答え');
      if (p.src.mode === 'max') ok(bigger === 0, w + ': いちばん大きくない');
      if (p.src.mode === 'min') ok(smaller === 0, w + ': いちばん小さくない');
      if (p.src.mode === 'near') {
        var T = C.D(p.src.target), da = a > T ? a - T : T - a;
        ok(vals.every(function (v) { return v === a || (v > T ? v - T : T - v) > da; }), w + ': いちばん近くない／同じ近さがある');
      }
      kinds[name]['card-' + p.src.mode] = (kinds[name]['card-' + p.src.mode] || 0) + 1;
    }
    if (p.src.kind === 'mushikui') {
      mushiN++;
      var pat = p.parts.map(function (x) { return typeof x === 'string' ? x : '?'; }).join('');
      var sols = C.oniMushikuiSolutions(pat);
      ok(sols.length === 1 && sols[0] === slots(p).join(''), w + ': 虫食い算の解が1つに決まらない ' + pat + ' ' + sols.join(','));
      ok(slots(p).length >= 3, w + ': 虫食いの□が少ない');
    }
    var k = p.src.kind + (p.src.sub ? '-' + p.src.sub : '') + (p.src.rule ? '-' + p.src.rule : '');
    kinds[name][k] = (kinds[name][k] || 0) + 1;
    uniq[JSON.stringify([p.q, p.parts, p.options])] = 1;
    if (examples[name].length < 2 && examples[name].every(function (e) { return e.src.kind !== p.src.kind; }) && i % 7 === 3) examples[name].push(p);
  }
  ok(Object.keys(uniq).length >= N * 0.9, name + ': ちがう問題が少ない ' + Object.keys(uniq).length);
  // rng 省略でも動く・同じ rng で同じ問題
  try { G.make(name); ok(true); } catch (e) { ok(false, name + ': rng 省略で例外'); }
  ok(JSON.stringify(G.make(name, C.mulberry32(5))) === JSON.stringify(G.make(name, C.mulberry32(5))), name + ': 再現しない');
  ok(JSON.stringify(G.make(name, C.mulberry32(5), { level: 'hard', skill: 'laws' })) === JSON.stringify(G.make(name, C.mulberry32(5))), name + ': level・skill で問題がかわる');
});
C.takeErrors().forEach(function (e) { fails.push('検査: ' + e); });

// 種類がそろって出る
var NEED = {
  oniAdd: ['mix3', 'mix4', 'intSub', 'add4', 'word'],
  oniMulDiv: ['mul1', 'mul2', 'div', 'wordMul', 'wordDiv'],
  oniMix: ['parenMul', 'kufuMul', 'kufuAdd', 'parenSub', 'kufuSub', 'order', 'divMix', 'boxA', 'boxB', 'boxC', 'boxP', 'boxM'],
  oniIdea: ['card-max', 'card-min', 'card-near', 'mushikui', 'seq-add', 'seq-sub', 'seq-x10', 'seq-x2', 'seq-diff2', 'units-collect2', 'units-tobun', 'units-rev', 'units-countOf', 'units-sumCount', 'choice']
};
NAMES.forEach(function (n) { NEED[n].forEach(function (k) { ok(kinds[n][k] > 0, n + ': ' + k + ' が出ない'); }); });
ok(beyondN.oniMulDiv === N, 'かけ算・わり算はすべて beyond');
ok(beyondN.oniAdd === 0, 'たし算ひき算は beyond でない');
ok(beyondN.oniMix > 0 && beyondN.oniMix < N, 'まじった式は beyond のものと そうでないもの');

// ---------- 検算が まちがいを見つけるか（わざと答えをかえる）----------
(function () {
  var rng = C.mulberry32(77), caught = 0, tried = 0;
  NAMES.forEach(function (name) {
    for (var i = 0; i < 60; i++) {
      var p = G.make(name, rng), bad = JSON.parse(JSON.stringify(p));
      if (bad.type === 'choice') bad.a = bad.options.filter(function (o) { return o !== bad.a; })[0];
      else {
        var sl = bad.parts.filter(function (x) { return x && typeof x === 'object'; });
        var s = sl[sl.length - 1];
        s.a = s.a.length === 1 ? String((Number(s.a) + 1) % 10) : (s.a.slice(0, -1) + String((Number(s.a.slice(-1)) % 9) + 1));
        if (s.a === slots(p)[sl.length - 1]) continue;
      }
      tried++;
      C.verifyGen(name, bad, 'わざと');
      if (C.takeErrors().length) caught++;
    }
  });
  ok(caught === tried, 'まちがった答えを見のがした ' + (tried - caught) + '/' + tried);
  // ヒントに答えを入れると見つかる
  var p = G.make('oniAdd', C.mulberry32(3));
  p.hints[2] += '答えは ' + slots(p)[0] + ' だよ。';
  C.verifyGen('oniAdd', p, 'わざと');
  ok(C.takeErrors().some(function (e) { return /ヒントに答え/.test(e); }), 'ヒントの答えを見のがした');
})();

// ---------- matome.build('oni') ----------
ok(M.LEVELS.some(function (L) { return L.id === 'oni' && L.label === '鬼ムズ'; }), 'LEVELS に鬼ムズ');
ok(M.TAG_LABELS.oni === '鬼ムズ' && M.TAGS.indexOf('oni') < 0, 'TAG_LABELS / TAGS');
var RANGE = { 5: [3, 5], 10: [7, 9], 15: [10, 13], 20: [14, 17] }, buildInfo = [];
M.TIMES.forEach(function (min) {
  var lo = 99, hi = 0;
  for (var s = 0; s < 50; s++) {
    var r = M.build({ level: 'oni', minutes: min, rng: C.mulberry32(9000 + s) }), ps = r.problems;
    lo = Math.min(lo, ps.length); hi = Math.max(hi, ps.length);
    ok(ps.length >= RANGE[min][0] && ps.length <= RANGE[min][1], 'build oni ' + min + '分: 問題数 ' + ps.length);
    ok(r.total <= min * 60 + 45 && r.total >= min * 60 - 90, 'build oni ' + min + '分: 時間 ' + r.total);
    ps.forEach(function (p, i) {
      ok(p.src.gen === NAMES[i % 4], 'build oni: 交互でない ' + i + ' ' + p.src.gen);
      if (i > 0) ok(p.src.gen !== ps[i - 1].src.gen, 'build oni: 同じ種類が続く');
      ok(p.tag === 'oni', 'build oni: tag');
      var dot = p.type === 'fill' && slots(p).some(function (a) { return a.indexOf('.') >= 0; });
      ok(dot ? p.pointMode === 'tap' : p.pointMode === undefined, 'build oni: pointMode');
    });
    if (min >= 10) ok(NAMES.every(function (n) { return ps.some(function (p) { return p.src.gen === n; }); }), 'build oni: 4種類そろわない');
  }
  buildInfo.push(min + '分 ' + (lo === hi ? lo : lo + '〜' + hi) + '問');
});
// むずかしい・ふつうは pointMode が付く、かんたんは付かない
['easy', 'normal', 'hard'].forEach(function (lv) {
  var tap = 0, dotN = 0;
  for (var s = 0; s < 30; s++) {
    M.build({ level: lv, minutes: 20, rng: C.mulberry32(400 + s) }).problems.forEach(function (p) {
      var dot = p.type === 'fill' && slots(p).some(function (a) { return a.indexOf('.') >= 0; });
      if (dot) dotN++;
      if (p.pointMode === 'tap') tap++;
      if (p.pointMode !== undefined) ok(p.pointMode === 'tap' && dot && lv !== 'easy', lv + ': pointMode のつけ方');
      if (p.type === 'hissan') ok(p.pointMode === undefined, lv + ': 筆算に pointMode');
    });
  }
  if (lv === 'easy') ok(tap === 0, 'かんたんに pointMode');
  else ok(tap === dotN && tap > 0, lv + ': 小数点のある fill に pointMode が付かない ' + tap + '/' + dotN);
});

// ---------- 結果 ----------
console.log('鬼ムズ: 4種 × ' + N + '回（カード ' + cardN + '問、虫食い算 ' + mushiN + '問、範囲外 ' + NAMES.map(function (n) { return n + ' ' + beyondN[n]; }).join(' ') + '）');
NAMES.forEach(function (n) { console.log('  ' + n + ': ' + Object.keys(kinds[n]).sort().map(function (k) { return k + ' ' + kinds[n][k]; }).join(', ')); });
console.log('まとめ 鬼ムズ: ' + buildInfo.join('、'));
console.log('\n問題の例:');
function show(p) {
  var body = p.type === 'choice' ? p.q + '　［' + p.options.join(' ／ ') + '］ → ' + p.a
    : (p.q ? p.q + '　' : '') + p.parts.map(function (x) { return typeof x === 'string' ? x : '［' + x.a + '］'; }).join('');
  console.log('  ・' + body + (p.beyond ? '　（範囲外）' : '') + (p.pointMode ? '　（小数点を打つ）' : ''));
  p.hints.forEach(function (h, i) { console.log('      ヒント' + (i + 1) + ': ' + h); });
  console.log('      せつめい: ' + p.explain);
}
NAMES.forEach(function (n) { console.log(' [' + n + ']'); examples[n].forEach(show); });
if (fails.length) {
  console.log('\n失敗 ' + fails.length + ' 件:');
  fails.slice(0, 60).forEach(function (f) { console.log('  x ' + f); });
  process.exit(1);
}
console.log('\n' + passed + ' 件の確認に通りました。');
