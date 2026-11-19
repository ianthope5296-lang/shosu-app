/*
 * tools/train-digits.js — 手書き数字認識モデル（小さなCNN）を作り直すためのスクリプト
 *
 * 出力: model/digit-model.js（window.DIGIT_MODEL = {...}; int8量子化＋base64、file://でも読める）
 *
 * ■ 必要なもの
 *   - Node.js 18以上と @tensorflow/tfjs-node 4.x   （npm i @tensorflow/tfjs-node）
 *   - MNIST を生バイナリにしたもの（作業ディレクトリに置く）
 *       x_train.bin  60000x28x28 uint8（行優先、0=背景 255=インク）
 *       y_train.bin  60000 uint8（ラベル0-9）
 *       x_test.bin   10000x28x28 uint8
 *       y_test.bin   10000 uint8
 *     例: mnist.npz から python で  np.load('mnist.npz')['x_train'].astype('uint8').tofile('x_train.bin')  など
 *
 * ■ 実行方法（node_modules と *.bin がある作業ディレクトリで）
 *   cp /path/to/shosu-app/tools/train-digits.js .
 *   RECOGNIZER=/path/to/shosu-app/js/recognizer.js EPOCHS=16 \
 *     OUT=/path/to/shosu-app/model/digit-model.js node train-digits.js
 *   （CPU 4コアで 1エポック約22秒、16エポックで約6分。OUT 省略時はカレントに digit-model.js を書く）
 *   環境変数: EPOCHS(16) / OUT / RECOGNIZER（合成データの前処理に使う recognizer.js。
 *     省略時はこのファイルから見た ../js/recognizer.js）/ SYN_N(30000, 0で合成なし) / SYN_FRAC(0.15)
 *     / SAVE_TF（tfjs 形式でも保存するディレクトリ。精度比較用）
 *
 * ■ モデル
 *   conv3x3(16,same,relu)-maxpool2 - conv3x3(32)-maxpool2 - conv3x3(48)-maxpool2(floor: 7->3)
 *   - flatten(NHWC) - dense96(relu) - dense10(softmax)
 *   推論は js/recognizer.js が外部ライブラリなしで行う（同じ層構成を前提）。
 *
 * ■ データ拡張（子どもの字・前処理のずれを想定。tf.image.transform は tfjs-node に
 *   カーネルが無いので、アフィン変換は純JSで行う）
 *   回転±17°、拡大縮小0.75〜1.2（縦横比も少し変える）、せん断、平行移動±3px、
 *   線の太さ変化（膨張/収縮）、ノイズ。
 *   さらに、日本の子どもの書き方（ひげ付きの1、上が閉じた/開いた4、ひげ・横棒の7 など）を
 *   点列で合成し、recognizer.js と同じ前処理で 28x28 にしたものを各バッチの15%に混ぜる。
 *
 * ■ 2026-11 の学習結果: MNIST テスト 99.47%（int8 化した recognizer.js でも 99.51%）、
 *   拡張テスト 98.8%、出力 約83KB。
 */
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');

function load(name) {
  const buf = fs.readFileSync(name);
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
}
const xtr = load('x_train.bin'), ytr = load('y_train.bin');
const xte = load('x_test.bin'), yte = load('y_test.bin');
const NTR = ytr.length, NTE = yte.length, P = 784;

// ---- 純JSのデータ拡張 ----
function rnd(a) { return (Math.random() * 2 - 1) * a; }
// src: Uint8Array（offset位置の784画素） → dst: Float32Array（offset位置）
function augmentOne(src, so, dst, doff, strength) {
  const k = strength;
  const ang = rnd(0.30 * k);                      // ±17°
  const sc = 1 + (Math.random() * 0.45 - 0.25) * k; // 0.75..1.2
  const sx = sc * (1 + rnd(0.15 * k)), sy = sc;
  const sh = rnd(0.25 * k);
  const tx = rnd(3 * k), ty = rnd(3 * k);
  // 出力座標 -> 入力座標（中心 13.5,13.5 回り）
  const c = Math.cos(ang), s = Math.sin(ang);
  const a0 = c / sx, a1 = (-s + sh) / sx, b0 = s / sy, b1 = c / sy;
  const cx = 13.5, cy = 13.5;
  const tmp = new Float32Array(P);
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const dx = x - cx - tx, dy = y - cy - ty;
      const u = a0 * dx + a1 * dy + cx, v = b0 * dx + b1 * dy + cy;
      const x0 = Math.floor(u), y0 = Math.floor(v);
      const fx = u - x0, fy = v - y0;
      let val = 0;
      if (x0 >= -1 && x0 < 28 && y0 >= -1 && y0 < 28) {
        const g = (xx, yy) => (xx < 0 || yy < 0 || xx > 27 || yy > 27) ? 0 : src[so + yy * 28 + xx];
        val = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) +
              (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
      }
      tmp[y * 28 + x] = val / 255;
    }
  }
  // 線の太さ: 膨張(2x2 max) / 収縮(2x2 min) / そのまま
  const r = Math.random();
  let out = tmp;
  if (r < 0.3 * k) {
    out = new Float32Array(P);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      let m = tmp[y * 28 + x];
      if (x < 27) m = Math.max(m, tmp[y * 28 + x + 1]);
      if (y < 27) m = Math.max(m, tmp[(y + 1) * 28 + x]);
      if (x < 27 && y < 27) m = Math.max(m, tmp[(y + 1) * 28 + x + 1]);
      out[y * 28 + x] = m;
    }
  } else if (r < 0.45 * k) {
    out = new Float32Array(P);
    for (let y = 0; y < 28; y++) for (let x = 0; x < 28; x++) {
      let m = tmp[y * 28 + x];
      m = Math.min(m, x < 27 ? tmp[y * 28 + x + 1] : 0, y < 27 ? tmp[(y + 1) * 28 + x] : 0);
      // 細くなりすぎて消えないよう元画像と混ぜる
      out[y * 28 + x] = 0.6 * m + 0.4 * tmp[y * 28 + x] * (m > 0.05 ? 1 : 0.5);
    }
  }
  const noise = Math.random() < 0.5 ? 0.08 * k : 0;
  for (let i = 0; i < P; i++) {
    let v = out[i] + (noise ? Math.random() * noise : 0);
    dst[doff + i] = v > 1 ? 1 : v;
  }
}
function makeBatch(X, Y, idxs, aug, strength = 1) {
  const n = idxs.length;
  const xb = new Float32Array(n * P), yb = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const j = idxs[i];
    if (aug) augmentOne(X, j * P, xb, i * P, strength);
    else for (let p = 0; p < P; p++) xb[i * P + p] = X[j * P + p] / 255;
    yb[i] = Y[j];
  }
  return { xb, yb };
}


// ---- 合成ストローク（日本の子どもの書き方を想定）----
// recognizer.js と同じ前処理（preprocess）で 28x28 にし、学習データに少し混ぜる。
// MNIST に少ない書き方（ひげ付きの1、上が閉じた4、ひげ・横棒の7 など）と、
// 実際の前処理（線の太さ・位置合わせ）との差を埋めるため。
const SYN_N = +process.env.SYN_N || 30000;   // 0 で合成データなし
const SYN_FRAC = +process.env.SYN_FRAC || 0.15;
const U = (a, b) => a + Math.random() * (b - a);
const P_ = (p) => Math.random() < p;
function sArc(cx, cy, rx, ry, a0, a1) {
  const n = Math.max(8, Math.round(Math.abs(a1 - a0) / 12)), pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return pts;
}
function sLine(...p) {
  const out = [];
  for (let i = 0; i < p.length - 1; i++) for (let k = 0; k < 6; k++) out.push([p[i][0] + (p[i + 1][0] - p[i][0]) * k / 6, p[i][1] + (p[i + 1][1] - p[i][1]) * k / 6]);
  out.push(p[p.length - 1]); return out;
}
const J = (...xs) => [].concat(...xs);
const GEN = [
  () => { const rx = U(0.14, 0.38), ry = U(0.36, 0.45), a = U(-130, -50); return [sArc(0.5, 0.5, rx, ry, a, a + U(350, 385))]; },
  () => {
    const top = [U(0.45, 0.6), U(0.05, 0.12)], bot = [U(0.4, 0.6), U(0.88, 0.95)];
    if (P_(0.35)) return [sLine(top, bot)];
    const len = U(0.07, 0.26), ang = U(25, 70) * Math.PI / 180;    // ひげ：短めで斜め
    const f = [top[0] - len * Math.cos(ang), top[1] + len * Math.sin(ang)];
    const st = P_(0.6) ? [sLine(f, top, bot)] : [sLine(f, top), sLine(top, bot)];
    if (P_(0.1)) st.push(sLine([bot[0] - 0.2, bot[1]], [bot[0] + 0.2, bot[1]]));
    return st;
  },
  () => {
    const r = U(0.2, 0.3), cy = U(0.27, 0.35), by = U(0.86, 0.93);
    const head = sArc(0.5, cy, r, U(0.18, 0.26), U(170, 210), U(380, 420));
    const e = head[head.length - 1];
    if (P_(0.3)) return [J(head, sLine(e, [U(0.25, 0.35), by - 0.1]), sArc(U(0.25, 0.33), by - 0.04, 0.06, 0.05, -80, 140), sLine([0.25, by], [U(0.72, 0.85), by]))];
    return [J(head, sLine(e, [U(0.15, 0.3), by], [U(0.72, 0.88), by]))];
  },
  () => {
    const my = U(0.43, 0.52);
    const lower = sArc(0.48, (my + 0.92) / 2, U(0.24, 0.32), (0.92 - my) / 2, -90, U(140, 170));
    if (P_(0.25)) return [J(sLine([U(0.2, 0.3), 0.1], [U(0.7, 0.78), 0.1], [0.45, my]), lower)];
    return [J(sArc(0.48, (my + 0.08) / 2, U(0.2, 0.28), (my - 0.08) / 2, U(190, 215), 450), lower)];
  },
  () => {
    const hy = U(0.55, 0.68), vx = U(0.55, 0.7);
    if (P_(0.5)) { // 上が開いた4
      const tl = [U(0.25, 0.45), U(0.05, 0.12)];
      return [sLine(tl, [U(0.12, 0.25), hy], [U(0.8, 0.9), hy]), sLine([vx, U(0.08, 0.35)], [vx + U(-0.03, 0.03), U(0.9, 0.96)])];
    }
    const top = [vx + U(-0.05, 0.05), U(0.05, 0.1)];               // 上が閉じた4
    if (P_(0.5)) return [sLine(top, [U(0.1, 0.2), hy], [U(0.8, 0.92), hy]), sLine(top, [vx, U(0.9, 0.96)])];
    return [sLine([vx, U(0.9, 0.96)], top, [U(0.1, 0.2), hy], [U(0.8, 0.92), hy])];
  },
  () => {
    const x0 = U(0.25, 0.35), ty = U(0.08, 0.12), my = U(0.4, 0.5);
    const belly = sArc(0.47, (my + 0.92) / 2 + 0.02, U(0.24, 0.3), (0.92 - my) / 2, U(-150, -110), U(140, 165));
    const stem = J(sLine([x0, ty], [x0 - 0.02, my]), belly);
    const bar = sLine([x0, ty], [U(0.68, 0.8), ty + U(-0.03, 0.02)]);
    return P_(0.5) ? [stem, bar] : [J(bar.slice().reverse(), stem)];
  },
  () => {
    const lr = U(0.17, 0.27), lcy = U(0.65, 0.72), lcx = 0.5;
    const loop = sArc(lcx, lcy, lr, U(0.17, 0.24), 180, 180 + U(330, 380));
    if (P_(0.4)) return [J(sLine([U(0.55, 0.7), 0.06], [lcx - lr, lcy]), loop)];
    return [J(sArc(lcx + U(0.25, 0.4), lcy, U(0.45, 0.6), lcy - 0.06, U(225, 250), 180), loop)];
  },
  () => {
    const ty = U(0.08, 0.15), x0 = U(0.12, 0.28), x1 = U(0.72, 0.88), ty2 = ty + U(-0.04, 0.04);
    const bx = U(0.35, 0.5);
    const stem = P_(0.7) ? sLine([x1, ty2], [bx, U(0.88, 0.95)]) : sArc(x1 - U(0.6, 0.8), ty2 + 0.8, U(0.6, 0.8), 0.8, -U(40, 55), -5).reverse();
    const st = [];
    const bar = sLine([x0, ty], [x1, ty2]);
    if (P_(0.4)) { const h = [x0, ty + U(0.08, 0.2)]; if (P_(0.5)) st.push(J(sLine(h, [x0, ty]), bar, stem)); else st.push(sLine(h, [x0, ty]), J(bar, stem)); }
    else st.push(J(bar, stem));
    if (P_(0.2)) { const yy = U(0.45, 0.58); st.push(sLine([U(0.3, 0.45), yy], [U(0.65, 0.8), yy])); }
    return st;
  },
  () => {
    const my = U(0.44, 0.52), r1 = U(0.15, 0.24), r2 = U(0.2, 0.3);
    if (P_(0.5)) return [sArc(0.5, (my + 0.08) / 2, r1, (my - 0.08) / 2, 0, 360), sArc(0.5, (my + 0.92) / 2, r2, (0.92 - my) / 2, -90, 270)];
    return [J(sArc(0.5, (my + 0.08) / 2, r1, (my - 0.08) / 2, 10, -270), sArc(0.5, (my + 0.92) / 2, r2, (0.92 - my) / 2, -90, 270), sArc(0.5, (my + 0.08) / 2, r1, (my - 0.08) / 2, 90, 10))];
  },
  () => {
    const r = U(0.18, 0.27), cy = U(0.28, 0.36), ry = U(0.17, 0.25), sx = 0.5 + r;
    const loop = sArc(0.5, cy, r, ry, U(-10, 20), U(-10, 20) - U(350, 375));
    const e = loop[loop.length - 1];
    if (P_(0.6)) return [J(loop, sLine(e, [sx + U(-0.12, 0.02), U(0.88, 0.95)]))];
    return [J(loop, sArc(sx - U(0.6, 0.75), cy, U(0.6, 0.75), U(0.55, 0.62), 0, U(75, 95)))];
  },
];
function synJitter(strokes, box) {
  const ang = U(-15, 15) * Math.PI / 180, sc = box * U(0.35, 0.9);
  const ax = U(0.8, 1.2), sh = U(-0.25, 0.25), wob = U(0.005, 0.03), ph = U(0, 6), ph2 = U(0, 6);
  const ox = box * U(0.35, 0.65), oy = box * U(0.35, 0.65), c = Math.cos(ang), s = Math.sin(ang);
  return strokes.map(st => st.map(([x, y], i) => {
    let u = x - 0.5 + wob * Math.sin(i * 0.4 + ph) + U(-0.006, 0.006), v = y - 0.5 + wob * Math.cos(i * 0.33 + ph2) + U(-0.006, 0.006);
    u = u * ax + sh * v;
    return { x: ox + sc * (c * u - s * v), y: oy + sc * (s * u + c * v) };
  }));
}
function makeSynthetic(n) {
  const R = require(process.env.RECOGNIZER || require('path').join(__dirname, '..', 'js', 'recognizer.js'));
  const X = new Uint8Array(n * P), Y = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = i % 10, box = U(60, 120);
    const img = R.preprocess(synJitter(GEN[d](), box), box, box);
    for (let p = 0; p < P; p++) X[i * P + p] = img ? Math.round(img[p] * 255) : 0;
    Y[i] = d;
  }
  return { X, Y };
}

const model = tf.sequential();
model.add(tf.layers.conv2d({ inputShape: [28, 28, 1], filters: 16, kernelSize: 3, activation: 'relu', padding: 'same' }));
model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
model.add(tf.layers.conv2d({ filters: 32, kernelSize: 3, activation: 'relu', padding: 'same' }));
model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
model.add(tf.layers.conv2d({ filters: 48, kernelSize: 3, activation: 'relu', padding: 'same' }));
model.add(tf.layers.maxPooling2d({ poolSize: 2 })); // 3x3x48
model.add(tf.layers.flatten());
model.add(tf.layers.dropout({ rate: 0.25 }));
model.add(tf.layers.dense({ units: 96, activation: 'relu' }));
model.add(tf.layers.dropout({ rate: 0.25 }));
model.add(tf.layers.dense({ units: 10, activation: 'softmax' }));
const opt = tf.train.adam(0.002);
model.compile({ optimizer: opt, loss: 'categoricalCrossentropy', metrics: ['accuracy'] });
model.summary();

function evalAcc(xb, yb, n) {
  return tf.tidy(() => {
    const x = tf.tensor4d(xb, [n, 28, 28, 1]);
    const pred = model.predict(x, { batchSize: 500 }).argMax(1).dataSync();
    let ok = 0; for (let i = 0; i < n; i++) if (pred[i] === yb[i]) ok++;
    return ok / n;
  });
}

(async () => {
  const EPOCHS = +process.env.EPOCHS || 16, BS = 128;
  const allTe = Array.from({ length: NTE }, (_, i) => i);
  const plainTe = makeBatch(xte, yte, allTe, false);
  const augTe = makeBatch(xte, yte, allTe, true);
  const syn = SYN_N ? makeSynthetic(SYN_N) : null;
  if (syn) {
    console.log('synthetic', SYN_N);
    const sAll = Array.from({ length: 2000 }, (_, i) => i);
    syn.check = makeBatch(syn.X, syn.Y, sAll, false); // 合成データの一部での精度（学習にも含まれるので目安）
  }
  const t0 = Date.now();
  for (let ep = 0; ep < EPOCHS; ep++) {
    // コサイン的に学習率を下げる
    opt.learningRate = 0.0001 + 0.0019 * 0.5 * (1 + Math.cos(Math.PI * ep / EPOCHS));
    const idx = tf.util.createShuffledIndices(NTR);
    let loss = 0, n = 0;
    for (let i = 0; i < NTR; i += BS) {
      const ids = Array.from(idx.slice(i, i + BS));
      // 1割は拡張なし（きれいな字も忘れないように）
      let { xb, yb } = makeBatch(xtr, ytr, ids, Math.random() > 0.1);
      if (syn) { // 一部を合成ストロークに置き換え（軽いアフィン拡張のみ）
        const k = Math.round(ids.length * SYN_FRAC);
        const sids = Array.from({ length: k }, () => Math.floor(Math.random() * SYN_N));
        const s = makeBatch(syn.X, syn.Y, sids, true, 0.5);
        xb.set(s.xb, 0); yb.set(s.yb, 0);
      }
      const xa = tf.tensor4d(xb, [ids.length, 28, 28, 1]);
      const ya = tf.tidy(() => tf.oneHot(tf.tensor1d(yb, 'int32'), 10).toFloat());
      const h = await model.trainOnBatch(xa, ya);
      loss += h[0]; n++;
      tf.dispose([xa, ya]);
    }
    const acc = evalAcc(plainTe.xb, plainTe.yb, NTE);
    const accA = evalAcc(augTe.xb, augTe.yb, NTE);
    const accS = syn ? evalAcc(syn.check.xb, syn.check.yb, 2000) : 0;
    console.log(`epoch ${ep} syn ${accS.toFixed(4)} lr ${opt.learningRate.toFixed(5)} loss ${(loss / n).toFixed(4)} test ${acc.toFixed(4)} augtest ${accA.toFixed(4)} t=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  // ---- 書き出し（テンソルごとの scale で int8 量子化） ----
  const layers = [];
  for (const layer of model.layers) {
    const cls = layer.getClassName();
    if (cls === 'Dropout') continue;
    const w = layer.getWeights();
    const entry = { type: cls };
    if (cls === 'Conv2D' || cls === 'Dense') {
      const pack = (t) => {
        const data = t.dataSync();
        let mx = 0; for (const v of data) mx = Math.max(mx, Math.abs(v));
        const scale = mx / 127 || 1;
        const q = Int8Array.from(data, v => Math.round(v / scale));
        return { shape: t.shape, scale, data: Buffer.from(q.buffer).toString('base64') };
      };
      entry.w = pack(w[0]); // conv: [kh,kw,cin,cout] / dense: [in,out]
      entry.b = pack(w[1]);
      entry.act = layer.getConfig().activation;
    }
    layers.push(entry);
  }
  const out = {
    version: 1,
    input: [28, 28, 1],
    note: 'MNIST + augmentation, int8 per-tensor quantized. w[i]=int8*scale. conv HWIO, dense [in,out], flatten NHWC.',
    testAcc: +evalAcc(plainTe.xb, plainTe.yb, NTE).toFixed(4),
    layers,
  };
  const js = '/* 自動生成: tools/train-digits.js 。手で編集しない */\nwindow.DIGIT_MODEL = ' + JSON.stringify(out) + ';\n';
  const OUT = process.env.OUT || 'digit-model.js';
  fs.writeFileSync(OUT, js);
  console.log('saved', OUT, fs.statSync(OUT).size, 'bytes');
  if (process.env.SAVE_TF) await model.save('file://' + process.env.SAVE_TF);
})();
