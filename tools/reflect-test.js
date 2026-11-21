/* tools/reflect-test.js — YWTふりかえり（js/reflect.js）のテスト。 node tools/reflect-test.js
 * Planner・Share の新しいAPIはスタブを使う（まだない可能性があるため）。 */
'use strict';
var path = require('path');

function makeLS() {
  var d = {}, limit = Infinity;
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) {
      v = String(v);
      if (k === 'shosu.reflect' && v.length > limit) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      d[k] = v;
    },
    removeItem: function (k) { delete d[k]; },
    key: function (i) { return Object.keys(d)[i] || null; },
    get length() { return Object.keys(d).length; },
    clear: function () { d = {}; },
    _limit: function (n) { limit = n; }
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
require(path.join(root, 'js/lessons.js'));
require(path.join(root, 'js/reflect.js'));
var S = global.Shosu, R = S.Reflect, Store = S.Store;

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; origErr('NG: ' + msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }
function has(list, s, msg) { ok(list.indexOf(s) >= 0, msg + '（「' + s + '」がない: ' + JSON.stringify(list) + '）'); }

var DAY = 86400000;
var now = Date.now();
var TODAY = R._.dateKey(new Date(now));
var YDAY = R._.dateKey(new Date(now - DAY));
var TMRW = R._.dateKey(new Date(now + DAY));
function setRec(key, entries) {
  ls.setItem('shosu.rec.' + key, JSON.stringify({ entries: entries }));
  var ks = JSON.parse(ls.getItem('shosu.keys') || '[]');
  if (ks.indexOf(key) < 0) ks.push(key);
  ls.setItem('shosu.keys', JSON.stringify(ks));
}
function e(correct, opt) { opt = opt || {}; return { correct: correct, method: 'auto', hints: opt.hints || 0, n: opt.n || 1, t: opt.t || now }; }

/* ---------- スタブ：Planner ---------- */
var planStub = {
  date: TODAY,
  items: ['lesson-8', 'review-daisho', 'make', 'lesson-9'],
  meate: { choices: ['筆算の小数点をそろえる'], ink: null },
  started: new Date(now).toISOString()
};
S.Planner = {
  ITEMS: function () {
    return [
      { id: 'lesson-8', kind: 'lesson', label: '第8時 小数のひき算', minutes: 15 },
      { id: 'lesson-9', kind: 'lesson', label: '第9時 計算のきまり', minutes: 15 },
      { id: 'lesson-10', kind: 'lesson', label: '第10時 まとめ', minutes: 15 },
      { id: 'review-daisho', kind: 'review', label: 'ふくしゅう「大小」', minutes: 10 },
      { id: 'make', kind: 'make', label: 'もんだいづくり', minutes: 10 }
    ];
  },
  plan: function (d) { return d === TODAY ? planStub : null; },
  roadmap: function () { return { goalId: 'g-1', days: [{ date: TODAY, type: 'class', minutes: 20, items: ['lesson-8'] }, { date: TMRW, type: 'self', minutes: 15, items: ['lesson-10'] }] }; }
};

/* ---------- 1. history の集計 ---------- */
setRec('lesson-8', {
  'L8-08': e(true),                         // 6-0.52 ○
  'L8-02': e(false),                        // ×
  'L8-03': e(true, { n: 2, hints: 1 }),     // やり直して○、ヒント1
  'L8-04': e(true, { t: now - DAY }),       // きのう（数えない）
  'more-abc-0': e(true)                     // もっとれんしゅう
});
setRec('review-daisho', { 'rv-1': e(false), 'rv-2': e(false), 'rv-3': e(true) });
setRec('friend', { 'abcdefgh12345678': e(true) });
setRec('matome', { 'mt-x-0': e(true, { t: now - 3 * DAY }) }); // むかし
Store.mySave({ v: 1, kind: 'hissan', op: '+', a: '1.2', b: '3.4', author: null });
var st = { v: 1, got: { 'lesson-8-try': now, 'lesson-8-half': now, 'lesson-1-try': now - 5 * DAY }, made: {}, friend: {}, present: {}, more: 0, title: 'earth', ev: [] };
ls.setItem('shosu.stars', JSON.stringify(st));
S.Stars._reload();

var hs = R.history(TODAY);
var byId = {};
hs.items.forEach(function (it) { byId[it.itemId] = it; });
ok(!!byId['lesson-8'], 'lesson-8 がある');
eq([byId['lesson-8'].total, byId['lesson-8'].correct, byId['lesson-8'].hints], [3, 2, 1], '第8時：3問中2問○ ヒント1（きのうの分は入らない）');
eq([byId['more-8'].total, byId['more-8'].correct], [1, 1], 'もっとれんしゅうは別の項目');
eq([byId['review-daisho'].total, byId['review-daisho'].correct], [3, 1], 'ふくしゅう大小');
ok(!byId.matome, 'むかしのまとめは入らない');
eq(hs.problems, { total: 8, correct: 5, hints: 1 }, '問題の合計');
eq(hs.stars.length, 2, '今日もらった星は2こ');
eq(hs.made, 1, '作った問題1こ');
eq(hs.friend, 1, 'ともだちの問題1こ');
ok(hs.plan && hs.plan.total === 4 && hs.plan.done === 3 && !hs.plan.allDone, '計画：4こ中3こ（第9時はまだ）' + JSON.stringify(hs.plan && [hs.plan.total, hs.plan.done]));
ok(byId['lesson-9'] && byId['lesson-9'].planned && !byId['lesson-9'].done, '計画にあってやっていない項目は done:false');
ok(byId.make.planned && byId.make.done, 'もんだいづくりは作ったので done');
eq(hs.tags.hikizan, { c: 3, w: 1 }, 'ひき算の○×（もっとれんしゅうも入る）');
eq(hs.tags.daisho, { c: 1, w: 2 }, '大小の○×');
eq(R.history(YDAY).problems.total, 1, 'きのうの分');

// Store.record の t を使う（いま記録したもの）
Store.record('lesson-7', 'L7-08', { correct: true, method: 'auto', hints: 0 });
var hs2 = R.history(TODAY);
ok(hs2.items.some(function (it) { return it.itemId === 'lesson-7' && it.total === 1; }), 'Store.record した問題が今日の履歴に入る');
ls.removeItem('shosu.rec.lesson-7');
ls.setItem('shosu.keys', JSON.stringify(JSON.parse(ls.getItem('shosu.keys')).filter(function (k) { return k !== 'lesson-7'; })));

/* ---------- 2. Y の自動の項目 ---------- */
var meate = hs.plan.meate;
var ys = R._.yAuto(hs, meate);
var yt = ys.map(function (y) { return y.text; });
has(yt, '第8時のれんしゅう 3問中2問○', 'Y：第8時');
has(yt, 'ふくしゅう「大小」 3問中1問○', 'Y：ふくしゅう');
has(yt, 'ヒントを使った：1回', 'Y：ヒント');
has(yt, '星を2こゲット', 'Y：星');
has(yt, '問題を1こ作った', 'Y：作った問題');
has(yt, 'ともだちの問題 1問中1問○', 'Y：ともだちの問題');
has(yt, '今日の計画：4こ中3こできた', 'Y：計画');
var firstNonRel = ys.findIndex(function (y) { return !y.rel; });
ok(firstNonRel < 0 || ys.slice(firstNonRel).every(function (y) { return !y.rel; }), 'めあてに関係するものが上');
ok(ys[0].rel && ys[0].text.indexOf('第8時') === 0, 'いちばん上は計画にある第8時');
var ysNoPlan = R._.yAuto(hs, { choices: ['大小くらべ'], ink: null });
ok(ysNoPlan.filter(function (y) { return y.rel; }).some(function (y) { return y.text.indexOf('大小') >= 0; }), 'めあての言葉（大小）と一致する内容が rel');

/* ---------- 3. W の候補 ---------- */
var ws = R._.wCandidates(hs, meate);
has(ws, '6−0.52 を 6.00−0.52 と考えてできた', 'W：6−0.52');
has(ws, '筆算で小数点をそろえて、ひき算ができた', 'W：ひき算');
has(ws, 'まちがえた問題を、やり直して○にできた', 'W：やり直し');
has(ws, '自分で問題を作れた', 'W：作った');
ok(ws.indexOf('筆算で小数点をそろえて、ひき算ができた') < ws.indexOf('まちがえた問題を、やり直して○にできた'), 'W：めあて（筆算）に関係する候補が上');
ok(ws.length <= 7 && ws.length >= 3, 'W：3〜7こ');
eq(R._.probCandidate({ type: 'hissan', op: '+', a: '4.05', b: '3.1' }), '4.05＋3.1 で、3.1 を 3.10 と考えてできた', 'W：4.05＋3.1');
eq(R._.probCandidate({ type: 'hissan', op: '+', a: '6.87', b: '2.73' }), '6.87＋2.73＝9.6 の、さいごの0を消して書けた', 'W：さいごの0');
eq(R._.probCandidate({ type: 'fill', tag: 'hyoshikata', parts: ['', { a: '1.236' }] }), '小数第三位（0.001の位）まで表せた', 'W：小数第三位');
eq(R._.probCandidate({ type: 'hissan', op: '+', a: '4.25', b: '2.18' }), null, 'W：ふつうの筆算は具体的な候補なし');
var wsEmpty = R._.wCandidates({ items: [], problems: { total: 0, correct: 0, hints: 0 }, tags: {}, _probs: [], made: 0, friendCorrect: 0, stars: [] }, null);
ok(wsEmpty.length >= 2, '記録がない日も候補が出る');

/* ---------- 4. T のおすすめ ---------- */
var ts = R._.tSuggestions(hs, meate, 'single');
var tt = ts.map(function (x) { return x.text; });
has(tt, 'ふくしゅう「大小」で、まちがえたところをやり直す', 'T：×が多い大小');
has(tt, 'のこった 第9時 計算のきまり をやる', 'T：今日のこり');
ok(tt.some(function (t) { return t.indexOf('次の予定') === 0 && t.indexOf('第10時') >= 0; }), 'T：地図の次の予定');
ok(ts.filter(function (x) { return x.text.indexOf('ふくしゅう「大小」') === 0; })[0].item === 'review-daisho', 'T：項目IDつき');
var ts3 = R._.tSuggestions(hs, meate, 'triangle');
eq(ts3[0].text, 'めあて「筆算の小数点をそろえる」に、もう一度ちょうせんする', 'T：△ならめあてのやり直しが先頭');
ok(ts.length <= 6, 'T：6こまで');

/* ---------- 5. 保存・上書き・nextSuggestions ---------- */
var ink = { w: 600, h: 180, strokes: [[{ x: 10, y: 10 }, { x: 50.4, y: 60.6 }]] };
function refl(date, ev, tch, tink, items) {
  return { v: 1, date: date, name: ink, meate: { choices: ['めあてA'], ink: null }, y: { auto: ['a'], extra: ['友だちに教えた'] },
    w: { eval: ev, choices: ['x'], ink: null }, t: { choices: tch, ink: tink || null, items: items || [] }, aid: 'dev1' };
}
ok(R.save(refl(YDAY, 'single', ['第8時をやる'], ink, ['lesson-8'])), '保存できる');
ok(R.save(refl(TODAY, 'double', ['まとめモード'])), '今日も保存');
ok(R.save(refl(TODAY, 'triangle', ['ふくしゅう「大小」'])), '同じ日は上書き');
eq(R.list().length, 2, '2日分');
eq(R.list()[0].date, TODAY, '新しい順');
eq(R.get(TODAY).w.eval, 'triangle', '上書きされた');
eq(R.get(YDAY).t.ink.strokes[0][1], { x: 50, y: 61 }, '手書きの座標は整数に');
ok(typeof R.get(TODAY).saved === 'string', 'saved（ISO）がつく');
eq(R.nextSuggestions(), ['ふくしゅう「大小」'], '直近の T');
eq(R.nextSuggestions(TODAY), ['第8時をやる', '前回書いたこと（手書き）'], '今日より前の T（手書きあり）');
eq(R.lastT(TODAY).items, ['lesson-8'], 'lastT の項目');
ok(R._.usedPrevT(hs, TODAY), '前回の T（第8時）を今日の計画でやった');
planStub.meate = { choices: ['まとめモード'], ink: null };
ok(R._.usedPrevT(R.history(TODAY), TODAY), 'めあてに前回の T を使った');
planStub.meate = meate;
R.save(refl(YDAY, 'single', ['なにか'], null, ['lesson-10']));
ok(!R._.usedPrevT(R.history(TODAY), TODAY), '前回の T をやっていない');
R.save(refl(YDAY, 'single', ['第8時をやる'], ink, ['lesson-8']));

// 名前
ok(R.profileName() === null, '名前はまだない');
R.setProfileName(ink);
eq(R.profileName().strokes.length, 1, '名前を保存');

/* ---------- 6. 壊れたデータ ---------- */
var keep = ls.getItem('shosu.reflect');
ls.setItem('shosu.reflect', '{こわれた');
eq(R.list(), [], 'こわれた JSON');
ls.setItem('shosu.reflect', JSON.stringify([null, 5, 'x', { date: 'きのう' }, { date: TODAY, w: { eval: 'すごい', choices: [1, 'ok', 'ok'] }, t: 'x', name: { w: -1 } }]));
var bl = R.list();
eq(bl.length, 1, '日付のあるものだけ残る');
eq([bl[0].w.eval, bl[0].w.choices, bl[0].t.choices, bl[0].name], [null, ['ok'], [], null], '中身を直す');
ls.setItem('shosu.reflect', JSON.stringify({ a: 1 }));
eq(R.list(), [], '配列でない');
ls.setItem('shosu.reflect.name', '"abc"');
eq(R.profileName(), null, 'こわれた名前');
ls.setItem('shosu.reflect', keep);
ls.setItem('shosu.rec.review-daisho', '{"entries":{"a":null,"b":5,"c":{"correct":true,"t":"x"}}}');
ls.setItem('shosu.stars', '"こわれた"');
S.Stars._reload();
var hb;
try { hb = R.history(TODAY); ok(true, 'こわれた記録でも落ちない'); } catch (er) { ok(false, 'こわれた記録で落ちた ' + er); }
ok(hb && !hb.items.some(function (it) { return it.itemId === 'review-daisho' && it.total; }), 'こわれた記録は数えない');
eq(R.history('2026-13-99').date, TODAY, 'へんな日付は今日');
var oldP = S.Planner;
S.Planner = { plan: function () { throw new Error('x'); }, ITEMS: function () { throw new Error('y'); }, roadmap: function () { return 'bad'; } };
try { var hp = R.history(TODAY); R._.tSuggestions(hp, null, null); ok(hp.plan === null, 'Planner がこわれていても落ちない'); } catch (er) { ok(false, 'Planner で落ちた ' + er); }
delete S.Planner;
try { var hn = R.history(TODAY); ok(hn.plan === null && R._.tSuggestions(hn, null, null).length >= 3, 'Planner がなくても動く（おすすめ3こ以上）'); } catch (er) { ok(false, 'Planner なしで落ちた ' + er); }
S.Planner = oldP;

/* ---------- 7. 容量超過 ---------- */
ls.removeItem('shosu.reflect');
var bigInk = { w: 600, h: 180, strokes: [] };
for (var i = 0; i < 30; i++) { var s0 = []; for (var j = 0; j < 40; j++) s0.push({ x: j * 10, y: i * 5 }); bigInk.strokes.push(s0); }
for (var d = 10; d >= 1; d--) {
  var dd = R._.dateKey(new Date(now - d * DAY));
  var rr = refl(dd, 'single', ['t' + d], bigInk); rr.w.ink = bigInk; R.save(rr);
}
eq(R.list().length, 10, '10日分ほぞん');
var len = ls.getItem('shosu.reflect').length;
ls._limit(Math.floor(len * 0.6));
var r2 = refl(TODAY, 'double', ['きょう'], bigInk); r2.w.ink = bigInk;
var res;
try { res = R.save(r2); ok(true, '容量超過でも落ちない'); } catch (er) { ok(false, '容量超過で落ちた ' + er); }
ok(res === true, '古い手書きをはずして保存できた');
ok(R.get(TODAY) && R.get(TODAY).w.ink, '今日の手書きは残る');
ok(R.list().some(function (x) { return x.date !== TODAY && !x.w.ink; }), '古いものの手書きをはずした');
ls._limit(10);
try { res = R.save(refl(TODAY, 'single', ['もういちど'])); ok(res === false, 'まったく入らないときは false'); } catch (er) { ok(false, '落ちた ' + er); }
eq(R.get(TODAY).t.choices, ['もういちど'], 'このページの間はおぼえている');
ls._limit(Infinity);

/* ---------- 8. ふりかえりボックス ---------- */
R.boxClear();
var a1 = refl(TODAY, 'single', ['A']); a1.aid = 'kid1'; a1.saved = '2026-11-21T01:00:00.000Z';
var a2 = refl(TODAY, 'double', ['B']); a2.aid = 'kid1'; a2.saved = '2026-11-21T03:00:00.000Z';
var a0 = refl(TODAY, 'triangle', ['C']); a0.aid = 'kid1'; a0.saved = '2026-11-21T00:00:00.000Z';
var b1 = refl(TODAY, 'single', ['D']); b1.aid = 'kid2';
var c1 = refl(YDAY, 'single', ['E']); c1.aid = 'kid1';
var rb = R.boxAdd([a1, b1, c1]);
eq([rb.added, rb.updated], [3, 0], 'ボックスに3人分');
rb = R.boxAdd([a2]);
eq([rb.added, rb.updated], [0, 1], '同じ子・同じ日は新しいほうに');
rb = R.boxAdd([a0, a2, null, { bad: 1 }]);
eq([rb.added, rb.updated, rb.same], [0, 0, 2], '古いもの・同じものは入れない');
var bx = R.boxList();
eq(bx.length, 3, 'ボックスは3件');
eq(bx.filter(function (x) { return x.r.aid === 'kid1' && x.r.date === TODAY; })[0].r.w.eval, 'double', '新しいほうが残る');
R.boxRemove(bx[0].key);
eq(R.boxList().length, 2, '1件けす');
R.boxClear();
eq(R.boxList().length, 0, 'ぜんぶけす');
ls.setItem('shosu.reflectBox', '[1,{"r":null},{"r":{"date":"2026-11-20"}}]');
eq(R.boxList().length, 1, 'こわれたボックスの中身を直す');

/* ---------- 9. Share のスタブで、送る・とりこむの形（エンコードの往復） ---------- */
S.Share = {
  encodeReflection: function (r) { return Promise.resolve('R' + Buffer.from(JSON.stringify(r)).toString('base64')); },
  decodeReflection: function (t) { return Promise.resolve(JSON.parse(Buffer.from(t.slice(1), 'base64').toString())); },
  kindOf: function (t) { return t.charAt(0) === 'R' ? 'reflection' : 'problem'; }
};
S.Share.encodeReflection(R._.cleanReflection(refl(YDAY, 'single', ['第8時をやる'], ink))).then(S.Share.decodeReflection).then(function (r) {
  eq(R._.cleanReflection(r).t.choices, ['第8時をやる'], 'コードの往復で中身がのこる');
  done();
});

function done() {
  ok(errors.length === 0, 'console.error なし ' + errors.join(' / '));
  console.log('reflect-test: ' + pass + ' ok, ' + fail + ' NG');
  process.exit(fail ? 1 : 0);
}
