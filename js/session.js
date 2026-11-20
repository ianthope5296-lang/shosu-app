/* Shosu.Session — 「とちゅうから」の保存と復元（担当J）
 * localStorage 'shosu.session.<key>' に JSON で保存する。
 *   Session.save(key, state)   Session.load(key) -> state | null   Session.clear(key)
 *   Session.clearAll()         （先生メニューの「記録をすべて消す」用）
 *   Session.deviceId()         端末ごとのID（'shosu.deviceId'、英数字10文字）
 * key 例：'lesson-3'（各時のれんしゅう）, 'more-3'（もっとれんしゅう）, 'review-daisho', 'matome'
 * 書きかけの手書きは保存しない。答えた問題の結果と、出した問題そのもの（自動で作る問題）だけを保存する。
 */
(function (S) {
  'use strict';
  var PREFIX = 'shosu.session.';
  var mem = {};
  var ls = null;
  try {
    ls = window.localStorage;
    ls.setItem(PREFIX + '__t', '1');
    ls.removeItem(PREFIX + '__t');
  } catch (e) { ls = null; }

  function save(key, state) {
    if (!key) return false;
    var s;
    try { s = JSON.stringify({ v: 1, t: Date.now(), state: state }); } catch (e) { return false; }
    if (!ls) { mem[key] = s; return true; }
    try { ls.setItem(PREFIX + key, s); return true; }
    catch (e) { mem[key] = s; return false; } // 容量がいっぱいのときはメモリだけ
  }
  function load(key) {
    if (!key) return null;
    var s = null;
    try { s = ls ? ls.getItem(PREFIX + key) : null; } catch (e) { s = null; }
    if (s == null && mem[key] != null) s = mem[key];
    if (s == null) return null;
    try {
      var o = JSON.parse(s);
      return o && o.state != null ? o.state : null;
    } catch (e) { return null; }
  }
  function clear(key) {
    delete mem[key];
    try { if (ls) ls.removeItem(PREFIX + key); } catch (e) {}
  }
  function clearAll() {
    mem = {};
    if (!ls) return;
    try {
      for (var i = ls.length - 1; i >= 0; i--) {
        var k = ls.key(i);
        if (k && k.indexOf(PREFIX) === 0) ls.removeItem(k);
      }
    } catch (e) {}
  }

  // 端末ごとのID（初回に作って 'shosu.deviceId' に保存。clearAll では消さない）。
  // 作った問題に aid として入れ、ともだちの問題の「作った人」の区別と、自分の問題かどうかの判定に使う。
  var devId = null;
  function deviceId() {
    if (devId) return devId;
    var v = null;
    try { v = ls ? ls.getItem('shosu.deviceId') : null; } catch (e) { v = null; }
    if (!v || !/^[A-Za-z0-9]{8,16}$/.test(v)) {
      var c = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      var r = new Uint8Array(10);
      try { (window.crypto || window.msCrypto).getRandomValues(r); } catch (e) { for (var j = 0; j < r.length; j++) r[j] = Math.floor(Math.random() * 256); }
      v = '';
      for (var i = 0; i < r.length; i++) v += c.charAt(r[i] % c.length);
      try { if (ls) ls.setItem('shosu.deviceId', v); } catch (e) {}
    }
    devId = v;
    return v;
  }

  S.Session = { save: save, load: load, clear: clear, clearAll: clearAll, deviceId: deviceId };
})(window.Shosu = window.Shosu || {});
