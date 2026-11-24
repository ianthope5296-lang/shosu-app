/* Shosu.Summary — 学習データのまとめ（担当Q・追加6。PLAN「追加機能6」C）
 *
 * Summary.build(opts?) -> LearnSummary   先生に送るコードに入れる、数字中心の小さなオブジェクト
 *   opts.now（ms）… テスト用
 *
 * LearnSummary = {
 *   v:1, at:'ISO', profile:{cls,no,name}|null,
 *   lessons:[{no, tried:取り組んだ問題数, total:教科書の問題数, correct:○の数, firstRate:最初の答えで○の割合(0〜1)|null, avgSec:平均秒|null}] … 第1〜10時
 *   skills:{ 技能id:{st:'weak'|'soso'|'strong'|'unknown', acc:正答率(0〜1), sp:はやさ(目安に対する倍率。1より大きいとおそい)|null, n:問題数, h:ヒントを使った割合} }
 *   matome:{n:回数, q:答えた問題数, c:○の数, rate, fin:さいごまでやった回数, lv:{easy,normal,hard}:レベル別の回数}
 *   osusume:{n, q, c, rate, fin, min:えらんだ時間の合計(分)}
 *   review:{n:回数, q, c, rate}     more:{n:回数(5問ずつ), q, c, rate}
 *   make:{n:作った数, kinds:{hissan,fill,compare,masu,numberline}}
 *   friend:{n:ともだちの問題に答えた数, c:○の数}
 *   plan:{days:計画を立てた日数, ok:計画どおりの日数}
 *   reflect:{n:回数, ev:{double,single,triangle}:◎○△の数, extra:アプリの外でやったことの数, prevT:前のTを生かした回数, w:Wを書いた回数,
 *            judged:自己評価と結果をくらべられた回数, match:そのうち合っていた回数}
 *   stars:{n:ふつうの星, sp:とくべつな星, title:称号の名前}
 *   habit:{q:答えた問題の数(ぜんぶ), hint:ヒントを使った割合, miss:最初の答えが×だった数, fixed:そのうちやり直して○にした数, think:{q,c}:考える問題}
 *   days:学習した日数, min:合計時間の目安(分), last:さいごに学習した日 'YYYY-MM-DD'|null
 * }
 * classic script。Node でも require できる。絵文字は使わない。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var MAKE_KINDS = ['hissan', 'fill', 'compare', 'masu', 'numberline'];
  var EVALS = ['double', 'single', 'triangle'];
  var DEFAULT_SEC = 40;   // 時間の記録がない問題の目安（秒）

  function tryCall(fn, def) { try { var v = fn(); return v === undefined || v === null ? def : v; } catch (e) { return def; } }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function rate(c, q) { return q ? r2(c / q) : null; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateOf(t) { var d = new Date(t); return isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function lessons() { return Array.isArray(S.Lessons) ? S.Lessons : []; }
  function topics() { return Array.isArray(S.ReviewTopics) ? S.ReviewTopics : []; }
  function store() { return S.Store || null; }
  function entries(key) {
    var st = store();
    var e = st && st.entries ? tryCall(function () { return st.entries(key); }, {}) : {};
    return isObj(e) ? e : {};
  }
  function keys() { var st = store(); var k = st && st.keys ? tryCall(function () { return st.keys(); }, []) : []; return Array.isArray(k) ? k : []; }
  function starsState() { return S.Stars && S.Stars._state ? tryCall(function () { return S.Stars._state(); }, null) : null; }
  function entTime(e) { var t = Number(e && e.t); if (t > 0) return t; var p = Date.parse(e && e.at); return isFinite(p) ? p : 0; }
  function firstOk(e) { return typeof e.first === 'boolean' ? e.first : (!!e.correct && (e.n || 1) === 1); }

  function lessonPids(l) {
    var out = [];
    (l.problems || []).forEach(function (p, i) {
      if (p && p.type === 'gen') { for (var k = 0; k < (p.count || 1); k++) out.push((p.id || 'p' + i) + '-' + k); }
      else if (p) out.push(p.id || 'p' + i);
    });
    return out;
  }
  // 'mt-<stamp>-<i>' などを回（stamp）ごとにまとめる
  function runs(ent, re) {
    var o = { n: 0, q: 0, c: 0 }, seen = {};
    for (var pid in ent) {
      var m = re.exec(pid);
      if (!m) continue;
      if (!seen[m[1]]) { seen[m[1]] = 1; o.n++; }
      o.q++;
      if (ent[pid].correct) o.c++;
    }
    o.rate = rate(o.c, o.q);
    return o;
  }

  function build(opts) {
    opts = opts || {};
    var now = Number(opts.now) || Date.now();
    var P = S.Profile && S.Profile.get ? tryCall(function () { return S.Profile.get(); }, null) : null;
    var out = { v: 1, at: new Date(now).toISOString(), profile: P ? { cls: P.cls, no: P.no, name: P.name } : null };

    // 全体（日数・時間・取り組み方）
    var dates = {}, msSum = 0, last = 0;
    var habit = { q: 0, hint: 0, miss: 0, fixed: 0, think: { q: 0, c: 0 } };
    var byDate = {};   // 日ごとの正答（自己評価とくらべる）
    function scan(key, ent) {
      for (var pid in ent) {
        var e = ent[pid];
        if (!isObj(e)) continue;
        var t = entTime(e);
        if (t) { var d = dateOf(t); if (d) { dates[d] = 1; var bd = byDate[d] || (byDate[d] = { q: 0, c: 0 }); bd.q++; if (e.correct) bd.c++; } if (t > last) last = t; }
        msSum += typeof e.ms === 'number' && e.ms > 0 ? e.ms : (e.est > 0 ? e.est : DEFAULT_SEC) * 1000;
        habit.q++;
        if (e.hints > 0) habit.hint++;
        if (firstOk(e) === false) { habit.miss++; if (e.correct) habit.fixed++; }
        if (e.type === 'order' || e.tag === 'kimari' || /^(laws|order)$/.test(e.skill || '') || key === 'friend') {
          habit.think.q++; if (e.correct) habit.think.c++;
        }
      }
    }
    var all = {};
    keys().forEach(function (k) { if (k !== 'miru' && !all[k]) all[k] = entries(k); });
    ['matome', 'osusume', 'friend'].forEach(function (k) { if (!all[k]) all[k] = entries(k); });
    Object.keys(all).forEach(function (k) { scan(k, all[k]); });
    habit.hint = rate(habit.hint, habit.q) || 0;

    // 各時
    var more = { n: 0, q: 0, c: 0 }, moreSeen = {};
    out.lessons = lessons().map(function (l) {
      var ent = all['lesson-' + l.no] || entries('lesson-' + l.no);
      var o = { no: l.no, tried: 0, total: lessonPids(l).length, correct: 0, firstRate: null, avgSec: null };
      var fq = 0, fc = 0, ms = 0, mn = 0;
      for (var pid in ent) {
        var e = ent[pid];
        if (!isObj(e)) continue;
        var mm = /^more-([^-]+)-/.exec(pid);
        if (mm) { if (!moreSeen[mm[1]]) { moreSeen[mm[1]] = 1; more.n++; } more.q++; if (e.correct) more.c++; continue; }
        o.tried++;
        if (e.correct) o.correct++;
        fq++; if (firstOk(e)) fc++;
        if (typeof e.ms === 'number' && e.ms > 0) { ms += e.ms; mn++; }
      }
      o.firstRate = rate(fc, fq);
      o.avgSec = mn ? Math.round(ms / mn / 1000) : null;
      return o;
    });
    more.rate = rate(more.c, more.q);

    // 技能（Recommend.profile）
    out.skills = {};
    var pf = S.Recommend && S.Recommend.profile ? tryCall(function () { return S.Recommend.profile({ now: now }); }, null) : null;
    if (pf && isObj(pf.skills)) {
      Object.keys(pf.skills).forEach(function (id) {
        var x = pf.skills[id] || {};
        out.skills[id] = { st: x.status || 'unknown', acc: r2(Number(x.acc) || 0), sp: x.speed == null ? null : r2(Number(x.speed) || 0), n: Math.round((Number(x.n) || 0) * 10) / 10, h: r2(Number(x.hintRate) || 0) };
      });
    }

    // まとめ・おすすめ・ふくしゅう・もっとれんしゅう
    var ss = starsState() || {};
    var ev = Array.isArray(ss.ev) ? ss.ev : [];
    var mt = runs(all.matome || {}, /^mt-([^-]+)-\d+$/);
    var lv = { easy: 0, normal: 0, hard: 0 }, fin = 0, evN = 0;
    ev.forEach(function (x) {   // Stars の出来事 'matome'：info = 'level:○/問題数[:f]'（新しい100こまで）
      if (!Array.isArray(x) || x[0] !== 'matome') return;
      evN++;
      var info = String(x[2] || '').split(':');
      if (info[0] in lv) lv[info[0]]++;
      if (info[2] === 'f') fin++;
    });
    out.matome = { n: Math.max(mt.n, evN), q: mt.q, c: mt.c, rate: mt.rate, fin: Math.min(fin, Math.max(mt.n, evN)), lv: lv };
    var os = runs(all.osusume || {}, /^os-([^-]+)-\d+$/);
    var reco = Number(ss.reco) || 0;
    var recRes = S.Recommend && S.Recommend.results ? tryCall(function () { return S.Recommend.results(); }, []) : [];
    var osMin = 0;
    (Array.isArray(recRes) ? recRes : []).forEach(function (r) { if (r && r.minutes > 0) osMin += Number(r.minutes) || 0; });
    out.osusume = { n: Math.max(os.n, Array.isArray(recRes) ? recRes.length : 0), q: os.q, c: os.c, rate: os.rate, fin: reco, min: osMin };
    var rv = { n: 0, q: 0, c: 0 };
    topics().forEach(function (t) {
      var r = runs(all['review-' + t.id] || entries('review-' + t.id), /^rv-([^-]+)-\d+$/);
      rv.n += r.n; rv.q += r.q; rv.c += r.c;
      // 回の印のない古い記録も問題数には入れる
      var e = all['review-' + t.id] || {};
      for (var pid in e) if (!/^rv-/.test(pid)) { rv.q++; if (e[pid] && e[pid].correct) rv.c++; }
    });
    rv.rate = rate(rv.c, rv.q);
    out.review = rv;
    out.more = more;

    // もんだいづくり・ともだちの問題
    var me = S.Session && S.Session.deviceId ? tryCall(function () { return S.Session.deviceId(); }, '') : '';
    var my = store() && store().myList ? tryCall(function () { return store().myList(); }, []) : [];
    var kinds = {}, made = 0;
    (Array.isArray(my) ? my : []).forEach(function (it) {
      var up = it && it.up;
      if (!up) return;
      if (me && up.aid && up.aid !== me) return;   // ともだちの問題をほぞんしたもの
      made++;
      if (MAKE_KINDS.indexOf(up.kind) >= 0) kinds[up.kind] = (kinds[up.kind] || 0) + 1;
    });
    var smade = isObj(ss.made) ? Object.keys(ss.made) : [];
    if (smade.length > made) {
      var k2 = {};
      smade.forEach(function (h) { var kd = ss.made[h]; if (MAKE_KINDS.indexOf(kd) >= 0) k2[kd] = (k2[kd] || 0) + 1; });
      MAKE_KINDS.forEach(function (kd) { if ((k2[kd] || 0) > (kinds[kd] || 0)) kinds[kd] = k2[kd]; });
      made = smade.length;
    }
    out.make = { n: made, kinds: kinds };
    var fr = { n: 0, c: 0 };
    if (isObj(ss.friend)) Object.keys(ss.friend).forEach(function (h) { fr.n++; if (ss.friend[h] && ss.friend[h].c) fr.c++; });
    var fe = all.friend || {}, fn = 0, fc2 = 0;
    for (var fp in fe) { fn++; if (fe[fp] && fe[fp].correct) fc2++; }
    if (fn > fr.n) { fr.n = fn; fr.c = fc2; }
    out.friend = fr;

    // 計画・ふりかえり
    var refl = isObj(ss.refl) ? ss.refl : {};
    var planDays = isObj(ss.plan) ? Object.keys(ss.plan).length : 0;
    var okDays = 0, prevT = 0;
    Object.keys(refl).forEach(function (d) { if (refl[d] & 2) okDays++; if (refl[d] & 4) prevT++; });
    out.plan = { days: planDays, ok: okDays };
    var rl = S.Reflect && S.Reflect.list ? tryCall(function () { return S.Reflect.list(); }, []) : [];
    var R = { n: 0, ev: { double: 0, single: 0, triangle: 0 }, extra: 0, prevT: prevT, w: 0, judged: 0, match: 0 };
    (Array.isArray(rl) ? rl : []).forEach(function (r) {
      if (!r) return;
      R.n++;
      var w = r.w || {}, y = r.y || {};
      if (EVALS.indexOf(w.eval) >= 0) R.ev[w.eval]++;
      if (Array.isArray(y.extra)) R.extra += y.extra.length;
      if ((Array.isArray(w.choices) && w.choices.length) || (w.ink && w.ink.strokes && w.ink.strokes.length)) R.w++;
      var bd = byDate[r.date];
      if (EVALS.indexOf(w.eval) >= 0 && bd && bd.q >= 3) {
        var x = bd.c / bd.q;
        R.judged++;
        if ((w.eval === 'double' && x >= 0.8) || (w.eval === 'single' && x >= 0.5 && x < 0.95) || (w.eval === 'triangle' && x < 0.8)) R.match++;
      }
    });
    R.n = Math.max(R.n, Object.keys(refl).length);
    out.reflect = R;

    // 星
    var sm = S.Stars && S.Stars.summary ? tryCall(function () { return S.Stars.summary(); }, null) : null;
    out.stars = sm ? { n: sm.normal || 0, sp: sm.specialTotal || 0, title: (sm.title && sm.title.name) || '' } : { n: 0, sp: 0, title: '' };

    out.habit = habit;
    out.days = Object.keys(dates).length;
    out.min = Math.round(msSum / 60000);
    out.last = last ? dateOf(last) : null;
    return out;
  }

  var Summary = { build: build, _: { lessonPids: lessonPids, runs: runs } };
  S.Summary = Summary;
  if (typeof module === 'object' && module.exports) module.exports = Summary;
})(typeof window !== 'undefined' ? window : globalThis);
