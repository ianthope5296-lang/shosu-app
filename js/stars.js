/* Shosu.Stars — 星（★ふつうの星・✦とくべつな星）と称号（担当H）
 *
 * 星の決まり（CATALOG）・称号の表（TITLES）・記録からの計算・ゲット表示・称号アップのおいわい・星のずかん。
 * 保存：localStorage 'shosu.stars'
 *   { v:1, got:{星id: もらった時刻ms}, made:{tokenハッシュ: kind}, friend:{tokenハッシュ: {c:0|1, a:authorKeyハッシュ}},
 *     present:{tokenハッシュ:1}, more:もっとれんしゅう○の数(記録したぶん), title:いまの称号id, ev:[出来事の記録(新しい100こ)] }
 * token は長い（最大6000字）ので、ハッシュにしてから保存する。
 * classic script。Node でも require できる（DOM を使う部分は呼ばなければ動かない）。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var KEY = 'shosu.stars';
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;

  /* ---------- 星のカタログ ---------- */
  var LEVELS = [{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }];
  var REVIEW_TOPICS = [
    { id: 'hyoshikata', title: '表し方・単位' },
    { id: 'shikumi', title: 'しくみ・数の構成' },
    { id: 'daisho', title: '大小' },
    { id: 'jubai', title: '10倍・1/10' },
    { id: 'tashizan', title: 'たし算' },
    { id: 'hikizan', title: 'ひき算' }
  ];
  var MAKE_KINDS = ['hissan', 'fill', 'compare', 'masu', 'numberline'];
  var KIND_ALIAS = { word: 'fill', bunsho: 'fill', story: 'fill', daisho: 'compare', line: 'numberline', suchokusen: 'numberline' };
  var MORE_STEPS = [10, 30, 50];

  var CATALOG = [];
  function add(o) { CATALOG.push(o); return o; }
  (function build() {
    var n, i;
    for (n = 1; n <= 10; n++) {
      add({ id: 'lesson-' + n + '-try', kind: 'normal', group: 'lesson', sub: n, step: 1, label: '第' + n + '時 とりくんだ', short: 'とりくんだ',
        how: '第' + n + '時の「れんしゅう」を1問でもやってみよう' });
      add({ id: 'lesson-' + n + '-half', kind: 'normal', group: 'lesson', sub: n, step: 2, label: '第' + n + '時 半分以上○', short: '半分以上○',
        how: '第' + n + '時の「れんしゅう」で、半分より多く○をとろう' });
      add({ id: 'lesson-' + n + '-all', kind: 'normal', group: 'lesson', sub: n, step: 3, label: '第' + n + '時 全問○', short: '全問○',
        how: '第' + n + '時の「れんしゅう」を、ぜんぶ○にしよう（まちがえた問題も、やり直せばOK）' });
    }
    LEVELS.forEach(function (lv) {
      add({ id: 'matome-' + lv.id + '-finish', kind: 'normal', group: 'matome', sub: lv.id, label: 'まとめ（' + lv.label + '）さいごまで', short: 'さいごまで',
        how: 'まとめモード「' + lv.label + '」を、さいごの問題までやろう' });
      add({ id: 'matome-' + lv.id + '-80', kind: 'normal', group: 'matome', sub: lv.id, label: 'まとめ（' + lv.label + '）8わり○', short: '8わり以上○',
        how: 'まとめモード「' + lv.label + '」をさいごまでやって、10問中8問くらい（8わり）より多く○をとろう' });
      add({ id: 'matome-' + lv.id + '-all', kind: 'normal', group: 'matome', sub: lv.id, label: 'まとめ（' + lv.label + '）全問○', short: '全問○',
        how: 'まとめモード「' + lv.label + '」で、10問以上ぜんぶ○にしよう' });
    });
    add({ id: 'matome-20min', kind: 'normal', group: 'matome', sub: 'time', label: 'まとめ 20分コース', short: '20分コース',
      how: 'まとめモードの「20分」コースを、さいごまでやろう（レベルはどれでもOK）' });
    REVIEW_TOPICS.forEach(function (t) {
      add({ id: 'review-' + t.id + '-8', kind: 'normal', group: 'review', sub: t.id, label: 'ふくしゅう「' + t.title + '」8問○', short: '8問以上○',
        how: 'ふくしゅう「' + t.title + '」の10問で、8問より多く○をとろう' });
      add({ id: 'review-' + t.id + '-all', kind: 'normal', group: 'review', sub: t.id, label: 'ふくしゅう「' + t.title + '」全問○', short: '全問○',
        how: 'ふくしゅう「' + t.title + '」の10問を、ぜんぶ○にしよう' });
    });
    for (i = 0; i < MORE_STEPS.length; i++) {
      add({ id: 'more-' + MORE_STEPS[i], kind: 'normal', group: 'more', sub: MORE_STEPS[i], label: 'もっとれんしゅう ○' + MORE_STEPS[i] + 'こ', short: '○' + MORE_STEPS[i] + 'こ',
        how: '「もっとれんしゅう」で、○をあわせて' + MORE_STEPS[i] + 'こ とろう' });
    }
    // とくべつな星（✦）8しゅるい
    add({ id: 'sp-make1', kind: 'special', group: 'make', label: 'はじめて問題を作った', short: 'はじめての問題',
      how: '「もんだいをつくる」で問題を作って、ほぞんするか、ともだちに送ろう' });
    add({ id: 'sp-make-kinds', kind: 'special', group: 'make', label: '5しゅるいの問題をぜんぶ作った', short: '5しゅるいぜんぶ',
      how: '筆算・文章題・大小・ます・数直線の5しゅるいを、1つずつ作ろう' });
    add({ id: 'sp-make5', kind: 'special', group: 'make', label: '問題を5こ作った', short: '問題5こ',
      how: '問題をあわせて5こ作ろう' });
    add({ id: 'sp-friend1', kind: 'special', group: 'friend', label: 'ともだちの問題に答えた', short: 'はじめてこたえた',
      how: 'ともだちが作った問題をひらいて、答えてみよう' });
    add({ id: 'sp-friend-ok5', kind: 'special', group: 'friend', label: 'ともだちの問題で○5こ', short: '○5こ',
      how: 'ともだちの問題で、○をあわせて5こ とろう（同じ問題は1回だけ数えるよ）' });
    add({ id: 'sp-friend-ok10', kind: 'special', group: 'friend', label: 'ともだちの問題で○10こ', short: '○10こ',
      how: 'ともだちの問題で、○をあわせて10こ とろう（同じ問題は1回だけ数えるよ）' });
    add({ id: 'sp-friend-people5', kind: 'special', group: 'friend', label: '5人の問題をといた', short: '5人分',
      how: 'ちがう人が作った問題を、5人分といてみよう' });
    add({ id: 'sp-present', kind: 'special', group: 'present', label: '「みんなに見せる」で発表した', short: '発表した',
      how: '自分の問題を「みんなに見せる」で、みんなに発表しよう' });
  })();
  var BY_ID = {};
  CATALOG.forEach(function (s) { BY_ID[s.id] = s; });
  var NORMAL_MAX = CATALOG.filter(function (s) { return s.kind === 'normal'; }).length;   // 55
  var SPECIAL_MAX = CATALOG.filter(function (s) { return s.kind === 'special'; }).length; // 8

  /* ---------- 称号（宇宙・スペース系） ---------- */
  var TITLES = [
    { id: 'earth', icon: '🌍', name: '小数の地球人', need: { normal: 0, specialKinds: 0, specialTotal: 0 } },
    { id: 'rocket', icon: '🚀', name: '小数ロケット', need: { normal: 5, specialKinds: 0, specialTotal: 0 } },
    { id: 'moon', icon: '🌙', name: '小数ムーン', need: { normal: 12, specialKinds: 0, specialTotal: 0 } },
    { id: 'planet', icon: '🪐', name: '小数プラネット', need: { normal: 22, specialKinds: 0, specialTotal: 0 } },
    { id: 'star', icon: '⭐', name: '小数スター', need: { normal: 32, specialKinds: 0, specialTotal: 0 } },
    { id: 'comet', icon: '☄️', name: '小数コメット', need: { normal: 42, specialKinds: 0, specialTotal: 0 } },
    { id: 'sun', icon: '🌞', name: '小数サン', need: { normal: 50, specialKinds: 8, specialTotal: 0 } },
    { id: 'galaxy', icon: '🌌', name: '小数ギャラクシー', need: { normal: 55, specialKinds: 8, specialTotal: 30 } }
  ];

  /* ---------- 保存 ---------- */
  var mem = null;          // localStorage が使えないときの保存先（文字列）
  function storage() {
    try {
      var ls = root.localStorage;
      if (!ls) return null;
      return ls;
    } catch (e) { return null; }
  }
  function blank() { return { v: 1, got: {}, made: {}, friend: {}, present: {}, more: 0, title: 'earth', ev: [], fresh: true }; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function sanitize(d) {
    var s = blank();
    if (!isObj(d)) return s;
    s.fresh = false;
    var k;
    if (isObj(d.got)) for (k in d.got) if (BY_ID[k]) { var t = Number(d.got[k]); s.got[k] = isFinite(t) && t > 0 ? t : Date.now(); }
    if (isObj(d.made)) for (k in d.made) s.made[k] = typeof d.made[k] === 'string' ? d.made[k] : '';
    if (isObj(d.friend)) for (k in d.friend) { var f = d.friend[k]; if (isObj(f)) s.friend[k] = { c: f.c ? 1 : 0, a: typeof f.a === 'string' ? f.a : '' }; }
    if (isObj(d.present)) for (k in d.present) s.present[k] = 1;
    var m = Number(d.more); s.more = isFinite(m) && m > 0 ? Math.floor(m) : 0;
    s.title = typeof d.title === 'string' && titleIndex(d.title) >= 0 ? d.title : 'earth';
    if (Array.isArray(d.ev)) s.ev = d.ev.filter(function (e) { return Array.isArray(e); }).slice(-100);
    return s;
  }
  function load() {
    var raw = null, ls = storage();
    try { raw = ls ? ls.getItem(KEY) : mem; } catch (e) { raw = mem; }
    if (raw == null) return blank();
    try { return sanitize(JSON.parse(raw)); } catch (e) { var b = blank(); b.fresh = false; return b; }
  }
  function save() {
    var o = { v: 1, got: state.got, made: state.made, friend: state.friend, present: state.present, more: state.more, title: state.title, ev: state.ev };
    var str;
    for (var tries = 0; tries < 3; tries++) {
      try { str = JSON.stringify(o); } catch (e) { return false; }
      var ls = storage();
      if (!ls) { mem = str; return true; }
      try { ls.setItem(KEY, str); return true; }
      catch (e) {
        // 容量超過：出来事の記録をへらしてもう一度
        if (!o.ev.length) break;
        o.ev = o.ev.slice(Math.floor(o.ev.length / 2) + (tries === 1 ? o.ev.length : 0));
        state.ev = o.ev;
      }
    }
    mem = str; // 保存できなくても、このページの間は覚えておく
    return false;
  }
  var state = load();

  /* ---------- 小さな道具 ---------- */
  function hash(s) {
    s = String(s == null ? '' : s);
    var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 ^= c; h2 = Math.imul(h2, 0x5bd1e995) >>> 0; h2 ^= h2 >>> 15;
    }
    return h1.toString(36) + '.' + (h2 >>> 0).toString(36) + '.' + s.length.toString(36);
  }
  function lessonsArr() { return Array.isArray(S.Lessons) ? S.Lessons : []; }
  function store() { return S.Store && S.Store.stats ? S.Store : null; }
  function stats(key) {
    var st = store();
    if (!st) return { tried: 0, correct: 0, done: {} };
    try { return st.stats(key) || { tried: 0, correct: 0, done: {} }; } catch (e) { return { tried: 0, correct: 0, done: {} }; }
  }
  function titleIndex(id) { for (var i = 0; i < TITLES.length; i++) if (TITLES[i].id === id) return i; return -1; }
  function countKeys(o) { var n = 0; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n++; return n; }
  function pushEv(type, info) { state.ev.push([type, Date.now(), info || 0]); if (state.ev.length > 100) state.ev = state.ev.slice(-100); }

  /* ---------- 判定 ---------- */
  // ホームの☆と同じ考え（app.js lessonStars）：0〜3
  function lessonPids(lesson) {
    var out = [];
    (lesson.problems || []).forEach(function (p, i) {
      if (p && p.type === 'gen') { for (var k = 0; k < (p.count || 1); k++) out.push((p.id || 'p' + i) + '-' + k); }
      else if (p) out.push(p.id || 'p' + i);
    });
    return out;
  }
  function lessonLevel(lesson) {
    var st = stats('lesson-' + lesson.no);
    var pids = lessonPids(lesson);
    if (!pids.length || !st.tried) return 0;
    var ok = 0, done = st.done || {};
    pids.forEach(function (pid) { if (pid in done && done[pid]) ok++; });
    if (ok === pids.length) return 3;
    if (ok * 2 >= pids.length) return 2;
    return 1;
  }
  // 前からの記録：もっとれんしゅう（各時の記録の 'more-' で始まる問題）の○の数
  function storeMoreCorrect() {
    var n = 0;
    lessonsArr().forEach(function (l) {
      var d = stats('lesson-' + l.no).done || {};
      for (var pid in d) if (pid.indexOf('more-') === 0 && d[pid]) n++;
    });
    return n;
  }
  // 前からの記録：ふくしゅう（pid 'rv-<回>-<番号>'）を回ごとにまとめる
  function storeReviewRuns(topicId) {
    var d = stats('review-' + topicId).done || {}, runs = {};
    for (var pid in d) {
      var m = /^rv-([^-]+)-\d+$/.exec(pid);
      var r = m ? m[1] : '?';
      if (!runs[r]) runs[r] = { total: 0, correct: 0 };
      runs[r].total++;
      if (d[pid]) runs[r].correct++;
    }
    var out = [];
    for (var k in runs) if (k !== '?') out.push(runs[k]);
    return out;
  }
  function reviewIds(r) {
    var total = Number(r.total) || 0, correct = Number(r.correct) || 0, out = [];
    if (total >= 10 && correct >= 8) out.push('-8');
    if (total >= 10 && correct >= total) out.push('-all');
    return out;
  }
  function matomeIds(d) {
    var lv = String(d.level || ''), out = [];
    if (!LEVELS.some(function (x) { return x.id === lv; })) lv = 'normal';
    var total = Number(d.total) || 0, correct = Number(d.correct) || 0, fin = !!d.finished;
    if (fin) out.push('matome-' + lv + '-finish');
    if (fin && total >= 5 && correct >= total * 0.8) out.push('matome-' + lv + '-80');
    if (total >= 10 && correct >= total) out.push('matome-' + lv + '-all');
    if (fin && Number(d.minutes) >= 20) out.push('matome-20min');
    return out;
  }
  function specialCounts() {
    var made = 0, kinds = {}, k;
    for (k in state.made) { made++; if (state.made[k]) kinds[state.made[k]] = 1; }
    var answered = 0, ok = 0, people = {};
    for (k in state.friend) { answered++; if (state.friend[k].c) ok++; if (state.friend[k].a) people[state.friend[k].a] = 1; }
    var allKinds = MAKE_KINDS.every(function (x) { return kinds[x]; });
    return { made: made, allKinds: allKinds, kinds: countKeys(kinds), answered: answered, ok: ok, people: countKeys(people), present: countKeys(state.present) };
  }
  function specialTotal() { var c = specialCounts(); return c.made + c.ok + c.present; }

  // 記録から分かる星をすべて調べる（もらった星は消えない）
  function derived(extra) {
    var ids = (extra || []).slice();
    lessonsArr().forEach(function (l) {
      var lv = lessonLevel(l);
      if (lv >= 1) ids.push('lesson-' + l.no + '-try');
      if (lv >= 2) ids.push('lesson-' + l.no + '-half');
      if (lv >= 3) ids.push('lesson-' + l.no + '-all');
    });
    REVIEW_TOPICS.forEach(function (t) {
      storeReviewRuns(t.id).forEach(function (r) { reviewIds(r).forEach(function (s) { ids.push('review-' + t.id + s); }); });
    });
    var more = Math.max(state.more, storeMoreCorrect());
    MORE_STEPS.forEach(function (n) { if (more >= n) ids.push('more-' + n); });
    var c = specialCounts();
    if (c.made >= 1) ids.push('sp-make1');
    if (c.allKinds) ids.push('sp-make-kinds');
    if (c.made >= 5) ids.push('sp-make5');
    if (c.answered >= 1) ids.push('sp-friend1');
    if (c.ok >= 5) ids.push('sp-friend-ok5');
    if (c.ok >= 10) ids.push('sp-friend-ok10');
    if (c.people >= 5) ids.push('sp-friend-people5');
    if (c.present >= 1) ids.push('sp-present');
    return ids;
  }
  // ids のうち、まだもらっていない星をもらう。カタログの順で返す
  function grant(ids) {
    var now = Date.now(), want = {};
    ids.forEach(function (id) { if (BY_ID[id] && !state.got[id]) want[id] = 1; });
    var out = [];
    CATALOG.forEach(function (s) { if (want[s.id]) { state.got[s.id] = now; out.push(s); } });
    return out;
  }

  function summary() {
    var normal = 0, kinds = 0;
    for (var id in state.got) { var s = BY_ID[id]; if (!s) continue; if (s.kind === 'normal') normal++; else kinds++; }
    var total = specialTotal();
    var have = { normal: normal, specialKinds: kinds, specialTotal: total };
    var ti = 0;
    for (var i = 0; i < TITLES.length; i++) {
      var nd = TITLES[i].need;
      if (have.normal >= nd.normal && have.specialKinds >= nd.specialKinds && have.specialTotal >= nd.specialTotal) ti = i;
    }
    var next = TITLES[ti + 1] || null;
    var need = { normal: 0, specialKinds: 0, specialTotal: 0 };
    if (next) {
      need.normal = Math.max(0, next.need.normal - normal);
      need.specialKinds = Math.max(0, next.need.specialKinds - kinds);
      need.specialTotal = Math.max(0, next.need.specialTotal - total);
    }
    return { normal: normal, normalMax: NORMAL_MAX, specialTotal: total, specialKinds: kinds, specialKindsMax: SPECIAL_MAX,
      title: TITLES[ti], next: next, needForNext: need };
  }
  function needText(sm) {
    if (!sm.next) return 'さいごの称号まで とどいたよ！';
    var n = sm.needForNext, parts = [];
    if (n.normal) parts.push('★' + n.normal + 'こ');
    if (n.specialKinds) parts.push('✦のしゅるい ' + n.specialKinds + 'こ');
    if (n.specialTotal) parts.push('✦' + n.specialTotal + 'こ');
    return sm.next.icon + sm.next.name + 'まで あと ' + (parts.join('・') || '少し');
  }
  function condText(t) {
    var nd = t.need, parts = [];
    if (!nd.normal && !nd.specialKinds && !nd.specialTotal) return 'はじめから';
    if (nd.normal) parts.push(nd.normal >= NORMAL_MAX ? '★ぜんぶ（' + nd.normal + 'こ）' : '★' + nd.normal + 'こ');
    if (nd.specialKinds) parts.push(nd.specialKinds >= SPECIAL_MAX ? '✦のしゅるい ぜんぶ（' + nd.specialKinds + '）' : '✦のしゅるい ' + nd.specialKinds);
    if (nd.specialTotal) parts.push('✦ ' + nd.specialTotal + 'こ以上');
    return parts.join(' ＋ ');
  }

  /* ---------- 変化の通知 ---------- */
  var listeners = [];
  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }
  function emit() {
    var sm = summary();
    listeners.slice().forEach(function (fn) { try { fn(sm); } catch (e) { if (root.console) console.error('Stars.onChange', e); } });
  }

  /* ---------- 出来事の記録 ---------- */
  function finish(got, quiet, totalBefore) {
    var before = titleIndex(state.title);
    var sm = summary();
    var after = titleIndex(sm.title.id);
    var up = after > before;
    if (after !== before) state.title = sm.title.id;
    var changed = got.length || sm.specialTotal !== totalBefore || after !== before;
    save();
    if (changed) emit();
    if (hasDOM && !quiet) {
      got.forEach(function (s) { showGet(s); });
      if (!got.some(function (s) { return s.kind === 'special'; }) && sm.specialTotal > totalBefore) {
        queueToast('✦ +' + (sm.specialTotal - totalBefore) + ' とくべつな星（ぜんぶで ' + sm.specialTotal + 'こ）', true);
      }
      if (up) celebrate(sm.title);
    }
    return { sm: sm, up: up };
  }

  function log(type, data) {
    data = data || {};
    var totalBefore = specialTotal(), extra = [], info = 0;
    try {
      switch (type) {
        case 'lesson': info = Number(data.no) || 0; break;
        case 'review':
          var tp = String(data.topic || '');
          if (REVIEW_TOPICS.some(function (t) { return t.id === tp; })) reviewIds(data).forEach(function (s) { extra.push('review-' + tp + s); });
          info = tp + ':' + (Number(data.correct) || 0) + '/' + (Number(data.total) || 0);
          break;
        case 'more':
          if (data.correct) state.more++;
          info = data.correct ? 1 : 0;
          break;
        case 'matome':
          extra = matomeIds(data);
          info = String(data.level) + ':' + (Number(data.correct) || 0) + '/' + (Number(data.total) || 0) + (data.finished ? ':f' : '');
          break;
        case 'made':
          if (data.token) {
            var kd = String(data.kind || '');
            kd = KIND_ALIAS[kd] || kd;
            var hm = hash(data.token);
            if (!(hm in state.made) || (!state.made[hm] && kd)) state.made[hm] = kd;
            info = kd;
          }
          break;
        case 'friend':
          if (data.token) {
            var hf = hash(data.token), prev = state.friend[hf];
            var a = data.authorKey != null && data.authorKey !== '' ? hash(data.authorKey) : (prev ? prev.a : '');
            state.friend[hf] = { c: (prev && prev.c) || data.correct ? 1 : 0, a: a };
            info = data.correct ? 1 : 0;
          }
          break;
        case 'present':
          if (data.token) state.present[hash(data.token)] = 1;
          break;
        default:
          return [];
      }
      pushEv(String(type), info);
      var got = grant(derived(extra));
      finish(got, false, totalBefore);
      return got;
    } catch (e) {
      if (root.console) console.error('Stars.log', e);
      return [];
    }
  }

  // 起動時：前からの記録も星に変える。おいわいは連発せず、まとめて1回だけ表示する
  function evaluate() {
    try {
      var totalBefore = specialTotal();
      // つくった問題（Store.myList）も「作った」に数える
      var my = [];
      try { my = S.Store && S.Store.myList ? S.Store.myList() || [] : []; } catch (e) { my = []; }
      my.forEach(function (it) {
        if (!it || !it.id) return;
        var h = hash(it.id), kd = it.up && it.up.kind ? String(it.up.kind) : '';
        if (!(h in state.made) || (!state.made[h] && kd)) state.made[h] = KIND_ALIAS[kd] || kd;
      });
      var fresh = state.fresh;
      state.fresh = false;
      var got = grant(derived());
      var r = finish(got, true, totalBefore);
      if (fresh && !got.length) save();
      if (hasDOM && got.length) {
        var nN = got.filter(function (s) { return s.kind === 'normal'; }).length, nS = got.length - nN;
        var msg = 'まとめて ' + (nN ? '★' + nN + 'こ' : '') + (nN && nS ? '・' : '') + (nS ? '✦' + nS + 'しゅるい' : '') + ' ゲットしていたよ';
        if (r.up) msg += '　いまの称号は ' + r.sm.title.icon + r.sm.title.name;
        queueToast(msg, nS > 0 && !nN, 4200);
      }
      return got;
    } catch (e) {
      if (root.console) console.error('Stars.evaluate', e);
      return [];
    }
  }

  /* ---------- 表示（DOM） ---------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function reducedMotion() {
    try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function fmtDate(t) {
    var d = new Date(t);
    if (isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  // ゲット表示：画面の上に小さく、順番に
  var toastQ = [], toastBusy = false, toastBox = null;
  function queueToast(msg, gold, ms) {
    if (!hasDOM) return;
    toastQ.push({ msg: msg, gold: !!gold, ms: ms || 2600 });
    if (!toastBusy) nextToast();
  }
  function showGet(s) {
    queueToast((s.kind === 'special' ? '✦ ' : '★ ') + s.label + ' ゲット！', s.kind === 'special');
  }
  function nextToast() {
    var it = toastQ.shift();
    if (!it) { toastBusy = false; return; }
    toastBusy = true;
    if (!toastBox || !toastBox.isConnected) {
      toastBox = el('div', 'st-toasts');
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var t = el('div', 'st-toast' + (it.gold ? ' st-gold' : ''), it.msg);
    toastBox.appendChild(t);
    setTimeout(function () { t.classList.add('st-show'); }, 20);
    setTimeout(function () {
      t.classList.remove('st-show');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); nextToast(); }, 320);
    }, it.ms);
  }

  // 称号アップのおいわい（画面いっぱい）
  function celebrate(title) {
    if (!hasDOM || !title) return null;
    var old = document.querySelector('.st-celebrate');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var back = el('div', 'st-celebrate' + (reducedMotion() ? ' st-still' : ''));
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-label', '称号アップ ' + title.name);
    var sky = el('div', 'st-sky');
    var i;
    for (i = 0; i < 40; i++) {
      var sp = el('span', 'st-spark' + (i % 3 === 0 ? ' st-gold' : ''), i % 4 === 0 ? '✦' : '★');
      var ang = (i / 40) * Math.PI * 2 + Math.random() * 0.3;
      var dist = 28 + Math.random() * 30;
      sp.style.setProperty('--dx', (Math.cos(ang) * dist).toFixed(1) + 'vmax');
      sp.style.setProperty('--dy', (Math.sin(ang) * dist).toFixed(1) + 'vmax');
      sp.style.setProperty('--d', (Math.random() * 0.6).toFixed(2) + 's');
      sp.style.setProperty('--s', (0.8 + Math.random() * 1.4).toFixed(2));
      sky.appendChild(sp);
    }
    for (i = 0; i < 5; i++) {
      var sh = el('span', 'st-shoot');
      sh.style.top = (5 + i * 13 + Math.random() * 6).toFixed(0) + '%';
      sh.style.left = (35 + Math.random() * 60).toFixed(0) + '%';
      sh.style.setProperty('--d', (0.4 + i * 0.7 + Math.random() * 0.4).toFixed(2) + 's');
      sky.appendChild(sh);
    }
    for (i = 0; i < 30; i++) {
      var tw = el('span', 'st-twinkle');
      tw.style.top = (Math.random() * 100).toFixed(1) + '%';
      tw.style.left = (Math.random() * 100).toFixed(1) + '%';
      tw.style.setProperty('--d', (Math.random() * 2).toFixed(2) + 's');
      sky.appendChild(tw);
    }
    back.appendChild(sky);
    var box = el('div', 'st-cel-box');
    box.appendChild(el('div', 'st-cel-head', '称号アップ！'));
    box.appendChild(el('div', 'st-cel-icon', title.icon));
    box.appendChild(el('div', 'st-cel-name', title.name));
    box.appendChild(el('div', 'st-cel-sub', 'あたらしい称号をもらったよ。おめでとう！'));
    var sm = summary();
    if (sm.next) box.appendChild(el('div', 'st-cel-next', 'つぎは ' + needText(sm)));
    var close = el('button', 'btn primary st-cel-close', 'とじる');
    close.type = 'button';
    function shut() {
      document.removeEventListener('keydown', onKey);
      if (back.parentNode) back.parentNode.removeChild(back);
    }
    function onKey(e) { if (e.key === 'Escape') shut(); }
    close.addEventListener('click', shut);
    document.addEventListener('keydown', onKey);
    box.appendChild(close);
    back.appendChild(box);
    document.body.appendChild(back);
    try { close.focus({ preventScroll: true }); } catch (e) {}
    return back;
  }

  // 上のバー用のバッジ
  var badges = [];
  function fillBadge(b, sm) {
    b.innerHTML = '';
    b.appendChild(el('span', 'st-b-n', '★' + sm.normal));
    b.appendChild(el('span', 'st-b-s', '✦' + sm.specialTotal));
    var t = el('span', 'st-b-t');
    t.appendChild(el('span', 'st-b-icon', sm.title.icon));
    t.appendChild(el('span', 'st-b-name', sm.title.name));
    b.appendChild(t);
    b.setAttribute('aria-label', '星のずかん（★' + sm.normal + 'こ、とくべつな星' + sm.specialTotal + 'こ、称号 ' + sm.title.name + '）');
    b.title = '星のずかんをひらく';
  }
  function badge() {
    if (!hasDOM) return null;
    var b = el('button', 'st-badge');
    b.type = 'button';
    b.addEventListener('click', function () { location.hash = '#/stars'; });
    b._stBorn = Date.now();
    fillBadge(b, summary());
    badges.push(b);
    return b;
  }
  onChange(function (sm) {
    var now = Date.now();
    badges = badges.filter(function (b) {
      if (b.isConnected) { b._stSeen = 1; fillBadge(b, sm); return true; }
      // 画面から外れたものは手ばなす（まだ置かれていない新しいものは残す）
      if (!b._stSeen && now - b._stBorn < 60000) { fillBadge(b, sm); return true; }
      return false;
    });
  });

  // 星のずかん
  function mountCollection(host) {
    if (!hasDOM || !host) return { destroy: function () {} };
    var wrap = el('div', 'st-coll');
    host.appendChild(wrap);
    function chip(s) {
      var t = state.got[s.id];
      var c = el('div', 'st-chip' + (t ? ' st-got' : '') + (s.kind === 'special' ? ' st-sp' : ''));
      c.appendChild(el('span', 'st-chip-star', s.kind === 'special' ? '✦' : '★'));
      var tx = el('div', 'st-chip-tx');
      tx.appendChild(el('div', 'st-chip-label', s.short || s.label));
      tx.appendChild(el('div', 'st-chip-sub', t ? fmtDate(t) + ' にもらったよ' : s.how));
      c.appendChild(tx);
      c.setAttribute('aria-label', (s.kind === 'special' ? 'とくべつな星 ' : '星 ') + s.label + (t ? '（もらった ' + fmtDate(t) + '）' : '（まだ。' + s.how + '）'));
      return c;
    }
    function rowOf(title, list, cls) {
      var r = el('div', 'st-row' + (cls ? ' ' + cls : ''));
      r.appendChild(el('div', 'st-row-title', title));
      var g = el('div', 'st-row-chips');
      list.forEach(function (s) { g.appendChild(chip(s)); });
      r.appendChild(g);
      return r;
    }
    function section(title, list, note, cls) {
      var sec = el('section', 'st-sec' + (cls ? ' ' + cls : ''));
      var hd = el('div', 'st-sec-head');
      hd.appendChild(el('h2', null, title));
      var n = list.filter(function (s) { return state.got[s.id]; }).length;
      hd.appendChild(el('span', 'st-sec-count', n + ' / ' + list.length));
      sec.appendChild(hd);
      if (note) sec.appendChild(el('p', 'st-note', note));
      return sec;
    }
    function group(g) { return CATALOG.filter(function (s) { return s.group === g; }); }
    function render() {
      wrap.innerHTML = '';
      var sm = summary();
      // いまの称号
      var top = el('section', 'st-now');
      var big = el('div', 'st-now-title');
      big.appendChild(el('span', 'st-now-icon', sm.title.icon));
      var nm = el('div', 'st-now-tx');
      nm.appendChild(el('div', 'st-now-label', 'いまの称号'));
      nm.appendChild(el('div', 'st-now-name', sm.title.name));
      big.appendChild(nm);
      top.appendChild(big);
      var nums = el('div', 'st-now-nums');
      var n1 = el('div', 'st-num');
      n1.appendChild(el('span', 'st-num-v', '★ ' + sm.normal));
      n1.appendChild(el('span', 'st-num-l', 'ふつうの星（ぜんぶで' + sm.normalMax + 'こ）'));
      var bar = el('div', 'st-bar'); var fill = el('div', 'st-bar-fill');
      fill.style.width = Math.round(sm.normal / sm.normalMax * 100) + '%';
      bar.appendChild(fill); n1.appendChild(bar);
      nums.appendChild(n1);
      var n2 = el('div', 'st-num st-gold');
      n2.appendChild(el('span', 'st-num-v', '✦ ' + sm.specialTotal));
      n2.appendChild(el('span', 'st-num-l', 'とくべつな星の合計（しゅるい ' + sm.specialKinds + ' / ' + sm.specialKindsMax + '）'));
      nums.appendChild(n2);
      top.appendChild(nums);
      top.appendChild(el('div', 'st-now-next', needText(sm)));
      wrap.appendChild(top);

      // 称号の一覧
      var ts = el('section', 'st-sec');
      var th = el('div', 'st-sec-head'); th.appendChild(el('h2', null, '称号')); ts.appendChild(th);
      var tl = el('div', 'st-titles');
      var cur = titleIndex(sm.title.id);
      TITLES.forEach(function (t, i) {
        var c = el('div', 'st-title' + (i <= cur ? ' st-got' : '') + (i === cur ? ' st-cur' : ''));
        c.appendChild(el('div', 'st-title-icon', t.icon));
        c.appendChild(el('div', 'st-title-name', i <= cur ? t.name : '？？？'));
        c.appendChild(el('div', 'st-title-cond', condText(t)));
        tl.appendChild(c);
      });
      ts.appendChild(tl);
      wrap.appendChild(ts);

      // 各時
      var ls = lessonsArr();
      var sec = section('じゅぎょう（第1〜10時）', group('lesson'), '「れんしゅう」の問題で、とりくんだ・半分以上○・全問○の3つの星がもらえるよ。');
      for (var n = 1; n <= 10; n++) {
        var lt = ls[n - 1] && ls[n - 1].title ? '第' + n + '時　' + ls[n - 1].title : '第' + n + '時';
        sec.appendChild(rowOf(lt, group('lesson').filter(function (s) { return s.sub === n; })));
      }
      wrap.appendChild(sec);
      // まとめモード
      sec = section('まとめモード', group('matome'), 'いろいろな問題がまざって出るよ。レベルごとに星がもらえるよ。');
      LEVELS.forEach(function (lv) { sec.appendChild(rowOf(lv.label, group('matome').filter(function (s) { return s.sub === lv.id; }))); });
      sec.appendChild(rowOf('時間', group('matome').filter(function (s) { return s.sub === 'time'; })));
      wrap.appendChild(sec);
      // ふくしゅう
      sec = section('ふくしゅう', group('review'), '10問のふくしゅうで、8問以上○・全問○の星がもらえるよ。');
      REVIEW_TOPICS.forEach(function (t) {
        var rt = t.title;
        (S.ReviewTopics || []).forEach(function (x) { if (x && x.id === t.id && x.title) rt = x.title; });
        sec.appendChild(rowOf(rt, group('review').filter(function (s) { return s.sub === t.id; })));
      });
      wrap.appendChild(sec);
      // もっとれんしゅう
      sec = section('もっとれんしゅう', group('more'), 'もっとれんしゅうでとった○の数で星がもらえるよ。いま ○' + Math.max(state.more, storeMoreCorrect()) + 'こ。');
      sec.appendChild(rowOf('○の数', group('more')));
      wrap.appendChild(sec);
      // とくべつな星
      var spAll = CATALOG.filter(function (s) { return s.kind === 'special'; });
      sec = section('✦ とくべつな星', spAll, null, 'st-sec-sp');
      var tot = el('div', 'st-sp-total');
      tot.appendChild(el('span', 'st-sp-total-v', '✦ ' + sm.specialTotal + 'こ'));
      tot.appendChild(el('span', 'st-sp-total-l', '問題を1こ作るごと、ともだちの問題で○をとるごと、自分の問題を発表するごとに、✦が1こずつふえるよ（同じ問題は1回だけ）。'));
      sec.appendChild(tot);
      sec.appendChild(rowOf('もんだいづくり', group('make'), 'st-row-sp'));
      sec.appendChild(rowOf('ともだちの問題', group('friend'), 'st-row-sp'));
      sec.appendChild(rowOf('はっぴょう', group('present'), 'st-row-sp'));
      wrap.appendChild(sec);
    }
    render();
    var off = onChange(render);
    return { destroy: function () { off(); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
  }

  var Stars = {
    CATALOG: CATALOG,
    TITLES: TITLES,
    log: log,
    evaluate: evaluate,
    summary: summary,
    badge: badge,
    mountCollection: mountCollection,
    onChange: onChange,
    celebrate: celebrate,      // 確認用（ふつうは log が自分で呼ぶ）
    needText: function () { return needText(summary()); },
    // テスト・先生用
    _reload: function () { state = load(); emit(); },
    _state: function () { return JSON.parse(JSON.stringify(state)); },
    _hash: hash,
    reset: function () {
      state = blank(); state.fresh = false;
      try { var ls = storage(); if (ls) ls.removeItem(KEY); } catch (e) {}
      mem = null; save(); emit();
    }
  };
  S.Stars = Stars;
  if (typeof module === 'object' && module.exports) module.exports = Stars;
})(typeof window !== 'undefined' ? window : globalThis);
