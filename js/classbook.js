/* Shosu.Classbook — 先生の画面「クラスのきろく」（担当S）
 *
 *   Classbook.mount(el, {cls?, no?}) -> {destroy()}   #/classbook（組タブ・一覧）、#/classbook/<cls>/<no>（詳しい画面）
 *   Classbook.importText(text)   -> Promise<{students, added, updated, same, bad, noProfile, message}>
 *   Classbook.importFiles(files) -> Promise<同上>     .xlsx（Microsoft Forms の回答）.csv .txt .zip、複数可
 *   Classbook.exportCsv(cls, {download?}) -> CSVの文字列（BOMつき UTF-8）。画面があればダウンロードもする
 *   Classbook.teacherSection()   -> HTMLElement      先生メニューに入れる部品（入口・Forms のURL欄）
 *   Classbook.formsUrl()         -> 先生が入れた Forms のURL（なければ ''）
 *   Classbook.exportBook(which, {download?}) -> {name, text, book}   which は 'all' か組。ファイルに保存（.json）
 *   Classbook.parseBook(text)    -> 形をそろえた中身 | null（別のアプリ・こわれたファイル）
 *   Classbook.importBook(textOrBook, {mode:'merge'|'replace', classes?, settings?}) -> {ok, students, took, kept, perClass, message, …}
 *   Classbook.teacherName() / setTeacherName(n)   localStorage 'shosu.teacherName'（任意）
 *
 * 取りこむコード：Share.extractTokens → kindOf が 'reflection'（profile・summary 入り）と 'record'。
 *   profile {cls, no, name} で '<cls>-<no>' に振り分ける。summary は at が新しいもので上書き、
 *   ふりかえりは日付ごとにためる（同じ日は新しいほう）。profile のない古いふりかえりは「組・番号なし」に置く。
 *
 * 保存：localStorage 'shosu.classbook'
 *   { v:1, students:{ '<cls>-<no>': {profile, summary, reflections:[], override:{know,think,attitude},
 *                                    comment:{short, long, edited, variant, len}} },
 *     noProfile:[Reflection], classes:{ '<cls>': {size} }, formsUrl:'' }
 *   comment.short / comment.long は先生が直した文（直していなければ ''）。edited はどちらかを直したら true。
 *   直した日時と先生の名前：overrideMeta:{know:{at,by}|null,…}、comment.at / comment.by（前のデータには無い＝null・''）。
 *
 * ファイル（先生どうしの受けわたし）：{app:'shosu-cosmos', kind:'classbook', v:1, exportedAt, teacher,
 *   classes:[{cls,size}], students:{…上と同じ1人分…}, noProfile:[…]（全部の組のときだけ）, assessSettings}
 *   まとめる：summary は at が新しいほう、ふりかえりは日付ごと（同じ日は saved が新しいほう）、評価は観点ごと・所見は
 *   まとめて「直した日時」が新しいほう（日時が無い側は古い扱い、両方無ければこちら）。こちらが直していなければファイルのもの。
 *   組の人数は大きいほう。置きかえる：えらんだ組をファイルの内容にする。
 *   手書きは縮小用の座標だけ（{w,h,s:[[x,y,x,y,…]]}）。いっぱいのときは古いふりかえりの手書きから落とす。
 *
 * classic script。Node でも、取りこみ・CSV の部分は動く（tools/import-test.js）。
 * 名前・評価・所見は、この端末の中だけに置く（通信しない）。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var hasDOM = typeof document !== 'undefined' && !!(document && document.createElement);

  var KEY = 'shosu.classbook';
  var MAXCLS = 9, MAXNO = 45;
  var INK_MAX = 320;             // 手書きは長い辺をこの大きさに縮めて持つ
  var INK_POINTS = 1500;         // 1つの手書きの点の上限
  var MAX_FILE = 40 * 1024 * 1024;
  var MAX_UNZIP = 64 * 1024 * 1024;
  var AXES = [
    { id: 'know', short: '知', label: '知識・技能' },
    { id: 'think', short: '思', label: '思考・判断・表現' },
    { id: 'attitude', short: '態', label: '主体的に学習に取り組む態度' }
  ];
  var GRADES = ['A', 'B', 'C'];
  var EVAL_MARK = { double: '◎', single: '○', triangle: '△' };
  var EVAL_LABEL = { double: 'よくできた', single: 'できた', triangle: 'もう少し' };
  var SUPPORT_KIND = { skill: '技能', habit: '取り組み方', extend: 'のばす' };
  var PRIVACY = '個人情報なので、取り扱いに注意してください。';

  /* ---------- 小さな道具 ---------- */
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function str(s, max) { return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').slice(0, max || 200) : ''; }
  function strMl(s, max) { return typeof s === 'string' ? s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/g, ' ').slice(0, max) : ''; }
  function strList(a, maxLen, maxN) {
    if (!Array.isArray(a)) return [];
    var out = [];
    a.forEach(function (x) { if (typeof x === 'string' && x.trim() && out.length < maxN) out.push(str(x, maxLen)); });
    return out;
  }
  function isDate(d) { return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function intIn(v, lo, hi) { var n = Number(v); return Math.floor(n) === n && n >= lo && n <= hi ? n : null; }
  function tms(s) { var t = typeof s === 'string' ? Date.parse(s) : NaN; return isNaN(t) ? null : t; }
  function fmtDate(d) { var m = isDate(d) ? d.split('-') : null; return m ? (+m[1]) + '月' + (+m[2]) + '日' : ''; }
  function fmtAt(s) {
    var t = tms(s);
    if (t == null) return '';
    var d = new Date(t);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }
  function pct(r) { return r == null ? '' : Math.round(r * 100) + '%'; }
  function warnLog(tag, e) { if (root.console && console.error) console.error('Classbook ' + tag, e); }

  /* ---------- 保存 ---------- */
  var memStore = null;   // localStorage が使えないとき
  function lsGet(k) {
    try { if (root.localStorage) return root.localStorage.getItem(k); } catch (e) { /* なし */ }
    return memStore && own(memStore, k) ? memStore[k] : null;
  }
  function lsSet(k, v) {
    try { if (root.localStorage) { root.localStorage.setItem(k, v); return true; } } catch (e) { return false; }
    memStore = memStore || {};
    memStore[k] = v;
    return true;
  }
  function emptyDb() { return { v: 1, students: {}, noProfile: [], classes: {}, formsUrl: '' }; }
  // 1人分の形をそろえる（保存・ファイルの読みこみで共通）。キーと組・番号が合わなければ null
  function cleanStudent(k, st) {
    var p = isObj(st) ? cleanProfile(st.profile) : null;
    if (!p || k !== p.cls + '-' + p.no) return null;
    return {
      profile: p,
      profileAt: typeof st.profileAt === 'string' && tms(st.profileAt) != null ? st.profileAt : '',
      summary: isObj(st.summary) ? st.summary : null,
      reflections: (Array.isArray(st.reflections) ? st.reflections : []).map(cleanRefl).filter(Boolean)
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }),
      override: cleanOverride(st.override),
      overrideMeta: cleanOverrideMeta(st.overrideMeta),
      comment: cleanComment(st.comment),
      updated: typeof st.updated === 'string' ? st.updated : ''
    };
  }
  function cleanClasses(src, into) {
    if (Array.isArray(src)) {
      src.forEach(function (x) { var n = isObj(x) ? intIn(x.cls, 1, MAXCLS) : null; if (n) into[n] = { size: intIn(x.size, 1, MAXNO) || 0 }; });
    } else if (isObj(src)) {
      Object.keys(src).forEach(function (c) {
        var n = intIn(c, 1, MAXCLS), x = src[c];
        if (!n || !isObj(x)) return;
        into[n] = { size: intIn(x.size, 1, MAXNO) || 0 };
      });
    }
    return into;
  }
  function load() {
    var d = null;
    try { d = JSON.parse(lsGet(KEY) || 'null'); } catch (e) { d = null; }
    var db = emptyDb();
    if (!isObj(d)) return db;
    if (isObj(d.students)) {
      Object.keys(d.students).forEach(function (k) {
        var st = cleanStudent(k, d.students[k]);
        if (st) db.students[k] = st;
      });
    }
    if (Array.isArray(d.noProfile)) db.noProfile = d.noProfile.map(cleanRefl).filter(Boolean);
    cleanClasses(d.classes, db.classes);
    if (typeof d.formsUrl === 'string' && validUrl(d.formsUrl)) db.formsUrl = d.formsUrl;
    return db;
  }
  // 保存。いっぱいなら、古いふりかえりの手書きから落としてもう一度。落ちない。
  function save(db) {
    var json;
    try { json = JSON.stringify(db); } catch (e) { return { ok: false, dropped: 0 }; }
    if (lsSet(KEY, json)) return { ok: true, dropped: 0 };
    var refs = [];
    Object.keys(db.students).forEach(function (k) { db.students[k].reflections.forEach(function (r) { refs.push(r); }); });
    db.noProfile.forEach(function (r) { refs.push(r); });
    refs = refs.filter(hasInk).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var dropped = 0;
    while (refs.length) {
      var n = Math.max(1, Math.ceil(refs.length / 8));
      refs.splice(0, n).forEach(function (r) { dropInks(r); dropped++; });
      if (lsSet(KEY, JSON.stringify(db))) return { ok: true, dropped: dropped };
    }
    return { ok: false, dropped: dropped };
  }
  function hasInk(r) { return !!(r.name || r.meate.ink || r.w.ink || r.t.ink); }
  function dropInks(r) { r.name = null; r.meate.ink = null; r.w.ink = null; r.t.ink = null; r.inkDropped = true; }

  /* ---------- データの形をそろえる ---------- */
  function cleanProfile(p) {
    if (!isObj(p)) return null;
    var cls = intIn(p.cls, 1, MAXCLS), no = intIn(p.no, 1, MAXNO);
    if (!cls || !no) return null;
    return { cls: cls, no: no, name: str(p.name, 30).trim() };
  }
  function cleanOverride(o) {
    var out = { know: null, think: null, attitude: null };
    if (isObj(o)) AXES.forEach(function (a) { if (GRADES.indexOf(o[a.id]) >= 0) out[a.id] = o[a.id]; });
    return out;
  }
  // 直した日時と先生の名前 {at:ISO, by:''}。前のデータ（日時なし）は null
  function cleanMeta(m) {
    if (!isObj(m) || tms(m.at) == null) return null;
    return { at: str(m.at, 40), by: str(m.by, 20).trim() };
  }
  function cleanOverrideMeta(o) {
    var out = { know: null, think: null, attitude: null };
    if (isObj(o)) AXES.forEach(function (a) { out[a.id] = cleanMeta(o[a.id]); });
    return out;
  }
  function cleanComment(c) {
    c = isObj(c) ? c : {};
    var o = { short: strMl(c.short, 600), long: strMl(c.long, 1000), variant: intIn(c.variant, 0, 9999) || 0, len: c.len === 'short' ? 'short' : 'long' };
    o.edited = !!(o.short || o.long);
    var m = cleanMeta(c);
    o.at = m ? m.at : '';
    o.by = m ? m.by : '';
    return o;
  }
  // 手書き → 縮小用の座標だけ {w, h, s:[[x,y,x,y,…]]}
  function packInk(ink) {
    if (!isObj(ink)) return null;
    if (Array.isArray(ink.s)) {          // もう縮めてある
      var s0 = ink.s.filter(function (a) { return Array.isArray(a) && a.length >= 2 && a.every(function (v) { return typeof v === 'number' && isFinite(v); }); });
      var w0 = Number(ink.w), h0 = Number(ink.h);
      return s0.length && w0 > 0 && h0 > 0 && w0 <= 5000 && h0 <= 5000 ? { w: w0, h: h0, s: s0 } : null;
    }
    if (!Array.isArray(ink.strokes)) return null;
    var w = Number(ink.w) || 800, h = Number(ink.h) || 300;
    if (!(w > 0 && h > 0 && w <= 5000 && h <= 5000)) return null;
    var sc = Math.min(1, INK_MAX / Math.max(w, h));
    var out = [], total = 0;
    ink.strokes.forEach(function (st) {
      if (!Array.isArray(st) || total >= INK_POINTS) return;
      var a = [], px = null, py = null;
      st.forEach(function (p) {
        if (!p || total >= INK_POINTS) return;
        var x = Number(p.x), y = Number(p.y);
        if (!isFinite(x) || !isFinite(y)) return;
        x = Math.round(x * sc); y = Math.round(y * sc);
        if (px !== null && Math.abs(x - px) + Math.abs(y - py) < 2) return;
        a.push(x, y); px = x; py = y; total++;
      });
      if (a.length) out.push(a);
    });
    return out.length ? { w: Math.max(1, Math.round(w * sc)), h: Math.max(1, Math.round(h * sc)), s: out } : null;
  }
  function unpackInk(p) {
    if (!p || !Array.isArray(p.s)) return null;
    return {
      w: p.w, h: p.h,
      strokes: p.s.map(function (a) { var pts = []; for (var i = 0; i + 1 < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] }); return pts; })
    };
  }
  function cleanRefl(r) {
    if (!isObj(r) || !isDate(r.date)) return null;
    var m = isObj(r.meate) ? r.meate : {}, y = isObj(r.y) ? r.y : {}, w = isObj(r.w) ? r.w : {}, t = isObj(r.t) ? r.t : {};
    var o = {
      date: r.date,
      saved: typeof r.saved === 'string' && tms(r.saved) != null ? r.saved : '',
      aid: typeof r.aid === 'string' ? str(r.aid, 32) : '',
      name: packInk(r.name),
      meate: { choices: strList(m.choices, 120, 10), ink: packInk(m.ink) },
      y: { auto: strList(y.auto, 120, 24), extra: strList(y.extra, 60, 12) },
      w: { eval: EVAL_MARK[w.eval] ? w.eval : null, choices: strList(w.choices, 120, 10), ink: packInk(w.ink) },
      t: { choices: strList(t.choices, 120, 10), ink: packInk(t.ink) }
    };
    if (r.inkDropped) o.inkDropped = true;
    return o;
  }
  function reflForAssess(r) {
    return {
      v: 1, date: r.date, saved: r.saved || undefined, aid: r.aid || undefined, name: unpackInk(r.name),
      meate: { choices: r.meate.choices.slice(), ink: unpackInk(r.meate.ink) },
      y: { auto: r.y.auto.slice(), extra: r.y.extra.slice() },
      w: { eval: r.w.eval, choices: r.w.choices.slice(), ink: unpackInk(r.w.ink) },
      t: { choices: r.t.choices.slice(), ink: unpackInk(r.t.ink) }
    };
  }
  function studentObj(st) {
    return { profile: clone(st.profile), summary: st.summary ? clone(st.summary) : null, reflections: st.reflections.map(reflForAssess) };
  }
  function inkSig(p) {
    if (!p) return '';
    var n = 0, s = 0;
    p.s.forEach(function (a) { n += a.length; a.forEach(function (v) { s = (s * 31 + v) % 1000003; }); });
    return n + '.' + s;
  }
  function noProfileKey(r) { return (r.aid || ('n' + inkSig(r.name))) + '|' + r.date; }
  // a が b より新しいか（saved がなければ、あとから来たほうを新しいとする）
  function reflNewer(a, b) {
    var ta = tms(a.saved), tb = tms(b.saved);
    if (ta != null && tb != null) return ta >= tb;
    return true;
  }
  function atNewer(a, b) {   // summary.at が新しいか
    var ta = tms(a), tb = tms(b);
    if (tb == null) return true;
    if (ta == null) return false;
    return ta > tb;
  }

  /* ---------- 取りこみ（データの合流） ---------- */
  // items: [{profile, summary, reflection}]
  function ingest(db, items) {
    var status = {}, res = { students: 0, added: 0, updated: 0, same: 0, bad: 0, noProfile: 0, noProfileNew: 0 };
    var npIdx = {};
    db.noProfile.forEach(function (r, i) { npIdx[noProfileKey(r)] = i; });
    var now = new Date().toISOString();
    items.forEach(function (it) {
      var p = cleanProfile(it.profile);
      var refl = it.reflection ? cleanRefl(it.reflection) : null;
      if (!p) {
        if (!refl) { res.bad++; return; }
        res.noProfile++;
        var nk = noProfileKey(refl);
        if (own(npIdx, nk)) {
          var cur = db.noProfile[npIdx[nk]];
          if (JSON.stringify(cur) !== JSON.stringify(refl) && reflNewer(refl, cur)) db.noProfile[npIdx[nk]] = refl;
        } else { npIdx[nk] = db.noProfile.length; db.noProfile.push(refl); res.noProfileNew++; }
        return;
      }
      var k = p.cls + '-' + p.no, st = db.students[k], isNew = !st, changed = false;
      if (!st) {
        st = db.students[k] = { profile: p, profileAt: '', summary: null, reflections: [], override: cleanOverride(null), overrideMeta: cleanOverrideMeta(null), comment: cleanComment(null), updated: now };
      }
      var sum = isObj(it.summary) ? it.summary : null;
      var itAt = (sum && typeof sum.at === 'string' && sum.at) || (refl && refl.saved) || '';
      if (isNew || !st.profileAt || !atNewer(st.profileAt, itAt)) {
        if (JSON.stringify(st.profile) !== JSON.stringify(p)) { st.profile = p; changed = true; }
        if (itAt && (!st.profileAt || atNewer(itAt, st.profileAt))) st.profileAt = itAt;
      }
      if (sum && (!st.summary || atNewer(sum.at, st.summary.at))) {
        var c = clone(sum);
        if (JSON.stringify(c) !== JSON.stringify(st.summary)) { st.summary = c; changed = true; }
      }
      if (refl) {
        refl.name = null;   // 名前はキーボードの入力があるので、手書きの名前は持たない
        var idx = -1;
        st.reflections.forEach(function (r, i) { if (r.date === refl.date) idx = i; });
        if (idx < 0) { st.reflections.push(refl); changed = true; }
        else if (JSON.stringify(st.reflections[idx]) !== JSON.stringify(refl) && reflNewer(refl, st.reflections[idx])) { st.reflections[idx] = refl; changed = true; }
        st.reflections.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      }
      if (changed) st.updated = now;
      var prev = status[k];
      status[k] = isNew || prev === 'added' ? 'added' : (changed || prev === 'updated' ? 'updated' : 'same');
    });
    Object.keys(status).forEach(function (k) { res[status[k]]++; res.students++; });
    res.keys = Object.keys(status);
    return res;
  }

  function shareApi() { return S.Share || null; }
  // 「#/r/」「#/k/」のあとが読めなかった（こわれた）コードの数
  function countBroken(text, toks) {
    var re = /(?:#|%23)\/[rk]\//gi, m, seen = {}, n = 0;
    while ((m = re.exec(text))) {
      var i = m.index + m[0].length, s = '';
      while (i < text.length && s.length < 24) {
        var c = text.charAt(i);
        if (/[A-Za-z0-9_-]/.test(c)) s += c;
        else if (!/[\s\u200b-\u200d\ufeff　]/.test(c)) break;
        i++;
      }
      if (s.length < 8 || seen[s]) continue;
      seen[s] = 1;
      if (!toks.some(function (t) { return t.slice(0, s.length) === s; })) n++;
    }
    return n;
  }
  function resultMessage(r) {
    var parts = [];
    if (r.students) {
      var d = ['新しく' + r.added + '人', '更新' + r.updated + '人'];
      if (r.same) d.push('変わらず' + r.same + '人');
      parts.push(r.students + '人分を取りこみました（' + d.join('、') + '）。');
    }
    if (r.noProfile) parts.push('組・番号のないふりかえり' + r.noProfile + 'こ（「組・番号なし」に入れました）。');
    if (r.bad) parts.push('開けなかったコード' + r.bad + 'こ');
    if (!parts.length) parts.push(r.found ? '取りこめるコードがありませんでした（ふりかえり・学習のきろく以外のコードでした）。' : 'コードが見つかりませんでした。');
    if (r.saved === false) parts.push('この端末がいっぱいで、保存できませんでした。');
    else if (r.dropped) parts.push('（端末の容量のため、古いふりかえりの手書き' + r.dropped + '件を省きました）');
    return parts.join('');
  }
  function importText(text) {
    var sh = shareApi();
    var res0 = { students: 0, added: 0, updated: 0, same: 0, bad: 0, noProfile: 0, found: 0 };
    text = typeof text === 'string' ? text : '';
    if (looksLikeBook(text)) return Promise.resolve(importBook(text, { mode: 'merge' }));   // 保存したファイルの中身をはりつけたとき
    if (!sh || typeof sh.extractTokens !== 'function') {
      res0.message = 'コードを読む機能（share.js）がありません。';
      return Promise.resolve(res0);
    }
    var toks = [];
    try { toks = sh.extractTokens(text) || []; } catch (e) { toks = []; }
    var broken = countBroken(text, toks);
    var jobs = toks.map(function (t) {
      var kind = null;
      try { kind = typeof sh.kindOf === 'function' ? sh.kindOf(t) : null; } catch (e) { kind = null; }
      if (kind === 'reflection') {
        if (typeof sh.decodeReflection !== 'function') return Promise.resolve({ bad: true });
        return Promise.resolve().then(function () { return sh.decodeReflection(t); }).then(function (r) {
          if (!isObj(r)) return { bad: true };
          return { item: { profile: r.profile, summary: r.summary, reflection: r } };
        }, function () { return { bad: true }; });
      }
      if (kind === 'record') {
        if (typeof sh.decodeRecord !== 'function') return Promise.resolve({ bad: true });
        return Promise.resolve().then(function () { return sh.decodeRecord(t); }).then(function (x) {
          if (!isObj(x) || !cleanProfile(x.profile)) return { bad: true };
          return { item: { profile: x.profile, summary: x.summary } };
        }, function () { return { bad: true }; });
      }
      return Promise.resolve({ skip: true });
    });
    return Promise.all(jobs).then(function (rs) {
      var items = [], bad = broken;
      rs.forEach(function (x) { if (x.item) items.push(x.item); else if (x.bad) bad++; });
      var res = res0;
      res.found = toks.length;
      if (items.length) {
        var db = load();
        res = ingest(db, items);
        res.found = toks.length;
        var sv = save(db);
        res.saved = sv.ok;
        res.dropped = sv.dropped;
      }
      res.bad += bad;
      res.message = resultMessage(res);
      return res;
    });
  }

  /* ---------- ファイル（xlsx・csv・txt・zip） ---------- */
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function isZip(b) { return b && b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6); }
  function decodeName(bytes, utf8) {
    try { return new TextDecoder(utf8 ? 'utf-8' : 'utf-8', { fatal: true }).decode(bytes); }
    catch (e) { try { return new TextDecoder('shift_jis').decode(bytes); } catch (e2) { return new TextDecoder('utf-8').decode(bytes); } }
  }
  // ZIP の目次を読む。[{name, method, csize, usize, offset}]
  function zipEntries(b) {
    var out = [], eocd = -1;
    for (var i = b.length - 22; i >= 0 && i >= b.length - 22 - 65557; i--) {
      if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { eocd = i; break; }
    }
    if (eocd >= 0) {
      var count = u16(b, eocd + 10), p = u32(b, eocd + 16);
      for (var n = 0; n < count && p + 46 <= b.length; n++) {
        if (u32(b, p) !== 0x02014b50) break;
        var flags = u16(b, p + 8), method = u16(b, p + 10), csize = u32(b, p + 20), usize = u32(b, p + 24);
        var nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
        out.push({ name: decodeName(b.subarray(p + 46, p + 46 + nl), flags & 0x800), method: method, csize: csize, usize: usize, offset: off });
        p += 46 + nl + xl + cl;
      }
      if (out.length) return out;
    }
    // 目次がないとき：ローカルファイルヘッダを前から読む
    var q = 0;
    while (q + 30 <= b.length && u32(b, q) === 0x04034b50) {
      var fl = u16(b, q + 6), me = u16(b, q + 8), cs = u32(b, q + 18), us = u32(b, q + 22), nl2 = u16(b, q + 26), xl2 = u16(b, q + 28);
      if (fl & 8) break;   // サイズがあとに書いてある形は、目次なしでは読めない
      out.push({ name: decodeName(b.subarray(q + 30, q + 30 + nl2), fl & 0x800), method: me, csize: cs, usize: us, offset: q });
      q += 30 + nl2 + xl2 + cs;
    }
    return out;
  }
  function inflateRaw(bytes, limit) {
    if (typeof DecompressionStream === 'function' && typeof Response === 'function' && typeof Blob === 'function') {
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer().then(function (ab) {
        if (ab.byteLength > limit) throw new Error('too large');
        return new Uint8Array(ab);
      });
    }
    try {
      var zlib = typeof require === 'function' ? require('zlib') : null;
      if (zlib) return Promise.resolve(new Uint8Array(zlib.inflateRawSync(bytes, { maxOutputLength: limit })));
    } catch (e) { return Promise.reject(e); }
    return Promise.reject(new Error('展開できません'));
  }
  function zipData(b, e, budget) {
    if (e.offset + 30 > b.length || u32(b, e.offset) !== 0x04034b50) return Promise.reject(new Error('bad zip'));
    var start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
    var data = b.subarray(start, start + e.csize);
    if (data.length < e.csize) return Promise.reject(new Error('bad zip'));
    if (e.usize > budget.left) return Promise.reject(new Error('too large'));
    if (e.method === 0) { budget.left -= data.length; return Promise.resolve(data); }
    if (e.method === 8) return inflateRaw(data, Math.min(budget.left, MAX_FILE)).then(function (u) { budget.left -= u.length; return u; });
    return Promise.reject(new Error('unsupported method ' + e.method));
  }
  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unescapeXml(s) {
    return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, function (m, g) {
      if (g.charAt(0) === '#') {
        var cp = g.charAt(1) === 'x' || g.charAt(1) === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        try { return String.fromCodePoint(cp); } catch (e) { return ''; }
      }
      return ENT[g];
    });
  }
  // XML の文字だけを取り出す（セル・行・段落の区切りは改行）
  function xmlText(xml) {
    var s = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')              // ふりがな
      .replace(/<\/(si|c|row|p|is)>|<br\s*\/?>/g, '\n')
      .replace(/<[^>]*>/g, '');
    s = unescapeXml(s);
    return s.replace(/_x([0-9A-Fa-f]{4})_/g, function (m, hx) { return String.fromCharCode(parseInt(hx, 16)); });
  }
  function decodeText(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { /* 次をためす */ }
    try { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); } catch (e) { /* 次をためす */ }
    return new TextDecoder('utf-8').decode(bytes);
  }
  function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function baseName(name) { return String(name || '').split('/').pop(); }
  // 1つのファイルから文字を集める
  function collect(name, bytes, out, depth, info, budget) {
    var ext = extOf(name);
    if (isZip(bytes)) {
      if (depth > 3) { info.errors.push(baseName(name)); return Promise.resolve(); }
      var entries = zipEntries(bytes);
      if (!entries.length) { info.errors.push(baseName(name)); return Promise.resolve(); }
      var isXlsx = entries.some(function (e) { return /^xl\//.test(e.name); });
      if (isXlsx) {
        var want = entries.filter(function (e) { return e.name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(e.name); });
        return want.reduce(function (pr, e) {
          return pr.then(function () {
            return zipData(bytes, e, budget).then(function (d) { out.push(xmlText(decodeText(d))); });
          });
        }, Promise.resolve()).then(function () { info.used++; }, function (e) { warnLog('xlsx', e); info.errors.push(baseName(name)); });
      }
      var inner = entries.filter(function (e) {
        return !/\/$/.test(e.name) && !/(^|\/)(__MACOSX|\.)/.test(e.name) && ['xlsx', 'csv', 'txt', 'zip', 'tsv'].indexOf(extOf(e.name)) >= 0;
      });
      return inner.reduce(function (pr, e) {
        return pr.then(function () {
          return zipData(bytes, e, budget).then(function (d) { return collect(e.name, d, out, depth + 1, info, budget); }, function (er) { warnLog('zip', er); info.errors.push(baseName(e.name)); });
        });
      }, Promise.resolve());
    }
    if (ext === 'xlsx' || ext === 'zip') { info.errors.push(baseName(name)); return Promise.resolve(); }
    if (ext === 'xls') { info.errors.push(baseName(name) + '（古い Excel の形。xlsx で保存してください）'); return Promise.resolve(); }
    out.push(decodeText(bytes));
    info.used++;
    return Promise.resolve();
  }
  function readBytes(f) {
    if (f && f.data instanceof Uint8Array) return Promise.resolve(f.data);
    if (f && typeof f.arrayBuffer === 'function') return f.arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    if (typeof FileReader === 'function' && f) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(new Uint8Array(r.result)); };
        r.onerror = function () { rej(r.error); };
        r.readAsArrayBuffer(f);
      });
    }
    return Promise.reject(new Error('読めません'));
  }
  function importFiles(files) {
    var list = [];
    try { list = Array.prototype.slice.call(files || []); } catch (e) { list = []; }
    var texts = [], books = [], info = { errors: [], used: 0 }, budget = { left: MAX_UNZIP };
    return list.reduce(function (pr, f) {
      return pr.then(function () {
        if (f && f.size > MAX_FILE) { info.errors.push(baseName(f.name) + '（大きすぎます）'); return; }
        return readBytes(f).then(function (b) {
          // 保存したクラスのきろく（.json）は自動で見分ける
          if (extOf(f && f.name) === 'json' || (b.length && (b[0] === 0x7b || b[0] === 0xef))) {
            var t = decodeText(b);
            if (looksLikeBook(t) || extOf(f && f.name) === 'json') {
              var bk = parseBook(t);
              if (bk) books.push(bk); else info.errors.push(baseName(f && f.name) + '（' + BAD_FILE.replace(/。$/, '') + '）');
              return;
            }
          }
          return collect(f && f.name, b, texts, 0, info, budget);
        }).catch(function (e) { warnLog('file', e); info.errors.push(baseName(f && f.name)); });
      });
    }, Promise.resolve()).then(function () {
      var bres = books.map(function (bk) { return importBook(bk, { mode: 'merge' }); });
      if (books.length && !texts.length) {
        var r0 = bres[0];
        r0.message = bres.map(function (x) { return x.message; }).join(' ');
        r0.keys = [].concat.apply([], bres.map(function (x) { return x.keys || []; }));
        return r0;
      }
      return importText(texts.join('\n')).then(function (res) {
        if (bres.length) {
          res.message = bres.map(function (x) { return x.message; }).join(' ') + ' ' + res.message;
          res.students += bres.reduce(function (n, x) { return n + x.students; }, 0);
          res.keys = (res.keys || []).concat([].concat.apply([], bres.map(function (x) { return x.keys || []; })));
        }
        return res;
      });
    }).then(function (res) {
      res.files = list.length;
      res.fileErrors = info.errors;
      if (info.errors.length) res.message += ' 開けなかったファイル：' + info.errors.join('、');
      var badBook = BAD_FILE.replace(/。$/, '');
      if (!texts.length && !books.length && info.errors.length && info.errors.every(function (e) { return e.indexOf(badBook) >= 0; })) { res.message = BAD_FILE; res.bad = true; }
      return res;
    });
  }

  /* ---------- 学習データのまとめ（LearnSummary）を読む ---------- */
  // Summary の項目名は担当Q。いくつかの名前を順にためして、なければ空にする。
  function pick(o, keys) {
    if (!isObj(o)) return null;
    for (var i = 0; i < keys.length; i++) {
      var v = o[keys[i]];
      if (typeof v === 'number' && isFinite(v)) return v;
    }
    return null;
  }
  function rate(v) { return v == null ? null : v > 1 ? Math.min(1, v / 100) : Math.max(0, v); }
  function lessonInfo(l) {
    if (l == null || l === false) return { tried: false };
    if (l === true) return { tried: true };
    if (!isObj(l)) return { tried: false };
    var n = pick(l, ['tried', 'n', 'count', 'answered']), ok = pick(l, ['correct', 'ok', 'c', 'right']);
    var first = rate(pick(l, ['first', 'firstAcc', 'firstRate', 'firstOk']));
    var acc = rate(pick(l, ['acc', 'rate']));
    if (acc == null && n && ok != null) acc = ok / n;
    if (first == null) first = acc;
    var sec = pick(l, ['sec', 'avgSec', 'time', 'avg', 'secAvg']);
    var tried = l.tried === true || l.done === true || (typeof l.tried === 'number' && l.tried > 0) || (n || 0) > 0;
    return { tried: tried, n: n, ok: ok, first: first, acc: acc, sec: sec };
  }
  function metrics(st) {
    var s = st && st.summary;
    var m = { lessons: 0, days: null, minutes: null, acc: null, lastRefl: null, list: [] };
    if (st && st.reflections.length) m.lastRefl = st.reflections[st.reflections.length - 1].date;
    if (!isObj(s)) return m;
    var ls = Array.isArray(s.lessons) ? s.lessons : [];
    var sumN = 0, sumOk = 0, sumSec = 0;
    for (var i = 0; i < 10; i++) {
      var li = lessonInfo(ls[i]);
      m.list.push(li);
      if (li.tried) m.lessons++;
      if (li.n && li.ok != null) { sumN += li.n; sumOk += li.ok; }
      if (li.n && li.sec) sumSec += li.n * li.sec;
    }
    m.days = pick(s, ['days', 'studyDays', 'activeDays', 'dayCount']);
    if (m.days == null) m.days = pick(s.activity, ['days']);
    m.minutes = pick(s, ['min', 'minutes', 'totalMin', 'totalMinutes']);
    if (m.minutes == null) { var ts = pick(s, ['totalSec', 'seconds']); if (ts != null) m.minutes = ts / 60; }
    if (m.minutes == null && sumSec) m.minutes = sumSec / 60;
    m.acc = rate(pick(s, ['acc', 'accuracy', 'rate']));
    if (m.acc == null) {
      ['review', 'more', 'matome', 'osusume'].forEach(function (k) {
        var x = s[k], n = pick(x, ['q', 'total', 'answered']), ok = pick(x, ['c', 'correct', 'ok']);
        if (n && ok != null) { sumN += n; sumOk += ok; }
      });
      if (sumN) m.acc = sumOk / sumN;
    }
    return m;
  }
  function fmtMinutes(min) {
    if (min == null) return '';
    min = Math.round(min);
    return min >= 60 ? Math.floor(min / 60) + '時間' + (min % 60 ? min % 60 + '分' : '') : min + '分';
  }

  /* ---------- 評価・支援・所見（Shosu.Assess） ---------- */
  function assessApi() { return S.Assess || null; }
  function evaluate(st) {
    var a = assessApi();
    if (!a || typeof a.evaluate !== 'function' || !st) return null;
    try { var r = a.evaluate(studentObj(st)); return isObj(r) ? r : null; } catch (e) { warnLog('evaluate', e); return null; }
  }
  function support(st) {
    var a = assessApi();
    if (!a || typeof a.support !== 'function' || !st) return [];
    try {
      var r = a.support(studentObj(st));
      return Array.isArray(r) ? r.filter(function (x) { return x && typeof x.text === 'string'; }) : [];
    } catch (e) { warnLog('support', e); return []; }
  }
  function draftComment(st, len, others) {
    var a = assessApi();
    if (!a || typeof a.comment !== 'function' || !st) return '';
    try {
      var t = a.comment(studentObj(st), { length: len, variant: st.comment.variant || 0, cls: others || [] });
      return typeof t === 'string' ? t : '';
    } catch (e) { warnLog('comment', e); return ''; }
  }
  function axisInfo(ev, st, id) {
    var e = ev && isObj(ev[id]) ? ev[id] : null;
    var draft = e && GRADES.indexOf(e.grade) >= 0 ? e.grade : null;
    var over = st && st.override ? st.override[id] : null;
    return { draft: draft, teacher: over, final: over || draft, reasons: e && Array.isArray(e.reasons) ? e.reasons : [], enough: !(e && e.enough === false), score: e ? e.score : null };
  }
  // 組の所見を出席番号順に作る（同じ文がならばないよう、前の子の所見を cls で渡す）
  function classComments(db, cls, len) {
    var out = {}, prev = [];
    studentsOf(db, cls).forEach(function (st) {
      var k = st.profile.cls + '-' + st.profile.no;
      var draft = draftComment(st, len, prev.slice());
      var edited = st.comment[len] || '';
      var text = edited || draft;
      out[k] = { draft: draft, text: text, edited: !!edited };
      if (text) prev.push(text);
    });
    return out;
  }

  /* ---------- 組 ---------- */
  function studentsOf(db, cls) {
    cls = Number(cls);
    return Object.keys(db.students).map(function (k) { return db.students[k]; })
      .filter(function (st) { return st.profile.cls === cls; })
      .sort(function (a, b) { return a.profile.no - b.profile.no; });
  }
  function classList(db) {
    var set = {};
    Object.keys(db.students).forEach(function (k) { set[db.students[k].profile.cls] = 1; });
    Object.keys(db.classes).forEach(function (c) { set[c] = 1; });
    return Object.keys(set).map(Number).filter(function (c) { return c >= 1 && c <= MAXCLS; }).sort(function (a, b) { return a - b; });
  }
  function rosterSize(db, cls) {
    var mx = 0;
    studentsOf(db, cls).forEach(function (st) { if (st.profile.no > mx) mx = st.profile.no; });
    var size = db.classes[cls] && db.classes[cls].size || 0;
    return Math.max(mx, size);
  }

  /* ---------- CSV ---------- */
  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+@\t\r]/.test(s) || /^-[^0-9.]/.test(s)) s = "'" + s;   // Excel の式として動かないように
    if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var CSV_HEAD = ['組', '番号', '名前', '進んだ時', '学習した日数', '正答率', '知（案）', '知（先生）', '思（案）', '思（先生）', '態（案）', '態（先生）', '支援', '所見'];
  function buildCsv(cls) {
    var db = load();
    cls = Number(cls);
    var rows = [CSV_HEAD];
    var by = {};
    studentsOf(db, cls).forEach(function (st) { by[st.profile.no] = st; });
    var longs = classComments(db, cls, 'long');
    var n = rosterSize(db, cls);
    for (var no = 1; no <= n; no++) {
      var st = by[no];
      if (!st) { rows.push([cls, no, '', 'まだ', '', '', '', '', '', '', '', '', '', '']); continue; }
      var m = metrics(st), ev = evaluate(st), sp = support(st);
      var row = [cls, no, st.profile.name, st.summary ? m.lessons : '', m.days == null ? '' : m.days, m.acc == null ? '' : pct(m.acc)];
      AXES.forEach(function (a) { var x = axisInfo(ev, st, a.id); row.push(x.draft || '', x.teacher || ''); });
      row.push(sp.map(function (x) { return x.text; }).join('\n'));
      var lc = longs[cls + '-' + no];
      row.push(st.comment.long || st.comment.short || (lc ? lc.draft : ''));
      rows.push(row);
    }
    return '\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function csvName(cls) { return '小数コスモス_4年' + cls + '組.csv'; }
  function download(text, name, type) {
    if (!hasDOM) return false;
    try {
      var blob = new Blob([text], { type: type || 'text/csv;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      return true;
    } catch (e) { warnLog('download', e); return false; }
  }
  function exportCsv(cls, opts) {
    var csv = buildCsv(cls);
    if (!(opts && opts.download === false)) download(csv, csvName(Number(cls)));
    return csv;
  }

  /* ---------- 先生の名前（任意） ---------- */
  var NAME_KEY = 'shosu.teacherName';
  function teacherName() { var v = lsGet(NAME_KEY); return typeof v === 'string' ? str(v, 20).trim() : ''; }
  function setTeacherName(n) { return lsSet(NAME_KEY, str(String(n || ''), 20).trim()); }
  function byLabel(n) { n = String(n || '').trim(); return !n ? '' : /先生$/.test(n) ? n : n + '先生'; }
  function editMeta() { return { at: new Date().toISOString(), by: teacherName() }; }
  // 「11月24日に直しました（山田先生）」
  function editedLine(m) {
    var t = m ? tms(m.at) : null;
    if (t == null) return '';
    var d = new Date(t), by = byLabel(m.by);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日に直しました' + (by ? '（' + by + '）' : '');
  }

  /* ---------- ファイルに保存・ファイルを読みこむ（先生どうしの受けわたし） ----------
   * { app:'shosu-cosmos', kind:'classbook', v:1, exportedAt, teacher, classes:[{cls,size}],
   *   students:{'<cls>-<no>': 1人分}, noProfile:[…]（全部の組のときだけ）, assessSettings }
   */
  var BOOK_APP = 'shosu-cosmos', BOOK_KIND = 'classbook';
  var BAD_FILE = 'このファイルは読みこめませんでした。';
  function localDate(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function bookName(cls) { return '小数コスモス_クラスのきろく_4年' + (cls === 'all' || cls == null ? '全部の組' : cls + '組') + '_' + localDate() + '.json'; }
  function assessSettingsNow() {
    var A = assessApi();
    try { return A && typeof A.settings === 'function' ? clone(A.settings()) : null; } catch (e) { return null; }
  }
  // which: 'all' か 組の番号
  function buildBook(which) {
    var db = load(), all = which === 'all' || which == null;
    var want = all ? classList(db) : [Number(which)];
    var out = { app: BOOK_APP, kind: BOOK_KIND, v: 1, exportedAt: new Date().toISOString(), teacher: teacherName(),
      classes: [], students: {}, noProfile: [], assessSettings: assessSettingsNow() };
    want.forEach(function (c) {
      out.classes.push({ cls: c, size: db.classes[c] && db.classes[c].size || 0 });
      studentsOf(db, c).forEach(function (st) { out.students[st.profile.cls + '-' + st.profile.no] = clone(st); });
    });
    if (all) out.noProfile = clone(db.noProfile);
    return out;
  }
  function exportBook(which, opts) {
    var book = buildBook(which), text = JSON.stringify(book), name = bookName(which === 'all' || which == null ? 'all' : Number(which));
    if (!(opts && opts.download === false)) download(text, name, 'application/json;charset=utf-8');
    return { name: name, text: text, book: book };
  }
  function looksLikeBook(text) { return typeof text === 'string' && /^\s*\{[\s\S]*"app"\s*:\s*"shosu-cosmos"/.test(text.slice(0, 4000)); }
  // ファイルの文字 → 形をそろえた中身。読めなければ null
  function parseBook(text) {
    var d;
    try { d = typeof text === 'string' ? JSON.parse(text.replace(/^﻿/, '')) : text; } catch (e) { return null; }
    if (!isObj(d) || d.app !== BOOK_APP || d.kind !== BOOK_KIND || typeof d.v !== 'number' || d.v < 1 || d.v >= 2 || !isObj(d.students)) return null;
    var b = { exportedAt: tms(d.exportedAt) != null ? d.exportedAt : '', teacher: str(d.teacher, 20).trim(), classes: {}, students: {}, noProfile: [], assessSettings: isObj(d.assessSettings) ? d.assessSettings : null };
    cleanClasses(d.classes, b.classes);
    Object.keys(d.students).forEach(function (k) {
      var st = cleanStudent(k, d.students[k]);
      if (st) { b.students[k] = st; if (!b.classes[st.profile.cls]) b.classes[st.profile.cls] = { size: 0 }; }
    });
    if (Array.isArray(d.noProfile)) b.noProfile = d.noProfile.map(cleanRefl).filter(Boolean);
    return b;
  }
  // ファイルに入っている組と人数 [{cls, n, size}]
  function bookClasses(b) {
    return Object.keys(b.classes).map(Number).sort(function (x, y) { return x - y; }).map(function (c) {
      var n = Object.keys(b.students).filter(function (k) { return b.students[k].profile.cls === c; }).length;
      return { cls: c, n: n, size: b.classes[c].size || 0 };
    });
  }
  function metaTime(m) { return m ? tms(m.at) : null; }
  // ファイルの直し（theirs）を使うか。日時が無い側は古い扱い、両方無ければこちら（mine）を残す
  function theirsNewer(tMine, tTheirs) {
    if (tTheirs == null) return false;
    if (tMine == null) return true;
    return tTheirs > tMine;
  }
  function sameJson(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  // 1人分をまとめる。戻り値 {changed, took, kept}
  function mergeStudent(mine, theirs) {
    var r = { changed: false, took: 0, kept: 0 };
    // 名前（新しい学習のまとめを持つほう）
    if (theirs.profileAt && (!mine.profileAt || atNewer(theirs.profileAt, mine.profileAt))) {
      if (!sameJson(mine.profile, theirs.profile)) { mine.profile = clone(theirs.profile); r.changed = true; }
      mine.profileAt = theirs.profileAt;
    }
    // 学習のまとめ：at が新しいほう
    if (theirs.summary && (!mine.summary || atNewer(theirs.summary.at, mine.summary.at)) && !sameJson(mine.summary, theirs.summary)) {
      mine.summary = clone(theirs.summary); r.changed = true;
    }
    // ふりかえり：日付ごと。同じ日は saved が新しいほう（saved が無い側は古い扱い）
    theirs.reflections.forEach(function (tr) {
      var idx = -1;
      mine.reflections.forEach(function (x, i) { if (x.date === tr.date) idx = i; });
      if (idx < 0) { mine.reflections.push(clone(tr)); r.changed = true; return; }
      var cur = mine.reflections[idx];
      if (!sameJson(cur, tr) && theirsNewer(tms(cur.saved), tms(tr.saved))) { mine.reflections[idx] = clone(tr); r.changed = true; }
    });
    mine.reflections.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    // 先生の評価：観点ごとに、直した日時が新しいほう
    AXES.forEach(function (a) {
      var tv = theirs.override[a.id], tm = theirs.overrideMeta[a.id];
      if (tv == null && !tm) return;                      // ファイル側は直していない
      var mv = mine.override[a.id], mm = mine.overrideMeta[a.id];
      var mineEdited = mv != null || !!mm;
      if (mv === tv) {                                    // 同じ評価：日時だけ新しいほうに
        if (theirsNewer(metaTime(mm), metaTime(tm))) mine.overrideMeta[a.id] = clone(tm);
        return;
      }
      if (!mineEdited || theirsNewer(metaTime(mm), metaTime(tm))) {
        mine.override[a.id] = tv; mine.overrideMeta[a.id] = clone(tm); r.took++; r.changed = true;
      } else r.kept++;
    });
    // 直した所見：直した日時が新しいほう（短い・長いをいっしょに）
    var tc = theirs.comment, mc = mine.comment;
    if (tc.edited || tc.at) {
      var tcm = tc.at ? { at: tc.at } : null, mcm = mc.at ? { at: mc.at } : null;
      if (tc.short === mc.short && tc.long === mc.long) {
        if (theirsNewer(metaTime(mcm), metaTime(tcm))) { mc.at = tc.at; mc.by = tc.by; }
      } else if (!(mc.edited || mc.at) || theirsNewer(metaTime(mcm), metaTime(tcm))) {
        mine.comment = clone(tc); r.took++; r.changed = true;
      } else r.kept++;
    }
    return r;
  }
  function bookMessage(r) {
    var parts = [];
    r.perClass.forEach(function (c) {
      var d;
      if (r.mode === 'replace') d = '置きかえました';
      else {
        d = '新しく' + c.added + '人、更新' + c.updated + '人';
        if (c.same) d += '、変わらず' + c.same + '人';
      }
      parts.push(c.cls + '組 ' + c.n + '人（' + d + '）');
    });
    var s = parts.length ? parts.join('、') : '読みこむ組がありませんでした';
    if (r.mode === 'merge' && (r.took || r.kept)) {
      s += '、先生の直し ' + (r.took + r.kept) + '件を取りこみ' + (r.kept ? '（' + r.kept + '件はこちらの方が新しいので残しました）' : '');
    } else if (r.mode === 'replace' && r.edits) s += '、先生の直し ' + r.edits + '件';
    s += '。';
    if (r.noProfileNew) s += '組・番号なしのふりかえり' + r.noProfileNew + 'こ。';
    if (r.settings) s += '基準の設定も読みこみました。';
    if (r.saved === false) s += 'この端末がいっぱいで、保存できませんでした。';
    else if (r.dropped) s += '（端末の容量のため、古いふりかえりの手書き' + r.dropped + '件を省きました）';
    return s;
  }
  function editCount(st) {
    var n = 0;
    AXES.forEach(function (a) { if (st.override[a.id] != null) n++; });
    if (st.comment.edited) n++;
    return n;
  }
  /* ファイルの中身（parseBook の戻り値、または文字）を取りこむ
   *   opts: {mode:'merge'|'replace', classes:[組…]（なければ全部）, settings:false}
   *   戻り値 {ok, mode, students, added, updated, same, took, kept, perClass:[…], settings, saved, dropped, message, keys}
   */
  function importBook(book, opts) {
    opts = opts || {};
    var b = isObj(book) && isObj(book.students) && isObj(book.classes) && !book.app ? book : parseBook(book);
    if (!b) return { ok: false, bad: true, students: 0, message: BAD_FILE };
    var mode = opts.mode === 'replace' ? 'replace' : 'merge';
    var avail = bookClasses(b).map(function (c) { return c.cls; });
    var want = Array.isArray(opts.classes) ? opts.classes.map(Number).filter(function (c) { return avail.indexOf(c) >= 0; }) : avail;
    var db = load(), now = new Date().toISOString();
    var res = { ok: true, mode: mode, students: 0, added: 0, updated: 0, same: 0, took: 0, kept: 0, edits: 0, perClass: [], keys: [], settings: false, noProfileNew: 0 };
    want.forEach(function (c) {
      var pc = { cls: c, n: 0, added: 0, updated: 0, same: 0 };
      var keys = Object.keys(b.students).filter(function (k) { return b.students[k].profile.cls === c; });
      if (mode === 'replace') {
        Object.keys(db.students).forEach(function (k) { if (db.students[k].profile.cls === c) delete db.students[k]; });
        db.classes[c] = { size: b.classes[c].size || 0 };
        if (!db.classes[c].size) delete db.classes[c];
        keys.forEach(function (k) { db.students[k] = clone(b.students[k]); res.edits += editCount(b.students[k]); pc.n++; res.keys.push(k); });
        pc.added = pc.n;
      } else {
        keys.forEach(function (k) {
          var theirs = b.students[k], mine = db.students[k];
          pc.n++; res.keys.push(k);
          if (!mine) {
            db.students[k] = clone(theirs);
            db.students[k].updated = now;
            res.took += editCount(theirs);
            pc.added++;
            return;
          }
          var m = mergeStudent(mine, theirs);
          res.took += m.took; res.kept += m.kept;
          if (m.changed) { mine.updated = now; pc.updated++; } else pc.same++;
        });
        var size = Math.max(db.classes[c] && db.classes[c].size || 0, b.classes[c].size || 0);
        if (size || !db.classes[c]) db.classes[c] = { size: size };
      }
      res.students += pc.n; res.added += pc.added; res.updated += pc.updated; res.same += pc.same;
      res.perClass.push(pc);
    });
    // 組・番号なし（全部の組のファイルだけに入っている）：同じものはまとめる
    if (b.noProfile.length && opts.noProfile !== false) {
      var idx = {};
      db.noProfile.forEach(function (r, i) { idx[noProfileKey(r)] = i; });
      b.noProfile.forEach(function (r) {
        var k = noProfileKey(r);
        if (own(idx, k)) { var cur = db.noProfile[idx[k]]; if (!sameJson(cur, r) && theirsNewer(tms(cur.saved), tms(r.saved))) db.noProfile[idx[k]] = clone(r); }
        else { idx[k] = db.noProfile.length; db.noProfile.push(clone(r)); res.noProfileNew++; }
      });
    }
    var sv = save(db);
    res.saved = sv.ok; res.dropped = sv.dropped;
    if (opts.settings && b.assessSettings) {
      var A = assessApi();
      try { if (A && typeof A.setSettings === 'function') { A.setSettings(clone(b.assessSettings)); res.settings = true; } } catch (e) { warnLog('setSettings', e); }
    }
    res.message = bookMessage(res);
    return res;
  }
  // ファイルを読んで中身を返す（.json）。読めなければ null
  function readBook(file) {
    return readBytes(file).then(function (bytes) { return parseBook(decodeText(bytes)); }, function () { return null; });
  }

  /* ---------- Forms のURL ---------- */
  function validUrl(u) { return typeof u === 'string' && u.length <= 400 && /^https:\/\/[^\s"'<>]+$/i.test(u); }
  function formsUrl() {
    try { var g = S.Planner && S.Planner.goal ? S.Planner.goal() : null; if (g && validUrl(g.formsUrl)) return g.formsUrl; } catch (e) { /* なし */ }
    var own = load().formsUrl || '';
    if (own) return own;
    var pre = typeof window !== 'undefined' && window.SHOSU_PRESET ? window.SHOSU_PRESET.formsUrl : '';
    return validUrl(pre) ? pre : '';
  }
  // 戻り値 'goal'（ゴールに入った）| 'local'（この端末だけ）| 'bad'
  function setFormsUrl(u) {
    u = String(u || '').trim();
    if (u && !validUrl(u)) return 'bad';
    var db = load();
    db.formsUrl = u;
    save(db);
    try {
      var P = S.Planner, g = P && P.goal ? P.goal() : null;
      if (g && P.setGoal) {
        var ng = clone(g);
        if (u) ng.formsUrl = u; else delete ng.formsUrl;
        var r = P.setGoal(ng);
        var back = P.goal();
        if (r && back && (back.formsUrl || '') === u) return 'goal';
      }
    } catch (e) { warnLog('formsUrl', e); }
    return 'local';
  }

  /* ======================================================================
   * 画面
   * ====================================================================== */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function arrows(el) { if (S.Icons && S.Icons.arrows) { try { S.Icons.arrows(el); } catch (e) { /* 文字のまま */ } } return el; }
  function withIcon(el, name, text) {
    if (S.Icons && S.Icons.label && S.Icons.has && S.Icons.has(name)) { try { S.Icons.label(el, text, name); return el; } catch (e) { /* 文字だけ */ } }
    el.textContent = text;
    return el;
  }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return arrows(b);
  }
  function link(label, cls, href) { var a = h('a', cls, label); a.href = href; return arrows(a); }
  function toast(msg) {
    var t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2400);
  }
  function confirmDialog(message, okLabel, onOk, danger) {
    var back = h('div', 'modal-back');
    var box = h('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.appendChild(h('div', 'modal-msg', message));
    var row = h('div', 'modal-row');
    row.appendChild(button('やめる', '', function () { back.remove(); }));
    var ok = button(okLabel || 'OK', danger === false ? 'primary' : 'danger', function () { back.remove(); onOk(); });
    row.appendChild(ok);
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
    setTimeout(function () { try { ok.focus(); } catch (e) { /* なし */ } }, 20);
  }
  function copyText(text, ta) {
    function fallback() {
      if (ta) { ta.focus(); ta.select(); }
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? 'コピーしました' : 'Ctrl＋C でコピーしてください');
    }
    var cb = navigator.clipboard;
    if (cb && cb.writeText) cb.writeText(text).then(function () { toast('コピーしました'); }, fallback);
    else fallback();
  }
  function drawInk(p, opts) {
    var ink = unpackInk(p);
    if (S.Present && typeof S.Present.drawInk === 'function') {
      try { var c0 = S.Present.drawInk(ink, opts); if (c0) return c0; } catch (e) { /* 下で描く */ }
    }
    var w = ink.w || 300, hh = ink.h || 100;
    var sc = Math.min((opts.width || w) / w, opts.height ? opts.height / hh : Infinity);
    var c = document.createElement('canvas');
    c.width = Math.round(w * sc); c.height = Math.round(hh * sc);
    var g = c.getContext('2d');
    if (g) {
      g.strokeStyle = '#232b48'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      ink.strokes.forEach(function (st) {
        g.beginPath();
        st.forEach(function (pt, i) { if (i) g.lineTo(pt.x * sc, pt.y * sc); else g.moveTo(pt.x * sc, pt.y * sc); });
        if (st.length === 1) g.lineTo(st[0].x * sc + 0.1, st[0].y * sc);
        g.stroke();
      });
    }
    return c;
  }
  function inkThumb(p, label, w, hgt) {
    var b = h('button', 'cb-ink');
    b.type = 'button';
    b.setAttribute('aria-label', label + '（おすと大きくなります）');
    b.appendChild(drawInk(p, { width: w || 160, height: hgt || 48, trim: true, lineWidth: 6 }));
    b.addEventListener('click', function (e) { e.stopPropagation(); showBig(p, label); });
    return b;
  }
  function showBig(p, label) {
    var back = h('div', 'modal-back');
    var box = h('div', 'modal cb-big');
    box.setAttribute('role', 'dialog');
    box.appendChild(h('div', 'cb-big-label', label));
    var vw = Math.min(1000, (root.innerWidth || 1000) - 140), vh = Math.min(480, (root.innerHeight || 700) - 240);
    box.appendChild(drawInk(p, { width: vw, height: vh, trim: true, lineWidth: 6 }));
    var row = h('div', 'modal-row');
    row.appendChild(button('とじる', 'primary', function () { back.remove(); }));
    box.appendChild(row);
    back.appendChild(box);
    back.addEventListener('click', function (e) { if (e.target === back) back.remove(); });
    document.body.appendChild(back);
  }
  function gradeEl(info) {
    var g = info.final;
    var sp = h('span', 'cb-grade' + (g ? ' cb-g-' + g : ' cb-g-none') + (info.teacher ? ' cb-g-t' : ''), g || '—');
    var tip = info.teacher ? '先生が変えた評価（案は' + (info.draft || 'なし') + '）' : (g ? 'アプリの案' : '案がありません');
    if (!info.enough) tip += '・材料が少ない';
    sp.title = tip;
    sp.setAttribute('aria-label', tip + ' ' + (g || ''));
    if (!info.enough && g) sp.appendChild(h('sup', 'cb-few', '少'));
    return sp;
  }
  function lessonTitle(i) {
    var ls = Array.isArray(S.Lessons) ? S.Lessons : [];
    var l = ls[i];
    return l && l.title ? l.title : '';
  }
  function skillLabel(id) {
    var R = S.Recommend, sk = null;
    if (R && Array.isArray(R.SKILLS)) R.SKILLS.forEach(function (x) { if (x && x.id === id) sk = x; });
    if (sk && sk.label) return sk.label;
    var A = assessApi(), lab = null;
    if (A && Array.isArray(A.SKILLS)) A.SKILLS.forEach(function (x) { if (Array.isArray(x) && x[0] === id) lab = x[2]; else if (x && x.id === id) lab = x.label; });
    return lab || id;
  }
  function parseHash() {
    var hs = (root.location && root.location.hash || '').replace(/^#\/?/, '').split('/');
    if (hs[0] !== 'classbook') return {};
    return { cls: intIn(hs[1], 1, MAXCLS) || (hs[1] === 'none' ? 'none' : null), no: intIn(hs[2], 1, MAXNO) };
  }

  function stampComment(c) { var m = editMeta(); c.at = m.at; c.by = m.by; }
  // 保存。できなければ知らせる（落ちない）
  function saveOrWarn(d) {
    var r = save(d);
    if (!r.ok && hasDOM) toast('この端末がいっぱいで、保存できませんでした');
    return r.ok;
  }

  function mount(el, opts) {
    opts = opts || {};
    var hp = parseHash();
    var state = {
      cls: opts.cls === 'none' ? 'none' : (intIn(opts.cls, 1, MAXCLS) || hp.cls || null),
      no: intIn(opts.no, 1, MAXNO) || ((opts.cls == null || String(opts.cls) === String(hp.cls)) ? hp.no : null) || null,
      len: null
    };
    var alive = true, timers = [];
    var rootEl = h('div', 'cb');
    el.appendChild(rootEl);

    function go(cls, no) {
      var hash = '#/classbook' + (cls ? '/' + cls : '') + (cls && no ? '/' + no : '');
      if (root.location.hash !== hash) root.location.hash = hash;   // app.js がルートを作り直す。作り直さないときは onHash で描く
      else { state.cls = cls || state.cls; state.no = no || null; render(); }
    }
    function onHash() {
      if (!alive || !rootEl.isConnected) return;
      var p = parseHash();
      if (!('cls' in p)) return;
      state.cls = p.cls || state.cls;
      state.no = p.no || null;
      render();
      root.scrollTo(0, 0);
    }
    function stopDrop(e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); }
    root.addEventListener('hashchange', onHash);
    root.addEventListener('dragover', stopDrop);
    root.addEventListener('drop', stopDrop);

    function render() {
      if (!alive) return;
      rootEl.innerHTML = '';
      var db = load();
      if (state.cls && state.cls !== 'none' && state.no) renderDetail(db);
      else renderList(db);
    }

    /* ---------- 一覧 ---------- */
    function renderList(db) {
      rootEl.appendChild(importPanel(Object.keys(db.students).length + db.noProfile.length > 0));

      var classes = classList(db);
      if (!state.cls || (state.cls !== 'none' && classes.indexOf(state.cls) < 0 && !db.classes[state.cls])) state.cls = classes[0] || null;
      if (state.cls === 'none' && !db.noProfile.length) state.cls = classes[0] || null;

      var panel = h('section', 'cb-panel cb-classes');
      var tabs = h('div', 'cb-tabs');
      tabs.setAttribute('role', 'tablist');
      classes.forEach(function (c) {
        var n = studentsOf(db, c).length;
        var t = button(c + '組（' + n + '人）', 'cb-tab' + (state.cls === c ? ' on' : ''), function () { go(c); });
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', state.cls === c ? 'true' : 'false');
        tabs.appendChild(t);
      });
      if (db.noProfile.length) {
        var tn = button('組・番号なし（' + db.noProfile.length + '）', 'cb-tab cb-tab-none' + (state.cls === 'none' ? ' on' : ''), function () { go('none'); });
        tn.setAttribute('role', 'tab');
        tabs.appendChild(tn);
      }
      var addWrap = h('span', 'cb-addcls');
      var sel = h('select', 'cb-select');
      sel.setAttribute('aria-label', '足す組');
      for (var c = 1; c <= MAXCLS; c++) {
        if (classes.indexOf(c) >= 0) continue;
        var o = h('option', null, c + '組'); o.value = c; sel.appendChild(o);
      }
      if (sel.options.length) {
        addWrap.appendChild(sel);
        addWrap.appendChild(button('組を足す', 'small', function () {
          var v = intIn(sel.value, 1, MAXCLS);
          if (!v) return;
          var d = load();
          d.classes[v] = d.classes[v] || { size: 0 };
          save(d);
          go(v);
        }));
        tabs.appendChild(addWrap);
      }
      panel.appendChild(tabs);
      if (!state.cls) {
        panel.appendChild(h('p', 'cb-empty', 'まだデータがありません。上の欄に Forms の回答のファイルを入れるか、チャットの文章をはりつけてください。組を先に足しておくこともできます。'));
      } else if (state.cls === 'none') {
        panel.appendChild(noProfileView(db));
      } else {
        panel.appendChild(classView(db, state.cls));
      }
      rootEl.appendChild(panel);
      rootEl.appendChild(sharePanel(db));
      rootEl.appendChild(settingsPanel());
    }

    function importPanel(compact) {
      var sec = h('section', 'cb-panel cb-import' + (compact ? ' cb-import-compact' : ''));
      sec.appendChild(h('h2', null, 'コードを取りこむ'));
      sec.appendChild(h('p', 'cb-lead', 'Forms の回答を Excel でダウンロードして、そのファイルをここに入れてください。'));
      var how = h('ol', 'cb-how');
      ['子どもは、ふりかえりの「先生に送る」（またはホームの「学習のきろくを先生に送る」）でコードをコピーし、Forms に貼って送信します。',
        'Forms の「回答」→「Excel で開く」（またはダウンロード）で、回答のファイル（.xlsx）を保存します。',
        'そのファイルを下のわくにドロップするか、「ファイルをえらぶ」で入れます。何こでも、まとめて入れられます（.xlsx・.csv・.txt・.zip）。'
      ].forEach(function (t) { how.appendChild(h('li', null, t)); });
      if (compact) {
        var det = h('details', 'cb-howbox');
        det.appendChild(h('summary', null, '使い方（Forms で集めるとき）'));
        det.appendChild(how);
        sec.appendChild(det);
      } else sec.appendChild(how);
      var grid = h('div', 'cb-import-grid');
      var drop = h('div', 'cb-drop');
      drop.setAttribute('tabindex', '0');
      drop.setAttribute('role', 'button');
      drop.setAttribute('aria-label', 'ファイルをドロップ、またはおしてえらぶ');
      drop.appendChild(withIcon(h('div', 'cb-drop-title'), 'download', 'ここにファイルをドロップ'));
      drop.appendChild(h('div', 'cb-drop-sub', 'Excel（.xlsx）・CSV・テキスト・ZIP・保存したクラスのきろく（.json）'));
      var input = h('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = '.xlsx,.csv,.txt,.tsv,.zip,.json';
      input.className = 'cb-file';
      input.setAttribute('aria-label', 'ファイルをえらぶ');
      var pickB = button('ファイルをえらぶ', 'primary', function (e) { e.stopPropagation(); input.click(); });
      drop.appendChild(pickB);
      drop.appendChild(input);
      drop.addEventListener('click', function () { input.click(); });
      drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
      drop.addEventListener('drop', function (e) {
        e.preventDefault();
        drop.classList.remove('over');
        var fs = e.dataTransfer && e.dataTransfer.files;
        if (fs && fs.length) runFiles(fs);
      });
      input.addEventListener('change', function () { if (input.files && input.files.length) runFiles(input.files); input.value = ''; });
      grid.appendChild(drop);

      var pasteBox = h('div', 'cb-paste');
      pasteBox.appendChild(h('div', 'cb-paste-title', 'または、文章をはりつける'));
      var ta = h('textarea', 'cb-ta');
      ta.placeholder = compact ? 'チャットや Excel の列をはりつけ（Ctrl + V）' : 'Teams のチャットや、Excel の列をコピーして、ここにはりつけ（Ctrl + V）';
      ta.setAttribute('aria-label', 'コードをはりつける');
      pasteBox.appendChild(ta);
      var goB = button('取りこむ', 'primary', function () {
        if (!ta.value.trim()) { setMsg('はりつけた文章がありません。', true); return; }
        busy(true);
        importText(ta.value).then(function (r) { if (r.students || r.noProfile) ta.value = ''; done(r); }, fail);
      });
      pasteBox.appendChild(goB);
      grid.appendChild(pasteBox);
      sec.appendChild(grid);
      var msg = h('div', 'cb-msg');
      msg.setAttribute('role', 'status');
      sec.appendChild(msg);
      if (state.lastMsg) { msg.textContent = state.lastMsg.text; msg.className = 'cb-msg ' + (state.lastMsg.warn ? 'warn' : 'good'); }

      function setMsg(t, warn) { msg.textContent = t; msg.className = 'cb-msg ' + (warn ? 'warn' : 'good'); }
      function busy(on) { goB.disabled = on; pickB.disabled = on; if (on) setMsg('取りこみ中…'); }
      // 保存したクラスのきろく（.json、または中身がそれ）は、読みこみ方をえらぶダイアログへ。ほかはコードの取りこみ
      function runFiles(fs) {
        var list = Array.prototype.slice.call(fs);
        busy(true);
        Promise.all(list.map(function (f) {
          var ext = extOf(f.name);
          if (ext === 'json') return Promise.resolve(true);
          if (['xlsx', 'xls', 'zip', 'csv', 'tsv'].indexOf(ext) >= 0 || f.size > MAX_FILE) return Promise.resolve(false);
          return readBytes(f).then(function (b) { return looksLikeBook(decodeText(b.subarray(0, 4000))); }, function () { return false; });
        })).then(function (isBook) {
          var books = list.filter(function (f, i) { return isBook[i]; }), rest = list.filter(function (f, i) { return !isBook[i]; });
          if (!alive) return;
          if (rest.length) importFiles(rest).then(done, fail); else busy(false);
          if (books.length) openBookFile(books[0]);
        }, fail);
      }
      function done(r) {
        if (!alive) return;
        busy(false);
        state.lastMsg = { text: r.message, warn: !(r.students || r.noProfile) || r.saved === false || !!r.bad };
        // 取りこんだ組を開く
        if (r.keys && r.keys.length) {
          var cs = r.keys.map(function (k) { return Number(k.split('-')[0]); });
          if (cs.indexOf(state.cls) < 0) state.cls = cs.sort(function (a, b) { return a - b; })[0];
        } else if (r.noProfile && !r.students) state.cls = 'none';
        state.no = null;
        render();
      }
      function fail(e) { warnLog('import', e); if (!alive) return; busy(false); setMsg('取りこめませんでした。', true); }
      return sec;
    }

    /* ---------- ファイルで受けわたす（先生どうし） ---------- */
    function sharePanel(db) {
      var sec = h('section', 'cb-panel cb-share');
      var top = h('div', 'cb-share-top');
      var tx = h('div', 'cb-share-text');
      tx.appendChild(h('h2', null, '先生どうしで受けわたす'));
      tx.appendChild(h('p', 'cb-note', '評価・所見を直したきろくをファイルにして、Teams の先生用のチャネルや OneDrive で、ほかの先生にわたせます。もらったファイルは「ファイルを読みこむ」で、この端末のきろくとまとめられます。'));
      top.appendChild(tx);
      var btns = h('div', 'cb-share-btns');
      var saveB = withIcon(button('', 'primary cb-book-save', function () { saveDialog(db); }), 'download', 'ファイルに保存');
      saveB.disabled = !classList(db).length;
      btns.appendChild(saveB);
      var input = h('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.className = 'cb-file cb-book-file';
      input.setAttribute('aria-label', '保存したファイルをえらぶ');
      input.addEventListener('change', function () { var f = input.files && input.files[0]; input.value = ''; if (f) openBookFile(f); });
      btns.appendChild(button('ファイルを読みこむ', 'cb-book-load', function () { input.click(); }));
      btns.appendChild(input);
      top.appendChild(btns);
      sec.appendChild(top);
      var msg = h('div', 'cb-msg cb-book-msg');
      msg.setAttribute('role', 'status');
      if (state.bookMsg) { msg.textContent = state.bookMsg.text; msg.className = 'cb-msg cb-book-msg ' + (state.bookMsg.warn ? 'warn' : 'good'); }
      sec.appendChild(msg);
      return sec;
    }
    function modal(cls) {
      var back = h('div', 'modal-back');
      var box = h('div', 'modal cb-modal ' + (cls || ''));
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      back.appendChild(box);
      document.body.appendChild(back);
      function close() { back.remove(); document.removeEventListener('keydown', onKey); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      document.addEventListener('keydown', onKey);
      return { box: box, close: close };
    }
    function radio(name, value, label, checked, sub) {
      var l = h('label', 'cb-opt');
      var r = h('input');
      r.type = 'radio'; r.name = name; r.value = value; r.checked = !!checked;
      l.appendChild(r);
      var t = h('span', 'cb-opt-text');
      t.appendChild(h('span', 'cb-opt-label', label));
      if (sub) t.appendChild(h('span', 'cb-opt-sub', sub));
      l.appendChild(t);
      return l;
    }
    function checkbox(label, checked, cls) {
      var l = h('label', 'cb-opt ' + (cls || ''));
      var c = h('input');
      c.type = 'checkbox'; c.checked = !!checked;
      l.appendChild(c);
      l.appendChild(h('span', 'cb-opt-label', label));
      return { label: l, input: c };
    }
    function saveDialog(db) {
      var classes = classList(db);
      if (!classes.length) return;
      var cur = typeof state.cls === 'number' && classes.indexOf(state.cls) >= 0 ? state.cls : classes[0];
      var m = modal('cb-book-dlg');
      m.box.appendChild(h('h2', 'cb-modal-title', 'ファイルに保存'));
      var grp = h('div', 'cb-opts');
      grp.setAttribute('role', 'radiogroup');
      grp.setAttribute('aria-label', '保存する組');
      var total = classes.reduce(function (n, c) { return n + studentsOf(db, c).length; }, 0);
      grp.appendChild(radio('cb-save-which', 'all', '全部の組', classes.length > 1, classes.map(function (c) { return c + '組'; }).join('・') + '（' + total + '人）'));
      grp.appendChild(radio('cb-save-which', String(cur), 'いまの組（' + cur + '組）', classes.length <= 1, studentsOf(db, cur).length + '人'));
      m.box.appendChild(grp);
      m.box.appendChild(h('p', 'cb-modal-warn', PRIVACY + 'ファイルには、子どもの名前・学習のきろく・ふりかえり・評価・所見が入っています。受けわたしは Teams の先生用のチャネルや OneDrive など、校内で決められた場所だけで行い、使い終わったファイルは消してください。'));
      var tn = teacherName();
      m.box.appendChild(h('p', 'cb-note', tn ? '保存する人：' + byLabel(tn) : '先生の名前は、先生メニューの「クラスのきろく」で入れられます（入れなくてもかまいません）。'));
      var row = h('div', 'modal-row');
      row.appendChild(button('やめる', '', m.close));
      var ok = withIcon(button('', 'primary cb-book-do', function () {
        var v = (grp.querySelector('input:checked') || {}).value || 'all';
        var which = v === 'all' ? 'all' : Number(v);
        var r = exportBook(which);
        m.close();
        toast(r.name + ' を保存しました');
      }), 'download', '注意を読んだので保存する');
      row.appendChild(ok);
      m.box.appendChild(row);
      setTimeout(function () { try { ok.focus(); } catch (e) { /* なし */ } }, 20);
    }
    function openBookFile(f) {
      readBook(f).then(function (b) {
        if (!alive) return;
        if (!b) { state.bookMsg = state.lastMsg = { text: BAD_FILE, warn: true }; render(); return; }
        loadDialog(b);
      }, function () { if (alive) { state.bookMsg = state.lastMsg = { text: BAD_FILE, warn: true }; render(); } });
    }
    function loadDialog(b) {
      var cls = bookClasses(b);
      var m = modal('cb-book-dlg');
      m.box.appendChild(h('h2', 'cb-modal-title', 'ファイルを読みこむ'));
      var who = [];
      if (b.exportedAt) { var d = new Date(tms(b.exportedAt)); who.push(d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'); }
      if (b.teacher) who.push(byLabel(b.teacher));
      if (who.length) m.box.appendChild(h('p', 'cb-note', who.join('　') + 'が保存したファイルです。'));
      if (!cls.length) {
        m.box.appendChild(h('p', 'cb-modal-warn', 'このファイルには、組のきろくが入っていません。'));
      }
      m.box.appendChild(h('div', 'cb-opt-head', '読みこみ方'));
      var grp = h('div', 'cb-opts');
      grp.setAttribute('role', 'radiogroup');
      grp.appendChild(radio('cb-load-mode', 'merge', 'まとめる', true, '同じ子は、学習のまとめ・ふりかえりは新しいほう、先生が直した評価・所見は直した日時が新しいほうを残します。'));
      grp.appendChild(radio('cb-load-mode', 'replace', '置きかえる', false, 'えらんだ組の、この端末のきろくを消して、ファイルの内容にします。'));
      m.box.appendChild(grp);
      m.box.appendChild(h('div', 'cb-opt-head', '読みこむ組'));
      var cg = h('div', 'cb-opts cb-opts-row');
      var checks = cls.map(function (c) {
        var x = checkbox(c.cls + '組（' + c.n + '人）', true, 'cb-opt-cls');
        x.input.value = c.cls;
        cg.appendChild(x.label);
        return x.input;
      });
      m.box.appendChild(cg);
      var setC = checkbox('基準の設定（観点別評価のしきい値）も読みこむ', false, 'cb-opt-set');
      if (!b.assessSettings) { setC.input.disabled = true; setC.label.classList.add('off'); }
      m.box.appendChild(setC.label);
      var warn = h('p', 'cb-msg warn');
      m.box.appendChild(warn);
      var row = h('div', 'modal-row');
      row.appendChild(button('やめる', '', m.close));
      var ok = button('読みこむ', 'primary cb-book-do', function () {
        var mode = (grp.querySelector('input:checked') || {}).value === 'replace' ? 'replace' : 'merge';
        var want = checks.filter(function (c) { return c.checked; }).map(function (c) { return Number(c.value); });
        if (cls.length && !want.length) { warn.textContent = '読みこむ組をえらんでください。'; return; }
        var opts = { mode: mode, classes: want, settings: setC.input.checked };
        function run() {
          var r = importBook(b, opts);
          state.bookMsg = state.lastMsg = { text: r.message, warn: !r.ok || r.saved === false };
          if (r.keys && r.keys.length) {
            var cs = want.slice().sort(function (x, y) { return x - y; });
            if (cs.indexOf(state.cls) < 0) state.cls = cs[0];
          }
          state.no = null;
          if (r.settings) state.openSettings = true;
          render();
        }
        m.close();
        if (mode === 'replace') {
          confirmDialog(want.map(function (c) { return c + '組'; }).join('・') + 'の、この端末のきろく（先生が直した評価・所見もふくむ）を消して、ファイルの内容に置きかえます。もとにもどせません。よろしいですか？', '置きかえる', run);
        } else run();
      });
      row.appendChild(ok);
      m.box.appendChild(row);
      setTimeout(function () { try { ok.focus(); } catch (e) { /* なし */ } }, 20);
    }

    function classView(db, cls) {
      var wrap = h('div', 'cb-classview');
      var bar = h('div', 'cb-toolbar');
      var lab = h('label', 'cb-size');
      lab.appendChild(document.createTextNode(cls + '組の人数 '));
      var size = h('input', 'cb-num');
      size.type = 'number'; size.min = 1; size.max = MAXNO;
      size.value = rosterSize(db, cls) || '';
      size.addEventListener('change', function () {
        var d = load(), v = intIn(size.value, 1, MAXNO);
        d.classes[cls] = { size: v || 0 };
        save(d);
        render();
      });
      lab.appendChild(size);
      lab.appendChild(document.createTextNode(' 人'));
      bar.appendChild(lab);
      var sp = h('span', 'cb-spacer');
      bar.appendChild(sp);
      bar.appendChild(withIcon(button('', 'primary cb-csv', function () {
        confirmDialog(cls + '組のきろくを CSV で書き出します。' + PRIVACY + '（名前・評価・所見が入っています）', '書き出す', function () {
          exportCsv(cls);
          toast(csvName(cls) + ' を書き出しました');
        }, false);
      }), 'download', 'CSVで書き出す'));
      bar.appendChild(button('この組のデータを消す', 'danger', function () {
        confirmDialog(cls + '組の、取りこんだデータ・先生の評価・直した所見を、すべて消します。もとにもどせません。よろしいですか？', '消す', function () {
          var d = load();
          Object.keys(d.students).forEach(function (k) { if (d.students[k].profile.cls === cls) delete d.students[k]; });
          delete d.classes[cls];
          save(d);
          state.lastMsg = null;
          toast(cls + '組のデータを消しました');
          state.cls = null;
          go(null);
          render();
        });
      }));
      wrap.appendChild(bar);

      var list = studentsOf(db, cls), by = {};
      list.forEach(function (st) { by[st.profile.no] = st; });
      var n = rosterSize(db, cls);
      var tw = h('div', 'cb-table-wrap');
      var tb = h('table', 'cb-table');
      var thead = h('thead');
      var r1 = h('tr'), r2 = h('tr');
      function th(t, cls2, rs, cs) { var e = h('th', cls2 || null, t); if (rs) e.rowSpan = rs; if (cs) e.colSpan = cs; return e; }
      r1.appendChild(th('番号', 'cb-c-no', 2));
      r1.appendChild(th('名前', 'cb-c-name', 2));
      r1.appendChild(th('取り組み', 'cb-grp', 0, 3));
      r1.appendChild(th('正答率', 'cb-c-acc', 2));
      r1.appendChild(th('観点別（案）', 'cb-grp', 0, 3));
      r1.appendChild(th('支援の要点', 'cb-c-sup', 2));
      r1.appendChild(th('最後の\nふりかえり', 'cb-c-last', 2));
      ['進んだ時', '日数', '時間'].forEach(function (t) { r2.appendChild(th(t, 'cb-sub')); });
      AXES.forEach(function (a) { var e = th(a.short, 'cb-sub cb-c-g'); e.title = a.label; r2.appendChild(e); });
      thead.appendChild(r1); thead.appendChild(r2);
      tb.appendChild(thead);
      var tbody = h('tbody');
      var shown = 0;
      for (var no = 1; no <= n; no++) {
        var st = by[no], tr = h('tr');
        tr.appendChild(h('td', 'cb-c-no', String(no)));
        if (!st) {
          tr.className = 'cb-row-empty';
          tr.appendChild(h('td', 'cb-c-name cb-muted', 'まだ'));
          for (var k = 0; k < 9; k++) tr.appendChild(h('td'));
          tbody.appendChild(tr);
          continue;
        }
        shown++;
        var m = metrics(st), ev = evaluate(st), sup = support(st);
        tr.className = 'cb-row';
        tr.tabIndex = 0;
        tr.setAttribute('role', 'link');
        tr.setAttribute('aria-label', no + '番 ' + (st.profile.name || '') + ' の詳しい画面');
        var nameTd = h('td', 'cb-c-name');
        nameTd.appendChild(h('span', 'cb-name', st.profile.name || '（名前なし）'));
        tr.appendChild(nameTd);
        tr.appendChild(h('td', 'cb-c-num', st.summary ? m.lessons + '/10' : '—'));
        tr.appendChild(h('td', 'cb-c-num', m.days == null ? '—' : m.days + '日'));
        tr.appendChild(h('td', 'cb-c-num', m.minutes == null ? '—' : fmtMinutes(m.minutes)));
        var accTd = h('td', 'cb-c-acc');
        if (m.acc == null) accTd.textContent = '—';
        else {
          var ab = h('span', 'cb-accbar');
          var fill = h('span', 'cb-accfill');
          fill.style.width = Math.round(m.acc * 100) + '%';
          ab.appendChild(fill);
          accTd.appendChild(h('span', 'cb-accnum', pct(m.acc)));
          accTd.appendChild(ab);
        }
        tr.appendChild(accTd);
        AXES.forEach(function (a) { var td = h('td', 'cb-c-g'); td.appendChild(gradeEl(axisInfo(ev, st, a.id))); tr.appendChild(td); });
        var supTd = h('td', 'cb-c-sup');
        if (sup.length) {
          var t0 = sup[0].text;
          supTd.textContent = t0.length > 34 ? t0.slice(0, 33) + '…' : t0;
          supTd.title = t0;
        } else supTd.textContent = st.summary ? '' : '（学習のきろくがまだ）';
        tr.appendChild(supTd);
        tr.appendChild(h('td', 'cb-c-last', m.lastRefl ? fmtDate(m.lastRefl) : '—'));
        (function (no2) {
          tr.addEventListener('click', function () { go(cls, no2); });
          tr.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(cls, no2); });
        })(no);
        tbody.appendChild(tr);
      }
      tb.appendChild(tbody);
      tw.appendChild(tb);
      var info = h('p', 'cb-note', n ? (n + '人中 ' + shown + '人のデータがあります（出していない子は「まだ」）。行をおすと、詳しい画面を開きます。') : 'この組のデータはまだありません。人数を入れておくと、出していない子が分かります。');
      wrap.appendChild(info);
      if (n) wrap.appendChild(tw);
      var legend = h('div', 'cb-legend');
      var l1 = h('span', 'cb-grade cb-g-B cb-g-t', 'B'); legend.appendChild(l1);
      legend.appendChild(h('span', null, '＝先生が変えた評価'));
      var l2 = h('span', 'cb-grade cb-g-B', 'B'); l2.appendChild(h('sup', 'cb-few', '少')); legend.appendChild(l2);
      legend.appendChild(h('span', null, '＝材料が少ない案'));
      legend.appendChild(h('span', 'cb-legend-note', '観点別の評価・所見は記録から作った案です。先生が確かめてから使ってください。'));
      if (n) wrap.appendChild(legend);
      return wrap;
    }

    function noProfileView(db) {
      var wrap = h('div', 'cb-noprof');
      wrap.appendChild(h('p', 'cb-note', '組・番号が入っていない（前の版のアプリの）ふりかえりです。名前は手書きです。子どもが「じぶんのこと」を入れてから送ると、組・番号で振り分けられます。'));
      var bar = h('div', 'cb-toolbar');
      bar.appendChild(h('span', 'cb-spacer'));
      bar.appendChild(button('組・番号なしを消す', 'danger', function () {
        confirmDialog('組・番号なしのふりかえりを、すべて消します。よろしいですか？', '消す', function () {
          var d = load(); d.noProfile = []; save(d); state.cls = null; go(null); render();
        });
      }));
      wrap.appendChild(bar);
      var list = db.noProfile.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      wrap.appendChild(reflTable(list, true));
      return wrap;
    }

    function reflTable(list, withName) {
      var tw = h('div', 'cb-table-wrap');
      if (!list.length) { tw.appendChild(h('p', 'cb-note', 'ふりかえりは、まだ届いていません。')); return tw; }
      var tb = h('table', 'cb-table cb-rtable');
      var head = h('tr');
      (withName ? ['名前'] : []).concat(['日付', 'めあて', 'Y やったこと', '自己評価', 'W わかった・できた', 'T 次にやりたいこと']).forEach(function (t) { head.appendChild(h('th', null, t)); });
      var thd = h('thead'); thd.appendChild(head); tb.appendChild(thd);
      var tbody = h('tbody');
      list.forEach(function (r) {
        var tr = h('tr');
        if (withName) {
          var nt = h('td', 'cb-r-name');
          if (r.name) nt.appendChild(inkThumb(r.name, 'なまえ（手書き）', 120, 40)); else nt.appendChild(h('span', 'cb-muted', '（なし）'));
          tr.appendChild(nt);
        }
        tr.appendChild(h('td', 'cb-r-date', fmtDate(r.date)));
        var mt = h('td', 'cb-r-meate');
        r.meate.choices.forEach(function (c) { mt.appendChild(h('div', null, c)); });
        if (r.meate.ink) mt.appendChild(inkThumb(r.meate.ink, 'めあて（手書き）', 140, 40));
        if (!r.meate.choices.length && !r.meate.ink) mt.appendChild(h('span', 'cb-muted', '—'));
        tr.appendChild(mt);
        var yt = h('td', 'cb-r-y');
        r.y.auto.forEach(function (c) { yt.appendChild(h('div', null, c)); });
        r.y.extra.forEach(function (c) { yt.appendChild(h('div', 'cb-extra', c)); });
        if (!r.y.auto.length && !r.y.extra.length) yt.appendChild(h('span', 'cb-muted', '—'));
        tr.appendChild(yt);
        var et = h('td', 'cb-r-eval');
        if (r.w.eval) {
          var em = h('span', 'cb-eval cb-eval-' + r.w.eval, EVAL_MARK[r.w.eval]);
          em.setAttribute('aria-label', EVAL_LABEL[r.w.eval]);
          et.appendChild(em);
          et.appendChild(h('div', 'cb-eval-cap', EVAL_LABEL[r.w.eval]));
        } else et.appendChild(h('span', 'cb-muted', '—'));
        tr.appendChild(et);
        var wt = h('td', 'cb-r-w');
        r.w.choices.forEach(function (c) { wt.appendChild(h('div', null, c)); });
        if (r.w.ink) wt.appendChild(inkThumb(r.w.ink, 'わかったこと・できたこと（手書き）'));
        tr.appendChild(wt);
        var tt = h('td', 'cb-r-t');
        r.t.choices.forEach(function (c) { tt.appendChild(h('div', null, c)); });
        if (r.t.ink) tt.appendChild(inkThumb(r.t.ink, '次にやりたいこと（手書き）'));
        if (r.inkDropped) tt.appendChild(h('div', 'cb-muted cb-small', '（手書きは容量のため省きました）'));
        tr.appendChild(tt);
        tbody.appendChild(tr);
      });
      tb.appendChild(tbody);
      tw.appendChild(tb);
      return tw;
    }

    function settingsPanel() {
      var sec = h('details', 'cb-panel cb-settings');
      var sm = h('summary', null, '観点別評価の基準（しきい値）を変える');
      sec.appendChild(sm);
      var A = assessApi();
      if (!A || typeof A.settings !== 'function') {
        sec.appendChild(h('p', 'cb-note', '評価の機能（assess.js）がまだありません。'));
        return sec;
      }
      var cur = {};
      try { cur = A.settings() || {}; } catch (e) { cur = {}; }
      var def = A.DEFAULTS || {};
      sec.appendChild(h('p', 'cb-note', '点数（0〜100%）が A の値以上なら A、B の値以上なら B、それより下なら C の案を出します。知識・技能は教科書の問題の「最初の答えで○」の割合です。思考・判断・表現と態度は、いくつかの材料をまとめた点数です。'));
      var form = h('div', 'cb-set-grid');
      var inputs = {};
      AXES.forEach(function (a) {
        var row = h('div', 'cb-set-row');
        row.appendChild(h('span', 'cb-set-label', a.label));
        ['A', 'B'].forEach(function (g) {
          var l = h('label', 'cb-set-field');
          l.appendChild(document.createTextNode(g + ' '));
          var inp = h('input', 'cb-num');
          inp.type = 'number'; inp.min = 0; inp.max = 100; inp.step = 1;
          var v = cur[a.id] && typeof cur[a.id][g] === 'number' ? cur[a.id][g] : (def[a.id] ? def[a.id][g] : null);
          inp.value = v == null ? '' : Math.round(v * 100);
          inp.setAttribute('aria-label', a.label + ' の ' + g + ' のしきい値（%）');
          l.appendChild(inp);
          l.appendChild(document.createTextNode(' %以上'));
          inputs[a.id + g] = inp;
          row.appendChild(l);
        });
        form.appendChild(row);
      });
      var mrow = h('div', 'cb-set-row');
      mrow.appendChild(h('span', 'cb-set-label', '材料が少ないとする目安'));
      var ml = h('label', 'cb-set-field');
      ml.appendChild(document.createTextNode('取り組んだ時が '));
      var mi = h('input', 'cb-num');
      mi.type = 'number'; mi.min = 0; mi.max = 10;
      mi.value = typeof cur.minLessons === 'number' ? cur.minLessons : (def.minLessons != null ? def.minLessons : 6);
      ml.appendChild(mi);
      ml.appendChild(document.createTextNode(' 時より少ないとき'));
      mrow.appendChild(ml);
      form.appendChild(mrow);
      sec.appendChild(form);
      var row2 = h('div', 'cb-actions');
      var msg = h('span', 'cb-msg');
      row2.appendChild(button('この基準にする', 'primary', function () {
        var s = clone(cur) || {}, ok = true;
        AXES.forEach(function (a) {
          var va = Number(inputs[a.id + 'A'].value), vb = Number(inputs[a.id + 'B'].value);
          if (!(inputs[a.id + 'A'].value !== '' && inputs[a.id + 'B'].value !== '' && va >= 0 && va <= 100 && vb >= 0 && vb <= 100 && va > vb)) ok = false;
          s[a.id] = { A: Math.round(va) / 100, B: Math.round(vb) / 100 };
        });
        var mv = intIn(mi.value, 0, 10);
        if (mv == null) ok = false; else s.minLessons = mv;
        if (!ok) { msg.textContent = 'A は B より大きく、0〜100 の数で入れてください。'; msg.className = 'cb-msg warn'; return; }
        try { A.setSettings(s); } catch (e) { warnLog('setSettings', e); msg.textContent = '保存できませんでした。'; msg.className = 'cb-msg warn'; return; }
        state.openSettings = true;
        toast('基準を変えました');
        render();
      }));
      row2.appendChild(button('はじめの値にもどす', '', function () {
        confirmDialog('基準を、はじめの値にもどします。よろしいですか？', 'もどす', function () {
          try { A.setSettings(clone(def)); } catch (e) { warnLog('setSettings', e); }
          state.openSettings = true;
          render();
        }, false);
      }));
      row2.appendChild(msg);
      sec.appendChild(row2);
      if (state.openSettings) { sec.open = true; state.openSettings = false; }
      return sec;
    }

    /* ---------- 詳しい画面 ---------- */
    function renderDetail(db) {
      var cls = state.cls, no = state.no;
      var st = db.students[cls + '-' + no] || null;
      var nos = studentsOf(db, cls).map(function (x) { return x.profile.no; });
      var prevNo = null, nextNo = null;
      nos.forEach(function (x) { if (x < no) prevNo = x; if (x > no && nextNo == null) nextNo = x; });
      var nav = h('div', 'cb-nav');
      nav.appendChild(link('◀ ' + cls + '組の一覧', 'btn small cb-navbtn', '#/classbook/' + cls));
      nav.appendChild(h('span', 'cb-spacer'));
      var pb = button('◀ 前の番号' + (prevNo ? '（' + prevNo + '番）' : ''), 'small cb-navbtn', function () { if (prevNo) go(cls, prevNo); });
      pb.disabled = !prevNo;
      var nb = button('次の番号' + (nextNo ? '（' + nextNo + '番）' : '') + ' ▶', 'small cb-navbtn', function () { if (nextNo) go(cls, nextNo); });
      nb.disabled = !nextNo;
      nav.appendChild(pb); nav.appendChild(nb);
      rootEl.appendChild(nav);

      var head = h('section', 'cb-panel cb-head');
      var hn = h('div', 'cb-head-main');
      hn.appendChild(h('div', 'cb-head-cls', '4年' + cls + '組 ' + no + '番'));
      hn.appendChild(h('h2', 'cb-head-name', st ? (st.profile.name || '（名前なし）') : 'まだデータがありません'));
      head.appendChild(hn);
      if (st) {
        var m = metrics(st);
        var facts = h('div', 'cb-head-facts');
        [['進んだ時', st.summary ? m.lessons + ' / 10' : '—'], ['学習した日数', m.days == null ? '—' : m.days + '日'],
          ['合計時間', m.minutes == null ? '—' : fmtMinutes(m.minutes)], ['正答率', m.acc == null ? '—' : pct(m.acc)],
          ['ふりかえり', st.reflections.length + '回']].forEach(function (f) {
          var d = h('div', 'cb-fact');
          d.appendChild(h('div', 'cb-fact-k', f[0]));
          d.appendChild(h('div', 'cb-fact-v', f[1]));
          facts.appendChild(d);
        });
        head.appendChild(facts);
        var at = st.summary && fmtAt(st.summary.at);
        head.appendChild(h('div', 'cb-head-at', at ? '学習のきろく：' + at + ' にまとめたもの' : '学習のきろくは、まだ届いていません（ふりかえりだけ）'));
      }
      rootEl.appendChild(head);
      if (!st) {
        var p = h('section', 'cb-panel');
        p.appendChild(h('p', 'cb-note', 'この番号の子のコードは、まだ取りこまれていません。'));
        rootEl.appendChild(p);
        return;
      }
      var grid = h('div', 'cb-detail');
      var left = h('div', 'cb-col'), right = h('div', 'cb-col');
      left.appendChild(lessonsPanel(st));
      left.appendChild(skillsPanel(st));
      left.appendChild(numbersPanel(st));
      var ev = evaluate(st);
      right.appendChild(evalPanel(st, ev));
      right.appendChild(supportPanel(st));
      right.appendChild(commentPanel(db, st));
      grid.appendChild(left); grid.appendChild(right);
      rootEl.appendChild(grid);
      var rp = h('section', 'cb-panel');
      rp.appendChild(h('h3', 'cb-h3', 'ふりかえりの一覧（' + st.reflections.length + '回）'));
      rp.appendChild(reflTable(st.reflections.slice().reverse(), false));
      rootEl.appendChild(rp);
    }

    function lessonsPanel(st) {
      var sec = h('section', 'cb-panel');
      sec.appendChild(h('h3', 'cb-h3', '各時のできぐあい（教科書の問題・最初の答えで○の割合）'));
      if (!st.summary) { sec.appendChild(h('p', 'cb-note', '学習のきろくが届くと表示されます。')); return sec; }
      var m = metrics(st);
      var ul = h('div', 'cb-bars');
      m.list.forEach(function (li, i) {
        var row = h('div', 'cb-bar-row' + (li.tried ? '' : ' cb-bar-not'));
        var lab = h('div', 'cb-bar-label');
        lab.appendChild(h('span', 'cb-bar-no', '第' + (i + 1) + '時'));
        var tt = lessonTitle(i);
        if (tt) { var tl = h('span', 'cb-bar-title', tt); tl.title = tt; lab.appendChild(tl); }
        row.appendChild(lab);
        var bar = h('div', 'cb-bar');
        if (li.tried && li.first != null) {
          var f = h('div', 'cb-bar-fill ' + (li.first >= 0.9 ? 'hi' : li.first >= 0.7 ? 'mid' : 'lo'));
          f.style.width = Math.round(li.first * 100) + '%';
          bar.appendChild(f);
        }
        row.appendChild(bar);
        var txt = !li.tried ? 'まだ' : [li.first != null ? pct(li.first) : '', li.n != null ? li.n + '問' : '', li.sec != null ? '平均' + Math.round(li.sec) + '秒' : ''].filter(Boolean).join('　');
        row.appendChild(h('div', 'cb-bar-txt', txt || '取り組んだ'));
        ul.appendChild(row);
      });
      sec.appendChild(ul);
      return sec;
    }
    function skillsPanel(st) {
      var sec = h('section', 'cb-panel');
      sec.appendChild(h('h3', 'cb-h3', '技能のにがて・とくい'));
      var sk = st.summary && isObj(st.summary.skills) ? st.summary.skills : null;
      if (!sk) { sec.appendChild(h('p', 'cb-note', '学習のきろくが届くと表示されます。')); return sec; }
      var groups = { weak: [], soso: [], strong: [] };
      Object.keys(sk).forEach(function (id) {
        var x = sk[id];
        if (!isObj(x)) return;
        var stt = x.st || x.status;
        if (groups[stt]) groups[stt].push({ id: id, acc: rate(pick(x, ['acc'])), n: pick(x, ['n']) });
      });
      [['weak', 'にがて', 'cb-sk-weak'], ['soso', 'もう少し', 'cb-sk-soso'], ['strong', 'とくい', 'cb-sk-strong']].forEach(function (g) {
        var row = h('div', 'cb-sk-row');
        row.appendChild(h('span', 'cb-sk-head ' + g[2], g[1]));
        var box = h('div', 'cb-sk-chips');
        if (!groups[g[0]].length) box.appendChild(h('span', 'cb-muted', 'なし'));
        groups[g[0]].sort(function (a, b) { return (a.acc || 0) - (b.acc || 0); }).forEach(function (x) {
          box.appendChild(h('span', 'cb-chip ' + g[2], skillLabel(x.id) + (x.acc != null ? ' ' + pct(x.acc) : '') + (x.n ? '（' + x.n + '問）' : '')));
        });
        row.appendChild(box);
        sec.appendChild(row);
      });
      return sec;
    }
    // LearnSummary（js/summary.js）の項目：[キー, 見出し, 単位]。単位 '%' は 0〜1 の割合
    var SEC_FIELDS = [
      ['matome', 'まとめモード', [['n', '', '回'], ['q', '答えた', '問'], ['rate', '正答率', '%'], ['fin', 'さいごまで', '回'], ['lv', 'レベル', 'lv']]],
      ['osusume', 'おすすめモード', [['n', '', '回'], ['q', '答えた', '問'], ['rate', '正答率', '%'], ['fin', 'さいごまで', '回'], ['min', '合計', '分']]],
      ['review', 'ふくしゅう', [['n', '', '回'], ['q', '答えた', '問'], ['rate', '正答率', '%']]],
      ['more', 'もっとれんしゅう', [['n', '', '回'], ['q', '答えた', '問'], ['rate', '正答率', '%']]],
      ['make', 'もんだいづくり', [['n', '作った', 'こ'], ['kinds', '', 'kinds']]],
      ['friend', 'ともだちの問題', [['n', '答えた', '問'], ['c', '○', '問']]],
      ['plan', '計画', [['days', '立てた日', '日'], ['ok', '計画どおり', '日']]],
      ['reflect', 'ふりかえり', [['n', '', '回'], ['ev', '', 'ev'], ['w', 'わかったことを書いた', '回'], ['prevT', '前の「次に」を生かした', '回'], ['extra', 'アプリの外でやったこと', '回'], ['match', '自己評価と結果が合った', 'match']]],
      ['habit', '取り組み方', [['q', '答えた問題', '問'], ['hint', 'ヒント', '%'], ['miss', '最初が×', '問'], ['fixed', 'やり直して○', '問']]],
      ['stars', '星と称号', [['n', '★', ''], ['sp', '✦', ''], ['title', '', 'text']]]
    ];
    var LEVEL_JA = { easy: 'かんたん', normal: 'ふつう', hard: 'むずかしい' };
    var KIND_JA = { hissan: '筆算', fill: '文章題・□うめ', compare: '大小くらべ', masu: 'ますの図', numberline: '数直線' };
    function fmtField(o, f) {
      var v = o[f[0]], u = f[2];
      if (v == null || v === '') return '';
      var lab = f[1] ? f[1] + ' ' : '';
      if (u === 'text') return typeof v === 'string' ? str(v, 40) : '';
      if (u === 'lv' || u === 'kinds' || u === 'ev') {
        if (!isObj(v)) return '';
        var map = u === 'lv' ? LEVEL_JA : u === 'kinds' ? KIND_JA : EVAL_MARK;
        var t = Object.keys(v).filter(function (k) { return typeof v[k] === 'number' && v[k] > 0; })
          .map(function (k) { return (map[k] || k) + (u === 'ev' ? '' : ' ') + v[k]; }).join('・');
        return t ? (lab + t) : '';
      }
      if (u === 'match') return typeof o.judged === 'number' && o.judged ? lab + v + '/' + o.judged + '回' : '';
      if (typeof v !== 'number') return '';
      if (u === '%') return lab + pct(rate(v));
      return lab + (Math.round(v * 10) / 10) + u;
    }
    function numbersPanel(st) {
      var sec = h('section', 'cb-panel');
      sec.appendChild(h('h3', 'cb-h3', 'まとめ・おすすめ・計画・ふりかえりなど'));
      var s = st.summary;
      if (!s) { sec.appendChild(h('p', 'cb-note', '学習のきろくが届くと表示されます。')); return sec; }
      var dl = h('dl', 'cb-dl');
      var any = false;
      SEC_FIELDS.forEach(function (x) {
        var o = s[x[0]];
        if (typeof o === 'number') o = { n: o };
        if (!isObj(o)) return;
        var parts = x[2].map(function (f) { return fmtField(o, f); }).filter(Boolean);
        if (!parts.length) return;
        dl.appendChild(h('dt', null, x[1]));
        dl.appendChild(h('dd', null, parts.join('　')));
        any = true;
      });
      if (!any) dl.appendChild(h('dd', 'cb-muted', 'データがありません'));
      sec.appendChild(dl);
      return sec;
    }
    function evalPanel(st, ev) {
      var sec = h('section', 'cb-panel cb-eval-panel');
      sec.appendChild(h('h3', 'cb-h3', '観点別評価'));
      if (!ev) sec.appendChild(h('p', 'cb-note warn', '評価の案を作れませんでした（評価の機能がないか、データが足りません）。先生の評価は入れられます。'));
      AXES.forEach(function (a) {
        var info = axisInfo(ev, st, a.id);
        var box = h('div', 'cb-axis');
        var top = h('div', 'cb-axis-top');
        top.appendChild(h('span', 'cb-axis-label', a.label));
        var dr = h('span', 'cb-axis-draft');
        dr.appendChild(document.createTextNode('案 '));
        dr.appendChild(gradeEl({ final: info.draft, draft: info.draft, teacher: null, enough: info.enough }));
        top.appendChild(dr);
        var seg = h('span', 'cb-axis-seg');
        seg.appendChild(h('span', 'cb-axis-t', '先生'));
        GRADES.forEach(function (g) {
          var on = info.final === g;
          var b = button(g, 'cb-gbtn cb-gbtn-' + g + (on ? ' on' : '') + (on && info.teacher ? ' t' : ''), function () { setOverride(a.id, g === info.draft ? null : g); });
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
          b.setAttribute('aria-label', a.label + ' を ' + g + ' にする');
          seg.appendChild(b);
        });
        if (info.teacher) seg.appendChild(button('案にもどす', 'small cb-undo', function () { setOverride(a.id, null); }));
        top.appendChild(seg);
        box.appendChild(top);
        var em = editedLine(st.overrideMeta[a.id]);
        if (info.teacher) {
          var chg = h('div', 'cb-axis-changed', '先生が ' + (info.draft || '—') + ' → ' + info.teacher + ' に変えました');
          if (em) chg.appendChild(h('span', 'cb-axis-when', em));
          box.appendChild(chg);
        }
        else if (em) box.appendChild(h('div', 'cb-axis-back', '案にもどしました　' + em));
        if (!info.enough) box.appendChild(h('div', 'cb-axis-few', '材料が少ないので、案の確かさは低めです。授業での様子と合わせて判断してください。'));
        if (info.reasons.length) {
          var ul = h('ul', 'cb-reasons');
          info.reasons.forEach(function (r) { ul.appendChild(h('li', null, String(r))); });
          box.appendChild(ul);
        }
        sec.appendChild(box);
      });
      return sec;
      function setOverride(axis, g) {
        var d = load(), s2 = d.students[st.profile.cls + '-' + st.profile.no];
        if (!s2) return;
        if (s2.override[axis] === g) return;
        s2.override[axis] = g;
        s2.overrideMeta[axis] = editMeta();
        if (!saveOrWarn(d)) return;
        render();
      }
    }
    function supportPanel(st) {
      var sec = h('section', 'cb-panel');
      sec.appendChild(h('h3', 'cb-h3', '支援の提案'));
      var sp = support(st);
      if (!sp.length) { sec.appendChild(h('p', 'cb-note', st.summary ? '特に提案はありません。' : '学習のきろくが届くと表示されます。')); return sec; }
      var ul = h('ul', 'cb-support');
      sp.forEach(function (x) {
        var li = h('li', 'cb-sup-' + (SUPPORT_KIND[x.kind] ? x.kind : 'other'));
        li.appendChild(h('span', 'cb-sup-kind', SUPPORT_KIND[x.kind] || 'そのほか'));
        li.appendChild(h('span', 'cb-sup-text', x.text));
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      return sec;
    }
    function commentPanel(db, st) {
      var sec = h('section', 'cb-panel cb-comment');
      sec.appendChild(h('h3', 'cb-h3', '通知表の所見の案'));
      var len = state.len || st.comment.len || 'long';
      var k = st.profile.cls + '-' + st.profile.no;
      var cc = classComments(db, st.profile.cls, len)[k] || { draft: '', text: '', edited: false };
      var bar = h('div', 'cb-com-bar');
      var seg = h('div', 'cb-seg');
      [['short', '短い（60〜80字）'], ['long', '長い（100〜150字）']].forEach(function (x) {
        var b = button(x[1], 'cb-segbtn' + (len === x[0] ? ' on' : ''), function () {
          state.len = x[0];
          var d = load(), s2 = d.students[k];
          if (s2) { s2.comment.len = x[0]; save(d); }
          render();
        });
        b.setAttribute('aria-pressed', len === x[0] ? 'true' : 'false');
        seg.appendChild(b);
      });
      bar.appendChild(seg);
      bar.appendChild(button('別の言い方', 'cb-variant', function () {
        function next() {
          var d = load(), s2 = d.students[k];
          if (!s2) return;
          s2.comment.variant = (s2.comment.variant || 0) + 1;
          if (s2.comment[len]) stampComment(s2.comment);
          s2.comment[len] = '';
          s2.comment.edited = !!(s2.comment.short || s2.comment.long);
          save(d);
          render();
        }
        if (tmr) { clearTimeout(tmr); persist(); }
        var cur = load().students[k];
        if (cur && cur.comment[len]) confirmDialog('先生が直した文があります。別の言い方にすると、直した文は案に置きかわります。よろしいですか？', '別の言い方にする', next);
        else next();
      }));
      sec.appendChild(bar);
      var ta = h('textarea', 'cb-com-ta');
      ta.value = cc.text;
      ta.rows = len === 'long' ? 5 : 3;
      ta.setAttribute('aria-label', '所見（直せます）');
      sec.appendChild(ta);
      var foot = h('div', 'cb-com-foot');
      var count = h('span', 'cb-com-count');
      var stat = h('span', 'cb-com-stat');
      foot.appendChild(count);
      foot.appendChild(stat);
      foot.appendChild(h('span', 'cb-spacer'));
      var undo = button('案にもどす', 'small', function () {
        confirmDialog('直した文を消して、アプリの案にもどします。よろしいですか？', 'もどす', function () {
          var d = load(), s2 = d.students[k];
          if (!s2) return;
          s2.comment[len] = '';
          s2.comment.edited = !!(s2.comment.short || s2.comment.long);
          stampComment(s2.comment);
          save(d);
          render();
        });
      });
      foot.appendChild(undo);
      foot.appendChild(withIcon(button('', 'primary', function () { copyText(ta.value, ta); }), 'copy', 'コピー'));
      sec.appendChild(foot);
      sec.appendChild(h('p', 'cb-caution', 'この案は記録から作った下書きです。先生が確かめてから使ってください。'));
      var edited = cc.edited;
      var meta = st.comment.at ? { at: st.comment.at, by: st.comment.by } : null;
      var when = h('span', 'cb-com-when');
      foot.insertBefore(when, stat.nextSibling);
      function upd() {
        var A = assessApi(), n;
        try { n = A && typeof A.count === 'function' ? A.count(ta.value) : null; } catch (e) { n = null; }
        if (typeof n !== 'number') n = Array.from(ta.value.replace(/\s/g, '')).length;
        var want = A && A.RANGE && Array.isArray(A.RANGE[len]) ? A.RANGE[len] : (len === 'long' ? [100, 150] : [60, 80]);
        count.textContent = n + '字（目安 ' + want[0] + '〜' + want[1] + '字）';
        count.className = 'cb-com-count' + (n && (n < want[0] || n > want[1]) ? ' out' : '');
        stat.textContent = edited ? '先生が直した文（この端末に保存ずみ）' : (cc.draft ? 'アプリの案' : '案を作れませんでした。ここに書くこともできます');
        stat.className = 'cb-com-stat' + (edited ? ' edited' : '');
        when.textContent = edited || st.comment.edited ? editedLine(meta) : '';
        undo.hidden = !edited;
      }
      var tmr = null;
      function persist() {
        tmr = null;
        var d = load(), s2 = d.students[k];
        if (!s2) return;
        var v = ta.value;
        var nv = v.trim() && v.trim() !== cc.draft.trim() ? strMl(v, len === 'long' ? 1000 : 600) : '';
        if (nv !== s2.comment[len]) stampComment(s2.comment);
        s2.comment[len] = nv;
        s2.comment.edited = !!(s2.comment.short || s2.comment.long);
        edited = !!s2.comment[len];
        meta = s2.comment.at ? { at: s2.comment.at, by: s2.comment.by } : null;
        saveOrWarn(d);
        upd();
      }
      ta.addEventListener('input', function () {
        if (tmr) clearTimeout(tmr);
        tmr = setTimeout(persist, 400);
        timers.push(tmr);
        upd();
      });
      ta.addEventListener('blur', function () { if (tmr) { clearTimeout(tmr); persist(); } });
      upd();
      return sec;
    }

    render();
    return {
      destroy: function () {
        alive = false;
        timers.forEach(function (t) { clearTimeout(t); });
        root.removeEventListener('hashchange', onHash);
        root.removeEventListener('dragover', stopDrop);
        root.removeEventListener('drop', stopDrop);
        if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
      }
    };
  }

  /* ---------- 先生メニューの部品 ---------- */
  function teacherSection() {
    var sec = h('section', 'tcard cb-tcard');
    var hh = h('h2');
    withIcon(hh, 'constellation', 'クラスのきろく');
    sec.appendChild(hh);
    var db = load(), cls = classList(db), total = Object.keys(db.students).length;
    var line = total ? '取りこんだ人数：' + total + '人（' + cls.filter(function (c) { return studentsOf(db, c).length; }).map(function (c) { return c + '組 ' + studentsOf(db, c).length + '人'; }).join('・') + '）' : 'まだ取りこんでいません。';
    sec.appendChild(h('p', 'cb-tc-count', line));
    sec.appendChild(h('p', 'tnote', '子どもの学習のきろく・ふりかえりを組と番号で一覧にし、観点別評価の案・支援の提案・所見の案を見られます。CSV（Excel）に書き出したり、ファイルにしてほかの先生とやりとりしたりできます。'));
    sec.appendChild(link('クラスのきろくを開く ▶', 'btn primary', '#/classbook'));
    var how = h('div', 'cb-tc-how');
    how.appendChild(h('div', 'cb-tc-howtitle', 'Microsoft Forms で集めるとき'));
    var ol = h('ol', null);
    ['質問が1つ（「コードをはりつけてください」・長い回答）の Forms を作り、下にURLを入れます。',
      '子どもは、ふりかえりの「先生に送る」を押すとコードがコピーされ、Forms が開きます。貼りつけて送信します。',
      '先生は Forms の「回答」→「Excel で開く」でファイルを保存し、クラスのきろくに入れます。'
    ].forEach(function (t) { ol.appendChild(h('li', null, t)); });
    how.appendChild(ol);
    sec.appendChild(how);
    var row = h('div', 'cb-tc-url');
    var lab = h('label', 'cb-tc-urllabel', 'Forms のURL');
    var inp = h('input', 'cb-tc-input');
    inp.type = 'url';
    inp.placeholder = 'https://forms.office.com/…';
    inp.value = formsUrl();
    inp.id = 'cb-forms-url';
    lab.htmlFor = inp.id;
    var msg = h('span', 'cb-msg');
    msg.setAttribute('role', 'status');
    row.appendChild(lab);
    row.appendChild(inp);
    row.appendChild(button('保存', 'small', function () {
      var r = setFormsUrl(inp.value);
      if (r === 'bad') { msg.textContent = 'https:// ではじまるURLを入れてください。'; msg.className = 'cb-msg warn'; return; }
      msg.className = 'cb-msg good';
      if (!inp.value.trim()) msg.textContent = 'URLを消しました。';
      else if (r === 'goal') msg.textContent = 'ゴールに入れました。ゴールのコード・ゴール入りのアプリで子どもに届きます。';
      else msg.textContent = 'この端末に保存しました。ゴールを決めると、ゴールのコードに入れて配れます。';
    }));
    sec.appendChild(row);
    sec.appendChild(msg);
    // 先生の名前（任意）：評価・所見を直したときと、ファイルに保存したときに記録する
    var nrow = h('div', 'cb-tc-url cb-tc-name');
    var nlab = h('label', 'cb-tc-urllabel', '先生の名前（任意）');
    var ninp = h('input', 'cb-tc-input cb-tc-nameinput');
    ninp.type = 'text';
    ninp.maxLength = 20;
    ninp.placeholder = '例：山田';
    ninp.value = teacherName();
    ninp.id = 'cb-teacher-name';
    ninp.setAttribute('autocomplete', 'off');
    nlab.htmlFor = ninp.id;
    var nmsg = h('span', 'cb-msg');
    nmsg.setAttribute('role', 'status');
    nrow.appendChild(nlab);
    nrow.appendChild(ninp);
    nrow.appendChild(button('保存', 'small', function () {
      var ok = setTeacherName(ninp.value);
      ninp.value = teacherName();
      nmsg.className = 'cb-msg ' + (ok ? 'good' : 'warn');
      nmsg.textContent = !ok ? '保存できませんでした。' : ninp.value ? '「' + byLabel(ninp.value) + '」で記録します。' : '名前を消しました。';
    }));
    sec.appendChild(nrow);
    sec.appendChild(h('p', 'tnote cb-tc-namenote', '評価や所見を直したときに「11月24日に直しました（山田先生）」のように残ります。ファイルで受けわたすとき、だれが直したか分かります。'));
    sec.appendChild(nmsg);
    return sec;
  }

  var Classbook = {
    mount: hasDOM ? mount : function () { return { destroy: function () {} }; },
    importText: importText,
    importFiles: importFiles,
    exportCsv: exportCsv,
    teacherSection: hasDOM ? teacherSection : function () { return null; },
    formsUrl: formsUrl,
    setFormsUrl: setFormsUrl,
    exportBook: exportBook,
    parseBook: parseBook,
    importBook: importBook,
    teacherName: teacherName,
    setTeacherName: setTeacherName,
    count: function () { return Object.keys(load().students).length; },
    // テスト・つなぎ用
    _: { load: load, save: save, ingest: ingest, buildCsv: buildCsv, csvCell: csvCell, csvName: csvName, metrics: metrics,
      zipEntries: zipEntries, xmlText: xmlText, unescapeXml: unescapeXml, decodeText: decodeText, packInk: packInk, unpackInk: unpackInk,
      countBroken: countBroken, classComments: classComments, studentsOf: studentsOf, rosterSize: rosterSize, KEY: KEY,
      buildBook: buildBook, bookName: bookName, bookClasses: bookClasses, mergeStudent: mergeStudent, editedLine: editedLine, editMeta: editMeta }
  };
  S.Classbook = Classbook;
  if (typeof module === 'object' && module.exports) module.exports = Classbook;
})(typeof window !== 'undefined' ? window : globalThis);
