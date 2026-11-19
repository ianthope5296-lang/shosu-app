#!/usr/bin/env node
/* check-lessons.js — 問題データと自動生成の検証（担当D）
 * 使い方: node tools/check-lessons.js
 * 失敗が1つでもあれば終了コード1。
 */
'use strict';
var path = require('path');
var G = require(path.join(__dirname, '..', 'js', 'generators.js'));
var LS = require(path.join(__dirname, '..', 'js', 'lessons.js'));
var Lessons = LS.Lessons, ReviewTopics = LS.ReviewTopics;

var errors = [], warnings = [];
function err(where, msg) { errors.push(where + ': ' + msg); }
function warn(where, msg) { warnings.push(where + ': ' + msg); }

// ---------- 正確な小数（BigInt、10^9倍） ----------
var E = 9, SCALE = 10n ** 9n;
function D(s) {
  s = String(s);
  var m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error('not a decimal: ' + s);
  var fp = (m[2] || '');
  if (fp.length > E) throw new Error('too long: ' + s);
  return BigInt(m[1]) * SCALE + BigInt((fp + '000000000').slice(0, E));
}
function S(v) {
  var neg = v < 0n; if (neg) v = -v;
  var ip = v / SCALE, fp = (v % SCALE).toString().padStart(E, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + ip.toString() + (fp ? '.' + fp : '');
}
function mul(a, b) { return a * b / SCALE; }
function div(a, b) {
  if (b === 0n) throw new Error('div by 0');
  if ((a * SCALE) % b !== 0n) throw new Error('inexact division');
  return a * SCALE / b;
}
// 式の計算（+ - * / と かっこ。全角も可）
function evalExpr(str) {
  var s = str.replace(/＋/g, '+').replace(/[−－]/g, '-').replace(/[×]/g, '*').replace(/[÷]/g, '/')
    .replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, '');
  var i = 0;
  function peek() { return s[i]; }
  function num() {
    var m = /^\d+(\.\d+)?/.exec(s.slice(i));
    if (!m) throw new Error('bad expr at ' + i + ': ' + str);
    i += m[0].length; return D(m[0]);
  }
  function factor() {
    if (peek() === '(') { i++; var v = expr(); if (s[i] !== ')') throw new Error('missing ) in ' + str); i++; return v; }
    return num();
  }
  function term() {
    var v = factor();
    while (peek() === '*' || peek() === '/') { var op = s[i++]; var w = factor(); v = op === '*' ? mul(v, w) : div(v, w); }
    return v;
  }
  function expr() {
    var v = term();
    while (peek() === '+' || peek() === '-') { var op = s[i++]; var w = term(); v = op === '+' ? v + w : v - w; }
    return v;
  }
  var v = expr();
  if (i !== s.length) throw new Error('trailing chars in ' + str);
  return v;
}
function eq(a, b) { return D(a) === D(b); }

// ---------- 形式チェック ----------
var TAGS = ['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan', 'kimari'];
var DEMOS = ['masu', 'zoomline', 'units', 'blocks', 'compare', 'shift', 'hissan', 'laws', 'furikaeri'];
var PLACE_COLS = ['1000', '100', '10', '1', '0.1', '0.01', '0.001', '0.0001'];
var NUM_RE = /^\d+(\.\d+)?$/;

function decimals(s) { var k = s.indexOf('.'); return k < 0 ? 0 : s.length - k - 1; }
function intDigits(s) { return s.split('.')[0].length; }

function checkNumStr(where, s, label) {
  if (typeof s !== 'string' || !/^[\d.]+$/.test(s)) { err(where, label + ' は数字と . のみ: ' + JSON.stringify(s)); return false; }
  if (!NUM_RE.test(s)) { err(where, label + ' の形がおかしい: ' + s); return false; }
  if (/\.\d*0$/.test(s)) err(where, label + ' の末尾に0: ' + s);
  if (/^0\d/.test(s)) err(where, label + ' の先頭に余分な0: ' + s);
  if (decimals(s) > 3) err(where, label + ' は小数第三位まで: ' + s);
  return true;
}

function onTick(v, min, step) {
  var k = div(D(v) - D(min), D(step));
  return k % SCALE === 0n ? k / SCALE : null;
}
function numStr(n) { // JS数値 -> 文字列（図の値は短い小数なので toString で十分）
  var s = String(n);
  if (!NUM_RE.test(s)) throw new Error('bad number in fig: ' + n);
  return s;
}

function checkFig(where, f) {
  if (!f || typeof f !== 'object') { err(where, 'fig がオブジェクトでない'); return; }
  try {
    if (f.kind === 'masu') {
      ['L', 'd1', 'd2'].forEach(function (k) {
        if (!Number.isInteger(f[k]) || f[k] < 0 || f[k] > (k === 'L' ? 5 : 9)) err(where, 'masu.' + k + ' が範囲外: ' + f[k]);
      });
      if (f.level !== 2 && f.level !== 3) err(where, 'masu.level は 2 か 3');
      if (f.level === 3 && (!Number.isInteger(f.d3) || f.d3 < 0 || f.d3 > 9)) err(where, 'masu.d3 が範囲外');
      if (f.level === 2 && f.d3) err(where, 'level2 に d3');
      if (f.unit && f.unit !== 'L') err(where, 'masu.unit');
    } else if (f.kind === 'numberline') {
      var min = numStr(f.min), max = numStr(f.max), step = numStr(f.step);
      if (!(D(min) < D(max))) err(where, 'numberline min<max でない');
      var n = onTick(max, min, step);
      if (n === null) err(where, 'numberline (max-min)/step が整数でない');
      if (n !== null && n > 120n) err(where, 'numberline の目もりが多すぎる: ' + n);
      if (!Number.isInteger(f.labelEvery) || f.labelEvery < 1) err(where, 'numberline labelEvery');
      (f.arrows || []).concat(f.points || []).forEach(function (a) {
        var v = numStr(a.v);
        if (D(v) < D(min) || D(v) > D(max)) err(where, 'numberline の点が範囲外: ' + v);
        if (onTick(v, min, step) === null) err(where, 'numberline の点が目もり上にない: ' + v);
        if (typeof a.label !== 'string') err(where, 'numberline の label が文字列でない');
      });
    } else if (f.kind === 'placeTable') {
      if (!Array.isArray(f.cols) || !f.cols.length) { err(where, 'placeTable.cols'); return; }
      f.cols.forEach(function (c) { if (PLACE_COLS.indexOf(c) < 0) err(where, 'placeTable の列が不明: ' + c); });
      var maxInt = f.cols.filter(function (c) { return c.indexOf('.') < 0; }).length;
      var maxDec = f.cols.filter(function (c) { return c.indexOf('.') >= 0; }).length;
      (f.rows || []).forEach(function (r) {
        if (!NUM_RE.test(r)) { err(where, 'placeTable.rows が数でない: ' + r); return; }
        if (intDigits(r) > Math.max(maxInt, 1) || decimals(r) > maxDec) err(where, 'placeTable に入りきらない: ' + r + ' cols=' + f.cols.join(','));
      });
    } else if (f.kind === 'blocks') {
      Object.keys(f.counts || {}).forEach(function (k) {
        if (['1', '0.1', '0.01', '0.001'].indexOf(k) < 0) err(where, 'blocks のキー: ' + k);
      });
    } else if (f.kind === 'tape') {
      // 任意
    } else {
      err(where, 'fig.kind が不明: ' + f.kind);
    }
  } catch (e) { err(where, 'fig: ' + e.message); }
}

function slots(p) { return p.parts.filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return x.a; }); }
function textWith(p) { return p.parts.map(function (x) { return typeof x === 'string' ? x : x.a; }).join(''); }

function hissanAnswer(p) {
  var a = D(p.a), b = D(p.b);
  return p.op === '+' ? a + b : a - b;
}

function checkProblem(where, p, opt) {
  opt = opt || {};
  if (!p || typeof p !== 'object') { err(where, '問題がオブジェクトでない'); return; }
  if (TAGS.indexOf(p.tag) < 0) err(where, 'tag が不明: ' + p.tag);
  if (typeof p.id !== 'string' || !p.id) err(where, 'id がない');
  if (p.hints !== undefined || p.type !== 'hissan') {
    if (!Array.isArray(p.hints) || p.hints.length < 1 || p.hints.length > 3) err(where, 'hints は1〜3こ');
    else p.hints.forEach(function (h) { if (typeof h !== 'string' || !h.trim()) err(where, 'hint が空'); });
  }
  if (p.fig !== undefined) checkFig(where, p.fig);
  if (p.q !== undefined && typeof p.q !== 'string') err(where, 'q が文字列でない');
  switch (p.type) {
    case 'fill':
      if (!Array.isArray(p.parts)) { err(where, 'parts がない'); return; }
      var ss = slots(p);
      if (!ss.length) err(where, 'スロットがない');
      ss.forEach(function (a) { checkNumStr(where, a, 'スロット'); });
      p.parts.forEach(function (x) { if (typeof x !== 'string' && !(x && typeof x === 'object' && 'a' in x)) err(where, 'parts の要素が不正'); });
      break;
    case 'choice':
      if (!Array.isArray(p.options) || p.options.length < 2) err(where, 'options');
      else if (p.options.indexOf(p.a) < 0) err(where, 'a が options にない: ' + p.a);
      if (typeof p.q !== 'string') err(where, 'choice に q がない');
      break;
    case 'order':
      if (!Array.isArray(p.items) || p.items.length < 2) { err(where, 'items'); break; }
      p.items.forEach(function (x) { checkNumStr(where, x, 'order 項目'); });
      var vals = p.items.map(function (x) { return NUM_RE.test(x) ? D(x).toString() : x; });
      if (new Set(vals).size !== vals.length) err(where, 'order に同じ大きさの数がある');
      if (p.dir !== 'desc' && p.dir !== 'asc') err(where, 'dir は desc/asc');
      break;
    case 'hissan':
      if (p.op !== '+' && p.op !== '-') { err(where, 'op'); break; }
      if (!checkNumStr(where, p.a, 'a') || !checkNumStr(where, p.b, 'b')) break;
      if (decimals(p.a) > 2 || decimals(p.b) > 2) err(where, '筆算は小数第二位まで');
      var r = hissanAnswer(p);
      if (r < 0n) err(where, '答えが負: ' + p.a + p.op + p.b);
      if (r === 0n) err(where, '答えが0');
      if (r >= D('100')) err(where, '答えが大きすぎる: ' + S(r));
      if (!(D(p.a) > 0n && D(p.b) > 0n)) err(where, '0 を含む');
      break;
    default:
      err(where, 'type が不明: ' + p.type);
  }
}

// ---------- 固定問題の答えの再計算 ----------
var UNITK = { km: 6, m: 3, cm: 1, mm: 0, kg: 3, g: 0, L: 3, dL: 2, mL: 0 };
var UDIM = { km: 'len', m: 'len', cm: 'len', mm: 'len', kg: 'wt', g: 'wt', L: 'vol', dL: 'vol', mL: 'vol' };
function unitValue(desc) { // '2m83cm' -> [base value, dim]
  var re = /([\d.]+)(km|kg|mL|dL|mm|cm|m|g|L)/g, m, total = 0n, dim = null, used = '';
  while ((m = re.exec(desc))) {
    total += D(m[1]) * 10n ** BigInt(UNITK[m[2]]);
    if (dim && dim !== UDIM[m[2]]) throw new Error('単位の種類がまざっている');
    dim = UDIM[m[2]]; used += m[0];
  }
  if (used !== desc) throw new Error('単位の式が読めない: ' + desc);
  return [total, dim];
}
function unitConvertAnswer(desc, to) {
  var uv = unitValue(desc);
  if (uv[1] !== UDIM[to]) throw new Error('単位の種類がちがう');
  return S(uv[0] / 10n ** BigInt(UNITK[to]));
}

// 明示的な検算（スロット順の式）
var EXPECT = {
  'L1-01': ['0.1/10'], 'L1-08': ['0.01*26'],
  'L2-01': ['0.8/0.1', '0.03/0.01'],
  'L3-04': ['1', '0.4/0.1', '0.02/0.01', '0.005/0.001'],
  'L4-01': ['1/0.1'], 'L4-02': ['1/0.1'], 'L4-03': ['1/0.01'], 'L4-04': ['1/0.01'], 'L4-05': ['1/0.001'], 'L4-06': ['0.1/0.01'],
  'L4-07': ['2', '3', '8', '6'], 'L4-09': ['3+0.4+0.09+0.005'], 'L4-10': ['7+0.3+0.005'],
  'L4-11': ['3.254/0.001'], 'L4-12': ['1.27/0.01'], 'L4-13': ['0.58/0.01'], 'L4-14': ['2/0.01'],
  'L4-15': ['3', '6', '8', '2'], 'L4-16': ['0.7+0.05+0.006'], 'L4-17': ['1', '7', '3'],
  'L5-06': ['0.01/10'],
  'L6-01': ['0.58*10'], 'L6-02': ['0.58/10'], 'L6-03': ['3.92*10'], 'L6-04': ['3.92*100'], 'L6-05': ['3.92*1000'], 'L6-06': ['3.92/10'],
  'L6-07': ['0.74*10', '0.74/10'], 'L6-08': ['1.58*10', '1.58/10'], 'L6-09': ['26.95*10', '26.95/10'],
  'L6-10': ['0.46*10', '0.46/10'], 'L6-11': ['2.73*10', '2.73/10'],
  'L6-12': ['2.79*10', '2.79*100', '2.79*1000', '2.79/10'], 'L6-13': ['18.83*10', '18.83*100', '18.83*1000', '18.83/10'],
  'L7-01': ['2.25+1.34'], 'L8-01': ['3.46-2.14'], 'L8-16': ['2.15-0.85'],
  'L9-02': ['6.4+3.7'],
  'L10-03': ['8', '6', '1'], 'L10-04': ['0.46*10', '0.46/10'], 'L10-19': ['6+0.4+0.09+0.003'],
  'L10-20': ['2.17+3.62+2.45'], 'L10-21': ['2.68+3.2+2.79+2.84'], 'L10-22': ['2.85+2.96+2.8+2.88+2.91'],
  'L10-23': ['(2.85+2.96+2.8+2.88+2.91)-(2.68+3.2+2.79+2.84)'],
  'L10-24': ['2.81-2'], 'L10-25': ['2.81/0.01']
};
// 数の構成の検算（スロット×単位の合計がもとの数）
var COMPOSE = { 'L4-07': '2.386', 'L4-15': '3.682', 'L4-17': '1.073', 'L10-03': '8.61' };

function verifyFixed(where, p) {
  var done = false;
  try {
    if (p.type === 'fill') {
      var ss = slots(p);
      var text = textWith(p);
      if (EXPECT[p.id]) {
        var ex = EXPECT[p.id];
        if (ex.length !== ss.length) err(where, '検算式の数とスロット数がちがう');
        ex.forEach(function (e, k) { if (S(evalExpr(e)) !== S(D(ss[k]))) err(where, '答えちがい: ' + ss[k] + ' (検算 ' + e + ' = ' + S(evalExpr(e)) + ')'); });
        done = true;
      }
      if (COMPOSE[p.id]) {
        var sum = 0n, k2 = 0;
        p.parts.forEach(function (x, idx) {
          if (typeof x === 'object') {
            var m = /([\d.]+)を$/.exec(p.parts[idx - 1]);
            sum += D(x.a) * D(m[1]) / SCALE; k2++;
          }
        });
        if (S(sum) !== COMPOSE[p.id]) err(where, '数の構成が合わない: ' + S(sum));
      }
      // 式の連鎖（3.7＋(6.4＋3.6)＝3.7＋10＝13.7 など）
      if (/^[\d.＋−()＝]+$/.test(text) && text.indexOf('＝') > 0) {
        var sides = text.split('＝').map(evalExpr);
        sides.forEach(function (v) { if (v !== sides[0]) err(where, '式が成り立たない: ' + text); });
        done = true;
      }
      // 「3.7＋6.4＝10.1 です。6.4＋3.7＝10.1」のような文
      // 単位のかんさん
      var mu = /^([\d.]+(?:km|kg|mL|dL|mm|cm|m|g|L)(?:[\d.]+(?:km|kg|mL|dL|mm|cm|m|g|L))*)＝$/.exec(p.parts[0]);
      if (mu && ss.length === 1 && typeof p.parts[2] === 'string') {
        var to = p.parts[2];
        var ans = unitConvertAnswer(mu[1], to);
        if (ans !== ss[0]) err(where, '単位かんさんちがい: ' + ss[0] + ' 正 ' + ans);
        done = true;
      }
      // ますの図
      if (p.fig && p.fig.kind === 'masu' && ss.length === 1) {
        var f = p.fig;
        var v = BigInt(f.L) * SCALE + BigInt(f.d1) * SCALE / 10n + BigInt(f.d2) * SCALE / 100n + BigInt(f.d3 || 0) * SCALE / 1000n;
        if (S(v) !== S(D(ss[0]))) err(where, 'ますの図と答えが合わない: ' + ss[0] + ' 図 ' + S(v));
        done = true;
      }
      // 数直線の矢印
      if (p.fig && p.fig.kind === 'numberline' && p.fig.arrows && ss.length === 1) {
        var lab = /^(.)の目もり/.exec(p.parts[0]);
        if (lab) {
          var arr = p.fig.arrows.filter(function (a) { return a.label === lab[1]; })[0];
          if (!arr) err(where, '矢印 ' + lab[1] + ' がない');
          else if (S(D(String(arr.v))) !== S(D(ss[0]))) err(where, '数直線の答えちがい: ' + ss[0] + ' 図 ' + arr.v);
          done = true;
        }
      }
      if (!done) warn(where, '答えを自動で検算していない: ' + text);
    } else if (p.type === 'choice') {
      var m2 = /([\d.]+) □ ([\d.]+)$/.exec(p.q);
      if (m2 && p.options.indexOf('>') >= 0) {
        var x = D(m2[1]), y = D(m2[2]);
        var right = x > y ? '>' : x < y ? '<' : '=';
        if (p.a !== right) err(where, '不等号ちがい: ' + p.q + ' a=' + p.a);
      }
    }
  } catch (e) { err(where, '検算エラー: ' + e.message); }
}

// ---------- レッスン全体 ----------
var genNames = G.names();
var ids = {};
var total = 0, byType = {};
if (!Array.isArray(Lessons) || Lessons.length !== 10) err('Lessons', '10件ではない');
Lessons.forEach(function (L, li) {
  var w = 'L' + L.no;
  if (L.no !== li + 1) err(w, 'no の順番');
  ['subunit', 'title', 'page', 'meate', 'matome'].forEach(function (k) { if (typeof L[k] !== 'string' || !L[k]) err(w, k + ' がない'); });
  if (!L.demo || DEMOS.indexOf(L.demo.id) < 0) err(w, 'demo.id が不明');
  (L.demos || []).forEach(function (d) { if (DEMOS.indexOf(d.id) < 0) err(w, 'demos.id が不明: ' + d.id); });
  (L.more || []).forEach(function (n) { if (genNames.indexOf(n) < 0) err(w, 'more の生成器が不明: ' + n); });
  if (!L.more || !L.more.length) err(w, 'more がない');
  if (!Array.isArray(L.problems) || !L.problems.length) err(w, 'problems がない');
  L.problems.forEach(function (p) {
    var pw = p.id || (w + '-?');
    if (ids[p.id]) err(pw, 'id が重複'); ids[p.id] = true;
    if (!/^L\d+-\d\d$/.test(p.id)) err(pw, 'id の形');
    checkProblem(pw, p);
    verifyFixed(pw, p);
    total++; byType[p.type] = (byType[p.type] || 0) + 1;
  });
});
// 走りはばとびの合計（問題文中）
(function () {
  var p = Lessons[9].problems.filter(function (x) { return x.id === 'L10-21'; })[0];
  var re = /([A-D])チーム：([^（]*?)（合計([\d.]+)m）/g, m;
  var n = 0;
  while ((m = re.exec(p.q))) {
    var sum = m[2].split('、').map(function (s) { return D(s.replace('m', '').trim()); }).reduce(function (a, b) { return a + b; }, 0n);
    if (S(sum) !== m[3]) err('L10-21', m[1] + 'チームの合計がちがう: ' + S(sum) + ' / ' + m[3]);
    n++;
  }
  if (n !== 3) err('L10-21', 'チームの合計を読めない');
})();

var topicIds = ['hyoshikata', 'shikumi', 'daisho', 'jubai', 'tashizan', 'hikizan'];
if (!Array.isArray(ReviewTopics) || ReviewTopics.length !== 6) err('ReviewTopics', '6件ではない');
ReviewTopics.forEach(function (t, i) {
  if (t.id !== topicIds[i]) err('ReviewTopics', 'id: ' + t.id);
  if (!t.title) err('ReviewTopics', 'title');
  (t.gens || []).forEach(function (n) { if (genNames.indexOf(n) < 0) err('ReviewTopics', '生成器が不明: ' + n); });
});

// ---------- 生成器 ----------
var CONTRACT_GENS = ['masuRead', 'unitConvert', 'compose', 'decompose', 'countUnits', 'compare', 'order', 'times10', 'numberlineRead', 'hissanAdd', 'hissanSub', 'laws'];
CONTRACT_GENS.forEach(function (n) { if (genNames.indexOf(n) < 0) err('Generators', '生成器がない: ' + n); });

// 再現できる乱数
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var PLACE_NAMES = ['一の位', '小数第一位', '小数第二位', '小数第三位'];
var UNIT_VAL = ['1', '0.1', '0.01', '0.001'];

function verifyGen(name, p, where) {
  var ss = p.type === 'fill' ? slots(p) : [];
  var src = p.src || {};
  if (src.gen !== name) err(where, 'src.gen');
  switch (name) {
    case 'masuRead': {
      var f = p.fig, v = BigInt(f.L) * 1000n + BigInt(f.d1) * 100n + BigInt(f.d2) * 10n + BigInt(f.d3 || 0);
      if (S(v * SCALE / 1000n) !== ss[0]) err(where, 'masuRead 答えちがい ' + ss[0]);
      if (v === 0n) err(where, 'かさが0');
      break;
    }
    case 'unitConvert': {
      var desc = p.parts[0].replace(/＝$/, '');
      var ans = unitConvertAnswer(desc, p.parts[2]);
      if (ans !== ss[0]) err(where, 'unitConvert 答えちがい ' + desc + '→' + ss[0] + ' 正 ' + ans);
      break;
    }
    case 'compose': {
      var re = /([\d.]+)を(\d+)こ/g, m, sum = 0n;
      while ((m = re.exec(p.parts[0]))) sum += D(m[1]) * BigInt(m[2]);
      if (S(sum) !== ss[0]) err(where, 'compose 答えちがい ' + p.parts[0] + ss[0]);
      break;
    }
    case 'decompose': {
      var x = src.x, digits = x.replace('.', '').split('');
      if (decimals(x) !== 3 || intDigits(x) !== 1) err(where, 'decompose の数の形 ' + x);
      if (p.type === 'choice') {
        var dq = /「(\d)」/.exec(p.q)[1];
        var pos = PLACE_NAMES.indexOf(p.a);
        if (digits[pos] !== dq) err(where, 'decompose 位ちがい');
        if (digits.filter(function (d) { return d === dq; }).length !== 1) err(where, 'decompose 数字が重複');
      } else if (src.kind === 'digit') {
        var pn = PLACE_NAMES.filter(function (n) { return p.parts[0].indexOf('の' + n) >= 0; })[0];
        if (digits[PLACE_NAMES.indexOf(pn)] !== ss[0]) err(where, 'decompose 数字ちがい');
      } else {
        var tot = 0n;
        p.parts.forEach(function (y, idx) {
          if (typeof y === 'object') tot += D(/([\d.]+)を$/.exec(p.parts[idx - 1])[1]) * BigInt(y.a);
        });
        if (S(tot) !== x) err(where, 'decompose 合計ちがい ' + S(tot) + ' / ' + x);
        if (p.parts[0] !== x + 'は、') err(where, 'decompose 文');
      }
      break;
    }
    case 'countUnits': {
      if (!src.reverse) {
        var mm = /^([\d.]+)は、([\d.]+)を$/.exec(p.parts[0]);
        if (S(div(D(mm[1]), D(mm[2]))) !== ss[0]) err(where, 'countUnits 答えちがい');
      } else {
        var mr = /^([\d.]+)を(\d+)こ集めた数は$/.exec(p.parts[0]);
        if (S(D(mr[1]) * BigInt(mr[2])) !== ss[0]) err(where, 'countUnits(逆) 答えちがい');
      }
      break;
    }
    case 'compare': {
      var mc = /([\d.]+) □ ([\d.]+)$/.exec(p.q);
      var a = D(mc[1]), b = D(mc[2]);
      if (a === b) err(where, 'compare 等しい');
      if (p.a !== (a > b ? '>' : '<')) err(where, 'compare 答えちがい');
      checkNumStr(where, mc[1], 'x'); checkNumStr(where, mc[2], 'y');
      break;
    }
    case 'order':
      if (p.items.length < 4 || p.items.length > 5) err(where, 'order の項目数');
      if (p.q.indexOf(p.dir === 'desc' ? '大きい順' : '小さい順') < 0) err(where, 'order の向きと文');
      break;
    case 'times10': {
      var mt = /^([\d.]+)を(?:(10|100|1000)倍した数|1\/10にした数)は$/.exec(p.parts[0]);
      var xv = D(mt[1]);
      var r = mt[2] ? xv * BigInt(mt[2]) : div(xv, D('10'));
      if (S(r) !== ss[0]) err(where, 'times10 答えちがい ' + p.parts[0] + ss[0]);
      break;
    }
    case 'numberlineRead': {
      var f2 = p.fig, arr = f2.arrows[0];
      if (S(D(String(arr.v))) !== ss[0]) err(where, 'numberlineRead 答えちがい');
      var k = onTick(String(arr.v), String(f2.min), String(f2.step));
      if (k === null) err(where, '目もり上にない');
      else if (k % BigInt(f2.labelEvery) === 0n) err(where, '数の書いてある目もりを聞いている');
      break;
    }
    case 'hissanAdd': case 'hissanSub':
      if (p.op !== (name === 'hissanAdd' ? '+' : '-')) err(where, 'op');
      if (p.a !== src.a || p.b !== src.b) err(where, 'src');
      break;
    case 'laws': {
      var text = textWith(p);
      var sides = text.split('＝').map(evalExpr);
      sides.forEach(function (v2) { if (v2 !== sides[0]) err(where, 'laws 式が成り立たない: ' + text); });
      var lastV = S(sides[sides.length - 1]);
      if (decimals(lastV) > 2) err(where, 'laws 小数第二位まで');
      break;
    }
  }
}

var N = 200, genStats = {};
CONTRACT_GENS.forEach(function (name, gi) {
  var rng = mulberry32(12345 + gi * 777);
  var kinds = {};
  for (var i = 0; i < N; i++) {
    var where = 'gen ' + name + ' #' + i;
    var p;
    try { p = G.make(name, rng); } catch (e) { err(where, '例外: ' + e.message); continue; }
    try {
      checkProblem(where, p);
      verifyGen(name, p, where);
      var key = JSON.stringify(p.type === 'hissan' ? [p.a, p.b] : (p.parts || p.items || p.q));
      kinds[key] = 1;
    } catch (e) { err(where, '検証エラー: ' + e.message + ' ' + JSON.stringify(p)); }
  }
  genStats[name] = Object.keys(kinds).length;
});
// Math.random でも動く
CONTRACT_GENS.forEach(function (name) { try { G.make(name); } catch (e) { err('gen ' + name, 'rng 省略で例外'); } });
try { G.make('nope'); err('Generators', '不明な名前で例外にならない'); } catch (e) { /* ok */ }

// ---------- 結果 ----------
console.log('問題数: ' + total + '（' + Object.keys(byType).map(function (k) { return k + ' ' + byType[k]; }).join('、') + '）');
Lessons.forEach(function (L) { console.log('  第' + L.no + '時 ' + L.title + ': ' + L.problems.length + '問'); });
console.log('生成器: ' + CONTRACT_GENS.length + '種 × ' + N + '回（ちがう問題の数: ' +
  CONTRACT_GENS.map(function (n) { return n + ' ' + genStats[n]; }).join(', ') + '）');
if (warnings.length) { console.log('\n注意 ' + warnings.length + ' 件:'); warnings.forEach(function (w) { console.log('  - ' + w); }); }
if (errors.length) {
  console.log('\nエラー ' + errors.length + ' 件:');
  errors.slice(0, 80).forEach(function (e) { console.log('  x ' + e); });
  process.exit(1);
}
console.log('\nすべての検証に通りました。');
