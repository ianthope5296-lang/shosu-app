/* Shosu.Share — 子どもが作った問題（UserProblem）をリンク用のトークンにする・もどす
 *
 * トークンの形： <版の文字 '1'> <本体 base64url> <チェック 5文字>
 *   本体 = deflate-raw( [インクの有無ビット 1byte][JSONの長さ varint][JSON(UTF-8)][インク…] )
 *   インク = [w varint][h varint][画数 varint] { [点数 varint] { dx, dy (zigzag varint) } }
 *     座標は欄の長い辺を 0..1023 に量子化し、直前の点（画をまたいで連続）からの差分で持つ。
 *   チェック = FNV-1a(版の文字+本体) の下位30ビットを base64url 5文字で。
 *     → 貼りつけた文章からトークンの終わりを見つける・こわれを見つけるのに使う。
 * 数は浮動小数を使わず、文字列と「1000倍した整数」で扱う。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};

  var VERSION = 1;
  var VCHAR = '1';
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

  function writeInk(w, ink) {
    var s = simplify(ink);
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
    var e = checkInk(up.author, '名前', true) || checkInk(up.hint, 'ヒント', false);
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
    return o;
  }
  var KEYS = { hissan: ['op', 'a', 'b'], fill: ['answer', 'unit'], compare: ['a', 'b'],
    masu: ['level', 'L', 'd1', 'd2', 'd3'], numberline: ['min', 'max', 'step', 'labelEvery', 'arrows'] };
  function hasStrokes(ink) {
    return !!(ink && ink.strokes && ink.strokes.some(function (s) { return s && s.length; }));
  }

  /* ---------- encode / decode ---------- */
  async function encode(up) {
    var r = validate(up);
    if (!r.ok) throw err('INVALID', r.error);
    var inks = [up.author, hasStrokes(up.hint) ? up.hint : null, up.kind === 'fill' ? up.q : null];
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
    var i = t.indexOf('#/q/');
    if (i >= 0) t = t.slice(i + 4);
    t = t.replace(/[\s​-‍﻿]/g, '');
    return t;
  }

  async function decode(token) {
    var t = cleanToken(token);
    if (t.length < 1 + CHECK_LEN + 2) throw err('BAD_TOKEN', 'リンクが短すぎます');
    if (t.length > MAX_LEN + 64) throw err('TOO_LONG', 'リンクが長すぎます');
    if (t.charAt(0) !== VCHAR) {
      if (/^[0-9]$/.test(t.charAt(0))) throw err('BAD_VERSION', '新しい版のアプリで作られた問題です');
      throw err('BAD_TOKEN', 'リンクの形が正しくありません');
    }
    var body = t.slice(0, t.length - CHECK_LEN);
    if (checksum(body) !== t.slice(t.length - CHECK_LEN)) throw err('BAD_CHECKSUM', 'リンクがこわれています');
    var raw = await inflate(b64dec(body.slice(1)));
    var rd = new Reader(raw);
    var mask = rd.u();
    if (mask > 7 || !(mask & 1)) throw err('BAD_DATA', 'データがこわれています');
    var jlen = rd.u();
    var f;
    try { f = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(rd.take(jlen))); }
    catch (e) { throw e.code ? e : err('BAD_DATA', 'データがこわれています'); }
    if (!f || typeof f !== 'object' || Array.isArray(f)) throw err('BAD_DATA', 'データがこわれています');
    if (f.v !== VERSION) throw err('BAD_VERSION', '形式の版が正しくありません');
    if (KINDS.indexOf(f.kind) < 0) throw err('INVALID', '問題の種類が正しくありません');
    if (f.kind === 'fill' && !(mask & 4)) throw err('INVALID', '問題文がありません');
    if (f.kind !== 'fill' && (mask & 4)) throw err('BAD_DATA', 'データがこわれています');
    var author = readInk(rd);
    var hint = mask & 2 ? readInk(rd) : null;
    var q = mask & 4 ? readInk(rd) : null;
    if (rd.p !== raw.length) throw err('BAD_DATA', 'データのあとに余分なものがあります');
    if (countPoints(author) + countPoints(hint) + countPoints(q) > LIMIT.points) throw err('BAD_DATA', '点が多すぎます');

    var up = { v: VERSION, kind: f.kind };
    KEYS[f.kind].forEach(function (k) { up[k] = own(f, k) ? f[k] : undefined; });
    if (up.kind === 'numberline') up.arrows = Array.isArray(f.arrows) ? f.arrows.slice() : null;
    if (up.kind === 'fill') up.q = q;
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
    var re = /(?:#|%23)\/q\//gi, m;
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
      if (s.charAt(0) === VCHAR) {
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
    p.authorInk = up.author || null;
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
    // テスト・内部用
    _: { toMilli: toMilli, fromMilli: fromMilli, checksum: checksum, b64enc: b64enc, b64dec: b64dec, deflate: deflate, inflate: inflate }
  };
  S.Share = Share;
  if (typeof module === 'object' && module.exports) module.exports = Share;
})(typeof window !== 'undefined' ? window : globalThis);
