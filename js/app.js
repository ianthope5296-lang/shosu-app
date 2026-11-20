/* app.js — 画面の切り替え（ハッシュルーティング）・ホーム・各時・ふくしゅう・先生メニュー・手書き練習 */
(function (S) {
  'use strict';

  var UNIT_TITLE = '小数の表し方やしくみを調べよう';
  var app = document.getElementById('app');
  var cleanups = [];

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
  function link(label, cls, href) { var a = h('a', cls, label); a.href = href; return a; }
  function lessons() { return Array.isArray(S.Lessons) ? S.Lessons : []; }
  function topics() { return Array.isArray(S.ReviewTopics) ? S.ReviewTopics : []; }
  function store() { return S.Store; }
  function settings() { return store() ? store().getSettings() : { checkMode: 'auto', bigText: false }; }
  function stats(key) { return store() ? store().stats(key) : { tried: 0, correct: 0, auto: 0, self: 0, hints: 0, done: {} }; }
  function record(key, pid, r) { if (store()) store().record(key, pid, r); }
  function recReady() {
    try { return !!(S.Recognizer && S.Recognizer.recognize && (!S.Recognizer.isReady || S.Recognizer.isReady())); }
    catch (e) { return false; }
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function genProblem(name) {
    if (!S.Generators || !S.Generators.make) return null;
    try { return S.Generators.make(name) || null; } catch (e) { console.error('Generators.make', name, e); return null; }
  }
  function toast(msg) {
    var t = h('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 400); }, 2200);
  }
  function confirmDialog(message, okLabel, onOk) {
    var back = h('div', 'modal-back');
    var box = h('div', 'modal');
    box.setAttribute('role', 'dialog');
    box.appendChild(h('div', 'modal-msg', message));
    var row = h('div', 'modal-row');
    row.appendChild(button('やめる', '', function () { back.remove(); }));
    row.appendChild(button(okLabel || 'OK', 'danger', function () { back.remove(); onOk(); }));
    box.appendChild(row);
    back.appendChild(box);
    document.body.appendChild(back);
  }
  function subunitClass(name) {
    name = name || '';
    if (name.indexOf('たし算') >= 0 || name.indexOf('ひき算') >= 0) return 'su-3';
    if (name.indexOf('しくみ') >= 0) return 'su-2';
    if (name.indexOf('表し方') >= 0) return 'su-1';
    return 'su-4';
  }
  function applySettings() {
    document.documentElement.classList.toggle('big-text', !!settings().bigText);
  }

  /* 各時の問題を展開（type:'gen' は自動生成）。pid は安定した番号にする */
  function expandLessonProblems(lesson) {
    var out = [];
    (lesson.problems || []).forEach(function (p, i) {
      if (p && p.type === 'gen') {
        var n = p.count || 1;
        for (var k = 0; k < n; k++) {
          var g = genProblem(p.gen);
          if (g) out.push({ p: g, pid: (p.id || 'p' + i) + '-' + k });
        }
      } else if (p) {
        out.push({ p: p, pid: p.id || 'p' + i });
      }
    });
    return out;
  }
  function lessonPids(lesson) {
    var out = [];
    (lesson.problems || []).forEach(function (p, i) {
      if (p && p.type === 'gen') { for (var k = 0; k < (p.count || 1); k++) out.push((p.id || 'p' + i) + '-' + k); }
      else if (p) out.push(p.id || 'p' + i);
    });
    return out;
  }
  function lessonStars(lesson) {
    var st = stats('lesson-' + lesson.no);
    var pids = lessonPids(lesson);
    if (!pids.length || !st.tried) return 0;
    var tried = 0, ok = 0;
    pids.forEach(function (pid) { if (pid in st.done) { tried++; if (st.done[pid]) ok++; } });
    if (ok === pids.length) return 3;
    if (ok * 2 >= pids.length) return 2;
    return tried || st.tried ? 1 : 0;
  }
  function starsNode(n) {
    var s = h('div', 'stars');
    s.setAttribute('aria-label', '星' + n + 'こ');
    for (var i = 0; i < 3; i++) s.appendChild(h('span', i < n ? 'star on' : 'star', i < n ? '★' : '☆'));
    return s;
  }

  function topbar(title, opts) {
    opts = opts || {};
    var bar = h('header', 'topbar');
    if (opts.back !== false) bar.appendChild(link('◀ ホーム', 'btn back', '#/'));
    var t = h('div', 'topbar-title');
    t.appendChild(h('h1', null, title));
    if (opts.sub) t.appendChild(h('span', 'topbar-sub', opts.sub));
    bar.appendChild(t);
    if (opts.right) bar.appendChild(opts.right);
    return bar;
  }

  /* ---------- ホーム ---------- */
  function viewHome() {
    var gear = h('button', 'gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', '先生メニュー（1.5秒長おし）');
    gear.innerHTML = '<span class="gear-icon">⚙</span><span class="gear-ring"></span>';
    longPress(gear, 1500, function () { location.hash = '#/teacher'; }, function () { toast('先生用メニューは、長おしで開きます'); });
    app.appendChild(topbar(UNIT_TITLE, { back: false, sub: '4年', right: gear }));

    var main = h('main', 'home');
    var sec = h('section', 'home-lessons');
    var head = h('div', 'sec-head');
    head.appendChild(h('h2', null, 'じゅぎょう'));
    var legend = h('div', 'legend');
    [['su-1', '小数の表し方'], ['su-2', '小数のしくみ'], ['su-3', '小数のたし算とひき算'], ['su-4', '単元のまとめ']].forEach(function (x) {
      var l = h('span', 'legend-item ' + x[0]);
      l.appendChild(h('span', 'legend-dot'));
      l.appendChild(document.createTextNode(x[1]));
      legend.appendChild(l);
    });
    head.appendChild(legend);
    sec.appendChild(head);

    var grid = h('div', 'lesson-grid');
    var ls = lessons();
    if (!ls.length) {
      grid.appendChild(h('div', 'empty-note', 'じゅぎょうの内容を読みこめませんでした。'));
    }
    ls.forEach(function (l) {
      var c = link('', 'lesson-card ' + subunitClass(l.subunit), '#/lesson/' + l.no);
      c.appendChild(h('div', 'lc-no', '第' + l.no + '時'));
      c.appendChild(h('div', 'lc-title', l.title || ''));
      var foot = h('div', 'lc-foot');
      foot.appendChild(h('span', 'lc-page', l.page || ''));
      foot.appendChild(starsNode(lessonStars(l)));
      c.appendChild(foot);
      grid.appendChild(c);
    });
    sec.appendChild(grid);
    main.appendChild(sec);

    var rev = h('section', 'home-review');
    rev.appendChild(h('h2', null, 'ふくしゅう'));
    var rg = h('div', 'review-grid');
    var tp = topics();
    if (!tp.length) rg.appendChild(h('div', 'empty-note', 'ふくしゅうの問題は、まだありません。'));
    tp.forEach(function (t) {
      var a = link('', 'review-btn', '#/review/' + encodeURIComponent(t.id));
      a.appendChild(h('span', 'rv-title', t.title));
      var st = stats('review-' + t.id);
      if (st.tried) a.appendChild(h('span', 'rv-count', '○ ' + st.correct + ' / ' + st.tried));
      rg.appendChild(a);
    });
    rev.appendChild(rg);
    main.appendChild(rev);

    var mk = h('section', 'home-make');
    mk.appendChild(h('h2', null, 'もんだいづくり'));
    var mg = h('div', 'make-grid');
    var c1 = link('', 'make-card', '#/make');
    c1.appendChild(h('span', 'make-icon', '✎'));
    var c1t = h('span', null, 'もんだいをつくる');
    c1t.appendChild(h('span', 'make-sub', '問題を作って、ともだちに送ろう'));
    c1.appendChild(c1t);
    mg.appendChild(c1);
    var c2 = link('', 'make-card my', '#/my');
    c2.appendChild(h('span', 'make-icon', '📁'));
    var c2t = h('span', null, 'つくった問題');
    var myN = myCount();
    c2t.appendChild(h('span', 'make-sub', myN ? 'ほぞんした問題 ' + myN + 'こ' : 'ほぞんした問題を見る・直す・送る'));
    c2.appendChild(c2t);
    mg.appendChild(c2);
    var c3 = link('', 'make-card', '#/open');
    c3.appendChild(h('span', 'make-icon', '📨'));
    var c3t = h('span', null, 'もらった問題をひらく');
    c3t.appendChild(h('span', 'make-sub', 'ともだちから来たリンクやコードをはりつけよう'));
    c3.appendChild(c3t);
    mg.appendChild(c3);
    mk.appendChild(mg);
    main.appendChild(mk);

    var ex = h('section', 'home-extra');
    ex.appendChild(link('✎ 数字を書く練習（読み取りをためそう）', 'extra-link', '#/practice-write'));
    ex.appendChild(link('もんだいボックス（先生用）', 'extra-link small', '#/box'));
    main.appendChild(ex);
    app.appendChild(main);
  }

  function longPress(el, ms, onLong, onShort) {
    var timer = null, fired = false;
    function start(e) {
      if (e.button && e.button !== 0) return;
      fired = false;
      el.classList.add('pressing');
      timer = setTimeout(function () { fired = true; el.classList.remove('pressing'); onLong(); }, ms);
    }
    function cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      el.classList.remove('pressing');
    }
    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', function () { var wasShort = !!timer && !fired; cancel(); if (wasShort && onShort) onShort(); });
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* ---------- 問題を1問ずつ解く ---------- */
  // items: [{p, pid}], key: 記録キー, done(results) 全問のあと
  function runSet(container, items, key, done) {
    var idx = 0, handle = null, shown = 0;
    var results = {}; // pid -> 最新の結果
    var wrap = h('div', 'set');
    var prog = h('div', 'set-progress');
    var area = h('div', 'set-problem');
    var nav = h('div', 'set-nav');
    var prev = button('◀ まえ', 'nav-prev', function () { go(idx - 1); });
    var count = h('span', 'set-count');
    var next = button('つぎ ▶', 'nav-next', function () { go(idx + 1); });
    nav.appendChild(prev); nav.appendChild(count); nav.appendChild(next);
    wrap.appendChild(prog); wrap.appendChild(area); wrap.appendChild(nav);
    container.appendChild(wrap);

    function drawProgress() {
      prog.innerHTML = '';
      items.forEach(function (it, i) {
        var r = results[it.pid];
        var d = h('button', 'dot' + (i === idx ? ' cur' : '') + (r ? (r.correct ? ' ok' : ' ng') : ''), String(i + 1));
        d.type = 'button';
        d.setAttribute('aria-label', (i + 1) + '問目');
        d.addEventListener('click', function () { go(i); });
        prog.appendChild(d);
      });
      count.textContent = (idx + 1) + ' / ' + items.length + ' 問';
      prev.disabled = idx === 0;
      next.textContent = idx === items.length - 1 ? 'おわり ▶' : 'つぎ ▶';
    }
    function show() {
      if (handle) handle.destroy();
      var it = items[idx];
      area.innerHTML = '';
      if (!S.Problems) { area.appendChild(h('div', 'empty-note', '問題を表示できません。')); drawProgress(); return; }
      handle = S.Problems.render(area, it.p, {
        onResult: function (r) {
          results[it.pid] = r;
          record(key, it.pid, r);
          drawProgress();
        },
        onNext: function () { go(idx + 1); }
      });
      drawProgress();
      if (shown++) window.scrollTo({ top: Math.max(0, wrap.getBoundingClientRect().top + window.scrollY - 80), behavior: 'auto' });
    }
    function go(i) {
      if (i < 0) return;
      if (i >= items.length) {
        if (handle) handle.destroy();
        handle = null;
        wrap.remove();
        done(results);
        return;
      }
      idx = i;
      show();
    }
    if (!items.length) { area.appendChild(h('div', 'empty-note', '問題はまだありません。')); nav.remove(); }
    else show();
    cleanups.push(function () { if (handle) handle.destroy(); });
  }

  function resultSummary(items, results) {
    var ok = 0, n = 0;
    items.forEach(function (it) { if (results[it.pid]) { n++; if (results[it.pid].correct) ok++; } });
    return h('div', 'summary-score', items.length + '問中 ○ が ' + ok + '問' + (n < items.length ? '（とばした問題 ' + (items.length - n) + '問）' : ''));
  }

  /* ---------- 各時 ---------- */
  function viewLesson(no) {
    var lesson = null;
    lessons().forEach(function (l) { if (String(l.no) === String(no)) lesson = l; });
    if (!lesson) { app.appendChild(topbar('第' + no + '時')); app.appendChild(h('div', 'empty-note', 'この時の内容が見つかりません。')); return; }
    var key = 'lesson-' + lesson.no;
    app.appendChild(topbar('第' + lesson.no + '時　' + (lesson.title || ''), { sub: lesson.page }));
    var main = h('main', 'lesson ' + subunitClass(lesson.subunit));

    if (lesson.meate) {
      var m = h('div', 'meate');
      m.appendChild(h('span', 'meate-label', 'めあて'));
      m.appendChild(h('span', 'meate-text', lesson.meate));
      main.appendChild(m);
    }
    var tabs = h('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    var tMiru = button('みる', 'tab', function () { select('miru'); });
    var tRen = button('れんしゅう', 'tab', function () { select('renshu'); });
    tabs.appendChild(tMiru); tabs.appendChild(tRen);
    main.appendChild(tabs);
    var pMiru = h('section', 'panel panel-miru');
    var pRen = h('section', 'panel panel-renshu');
    main.appendChild(pMiru); main.appendChild(pRen);
    app.appendChild(main);

    var demoMounted = false, practiceStarted = false;
    function select(which) {
      tMiru.classList.toggle('on', which === 'miru');
      tRen.classList.toggle('on', which === 'renshu');
      tMiru.setAttribute('aria-selected', which === 'miru');
      tRen.setAttribute('aria-selected', which === 'renshu');
      pMiru.hidden = which !== 'miru';
      pRen.hidden = which !== 'renshu';
      if (which === 'miru' && !demoMounted) { demoMounted = true; mountDemo(); }
      if (which === 'renshu' && !practiceStarted) { practiceStarted = true; startPractice(); }
    }
    function mountDemo() {
      var holder = h('div', 'demo-holder');
      pMiru.appendChild(holder);
      var demos = lesson.demos && lesson.demos.length ? lesson.demos : (lesson.demo ? [lesson.demo] : []);
      if (demos.length && S.Demos && S.Demos.mount) {
        var titles = {};
        (S.Demos.list ? S.Demos.list() : []).forEach(function (x) { titles[x.id] = x.title; });
        var cur = null;
        var head = h('div', 'demo-head');
        var stage = h('div', 'demo-stage');
        holder.appendChild(head); holder.appendChild(stage);
        var show = function (i) {
          if (cur) { try { cur.destroy && cur.destroy(); } catch (e) {} cur = null; }
          stage.innerHTML = '';
          head.innerHTML = '';
          if (demos.length > 1) {
            demos.forEach(function (dm, j) {
              var b = button(titles[dm.id] || dm.id, j === i ? 'primary' : '', function () { show(j); });
              head.appendChild(b);
            });
          } else if (titles[demos[i].id]) {
            head.appendChild(h('h3', 'demo-title', titles[demos[i].id]));
          }
          try {
            cur = S.Demos.mount(stage, demos[i].id, demos[i].opts || {});
          } catch (e) {
            console.error('Demos.mount', e);
            stage.appendChild(h('div', 'empty-note', '「みる」の教材を表示できませんでした。'));
          }
        };
        show(0);
        cleanups.push(function () { try { cur && cur.destroy && cur.destroy(); } catch (e) {} });
      } else {
        holder.appendChild(h('div', 'empty-note', 'この時の「みる」は、じゅんび中です。'));
      }
      var go = h('div', 'panel-foot');
      go.appendChild(button('れんしゅうへ ▶', 'primary', function () { select('renshu'); window.scrollTo(0, 0); }));
      pMiru.appendChild(go);
    }
    function startPractice() {
      pRen.innerHTML = '';
      var items = expandLessonProblems(lesson);
      runSet(pRen, items, key, function (results) { showMatome(items, results); });
    }
    function showMatome(items, results) {
      pRen.innerHTML = '';
      var box = h('div', 'matome-wrap');
      box.appendChild(h('div', 'done-msg', 'れんしゅう おつかれさま！'));
      if (items) box.appendChild(resultSummary(items, results));
      if (lesson.matome) {
        var mt = h('div', 'matome');
        mt.appendChild(h('div', 'matome-label', 'まとめ'));
        mt.appendChild(h('div', 'matome-text', lesson.matome));
        box.appendChild(mt);
      }
      var row = h('div', 'matome-actions');
      var more = (lesson.more || []).filter(function (n) { return S.Generators && S.Generators.make; });
      if (more.length) row.appendChild(button('もっとれんしゅう（5問）', 'primary', function () { startMore(more); }));
      row.appendChild(button('はじめからもう一度', '', function () { startPractice(); }));
      row.appendChild(link('ホームへ', 'btn', '#/'));
      box.appendChild(row);
      pRen.appendChild(box);
      window.scrollTo(0, 0);
    }
    function startMore(names) {
      pRen.innerHTML = '';
      pRen.appendChild(h('div', 'more-head', 'もっとれんしゅう'));
      var items = [], stamp = Date.now().toString(36);
      for (var i = 0; i < 5; i++) {
        var p = genProblem(names[Math.floor(Math.random() * names.length)]);
        if (p) items.push({ p: p, pid: 'more-' + stamp + '-' + i });
      }
      runSet(pRen, items, key, function (results) {
        pRen.innerHTML = '';
        var box = h('div', 'matome-wrap');
        box.appendChild(h('div', 'done-msg', 'よくがんばったね！'));
        box.appendChild(resultSummary(items, results));
        var row = h('div', 'matome-actions');
        row.appendChild(button('もう5問', 'primary', function () { startMore(names); }));
        row.appendChild(button('まとめを見る', '', function () { showMatome(null, {}); }));
        row.appendChild(link('ホームへ', 'btn', '#/'));
        box.appendChild(row);
        pRen.appendChild(box);
      });
    }
    select(lesson.demo ? 'miru' : 'renshu');
  }

  /* ---------- ふくしゅう ---------- */
  function viewReview(id) {
    var topic = null;
    topics().forEach(function (t) { if (String(t.id) === String(id)) topic = t; });
    if (!topic) { app.appendChild(topbar('ふくしゅう')); app.appendChild(h('div', 'empty-note', 'このふくしゅうは見つかりません。')); return; }
    app.appendChild(topbar('ふくしゅう：' + topic.title));
    var main = h('main', 'review');
    app.appendChild(main);
    function start() {
      main.innerHTML = '';
      var gens = topic.gens || [];
      var items = [], stamp = Date.now().toString(36);
      if (gens.length) {
        // なるべくかたよらないように、種類を順番にまぜる
        var order = [];
        while (order.length < 10) order = order.concat(shuffle(gens.slice()));
        for (var i = 0; i < 10; i++) {
          var p = genProblem(order[i]);
          if (p) items.push({ p: p, pid: 'rv-' + stamp + '-' + i });
        }
      }
      runSet(main, items, 'review-' + topic.id, function (results) {
        main.innerHTML = '';
        var box = h('div', 'matome-wrap');
        box.appendChild(h('div', 'done-msg', 'ふくしゅう おつかれさま！'));
        box.appendChild(resultSummary(items, results));
        var row = h('div', 'matome-actions');
        row.appendChild(button('もう10問', 'primary', start));
        row.appendChild(link('ホームへ', 'btn', '#/'));
        box.appendChild(row);
        main.appendChild(box);
        window.scrollTo(0, 0);
      });
    }
    start();
  }

  /* ---------- 先生メニュー ---------- */
  function viewTeacher() {
    app.appendChild(topbar('先生メニュー'));
    var main = h('main', 'teacher');
    var s = settings();

    var sec0 = h('section', 'tcard');
    sec0.appendChild(h('h2', null, 'もんだいボックス'));
    var bn = (store() && store().boxList) ? (store().boxList() || []).length : 0;
    sec0.appendChild(h('p', 'tnote', '子どもから集まった問題のリンクを、チャットの文章ごとはりつけて一覧にし、順番に大きく提示できます。' + (bn ? '（いま ' + bn + 'こ）' : '')));
    sec0.appendChild(link('もんだいボックスを開く ▶', 'btn primary', '#/box'));
    main.appendChild(sec0);

    var sec1 = h('section', 'tcard');
    sec1.appendChild(h('h2', null, '丸つけの方法'));
    var row1 = h('div', 'seg');
    var bAuto = button('自動で読み取る ＋ 自分でも確かめる', 'seg-btn', function () { setMode('auto'); });
    var bSelf = button('自分で丸をつける（読み取りなし）', 'seg-btn', function () { setMode('self'); });
    row1.appendChild(bAuto); row1.appendChild(bSelf);
    sec1.appendChild(row1);
    sec1.appendChild(h('p', 'tnote', '数字の読み取り：' + (recReady() ? '使えます' : '読みこめていません（このままでは自分で丸をつける方法になります）')));
    function setMode(m) {
      if (store()) store().setSettings({ checkMode: m });
      bAuto.classList.toggle('on', m === 'auto');
      bSelf.classList.toggle('on', m === 'self');
    }
    setMode(s.checkMode === 'self' ? 'self' : 'auto');
    main.appendChild(sec1);

    var sec2 = h('section', 'tcard');
    sec2.appendChild(h('h2', null, '提示モード（文字を大きく）'));
    var big = button('', 'seg-btn toggle', function () {
      var v = !settings().bigText;
      if (store()) store().setSettings({ bigText: v });
      applySettings();
      upd();
    });
    function upd() { var v = !!settings().bigText; big.textContent = v ? '大きい文字：オン' : '大きい文字：オフ'; big.classList.toggle('on', v); }
    upd();
    sec2.appendChild(big);
    main.appendChild(sec2);

    var sec3 = h('section', 'tcard');
    sec3.appendChild(h('h2', null, 'この端末の記録'));
    if (store() && !store().persistent) sec3.appendChild(h('p', 'tnote warn', 'この環境では記録を保存できません（ページを閉じると消えます）。'));
    var table = h('table', 'rec-table');
    var thead = h('tr');
    ['', 'とりくんだ問題', '○の数', '自動で○', '自己採点で○', 'ヒント'].forEach(function (t) { thead.appendChild(h('th', null, t)); });
    table.appendChild(thead);
    var rows = [];
    lessons().forEach(function (l) { rows.push({ key: 'lesson-' + l.no, label: '第' + l.no + '時 ' + (l.title || '') }); });
    topics().forEach(function (t) { rows.push({ key: 'review-' + t.id, label: 'ふくしゅう：' + t.title }); });
    rows.push({ key: 'friend', label: 'ともだちの問題' });
    var known = rows.map(function (r) { return r.key; });
    (store() ? store().keys() : []).forEach(function (k) { if (known.indexOf(k) < 0) rows.push({ key: k, label: k }); });
    rows.forEach(function (r) {
      var st = stats(r.key);
      var tr = h('tr');
      tr.appendChild(h('th', 'rec-label', r.label));
      [st.tried, st.correct, st.auto, st.self, st.hints].forEach(function (v) { tr.appendChild(h('td', null, String(v))); });
      table.appendChild(tr);
    });
    sec3.appendChild(table);
    sec3.appendChild(button('記録をすべて消す', 'danger', function () {
      confirmDialog('この端末の記録をすべて消します。もとにもどせません。よろしいですか？', '消す', function () {
        if (store()) store().resetAll();
        toast('記録を消しました');
        route();
      });
    }));
    main.appendChild(sec3);

    var sec4 = h('section', 'tcard');
    sec4.appendChild(h('h2', null, 'そのほか'));
    sec4.appendChild(link('数字を書く練習のページ', 'btn', '#/practice-write'));
    if (S.Pad && S.Pad.resetPen) sec4.appendChild(button('ペンの検出をリセット（指で書けるようにする）', '', function () { S.Pad.resetPen(); toast('指でも書けるようにしました'); }));
    main.appendChild(sec4);
    app.appendChild(main);
  }

  /* ---------- 手書き練習 ---------- */
  function viewPracticeWrite() {
    app.appendChild(topbar('数字を書く練習'));
    var main = h('main', 'practice');
    main.appendChild(h('p', 'lead', 'マスの上の数字を、マスいっぱいに書いてみよう。「よみとる」をおすと、アプリがどう読んだかが分かるよ。'));
    if (!recReady()) main.appendChild(h('p', 'tnote warn', 'いまは数字の読み取りが使えません。'));
    var grid = h('div', 'pw-grid');
    var cells = [];
    for (var d = 0; d < 10; d++) {
      var cell = h('div', 'pw-cell');
      cell.appendChild(h('div', 'pw-target', String(d)));
      var box = S.Pad ? S.Pad.digitBox({ size: settings().bigText ? 96 : 84 }) : null;
      if (box) cell.appendChild(box.el);
      var res = h('div', 'pw-res', '');
      cell.appendChild(res);
      grid.appendChild(cell);
      cells.push({ d: d, box: box, res: res });
    }
    main.appendChild(grid);
    var score = h('div', 'pw-score');
    var row = h('div', 'pw-actions');
    row.appendChild(button('よみとる', 'primary', function () {
      if (!recReady()) { toast('読み取りがまだ使えません'); return; }
      var ok = 0, n = 0;
      cells.forEach(function (c) {
        c.res.className = 'pw-res';
        if (!c.box || c.box.isEmpty()) { c.res.textContent = ''; c.box && c.box.mark(null); return; }
        var r;
        try { r = S.Recognizer.recognize(c.box.strokes(), c.box.size, c.box.size) || {}; } catch (e) { r = {}; }
        n++;
        if (r.digit == null) { c.res.textContent = '？'; c.box.mark('unsure'); return; }
        var pct = Math.round((r.conf || 0) * 100);
        var good = r.digit === c.d;
        var unsure = (r.conf || 0) < 0.6;
        c.res.textContent = r.digit + '（' + pct + '%）';
        c.res.classList.add(good ? (unsure ? 'unsure' : 'ok') : 'ng');
        c.box.mark(good ? (unsure ? 'unsure' : 'ok') : 'ng');
        if (good && !unsure) ok++;
      });
      score.textContent = n ? (n + 'こ中 ' + ok + 'こ 正しく読めたよ。黄色や青のマスは、形に気をつけてもう一度書いてみよう。') : 'マスに数字を書いてね。';
    }));
    row.appendChild(button('ぜんぶけす', '', function () {
      cells.forEach(function (c) { if (c.box) { c.box.clear(); c.box.mark(null); } c.res.textContent = ''; });
      score.textContent = '';
    }));
    main.appendChild(row);
    main.appendChild(score);
    var tips = h('div', 'pw-tips');
    tips.appendChild(h('h3', null, 'じょうずに読ませるコツ'));
    ['マスの まん中に、大きく書く', '1マスに数字は1つだけ', '4 や 9 は、上をしっかりとじる・ひらくを区別する', '7 は、たての線をまっすぐに'].forEach(function (t) { tips.appendChild(h('div', 'pw-tip', '・' + t)); });
    main.appendChild(tips);
    app.appendChild(main);
  }

  /* ---------- もんだいづくり（作る画面は Shosu.Maker：担当F） ---------- */
  var routeGen = 0; // 画面が切りかわったら増える（非同期の処理が古い画面に書きこまないように）
  var KIND_LABEL = { hissan: '筆算', fill: '文章題・□うめ', compare: '大小くらべ', masu: 'ますの図', numberline: '数直線' };
  function shareApi() { return S.Share || null; }
  function myCount() {
    try { return store() && store().myList ? (store().myList() || []).length : 0; } catch (e) { return 0; }
  }
  function decodeToken(token) {
    var sh = shareApi();
    if (!sh || !sh.decode) return Promise.reject(new Error('Share がありません'));
    try { return Promise.resolve(sh.decode(token)); } catch (e) { return Promise.reject(e); }
  }
  function inkNode(ink, o) {
    if (S.Present && S.Present.drawInk && ink && ink.strokes) {
      try { return S.Present.drawInk(ink, o); } catch (e) { console.error(e); }
    }
    return h('span', null, '（名前）');
  }

  function viewMaker(r) {
    var holder = h('div', 'maker-root');
    app.appendChild(holder);
    if (!S.Maker || !S.Maker.mount) {
      app.insertBefore(topbar(r === 'my' ? 'つくった問題' : 'もんだいをつくる'), holder);
      var m = h('main');
      m.appendChild(h('div', 'empty-note', 'この画面は、じゅんび中です。'));
      holder.appendChild(m);
      return;
    }
    var hd = null;
    try { hd = S.Maker.mount(holder, r); }
    catch (e) { console.error('Maker.mount', e); holder.appendChild(h('div', 'empty-note', '画面を表示できませんでした。')); }
    cleanups.push(function () { if (hd && hd.destroy) hd.destroy(); });
  }

  /* #/q/<token>：リンクを開いた人。まず提示画面、「自分で解く」でいつもの問題画面 */
  function viewQ(token) {
    var gen = routeGen;
    app.appendChild(h('div', 'q-loading', '問題をひらいています…'));
    decodeToken(token).then(function (up) {
      if (gen !== routeGen) return;
      app.innerHTML = '';
      presentAndSolve(up, token, { back: { href: '#/', label: '◀ ホーム' } });
    }, function (e) {
      if (gen !== routeGen) return;
      console.warn('この問題は開けませんでした', e && e.message);
      app.innerHTML = '';
      openError();
    });
  }
  function openError() {
    app.appendChild(topbar('ともだちの問題'));
    var m = h('main', 'q-error');
    m.appendChild(h('div', 'qe-msg', 'この問題は開けませんでした'));
    m.appendChild(h('p', 'tnote', 'リンクがとちゅうで切れているかもしれません。送った人に、もう一度送ってもらおう。'));
    m.appendChild(link('ホームへ', 'btn primary', '#/'));
    app.appendChild(m);
  }

  /* 提示画面 ⇔ 自分で解く画面 を同じルートの中で切りかえる */
  function presentAndSolve(up, token, presentOpts) {
    var cur = null;
    cleanups.push(function () { if (cur) { try { cur.destroy(); } catch (e) {} } cur = null; });
    function clear() {
      if (cur) { try { cur.destroy(); } catch (e) { console.error(e); } }
      cur = null;
      app.innerHTML = '';
    }
    function present() {
      clear();
      if (!S.Present || !S.Present.mount) { solve(); return; }
      var o = {};
      for (var k in presentOpts) o[k] = presentOpts[k];
      o.token = token;
      o.onSolve = solve;
      try { cur = S.Present.mount(app, up, o); }
      catch (e) { console.error('Present.mount', e); solve(); return; }
      window.scrollTo(0, 0);
    }
    function solve() {
      clear();
      cur = solveView(up, token, S.Present && S.Present.mount ? present : null);
      window.scrollTo(0, 0);
    }
    present();
  }

  function solveView(up, token, onPresent) {
    var right = onPresent ? button('みんなに見せる画面', 'small', onPresent) : null;
    if (right) right.classList.add('back');
    app.appendChild(topbar('ともだちの問題' + (KIND_LABEL[up.kind] ? '（' + KIND_LABEL[up.kind] + '）' : ''), { right: right }));
    var main = h('main', 'friend');
    var card = h('div', 'friend-card');
    var area = h('div', 'friend-problem');
    card.appendChild(area);
    main.appendChild(card);
    var act = h('div', 'friend-actions');
    main.appendChild(act);
    app.appendChild(main);

    var problem = null;
    try { problem = shareApi().toProblem(up, token); } catch (e) { console.error('Share.toProblem', e); }
    var handle = null;
    var pid = String(token || '').slice(0, 16) || null;
    function start() {
      if (handle) handle.destroy();
      handle = null;
      if (!problem || !S.Problems) { area.innerHTML = ''; area.appendChild(h('div', 'empty-note', '問題を表示できません。')); return; }
      handle = S.Problems.render(area, problem, {
        onResult: function (r) { record('friend', pid, r); }
      });
    }
    start();
    act.appendChild(button('もう一度とく', '', function () { start(); window.scrollTo(0, 0); }));
    if (store() && store().mySave) {
      var saveB = button('この問題をほぞん', 'primary', function () {
        try {
          if (store().mySave(up) === false) { toast('ほぞんできませんでした（いっぱいです）'); return; }
          saveB.disabled = true;
          saveB.textContent = 'ほぞんしました';
          toast('「つくった問題」にほぞんしました');
        } catch (e) { console.error(e); toast('ほぞんできませんでした'); }
      });
      act.appendChild(saveB);
    }
    if (onPresent) act.appendChild(button('みんなに見せる画面', '', onPresent));
    act.appendChild(link('ホームへ', 'btn', '#/'));
    return { destroy: function () { if (handle) handle.destroy(); handle = null; } };
  }

  /* ---------- もんだいボックス（先生用） ---------- */
  function boxReady() { return !!(store() && store().boxList && store().boxAdd && shareApi() && shareApi().extractTokens); }
  function boxItems() { try { return store().boxList() || []; } catch (e) { console.error(e); return []; } }
  function describe(up) {
    if (!up) return '';
    if (up.kind === 'hissan') return up.a + ' ' + (up.op === '-' ? '−' : '＋') + ' ' + up.b;
    if (up.kind === 'compare') return up.a + ' □ ' + up.b;
    if (up.kind === 'numberline') return up.min + ' 〜 ' + up.max + '（↑' + ((up.arrows || []).length || 1) + '本）';
    if (up.kind === 'masu') return up.level === 3 ? '0.001Lまで' : '0.01Lまで';
    if (up.kind === 'fill') return '手書きの問題文' + (up.unit ? '（' + up.unit + '）' : '');
    return '';
  }

  /* #/open：もらった問題（リンク・問題コード）をはりつけて開く */
  function viewOpen() {
    app.appendChild(topbar('もらった問題をひらく'));
    var main = h('main', 'box');
    app.appendChild(main);
    var sec = h('section', 'tcard');
    sec.appendChild(h('h2', null, 'リンクや問題コードをはりつけよう'));
    sec.appendChild(h('p', 'tnote', 'Teams や Classroom で送られてきたリンク（または「しょうすうもんだい #/q/…」というコード）をコピーして、下にはりつけてね。'));
    var ta = h('textarea', 'box-paste');
    ta.setAttribute('aria-label', 'リンクや問題コードをはりつける');
    ta.placeholder = 'ここにはりつけ（Ctrl + V）';
    sec.appendChild(ta);
    var row = h('div', 'box-row');
    var msg = h('span', 'box-msg');
    msg.setAttribute('role', 'status');
    row.appendChild(button('ひらく', 'primary', function () {
      var toks = (S.Share && S.Share.extractTokens) ? S.Share.extractTokens(ta.value || '') : [];
      if (!toks.length) {
        msg.textContent = /(?:#|%23)\/q\//i.test(ta.value || '') ? 'とちゅうで切れているみたい。もう一度コピーしてね。' : '問題のリンクやコードが見つからなかったよ。';
        msg.className = 'box-msg warn';
        return;
      }
      location.hash = '#/q/' + toks[0];
    }));
    row.appendChild(msg);
    sec.appendChild(row);
    main.appendChild(sec);
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 0);
  }

  function viewBox() {
    app.appendChild(topbar('もんだいボックス', { sub: '先生用' }));
    var main = h('main', 'box');
    app.appendChild(main);
    if (!boxReady()) { main.appendChild(h('div', 'empty-note', 'もんだいボックスは、じゅんび中です。')); return; }
    var gen = routeGen;

    var sec1 = h('section', 'tcard');
    sec1.appendChild(h('h2', null, 'リンクをとりこむ'));
    sec1.appendChild(h('p', 'tnote', 'Teams や Classroom のチャットを、そのままコピーしてはりつけてください。中にある問題のリンクを、全部見つけてとりこみます。'));
    var ta = h('textarea', 'box-paste');
    ta.setAttribute('aria-label', 'リンクをはりつける');
    ta.placeholder = 'ここにはりつけ（Ctrl + V）';
    sec1.appendChild(ta);
    var row = h('div', 'box-row');
    var msg = h('span', 'box-msg');
    msg.setAttribute('role', 'status');
    var importB = button('とりこむ', 'primary', importText);
    row.appendChild(importB);
    row.appendChild(msg);
    sec1.appendChild(row);
    main.appendChild(sec1);

    var sec2 = h('section', 'tcard');
    main.appendChild(sec2);

    function setMsg(t, warn) { msg.textContent = t; msg.className = 'box-msg' + (warn ? ' warn' : ''); }
    function importText() {
      var toks = [], text = ta.value || '';
      try { toks = shareApi().extractTokens(text) || []; } catch (e) { console.error(e); }
      if (!toks.length) {
        setMsg(/(?:#|%23)\/q\//i.test(text) ? 'リンクが見つかりましたが、開けませんでした（とちゅうで切れているかもしれません）。' : '問題のリンクが見つかりませんでした。', true);
        return;
      }
      importB.disabled = true;
      setMsg('とりこみ中…');
      Promise.all(toks.map(function (t) {
        return decodeToken(t).then(function (up) { return { token: t, up: up }; }, function () { return null; });
      })).then(function (res) {
        if (gen !== routeGen) return;
        importB.disabled = false;
        var ok = res.filter(Boolean);
        // 文章の中の「#/q/」の数と、取り出せたリンクの数をくらべて、こわれたリンクも数える
        var found = (text.match(/(?:#|%23)\/q\//gi) || []).length;
        var occ = 0, sameInText = 0;
        toks.forEach(function (t, i) {
          var n = Math.max(1, text.split(t).length - 1);
          occ += n;
          if (res[i]) sameInText += n - 1;
        });
        var bad = (res.length - ok.length) + Math.max(0, found - occ);
        var before = boxItems().length;
        if (ok.length) { try { store().boxAdd(ok); } catch (e) { console.error(e); } }
        var added = Math.max(0, boxItems().length - before);
        var dup = ok.length - added + sameInText;
        var parts = [added + 'こ追加'];
        if (dup > 0) parts.push(dup + 'こは同じ問題でした');
        if (bad > 0) parts.push(bad + 'こは開けませんでした');
        setMsg(parts.join('、'), !added);
        if (added) ta.value = '';
        drawList();
      });
    }

    function drawList() {
      sec2.innerHTML = '';
      var list = boxItems();
      sec2.appendChild(h('h2', null, '集まった問題（' + list.length + 'こ）'));
      if (!list.length) { sec2.appendChild(h('p', 'tnote', 'まだ問題がありません。上の欄にリンクをはりつけて「とりこむ」をおしてください。')); return; }
      var r = h('div', 'box-row');
      r.appendChild(link('はじめから提示 ▶', 'btn primary', '#/box/1'));
      r.appendChild(button('ぜんぶけす', 'danger', function () {
        confirmDialog('もんだいボックスの問題を、ぜんぶ消します。よろしいですか？', 'ぜんぶけす', function () {
          try { store().boxClear(); } catch (e) { console.error(e); }
          setMsg('');
          drawList();
        });
      }));
      sec2.appendChild(r);
      var ol = h('ol', 'box-list');
      list.forEach(function (it, i) {
        var up = it.up || {};
        var li = h('li', 'box-item');
        li.appendChild(h('span', 'box-no', String(i + 1)));
        var nm = h('span', 'box-name');
        nm.appendChild(inkNode(up.author, { height: 40, width: 200, trim: true, lineWidth: 6, label: 'つくった人の名前' }));
        li.appendChild(nm);
        li.appendChild(h('span', 'box-kind', KIND_LABEL[up.kind] || ''));
        li.appendChild(h('span', 'box-desc', describe(up)));
        li.appendChild(link('提示', 'btn small', '#/box/' + (i + 1)));
        li.appendChild(button('けす', 'small', function () {
          try { store().boxRemove(it.token); } catch (e) { console.error(e); }
          drawList();
        }));
        ol.appendChild(li);
      });
      sec2.appendChild(ol);
    }
    drawList();
  }

  function viewBoxItem(n) {
    var list = boxReady() ? boxItems() : [];
    if (!(n >= 1 && n <= list.length)) {
      app.appendChild(topbar('もんだいボックス'));
      var m = h('main', 'q-error');
      m.appendChild(h('div', 'qe-msg', list.length ? 'この番号の問題はありません。' : 'もんだいボックスは、からっぽです。'));
      m.appendChild(link('もんだいボックスへ', 'btn primary', '#/box'));
      app.appendChild(m);
      return;
    }
    var it = list[n - 1];
    var opts = {
      back: { href: '#/box', label: '◀ ボックス' },
      list: {
        index: n - 1, total: list.length,
        onPrev: function () { if (n > 1) location.hash = '#/box/' + (n - 1); },
        onNext: function () { if (n < list.length) location.hash = '#/box/' + (n + 1); }
      }
    };
    if (it.up) { presentAndSolve(it.up, it.token, opts); return; }
    var gen = routeGen;
    decodeToken(it.token).then(function (up) {
      if (gen !== routeGen) return;
      presentAndSolve(up, it.token, opts);
    }, function () { if (gen === routeGen) openError(); });
  }

  /* ---------- ルーティング ---------- */
  function route() {
    routeGen++;
    while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.error(e); } }
    app.innerHTML = '';
    applySettings();
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/');
    try {
      if (parts[0] === 'lesson' && parts[1]) viewLesson(parts[1]);
      else if (parts[0] === 'review' && parts[1]) viewReview(decodeURIComponent(parts[1]));
      else if (parts[0] === 'teacher') viewTeacher();
      else if (parts[0] === 'practice-write') viewPracticeWrite();
      else if (parts[0] === 'make' || parts[0] === 'my' || parts[0] === 'edit') viewMaker(hash);
      else if (parts[0] === 'q' && parts[1]) viewQ(hash.slice(2));
      else if (parts[0] === 'box' && parts[1]) viewBoxItem(parseInt(parts[1], 10));
      else if (parts[0] === 'box') viewBox();
      else if (parts[0] === 'open') viewOpen();
      else viewHome();
    } catch (e) {
      console.error(e);
      app.appendChild(h('div', 'empty-note', '画面を表示できませんでした。'));
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();

  /* ---------- オフライン（Service Worker）。file:// では使わない ---------- */
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function () {
        return navigator.serviceWorker.ready;
      }).then(function (reg) {
        // 読みこんだファイルをすべてキャッシュしてもらう（教材ファイル名が増えても対応できる）
        var urls = [location.href.split('#')[0]];
        Array.prototype.forEach.call(document.querySelectorAll('script[src]'), function (s) { urls.push(s.src); });
        Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"],link[rel="manifest"],link[rel="icon"]'), function (l) { urls.push(l.href); });
        if (reg.active) reg.active.postMessage({ type: 'cache-urls', urls: urls });
      }).catch(function (e) { console.warn('SW', e); });
    });
  }

  S.App = { route: route, UNIT_TITLE: UNIT_TITLE };
})(window.Shosu = window.Shosu || {});
