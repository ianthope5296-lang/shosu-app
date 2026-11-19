/* Shosu.Store — 記録と設定の保存（localStorage、キー接頭辞 'shosu.'） */
(function (S) {
  'use strict';
  var PREFIX = 'shosu.';
  var DEFAULT_SETTINGS = { checkMode: 'auto', bigText: false };

  // localStorage が使えない環境（一部の file:// やプライベートモード）ではメモリに保存する
  var mem = {};
  var ls = null;
  try {
    ls = window.localStorage;
    var t = PREFIX + '__test';
    ls.setItem(t, '1');
    ls.removeItem(t);
  } catch (e) { ls = null; }

  function rawGet(k) {
    try { return ls ? ls.getItem(PREFIX + k) : (mem[k] === undefined ? null : mem[k]); }
    catch (e) { return null; }
  }
  function rawSet(k, v) {
    try { if (ls) ls.setItem(PREFIX + k, v); else mem[k] = v; } catch (e) { mem[k] = v; }
  }
  function getJSON(k, def) {
    var v = rawGet(k);
    if (v == null) return def;
    try { return JSON.parse(v); } catch (e) { return def; }
  }
  function setJSON(k, v) { rawSet(k, JSON.stringify(v)); }

  function getSettings() {
    var s = getJSON('settings', {});
    var out = {};
    for (var k in DEFAULT_SETTINGS) out[k] = DEFAULT_SETTINGS[k];
    for (var j in s) out[j] = s[j];
    return out;
  }
  function setSettings(obj) {
    var s = getSettings();
    for (var k in obj) s[k] = obj[k];
    setJSON('settings', s);
    return s;
  }

  // 記録は問題IDごとに「最新の結果」を持つ。読みまちがいの自己採点などで上書きできる。
  // rec.<key> = { entries: { pid: {correct, method, hints, n, t} } }
  function record(key, pid, r) {
    if (!key) return;
    pid = String(pid == null ? 'p' + Date.now() : pid);
    var data = getJSON('rec.' + key, { entries: {} });
    if (!data.entries) data.entries = {};
    var prev = data.entries[pid];
    data.entries[pid] = {
      correct: !!(r && r.correct),
      method: (r && r.method) === 'self' ? 'self' : 'auto',
      hints: Math.max(prev ? prev.hints || 0 : 0, (r && r.hints) || 0),
      n: (prev ? prev.n || 1 : 0) + 1, // 結果を受け取った回数
      t: Date.now()
    };
    setJSON('rec.' + key, data);
    var keys = getJSON('keys', []);
    if (keys.indexOf(key) < 0) { keys.push(key); setJSON('keys', keys); }
  }

  function stats(key) {
    var data = getJSON('rec.' + key, { entries: {} });
    var st = { tried: 0, correct: 0, auto: 0, self: 0, hints: 0, done: {} };
    var e = data.entries || {};
    for (var pid in e) {
      var r = e[pid];
      st.tried++;
      st.hints += r.hints || 0;
      st.done[pid] = !!r.correct;
      if (r.correct) {
        st.correct++;
        if (r.method === 'self') st.self++; else st.auto++;
      }
    }
    return st;
  }

  function keys() { return getJSON('keys', []).slice(); }

  function resetAll() {
    var ks = keys();
    for (var i = 0; i < ks.length; i++) {
      try { if (ls) ls.removeItem(PREFIX + 'rec.' + ks[i]); else delete mem['rec.' + ks[i]]; } catch (e) {}
    }
    // 念のため接頭辞 shosu.rec. のものをすべて消す（設定は残す）
    if (ls) {
      try {
        for (var j = ls.length - 1; j >= 0; j--) {
          var k = ls.key(j);
          if (k && k.indexOf(PREFIX + 'rec.') === 0) ls.removeItem(k);
        }
      } catch (e) {}
    } else {
      for (var m in mem) if (m.indexOf('rec.') === 0) delete mem[m];
    }
    setJSON('keys', []);
  }

  /* ---------- もんだいづくり：つくった問題（'shosu.my'）・もんだいボックス（'shosu.box'） ---------- */
  // 保存に失敗したとき（容量超過など）は例外を投げず false を返す。
  function trySetJSON(k, v) {
    var s;
    try { s = JSON.stringify(v); } catch (e) { return false; }
    if (!ls) { mem[k] = s; return true; }
    try { ls.setItem(PREFIX + k, s); return true; } catch (e) { return false; }
  }
  function getList(k) {
    var v = getJSON(k, []);
    return Array.isArray(v) ? v : [];
  }
  // 手書きの座標を小数第1位までにして容量を節約する（元の up は変えない）
  function compactInk(ink) {
    if (!ink || !Array.isArray(ink.strokes)) return ink || null;
    return {
      w: ink.w, h: ink.h,
      strokes: ink.strokes.map(function (st) {
        return (st || []).map(function (p) { return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; });
      })
    };
  }
  function compactUp(up) {
    if (!up || typeof up !== 'object') return up;
    var o = {};
    for (var k in up) if (Object.prototype.hasOwnProperty.call(up, k)) o[k] = up[k];
    if (o.author) o.author = compactInk(o.author);
    if (o.hint) o.hint = compactInk(o.hint);
    if (o.q) o.q = compactInk(o.q);
    return o;
  }

  function myList() { return getList('my'); }
  function mySave(up, id) {
    var list = getList('my');
    var now = Date.now();
    var item = null;
    if (id) for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) { item = list[i]; break; }
    if (item) {
      item.up = compactUp(up);
      item.updated = now;
    } else {
      id = id || ('my-' + now.toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36));
      item = { id: id, up: compactUp(up), created: now, updated: now };
      list.unshift(item);
    }
    return trySetJSON('my', list) ? id : false;
  }
  function myDelete(id) {
    var list = getList('my');
    var out = list.filter(function (x) { return !x || x.id !== id; });
    if (out.length === list.length) return false;
    return trySetJSON('my', out);
  }

  function boxList() { return getList('box'); }
  // items: [{token, up}]。重複（同じトークン）は除く。戻り値は追加した数（保存に失敗したら false）
  function boxAdd(items) {
    var list = getList('box');
    var have = {};
    list.forEach(function (x) { if (x && x.token) have[x.token] = 1; });
    var n = 0, now = Date.now();
    (items || []).forEach(function (it) {
      if (!it || typeof it.token !== 'string' || !it.token || have[it.token]) return;
      have[it.token] = 1;
      list.push({ token: it.token, up: compactUp(it.up), added: now });
      n++;
    });
    if (!n) return 0;
    return trySetJSON('box', list) ? n : false;
  }
  function boxRemove(token) {
    var list = getList('box');
    var out = list.filter(function (x) { return !x || x.token !== token; });
    if (out.length === list.length) return false;
    return trySetJSON('box', out);
  }
  function boxClear() { return trySetJSON('box', []); }

  S.Store = {
    getSettings: getSettings,
    setSettings: setSettings,
    record: record,
    stats: stats,
    keys: keys,
    resetAll: resetAll,
    myList: myList,
    mySave: mySave,
    myDelete: myDelete,
    boxList: boxList,
    boxAdd: boxAdd,
    boxRemove: boxRemove,
    boxClear: boxClear,
    persistent: !!ls
  };
})(window.Shosu = window.Shosu || {});
