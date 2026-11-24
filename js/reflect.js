/* Shosu.Reflect — YWTふりかえり・ふりかえりボックス（担当M）
 *
 * Reflect.history(date) -> { date, items:[{itemId,label,done,correct,total,hints,planned,tags}], problems:{total,correct,hints},
 *                            stars:[{id,label,kind}], made:n, friend:n, friendCorrect:n, plan:{items,meate,done,total,allDone}|null, ... }
 *   その日の学習を集める。Store の記録（'shosu.rec.<key>' の entries[pid].t = 最後に答えた時刻ms）と、
 *   Stars の記録（もらった星の時刻・出来事 ev の時刻）、Store.myList の created を使う。
 * Reflect.save(r) / list() / get(date)      localStorage 'shosu.reflect'（日付ごと。同じ日は上書き）
 * Reflect.nextSuggestions(beforeDate?) -> [text]   直近の T（手書きがあれば「前回書いたこと（手書き）」も）
 * Reflect.lastT(beforeDate?) -> {date, choices, ink, items}|null
 * Reflect.mountYWT(el, date) -> {destroy()}  Reflect.mountBox(el) -> {destroy()}
 * Reflect.profileName() / setProfileName(ink)  localStorage 'shosu.reflect.name'（前の手書きの名前。追加6からは Profile の名前（文字）を使う）
 * Reflect.deliver(text, {msg, codeBox}) … 「先生に送る」：コピーして、ゴールに Forms のURLがあれば Forms を開く（追加6）
 *
 * Reflection = { v:1, date, name:Ink|null, meate:{choices,ink}, y:{auto:[text], extra:[text]},
 *                w:{eval:'double'|'single'|'triangle', choices:[text], ink}, t:{choices:[text], ink, items:[itemId]}, aid, saved:'ISO',
 *                profile:{cls,no,name}（追加6。名前は文字） }
 *   送るときだけ summary（Summary.build()）を足す（端末には保存しない）。
 * classic script。Node でも require できる（DOM を使う部分は呼ばなければ動かない）。絵文字は使わない。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var hasDOM = typeof document !== 'undefined' && !!document.createElement;
  var KEY = 'shosu.reflect', NAME_KEY = 'shosu.reflect.name', BOX_KEY = 'shosu.reflectBox';

  /* ---------- 保存（localStorage がなければメモリ） ---------- */
  var mem = {};
  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function rawGet(k) {
    if (mem[k] != null) return mem[k]; // 保存しきれなかった新しい内容（このページの間だけ）
    var s = ls();
    try { if (s) return s.getItem(k); } catch (e) {}
    return null;
  }
  // 書けたら true。容量超過などで書けなければ false（例外は投げない）
  function rawSet(k, v) {
    var s = ls();
    if (!s) { mem[k] = v; return true; }
    try { s.setItem(k, v); delete mem[k]; return true; } catch (e) { return false; }
  }
  function getJSON(k, def) {
    var v = rawGet(k);
    if (v == null) return def;
    try { var o = JSON.parse(v); return o == null ? def : o; } catch (e) { return def; }
  }

  /* ---------- 小さな道具 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function isDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var p = s.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d.getFullYear() === +p[0] && d.getMonth() === +p[1] - 1 && d.getDate() === +p[2];
  }
  function msDate(ms) { var n = Number(ms); return isFinite(n) && n > 0 ? dateKey(new Date(n)) : ''; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function str(s, max) { return typeof s === 'string' ? s.slice(0, max || 200) : ''; }
  function strList(a, max, n) {
    if (!Array.isArray(a)) return [];
    var out = [], seen = {};
    a.forEach(function (s) { s = str(s, max).trim(); if (s && !seen[s] && out.length < (n || 20)) { seen[s] = 1; out.push(s); } });
    return out;
  }
  function uniqPush(arr, s) { if (s && arr.indexOf(s) < 0) arr.push(s); }
  function fmtDate(d) { var m = isDate(d) ? d.split('-') : null; return m ? (+m[1]) + '月' + (+m[2]) + '日' : String(d || ''); }
  function lessons() { return Array.isArray(S.Lessons) ? S.Lessons : []; }
  function topics() { return Array.isArray(S.ReviewTopics) ? S.ReviewTopics : []; }
  function planner() { return S.Planner || null; }
  function tryCall(fn, def) { try { var v = fn(); return v === undefined ? def : v; } catch (e) { return def; } }
  function deviceId() { return tryCall(function () { return S.Session && S.Session.deviceId ? S.Session.deviceId() : ''; }, '') || ''; }

  /* ---------- インク（手書き） ---------- */
  function cleanInk(ink) {
    if (!isObj(ink) || !Array.isArray(ink.strokes)) return null;
    var w = Number(ink.w), h = Number(ink.h);
    if (!(w > 0 && w < 5000 && h > 0 && h < 5000)) return null;
    var strokes = [];
    ink.strokes.forEach(function (st) {
      if (!Array.isArray(st) || strokes.length >= 400) return;
      var pts = [];
      st.forEach(function (p) {
        if (!p || pts.length >= 2000) return;
        var x = Number(p.x), y = Number(p.y);
        if (isFinite(x) && isFinite(y)) pts.push({ x: Math.round(x), y: Math.round(y) });
      });
      if (pts.length) strokes.push(pts);
    });
    return strokes.length ? { w: Math.round(w), h: Math.round(h), strokes: strokes } : null;
  }
  function inkHas(ink) { return !!(ink && ink.strokes && ink.strokes.some(function (s) { return s && s.length; })); }

  var EVALS = { double: 'よくできた', single: 'できた', triangle: 'もう少し' };
  var EXTRA = ['友だちに教えた', '友だちに聞いた', 'ノートにまとめた', '教科書を見直した', '先生に質問した', '家の人に説明した'];

  function cleanReflection(r) {
    if (!isObj(r) || !isDate(r.date)) return null;
    var m = isObj(r.meate) ? r.meate : {}, y = isObj(r.y) ? r.y : {}, w = isObj(r.w) ? r.w : {}, t = isObj(r.t) ? r.t : {};
    var out = {
      v: 1, date: r.date,
      name: cleanInk(r.name),
      meate: { choices: strList(m.choices, 120, 8), ink: cleanInk(m.ink) },
      y: { auto: strList(y.auto, 120, 20), extra: strList(y.extra, 60, 12), off: strList(y.off, 120, 20) },
      w: { eval: EVALS[w.eval] ? w.eval : null, choices: strList(w.choices, 120, 10), ink: cleanInk(w.ink) },
      t: { choices: strList(t.choices, 120, 10), ink: cleanInk(t.ink), items: strList(t.items, 40, 10) },
      aid: str(r.aid, 32)
    };
    if (typeof r.saved === 'string' && !isNaN(Date.parse(r.saved))) out.saved = r.saved;
    var pf = cleanProfile(r.profile);
    if (pf) out.profile = pf;
    return out;
  }
  function cleanProfile(p) {
    if (!isObj(p)) return null;
    if (S.Profile && S.Profile.clean) return S.Profile.clean(p);
    var c = Number(p.cls), n = Number(p.no), nm = str(p.name, 30).trim();
    return c >= 1 && c <= 9 && n >= 1 && n <= 45 && Math.floor(c) === c && Math.floor(n) === n && nm ? { cls: c, no: n, name: nm } : null;
  }
  function myProfile() { return S.Profile && S.Profile.get ? tryCall(function () { return S.Profile.get(); }, null) : null; }
  function profileText(p) { return p ? (S.Profile && S.Profile.label ? S.Profile.label(p) : p.cls + '組 ' + p.no + '番 ' + p.name) : ''; }

  /* ---------- ふりかえりの保存 ---------- */
  function readList() {
    var v = getJSON(KEY, []);
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (r) { var c = cleanReflection(r); if (c) out.push(c); });
    return out;
  }
  function sortDesc(list) { return list.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }
  function list() { return sortDesc(readList()); }
  function get(date) {
    date = date || dateKey();
    var l = readList();
    for (var i = 0; i < l.length; i++) if (l[i].date === date) return l[i];
    return null;
  }
  // 容量がいっぱいのときは、古いものから手書きをはずし、それでもだめなら古いものを消す（今日の分は残す）
  function writeList(l, keepDate) {
    l = sortDesc(l);
    if (rawSet(KEY, JSON.stringify(l))) return true;
    var i;
    for (i = l.length - 1; i >= 0; i--) {
      if (l[i].date === keepDate) continue;
      l[i].w.ink = null; l[i].t.ink = null; l[i].meate.ink = null; l[i].name = null;
      if (rawSet(KEY, JSON.stringify(l))) return true;
    }
    while (l.length > 1) {
      var idx = -1;
      for (i = l.length - 1; i >= 0; i--) if (l[i].date !== keepDate) { idx = i; break; }
      if (idx < 0) break;
      l.splice(idx, 1);
      if (rawSet(KEY, JSON.stringify(l))) return true;
    }
    mem[KEY] = JSON.stringify(l); // このページの間だけでも覚えておく
    return false;
  }
  function save(r) {
    var c = cleanReflection(r);
    if (!c) return false;
    if (!c.saved) c.saved = new Date().toISOString();
    if (!c.aid) c.aid = deviceId();
    var l = readList().filter(function (x) { return x.date !== c.date; });
    l.push(c);
    return writeList(l, c.date);
  }
  function profileName() { return cleanInk(getJSON(NAME_KEY, null)); }
  function setProfileName(ink) {
    var c = cleanInk(ink);
    if (!c) { var s = ls(); try { if (s) s.removeItem(NAME_KEY); } catch (e) {} delete mem[NAME_KEY]; return true; }
    return rawSet(NAME_KEY, JSON.stringify(c));
  }
  function lastT(beforeDate) {
    var l = list();
    for (var i = 0; i < l.length; i++) {
      var r = l[i];
      if (beforeDate && !(r.date < beforeDate)) continue;
      if (r.t.choices.length || inkHas(r.t.ink)) return { date: r.date, choices: r.t.choices.slice(), ink: r.t.ink, items: r.t.items.slice() };
    }
    return null;
  }
  function nextSuggestions(beforeDate) {
    var t = lastT(beforeDate);
    if (!t) return [];
    var out = t.choices.slice();
    if (inkHas(t.ink)) out.push('前回書いたこと（手書き）');
    return out;
  }

  /* ---------- 内容の分類（tag） ---------- */
  var TAGS = {
    hyoshikata: { title: '表し方・単位', kw: ['表し', '表す', 'はした', 'ます', '単位', '数直線', '目もり'] },
    shikumi: { title: 'しくみ・数の構成', kw: ['位', 'しくみ', '集め', 'こ分'] },
    daisho: { title: '大小', kw: ['大小', 'くらべ', '大きい', '小さい', 'ならべ', '不等号'] },
    jubai: { title: '10倍・1/10', kw: ['10倍', '1/10', '倍'] },
    tashizan: { title: 'たし算', kw: ['たし算', '筆算', '小数点', 'たす', '合計'] },
    hikizan: { title: 'ひき算', kw: ['ひき算', '筆算', '小数点', 'ひく', 'ちがい'] },
    kimari: { title: '計算のきまり', kw: ['きまり', 'くふう'] }
  };
  var GEN_TAG = { masuRead: 'hyoshikata', unitConvert: 'hyoshikata', numberlineRead: 'hyoshikata', compose: 'shikumi', decompose: 'shikumi',
    countUnits: 'shikumi', compare: 'daisho', order: 'daisho', times10: 'jubai', hissanAdd: 'tashizan', hissanSub: 'hikizan', laws: 'kimari' };
  var KIND_KW = { hints: ['ヒント'], make: ['問題を作', '問題づくり', 'もんだいづくり', '作る', '作ろ'], friend: ['ともだち', '友だち'],
    matome: ['まとめ'], stars: ['星'], all: ['全問', 'ぜんぶ'] };
  function kwHit(text, kws) { if (!text) return false; for (var i = 0; i < kws.length; i++) if (text.indexOf(kws[i]) >= 0) return true; return false; }
  function tagTitle(tag) { return TAGS[tag] ? TAGS[tag].title : tag; }

  var probIndex = null;
  function lessonProblem(pid) {
    if (!probIndex) {
      probIndex = {};
      lessons().forEach(function (l) { (l.problems || []).forEach(function (p, i) { if (p) probIndex[p.id || ('L' + l.no + '-p' + i)] = { p: p, no: l.no }; }); });
    }
    return probIndex[pid] || null;
  }
  function lessonByNo(no) { var ls0 = lessons(); for (var i = 0; i < ls0.length; i++) if (String(ls0[i].no) === String(no)) return ls0[i]; return null; }
  function lessonTags(no) {
    var l = lessonByNo(no), tags = {};
    if (l) (l.problems || []).forEach(function (p) { if (p && p.tag) tags[p.tag] = 1; });
    return Object.keys(tags);
  }
  function moreTag(no) {
    var l = lessonByNo(no), tags = {};
    ((l && l.more) || []).forEach(function (g) { if (GEN_TAG[g]) tags[GEN_TAG[g]] = 1; });
    var k = Object.keys(tags);
    return k.length === 1 ? k[0] : null;
  }
  function topicTitle(id) { var t = topics().filter(function (x) { return x.id === id; })[0]; return t ? t.title : tagTitle(id); }

  /* ---------- 記録を読む ---------- */
  function recKeys() {
    var ks = tryCall(function () { return S.Store && S.Store.keys ? S.Store.keys() : null; }, null);
    if (!Array.isArray(ks)) ks = getJSON('shosu.keys', []);
    return Array.isArray(ks) ? ks : [];
  }
  function recEntries(key) {
    // 担当Nが Store.entries(key) を足したらそれを使う。なければ Store の保存形式（'shosu.rec.<key>'）を読む
    var e = tryCall(function () { return S.Store && S.Store.entries ? S.Store.entries(key) : null; }, null);
    if (isObj(e)) return e;
    var d = getJSON('shosu.rec.' + key, null);
    return d && isObj(d.entries) ? d.entries : {};
  }
  function starsState() {
    var st = tryCall(function () { return S.Stars && S.Stars._state ? S.Stars._state() : null; }, null);
    if (!isObj(st)) st = getJSON('shosu.stars', null);
    return isObj(st) ? st : { got: {}, ev: [] };
  }
  function plannerItems() {
    var p = planner();
    var a = p && p.ITEMS ? tryCall(function () { return p.ITEMS(); }, []) : [];
    return Array.isArray(a) ? a : [];
  }
  function planOf(date) {
    var p = planner();
    if (!p || !p.plan) return null;
    var pl = tryCall(function () { return p.plan(date); }, null);
    return isObj(pl) ? pl : null;
  }
  function itemLabel(id) {
    var it = plannerItems().filter(function (x) { return x && x.id === id; })[0];
    if (it && it.label) return String(it.label);
    var m;
    if ((m = /^lesson-(\d+)$/.exec(id))) { var l = lessonByNo(m[1]); return '第' + m[1] + '時' + (l && l.title ? '「' + l.title + '」' : ''); }
    if ((m = /^more-(\d+)$/.exec(id))) return '第' + m[1] + '時のもっとれんしゅう';
    if ((m = /^review-(.+)$/.exec(id))) return 'ふくしゅう「' + topicTitle(m[1]) + '」';
    if (/^matome/.test(id)) return 'まとめモード';
    if (/^osusume/.test(id)) return 'おすすめモード';
    if (id === 'make') return 'もんだいづくり';
    if (id === 'friend') return 'ともだちの問題';
    return id;
  }
  function myIdOf(planId) { return /^matome/.test(planId) ? 'matome' : planId; }

  /* ---------- history ---------- */
  function history(date) {
    date = isDate(date) ? date : dateKey();
    var items = {}, order = [];
    var probs = []; // {tag, p(lesson problem|null), correct, n, hints, itemId}
    function item(id, label) {
      if (!items[id]) { items[id] = { itemId: id, label: label || itemLabel(id), done: false, correct: 0, total: 0, hints: 0, planned: false, tags: [] }; order.push(id); }
      return items[id];
    }
    var friend = 0, friendOk = 0;
    recKeys().forEach(function (key) {
      var ents = recEntries(key), m;
      for (var pid in ents) {
        var e = ents[pid];
        if (!isObj(e) || msDate(e.t || Date.parse(e.at)) !== date) continue;
        var ok = !!e.correct, hints = Number(e.hints) || 0, tag = typeof e.tag === 'string' ? e.tag : null, lp = null, id;
        if (key === 'friend') { friend++; if (ok) friendOk++; id = 'friend'; }
        else if ((m = /^lesson-(\d+)$/.exec(key))) {
          if (/^more-/.test(pid)) { id = 'more-' + m[1]; tag = tag || moreTag(m[1]); }
          else { id = key; lp = lessonProblem(pid); if (lp && lp.p.tag) tag = lp.p.tag; }
        } else if ((m = /^review-(.+)$/.exec(key))) { id = key; tag = tag || m[1]; }
        else if (key === 'matome') id = 'matome';
        else id = key;
        var it = item(id);
        it.total++; if (ok) it.correct++; it.hints += hints;
        if (tag && it.tags.indexOf(tag) < 0) it.tags.push(tag);
        probs.push({ tag: tag, p: lp ? lp.p : null, correct: ok, n: Number(e.n) || 1, hints: hints, itemId: id });
      }
    });
    // まとめモードのレベル（Stars の出来事 'matome' の info = 'normal:9/10:f'）
    var ss = starsState();
    var matomeLv = null, madeEv = 0;
    (Array.isArray(ss.ev) ? ss.ev : []).forEach(function (ev) {
      if (!Array.isArray(ev) || msDate(ev[1]) !== date) return;
      if (ev[0] === 'matome' && typeof ev[2] === 'string') matomeLv = ev[2].split(':')[0];
      if (ev[0] === 'made') madeEv++;
    });
    if (items.matome && matomeLv) {
      var lvl = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' }[matomeLv];
      if (lvl) items.matome.label = 'まとめモード（' + lvl + '）';
    }
    // もらった星
    var cat = {};
    ((S.Stars && S.Stars.CATALOG) || []).forEach(function (s) { cat[s.id] = s; });
    var stars = [];
    if (isObj(ss.got)) for (var sid in ss.got) if (msDate(ss.got[sid]) === date) stars.push({ id: sid, label: cat[sid] ? cat[sid].label : sid, kind: cat[sid] ? cat[sid].kind : 'normal' });
    // 作った問題（ほかの端末で作った問題を「ほぞん」したものは数えない）
    var made = 0, my = tryCall(function () { return S.Store && S.Store.myList ? S.Store.myList() : null; }, null);
    if (Array.isArray(my)) {
      var dev = deviceId();
      my.forEach(function (x) {
        if (!x || msDate(x.created) !== date) return;
        if (x.up && x.up.aid && dev && x.up.aid !== dev) return;
        made++;
      });
    } else made = madeEv;
    if (made) { var mk = item('make', itemLabel('make')); mk.total = 0; mk.made = made; }
    // 今日の計画
    var pl = planOf(date), plan = null;
    if (pl && Array.isArray(pl.items)) {
      var pi = plannerItems(), doneN = 0;
      pl.items.forEach(function (pid) {
        var my2 = myIdOf(String(pid));
        var it = item(my2, (pi.filter(function (x) { return x && x.id === pid; })[0] || {}).label || itemLabel(String(pid)));
        it.planned = true; it.planId = String(pid);
      });
      order.forEach(function (id) {
        var it = items[id];
        it.done = it.total > 0 || !!it.made;
        if (it.planned && it.done) doneN++;
      });
      var meate = isObj(pl.meate) ? pl.meate : {};
      plan = { items: pl.items.map(String), meate: { choices: strList(meate.choices, 120, 8), ink: cleanInk(meate.ink) },
        done: doneN, total: pl.items.length, allDone: pl.items.length > 0 && doneN >= pl.items.length };
    } else order.forEach(function (id) { var it = items[id]; it.done = it.total > 0 || !!it.made; });
    var total = 0, correct = 0, hints = 0;
    order.forEach(function (id) { if (id !== 'make') { total += items[id].total; correct += items[id].correct; hints += items[id].hints; } });
    // 内容ごとの○×
    var tags = {};
    probs.forEach(function (x) { if (!x.tag) return; var t = tags[x.tag] || (tags[x.tag] = { c: 0, w: 0 }); if (x.correct) t.c++; else t.w++; });
    return {
      date: date,
      items: order.map(function (id) { return items[id]; }),
      problems: { total: total, correct: correct, hints: hints },
      stars: stars, made: made, friend: friend, friendCorrect: friendOk,
      plan: plan, tags: tags, _probs: probs
    };
  }

  /* ---------- 候補づくり ---------- */
  function meateText(m) { return m && m.choices ? m.choices.join(' ') : ''; }
  function relItem(it, mt, planned) {
    if (planned) return true;
    if (!mt) return false;
    var m = /^(?:lesson|more)-(\d+)$/.exec(it.itemId);
    if (m) {
      if (mt.indexOf('第' + m[1] + '時') >= 0) return true;
      var l = lessonByNo(m[1]);
      if (l && ((l.meate && mt.indexOf(l.meate) >= 0) || (l.title && mt.indexOf(l.title) >= 0))) return true;
    }
    if (it.itemId === 'matome' && kwHit(mt, KIND_KW.matome)) return true;
    if (it.itemId === 'make' && kwHit(mt, KIND_KW.make)) return true;
    if (it.itemId === 'friend' && kwHit(mt, KIND_KW.friend)) return true;
    if (kwHit(mt, KIND_KW.all) && it.total) return true;
    for (var i = 0; i < it.tags.length; i++) if (TAGS[it.tags[i]] && kwHit(mt, TAGS[it.tags[i]].kw)) return true;
    return false;
  }
  // Y：履歴から自動で出す項目 [{text, rel}]（めあてに関係するものが上）
  function yAuto(hist, meate) {
    var mt = meateText(meate), out = [];
    hist.items.forEach(function (it) {
      if (it.itemId === 'make') return;
      if (!it.total) return;
      var lm = /^lesson-(\d+)$/.exec(it.itemId), name = lm ? '第' + lm[1] + '時のれんしゅう' : it.label;
      out.push({ text: name + ' ' + it.total + '問中' + it.correct + '問○', rel: relItem(it, mt, false) ? 'meate' : (it.planned ? 'plan' : false) });
    });
    var p = hist.problems;
    if (p.total) {
      if (p.hints) out.push({ text: 'ヒントを使った：' + p.hints + '回', rel: kwHit(mt, KIND_KW.hints) && 'meate' });
      else if (p.total >= 3) out.push({ text: 'ヒントを使わずにといた', rel: kwHit(mt, KIND_KW.hints) && 'meate' });
    }
    if (hist.made) out.push({ text: '問題を' + hist.made + 'こ作った', rel: relItem({ itemId: 'make', tags: [], total: 0 }, mt, false) ? 'meate' : (hist.items.some(function (i) { return i.itemId === 'make' && i.planned; }) ? 'plan' : false) });
    if (hist.stars.length) out.push({ text: '星を' + hist.stars.length + 'こゲット', rel: kwHit(mt, KIND_KW.stars) && 'meate' });
    if (hist.plan && hist.plan.total) out.push({ text: '今日の計画：' + hist.plan.total + 'こ中' + hist.plan.done + 'こできた', rel: 'plan' });
    // めあてに関係するもの → 計画にあるもの → ほか の順（同じなら元の順）
    var rank = { meate: 2, plan: 1 };
    return out.map(function (x, i) { x.i = i; x.r = rank[x.rel] || 0; return x; }).sort(function (a, b) { return (b.r - a.r) || (a.i - b.i); })
      .map(function (x) { return { text: x.text, rel: !!x.rel, why: x.rel || null }; });
  }
  function decs(s) { s = String(s); var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  function padDec(s, n) { s = String(s); var d = decs(s); if (d >= n) return s; return (d ? s : s + '.') + new Array(n - d + 1).join('0'); }
  function opSym(op) { return op === '-' ? '−' : '＋'; }
  function toMilli(s) { var p = String(s).split('.'); return parseInt(p[0] || '0', 10) * 1000 + parseInt(((p[1] || '') + '000').slice(0, 3), 10); }
  // 1つの問題（第○時の問題）から、具体的な「できたこと」
  function probCandidate(p) {
    if (!p) return null;
    if (p.type === 'hissan') {
      var da = decs(p.a), db = decs(p.b), ex = p.a + opSym(p.op) + p.b;
      if (da !== db) {
        var n = Math.max(da, db);
        if (da < db) return ex + ' を ' + padDec(p.a, n) + opSym(p.op) + p.b + ' と考えてできた';
        return ex + ' で、' + p.b + ' を ' + padDec(p.b, n) + ' と考えてできた';
      }
      var r = p.op === '-' ? toMilli(p.a) - toMilli(p.b) : toMilli(p.a) + toMilli(p.b);
      var dmax = Math.max(da, db);
      if (dmax > 0 && r % Math.pow(10, 3 - dmax + 1) === 0) {
        var rs = (r / 1000).toString();
        return ex + '＝' + rs + ' の、さいごの0を消して書けた';
      }
      return null;
    }
    if (p.type === 'fill' && p.tag === 'hyoshikata') {
      var ans = (p.parts || []).filter(function (x) { return x && typeof x === 'object' && x.a; }).map(function (x) { return x.a; });
      if (ans.some(function (a) { return decs(a) === 3; })) return '小数第三位（0.001の位）まで表せた';
      if (p.fig && p.fig.kind === 'numberline') return '数直線の目もりを、小数で読めた';
      if (p.fig && p.fig.kind === 'masu') return 'ますのかさを、小数で表せた';
      return null;
    }
    if (p.type === 'choice' && p.tag === 'shikumi' && /第三位|第二位/.test(String(p.a))) return '小数第三位まで、位の名前がわかった';
    if (p.type === 'order') return 'いくつもの小数を、大きい順にならべられた';
    return null;
  }
  var TAG_CAND = {
    hyoshikata: '0.01や0.001を使って、はしたを小数で表せた',
    shikumi: '0.01や0.001が何こ集まった数か、考えられた',
    daisho: '小数点をそろえて、大きさをくらべられた',
    jubai: '10倍・1/10で、位が1つずつ動くことがわかった',
    tashizan: '筆算で小数点をそろえて、たし算ができた',
    hikizan: '筆算で小数点をそろえて、ひき算ができた',
    kimari: '計算のきまりを使って、くふうして計算できた'
  };
  // W：わかったこと・できたことの候補 [text]
  function wCandidates(hist, meate) {
    var mt = meateText(meate), rel = [], oth = [];
    function add(text, isRel) { if (!text) return; if (rel.indexOf(text) >= 0 || oth.indexOf(text) >= 0) return; (isRel ? rel : oth).push(text); }
    var probs = hist._probs || [];
    // 具体的な候補（第○時の○だった問題から）。整数−小数 → 位のそろえ → さいごの0 の順に、2こまで
    var specs = [];
    probs.forEach(function (x) {
      if (!x.correct) return;
      var c = probCandidate(x.p);
      if (!c || specs.some(function (s) { return s.c === c; })) return;
      var pr = /を \d+\.0+−/.test(c) ? 0 : / を .* と考えて/.test(c) ? 1 : 2;
      specs.push({ c: c, pr: pr, rel: !!(x.tag && TAGS[x.tag] && kwHit(mt, TAGS[x.tag].kw)) });
    });
    specs.sort(function (a, b) { return a.pr - b.pr; }).slice(0, 2).forEach(function (s) { add(s.c, s.rel); });
    Object.keys(hist.tags || {}).forEach(function (tag) {
      var t = hist.tags[tag];
      if (t.c && TAG_CAND[tag]) add(TAG_CAND[tag], TAGS[tag] && kwHit(mt, TAGS[tag].kw));
    });
    if (probs.some(function (x) { return x.correct && x.n > 1; })) add('まちがえた問題を、やり直して○にできた', false);
    var p = hist.problems;
    if (p.total >= 3 && !p.hints) add('ヒントを使わずに○がとれた', kwHit(mt, KIND_KW.hints));
    hist.items.forEach(function (it) {
      if (/^lesson-\d+$/.test(it.itemId) && it.total >= 3 && it.correct === it.total) add('第' + it.itemId.slice(7) + '時のれんしゅうを、ぜんぶ○にできた', relItem(it, mt, it.planned));
    });
    if (hist.made) add('自分で問題を作れた', kwHit(mt, KIND_KW.make));
    if (hist.friendCorrect) add('ともだちの問題がとけた', kwHit(mt, KIND_KW.friend));
    var out = rel.concat(oth);
    if (out.length < 3) ['まちがえたわけが、わかった', '友だちの考えを聞いて、わかった'].forEach(function (s) { add(s, false); });
    return rel.concat(oth).slice(0, 6);
  }
  // T：次にやりたいことのおすすめ [{text, item}]
  function tSuggestions(hist, meate, evalv) {
    var out = [], seen = {};
    function add(text, itemId) { if (!text || seen[text] || out.length >= 6) return; seen[text] = 1; out.push({ text: text, item: itemId || null }); }
    var mt = meateText(meate);
    if (evalv === 'triangle' && (mt || inkHas(meate && meate.ink))) add(mt ? 'めあて「' + meate.choices[0] + '」に、もう一度ちょうせんする' : '今日のめあてに、もう一度ちょうせんする', null);
    // 今日のこり（計画にあって、まだやっていない）
    hist.items.forEach(function (it) { if (it.planned && !it.done) add('のこった ' + it.label + ' をやる', it.planId || it.itemId); });
    // ×が多かった内容のふくしゅう
    var weak = Object.keys(hist.tags || {}).map(function (k) { return { tag: k, w: hist.tags[k].w, c: hist.tags[k].c }; })
      .filter(function (x) { return x.w >= 2 || (x.w >= 1 && x.w >= x.c); })
      .sort(function (a, b) { return b.w - a.w; });
    weak.forEach(function (x) {
      var hasTopic = topics().some(function (t) { return t.id === x.tag; });
      if (hasTopic) add('ふくしゅう「' + topicTitle(x.tag) + '」で、まちがえたところをやり直す', 'review-' + x.tag);
      else if (x.tag === 'kimari') add('第9時「計算のきまり」を、もう一度やる', 'lesson-9');
    });
    // 地図の次の予定
    var p = planner(), rm = p && p.roadmap ? tryCall(function () { return p.roadmap(); }, null) : null;
    if (rm && Array.isArray(rm.days)) {
      var days = rm.days.filter(function (d) { return d && isDate(d.date) && d.date > hist.date && Array.isArray(d.items) && d.items.length; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (days[0]) days[0].items.slice(0, 3).forEach(function (id) { add('次の予定（' + fmtDate(days[0].date) + '）：' + itemLabel(String(id)), String(id)); });
    }
    // 地図がないとき：まだ星がそろっていない時
    if (out.length < 3) {
      var ls0 = lessons();
      for (var i = 0; i < ls0.length && out.length < 4; i++) {
        var l = ls0[i];
        var st = tryCall(function () { return S.Store.stats('lesson-' + l.no); }, null);
        var n = (l.problems || []).length;
        if (!st || st.correct < n) { add('第' + l.no + '時「' + l.title + '」のれんしゅうをする', 'lesson-' + l.no); break; }
      }
    }
    if (out.length < 3) add('まとめモードで、力だめしをする', 'matome');
    if (out.length < 3) add('問題を作って、ともだちに出す', 'make');
    return out;
  }
  // 前回の T を、今日の計画やめあてに使ってやったか
  function usedPrevT(hist, today) {
    var prev = null, l = list();
    for (var i = 0; i < l.length; i++) if (l[i].date < today && (l[i].t.choices.length || l[i].t.items.length)) { prev = l[i]; break; }
    if (!prev || !hist.plan) return false;
    var mch = hist.plan.meate.choices;
    if (prev.t.choices.some(function (c) { return mch.indexOf(c) >= 0; })) return true;
    var doneIds = {};
    hist.items.forEach(function (it) { if (it.planned && it.done) { doneIds[it.itemId] = 1; if (it.planId) doneIds[it.planId] = 1; } });
    return prev.t.items.some(function (id) { return doneIds[id] || doneIds[myIdOf(id)]; });
  }

  /* ====================================================================
   * 画面（DOM）
   * ==================================================================== */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function toast(msg) {
    var t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2600);
  }
  function confirmDialog(message, okLabel, onOk) {
    var back = h('div', 'modal-back');
    var box = h('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.appendChild(h('div', 'modal-msg', message));
    var row = h('div', 'modal-row');
    row.appendChild(button('やめる', '', function () { back.remove(); }));
    row.appendChild(button(okLabel || 'OK', 'danger', function () { back.remove(); onOk(); }));
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
  }
  function dpr() { return Math.max(1, Math.min(3, root.devicePixelRatio || 1)); }
  function drawInk(ink, opts) {
    opts = opts || {};
    if (S.Present && typeof S.Present.drawInk === 'function') {
      try { var c0 = S.Present.drawInk(ink, opts); if (c0) return c0; } catch (e) { /* 下で描く */ }
    }
    var w = (ink && ink.w) || 600, hh = (ink && ink.h) || 200;
    var sc = Math.min((opts.width || w) / w, opts.height ? opts.height / hh : Infinity);
    var dw = Math.round(w * sc), dh = Math.round(hh * sc), r = dpr();
    var c = document.createElement('canvas');
    c.width = Math.round(dw * r); c.height = Math.round(dh * r);
    c.style.width = dw + 'px'; c.style.height = dh + 'px';
    var ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.setTransform(r * sc, 0, 0, r * sc, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#1f2a44';
    ctx.lineWidth = Math.max(opts.lineWidth || 5, 1.3 / sc);
    ((ink && ink.strokes) || []).forEach(function (st) {
      if (!st.length) return;
      ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y);
      for (var i = 1; i < st.length; i++) ctx.lineTo(st[i].x, st[i].y);
      if (st.length === 1) ctx.lineTo(st[0].x + 0.1, st[0].y);
      ctx.stroke();
    });
    if (opts.label) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', opts.label); }
    return c;
  }
  // 手書きの縮小。押すと大きく見る
  function inkThumb(ink, opts) {
    var b = h('button', 'rf-ink-thumb');
    b.type = 'button';
    b.setAttribute('aria-label', (opts.label || '手書き') + '（おすと大きくなります）');
    b.appendChild(drawInk(ink, { width: opts.width, height: opts.height, trim: true, lineWidth: 6 }));
    b.addEventListener('click', function () { showBig(ink, opts.label); });
    return b;
  }
  function showBig(ink, label) {
    var back = h('div', 'modal-back rf-big-back');
    var box = h('div', 'modal rf-big');
    box.setAttribute('role', 'dialog');
    if (label) box.appendChild(h('div', 'rf-big-label', label));
    var vw = Math.min(1000, (root.innerWidth || 1000) - 120), vh = Math.min(520, (root.innerHeight || 700) - 220);
    box.appendChild(drawInk(ink, { width: vw, height: vh, trim: true, lineWidth: 6, label: label }));
    var row = h('div', 'modal-row');
    row.appendChild(button('とじる', 'primary', function () { back.remove(); }));
    box.appendChild(row);
    back.appendChild(box);
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }

  /* 自作のSVG（◎○△・チェック） */
  var EVAL_SVG = {
    double: '<circle cx="24" cy="24" r="19" fill="none" stroke="#d23c3c" stroke-width="4.5"/><circle cx="24" cy="24" r="9.5" fill="none" stroke="#d23c3c" stroke-width="4.5"/>',
    single: '<circle cx="24" cy="24" r="17" fill="none" stroke="#e0702a" stroke-width="5"/>',
    triangle: '<path d="M24 7 42 39H6Z" fill="none" stroke="#3a6fb0" stroke-width="5" stroke-linejoin="round"/>'
  };
  function evalSvg(k, cls) {
    return '<svg class="' + (cls || 'rf-eval-svg') + '" viewBox="0 0 48 48" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' + (EVAL_SVG[k] || '') + '</svg>';
  }
  var CHECK_SVG = '<svg class="rf-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">' +
    '<rect x="2" y="2" width="20" height="20" rx="5" class="rf-check-box"/><path d="M6.5 12.5l3.7 3.7 7.5-8" class="rf-check-mark"/></svg>';

  // トグル（大きなボタン）
  function chip(text, on, onToggle, extraCls) {
    var b = h('button', 'rf-chip' + (extraCls ? ' ' + extraCls : ''));
    b.type = 'button';
    b.innerHTML = CHECK_SVG;
    b.appendChild(h('span', 'rf-chip-text', text));
    function set(v) { on = !!v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    set(on);
    b.addEventListener('click', function () { set(!on); if (onToggle) onToggle(on); });
    return { el: b, on: function () { return on; }, set: set, text: text };
  }

  /* 手書き欄（文字に変換しない）。座標は論理サイズ w×h で持つ */
  function InkPad(o) {
    var W = o.w, H = o.h, lw = o.lineWidth || 5;
    var strokes = (o.ink && o.ink.strokes ? o.ink.strokes : []).map(function (s) { return s.map(function (p) { return { x: p.x, y: p.y }; }); });
    var hist = [], cur = null, activeId = null, listeners = [], localPen = false;
    var wrap = h('div', 'rf-pad' + (o.cls ? ' ' + o.cls : ''));
    var area = h('div', 'rf-pad-area');
    area.style.aspectRatio = W + ' / ' + H;
    var canvas = document.createElement('canvas');
    canvas.className = 'rf-pad-canvas';
    canvas.style.touchAction = 'none';
    var ph = h('div', 'rf-pad-ph', o.placeholder || 'ここに書こう');
    area.appendChild(canvas); area.appendChild(ph);
    var tools = h('div', 'rf-pad-tools');
    var bUndo = button('1画もどす', 'rf-tool', function () { if (hist.length) { strokes = hist.pop(); redraw(); changed(); } });
    var bAll = button('けす', 'rf-tool', function () { if (strokes.length) { hist.push(strokes.slice()); strokes = []; redraw(); changed(); } });
    tools.appendChild(bUndo); tools.appendChild(bAll);
    wrap.appendChild(area); wrap.appendChild(tools);
    var ctx = canvas.getContext('2d'), dispW = 0, dispH = 0;
    function changed() {
      ph.hidden = strokes.length > 0;
      bUndo.disabled = !hist.length; bAll.disabled = !strokes.length;
      listeners.forEach(function (f) { try { f(); } catch (e) {} });
    }
    function fit() {
      var cw = Math.floor(area.clientWidth);
      if (!cw) return;
      var chh = Math.round(cw * H / W);
      if (cw === dispW && chh === dispH) return;
      dispW = cw; dispH = chh;
      var r = dpr();
      canvas.width = Math.round(cw * r); canvas.height = Math.round(chh * r);
      canvas.style.width = cw + 'px'; canvas.style.height = chh + 'px';
      redraw();
    }
    function setT() {
      if (!ctx) return;
      var r = dpr(), sc = dispW / W;
      ctx.setTransform(r * sc, 0, 0, r * sc, 0, 0);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = ctx.fillStyle = '#1f2a44';
      ctx.lineWidth = lw;
    }
    function drawStroke(st) {
      if (!st.length || !ctx) return;
      if (st.length === 1) { ctx.beginPath(); ctx.arc(st[0].x, st[0].y, lw / 2, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y);
      for (var i = 1; i < st.length; i++) ctx.lineTo(st[i].x, st[i].y);
      ctx.stroke();
    }
    function redraw() {
      if (!dispW || !ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setT();
      strokes.forEach(drawStroke);
    }
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) * (rect.width ? W / rect.width : 1);
      var y = (e.clientY - rect.top) * (rect.height ? H / rect.height : 1);
      return { x: Math.round(Math.max(0, Math.min(W, x))), y: Math.round(Math.max(0, Math.min(H, y))) };
    }
    function accept(e) {
      if (e.pointerType === 'pen') { localPen = true; return true; }
      var seen = tryCall(function () { return S.Pad && S.Pad.penSeen && S.Pad.penSeen(); }, false);
      if (e.pointerType === 'touch' && (localPen || seen)) return false;
      if (e.pointerType === 'mouse' && e.button !== 0) return false;
      return true;
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!accept(e) || activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      hist.push(strokes.slice());
      cur = [pos(e)];
      strokes = strokes.concat([cur]);
      setT(); drawStroke(cur);
      ph.hidden = true;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== activeId || !cur) return;
      e.preventDefault();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) {
        var p = pos(evs[i]), last = cur[cur.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 2) continue;
        cur.push(p);
        setT(); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
    });
    function end(e) { if (e.pointerId !== activeId) return; activeId = null; if (cur) { cur = null; redraw(); changed(); } }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    var ro = null;
    if (root.ResizeObserver) { ro = new ResizeObserver(fit); ro.observe(area); } else root.addEventListener('resize', fit);
    setTimeout(fit, 0);
    changed();
    return {
      el: wrap,
      ink: function () { return strokes.length ? { w: W, h: H, strokes: strokes.map(function (s) { return s.map(function (p) { return { x: p.x, y: p.y }; }); }) } : null; },
      isEmpty: function () { return !strokes.length; },
      onChange: function (fn) { listeners.push(fn); },
      flag: function (on) { wrap.classList.toggle('rf-need', !!on); },
      destroy: function () { if (ro) ro.disconnect(); else root.removeEventListener('resize', fit); }
    };
  }

  function colHead(letter, title, sub) {
    var hd = h('div', 'rf-col-head');
    hd.appendChild(h('span', 'rf-letter', letter));
    var t = h('div', 'rf-col-title');
    t.appendChild(h('h2', null, title));
    if (sub) t.appendChild(h('span', 'rf-col-sub', sub));
    hd.appendChild(t);
    return hd;
  }
  function meateNode(meate, small) {
    var box = h('div', 'rf-meate-body');
    var has = false;
    (meate && meate.choices || []).forEach(function (c) { box.appendChild(h('span', 'rf-meate-chip', c)); has = true; });
    if (meate && inkHas(meate.ink)) { box.appendChild(inkThumb(meate.ink, { width: small ? 160 : 240, height: small ? 40 : 52, label: 'めあて（手書き）' })); has = true; }
    if (!has) box.appendChild(h('span', 'rf-meate-none', 'めあてなし'));
    return box;
  }

  /* ---------- mountYWT ---------- */
  /* ---------- 先生に送る（追加6） ---------- */
  // 送るときに、じぶんのことと学習データのまとめを足す
  function forSend(r) {
    var o = JSON.parse(JSON.stringify(r));
    var p = myProfile() || cleanProfile(r.profile);
    if (p) { o.profile = p; o.name = null; }
    if (S.Summary && S.Summary.build) { var sm = tryCall(function () { return S.Summary.build(); }, null); if (sm) o.summary = sm; }
    delete o.y.off;
    return o;
  }
  function formsUrl() {
    var p = planner();
    var g = p && p.goal ? tryCall(function () { return p.goal(); }, null) : null;
    var u = g && typeof g.formsUrl === 'string' ? g.formsUrl : '';
    // ゴールに無いときは、この端末で先生が入れた Forms のURL（クラスのきろく）
    if (!u && S.Classbook && typeof S.Classbook.formsUrl === 'function') u = tryCall(function () { return S.Classbook.formsUrl(); }, '') || '';
    var sh = S.Share;
    if (u && sh && sh.isFormsUrl && !sh.isFormsUrl(u)) return '';
    return u;
  }
  // text をコピーして、Forms のURLがあれば Forms を開く。なければ「Teams にはってね」。
  // ui = { msg:要素, codeBox:要素, msgClass:'rf-msg' など }。戻り値 Promise<{copied, opened, forms}>
  function deliver(text, ui) {
    ui = ui || {};
    var mc = ui.msgClass || 'rf-msg';
    var fu = formsUrl();
    function say(t, cls) { if (ui.msg) { ui.msg.textContent = t; ui.msg.className = mc + (cls ? ' ' + cls : ''); } }
    function formsLink(label) {
      var a = h('a', 'btn primary rf-forms-link', label || 'Forms をひらく');
      a.href = fu; a.target = '_blank'; a.rel = 'noopener';
      return a;
    }
    function openForms() {
      var w = null;
      try { w = root.open(fu, '_blank'); } catch (e) { w = null; }
      if (w) { try { w.opener = null; } catch (e) {} }
      return !!w;
    }
    function fallback() {
      var box = ui.codeBox;
      say(fu ? '下のコードをコピー（Ctrl＋C）して、Forms にはりつけて送信してね。' : '下のコードをコピーして、Teams の先生へのチャットに はりつけてね。', 'good');
      if (box) {
        box.innerHTML = '';
        box.hidden = false;
        box.appendChild(h('div', 'rf-code-msg', fu ? 'うまくコピーできなかったよ。下のコードがえらばれているので、Ctrl＋C でコピーしてから、Forms をひらいて はりつけてね。'
          : 'うまくコピーできなかったよ。下のコードがえらばれているので、Ctrl＋C でコピーして、Teams にはりつけてね。'));
        var ta = h('textarea', 'rf-code-ta');
        ta.value = text; ta.readOnly = true; ta.rows = 3;
        ta.addEventListener('focus', function () { ta.select(); });
        box.appendChild(ta);
        if (fu) box.appendChild(formsLink());
        setTimeout(function () { try { ta.focus(); ta.select(); } catch (e) {} }, 30);
      }
      return { copied: false, opened: false, forms: !!fu };
    }
    var cb = root.navigator && root.navigator.clipboard;
    if (!(cb && cb.writeText)) return Promise.resolve(fallback());
    return cb.writeText(text).then(function () {
      var box = ui.codeBox;
      if (box) { box.innerHTML = ''; box.hidden = true; }
      if (fu) {
        var opened = openForms();
        say('コードをコピーしたよ。Forms が開くよ。はりつけて（Ctrl＋V）送信してね。', 'good');
        toast('コピーしたよ。Forms にはりつけて送信してね。');
        if (box) {
          box.hidden = false;
          box.appendChild(h('div', 'rf-code-msg', opened ? 'Forms がひらかないときは、ここをおしてね。' : 'Forms がひらかなかったよ。ここをおして ひらいてね。'));
          box.appendChild(formsLink());
        }
        return { copied: true, opened: opened, forms: true };
      }
      say('コードをコピーしたよ。Teams の先生へのチャットに はりつけてね。', 'good');
      toast('コピーしたよ。Teams にはりつけてね。');
      return { copied: true, opened: false, forms: false };
    }, fallback);
  }

  function mountYWT(el, date) {
    date = isDate(date) ? date : dateKey();
    var pads = [];
    var hist = history(date);
    var prev = get(date);
    var meate = hist.plan ? hist.plan.meate : (prev ? prev.meate : { choices: [], ink: null });
    var hasMeate = !!(meate.choices.length || inkHas(meate.ink));
    var wrap = h('div', 'rf rf-ywt');
    el.appendChild(wrap);

    // いちばん上：めあて と 名前
    var top = h('section', 'rf-top');
    var mBox = h('div', 'rf-meate');
    mBox.appendChild(h('span', 'rf-meate-label', '今日のめあて'));
    mBox.appendChild(meateNode(meate));
    top.appendChild(mBox);
    var nameBox = h('div', 'rf-name');
    top.appendChild(nameBox);
    wrap.appendChild(top);
    // 名前：じぶんのこと（Profile）の名前を文字で出す（追加6。手書きはやめた）
    var prof = myProfile();
    function editProfile() {
      if (!(S.Profile && S.Profile.openDialog)) return;
      S.Profile.openDialog({ note: 'ふりかえりと、先生に送るコードに入るよ。', onSave: function (p) { prof = p; drawName(); clearWarn(); } });
    }
    function drawName() {
      nameBox.innerHTML = '';
      nameBox.classList.toggle('rf-name-need', !prof);
      if (prof) {
        nameBox.appendChild(h('span', 'rf-name-label', 'なまえ'));
        nameBox.appendChild(h('span', 'rf-name-text', profileText(prof)));
        nameBox.appendChild(button('かえる', 'small rf-name-edit', editProfile));
      } else {
        nameBox.appendChild(h('span', 'rf-name-label', 'なまえ'));
        nameBox.appendChild(button('じぶんのことを入れる', 'primary rf-name-edit', editProfile));
      }
    }
    drawName();

    var cols = h('div', 'rf-cols');
    wrap.appendChild(cols);

    // ===== Y =====
    var colY = h('section', 'rf-col rf-y');
    colY.appendChild(colHead('Y', 'やったこと', hasMeate ? 'めあてに向けて やったことに チェック' : 'やったことに チェック'));
    var autos = yAuto(hist, meate);
    var prevOff = prev ? prev.y.off : null; // 前にチェックをはずしたもの（新しく出たものはチェック済み）
    var autoChips = [];
    var yList = h('div', 'rf-list');
    if (autos.length) {
      yList.appendChild(h('div', 'rf-sub', 'アプリの記録から'));
      autos.forEach(function (a) {
        var c = chip(a.text, !(prevOff && prevOff.indexOf(a.text) >= 0), null, a.rel ? 'rf-rel' : '');
        if (a.why) c.el.appendChild(h('span', 'rf-tag rf-tag-' + a.why, a.why === 'meate' ? 'めあて' : '計画'));
        autoChips.push(c); yList.appendChild(c.el);
      });
    } else yList.appendChild(h('div', 'rf-empty', '今日のアプリの記録は、まだないよ'));
    colY.appendChild(yList);
    colY.appendChild(h('div', 'rf-sub', 'アプリの外でやったこと'));
    var exGrid = h('div', 'rf-grid2');
    var exChips = EXTRA.map(function (t) { var c = chip(t, !!(prev && prev.y.extra.indexOf(t) >= 0), null, 'rf-extra'); exGrid.appendChild(c.el); return c; });
    colY.appendChild(exGrid);
    cols.appendChild(colY);

    // ===== W =====
    var colW = h('section', 'rf-col rf-w');
    colW.appendChild(colHead('W', 'わかったこと・できたこと'));
    var q = h('div', 'rf-quote');
    if (hasMeate) {
      q.appendChild(h('span', 'rf-quote-pre', 'めあて'));
      if (meate.choices.length) q.appendChild(h('span', 'rf-quote-text', '「' + meate.choices.join('・') + '」'));
      if (inkHas(meate.ink)) q.appendChild(drawInk(meate.ink, { width: 140, height: 34, trim: true, lineWidth: 6 }));
      q.appendChild(h('span', 'rf-quote-post', 'は、どうだった？'));
    } else q.appendChild(h('span', 'rf-quote-post', '今日の学習は、どうだった？'));
    colW.appendChild(q);
    var evRow = h('div', 'rf-evals');
    evRow.setAttribute('role', 'radiogroup');
    evRow.setAttribute('aria-label', 'じぶんのひょうか');
    var evalv = prev ? prev.w.eval : null, evBtns = {};
    ['double', 'single', 'triangle'].forEach(function (k) {
      var b = h('button', 'rf-eval rf-eval-' + k);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', EVALS[k]);
      b.innerHTML = evalSvg(k);
      b.appendChild(h('span', 'rf-eval-label', EVALS[k]));
      b.addEventListener('click', function () { setEval(k); });
      evBtns[k] = b; evRow.appendChild(b);
    });
    function setEval(k) {
      evalv = k;
      for (var kk in evBtns) { evBtns[kk].classList.toggle('on', kk === k); evBtns[kk].setAttribute('aria-checked', kk === k ? 'true' : 'false'); }
      evRow.classList.remove('rf-need');
      clearWarn();
      drawT();
    }
    colW.appendChild(evRow);
    colW.appendChild(h('div', 'rf-sub', 'タップしてえらべるよ'));
    var wList = h('div', 'rf-list');
    var wCands = wCandidates(hist, meate);
    (prev ? prev.w.choices : []).forEach(function (c) { if (wCands.indexOf(c) < 0) wCands.push(c); });
    var wChips = wCands.map(function (t) { var c = chip(t, !!(prev && prev.w.choices.indexOf(t) >= 0)); wList.appendChild(c.el); return c; });
    colW.appendChild(wList);
    colW.appendChild(h('div', 'rf-sub', 'じぶんのことばで書こう'));
    var wPad = InkPad({ w: 600, h: 180, ink: prev && prev.w.ink, placeholder: 'わかったこと・できたことを書こう' });
    pads.push(wPad);
    colW.appendChild(wPad.el);
    cols.appendChild(colW);

    // ===== T =====
    var colT = h('section', 'rf-col rf-t');
    colT.appendChild(colHead('T', '次にやりたいこと', 'えらんだことは、次の計画に出てくるよ'));
    var tList = h('div', 'rf-list');
    colT.appendChild(tList);
    var tSel = {}; // text -> itemId|null（えらんだもの）
    if (prev) prev.t.choices.forEach(function (c, i) { tSel[c] = null; });
    var tItemsPrev = prev ? prev.t.items : [];
    function drawT() {
      tList.innerHTML = '';
      var sug = tSuggestions(hist, meate, evalv);
      Object.keys(tSel).forEach(function (c) { if (!sug.some(function (s) { return s.text === c; })) sug.push({ text: c, item: tSel[c] }); });
      sug.forEach(function (s) {
        if (s.item == null && tItemsPrev.length && tSel.hasOwnProperty(s.text)) s.item = tSel[s.text];
        var c = chip(s.text, tSel.hasOwnProperty(s.text), function (on) { if (on) tSel[s.text] = s.item; else delete tSel[s.text]; });
        tList.appendChild(c.el);
      });
    }
    if (evalv) setEval(evalv); else drawT();
    colT.appendChild(h('div', 'rf-sub', 'じぶんで書いて たす'));
    var tPad = InkPad({ w: 600, h: 180, ink: prev && prev.t.ink, placeholder: '次にやりたいことを書こう' });
    pads.push(tPad);
    colT.appendChild(tPad.el);
    cols.appendChild(colT);

    // ===== ほぞん・先生に送る =====
    var bar = h('section', 'rf-bar');
    var msg = h('div', 'rf-msg');
    msg.setAttribute('role', 'status');
    var saveB = button('ほぞん', 'primary rf-save', doSave);
    var sendB = button('先生に送る', 'rf-send', doSend);
    sendB.disabled = !prev;
    var codeBox = h('div', 'rf-codebox');
    codeBox.hidden = true;
    bar.appendChild(msg); bar.appendChild(saveB); bar.appendChild(sendB);
    wrap.appendChild(bar);
    wrap.appendChild(codeBox);
    var saved = prev;

    function clearWarn() { nameBox.classList.remove('rf-need'); if (msg && /warn/.test(msg.className)) { msg.textContent = ''; msg.className = 'rf-msg'; } }
    function build() {
      var tChoices = Object.keys(tSel);
      var items = [];
      tChoices.forEach(function (c) { if (tSel[c]) uniqPush(items, tSel[c]); });
      return {
        v: 1, date: date, name: prof ? null : profileName(), profile: prof || undefined,
        meate: { choices: meate.choices.slice(), ink: meate.ink || null },
        y: { auto: autoChips.filter(function (c) { return c.on(); }).map(function (c) { return c.text; }),
          extra: exChips.filter(function (c) { return c.on(); }).map(function (c) { return c.text; }),
          off: autoChips.filter(function (c) { return !c.on(); }).map(function (c) { return c.text; }) },
        w: { eval: evalv, choices: wChips.filter(function (c) { return c.on(); }).map(function (c) { return c.text; }), ink: wPad.ink() },
        t: { choices: tChoices, ink: tPad.ink(), items: items },
        aid: deviceId(), saved: new Date().toISOString()
      };
    }
    function doSave() {
      prof = myProfile() || prof;
      var need = [];
      if (!prof) { need.push('なまえ（じぶんのこと）'); nameBox.classList.add('rf-need'); }
      if (!evalv) { need.push('ひょうか'); evRow.classList.add('rf-need'); }
      if (need.length) { msg.textContent = need.join('と') + 'を わすれずに！'; msg.className = 'rf-msg warn'; return; }
      var r = build();
      var ok = save(r);
      saved = get(date) || cleanReflection(r);
      var info = { date: date, eval: evalv, planDone: !!(hist.plan && hist.plan.allDone), usedPrevT: usedPrevT(hist, date) };
      if (S.Stars && S.Stars.log) { try { S.Stars.log('reflect', info); } catch (e) { if (root.console) console.error('Stars.log', e); } }
      msg.textContent = ok ? 'ほぞんしたよ。つぎは「先生に送る」をおそう。' : 'この端末がいっぱいで、ほぞんしきれなかったかも。先生に送っておこう。';
      msg.className = 'rf-msg' + (ok ? ' good' : ' warn');
      sendB.disabled = false;
      sendB.classList.add('primary');
      saveB.classList.remove('primary');
      saveB.textContent = 'ほぞんしなおす';
    }
    function doSend() {
      var sh = S.Share;
      if (!saved) return;
      if (!sh || typeof sh.encodeReflection !== 'function') { msg.textContent = '送る機能は、まだじゅんび中です。'; msg.className = 'rf-msg warn'; return; }
      sendB.disabled = true;
      var r = forSend(saved);
      Promise.resolve().then(function () { return sh.encodeReflection(r); }).then(function (token) {
        var text = typeof sh.codeText === 'function' ? sh.codeText(token) : token;
        sendB.disabled = false;
        return deliver(text, { msg: msg, codeBox: codeBox, msgClass: 'rf-msg' });
      }).catch(function (e) {
        sendB.disabled = false;
        msg.textContent = /TOO_LONG/i.test(String(e && (e.code || e.message))) ? '手書きが長すぎるみたい。少しみじかく書きなおしてね。' : 'コードを作れませんでした。';
        msg.className = 'rf-msg warn';
      });
    }
    return {
      destroy: function () { pads.forEach(function (p) { try { p.destroy(); } catch (e) {} }); if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    };
  }

  /* ---------- 先生：ふりかえりボックス ---------- */
  function boxList() {
    var v = getJSON(BOX_KEY, []);
    if (!Array.isArray(v)) return [];
    var out = [];
    v.forEach(function (x) { if (!isObj(x)) return; var r = cleanReflection(x.r); if (r) out.push({ key: str(x.key, 80) || boxKey(r), r: r, added: Number(x.added) || 0 }); });
    return out;
  }
  function inkSig(ink) { if (!ink) return ''; var n = 0, s = 0; ink.strokes.forEach(function (st) { n += st.length; st.forEach(function (p) { s = (s * 31 + p.x * 7 + p.y) % 1000003; }); }); return n + '.' + s; }
  function boxKey(r) { return (r.aid || (r.profile ? 'p' + r.profile.cls + '-' + r.profile.no : 'n' + inkSig(r.name))) + '|' + r.date; }
  function newer(a, b) { // a が b より新しいか（saved がなければ、あとから来たほうを新しいとする）
    if (a.saved && b.saved) return Date.parse(a.saved) >= Date.parse(b.saved);
    return true;
  }
  // [Reflection] を入れる。戻り値 {added, updated, same}
  function boxAdd(rs) {
    var l = boxList(), idx = {}, res = { added: 0, updated: 0, same: 0 };
    l.forEach(function (x, i) { idx[x.key] = i; });
    var now = Date.now();
    rs.forEach(function (r0) {
      var r = cleanReflection(r0);
      if (!r) return;
      var k = boxKey(r);
      if (k in idx) {
        var cur = l[idx[k]];
        if (JSON.stringify(cur.r) === JSON.stringify(r)) { res.same++; return; }
        if (newer(r, cur.r)) { l[idx[k]] = { key: k, r: r, added: now }; res.updated++; } else res.same++;
      } else { idx[k] = l.length; l.push({ key: k, r: r, added: now }); res.added++; }
    });
    res.ok = boxWrite(l);
    return res;
  }
  function boxWrite(l) { return rawSet(BOX_KEY, JSON.stringify(l)); }
  function boxRemove(key) { return boxWrite(boxList().filter(function (x) { return x.key !== key; })); }
  function boxClear() { return boxWrite([]); }

  function mountBox(el) {
    var alive = true;
    var wrap = h('div', 'rf rf-boxview');
    el.appendChild(wrap);
    var sec1 = h('section', 'rf-panel');
    sec1.appendChild(h('h2', null, 'ふりかえりのコードをとりこむ'));
    sec1.appendChild(h('p', 'rf-note', 'Teams のチャットを、そのままコピーしてはりつけてください。中にある「ふりかえり」のコードを全部見つけて、この端末に保存します。同じ子の同じ日のものは、新しいほうにまとめます。'));
    var ta = h('textarea', 'rf-paste');
    ta.setAttribute('aria-label', 'コードをはりつける');
    ta.placeholder = 'ここにはりつけ（Ctrl + V）';
    sec1.appendChild(ta);
    var row = h('div', 'rf-row');
    var importB = button('とりこむ', 'primary', importText);
    var msg = h('span', 'rf-msg');
    msg.setAttribute('role', 'status');
    row.appendChild(importB); row.appendChild(msg);
    sec1.appendChild(row);
    wrap.appendChild(sec1);
    var sec2 = h('section', 'rf-panel');
    wrap.appendChild(sec2);
    var filter = null; // 日付 or null（ぜんぶ）

    function setMsg(t, warn) { msg.textContent = t; msg.className = 'rf-msg' + (warn ? ' warn' : ' good'); }
    function importText() {
      var sh = S.Share, text = ta.value || '';
      if (!sh || typeof sh.extractTokens !== 'function' || typeof sh.decodeReflection !== 'function') { setMsg('ふりかえりのコードを読む機能が、まだありません。', true); return; }
      var toks = [];
      try { toks = sh.extractTokens(text) || []; } catch (e) { toks = []; }
      if (typeof sh.kindOf === 'function') toks = toks.filter(function (t) { return tryCall(function () { return sh.kindOf(t); }, null) === 'reflection'; });
      if (!toks.length) { setMsg('ふりかえりのコードが見つかりませんでした。', true); return; }
      importB.disabled = true;
      setMsg('とりこみ中…');
      Promise.all(toks.map(function (t) {
        return Promise.resolve().then(function () { return sh.decodeReflection(t); }).then(function (r) { return cleanReflection(r); }, function () { return null; });
      })).then(function (rs) {
        if (!alive) return;
        importB.disabled = false;
        var ok = rs.filter(Boolean), bad = rs.length - ok.length;
        var res = boxAdd(ok);
        var parts = [];
        if (res.added) parts.push(res.added + '件 追加');
        if (res.updated) parts.push(res.updated + '件 新しくした');
        if (res.same) parts.push(res.same + '件は同じでした');
        if (bad) parts.push(bad + '件は開けませんでした');
        if (res.ok === false) parts.push('端末がいっぱいで保存できませんでした');
        setMsg(parts.join('、') || 'とりこめませんでした。', !(res.added || res.updated) || res.ok === false);
        if (res.added || res.updated) { ta.value = ''; filter = ok.map(function (r) { return r.date; }).sort().pop(); }
        drawList();
      });
    }
    function cellList(arr, cls) {
      var ul = h('ul', 'rf-cell-list' + (cls ? ' ' + cls : ''));
      arr.forEach(function (t) { ul.appendChild(h('li', null, t)); });
      return ul;
    }
    function drawList() {
      sec2.innerHTML = '';
      var all = boxList();
      var dates = {};
      all.forEach(function (x) { dates[x.r.date] = (dates[x.r.date] || 0) + 1; });
      var dlist = Object.keys(dates).sort().reverse();
      if (filter && !dates[filter]) filter = null;
      var shown = all.filter(function (x) { return !filter || x.r.date === filter; })
        .sort(function (a, b) { return a.r.date < b.r.date ? 1 : a.r.date > b.r.date ? -1 : (a.added - b.added); });
      var head = h('div', 'rf-box-head');
      head.appendChild(h('h2', null, '集まったふりかえり（' + shown.length + '件' + (filter ? '・' + fmtDate(filter) : '') + '）'));
      if (all.length) head.appendChild(button('ぜんぶけす', 'danger small', function () {
        confirmDialog('ふりかえりボックスを、ぜんぶ消します。よろしいですか？', 'ぜんぶけす', function () { boxClear(); setMsg('ぜんぶ消しました。'); drawList(); });
      }));
      sec2.appendChild(head);
      if (!all.length) { sec2.appendChild(h('p', 'rf-note', 'まだありません。上の欄にチャットをはりつけて「とりこむ」をおしてください。')); return; }
      var fr = h('div', 'rf-filter');
      fr.appendChild(h('span', 'rf-filter-label', '日付'));
      var fa = button('ぜんぶ（' + all.length + '）', 'small' + (!filter ? ' on' : ''), function () { filter = null; drawList(); });
      fr.appendChild(fa);
      dlist.forEach(function (d) { fr.appendChild(button(fmtDate(d) + '（' + dates[d] + '）', 'small' + (filter === d ? ' on' : ''), function () { filter = d; drawList(); })); });
      sec2.appendChild(fr);
      var tw = h('div', 'rf-table-wrap');
      var tb = h('table', 'rf-table');
      var thead = h('tr');
      ['なまえ', '日付', 'めあて', 'Y やったこと', 'ひょうか', 'W わかった・できた', 'T 次にやりたいこと', ''].forEach(function (t) { thead.appendChild(h('th', null, t)); });
      tb.appendChild(thead);
      shown.forEach(function (x) {
        var r = x.r, tr = h('tr');
        var c1 = h('td', 'rf-c-name');
        if (r.profile) { c1.appendChild(h('div', 'rf-c-pname', r.profile.name)); c1.appendChild(h('div', 'rf-c-pno', r.profile.cls + '組 ' + r.profile.no + '番')); }
        else if (r.name) c1.appendChild(inkThumb(r.name, { width: 130, height: 40, label: 'なまえ' })); else c1.appendChild(h('span', 'rf-muted', '（なし）'));
        tr.appendChild(c1);
        tr.appendChild(h('td', 'rf-c-date', fmtDate(r.date)));
        var c3 = h('td', 'rf-c-meate'); c3.appendChild(meateNode(r.meate, true)); tr.appendChild(c3);
        var c4 = h('td', 'rf-c-y');
        if (r.y.auto.length) c4.appendChild(cellList(r.y.auto));
        if (r.y.extra.length) c4.appendChild(cellList(r.y.extra, 'rf-cell-extra'));
        if (!r.y.auto.length && !r.y.extra.length) c4.appendChild(h('span', 'rf-muted', '—'));
        tr.appendChild(c4);
        var c5 = h('td', 'rf-c-eval');
        if (r.w.eval) { var ev = h('span', 'rf-eval-mini'); ev.innerHTML = evalSvg(r.w.eval, 'rf-eval-svg'); ev.setAttribute('role', 'img'); ev.setAttribute('aria-label', EVALS[r.w.eval]); c5.appendChild(ev); c5.appendChild(h('div', 'rf-eval-cap', EVALS[r.w.eval])); }
        tr.appendChild(c5);
        var c6 = h('td', 'rf-c-w');
        if (r.w.choices.length) c6.appendChild(cellList(r.w.choices));
        if (r.w.ink) c6.appendChild(inkThumb(r.w.ink, { width: 200, height: 60, label: 'わかったこと・できたこと（手書き）' }));
        tr.appendChild(c6);
        var c7 = h('td', 'rf-c-t');
        if (r.t.choices.length) c7.appendChild(cellList(r.t.choices));
        if (r.t.ink) c7.appendChild(inkThumb(r.t.ink, { width: 200, height: 60, label: '次にやりたいこと（手書き）' }));
        tr.appendChild(c7);
        var c8 = h('td', 'rf-c-act');
        c8.appendChild(button('けす', 'small', function () {
          confirmDialog(fmtDate(r.date) + 'のこのふりかえりを消します。よろしいですか？', 'けす', function () { boxRemove(x.key); drawList(); });
        }));
        tr.appendChild(c8);
        tb.appendChild(tr);
      });
      tw.appendChild(tb);
      sec2.appendChild(tw);
    }
    drawList();
    return { destroy: function () { alive = false; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } };
  }

  var Reflect = {
    history: history,
    save: save, list: list, get: get,
    nextSuggestions: nextSuggestions, lastT: lastT,
    profileName: profileName, setProfileName: setProfileName,
    deliver: hasDOM ? deliver : function () { return Promise.resolve({ copied: false, opened: false, forms: false }); },
    formsUrl: formsUrl, forSend: forSend,
    mountYWT: hasDOM ? mountYWT : function () { return { destroy: function () {} }; },
    mountBox: hasDOM ? mountBox : function () { return { destroy: function () {} }; },
    boxList: boxList, boxAdd: boxAdd, boxRemove: boxRemove, boxClear: boxClear,
    EVALS: EVALS, EXTRA: EXTRA.slice(),
    // テスト・つなぎ用
    _: { yAuto: yAuto, wCandidates: wCandidates, tSuggestions: tSuggestions, usedPrevT: usedPrevT, cleanReflection: cleanReflection,
      cleanInk: cleanInk, dateKey: dateKey, probCandidate: probCandidate, mem: mem }
  };
  S.Reflect = Reflect;
  if (typeof module === 'object' && module.exports) module.exports = Reflect;
})(typeof window !== 'undefined' ? window : globalThis);
