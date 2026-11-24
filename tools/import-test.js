#!/usr/bin/env node
/* クラスのきろく（js/classbook.js）の取りこみ・CSV のテスト
 *   node tools/import-test.js
 * Forms 風の xlsx（無圧縮・deflate）、csv、Shift_JIS の txt、zip の中の xlsx、重複・上書き、
 * 同じ日のふりかえり、こわれたコード、組・番号なし、CSV のエスケープ、容量いっぱいのときを確かめる。
 * コードの読み書きは、テスト用の小さな Share（下の StubShare）で行う。js/share.js が
 * 学習のきろく（encodeRecord）に対応していれば、本物でも1回ためす。
 */
'use strict';
var path = require('path');
var assert = require('assert');
var zlib = require('zlib');

/* ---------- Node で読むための localStorage（容量制限つき） ---------- */
function FakeStorage(quota) {
  var d = {};
  this.quota = quota;
  this.getItem = function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; };
  this.setItem = function (k, v) {
    v = String(v);
    var used = 0;
    for (var x in d) if (x !== k) used += x.length + d[x].length;
    if (used + k.length + v.length > this.quota) { var e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    d[k] = v;
  };
  this.removeItem = function (k) { delete d[k]; };
  this.clear = function () { d = {}; };
}
var storage = new FakeStorage(5e6);
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });

// 本物の share.js（あとで1回だけ使う）。読みこむと Shosu.Share が入るので、先に取っておく
var RealShare = require(path.join(__dirname, '..', 'js', 'share.js'));
var Classbook = require(path.join(__dirname, '..', 'js', 'classbook.js'));
var S = globalThis.Shosu;

/* ---------- テスト用の Share：kind文字 + base64url(JSON) + チェック5文字 ---------- */
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
function check(h) { h = h & 0x3fffffff; var o = ''; for (var i = 0; i < 5; i++) { o += B64.charAt(h & 63); h >>>= 6; } return o; }
var KIND = { '1': 'problem', g: 'goal', r: 'reflection', k: 'record' };
var StubShare = {
  make: function (ch, obj) {
    var body = ch + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
    return body + check(fnv(body));
  },
  extractTokens: function (text) {
    var out = [], seen = {}, re = /(?:#|%23)\/[qgrk]\//gi, m;
    while ((m = re.exec(text))) {
      var i = m.index + m[0].length, chars = [], gap = [];
      while (i < text.length && chars.length < 400000) {
        var c = text.charAt(i);
        if (B64.indexOf(c) >= 0) { chars.push(c); gap.push(false); i++; continue; }
        if (/[\s\u200b-\u200d\ufeff　]/.test(c)) { if (chars.length) gap[chars.length - 1] = true; i++; continue; }
        break;
      }
      if (chars.length) gap[chars.length - 1] = true;
      var s = chars.join(''), found = -1, fb = -1, h = 0x811c9dc5;
      if (KIND[s.charAt(0)]) {
        for (var n = 0; n < s.length; n++) {
          if (n >= 3 && n + 5 <= s.length && s.substr(n, 5) === check(h)) { if (gap[n + 4]) { found = n + 5; break; } if (fb < 0) fb = n + 5; }
          h ^= s.charCodeAt(n); h = Math.imul(h, 0x01000193) >>> 0;
        }
      }
      var len = found >= 0 ? found : fb;
      if (len > 0) { var t = s.slice(0, len); if (!seen[t]) { seen[t] = 1; out.push(t); } }
    }
    return out;
  },
  kindOf: function (t) {
    var k = KIND[t.charAt(0)];
    if (!k || t.length < 8) return null;
    return check(fnv(t.slice(0, -5))) === t.slice(-5) ? k : null;
  },
  dec: function (t, ch) {
    return Promise.resolve().then(function () {
      if (t.charAt(0) !== ch || check(fnv(t.slice(0, -5))) !== t.slice(-5)) throw new Error('bad');
      return JSON.parse(Buffer.from(t.slice(1, -5), 'base64url').toString('utf8'));
    });
  },
  decodeReflection: function (t) { return StubShare.dec(t, 'r'); },
  decodeRecord: function (t) { return StubShare.dec(t, 'k'); }
};
S.Share = StubShare;

/* ---------- テスト用の Assess（担当R の assess.js がなくても CSV を確かめる） ---------- */
S.Assess = {
  DEFAULTS: { know: { A: 0.9, B: 0.7 }, think: { A: 0.8, B: 0.55 }, attitude: { A: 0.75, B: 0.5 }, minLessons: 6 },
  settings: function () { return this.DEFAULTS; },
  setSettings: function () {},
  evaluate: function (st) {
    var acc = st.summary && st.summary.acc || 0;
    var g = acc >= 0.9 ? 'A' : acc >= 0.7 ? 'B' : 'C';
    return { know: { grade: g, score: acc, reasons: ['正答率 ' + Math.round(acc * 100) + '%'], enough: true },
      think: { grade: 'B', score: 0.6, reasons: [], enough: true }, attitude: { grade: 'A', score: 0.8, reasons: [], enough: st.reflections.length > 0 } };
  },
  support: function (st) { return [{ kind: 'skill', text: 'くり下がりのひき算, "位"をそろえる' }, { kind: 'habit', text: '目安の時間を伝える' }]; },
  comment: function (st, o) { return (st.profile.name || '') + 'さんは、' + (o.length === 'long' ? '長い所見の案です。' : '短い案。') + '（v' + o.variant + '・前' + o.cls.length + '）'; }
};

/* ---------- データを作る ---------- */
function ink(n) {
  var st = [];
  for (var i = 0; i < n; i++) { var s = []; for (var j = 0; j < 20; j++) s.push({ x: 10 + j * 30 + i, y: 50 + ((i * 7 + j * 13) % 200) }); st.push(s); }
  return { w: 800, h: 300, strokes: st };
}
function summary(cls, no, name, at, acc) {
  var lessons = [];
  for (var i = 0; i < 10; i++) lessons.push(i < 7 ? { n: 8, ok: 7, first: 0.75, sec: 40 } : null);
  return { v: 1, at: at, profile: { cls: cls, no: no, name: name }, lessons: lessons, acc: acc, days: 5, minutes: 95,
    skills: { 'sub-borrow': { st: 'weak', acc: 0.5, n: 6 } }, matome: { n: 2, acc: 0.8 }, stars: { normal: 20 } };
}
function refl(date, saved, extra) {
  var r = { v: 1, date: date, saved: saved, meate: { choices: ['小数のたし算をできるようにする'] }, y: { auto: ['第7時をやった'], extra: [] },
    w: { eval: 'double', choices: ['位をそろえるとできた'], ink: null }, t: { choices: ['ひき算もやりたい'] }, aid: 'abcd1234' };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
function recTok(cls, no, name, at, acc) { return StubShare.make('k', { profile: { cls: cls, no: no, name: name }, summary: summary(cls, no, name, at, acc) }); }
function reflTok(cls, no, name, date, saved, at, acc, extra) {
  var r = refl(date, saved, extra);
  if (cls) { r.profile = { cls: cls, no: no, name: name }; r.summary = summary(cls, no, name, at, acc); }
  return StubShare.make('r', r);
}
function codeText(t) { return 'https://example.github.io/shosu/#/' + (t.charAt(0) === 'k' ? 'k' : 'r') + '/' + t; }

/* ---------- ZIP を作る（無圧縮 / deflate） ---------- */
var CRC = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makeZip(files, deflate) {
  var locals = [], central = [], off = 0;
  files.forEach(function (f) {
    var name = Buffer.from(f.name, 'utf8'), data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    var comp = deflate ? zlib.deflateRawSync(data) : data, method = deflate ? 8 : 0, crc = crc32(data);
    var lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    var ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(off, 42);
    central.push(ch, name);
    off += 30 + name.length + comp.length;
  });
  var cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat(locals.concat([cd, e]));
}
function xmlEsc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Forms の「Excel で開く」に似た xlsx（ID・開始時刻・完了時刻・メール・名前・回答）
function makeXlsx(answers, deflate) {
  var strs = ['ID', '開始時刻', '完了時刻', 'メール', '名前', 'コードをはりつけてください'];
  var rows = [[0, 1, 2, 3, 4, 5]];
  answers.forEach(function (a, i) { strs.push('anonymous'); strs.push(a); rows.push([String(i + 1), 46000 + i, 46000 + i, strs.length - 2, strs.length - 2, strs.length - 1]); });
  var si = strs.map(function (s, i) {
    if (i === strs.length - 1 && s.length > 40) {   // 最後の回答は、書式つき（文字の途中で <r> が分かれる）
      var mid = Math.floor(s.length / 2);
      return '<si><r><t xml:space="preserve">' + xmlEsc(s.slice(0, mid)) + '</t></r><r><rPr><b/></rPr><t>' + xmlEsc(s.slice(mid)) + '</t></r><rPh sb="0" eb="1"><t>ふりがな</t></rPh></si>';
    }
    return '<si><t xml:space="preserve">' + xmlEsc(s).replace(/\n/g, '_x000D_\n') + '</t></si>';
  }).join('');
  var sst = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="' + strs.length + '" uniqueCount="' + strs.length + '">' + si + '</sst>';
  var cols = 'ABCDEF';
  var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    rows.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        var ref = cols.charAt(ci) + (ri + 1);
        if (ri === 0 || ci >= 3) return '<c r="' + ref + '" t="s"><v>' + v + '</v></c>';
        return '<c r="' + ref + '"><v>' + v + '</v></c>';
      }).join('') + '</row>';
    }).join('') + '</sheetData></worksheet>';
  return makeZip([
    { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>' },
    { name: '_rels/.rels', data: '<?xml version="1.0"?><Relationships/>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0"?><workbook><sheets><sheet name="Sheet1" sheetId="1"/></sheets></workbook>' },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet1.xml', data: sheet },
    { name: 'xl/styles.xml', data: '<?xml version="1.0"?><styleSheet/>' }
  ], deflate);
}
function file(name, buf) { return new File([buf], name); }
// ひらがなだけを Shift_JIS にする（ぁ U+3041 → 0x829F から続いている）
function sjis(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) {
    var c = text.charCodeAt(i);
    if (c >= 0x3041 && c <= 0x3093) { var v = 0x829f + (c - 0x3041); out.push(v >> 8, v & 255); }
    else if (c < 128) out.push(c);
    else throw new Error('sjis: ' + text.charAt(i));
  }
  return Buffer.from(out);
}
// CSV を読む（テストで書き出しを確かめる）
function parseCsv(s) {
  var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (q) { if (c === '"') { if (s.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && s.charAt(i + 1) === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

var passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('  NG  ' + name + '\n      ' + (e && e.stack || e)); }
}
function db() { return Classbook._.load(); }
function reset() { storage.clear(); storage.quota = 5e6; }

(async function () {
  console.log('classbook: 取りこみ');

  await test('チャットの文章から、学習のきろく・ふりかえりを組と番号に振り分ける', async function () {
    reset();
    var text = 'やまだ 10:02\n' + codeText(recTok(1, 3, '山田花子', '2026-11-20T10:00:00Z', 0.92)) + '\nすずき 10:03\nしょうすうふりかえり ' +
      codeText(reflTok(1, 5, '鈴木一郎', '2026-11-20', '2026-11-20T10:01:00Z', '2026-11-20T10:01:00Z', 0.65)) + '\n' +
      codeText(recTok(2, 1, '佐藤みく', '2026-11-20T10:05:00Z', 0.8)) + '\nもんだい #/q/' + StubShare.make('1', { kind: 'hissan' });
    var r = await Classbook.importText(text);
    assert.strictEqual(r.students, 3);
    assert.strictEqual(r.added, 3);
    assert.strictEqual(r.updated, 0);
    assert.strictEqual(r.bad, 0);
    assert.ok(/3人分を取りこみました（新しく3人、更新0人）/.test(r.message), r.message);
    var d = db();
    assert.deepStrictEqual(Object.keys(d.students).sort(), ['1-3', '1-5', '2-1']);
    assert.strictEqual(d.students['1-5'].reflections.length, 1);
    assert.strictEqual(d.students['1-3'].profile.name, '山田花子');
    var m = Classbook._.metrics(d.students['1-3']);
    assert.strictEqual(m.lessons, 7);
    assert.strictEqual(m.days, 5);
    assert.strictEqual(Math.round(m.acc * 100), 92);
  });

  await test('同じ子は新しい summary で上書き。古いものは上書きしない。同じものは「変わらず」', async function () {
    var r1 = await Classbook.importText(codeText(recTok(1, 3, '山田花子', '2026-11-19T10:00:00Z', 0.5)));   // 古い
    assert.strictEqual(r1.same, 1); assert.strictEqual(r1.updated, 0);
    assert.strictEqual(Math.round(db().students['1-3'].summary.acc * 100), 92);
    var r2 = await Classbook.importText(codeText(recTok(1, 3, '山田はなこ', '2026-11-22T10:00:00Z', 0.97)));  // 新しい
    assert.strictEqual(r2.updated, 1);
    assert.strictEqual(db().students['1-3'].summary.acc, 0.97);
    assert.strictEqual(db().students['1-3'].profile.name, '山田はなこ');
    var r3 = await Classbook.importText(codeText(recTok(1, 3, '山田はなこ', '2026-11-22T10:00:00Z', 0.97)));
    assert.strictEqual(r3.same, 1);
    assert.ok(/変わらず1人/.test(r3.message), r3.message);
  });

  await test('ふりかえりは日付ごとにたまる。同じ日は新しいほう（saved）', async function () {
    var t1 = reflTok(1, 5, '鈴木一郎', '2026-11-21', '2026-11-21T09:00:00Z', '2026-11-21T09:00:00Z', 0.7);
    var t2 = reflTok(1, 5, '鈴木一郎', '2026-11-21', '2026-11-21T15:00:00Z', '2026-11-21T15:00:00Z', 0.72, { t: { choices: ['かいたものを直した'] } });
    var t0 = reflTok(1, 5, '鈴木一郎', '2026-11-21', '2026-11-21T08:00:00Z', '2026-11-21T08:00:00Z', 0.6, { t: { choices: ['いちばん古い'] } });
    var r = await Classbook.importText([t1, t2].map(codeText).join('\n'));
    assert.strictEqual(r.students, 1);
    var st = db().students['1-5'];
    assert.strictEqual(st.reflections.length, 2);
    assert.deepStrictEqual(st.reflections.map(function (x) { return x.date; }), ['2026-11-20', '2026-11-21']);
    assert.deepStrictEqual(st.reflections[1].t.choices, ['かいたものを直した']);
    await Classbook.importText(codeText(t0));        // 古いものは入れない
    assert.deepStrictEqual(db().students['1-5'].reflections[1].t.choices, ['かいたものを直した']);
  });

  await test('こわれたコード（チェックが合わない・中身が読めない）は「開けなかったコード」に数える', async function () {
    var good = reflTok(3, 2, '田中', '2026-11-22', '2026-11-22T10:00:00Z', '2026-11-22T10:00:00Z', 0.8);
    var other = reflTok(3, 7, '森', '2026-11-22', '2026-11-22T10:00:00Z', '2026-11-22T10:00:00Z', 0.8);
    var broken = other.slice(0, 40) + (other.charAt(40) === 'A' ? 'B' : 'A') + other.slice(41);
    var junkBody = 'r' + Buffer.from('{not json', 'utf8').toString('base64url');
    var junk = junkBody + check(fnv(junkBody));
    var r = await Classbook.importText('a ' + codeText(broken) + '\nb ' + codeText(junk) + '\nc ' + codeText(good));
    assert.strictEqual(r.students, 1);
    assert.strictEqual(r.bad, 2, JSON.stringify(r));
    assert.ok(/開けなかったコード2こ/.test(r.message), r.message);
  });

  await test('組・番号のない古いふりかえりは「組・番号なし」に置く（同じ子の同じ日はまとまる）', async function () {
    var a = StubShare.make('r', refl('2026-11-10', '2026-11-10T10:00:00Z', { name: ink(2), aid: 'zzzz9999' }));
    var b = StubShare.make('r', refl('2026-11-10', '2026-11-10T12:00:00Z', { name: ink(2), aid: 'zzzz9999' }));
    var r = await Classbook.importText(codeText(a) + '\n' + codeText(b));
    assert.strictEqual(r.students, 0);
    assert.strictEqual(r.noProfile, 2);
    assert.strictEqual(db().noProfile.length, 1);
    assert.ok(db().noProfile[0].name && db().noProfile[0].name.s.length === 2, '手書きの名前は縮めて残す');
    assert.ok(db().noProfile[0].name.w <= 320);
    assert.ok(/組・番号のないふりかえり2こ/.test(r.message), r.message);
  });

  await test('コードがないとき', async function () {
    var r = await Classbook.importText('こんにちは');
    assert.strictEqual(r.students, 0);
    assert.ok(/見つかりませんでした/.test(r.message));
  });

  console.log('classbook: ファイル');

  await test('Forms 風の xlsx（無圧縮）：sharedStrings の文字と &amp; など・_x000D_・書式つきの文字', async function () {
    reset();
    var ans = [
      'A&B ' + codeText(recTok(4, 1, '青木&太郎', '2026-11-20T10:00:00Z', 0.9)),
      'せんせいへ\n' + codeText(reflTok(4, 2, '<伊藤>', '2026-11-20', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z', 0.7)),
      codeText(recTok(4, 3, '上田', '2026-11-20T10:00:00Z', 0.75))
    ];
    var x = makeXlsx(ans, false);
    var r = await Classbook.importFiles([file('小数のきろく(1-3).xlsx', x)]);
    assert.strictEqual(r.students, 3, r.message);
    assert.strictEqual(r.bad, 0, r.message);
    assert.strictEqual(db().students['4-1'].profile.name, '青木&太郎');
    assert.strictEqual(db().students['4-2'].profile.name, '<伊藤>');
    assert.strictEqual(Classbook._.unescapeXml('&lt;a&gt; &amp;amp; &#x5C0F;&#25968;'), '<a> &amp; 小数');
  });

  await test('Forms 風の xlsx（deflate）と、複数ファイルをまとめて', async function () {
    var x = makeXlsx([codeText(recTok(4, 4, '江藤', '2026-11-21T10:00:00Z', 0.6)), codeText(recTok(4, 1, '青木太郎', '2026-11-22T10:00:00Z', 0.95))], true);
    var csv = '番号,コード\r\n5,"' + codeText(recTok(4, 5, '小野, ゆい', '2026-11-21T10:00:00Z', 0.8)) + '"\r\n';
    var r = await Classbook.importFiles([file('a.xlsx', x), file('b.csv', Buffer.from(csv, 'utf8'))]);
    assert.strictEqual(r.students, 3, r.message);
    assert.strictEqual(r.added, 2); assert.strictEqual(r.updated, 1);
    assert.ok(/3人分を取りこみました（新しく2人、更新1人）/.test(r.message), r.message);
    assert.strictEqual(db().students['4-5'].profile.name, '小野, ゆい');
  });

  await test('csv：カンマ・改行・ダブルクォート入り。セルの中でコードが改行で折れていても読める', async function () {
    var t = recTok(5, 1, '"かぎ"かっこ', '2026-11-20T10:00:00Z', 0.8);
    var folded = codeText(t);
    folded = folded.slice(0, 60) + '\r\n' + folded.slice(60, 120) + '\n' + folded.slice(120);
    var csv = '\ufeffID,開始時刻,"コード, はりつけ"\r\n1,2026/11/20,"先生へ ""よろしく""\r\n' + folded + '"\r\n2,2026/11/20,"' + codeText(recTok(5, 2, 'b', '2026-11-20T10:00:00Z', 0.5)) + '"\r\n';
    var r = await Classbook.importFiles([file('forms.csv', Buffer.from(csv, 'utf8'))]);
    assert.strictEqual(r.students, 2, r.message);
    assert.strictEqual(db().students['5-1'].profile.name, '"かぎ"かっこ');
  });

  await test('Shift_JIS の txt（UTF-8 で読めないときに Shift_JIS でためす）・UTF-16 の txt', async function () {
    var body = 'しょうすうふりかえり ' + codeText(reflTok(6, 1, 'S', '2026-11-20', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z', 0.7)) + '\r\nせんせいへ\r\n';
    var b = sjis(body);
    assert.ok(Classbook._.decodeText(new Uint8Array(b)).indexOf('しょうすうふりかえり') === 0, 'Shift_JIS が読める');
    var r = await Classbook.importFiles([file('memo.txt', b)]);
    assert.strictEqual(r.students, 1, r.message);
    var u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ふりかえり ' + codeText(recTok(6, 2, 'U', '2026-11-20T10:00:00Z', 0.7)), 'utf16le')]);
    var r2 = await Classbook.importFiles([file('u16.txt', u16)]);
    assert.strictEqual(r2.students, 1, r2.message);
  });

  await test('zip の中の xlsx・csv・txt・入れ子の zip（Teams の課題をまとめてダウンロード）', async function () {
    reset();
    var inner = makeZip([{ name: 'c/3.txt', data: codeText(recTok(7, 3, 'c', '2026-11-20T10:00:00Z', 0.7)) }], true);
    var z = makeZip([
      { name: '回答/forms.xlsx', data: makeXlsx([codeText(recTok(7, 1, 'a', '2026-11-20T10:00:00Z', 0.7))], true) },
      { name: '回答/2番.csv', data: codeText(recTok(7, 2, 'b', '2026-11-20T10:00:00Z', 0.7)) },
      { name: '__MACOSX/._forms.xlsx', data: 'xxx' },
      { name: 'inner.zip', data: inner },
      { name: 'image.png', data: 'png' }
    ], true);
    var r = await Classbook.importFiles([file('提出.zip', z)]);
    assert.strictEqual(r.students, 3, r.message);
    assert.deepStrictEqual(Object.keys(db().students).sort(), ['7-1', '7-2', '7-3']);
    assert.deepStrictEqual(r.fileErrors, []);
  });

  await test('開けないファイルは名前を出す（こわれた xlsx）', async function () {
    var bad = Buffer.from('PK\u0003\u0004 not a real zip', 'latin1');
    var r = await Classbook.importFiles([file('こわれた.xlsx', bad), file('ok.txt', Buffer.from(codeText(recTok(7, 4, 'd', '2026-11-20T10:00:00Z', 0.7))))]);
    assert.strictEqual(r.students, 1);
    assert.ok(/開けなかったファイル：こわれた\.xlsx/.test(r.message), r.message);
  });

  console.log('classbook: CSV');

  await test('CSV：BOM・出席番号順・まだの行・エスケープ（カンマ・改行・ダブルクォート）・式にならない', async function () {
    reset();
    await Classbook.importText([
      codeText(recTok(2, 4, '高橋, "たか"', '2026-11-20T10:00:00Z', 0.95)),
      codeText(recTok(2, 1, '=SUM(A1)', '2026-11-20T10:00:00Z', 0.6)),
      codeText(reflTok(2, 2, '中村', '2026-11-20', '2026-11-20T10:00:00Z', '2026-11-20T10:00:00Z', 0.8))
    ].join('\n'));
    // 先生の評価と、直した所見
    var d = db();
    d.students['2-4'].override.know = 'B';
    d.students['2-4'].comment.long = '1行目\n2行目、"引用"あり';
    d.students['2-4'].comment.edited = true;
    Classbook._.save(d);
    var csv = Classbook.exportCsv(2, { download: false });
    assert.strictEqual(csv.charCodeAt(0), 0xfeff, 'BOM');
    assert.ok(/\r\n$/.test(csv));
    var rows = parseCsv(csv.slice(1));
    assert.deepStrictEqual(rows[0], ['組', '番号', '名前', '進んだ時', '学習した日数', '正答率', '知（案）', '知（先生）', '思（案）', '思（先生）', '態（案）', '態（先生）', '支援', '所見']);
    assert.strictEqual(rows.length, 5);          // 見出し + 1〜4番
    assert.deepStrictEqual(rows.map(function (r) { return r[1]; }).slice(1), ['1', '2', '3', '4']);
    assert.strictEqual(rows[1][2], "'=SUM(A1)");
    assert.strictEqual(rows[3][3], 'まだ');       // 3番はデータなし
    var r4 = rows[4];
    assert.strictEqual(r4[2], '高橋, "たか"');
    assert.strictEqual(r4[3], '7');
    assert.strictEqual(r4[4], '5');
    assert.strictEqual(r4[5], '95%');
    assert.strictEqual(r4[6], 'A'); assert.strictEqual(r4[7], 'B');
    assert.strictEqual(r4[8], 'B'); assert.strictEqual(r4[9], '');
    assert.strictEqual(r4[12], 'くり下がりのひき算, "位"をそろえる\n目安の時間を伝える');
    assert.strictEqual(r4[13], '1行目\n2行目、"引用"あり');
    // 直していない子は長い案。前の子の所見が cls で渡っている
    assert.strictEqual(rows[1][13], '=SUM(A1)さんは、長い所見の案です。（v0・前0）'.replace(/^=/, "'="));
    assert.ok(/前1）$/.test(rows[2][13]), rows[2][13]);
    assert.strictEqual(Classbook._.csvName(2), '小数コスモス_4年2組.csv');
    assert.strictEqual(Classbook._.csvCell('a,b'), '"a,b"');
    assert.strictEqual(Classbook._.csvCell('say "hi"'), '"say ""hi"""');
    assert.strictEqual(Classbook._.csvCell('x\ny'), '"x\ny"');
    assert.strictEqual(Classbook._.csvCell('-0.5'), '-0.5');
    assert.strictEqual(Classbook._.csvCell('+1'), "'+1");
  });

  await test('人数を決めると、その番号までの行が出る', async function () {
    var d = db();
    d.classes[2] = { size: 6 };
    Classbook._.save(d);
    var rows = parseCsv(Classbook.exportCsv(2, { download: false }).slice(1));
    assert.strictEqual(rows.length, 7);
    assert.strictEqual(rows[6][3], 'まだ');
  });

  console.log('classbook: 保存');

  await test('容量いっぱいでも落ちない：古いふりかえりの手書きから落とす', async function () {
    reset();
    var toks = [];
    for (var i = 1; i <= 12; i++) {
      var dd = '2026-11-' + ('0' + i).slice(-2);
      toks.push(reflTok(8, 1, 'たくさん', dd, dd + 'T10:00:00Z', dd + 'T10:00:00Z', 0.8, { w: { eval: 'single', choices: [], ink: ink(40) }, t: { choices: [], ink: ink(40) } }));
    }
    var full = await Classbook.importText(toks.map(codeText).join('\n'));
    assert.strictEqual(full.saved, true);
    var size = storage.getItem(Classbook._.KEY).length;
    reset();
    storage.quota = Math.floor(size * 0.6);
    var r = await Classbook.importText(toks.map(codeText).join('\n'));
    assert.strictEqual(r.saved, true, r.message);
    assert.ok(r.dropped > 0, '手書きを落とした');
    var st = db().students['8-1'];
    assert.strictEqual(st.reflections.length, 12, 'ふりかえりの文字は残る');
    assert.strictEqual(st.reflections[0].w.ink, null, 'いちばん古い日の手書きを落とした');
    assert.ok(st.reflections[11].w.ink, '新しい日の手書きは残る');
    storage.quota = 50;
    var r2 = await Classbook.importText(codeText(recTok(8, 2, 'x', '2026-11-20T10:00:00Z', 0.5)));
    assert.strictEqual(r2.saved, false);
    assert.ok(/保存できませんでした/.test(r2.message));
    storage.quota = 5e6;
  });

  await test('手書きの縮小：長い辺を320に、点を間引く', function () {
    var p = Classbook._.packInk(ink(3));
    assert.strictEqual(p.w, 320); assert.strictEqual(p.h, 120);
    var u = Classbook._.unpackInk(p);
    assert.strictEqual(u.strokes.length, 3);
    assert.ok(u.strokes[0][0].x >= 0 && u.strokes[0][0].x <= 320);
  });

  console.log('classbook: 本物の share.js');
  await test('本物の share.js：組・番号のないふりかえり（いまの版）を取りこむ', async function () {
    reset();
    S.Share = RealShare;
    try {
      var tok = await RealShare.encodeReflection({ v: 1, date: '2026-11-15', name: ink(2), meate: { choices: ['めあて'] }, y: { auto: ['やった'] }, w: { eval: 'single', choices: [] }, t: { choices: [] }, aid: 'abcdefgh' });
      var r = await Classbook.importText('しょうすうふりかえり #/r/' + tok);
      if (RealShare.decodeRecord) assert.ok(r.noProfile === 1 || r.students === 0);
      else assert.strictEqual(r.noProfile, 1, r.message);
      assert.strictEqual(db().noProfile.length, 1);
      if (typeof RealShare.encodeRecord === 'function') {
        var sm = summary(9, 9, '本物', '2026-11-20T10:00:00Z', 0.8);
        var rt = await RealShare.encodeRecord({ profile: { cls: 9, no: 9, name: '本物' }, summary: sm });
        var r2 = await Classbook.importText(RealShare.codeText ? RealShare.codeText(rt) : '#/k/' + rt);
        assert.strictEqual(r2.students, 1, r2.message);
        console.log('      （encodeRecord もためしました）');
      } else console.log('      （share.js に encodeRecord がまだないので、学習のきろくはテスト用の Share だけでためしました）');
    } finally { S.Share = StubShare; }
  });

  console.log('\n' + passed + ' ok, ' + failed + ' NG');
  process.exit(failed ? 1 : 0);
})();
