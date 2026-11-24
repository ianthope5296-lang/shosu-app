/* tools/assess-test.js — 観点別評価・支援・所見（js/assess.js）のテスト。 node tools/assess-test.js
 * サンプルの子の LearnSummary は js/summary.js（担当Q）の形で作る。項目名のちがう形（n/ok/first など）も1人入れて、読みとりのゆれを確かめる。
 * 最後に、サンプルの子ごとの evaluate・support・comment（短い／長い）を表示する。 */
'use strict';
var path = require('path');
var root = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }

// まず localStorage なし（Node）で読みこむ → 設定はメモリ
delete global.localStorage;
var A = require(path.join(root, 'js/assess.js'));
require(path.join(root, 'js/lessons.js')); // 時の題名・ページ・「みる」を lessons.js に合わせる（無くても動く）

/* ---------- サンプルを作る道具 ---------- */
var SK = A.SKILLS.map(function (s) { return s.id; });
function lessonsOf(spec) { // spec: {no: [tried, firstRate, correctRate]}
  var out = [];
  for (var no = 1; no <= 10; no++) {
    var x = spec[no];
    if (!x) { out.push({ no: no, tried: 0, total: 8, correct: 0, firstRate: null, avgSec: null }); continue; }
    out.push({ no: no, tried: x[0], total: 8, correct: Math.round(x[0] * (x[2] == null ? 1 : x[2])), firstRate: x[1], avgSec: x[3] || 30 });
  }
  return out;
}
function skillsOf(base, over) { // base: {st, acc, sp, n, h}
  var o = {};
  SK.forEach(function (id) { o[id] = Object.assign({}, base, (over || {})[id] || {}); });
  return o;
}
function refl(date, ev, w, t, meate, auto, extra) {
  return { v: 1, date: date, meate: { choices: meate || [], ink: null }, y: { auto: auto || [], extra: extra || [] },
    w: { eval: ev, choices: w || [], ink: null }, t: { choices: t || [], ink: null, items: [] } };
}
function days(n, start) {
  var out = [], d = new Date(2026, 9, start || 1);
  for (var i = 0; i < n; i++) { out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')); d.setDate(d.getDate() + 2); }
  return out;
}
function base(extra) {
  return Object.assign({
    v: 1, at: '2026-11-20T10:00:00.000Z', profile: null,
    matome: { n: 0, q: 0, c: 0, rate: null, fin: 0, lv: { easy: 0, normal: 0, hard: 0 } },
    osusume: { n: 0, q: 0, c: 0, rate: null, fin: 0, min: 0 },
    review: { n: 0, q: 0, c: 0, rate: null }, more: { n: 0, q: 0, c: 0, rate: null },
    make: { n: 0, kinds: {} }, friend: { n: 0, c: 0 }, plan: { days: 0, ok: 0 },
    reflect: { n: 0, ev: { double: 0, single: 0, triangle: 0 }, extra: 0, prevT: 0, w: 0, judged: 0, match: 0 },
    stars: { n: 0, sp: 0, title: '' }, habit: { q: 0, hint: 0, miss: 0, fixed: 0, think: { q: 0, c: 0 } },
    days: 0, min: 0, last: null
  }, extra);
}
function all10(tried, fr, cr) { var s = {}; for (var i = 1; i <= 10; i++) s[i] = [tried, fr, cr]; return s; }

/* ---------- サンプルの子 ---------- */
var D = days(8);
var KIDS = {
  // よくできる子
  top: { profile: { cls: 1, no: 1, name: '青木あお' }, summary: base({
    lessons: lessonsOf(all10(10, 0.9, 1)),
    skills: skillsOf({ st: 'strong', acc: 0.96, sp: 0.85, n: 8, h: 0.03 }),
    matome: { n: 3, q: 45, c: 42, rate: 0.93, fin: 3, lv: { easy: 0, normal: 1, hard: 2 } },
    osusume: { n: 3, q: 36, c: 33, rate: 0.92, fin: 3, min: 30 },
    make: { n: 5, kinds: { hissan: 2, fill: 1, masu: 1, numberline: 1 } }, friend: { n: 6, c: 5 },
    plan: { days: 7, ok: 6 }, reflect: { n: 7, ev: { double: 5, single: 2, triangle: 0 }, extra: 3, prevT: 3, w: 7, judged: 6, match: 6 },
    habit: { q: 170, hint: 0.03, miss: 6, fixed: 6, think: { q: 22, c: 20 } }, days: 9, min: 260
  }), reflections: D.slice(0, 7).map(function (d, i) {
    return refl(d, i < 5 ? 'double' : 'single', ['位をそろえると計算できることがわかった'], ['第' + (i + 2) + '時をやる'], ['第' + (i + 1) + '時をやる'], ['教科書 第' + (i + 1) + '時 8問中8問○'], i === 2 ? ['友だちに教えた'] : []);
  }) },
  // 計算（くり上がり・くり下がり）がにがてな子
  calc: { profile: { cls: 1, no: 2, name: '井上いと' }, summary: base({
    lessons: lessonsOf({ 1: [8, 0.88, 1], 2: [8, 0.88, 1], 3: [8, 0.75, 1], 4: [8, 0.88, 1], 5: [8, 0.75, 1], 6: [8, 0.88, 1], 7: [8, 0.5, 0.88], 8: [8, 0.38, 0.75] }),
    skills: skillsOf({ st: 'soso', acc: 0.85, sp: 1.1, n: 6, h: 0.15 }, {
      'add-carry': { st: 'weak', acc: 0.5, n: 6 }, 'sub-borrow': { st: 'weak', acc: 0.4, n: 7 }, 'sub-multi': { st: 'weak', acc: 0.45, n: 5 },
      'laws': { st: 'unknown', acc: 0, n: 0 }
    }),
    matome: { n: 1, q: 15, c: 10, rate: 0.67, fin: 1, lv: { easy: 0, normal: 1, hard: 0 } },
    plan: { days: 4, ok: 3 }, reflect: { n: 4, ev: { double: 1, single: 2, triangle: 1 }, extra: 0, prevT: 1, w: 3, judged: 3, match: 2 },
    habit: { q: 90, hint: 0.18, miss: 22, fixed: 14, think: { q: 6, c: 4 } }, days: 6, min: 150
  }), reflections: D.slice(0, 4).map(function (d, i) {
    return refl(d, ['single', 'double', 'triangle', 'single'][i], i === 2 ? [] : ['小数の位がわかった'], ['くり下がりのひき算をもう一度'], [], ['教科書 第' + (i + 5) + '時 8問中' + [6, 7, 3, 5][i] + '問○']);
  }) },
  // 計画をよく立てる子
  planner: { profile: { cls: 1, no: 3, name: '上田うみ' }, summary: base({
    lessons: lessonsOf({ 1: [8, 0.88, 1], 2: [8, 0.75, 1], 3: [8, 0.88, 1], 4: [8, 0.75, 1], 5: [8, 0.88, 1], 6: [8, 0.75, 1], 7: [8, 0.88, 1], 8: [8, 0.75, 1], 9: [6, 0.83, 1] }),
    skills: skillsOf({ st: 'soso', acc: 0.82, sp: 1.0, n: 6, h: 0.1 }, { 'cmp-two': { st: 'strong', acc: 0.95, n: 8 }, 'cmp-digits': { st: 'strong', acc: 0.92, n: 8 }, order: { st: 'strong', acc: 0.9, n: 6 } }),
    matome: { n: 2, q: 30, c: 25, rate: 0.83, fin: 2, lv: { easy: 0, normal: 2, hard: 0 } },
    osusume: { n: 3, q: 36, c: 30, rate: 0.83, fin: 3, min: 30 },
    review: { n: 3, q: 24, c: 20, rate: 0.83 },
    make: { n: 2, kinds: { compare: 2 } },
    plan: { days: 8, ok: 7 }, reflect: { n: 8, ev: { double: 2, single: 5, triangle: 1 }, extra: 2, prevT: 4, w: 8, judged: 7, match: 6 },
    habit: { q: 160, hint: 0.1, miss: 25, fixed: 22, think: { q: 14, c: 12 } }, days: 10, min: 300
  }), reflections: D.map(function (d, i) {
    return refl(d, i % 4 === 0 ? 'double' : 'single', ['小数の大きさのくらべ方がわかった'], ['第' + (i + 2) + '時をやる'], ['第' + (i + 1) + '時をやる'], ['教科書 第' + (i + 1) + '時 8問中' + (i % 2 ? 6 : 7) + '問○'], i % 4 === 1 ? ['ノートにまとめた'] : []);
  }) },
  // データが少ない子
  few: { profile: { cls: 1, no: 4, name: '江藤えま' }, summary: base({
    lessons: lessonsOf({ 1: [5, 0.8, 1], 2: [4, 0.75, 1] }),
    skills: skillsOf({ st: 'unknown', acc: 0, sp: null, n: 0, h: 0 }, { 'rep-001': { st: 'soso', acc: 0.8, n: 4 } }),
    reflect: { n: 1, ev: { double: 0, single: 1, triangle: 0 }, extra: 0, prevT: 0, w: 1, judged: 0, match: 0 },
    habit: { q: 9, hint: 0.1, miss: 2, fixed: 2, think: { q: 0, c: 0 } }, days: 2, min: 15
  }), reflections: [] },
  // ヒントが多い子
  hint: { profile: { cls: 1, no: 5, name: '大野おと' }, summary: base({
    lessons: lessonsOf({ 1: [8, 0.63, 0.88], 2: [8, 0.63, 1], 3: [8, 0.5, 0.88], 4: [8, 0.63, 1], 5: [8, 0.75, 1], 6: [8, 0.63, 0.88] }),
    skills: skillsOf({ st: 'soso', acc: 0.7, sp: 1.7, n: 6, h: 0.6 }, { 'rep-0001': { st: 'weak', acc: 0.5, n: 6, h: 0.7 } }),
    plan: { days: 2, ok: 1 }, reflect: { n: 3, ev: { double: 0, single: 2, triangle: 1 }, extra: 0, prevT: 0, w: 1, judged: 2, match: 2 },
    habit: { q: 60, hint: 0.62, miss: 20, fixed: 12, think: { q: 4, c: 2 } }, days: 5, min: 130
  }), reflections: D.slice(0, 3).map(function (d, i) { return refl(d, i ? 'single' : 'triangle', i === 0 ? ['ヒントを見てわかった'] : [], [], [], ['教科書 第' + (i + 1) + '時 8問中5問○']); }) },
  // 自己評価が高すぎる子
  over: { profile: { cls: 1, no: 6, name: '加藤かい' }, summary: base({
    lessons: lessonsOf({ 1: [8, 0.5, 0.75], 2: [8, 0.63, 0.88], 3: [8, 0.5, 0.75], 4: [8, 0.63, 0.75], 5: [8, 0.5, 0.88], 6: [8, 0.63, 0.88], 7: [8, 0.75, 0.88] }),
    skills: skillsOf({ st: 'soso', acc: 0.65, sp: 0.8, n: 6, h: 0.1 }, { 'cmp-digits': { st: 'weak', acc: 0.4, n: 6 }, 'times100': { st: 'weak', acc: 0.5, n: 5 } }),
    osusume: { n: 2, q: 24, c: 15, rate: 0.63, fin: 1, min: 20 },
    plan: { days: 3, ok: 2 }, reflect: { n: 5, ev: { double: 5, single: 0, triangle: 0 }, extra: 0, prevT: 1, w: 4, judged: 5, match: 1 },
    habit: { q: 90, hint: 0.1, miss: 30, fixed: 15, think: { q: 8, c: 4 } }, days: 6, min: 110
  }), reflections: D.slice(0, 5).map(function (d, i) { return refl(d, 'double', i === 4 ? [] : ['ぜんぶできた'], ['第' + (i + 2) + '時をやる'], i === 1 ? ['第2時をやる'] : [], ['教科書 第' + (i + 1) + '時 8問中' + [4, 5, 4, 5, 4][i] + '問○']); }) }
};
var NAMES = { top: 'よくできる子', calc: '計算がにがてな子', planner: '計画をよく立てる子', few: 'データが少ない子', hint: 'ヒントが多い子', over: '自己評価が高すぎる子' };

/* ---------- 設定 ---------- */
eq(A.DEFAULTS, { know: { A: 0.9, B: 0.7 }, think: { A: 0.8, B: 0.55 }, attitude: { A: 0.75, B: 0.5 }, minLessons: 6 }, 'DEFAULTS');
eq(A.settings(), A.DEFAULTS, 'はじめは DEFAULTS');
A.setSettings({ know: { A: 0.95 } });
eq(A.settings().know, { A: 0.95, B: 0.7 }, 'setSettings（Node ではメモリ）で一部だけ変わる');
A.setSettings({ know: { B: 2 }, minLessons: 99 });
ok(A.settings().know.B <= A.settings().know.A && A.settings().minLessons === 6, 'おかしな値はまるめる・無視する');
A.setSettings(A.DEFAULTS);
// localStorage があるとき
var store = {};
global.localStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); } };
A.setSettings({ think: { A: 0.85, B: 0.6 } });
ok(JSON.parse(store['shosu.assessSettings']).think.A === 0.85, "localStorage 'shosu.assessSettings' に保存");
eq(A.settings().think, { A: 0.85, B: 0.6 }, 'localStorage から読む');
store = {};
eq(A.settings(), A.DEFAULTS, 'localStorage が空なら DEFAULTS');

/* ---------- evaluate ---------- */
var E = {};
Object.keys(KIDS).forEach(function (k) { E[k] = A.evaluate(KIDS[k]); });
Object.keys(E).forEach(function (k) {
  ['know', 'think', 'attitude'].forEach(function (a) {
    var x = E[k][a];
    ok(x.reasons.length >= 2 && x.reasons.length <= 5, NAMES[k] + ' ' + a + ' の理由は2〜5こ（' + x.reasons.length + '）');
    ok(x.score == null || (x.score >= 0 && x.score <= 1), NAMES[k] + ' ' + a + ' の score は0〜1');
    ok(['A', 'B', 'C', null].indexOf(x.grade) >= 0 && typeof x.enough === 'boolean', NAMES[k] + ' ' + a + ' の形');
  });
});
eq([E.top.know.grade, E.top.think.grade, E.top.attitude.grade], ['A', 'A', 'A'], 'よくできる子は A・A・A');
ok(E.top.know.reasons[0] === '教科書の問題で最初の答えが○ 90%（100問中90問）', 'よくできる子の理由（教科書の問題）: ' + E.top.know.reasons[0]);
ok(E.top.attitude.reasons.indexOf('計画を立てた日 7日、そのうち計画どおり 6日') >= 0, 'よくできる子の理由（計画）');
ok(E.calc.know.grade !== 'A' && E.calc.know.enough, '計算がにがてな子：知識・技能は A でない（' + E.calc.know.grade + '）、材料は足りる');
ok(E.calc.know.reasons.some(function (r) { return /第8時 38%/.test(r); }), '計算がにがてな子：第8時の最初の答えが低いと理由に出る');
ok(E.calc.know.reasons.some(function (r) { return /低い：ひき算/.test(r); }), '計算がにがてな子：技能の低いところ（ひき算）が理由に出る');
eq(E.planner.attitude.grade, 'A', '計画をよく立てる子：態度 A');
ok(E.planner.attitude.reasons[0] === '計画を立てた日 8日、そのうち計画どおり 7日', '計画をよく立てる子：計画の理由 ' + E.planner.attitude.reasons[0]);
ok(E.planner.attitude.score > E.calc.attitude.score && E.planner.attitude.score > E.few.attitude.score, '計画をよく立てる子の態度の点は、ほかの子より高い');
ok(!E.few.know.enough && !E.few.think.enough && !E.few.attitude.enough, 'データが少ない子は enough:false');
ok(E.few.know.grade != null, 'データが少なくても案（grade）は出す');
ok(E.few.know.reasons.some(function (r) { return /材料が少ない/.test(r); }), 'データが少ない子の理由に「材料が少ない」');
ok(E.hint.attitude.reasons.some(function (r) { return /ヒントを使った問題の割合 62%（多め）/.test(r); }), 'ヒントが多い子の理由にヒント');
ok(E.hint.attitude.score < E.planner.attitude.score, 'ヒントが多い子の態度の点は、計画をよく立てる子より低い');
ok(E.over.attitude.reasons.some(function (r) { return /自己評価が高め/.test(r); }), '自己評価が高すぎる子の理由に「自己評価が高め」');
eq(A.evaluate({}).know.grade, null, '何もない子は grade:null');
// 基準を変えると判定が変わる
var before = E.planner.know.grade;
A.setSettings({ know: { A: 0.5, B: 0.4 } });
eq(A.evaluate(KIDS.planner).know.grade, 'A', '基準を下げると A になる（前は ' + before + '）');
A.setSettings(A.DEFAULTS);

// 項目名のちがう形（n/ok/first%・st 'にがて'・evals・Reflection なし）
var alt = { summary: { lessons: [{ n: 10, ok: 10, first: 90 }, { n: 10, ok: 9, first: 80 }, { n: 10, ok: 10, first: 100 }, { n: 10, ok: 10, first: 90 }, { n: 10, ok: 10, first: 90 }, { n: 10, ok: 10, first: 90 }],
  skills: [{ id: 'sub-borrow', status: 'にがて', acc: 40, n: 5 }, { id: 'order', status: 'とくい', acc: 0.9, n: 10 }],
  plan: { days: 5, done: 4 }, reflect: { count: 3, evals: { '◎': 1, '○': 2 }, useT: 1 }, matome: { count: 2, acc: 0.8 } } };
var ea = A.evaluate(alt), ma = A.read(alt);
eq([ma.tried, ma.lessonN, ma.lessonFirstOk], [6, 60, 54], '別の項目名：各時を読む');
eq([ma.skills['sub-borrow'].st, ma.skills['sub-borrow'].acc], ['weak', 0.4], '別の項目名：技能を読む');
eq([ma.plan.days, ma.plan.done, ma.reflect.n, ma.reflect.useT, ma.matome.n], [5, 4, 3, 1, 2], '別の項目名：計画・ふりかえり・まとめ');
ok(ea.know.reasons[0] === '教科書の問題で最初の答えが○ 90%（60問中54問）' && ea.know.enough, '別の項目名でも理由が出る');
ok(A.support(alt).some(function (s) { return s.kind === 'skill' && /第8時/.test(s.text); }), '別の項目名でも支援が出る');
// summary.js の形をそのまま読む（tried は数、total は教科書の問題数）
eq(A.read(KIDS.calc).lessons[7], { no: 8, tried: true, n: 8, ok: 6, firstOk: 3, first: 0.375, sec: 30, hints: null }, 'summary.js の各時の形を読む');

/* ---------- support ---------- */
var SU = {};
Object.keys(KIDS).forEach(function (k) { SU[k] = A.support(KIDS[k]); });
Object.keys(SU).forEach(function (k) {
  ok(SU[k].length >= 3 && SU[k].length <= 5, NAMES[k] + ' の支援は3〜5こ（' + SU[k].length + '）');
  ok(SU[k].every(function (s) { return /^(skill|habit|extend)$/.test(s.kind) && /とよい。$/.test(s.text); }), NAMES[k] + ' の支援は先生向けの文（〜とよい。）');
});
ok(SU.empty = A.support({}), '何もない子でも支援が出る');
ok(A.support({}).length >= 3, '何もない子でも3こ');
var s8 = SU.calc.filter(function (s) { return s.skill === 'sub-borrow'; })[0];
ok(s8 && s8.text === '「ひき算（くり下がりあり）」（第8時・教科書p.45〜46）で、くり下がりのあるひき算で、位をそろえて書く手順の確認が必要。第8時の「みる」（筆算ステップ）を使い、1つずつ確かめるとよい。', '計算がにがてな子：技能名・第8時・ページ・みる教材 ' + (s8 && s8.text));
ok(SU.calc.filter(function (s) { return s.kind === 'skill'; }).length === 2, '計算がにがてな子：にがての技能は2つまで');
ok(SU.top.filter(function (s) { return s.kind === 'extend'; }).length >= 2 && SU.top.some(function (s) { return /ちょうせん/.test(s.text); }) && SU.top.some(function (s) { return /説明する役/.test(s.text); }), 'よくできる子：ちょうせん・説明役');
ok(SU.top.some(function (s) { return /問題づくり/.test(s.text); }), 'よくできる子：問題づくり');
ok(SU.hint.some(function (s) { return s.kind === 'habit' && /ヒント/.test(s.text) && /自分で考える時間/.test(s.text); }), 'ヒントが多い子：ヒントの支援');
ok(SU.hint.some(function (s) { return /目安の時間/.test(s.text); }), 'ヒントが多い子（時間もかかる）：目安の時間');
ok(SU.hint.some(function (s) { return /第3時/.test(s.text) && /ますの図/.test(s.text); }), 'ヒントが多い子：にがての技能（0.001の何こ分・第3時・ますの図）');
ok(SU.over.some(function (s) { return /自己評価/.test(s.text); }), '自己評価が高すぎる子：自己評価の支援');
ok(SU.few.some(function (s) { return /第3時/.test(s.text) && /記録がまだ少ない/.test(s.text); }), 'データが少ない子：次の時（第3時）への声かけ');
ok(!SU.planner.some(function (s) { return /計画/.test(s.text); }), '計画をよく立てる子には計画の支援を出さない');
var noPlan = JSON.parse(JSON.stringify(KIDS.calc)); noPlan.summary.plan = { days: 0, ok: 0 };
ok(A.support(noPlan).some(function (s) { return /計画をまだ立てていない/.test(s.text); }), '計画を立てない子：計画の支援');
var tooMany = JSON.parse(JSON.stringify(KIDS.calc)); tooMany.summary.plan = { days: 6, ok: 1 };
ok(A.support(tooMany).some(function (s) { return /計画が多すぎる/.test(s.text); }), '計画どおりにならない子：計画が多すぎる');
var shortW = JSON.parse(JSON.stringify(KIDS.calc)); shortW.reflections.forEach(function (r) { r.w.choices = []; });
ok(A.support(shortW).some(function (s) { return /一言で書く/.test(s.text); }), 'ふりかえりが短い子：一言で書く練習');

/* ---------- comment ---------- */
var NEG = ['できない', 'できず', 'できません', 'にがて', '苦手', '不十分', '不足', '劣', '悪い', 'だめ', 'ダメ', '少ない', 'おそい', '遅い', 'しない', 'しません', '弱い', 'ミス', '残念', '課題', 'つまずいて', 'まだ'];
function negOf(t) { return NEG.filter(function (w) { return t.indexOf(w) >= 0; }); }
var C = {};
Object.keys(KIDS).concat(['empty']).forEach(function (k) {
  var st = k === 'empty' ? {} : KIDS[k];
  C[k] = {};
  ['short', 'long'].forEach(function (len) {
    var r = A.RANGE[len], texts = [];
    for (var v = 0; v < 6; v++) {
      var t = A.comment(st, { length: len, variant: v });
      texts.push(t);
      var n = A.count(t);
      ok(n >= r[0] && n <= r[1], (NAMES[k] || '何もない子') + ' ' + len + ' v' + v + ' の字数 ' + n + '（' + r[0] + '〜' + r[1] + '）: ' + t);
      ok(!negOf(t).length, (NAMES[k] || '何もない子') + ' にマイナス語なし ' + negOf(t).join(',') + ': ' + t);
      ok(/期待しています。$/.test(t), (NAMES[k] || '何もない子') + ' は「期待しています。」で終わる（よいところ→学び方→期待）');
      ok(!st.profile || t.indexOf(st.profile.name) < 0, '子どもの名前は入れない');
    }
    ok(texts[0] !== texts[1] && texts[1] !== texts[2], (NAMES[k] || '何もない子') + ' ' + len + '：variant で言い回しが変わる');
    C[k][len] = texts;
  });
});
ok(/くり下がり|ひき算/.test(C.calc.long[0]), '計算がにがてな子の長い所見：今後への期待に、くり下がりのあるひき算を前向きに');
ok(/計画/.test(C.planner.long[0]) || /計画/.test(C.planner.short[0]), '計画をよく立てる子の所見に計画');
ok(!/計画を立てて練習|計画にそって/.test(C.few.long[0]), 'データが少ない子の所見に、していない計画のことを書かない');
ok(C.hint.long.concat(C.hint.short).some(function (t) { return /自分の力で考える|自分で考える|考えをつくる/.test(t); }), 'ヒントが多い子の所見（別の言い方のどれか）：自分で考える時間を前向きに');
ok(/見直|確かめる習慣/.test(C.over.long[0]) || /見直|確かめる習慣/.test(C.over.long[1]) || C.over.long.some(function (t) { return /見直|確かめる/.test(t); }), '自己評価が高すぎる子：見直しを前向きに');
ok(/挑戦|説明|広げ/.test(C.top.long.join('')), 'よくできる子：挑戦・説明・広げる期待');
ok(/文章題|問題を作|位をそろえ|0\.01/.test(C.top.long[0]), 'よくできる子：具体的な技能');
ok(A.comment(KIDS.top, { length: 'long', variant: 2 }) === C.top.long[2], '同じ入力なら同じ文（決まった結果）');

// 同じ組で重なりにくい：12人分を出席番号順に、それまでの所見を cls にわたして作る
function classTest(len) {
  var kids = [];
  ['top', 'calc', 'planner', 'few', 'hint', 'over'].forEach(function (k) { kids.push(KIDS[k]); var c = JSON.parse(JSON.stringify(KIDS[k])); c.summary.days += 1; kids.push(c); });
  var withCls = [], noCls = [];
  kids.forEach(function (st) { withCls.push(A.comment(st, { length: len, cls: withCls.slice() })); noCls.push(A.comment(st, { length: len })); });
  function maxDup(list) { var c = {}, mx = 0; list.forEach(function (t) { t.split('。').filter(Boolean).forEach(function (s) { c[s] = (c[s] || 0) + 1; mx = Math.max(mx, c[s]); }); }); return mx; }
  function same(list) { var c = {}; list.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); return Object.keys(c).filter(function (k) { return c[k] > 1; }).length; }
  return { withMax: maxDup(withCls), noMax: maxDup(noCls), withSame: same(withCls), noSame: same(noCls), list: withCls };
}
['short', 'long'].forEach(function (len) {
  var r = classTest(len);
  ok(r.withSame === 0, len + '：同じ組12人で、まったく同じ所見がない（cls あり ' + r.withSame + '、なし ' + r.noSame + '）');
  ok(r.withMax <= 2 && r.withMax <= r.noMax, len + '：同じ組12人で、同じ文は2回まで（cls あり ' + r.withMax + '、なし ' + r.noMax + '）');
  r.list.forEach(function (t) { var n = A.count(t); ok(n >= A.RANGE[len][0] && n <= A.RANGE[len][1], len + ' 組の所見の字数 ' + n); });
});
// cls はオブジェクト（classbook の comment:{short,long}）でもよい
var objCls = [{ short: C.calc.short[0], long: C.calc.long[0] }];
ok(A.comment(KIDS.calc, { length: 'short', cls: objCls }) !== C.calc.short[0], 'cls に {short,long} をわたしても、同じ文をさける');

// ランダムな子 300人：例外なし・字数の範囲・マイナス語なし
function rng(seed) { return function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }
var R = rng(42), bad = 0, badMsg = '';
for (var i = 0; i < 300; i++) {
  var spec = {}, nL = Math.floor(R() * 11);
  for (var no = 1; no <= nL; no++) spec[no] = [1 + Math.floor(R() * 10), R(), 0.5 + R() / 2];
  var ov = {}; SK.forEach(function (id) { if (R() < 0.15) ov[id] = { st: 'weak', acc: R() * 0.6, n: 5 }; });
  var sm = base({ lessons: lessonsOf(spec), skills: skillsOf({ st: R() < 0.5 ? 'soso' : 'strong', acc: 0.6 + R() * 0.4, sp: 0.5 + R() * 1.5, n: Math.floor(R() * 10), h: R() * 0.7 }, ov),
    matome: { n: Math.floor(R() * 4), q: 20, c: Math.floor(R() * 20), rate: R(), fin: 0, lv: { easy: 0, normal: 0, hard: Math.floor(R() * 2) } },
    make: { n: Math.floor(R() * 3), kinds: R() < 0.5 ? { masu: 1 } : { hissan: 2 } }, friend: { n: Math.floor(R() * 4), c: 1 },
    plan: { days: Math.floor(R() * 8), ok: Math.floor(R() * 4) }, reflect: { n: Math.floor(R() * 8), ev: { double: Math.floor(R() * 4), single: 1, triangle: 0 }, extra: 0, prevT: Math.floor(R() * 3), w: Math.floor(R() * 5), judged: 2, match: 1 },
    habit: { q: 50, hint: R() * 0.8, miss: 10, fixed: Math.floor(R() * 10), think: { q: Math.floor(R() * 10), c: Math.floor(R() * 5) } }, days: Math.floor(R() * 10) });
  var st = { summary: sm, reflections: R() < 0.5 ? [] : D.slice(0, Math.floor(R() * 6)).map(function (d) { return refl(d, ['double', 'single', 'triangle'][Math.floor(R() * 3)], R() < 0.5 ? ['わかった'] : [], [], [], ['教科書 8問中' + Math.floor(R() * 9) + '問○']); }) };
  try {
    var e = A.evaluate(st), su = A.support(st);
    if (su.length < 3 || su.length > 5) { bad++; badMsg = 'support ' + su.length; }
    ['short', 'long'].forEach(function (len) {
      var t = A.comment(st, { length: len, variant: Math.floor(R() * 5) }), n = A.count(t);
      if (n < A.RANGE[len][0] || n > A.RANGE[len][1] || negOf(t).length) { bad++; badMsg = len + ' ' + n + ' ' + t; }
    });
    if (['know', 'think', 'attitude'].some(function (a) { return e[a].reasons.length < 2 || e[a].reasons.length > 5; })) { bad++; badMsg = 'reasons'; }
  } catch (x) { bad++; badMsg = String(x && x.stack); }
}
ok(bad === 0, 'ランダムな子300人で、例外なし・範囲内・マイナス語なし ' + badMsg);

/* ---------- 結果と出力例 ---------- */
console.log('assess-test: ' + pass + ' ok, ' + fail + ' NG');
console.log('\n================ 出力例 ================');
Object.keys(KIDS).forEach(function (k) {
  var e = E[k];
  console.log('\n■ ' + NAMES[k]);
  [['know', '知識・技能'], ['think', '思考・判断・表現'], ['attitude', '主体的に学習に取り組む態度']].forEach(function (a) {
    var x = e[a[0]];
    console.log('  ' + a[1] + '：' + (x.grade || '－') + '（' + (x.score == null ? '－' : x.score) + (x.enough ? '' : '・材料が少ない') + '）');
    x.reasons.forEach(function (r) { console.log('     - ' + r); });
  });
  console.log('  支援：');
  SU[k].forEach(function (s) { console.log('     [' + s.kind + '] ' + s.text); });
  console.log('  所見（短い・' + A.count(C[k].short[0]) + '字）：' + C[k].short[0]);
  console.log('  所見（長い・' + A.count(C[k].long[0]) + '字）：' + C[k].long[0]);
  console.log('  別の言い方（長い・' + A.count(C[k].long[1]) + '字）：' + C[k].long[1]);
});
process.exit(fail ? 1 : 0);
