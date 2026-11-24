#!/usr/bin/env node
/* もんだいづくり：リンク共有（js/share.js）と保存（js/store.js の追加分）のテスト
 *   node tools/share-test.js
 */
'use strict';
var path = require('path');
var assert = require('assert');

// --- store.js を Node で読むための最小の window / localStorage（容量制限つき） ---
function FakeStorage(quota) {
  var d = {};
  this.quota = quota;
  Object.defineProperty(this, 'length', { get: function () { return Object.keys(d).length; } });
  this.key = function (i) { return Object.keys(d)[i] || null; };
  this.getItem = function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; };
  this.setItem = function (k, v) {
    v = String(v);
    var used = 0;
    for (var x in d) if (x !== k) used += x.length + d[x].length;
    if (used + k.length + v.length > this.quota) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    d[k] = v;
  };
  this.removeItem = function (k) { delete d[k]; };
}
var storage = new FakeStorage(5e6);
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true });
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
require(path.join(__dirname, '..', 'js', 'store.js'));
var Share = require(path.join(__dirname, '..', 'js', 'share.js'));
var Store = globalThis.Shosu.Store;

var passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  NG  ' + name + '\n      ' + (e && e.stack || e)); }
}
async function rejects(p, code, label) {
  var e = null;
  try { await p; } catch (x) { e = x; }
  assert.ok(e, (label || '') + ' が reject されませんでした');
  if (code) assert.strictEqual(e.code, code, (label || '') + ' のコード: ' + e.code + ' ' + e.message);
  return e;
}

// --- 乱数とインク生成 ---
var seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function rr(a, b) { return a + rnd() * (b - a); }
function ri(a, b) { return Math.floor(rr(a, b + 1)); }

// 手書きらしい1画：向きが少しずつ変わる曲線＋ときどき角（はね・おれ）＋手のふるえ（1px前後）＋サブピクセルのゆれ
var BOX = null;
function stroke(x, y, nPts, len) {
  var pts = [], ang = rr(0, Math.PI * 2), step = len / nPts, turn = rr(-0.15, 0.15);
  var wa = rr(0.5, 1.5), wf = rr(0.2, 0.6), wp = rr(0, 6.3);
  for (var i = 0; i < nPts; i++) {
    var px = x + Math.cos(ang + 1.57) * wa * Math.sin(wp + i * wf) + rr(-0.3, 0.3);
    var py = y + Math.sin(ang + 1.57) * wa * Math.sin(wp + i * wf) + rr(-0.3, 0.3);
    if (BOX) { px = Math.min(Math.max(px, 0), BOX.w); py = Math.min(Math.max(py, 0), BOX.h); }
    pts.push({ x: px, y: py });
    ang += turn + rr(-0.08, 0.08);
    if (rnd() < 0.08) turn = rr(-0.3, 0.3);
    if (rnd() < 0.04) ang += rr(-2, 2);          // 角
    x += Math.cos(ang) * step; y += Math.sin(ang) * step;
  }
  return pts;
}
// lines 行の文章（1行に nStrokes 画）。文字は 1 行の高さに収まる大きさ
function textInk(w, h, lines, strokesPerLine) {
  var strokes = [], lineH = h / Math.max(lines, 2);
  BOX = { w: w, h: h };
  for (var l = 0; l < lines; l++) {
    var n = strokesPerLine, perChar = 3, nChars = Math.ceil(n / perChar);
    var charW = Math.min(lineH * 0.9, (w - 40) / nChars);
    for (var s = 0; s < n; s++) {
      var c = Math.floor(s / perChar);
      var cx = 20 + c * charW, cy = 20 + l * lineH;
      var nPts = ri(20, 80);
      strokes.push(stroke(cx + rr(0, charW * 0.7), cy + rr(0, lineH * 0.6), nPts, rr(charW * 0.25, charW * 0.9)));
    }
  }
  BOX = null;
  return { w: w, h: h, strokes: strokes };
}
function nameInk() { return textInk(300, 100, 1, ri(8, 15)); }

function base(kind, extra) {
  var up = { v: 1, kind: kind, author: nameInk(), hint: null };
  for (var k in extra) up[k] = extra[k];
  return up;
}
function inkClose(a, b, tol) {      // b（復元）の各点が a の線から tol 以内か、画数が同じか
  assert.strictEqual(b.strokes.length, a.strokes.length, '画数');
  assert.strictEqual(b.w, Math.round(a.w)); assert.strictEqual(b.h, Math.round(a.h));
  for (var i = 0; i < a.strokes.length; i++) {
    var sa = a.strokes[i], sb = b.strokes[i];
    assert.ok(sb.length >= 1 && sb.length <= sa.length, '点数');
    sb.forEach(function (p) {
      var best = Infinity;
      for (var j = 0; j < sa.length; j++) {
        var d = Math.hypot(sa[j].x - p.x, sa[j].y - p.y);
        if (d < best) best = d;
      }
      // 端点など元の点に近いはず（量子化分 + 間引き分）。間引き点は元の点そのものなので量子化分だけ
      assert.ok(best <= tol, '点のずれ ' + best.toFixed(2));
    });
  }
}
function noInk(up) {
  var o = {};
  for (var k in up) if (['author', 'hint', 'q'].indexOf(k) < 0) o[k] = up[k];
  return o;
}

(async function main() {
  console.log('■ 往復（encode → decode）');
  var samples = {
    hissan: base('hissan', { op: '+', a: '4.25', b: '2.18' }),
    hissanSub: base('hissan', { op: '-', a: '6', b: '0.52' }),
    fill: base('fill', { q: textInk(800, 300, 1, 40), answer: '1.26', unit: 'L' }),
    fillNoUnit: base('fill', { q: textInk(800, 300, 1, 20), answer: '3254', unit: '' }),
    compare: base('compare', { a: '0.43', b: '0.425' }),
    masu2: base('masu', { level: 2, L: 1, d1: 2, d2: 6, d3: 0 }),
    masu3: base('masu', { level: 3, L: 1, d1: 2, d2: 3, d3: 6 }),
    numberline: base('numberline', { min: '2.8', max: '2.9', step: '0.001', labelEvery: 10, arrows: ['2.805', '2.85', '2.899'] }),
    withHint: base('compare', { a: '1', b: '1.0', hint: textInk(800, 200, 1, 15) })
  };
  var tokens = {};
  for (var name in samples) {
    await test('往復 ' + name, async function () {
      var up = samples[name];
      var tok = await Share.encode(up);
      tokens[name] = tok;
      assert.ok(/^[A-Za-z0-9_-]+$/.test(tok), 'URL に使える文字だけ');
      assert.ok(tok.length <= Share.MAX_LEN);
      var back = await Share.decode(tok);
      assert.deepStrictEqual(noInk(back), noInk(up));
      var tol = Math.max(up.author.w, up.author.h) / 1023 * 0.75;
      inkClose(Share.simplify(up.author), back.author, tol);
      if (up.hint) inkClose(Share.simplify(up.hint), back.hint, tol * 3); else assert.strictEqual(back.hint, null);
      if (up.q) inkClose(Share.simplify(up.q), back.q, 800 / 1023 * 0.75);
      assert.ok(Share.validate(back).ok);
      // 同じ内容なら同じトークン（重複まとめに使える）。復元したものを再度送ってもこわれない
      assert.strictEqual(await Share.encode(up), tok);
      var again = await Share.decode(await Share.encode(back));
      assert.deepStrictEqual(noInk(again), noInk(up));
      assert.strictEqual(again.author.strokes.length, back.author.strokes.length);
    });
  }
  await test('decode は URL まるごと・空白入りも受けつける', async function () {
    var t = tokens.hissan;
    var up = await Share.decode('https://example.com/shosu-app/#/q/' + t.slice(0, 20) + '\n' + t.slice(20));
    assert.strictEqual(up.a, '4.25');
  });
  await test('空のヒント（線なし）は null になる', async function () {
    var up = base('hissan', { op: '+', a: '1.5', b: '2', hint: { w: 800, h: 200, strokes: [] } });
    var back = await Share.decode(await Share.encode(up));
    assert.strictEqual(back.hint, null);
  });
  await test('欄の外にはみ出した点は欄の端にまとめる', async function () {
    var up = base('hissan', { op: '+', a: '1', b: '2' });
    up.author = { w: 300, h: 100, strokes: [[{ x: -20, y: 50 }, { x: 150, y: 140 }, { x: 330, y: 50 }]] };
    var back = await Share.decode(await Share.encode(up));
    back.author.strokes[0].forEach(function (p) { assert.ok(p.x >= 0 && p.x <= 300 && p.y >= 0 && p.y <= 100); });
  });

  console.log('■ トークンの長さ');
  async function lenStats(label, mk, n) {
    var lens = [];
    for (var i = 0; i < n; i++) {
      try { lens.push((await Share.encode(mk())).length); }
      catch (e) { if (e.code === 'TOO_LONG') lens.push(e.length); else throw e; }
    }
    lens.sort(function (a, b) { return a - b; });
    var pick = function (q) { return lens[Math.min(lens.length - 1, Math.floor(q * lens.length))]; };
    var over = lens.filter(function (l) { return l > Share.MAX_LEN; }).length;
    console.log('      ' + label + ': 最小 ' + lens[0] + ' / 中央 ' + pick(0.5) + ' / 90% ' + pick(0.9) + ' / 最大 ' + lens[lens.length - 1] + '（上限超え ' + over + '/' + n + '）');
    return { lens: lens, median: pick(0.5), p90: pick(0.9), max: lens[lens.length - 1], over: over };
  }
  var r0, r1, r2, rDense;
  await test('数だけの問題（名前つき）は短い', async function () {
    r0 = await lenStats('筆算＋名前', function () { return base('hissan', { op: '+', a: '4.25', b: '2.18' }); }, 30);
    assert.ok(r0.max < 1500);
    var noName = (await Share.encode(base('hissan', { op: '+', a: '4.25', b: '2.18', author: { w: 300, h: 100, strokes: [[{ x: 1, y: 1 }]] } }))).length;
    console.log('      筆算（名前が点1つ）: ' + noName + ' 文字');
    assert.ok(noName <= 120);
  });
  await test('文章1行（800x300、30〜60画、各20〜80点）＋名前は上限内', async function () {
    r1 = await lenStats('文章1行', function () { return base('fill', { q: textInk(800, 300, 1, ri(30, 60)), answer: '1.26', unit: 'L' }); }, 40);
    assert.strictEqual(r1.over, 0);
  });
  await test('文章2行（各30〜60画）＋名前＋ヒント1行（20画）もほぼ上限内', async function () {
    r2 = await lenStats('文章2行＋ヒント', function () {
      return base('fill', { q: textInk(800, 300, 2, ri(30, 60)), answer: '0.38', unit: 'kg', hint: textInk(800, 200, 1, 20) });
    }, 40);
    assert.ok(r2.p90 <= Share.MAX_LEN, '90%が上限内');
  });
  await test('書きすぎると TOO_LONG で reject（長さつき）', async function () {
    var scribble = { w: 800, h: 300, strokes: [] };
    for (var k = 0; k < 40; k++) { var st = []; for (var j = 0; j < 150; j++) st.push({ x: rr(0, 800), y: rr(0, 300) }); scribble.strokes.push(st); }
    var up = base('fill', { q: scribble, answer: '1', unit: '' });
    var e = await rejects(Share.encode(up), 'TOO_LONG', '長すぎ');
    assert.ok(e.length > Share.MAX_LEN);
  });
  await test('間引きで点が減る・見た目は崩れない（ずれは許容誤差以内）', async function () {
    var ink = textInk(800, 300, 1, 40), s = Share.simplify(ink);
    var before = Share.countPoints(ink), after = Share.countPoints(s);
    console.log('      間引き: ' + before + ' 点 → ' + after + ' 点');
    assert.ok(after < before * 0.6);
    assert.strictEqual(s.strokes.length, ink.strokes.length);
  });

  console.log('■ 不正な値・壊れたトークン');
  var bad = [
    ['v ちがい', { v: 2 }],
    ['kind ちがい', { kind: 'order' }],
    ['名前なし', { author: null }],
    ['名前が空', { author: { w: 300, h: 100, strokes: [[]] } }],
    ['インクの点が数でない', { author: { w: 300, h: 100, strokes: [[{ x: 'a', y: 1 }]] } }],
    ['インクの大きさが0', { author: { w: 0, h: 100, strokes: [[{ x: 1, y: 1 }]] } }],
    ['小数第四位', { a: '1.2345' }],
    ['負の数', { a: '-1.2' }],
    ['先頭0', { a: '01.2' }],
    ['桁が多い', { a: '12345' }],
    ['数が数値型', { a: 4.25 }],
    ['小数点だけ', { a: '1.' }],
    ['op ちがい', { op: '*' }],
    ['ひき算が負', { op: '-', a: '1.2', b: '1.25' }]
  ];
  for (const b of bad) {
    await (async function (b) {
      await test('validate/encode 拒否: ' + b[0], async function () {
        var up = base('hissan', { op: '+', a: '4.25', b: '2.18' });
        for (var k in b[1]) up[k] = b[1][k];
        assert.strictEqual(Share.validate(up).ok, false);
        assert.ok(typeof Share.validate(up).error === 'string');
        await rejects(Share.encode(up), 'INVALID', b[0]);
      });
    })(b);
  }
  var badKind = [
    ['fill 問題文なし', 'fill', { answer: '1', unit: 'L' }],
    ['fill 単位ちがい', 'fill', { q: textInk(800, 300, 1, 5), answer: '1', unit: 'dL' }],
    ['fill 答えが不正', 'fill', { q: textInk(800, 300, 1, 5), answer: '1.2.3', unit: 'L' }],
    ['compare 不正', 'compare', { a: '0.4', b: 'abc' }],
    ['masu 10こ', 'masu', { level: 2, L: 10, d1: 0, d2: 0, d3: 0 }],
    ['masu 負', 'masu', { level: 2, L: 1, d1: -1, d2: 0, d3: 0 }],
    ['masu 小数', 'masu', { level: 2, L: 1.5, d1: 0, d2: 0, d3: 0 }],
    ['masu level2 で d3', 'masu', { level: 2, L: 1, d1: 0, d2: 0, d3: 4 }],
    ['masu level ちがい', 'masu', { level: 4, L: 1, d1: 0, d2: 0, d3: 0 }],
    ['数直線 ↑が範囲外', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['1.1'] }],
    ['数直線 ↑が目もりにない', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.25'] }],
    ['数直線 ↑なし', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: [] }],
    ['数直線 ↑4本', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.1', '0.2', '0.3', '0.4'] }],
    ['数直線 ↑が重複', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.1', '0.10'] }],
    ['数直線 min>=max', 'numberline', { min: '1', max: '1', step: '0.1', labelEvery: 10, arrows: ['1'] }],
    ['数直線 step ちがい', 'numberline', { min: '0', max: '1', step: '0.25', labelEvery: 10, arrows: ['0.5'] }],
    ['数直線 目もり多すぎ', 'numberline', { min: '0', max: '1', step: '0.001', labelEvery: 10, arrows: ['0.5'] }],
    ['数直線 min が step の倍数でない', 'numberline', { min: '0.05', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.15'] }],
    ['数直線 labelEvery 0', 'numberline', { min: '0', max: '1', step: '0.1', labelEvery: 0, arrows: ['0.5'] }]
  ];
  for (const b of badKind) {
    await (async function (b) {
      await test('validate/encode 拒否: ' + b[0], async function () {
        var up = base(b[1], b[2]);
        assert.strictEqual(Share.validate(up).ok, false, JSON.stringify(Share.validate(up)));
        await rejects(Share.encode(up), 'INVALID', b[0]);
      });
    })(b);
  }
  await test('正しい境界の値は通る', async function () {
    assert.ok(Share.validate(base('numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0', '1', '0.5'] })).ok);
    assert.ok(Share.validate(base('masu', { level: 3, L: 9, d1: 9, d2: 9, d3: 9 })).ok);
    assert.ok(Share.validate(base('hissan', { op: '-', a: '2.5', b: '2.50' })).ok);
    assert.ok(Share.validate(base('fill', { q: textInk(800, 300, 1, 3), answer: '12000', unit: 'g' })).ok);
  });

  var good = tokens.fill;
  var broken = [
    ['空', ''],
    ['短い', '1abc'],
    ['版ちがい', '2' + good.slice(1)],
    ['使えない文字', good.slice(0, 10) + '!' + good.slice(11)],
    ['1文字かわった', good.slice(0, 40) + (good[40] === 'A' ? 'B' : 'A') + good.slice(41)],
    ['途中で切れた', good.slice(0, Math.floor(good.length / 2))],
    ['末尾が欠けた', good.slice(0, -1)],
    ['ゴミ', 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'],
    ['数でない', 12345]
  ];
  for (const b of broken) {
    await (async function (b) {
      await test('decode 拒否: ' + b[0], async function () { await rejects(Share.decode(b[1]), null, b[0]); });
    })(b);
  }
  // チェック文字は合っているが中身が不正なトークン（自作）
  async function forge(bytes) {
    var comp = await Share._.deflate(new Uint8Array(bytes));
    var body = '1' + Share._.b64enc(comp);
    return body + Share._.checksum(body);
  }
  function jsonBytes(obj) { return Array.from(new TextEncoder().encode(JSON.stringify(obj))); }
  function vu(n) { var a = []; while (n >= 128) { a.push((n & 127) | 128); n = Math.floor(n / 128); } a.push(n); return a; }
  function zz(n) { return vu(n < 0 ? -2 * n - 1 : 2 * n); }
  var okInk = [].concat(vu(300), vu(100), vu(1), vu(2), zz(10), zz(10), zz(20), zz(5));
  function payload(obj, ink, mask) { var j = jsonBytes(obj); return [mask == null ? 1 : mask].concat(vu(j.length), j, ink || okInk); }
  await test('自作した正しいトークンは通る（テストの作り方の確認）', async function () {
    var up = await Share.decode(await forge(payload({ v: 1, kind: 'hissan', op: '+', a: '1.2', b: '3' })));
    assert.strictEqual(up.b, '3');
  });
  var forged = [
    ['JSON の値が不正（ひき算が負）', payload({ v: 1, kind: 'hissan', op: '-', a: '1', b: '2' })],
    ['JSON の kind が不正', payload({ v: 1, kind: 'evil', a: '1' })],
    ['JSON が配列', payload([1, 2])],
    ['JSON の v ちがい', payload({ v: 9, kind: 'hissan', op: '+', a: '1', b: '2' })],
    ['名前インクなし', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [], 0)],
    ['fill なのに問題文なし', payload({ v: 1, kind: 'fill', answer: '1', unit: 'L' })],
    ['masu の個数 12', payload({ v: 1, kind: 'masu', level: 2, L: 12, d1: 0, d2: 0, d3: 0 })],
    ['数直線の↑が step の倍数でない', payload({ v: 1, kind: 'numberline', min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.33'] })],
    ['数直線の arrows が文字列', payload({ v: 1, kind: 'numberline', min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: '0.3' })],
    ['インクが欄の外', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(300), vu(100), vu(1), vu(1), zz(2000), zz(1)))],
    ['インクが負の座標', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(300), vu(100), vu(1), vu(1), zz(-3), zz(1)))],
    ['画数が上限超え', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(300), vu(100), vu(5000)))],
    ['点数が上限超え', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(300), vu(100), vu(1), vu(100000)))],
    ['インクが途中で切れた', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(300), vu(100), vu(1), vu(3), zz(1)))],
    ['後ろに余分なデータ', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, okInk.concat([0, 0]))],
    ['欄の大きさ 0', payload({ v: 1, kind: 'hissan', op: '+', a: '1', b: '2' }, [].concat(vu(0), vu(100), vu(0)))],
    ['JSON の長さが大きすぎる', [1].concat(vu(99999), [123])],
    ['大きすぎる展開（圧縮爆弾）', new Array(400000).fill(0)]
  ];
  for (const b of forged) {
    await (async function (b) {
      await test('decode 拒否: ' + b[0], async function () { await rejects(forge(b[1]).then(Share.decode), null, b[0]); });
    })(b);
  }

  console.log('■ extractTokens');
  var tA = tokens.hissan, tB = tokens.compare, tF = tokens.fill;
  var U = 'https://school.example.jp/shosu-app/';
  var pastes = [
    ['URL だけ', U + '#/q/' + tA, [tA]],
    ['文章の中', 'はるとです。' + U + '#/q/' + tA + ' といてね！', [tA]],
    ['< > で囲む', '<' + U + '#/q/' + tA + '>', [tA]],
    ['末尾に句点', U + '#/q/' + tA + '。', [tA]],
    ['末尾にピリオド', U + '#/q/' + tA + '.', [tA]],
    ['末尾にハイフン（トークンに使える文字）', U + '#/q/' + tA + '-', [tA]],
    ['末尾に _ と文字', U + '#/q/' + tA + '_abc', [tA]],
    ['かっこ・Markdown', '[もんだい](' + U + '#/q/' + tA + ')', [tA]],
    ['途中で改行', U + '#/q/' + tF.slice(0, 50) + '\n' + tF.slice(50, 300) + '\r\n' + tF.slice(300), [tF]],
    ['途中で改行し、次の行にふつうの英字', U + '#/q/' + tA.slice(0, 30) + '\n' + tA.slice(30) + '\nok thanks', [tA]],
    ['改行のあとすぐ英字', U + '#/q/' + tA + '\nabc', [tA]],
    ['ゼロ幅スペース入り', U + '#/q/' + tA.slice(0, 10) + '​' + tA.slice(10), [tA]],
    ['%23 にエンコード', U + '%23/q/' + tA, [tA]],
    ['HTML の &gt;', '&lt;' + U + '#/q/' + tA + '&gt;', [tA]],
    ['複数・重複', [U + '#/q/' + tA, '先生へ ' + U + '#/q/' + tB + '。', '<' + U + '#/q/' + tA + '>', U + '#/q/' + tF].join('\n'), [tA, tB, tF]],
    ['トークンだけで区切りなしに続く', U + '#/q/' + tA + U + '#/q/' + tB, [tA, tB]],
    ['こわれたリンクは取り出さない', U + '#/q/' + tA.slice(0, -2) + ' と ' + U + '#/q/' + tB, [tB]],
    ['関係ない文章', 'こんにちは https://example.com/#/home', []],
    ['空', '', []]
  ];
  for (const p of pastes) {
    await (async function (p) {
      await test('extractTokens: ' + p[0], async function () {
        assert.deepStrictEqual(Share.extractTokens(p[1]), p[2]);
      });
    })(p);
  }
  await test('取り出したトークンは decode できる', async function () {
    var ts = Share.extractTokens('<' + U + '#/q/' + tF.slice(0, 77) + '\n' + tF.slice(77) + '>。');
    assert.strictEqual(ts.length, 1);
    var up = await Share.decode(ts[0]);
    assert.strictEqual(up.answer, '1.26');
  });
  await test('url() は #/q/ をつける', async function () {
    assert.strictEqual(Share.url('1abc'), 'しょうすうもんだい #/q/1abc');
    globalThis.location = { href: 'https://x.jp/shosu-app/index.html#/home' };
    assert.strictEqual(Share.url('1abc'), 'https://x.jp/shosu-app/index.html#/q/1abc');
    globalThis.location = { href: 'file:///C:/Users/a/Downloads/shosu-app.html#/' };
    assert.strictEqual(Share.url('1abc'), 'しょうすうもんだい #/q/1abc');
    delete globalThis.location;
  });

  console.log('■ toProblem / answerText');
  await test('fill', async function () {
    var up = await Share.decode(tokens.fill);
    var p = Share.toProblem(up);
    assert.strictEqual(p.type, 'fill');
    assert.deepStrictEqual(p.parts, [{ a: '1.26' }, 'L']);
    assert.ok(p.qInk && p.qInk.strokes.length);
    assert.ok(p.authorInk && p.authorInk.strokes.length);
    assert.strictEqual(p.hintInk, null);
    assert.strictEqual(p.id, 'friend-' + tokens.fill.slice(0, 16));
    assert.strictEqual(Share.answerText(up), '1.26L');
    var p2 = Share.toProblem(samples.fillNoUnit);
    assert.deepStrictEqual(p2.parts, [{ a: '3254' }]);
    assert.ok(/^friend-h/.test(p2.id));
    assert.strictEqual(Share.answerText(samples.fillNoUnit), '3254');
  });
  await test('masu', async function () {
    var cases = [
      [{ level: 2, L: 1, d1: 2, d2: 6, d3: 0 }, '1.26'],
      [{ level: 2, L: 0, d1: 0, d2: 7, d3: 0 }, '0.07'],
      [{ level: 2, L: 2, d1: 4, d2: 0, d3: 0 }, '2.4'],
      [{ level: 2, L: 3, d1: 0, d2: 0, d3: 0 }, '3'],
      [{ level: 2, L: 0, d1: 0, d2: 0, d3: 0 }, '0'],
      [{ level: 3, L: 1, d1: 2, d2: 3, d3: 6 }, '1.236'],
      [{ level: 3, L: 0, d1: 0, d2: 0, d3: 1 }, '0.001'],
      [{ level: 3, L: 9, d1: 9, d2: 9, d3: 9 }, '9.999'],
      [{ level: 3, L: 0, d1: 1, d2: 0, d3: 0 }, '0.1']
    ];
    cases.forEach(function (c) {
      var up = base('masu', c[0]);
      var p = Share.toProblem(up);
      assert.strictEqual(p.type, 'fill');
      assert.strictEqual(p.q, 'かさは何Lですか。');
      assert.deepStrictEqual(p.parts, [{ a: c[1] }, 'L']);
      var fig = { kind: 'masu', unit: 'L', L: c[0].L, d1: c[0].d1, d2: c[0].d2, level: c[0].level };
      if (c[0].level === 3) fig.d3 = c[0].d3;
      assert.deepStrictEqual(p.fig, fig);
      assert.strictEqual(Share.answerText(up), c[1] + 'L');
    });
  });
  await test('numberline', async function () {
    var up = await Share.decode(tokens.numberline);
    var p = Share.toProblem(up);
    assert.strictEqual(p.type, 'fill');
    assert.strictEqual(p.q, '↑の目もりを読みましょう。');
    assert.deepStrictEqual(p.parts, ['あ', { a: '2.805' }, '  い', { a: '2.85' }, '  う', { a: '2.899' }]);
    assert.deepStrictEqual(p.fig, { kind: 'numberline', min: 2.8, max: 2.9, step: 0.001, labelEvery: 10,
      arrows: [{ v: 2.805, label: 'あ' }, { v: 2.85, label: 'い' }, { v: 2.899, label: 'う' }] });
    assert.strictEqual(Share.answerText(up), 'あ 2.805　い 2.85　う 2.899');
    var p2 = Share.toProblem(base('numberline', { min: '0', max: '1', step: '0.1', labelEvery: 10, arrows: ['0.30'] }));
    assert.deepStrictEqual(p2.parts, ['あ', { a: '0.3' }]);
  });
  await test('compare', async function () {
    [['0.43', '0.425', '>'], ['0.425', '0.43', '<'], ['1', '1.0', '='], ['0.09', '0.1', '<'], ['10', '9.999', '>'], ['2.30', '2.3', '=']].forEach(function (c) {
      var up = base('compare', { a: c[0], b: c[1] });
      var p = Share.toProblem(up);
      assert.strictEqual(p.type, 'choice');
      assert.strictEqual(p.q, c[0] + ' □ ' + c[1] + '　□にあてはまる不等号は？');
      assert.deepStrictEqual(p.options, ['>', '<', '=']);
      assert.strictEqual(p.a, c[2]);
      assert.strictEqual(Share.answerText(up), c[0] + ' ' + c[2] + ' ' + c[1]);
    });
  });
  await test('hissan（答えは problems.js の hissanAnswer と一致）', async function () {
    // problems.js の hissanAnswer を取り出して照合する
    var src = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'problems.js'), 'utf8');
    var m = src.match(/function splitNum[\s\S]*?\n  }\n/), m2 = src.match(/function hissanAnswer[\s\S]*?\n  }\n/);
    var ref = new Function(m[0] + m2[0] + 'return hissanAnswer;')();
    var cases = [['+', '4.25', '2.18'], ['-', '6', '0.52'], ['+', '0.999', '0.001'], ['-', '3.2', '3.2'], ['+', '9.9', '0.1'], ['-', '10', '0.001'], ['+', '123.4', '0.56'], ['-', '5.07', '2.9']];
    for (var j = 0; j < 200; j++) {
      var a = (ri(0, 99999) / Math.pow(10, ri(0, 3))).toString(), b = (ri(0, 99999) / Math.pow(10, ri(0, 3))).toString();
      if (!/^(0|[1-9]\d{0,3})(\.\d{1,3})?$/.test(a) || !/^(0|[1-9]\d{0,3})(\.\d{1,3})?$/.test(b)) continue;
      cases.push([rnd() < 0.5 ? '+' : '-', a, b]);
    }
    cases.forEach(function (c) {
      var up = base('hissan', { op: c[0], a: c[1], b: c[2] });
      if (c[0] === '-' && Number(c[1]) < Number(c[2])) { assert.strictEqual(Share.validate(up).ok, false); return; }
      var p = Share.toProblem(up);
      assert.deepStrictEqual([p.type, p.op, p.a, p.b], ['hissan', c[0], c[1], c[2]]);
      assert.strictEqual(Share.answerText(up), ref(c[0], c[1], c[2]).canon, c.join(' '));
    });
  });
  await test('hintInk・authorInk がつく', async function () {
    var up = await Share.decode(tokens.withHint);
    var p = Share.toProblem(up);
    assert.ok(p.hintInk && p.hintInk.strokes.length === 15);
    assert.ok(p.authorInk && p.authorInk.strokes.length);
    assert.strictEqual(p.qInk, null);
  });

  console.log('■ ゴールのコード（追加4）');
  function goalOf(extra) {
    var g = { v: 1, id: 'g-mi4k2x', name: '小数のテスト', date: '2026-11-28',
      classes: [{ date: '2026-11-26', minutes: 20, lesson: 9 }, { date: '2026-11-24', minutes: 45, note: '筆算' }, { date: '2026-11-25', minutes: 15 }],
      created: '2026-11-21T03:00:00.000Z' };
    for (var k in extra) g[k] = extra[k];
    return g;
  }
  var tGoal = null;
  await test('ゴール：往復（授業の予定は日にち順になる）', async function () {
    tGoal = await Share.encodeGoal(goalOf());
    assert.strictEqual(tGoal.charAt(0), 'g');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(tGoal));
    var g = await Share.decodeGoal(tGoal);
    assert.strictEqual(g.name, '小数のテスト');
    assert.strictEqual(g.date, '2026-11-28');
    assert.strictEqual(g.id, 'g-mi4k2x');
    assert.strictEqual(g.created, '2026-11-21T03:00:00.000Z');
    assert.deepStrictEqual(g.classes, [{ date: '2026-11-24', minutes: 45, note: '筆算' }, { date: '2026-11-25', minutes: 15 }, { date: '2026-11-26', minutes: 20, lesson: 9 }]);
    console.log('      ゴール（授業3回）: ' + tGoal.length + ' 文字');
  });
  await test('ゴール：授業の予定なし・URL つきでも開ける', async function () {
    var t = await Share.encodeGoal(goalOf({ classes: [] }));
    var g = await Share.decodeGoal('https://x.jp/app/#/g/' + t);
    assert.deepStrictEqual(g.classes, []);
  });
  await test('ゴール：授業が多くても上限内（60回・メモつき）', async function () {
    var cls = [];
    for (var i = 0; i < 60; i++) {
      var d = new Date(Date.UTC(2026, 8, 1) + i * 86400000).toISOString().slice(0, 10);
      cls.push({ date: d, minutes: 45, lesson: (i % 10) + 1, note: '第' + ((i % 10) + 1) + '時の授業 まとめと練習' });
    }
    var t = await Share.encodeGoal(goalOf({ date: '2026-12-25', classes: cls }));
    assert.ok(t.length <= Share.MAX_LEN);
    assert.strictEqual((await Share.decodeGoal(t)).classes.length, 60);
  });
  var badGoals = [
    ['v ちがい', { v: 2 }],
    ['id なし', { id: undefined }],
    ['名前が空', { name: '  ' }],
    ['名前が長すぎ', { name: 'あ'.repeat(31) }],
    ['名前に改行', { name: '小数\nテスト' }],
    ['名前が数', { name: 123 }],
    ['日にちの形', { date: '2026/11/28' }],
    ['ない日にち', { date: '2026-02-30' }],
    ['13月', { date: '2026-13-01' }],
    ['created が日時でない', { created: 'きのう' }],
    ['classes が配列でない', { classes: 'x' }],
    ['授業の日の形', { classes: [{ date: '11-24', minutes: 20 }] }],
    ['授業の日がゴールの後', { classes: [{ date: '2026-11-29', minutes: 20 }] }],
    ['同じ日の授業', { classes: [{ date: '2026-11-24', minutes: 20 }, { date: '2026-11-24', minutes: 15 }] }],
    ['分が0', { classes: [{ date: '2026-11-24', minutes: 0 }] }],
    ['分が多すぎ', { classes: [{ date: '2026-11-24', minutes: 120 }] }],
    ['分が小数', { classes: [{ date: '2026-11-24', minutes: 17.5 }] }],
    ['分が文字', { classes: [{ date: '2026-11-24', minutes: '20' }] }],
    ['第○時が0', { classes: [{ date: '2026-11-24', minutes: 20, lesson: 0 }] }],
    ['メモが長すぎ', { classes: [{ date: '2026-11-24', minutes: 20, note: 'あ'.repeat(41) }] }],
    ['授業が多すぎ', { classes: new Array(121).fill(0).map(function (_, i) { return { date: '2026-11-24', minutes: 20 + i }; }) }]
  ];
  for (const b of badGoals) {
    await (async function (b) {
      await test('ゴール拒否: ' + b[0], async function () {
        var g = goalOf(b[1]);
        assert.strictEqual(Share.validateGoal(g).ok, false);
        assert.ok(typeof Share.validateGoal(g).error === 'string');
        await rejects(Share.encodeGoal(g), 'INVALID', b[0]);
      });
    })(b);
  }
  async function forgeK(ch, obj, inkBytes, mask) {
    var j = jsonBytes(obj);
    var bytes = [mask || 0].concat(vu(j.length), j, inkBytes || []);
    var comp = await Share._.deflate(new Uint8Array(bytes));
    var body = ch + Share._.b64enc(comp);
    return body + Share._.checksum(body);
  }
  await test('ゴール：自作の正しいトークンは通る', async function () {
    var g = await Share.decodeGoal(await forgeK('g', { v: 1, id: 'g-a', name: 'テスト', date: '2026-11-28', classes: [] }));
    assert.strictEqual(g.name, 'テスト');
  });
  var brokenGoals = [
    ['途中で切れた', function () { return tGoal.slice(0, Math.floor(tGoal.length / 2)); }],
    ['1文字かわった', function () { return tGoal.slice(0, 12) + (tGoal[12] === 'A' ? 'B' : 'A') + tGoal.slice(13); }],
    ['末尾が欠けた', function () { return tGoal.slice(0, -1); }],
    ['中身の日にちが不正', function () { return forgeK('g', { v: 1, id: 'g-a', name: 'テスト', date: '2026-11-31', classes: [] }); }],
    ['中身の分が不正', function () { return forgeK('g', { v: 1, id: 'g-a', name: 'テスト', date: '2026-11-28', classes: [{ date: '2026-11-20', minutes: 999 }] }); }],
    ['中身が配列', function () { return forgeK('g', [1, 2]); }],
    ['インクがついている', function () { return forgeK('g', { v: 1, id: 'g-a', name: 'テスト', date: '2026-11-28' }, okInk, 1); }],
    ['空', function () { return ''; }]
  ];
  for (const b of brokenGoals) {
    await (async function (b) {
      await test('ゴール decode 拒否: ' + b[0], async function () { await rejects(Promise.resolve(b[1]()).then(Share.decodeGoal), null, b[0]); });
    })(b);
  }

  console.log('■ ふりかえりのコード（追加4）');
  function reflOf(extra) {
    var r = { v: 1, date: '2026-11-24', name: nameInk(),
      meate: { choices: ['筆算の小数点をそろえる'], ink: textInk(800, 200, 1, 18) },
      y: { auto: ['第7時 れんしゅう 8問中7問○', 'ヒント 1回', 'もらった星 2こ'], extra: ['友だちに教えた'] },
      w: { eval: 'double', choices: ['6−0.52 を 6.00 と考えてできた'], ink: textInk(800, 300, 2, 30) },
      t: { choices: ['ふくしゅう「ひき算」'], ink: textInk(800, 200, 1, 20) },
      aid: 'abcDEF12' };
    for (var k in extra) r[k] = extra[k];
    return r;
  }
  var tRefl = null, reflSrc = null;
  await test('ふりかえり：往復（インク4つ・文）', async function () {
    reflSrc = reflOf();
    tRefl = await Share.encodeReflection(reflSrc);
    assert.strictEqual(tRefl.charAt(0), 'r');
    assert.ok(tRefl.length <= Share.MAX_LEN, 'len ' + tRefl.length);
    var r = await Share.decodeReflection(tRefl);
    assert.strictEqual(r.date, '2026-11-24');
    assert.deepStrictEqual(r.meate.choices, reflSrc.meate.choices);
    assert.deepStrictEqual(r.y, reflSrc.y);
    assert.strictEqual(r.w.eval, 'double');
    assert.deepStrictEqual(r.w.choices, reflSrc.w.choices);
    assert.deepStrictEqual(r.t.choices, reflSrc.t.choices);
    assert.strictEqual(r.aid, 'abcDEF12');
    inkClose(reflSrc.name, r.name, 1.5);
    inkClose(reflSrc.meate.ink, r.meate.ink, 1.5);
    inkClose(reflSrc.w.ink, r.w.ink, 1.5);
    inkClose(reflSrc.t.ink, r.t.ink, 1.5);
    console.log('      ふりかえり（インク4つ）: ' + tRefl.length + ' 文字');
  });
  await test('ふりかえり：インクなし・項目なしでもよい', async function () {
    var t = await Share.encodeReflection({ v: 1, date: '2026-11-25', name: null, meate: { choices: [], ink: null }, y: {}, w: { eval: null }, t: {} });
    var r = await Share.decodeReflection(t);
    assert.strictEqual(r.name, null);
    assert.strictEqual(r.meate.ink, null);
    assert.strictEqual(r.w.eval, null);
    assert.deepStrictEqual(r.y, { auto: [], extra: [] });
    assert.ok(!('aid' in r));
  });
  await test('ふりかえり：空のインク（線なし）は null になる', async function () {
    var r = await Share.decodeReflection(await Share.encodeReflection(reflOf({ name: { w: 300, h: 100, strokes: [] }, t: { choices: [], ink: { w: 800, h: 200, strokes: [[]] } } })));
    assert.strictEqual(r.name, null);
    assert.strictEqual(r.t.ink, null);
  });
  await test('ふりかえり：手書きが多くても強く間引いて上限内にする', async function () {
    var big = reflOf({ w: { eval: 'single', choices: [], ink: textInk(800, 300, 3, 60) }, t: { choices: [], ink: textInk(800, 300, 3, 60) },
      meate: { choices: [], ink: textInk(800, 200, 2, 40) } });
    var t = await Share.encodeReflection(big);
    assert.ok(t.length <= Share.MAX_LEN, 'len ' + t.length);
    var r = await Share.decodeReflection(t);
    assert.strictEqual(r.w.ink.strokes.length, big.w.ink.strokes.length, '画数は変わらない');
    console.log('      ふりかえり（手書きたくさん）: ' + t.length + ' 文字');
  });
  function dots(n) {        // 2点だけの短い線をばらばらに（間引けない）
    var st = [];
    for (var i = 0; i < n; i++) { var x = rr(0, 790), y = rr(0, 290); st.push([{ x: x, y: y }, { x: x + rr(3, 9), y: y + rr(3, 9) }]); }
    return { w: 800, h: 300, strokes: st };
  }
  await test('ふりかえり：間引いても長すぎるときは W・T の手書きを落とす（文は残す・cut の印）', async function () {
    var huge = reflOf({ w: { eval: 'single', choices: ['できた'], ink: dots(500) }, t: { choices: ['つぎ'], ink: dots(500) },
      meate: { choices: [], ink: textInk(800, 200, 1, 10) } });
    var t = await Share.encodeReflection(huge);
    assert.ok(t.length <= Share.MAX_LEN);
    var r = await Share.decodeReflection(t);
    assert.strictEqual(r.w.ink, null); assert.strictEqual(r.t.ink, null);
    assert.ok(r.meate.ink && r.name, 'めあて・名前の手書きは残る');
    assert.deepStrictEqual(r.w.choices, ['できた']);
    assert.strictEqual(r.cut, 1);
  });
  await test('ふりかえり：どうしても長すぎるときは TOO_LONG', async function () {
    function rnds(n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(0x4e00 + ri(0, 20000)); return s; }
    function many(k, len) { var a = []; for (var i = 0; i < k; i++) a.push(rnds(len)); return a; }
    var huge = reflOf({ meate: { choices: many(10, 120), ink: dots(500) }, y: { auto: many(20, 120), extra: many(12, 60) },
      w: { eval: 'single', choices: many(10, 120), ink: dots(500) }, t: { choices: many(10, 120), ink: dots(500) } });
    var e = await rejects(Share.encodeReflection(huge), 'TOO_LONG', 'huge');
    assert.ok(e.length > Share.MAX_LEN);
  });
  var badRefls = [
    ['v ちがい', { v: 2 }],
    ['日にちなし', { date: undefined }],
    ['日にちの形', { date: '2026-11-24T00:00' }],
    ['自己評価ちがい', { w: { eval: 'great', choices: [] } }],
    ['めあてが文字列', { meate: 'がんばる' }],
    ['めあての候補が多すぎ', { meate: { choices: new Array(11).fill('a') } }],
    ['めあての文が長すぎ', { meate: { choices: ['あ'.repeat(121)] } }],
    ['T の items が多すぎ', { t: { choices: [], items: new Array(11).fill('lesson-1') } }],
    ['saved が日時でない', { saved: 'あした' }],
    ['めあての文が数', { meate: { choices: [3] } }],
    ['やったことに改行', { y: { auto: ['a\nb'] } }],
    ['やったことが多すぎ', { y: { auto: new Array(25).fill('a') } }],
    ['T が配列', { t: ['a'] }],
    ['名前インクが不正', { name: { w: 0, h: 10, strokes: [] } }],
    ['W インクの点が不正', { w: { eval: 'single', ink: { w: 800, h: 300, strokes: [[{ x: NaN, y: 1 }]] } } }],
  ];
  await test('ふりかえり：aid が正しい形でなければ入れないだけ・t.items と saved は運ぶ', async function () {
    var r = await Share.decodeReflection(await Share.encodeReflection(reflOf({ aid: '!!', saved: '2026-11-24T06:00:00.000Z',
      t: { choices: ['まとめモード'], ink: null, items: ['matome-normal-10', 'review-hikizan'] } })));
    assert.ok(!('aid' in r));
    assert.strictEqual(r.saved, '2026-11-24T06:00:00.000Z');
    assert.deepStrictEqual(r.t.items, ['matome-normal-10', 'review-hikizan']);
    var r2 = await Share.decodeReflection(await Share.encodeReflection(reflOf({ aid: '' })));
    assert.ok(!('aid' in r2) && !('items' in r2.t));
  });
  await test('ふりかえり：担当Mの上限（120文字・候補10こ）まで入る', async function () {
    var long = 'あ'.repeat(120), ten = new Array(10).fill(long);
    var r = await Share.decodeReflection(await Share.encodeReflection(reflOf({ meate: { choices: ten }, w: { eval: 'single', choices: ten }, t: { choices: ten },
      y: { auto: new Array(20).fill(long), extra: new Array(12).fill('い'.repeat(60)) } })));
    assert.strictEqual(r.w.choices.length, 10);
  });
  for (const b of badRefls) {
    await (async function (b) {
      await test('ふりかえり拒否: ' + b[0], async function () {
        var r = reflOf(b[1]);
        assert.strictEqual(Share.validateReflection(r).ok, false);
        await rejects(Share.encodeReflection(r), 'INVALID', b[0]);
      });
    })(b);
  }
  var brokenRefls = [
    ['途中で切れた', function () { return tRefl.slice(0, 200); }],
    ['1文字かわった', function () { return tRefl.slice(0, 30) + (tRefl[30] === 'A' ? 'B' : 'A') + tRefl.slice(31); }],
    ['中身の自己評価が不正', function () { return forgeK('r', { v: 1, date: '2026-11-24', w: { eval: 'x' } }); }],
    ['中身の日にちが不正', function () { return forgeK('r', { v: 1, date: 'x' }); }],
    ['インクの有無ビットが不正', function () { return forgeK('r', { v: 1, date: '2026-11-24' }, okInk, 16); }],
    ['インクが途中で切れた', function () { return forgeK('r', { v: 1, date: '2026-11-24' }, [].concat(vu(300), vu(100), vu(1), vu(3), zz(1)), 1); }],
    ['後ろに余分なデータ', function () { return forgeK('r', { v: 1, date: '2026-11-24' }, okInk.concat([0]), 1); }]
  ];
  for (const b of brokenRefls) {
    await (async function (b) {
      await test('ふりかえり decode 拒否: ' + b[0], async function () { await rejects(Promise.resolve(b[1]()).then(Share.decodeReflection), null, b[0]); });
    })(b);
  }
  await test('ふりかえり：自作の正しいトークン（インク1つ）は通る', async function () {
    var r = await Share.decodeReflection(await forgeK('r', { v: 1, date: '2026-11-24' }, okInk, 4));
    assert.ok(r.w.ink && r.w.ink.strokes.length === 1);
    assert.strictEqual(r.name, null);
  });

  console.log('■ 追加6：作った人の名前（文字）・プロフィール・学習のまとめ・学習のきろく・Forms');
  await test('問題：authorName（文字）だけで作れる・往復・toProblem に authorName', async function () {
    var up = base('hissan', { op: '+', a: '1.2', b: '3.45', author: null, authorName: '山田 花子' });
    assert.ok(Share.validate(up).ok);
    var t = await Share.encode(up);
    var back = await Share.decode(t);
    assert.strictEqual(back.authorName, '山田 花子');
    assert.strictEqual(back.author, null);
    var p = Share.toProblem(back);
    assert.strictEqual(p.authorName, '山田 花子');
    assert.strictEqual(p.authorInk, null);
    console.log('      筆算＋名前（文字）: ' + t.length + ' 文字');
  });
  await test('問題：古い手書きの名前の問題もそのまま開ける（authorName なし）', async function () {
    var back = await Share.decode(tA);
    assert.ok(back.author && back.author.strokes.length);
    assert.ok(!('authorName' in back));
    assert.strictEqual(Share.toProblem(back).authorName, null);
  });
  await test('問題：authorName と手書きの両方があってもよい', async function () {
    var back = await Share.decode(await Share.encode(base('compare', { a: '0.4', b: '0.41', authorName: 'たろう' })));
    assert.strictEqual(back.authorName, 'たろう');
    assert.ok(back.author && back.author.strokes.length);
  });
  for (const b of [['名前が長すぎ', 'あ'.repeat(31)], ['名前が空', '  '], ['名前に改行', 'a\nb'], ['名前が数', 12]]) {
    await test('問題拒否（authorName）: ' + b[0], async function () {
      var up = base('hissan', { op: '+', a: '1.2', b: '3.4', author: null, authorName: b[1] });
      assert.strictEqual(Share.validate(up).ok, false);
      await rejects(Share.encode(up), 'INVALID', b[0]);
    });
  }
  await test('問題 decode 拒否：名前の手書きも文字もない', async function () {
    await rejects(forgeK('1', { v: 1, kind: 'compare', a: '1', b: '2' }, [], 0).then(Share.decode), null, 'noname');
  });

  var PROF = { cls: 3, no: 12, name: '山田 花子' };
  function sampleSummary() {
    var sk = {};
    ['rep-001', 'unit-m', 'numberline', 'kui', 'rep-0001', 'unit-k', 'place-name', 'compose', 'count-units', 'cmp-two', 'cmp-digits', 'order',
      'times10', 'times100', 'div10', 'add-nocarry', 'add-carry', 'add-mis', 'add-trail0', 'sub-noborrow', 'sub-borrow', 'sub-multi', 'sub-int', 'laws']
      .forEach(function (id, i) { sk[id] = { st: ['weak', 'soso', 'strong', 'unknown'][i % 4], acc: Math.round(rnd() * 100) / 100, sp: i % 4 === 3 ? null : Math.round(rr(0.5, 2) * 100) / 100, n: ri(0, 20), h: 0.1 }; });
    var ls = [];
    for (var i = 1; i <= 10; i++) ls.push({ no: i, tried: ri(0, 19), total: 19, correct: ri(0, 19), firstRate: Math.round(rnd() * 100) / 100, avgSec: ri(10, 90) });
    return { v: 1, at: '2026-11-24T05:00:00.000Z', profile: PROF, lessons: ls, skills: sk,
      matome: { n: 3, q: 40, c: 33, rate: 0.83, fin: 2, lv: { easy: 1, normal: 1, hard: 1 } },
      osusume: { n: 2, q: 20, c: 17, rate: 0.85, fin: 2, min: 20 }, review: { n: 4, q: 20, c: 18, rate: 0.9 }, more: { n: 3, q: 15, c: 12, rate: 0.8 },
      make: { n: 3, kinds: { hissan: 2, fill: 1 } }, friend: { n: 4, c: 3 }, plan: { days: 5, ok: 3 },
      reflect: { n: 6, ev: { double: 2, single: 3, triangle: 1 }, extra: 4, prevT: 2, w: 5, judged: 5, match: 4 },
      stars: { n: 30, sp: 4, title: 'ほしのたびびと' }, habit: { q: 200, hint: 0.12, miss: 30, fixed: 25, think: { q: 30, c: 24 } },
      days: 9, min: 180, last: '2026-11-24' };
  }
  var tReflS = null, tRec = null;
  await test('ふりかえり：profile と summary を運ぶ（手書き4つと一緒でも上限内）', async function () {
    var sm = sampleSummary();
    tReflS = await Share.encodeReflection(reflOf({ name: null, profile: PROF, summary: sm }));
    assert.ok(tReflS.length <= Share.MAX_LEN, 'len ' + tReflS.length);
    var r = await Share.decodeReflection(tReflS);
    assert.deepStrictEqual(r.profile, PROF);
    assert.deepStrictEqual(r.summary, sm);
    assert.ok(r.w.ink && r.t.ink, '手書きも残る');
    console.log('      ふりかえり（手書き3つ＋まとめ）: ' + tReflS.length + ' 文字 / まとめのJSON ' + JSON.stringify(sm).length + ' 文字');
  });
  await test('ふりかえり：まとめ＋手書きたくさん → W・T の手書きを落としても summary は残る', async function () {
    var r0 = reflOf({ profile: PROF, summary: sampleSummary(), w: { eval: 'single', choices: [], ink: dots(450) }, t: { choices: [], ink: dots(450) } });
    var t = await Share.encodeReflection(r0);
    assert.ok(t.length <= Share.MAX_LEN);
    var r = await Share.decodeReflection(t);
    assert.ok(r.summary && r.summary.lessons.length === 10);
    assert.strictEqual(r.cut, 1);
  });
  for (const b of [['組が0', { profile: { cls: 0, no: 1, name: 'a' } }], ['番号が46', { profile: { cls: 1, no: 46, name: 'a' } }],
    ['名前が長すぎ', { profile: { cls: 1, no: 1, name: 'あ'.repeat(31) } }], ['名前が空', { profile: { cls: 1, no: 1, name: '' } }],
    ['名前に <', { profile: { cls: 1, no: 1, name: '<b>' } }],
    ['まとめが配列', { summary: [1] }], ['まとめの版', { summary: { v: 2 } }], ['まとめの文字が長すぎ', { summary: { v: 1, x: 'あ'.repeat(61) } }],
    ['まとめが深すぎ', { summary: { v: 1, a: { b: { c: { d: { e: { f: 1 } } } } } } }], ['まとめに NaN', { summary: { v: 1, a: NaN } }],
    ['まとめの配列が長すぎ', { summary: { v: 1, a: new Array(41).fill(0) } }], ['まとめに関数', { summary: { v: 1, a: function () {} } }]
  ]) {
    await test('ふりかえり拒否（追加6）: ' + b[0], async function () {
      var r = reflOf(b[1]);
      assert.strictEqual(Share.validateReflection(r).ok, false);
      await rejects(Share.encodeReflection(r), 'INVALID', b[0]);
    });
  }
  await test('学習のきろく：往復・kindOf は record・codeText は #/k/', async function () {
    var sm = sampleSummary();
    tRec = await Share.encodeRecord({ profile: PROF, summary: sm });
    assert.strictEqual(tRec.charAt(0), 'k');
    assert.ok(tRec.length <= Share.MAX_LEN);
    var rec = await Share.decodeRecord(tRec);
    assert.deepStrictEqual(rec.profile, PROF);
    assert.deepStrictEqual(rec.summary, sm);
    assert.strictEqual(Share.kindOf(tRec), 'record');
    assert.strictEqual(Share.codeText(tRec), 'しょうすうきろく #/k/' + tRec);
    assert.deepStrictEqual(Share.extractTokens('先生へ ' + Share.codeText(tRec) + ' です'), [tRec]);
    assert.strictEqual((await Share.decodeRecord('https://x.jp/a/#/k/' + tRec)).profile.no, 12);
    console.log('      学習のきろく: ' + tRec.length + ' 文字');
  });
  await test('学習のきろく：ちがう種類は WRONG_KIND・こわれたものは拒否', async function () {
    await rejects(Share.decodeRecord(tRefl), 'WRONG_KIND', 'decodeRecord(refl)');
    await rejects(Share.decode(tRec), 'WRONG_KIND', 'decode(record)');
    await rejects(Share.decodeReflection(tRec), 'WRONG_KIND', 'decodeReflection(record)');
    await rejects(Share.decodeGoal(tRec), 'WRONG_KIND', 'decodeGoal(record)');
    await rejects(Share.decodeRecord(tRec.slice(0, -2)), null, '切れた');
    await rejects(forgeK('k', { v: 1, profile: { cls: 1, no: 99, name: 'a' }, summary: { v: 1 } }).then(Share.decodeRecord), 'INVALID', '番号が不正');
    await rejects(forgeK('k', { v: 1, profile: PROF }).then(Share.decodeRecord), 'INVALID', 'まとめなし');
    await rejects(forgeK('k', { v: 1, profile: PROF, summary: { v: 1 } }, okInk, 1).then(Share.decodeRecord), null, 'インクつき');
    await rejects(Share.encodeRecord({ profile: null, summary: sampleSummary() }), 'INVALID', 'プロフィールなし');
  });
  await test('ゴール：formsUrl（https の Forms のURL）を運ぶ', async function () {
    var u = 'https://forms.office.com/Pages/ResponsePage.aspx?id=AbC-123_x';
    assert.ok(Share.validateGoal(goalOf({ formsUrl: u })).ok);
    var g = await Share.decodeGoal(await Share.encodeGoal(goalOf({ formsUrl: u })));
    assert.strictEqual(g.formsUrl, u);
    ['https://forms.microsoft.com/r/abc', 'https://forms.cloud.microsoft/r/abc', 'https://docs.google.com/forms/d/e/x/viewform', 'https://forms.gle/abc']
      .forEach(function (x) { assert.ok(Share.isFormsUrl(x), x); });
    var g2 = await Share.decodeGoal(await Share.encodeGoal(goalOf({ formsUrl: '' })));
    assert.ok(!('formsUrl' in g2), '空なら入れない');
  });
  for (const b of [['http', 'http://forms.office.com/r/abc'], ['ほかのサイト', 'https://example.com/forms'], ['にせのホスト', 'https://forms.office.com.evil.jp/r'],
    ['javascript', 'javascript:alert(1)'], ['空白', 'https://forms.office.com/r/a b'], ['Google のフォーム以外', 'https://docs.google.com/document/d/x'],
    ['長すぎ', 'https://forms.office.com/' + 'a'.repeat(400)], ['数', 12]]) {
    await test('ゴール拒否（formsUrl）: ' + b[0], async function () {
      var g = goalOf({ formsUrl: b[1] });
      assert.strictEqual(Share.validateGoal(g).ok, false);
      await rejects(Share.encodeGoal(g), 'INVALID', b[0]);
    });
  }

  console.log('■ 種類の見分け（kindOf・extractTokens・codeText）');
  await test('kindOf：3しゅるいを見分ける', async function () {
    assert.strictEqual(Share.kindOf(tA), 'problem');
    assert.strictEqual(Share.kindOf(tGoal), 'goal');
    assert.strictEqual(Share.kindOf(tRefl), 'reflection');
    assert.strictEqual(Share.kindOf(U + '#/g/' + tGoal), 'goal');
    assert.strictEqual(Share.kindOf('しょうすうふりかえり #/r/' + tRefl), 'reflection');
  });
  await test('kindOf：こわれたもの・関係ないものは null', async function () {
    assert.strictEqual(Share.kindOf(tGoal.slice(0, -1)), null);
    assert.strictEqual(Share.kindOf('2' + tA.slice(1)), null);
    assert.strictEqual(Share.kindOf('x' + tA.slice(1)), null);
    assert.strictEqual(Share.kindOf(''), null);
    assert.strictEqual(Share.kindOf(null), null);
    assert.strictEqual(Share.kindOf(12), null);
    assert.strictEqual(Share.kindOf(tA.slice(0, 10) + '!' + tA.slice(11)), null);
  });
  await test('ちがう種類の decode は WRONG_KIND', async function () {
    await rejects(Share.decode(tGoal), 'WRONG_KIND', 'decode(goal)');
    await rejects(Share.decode(tRefl), 'WRONG_KIND', 'decode(refl)');
    await rejects(Share.decodeGoal(tA), 'WRONG_KIND', 'decodeGoal(problem)');
    await rejects(Share.decodeGoal(tRefl), 'WRONG_KIND', 'decodeGoal(refl)');
    await rejects(Share.decodeReflection(tGoal), 'WRONG_KIND', 'decodeReflection(goal)');
    await rejects(Share.decodeReflection(tA), 'WRONG_KIND', 'decodeReflection(problem)');
  });
  await test('extractTokens：3しゅるいをまとめて取り出す（順番どおり・重複なし）', async function () {
    var text = ['先生へ', U + '#/r/' + tRefl.slice(0, 60) + '\n' + tRefl.slice(60), 'ゴール ' + U + '#/g/' + tGoal + '。',
      '<' + U + '#/q/' + tA + '>', 'しょうすうゴール #/g/' + tGoal, U + '#/rbox', U + '#/g/' + tGoal.slice(0, -3)].join('\n');
    assert.deepStrictEqual(Share.extractTokens(text), [tRefl, tGoal, tA]);
  });
  await test('extractTokens：%23 と大文字のパスも', async function () {
    assert.deepStrictEqual(Share.extractTokens(U + '%23/g/' + tGoal + ' ' + U + '#/R/' + tRefl), [tGoal, tRefl]);
  });
  await test('codeText：http なら URL、file なら言葉つきのコード', async function () {
    assert.strictEqual(Share.codeText(tA), 'しょうすうもんだい #/q/' + tA);
    assert.strictEqual(Share.codeText(tGoal), 'しょうすうゴール #/g/' + tGoal);
    assert.strictEqual(Share.codeText(tRefl), 'しょうすうふりかえり #/r/' + tRefl);
    globalThis.location = { href: 'https://x.jp/shosu-app/index.html#/teacher' };
    assert.strictEqual(Share.codeText(tGoal), 'https://x.jp/shosu-app/index.html#/g/' + tGoal);
    assert.strictEqual(Share.codeText(tRefl), 'https://x.jp/shosu-app/index.html#/r/' + tRefl);
    assert.strictEqual(Share.codeText(tA), 'https://x.jp/shosu-app/index.html#/q/' + tA);
    globalThis.location = { href: 'file:///C:/Users/a/shosu-app.html#/' };
    assert.strictEqual(Share.codeText(tGoal), 'しょうすうゴール #/g/' + tGoal);
    delete globalThis.location;
  });
  await test('codeText の文を extractTokens にもどすと、もとのトークン', async function () {
    [tA, tGoal, tRefl].forEach(function (t) { assert.deepStrictEqual(Share.extractTokens('どうぞ ' + Share.codeText(t) + ' よろしく'), [t]); });
  });

  console.log('■ Store（つくった問題・もんだいボックス）');
  await test('my: 保存・更新・一覧・削除', async function () {
    assert.deepStrictEqual(Store.myList(), []);
    var id = Store.mySave(samples.hissan);
    assert.ok(typeof id === 'string' && id);
    var id2 = Store.mySave(samples.compare);
    assert.strictEqual(Store.myList().length, 2);
    assert.strictEqual(Store.myList()[0].id, id2, '新しいものが先');
    var u = JSON.parse(JSON.stringify(samples.hissan)); u.a = '5.5';
    assert.strictEqual(Store.mySave(u, id), id);
    var item = Store.myList().filter(function (x) { return x.id === id; })[0];
    assert.strictEqual(item.up.a, '5.5');
    assert.ok(item.updated >= item.created);
    assert.ok(Share.validate(item.up).ok, '保存したものは検証を通る');
    assert.ok(storage.getItem('shosu.my'), 'キーは shosu.my');
    assert.strictEqual(Store.myDelete(id), true);
    assert.strictEqual(Store.myDelete('nope'), false);
    assert.strictEqual(Store.myList().length, 1);
  });
  await test('box: 追加（重複除く）・削除・全消し', async function () {
    assert.strictEqual(Store.boxAdd([{ token: tA, up: samples.hissan }, { token: tB, up: samples.compare }, { token: tA, up: samples.hissan }]), 2);
    assert.strictEqual(Store.boxAdd([{ token: tA, up: samples.hissan }]), 0);
    assert.strictEqual(Store.boxList().length, 2);
    assert.ok(storage.getItem('shosu.box'), 'キーは shosu.box');
    assert.strictEqual(Store.boxList()[0].token, tA);
    assert.ok(Store.boxList()[0].added > 0);
    assert.strictEqual(Store.boxRemove(tA), true);
    assert.deepStrictEqual(Store.boxList().map(function (x) { return x.token; }), [tB]);
    assert.strictEqual(Store.boxClear(), true);
    assert.deepStrictEqual(Store.boxList(), []);
  });
  await test('容量超過でも例外を投げず false', async function () {
    storage.quota = 3000;
    var big = base('fill', { q: textInk(800, 300, 2, 60), answer: '1', unit: 'L' });
    var r;
    assert.doesNotThrow(function () { r = Store.mySave(big); });
    assert.strictEqual(r, false);
    assert.doesNotThrow(function () { r = Store.boxAdd([{ token: tF, up: big }]); });
    assert.strictEqual(r, false);
    assert.strictEqual(Store.boxList().length, 0);
    storage.quota = 5e6;
  });
  await test('既存の Store API はそのまま動く', async function () {
    Store.record('friend', tA.slice(0, 16), { correct: true, method: 'auto', hints: 0 });
    assert.strictEqual(Store.stats('friend').correct, 1);
    Store.resetAll();
    assert.strictEqual(Store.stats('friend').tried, 0);
    assert.strictEqual(Store.myList().length, 1, 'resetAll は記録だけ消す');
  });

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (r1) console.log('長さの目安（中央値）: 筆算＋名前 ' + r0.median + ' / 文章1行＋名前 ' + r1.median + ' / 文章2行＋名前＋ヒント ' + r2.median + '（上限 ' + Share.MAX_LEN + '）');
  process.exit(failed ? 1 : 0);
})();
