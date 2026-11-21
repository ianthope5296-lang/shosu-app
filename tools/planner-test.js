/* tools/planner-test.js — じぶんで計画（js/planner.js）のテスト。 node tools/planner-test.js */
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

var root = path.join(__dirname, '..');
require(path.join(root, 'js/store.js'));
require(path.join(root, 'js/session.js'));
require(path.join(root, 'js/stars.js'));
require(path.join(root, 'js/generators.js'));
require(path.join(root, 'js/matome.js'));
require(path.join(root, 'js/lessons.js'));
var P = require(path.join(root, 'js/planner.js'));
var S = global.Shosu;

var pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  NG: ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }
function section(t) { console.log('- ' + t); }
function setToday(y, m, d) { P._setClock(function () { return new Date(y, m - 1, d, 9, 0, 0).getTime(); }); }
function reset() {
  ls.clear();
  if (S.Stars && S.Stars._reload) S.Stars._reload();
  P._resetPreset();
  delete global.SHOSU_PRESET;
  delete S.Reflect;
}
function lessonPids(no) {
  var l = S.Lessons.filter(function (x) { return x.no === no; })[0], out = [];
  l.problems.forEach(function (p, i) {
    if (p.type === 'gen') { for (var k = 0; k < (p.count || 1); k++) out.push((p.id || 'p' + i) + '-' + k); }
    else out.push(p.id || 'p' + i);
  });
  return out;
}
function finishLesson(no) { lessonPids(no).forEach(function (pid) { S.Store.record('lesson-' + no, pid, { correct: true }); }); }
function findDay(rm, id) { var r = []; rm.days.forEach(function (d) { if (d.items.indexOf(id) >= 0) r.push(d.date); }); return r; }
function mins(ids) { var m = {}; P.ITEMS().forEach(function (it) { m[it.id] = it.minutes; }); var n = 0; ids.forEach(function (id) { n += m[id] || 0; }); return n; }
function checkCaps(rm, label) {
  rm.days.forEach(function (d) { ok(mins(d.items) <= d.minutes, label + '：' + d.date + ' は ' + d.minutes + '分をこえない（' + mins(d.items) + '分）'); });
}

var G4 = {
  v: 1, id: 'g-test4', name: '小数のテスト', date: '2026-11-28', created: '2026-11-20T08:00:00.000Z',
  classes: [
    { date: '2026-11-24', minutes: 20, lesson: 7 },
    { date: '2026-11-25', minutes: 20, lesson: 8 },
    { date: '2026-11-26', minutes: 20, lesson: 9 },
    { date: '2026-11-27', minutes: 20, lesson: 10 }
  ]
};

section('ITEMS');
reset(); setToday(2026, 11, 21);
var items = P.ITEMS();
eq(items.filter(function (i) { return i.kind === 'lesson'; }).length, 10, '第1〜10時');
eq(items.filter(function (i) { return i.kind === 'review'; }).length, 6, 'ふくしゅう6種');
eq(items.filter(function (i) { return i.kind === 'matome'; }).length, 12, 'まとめ 3レベル×4時間');
eq(items.filter(function (i) { return i.kind === 'make'; }).length, 1, 'もんだいづくり');
var l3 = items.filter(function (i) { return i.id === 'lesson-3'; })[0];
eq(l3.minutes, Math.round(lessonPids(3).length * 0.7), '第3時の目安分＝問題数×0.7');
eq(l3.href, '#/lesson/3', '第3時のリンク');
eq(items.filter(function (i) { return i.id === 'matome-normal-10'; })[0].href, '#/matome', 'まとめのリンク');
eq(items.filter(function (i) { return i.id === 'review-daisho'; })[0].minutes, 8, 'ふくしゅうは約8分');
ok(!l3.done(), 'はじめは第3時は done でない');
finishLesson(3);
l3 = P.ITEMS().filter(function (i) { return i.id === 'lesson-3'; })[0];
ok(l3.done(), '全問○で第3時は done');
eq(l3.stars, { got: 3, max: 3 }, '第3時の星 3/3');
// ふくしゅうはその日にやれば done
var stamp = Date.now().toString(36);
for (var i = 0; i < 10; i++) S.Store.record('review-daisho', 'rv-' + stamp + '-' + i, { correct: true });
var rvd = P.ITEMS().filter(function (i) { return i.id === 'review-daisho'; })[0];
var realToday = (function () { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); })();
ok(rvd.done(realToday), 'ふくしゅう10問をその日にやれば done');
ok(!rvd.done('2020-01-01'), 'ほかの日は done でない');

section('goal / PRESET');
reset(); setToday(2026, 11, 21);
eq(P.goal(), null, 'ゴールがなければ null');
eq(P.draft(), null, 'ゴールがなければ draft は null');
eq(P.roadmap(), null, 'ゴールがなければ roadmap は null');
P.setGoal(G4);
eq(P.goal().id, 'g-test4', 'setGoal で保存');
ok(JSON.parse(ls.getItem('shosu.goal')).id === 'g-test4', "保存先は 'shosu.goal'");
// 新しい PRESET は上書き
reset();
P.setGoal({ id: 'g-old', name: '前のゴール', date: '2026-11-28', classes: [], created: '2026-11-10T00:00:00Z' });
global.SHOSU_PRESET = { goal: { id: 'g-new', name: '新しいゴール', date: '2026-11-30', classes: [], created: '2026-11-15T00:00:00Z' } };
P._resetPreset();
eq(P.goal().id, 'g-new', 'PRESET が新しければ上書き');
// 古い PRESET は上書きしない
reset();
P.setGoal({ id: 'g-code', name: 'コードのゴール', date: '2026-11-28', classes: [], created: '2026-11-18T00:00:00Z' });
global.SHOSU_PRESET = { goal: { id: 'g-app', name: 'アプリのゴール', date: '2026-11-28', classes: [], created: '2026-11-12T00:00:00Z' } };
P._resetPreset();
eq(P.goal().id, 'g-code', 'PRESET が古ければ保存中のまま');
// 保存がなければ PRESET
reset();
global.SHOSU_PRESET = { goal: G4 };
P._resetPreset();
eq(P.goal() && P.goal().id, 'g-test4', '保存がなければ PRESET を使う');

section('draft：授業4回・じぶんの時間なし');
reset(); setToday(2026, 11, 21);
P.setGoal(G4);
var rm = P.draft();
eq(rm.goalId, 'g-test4', 'goalId');
eq(rm.days.map(function (d) { return d.date; }), ['2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'], '授業の日だけ');
ok(rm.days.every(function (d) { return d.type === 'class' && d.minutes === 20; }), '授業の日の分');
eq(findDay(rm, 'lesson-7'), ['2026-11-24'], '第7時は第7時の授業の日');
eq(findDay(rm, 'lesson-8'), ['2026-11-25'], '第8時は第8時の授業の日');
eq(findDay(rm, 'lesson-9'), ['2026-11-26'], '第9時は第9時の授業の日');
eq(findDay(rm, 'lesson-10'), ['2026-11-27'], '第10時は第10時の授業の日');
checkCaps(rm, '授業4回');
ok(rm.days.some(function (d) { return d.items.some(function (x) { return /^matome-normal-/.test(x); }); }), 'まとめモード（ふつう）がある');
eq(rm.days[0].items[0], 'lesson-7', '授業の日は、その時がいちばん先');

section('draft：ゴールの前日にまとめ（じぶんの時間 15分・毎日）');
reset(); setToday(2026, 11, 21);
P.setGoal({ id: 'g-3', name: 'テスト', date: '2026-11-28', created: 'x', classes: [
  { date: '2026-11-24', minutes: 20, lesson: 7 }, { date: '2026-11-25', minutes: 20, lesson: 8 }, { date: '2026-11-26', minutes: 20, lesson: 9 }] });
P.setSettings({ extraMinutes: 15, extraDays: 'everyday' });
rm = P.draft();
var d27 = rm.days.filter(function (d) { return d.date === '2026-11-27'; })[0];
ok(d27 && d27.type === 'self' && d27.minutes === 15, '11/27 はじぶんの時間 15分');
ok(d27 && d27.items.indexOf('matome-normal-15') >= 0, 'ゴールの前日にまとめモード（ふつう）15分');
eq(rm.days.filter(function (d) { return d.type === 'self'; }).map(function (d) { return d.date; }),
  ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-27'], 'じぶんの時間は授業のない日（ゴールの前日まで）');
checkCaps(rm, 'じぶんの時間あり');
ok(rm.days.every(function (d) { return d.date < '2026-11-28'; }), 'ゴールの日は入れない');
// 授業の日は、その時が先（第7・8・9時）。のこりの時は入るいちばん早い日へ
eq(findDay(rm, 'lesson-7'), ['2026-11-24'], '第7時の授業の日は第7時が先');
eq(findDay(rm, 'lesson-1'), ['2026-11-21'], '第1時は今日のじぶんの時間へ');
ok(rm.days.filter(function (d) { return d.type === 'class'; }).every(function (d) { return d.items[0] === 'lesson-' + d.lesson; }), '授業の日のはじめは、その授業の時');
// 先取りしすぎない：第9時は 11/26 より前にない
ok(findDay(rm, 'lesson-9').every(function (d) { return d >= '2026-11-26'; }), '第9時は第9時の授業より前に置かない');
// 第10時（授業の予定なし、第9時の後）は 11/26 より前にない
ok(findDay(rm, 'lesson-10').every(function (d) { return d >= '2026-11-26'; }), '第10時は第9時の授業より前に置かない');
// 番号の順
var order = [];
[1, 2, 3, 4, 5, 6, 10].forEach(function (n) { var fd = findDay(rm, 'lesson-' + n); if (fd.length) order.push(fd[0]); });
ok(order.length >= 5 && order.every(function (d, i) { return i === 0 || d >= order[i - 1]; }), '授業の予定がない時は、番号の順に並ぶ');
var n;
// 入りきらないものは unplaced（どこにも2回入らない）
var all = [];
rm.days.forEach(function (d) { all = all.concat(d.items); });
ok(all.length === new Set(all).size, '同じ学習を2回置かない');
for (n = 1; n <= 10; n++) ok(all.indexOf('lesson-' + n) >= 0 || rm.unplaced.indexOf('lesson-' + n) >= 0, '第' + n + '時は地図か unplaced にある');

section('draft：done の時は置かない・にがてなふくしゅう');
reset(); setToday(2026, 11, 21);
P.setGoal(G4);
P.setSettings({ extraMinutes: 30, extraDays: 'everyday' });
[1, 2, 3, 4, 5, 6].forEach(finishLesson);
S.Session.save('matome-last', { level: 'normal', minutes: 10, weak: { daisho: 0.6, hikizan: 0.3, hyoshikata: 0 } });
rm = P.draft();
eq(findDay(rm, 'lesson-3'), [], '全問○の第3時は置かない');
ok(findDay(rm, 'review-daisho').length === 1, 'にがてな大小のふくしゅうを置く');
ok(findDay(rm, 'review-hikizan').length === 1, 'ひき算のふくしゅうも置く');
ok(findDay(rm, 'review-hikizan')[0] >= findDay(rm, 'lesson-8')[0], 'ひき算のふくしゅうは第8時より後');
checkCaps(rm, 'ふくしゅうあり');
eq(P.weakness().daisho, 0.6, 'weakness に matome-last');

section('draft：今日より前の日は作らない');
reset(); setToday(2026, 11, 25);
P.setGoal({ id: 'g-45', name: 'テスト', date: '2026-11-28', created: 'x', classes: G4.classes.map(function (c) { return { date: c.date, minutes: 45, lesson: c.lesson }; }) });
P.setSettings({ extraMinutes: 10, extraDays: 'weekdays' });
[1, 2, 3, 4, 5, 6].forEach(finishLesson);
rm = P.draft();
ok(rm.days.every(function (d) { return d.date >= '2026-11-25'; }), '11/25 より前の日はない');
ok(findDay(rm, 'lesson-7').length === 1 && findDay(rm, 'lesson-7')[0] >= '2026-11-25', '前の授業の時は今日から置く');
checkCaps(rm, '途中から');
// 平日だけ：土日のじぶんの時間はない（11/28 がゴールなので 11/25〜27 はすべて授業）
reset(); setToday(2026, 11, 20);
P.setGoal({ id: 'g-w', name: 'テスト', date: '2026-11-30', created: 'x', classes: [{ date: '2026-11-24', minutes: 20, lesson: 7 }] });
P.setSettings({ extraMinutes: 10, extraDays: 'weekdays' });
rm = P.draft();
ok(rm.days.every(function (d) { var w = new Date(d.date + 'T00:00:00').getDay(); return d.type === 'class' || (w >= 1 && w <= 5); }), '平日だけ：土日にじぶんの時間はない');
ok(rm.days.some(function (d) { return d.date === '2026-11-20' && d.type === 'self'; }), '金曜はじぶんの時間');

section('roadmap：保存と goal 変更で作り直し');
reset(); setToday(2026, 11, 21);
P.setGoal(G4);
rm = P.roadmap();
ok(rm && rm.goalId === 'g-test4', 'はじめの roadmap は下書き');
ok(JSON.parse(ls.getItem('shosu.plan')).roadmap.goalId === 'g-test4', "'shosu.plan' に保存");
rm.days[0].items = ['make'];
P.saveRoadmap(rm);
eq(P.roadmap().days[0].items, ['make'], '同じゴールの間は手直しが残る');
P.setGoal({ id: 'g-next', name: '次のテスト', date: '2026-12-10', created: '2026-11-21T00:00:00Z', classes: [{ date: '2026-12-01', minutes: 30 }] });
rm = P.roadmap();
eq(rm.goalId, 'g-next', 'goal が変わったら作り直す');
eq(rm.days.map(function (d) { return d.date; }), ['2026-12-01'], '新しいゴールの授業の日');

section('today / savePlan / plan');
reset(); setToday(2026, 11, 24);
P.setGoal(G4);
var td = P.today();
eq(td.type, 'class', '授業の日');
eq(td.minutes, 20, '授業の分');
ok(td.items.indexOf('lesson-7') >= 0, '地図の今日の分がおすすめ');
eq(td.plan, null, 'まだ計画はない');
P.savePlan({ date: '2026-11-24', items: ['lesson-7', 'review-daisho'], meate: { choices: ['筆算の小数点をそろえる', 'a', 'b'], ink: { w: 600, h: 110, strokes: [[{ x: 1.234, y: 2 }, { x: 3, y: 4 }]] } } });
var pl = P.plan('2026-11-24');
eq(pl.items, ['lesson-7', 'review-daisho'], 'plan(date) で読める');
eq(pl.meate.choices.length, 2, 'めあては2つまで');
eq(pl.meate.ink.strokes[0][0].x, 1.2, '手書きは小さくして保存');
eq(P.today().plan.items.length, 2, 'today().plan');
eq(P.roadmap().days[0].items, ['lesson-7', 'review-daisho'], '地図の今日の分もそろえる');
setToday(2026, 11, 22);
td = P.today();
eq(td.type, null, '予定のない日は type null');
eq(td.items, [], '予定のない日は items なし');

section('のこりを回す（carryOver）');
reset(); setToday(2026, 11, 21);
P.setGoal(G4);
P.setSettings({ extraMinutes: 20, extraDays: 'everyday' });
rm = P.roadmap();
var d24 = rm.days.filter(function (d) { return d.date === '2026-11-24'; })[0].items.slice();
ok(d24.length > 0, '11/24 に予定がある');
setToday(2026, 11, 25);
var lo = P.leftovers(P.roadmap());
ok(lo.length >= d24.length, '前の日の終わっていない項目が のこり になる');
ok(lo.every(function (x) { return x.date < '2026-11-25'; }), 'のこりは今日より前の日だけ');
var res = P.carryOver(P.roadmap());
ok(res.moved + res.unplaced === lo.length, 'のこりは全部 回すか unplaced へ');
var after = res.roadmap;
after.days.forEach(function (d) {
  if (d.date < '2026-11-25') ok(d.items.every(function (id) { return lo.every(function (x) { return x.id !== id || x.date !== d.date; }); }), d.date + ' からのこりがなくなる');
});
d24.forEach(function (id) {
  var at = findDay(after, id);
  ok(at.some(function (d) { return d >= '2026-11-25'; }) || after.unplaced.indexOf(id) >= 0, id + ' は今日からの日へ');
});
after.days.filter(function (d) { return d.date >= '2026-11-25'; }).forEach(function (d) { ok(mins(d.items) <= d.minutes, '回したあとも ' + d.date + ' は分をこえない'); });
// 終わったものは回さない
reset(); setToday(2026, 11, 21);
P.setGoal(G4);
rm = P.roadmap();
setToday(2026, 11, 25);
finishLesson(7);
lo = P.leftovers(P.roadmap());
ok(lo.every(function (x) { return x.id !== 'lesson-7'; }), '終わった第7時は のこり にならない');
// 今日ののこりを次の日へ（through = 今日）
res = P.carryOver(P.roadmap(), '2026-11-25');
ok(findDay(res.roadmap, 'lesson-8').every(function (d) { return d > '2026-11-25'; }) || res.roadmap.unplaced.indexOf('lesson-8') >= 0, '今日ののこりを次の日へ回せる');

section('meateCandidates');
reset(); setToday(2026, 11, 21);
var mc = P.meateCandidates(['lesson-7']);
ok(mc.indexOf('筆算の小数点をそろえる') >= 0, '筆算 → 小数点をそろえる');
ok(mc.indexOf('くり上がりに気をつける') >= 0, 'たし算 → くり上がり');
ok(P.meateCandidates(['review-hikizan']).indexOf('くり下がりに気をつける') >= 0, 'ひき算 → くり下がり');
ok(P.meateCandidates(['lesson-2']).indexOf('0.01や0.001の何こ分か考える') >= 0, '表し方 → 何こ分');
ok(P.meateCandidates(['lesson-5']).indexOf('上の位から順にくらべる') >= 0, '大小 → 上の位から');
ok(P.meateCandidates(['lesson-6']).indexOf('位が1つ上がる・下がるを考える') >= 0, '10倍 → 位が上がる');
ok(P.meateCandidates(['matome-normal-10']).indexOf('時間内にさいごまでやる') >= 0, 'まとめ → 時間内に');
ok(mc.indexOf('ヒントを使わずに全問○') >= 0, '共通 → ヒントを使わずに');
ok(!mc.some(function (t) { return /^にがてな/.test(t); }), '記録がなければ「にがてな」は出さない');
S.Session.save('matome-last', { weak: { daisho: 0.5 } });
mc = P.meateCandidates(['lesson-7']);
ok(mc.indexOf('にがてな大小くらべを3問○') >= 0, 'にがてな大小くらべを3問○');
S.Reflect = { nextSuggestions: function () { return ['小数のひき算をもっとやる']; } };
mc = P.meateCandidates(['lesson-7']);
eq(mc[0], '小数のひき算をもっとやる', '前回の「次にやりたいこと」が先頭');
delete S.Reflect;
P.ITEMS().forEach(function (it) {
  P.meateCandidates([it.id]).forEach(function (t) { ok(t.length >= 8 && t.length <= 20, '「' + t + '」は短い言葉'); });
});
eq(P.meateCandidates([]).length >= 1, true, '何もえらばなくても候補がある');

console.error = origErr;
if (errors.length) { console.log('console.error:', errors); fail += errors.length; }
console.log('\nplanner-test: ' + pass + ' 通過, ' + fail + ' 失敗');
process.exit(fail ? 1 : 0);
