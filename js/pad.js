/* Shosu.Pad — 手書きマス・けいさんメモ
 * Pad.digitBox({size}) -> { el, strokes(), clear(), isEmpty(), mark(state), onChange(fn) }
 * Pad.memo({width, height, toolbar}) -> { el, clear() }
 * ストロークはマス内の CSS px 座標 [[{x,y},...], ...] で保持する。
 */
(function (S) {
  'use strict';

  // パームリジェクション：ペンを一度検知したら、それ以降はタッチで書かない
  var penSeen = false;
  function notePen(e) { if (e.pointerType === 'pen') penSeen = true; }
  document.addEventListener('pointerdown', notePen, true);
  document.addEventListener('pointerover', notePen, true);

  function dpr() { return Math.max(1, Math.min(3, window.devicePixelRatio || 1)); }

  /* 描画面：canvas の大きさ・DPR・ポインター入力・ストロークの保持と再描画 */
  function Surface(w, h, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.className = opts.className || '';
    canvas.style.touchAction = 'none';
    var ctx = canvas.getContext('2d');
    var strokes = []; // {pts:[{x,y}], erase:bool}
    var cur = null, activeId = null;
    var listeners = [];

    function size(nw, nh) {
      w = nw; h = nh;
      var r = dpr();
      canvas.width = Math.round(w * r);
      canvas.height = Math.round(h * r);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      redraw();
    }
    function lineW(s) { return s.erase ? (opts.eraserWidth || 24) : (typeof opts.lineWidth === 'function' ? opts.lineWidth() : (opts.lineWidth || 6)); }
    function style(s) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lineW(s);
      ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = opts.color || '#1f2a44';
      ctx.fillStyle = opts.color || '#1f2a44';
    }
    function drawDot(s, p) {
      style(s);
      ctx.beginPath();
      ctx.arc(p.x, p.y, lineW(s) / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    function drawSeg(s, a, b) {
      style(s);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    function drawStroke(s) {
      var p = s.pts;
      if (!p.length) return;
      if (p.length === 1) { drawDot(s, p[0]); return; }
      style(s);
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    }
    function redraw() {
      var r = dpr();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(r, 0, 0, r, 0, 0);
      for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i]);
      ctx.globalCompositeOperation = 'source-over';
    }
    function pos(e) {
      var rect = canvas.getBoundingClientRect();
      var sx = rect.width ? w / rect.width : 1, sy = rect.height ? h / rect.height : 1;
      var x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
      return { x: Math.round(Math.max(0, Math.min(w, x)) * 10) / 10, y: Math.round(Math.max(0, Math.min(h, y)) * 10) / 10 };
    }
    function accept(e) {
      if (e.pointerType === 'pen') { penSeen = true; return true; }
      if (e.pointerType === 'touch' && penSeen) return false;
      if (e.pointerType === 'mouse' && e.button !== 0) return false;
      return true;
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!accept(e) || activeId !== null) return;
      e.preventDefault();
      activeId = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      cur = { pts: [pos(e)], erase: !!(opts.isErasing && opts.isErasing()) };
      strokes.push(cur);
      drawDot(cur, cur.pts[0]);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== activeId || !cur) return;
      e.preventDefault();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      if (!evs.length) evs = [e];
      for (var i = 0; i < evs.length; i++) {
        var p = pos(evs[i]);
        var last = cur.pts[cur.pts.length - 1];
        if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.8) continue;
        cur.pts.push(p);
        drawSeg(cur, last, p);
      }
    });
    function end(e) {
      if (e.pointerId !== activeId) return;
      activeId = null;
      cur = null;
      redraw();
      for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (er) { console.error(er); } }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    size(w, h);
    return {
      canvas: canvas,
      size: size,
      redraw: redraw,
      strokes: function () { return strokes; },
      clear: function () {
        strokes = []; cur = null; redraw();
        for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (er) {} }
      },
      onChange: function (fn) { listeners.push(fn); },
      width: function () { return w; },
      height: function () { return h; }
    };
  }

  function btn(label, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = cls || '';
    b.textContent = label;
    return b;
  }

  /* 数字を1つ書くマス */
  function digitBox(o) {
    o = o || {};
    var size = Math.max(72, o.size || 80);
    var wrap = document.createElement('div');
    wrap.className = 'digit-cell';
    var box = document.createElement('div');
    box.className = 'digit-box';
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    var surf = Surface(size, size, { className: 'digit-canvas', lineWidth: Math.max(5, Math.round(size * 0.075)) });
    box.appendChild(surf.canvas);
    var clearBtn = btn('けす', 'db-clear');
    clearBtn.setAttribute('aria-label', 'このマスをけす');
    clearBtn.style.width = size + 'px';
    wrap.appendChild(box);
    if (o.clearButton !== false) wrap.appendChild(clearBtn);

    var api = {
      el: wrap,
      box: box,
      canvas: surf.canvas,
      size: size,
      strokes: function () {
        return surf.strokes().filter(function (s) { return !s.erase && s.pts.length; })
          .map(function (s) { return s.pts.map(function (p) { return { x: p.x, y: p.y }; }); });
      },
      clear: function () { surf.clear(); },
      isEmpty: function () { return api.strokes().length === 0; },
      mark: function (state) {
        box.classList.remove('mark-ok', 'mark-ng', 'mark-unsure');
        if (state) box.classList.add('mark-' + state);
      },
      onChange: function (fn) { surf.onChange(fn); }
    };
    clearBtn.addEventListener('click', function () { api.clear(); api.mark(null); });
    // 書き直したら色の印は消す
    surf.onChange(function () { api.mark(null); });
    return api;
  }

  /* けいさんメモ（読み取りなし）。width 省略で親の幅に合わせる */
  function memo(o) {
    o = o || {};
    var wrap = document.createElement('div');
    wrap.className = 'memo' + (o.toolbar === false ? ' memo-plain' : '');
    var erasing = false;
    var fixedW = o.width || 0;
    var h = o.height || 220;
    var surf = Surface(fixedW || 600, h, {
      className: 'memo-canvas',
      lineWidth: o.lineWidth || (o.toolbar === false ? 3 : 4),
      eraserWidth: o.eraserWidth || 28,
      color: o.color || '#3a4a6b',
      isErasing: function () { return erasing; }
    });
    var area = document.createElement('div');
    area.className = 'memo-area';
    area.appendChild(surf.canvas);

    if (o.toolbar !== false) {
      var bar = document.createElement('div');
      bar.className = 'memo-bar';
      var label = document.createElement('span');
      label.className = 'memo-label';
      label.textContent = o.label || 'けいさんメモ';
      var pen = btn('えんぴつ', 'tool on');
      var era = btn('けしゴム', 'tool');
      var all = btn('ぜんぶけす', 'tool');
      pen.addEventListener('click', function () { erasing = false; pen.classList.add('on'); era.classList.remove('on'); });
      era.addEventListener('click', function () { erasing = true; era.classList.add('on'); pen.classList.remove('on'); });
      all.addEventListener('click', function () { surf.clear(); });
      bar.appendChild(label); bar.appendChild(pen); bar.appendChild(era); bar.appendChild(all);
      wrap.appendChild(bar);
    }
    wrap.appendChild(area);

    if (!fixedW) {
      var fit = function () {
        var cw = Math.floor(area.clientWidth);
        if (cw > 0 && cw !== surf.width()) surf.size(cw, h);
      };
      if (window.ResizeObserver) new ResizeObserver(fit).observe(area);
      else window.addEventListener('resize', fit);
      setTimeout(fit, 0);
    }
    return { el: wrap, canvas: surf.canvas, clear: function () { surf.clear(); } };
  }

  S.Pad = {
    digitBox: digitBox,
    memo: memo,
    penSeen: function () { return penSeen; },
    resetPen: function () { penSeen = false; }
  };
})(window.Shosu = window.Shosu || {});
