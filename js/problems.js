/* Shosu.Problems — 問題の表示と丸つけ（fill / choice / order / hissan）
 * Problems.render(container, problem, { onResult(r), onNext() }) -> { destroy() }
 *   r = { correct, method:'auto'|'self', hints }
 * 1回の表示につき、最初の判定を onResult で知らせる。
 * そのあと「読みまちがい？」で子どもが自己採点したときは、もう一度 onResult を呼ぶ（Store は上書き）。
 * 追加5：r には ms（表示してから最初の判定までの時間。タブを離れていた時間・pause() の間は引く。30分をこえたら null）、
 *   first（最初の答えで○か。最初の答えの「読みまちがい？」の直しは反映）、retried（やり直して○になったか）も入る。
 *   opts.reportRetry が true なら、×のあとやり直して○になったときにも onResult({..., retry:true, retried:true}) を呼ぶ
 *   （このときの correct は前に知らせた結果のまま。記録の○×は変えない）。
 * 戻り値の pause()/resume() で、時間の計測を止められる（おすすめモードで「みる」を重ねて開いている間など）。
 */
(function (S) {
  'use strict';

  var UNSURE = 0.7;
  var PRAISE = ['よくできました！', 'すばらしい！', 'せいかい！その調子！', 'かんぺき！', 'よく考えたね！'];

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
    // 「つぎへ ▶」の矢印は、自作のSVG（Shosu.Icons）にする
    if (S.Icons && S.Icons.arrows) { try { S.Icons.arrows(b); } catch (e) {} }
    return b;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function num(s) { var v = parseFloat(String(s).replace(/[^\d.\-]/g, '')); return isFinite(v) ? v : NaN; }
  function numEq(a, b) { var x = num(a), y = num(b); return isFinite(x) && isFinite(y) && Math.abs(x - y) < 1e-9; }
  var MS_MAX = 30 * 60 * 1000; // 30分をこえるもの（放置）は時間を記録しない
  function settings() { return (S.Store && S.Store.getSettings) ? S.Store.getSettings() : { checkMode: 'auto', bigText: false }; }
  function recognizerReady() {
    try { return !!(S.Recognizer && S.Recognizer.recognize && (!S.Recognizer.isReady || S.Recognizer.isReady())); }
    catch (e) { return false; }
  }
  function boxSize() { return settings().bigText ? 90 : 76; }

  function recognizeBox(box) {
    if (box.isEmpty()) return { empty: true, digit: null, conf: 0 };
    try {
      var r = S.Recognizer.recognize(box.strokes(), box.size, box.size) || {};
      if (r.digit == null) return { empty: true, digit: null, conf: 0 };
      return { digit: r.digit, conf: typeof r.conf === 'number' ? r.conf : 0 };
    } catch (e) {
      console.error(e);
      return { digit: null, conf: 0, error: true };
    }
  }

  /* ---------- 手書きの絵（子どもが作った問題の問題文・ヒント・名前） ---------- */
  function hasInk(ink) {
    return !!(ink && Array.isArray(ink.strokes) && ink.strokes.some(function (s) { return s && s.length; }));
  }
  function inkCanvas(ink, o) {
    if (S.Present && S.Present.drawInk) {
      try { return S.Present.drawInk(ink, o); } catch (e) { console.error('Present.drawInk', e); }
    }
    // 簡易描画（present.js がないとき）：幅に合わせて縦横比を保つ
    var iw = ink.w || 800, ih = ink.h || 300;
    var sc = Math.min((o.width || iw) / iw, o.height ? o.height / ih : Infinity);
    var r = Math.max(1, window.devicePixelRatio || 1);
    var c = document.createElement('canvas');
    c.className = 'ink-canvas';
    c.width = Math.round(iw * sc * r); c.height = Math.round(ih * sc * r);
    c.style.width = Math.round(iw * sc) + 'px'; c.style.height = Math.round(ih * sc) + 'px';
    var ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.setTransform(sc * r, 0, 0, sc * r, 0, 0);
    ctx.lineWidth = Math.max(o.lineWidth || 5, 1.3 / sc);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1f2a44';
    ink.strokes.forEach(function (s) {
      if (!s || !s.length) return;
      ctx.beginPath();
      ctx.moveTo(s[0].x, s[0].y);
      for (var i = 1; i < s.length; i++) ctx.lineTo(s[i].x, s[i].y);
      if (s.length === 1) ctx.lineTo(s[0].x + 0.1, s[0].y);
      ctx.stroke();
    });
    return c;
  }

  /* ---------- 共通の枠 ---------- */
  function Frame(container, problem, opts, type) {
    opts = opts || {};
    var st = settings();
    var mode = (st.checkMode === 'self' || !recognizerReady()) ? 'self' : 'auto';
    var f = {
      problem: problem,
      mode: mode,
      wantedAuto: st.checkMode !== 'self',
      hintsUsed: 0,
      reported: false,
      finished: false,
      attempt: 0,          // 何回目の答えか（0 = 最初の答え。やり直すと増える）
      firstOk: undefined,  // 最初の答えで○か
      retried: false,      // やり直して○になったか
      ms: null
    };
    /* 表示してから最初の判定までの時間（タブを離れていた時間・止めていた時間は引く） */
    var shownAt = Date.now(), awayMs = 0, awayAt = 0, awayN = 0, clockOn = true;
    function awayStart() { if (awayN++ === 0) awayAt = Date.now(); }
    function awayEnd() { if (awayN > 0 && --awayN === 0) { awayMs += Date.now() - awayAt; awayAt = 0; } }
    var hidden = false;
    function onVis() {
      var hd = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (hd && !hidden) { hidden = true; awayStart(); }
      else if (!hd && hidden) { hidden = false; awayEnd(); }
    }
    onVis();
    document.addEventListener('visibilitychange', onVis);
    var paused = false;
    f.pause = function () { if (!paused) { paused = true; awayStart(); } };
    f.resume = function () { if (paused) { paused = false; awayEnd(); } };
    f.elapsedMs = function () { var now = Date.now(); return now - shownAt - awayMs - (awayN > 0 ? now - awayAt : 0); };
    f.dispose = function () {
      if (!clockOn) return;
      clockOn = false;
      document.removeEventListener('visibilitychange', onVis);
    };
    f.newAttempt = function () { if (f.firstOk !== undefined) f.attempt++; };
    var root = h('div', 'problem p-' + type);
    var markEl = h('div', 'p-mark');
    root.appendChild(markEl);
    // 子どもが作った問題：つくった人の名前・問題文の手書きの絵
    var availW = Math.max(280, Math.min(900, (container.clientWidth || 900) - 130));
    if (hasInk(problem.authorInk)) {
      var au = h('div', 'p-author');
      au.appendChild(h('span', 'p-author-label', 'つくった人：'));
      au.appendChild(inkCanvas(problem.authorInk, { height: 40, width: 320, trim: true, lineWidth: 6, label: 'つくった人の名前' }));
      root.appendChild(au);
    }
    if (problem.q) root.appendChild(h('div', 'p-q', problem.q));
    if (hasInk(problem.qInk)) {
      var qi = h('div', 'p-qink');
      qi.appendChild(inkCanvas(problem.qInk, { width: availW, height: 300, trim: true, lineWidth: 5, label: '問題文' }));
      root.appendChild(qi);
    }
    var figEl = h('div', 'p-fig');
    if (problem.fig && S.Figures && S.Figures.render) {
      try {
        var fe = S.Figures.render(problem.fig);
        if (fe) { figEl.appendChild(fe); root.appendChild(figEl); }
      } catch (e) { console.error('Figures.render', e); }
    }
    f.body = h('div', 'p-body');
    f.status = h('div', 'p-status');
    f.actions = h('div', 'p-actions');
    f.hintsEl = h('div', 'p-hints');
    f.answerEl = h('div', 'p-answer');
    f.explainEl = h('div', 'p-explain');
    f.memoEl = h('div', 'p-memo');
    root.appendChild(f.body);
    root.appendChild(f.status);
    root.appendChild(f.actions);
    root.appendChild(f.hintsEl);
    root.appendChild(f.answerEl);
    root.appendChild(f.explainEl);
    root.appendChild(f.memoEl);
    container.appendChild(root);
    f.root = root;

    var hints = (problem.hints || []).slice();
    if (hasInk(problem.hintInk)) hints.unshift({ ink: problem.hintInk }); // 作った人の手書きのヒントを先に
    f.hasHints = function () { return hints.length > 0; };
    f.hintButton = function () {
      if (!hints.length) return null;
      var b = button('', 'hint', function () {
        if (f.hintsUsed < hints.length) {
          var item = hints[f.hintsUsed];
          var p = h('div', 'hint-item' + (item && item.ink ? ' hint-ink' : ''));
          p.appendChild(h('span', 'hint-no', 'ヒント' + (f.hintsUsed + 1)));
          if (item && item.ink) p.appendChild(inkCanvas(item.ink, { width: Math.min(availW, 640), height: 220, trim: true, lineWidth: 5, label: 'ヒントの絵' }));
          else p.appendChild(document.createTextNode(item));
          f.hintsEl.appendChild(p);
          f.hintsUsed++;
        }
        upd();
      });
      function upd() {
        b.textContent = 'ヒント（' + f.hintsUsed + '/' + hints.length + '）';
        b.disabled = f.hintsUsed >= hints.length;
      }
      upd();
      return b;
    };
    var memoObj = null;
    f.memoButton = function () {
      return button('けいさんメモ', 'memo-toggle', function () {
        if (!memoObj) {
          memoObj = S.Pad && S.Pad.memo ? S.Pad.memo({ height: 220 }) : null;
          if (memoObj) f.memoEl.appendChild(memoObj.el);
        } else {
          f.memoEl.hidden = !f.memoEl.hidden;
        }
      });
    };
    f.setActions = function (list) {
      f.actions.innerHTML = '';
      list.forEach(function (b) { if (b) f.actions.appendChild(b); });
    };
    f.setStatus = function (nodeOrText, cls) {
      f.status.innerHTML = '';
      f.status.className = 'p-status' + (cls ? ' ' + cls : '');
      if (nodeOrText == null) return;
      if (typeof nodeOrText === 'string') f.status.textContent = nodeOrText;
      else f.status.appendChild(nodeOrText);
    };
    f.showMark = function (state) {
      markEl.className = 'p-mark' + (state ? ' show ' + state : '');
      markEl.textContent = '';
    };
    f.report = function (correct, method, override) {
      correct = !!correct;
      var retriedNow = false;
      if (f.firstOk === undefined) {
        f.firstOk = correct;
        var ms = f.elapsedMs();
        f.ms = ms >= 0 && ms <= MS_MAX ? Math.round(ms) : null;
        f.dispose();
      } else if (f.attempt === 0) {
        if (override) f.firstOk = correct; // 最初の答えの「読みまちがい？」の直し
      } else if (correct && !f.firstOk && !f.retried) {
        f.retried = true;
        retriedNow = true;
      }
      var r = { correct: correct, method: method, hints: f.hintsUsed, ms: f.ms, first: f.firstOk, retried: f.retried };
      if (f.reported && !override) {
        if (retriedNow && opts.reportRetry && opts.onResult) {
          r.correct = f.lastCorrect; r.method = f.lastMethod; r.retry = true;
          try { opts.onResult(r); } catch (e) { console.error(e); }
        }
        return;
      }
      f.reported = true;
      f.lastCorrect = correct; f.lastMethod = method;
      if (opts.onResult) {
        try { opts.onResult(r); } catch (e) { console.error(e); }
      }
    };
    f.showExplain = function () {
      if (problem.explain && !f.explainEl.firstChild) {
        f.explainEl.appendChild(h('span', 'explain-label', 'せつめい'));
        f.explainEl.appendChild(document.createTextNode(problem.explain));
      }
    };
    f.nextButton = function () {
      if (!opts.onNext) return null;
      return button('つぎへ ▶', 'primary next', function () { opts.onNext(); });
    };
    /* 正しい答えを見せて、子どもが自分で ○/× を選ぶ */
    f.selfJudge = function (answerNode, onDone, title) {
      f.answerEl.innerHTML = '';
      var box = h('div', 'answer-box');
      box.appendChild(h('div', 'answer-title', title || '正しい答え'));
      var a = h('div', 'answer-main');
      a.appendChild(answerNode);
      box.appendChild(a);
      box.appendChild(h('div', 'answer-ask', '自分の答えとくらべてみよう。'));
      var row = h('div', 'self-row');
      row.appendChild(button('あっていた（○）', 'self-ok', function () { done(true); }));
      row.appendChild(button('ちがっていた（×）', 'self-ng', function () { done(false); }));
      box.appendChild(row);
      f.answerEl.appendChild(box);
      function done(ok) {
        row.remove();
        box.querySelector('.answer-ask').textContent = ok ? '○をつけたよ。' : '×をつけたよ。どこがちがったか見なおそう。';
        f.showMark(ok ? 'ok' : 'ng');
        f.report(ok, 'self', true);
        if (ok) f.showExplain();
        if (onDone) onDone(ok);
      }
    };
    f.revealAnswer = function (answerNode) {
      f.answerEl.innerHTML = '';
      var box = h('div', 'answer-box');
      box.appendChild(h('div', 'answer-title', '正しい答え'));
      var a = h('div', 'answer-main');
      a.appendChild(answerNode);
      box.appendChild(a);
      f.answerEl.appendChild(box);
      f.showExplain();
    };
    f.modeNote = function () {
      if (f.mode === 'self' && f.wantedAuto) {
        f.root.appendChild(h('div', 'p-note', '（いまは読み取りの準備ができていないので、自分で丸をつけてね）'));
      }
    };
    return f;
  }

  /* 読み取った答えの表示（自信の低い文字は黄色） */
  function readNode(chars, label) {
    var w = h('span', 'read');
    w.appendChild(h('span', 'read-label', label || 'よみとった答え：'));
    var v = h('span', 'read-value');
    chars.forEach(function (c) {
      var s = h('span', c.unsure ? 'rc unsure' : 'rc', c.ch);
      v.appendChild(s);
    });
    w.appendChild(v);
    return w;
  }

  /* ================= fill ================= */
  function renderFill(container, p, opts) {
    var f = Frame(container, p, opts, 'fill');
    var size = boxSize();
    var slots = []; // {a, items:[{box}|{dot}]}
    var line = h('div', 'fill-line');
    line.style.setProperty('--box', size + 'px');
    (p.parts || []).forEach(function (part) {
      if (typeof part === 'string') {
        line.appendChild(h('span', 'fill-text', part));
      } else if (part && part.a != null) {
        var slot = { a: String(part.a), items: [] };
        var se = h('span', 'slot');
        String(part.a).split('').forEach(function (ch) {
          if (/\d/.test(ch)) {
            var b = S.Pad.digitBox({ size: size });
            se.appendChild(b.el);
            slot.items.push({ box: b });
          } else {
            se.appendChild(h('span', ch === '.' ? 'print-dot' : 'print-ch', ch === '.' ? '.' : ch));
            slot.items.push({ ch: ch });
          }
        });
        line.appendChild(se);
        slots.push(slot);
      }
    });
    f.body.appendChild(line);

    function allBoxes() {
      var r = [];
      slots.forEach(function (s) { s.items.forEach(function (it) { if (it.box) r.push(it.box); }); });
      return r;
    }
    function fullAnswerNode() {
      var w = h('span', 'answer-sentence');
      (p.parts || []).forEach(function (part) {
        if (typeof part === 'string') w.appendChild(h('span', null, part));
        else if (part && part.a != null) w.appendChild(h('span', 'answer-num', String(part.a)));
      });
      return w;
    }

    function initialActions() {
      allBoxes().forEach(function (b) { b.mark(null); });
      f.showMark(null);
      if (f.mode === 'auto') f.setActions([button('こたえあわせ', 'primary check', check), f.hintButton(), f.memoButton()]);
      else f.setActions([button('答えを見る', 'primary show', selfShow), f.hintButton(), f.memoButton()]);
    }
    // ボタンは1つを使い回す（ヒントの数え方を保つため）
    var hintB = f.hintButton(), memoB = f.memoButton();
    f.hintButton = function () { return hintB; };
    f.memoButton = function () { return memoB; };

    function misreadButton() {
      return button('読みまちがい？', 'misread', function () {
        f.selfJudge(fullAnswerNode(), function (ok) {
          f.setActions([ok ? null : button('もう一度', 'retry', retry), f.nextButton()]);
        }, '正しい答え（自分で丸をつけよう）');
      });
    }
    function retry() {
      f.newAttempt();
      f.answerEl.innerHTML = '';
      f.setStatus(null);
      slots.forEach(function (s) {
        s.items.forEach(function (it) { if (it.box && it.box.box.classList.contains('mark-ng')) it.box.clear(); });
      });
      initialActions();
    }

    function check() {
      var boxes = allBoxes();
      var empty = boxes.filter(function (b) { return b.isEmpty(); });
      if (empty.length) {
        empty.forEach(function (b) { b.mark('unsure'); });
        f.setStatus('まだ書いていないマスがあるよ。', 'warn');
        return;
      }
      var anyUnsure = false, readParts = [], slotOk = [];
      slots.forEach(function (s, si) {
        var str = '', chars = [];
        s.items.forEach(function (it) {
          if (it.box) {
            var r = recognizeBox(it.box);
            it.res = r;
            var unsure = r.digit == null || r.conf < UNSURE;
            if (unsure) { anyUnsure = true; it.box.mark('unsure'); }
            var c = r.digit == null ? '?' : String(r.digit);
            str += c;
            chars.push({ ch: c, unsure: unsure });
          } else { str += it.ch; chars.push({ ch: it.ch }); }
        });
        if (si > 0) readParts.push({ ch: '、' });
        readParts = readParts.concat(chars);
        s.read = str;
        slotOk.push(str.indexOf('?') < 0 && numEq(str, s.a));
      });
      var rn = readNode(readParts);
      if (anyUnsure) {
        var w = h('div');
        w.appendChild(rn);
        w.appendChild(h('div', 'msg', '黄色のマスを、もう一度ていねいに書いてね。'));
        f.setStatus(w, 'warn');
        f.setActions([button('こたえあわせ', 'primary check', check), f.hintButton(), misreadButton()]);
        return;
      }
      var ok = slotOk.every(Boolean);
      var w2 = h('div');
      w2.appendChild(rn);
      if (ok) {
        allBoxes().forEach(function (b) { b.mark('ok'); });
        w2.appendChild(h('div', 'msg praise', pick(PRAISE)));
        f.setStatus(w2, 'good');
        f.showMark('ok');
        f.report(true, 'auto');
        f.showExplain();
        f.setActions([misreadButton(), f.nextButton()]);
      } else {
        slots.forEach(function (s, i) {
          if (!slotOk[i]) s.items.forEach(function (it) { if (it.box) it.box.mark('ng'); });
        });
        w2.appendChild(h('div', 'msg', 'ざんねん。もう一度考えてみよう。'));
        f.setStatus(w2, 'bad');
        f.showMark('ng');
        f.report(false, 'auto');
        f.setActions([button('もう一度', 'retry', retry), f.hintButton(), button('答えを見る', 'show', function () {
          f.revealAnswer(fullAnswerNode());
          f.setActions([button('もう一度', 'retry', retry), misreadButton(), f.nextButton()]);
        }), misreadButton()]);
      }
    }

    function selfShow() {
      f.selfJudge(fullAnswerNode(), function (ok) {
        f.setActions([ok ? null : button('もう一度', 'retry', function () { f.newAttempt(); f.answerEl.innerHTML = ''; initialActions(); }), f.hintButton(), f.nextButton()]);
      });
    }

    initialActions();
    f.modeNote();
    return f;
  }

  /* ================= choice ================= */
  function renderChoice(container, p, opts) {
    var f = Frame(container, p, opts, 'choice');
    var row = h('div', 'choice-row');
    var btns = [];
    var solved = false;
    (p.options || []).forEach(function (o) {
      var b = button(String(o), 'choice-btn', function () { choose(o, b); });
      btns.push(b);
      row.appendChild(b);
    });
    f.body.appendChild(row);
    var hintB = f.hintButton();
    function choose(o, b) {
      if (solved) return;
      f.newAttempt();
      btns.forEach(function (x) { x.classList.remove('ng'); });
      if (String(o) === String(p.a)) {
        solved = true;
        b.classList.add('ok');
        btns.forEach(function (x) { x.disabled = x !== b; });
        f.showMark('ok');
        f.setStatus(pick(PRAISE), 'good');
        f.report(true, 'auto');
        f.showExplain();
        f.setActions([f.nextButton()]);
      } else {
        b.classList.add('ng');
        f.showMark('ng');
        f.setStatus('ざんねん。もう一度えらんでみよう。', 'bad');
        f.report(false, 'auto');
        f.setActions([hintB, button('答えを見る', 'show', function () {
          f.revealAnswer(h('span', 'answer-num', String(p.a)));
          f.setActions([f.nextButton()]);
        })]);
      }
    }
    f.setActions([hintB]);
    return f;
  }

  /* ================= order ================= */
  function renderOrder(container, p, opts) {
    var f = Frame(container, p, opts, 'order');
    var dir = p.dir === 'asc' ? 'asc' : 'desc';
    var items = (p.items || []).map(function (v, i) { return { v: String(v), i: i }; });
    var placed = [];
    var guide = h('div', 'order-guide', dir === 'desc' ? '大きい数から順にタップしよう。' : '小さい数から順にタップしよう。');
    var pool = h('div', 'order-pool');
    var ans = h('div', 'order-answer');
    f.body.appendChild(guide);
    f.body.appendChild(pool);
    f.body.appendChild(ans);
    var hintB = f.hintButton();
    var checkB = button('こたえあわせ', 'primary check', check);
    var resetB = button('やりなおし', 'retry', function () { placed = []; draw(); f.setStatus(null); f.showMark(null); f.answerEl.innerHTML = ''; f.setActions([checkB, resetB, hintB]); });
    var locked = false;

    function draw() {
      pool.innerHTML = '';
      ans.innerHTML = '';
      items.forEach(function (it) {
        var used = placed.indexOf(it) >= 0;
        var b = button(it.v, 'order-item' + (used ? ' used' : ''), function () {
          if (used || locked) return;
          placed.push(it); draw();
        });
        b.disabled = used || locked;
        pool.appendChild(b);
      });
      for (var k = 0; k < items.length; k++) {
        if (k > 0) ans.appendChild(h('span', 'order-sign', dir === 'desc' ? '>' : '<'));
        var it = placed[k];
        if (it) {
          (function (it, k) {
            var b = button(it.v, 'order-item placed', function () {
              if (locked) return;
              placed.splice(k, 1); draw();
            });
            b.dataset.pos = k;
            ans.appendChild(b);
          })(it, k);
        } else {
          ans.appendChild(h('span', 'order-slot', String(k + 1)));
        }
      }
      checkB.disabled = placed.length < items.length || locked;
    }
    function sortedValues() {
      var c = items.slice();
      c.sort(function (x, y) { return dir === 'desc' ? num(y.v) - num(x.v) : num(x.v) - num(y.v); });
      return c.map(function (x) { return x.v; });
    }
    function check() {
      if (placed.length < items.length) return;
      f.newAttempt();
      var ok = true, firstBad = -1;
      for (var k = 1; k < placed.length; k++) {
        var a = num(placed[k - 1].v), b = num(placed[k].v);
        if (dir === 'desc' ? a < b : a > b) { ok = false; if (firstBad < 0) firstBad = k; }
      }
      if (ok) {
        locked = true; draw();
        Array.prototype.forEach.call(ans.querySelectorAll('.placed'), function (b) { b.classList.add('ok'); });
        f.showMark('ok');
        f.setStatus(pick(PRAISE), 'good');
        f.report(true, 'auto');
        f.showExplain();
        f.setActions([f.nextButton()]);
      } else {
        var bad = ans.querySelector('[data-pos="' + firstBad + '"]');
        if (bad) bad.classList.add('ng');
        f.showMark('ng');
        f.setStatus('ざんねん。色がついたところから見なおそう。ならべた数をタップすると、もどせるよ。', 'bad');
        f.report(false, 'auto');
        f.setActions([checkB, resetB, hintB, button('答えを見る', 'show', function () {
          f.revealAnswer(h('span', 'answer-num', sortedValues().join(dir === 'desc' ? '  >  ' : '  <  ')));
          f.setActions([checkB, resetB, f.nextButton()]);
        })]);
      }
    }
    draw();
    f.setActions([checkB, resetB, hintB]);
    return f;
  }

  /* ================= hissan ================= */
  function splitNum(s) {
    s = String(s);
    var i = s.indexOf('.');
    return i < 0 ? { int: s, dec: '' } : { int: s.slice(0, i) || '0', dec: s.slice(i + 1) };
  }
  /* 答えを計算（整数にして計算するので誤差が出ない） */
  function hissanAnswer(op, a, b) {
    var A = splitNum(a), B = splitNum(b);
    var nd = Math.max(A.dec.length, B.dec.length);
    function toInt(x) { var d = x.dec; while (d.length < nd) d += '0'; return parseInt(x.int + d, 10) || 0; }
    var r = op === '-' ? toInt(A) - toInt(B) : toInt(A) + toInt(B);
    var neg = r < 0; r = Math.abs(r);
    var s = String(r);
    while (s.length <= nd) s = '0' + s;
    var full = nd ? s.slice(0, s.length - nd) + '.' + s.slice(s.length - nd) : s; // 末尾の0あり（例 9.70）
    var canon = full.indexOf('.') >= 0 ? full.replace(/0+$/, '').replace(/\.$/, '') : full;
    return { full: (neg ? '-' : '') + full, canon: (neg ? '-' : '') + canon, value: (neg ? -1 : 1) * r / Math.pow(10, nd) };
  }
  function sigDigits(s) { return String(s).replace(/[^\d]/g, '').replace(/^0+/, '').replace(/0+$/, ''); }

  function renderHissan(container, p, opts) {
    if (!p.hints || !p.hints.length) {
      p = Object.assign({}, p, {
        hints: [
          '位をそろえて（小数点をたてにそろえて）考えよう。',
          'いちばん右の位から、位ごとに計算しよう。' + (p.op === '-' ? 'ひけないときは、となりの位から1かりてこよう。' : 'くり上がりに気をつけよう。'),
          '答えの小数点は、上の小数点にそろえて打とう。'
        ]
      });
    }
    var f = Frame(container, p, opts, 'hissan');
    var op = p.op === '-' ? '-' : '+';
    var A = splitNum(p.a), B = splitNum(p.b);
    var nInt = Math.max(A.int.length, B.int.length) + (op === '+' ? 1 : 0); // たし算はくり上がり用に1列多く
    var nDec = Math.max(A.dec.length, B.dec.length);
    if (p.showZeros === undefined && op === '-' && A.dec.length < B.dec.length) {
      p = Object.assign({}, p, { showZeros: true }); // 6−0.52 は 6.00 とみる
    }
    var nCols = nInt + nDec;
    var ans = hissanAnswer(op, p.a, p.b);
    var size = boxSize();
    var gapW = 34;

    if (!p.q) {
      f.root.insertBefore(h('div', 'p-q', '筆算でしましょう。　' + p.a + ' ' + (op === '-' ? '−' : '＋') + ' ' + p.b), f.body);
    }

    var grid = h('div', 'hissan-grid');
    var tmpl = ['44px'];
    for (var c = 0; c < nCols; c++) { tmpl.push(size + 'px'); if (c < nCols - 1) tmpl.push(gapW + 'px'); }
    grid.style.gridTemplateColumns = tmpl.join(' ');
    grid.style.setProperty('--cell', size + 'px');

    function colGrid(c) { return 2 + c * 2; }       // 数字の列の grid 列番号
    function gapGrid(g) { return 3 + g * 2; }       // 列 g と g+1 の間
    function place(el, row, col, span) {
      el.style.gridRow = row;
      el.style.gridColumn = span ? col + ' / span ' + span : col;
      grid.appendChild(el);
      return el;
    }
    function placeClass(c) {
      var k = nInt - 1 - c; // 0=一の位, 1=十の位, -1=1/10 …
      return ({ 2: 'pv-hundreds', 1: 'pv-tens', 0: 'pv-ones', '-1': 'pv-tenths', '-2': 'pv-hundredths', '-3': 'pv-thousandths' })[k] || '';
    }

    // 1行目：くり上がり・くり下がりメモ（読み取りなし）
    var carryMemos = [];
    for (c = 0; c < nCols; c++) {
      var m = S.Pad.memo({ width: size, height: 38, toolbar: false, lineWidth: 3 });
      m.el.classList.add('carry-memo');
      carryMemos.push(m);
      place(m.el, 1, colGrid(c));
    }
    var carryLabel = place(h('div', 'carry-label', 'メモ'), 1, 1);
    carryLabel.title = 'くり上がり・くり下がりのメモ';

    // 2・3行目：問題の数
    function numberRow(x, row, raw) {
      var hasDot = x.dec.length > 0;
      var intStart = nInt - x.int.length;
      for (var c = 0; c < nCols; c++) {
        var ch = '', faint = false;
        if (c < nInt) { if (c >= intStart) ch = x.int[c - intStart]; }
        else {
          var di = c - nInt;
          if (di < x.dec.length) ch = x.dec[di];
          else if (p.showZeros) { ch = '0'; faint = true; }
        }
        place(h('div', 'h-digit ' + placeClass(c) + (faint ? ' faint' : ''), ch), row, colGrid(c));
      }
      if (nDec > 0 && (hasDot || p.showZeros)) {
        place(h('div', 'h-dot' + (hasDot ? '' : ' faint'), '.'), row, gapGrid(nInt - 1));
      }
    }
    numberRow(A, 2, p.a);
    place(h('div', 'h-op', op === '-' ? '−' : '＋'), 3, 1);
    numberRow(B, 3, p.b);
    // 4行目：横線
    place(h('div', 'h-line'), 4, 1, tmpl.length);

    // 5行目：答え（手書きマス＋小数点を打つ場所）
    var boxes = [];
    for (c = 0; c < nCols; c++) {
      var b = S.Pad.digitBox({ size: size });
      b.el.classList.add('h-ans');
      boxes.push(b);
      place(b.el, 5, colGrid(c));
    }
    var point = null;
    var zones = [];
    for (var g = 0; g < nCols - 1; g++) {
      (function (g) {
        var z = h('button', 'dot-zone');
        z.type = 'button';
        z.setAttribute('aria-label', '小数点を打つ');
        z.appendChild(h('span', 'dot-mark'));
        z.addEventListener('click', function () {
          point = point === g ? null : g;
          zones.forEach(function (zz, i) { zz.classList.toggle('on', i === point); });
          clearJudge();
        });
        zones.push(z);
        place(z, 5, gapGrid(g));
      })(g);
    }
    var wrap = h('div', 'hissan-wrap');
    wrap.appendChild(grid);
    var tools = h('div', 'hissan-tools');
    tools.appendChild(h('span', 'hissan-tip', '小数点は、数字と数字の間をタップして打とう。'));
    tools.appendChild(button('メモをけす', 'small', function () { carryMemos.forEach(function (m) { m.clear(); }); }));
    wrap.appendChild(tools);
    f.body.appendChild(wrap);

    function clearJudge() {
      boxes.forEach(function (b) { b.mark(null); });
      zones.forEach(function (z) { z.classList.remove('ng'); });
    }
    function answerNode() {
      var w = h('span', 'answer-sentence');
      w.appendChild(h('span', null, p.a + ' ' + (op === '-' ? '−' : '＋') + ' ' + p.b + ' ＝ '));
      w.appendChild(h('span', 'answer-num', ans.canon));
      if (ans.full !== ans.canon) w.appendChild(h('span', 'answer-note', '（筆算では ' + ans.full + ' の終わりの0を／で消す）'));
      return w;
    }
    function misreadButton() {
      return button('読みまちがい？', 'misread', function () {
        f.selfJudge(answerNode(), function (ok) {
          f.setActions([ok ? null : button('もう一度', 'retry', retry), f.nextButton()]);
        }, '正しい答え（自分で丸をつけよう）');
      });
    }
    var hintB = f.hintButton();
    var memoB = f.memoButton();
    function initialActions() {
      clearJudge();
      f.showMark(null);
      if (f.mode === 'auto') f.setActions([button('こたえあわせ', 'primary check', check), hintB, memoB]);
      else f.setActions([button('答えを見る', 'primary show', selfShow), hintB, memoB]);
    }
    function retry() {
      f.newAttempt();
      f.answerEl.innerHTML = '';
      f.setStatus(null);
      initialActions();
    }
    function selfShow() {
      f.selfJudge(answerNode(), function (ok) {
        f.setActions([ok ? null : button('もう一度', 'retry', retry), hintB, f.nextButton()]);
      });
    }
    function check() {
      clearJudge();
      var res = boxes.map(recognizeBox);
      var written = res.filter(function (r) { return !r.empty; });
      if (!written.length) { f.setStatus('答えの行に数字を書いてね。', 'warn'); return; }
      var s = '', chars = [], anyUnsure = false, seenDigit = false;
      res.forEach(function (r, i) {
        if (!r.empty) {
          var unsure = r.digit == null || r.conf < UNSURE;
          if (unsure) { anyUnsure = true; boxes[i].mark('unsure'); }
          var ch = r.digit == null ? '?' : String(r.digit);
          s += ch; chars.push({ ch: ch, unsure: unsure }); seenDigit = true;
        }
        if (point === i) { s += '.'; chars.push({ ch: '.' }); }
      });
      var rn = readNode(chars);
      if (anyUnsure) {
        var w = h('div');
        w.appendChild(rn);
        w.appendChild(h('div', 'msg', '黄色のマスを、もう一度ていねいに書いてね。'));
        f.setStatus(w, 'warn');
        f.setActions([button('こたえあわせ', 'primary check', check), hintB, misreadButton()]);
        return;
      }
      var val = parseFloat(s.charAt(0) === '.' ? '0' + s : s);
      var ok = isFinite(val) && Math.abs(val - ans.value) < 1e-9;
      var w2 = h('div');
      w2.appendChild(rn);
      if (ok) {
        res.forEach(function (r, i) { if (!r.empty) boxes[i].mark('ok'); });
        w2.appendChild(h('div', 'msg praise', pick(PRAISE)));
        if (s.indexOf('.') >= 0 && /(\.|0)$/.test(s.replace(/^[^.]*\./, '.'))) {
          w2.appendChild(h('div', 'msg tip', '答えの終わりの0' + (/\.0*$/.test(s) ? 'と小数点' : '') + 'は、／線で消しておこう。'));
        }
        f.setStatus(w2, 'good');
        f.showMark('ok');
        f.report(true, 'auto');
        f.showExplain();
        f.setActions([misreadButton(), f.nextButton()]);
      } else {
        var msg;
        var digitsSame = sigDigits(s) === sigDigits(ans.canon) && sigDigits(s) !== '';
        if (digitsSame || (ans.canon.indexOf('.') >= 0 && point === null)) {
          msg = '小数点の位置を見直そう。';
          if (point !== null) zones[point].classList.add('ng');
        } else {
          msg = 'ざんねん。位ごとの計算を見直そう。';
        }
        res.forEach(function (r, i) { if (!r.empty && !digitsSame) boxes[i].mark('ng'); });
        w2.appendChild(h('div', 'msg', msg));
        f.setStatus(w2, 'bad');
        f.showMark('ng');
        f.report(false, 'auto');
        f.setActions([button('もう一度', 'retry', retry), hintB, button('答えを見る', 'show', function () {
          f.revealAnswer(answerNode());
          f.setActions([button('もう一度', 'retry', retry), misreadButton(), f.nextButton()]);
        }), misreadButton()]);
      }
    }
    initialActions();
    f.modeNote();
    return f;
  }

  var RENDERERS = { fill: renderFill, choice: renderChoice, order: renderOrder, hissan: renderHissan };

  function render(container, problem, opts) {
    container.innerHTML = '';
    var fn = problem && RENDERERS[problem.type];
    if (!fn) {
      container.appendChild(h('div', 'problem p-unknown', 'この問題は表示できません（' + (problem && problem.type) + '）'));
      return { destroy: function () { container.innerHTML = ''; } };
    }
    var f;
    try { f = fn(container, problem, opts || {}); }
    catch (e) {
      console.error(e);
      container.innerHTML = '';
      container.appendChild(h('div', 'problem p-unknown', '問題を表示できませんでした。'));
    }
    return {
      root: f && f.root,
      pause: function () { if (f && f.pause) f.pause(); },
      resume: function () { if (f && f.resume) f.resume(); },
      destroy: function () { if (f && f.dispose) f.dispose(); container.innerHTML = ''; }
    };
  }

  S.Problems = { render: render, hissanAnswer: hissanAnswer, types: Object.keys(RENDERERS) };
})(window.Shosu = window.Shosu || {});
