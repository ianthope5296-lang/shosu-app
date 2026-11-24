/* Shosu.Share — 子どもが作った問題（UserProblem）をリンク用のトークンにする・もどす
 *
 * トークンの形： <版の文字 '1'> <本体 base64url> <チェック 5文字>
 *   本体 = deflate-raw( [インクの有無ビット 1byte][JSONの長さ varint][JSON(UTF-8)][インク…] )
 *   インク = [w varint][h varint][画数 varint] { [点数 varint] { dx, dy (zigzag varint) } }
 *     座標は欄の長い辺を 0..1023 に量子化し、直前の点（画をまたいで連続）からの差分で持つ。
 *   チェック = FNV-1a(版の文字+本体) の下位30ビットを base64url 5文字で。
 *     → 貼りつけた文章からトークンの終わりを見つける・こわれを見つけるのに使う。
 * 数は浮動小数を使わず、文字列と「1000倍した整数」で扱う。
 *
 * 追加4：トークン先頭の版の文字で種類を見分ける。
 *   '1' = 問題（UserProblem、今までどおり）  'g' = ゴール（Goal）  'r' = ふりかえり（Reflection）
 *   ゴール・ふりかえりの本体も同じ形（[インクの有無ビット][JSONの長さ][JSON][インク…] を deflate-raw）。
 *   リンクは '#/q/' '#/g/' '#/r/'。
 *
 * 追加6：'k' = 学習のきろく（{profile, summary}）、リンクは '#/k/'。
 *   問題は「作った人」を文字（authorName、30字まで）でも持てる（そのときは手書きの名前はなくてよい）。
 *   ふりかえりは profile:{cls,no,name} と summary（学習データのまとめ）を運べる。
 *   ゴールは formsUrl（Microsoft Forms などの https のURL、任意）を運べる。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};

  var VERSION = 1;
  var VCHAR = '1';
  var GOAL_CHAR = 'g';
  var REFL_CHAR = 'r';
  var REC_CHAR = 'k';
  var KIND_OF_CHAR = { '1': 'problem', g: 'goal', r: 'reflection', k: 'record' };
  var NAME_MAX = 30;          // 作った人の名前・プロフィールの名前（文字）
  var MAX_LEN = 6000;
  var GRID = 1023;            // 量子化の目の数（長い辺）
  var EPS_RATIO = 0.002;      // 間引きの許容誤差（長い辺に対して。800px なら 1.6px）
  var CHECK_LEN = 5;
  var MAX_INFLATE = 256 * 1024;
  var LIMIT = {               // 復元したインクの上限
    strokes: 600, pointsPerStroke: 2000, points: 20000, wh: 4096,
    rawStrokes: 2000, rawPoints: 200000   // encode 前（間引き前）の上限
  };
  var KINDS = ['hissan', 'fill', 'compare', 'masu', 'numberline'];
  var UNITS = ['L', 'm', 'km', 'kg', 'g', 'mL', 'cm', 'mm', 'こ', '倍', ''];
  var STEPS = ['1', '0.1', '0.01', '0.001'];
  var ARROW_LABELS = ['あ', 'い', 'う'];
  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var B64REV = {};
  for (var bi = 0; bi < 64; bi++) B64REV[B64.charAt(bi)] = bi;

  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  /* ---------- 数（文字列 ⇔ 1000倍の整数） ---------- */
  function numRe(maxInt) { return new RegExp('^(0|[1-9]\\d{0,' + (maxInt - 1) + '})(\\.\\d{1,3})?$'); }
  var NUM4 = numRe(4), NUM5 = numRe(5);
  function isNum(s, maxInt) { return typeof s === 'string' && (maxInt === 5 ? NUM5 : NUM4).test(s); }
  function toMilli(s) {
    var i = s.indexOf('.');
    var ip = i < 0 ? s : s.slice(0, i), dp = i < 0 ? '' : s.slice(i + 1);
    while (dp.length < 3) dp += '0';
    return parseInt(ip, 10) * 1000 + parseInt(dp, 10);
  }
  function fromMilli(m) {             // 正規形（末尾の0なし）
    var ip = Math.floor(m / 1000), dp = String(m % 1000);
    while (dp.length < 3) dp = '0' + dp;
    dp = dp.replace(/0+$/, '');
    return dp ? ip + '.' + dp : String(ip);
  }
  function decPlaces(s) { var i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; }
  function hissanAnswer(op, a, b) {   // problems.js の hissanAnswer と同じ考え方（正規形を返す）
    var r = op === '-' ? toMilli(a) - toMilli(b) : toMilli(a) + toMilli(b);
    return fromMilli(r);
  }

  /* ---------- インク ---------- */
  function isFiniteNum(x) { return typeof x === 'number' && isFinite(x); }
  function checkInk(ink, name, required) {
    if (ink == null) return required ? name + 'がありません' : null;
    if (typeof ink !== 'object') return name + 'の形が正しくありません';
    if (!isFiniteNum(ink.w) || !isFiniteNum(ink.h) || ink.w <= 0 || ink.h <= 0 || ink.w > LIMIT.wh || ink.h > LIMIT.wh) return name + 'の大きさが正しくありません';
    if (!Array.isArray(ink.strokes)) return name + 'の線が正しくありません';
    if (ink.strokes.length > LIMIT.rawStrokes) return name + 'の線が多すぎます';
    var total = 0, nonEmpty = 0;
    for (var i = 0; i < ink.strokes.length; i++) {
      var st = ink.strokes[i];
      if (!Array.isArray(st)) return name + 'の線が正しくありません';
      total += st.length;
      if (total > LIMIT.rawPoints) return name + 'の点が多すぎます';
      for (var j = 0; j < st.length; j++) {
        var p = st[j];
        if (!p || !isFiniteNum(p.x) || !isFiniteNum(p.y)) return name + 'の点が正しくありません';
      }
      if (st.length) nonEmpty++;
    }
    if (required && !nonEmpty) return name + 'が書かれていません';
    return null;
  }

  // Douglas–Peucker（くり返し版）。pts は {x,y} の配列。端の点は必ず残す。
  function dp(pts, eps) {
    var n = pts.length;
    if (n <= 2) return pts.slice();
    var keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    var stack = [0, n - 1], e2 = eps * eps;
    while (stack.length) {
      var b = stack.pop(), a = stack.pop();
      var ax = pts[a].x, ay = pts[a].y, dx = pts[b].x - ax, dy = pts[b].y - ay;
      var len2 = dx * dx + dy * dy, best = -1, bi = -1;
      for (var i = a + 1; i < b; i++) {
        var px = pts[i].x - ax, py = pts[i].y - ay, d2;
        if (len2 === 0) d2 = px * px + py * py;
        else {
          var t = (px * dx + py * dy) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          var ex = px - t * dx, ey = py - t * dy;
          d2 = ex * ex + ey * ey;
        }
        if (d2 > best) { best = d2; bi = i; }
      }
      if (best > e2) { keep[bi] = 1; stack.push(a, bi, bi, b); }
    }
    var out = [];
    for (var k = 0; k < n; k++) if (keep[k]) out.push(pts[k]);
    return out;
  }
  function simplify(ink, epsRatio) {
    if (!ink || !Array.isArray(ink.strokes)) return ink;
    var eps = Math.max(ink.w, ink.h) * (epsRatio == null ? EPS_RATIO : epsRatio);
    var strokes = [];
    ink.strokes.forEach(function (st) {
      if (!Array.isArray(st) || !st.length) return;
      strokes.push(dp(st, eps).map(function (p) { return { x: p.x, y: p.y }; }));
    });
    return { w: ink.w, h: ink.h, strokes: strokes };
  }
  function countPoints(ink) {
    var n = 0;
    if (ink && ink.strokes) ink.strokes.forEach(function (s) { n += s.length; });
    return n;
  }

  /* ---------- バイト列 ---------- */
  function Writer() { this.b = []; }
  Writer.prototype.u = function (v) {      // 符号なし varint
    v = Math.floor(v);
    while (v >= 0x80) { this.b.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    this.b.push(v);
  };
  Writer.prototype.z = function (v) { this.u(v < 0 ? -2 * v - 1 : 2 * v); };
  Writer.prototype.bytes = function (arr) { for (var i = 0; i < arr.length; i++) this.b.push(arr[i]); };

  function Reader(bytes) { this.b = bytes; this.p = 0; }
  Reader.prototype.u = function () {
    var v = 0, mul = 1;
    for (var i = 0; i < 5; i++) {
      if (this.p >= this.b.length) throw err('BAD_DATA', 'データが途中で切れています');
      var c = this.b[this.p++];
      v += (c & 0x7f) * mul;
      if (!(c & 0x80)) return v;
      mul *= 128;
    }
    throw err('BAD_DATA', '数が大きすぎます');
  };
  Reader.prototype.z = function () { var v = this.u(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  Reader.prototype.take = function (n) {
    if (this.p + n > this.b.length) throw err('BAD_DATA', 'データが途中で切れています');
    var r = this.b.subarray(this.p, this.p + n); this.p += n; return r;
  };

  function writeInk(w, ink, epsRatio) {
    var s = simplify(ink, epsRatio);
    var W = Math.max(1, Math.round(ink.w)), H = Math.max(1, Math.round(ink.h));
    var M = Math.max(W, H);
    var gw = Math.round(W / M * GRID), gh = Math.round(H / M * GRID);
    var strokes = [];
    s.strokes.forEach(function (st) {
      var q = [];
      st.forEach(function (p) {
        var x = Math.round(Math.min(Math.max(p.x, 0), W) / M * GRID);
        var y = Math.round(Math.min(Math.max(p.y, 0), H) / M * GRID);
        x = Math.min(x, gw); y = Math.min(y, gh);
        var last = q[q.length - 1];
        if (!last || last[0] !== x || last[1] !== y) q.push([x, y]);
      });
      if (q.length > LIMIT.pointsPerStroke) q = q.slice(0, LIMIT.pointsPerStroke);
      if (q.length) strokes.push(q);
    });
    w.u(W); w.u(H); w.u(strokes.length);
    var px = 0, py = 0;
    strokes.forEach(function (q) {
      w.u(q.length);
      q.forEach(function (pt) { w.z(pt[0] - px); w.z(pt[1] - py); px = pt[0]; py = pt[1]; });
    });
    return { strokes: strokes.length, points: countPoints({ strokes: strokes }) };
  }
  function readInk(r) {
    var W = r.u(), H = r.u(), n = r.u();
    if (W < 1 || H < 1 || W > LIMIT.wh || H > LIMIT.wh) throw err('BAD_DATA', '欄の大きさが正しくありません');
    if (n > LIMIT.strokes) throw err('BAD_DATA', '線が多すぎます');
    var M = Math.max(W, H), k = M / GRID;
    var gw = Math.round(W / M * GRID), gh = Math.round(H / M * GRID);
    var strokes = [], px = 0, py = 0, total = 0;
    for (var i = 0; i < n; i++) {
      var m = r.u();
      if (m < 1 || m > LIMIT.pointsPerStroke) throw err('BAD_DATA', '線の点の数が正しくありません');
      total += m;
      if (total > LIMIT.points) throw err('BAD_DATA', '点が多すぎます');
      var st = [];
      for (var j = 0; j < m; j++) {
        px += r.z(); py += r.z();
        if (px < 0 || py < 0 || px > gw || py > gh) throw err('BAD_DATA', '線が欄の外にあります');
        st.push({ x: Math.round(px * k * 100) / 100, y: Math.round(py * k * 100) / 100 });
      }
      strokes.push(st);
    }
    return { w: W, h: H, strokes: strokes };
  }

  /* ---------- base64url・チェック ---------- */
  function b64enc(bytes) {
    var out = '', i;
    for (i = 0; i + 2 < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
    }
    var rest = bytes.length - i;
    if (rest === 1) { var a = bytes[i] << 16; out += B64[a >> 18] + B64[(a >> 12) & 63]; }
    else if (rest === 2) { var c = (bytes[i] << 16) | (bytes[i + 1] << 8); out += B64[c >> 18] + B64[(c >> 12) & 63] + B64[(c >> 6) & 63]; }
    return out;
  }
  function b64dec(str) {
    if (str.length % 4 === 1) throw err('BAD_TOKEN', '長さが正しくありません');
    var out = new Uint8Array(Math.floor(str.length * 3 / 4)), o = 0, buf = 0, bits = 0;
    for (var i = 0; i < str.length; i++) {
      var v = B64REV[str.charAt(i)];
      if (v === undefined) throw err('BAD_TOKEN', '使えない文字があります');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (buf >> bits) & 255; }
    }
    return out.subarray(0, o);
  }
  function checksum(str) {             // FNV-1a 32bit → 下位30ビット → 5文字
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return checkChars(h);
  }
  function checkChars(h) {
    var s = '';
    for (var i = 0; i < CHECK_LEN; i++) { s = B64[h & 63] + s; h = h >>> 6; }
    return s;
  }

  /* ---------- 圧縮 ---------- */
  async function pump(stream, bytes, cap) {
    var writer = stream.writable.getWriter();
    writer.write(bytes).catch(function () {});
    writer.close().catch(function () {});
    var reader = stream.readable.getReader(), chunks = [], total = 0;
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      total += r.value.length;
      if (cap && total > cap) { try { reader.cancel(); } catch (e) {} throw err('BAD_DATA', 'データが大きすぎます'); }
      chunks.push(r.value);
    }
    var out = new Uint8Array(total), o = 0;
    chunks.forEach(function (c) { out.set(c, o); o += c.length; });
    return out;
  }
  function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return Promise.reject(err('NO_COMPRESSION', 'このブラウザでは使えません'));
    return pump(new CompressionStream('deflate-raw'), bytes, 0);
  }
  function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return Promise.reject(err('NO_COMPRESSION', 'このブラウザでは使えません'));
    return pump(new DecompressionStream('deflate-raw'), bytes, MAX_INFLATE).catch(function (e) {
      throw e && e.code ? e : err('BAD_DATA', 'データがこわれています');
    });
  }

  /* ---------- 検証 ---------- */
  function intIn(v, lo, hi) { return typeof v === 'number' && Math.floor(v) === v && v >= lo && v <= hi; }

  function validate(up) {
    function no(msg) { return { ok: false, error: msg }; }
    if (!up || typeof up !== 'object') return no('問題がありません');
    if (up.v !== VERSION) return no('形式の版が正しくありません');
    if (KINDS.indexOf(up.kind) < 0) return no('問題の種類が正しくありません');
    var hasName = up.authorName != null;
    if (hasName && !isText(up.authorName, NAME_MAX)) return no('作った人の名前は1〜' + NAME_MAX + '文字です');
    var e = checkInk(up.author, '名前', !hasName) || checkInk(up.hint, 'ヒント', false);
    if (e) return no(e);
    switch (up.kind) {
      case 'hissan':
        if (up.op !== '+' && up.op !== '-') return no('たし算かひき算かが正しくありません');
        if (!isNum(up.a, 4) || !isNum(up.b, 4)) return no('数の書き方が正しくありません（小数第三位まで）');
        if (up.op === '-' && toMilli(up.a) < toMilli(up.b)) return no('答えが0より小さくなるひき算は作れません');
        break;
      case 'fill':
        e = checkInk(up.q, '問題文', true);
        if (e) return no(e);
        if (!isNum(up.answer, 5)) return no('答えの書き方が正しくありません（小数第三位まで）');
        if (UNITS.indexOf(up.unit) < 0) return no('単位が正しくありません');
        break;
      case 'compare':
        if (!isNum(up.a, 4) || !isNum(up.b, 4)) return no('数の書き方が正しくありません（小数第三位まで）');
        break;
      case 'masu':
        if (up.level !== 2 && up.level !== 3) return no('ますの種類が正しくありません');
        if (!intIn(up.L, 0, 9) || !intIn(up.d1, 0, 9) || !intIn(up.d2, 0, 9)) return no('ますの数は0〜9です');
        var d3 = up.d3 == null ? 0 : up.d3;
        if (!intIn(d3, 0, 9)) return no('ますの数は0〜9です');
        if (up.level === 2 && d3 !== 0) return no('0.001Lのますは使えません');
        break;
      case 'numberline':
        if (!isNum(up.min, 4) || !isNum(up.max, 4) || STEPS.indexOf(up.step) < 0) return no('数直線のはんいが正しくありません');
        var mn = toMilli(up.min), mx = toMilli(up.max), st = toMilli(up.step);
        if (mx <= mn || mn % st || mx % st) return no('数直線のはんいが正しくありません');
        var ticks = (mx - mn) / st;
        if (ticks < 2 || ticks > 200) return no('数直線の目もりの数が正しくありません');
        if (!intIn(up.labelEvery, 1, 100)) return no('数直線の目もりの数が正しくありません');
        if (!Array.isArray(up.arrows) || up.arrows.length < 1 || up.arrows.length > 3) return no('↑は1〜3本です');
        var seen = {};
        for (var i = 0; i < up.arrows.length; i++) {
          var a = up.arrows[i];
          if (!isNum(a, 4)) return no('↑の数が正しくありません');
          var v = toMilli(a);
          if (v < mn || v > mx || (v - mn) % st) return no('↑が目もりの上にありません');
          if (seen[v]) return no('同じ目もりに↑が2本あります');
          seen[v] = 1;
        }
        break;
    }
    return { ok: true, error: null };
  }

  /* ---------- JSON 部分（インク以外） ---------- */
  function fieldsOf(up) {
    var o = { v: VERSION, kind: up.kind };
    switch (up.kind) {
      case 'hissan': o.op = up.op; o.a = up.a; o.b = up.b; break;
      case 'fill': o.answer = up.answer; o.unit = up.unit; break;
      case 'compare': o.a = up.a; o.b = up.b; break;
      case 'masu': o.level = up.level; o.L = up.L; o.d1 = up.d1; o.d2 = up.d2; o.d3 = up.d3 == null ? 0 : up.d3; break;
      case 'numberline': o.min = up.min; o.max = up.max; o.step = up.step; o.labelEvery = up.labelEvery; o.arrows = up.arrows.slice(); break;
    }
    if (isAid(up.aid)) o.aid = up.aid; // 作った端末のID（任意）
    if (typeof up.authorName === 'string' && up.authorName.trim()) o.authorName = up.authorName.trim(); // 作った人（文字。追加6）
    return o;
  }
  function isAid(a) { return typeof a === 'string' && /^[A-Za-z0-9]{8,16}$/.test(a); }
  var KEYS = { hissan: ['op', 'a', 'b'], fill: ['answer', 'unit'], compare: ['a', 'b'],
    masu: ['level', 'L', 'd1', 'd2', 'd3'], numberline: ['min', 'max', 'step', 'labelEvery', 'arrows'] };
  function hasStrokes(ink) {
    return !!(ink && ink.strokes && ink.strokes.some(function (s) { return s && s.length; }));
  }

  /* ---------- encode / decode ---------- */
  async function encode(up) {
    var r = validate(up);
    if (!r.ok) throw err('INVALID', r.error);
    var inks = [hasStrokes(up.author) ? up.author : null, hasStrokes(up.hint) ? up.hint : null, up.kind === 'fill' ? up.q : null];
    var mask = 0;
    inks.forEach(function (ink, i) { if (ink) mask |= 1 << i; });
    var json = new TextEncoder().encode(JSON.stringify(fieldsOf(up)));
    var w = new Writer();
    w.b.push(mask);
    w.u(json.length);
    w.bytes(json);
    inks.forEach(function (ink) { if (ink) writeInk(w, ink); });
    var comp = await deflate(new Uint8Array(w.b));
    var body = VCHAR + b64enc(comp);
    var token = body + checksum(body);
    if (token.length > MAX_LEN) {
      var e = err('TOO_LONG', 'リンクが長すぎます（' + token.length + '文字）');
      e.length = token.length; e.max = MAX_LEN;
      throw e;
    }
    return token;
  }

  function cleanToken(t) {
    if (typeof t !== 'string') throw err('BAD_TOKEN', 'トークンがありません');
    var m = /(?:#|%23)\/[qgrk]\//i.exec(t);
    if (m) t = t.slice(m.index + m[0].length);
    t = t.replace(/[\s​-‍﻿]/g, '');
    return t;
  }

  async function decode(token) {
    var t = cleanToken(token);
    if (t.length < 1 + CHECK_LEN + 2) throw err('BAD_TOKEN', 'リンクが短すぎます');
    if (t.length > MAX_LEN + 64) throw err('TOO_LONG', 'リンクが長すぎます');
    if (t.charAt(0) !== VCHAR) {
      if (KIND_OF_CHAR[t.charAt(0)]) throw err('WRONG_KIND', '問題のコードではありません');
      if (/^[0-9]$/.test(t.charAt(0))) throw err('BAD_VERSION', '新しい版のアプリで作られた問題です');
      throw err('BAD_TOKEN', 'リンクの形が正しくありません');
    }
    var body = t.slice(0, t.length - CHECK_LEN);
    if (checksum(body) !== t.slice(t.length - CHECK_LEN)) throw err('BAD_CHECKSUM', 'リンクがこわれています');
    var raw = await inflate(b64dec(body.slice(1)));
    var rd = new Reader(raw);
    var mask = rd.u();
    if (mask > 7) throw err('BAD_DATA', 'データがこわれています');
    var jlen = rd.u();
    var f;
    try { f = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rd.take(jlen))); }
    catch (e) { throw e.code ? e : err('BAD_DATA', 'データがこわれています'); }
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw err('BAD_DATA', 'データがこわれています');
    if (f.v !== VERSION) throw err('BAD_VERSION', '形式の版が正しくありません');
    if (KINDS.indexOf(f.kind) < 0) throw err('INVALID', '問題の種類が正しくありません');
    if (f.kind === 'fill' && !(mask & 4)) throw err('INVALID', '問題文がありません');
    if (f.kind !== 'fill' && (mask & 4)) throw err('BAD_DATA', 'データがこわれています');
    if (!(mask & 1) && typeof f.authorName !== 'string') throw err('BAD_DATA', 'データがこわれています');
    var author = mask & 1 ? readInk(rd) : null;
    var hint = mask & 2 ? readInk(rd) : null;
    var q = mask & 4 ? readInk(rd) : null;
    if (rd.p !== raw.length) throw err('BAD_DATA', 'データのあとに余分なものがあります');
    if (countPoints(author) + countPoints(hint) + countPoints(q) > LIMIT.points) throw err('BAD_DATA', '点が多すぎます');

    var up = { v: VERSION, kind: f.kind };
    KEYS[f.kind].forEach(function (k) { up[k] = own(f, k) ? f[k] : undefined; });
    if (up.kind === 'numberline') up.arrows = Array.isArray(f.arrows) ? f.arrows.slice() : null;
    if (up.kind === 'fill') up.q = q;
    if (isAid(f.aid)) up.aid = f.aid;
    if (own(f, 'authorName')) up.authorName = f.authorName;
    up.author = author;
    up.hint = hint;
    var r = validate(up);
    if (!r.ok) throw err('INVALID', r.error);
    Object.defineProperty(up, '_token', { value: t, enumerable: false });
    return up;
  }

  /* ---------- リンク ---------- */
  // http(s) で開いているときはURL。HTMLファイル（file://）で開いているときは、
  // ほかの端末では開けないので「問題コード」（#/q/… を含む文）にする。
  // どちらも extractTokens で取り出せるので、ホームの「もらった問題をひらく」やもんだいボックスに貼れる。
  function url(token) {
    var href = (typeof location !== 'undefined' && location && location.href) ? String(location.href) : '';
    if (/^https?:/i.test(href)) return href.split('#')[0] + '#/q/' + token;
    return 'しょうすうもんだい #/q/' + token;
  }

  // 貼りつけた文章からトークンを取り出す。
  //  ・'#/q/'（または '%23/q/'）の後ろを、空白・改行・ゼロ幅文字をとばしながら読む
  //  ・チェック文字が合う長さで切る（できれば、その後ろが空白や記号になっている所）
  function isTokChar(c) { return B64REV[c] !== undefined; }
  function extractTokens(text) {
    if (typeof text !== 'string' || !text) return [];
    var out = [], seen = {};
    var re = /(?:#|%23)\/[qgrk]\//gi, m;
    while ((m = re.exec(text))) {
      var i = m.index + m[0].length;
      var chars = [], gapAfter = [];
      while (i < text.length && chars.length < MAX_LEN + 8) {
        var c = text.charAt(i);
        if (isTokChar(c)) { chars.push(c); gapAfter.push(false); i++; continue; }
        if (/[\s​-‍﻿　]/.test(c)) {
          if (chars.length) gapAfter[chars.length - 1] = true;
          i++; continue;
        }
        break;                                    // 句読点・> ・) など
      }
      if (chars.length) gapAfter[chars.length - 1] = true;   // 末尾は区切り
      var s = chars.join(''), found = -1, fallback = -1;
      if (KIND_OF_CHAR[s.charAt(0)]) {
        var h = 0x811c9dc5;
        for (var n = 0; n < s.length; n++) {
          // s[0..n) が本体のときチェックは s[n..n+5)
          if (n >= 3 && n + CHECK_LEN <= s.length && s.substr(n, CHECK_LEN) === checkChars(h)) {
            if (gapAfter[n + CHECK_LEN - 1]) { found = n + CHECK_LEN; break; }
            if (fallback < 0) fallback = n + CHECK_LEN;
          }
          h ^= s.charCodeAt(n); h = Math.imul(h, 0x01000193) >>> 0;
        }
      }
      var len = found >= 0 ? found : fallback;
      if (len > 0) {
        var tok = s.slice(0, len);
        if (!seen[tok]) { seen[tok] = 1; out.push(tok); }
      }
      re.lastIndex = Math.max(re.lastIndex, m.index + m[0].length);
    }
    return out;
  }

  /* ---------- 問題の形に変換 ---------- */
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }
  function masuAnswer(up) {
    return fromMilli(up.L * 1000 + up.d1 * 100 + up.d2 * 10 + (up.level === 3 ? (up.d3 || 0) : 0));
  }
  function compareAnswer(a, b) {
    var x = toMilli(a), y = toMilli(b);
    return x > y ? '>' : x < y ? '<' : '=';
  }
  function toProblem(up, token) {
    var tok = token || up._token;
    var p;
    switch (up.kind) {
      case 'fill':
        p = { type: 'fill', parts: up.unit ? [{ a: up.answer }, up.unit] : [{ a: up.answer }], qInk: up.q };
        break;
      case 'masu':
        var fig = { kind: 'masu', unit: 'L', L: up.L, d1: up.d1, d2: up.d2, level: up.level };
        if (up.level === 3) fig.d3 = up.d3 || 0;
        p = { type: 'fill', q: 'かさは何Lですか。', fig: fig, parts: [{ a: masuAnswer(up) }, 'L'] };
        break;
      case 'numberline':
        var parts = [];
        up.arrows.forEach(function (a, i) {
          parts.push(i ? '  ' + ARROW_LABELS[i] : ARROW_LABELS[i]);
          parts.push({ a: fromMilli(toMilli(a)) });
        });
        p = { type: 'fill', q: '↑の目もりを読みましょう。', parts: parts,
          fig: { kind: 'numberline', min: Number(up.min), max: Number(up.max), step: Number(up.step), labelEvery: up.labelEvery,
            arrows: up.arrows.map(function (a, i) { return { v: Number(a), label: ARROW_LABELS[i] }; }) } };
        break;
      case 'compare':
        p = { type: 'choice', q: up.a + ' □ ' + up.b + '　□にあてはまる不等号は？', options: ['>', '<', '='], a: compareAnswer(up.a, up.b) };
        break;
      case 'hissan':
        p = { type: 'hissan', op: up.op, a: up.a, b: up.b };
        break;
      default:
        throw err('INVALID', '問題の種類が正しくありません');
    }
    p.id = 'friend-' + (tok ? tok.slice(0, 16) : 'h' + fnv(JSON.stringify(fieldsOf(up))));
    p.tag = 'friend';
    if (!p.qInk) p.qInk = null;
    p.hintInk = up.hint || null;
    p.authorInk = hasStrokes(up.author) ? up.author : null;
    p.authorName = typeof up.authorName === 'string' && up.authorName ? up.authorName : null;
    return p;
  }
  function answerText(up) {
    switch (up.kind) {
      case 'fill': return up.answer + (up.unit || '');
      case 'masu': return masuAnswer(up) + 'L';
      case 'numberline':
        return up.arrows.map(function (a, i) { return ARROW_LABELS[i] + ' ' + fromMilli(toMilli(a)); }).join('　');
      case 'compare': return up.a + ' ' + compareAnswer(up.a, up.b) + ' ' + up.b;
      case 'hissan': return hissanAnswer(up.op, up.a, up.b);
    }
    return '';
  }

  /* ==========================================================
   * 追加4：ゴールのコード（'g'）・ふりかえりのコード（'r'）
   * ========================================================== */
  var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var EVALS = ['double', 'single', 'triangle'];
  var GLIMIT = { name: 30, classes: 120, note: 40, minMin: 5, minMax: 90, lessonMax: 20 };
  var RLIMIT = { choices: 10, choiceLen: 120, auto: 24, autoLen: 120, extra: 12, extraLen: 60, items: 10, itemLen: 40 };
  var REFL_EPS = [EPS_RATIO, 0.004, 0.007, 0.012, 0.02];   // 長すぎたら、だんだん強く間引く

  function isDate(s) {
    if (typeof s !== 'string') return false;
    var m = DATE_RE.exec(s);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return false;
    var dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return d <= dim;
  }
  function badChars(s) { return /[\u0000-\u001f\u007f\u2028\u2029]/.test(s); }
  function isText(s, max, allowEmpty) {
    return typeof s === 'string' && (allowEmpty || s.trim().length > 0) && s.length <= max && !badChars(s);
  }
  function isIso(s) { return typeof s === 'string' && s.length <= 40 && !badChars(s) && !isNaN(Date.parse(s)); }

  /* ---------- 共通：JSON＋インク → トークン ---------- */
  async function packToken(vchar, fields, inks, epsRatio) {
    var mask = 0;
    inks.forEach(function (ink, i) { if (ink) mask |= 1 << i; });
    var json = new TextEncoder().encode(JSON.stringify(fields));
    var w = new Writer();
    w.b.push(mask);
    w.u(json.length);
    w.bytes(json);
    inks.forEach(function (ink) { if (ink) writeInk(w, ink, epsRatio); });
    var comp = await deflate(new Uint8Array(w.b));
    var body = vchar + b64enc(comp);
    return body + checksum(body);
  }
  function tooLong(len) {
    var e = err('TOO_LONG', 'コードが長すぎます（' + len + '文字）');
    e.length = len; e.max = MAX_LEN;
    return e;
  }
  async function unpackToken(token, vchar, nInks, label) {
    var t = cleanToken(token);
    if (t.length < 1 + CHECK_LEN + 2) throw err('BAD_TOKEN', 'コードが短すぎます');
    if (t.length > MAX_LEN + 64) throw err('TOO_LONG', 'コードが長すぎます');
    var c = t.charAt(0);
    if (c !== vchar) {
      if (KIND_OF_CHAR[c]) throw err('WRONG_KIND', label + 'のコードではありません');
      throw err('BAD_TOKEN', 'コードの形が正しくありません');
    }
    var body = t.slice(0, t.length - CHECK_LEN);
    if (checksum(body) !== t.slice(t.length - CHECK_LEN)) throw err('BAD_CHECKSUM', 'コードがこわれています');
    var raw = await inflate(b64dec(body.slice(1)));
    var rd = new Reader(raw);
    var mask = rd.u();
    if (mask >= (1 << nInks)) throw err('BAD_DATA', 'データがこわれています');
    var jlen = rd.u();
    var f;
    try { f = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rd.take(jlen))); }
    catch (e) { throw e.code ? e : err('BAD_DATA', 'データがこわれています'); }
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw err('BAD_DATA', 'データがこわれています');
    var inks = [], total = 0;
    for (var i = 0; i < nInks; i++) {
      var ink = mask & (1 << i) ? readInk(rd) : null;
      total += countPoints(ink);
      inks.push(ink);
    }
    if (rd.p !== raw.length) throw err('BAD_DATA', 'データのあとに余分なものがあります');
    if (total > LIMIT.points) throw err('BAD_DATA', '点が多すぎます');
    return { t: t, f: f, inks: inks };
  }

  /* ---------- Forms のURL（追加6） ---------- */
  // https のみ。Microsoft Forms（と Google フォーム）のURLだけを通す（子どもの端末で開くので）
  var FORMS_HOSTS = ['forms.office.com', 'forms.microsoft.com', 'forms.cloud.microsoft', 'forms.office365.us', 'forms.osi.office365.us', 'forms.gle', 'docs.google.com'];
  function isFormsUrl(u) {
    if (typeof u !== 'string' || u.length > 400 || badChars(u) || /\s/.test(u)) return false;
    var m = /^https:\/\/([A-Za-z0-9.-]+)(?::443)?(\/[^\s"'<>\\]*)?$/.exec(u);
    if (!m) return false;
    var host = m[1].toLowerCase(), path = m[2] || '/';
    var ok = FORMS_HOSTS.some(function (hh) { return host === hh || (hh !== 'docs.google.com' && hh !== 'forms.gle' && host.slice(-hh.length - 1) === '.' + hh); });
    if (!ok) return false;
    if (host === 'docs.google.com' && path.indexOf('/forms/') !== 0) return false;
    return true;
  }

  /* ---------- ゴール ---------- */
  // Goal = { v:1, id, name, date, classes:[{date, minutes, lesson?, note?}], created, formsUrl? }
  function validateGoal(g) {
    function no(msg) { return { ok: false, error: msg }; }
    if (!g || typeof g !== 'object' || Array.isArray(g)) return no('ゴールがありません');
    if (g.v !== 1) return no('形式の版が正しくありません');
    if (typeof g.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(g.id)) return no('ゴールのIDが正しくありません');
    if (!isText(g.name, GLIMIT.name)) return no('ゴールの名前は1〜' + GLIMIT.name + '文字です');
    if (!isDate(g.date)) return no('ゴールの日にちが正しくありません');
    if (g.created != null && !isIso(g.created)) return no('作った日時が正しくありません');
    if (g.formsUrl != null && g.formsUrl !== '' && !isFormsUrl(g.formsUrl)) return no('FormsのURLが正しくありません（https://forms.office.com/ などのURL）');
    var cls = g.classes == null ? [] : g.classes;
    if (!Array.isArray(cls)) return no('授業の予定が正しくありません');
    if (cls.length > GLIMIT.classes) return no('授業の予定が多すぎます');
    var seen = {};
    for (var i = 0; i < cls.length; i++) {
      var c = cls[i];
      if (!c || typeof c !== 'object') return no('授業の予定が正しくありません');
      if (!isDate(c.date)) return no('授業の日にちが正しくありません');
      if (c.date > g.date) return no('授業の日がゴールの日より後です');
      if (seen[c.date]) return no('同じ日の授業が2つあります');
      seen[c.date] = 1;
      if (!intIn(c.minutes, GLIMIT.minMin, GLIMIT.minMax)) return no('1回の授業の時間は' + GLIMIT.minMin + '〜' + GLIMIT.minMax + '分です');
      if (c.lesson != null && !intIn(c.lesson, 1, GLIMIT.lessonMax)) return no('第○時の数が正しくありません');
      if (c.note != null && !isText(c.note, GLIMIT.note, true)) return no('授業のメモは' + GLIMIT.note + '文字までです');
    }
    return { ok: true, error: null };
  }
  function normGoal(g) {
    var o = { v: 1, id: g.id, name: g.name.trim(), date: g.date, classes: [] };
    (g.classes || []).forEach(function (c) {
      var x = { date: c.date, minutes: c.minutes };
      if (c.lesson != null) x.lesson = c.lesson;
      if (c.note) x.note = c.note;
      o.classes.push(x);
    });
    o.classes.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    if (g.created != null) o.created = g.created;
    if (isFormsUrl(g.formsUrl)) o.formsUrl = g.formsUrl;
    return o;
  }
  async function encodeGoal(g) {
    var r = validateGoal(g);
    if (!r.ok) throw err('INVALID', r.error);
    var token = await packToken(GOAL_CHAR, normGoal(g), [], EPS_RATIO);
    if (token.length > MAX_LEN) throw tooLong(token.length);
    return token;
  }
  async function decodeGoal(token) {
    var u = await unpackToken(token, GOAL_CHAR, 0, 'ゴール');
    var r = validateGoal(u.f);
    if (!r.ok) throw err('INVALID', r.error);
    var g = normGoal(u.f);
    Object.defineProperty(g, '_token', { value: u.t, enumerable: false });
    return g;
  }

  /* ---------- ふりかえり ---------- */
  // Reflection = { v:1, date, name:Ink|null, meate:{choices,ink}, y:{auto:[text], extra:[text]},
  //               w:{eval:'double'|'single'|'triangle', choices:[text], ink}, t:{choices:[text], ink, items:[itemId]}, aid, saved:'ISO' }
  //   aid が正しい形でないときは、こばまずに入れないだけ（端末のIDは任意）。
  //   追加6：profile:{cls,no,name}（任意）, summary:LearnSummary（任意。数字中心の小さなJSON）
  function textList(a, maxN, maxLen, what) {
    if (a == null) return null;
    if (!Array.isArray(a)) return what + 'が正しくありません';
    if (a.length > maxN) return what + 'が多すぎます';
    for (var i = 0; i < a.length; i++) if (!isText(a[i], maxLen)) return what + 'の文が正しくありません（' + maxLen + '文字まで）';
    return null;
  }
  function part(o) { return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  function validateReflection(r) {
    function no(msg) { return { ok: false, error: msg }; }
    if (!r || typeof r !== 'object' || Array.isArray(r)) return no('ふりかえりがありません');
    if (r.v !== 1) return no('形式の版が正しくありません');
    if (!isDate(r.date)) return no('ふりかえりの日にちが正しくありません');
    var keys = ['meate', 'y', 'w', 't'];
    for (var i = 0; i < keys.length; i++) {
      var x = r[keys[i]];
      if (x != null && (typeof x !== 'object' || Array.isArray(x))) return no('ふりかえりの形が正しくありません');
    }
    var m = part(r.meate), y = part(r.y), w = part(r.w), t = part(r.t);
    var e = checkInk(r.name, '名前', false) || checkInk(m.ink, 'めあて', false) ||
      checkInk(w.ink, 'わかったこと', false) || checkInk(t.ink, '次にやりたいこと', false) ||
      textList(m.choices, RLIMIT.choices, RLIMIT.choiceLen, 'めあて') ||
      textList(y.auto, RLIMIT.auto, RLIMIT.autoLen, 'やったこと') ||
      textList(y.extra, RLIMIT.extra, RLIMIT.extraLen, 'やったこと') ||
      textList(w.choices, RLIMIT.choices, RLIMIT.choiceLen, 'わかったこと') ||
      textList(t.choices, RLIMIT.choices, RLIMIT.choiceLen, '次にやりたいこと') ||
      textList(t.items, RLIMIT.items, RLIMIT.itemLen, '次にやりたいこと');
    if (e) return no(e);
    if (w.eval != null && EVALS.indexOf(w.eval) < 0) return no('自己評価が正しくありません');
    if (r.saved != null && !isIso(r.saved)) return no('書いた日時が正しくありません');
    if (r.profile != null && !isProfile(r.profile)) return no('組・番号・名前が正しくありません');
    if (r.summary != null) { var se = checkSummary(r.summary); if (se) return no(se); }
    return { ok: true, error: null };
  }

  /* ---------- プロフィール・学習データのまとめ（追加6） ---------- */
  function isProfile(p) {
    return !!p && typeof p === 'object' && !Array.isArray(p) && intIn(p.cls, 1, 9) && intIn(p.no, 1, 45) && isText(p.name, NAME_MAX) && !/[<>]/.test(p.name);
  }
  function normProfile(p) { return { cls: p.cls, no: p.no, name: p.name.trim() }; }
  // summary は形をしばりすぎない（担当R・Sがあとから項目を足せるように）。ただし JSON の小さな値だけ
  var SLIMIT = { depth: 5, nodes: 1500, str: 60, keyLen: 40, arr: 40, json: 12000 };
  function checkSummary(sm) {
    if (!sm || typeof sm !== 'object' || Array.isArray(sm)) return '学習のまとめがありません';
    if (sm.v !== 1) return '学習のまとめの版が正しくありません';
    var nodes = 0, bad = null;
    (function walk(x, d) {
      if (bad) return;
      if (++nodes > SLIMIT.nodes) { bad = '学習のまとめが大きすぎます'; return; }
      if (x === null || typeof x === 'boolean') return;
      if (typeof x === 'number') { if (!isFinite(x)) bad = '学習のまとめの数が正しくありません'; return; }
      if (typeof x === 'string') { if (x.length > SLIMIT.str || badChars(x)) bad = '学習のまとめの文字が正しくありません'; return; }
      if (d >= SLIMIT.depth) { bad = '学習のまとめの形が深すぎます'; return; }
      if (Array.isArray(x)) { if (x.length > SLIMIT.arr) { bad = '学習のまとめが大きすぎます'; return; } x.forEach(function (y) { walk(y, d + 1); }); return; }
      if (typeof x !== 'object') { bad = '学習のまとめの形が正しくありません'; return; }
      Object.keys(x).forEach(function (k) {
        if (k.length > SLIMIT.keyLen || badChars(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') { bad = '学習のまとめの形が正しくありません'; return; }
        walk(x[k], d + 1);
      });
    })(sm, 0);
    if (bad) return bad;
    if (sm.profile != null && !isProfile(sm.profile)) return '学習のまとめの組・番号・名前が正しくありません';
    if (sm.at != null && !isIso(sm.at)) return '学習のまとめの日時が正しくありません';
    try { if (JSON.stringify(sm).length > SLIMIT.json) return '学習のまとめが大きすぎます'; } catch (e) { return '学習のまとめの形が正しくありません'; }
    return null;
  }
  function copyJSON(x) { return JSON.parse(JSON.stringify(x)); }
  function inkOrNull(ink) { return hasStrokes(ink) ? ink : null; }
  function reflFields(r) {
    var m = part(r.meate), y = part(r.y), w = part(r.w), t = part(r.t);
    var o = { v: 1, date: r.date,
      meate: { choices: (m.choices || []).slice() },
      y: { auto: (y.auto || []).slice(), extra: (y.extra || []).slice() },
      w: { eval: w.eval || null, choices: (w.choices || []).slice() },
      t: { choices: (t.choices || []).slice() } };
    if (Array.isArray(t.items) && t.items.length) o.t.items = t.items.slice();
    if (isAid(r.aid)) o.aid = r.aid;
    if (typeof r.saved === 'string' && isIso(r.saved)) o.saved = r.saved;
    if (isProfile(r.profile)) o.profile = normProfile(r.profile);
    if (r.summary != null && !checkSummary(r.summary)) o.summary = copyJSON(r.summary);
    if (r.cut) o.cut = 1;   // 長すぎたので手書きを落とした印
    return o;
  }
  async function encodeReflection(r) {
    var v = validateReflection(r);
    if (!v.ok) throw err('INVALID', v.error);
    var inks = [inkOrNull(r.name), inkOrNull(part(r.meate).ink), inkOrNull(part(r.w).ink), inkOrNull(part(r.t).ink)];
    var fields = reflFields(r), token = '', i;
    // 1. 手書きの間引きをだんだん強く
    for (i = 0; i < REFL_EPS.length; i++) {
      token = await packToken(REFL_CHAR, fields, inks, REFL_EPS[i]);
      if (token.length <= MAX_LEN) return token;
    }
    // 2. それでも長いとき（学習のまとめが入っているなど）：W・T の手書きを落とす（summary は残す）
    if (inks[2] || inks[3]) {
      fields.cut = 1;
      var inks2 = [inks[0], inks[1], null, null];
      for (i = 0; i < REFL_EPS.length; i++) {
        token = await packToken(REFL_CHAR, fields, inks2, REFL_EPS[i]);
        if (token.length <= MAX_LEN) return token;
      }
    }
    // 3. 名前・めあての手書きも落とす
    if (inks[0] || inks[1]) {
      fields.cut = 1;
      token = await packToken(REFL_CHAR, fields, [null, null, null, null], EPS_RATIO);
      if (token.length <= MAX_LEN) return token;
    }
    throw tooLong(token.length);
  }
  async function decodeReflection(token) {
    var u = await unpackToken(token, REFL_CHAR, 4, 'ふりかえり');
    var f = u.f;
    if (f.v !== 1) throw err('BAD_VERSION', '形式の版が正しくありません');
    var v = validateReflection(f);
    if (!v.ok) throw err('INVALID', v.error);
    var r = reflFields(f);
    r.name = u.inks[0];
    r.meate.ink = u.inks[1];
    r.w.ink = u.inks[2];
    r.t.ink = u.inks[3];
    Object.defineProperty(r, '_token', { value: u.t, enumerable: false });
    return r;
  }

  /* ---------- 学習のきろく（'k'。追加6） ---------- */
  // Record = { v:1, profile:{cls,no,name}, summary:LearnSummary }
  function validateRecord(rec) {
    function no(msg) { return { ok: false, error: msg }; }
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return no('学習のきろくがありません');
    if (rec.v != null && rec.v !== 1) return no('形式の版が正しくありません');
    if (!isProfile(rec.profile)) return no('組・番号・名前が正しくありません');
    var se = checkSummary(rec.summary);
    if (se) return no(se);
    return { ok: true, error: null };
  }
  async function encodeRecord(rec) {
    var v = validateRecord(rec);
    if (!v.ok) throw err('INVALID', v.error);
    var token = await packToken(REC_CHAR, { v: 1, profile: normProfile(rec.profile), summary: copyJSON(rec.summary) }, [], EPS_RATIO);
    if (token.length > MAX_LEN) throw tooLong(token.length);
    return token;
  }
  async function decodeRecord(token) {
    var u = await unpackToken(token, REC_CHAR, 0, '学習のきろく');
    if (u.f.v !== 1) throw err('BAD_VERSION', '形式の版が正しくありません');
    var v = validateRecord(u.f);
    if (!v.ok) throw err('INVALID', v.error);
    var rec = { v: 1, profile: normProfile(u.f.profile), summary: copyJSON(u.f.summary) };
    Object.defineProperty(rec, '_token', { value: u.t, enumerable: false });
    return rec;
  }

  /* ---------- 種類の見分け・コピー用の文 ---------- */
  function kindOf(token) {
    var t;
    try { t = cleanToken(token); } catch (e) { return null; }
    var k = KIND_OF_CHAR[t.charAt(0)];
    if (!k || t.length < 1 + CHECK_LEN + 2 || t.length > MAX_LEN + 64) return null;
    for (var i = 1; i < t.length; i++) if (B64REV[t.charAt(i)] === undefined) return null;
    var body = t.slice(0, t.length - CHECK_LEN);
    return checksum(body) === t.slice(t.length - CHECK_LEN) ? k : null;
  }
  var CODE_INFO = {
    problem: { path: '#/q/', word: 'しょうすうもんだい' },
    goal: { path: '#/g/', word: 'しょうすうゴール' },
    reflection: { path: '#/r/', word: 'しょうすうふりかえり' },
    record: { path: '#/k/', word: 'しょうすうきろく' }
  };
  // コピーしてチャットに貼る文。http(s) なら URL、file:// なら「しょうすう○○ #/x/…」
  function codeText(token) {
    var t = typeof token === 'string' ? token : '';
    try { t = cleanToken(t); } catch (e) { t = ''; }
    var info = CODE_INFO[KIND_OF_CHAR[t.charAt(0)] || 'problem'];
    var href = (typeof location !== 'undefined' && location && location.href) ? String(location.href) : '';
    if (/^https?:/i.test(href)) return href.split('#')[0] + info.path + t;
    return info.word + ' ' + info.path + t;
  }

  var Share = {
    VERSION: VERSION,
    MAX_LEN: MAX_LEN,
    UNITS: UNITS.slice(),
    encode: encode,
    decode: decode,
    url: url,
    extractTokens: extractTokens,
    validate: validate,
    toProblem: toProblem,
    answerText: answerText,
    simplify: simplify,
    countPoints: countPoints,
    // 追加4
    encodeGoal: encodeGoal,
    decodeGoal: decodeGoal,
    validateGoal: validateGoal,
    encodeReflection: encodeReflection,
    decodeReflection: decodeReflection,
    validateReflection: validateReflection,
    kindOf: kindOf,
    codeText: codeText,
    // 追加6
    encodeRecord: encodeRecord,
    decodeRecord: decodeRecord,
    validateRecord: validateRecord,
    validateSummary: function (sm) { var e = checkSummary(sm); return { ok: !e, error: e }; },
    isFormsUrl: isFormsUrl,
    NAME_MAX: NAME_MAX,
    // テスト・内部用
    _: { toMilli: toMilli, fromMilli: fromMilli, checksum: checksum, b64enc: b64enc, b64dec: b64dec, deflate: deflate, inflate: inflate }
  };
  S.Share = Share;
  if (typeof module === 'object' && module.exports) module.exports = Share;
})(typeof window !== 'undefined' ? window : globalThis);
