/*
 * js/recognizer.js — 手書き数字（0〜9）の認識。外部ライブラリなし・同期処理。
 *
 *   Shosu.Recognizer.recognize(strokes, boxW, boxH)
 *     strokes: [[{x,y},...], ...]  マス内座標（px）
 *     -> { digit: 0-9 | null(空), conf: 0..1, top: [{digit, conf}, ...上位3] }
 *   Shosu.Recognizer.isReady()      モデル（window.DIGIT_MODEL）を読めれば true
 *
 * 補助（テスト・デバッグ用）:
 *   preprocess(strokes, boxW, boxH) -> Float32Array(784) | null   28x28（0..1, 行優先）
 *   predictImage(Float32Array(784)) -> Float32Array(10)            各数字の確率
 *   setModel(obj)                                                  DIGIT_MODEL を明示的に渡す（Node用）
 *
 * 前処理は MNIST に合わせる:
 *   ストロークの外接矩形を縦横比を保って 20x20 に収まるよう拡大縮小（小さい点・短い線は拡大しすぎない）
 *   → 112x112（4倍解像度）に線幅10px・丸い線端で描画（距離計算による純JSラスタライザ）
 *   → 4x4 平均で 28x28 → 重心が (14,14) に来るよう平行移動。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};

  var HI = 112;        // 高解像度キャンバスの一辺
  var F = 4;           // 縮小率 112 -> 28
  var LINE_W = 10;     // 112 上の線幅（28 上で 2.5px）
  var FIT = 80;        // 20px * 4 : 線の太さ込みで収める大きさ
  var MIN_FRAC = 0.22; // マスのこの割合より小さい字はこれ以上拡大しない

  // ---------------- モデル読み込み ----------------
  var net = null, loadError = null;

  function b64ToInt8(s) {
    if (typeof atob === 'function') {
      var bin = atob(s), n = bin.length, out = new Int8Array(n);
      for (var i = 0; i < n; i++) { var c = bin.charCodeAt(i); out[i] = c > 127 ? c - 256 : c; }
      return out;
    }
    var buf = Buffer.from(s, 'base64');
    return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
  }
  function dequant(t) {
    var q = b64ToInt8(t.data), f = new Float32Array(q.length), sc = t.scale;
    for (var i = 0; i < q.length; i++) f[i] = q[i] * sc;
    return { shape: t.shape, data: f };
  }
  function build(m) {
    var layers = [];
    for (var i = 0; i < m.layers.length; i++) {
      var L = m.layers[i];
      if (L.type === 'Conv2D' || L.type === 'Dense') {
        layers.push({ type: L.type, w: dequant(L.w), b: dequant(L.b).data, act: L.act });
      } else if (L.type === 'MaxPooling2D' || L.type === 'Flatten') {
        layers.push({ type: L.type });
      }
    }
    return layers;
  }
  function ensure() {
    if (net) return true;
    var m = root.DIGIT_MODEL;
    if (!m) return false;
    try { net = build(m); } catch (e) { loadError = e; net = null; return false; }
    return true;
  }
  function setModel(m) { root.DIGIT_MODEL = m; net = null; return ensure(); }
  function isReady() { return ensure(); }

  // ---------------- 推論 ----------------
  // x: Float32Array [H*W*C] (NHWC, バッチ1)
  function conv2dSame(x, H, W, C, w, b, relu) {
    var kh = w.shape[0], kw = w.shape[1], CO = w.shape[3], wd = w.data;
    var ph = (kh - 1) >> 1, pw = (kw - 1) >> 1;
    var out = new Float32Array(H * W * CO);
    var acc = new Float32Array(CO);
    for (var y = 0; y < H; y++) {
      for (var xx = 0; xx < W; xx++) {
        for (var o = 0; o < CO; o++) acc[o] = b[o];
        for (var ky = 0; ky < kh; ky++) {
          var iy = y + ky - ph; if (iy < 0 || iy >= H) continue;
          for (var kx = 0; kx < kw; kx++) {
            var ix = xx + kx - pw; if (ix < 0 || ix >= W) continue;
            var ib = (iy * W + ix) * C, wb = (ky * kw + kx) * C * CO;
            for (var c = 0; c < C; c++) {
              var v = x[ib + c]; if (v === 0) continue;
              var wo = wb + c * CO;
              for (var o2 = 0; o2 < CO; o2++) acc[o2] += v * wd[wo + o2];
            }
          }
        }
        var ob = (y * W + xx) * CO;
        for (var o3 = 0; o3 < CO; o3++) { var a = acc[o3]; out[ob + o3] = (relu && a < 0) ? 0 : a; }
      }
    }
    return out;
  }
  function maxPool2(x, H, W, C) {
    var OH = H >> 1, OW = W >> 1, out = new Float32Array(OH * OW * C);
    for (var y = 0; y < OH; y++) for (var xx = 0; xx < OW; xx++) for (var c = 0; c < C; c++) {
      var i00 = ((2 * y) * W + 2 * xx) * C + c, i10 = i00 + W * C;
      out[(y * OW + xx) * C + c] = Math.max(x[i00], x[i00 + C], x[i10], x[i10 + C]);
    }
    return out;
  }
  function dense(x, w, b, act) {
    var IN = w.shape[0], OUT = w.shape[1], wd = w.data, out = new Float32Array(OUT);
    for (var o = 0; o < OUT; o++) out[o] = b[o];
    for (var i = 0; i < IN; i++) {
      var v = x[i]; if (v === 0) continue;
      var wb = i * OUT;
      for (var o2 = 0; o2 < OUT; o2++) out[o2] += v * wd[wb + o2];
    }
    if (act === 'relu') for (var k = 0; k < OUT; k++) if (out[k] < 0) out[k] = 0;
    if (act === 'softmax') {
      var mx = -Infinity, s = 0;
      for (var j = 0; j < OUT; j++) if (out[j] > mx) mx = out[j];
      for (var j2 = 0; j2 < OUT; j2++) { out[j2] = Math.exp(out[j2] - mx); s += out[j2]; }
      for (var j3 = 0; j3 < OUT; j3++) out[j3] /= s;
    }
    return out;
  }
  function predictImage(img) {
    if (!ensure()) return null;
    var x = img, H = 28, W = 28, C = 1;
    for (var i = 0; i < net.length; i++) {
      var L = net[i];
      if (L.type === 'Conv2D') { x = conv2dSame(x, H, W, C, L.w, L.b, L.act === 'relu'); C = L.w.shape[3]; }
      else if (L.type === 'MaxPooling2D') { x = maxPool2(x, H, W, C); H >>= 1; W >>= 1; }
      else if (L.type === 'Flatten') { /* NHWC のまま並んでいる */ }
      else if (L.type === 'Dense') { x = dense(x, L.w, L.b, L.act); }
    }
    return x;
  }

  // ---------------- 前処理 ----------------
  // 太線（丸い線端）を距離計算で描く。img: Float32Array(N*N) に max で合成
  function drawSeg(img, N, ax, ay, bx, by, r) {
    var x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1)), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + r + 1));
    var y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1)), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + r + 1));
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    for (var y = y0; y <= y1; y++) {
      var py = y + 0.5;
      for (var x = x0; x <= x1; x++) {
        var px = x + 0.5, t = 0;
        if (L2 > 0) { t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : (t > 1 ? 1 : t); }
        var qx = ax + t * dx - px, qy = ay + t * dy - py;
        var d = Math.sqrt(qx * qx + qy * qy);
        var v = r + 0.5 - d;           // 1px 幅のアンチエイリアス
        if (v <= 0) continue;
        if (v > 1) v = 1;
        var k = y * N + x;
        if (v > img[k]) img[k] = v;
      }
    }
  }

  function bounds(strokes) {
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, len: 0, n: 0 };
    for (var i = 0; i < strokes.length; i++) {
      var s = strokes[i]; if (!s) continue;
      for (var j = 0; j < s.length; j++) {
        var p = s[j]; if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
        b.n++;
        if (p.x < b.x0) b.x0 = p.x; if (p.x > b.x1) b.x1 = p.x;
        if (p.y < b.y0) b.y0 = p.y; if (p.y > b.y1) b.y1 = p.y;
        if (j > 0 && s[j - 1]) { var dx = p.x - s[j - 1].x, dy = p.y - s[j - 1].y; b.len += Math.sqrt(dx * dx + dy * dy); }
      }
    }
    return b;
  }

  function isTooSmall(b, boxW, boxH) {
    if (!b.n) return true;
    var box = Math.min(boxW || 0, boxH || 0) || Math.max(b.x1 - b.x0, b.y1 - b.y0, 1);
    var ext = Math.max(b.x1 - b.x0, b.y1 - b.y0);
    // 点や、ごく小さな跡（ペン先が触れただけ）は空とみなす
    return ext < box * 0.08 && b.len < box * 0.16;
  }

  function preprocess(strokes, boxW, boxH) {
    if (!strokes || !strokes.length) return null;
    var b = bounds(strokes);
    if (isTooSmall(b, boxW, boxH)) return null;
    var w = b.x1 - b.x0, h = b.y1 - b.y0, ext = Math.max(w, h);
    var box = Math.min(boxW || 0, boxH || 0) || ext;
    var inner = FIT - LINE_W;                          // 中心線を収める大きさ（112座標）
    var s = inner / Math.max(ext, box * MIN_FRAC, 1e-6); // 小さい字は拡大しすぎない
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    var r = LINE_W / 2;
    var hi = new Float32Array(HI * HI);
    for (var i = 0; i < strokes.length; i++) {
      var st = strokes[i]; if (!st || !st.length) continue;
      var pts = [];
      for (var j = 0; j < st.length; j++) {
        var p = st[j]; if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
        pts.push((p.x - cx) * s + HI / 2, (p.y - cy) * s + HI / 2);
      }
      if (pts.length === 2) drawSeg(hi, HI, pts[0], pts[1], pts[0], pts[1], r);
      for (var k = 2; k < pts.length; k += 2) drawSeg(hi, HI, pts[k - 2], pts[k - 1], pts[k], pts[k + 1], r);
    }
    // 重心を求め、(14,14)（28画素の index 座標）に来るよう 112 上で整数シフト
    var sum = 0, mx = 0, my = 0;
    for (var y = 0; y < HI; y++) for (var x = 0; x < HI; x++) {
      var v = hi[y * HI + x]; if (!v) continue; sum += v; mx += v * x; my += v * y;
    }
    if (sum <= 0) return null;
    // 112 の画素 x は 28 の座標 (x+0.5)/4-0.5 に対応
    var comX = (mx / sum + 0.5) / F - 0.5, comY = (my / sum + 0.5) / F - 0.5;
    var shx = Math.round((14 - comX) * F), shy = Math.round((14 - comY) * F);
    var img = new Float32Array(784);
    for (var yy = 0; yy < 28; yy++) for (var xx = 0; xx < 28; xx++) {
      var acc = 0;
      for (var dy = 0; dy < F; dy++) {
        var sy = yy * F + dy - shy; if (sy < 0 || sy >= HI) continue;
        for (var dx = 0; dx < F; dx++) {
          var sx = xx * F + dx - shx; if (sx < 0 || sx >= HI) continue;
          acc += hi[sy * HI + sx];
        }
      }
      img[yy * 28 + xx] = acc / (F * F);
    }
    return img;
  }

  function recognize(strokes, boxW, boxH) {
    var img = preprocess(strokes, boxW, boxH);
    if (!img) return { digit: null, conf: 0, top: [] };
    var p = predictImage(img);
    if (!p) return { digit: null, conf: 0, top: [], notReady: true };
    var idx = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(function (a, c) { return p[c] - p[a]; });
    var top = idx.slice(0, 3).map(function (d) { return { digit: d, conf: p[d] }; });
    return { digit: top[0].digit, conf: top[0].conf, top: top };
  }

  var API = {
    recognize: recognize,
    isReady: isReady,
    preprocess: preprocess,
    predictImage: predictImage,
    setModel: setModel,
    _loadError: function () { return loadError; }
  };
  S.Recognizer = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
