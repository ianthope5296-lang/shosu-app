#!/usr/bin/env node
/* recommend-test.js — おすすめモード（js/recommend.js）と技能指定の生成（generators.js）のテスト（担当O）
 * 使い方: node tools/recommend-test.js
 * 記録のサンプル（にがてがはっきりした子・記録が少ない子・全部とくいな子・時間がかかる子・第3時までの子）で
 * profile と build を確かめる。最後に tools/check-lessons.js も実行する。失敗が1つでもあれば終了コード1。
 */
'use strict';
var path = require('path');
var child = require('child_process');

function makeLS() {
  var d = {}, limit = Infinity;
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem: function (k, v) {
      v = String(v);
      if (k === 'shosu.recommend' && v.length > limit) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      d[k] = v;
    },
    removeItem: function (k) { delete d[k]; },
    key: function (i) { return Object.keys(d)[i] || null; },
    get length() { return Object.keys(d).length; },
    clear: function () { d = {}; },
    _limit: function (n) { limit = n; },
    _all: function () { return d; }
  };
}
var ls = makeLS();
global.window = global;
global.localStorage = ls;

var root = path.join(__dirname, '..');
require(path.join(root, 'js/store.js'));
var G = require(path.join(root, 'js/generators.js'));
var M = require(path.join(root, 'js/matome.js'));
require(path.join(root, 'js/lessons.js'));
var R = require(path.join(root, 'js/recommend.js'));
var C = require(path.join(__dirname, 'check-lessons.js'));
var S = global.Shosu;

var fails = [], passed = 0;
function ok(cond, msg) { if (cond) passed++; else fails.push(msg); }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + '（' + JSON.stringify(a) + ' / 期待 ' + JSON.stringify(b) + '）'); }

var BY = {};
R.SKILLS.forEach(function (s) { BY[s.id] = s; });

/* =================== 1. 技能の一覧 =================== */
ok(R.SKILLS.length >= 18 && R.SKILLS.length <= 26, '技能の数 ' + R.SKILLS.length);
eq(R.SKILLS.map(function (s) { return s.id; }).sort(), G.skillIds().sort(), 'SKILLS と generators の技能が同じ');
R.SKILLS.forEach(function (s) {
  var L = S.Lessons.filter(function (l) { return l.no === s.lesson; })[0];
  ok(!!L, s.id + ': lesson がある');
  ok(L && s.page === L.page, s.id + ': page が lessons.js と同じ ' + s.page);
  ok(M.TAGS.indexOf(s.tag) >= 0, s.id + ': tag');
  ok(S.ReviewTopics.some(function (t) { return t.id === s.review; }), s.id + ': review が ReviewTopics にある ' + s.review);
  ok(typeof s.label === 'string' && s.label && typeof s.short === 'string' && s.short, s.id + ': label');
  ok(s.gens.length >= 1 && s.gens.every(function (g) { return G.names().indexOf(g.name) >= 0 && g.opts.skill === s.id; }), s.id + ': gens');
  ok(!s.up || (BY[s.up] && s.up !== s.id && BY[s.up].tag === s.tag || s.up === 'kui'), s.id + ': up');
});
// 教科書の問題の技能
var lessonSkillCount = {};
S.Lessons.forEach(function (L) {
  L.problems.forEach(function (p) {
    var id = R.skillOf(p);
    ok(!!BY[id], p.id + ': 技能が決まる ' + id);
    lessonSkillCount[id] = (lessonSkillCount[id] || 0) + 1;
    ok(BY[id] && BY[id].lessons.indexOf(L.no) >= 0, p.id + ': 技能の lessons に第' + L.no + '時');
  });
});
// 教科書の大小の問題は、どれもけた数がちがう数（cmp-two は生成だけ）
R.SKILLS.forEach(function (s) { ok(lessonSkillCount[s.id] > 0 || s.id === 'cmp-two', s.id + ': 教科書に問題がある'); });
var SPOT = {
  'L1-05': 'rep-001', 'L1-08': 'rep-001', 'L2-02': 'unit-m', 'L2-06': 'kui', 'L2-07': 'numberline', 'L3-02': 'rep-0001',
  'L3-05': 'unit-k', 'L3-03': 'rep-0001', 'L4-02': 'count-units', 'L4-08': 'place-name', 'L4-09': 'compose', 'L4-10': 'kui',
  'L4-11': 'count-units', 'L5-01': 'order', 'L5-02': 'cmp-digits', 'L6-01': 'times10', 'L6-02': 'div10', 'L6-05': 'times100',
  'L7-03': 'add-nocarry', 'L7-02': 'add-carry', 'L7-05': 'add-trail0', 'L7-08': 'add-mis', 'L7-07': 'add-mis', 'L7-01': 'add-nocarry',
  'L8-04': 'sub-noborrow', 'L8-05': 'sub-borrow', 'L8-09': 'sub-multi', 'L8-08': 'sub-int', 'L8-16': 'sub-borrow', 'L8-01': 'sub-noborrow',
  'L9-08': 'laws', 'L10-02': 'kui', 'L10-13': 'sub-int'
};
var lpById = {};
S.Lessons.forEach(function (L) { L.problems.forEach(function (p) { lpById[p.id] = p; }); });
Object.keys(SPOT).forEach(function (pid) { eq(R.skillOf(lpById[pid]), SPOT[pid], 'skillOf ' + pid); });

/* =================== 2. generators の技能指定 =================== */
function dec(s) { var i = String(s).indexOf('.'); return i < 0 ? 0 : String(s).length - i - 1; }
function align(s, e) { var ps = String(s).split('.'), f = ps[1] || ''; while (f.length < e) f += '0'; return parseInt(ps[0] + f, 10); }
function carries(a, b) { var c = 0, k = 0; while (a > 0 || b > 0) { var s = a % 10 + b % 10 + c; c = s >= 10 ? 1 : 0; k += c; a = Math.floor(a / 10); b = Math.floor(b / 10); } return k; }
function borrows(a, b) { var br = 0, k = 0; while (a > 0 || b > 0) { var d = a % 10 - br - b % 10; br = d < 0 ? 1 : 0; k += br; a = Math.floor(a / 10); b = Math.floor(b / 10); } return k; }
function kui(s) { var m = /^(\d+)\.(\d+)$/.exec(s); if (!m) return false; var ip = m[1].replace(/^0+/, ''), f = m[2]; for (var i = 0; i < f.length; i++) if (f[i] === '0' && /[1-9]/.test(ip + f.slice(0, i)) && /[1-9]/.test(f.slice(i + 1))) return true; return false; }
function slots(p) { return (p.parts || []).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return String(x.a); }); }
// 技能の決まりを、generators とは別の書き方で確かめる
function independentCheck(id, p) {
  var e, A, B;
  if (p.type === 'hissan') { e = Math.max(dec(p.a), dec(p.b)); A = align(p.a, e); B = align(p.b, e); }
  switch (id) {
    case 'add-nocarry': return p.op === '+' && dec(p.a) === dec(p.b) && carries(A, B) === 0 && (A + B) % 10 !== 0;
    case 'add-carry': return p.op === '+' && dec(p.a) === dec(p.b) && carries(A, B) > 0 && (A + B) % 10 !== 0;
    case 'add-mis': return p.op === '+' && dec(p.a) !== dec(p.b);
    case 'add-trail0': return p.op === '+' && dec(p.a) === dec(p.b) && e > 0 && (A + B) % 10 === 0;
    case 'sub-noborrow': return p.op === '-' && dec(p.a) > 0 && borrows(A, B) === 0;
    case 'sub-borrow': return p.op === '-' && dec(p.a) > 0 && borrows(A, B) === 1;
    case 'sub-multi': return p.op === '-' && dec(p.a) > 0 && borrows(A, B) >= 2;
    case 'sub-int': return p.op === '-' && dec(p.a) === 0 && dec(p.b) > 0;
    case 'kui': {
      if (p.fig && p.fig.kind === 'masu') return kui(slots(p)[0]);
      var m = /^([\d.]+)は、/.exec(p.parts[0]);
      return kui(m ? m[1] : slots(p)[0]);
    }
    case 'rep-001': return p.fig.kind === 'masu' && p.fig.level === 2 && !kui(slots(p)[0]);
    case 'rep-0001': return p.fig.kind === 'masu' && p.fig.level === 3 && !kui(slots(p)[0]);
    case 'unit-m': return !/\d(km|kg|mm|mL|g)|^(km|kg|mm|mL|g)$/.test(p.parts[0] + '|' + p.parts[2]) && p.parts[2] !== 'km' && p.parts[2] !== 'kg';
    case 'unit-k': return /km|kg|mm|mL|\dg/.test(p.parts[0] + p.parts[2]) || ['km', 'kg', 'g', 'mL', 'mm'].indexOf(p.parts[2]) >= 0;
    case 'numberline': return p.fig && p.fig.kind === 'numberline';
    case 'place-name': return p.type === 'choice' ? /何の位/.test(p.q) : /の(一の位|小数第.位)の数字は/.test(p.parts[0]);
    case 'compose': return p.type === 'fill' && /合わせた数/.test(p.parts.join ? p.parts.filter(function (x) { return typeof x === 'string'; }).join('') : '');
    case 'count-units': return /こ集めた数/.test((p.parts || []).filter(function (x) { return typeof x === 'string'; }).join(''));
    case 'cmp-two': case 'cmp-digits': {
      var mm = /([\d.]+) □ ([\d.]+)$/.exec(p.q);
      return !!mm && (dec(mm[1]) === dec(mm[2])) === (id === 'cmp-two');
    }
    case 'order': return p.type === 'order';
    case 'times10': { var t = (p.q || '') + p.parts.filter(function (x) { return typeof x === 'string'; }).join(''); return /10倍/.test(t) && !/(100|1000)倍|1\/10/.test(t); }
    case 'times100': { var t2 = (p.q || '') + p.parts.filter(function (x) { return typeof x === 'string'; }).join(''); return /(100|1000)倍/.test(t2); }
    case 'div10': { var t3 = (p.q || '') + p.parts.filter(function (x) { return typeof x === 'string'; }).join(''); return /1\/10/.test(t3) && !/(100|1000)倍/.test(t3); }
    case 'laws': return p.tag === 'kimari';
  }
  return false;
}
var genSkillStats = {};
R.SKILLS.forEach(function (s, si) {
  s.gens.forEach(function (g) {
    ['easy', 'normal', 'hard'].forEach(function (lv) {
      var rng = C.mulberry32(9000 + si * 31 + lv.length), kinds = {}, lvSeen = {};
      for (var i = 0; i < 60; i++) {
        var where = 'skill ' + s.id + ' ' + g.name + '[' + lv + '] #' + i;
        var p;
        try { p = G.make(g.name, rng, { level: lv, skill: s.id }); } catch (e) { ok(false, where + ' 例外 ' + e.message); continue; }
        eq(G.skillOf(p), s.id, where + ': skillOf');
        ok(p.src && p.src.skill === s.id, where + ': src.skill');
        ok(independentCheck(s.id, p), where + ': 技能の決まり ' + JSON.stringify([p.q, p.parts, p.a, p.op, p.b]));
        var real = p.src.lv || 'normal';
        lvSeen[real] = 1;
        C.checkProblem(where, p); C.verifyGen(g.name, p, where, real); C.levelRules(g.name, p, where, real);
        kinds[M.signature(p)] = 1;
      }
      // そのレベルで作れるものは、そのレベルで作る
      genSkillStats[s.id + ' ' + g.name + ' ' + lv] = Object.keys(lvSeen).join('/') + ' ' + Object.keys(kinds).length;
      ok(Object.keys(kinds).length >= 12, 'skill ' + s.id + ' ' + g.name + '[' + lv + ']: ちがう問題が少ない ' + Object.keys(kinds).length);
    });
  });
});
C.takeErrors().forEach(function (e) { ok(false, 'check-lessons の検査: ' + e); });
// 作れるはずのレベル
[['add-nocarry', 'hissanAdd', 'easy'], ['sub-noborrow', 'hissanSub', 'easy'], ['add-carry', 'hissanAdd', 'hard'], ['sub-multi', 'hissanSub', 'hard'],
  ['sub-int', 'hissanSub', 'hard'], ['cmp-two', 'compare', 'easy'], ['cmp-digits', 'compare', 'hard'], ['kui', 'masuRead', 'hard'], ['rep-001', 'masuRead', 'easy']]
  .forEach(function (x) { ok(genSkillStats[x.join(' ')].split(' ')[0] === x[2], x.join(' ') + ' がそのレベルで作れる: ' + genSkillStats[x.join(' ')]); });
// 作れないレベルはふつうで作る（かんたんにくり上がりは無い）
ok(genSkillStats['add-carry hissanAdd easy'].split(' ')[0] === 'normal', 'かんたんの くり上がりあり は ふつうで作る');
// skill を省略したときは今までと同じ（乱数の使い方も）
G.names().forEach(function (name, gi) {
  var r1 = C.mulberry32(77 + gi), r2 = C.mulberry32(77 + gi);
  for (var i = 0; i < 30; i++) {
    var a = JSON.stringify(G.make(name, r1)), b = JSON.stringify(G.make(name, r2, { level: 'normal', skill: '' }));
    if (a !== b) { ok(false, name + ': skill 省略で問題が変わった'); break; }
  }
});

/* =================== 3. 記録のサンプル =================== */
var DAY = 86400000, NOW = Date.UTC(2026, 10, 23, 3, 0, 0);
function clearAll() { ls.clear(); }
function put(key, pid, e) {
  var k = 'shosu.rec.' + key;
  var d = JSON.parse(ls.getItem(k) || '{"entries":{}}');
  d.entries[pid] = e;
  ls.setItem(k, JSON.stringify(d));
  var ks = JSON.parse(ls.getItem('shosu.keys') || '[]');
  if (ks.indexOf(key) < 0) { ks.push(key); ls.setItem('shosu.keys', JSON.stringify(ks)); }
}
function estOf(id) { var p = G.make(BY[id].gens[0].name, C.mulberry32(5), { skill: id }); return M.estimate(p, 'normal'); }
var seq = 0;
// 技能 id の記録を n 問（○の数 okN、目安の何倍の時間 slow、ヒントを使う問題の数 hintN、何日前から）
function recs(id, n, okN, slow, hintN, daysAgo, key) {
  var est = estOf(id);
  for (var i = 0; i < n; i++) {
    var good = i < okN;
    put(key || 'recommend', 'x' + (seq++), {
      correct: good || i % 2 === 0, first: good, method: 'auto', hints: i < hintN ? 1 : 0, n: 1,
      t: NOW - (daysAgo || 0) * DAY - i * 600000, at: new Date(NOW - (daysAgo || 0) * DAY).toISOString(),
      tag: BY[id].tag, skill: id, ms: slow == null ? undefined : Math.round(est * slow * 1000)
    });
  }
}
// 「みる」は Store.record('miru', 'lesson-N', {at}) で（Store は keys に入れない）
function miru(no) { S.Store.record('miru', 'lesson-' + no, { at: new Date(NOW).toISOString() }); }
function lessonRec(pid, ok1, daysAgo) {
  var no = +/^L(\d+)-/.exec(pid)[1];
  put('lesson-' + no, pid, { correct: ok1, method: 'auto', hints: 0, n: 1, t: NOW - (daysAgo || 0) * DAY, at: new Date(NOW).toISOString(), tag: lpById[pid].tag });
}

var KIDS = {
  // にがてがはっきりした子：ひき算のくり下がりがにがて。ほかは○。第10時まで
  weakKid: function () {
    R.SKILLS.forEach(function (s) {
      if (s.id === 'sub-borrow') recs(s.id, 8, 3, 1.8, 4, 1);
      else if (s.id === 'sub-multi') recs(s.id, 6, 2, 2.0, 3, 1);
      else if (s.id === 'cmp-two') recs(s.id, 8, 8, 0.8, 0, 2);
      else recs(s.id, 6, 6, 1.0, 0, 3 + (s.lesson % 4) * 3);
    });
    ['L8-05', 'L8-12', 'L8-09', 'L7-12'].forEach(function (pid) { lessonRec(pid, false, 2); });
    lessonRec('L8-04', true, 2);
    for (var i = 1; i <= 10; i++) miru(i);
  },
  // 記録が少ない子：第2時の「みる」を開いて、第1時を2問だけ
  fewKid: function () {
    lessonRec('L1-05', true, 0); lessonRec('L1-06', false, 0);
    miru(1); miru(2);
  },
  // 全部とくいな子：第10時まで全部○ではやい
  strongKid: function () {
    R.SKILLS.forEach(function (s) { recs(s.id, 8, 8, 0.7, 0, 1 + s.lesson % 5); });
    for (var i = 1; i <= 10; i++) miru(i);
  },
  // 時間がかかる子：正答率はふつうだが、どれも目安の2.5倍かかり、ヒントも多い
  slowKid: function () {
    R.SKILLS.forEach(function (s) { recs(s.id, 6, 4, 2.5, 4, 1); });
    for (var i = 1; i <= 10; i++) miru(i);
  },
  // 第3時までしか進めていない子
  l3Kid: function () {
    ['rep-001', 'unit-m', 'numberline', 'kui', 'rep-0001', 'unit-k'].forEach(function (id, i) { recs(id, 6, i === 5 ? 2 : 6, 1.1, 0, 1, 'lesson-' + BY[id].lesson); });
    lessonRec('L3-08', false, 1); lessonRec('L3-13', false, 1);
    miru(1); miru(2); miru(3);
    // ほかの時の記録はないが、まとめモードで tag だけの記録がある（範囲は広げない）
    put('matome', 'mt-1', { correct: false, hints: 0, n: 1, t: NOW, at: new Date(NOW).toISOString(), tag: 'hikizan' });
  }
};

function profileOf(kid) { clearAll(); KIDS[kid](); return R.profile({ now: NOW }); }

// ---- profile ----
var P = profileOf('weakKid');
eq(P.frontier, 10, 'weakKid: frontier');
eq(P.skills['sub-borrow'].status, 'weak', 'weakKid: sub-borrow は weak');
eq(P.skills['sub-multi'].status, 'weak', 'weakKid: sub-multi は weak');
eq(P.skills['cmp-two'].status, 'strong', 'weakKid: cmp-two は strong');
ok(P.skills['add-carry'].status === 'strong' || P.skills['add-carry'].status === 'soso', 'weakKid: add-carry は ○');
ok(P.skills['sub-borrow'].speed > 1.6 && P.skills['sub-borrow'].hintRate > 0.3, 'weakKid: sub-borrow の speed・hintRate ' + JSON.stringify(P.skills['sub-borrow']));
ok(P.mistakes.some(function (m) { return m.pid === 'L8-05' && m.skill === 'sub-borrow'; }), 'weakKid: まちがえた教科書の問題');
ok(!P.mistakes.some(function (m) { return m.pid === 'L8-04'; }), 'weakKid: ○の問題はリベンジにしない');

P = profileOf('fewKid');
eq(P.frontier, 2, 'fewKid: frontier（みる を開いた第2時）');
ok(R.SKILLS.every(function (s) { return P.skills[s.id].status === 'unknown'; }), 'fewKid: 全部 unknown');
eq(P.avgSec, { fill: 40, choice: 35, order: 45, hissan: 60 }, 'fewKid: 記録が無いときの avgSec は目安');

P = profileOf('strongKid');
ok(R.SKILLS.every(function (s) { return P.skills[s.id].status === 'strong'; }), 'strongKid: 全部 strong');
ok(P.avgSec.hissan < 60 && P.avgSec.fill < 40, 'strongKid: avgSec が目安より短い ' + JSON.stringify(P.avgSec));

P = profileOf('slowKid');
ok(R.SKILLS.every(function (s) { return P.skills[s.id].status === 'weak'; }), 'slowKid: 正答率0.67で時間がかかる・ヒントが多い → weak');
ok(P.avgSec.hissan > 100 && P.speedFactor > 1.8, 'slowKid: avgSec が長い ' + JSON.stringify(P.avgSec) + ' ' + P.speedFactor);

P = profileOf('l3Kid');
eq(P.frontier, 3, 'l3Kid: frontier');
eq(P.skills['unit-k'].status, 'weak', 'l3Kid: unit-k は weak');
ok(P.skills['sub-borrow'].n < 1, 'l3Kid: tag だけの記録は等分 ' + P.skills['sub-borrow'].n);

// しきい値のさかい目
eq(R._statusOf({ n: 2.9, acc: 0, speed: 1, hintRate: 0 }), 'unknown', 'n<3 は unknown');
eq(R._statusOf({ n: 5, acc: 0.59, speed: 1, hintRate: 0 }), 'weak', 'acc<0.6 は weak');
eq(R._statusOf({ n: 5, acc: 0.7, speed: 1.7, hintRate: 0 }), 'weak', 'acc<0.75 で遅い は weak');
eq(R._statusOf({ n: 5, acc: 0.7, speed: 1.2, hintRate: 0.6 }), 'weak', 'acc<0.75 でヒント多い は weak');
eq(R._statusOf({ n: 5, acc: 0.7, speed: 1.2, hintRate: 0.1 }), 'soso', 'acc 0.7 ふつう は soso');
eq(R._statusOf({ n: 5, acc: 0.9, speed: 1.1, hintRate: 0.1 }), 'strong', 'acc0.9 speed1.1 は strong');
eq(R._statusOf({ n: 5, acc: 0.95, speed: 1.3, hintRate: 0 }), 'soso', '遅いと strong にしない');
eq(R._statusOf({ n: 5, acc: 0.95, speed: null, hintRate: 0 }), 'strong', '時間の記録がない古い記録');
// 半減期：古いまちがいより新しい○を重く見る
clearAll();
recs('order', 5, 0, null, 0, 28); recs('order', 5, 5, null, 0, 0);
var po = R.profile({ now: NOW }).skills.order;
ok(po.acc > 0.85, '新しい記録ほど重い acc=' + po.acc);
// ms のない記録・30分超は speed に使わない
clearAll();
recs('order', 4, 4, null, 0, 0);
put('recommend', 'long', { correct: true, first: true, hints: 0, t: NOW, skill: 'order', ms: 40 * 60 * 1000 });
eq(R.profile({ now: NOW }).skills.order.speed, null, 'ms なし・30分超は speed に使わない');

/* =================== 4. build =================== */
var RANGE = { 5: [5, 8], 10: [9, 16], 15: [14, 24] };
function sigsOf(p) { return R.signatures(p); }
function checkBuild(kid, b, minutes, P2, where, recentSigs) {
  var ps = b.problems, n = ps.length;
  ok(n >= RANGE[minutes][0] && n <= RANGE[minutes][1], where + ': 問題数 ' + n);
  ok(b.seconds.length === n && b.seconds.reduce(function (a, x) { return a + x; }, 0) === b.total, where + ': seconds/total');
  ok(typeof b.summary === 'string' && b.summary.length > 5, where + ': summary');
  var sig = {}, cnt = {};
  ps.forEach(function (p, i) {
    var w = where + ' #' + (i + 1);
    eq(p.id, 'R-' + (i + 1), w + ': id');
    ok(!!BY[p.skill], w + ': skill');
    ok(['weak', 'check', 'challenge'].indexOf(p.role) >= 0, w + ': role');
    ok(M.TAGS.indexOf(p.tag) >= 0, w + ': tag');
    if (!p.revenge) {
      ok(BY[p.skill].lesson <= P2.frontier, w + ': 範囲（frontier ' + P2.frontier + '）をこえた ' + p.skill);
      eq(G.skillOf(p), p.skill, w + ': 問題の技能');
      C.checkProblem(w, p); C.verifyGen(p.src.gen, p, w, p.src.lv || 'normal');
    } else {
      ok(p.fromLesson <= P2.frontier, w + ': リベンジの範囲');
      ok(!!lpById[p.from], w + ': リベンジは教科書の問題');
    }
    sigsOf(p).forEach(function (k) {
      ok(!sig[k], w + ': 同じ問題・同じ数が重なった ' + k);
      ok(!recentSigs || !recentSigs[k], w + ': 最近の回と同じ問題 ' + k);
      sig[k] = 1;
    });
    cnt[p.skill] = (cnt[p.skill] || 0) + 1;
    if (i > 0 && ps[i - 1].skill === p.skill) {
      var maxC = Math.max.apply(null, Object.keys(cnt).map(function (k) { return ps.filter(function (q) { return q.skill === k; }).length; }));
      ok(maxC * 2 > n + 1 || Object.keys(cnt).length === 1, w + ': 同じ技能が続いた ' + p.skill);
    }
  });
  ok(ps.filter(function (p) { return p.role === 'check'; }).length >= 1, where + ': 確認が1問以上');
  C.takeErrors().forEach(function (e) { ok(false, where + ' 問題の検査: ' + e); });
}

var kidStats = {};
Object.keys(KIDS).forEach(function (kid) {
  var P2 = profileOf(kid);
  ls.removeItem('shosu.recommend');
  var st = kidStats[kid] = { n: {}, weakShare: {}, chal: {}, revenge: 0, combos: {}, hard: 0, chalTotal: 0, summaries: {}, total: {} };
  [5, 10, 15].forEach(function (min) {
    ['few', 'normal', 'many'].forEach(function (wk) {
      ['few', 'normal', 'many'].forEach(function (ch) {
        for (var s = 0; s < 4; s++) {
          var where = kid + ' ' + min + '分 にがて' + wk + ' ちょうせん' + ch + ' seed' + s;
          var b = R.build({ minutes: min, weak: wk, challenge: ch, rng: C.mulberry32(s * 101 + min), profile: P2 });
          checkBuild(kid, b, min, P2, where, null);
          var n = b.problems.length;
          (st.n[min] = st.n[min] || []).push(n);
          (st.total[min] = st.total[min] || []).push(b.total);
          (st.weakShare[wk] = st.weakShare[wk] || []).push(b.counts.weak / n);
          (st.chal[ch + min] = st.chal[ch + min] || []).push(b.counts.challenge);
          st.revenge += b.counts.revenge;
          if (st.weakOnlyRevenge === undefined) st.weakOnlyRevenge = true;
          if (b.counts.weak !== b.counts.revenge) st.weakOnlyRevenge = false;
          st.combos[b.problems.map(function (p) { return p.skill + p.role; }).join(',')] = 1;
          b.problems.forEach(function (p) { if (p.role === 'challenge') { st.chalTotal++; if (p.level === 'hard') st.hard++; } });
          st.summaries[b.summary] = 1;
        }
      });
    });
  });
});
function avg(a) { return a.reduce(function (x, y) { return x + y; }, 0) / a.length; }
function report(kid) {
  var st = kidStats[kid];
  return kid + ': 問題数 5分 ' + Math.min.apply(null, st.n[5]) + '〜' + Math.max.apply(null, st.n[5]) +
    ' / 10分 ' + Math.min.apply(null, st.n[10]) + '〜' + Math.max.apply(null, st.n[10]) +
    ' / 15分 ' + Math.min.apply(null, st.n[15]) + '〜' + Math.max.apply(null, st.n[15]) +
    '、にがて わりあい few ' + avg(st.weakShare.few).toFixed(2) + ' normal ' + avg(st.weakShare.normal).toFixed(2) + ' many ' + avg(st.weakShare.many).toFixed(2) +
    '、ちょうせん(10分) few ' + avg(st.chal.few10).toFixed(1) + ' normal ' + avg(st.chal.normal10).toFixed(1) + ' many ' + avg(st.chal.many10).toFixed(1) +
    '、リベンジ ' + st.revenge + '、組み合わせ ' + Object.keys(st.combos).length;
}

// にがてがはっきりした子
var W = kidStats.weakKid;
ok(avg(W.weakShare.few) < avg(W.weakShare.normal) && avg(W.weakShare.normal) < avg(W.weakShare.many), 'weakKid: にがての わりあいが選択どおり ' + report('weakKid'));
ok(Math.abs(avg(W.weakShare.few) - 0.4) < 0.12 && Math.abs(avg(W.weakShare.normal) - 0.6) < 0.12 && Math.abs(avg(W.weakShare.many) - 0.75) < 0.12, 'weakKid: にがての わりあいが 0.4/0.6/0.8 近く ' + report('weakKid'));
ok(avg(W.chal.few10) < avg(W.chal.normal10) && avg(W.chal.normal10) < avg(W.chal.many10), 'weakKid: ちょうせんの数が選択どおり');
ok(avg(W.chal.few5) === 0, 'weakKid: 5分の ちょうせん少なめは0問');
ok(W.revenge > 0, 'weakKid: リベンジが入る');
(function () {
  var Pw = profileOf('weakKid'), seenB = {};
  ls.removeItem('shosu.recommend');
  for (var i = 0; i < 20; i++) seenB[JSON.stringify(R.build({ minutes: 10, rng: C.mulberry32(3000 + i), profile: Pw }).problems.map(function (p) { return R.signatures(p)[0]; }))] = 1;
  ok(Object.keys(seenB).length === 20, 'weakKid: 毎回ちがう組み合わせ ' + Object.keys(seenB).length + '/20');
})();
// 中心は ひき算
var P3 = profileOf('weakKid');
ls.removeItem('shosu.recommend');
var b1 = R.build({ minutes: 10, weak: 'normal', challenge: 'normal', rng: C.mulberry32(1), profile: P3 });
ok(b1.focus.every(function (id) { return id === 'sub-borrow' || id === 'sub-multi'; }) && b1.focus.length >= 1, 'weakKid: focus はひき算 ' + b1.focus);
ok(/にがてな ひき算/.test(b1.summary) && /ちょうせん/.test(b1.summary), 'weakKid: summary ' + b1.summary);
b1.problems.filter(function (p) { return p.role === 'weak' && !p.revenge; }).forEach(function (p) { ok(p.skill === 'sub-borrow' || p.skill === 'sub-multi', 'weakKid: にがての問題は weak/soso の技能 ' + p.skill); });
b1.problems.filter(function (p) { return p.role === 'challenge'; }).forEach(function (p) { ok(P3.skills[p.challengeFrom].status === 'strong', 'weakKid: ちょうせんは strong から'); });
b1.problems.filter(function (p) { return p.role === 'check'; }).forEach(function (p) { ok(P3.skills[p.skill].acc >= 0.75, 'weakKid: 確認は○だった技能 ' + p.skill); });
var rv = b1.problems.filter(function (p) { return p.revenge; });
ok(rv.length >= 1 && rv.every(function (p) { return ['L8-05', 'L8-12', 'L8-09', 'L7-12'].indexOf(p.from) >= 0; }), 'weakKid: リベンジは前にまちがえた問題 ' + rv.map(function (p) { return p.from; }));
// 確認は「しばらく取り組んでいない」技能ほど多い
var oldC = 0, newC = 0;
for (var s2 = 0; s2 < 60; s2++) {
  R.build({ minutes: 15, weak: 'few', challenge: 'few', rng: C.mulberry32(500 + s2), profile: P3 }).problems.forEach(function (p) {
    if (p.role !== 'check') return;
    if (BY[p.skill].lesson % 4 === 3) oldC++; else if (BY[p.skill].lesson % 4 === 0) newC++;
  });
}
ok(oldC > newC * 1.5, '確認は前に取り組んだのが古い技能ほど多い old ' + oldC + ' new ' + newC);

// 最近3回の問題は出さない・リベンジは最近の回に出したものを出さない
ls.removeItem('shosu.recommend');
var recentS = [], hist = [];
for (var r = 0; r < 6; r++) {
  var rs = {};
  hist.slice(-3).forEach(function (h) { h.forEach(function (k) { rs[k] = 1; }); });
  var bb = R.build({ minutes: 15, weak: 'many', challenge: 'normal', rng: C.mulberry32(9100 + r), profile: P3 });
  checkBuild('weakKid', bb, 15, P3, 'weakKid 連続' + r, rs);
  var res = bb.problems.map(function (p, i) { return { correct: i % 3 !== 0, first: i % 3 !== 0, ms: 40000, hints: 0 }; });
  ok(R.saveResult({ problems: bb.problems, results: res, minutes: 15 }) === true, 'saveResult');
  var sg = [];
  bb.problems.forEach(function (p) { sigsOf(p).forEach(function (k) { sg.push(k); }); });
  hist.push(sg);
  recentS.push(bb.problems.filter(function (p) { return p.revenge; }).map(function (p) { return p.from; }));
}
for (var r2 = 1; r2 < recentS.length; r2++) {
  var before = [].concat.apply([], recentS.slice(Math.max(0, r2 - 3), r2));
  recentS[r2].forEach(function (pid) { ok(before.indexOf(pid) < 0, '最近の回に出したリベンジをまた出した ' + pid); });
}
ok(R.results().length === 5, '結果は最近5回 ' + R.results().length);
ok(R.lastResult() && R.lastResult().total > 0 && R.lastResult().sigs.length > 0, 'lastResult');

// 記録が少ない子
var F = kidStats.fewKid;
ok(Object.keys(F.n).every(function (m) { return true; }), 'fewKid');
ok(F.weakOnlyRevenge, 'fewKid: にがての候補が無い → にがての部分はリベンジだけ、のこりは確認で広く ' + report('fewKid'));
clearAll(); KIDS.fewKid();
var Pf = R.profile({ now: NOW });
var bf = R.build({ minutes: 10, rng: C.mulberry32(3), profile: Pf });
var fs = {};
bf.problems.forEach(function (p) { if (!p.revenge) fs[p.skill] = 1; });
ok(Object.keys(fs).length >= 3, 'fewKid: 範囲の技能を広く出す ' + Object.keys(fs));
ok(bf.problems.every(function (p) { return p.revenge ? p.fromLesson <= 2 : BY[p.skill].lesson <= 2; }), 'fewKid: 第2時まで');
ok(/^いろいろな問題で/.test(bf.summary), 'fewKid: summary ' + bf.summary);

// 全部とくいな子
var T = kidStats.strongKid;
ok(T.chalTotal > 0 && T.hard / T.chalTotal > 0.8, 'strongKid: ちょうせんは むずかしい ' + T.hard + '/' + T.chalTotal);
ok(avg(T.chal.few10) >= 1, 'strongKid: 全部とくいなら ちょうせんをふやす ' + report('strongKid'));
ok(avg(T.weakShare.normal) === 0, 'strongKid: にがては無し');

// 時間がかかる子：問題数が少なめ（5分で5〜6問）
var SL = kidStats.slowKid;
ok(Math.max.apply(null, SL.n[5]) <= 6 && avg(SL.n[10]) < avg(kidStats.strongKid.n[10]), 'slowKid: 問題数が少ない ' + report('slowKid') + ' / ' + report('strongKid'));
ok(avg(kidStats.strongKid.n[5]) >= 6, 'strongKid: 5分で6問以上 ' + report('strongKid'));
// 時間がかかる子の total は、その子の速さで見た時間（目安より長い）
ok(avg(SL.total[10]) >= 540, 'slowKid: 10分にあわせた total ' + avg(SL.total[10]));

// 第3時までの子
var L3 = kidStats.l3Kid;
ok(L3.revenge > 0, 'l3Kid: リベンジが入る');
ok(avg(L3.weakShare.normal) > 0.4, 'l3Kid: にがて（unit-k）がある ' + report('l3Kid'));

// 毎回ちがう（rng をかえる）
P3 = profileOf('weakKid'); ls.removeItem('shosu.recommend');
var ba = R.build({ minutes: 10, profile: P3, rng: C.mulberry32(11) }), bb2 = R.build({ minutes: 10, profile: P3, rng: C.mulberry32(12) });
ok(JSON.stringify(ba.problems) !== JSON.stringify(bb2.problems), 'rng がちがえば ちがう問題');
var bm = R.build({ minutes: 5 });
ok(bm.problems.length >= 5, 'rng・profile 省略でも動く');

/* =================== 5. advice =================== */
P3 = profileOf('weakKid'); ls.removeItem('shosu.recommend');
var bA = R.build({ minutes: 10, rng: C.mulberry32(21), profile: P3 });
var resA = bA.problems.map(function (p) {
  var bad = p.skill === 'sub-borrow' || p.skill === 'sub-multi';
  return { correct: !bad, first: !bad, ms: bad ? 120000 : 20000, hints: bad ? 2 : 0 };
});
var adv = R.advice({ problems: bA.problems, results: resA, prev: null });
ok(adv.improve.length >= 1, 'advice: improve がある');
adv.improve.forEach(function (x) {
  var s = BY[x.skill];
  ok(x.skill === 'sub-borrow' || x.skill === 'sub-multi', 'advice: 改善はまちがえた技能 ' + x.skill);
  ok(/ひき算/.test(x.text), 'advice: text ' + x.text);
  var k = {};
  x.actions.forEach(function (a) { k[a.kind] = a; });
  eq(k.textbook && k.textbook.label, '教科書 p.45〜46 を見直そう', 'advice: 教科書のページ');
  eq(k.miru && k.miru.href, '#/lesson/8', 'advice: みる の時');
  ok(k.miru && /第8時の「みる」（筆算ステップ）/.test(k.miru.label), 'advice: みるの文 ' + (k.miru && k.miru.label));
  eq(k.lesson && [k.lesson.href, k.lesson.label], ['#/lesson/8', '第8時のれんしゅうを やり直そう'], 'advice: れんしゅう');
  eq(k.review && k.review.href, '#/review/hikizan', 'advice: ふくしゅう');
  eq(s.lesson, 8, 'advice: 技能の時');
});
ok(adv.praise.length >= 1, 'advice: praise ' + adv.praise);
eq(adv.compare, [], 'advice: 前回が無ければ compare は空');
ok(/ひき算/.test(adv.next) && /次のおすすめモード/.test(adv.next), 'advice: next ' + adv.next);
// 前回とのちがい
var prev = { total: 10, correct: 5, rate: 50, avgSec: 60, skills: {} };
var resB = bA.problems.map(function () { return { correct: true, first: true, ms: 30000, hints: 0 }; });
var adv2 = R.advice({ problems: bA.problems, results: resB, prev: prev });
ok(adv2.compare.length === 2 && /50% から 100% に 上がった/.test(adv2.compare[0]) && /30秒 はやくなった/.test(adv2.compare[1]), 'advice: compare ' + adv2.compare);
ok(adv2.stars.improved === true, 'advice: improved');
ok(adv2.improve.length === 0, 'advice: 全部○なら改善なし');
ok(adv2.praise.some(function (t) { return /にがてだった/.test(t); }), 'advice: にがてだった技能をほめる ' + adv2.praise);
ok(adv2.stars.allCorrectWeakSkill === true, 'advice: allCorrectWeakSkill');
ok(adv.stars.allCorrectWeakSkill === false, 'advice: まちがえたら allCorrectWeakSkill は false');
// 他の技能の actions（ページ・時）
R.SKILLS.forEach(function (s) {
  var acts = R.actionsFor(s.id), L = S.Lessons.filter(function (l) { return l.no === s.lesson; })[0];
  ok(acts[0].kind === 'textbook' && acts[0].label.indexOf(L.page) >= 0, s.id + ': 教科書のページ');
  ok(acts[1].kind === 'miru' && acts[1].href === '#/lesson/' + L.no, s.id + ': みるの時');
  ok(acts.some(function (a) { return a.kind === 'review' && a.href === '#/review/' + s.review; }), s.id + ': ふくしゅう');
});

/* =================== 6. shouldSuggestMiru =================== */
eq(R.shouldSuggestMiru('sub-borrow', 1), null, 'みる: 1回目は出さない');
var mr = R.shouldSuggestMiru('sub-borrow', 2);
eq(mr && [mr.lesson, mr.href], [8, '#/lesson/8'], 'みる: 2回目');
eq(R.shouldSuggestMiru('cmp-two', [{ skill: 'cmp-two', first: false }, { skill: 'cmp-two', first: true }]), null, 'みる: ○はかぞえない');
var mr2 = R.shouldSuggestMiru('cmp-two', [{ skill: 'cmp-two', first: false }, { skill: 'order', first: false }, { skill: 'cmp-two', correct: false }]);
eq(mr2 && mr2.href, '#/lesson/5', 'みる: 配列');
eq(R.shouldSuggestMiru('kui', { kui: 2 }).lesson, 2, 'みる: {id:数}');
eq(R.shouldSuggestMiru('nai', 5), null, 'みる: ない技能');

/* =================== 7. 保存（容量超過） =================== */
ls.removeItem('shosu.recommend');
ls._limit(400);
var bigR = R.summarize({ problems: bA.problems, results: resB, minutes: 10 });
var threw = false, ret;
try { ret = R.saveResult(bigR); } catch (e) { threw = true; }
ok(!threw, '容量超過で落ちない');
ok(ret === true || ret === false, 'saveResult は true/false');
ls._limit(Infinity);
ok(R.saveResult(bigR) === true && R.lastResult().total === bA.problems.length, '保存できる');
R.setPrefs({ minutes: 15, weak: 'many', challenge: 'few' });
eq(R.prefs(), { minutes: 15, weak: 'many', challenge: 'few' }, 'prefs を覚える');
ls.setItem('shosu.recommend', '{こわれた');
eq(R.lastResult(), null, 'こわれた保存でも落ちない');

/* =================== 8. check-lessons.js も通す =================== */
var out = child.spawnSync(process.execPath, [path.join(__dirname, 'check-lessons.js')], { encoding: 'utf8' });
ok(out.status === 0, 'check-lessons.js が通る\n' + (out.stdout || '').split('\n').slice(-15).join('\n'));

/* =================== 結果 =================== */
Object.keys(KIDS).forEach(function (k) { console.log('  ' + report(k)); });
console.log('  例: ' + b1.summary);
console.log('  例: ' + bf.summary);
console.log('passed ' + passed + '、failed ' + fails.length);
if (fails.length) {
  fails.slice(0, 60).forEach(function (f) { console.log('  x ' + f); });
  process.exitCode = 1;
} else console.log('すべてのテストに通りました。');
