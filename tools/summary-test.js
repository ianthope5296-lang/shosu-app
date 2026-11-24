#!/usr/bin/env node
/* summary-test.js — 学習データのまとめ（js/summary.js）とじぶんのこと（js/profile.js）のテスト（担当Q・追加6）
 * 使い方: node tools/summary-test.js
 * サンプルの記録（各時・もっとれんしゅう・まとめ・おすすめ・ふくしゅう・ともだちの問題・星・計画・ふりかえり・つくった問題）から
 * Summary.build() の数字が正しいこと、JSON が小さいこと、Share でふりかえり・学習のきろくのコードに入ることを確かめる。
 */
'use strict';
var path = require('path');

function makeLS() {
  var d = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) { d[k] = String(v); },
    removeItem: function (k) { delete d[k]; },
    key: function (i) { return Object.keys(d)[i] || null; },
    get length() { return Object.keys(d).length; },
    clear: function () { d = {}; }
  };
}
var ls = makeLS();
global.window = global;
global.localStorage = ls;
var errors = [];
var origErr = console.error;
console.error = function () { errors.push([].slice.call(arguments).join(' ')); };

var fails = [], passed = 0;
function ok(c, msg) { if (c) passed++; else fails.push(msg); }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }

var DAY = 86400000;
var NOW = new Date(2026, 10, 24, 15, 0, 0).getTime();   // 2026-11-24 15:00（ローカル）
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function ymd(t) { var d = new Date(t); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
var D1 = NOW - 2 * DAY, D2 = NOW - DAY, D3 = NOW;
function ent(t, o) { var e = { correct: !!o.c, method: 'auto', hints: o.h || 0, n: o.n || 1, t: t, at: new Date(t).toISOString() }; for (var k in o) if (['c', 'h', 'n'].indexOf(k) < 0) e[k] = o[k]; return e; }
function setRec(key, entries) {
  ls.setItem('shosu.rec.' + key, JSON.stringify({ entries: entries }));
  var ks = JSON.parse(ls.getItem('shosu.keys') || '[]');
  if (ks.indexOf(key) < 0) { ks.push(key); ls.setItem('shosu.keys', JSON.stringify(ks)); }
}

var root = path.join(__dirname, '..');
// 各時の問題IDを知るために、先に教材を読む
require(path.join(root, 'js/store.js'));
require(path.join(root, 'js/session.js'));
require(path.join(root, 'js/generators.js'));
require(path.join(root, 'js/matome.js'));
require(path.join(root, 'js/lessons.js'));
var S = global.Shosu;
var Summary0 = require(path.join(root, 'js/summary.js'));
var L1 = Summary0._.lessonPids(S.Lessons[0]), L7 = Summary0._.lessonPids(S.Lessons[6]);

/* ---------- サンプルの記録 ---------- */
var e1 = {};
e1[L1[0]] = ent(D1, { c: 1, first: true, ms: 20000, type: 'fill', est: 30 });
e1[L1[1]] = ent(D1, { c: 1, first: false, retried: true, n: 2, ms: 40000, type: 'fill', est: 30, h: 1 });
e1[L1[2]] = ent(D2, { c: 0, first: false, ms: 30000, type: 'choice', est: 20 });
e1['more-aa-0'] = ent(D2, { c: 1, type: 'fill' });
e1['more-aa-1'] = ent(D2, { c: 0, type: 'fill' });
e1['more-bb-0'] = ent(D3, { c: 1, type: 'fill' });
setRec('lesson-1', e1);
var e7 = {};
e7[L7[1]] = ent(D3, { c: 1, first: true, ms: 50000, type: 'hissan', est: 60 });
e7[L7[2]] = ent(D3, { c: 1, first: true, type: 'hissan', est: 60 });     // 時間の記録なし
setRec('lesson-7', e7);
setRec('matome', { 'mt-s1-0': ent(D2, { c: 1, tag: 'daisho', type: 'order' }), 'mt-s1-1': ent(D2, { c: 1, tag: 'tashizan' }), 'mt-s1-2': ent(D2, { c: 0, tag: 'kimari' }),
  'mt-s2-0': ent(D3, { c: 1 }), 'mt-s2-1': ent(D3, { c: 0 }) });
setRec('osusume', { 'os-x-0': ent(D3, { c: 1, skill: 'sub-borrow' }), 'os-x-1': ent(D3, { c: 1 }), 'os-x-2': ent(D3, { c: 0 }), 'os-x-3': ent(D3, { c: 1 }) });
setRec('review-hikizan', { 'rv-a-0': ent(D2, { c: 1 }), 'rv-a-1': ent(D2, { c: 0 }), 'rv-b-0': ent(D3, { c: 1 }) });
setRec('friend', { tokA: ent(D3, { c: 1 }), tokB: ent(D3, { c: 0 }) });
ls.setItem('shosu.stars', JSON.stringify({ v: 1, got: {}, made: { h1: 'hissan', h2: 'fill', h3: 'hissan' }, friend: { f1: { c: 1, a: 'x' }, f2: { c: 0, a: 'y' } },
  present: {}, more: 2, title: 'earth', reco: 1,
  ev: [['matome', D2, 'normal:2/3'], ['matome', D3, 'hard:1/2:f'], ['lesson', D1, 1]],
  plan: (function () { var o = {}; o[ymd(D1)] = 1; o[ymd(D2)] = 1; o[ymd(D3)] = 1; return o; })(),
  refl: (function () { var o = {}; o[ymd(D1)] = 2 | 4; o[ymd(D2)] = 1; return o; })() }));
ls.setItem('shosu.my', JSON.stringify([{ id: 'my-1', up: { kind: 'hissan' }, created: D1 }, { id: 'my-2', up: { kind: 'fill' }, created: D2 }]));
ls.setItem('shosu.recommend', JSON.stringify({ results: [{ v: 1, minutes: 10, total: 4, correct: 3 }], prefs: {} }));

require(path.join(root, 'js/stars.js'));
var R = require(path.join(root, 'js/recommend.js'));
require(path.join(root, 'js/reflect.js'));
var P = require(path.join(root, 'js/profile.js'));
var Share = require(path.join(root, 'js/share.js'));
var Summary = S.Summary;

S.Reflect.save({ v: 1, date: ymd(D1), w: { eval: 'double', choices: ['わかった'] }, y: { extra: ['友だちに教えた', 'ノートにまとめた'] }, t: { choices: [] } });
S.Reflect.save({ v: 1, date: ymd(D2), w: { eval: 'triangle', choices: [] }, y: { extra: [] }, t: { choices: [] } });
S.Reflect.save({ v: 1, date: ymd(D3), w: { eval: 'single', choices: [] }, y: { extra: ['先生に質問した'] }, t: { choices: ['ひき算'] } });

/* ---------- 1. プロフィール ---------- */
eq(P.get(), null, 'はじめはプロフィールなし');
eq(Summary.build({ now: NOW }).profile, null, 'プロフィールなしの summary');
P.set({ cls: 1, no: 12, name: '山田花子' });
eq(P.label(), '4年1組 12番 山田花子', 'label');
ok(P.valid({ cls: 9, no: 45, name: 'あ'.repeat(30) }) && !P.valid({ cls: 9, no: 45, name: 'あ'.repeat(31) }), '名前は30字まで');
ok(!P.valid({ cls: 1.5, no: 1, name: 'a' }) && !P.valid({ cls: 1, no: '1', name: 'a' }), '組・番号は整数');

/* ---------- 2. まとめの数字 ---------- */
var sm = Summary.build({ now: NOW });
eq(sm.v, 1, 'v');
eq(sm.profile, { cls: 1, no: 12, name: '山田花子' }, 'profile');
ok(typeof sm.at === 'string' && Date.parse(sm.at) === NOW, 'at');
eq(sm.lessons.length, S.Lessons.length, '各時は' + S.Lessons.length + 'こ');
var l1 = sm.lessons[0];
eq([l1.no, l1.tried, l1.total, l1.correct], [1, 3, L1.length, 2], '第1時：取り組んだ3問・○2');
eq(l1.firstRate, 0.33, '第1時：最初の答えで○ 1/3');
eq(l1.avgSec, 30, '第1時：平均30秒');
var l7 = sm.lessons[6];
eq([l7.tried, l7.correct, l7.firstRate, l7.avgSec], [2, 2, 1, 50], '第7時（時間の記録がない問題は平均に入れない）');
eq([sm.lessons[1].tried, sm.lessons[1].firstRate, sm.lessons[1].avgSec], [0, null, null], '第2時はまだ');
eq(sm.more, { n: 2, q: 3, c: 2, rate: 0.67 }, 'もっとれんしゅう：2回・3問中2');
eq(sm.matome, { n: 2, q: 5, c: 3, rate: 0.6, fin: 1, lv: { easy: 0, normal: 1, hard: 1 } }, 'まとめモード');
eq(sm.osusume, { n: 1, q: 4, c: 3, rate: 0.75, fin: 1, min: 10 }, 'おすすめモード');
eq(sm.review, { n: 2, q: 3, c: 2, rate: 0.67 }, 'ふくしゅう');
eq(sm.make, { n: 3, kinds: { hissan: 2, fill: 1 } }, 'もんだいづくり（星の記録のほうが多いとき）');
eq(sm.friend, { n: 2, c: 1 }, 'ともだちの問題');
eq(sm.plan, { days: 3, ok: 1 }, '計画：3日・計画どおり1日');
eq([sm.reflect.n, sm.reflect.ev, sm.reflect.extra, sm.reflect.prevT, sm.reflect.w], [3, { double: 1, single: 1, triangle: 1 }, 3, 1, 1], 'ふりかえり');
ok(sm.reflect.judged >= 1 && sm.reflect.match <= sm.reflect.judged, '自己評価と結果のくらべ ' + sm.reflect.judged + '/' + sm.reflect.match);
eq(sm.days, 3, '学習した日数');
ok(sm.min >= 4 && sm.min <= 30, '合計時間の目安 ' + sm.min + '分');
eq(sm.last, ymd(D3), 'さいごに学習した日');
eq([sm.habit.miss, sm.habit.fixed], [8, 1], '最初の答えが×8問（first の記録がない問題は ○かつ1回目なら最初○）・やり直して○1問');
ok(sm.habit.q === 3 + 3 + 2 + 5 + 4 + 3 + 2, 'ぜんぶの問題数 ' + sm.habit.q);
ok(sm.habit.think.q >= 3, '考える問題（ならべかえ・きまり・ともだちの問題）' + JSON.stringify(sm.habit.think));
eq(Object.keys(sm.skills).length, R.SKILLS.length, '技能は' + R.SKILLS.length + 'こ');
var sb = sm.skills['sub-borrow'];
ok(sb && ['weak', 'soso', 'strong', 'unknown'].indexOf(sb.st) >= 0 && typeof sb.acc === 'number' && sb.n >= 1, '技能の形 ' + JSON.stringify(sb));
var anyUnknown = Object.keys(sm.skills).some(function (k) { return sm.skills[k].st === 'unknown' && sm.skills[k].n === 0; });
ok(anyUnknown, 'まだの技能は unknown・n 0');
ok(typeof sm.stars.n === 'number' && typeof sm.stars.title === 'string' && sm.stars.title, '星と称号 ' + JSON.stringify(sm.stars));

/* ---------- 3. 小さいこと・コードに入ること ---------- */
var json = JSON.stringify(sm);
ok(json.length < 4096, 'JSON は 4KB 未満（' + json.length + ' 文字）');
ok(Share.validateSummary(sm).ok, 'Share の検証に通る ' + Share.validateSummary(sm).error);
var done = 0;
Share.encodeRecord({ profile: P.get(), summary: sm }).then(function (tok) {
  ok(tok.length <= Share.MAX_LEN, '学習のきろくのコードは上限内（' + tok.length + ' 文字）');
  console.log('  学習のきろくのコード: ' + tok.length + ' 文字 / まとめのJSON ' + json.length + ' 文字');
  return Share.decodeRecord(tok);
}).then(function (rec) {
  eq(rec.summary, sm, 'コードの往復で同じ');
  eq(Share.kindOf(rec._token), 'record', 'kindOf は record');
  var r = S.Reflect.forSend(S.Reflect.get(ymd(D3)));
  ok(r.summary && r.profile && r.profile.name === '山田花子', 'ふりかえりの送る形に summary と profile');
  return Share.encodeReflection(r);
}).then(function (tok) {
  ok(tok.length <= Share.MAX_LEN, 'ふりかえり＋まとめのコードは上限内（' + tok.length + ' 文字）');
  console.log('  ふりかえり（手書きなし）＋まとめのコード: ' + tok.length + ' 文字');
  done = 1;
}).catch(function (e) { fails.push('コード: ' + (e && e.stack || e)); }).then(function () {
  /* ---------- 4. 記録がない子 ---------- */
  ls.clear();
  var empty = Summary.build({ now: NOW });
  // （星・ふりかえりはページの中で覚えているので、ここでは Store の記録だけ空にして確かめる）
  eq([empty.days, empty.min, empty.last, empty.matome.q, empty.lessons[0].tried, empty.profile], [0, 0, null, 0, 0, null], '記録がない子でもこわれない');
  ok(Share.validateSummary(empty).ok, '記録がない子の summary も検証に通る');
  ok(done, 'コードの確認まで進んだ');
  ok(errors.length === 0, 'console.error なし ' + errors.join(' / '));
  if (fails.length) { fails.forEach(function (f) { origErr('NG: ' + f); }); }
  console.log('summary-test: ' + passed + ' ok, ' + fails.length + ' NG');
  process.exit(fails.length ? 1 : 0);
});
