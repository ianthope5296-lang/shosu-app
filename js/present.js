/* Shosu.Present — 子どもが作った問題の提示画面（大型モニター用）と、手書きの絵の描画（担当G）
 *
 * Present.drawInk(ink, opts?) -> HTMLCanvasElement
 *   ink = { w, h, strokes: [[{x,y}, ...], ...] }
 *   opts = { width, height, color, lineWidth（絵の座標での太さ。表示サイズに比例して太くなる）, trim, pad, label }
 *   width だけなら幅に合わせ、height もあればその中に収まるように、縦横比を保って描く（DPR 対応）。
 *   trim:true なら書いた部分だけを切り出して描く（名前などを大きく見せるとき）。
 *
 * Present.mount(el, up, opts) -> { destroy() }
 *   opts = { token, onSolve(), list?: { index（0から）, total, onPrev(), onNext() },
 *            back?: { href, label }（左上の戻るボタン。ふだんは ◀ ホーム） }
 */
(function (S) {
  'use strict';

  var KIND_LABEL = { hissan: '筆算', fill: '文章題・□うめ', compare: '大小くらべ', masu: 'ますの図', numberline: '数直線' };

  /* ---------- 小さな道具 ---------- */
  function h(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return b;
  }
  function dpr() { return Math.max(1, Math.min(3, window.devicePixelRatio || 1)); }
  function toast(msg) {
    var t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2200);
  }
  function opSign(op) { return op === '-' ? '−' : '＋'; }

  /* ---------- 手書きの絵 ---------- */
  function pt(p) {
    if (Array.isArray(p)) return { x: +p[0] || 0, y: +p[1] || 0 };
    return { x: +(p && p.x) || 0, y: +(p && p.y) || 0 };
  }
  function strokesOf(ink) {
    var out = [];
    ((ink && ink.strokes) || []).forEach(function (s) {
      var pts = (Array.isArray(s) ? s : (s && s.pts) || []).map(pt);
      if (pts.length) out.push(pts);
    });
    return out;
  }
  function isInk(ink) { return !!(ink && typeof ink === 'object' && Array.isArray(ink.strokes)); }
  function hasStrokes(ink) { return isInk(ink) && strokesOf(ink).length > 0; }

  function drawInk(ink, opts) {
    opts = opts || {};
    var strokes = strokesOf(ink);
    var iw = Math.max(1, +(ink && ink.w) || 800), ih = Math.max(1, +(ink && ink.h) || 300);
    var lw = opts.lineWidth || 5;
    var bx = 0, by = 0, bw = iw, bh = ih;
    if (opts.trim && strokes.length) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      strokes.forEach(function (s) { s.forEach(function (p) {
        if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
      }); });
      var pad = opts.pad != null ? opts.pad : lw * 2 + 6;
      bx = x0 - pad; by = y0 - pad; bw = Math.max(x1 - x0 + pad * 2, lw * 4); bh = Math.max(y1 - y0 + pad * 2, lw * 4);
      // 細長くなりすぎないように（「一」だけの名前など）
      if (bh < bw / 8) { by -= (bw / 8 - bh) / 2; bh = bw / 8; }
    }
    var scale;
    if (opts.width && opts.height) scale = Math.min(opts.width / bw, opts.height / bh);
    else if (opts.height) scale = opts.height / bh;
    else scale = (opts.width || bw) / bw;
    if (!isFinite(scale) || scale <= 0) scale = 1;
    var cw = Math.max(1, Math.round(bw * scale)), ch = Math.max(1, Math.round(bh * scale));
    var r = dpr();
    var c = document.createElement('canvas');
    c.className = 'ink-canvas' + (opts.className ? ' ' + opts.className : '');
    c.width = Math.round(cw * r);
    c.height = Math.round(ch * r);
    c.style.width = cw + 'px';
    c.style.height = ch + 'px';
    c.setAttribute('role', 'img');
    if (opts.label) c.setAttribute('aria-label', opts.label);
    var ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.setTransform(r * scale, 0, 0, r * scale, -bx * r * scale, -by * r * scale);
    var w = Math.max(lw, 1.3 / scale); // 小さく表示しても線が消えないように
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = opts.color || '#1f2a44';
    ctx.fillStyle = opts.color || '#1f2a44';
    strokes.forEach(function (s) {
      if (s.length === 1) {
        ctx.beginPath(); ctx.arc(s[0].x, s[0].y, w / 2, 0, Math.PI * 2); ctx.fill();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      if (s.length === 2) ctx.lineTo(s[1].x, s[1].y);
      for (var i = 1; i < s.length - 1; i++) {
        var mx = (s[i].x + s[i + 1].x) / 2, my = (s[i].y + s[i + 1].y) / 2;
        ctx.quadraticCurveTo(s[i].x, s[i].y, mx, my);
      }
      if (s.length > 2) ctx.lineTo(s[s.length - 1].x, s[s.length - 1].y);
      ctx.stroke();
    });
    return c;
  }

  /* ---------- 問題の形 ---------- */
  function share() { return S.Share || null; }
  function toProblem(up, token) {
    try { if (share() && share().toProblem) return share().toProblem(up, token) || {}; } catch (e) { console.error('Share.toProblem', e); }
    return {};
  }
  function answerText(up, p) {
    try { if (share() && share().answerText) return String(share().answerText(up)); } catch (e) { console.error('Share.answerText', e); }
    if (up.kind === 'compare') return up.a + ' ' + (p && p.a || '') + ' ' + up.b;
    if (up.kind === 'hissan' && S.Problems && S.Problems.hissanAnswer) return S.Problems.hissanAnswer(up.op, up.a, up.b).canon;
    if (up.kind === 'fill') return String(up.answer || '') + (up.unit || '');
    return '';
  }
  function splitNum(s) {
    s = String(s == null ? '' : s);
    var i = s.indexOf('.');
    return i < 0 ? { int: s, dec: '' } : { int: s.slice(0, i) || '0', dec: s.slice(i + 1) };
  }
  function compareSign(a, b) {
    var x = parseFloat(a), y = parseFloat(b);
    return x > y ? '>' : x < y ? '<' : '=';
  }

  /* 答えのマスの形（文の中の □）。fills[] に「答えを入れる」関数を集める */
  function answerShape(parts, fills) {
    var line = h('div', 'pr-ans-line');
    (parts || []).forEach(function (part) {
      if (typeof part === 'string') { if (part) line.appendChild(h('span', 'pr-ans-text', part)); return; }
      if (!part || part.a == null) return;
      var slot = h('span', 'pr-slot');
      String(part.a).split('').forEach(function (ch) {
        if (/\d/.test(ch)) {
          var b = h('span', 'pr-box');
          slot.appendChild(b);
          fills.push(function (on) { b.textContent = on ? ch : ''; b.classList.toggle('filled', on); });
        } else {
          slot.appendChild(h('span', ch === '.' ? 'pr-dot' : 'pr-ch', ch));
        }
      });
      line.appendChild(slot);
    });
    return line;
  }

  /* 筆算（数を縦にならべた大きな表示） */
  function hissanView(op, a, b, fills) {
    var A = splitNum(a), B = splitNum(b);
    var ans = (S.Problems && S.Problems.hissanAnswer) ? S.Problems.hissanAnswer(op, a, b) : null;
    var R = splitNum(ans ? ans.canon : '');
    var nInt = Math.max(A.int.length, B.int.length, R.int.length);
    var nDec = Math.max(A.dec.length, B.dec.length);
    var nCols = nInt + nDec;
    var g = h('div', 'pr-hissan');
    g.style.setProperty('--n', String(nCols + 1));
    var tmpl = ['1.1em'];
    for (var c = 0; c < nCols; c++) { tmpl.push('0.72em'); if (c < nCols - 1) tmpl.push('0.24em'); }
    g.style.gridTemplateColumns = tmpl.join(' ');
    function colOf(c) { return 2 + c * 2; }
    function put(el, row, col, span) {
      el.style.gridRow = row;
      el.style.gridColumn = span ? col + ' / span ' + span : col;
      g.appendChild(el);
      return el;
    }
    function row(x, r, cls) {
      var cells = [];
      var start = nInt - x.int.length;
      for (var c = 0; c < nCols; c++) {
        var ch = '';
        if (c < nInt) { if (c >= start) ch = x.int[c - start]; }
        else if (c - nInt < x.dec.length) ch = x.dec[c - nInt];
        cells.push(put(h('span', 'pr-hd ' + (cls || ''), ch), r, colOf(c)));
      }
      var dot = null;
      if (nDec > 0) dot = put(h('span', 'pr-hdot ' + (cls || ''), x.dec.length ? '.' : ''), r, 3 + (nInt - 1) * 2);
      return { cells: cells, dot: dot };
    }
    row(A, 1);
    put(h('span', 'pr-hop', opSign(op)), 2, 1);
    row(B, 2);
    put(h('span', 'pr-hline'), 3, 1, tmpl.length);
    if (ans) {
      row(R, 4, 'pr-hans');
      g.classList.add('ans-hidden');
      fills.push(function (on) { g.classList.toggle('ans-hidden', !on); });
    } else {
      row({ int: '', dec: '' }, 4);
    }
    return g;
  }

  /* ---------- 提示画面 ---------- */
  function mount(el, up, opts) {
    opts = opts || {};
    up = up || {};
    var p = toProblem(up, opts.token);
    var kind = up.kind;
    var destroyed = false;
    var observers = [];
    var fitters = [];
    var fills = [];

    var root = h('div', 'present kind-' + (kind || 'x'));
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'みんなに見せる画面');

    /* --- 上のバー --- */
    var top = h('div', 'pr-top');
    var back = opts.back || { href: '#/', label: '◀ ホーム' };
    var backA = h('a', 'btn pr-back', back.label);
    backA.href = back.href;
    backA.addEventListener('click', function () { exitFullscreen(); });
    top.appendChild(backA);
    top.appendChild(h('span', 'pr-kind', KIND_LABEL[kind] || 'もんだい'));
    var authorBox = h('div', 'pr-author');
    authorBox.appendChild(h('span', 'pr-author-label', 'つくった人'));
    var authorInk = h('span', 'pr-author-ink');
    authorBox.appendChild(authorInk);
    var aInk = p.authorInk || up.author;
    if (hasStrokes(aInk)) {
      top.appendChild(authorBox);
      fitters.push(function () {
        var hh = Math.max(36, Math.min(64, Math.round(window.innerHeight * 0.065)));
        authorInk.innerHTML = '';
        authorInk.appendChild(drawInk(aInk, { height: hh, width: Math.round(window.innerWidth * 0.3), trim: true, lineWidth: 6, label: 'つくった人の名前' }));
      });
    }
    top.appendChild(h('span', 'pr-spacer'));
    if (opts.list && opts.list.total) {
      top.appendChild(h('span', 'pr-count', (opts.list.index + 1) + ' / ' + opts.list.total));
    }
    if (S.Stars && S.Stars.badge) {
      try {
        var sb = S.Stars.badge();
        if (sb) { var sw = h('span', 'topbar-stars pr-stars'); sw.appendChild(sb); top.appendChild(sw); }
      } catch (e) { console.error('Stars.badge', e); }
    }
    var fsBtn = null;
    var fsTarget = document.documentElement;
    if (fsTarget.requestFullscreen && document.fullscreenEnabled !== false) {
      fsBtn = button('⛶ 全画面', 'pr-fs', toggleFullscreen);
      top.appendChild(fsBtn);
    }
    root.appendChild(top);

    /* --- 問題（ステージ）と、ヒント・答え・リンク（横のパネル） --- */
    var body = h('div', 'pr-body');
    var stage = h('div', 'pr-stage');
    var side = h('aside', 'pr-side');
    side.hidden = true;
    body.appendChild(stage);
    body.appendChild(side);
    root.appendChild(body);

    buildStage();

    /* --- 下のボタン --- */
    var bottom = h('div', 'pr-bottom');
    var prevB = null, nextB = null;
    if (opts.list && opts.list.total) {
      prevB = button('◀ まえ', 'pr-nav', function () { if (opts.list.onPrev) opts.list.onPrev(); });
      prevB.disabled = opts.list.index <= 0;
      bottom.appendChild(prevB);
    }
    var mid = h('div', 'pr-actions');
    var hintInk = p.hintInk || up.hint;
    var textHints = (Array.isArray(p.hints) ? p.hints : []).filter(function (x) { return typeof x === 'string' && x; });
    var secHint = section('ヒント', 'pr-sec-hint');
    var hintB = button('ヒントを見せる', 'pr-hint', function () { toggle(secHint, hintB, 'ヒントを見せる', 'ヒントをかくす', fillHint); });
    if (!hasStrokes(hintInk) && !textHints.length) { hintB.disabled = true; hintB.textContent = 'ヒントなし'; }
    var secAns = section('答え', 'pr-sec-ans');
    var ansB = button('答えを見せる', 'pr-answer', function () {
      toggle(secAns, ansB, '答えを見せる', '答えをかくす', fillAnswer);
      var on = !secAns.hidden;
      fills.forEach(function (f) { f(on); });
    });
    var secLink = section('みんなの端末で解こう', 'pr-sec-link');
    var linkB = button('みんなの端末で解く', 'pr-link', function () { toggle(secLink, linkB, 'みんなの端末で解く', 'リンクをとじる', fillLink); });
    var solveB = button('自分で解く ✎', 'primary pr-solve', function () { exitFullscreen(); if (opts.onSolve) opts.onSolve(); });
    if (!opts.onSolve) solveB.hidden = true;
    [hintB, ansB, linkB, solveB].forEach(function (b) { mid.appendChild(b); });
    bottom.appendChild(mid);
    if (opts.list && opts.list.total) {
      var last = opts.list.index >= opts.list.total - 1;
      nextB = button('つぎ ▶', 'pr-nav primary-nav', function () { if (opts.list.onNext) opts.list.onNext(); });
      nextB.disabled = last;
      bottom.appendChild(nextB);
    }
    root.appendChild(bottom);

    el.appendChild(root);

    function section(title, cls) {
      var s = h('section', 'pr-sec ' + cls);
      s.appendChild(h('h2', 'pr-sec-title', title));
      s.appendChild(h('div', 'pr-sec-body'));
      s.hidden = true;
      side.appendChild(s);
      return s;
    }
    function toggle(sec, btn, onLabel, offLabel, fill) {
      var show = sec.hidden;
      if (show && fill && !sec.dataset.filled) { sec.dataset.filled = '1'; fill(sec.querySelector('.pr-sec-body')); }
      sec.hidden = !show;
      btn.textContent = show ? offLabel : onLabel;
      btn.classList.toggle('on', show);
      side.hidden = !Array.prototype.some.call(side.children, function (c) { return !c.hidden; });
      root.classList.toggle('with-side', !side.hidden);
      refit();
    }
    function fillHint(box) {
      if (hasStrokes(hintInk)) {
        var holder = h('div', 'pr-hint-ink');
        box.appendChild(holder);
        fitters.push(function () {
          if (secHint.hidden) return;
          var w = Math.max(160, box.clientWidth - 4);
          holder.innerHTML = '';
          holder.appendChild(drawInk(hintInk, { width: w, height: Math.round(window.innerHeight * 0.36), trim: true, lineWidth: 5, label: 'ヒントの絵' }));
        });
      }
      textHints.forEach(function (t) { box.appendChild(h('div', 'pr-hint-text', t)); });
    }
    function fillAnswer(box) {
      box.appendChild(h('div', 'pr-answer-text', answerText(up, p)));
    }
    function fillLink(box) {
      var note = h('p', 'pr-link-note', 'このリンクを Teams や Classroom のチャットにはって、みんなの端末で開こう。');
      box.appendChild(note);
      var ta = h('textarea', 'pr-link-url');
      ta.readOnly = true;
      ta.rows = 3;
      ta.setAttribute('aria-label', '問題のリンク');
      ta.value = 'リンクを作っています…';
      ta.addEventListener('focus', function () { ta.select(); });
      ta.addEventListener('click', function () { ta.select(); });
      box.appendChild(ta);
      var copyB = button('リンクをコピー', 'primary pr-copy', function () { copy(ta.value, ta); });
      copyB.disabled = true;
      box.appendChild(copyB);
      var len = h('div', 'pr-link-len');
      box.appendChild(len);
      getToken().then(function (tok) {
        if (destroyed) return;
        var url = share() && share().url ? share().url(tok) : location.href.split('#')[0] + '#/q/' + tok;
        ta.value = url;
        copyB.disabled = false;
        len.textContent = '（' + url.length + '文字）';
      }).catch(function (e) {
        console.error(e);
        if (destroyed) return;
        ta.value = '';
        note.textContent = 'リンクを作れませんでした。';
      });
    }
    function getToken() {
      if (opts.token) return Promise.resolve(opts.token);
      if (share() && share().encode) return Promise.resolve(share().encode(up));
      return Promise.reject(new Error('Share がありません'));
    }

    /* --- ステージの中身 --- */
    function buildStage() {
      var head = h('div', 'pr-q');
      var visual = h('div', 'pr-visual');
      var foot = h('div', 'pr-foot');
      var qText = typeof p.q === 'string' ? p.q : '';
      var qInk = p.qInk || up.q;

      if (kind === 'hissan') {
        var op = up.op || p.op, a = up.a != null ? up.a : p.a, b = up.b != null ? up.b : p.b;
        head.textContent = '筆算でしましょう。　' + a + ' ' + opSign(op) + ' ' + b;
        visual.appendChild(hissanView(op, a, b, fills));
      } else if (kind === 'compare') {
        head.textContent = 'どちらが大きいかな。□にあてはまる記号は？';
        var sign = p.a && /^[<>=]$/.test(String(p.a)) ? String(p.a) : compareSign(up.a, up.b);
        var line = h('div', 'pr-compare');
        line.appendChild(h('span', 'pr-cnum', String(up.a)));
        var sq = h('span', 'pr-cbox');
        line.appendChild(sq);
        line.appendChild(h('span', 'pr-cnum', String(up.b)));
        visual.appendChild(line);
        fills.push(function (on) { sq.textContent = on ? sign : ''; sq.classList.toggle('filled', on); });
      } else {
        if (qText) head.textContent = qText;
        if (hasStrokes(qInk)) {
          var inkHolder = h('div', 'pr-qink');
          visual.appendChild(inkHolder);
          fitters.push(function () {
            var w = visual.clientWidth, hh = visual.clientHeight;
            if (!w || !hh) return;
            inkHolder.innerHTML = '';
            inkHolder.appendChild(drawInk(qInk, { width: w - 8, height: hh - 8, trim: true, lineWidth: 5, label: '問題文' }));
          });
        }
        if (p.fig && S.Figures && S.Figures.render) {
          try {
            var fe = S.Figures.render(p.fig);
            if (fe) {
              var fh = h('div', 'pr-fig');
              if (fe.style) { fe.style.width = '100%'; fe.style.height = '100%'; fe.style.maxWidth = 'none'; }
              fh.appendChild(fe);
              visual.appendChild(fh);
            }
          } catch (e) { console.error('Figures.render', e); }
        }
        if (Array.isArray(p.parts) && p.parts.length) foot.appendChild(answerShape(p.parts, fills));
        else if (kind === 'fill' && up.answer != null) foot.appendChild(answerShape([{ a: String(up.answer) }, up.unit || ''], fills));
        if (!visual.firstChild && !foot.firstChild) visual.appendChild(h('div', 'pr-empty', 'この問題は表示できません。'));
      }
      if (head.textContent) stage.appendChild(head);
      stage.appendChild(visual);
      if (foot.firstChild) stage.appendChild(foot);

      if (window.ResizeObserver) {
        var ro = new ResizeObserver(function () { refit(); });
        ro.observe(visual);
        ro.observe(side);
        observers.push(ro);
      }
    }

    var fitTimer = null;
    function refit() {
      if (fitTimer) cancelAnimationFrame(fitTimer);
      fitTimer = requestAnimationFrame(function () {
        fitTimer = null;
        if (destroyed) return;
        fitters.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
      });
    }

    /* --- 全画面 --- */
    function isFs() { return !!document.fullscreenElement; }
    function toggleFullscreen() {
      try {
        if (isFs()) document.exitFullscreen();
        else {
          var r = fsTarget.requestFullscreen();
          if (r && r.catch) r.catch(function () { toast('全画面にできませんでした'); });
        }
      } catch (e) { toast('全画面にできませんでした'); }
    }
    function exitFullscreen() {
      try { if (isFs() && document.exitFullscreen) { var r = document.exitFullscreen(); if (r && r.catch) r.catch(function () {}); } } catch (e) {}
    }
    function onFs() {
      if (fsBtn) fsBtn.textContent = isFs() ? '⛶ 全画面をやめる' : '⛶ 全画面';
      refit();
    }
    document.addEventListener('fullscreenchange', onFs);
    onFs();

    /* --- キー操作（プレゼン用リモコンの PageDown/PageUp も） --- */
    function onKey(e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!opts.list) return;
      if ((e.key === 'ArrowRight' || e.key === 'PageDown') && nextB && !nextB.disabled) { e.preventDefault(); nextB.click(); }
      else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && prevB && !prevB.disabled) { e.preventDefault(); prevB.click(); }
    }
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', refit);

    function copy(text, ta) {
      function fallback() {
        try {
          ta.focus(); ta.select();
          var ok = document.execCommand && document.execCommand('copy');
          toast(ok ? 'リンクをコピーしました' : 'リンクをえらんで、コピーしてね');
        } catch (e) { toast('リンクをえらんで、コピーしてね'); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('リンクをコピーしました'); }, fallback);
      } else fallback();
    }

    refit();

    return {
      root: root,
      destroy: function () {
        destroyed = true;
        observers.forEach(function (o) { o.disconnect(); });
        document.removeEventListener('fullscreenchange', onFs);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', refit);
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  S.Present = { mount: mount, drawInk: drawInk, hasInk: hasStrokes, KIND_LABEL: KIND_LABEL };
})(window.Shosu = window.Shosu || {});
