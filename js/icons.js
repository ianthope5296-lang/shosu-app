/* Shosu.Icons — 自作の小さなSVGアイコン（担当K）
 * 絵文字や、絵文字のように見える記号は使わない。宇宙モチーフ（星・惑星・流れ星・望遠鏡など）で統一する。
 * 線は currentColor（まわりの文字の色）で描くので、明るいボタンでも、夜空のバーでも見やすい。
 * 金色のアクセント（星）は、どの背景でも目立つように線で縁どりする。
 *
 *   Shosu.Icons.get(name, {size, cls, title}) → SVG文字列
 *   Shosu.Icons.el(name, opts)                → <span class="ic-wrap"> の中にSVG
 *   Shosu.Icons.label(el, text, name, {after}) → el の中身を「アイコン＋文字」にする
 *   Shosu.Icons.arrows(el)                     → 文字の先頭の「◀ 」・最後の「 ▶」を、流れ星の矢印SVGにかえる
 * classic script。ほかのファイルは、このファイルがなくても文字だけで動くようにしてある。
 */
(function (root) {
  'use strict';
  var S = root.Shosu = root.Shosu || {};
  var GOLD = '#ffd34d';

  // 4方向にきらめく星（へこんだ4角星）
  function spark(cx, cy, r, attrs) {
    var k = r * 0.28;
    var d = 'M' + cx + ' ' + (cy - r) +
      'C' + (cx + k * 0.3) + ' ' + (cy - k) + ' ' + (cx + k) + ' ' + (cy - k * 0.3) + ' ' + (cx + r) + ' ' + cy +
      'C' + (cx + k) + ' ' + (cy + k * 0.3) + ' ' + (cx + k * 0.3) + ' ' + (cy + k) + ' ' + cx + ' ' + (cy + r) +
      'C' + (cx - k * 0.3) + ' ' + (cy + k) + ' ' + (cx - k) + ' ' + (cy + k * 0.3) + ' ' + (cx - r) + ' ' + cy +
      'C' + (cx - k) + ' ' + (cy - k * 0.3) + ' ' + (cx - k * 0.3) + ' ' + (cy - k) + ' ' + cx + ' ' + (cy - r) + 'Z';
    return '<path d="' + d + '" ' + (attrs || '') + '/>';
  }
  function star5(cx, cy, ro, ri) {
    var p = [];
    for (var i = 0; i < 10; i++) {
      var r = i % 2 ? ri : ro, a = -Math.PI / 2 + i * Math.PI / 5;
      p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2));
    }
    return p.join(' ');
  }
  var GOLD_SPARK = 'fill="' + GOLD + '" stroke="currentColor" stroke-width="1.2"';

  // 流れ星の矢印（左向き）。右向きは左右反転して使う
  var COMET_LEFT =
    '<path d="M12 4.6 3.4 12l8.6 7.4z" fill="currentColor"/>' +
    '<path d="M11 12h10"/>' +
    '<path d="M13.4 8.3h5M13.4 15.7h5" opacity=".55"/>';

  /* 線のアイコン（viewBox 0 0 24 24、線は currentColor） */
  var LINE = {
    prev: COMET_LEFT,
    next: '<g transform="matrix(-1 0 0 1 24 0)">' + COMET_LEFT + '</g>',
    // 望遠鏡（先生メニュー）
    telescope:
      '<path d="M3.2 12.6 15.4 6.3l1.9 3.8L5.1 16.4z"/>' +
      '<path d="M17.3 5.3 19.6 4.1l2 4-2.3 1.2z"/>' +
      '<path d="M10.6 13 7.2 21M11.6 12.6 15.2 21"/>' +
      spark(5.2, 5, 3.2, GOLD_SPARK),
    // えんぴつと星（問題をつくる・書く）
    pen:
      '<path d="M4.2 19.8 5.3 15 15.6 4.7a2.2 2.2 0 0 1 3.1 3.1L8.4 18.1z"/>' +
      '<path d="M13.8 6.5l3.1 3.1"/>' +
      spark(18.6, 17.6, 3.6, GOLD_SPARK),
    // わっかのある惑星（つくった問題をしまっておく星）
    planet:
      '<circle cx="12" cy="12" r="5.6"/>' +
      '<path d="M1.5 12A10.5 3.6 0 0 0 22.5 12M1.5 12A10.5 3.6 0 0 1 7.43 8.76M16.57 8.76A10.5 3.6 0 0 1 22.5 12" transform="rotate(-25 12 12)"/>' +
      spark(19.4, 19.2, 2.6, GOLD_SPARK),
    // 手紙を運ぶ小さな流れ星（もらった問題）
    letter:
      '<rect x="8.6" y="6.8" width="12.8" height="10.4" rx="1.6"/>' +
      '<path d="m9.2 7.6 6 4.9 6-4.9"/>' +
      '<path d="M1.8 9.2h4.4M3 12h3.2M1.8 14.8h4.4" opacity=".6"/>' +
      spark(20.8, 4.2, 2.8, GOLD_SPARK),
    // 星座（星のずかん）
    constellation:
      '<path d="M3.8 17.5 8.5 8.2l6.3 4 5.4-7.4M14.8 12.2l3.4 7.3" stroke-width="1.5" opacity=".75"/>' +
      '<circle cx="3.8" cy="17.5" r="1.9" ' + GOLD_SPARK + '/>' +
      '<circle cx="8.5" cy="8.2" r="1.9" ' + GOLD_SPARK + '/>' +
      '<circle cx="14.8" cy="12.2" r="2.2" ' + GOLD_SPARK + '/>' +
      '<circle cx="20.2" cy="4.8" r="1.7" ' + GOLD_SPARK + '/>' +
      '<circle cx="18.2" cy="19.5" r="1.7" ' + GOLD_SPARK + '/>',
    // パラボラアンテナ（もんだいボックス：集める）
    dish:
      '<path d="M4.4 9.6a8.4 8.4 0 0 0 10 10z"/>' +
      '<path d="M9.4 14.6l4.2-4.2"/>' +
      '<circle cx="14.2" cy="9.8" r="1.2" fill="currentColor"/>' +
      '<path d="M15.6 4.6a4.4 4.4 0 0 1 3.8 3.8M15.8 1.4a7.6 7.6 0 0 1 6.8 6.8" opacity=".7"/>',
    // ロケット（スタート）
    rocket:
      '<path d="M12 2.6c3.2 2.4 4.4 6.2 3.6 11.4H8.4C7.6 8.8 8.8 5 12 2.6z"/>' +
      '<circle cx="12" cy="9" r="1.7"/>' +
      '<path d="M8.4 11.2 5.4 15v2.6l3.3-1.8M15.6 11.2l3 3.8v2.6l-3.3-1.8"/>' +
      '<path d="M10.3 17.2c-.4 1.8 0 3.2 1.7 4.4 1.7-1.2 2.1-2.6 1.7-4.4" fill="' + GOLD + '" stroke-width="1.4"/>',
    // 全画面にする／やめる（まん中に星）
    expand:
      '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>' +
      spark(12, 12, 3.6, GOLD_SPARK),
    shrink:
      '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>' +
      '<circle cx="12" cy="12" r="1.4" fill="currentColor"/>',
    // 2つの数を入れかえる
    swap: '<path d="M8 19V4.5M4.6 8 8 4.5 11.4 8M16 5v14.5M12.6 16 16 19.5l3.4-3.5"/>',
    // 1字けす
    backspace:
      '<path d="M9.2 5.2h10.3a2 2 0 0 1 2 2v9.6a2 2 0 0 1-2 2H9.2L2.8 12z"/>' +
      '<path d="m11.6 9.4 5.2 5.2m0-5.2-5.2 5.2"/>',
    // ふくしゅう（月）
    moon:
      '<path d="M15.6 3.4a8.8 8.8 0 1 0 5 13.8 7.2 7.2 0 0 1-5-13.8z"/>' +
      spark(19.4, 5.6, 2.6, GOLD_SPARK),
    // ふつうの星（線）
    star: '<polygon points="' + star5(12, 12.8, 9.4, 4.2) + '" ' + 'fill="' + GOLD + '"/>',
    // じぶんで計画：星図（星をむすぶ線）とコンパス
    plan:
      '<path d="M2.6 6.2 7 3.4l4.4 3.2" stroke-width="1.5" opacity=".7"/>' +
      '<circle cx="2.6" cy="6.2" r="1.3" ' + GOLD_SPARK + '/>' +
      '<circle cx="7" cy="3.4" r="1.3" ' + GOLD_SPARK + '/>' +
      '<circle cx="11.4" cy="6.6" r="1.3" ' + GOLD_SPARK + '/>' +
      '<circle cx="14.6" cy="14.6" r="7"/>' +
      '<path d="M17.8 11.4 15.9 15.9 11.4 17.8 13.3 13.3z" fill="currentColor"/>' +
      '<circle cx="14.6" cy="14.6" r=".9" fill="' + GOLD + '" stroke="none"/>',
    // ふりかえり：三日月と鉛筆
    reflect:
      '<path d="M10.2 2.8a7.6 7.6 0 1 0 6.2 11.6 6 6 0 0 1-6.2-11.6z"/>' +
      '<path d="M12.6 21.4l.7-3.2 6.6-6.6a1.6 1.6 0 0 1 2.3 2.3l-6.6 6.6z"/>' +
      '<path d="M18.6 12.9l2.3 2.3" stroke-width="1.5"/>' +
      spark(18.4, 4.4, 2.6, GOLD_SPARK),
    // ゴール：旗の立つ惑星
    goal:
      '<path d="M3.4 19.4a8.6 8.6 0 0 1 17.2 0z"/>' +
      '<path d="M6.4 16.6c2.6-.9 5.4-.9 8.2.2" stroke-width="1.4" opacity=".6"/>' +
      '<path d="M12 11.2V2.6"/>' +
      '<path d="M12 2.8h7.2l-1.8 2.3 1.8 2.3H12z" fill="' + GOLD + '" stroke-width="1.4"/>' +
      '<circle cx="4" cy="5.4" r=".9" fill="currentColor" stroke="none"/>',
    // カレンダー（まん中に星）
    calendar:
      '<rect x="3.2" y="4.6" width="17.6" height="16" rx="2.2"/>' +
      '<path d="M3.2 9.4h17.6M8 2.8v3.6M16 2.8v3.6"/>' +
      spark(12, 15, 3.4, GOLD_SPARK),
    // ダウンロード（星が下にとどく）
    download:
      '<path d="M12 3.2v11M7.6 10l4.4 4.4 4.4-4.4"/>' +
      '<path d="M3.6 15.6v3a2 2 0 0 0 2 2h12.8a2 2 0 0 0 2-2v-3"/>' +
      spark(19.6, 4.6, 2.4, GOLD_SPARK),
    // 自己評価の記号（◎・○・△を自作の絵で）
    'ev-double': '<circle cx="12" cy="12" r="9.2" stroke="#d23c3c" stroke-width="2.4"/><circle cx="12" cy="12" r="4.6" stroke="#d23c3c" stroke-width="2.4"/>',
    'ev-single': '<circle cx="12" cy="12" r="8.6" stroke="#e0702a" stroke-width="2.6"/>',
    'ev-triangle': '<path d="M12 3.4 21 19.6H3z" stroke="#3a6fb0" stroke-width="2.6"/>',
    // コピー（2枚の紙と星）
    copy:
      '<rect x="8.4" y="8.4" width="12.2" height="12.2" rx="2"/>' +
      '<path d="M15.6 5.2V5a1.8 1.8 0 0 0-1.8-1.8H5A1.8 1.8 0 0 0 3.2 5v8.8A1.8 1.8 0 0 0 5 15.6h.2"/>' +
      spark(14.5, 14.5, 2.6, GOLD_SPARK)
  };

  /* 色つきの絵（viewBox 0 0 64 64、夜空のバーやカードの上で使う） */
  var COLOR = {
    // ロゴのしるし：わっかの惑星と、小数点のような金の星
    emblem:
      '<circle cx="32" cy="32" r="30" fill="#1b1f57" stroke="#7d74e0" stroke-width="2"/>' +
      '<circle cx="12" cy="18" r="1.4" fill="#fff"/><circle cx="50" cy="50" r="1.2" fill="#cfd6ff"/><circle cx="17" cy="47" r="1" fill="#fff"/>' +
      '<circle cx="29" cy="35" r="13" fill="#8a6cf0"/>' +
      '<path d="M18.5 30.5c4-6 13-8.5 20-4.5" stroke="#b9a6ff" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<path d="M20.5 40.5c5 3.5 12 3.5 17-.5" stroke="#6a4fd0" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="29" cy="35" rx="24" ry="6.5" fill="none" stroke="#ffd34d" stroke-width="3" transform="rotate(-20 29 35)"/>' +
      '<path d="M16.3 32.2a13 13 0 0 1 25.3-4.7" fill="none" stroke="#8a6cf0" stroke-width="3.4"/>' +
      spark(48, 15, 8, 'fill="#ffd34d" stroke="#fff4c2" stroke-width="1"') +
      '<circle cx="48" cy="15" r="2" fill="#fff"/>',
    // まとめモードの入口：わっかの惑星ときらめく星
    saturn:
      '<circle cx="30" cy="34" r="15" fill="#ffd166"/>' +
      '<path d="M19 30c6-3 15-3 22 1" stroke="#ffb02e" stroke-width="3" fill="none" stroke-linecap="round"/>' +
      '<ellipse cx="30" cy="34" rx="26" ry="7" fill="none" stroke="#fff" stroke-width="3" transform="rotate(-18 30 34)"/>' +
      '<path d="M16.4 30.5a14 14 0 0 1 27.4-2.2" fill="none" stroke="#ffd166" stroke-width="3.4"/>' +
      spark(52, 12, 8, 'fill="#fff"') +
      '<circle cx="10" cy="12" r="2" fill="#fff"/><circle cx="56" cy="52" r="2.2" fill="#fff"/>'
  };

  function attrEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  function get(name, opts) {
    opts = opts || {};
    var line = LINE[name], color = COLOR[name];
    if (!line && !color) return '';
    var size = opts.size != null ? (typeof opts.size === 'number' ? opts.size + 'px' : opts.size) : null;
    var a = 'class="ic ic-' + name + (opts.cls ? ' ' + attrEsc(opts.cls) : '') + '"' +
      ' xmlns="http://www.w3.org/2000/svg" focusable="false"' +
      (size ? ' width="' + attrEsc(size) + '" height="' + attrEsc(size) + '"' : '') +
      (opts.title ? ' role="img" aria-label="' + attrEsc(opts.title) + '"' : ' aria-hidden="true"');
    if (line) {
      return '<svg ' + a + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (opts.stroke || 2) +
        '" stroke-linecap="round" stroke-linejoin="round">' + line + '</svg>';
    }
    return '<svg ' + a + ' viewBox="0 0 64 64">' + color + '</svg>';
  }

  function el(name, opts) {
    var s = document.createElement('span');
    s.className = 'ic-wrap' + (opts && opts.wrapCls ? ' ' + opts.wrapCls : '');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = get(name, opts);
    return s;
  }

  // el の中身を「アイコン＋文字」（after なら「文字＋アイコン」）にする
  function label(node, text, name, opts) {
    opts = opts || {};
    node.textContent = '';
    var t = document.createElement('span');
    t.className = 'ic-text';
    t.textContent = text;
    var ic = get(name, opts) ? el(name, opts) : null;
    if (ic && !opts.after) node.appendChild(ic);
    node.appendChild(t);
    if (ic && opts.after) node.appendChild(ic);
    node.classList.add('has-ic');
    return node;
  }

  // 「◀ ホーム」「つぎ ▶」のような文字を、流れ星の矢印SVGつきにかえる（ほかの文字はそのまま）
  var L_MARK = /^\s*◀︎?\s*/, R_MARK = /\s*▶︎?\s*$/;
  function arrows(node) {
    if (!node || node.children.length) return node;
    var txt = node.textContent || '';
    if (L_MARK.test(txt)) return label(node, txt.replace(L_MARK, ''), 'prev');
    if (R_MARK.test(txt)) return label(node, txt.replace(R_MARK, ''), 'next', { after: true });
    return node;
  }
  // 文の中の「◀ なおす」などを、矢印なしの言葉にする（読み上げ・説明文用）
  function plain(text) { return String(text).replace(/◀︎?\s*|\s*▶︎?/g, ''); }

  S.Icons = {
    get: get,
    el: el,
    label: label,
    arrows: arrows,
    plain: plain,
    has: function (name) { return !!(LINE[name] || COLOR[name]); },
    names: function () { return Object.keys(LINE).concat(Object.keys(COLOR)); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
