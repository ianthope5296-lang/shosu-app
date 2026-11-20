/* tools/stars-test.js — 星と称号（js/stars.js）のテスト。 node tools/stars-test.js */
'use strict';
var path = require('path');

function makeLS() {
  var d = {}, quotaFull = false;
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) {
      if (quotaFull && k === 'shosu.stars') { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      d[k] = String(v);
    },
    removeItem: function (k) { delete d[k]; },
    key: function (i) { return Object.keys(d)[i] || null; },
    get length() { return Object.keys(d).length; },
    clear: function () { d = {}; },
    _setFull: function (b) { quotaFull = b; },
    _d: function () { return d; }
  };
}
var ls = makeLS();
global.window = global;
global.localStorage = ls;
var errors = [];
var origErr = console.error;
console.error = function () { errors.push([].slice.call(arguments).join(' ')); };

var root = path.join(__dirname, '..');
require(path.join(root, 'js/store.js'));
require(path.join(root, 'js/stars.js'));
require(path.join(root, 'js/lessons.js'));
var S = global.Shosu, Stars = S.Stars, Store = S.Store;

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; origErr('NG: ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }
function ids(list) { return list.map(function (s) { return s.id; }); }
function fresh() { ls.clear(); Stars._reload(); }
function lessonLen(no) { return S.Lessons[no - 1].problems.length; }
function solveLesson(no, nOk, nNg) {
  var ps = S.Lessons[no - 1].problems;
  for (var i = 0; i < ps.length && i < nOk + (nNg || 0); i++) Store.record('lesson-' + no, ps[i].id, { correct: i < nOk });
}
// ★を n こ（各時→ふくしゅう→まとめ→もっと の順に）そろえる
function giveNormal(n) {
  var c = 0, k;
  for (var no = 1; no <= 10 && c < n; no++) {
    var len = lessonLen(no);
    if (n - c >= 3) { solveLesson(no, len); c += 3; }
    else if (n - c === 2) { solveLesson(no, Math.ceil(len / 2)); c += 2; }
    else { solveLesson(no, 0, 1); c += 1; }
    Stars.log('lesson', { no: no });
  }
  var tops = ['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan'];
  for (k = 0; k < tops.length && c < n; k++) {
    if (n - c >= 2) { Stars.log('review', { topic: tops[k], total: 10, correct: 10 }); c += 2; }
    else { Stars.log('review', { topic: tops[k], total: 10, correct: 8 }); c += 1; }
  }
  var lv = ['easy', 'normal', 'hard'];
  for (k = 0; k < 3 && c < n; k++) {
    if (n - c >= 3) { Stars.log('matome', { level: lv[k], minutes: 10, total: 10, correct: 10, finished: true }); c += 3; }
    else if (n - c === 2) { Stars.log('matome', { level: lv[k], minutes: 10, total: 10, correct: 9, finished: true }); c += 2; }
    else { Stars.log('matome', { level: lv[k], minutes: 10, total: 10, correct: 2, finished: true }); c += 1; }
  }
  if (c < n) { Stars.log('matome', { level: 'easy', minutes: 20, total: 26, correct: 3, finished: true }); c++; }
  var more = [10, 30, 50];
  for (k = 0; k < 3 && c < n; k++) {
    var cur = Stars._state().more, goal = more[k];
    for (var j = cur; j < goal; j++) Stars.log('more', { correct: true });
    c++;
  }
  eq(Stars.summary().normal, n, '★を' + n + 'こそろえる');
}
function giveAllKinds() {
  ['hissan', 'fill', 'compare', 'masu', 'numberline'].forEach(function (k, i) { Stars.log('made', { kind: k, token: 'tok-made-' + i }); });
  for (var i = 0; i < 10; i++) Stars.log('friend', { token: 'tok-fr-' + i, correct: true, authorKey: 'author-' + (i % 5) });
  Stars.log('present', { token: 'tok-made-0' });
}

/* ---------- カタログと称号 ---------- */
eq(Stars.CATALOG.filter(function (s) { return s.kind === 'normal'; }).length, 55, 'ふつうの星は55こ');
eq(Stars.CATALOG.filter(function (s) { return s.kind === 'special'; }).length, 8, 'とくべつな星は8しゅるい');
eq(Stars.CATALOG.filter(function (s) { return s.group === 'lesson'; }).length, 30, '各時30');
eq(Stars.CATALOG.filter(function (s) { return s.group === 'matome'; }).length, 10, 'まとめ10');
eq(Stars.CATALOG.filter(function (s) { return s.group === 'review'; }).length, 12, 'ふくしゅう12');
eq(Stars.CATALOG.filter(function (s) { return s.group === 'more'; }).length, 3, 'もっと3');
ok(Stars.CATALOG.every(function (s) { return s.id && s.label && s.how && s.group; }), 'すべての星に label と how がある');
var seen = {}; ok(Stars.CATALOG.every(function (s) { if (seen[s.id]) return false; seen[s.id] = 1; return true; }), 'id が重ならない');
eq(Stars.TITLES.length, 8, '称号は8段階');
ok(Stars.TITLES.every(function (t) { return typeof t.icon === 'string' && t.icon.indexOf('<svg') === 0; }), '称号アイコンはSVG');
ok(!/[\u{1F300}-\u{1FAFF}☀-➿⭐★✦]/u.test(require('fs').readFileSync(path.join(root, 'js/stars.js'), 'utf8')), 'stars.js に絵文字・★✦の文字がない');

/* ---------- はじめ ---------- */
fresh();
var sm = Stars.summary();
eq(sm.normal, 0, 'はじめは★0'); eq(sm.title.id, 'earth', 'はじめは地球人'); eq(sm.next.id, 'rocket', '次はロケット');
eq(sm.needForNext.normal, 5, 'ロケットまであと★5');
eq(Stars.evaluate().length, 0, '記録なしの evaluate は0こ');

/* ---------- 各時 ---------- */
fresh();
var len3 = lessonLen(3);
Store.record('lesson-3', S.Lessons[2].problems[0].id, { correct: false });
eq(ids(Stars.log('lesson', { no: 3 })).join(), 'lesson-3-try', '1問やると「とりくんだ」');
solveLesson(3, Math.ceil(len3 / 2) - 1);
eq(Stars.log('lesson', { no: 3 }).length, 0, '半分に足りないうちは増えない');
solveLesson(3, Math.ceil(len3 / 2));
eq(ids(Stars.log('lesson', { no: 3 })).join(), 'lesson-3-half', '半分以上○');
solveLesson(3, len3);
eq(ids(Stars.log('lesson', { no: 3 })).join(), 'lesson-3-all', '全問○');
eq(Stars.log('lesson', { no: 3 }).length, 0, '同じ星は2回もらえない');
eq(Stars.summary().normal, 3, '★3');
// もっとれんしゅうの記録（pid more-）だけでも「とりくんだ」（ホームの☆と同じ）
Store.record('lesson-5', 'more-abc-0', { correct: true });
ok(ids(Stars.log('lesson', { no: 5 })).indexOf('lesson-5-try') >= 0, 'もっとれんしゅうだけでも とりくんだ');
// 一度もらった星は記録が消えても消えない
Store.resetAll();
eq(Stars.summary().normal, 4, '記録を消しても星は消えない');

/* ---------- ふくしゅう ---------- */
fresh();
eq(Stars.log('review', { topic: 'daisho', total: 10, correct: 7 }).length, 0, 'ふくしゅう7問は0');
eq(ids(Stars.log('review', { topic: 'daisho', total: 10, correct: 8 })).join(), 'review-daisho-8', 'ふくしゅう8問');
eq(ids(Stars.log('review', { topic: 'daisho', total: 10, correct: 10 })).join(), 'review-daisho-all', 'ふくしゅう全問');
eq(Stars.log('review', { topic: 'nai', total: 10, correct: 10 }).length, 0, 'ない内容は0');
eq(Stars.log('review', { topic: 'jubai', total: 5, correct: 5 }).length, 0, '10問に足りないと0');

/* ---------- もっとれんしゅう ---------- */
fresh();
for (var i = 0; i < 9; i++) Stars.log('more', { correct: true });
Stars.log('more', { correct: false });
eq(Stars.summary().normal, 0, '○9こでは0');
eq(ids(Stars.log('more', { correct: true })).join(), 'more-10', '○10こ');
for (i = 0; i < 19; i++) Stars.log('more', { correct: true });
eq(ids(Stars.log('more', { correct: true })).join(), 'more-30', '○30こ');

/* ---------- まとめモード ---------- */
fresh();
eq(ids(Stars.log('matome', { level: 'easy', minutes: 5, total: 7, correct: 3, finished: true })).join(), 'matome-easy-finish', 'さいごまで');
eq(ids(Stars.log('matome', { level: 'easy', minutes: 5, total: 7, correct: 6, finished: true })).join(), 'matome-easy-80', '8わり');
eq(Stars.log('matome', { level: 'easy', minutes: 5, total: 7, correct: 7, finished: true }).length, 0, '7問全問○は10問未満なので0');
eq(ids(Stars.log('matome', { level: 'hard', minutes: 20, total: 26, correct: 26, finished: true })).join(), 'matome-hard-finish,matome-hard-80,matome-hard-all,matome-20min', 'むずかしい20分全問○で4こ');
eq(Stars.log('matome', { level: 'normal', minutes: 10, total: 12, correct: 12, finished: false }).map(function (s) { return s.id; }).join(), 'matome-normal-all', 'とちゅうでも10問以上全問○');
eq(Stars.log('matome', { level: 'normal', minutes: 20, total: 4, correct: 4, finished: false }).length, 0, '20分でもとちゅうなら0');

/* ---------- とくべつな星 ---------- */
fresh();
eq(ids(Stars.log('made', { kind: 'hissan', token: 'A' })).join(), 'sp-make1', 'はじめて作った');
eq(Stars.summary().specialTotal, 1, '✦合計1');
Stars.log('made', { kind: 'hissan', token: 'A' });
eq(Stars.summary().specialTotal, 1, '同じ token は1回');
Stars.log('made', { kind: 'fill', token: 'B' }); Stars.log('made', { kind: 'compare', token: 'C' }); Stars.log('made', { kind: 'masu', token: 'D' });
var g = Stars.log('made', { kind: 'numberline', token: 'E' });
eq(ids(g).join(), 'sp-make-kinds,sp-make5', '5しゅるい・5こ');
eq(Stars.summary().specialTotal, 5, '✦合計5');
eq(Stars.log('made', { token: '' }).length, 0, 'token なしは数えない');
eq(Stars.summary().specialTotal, 5, 'token なしは合計にもふくめない');
// 長い token（ハッシュにして保存）
var longTok = '1' + new Array(6000).join('x');
Stars.log('made', { kind: 'hissan', token: longTok });
ok(ls.getItem('shosu.stars').length < 3000, '長い token はハッシュで保存');
eq(Stars.summary().specialTotal, 6, '長い token も1こ');

g = Stars.log('friend', { token: 'F1', correct: false, authorKey: 'p1' });
eq(ids(g).join(), 'sp-friend1', 'はじめて答えた（×でも）');
eq(Stars.summary().specialTotal, 6, '×では合計はふえない');
Stars.log('friend', { token: 'F1', correct: true, authorKey: 'p1' });
eq(Stars.summary().specialTotal, 7, 'やり直して○で+1');
Stars.log('friend', { token: 'F1', correct: true, authorKey: 'p1' });
eq(Stars.summary().specialTotal, 7, '同じ問題の○は1回');
for (i = 2; i <= 4; i++) Stars.log('friend', { token: 'F' + i, correct: true, authorKey: 'p1' });
g = Stars.log('friend', { token: 'F5', correct: true, authorKey: 'p2' });
eq(ids(g).join(), 'sp-friend-ok5', '○5こ');
ok(Stars._state().ev.length > 0, '出来事の記録がある');
for (i = 6; i <= 9; i++) Stars.log('friend', { token: 'F' + i, correct: false, authorKey: 'p' + (i - 3) });
// 作った人 p1,p2,p3,p4,p5,p6 → 6人
var st = Stars._state();
ok(st.got['sp-friend-people5'], 'ちがう人5人分');
eq(!!st.got['sp-friend-ok10'], false, '○10はまだ');
fresh();
for (i = 0; i < 6; i++) Stars.log('friend', { token: 'G' + i, correct: true, authorKey: 'same' });
eq(!!Stars._state().got['sp-friend-people5'], false, '同じ人の問題だけでは5人分にならない');
eq(ids(Stars.log('present', { token: 'P' })).join(), 'sp-present', '発表');
var t0 = Stars.summary().specialTotal;
Stars.log('present', { token: 'P' });
eq(Stars.summary().specialTotal, t0, '同じ発表は1回');

/* ---------- 称号の境目 ---------- */
fresh(); giveNormal(4); eq(Stars.summary().title.id, 'earth', '★4は地球人'); eq(Stars.summary().needForNext.normal, 1, 'あと★1');
fresh(); giveNormal(5); eq(Stars.summary().title.id, 'rocket', '★5はロケット');
fresh(); giveNormal(11); eq(Stars.summary().title.id, 'rocket', '★11はロケット');
fresh(); giveNormal(12); eq(Stars.summary().title.id, 'moon', '★12はムーン');
fresh(); giveNormal(22); eq(Stars.summary().title.id, 'planet', '★22はプラネット');
fresh(); giveNormal(32); eq(Stars.summary().title.id, 'star', '★32はスター');
fresh(); giveNormal(42); eq(Stars.summary().title.id, 'comet', '★42はコメット');
fresh(); giveNormal(50); eq(Stars.summary().title.id, 'comet', '★50でも✦しゅるいがないとコメット');
sm = Stars.summary(); eq(sm.next.id, 'sun', '次はサン'); eq(sm.needForNext.normal, 0, 'サンまで★0'); eq(sm.needForNext.specialKinds, 8, 'サンまで✦しゅるい8');
fresh(); giveNormal(49); giveAllKinds(); eq(Stars.summary().specialKinds, 8, '✦8しゅるい'); eq(Stars.summary().title.id, 'comet', '★49＋全しゅるいはコメット');
fresh(); giveNormal(50); giveAllKinds(); eq(Stars.summary().title.id, 'sun', '★50＋全しゅるいはサン');
sm = Stars.summary(); eq(sm.needForNext.normal, 5, 'ギャラクシーまで★5'); eq(sm.needForNext.specialTotal, 30 - sm.specialTotal, 'ギャラクシーまで✦合計');
// 問題作りだけで✦合計が多くても、しゅるいがそろわないとサンにならない
fresh(); giveNormal(50);
for (i = 0; i < 12; i++) Stars.log('made', { kind: ['hissan', 'fill', 'compare', 'masu', 'numberline'][i % 5], token: 'only-make-' + i });
sm = Stars.summary();
ok(sm.specialTotal >= 8, '問題作りだけで✦合計8以上（' + sm.specialTotal + '）');
eq(sm.specialKinds, 3, '問題作りだけでは✦しゅるいは3');
eq(sm.title.id, 'comet', '問題作りだけではサンにならない');
// ギャラクシー
fresh(); giveNormal(55); giveAllKinds();
eq(Stars.summary().title.id, 'sun', '★55＋全しゅるい＋✦合計16はサン');
for (i = 0; i < 13; i++) Stars.log('made', { kind: 'fill', token: 'gx-' + i });
eq(Stars.summary().specialTotal, 29, '✦29'); eq(Stars.summary().title.id, 'sun', '✦29はサン');
Stars.log('present', { token: 'gx-0' });
eq(Stars.summary().specialTotal, 30, '✦30'); eq(Stars.summary().title.id, 'galaxy', '✦30でギャラクシー');
eq(Stars.summary().next, null, 'ギャラクシーの次はない');
eq(Stars._state().title, 'galaxy', '称号を保存');

/* ---------- 前の記録からの変換 ---------- */
ls.clear(); Stars._reload();
solveLesson(1, lessonLen(1));                 // 全問○ → 3こ
solveLesson(2, 0, 1);                          // とりくんだ → 1こ
for (i = 0; i < 10; i++) Store.record('review-tashizan', 'rv-k1-' + i, { correct: i < 9 });   // 9/10 → 1こ
for (i = 0; i < 6; i++) Store.record('review-hikizan', 'rv-k2-' + i, { correct: true });        // 6問だけ（とちゅう）→ 0
for (i = 0; i < 12; i++) Store.record('lesson-4', 'more-x-' + i, { correct: i < 11 });          // もっと○11 → more-10 と 第4時とりくんだ
ls.setItem('shosu.my', JSON.stringify([{ id: 'my-1', up: { kind: 'masu' } }, { id: 'my-2', up: { kind: 'hissan' } }]));
Stars._reload();
var conv = Stars.evaluate();
eq(conv.filter(function (s) { return s.kind === 'normal'; }).length, 7, '前の記録から★7こ（第1時3・第2時1・第4時1・ふくしゅう1・もっと1）');
ok(ids(conv).indexOf('review-tashizan-8') >= 0 && ids(conv).indexOf('review-hikizan-8') < 0, 'ふくしゅうは10問の回だけ');
ok(ids(conv).indexOf('more-10') >= 0, 'もっと○10');
ok(ids(conv).indexOf('sp-make1') >= 0, 'つくった問題も数える');
eq(Stars.summary().specialTotal, 2, 'つくった問題2こ');
eq(Stars.summary().title.id, 'rocket', '変換でロケット');
eq(Stars.evaluate().length, 0, '2回目の evaluate は0');
// もっとれんしゅう：記録と log を二重に数えない
for (i = 0; i < 11; i++) Stars.log('more', { correct: true });
eq(!!Stars._state().got['more-30'], false, 'もっと：記録と log を二重に数えない');

/* ---------- 壊れた保存データ ---------- */
['{こわれ', 'null', '[]', '123', '"str"', JSON.stringify({ got: 'x', made: [1], friend: { a: 5 }, more: 'abc', title: 'zzz', ev: 'no' }),
  JSON.stringify({ got: { 'lesson-1-try': 'abc', 'nai-star': 1 }, made: { h: 3 }, present: [], ev: [[1], 'x'] })].forEach(function (raw, k) {
  ls.clear(); ls.setItem('shosu.stars', raw);
  var threw = false;
  try {
    Stars._reload();
    var s = Stars.summary();
    Stars.evaluate();
    Stars.log('made', { kind: 'hissan', token: 'z' });
    Stars.log('friend', { token: 'y', correct: true, authorKey: 'q' });
    ok(typeof s.normal === 'number' && s.title && s.title.id, '壊れたデータ' + k + 'でも summary');
    ok(JSON.parse(ls.getItem('shosu.stars')).v === 1, '壊れたデータ' + k + 'のあと保存し直せる');
  } catch (e) { threw = e; }
  ok(!threw, '壊れたデータ' + k + 'で落ちない ' + (threw && threw.stack));
});
// 知らない星 id は消える、時刻がこわれていてももらったまま
ok(Stars._state().got['lesson-1-try'] && !Stars._state().got['nai-star'], '知らない星は消え、知っている星は残る');

/* ---------- 容量超過 ---------- */
fresh();
ls._setFull(true);
var threw2 = false;
try {
  Stars.log('made', { kind: 'hissan', token: 'q1' });
  eq(Stars.summary().specialTotal, 1, '保存できなくても、このページでは数える');
} catch (e) { threw2 = e; }
ok(!threw2, '容量超過で落ちない');
ls._setFull(false);
// localStorage が使えないとき
var saveLS = global.localStorage;
Object.defineProperty(global, 'localStorage', { configurable: true, get: function () { throw new Error('SecurityError'); } });
try { Stars._reload(); Stars.log('present', { token: 'zz' }); ok(Stars.summary().specialTotal >= 1, 'localStorage なしでも動く'); }
catch (e) { ok(false, 'localStorage なしで落ちた ' + e); }
Object.defineProperty(global, 'localStorage', { configurable: true, writable: true, value: saveLS });

/* ---------- onChange ---------- */
fresh();
var calls = 0, off = Stars.onChange(function (s) { calls++; });
Stars.log('made', { kind: 'masu', token: 'oc' });
eq(calls, 1, 'onChange が呼ばれる');
off(); Stars.log('made', { kind: 'masu', token: 'oc2' });
eq(calls, 1, 'onChange の解除');
eq(Stars.log('unknown', {}).length, 0, '知らない type は0');
eq(typeof Stars.needText(), 'string', 'needText');
ok(Stars.needText().indexOf('{') < 0, 'needText は言葉だけ');

eq(errors.length, 0, 'console.error なし ' + errors.join(' | '));
console.log((fail ? 'NG ' : 'OK ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
