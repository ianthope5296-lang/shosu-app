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
  if (TAGS.indexOf(p.tag) < 0 && !(p.tag === 'oni' && p.src && ONI_SKILL[p.src.gen])) err(where, 'tag が不明: ' + p.tag);
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

function verifyGen(name, p, where, level) {
  if (ONI_SKILL[name]) return verifyOni(name, p, where);
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
      var x = src.x;
      if (!level || level === 'normal') { if (decimals(x) !== 3 || intDigits(x) !== 1) err(where, 'decompose の数の形 ' + x); }
      var xip = x.split('.')[0], xfp = x.split('.')[1] || '';
      var digitAtPos = function (pos) { return pos === 0 ? xip[xip.length - 1] : (xfp[pos - 1] || '0'); };
      var digits = x.replace('.', '').split('');
      if (p.type === 'choice') {
        var dq = /「(\d)」/.exec(p.q)[1];
        var pos = PLACE_NAMES.indexOf(p.a);
        if (pos < 0) err(where, 'decompose 位の名前');
        if (digitAtPos(pos) !== dq) err(where, 'decompose 位ちがい');
        if (digits.filter(function (d) { return d === dq; }).length !== 1) err(where, 'decompose 数字が重複');
      } else if (src.kind === 'digit') {
        var pn = PLACE_NAMES.filter(function (n) { return p.parts[0].indexOf('の' + n) >= 0; })[0];
        var pi = PLACE_NAMES.indexOf(pn);
        if (pi > decimals(x)) err(where, 'decompose 書いていない位を聞いている');
        if (digitAtPos(pi) !== ss[0]) err(where, 'decompose 数字ちがい');
      } else if (src.kind === 'split') {
        var ms = /^([\d.]+)は、(\d+)と$/.exec(p.parts[0]);
        if (!ms || ms[1] !== x) err(where, 'decompose split の文');
        else if (S(D(ms[2]) + D(ss[0])) !== x) err(where, 'decompose split 合計ちがい');
        if (!(D(ss[0]) < D('1'))) err(where, 'decompose split 小数の部分が1以上');
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
      var cntR = level === 'easy' ? [3, 3] : level === 'hard' ? [5, 6] : [4, 5];
      if (p.items.length < cntR[0] || p.items.length > cntR[1]) err(where, 'order の項目数');
      if (p.q.indexOf(p.dir === 'desc' ? '大きい順' : '小さい順') < 0) err(where, 'order の向きと文');
      break;
    case 'times10': {
      if (src.inverse) {
        var mi = /^ある数を(?:(10|100|1000)倍する|1\/10にする)と、([\d.]+)になりました。ある数はいくつですか。$/.exec(p.q);
        if (!mi) { err(where, 'times10(逆) 文'); break; }
        checkNumStr(where, mi[2], 'y');
        var back = mi[1] ? D(ss[0]) * BigInt(mi[1]) : div(D(ss[0]), D('10'));
        if (S(back) !== mi[2]) err(where, 'times10(逆) 答えちがい ' + ss[0] + ' → ' + S(back) + ' / ' + mi[2]);
        break;
      }
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
      if (p.type === 'choice') {
        var ml = /^(.+) は、どのきまりを表していますか。$/.exec(p.q);
        if (!ml) { err(where, 'laws(選ぶ) 文'); break; }
        var sl = ml[1].split('＝').map(evalExpr);
        if (sl.length !== 2 || sl[0] !== sl[1]) err(where, 'laws(選ぶ) 式が成り立たない');
        var want = ml[1].indexOf('(') >= 0 ? 1 : 0;
        if (p.a !== p.options[want]) err(where, 'laws(選ぶ) 答えちがい');
        break;
      }
      var text = textWith(p);
      var sides = text.split('＝').map(evalExpr);
      sides.forEach(function (v2) { if (v2 !== sides[0]) err(where, 'laws 式が成り立たない: ' + text); });
      var lastV = S(sides[sides.length - 1]);
      if (decimals(lastV) > 2) err(where, 'laws 小数第二位まで');
      break;
    }
    case 'threeSum': {
      var t3 = textWith(p), s3 = t3.split('＝').map(evalExpr);
      if (s3.length !== 2 || s3[0] !== s3[1]) err(where, 'threeSum 答えちがい: ' + t3);
      if ((t3.match(/＋/g) || []).length !== 2) err(where, 'threeSum 3つの数でない');
      break;
    }
    case 'wordAdd': case 'wordSub': {
      if (typeof p.q !== 'string' || p.q.length < 15) err(where, '文章題に問題文がない');
      if (p.parts.length !== 3 || ss.length !== 1) err(where, '文章題の parts の形');
      var ev = evalExpr(src.expr);
      if (S(ev) !== ss[0]) err(where, '文章題の答えちがい ' + src.expr + ' = ' + S(ev) + ' / ' + ss[0]);
      if (ev <= 0n) err(where, '文章題の答えが0以下');
      if ((name === 'wordAdd') !== (src.expr.indexOf('-') < 0)) err(where, '文章題の式の演算');
      var qNums = p.q.match(/\d+(?:\.\d+)?(?:km|kg|mL|cm|m|g|L)/g) || [];
      if (qNums.join('|') !== (src.show || []).join('|')) err(where, '問題文の数と式が合わない: ' + qNums.join(',') + ' / ' + (src.show || []).join(','));
      if (typeof p.parts[2] !== 'string' || p.parts[2].indexOf(src.unit) !== 0) err(where, '文章題の答えの単位');
      break;
    }
  }
}

// ---------- 鬼ムズ（追加8・担当U）の検算 ----------
// 生成器の計算とは別に、表示された式・文・カードから答えを求めなおす（BigInt）。
var ONI_SKILL = { oniAdd: 'oni-add', oniMulDiv: 'oni-muldiv', oniMix: 'oni-mix', oniIdea: 'oni-idea' };
var ONI_KINDS = {
  oniAdd: ['mix3', 'mix4', 'intSub', 'add4', 'word'],
  oniMulDiv: ['mul1', 'mul2', 'div', 'wordMul', 'wordDiv'],
  oniMix: ['parenMul', 'kufuMul', 'kufuAdd', 'parenSub', 'kufuSub', 'order', 'divMix', 'boxA', 'boxB', 'boxC', 'boxP', 'boxM'],
  oniIdea: ['card', 'mushikui', 'seq', 'units', 'choice']
};
var P10 = function (k) { return 10n ** BigInt(k); };
function permsOf(a) {
  if (a.length <= 1) return [a.slice()];
  var out = [];
  for (var i = 0; i < a.length; i++) permsOf(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (r) { out.push([a[i]].concat(r)); });
  return out;
}
// カードで作れる数（D の値）。いちばん右は0にしない、整数部分が2けた以上ならいちばん左も0にしない
function oniCardValues(cards, k) {
  var out = {};
  permsOf(cards).forEach(function (r) {
    if (r[r.length - 1] === 0 || (k >= 2 && r[0] === 0)) return;
    var s = r.slice(0, k).join('') + '.' + r.slice(k).join('');
    out[S(D(s))] = D(s);
  });
  return Object.keys(out).map(function (x) { return out[x]; });
}
// 虫食い算の解（? に 0〜9）を全部さがす
function oniMushikuiSolutions(pattern) {
  var qs = pattern.split('').filter(function (c) { return c === '?'; }).length, sols = [];
  for (var z = 0; z < Math.pow(10, qs); z++) {
    var digits = String(z).padStart(qs, '0').split(''), k = 0;
    var s = pattern.replace(/\?/g, function () { return digits[k++]; });
    var sides = s.split('＝');
    try { if (evalExpr(sides[0]) === evalExpr(sides[1])) sols.push(digits.join('')); } catch (e) { /* 形がおかしい */ }
  }
  return sols;
}
function oniOptionValue(t) {
  var m;
  if (NUM_RE.test(t)) return D(t);
  if ((m = /^(0\.0*1)を(\d+)こ集めた数$/.exec(t))) return D(m[1]) * BigInt(m[2]);
  if ((m = /^([\d.]+)を10倍した数$/.exec(t))) return D(m[1]) * 10n;
  if ((m = /^([\d.]+)の1\/10$/.exec(t))) return D(m[1]) / 10n;
  if ((m = /^1を(\d+)こと0\.01を(\d+)こ合わせた数$/.exec(t))) return D(m[1]) + D('0.01') * BigInt(m[2]);
  throw new Error('選択肢を読めない: ' + t);
}
function verifyOni(name, p, where) {
  var src = p.src || {}, ss = p.type === 'fill' ? slots(p) : [];
  if (src.gen !== name) err(where, 'src.gen');
  if (p.tag !== 'oni') err(where, '鬼ムズの tag が oni でない: ' + p.tag);
  if (src.skill !== ONI_SKILL[name]) err(where, 'src.skill: ' + src.skill);
  if (G.skillOf(p) !== ONI_SKILL[name]) err(where, 'skillOf: ' + G.skillOf(p));
  if (ONI_KINDS[name].indexOf(src.kind) < 0) err(where, 'kind が不明: ' + src.kind);
  if (!Array.isArray(p.hints) || p.hints.length !== 3) err(where, 'ヒントが3段でない');
  if (typeof p.explain !== 'string' || p.explain.length < 5) err(where, 'explain がない');
  if (p.beyond !== undefined && p.beyond !== true) err(where, 'beyond は true か なし');
  if (p.beyond && !(p.hints || []).some(function (h) { return h.indexOf('まだ習っていないけど、0.1や0.01の何こ分で考えればできるよ') >= 0; })) err(where, '範囲外なのに「まだ習っていないけど」の一言がない');
  if (name === 'oniMulDiv' && !p.beyond) err(where, 'かけ算・わり算は beyond');
  // ヒントに答えが出ていない（1けたの整数の答えは見ない）
  var answers = ss.slice();
  if (p.type === 'choice') answers.push(p.a, S(oniOptionValue(p.a)));
  answers.forEach(function (a) {
    if (a.length < 2 && a.indexOf('.') < 0) return;
    (p.hints || []).forEach(function (h) {
      if ((h.match(/\d+(?:\.\d+)?/g) || []).indexOf(a) >= 0 || (p.type === 'choice' && h.indexOf(p.a) >= 0)) err(where, 'ヒントに答え ' + a + ' が出ている: ' + h);
    });
  });
  var q = p.q || '', m, v;
  switch (src.kind) {
    case 'mix3': case 'mix4': case 'intSub': case 'add4': case 'mul1': case 'mul2': case 'div':
    case 'parenMul': case 'kufuMul': case 'kufuAdd': case 'parenSub': case 'kufuSub': case 'order': case 'divMix': {
      if (p.parts.length !== 2 || typeof p.parts[0] !== 'string' || !/＝$/.test(p.parts[0])) { err(where, '式の形'); break; }
      var ex = p.parts[0].slice(0, -1);
      v = evalExpr(ex);
      if (S(v) !== ss[0]) err(where, '答えちがい: ' + ex + ' = ' + S(v) + ' / ' + ss[0]);
      var nn = (ex.match(/\d+(?:\.\d+)?/g) || []);
      if (src.kind === 'mix3' && nn.length !== 3) err(where, '3つの数でない');
      if ((src.kind === 'mix4' || src.kind === 'add4') && nn.length !== 4) err(where, '4つの数でない');
      if (name === 'oniAdd') {
        if (/[×÷(]/.test(ex)) err(where, 'たし算ひき算に×÷');
        if (!nn.some(function (x) { return decimals(x) === 3; })) err(where, '小数第三位の数がない');
        if (!nn.some(function (x) { return intDigits(x) >= 2; })) err(where, '大きな数がない');
        // 途中で負にならない
        var ops = ex.match(/[＋−]/g), acc = D(nn[0]);
        for (var i = 1; i < nn.length; i++) { acc = ops[i - 1] === '＋' ? acc + D(nn[i]) : acc - D(nn[i]); if (acc <= 0n) err(where, '途中で0以下'); }
      }
      if (src.kind === 'div' && !/÷\d$/.test(ex)) err(where, 'わる数が1けたの整数でない');
      if (src.kind === 'mul1' && !/×\d$/.test(ex)) err(where, 'かける数が1けたの整数でない');
      if (src.kind === 'mul2' && !/×\d\d$/.test(ex)) err(where, 'かける数が2けたの整数でない');
      if (v <= 0n) err(where, '答えが0以下');
      break;
    }
    case 'word': {
      var UK = { km: 6, m: 3, kg: 6, g: 3, L: 6, dL: 5, mL: 3 }; // 1000倍の基準でそろえる（km・kg・L が 10^6）
      var re = /(\d+(?:\.\d+)?)(km|kg|dL|mL|L|m|g)(?:(\d+)(mL|m|g))?/g, qty = [];
      while ((m = re.exec(q))) {
        var val = D(m[1]) * P10(UK[m[2]]);
        if (m[3]) val += D(m[3]) * P10(UK[m[4]]);
        qty.push(val);
      }
      if (qty.length !== src.ops.length + 1) { err(where, '文章の数の数: ' + qty.length); break; }
      var tot = qty[0];
      for (var j = 1; j < qty.length; j++) { tot = src.ops[j - 1] === '+' ? tot + qty[j] : tot - qty[j]; if (tot <= 0n) err(where, '途中で0以下'); }
      if (S(tot / P10(6)) !== ss[0]) err(where, '文章題の答えちがい ' + S(tot / P10(6)) + ' / ' + ss[0]);
      if (q.length < 60) err(where, '文章が短い');
      if (!/km|kg|L/.test(p.parts[2]) || p.parts[2].indexOf(src.u) !== 0) err(where, '答えの単位');
      if (!(q.match(/\d+(mL|g|dL)|\dkm\d|\d+m[^L]/g))) err(where, '単位のかんさんがない');
      break;
    }
    case 'wordMul': case 'wordDiv': {
      if (q.indexOf(src.a) < 0 || q.indexOf(src.b) < 0) err(where, '問題文に数がない');
      v = evalExpr(src.a + (src.op === '*' ? '*' : '/') + src.b);
      if (S(v) !== ss[0]) err(where, '答えちがい ' + S(v) + ' / ' + ss[0]);
      if ((src.kind === 'wordMul') !== (src.op === '*')) err(where, 'op');
      break;
    }
    case 'boxA': case 'boxB': case 'boxC': case 'boxP': case 'boxM': {
      if (ss.length !== 1) { err(where, '□が1つでない'); break; }
      var eq1 = p.parts.map(function (x) { return typeof x === 'string' ? x : x.a; }).join('');
      var sd = eq1.split('＝');
      if (sd.length !== 2 || evalExpr(sd[0]) !== evalExpr(sd[1])) err(where, '□に答えを入れても式が成り立たない: ' + eq1);
      // □の値が1つに決まる（□を x、x+0.001 にしたときに左辺がかわる＝1次式で増え方が0でない）
      var tpl = p.parts.map(function (x) { return typeof x === 'string' ? x : '#'; }).join('').split('＝')[0];
      var l1 = evalExpr(tpl.replace('#', '1')), l2 = evalExpr(tpl.replace('#', '2'));
      if (l1 === l2) err(where, '□が決まらない');
      if (src.kind === 'boxM' && !p.beyond) err(where, '□×整数 は beyond');
      break;
    }
    case 'card': {
      var cards = src.cards, k = src.k;
      if (!Array.isArray(cards) || cards.length < 3 || cards.length > 5 || new Set(cards).size !== cards.length) { err(where, 'カードの数'); break; }
      cards.forEach(function (c) { if (q.indexOf('［' + c + '］') < 0) err(where, 'カードが問題文にない: ' + c); });
      if (q.indexOf('［．］') < 0) err(where, '小数点のカードがない');
      var form = '□'.repeat(k) + '.' + '□'.repeat(cards.length - k);
      if (q.indexOf('「' + form + '」') < 0) err(where, '形が問題文にない: ' + form);
      if (cards.indexOf(0) >= 0 && q.indexOf('0のカードを おけません') < 0) err(where, '0のきまりが問題文にない');
      var vals = oniCardValues(cards, k);
      var mx = vals.reduce(function (a, b) { return b > a ? b : a; }), mn = vals.reduce(function (a, b) { return b < a ? b : a; });
      var want;
      if (/いちばん大きい数を/.test(q)) want = [mx];
      else if (/いちばん小さい数を/.test(q)) want = [mn];
      else if ((m = /([\d.]+)に いちばん近い数を/.exec(q))) {
        var T = D(m[1]), bd = null;
        vals.forEach(function (x) { var dd = x > T ? x - T : T - x; if (bd === null || dd < bd) bd = dd; });
        want = vals.filter(function (x) { return (x > T ? x - T : T - x) === bd; });
        if (want.length !== 1) err(where, 'いちばん近い数が1つに決まらない');
      } else { err(where, 'カードの問題の形'); break; }
      if (S(want[0]) !== ss[0]) err(where, 'カードの答えちがい ' + S(want[0]) + ' / ' + ss[0]);
      if (decimals(ss[0]) !== cards.length - k) err(where, 'カードの答えのけた');
      break;
    }
    case 'mushikui': {
      var pat = p.parts.map(function (x) { return typeof x === 'string' ? x : '?'; }).join('');
      ss.forEach(function (d) { if (!/^\d$/.test(d)) err(where, '虫食いの□は1けた: ' + d); });
      var sols = oniMushikuiSolutions(pat);
      if (sols.length !== 1) err(where, '虫食い算の解が1つでない: ' + pat + ' → ' + sols.length);
      else if (sols[0] !== ss.join('')) err(where, '虫食い算の答えちがい ' + sols[0] + ' / ' + ss.join(''));
      break;
    }
    case 'seq': {
      var shown = p.parts.map(function (x) { return typeof x === 'string' ? x : '?'; }).join('').split('、');
      var terms = src.terms.map(D);
      if (shown.length !== terms.length || shown.filter(function (x) { return x === '?'; }).length !== 1) { err(where, '数の列の形'); break; }
      shown.forEach(function (x, i2) { if (x !== '?' && D(x) !== terms[i2]) err(where, '数の列の数がちがう'); });
      if (S(terms[shown.indexOf('?')]) !== ss[0]) err(where, '数の列の答えちがい');
      var dif = []; for (var a2 = 1; a2 < terms.length; a2++) dif.push(terms[a2] - terms[a2 - 1]);
      var okRule = false;
      if (src.rule === 'add' || src.rule === 'sub') okRule = dif.every(function (x) { return x === dif[0]; }) && (src.rule === 'add' ? dif[0] > 0n : dif[0] < 0n);
      else if (src.rule === 'x10') okRule = terms.every(function (x, i3) { return i3 === 0 || x === terms[i3 - 1] * 10n; }) || terms.every(function (x, i3) { return i3 === 0 || x * 10n === terms[i3 - 1]; });
      else if (src.rule === 'x2') okRule = terms.every(function (x, i3) { return i3 === 0 || x === terms[i3 - 1] * 2n; }) && p.beyond === true;
      else if (src.rule === 'diff2') okRule = dif.every(function (x, i3) { return i3 < 2 || x - dif[i3 - 1] === dif[1] - dif[0]; }) && shown[shown.length - 1] === '?';
      if (!okRule) err(where, '数の列のきまりがちがう: ' + src.rule + ' ' + src.terms.join(','));
      break;
    }
    case 'units': {
      var want2;
      if ((m = /^([\d.]+)は、(0\.0*1)を何こ集めた数ですか。$/.exec(q))) want2 = div(D(m[1]), D(m[2]));
      else if ((m = /^([\d.]+)と([\d.]+)をたした数は、(0\.0*1)を何こ集めた数ですか。$/.exec(q))) want2 = div(D(m[1]) + D(m[2]), D(m[3]));
      else {
        var re2 = /(?:(0\.0*1)|1を(10|100|1000)等分した1つ分)を(\d+)こ/g, xs = [];
        while ((m = re2.exec(q))) xs.push((m[1] ? D(m[1]) : D('1') / BigInt(m[2])) * BigInt(m[3]));
        if (xs.length !== 2) { err(where, '何こ分の問題を読めない: ' + q); break; }
        want2 = /ひくと/.test(q) ? xs[0] - xs[1] : xs[0] + xs[1];
      }
      if (S(want2) !== ss[0]) err(where, '何こ分の答えちがい ' + S(want2) + ' / ' + ss[0]);
      break;
    }
    case 'choice': {
      if (p.type !== 'choice' || p.options.length !== 4) { err(where, '選択肢は4つ'); break; }
      var ov = p.options.map(oniOptionValue);
      if (new Set(ov.map(S)).size !== 4) err(where, '同じ大きさの選択肢がある');
      var big = /いちばん大きい/.test(q), bi = 0;
      ov.forEach(function (x, i4) { if (big ? x > ov[bi] : x < ov[bi]) bi = i4; });
      if (p.options[bi] !== p.a) err(where, '選択の答えちがい ' + p.options[bi] + ' / ' + p.a);
      break;
    }
  }
}


// ---------- レベル（まとめモード）の決まり ----------
var LEVELS = ['easy', 'normal', 'hard'];
function alignInt(s, e) { var ps = String(s).split('.'), f = ps[1] || ''; while (f.length < e) f += '0'; return parseInt(ps[0] + f, 10); }
function carries(a, b) { var c = 0, k = 0; while (a > 0 || b > 0) { var s = a % 10 + b % 10 + c; c = s >= 10 ? 1 : 0; k += c; a = Math.floor(a / 10); b = Math.floor(b / 10); } return k; }
function borrows(a, b) { var br = 0, k = 0; while (a > 0 || b > 0) { var d = a % 10 - br - b % 10; br = d < 0 ? 1 : 0; k += br; a = Math.floor(a / 10); b = Math.floor(b / 10); } return k; }
function allNumbers(p) {
  var out = [], txt = [];
  if (typeof p.q === 'string') txt.push(p.q);
  (p.parts || []).forEach(function (x) { if (typeof x === 'string') txt.push(x); else if (x && x.a != null) out.push(String(x.a)); });
  (p.items || []).forEach(function (x) { out.push(String(x)); });
  if (p.type === 'hissan') { out.push(p.a, p.b); }
  if (p.fig) {
    if (p.fig.kind === 'numberline') { out.push(String(p.fig.min), String(p.fig.max)); (p.fig.arrows || []).forEach(function (a) { out.push(String(a.v)); }); }
    if (p.fig.kind === 'placeTable') (p.fig.rows || []).forEach(function (r) { out.push(r); });
  }
  txt.forEach(function (t) { (t.match(/\d+(?:\.\d+)?/g) || []).forEach(function (m) { out.push(m); }); });
  return out;
}
// かんたん・むずかしい（と新しい生成器）で、レベルの決まりを守っているか
function levelRules(name, p, where, level) {
  var isNew = ['threeSum', 'wordAdd', 'wordSub'].indexOf(name) >= 0;
  if (level === 'easy' || level === 'hard') {
    if (!p.src || p.src.lv !== level) err(where, 'src.lv が ' + level + ' でない');
  }
  if (level !== 'normal' || isNew) {
    // ヒントで答えを言っていない
    if (p.type === 'fill') slots(p).forEach(function (a) {
      if (a.length < 2) return;
      var re = new RegExp('(^|[^\\d.])' + a.replace('.', '\\.') + '(?![\\d]|\\.\\d)');
      (p.hints || []).forEach(function (h) { if (re.test(h)) err(where, 'ヒントに答え ' + a + ' が出ている: ' + h); });
    });
  }
  if (level === 'easy') {
    allNumbers(p).forEach(function (s) { if (decimals(s) > 2) err(where, 'かんたんに小数第三位: ' + s); });
    if (p.type === 'hissan') {
      if (decimals(p.a) !== decimals(p.b)) err(where, 'かんたんで小数のけたがちがう: ' + p.a + p.op + p.b);
      var A = alignInt(p.a, 2), B = alignInt(p.b, 2);
      if (p.op === '+' && carries(A, B)) err(where, 'かんたんにくり上がり: ' + p.a + '+' + p.b);
      if (p.op === '-' && borrows(A, B)) err(where, 'かんたんにくり下がり: ' + p.a + '-' + p.b);
    }
    if (name === 'wordAdd' || name === 'wordSub') {
      var m = /^([\d.]+)([+-])([\d.]+)$/.exec(p.src.expr);
      if (!m) err(where, 'かんたんの文章題の式: ' + p.src.expr);
      else {
        if (decimals(m[1]) !== decimals(m[3])) err(where, 'かんたんで小数のけたがちがう: ' + p.src.expr);
        var x = alignInt(m[1], 2), y = alignInt(m[3], 2);
        if (m[2] === '+' ? carries(x, y) : borrows(x, y)) err(where, 'かんたんにくり上がり・くり下がり: ' + p.src.expr);
      }
    }
    if (name === 'threeSum') {
      var ns = p.src.nums.map(function (s) { return alignInt(s, 2); });
      if (carries(ns[0], ns[1]) || carries(ns[0] + ns[1], ns[2])) err(where, 'かんたんにくり上がり: ' + p.src.nums.join('+'));
    }
    if (p.fig && p.fig.kind === 'masu' && p.fig.level !== 2) err(where, 'かんたんのますは level2');
    if (p.fig && p.fig.kind === 'numberline' && (p.fig.min < 0 || p.fig.max > 1)) err(where, 'かんたんの数直線は0〜1');
    if (name === 'compare' && (p.q.match(/[\d.]+ □ [\d.]+$/) || []).length !== 1) err(where, 'かんたんの大小は2つの数');
    if (p.type === 'order' && p.items.length > 3) err(where, 'かんたんのならべかえが多い');
  }
  if (level === 'hard') {
    if (p.type === 'hissan') {
      var a2 = alignInt(p.a, 2), b2 = alignInt(p.b, 2);
      var ok = decimals(p.a) !== decimals(p.b) || decimals(p.a) === 0 || decimals(p.b) === 0 ||
        (p.op === '+' ? carries(a2, b2) >= 2 || (a2 + b2) % 100 === 0 : borrows(a2, b2) >= 2);
      if (!ok) err(where, 'むずかしいの筆算がかんたんすぎる: ' + p.a + p.op + p.b);
    }
    if (p.type === 'order' && p.items.length < 5) err(where, 'むずかしいのならべかえは5つ以上');
    if (name === 'laws' && p.src.kind === 'comm') err(where, 'むずかしいに交かんのきまりだけの問題');
  }
}

// ---------- 全部の検査 ----------
function main() {
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


  // ---------- レベルつきの生成器（3レベル × N回）----------
  var ALL_GENS = G.names(), lvStats = {};
  LEVELS.forEach(function (lv, li) {
    ALL_GENS.forEach(function (name, gi) {
      var rng = mulberry32(999 + li * 10007 + gi * 131);
      var kinds = {};
      for (var i = 0; i < N; i++) {
        var where = 'gen ' + name + '[' + lv + '] #' + i, p;
        try { p = G.make(name, rng, { level: lv }); } catch (e) { err(where, '例外: ' + e.message); continue; }
        try {
          checkProblem(where, p);
          verifyGen(name, p, where, lv);
          levelRules(name, p, where, lv);
          kinds[JSON.stringify([p.q, p.parts, p.items, p.a, p.b])] = 1;
        } catch (e) { err(where, '検証エラー: ' + e.message + ' ' + JSON.stringify(p)); }
      }
      lvStats[lv + ' ' + name] = Object.keys(kinds).length;
      if (Object.keys(kinds).length < N * 0.25) warn('gen ' + name + '[' + lv + ']', 'ちがう問題が少ない: ' + Object.keys(kinds).length);
    });
  });
  // level を省略したときと 'normal' は同じ問題（今までの呼び方はそのまま）
  ALL_GENS.forEach(function (name, gi) {
    var r1 = mulberry32(4242 + gi), r2 = mulberry32(4242 + gi);
    for (var i = 0; i < 50; i++) {
      if (JSON.stringify(G.make(name, r1)) !== JSON.stringify(G.make(name, r2, { level: 'normal' }))) { err('gen ' + name, 'level:normal と省略で問題がちがう'); break; }
    }
  });

  // ---------- 細かい技能（おすすめモード。担当O） ----------
  var skillIds = G.skillIds ? G.skillIds() : [], skillStats = {};
  if (!skillIds.length) err('skills', 'Generators.skillIds がない');
  Lessons.forEach(function (L) {
    L.problems.forEach(function (p) {
      if (p.type === 'gen') return;
      var id = G.skillOf(p);
      if (skillIds.indexOf(id) < 0) err(p.id || ('L' + L.no), '技能が決まらない: ' + id);
      skillStats[id] = (skillStats[id] || 0) + 1;
    });
  });
  skillIds.forEach(function (id, si) {
    G.skillGens(id).forEach(function (name) {
      if (ALL_GENS.indexOf(name) < 0) { err('skill ' + id, '生成器がない ' + name); return; }
      LEVELS.forEach(function (lv) {
        var rng = mulberry32(6100 + si * 7 + lv.length);
        for (var i = 0; i < 40; i++) {
          var where = 'skill ' + id + ' ' + name + '[' + lv + '] #' + i, p;
          try { p = G.make(name, rng, { level: lv, skill: id }); } catch (e) { err(where, '例外: ' + e.message); break; }
          if (G.skillOf(p) !== id) err(where, '技能がちがう: ' + G.skillOf(p));
          if (!p.src || p.src.skill !== id) err(where, 'src.skill');
          var real = (p.src && p.src.lv) || 'normal';
          if (lv === 'easy' && real === 'hard') err(where, 'かんたんを選んで むずかしいができた');
          if (lv === 'hard' && real === 'easy') err(where, 'むずかしいを選んで かんたんができた');
          try { checkProblem(where, p); verifyGen(name, p, where, real); levelRules(name, p, where, real); }
          catch (e) { err(where, '検証エラー: ' + e.message); }
        }
      });
    });
  });
  // skill を指定しないときは今までと同じ問題（乱数の使い方も同じ）
  ALL_GENS.forEach(function (name, gi) {
    var r1 = mulberry32(5150 + gi), r2 = mulberry32(5150 + gi);
    for (var i = 0; i < 30; i++) {
      if (JSON.stringify(G.make(name, r1)) !== JSON.stringify(G.make(name, r2, { skill: '' }))) { err('gen ' + name, 'skill 省略で問題がちがう'); break; }
    }
  });

  // ---------- 鬼ムズ（追加8）：4種 × N回 ----------
  var oniNames = G.oniNames ? G.oniNames() : [], oniStats = {};
  if (oniNames.join() !== 'oniAdd,oniMulDiv,oniMix,oniIdea') err('Generators', 'oniNames: ' + oniNames.join());
  oniNames.forEach(function (name, gi) {
    if (ALL_GENS.indexOf(name) >= 0) err('Generators', '鬼ムズが names() に入っている: ' + name);
    var rng = mulberry32(8800 + gi * 313), kinds = {};
    for (var i = 0; i < N; i++) {
      var where = 'gen ' + name + ' #' + i, p;
      try { p = G.make(name, rng); } catch (e) { err(where, '例外: ' + e.message); continue; }
      try { checkProblem(where, p); verifyGen(name, p, where, 'oni'); levelRules(name, p, where, 'oni'); kinds[JSON.stringify([p.q, p.parts, p.options])] = 1; }
      catch (e) { err(where, '検証エラー: ' + e.message + ' ' + JSON.stringify(p)); }
    }
    oniStats[name] = Object.keys(kinds).length;
    if (oniStats[name] < N * 0.9) warn('gen ' + name, 'ちがう問題が少ない: ' + oniStats[name]);
  });

  // ---------- 結果 ----------
  console.log('鬼ムズ: ' + oniNames.length + '種 × ' + N + '回（ちがう問題の数: ' + oniNames.map(function (n) { return n + ' ' + oniStats[n]; }).join(', ') + '）');
  console.log('技能: ' + skillIds.length + 'こ（教科書の問題の技能: ' + skillIds.map(function (id) { return id + ' ' + (skillStats[id] || 0); }).join(', ') + '）');
  console.log('問題数: ' + total + '（' + Object.keys(byType).map(function (k) { return k + ' ' + byType[k]; }).join('、') + '）');
  Lessons.forEach(function (L) { console.log('  第' + L.no + '時 ' + L.title + ': ' + L.problems.length + '問'); });
  console.log('生成器: ' + CONTRACT_GENS.length + '種 × ' + N + '回（ちがう問題の数: ' +
    CONTRACT_GENS.map(function (n) { return n + ' ' + genStats[n]; }).join(', ') + '）');
  console.log('レベルつき: ' + LEVELS.length + 'レベル × ' + ALL_GENS.length + '種 × ' + N + '回（ちがう問題の数: ' +
    LEVELS.map(function (lv) { return lv + ' ' + ALL_GENS.map(function (n) { return lvStats[lv + ' ' + n]; }).join('/'); }).join('、') + '）');
  if (warnings.length) { console.log('\n注意 ' + warnings.length + ' 件:'); warnings.forEach(function (w) { console.log('  - ' + w); }); }
  if (errors.length) {
    console.log('\nエラー ' + errors.length + ' 件:');
    errors.slice(0, 80).forEach(function (e) { console.log('  x ' + e); });
    process.exitCode = 1;
    return;
  }
  console.log('\nすべての検証に通りました。');
}

function takeErrors() { var e = errors.slice(); errors.length = 0; warnings.length = 0; return e; }
module.exports = { verifyOni: verifyOni, oniCardValues: oniCardValues, oniMushikuiSolutions: oniMushikuiSolutions, oniOptionValue: oniOptionValue, evalExpr: evalExpr, D: D, S: S, checkProblem: checkProblem, verifyGen: verifyGen, levelRules: levelRules, mulberry32: mulberry32, takeErrors: takeErrors, LEVELS: LEVELS };
if (require.main === module) main();
