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
    assert.strictEqual(Share.url('1abc'), '#/q/1abc');
    globalThis.location = { href: 'https://x.jp/shosu-app/index.html#/home' };
    assert.strictEqual(Share.url('1abc'), 'https://x.jp/shosu-app/index.html#/q/1abc');
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
