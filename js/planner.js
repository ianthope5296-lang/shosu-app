/* Shosu.Planner — じぶんで計画（担当L）
 * ゴール（先生が決めた日）から逆算した「旅の地図」、今日の計画（1分で立てる）、めあての候補、ホームの「きょうの計画」。
 *
 *   Planner.goal() / setGoal(goal)              保存 'shosu.goal'（SHOSU_PRESET.goal が新しければ最初の goal() で上書き）
 *   Planner.settings() / setSettings(o)         {extraMinutes:0|10|15|20|30, extraDays:'everyday'|'weekdays'|[曜日]}
 *   Planner.ITEMS()                             アプリの中の学習の一覧（done(date) と stars つき）
 *   Planner.draft(opts?)                        ゴールから逆算した下書き（goal が無ければ null）
 *   Planner.roadmap() / saveRoadmap(rm)         保存 'shosu.plan'（goalId が変わったら下書きを作り直す）
 *   Planner.leftovers(rm, through?) / carryOver(rm, through?)   終わっていない前の日の項目を、次の日からに回す
 *   Planner.today() / savePlan(tp) / plan(date)
 *   Planner.meateCandidates(itemIds)
 *   Planner.mountRoadmap(el) / mountToday(el) -> {destroy()}   Planner.todayPanel() -> HTMLElement
 *
 * 逆算の決まり（draft）
 *   1. 使える日：今日〜ゴールの前日。授業の日（goal.classes）はその授業の分。授業のない日は、設定の
 *      「授業のほかに使える時間」（extraMinutes、extraDays の曜日）だけ「じぶんの時間」になる。
 *   2. 授業の日に「第○時」が入っていれば、その時のれんしゅうをその日に置く（まだ星がそろっていなければ）。
 *   3. ゴールの前日（なければ最後の授業の日、さらに前の日へ）に「まとめモード（ふつう）」を、空いている分に合う長さ（5〜15分、35分以上空いていれば20分）で置く。
 *   4. のこりの、まだ星がそろっていない時を、番号の順に、入るいちばん早い日（授業の日ののこりの分・じぶんの時間）へ置く。
 *      授業で習う日が決まっている時は、その日より前には置かない（先取りしすぎない）。番号の順はなるべく前後させない。
 *      （授業の日は 2・3 で先にうめてあるので、のこりは授業の日のあまりと「じぶんの時間」に回る）
 *   5. にがてな内容（まとめモードの前回の×の割合・記録の×の割合）のふくしゅうを、×が多い順に置く（関係する時より後）。
 *   6. まだ何もない日には、ほかのふくしゅうを1つ置く。どの日も、その日に使える分をこえない。入らないものは unplaced へ。
 * classic script。Node でも require できる（DOM を使う部分は呼ばなければ動かない）。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;

  var GOAL_KEY = 'shosu.goal';
  var PLAN_KEY = 'shosu.plan';
  var EXTRA_MINUTES = [0, 10, 15, 20, 30];
  var MATOME_TIMES = [5, 10, 15, 20];
  var MATOME_LEVELS = [{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }];
  var REVIEW_MIN = 8, MAKE_MIN = 10, PER_PROBLEM = 0.7;
  var DOW = ['日', '月', '火', '水', '木', '金', '土'];
  // 時ごとの内容（ふくしゅうの種類）
  var LESSON_TOPIC = { 1: 'hyoshikata', 2: 'hyoshikata', 3: 'hyoshikata', 4: 'shikumi', 5: 'daisho', 6: 'jubai', 7: 'tashizan', 8: 'hikizan', 9: 'tashizan' };
  var TAG_TOPIC = { hyoshikata: 'hyoshikata', shikumi: 'shikumi', daisho: 'daisho', jubai: 'jubai', tashizan: 'tashizan', hikizan: 'hikizan', kimari: 'tashizan' };
  var TOPIC_WORD = { hyoshikata: '表し方', shikumi: '小数のしくみ', daisho: '大小くらべ', jubai: '10倍・1/10', tashizan: 'たし算', hikizan: 'ひき算' };
  var DEFAULT_TOPICS = [
    { id: 'hyoshikata', title: '表し方・単位' }, { id: 'shikumi', title: 'しくみ・数の構成' }, { id: 'daisho', title: '大小' },
    { id: 'jubai', title: '10倍・1/10' }, { id: 'tashizan', title: 'たし算' }, { id: 'hikizan', title: 'ひき算' }
  ];

  /* ---------- 保存 ---------- */
  var mem = {};
  function storage() { try { return root.localStorage || null; } catch (e) { return null; } }
  function getJSON(k, def) {
    var v = null, ls = storage();
    try { v = ls ? ls.getItem(k) : null; } catch (e) { v = null; }
    if (v == null && mem[k] != null) v = mem[k];
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  }
  function setJSON(k, val) {
    var s;
    try { s = JSON.stringify(val); } catch (e) { return false; }
    var ls = storage();
    if (!ls) { mem[k] = s; return true; }
    try { ls.setItem(k, s); delete mem[k]; return true; } catch (e) { mem[k] = s; return false; }
  }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

  /* ---------- 日付（端末の日付で 'YYYY-MM-DD'） ---------- */
  var clockFn = null;
  function now() { return clockFn ? new Date(clockFn()) : new Date(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function validYmd(s) { var d = parseYmd(s); return !!d && ymd(d) === s; }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDays(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); } // b − a
  function dow(s) { return parseYmd(s).getDay(); }
  function todayStr() { return ymd(now()); }
  function dayOfTs(t) { var n = Number(t); return isFinite(n) && n > 0 ? ymd(new Date(n)) : ''; }
  function dateLong(s) { var d = parseYmd(s); return d ? (d.getMonth() + 1) + '月' + d.getDate() + '日（' + DOW[d.getDay()] + '）' : ''; }
  function dateShort(s) { var d = parseYmd(s); return d ? (d.getMonth() + 1) + '/' + d.getDate() + '（' + DOW[d.getDay()] + '）' : ''; }

  /* ---------- 記録を読む ---------- */
  function lessonsArr() { return Array.isArray(S.Lessons) ? S.Lessons : []; }
  function topicsArr() { return Array.isArray(S.ReviewTopics) && S.ReviewTopics.length ? S.ReviewTopics : DEFAULT_TOPICS; }
  function stats(key) {
    var st = S.Store && S.Store.stats ? S.Store : null;
    var empty = { tried: 0, correct: 0, hints: 0, done: {} };
    if (!st) return empty;
    try { return st.stats(key) || empty; } catch (e) { return empty; }
  }
  function lessonPids(lesson) {
    var out = [];
    (lesson.problems || []).forEach(function (p, i) {
      if (p && p.type === 'gen') { for (var k = 0; k < (p.count || 1); k++) out.push((p.id || 'p' + i) + '-' + k); }
      else if (p) out.push(p.id || 'p' + i);
    });
    return out;
  }
  function lessonByNo(no) {
    var ls = lessonsArr();
    for (var i = 0; i < ls.length; i++) if (Number(ls[i].no) === Number(no)) return ls[i];
    return null;
  }
  // ホームの星3つ（app.js lessonStars）と同じ考え
  function lessonInfo(no) {
    var l = lessonByNo(no);
    if (!l) return { total: 0, ok: 0, stars: 0 };
    var pids = lessonPids(l), st = stats('lesson-' + no), ok = 0, tried = 0;
    pids.forEach(function (pid) { if (pid in st.done) { tried++; if (st.done[pid]) ok++; } });
    var stars = 0;
    if (pids.length && st.tried) stars = ok === pids.length ? 3 : (ok * 2 >= pids.length ? 2 : 1);
    return { total: pids.length, ok: ok, tried: tried, stars: stars };
  }
  function starsState() {
    try { if (S.Stars && S.Stars._state) { var s = S.Stars._state(); if (isObj(s)) return s; } } catch (e) {}
    var raw = getJSON('shosu.stars', null);
    return isObj(raw) ? raw : {};
  }
  function gotStars(ids) {
    var got = starsState().got || {}, n = 0;
    ids.forEach(function (id) { if (got[id]) n++; });
    return n;
  }
  function eventsOn(type, date) {
    var ev = starsState().ev;
    if (!Array.isArray(ev)) return [];
    return ev.filter(function (e) { return Array.isArray(e) && e[0] === type && dayOfTs(e[1]) === date; });
  }
  // pid 'rv-<時刻36進>-n'・'mt-<時刻36進>-n' から、その日に答えた数（回ごとの最大）
  function runCountOn(key, prefix, date) {
    var d = stats(key).done || {}, runs = {}, best = 0;
    for (var pid in d) {
      var m = new RegExp('^' + prefix + '-([0-9a-z]+)-\\d+$').exec(pid);
      if (!m || dayOfTs(parseInt(m[1], 36)) !== date) continue;
      runs[m[1]] = (runs[m[1]] || 0) + 1;
      if (runs[m[1]] > best) best = runs[m[1]];
    }
    return best;
  }
  function madeOn(date) {
    if (eventsOn('made', date).length) return true;
    try {
      var my = S.Store && S.Store.myList ? S.Store.myList() : [];
      return my.some(function (x) { return x && (dayOfTs(x.created) === date || dayOfTs(x.updated) === date); });
    } catch (e) { return false; }
  }
  function matomeLast() {
    try { var v = S.Session && S.Session.load ? S.Session.load('matome-last') : null; if (isObj(v)) return v; } catch (e) {}
    var raw = getJSON('shosu.session.matome-last', null);
    return raw && isObj(raw.state) ? raw.state : {};
  }

  // 内容ごとの×の割合（0〜1）。まとめモードの前回と、記録（ふくしゅう・各時）の大きいほう
  function weakness() {
    var w = {};
    function put(t, x) { if (!t || !isFinite(x)) return; x = Math.max(0, Math.min(1, x)); if (!(t in w) || x > w[t]) w[t] = x; }
    var last = matomeLast();
    if (isObj(last.weak)) for (var tag in last.weak) put(TAG_TOPIC[tag], Number(last.weak[tag]));
    topicsArr().forEach(function (t) {
      var st = stats('review-' + t.id);
      if (st.tried >= 3) put(t.id, 1 - st.correct / st.tried);
    });
    var by = {};
    lessonsArr().forEach(function (l) {
      var t = LESSON_TOPIC[l.no];
      if (!t) return;
      var st = stats('lesson-' + l.no);
      if (!by[t]) by[t] = { n: 0, ng: 0 };
      by[t].n += st.tried; by[t].ng += st.tried - st.correct;
    });
    for (var k in by) if (by[k].n >= 3) put(k, by[k].ng / by[k].n);
    return w;
  }

  /* ---------- ゴール ---------- */
  function cleanGoal(g) {
    if (!isObj(g) || !validYmd(g.date)) return null;
    var out = {
      v: 1, id: typeof g.id === 'string' && g.id ? g.id : 'g-' + String(g.date).replace(/-/g, ''),
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim().slice(0, 40) : 'ゴール',
      date: g.date, classes: [], created: typeof g.created === 'string' ? g.created : ''
    };
    var seen = {};
    (Array.isArray(g.classes) ? g.classes : []).forEach(function (c) {
      if (!isObj(c) || !validYmd(c.date) || seen[c.date]) return;
      var m = Math.round(Number(c.minutes));
      if (!isFinite(m) || m <= 0) m = 20;
      var o = { date: c.date, minutes: Math.min(90, Math.max(5, m)) };
      var ln = Number(c.lesson);
      if (ln >= 1 && ln <= 10 && Math.floor(ln) === ln) o.lesson = ln;
      if (typeof c.note === 'string' && c.note) o.note = c.note.slice(0, 60);
      seen[c.date] = 1;
      out.classes.push(o);
    });
    out.classes.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    // 追加6：Forms のURL（Share.isFormsUrl で確かめる。Share が無いときは https だけ）
    var fu = g.formsUrl, sh = S.Share;
    if (typeof fu === 'string' && fu && (sh && sh.isFormsUrl ? sh.isFormsUrl(fu) : /^https:\/\/[^\s"'<>]+$/.test(fu) && fu.length <= 400)) out.formsUrl = fu;
    return out;
  }
  var presetChecked = false;
  function checkPreset() {
    if (presetChecked) return;
    presetChecked = true;
    var p = root.SHOSU_PRESET && root.SHOSU_PRESET.goal;
    var pg = cleanGoal(p);
    if (!pg) return;
    var cur = cleanGoal(getJSON(GOAL_KEY, null));
    if (!cur || (pg.created || '') > (cur.created || '')) setGoal(pg);
  }
  function goal() { checkPreset(); return cleanGoal(getJSON(GOAL_KEY, null)); }
  function setGoal(g) {
    var c = cleanGoal(g);
    if (!c) return null;
    setJSON(GOAL_KEY, c);
    return c;
  }

  /* ---------- 計画の保存（'shosu.plan'） ---------- */
  function loadPlan() {
    var d = getJSON(PLAN_KEY, null);
    if (!isObj(d)) d = {};
    if (!isObj(d.settings)) d.settings = {};
    if (!isObj(d.plans)) d.plans = {};
    if (!isObj(d.roadmap)) d.roadmap = null;
    d.v = 1;
    return d;
  }
  function storePlan(d) { return setJSON(PLAN_KEY, d); }
  function settings() {
    var s = loadPlan().settings;
    var m = Number(s.extraMinutes);
    var days = s.extraDays;
    if (!(days === 'everyday' || days === 'weekdays' || Array.isArray(days))) days = 'weekdays';
    if (Array.isArray(days)) days = days.filter(function (x) { return x >= 0 && x <= 6; });
    return { extraMinutes: EXTRA_MINUTES.indexOf(m) >= 0 ? m : 0, extraDays: days };
  }
  function setSettings(o) {
    var d = loadPlan();
    for (var k in o) if (k === 'extraMinutes' || k === 'extraDays') d.settings[k] = o[k];
    storePlan(d);
    return settings();
  }
  function dayAllowed(date, extraDays) {
    var w = dow(date);
    if (extraDays === 'everyday') return true;
    if (Array.isArray(extraDays)) return extraDays.indexOf(w) >= 0;
    return w >= 1 && w <= 5;
  }

  /* ---------- 学習の一覧 ---------- */
  function lessonMinutes(no) {
    var li = lessonInfo(no);
    var left = li.total - li.ok;
    if (left <= 0) left = li.total; // 終わった時をもう一度するとき
    return Math.max(3, Math.round(left * PER_PROBLEM));
  }
  function ITEMS() {
    var out = [];
    lessonsArr().forEach(function (l) {
      var no = l.no;
      out.push({
        id: 'lesson-' + no, kind: 'lesson', ref: no, label: '第' + no + '時 れんしゅう', title: l.title || '',
        short: '第' + no + '時', minutes: lessonMinutes(no), href: '#/lesson/' + no,
        done: function () { return lessonInfo(no).stars >= 3; },
        stars: { got: lessonInfo(no).stars, max: 3 }
      });
    });
    topicsArr().forEach(function (t) {
      var id = t.id;
      out.push({
        id: 'review-' + id, kind: 'review', ref: id, label: 'ふくしゅう：' + t.title, title: t.title, short: t.title,
        minutes: REVIEW_MIN, href: '#/review/' + encodeURIComponent(id),
        done: function (date) {
          date = date || todayStr();
          return runCountOn('review-' + id, 'rv', date) >= 8 || eventsOn('review', date).some(function (e) { return String(e[2]).split(':')[0] === id; });
        },
        stars: { got: gotStars(['review-' + id + '-8', 'review-' + id + '-all']), max: 2 }
      });
    });
    MATOME_LEVELS.forEach(function (lv) {
      MATOME_TIMES.forEach(function (m) {
        out.push({
          id: 'matome-' + lv.id + '-' + m, kind: 'matome', ref: lv.id, label: 'まとめモード（' + lv.label + '）' + m + '分',
          title: lv.label + ' ' + m + '分', short: 'まとめ ' + lv.label, level: lv.id, minutes: m, href: '#/matome',
          done: function (date) {
            date = date || todayStr();
            return eventsOn('matome', date).length > 0 || runCountOn('matome', 'mt', date) >= 3;
          },
          stars: { got: gotStars(['matome-' + lv.id + '-finish', 'matome-' + lv.id + '-80', 'matome-' + lv.id + '-all']), max: 3 }
        });
      });
    });
    out.push({
      id: 'make', kind: 'make', ref: 'make', label: 'もんだいづくり', title: '問題を作る', short: 'もんだいづくり',
      minutes: MAKE_MIN, href: '#/make',
      done: function (date) { return madeOn(date || todayStr()); },
      stars: { got: gotStars(['sp-make1', 'sp-make-kinds', 'sp-make5']), max: 3 }
    });
    return out;
  }
  function itemMap() { var m = {}; ITEMS().forEach(function (it) { m[it.id] = it; }); return m; }
  function itemDone(it, date) {
    if (!it) return false;
    try { return !!it.done(date); } catch (e) { return false; }
  }

  /* ---------- 逆算の下書き ---------- */
  function draft(opts) {
    opts = opts || {};
    var g = opts.goal ? cleanGoal(opts.goal) : goal();
    if (!g) return null;
    var st = opts.settings || settings();
    var today = opts.today || todayStr();
    var items = itemMap();
    var byDate = {}, k;

    g.classes.forEach(function (c) {
      if (c.date < today || c.date >= g.date) return;
      var d = { date: c.date, type: 'class', minutes: c.minutes, items: [] };
      if (c.lesson) d.lesson = c.lesson;
      if (c.note) d.note = c.note;
      byDate[c.date] = d;
    });
    var extra = Number(st.extraMinutes) || 0;
    if (extra > 0 && today < g.date) {
      for (var dt = today, guard = 0; dt < g.date && guard < 120; dt = addDays(dt, 1), guard++) {
        if (!byDate[dt] && dayAllowed(dt, st.extraDays)) byDate[dt] = { date: dt, type: 'self', minutes: extra, items: [] };
      }
    }
    var days = [];
    for (k in byDate) days.push(byDate[k]);
    days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var classDays = days.filter(function (d) { return d.type === 'class'; });
    var unplaced = [];
    var placedAt = {};

    function used(d) { var n = 0; d.items.forEach(function (id) { n += items[id] ? items[id].minutes : 0; }); return n; }
    function free(d) { return d.minutes - used(d); }
    function put(d, id) { d.items.push(id); placedAt[id] = d.date; }
    // 日付の順に、入るいちばん早い日へ。from より前の日はのぞく
    function tryPlace(id, from) {
      var it = items[id];
      if (!it) return false;
      for (var j = 0; j < days.length; j++) {
        var d = days[j];
        if (from && d.date < from) continue;
        if (free(d) >= it.minutes) { put(d, id); return true; }
      }
      return false;
    }

    // 授業で習う日（第○時が入っている授業の日）
    var classOf = {}, lessonDate = {};
    g.classes.forEach(function (c) { if (c.lesson && !(c.lesson in lessonDate)) lessonDate[c.lesson] = c.date; });
    classDays.forEach(function (d) { if (d.lesson && !classOf[d.lesson]) classOf[d.lesson] = d; });
    function earliest(no) {
      if (lessonDate[no]) return lessonDate[no] > today ? lessonDate[no] : today;
      var best = null, bestNo = 0;
      for (var n in lessonDate) if (Number(n) < no && Number(n) > bestNo) { bestNo = Number(n); best = lessonDate[n]; }
      return best && best > today ? best : today;
    }

    var undone = lessonsArr().map(function (l) { return 'lesson-' + l.no; })
      .filter(function (id) { return items[id] && !itemDone(items[id]); });

    // 1. 第○時の授業の日には、その時を
    undone.forEach(function (id) {
      var d = classOf[items[id].ref];
      if (d && free(d) >= items[id].minutes) put(d, id);
    });

    // 2. まとめモード（ふつう）：ゴールの前日 → 最後の授業の日 → さらに前の日
    var cands = [], prev = addDays(g.date, -1);
    if (byDate[prev]) cands.push(byDate[prev]);
    if (classDays.length) cands.push(classDays[classDays.length - 1]);
    days.slice().reverse().forEach(function (d) { cands.push(d); });
    for (var c = 0; c < cands.length; c++) {
      // 20分は、ほかの学習の分もじゅうぶんのこるときだけ
      var f = free(cands[c]), cap = f >= 35 ? 20 : 15, mm = 0;
      MATOME_TIMES.forEach(function (t) { if (t <= f && t <= cap) mm = t; });
      if (mm) { put(cands[c], 'matome-normal-' + mm); break; }
    }

    // 3. のこりの時を、番号の順に
    var lastDate = today;
    undone.forEach(function (id) {
      if (placedAt[id]) { if (placedAt[id] > lastDate) lastDate = placedAt[id]; return; }
      var from = earliest(items[id].ref);
      // 番号の順を守る。入らなければ、順が前後しても入る日へ（先取りの決まりは守る）
      if (tryPlace(id, lastDate > from ? lastDate : from) || tryPlace(id, from)) { if (placedAt[id] > lastDate) lastDate = placedAt[id]; }
      else unplaced.push(id);
    });

    // 4. にがてな内容のふくしゅう
    var weak = opts.weak || weakness();
    function topicFrom(tid) {
      var from = today;
      for (var n in LESSON_TOPIC) if (LESSON_TOPIC[n] === tid && placedAt['lesson-' + n] && placedAt['lesson-' + n] > from) from = placedAt['lesson-' + n];
      return from;
    }
    var topicIds = topicsArr().map(function (t) { return t.id; }).filter(function (t) { return items['review-' + t]; });
    topicIds.filter(function (t) { return (weak[t] || 0) >= 0.25; })
      .sort(function (a, b) { return (weak[b] || 0) - (weak[a] || 0); })
      .forEach(function (t) { tryPlace('review-' + t, topicFrom(t)); });

    // 5. まだ何もない日に、ほかのふくしゅうを1つ
    var rest = topicIds.filter(function (t) { return !placedAt['review-' + t]; })
      .sort(function (a, b) { return (weak[b] || 0) - (weak[a] || 0); });
    days.forEach(function (d) {
      if (d.items.length) return;
      for (var i = 0; i < rest.length; i++) {
        var id = 'review-' + rest[i];
        if (topicFrom(rest[i]) <= d.date && free(d) >= items[id].minutes) { put(d, id); rest.splice(i, 1); return; }
      }
    });

    return { goalId: g.id, days: days, unplaced: unplaced, created: now().toISOString() };
  }

  /* ---------- 地図の保存 ---------- */
  function cleanRoadmap(rm) {
    if (!isObj(rm) || !Array.isArray(rm.days)) return null;
    var out = { goalId: String(rm.goalId || ''), days: [], unplaced: [], created: rm.created || '' };
    if (rm.edited) out.edited = rm.edited;
    rm.days.forEach(function (d) {
      if (!isObj(d) || !validYmd(d.date)) return;
      var o = { date: d.date, type: d.type === 'class' ? 'class' : 'self', minutes: Math.max(0, Number(d.minutes) || 0),
        items: (Array.isArray(d.items) ? d.items : []).filter(function (x) { return typeof x === 'string'; }) };
      if (d.lesson) o.lesson = d.lesson;
      if (d.note) o.note = d.note;
      out.days.push(o);
    });
    out.days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    out.unplaced = (Array.isArray(rm.unplaced) ? rm.unplaced : []).filter(function (x) { return typeof x === 'string'; });
    return out;
  }
  function roadmap() {
    var g = goal();
    if (!g) return null;
    var d = loadPlan();
    var rm = cleanRoadmap(d.roadmap);
    if (!rm || rm.goalId !== g.id) {
      rm = draft();
      d.roadmap = rm;
      storePlan(d);
    }
    return rm;
  }
  function saveRoadmap(rm) {
    var c = cleanRoadmap(rm);
    if (!c) return false;
    var d = loadPlan();
    d.roadmap = c;
    return storePlan(d);
  }
  function minutesOf(ids, items) {
    items = items || itemMap();
    var n = 0;
    (ids || []).forEach(function (id) { if (items[id]) n += items[id].minutes; });
    return n;
  }
  // through の日（ふくむ）までの、終わっていない項目
  function leftovers(rm, through) {
    rm = cleanRoadmap(rm);
    if (!rm) return [];
    through = through || addDays(todayStr(), -1);
    var items = itemMap(), out = [];
    rm.days.forEach(function (d) {
      if (d.date > through) return;
      d.items.forEach(function (id) { if (items[id] && !itemDone(items[id], d.date)) out.push({ date: d.date, id: id }); });
    });
    return out;
  }
  // のこりを、through の次の日（今日より前にはしない）からの日に回す。入らなければ unplaced へ
  function carryOver(rm, through) {
    rm = cleanRoadmap(rm);
    if (!rm) return { roadmap: null, moved: 0, unplaced: 0 };
    var today = todayStr();
    through = through || addDays(today, -1);
    var start = addDays(through, 1);
    if (start < today) start = today;
    var items = itemMap();
    var left = leftovers(rm, through);
    var moved = 0, nUn = 0;
    left.forEach(function (x) {
      rm.days.forEach(function (d) { if (d.date === x.date) d.items = d.items.filter(function (id) { return id !== x.id; }); });
    });
    left.forEach(function (x) {
      var already = rm.days.some(function (d) { return d.date >= start && d.items.indexOf(x.id) >= 0; });
      if (already) { moved++; return; }
      var it = items[x.id];
      for (var i = 0; i < rm.days.length; i++) {
        var d = rm.days[i];
        if (d.date < start) continue;
        if (d.minutes - minutesOf(d.items, items) >= it.minutes) { d.items.push(x.id); moved++; return; }
      }
      if (rm.unplaced.indexOf(x.id) < 0) rm.unplaced.push(x.id);
      nUn++;
    });
    return { roadmap: rm, moved: moved, unplaced: nUn };
  }

  /* ---------- 今日の計画 ---------- */
  function today() {
    var date = todayStr();
    var rm = null;
    try { rm = roadmap(); } catch (e) { rm = null; }
    var day = null;
    if (rm) rm.days.forEach(function (d) { if (d.date === date) day = d; });
    var st = settings();
    var extraToday = st.extraMinutes > 0 && dayAllowed(date, st.extraDays);
    return {
      date: date,
      type: day ? day.type : (extraToday ? 'self' : null),
      minutes: day ? day.minutes : (extraToday ? st.extraMinutes : 0),
      items: day ? day.items.slice() : [],
      lesson: day && day.lesson ? day.lesson : null,
      plan: plan(date)
    };
  }
  function compactInk(ink) {
    if (!ink || !Array.isArray(ink.strokes) || !ink.strokes.length) return null;
    return {
      w: Math.round(ink.w) || 800, h: Math.round(ink.h) || 200,
      strokes: ink.strokes.map(function (s) { return (s || []).map(function (p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; }); })
    };
  }
  function savePlan(tp) {
    if (!isObj(tp) || !validYmd(tp.date)) return false;
    var meate = isObj(tp.meate) ? tp.meate : {};
    var c = {
      date: tp.date,
      items: (Array.isArray(tp.items) ? tp.items : []).filter(function (x) { return typeof x === 'string'; }),
      meate: { choices: (Array.isArray(meate.choices) ? meate.choices : []).filter(function (x) { return typeof x === 'string'; }).slice(0, 2), ink: compactInk(meate.ink) },
      started: tp.started || now().toISOString()
    };
    var d = loadPlan();
    d.plans[c.date] = c;
    var keys = Object.keys(d.plans).sort();
    while (keys.length > 60) delete d.plans[keys.shift()];
    // 地図の今日の分も、えらんだものにそろえる
    var rm = cleanRoadmap(d.roadmap);
    if (rm) {
      rm.days.forEach(function (day) { if (day.date === c.date) day.items = c.items.slice(); });
      d.roadmap = rm;
    }
    return storePlan(d);
  }
  function plan(date) {
    var p = loadPlan().plans[date || todayStr()];
    return isObj(p) ? p : null;
  }

  /* ---------- めあての候補 ---------- */
  function catsOf(id) {
    var m = /^lesson-(\d+)$/.exec(id);
    if (m) {
      var n = +m[1];
      if (n <= 3) return ['hyo'];
      return ({ 4: ['shikumi'], 5: ['daisho'], 6: ['jubai'], 7: ['add'], 8: ['sub'], 9: ['kimari'], 10: ['matome'] })[n] || [];
    }
    m = /^review-(.+)$/.exec(id);
    if (m) return ({ hyoshikata: ['hyo'], shikumi: ['shikumi'], daisho: ['daisho'], jubai: ['jubai'], tashizan: ['add'], hikizan: ['sub'] })[m[1]] || [];
    if (/^matome-/.test(id)) return ['matome'];
    if (id === 'make') return ['make'];
    return [];
  }
  var CAT_TEXT = {
    add: ['筆算の小数点をそろえる', 'くり上がりに気をつける'],
    sub: ['筆算の小数点をそろえる', 'くり下がりに気をつける'],
    hyo: ['0.01や0.001の何こ分か考える', '目もりの大きさを先にたしかめる'],
    shikumi: ['0.01や0.001の何こ分か考える', '小数の位の名前を言える'],
    daisho: ['上の位から順にくらべる'],
    jubai: ['位が1つ上がる・下がるを考える'],
    kimari: ['計算のきまりでくふうして計算'],
    matome: ['時間内にさいごまでやる'],
    make: ['ともだちがとける問題を作る']
  };
  var CAT_TOPIC = { add: 'tashizan', sub: 'hikizan', hyo: 'hyoshikata', shikumi: 'shikumi', daisho: 'daisho', jubai: 'jubai', kimari: 'tashizan' };
  function meateCandidates(itemIds) {
    var out = [];
    function add(t) { if (t && typeof t === 'string' && out.indexOf(t) < 0) out.push(t); }
    try {
      if (S.Reflect && S.Reflect.nextSuggestions) (S.Reflect.nextSuggestions() || []).slice(0, 2).forEach(add);
    } catch (e) {}
    var cats = [];
    (itemIds || []).forEach(function (id) { catsOf(id).forEach(function (c) { if (cats.indexOf(c) < 0) cats.push(c); }); });
    cats.forEach(function (c) { (CAT_TEXT[c] || []).forEach(add); });
    add('ヒントを使わずに全問○');
    // にがてな内容：えらんだ学習に関係するものを先に、なければ全体でいちばん×が多いもの
    var w = weakness(), pick = null, best = 0.15;
    cats.forEach(function (c) { var t = CAT_TOPIC[c]; if (t && (w[t] || 0) > best) { best = w[t]; pick = t; } });
    if (!pick) for (var t in w) if (w[t] > best) { best = w[t]; pick = t; }
    if (pick && TOPIC_WORD[pick]) add('にがてな' + TOPIC_WORD[pick] + 'を3問○');
    return out;
  }

  /* ======================================================================
   * 画面（DOM）
   * ====================================================================== */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function arrows(el) { if (S.Icons && S.Icons.arrows) { try { S.Icons.arrows(el); } catch (e) {} } return el; }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return arrows(b);
  }
  // 自作の小さなSVG（絵文字は使わない）
  var SVG = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><path d="M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7z" fill="currentColor"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><path d="M5 12.5l4.4 4.3L19 7.2" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
    board: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 9.5h6M7 12.5h4M9 16l-2 4M15 16l2 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.2A7 7 0 0 1 15.5 3.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="18.5" cy="6" r="1.2" fill="currentColor"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><path d="M6 21V3.5M6 4h11l-2.6 4L17 12H6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true" class="pl-svg"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  function svg(name, cls) { var s = h('span', 'pl-ic ' + (cls || '')); s.innerHTML = SVG[name] || ''; return s; }
  function iconOr(name, fallback, cls) {
    if (S.Icons && S.Icons.has && S.Icons.has(name)) return S.Icons.el(name, { wrapCls: 'pl-ic ' + (cls || '') });
    return svg(fallback, cls);
  }
  function starsRow(st) {
    var w = h('span', 'pl-stars');
    if (!st || !st.max) return w;
    w.setAttribute('role', 'img');
    w.setAttribute('aria-label', '星 ' + st.got + ' / ' + st.max);
    for (var i = 0; i < st.max; i++) w.appendChild(svg('star', i < st.got ? 'pl-star on' : 'pl-star'));
    return w;
  }
  function typeBadge(type, lesson) {
    if (type === 'class') {
      var b = h('span', 'pl-badge pl-badge-class');
      b.appendChild(svg('board'));
      b.appendChild(document.createTextNode(lesson ? '授業（第' + lesson + '時）' : '授業'));
      return b;
    }
    if (type === 'self') {
      var s = h('span', 'pl-badge pl-badge-self');
      s.appendChild(svg('moon'));
      s.appendChild(document.createTextNode('じぶんの時間'));
      return s;
    }
    return h('span', 'pl-badge pl-badge-none', 'よていのない日');
  }
  function timeBar(total, avail) {
    var w = h('div', 'pl-bar');
    var over = avail > 0 && total > avail;
    w.classList.toggle('pl-bar-over', over);
    var track = h('div', 'pl-bar-track');
    var fill = h('div', 'pl-bar-fill');
    var pct = avail > 0 ? Math.min(100, Math.round(total / avail * 100)) : (total > 0 ? 100 : 0);
    fill.style.width = pct + '%';
    track.appendChild(fill);
    w.appendChild(track);
    var txt = avail > 0 ? 'ごうけい ' + total + '分 ／ 使える時間 ' + avail + '分' : 'ごうけい ' + total + '分';
    if (over) txt += '（' + (total - avail) + '分 オーバー）';
    w.appendChild(h('div', 'pl-bar-text', txt));
    return w;
  }
  function modal(title, body, onClose) {
    var back = h('div', 'pl-modal-back');
    var box = h('div', 'pl-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', title);
    var head = h('div', 'pl-modal-head');
    head.appendChild(h('h3', null, title));
    var x = button('とじる', 'pl-modal-close', close);
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(body);
    back.appendChild(box);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    document.body.appendChild(back);
    function close() { if (back.parentNode) back.parentNode.removeChild(back); if (onClose) onClose(); }
    return { close: close, el: box };
  }

  /* 学習の一覧（第○時・ふくしゅう・まとめ・もんだいづくり）。isOn(id) で選ばれている印、onPick(id) */
  function pickerEl(isOn, onPick, date) {
    var items = ITEMS();
    var wrap = h('div', 'pl-picker');
    function card(it, txt, sub) {
      var b = h('button', 'pl-pick');
      b.type = 'button';
      b.dataset.id = it.id;
      var on = isOn(it.id);
      if (on) b.classList.add('on');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var top = h('span', 'pl-pick-top');
      top.appendChild(h('span', 'pl-pick-name', txt));
      if (on) top.appendChild(svg('check', 'pl-pick-check'));
      b.appendChild(top);
      if (sub) b.appendChild(h('span', 'pl-pick-sub', sub));
      var foot = h('span', 'pl-pick-foot');
      foot.appendChild(h('span', 'pl-pick-min', '約' + it.minutes + '分'));
      foot.appendChild(starsRow(it.stars));
      b.appendChild(foot);
      if (it.kind === 'lesson' ? itemDone(it) : itemDone(it, date)) b.classList.add('pl-pick-done');
      b.addEventListener('click', function () { onPick(it.id); });
      return b;
    }
    function group(title, list, cls) {
      var g = h('div', 'pl-pick-group ' + (cls || ''));
      g.appendChild(h('div', 'pl-pick-title', title));
      var grid = h('div', 'pl-pick-grid');
      list.forEach(function (x) { grid.appendChild(x); });
      g.appendChild(grid);
      wrap.appendChild(g);
    }
    group('第1〜10時の れんしゅう', items.filter(function (it) { return it.kind === 'lesson'; })
      .map(function (it) { return card(it, it.short, it.title); }), 'pl-pg-lesson');
    group('ふくしゅう（10問）', items.filter(function (it) { return it.kind === 'review'; })
      .map(function (it) { return card(it, it.short, null); }), 'pl-pg-review');
    // まとめモード：レベルごとに時間をえらぶ
    var mg = h('div', 'pl-pick-group pl-pg-matome');
    mg.appendChild(h('div', 'pl-pick-title', 'まとめモード（レベルと時間）'));
    MATOME_LEVELS.forEach(function (lv) {
      var row = h('div', 'pl-mm-row');
      var lab = h('span', 'pl-mm-level');
      lab.appendChild(document.createTextNode(lv.label));
      var any = items.filter(function (it) { return it.id === 'matome-' + lv.id + '-5'; })[0];
      if (any) lab.appendChild(starsRow(any.stars));
      row.appendChild(lab);
      MATOME_TIMES.forEach(function (m) {
        var id = 'matome-' + lv.id + '-' + m;
        var on = isOn(id);
        var b = h('button', 'pl-chip' + (on ? ' on' : ''), m + '分');
        b.type = 'button';
        b.dataset.id = id;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', 'まとめモード ' + lv.label + ' ' + m + '分');
        b.addEventListener('click', function () { onPick(id); });
        row.appendChild(b);
      });
      mg.appendChild(row);
    });
    wrap.appendChild(mg);
    group('もんだいづくり', items.filter(function (it) { return it.kind === 'make'; })
      .map(function (it) { return card(it, it.short, '問題を作って、ともだちに送ろう'); }), 'pl-pg-make');
    return wrap;
  }

  /* 手書きの欄（文字に変換しない）。ink() で {w,h,strokes} */
  function inkPad(height, init) {
    var wrap = h('div', 'pl-ink');
    var cv = h('canvas', 'pl-ink-canvas');
    var clr = button('けす', 'small pl-ink-clear');
    wrap.appendChild(cv);
    wrap.appendChild(clr);
    var strokes = [], cur = null, cw = 0, ch = height;
    if (init && Array.isArray(init.strokes)) {
      strokes = init.strokes.map(function (s) { return s.map(function (p) { return { x: p.x, y: p.y }; }); });
      cw = init.w || 0;
    }
    var baseW = init && init.w ? init.w : 0; // 書いたときの幅（あとから大きさが変わったら合わせる）
    function ctx() { return cv.getContext('2d'); }
    function size() {
      var w = Math.floor(wrap.clientWidth - 2) || 600;
      var r = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
      if (!baseW) baseW = w;
      cw = w;
      cv.width = w * r; cv.height = ch * r;
      cv.style.width = w + 'px'; cv.style.height = ch + 'px';
      var c = ctx();
      if (c) c.setTransform(r, 0, 0, r, 0, 0);
      draw();
    }
    function draw() {
      var c = ctx();
      if (!c) return;
      c.clearRect(0, 0, cw, ch);
      c.strokeStyle = '#d8dcef'; c.lineWidth = 1; c.setLineDash([6, 6]);
      c.beginPath(); c.moveTo(10, ch * 0.72); c.lineTo(cw - 10, ch * 0.72); c.stroke();
      c.setLineDash([]);
      var k = baseW ? cw / baseW : 1;
      c.strokeStyle = '#2a3566'; c.lineWidth = 3.4; c.lineCap = 'round'; c.lineJoin = 'round';
      strokes.forEach(function (s) {
        if (!s.length) return;
        c.beginPath(); c.moveTo(s[0].x * k, s[0].y * k);
        for (var i = 1; i < s.length; i++) c.lineTo(s[i].x * k, s[i].y * k);
        if (s.length === 1) c.lineTo(s[0].x * k + 0.1, s[0].y * k);
        c.stroke();
      });
    }
    function pos(e) {
      var r = cv.getBoundingClientRect(), k = baseW ? baseW / cw : 1;
      return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
    }
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      cur = [pos(e)]; strokes.push(cur); draw();
    });
    cv.addEventListener('pointermove', function (e) { if (!cur) return; cur.push(pos(e)); draw(); });
    function end() { cur = null; }
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    clr.addEventListener('click', function () { strokes = []; draw(); });
    var ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(function () { if (Math.floor(wrap.clientWidth - 2) !== cw) size(); }); ro.observe(wrap); }
    setTimeout(size, 0);
    return {
      el: wrap,
      ink: function () { return strokes.length ? { w: baseW || cw, h: Math.round(ch * (baseW && cw ? baseW / cw : 1)), strokes: strokes } : null; },
      destroy: function () { if (ro) ro.disconnect(); }
    };
  }
  function drawInk(ink, w, hgt) {
    if (S.Present && S.Present.drawInk) {
      try { return S.Present.drawInk(ink, { width: w, height: hgt, trim: true, lineWidth: 4 }); } catch (e) {}
    }
    var cv = h('canvas', 'pl-ink-view');
    var r = Math.max(1, Math.min(3, root.devicePixelRatio || 1));
    cv.width = w * r; cv.height = hgt * r; cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    var c = cv.getContext && cv.getContext('2d');
    if (!c || !ink) return cv;
    var k = Math.min(w / (ink.w || 800), hgt / (ink.h || 200));
    c.setTransform(r * k, 0, 0, r * k, 0, 0);
    c.strokeStyle = '#2a3566'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    (ink.strokes || []).forEach(function (s) {
      if (!s.length) return;
      c.beginPath(); c.moveTo(s[0].x, s[0].y);
      for (var i = 1; i < s.length; i++) c.lineTo(s[i].x, s[i].y);
      c.stroke();
    });
    return cv;
  }
  function noGoalBox() {
    var b = h('div', 'pl-panel pl-nogoal');
    b.appendChild(iconOr('telescope', 'flag', 'pl-nogoal-ic'));
    b.appendChild(h('p', 'pl-nogoal-msg', 'まだゴールがありません。'));
    b.appendChild(h('p', 'pl-nogoal-sub', '先生からゴールのコードをもらって、ホームの「もらったコードをひらく」にはってね。'));
    var row = h('div', 'pl-row');
    var a = h('a', 'btn primary', '今日の計画だけ立てる ▶'); a.href = '#/plan/today';
    row.appendChild(arrows(a));
    var hm = h('a', 'btn', 'ホームへ'); hm.href = '#/';
    row.appendChild(hm);
    b.appendChild(row);
    return b;
  }

  /* ---------- 地図（ゴールまでの旅） ---------- */
  function mountRoadmap(el) {
    if (!hasDOM || !el) return { destroy: function () {} };
    var root0 = h('div', 'pl-root pl-roadmap');
    el.appendChild(root0);
    var open = null;   // ひらいているカード {date, id} または {unplaced:id}
    var dlg = null;
    var note = '';

    function render() {
      root0.innerHTML = '';
      var g = goal();
      if (!g) { root0.appendChild(noGoalBox()); return; }
      var rm = roadmap();
      var items = itemMap();
      var t = todayStr();
      var left = diffDays(t, g.date);

      // ゴール
      var head = h('div', 'pl-panel pl-goal');
      head.appendChild(iconOr('flag', 'flag', 'pl-goal-ic'));
      var gt = h('div', 'pl-goal-text');
      gt.appendChild(h('div', 'pl-goal-name', g.name));
      gt.appendChild(h('div', 'pl-goal-date', 'ゴールの日：' + dateLong(g.date)));
      head.appendChild(gt);
      var cnt = h('div', 'pl-goal-left');
      if (left > 0) { cnt.appendChild(h('span', 'pl-goal-left-s', 'あと')); cnt.appendChild(h('span', 'pl-goal-left-n', String(left))); cnt.appendChild(h('span', 'pl-goal-left-s', '日')); }
      else cnt.appendChild(h('span', 'pl-goal-left-s', left === 0 ? 'きょうがゴールの日' : 'ゴールの日はおわったよ'));
      head.appendChild(cnt);
      root0.appendChild(head);

      // 設定：授業のほかに使える時間
      var st = settings();
      var set = h('div', 'pl-panel pl-settings');
      var r1 = h('div', 'pl-set-row');
      r1.appendChild(h('span', 'pl-set-label', '授業のほかに使える時間（1日）'));
      EXTRA_MINUTES.forEach(function (m) {
        var b = h('button', 'pl-chip' + (st.extraMinutes === m ? ' on' : ''), m ? m + '分' : 'なし');
        b.type = 'button';
        b.setAttribute('aria-pressed', st.extraMinutes === m ? 'true' : 'false');
        b.addEventListener('click', function () { changeSettings({ extraMinutes: m }); });
        r1.appendChild(b);
      });
      set.appendChild(r1);
      var r2 = h('div', 'pl-set-row');
      r2.appendChild(h('span', 'pl-set-label', 'その日'));
      [['everyday', '毎日'], ['weekdays', '平日だけ']].forEach(function (x) {
        var on = st.extraDays === x[0];
        var b = h('button', 'pl-chip' + (on ? ' on' : ''), x[1]);
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.disabled = !st.extraMinutes;
        b.addEventListener('click', function () { changeSettings({ extraDays: x[0] }); });
        r2.appendChild(b);
      });
      set.appendChild(r2);
      var acts = h('div', 'pl-set-acts');
      acts.appendChild(button('下書きを作り直す', 'pl-redraft', function () {
        var r = draft();
        if (r) { saveRoadmap(r); note = '下書きを作り直したよ'; open = null; render(); }
      }));
      var lo = leftovers(rm);
      var carry = button('のこりを次の日に回す' + (lo.length ? '（' + lo.length + 'こ）' : ''), 'pl-carry', function () {
        var res = carryOver(rm);
        if (res.roadmap) { saveRoadmap(res.roadmap); note = res.moved + 'こ を次の日からに回したよ' + (res.unplaced ? '（入りきらない ' + res.unplaced + 'こ は下にあるよ）' : ''); render(); }
      });
      carry.disabled = !lo.length;
      acts.appendChild(carry);
      set.appendChild(acts);
      if (note) { set.appendChild(h('div', 'pl-note', note)); note = ''; }
      root0.appendChild(set);

      // 航路
      var line = h('ol', 'pl-route');
      var days = rm.days.filter(function (d) { return d.date >= t; });
      var dateList = days.map(function (d) { return d.date; });
      if (!days.length) line.appendChild(h('li', 'pl-day pl-day-empty', '今日からゴールまでの、使える日がありません。授業のほかに使える時間をえらんでね。'));
      days.forEach(function (d, di) {
        var li = h('li', 'pl-day pl-day-' + d.type + (d.date === t ? ' pl-day-today' : ''));
        li.dataset.date = d.date;
        li.appendChild(h('span', 'pl-node'));
        var card = h('div', 'pl-day-card');
        var dh = h('div', 'pl-day-head');
        var dl = h('span', 'pl-day-date', (d.date === t ? '今日 ' : '') + dateShort(d.date));
        dh.appendChild(dl);
        dh.appendChild(typeBadge(d.type, d.lesson));
        if (d.note) dh.appendChild(h('span', 'pl-day-note', d.note));
        card.appendChild(dh);
        // あしたが「第○時」の授業なら、「みる」を見ておくおすすめ
        var nx = days[di + 1];
        if (nx && nx.type === 'class' && nx.lesson && diffDays(d.date, nx.date) === 1 && !(lessonInfo(nx.lesson).stars >= 3)) {
          card.appendChild(h('div', 'pl-tip', 'あしたは第' + nx.lesson + '時の授業。「みる」を先に見ておくといいよ'));
        }
        var list = h('div', 'pl-cards');
        d.items.forEach(function (id) {
          var it = items[id];
          if (!it) return;
          list.appendChild(itemCard(it, d, dateList));
        });
        var add = h('button', 'pl-add');
        add.type = 'button';
        add.setAttribute('aria-label', dateShort(d.date) + 'に学習をくわえる');
        add.appendChild(svg('plus'));
        add.appendChild(h('span', null, 'くわえる'));
        add.addEventListener('click', function () { openAdd(d.date); });
        list.appendChild(add);
        card.appendChild(list);
        card.appendChild(timeBar(minutesOf(d.items, items), d.minutes));
        if (d.date === t) {
          var undoneToday = d.items.filter(function (id) { return items[id] && !itemDone(items[id], d.date); });
          if (undoneToday.length && di < days.length - 1) {
            card.appendChild(button('今日ののこりを次の日に回す', 'small pl-carry-today', function () {
              var res = carryOver(rm, t);
              if (res.roadmap) { saveRoadmap(res.roadmap); note = res.moved + 'こ を次の日からに回したよ'; render(); }
            }));
          }
        }
        li.appendChild(card);
        line.appendChild(li);
      });
      var gl = h('li', 'pl-day pl-day-goal');
      gl.appendChild(h('span', 'pl-node pl-node-goal'));
      var gc = h('div', 'pl-day-card');
      var gh = h('div', 'pl-day-head');
      gh.appendChild(h('span', 'pl-day-date', dateShort(g.date)));
      var gb = h('span', 'pl-badge pl-badge-goal');
      gb.appendChild(svg('flag'));
      gb.appendChild(document.createTextNode('ゴール：' + g.name));
      gh.appendChild(gb);
      gc.appendChild(gh);
      gl.appendChild(gc);
      line.appendChild(gl);
      root0.appendChild(line);

      if (rm.unplaced.length) {
        var up = h('div', 'pl-panel pl-unplaced');
        up.appendChild(h('div', 'pl-unplaced-title', '入りきらなかった学習（タップして日をえらぼう）'));
        var ul = h('div', 'pl-cards');
        rm.unplaced.forEach(function (id) { if (items[id]) ul.appendChild(itemCard(items[id], null, dateList)); });
        up.appendChild(ul);
        root0.appendChild(up);
      }
      var foot = h('div', 'pl-row pl-foot');
      var tp = h('a', 'btn primary', '今日の計画を立てる ▶'); tp.href = '#/plan/today';
      foot.appendChild(arrows(tp));
      root0.appendChild(foot);
    }

    function itemCard(it, day, dateList) {
      var date = day ? day.date : null;
      var done = it.kind === 'lesson' ? itemDone(it) : (date ? itemDone(it, date) : false);
      var wrap = h('div', 'pl-card-wrap');
      var b = h('button', 'pl-card pl-k-' + it.kind + (done ? ' pl-card-done' : ''));
      b.type = 'button';
      var nm = h('span', 'pl-card-name', it.label);
      b.appendChild(nm);
      var ft = h('span', 'pl-card-foot');
      ft.appendChild(h('span', 'pl-card-min', '約' + it.minutes + '分'));
      if (done) { var dm = svg('star', 'pl-card-donemark'); dm.setAttribute('title', 'おわり'); ft.appendChild(dm); ft.appendChild(h('span', 'pl-card-donetext', 'おわり')); }
      b.appendChild(ft);
      var isOpen = open && open.id === it.id && open.date === date;
      b.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      b.addEventListener('click', function () { open = isOpen ? null : { id: it.id, date: date }; render(); });
      wrap.appendChild(b);
      if (isOpen) wrap.appendChild(cardMenu(it, date, dateList));
      return wrap;
    }
    function cardMenu(it, date, dateList) {
      var m = h('div', 'pl-menu');
      var row = h('div', 'pl-menu-row');
      var go = h('a', 'btn small primary', 'はじめる ▶'); go.href = it.href;
      row.appendChild(arrows(go));
      row.appendChild(button('けす', 'small danger', function () {
        update(function (rm) {
          if (date) rm.days.forEach(function (d) { if (d.date === date) { var i = d.items.indexOf(it.id); if (i >= 0) d.items.splice(i, 1); } });
          else rm.unplaced = rm.unplaced.filter(function (x) { return x !== it.id; });
        });
      }));
      row.appendChild(button('やめる', 'small', function () { open = null; render(); }));
      m.appendChild(row);
      m.appendChild(h('div', 'pl-menu-label', '別の日に動かす'));
      var dr = h('div', 'pl-menu-dates');
      dateList.forEach(function (ds) {
        if (ds === date) return;
        var b = h('button', 'pl-chip pl-chip-date', dateShort(ds));
        b.type = 'button';
        b.addEventListener('click', function () {
          update(function (rm) {
            if (date) rm.days.forEach(function (d) { if (d.date === date) { var i = d.items.indexOf(it.id); if (i >= 0) d.items.splice(i, 1); } });
            else rm.unplaced = rm.unplaced.filter(function (x) { return x !== it.id; });
            rm.days.forEach(function (d) { if (d.date === ds && d.items.indexOf(it.id) < 0) d.items.push(it.id); });
          });
        });
        dr.appendChild(b);
      });
      m.appendChild(dr);
      return m;
    }
    function update(fn) {
      var rm = roadmap();
      if (!rm) return;
      fn(rm);
      rm.edited = now().toISOString();
      saveRoadmap(rm);
      open = null;
      render();
    }
    function openAdd(date) {
      var body = h('div', 'pl-add-body');
      body.appendChild(h('p', 'pl-add-note', dateShort(date) + 'にくわえる学習をタップしてね'));
      var cur = (roadmap().days.filter(function (d) { return d.date === date; })[0] || { items: [] }).items;
      body.appendChild(pickerEl(function (id) { return cur.indexOf(id) >= 0; }, function (id) {
        update(function (rm) {
          rm.days.forEach(function (d) { if (d.date === date && d.items.indexOf(id) < 0) d.items.push(id); });
          rm.unplaced = rm.unplaced.filter(function (x) { return x !== id; });
        });
        if (dlg) dlg.close();
      }, date));
      dlg = modal('学習をくわえる', body, function () { dlg = null; });
    }
    function changeSettings(o) {
      setSettings(o);
      var r = draft();
      if (r) saveRoadmap(r);
      note = '使える時間にあわせて、下書きを作り直したよ';
      open = null;
      render();
    }
    render();
    return { destroy: function () { if (dlg) dlg.close(); if (root0.parentNode) root0.parentNode.removeChild(root0); } };
  }

  /* ---------- 今日の計画（1分で立てる） ---------- */
  function mountToday(el) {
    if (!hasDOM || !el) return { destroy: function () {} };
    var root0 = h('div', 'pl-root pl-today');
    el.appendChild(root0);
    var td = today();
    var prev = td.plan;
    var selected = prev ? prev.items.slice() : td.items.slice();
    var recommended = td.items.slice();
    var meate = prev && prev.meate ? (prev.meate.choices || []).slice(0, 2) : [];
    var showList = false;
    var pad = null;
    var padInk = prev && prev.meate ? prev.meate.ink : null;

    // 手書きは描き直しても消えないように、1つだけ作って使い回す
    var meateBox = h('div', 'pl-panel pl-meate');
    var candWrap = h('div', 'pl-cands');
    meateBox.appendChild(h('h3', 'pl-h', 'めあて'));
    meateBox.appendChild(h('p', 'pl-sub', 'えらぶ（2つまで）か、自分のことばで書こう。どちらも使えるよ'));
    meateBox.appendChild(candWrap);
    var inkLabel = h('div', 'pl-ink-label');
    inkLabel.appendChild(iconOr('pen', 'plus'));
    inkLabel.appendChild(document.createTextNode('自分のことばで書く（書かなくてもOK）'));
    meateBox.appendChild(inkLabel);
    pad = inkPad(110, padInk);
    meateBox.appendChild(pad.el);

    var topArea = h('div');
    var bottom = h('div', 'pl-row pl-start-row');
    root0.appendChild(topArea);
    root0.appendChild(meateBox);
    root0.appendChild(bottom);

    function render() {
      topArea.innerHTML = '';
      var items = itemMap();
      var head = h('div', 'pl-panel pl-today-head');
      var hl = h('div', 'pl-today-date');
      hl.appendChild(h('span', 'pl-today-day', '今日 ' + dateLong(td.date)));
      hl.appendChild(typeBadge(td.type, td.lesson));
      head.appendChild(hl);
      var g = goal();
      if (g) {
        var left = diffDays(td.date, g.date);
        if (left > 0) head.appendChild(h('div', 'pl-today-goal', g.name + 'まで あと' + left + '日'));
      }
      topArea.appendChild(head);

      var sec = h('div', 'pl-panel pl-todo');
      sec.appendChild(h('h3', 'pl-h', 'きょう やること'));
      var list = h('div', 'pl-todo-list');
      var shown = recommended.concat(selected.filter(function (id) { return recommended.indexOf(id) < 0; }));
      if (!shown.length) list.appendChild(h('div', 'pl-empty', td.type ? '地図には今日の予定がないよ。下の一覧からえらぼう' : '下の一覧から、やりたい学習をえらぼう'));
      shown.forEach(function (id) {
        var it = items[id];
        if (!it) return;
        var on = selected.indexOf(id) >= 0;
        var row = h('button', 'pl-todo-item' + (on ? ' on' : ''));
        row.type = 'button';
        row.setAttribute('role', 'checkbox');
        row.setAttribute('aria-checked', on ? 'true' : 'false');
        var box = h('span', 'pl-check');
        if (on) box.appendChild(svg('check'));
        row.appendChild(box);
        var nm = h('span', 'pl-todo-name', it.label);
        if (recommended.indexOf(id) >= 0) nm.appendChild(h('span', 'pl-tag', '地図のおすすめ'));
        row.appendChild(nm);
        row.appendChild(h('span', 'pl-todo-min', '約' + it.minutes + '分'));
        row.appendChild(starsRow(it.stars));
        row.addEventListener('click', function () { toggle(id); });
        list.appendChild(row);
      });
      sec.appendChild(list);
      var tg = button(showList ? '一覧をとじる' : 'ほかの学習を一覧からくわえる', 'pl-more' + (showList ? '' : ' pl-more-open'), function () { showList = !showList; render(); });
      if (!showList) tg.insertBefore(svg('plus'), tg.firstChild);
      sec.appendChild(tg);
      if (showList) sec.appendChild(pickerEl(function (id) { return selected.indexOf(id) >= 0; }, toggle, td.date));
      sec.appendChild(timeBar(minutesOf(selected, items), td.minutes));
      if (!td.minutes) sec.appendChild(h('div', 'pl-note-soft', '今日は使える時間が決まっていない日。できる分だけやろう'));
      topArea.appendChild(sec);

      // めあての候補
      candWrap.innerHTML = '';
      var cands = meateCandidates(selected);
      meate.forEach(function (m) { if (cands.indexOf(m) < 0) cands.unshift(m); });
      cands.forEach(function (c) {
        var on = meate.indexOf(c) >= 0;
        var b = h('button', 'pl-cand' + (on ? ' on' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        var bx = h('span', 'pl-check pl-check-s');
        if (on) bx.appendChild(svg('check'));
        b.appendChild(bx);
        b.appendChild(h('span', null, c));
        b.disabled = !on && meate.length >= 2;
        b.addEventListener('click', function () {
          var i = meate.indexOf(c);
          if (i >= 0) meate.splice(i, 1); else if (meate.length < 2) meate.push(c);
          render();
        });
        candWrap.appendChild(b);
      });

      bottom.innerHTML = '';
      var start = button('スタート ▶', 'primary pl-start', function () {
        var tp = { date: td.date, items: selected.slice(), meate: { choices: meate.slice(), ink: pad ? pad.ink() : null }, started: now().toISOString() };
        savePlan(tp);
        try { if (S.Stars && S.Stars.log) S.Stars.log('plan', { date: td.date }); } catch (e) {}
        location.hash = '#/';
      });
      start.disabled = !selected.length;
      bottom.appendChild(start);
      var mp = h('a', 'btn', 'ゴールまでの地図を見る'); mp.href = '#/plan';
      bottom.appendChild(mp);
    }
    function toggle(id) {
      var i = selected.indexOf(id);
      if (i >= 0) selected.splice(i, 1); else selected.push(id);
      render();
    }
    render();
    return { destroy: function () { if (pad) pad.destroy(); if (root0.parentNode) root0.parentNode.removeChild(root0); } };
  }

  /* ---------- ホーム上部「きょうの計画」 ---------- */
  function todayPanel() {
    if (!hasDOM) return null;
    var date = todayStr();
    var p = plan(date);
    var box = h('section', 'pl-root pl-home');
    if (!p) {
      box.classList.add('pl-home-empty');
      var a = h('a', 'pl-home-make');
      a.href = '#/plan/today';
      a.appendChild(iconOr('rocket', 'flag', 'pl-home-make-ic'));
      var tx = h('span', 'pl-home-make-text');
      tx.appendChild(h('span', 'pl-home-make-title', '今日の計画を立てよう'));
      tx.appendChild(h('span', 'pl-home-make-sub', '1分でできるよ。やることと、めあてをきめよう'));
      a.appendChild(tx);
      a.appendChild(arrows(h('span', 'pl-home-make-go', 'たてる ▶')));
      box.appendChild(a);
      return box;
    }
    var items = itemMap();
    var head = h('div', 'pl-home-head');
    head.appendChild(h('h2', 'pl-home-title', 'きょうの計画'));
    var edit = h('a', 'btn small pl-home-edit', 'なおす'); edit.href = '#/plan/today';
    head.appendChild(edit);
    box.appendChild(head);
    var body = h('div', 'pl-home-body');
    var mt = h('div', 'pl-home-meate');
    mt.appendChild(h('span', 'pl-home-label', 'めあて'));
    var mtx = h('div', 'pl-home-meate-list');
    (p.meate && p.meate.choices || []).forEach(function (c) { mtx.appendChild(h('span', 'pl-home-meate-item', c)); });
    if (p.meate && p.meate.ink) {
      var cv = drawInk(p.meate.ink, 260, 48);
      cv.classList.add('pl-home-ink');
      mtx.appendChild(cv);
    }
    if (!mtx.childNodes.length) mtx.appendChild(h('span', 'pl-home-meate-none', '（めあては まだないよ）'));
    mt.appendChild(mtx);
    body.appendChild(mt);
    var ul = h('ul', 'pl-home-list');
    var nDone = 0;
    p.items.forEach(function (id) {
      var it = items[id];
      if (!it) return;
      var done = it.kind === 'lesson' ? itemDone(it) : itemDone(it, date);
      if (done) nDone++;
      var li = h('li');
      var a = h('a', 'pl-home-item' + (done ? ' done' : ''));
      a.href = it.href;
      var c = h('span', 'pl-check');
      if (done) c.appendChild(svg('check'));
      a.appendChild(c);
      a.appendChild(h('span', 'pl-home-item-name', it.label));
      a.appendChild(h('span', 'pl-home-item-min', done ? 'できた' : '約' + it.minutes + '分'));
      li.appendChild(a);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var side = h('div', 'pl-home-side');
    side.appendChild(h('div', 'pl-home-count', nDone + ' / ' + p.items.length + ' できた'));
    var rf = h('a', 'btn primary pl-home-reflect');
    rf.href = '#/reflect';
    rf.appendChild(iconOr('pen', 'check'));
    rf.appendChild(document.createTextNode('ふりかえりを書く'));
    side.appendChild(rf);
    body.appendChild(side);
    box.appendChild(body);
    return box;
  }

  var Planner = {
    goal: goal, setGoal: setGoal,
    settings: settings, setSettings: setSettings,
    ITEMS: ITEMS,
    draft: draft, roadmap: roadmap, saveRoadmap: saveRoadmap,
    leftovers: leftovers, carryOver: carryOver,
    today: today, savePlan: savePlan, plan: plan,
    meateCandidates: meateCandidates,
    weakness: weakness,
    mountRoadmap: mountRoadmap, mountToday: mountToday, todayPanel: todayPanel,
    EXTRA_MINUTES: EXTRA_MINUTES,
    // テスト用
    _setClock: function (fn) { clockFn = typeof fn === 'function' ? fn : null; },
    _resetPreset: function () { presetChecked = false; },
    _dates: { addDays: addDays, diffDays: diffDays, todayStr: todayStr, dateLong: dateLong }
  };
  S.Planner = Planner;
  if (typeof module === 'object' && module.exports) module.exports = Planner;
})(typeof window !== 'undefined' ? window : globalThis);
