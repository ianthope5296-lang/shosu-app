/* app.js — 画面の切り替え（ハッシュルーティング）・ホーム・各時・ふくしゅう・先生メニュー・手書き練習 */
(function (S) {
  'use strict';

  var APP_TITLE = '小数コスモス 〜小数の星を集める旅〜';
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
  /* アイコン（Shosu.Icons：自作のSVG）。ないときは文字だけで動く */
  function arrows(el) { if (S.Icons && S.Icons.arrows) { try { S.Icons.arrows(el); } catch (e) {} } return el; }
  function iconEl(name, cls) {
    if (!(S.Icons && S.Icons.has && S.Icons.has(name))) return null;
    return S.Icons.el(name, { wrapCls: cls });
  }
  function withIcon(el, name, text) {
    if (S.Icons && S.Icons.label && S.Icons.has(name)) S.Icons.label(el, text, name);
    else el.textContent = text;
    return el;
  }
  function button(label, cls, fn) {
    var b = h('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    if (fn) b.addEventListener('click', fn);
    return arrows(b);
  }
  function link(label, cls, href) { var a = h('a', cls, label); a.href = href; return arrows(a); }
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
  // 星3つ（Shosu.Stars の星のSVG。もらっていない星はうすく表示）
  function starsNode(n) {
    var s = h('div', 'stars');
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', '星' + n + 'こ');
    var svg = S.Stars && S.Stars.SVG_STAR;
    for (var i = 0; i < 3; i++) {
      var st = h('span', i < n ? 'star on' : 'star');
      if (svg) st.innerHTML = svg; else st.textContent = i < n ? '*' : '-';
      s.appendChild(st);
    }
    return s;
  }

  /* ---------- 星と称号（Shosu.Stars：担当H）・とちゅうから（Shosu.Session） ---------- */
  function sess() { return S.Session || null; }
  function sessLoad(key) { try { return sess() ? sess().load(key) : null; } catch (e) { console.error(e); return null; } }
  function sessSave(key, st) { try { if (sess()) sess().save(key, st); } catch (e) { console.error(e); } }
  function sessClear(key) { try { if (sess()) sess().clear(key); } catch (e) { console.error(e); } }
  function starLog(type, data) {
    if (!(S.Stars && S.Stars.log)) return [];
    try { return S.Stars.log(type, data) || []; } catch (e) { console.error('Stars.log', type, e); return []; }
  }
  function starBadge() {
    if (!(S.Stars && S.Stars.badge)) return null;
    try {
      var b = S.Stars.badge();
      if (!b) return null;
      var w = h('span', 'topbar-stars');
      w.appendChild(b);
      return w;
    } catch (e) { console.error('Stars.badge', e); return null; }
  }

  /* 絵文字を使わない、かんたんな自作の絵（わくせいと星）。ふつうは Shosu.Icons の saturn を使う */
  function cosmosIcon(cls) {
    if (S.Icons && S.Icons.has && S.Icons.has('saturn')) {
      var w = document.createElement('span');
      w.innerHTML = S.Icons.get('saturn', { cls: cls });
      return w.firstChild;
    }
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', cls || '');
    svg.innerHTML =
      '<circle cx="30" cy="34" r="15" fill="#ffd166"/>' +
      '<ellipse cx="30" cy="34" rx="26" ry="7" fill="none" stroke="#fff" stroke-width="3" transform="rotate(-18 30 34)"/>' +
      '<path d="M52 6 L54 12 L60 14 L54 16 L52 22 L50 16 L44 14 L50 12 Z" fill="#fff"/>' +
      '<circle cx="10" cy="12" r="2" fill="#fff"/><circle cx="56" cy="52" r="2.2" fill="#fff"/>';
    return svg;
  }

  /* ホームの見出し：「小数コスモス」をロゴのように（読み上げは APP_TITLE のまま） */
  function logoTitle(h1) {
    if (!h1) return;
    var m = APP_TITLE.match(/^(\S+)\s*(.*)$/) || [APP_TITLE, APP_TITLE, ''];
    h1.textContent = '';
    h1.className = 'logo';
    h1.setAttribute('aria-label', APP_TITLE);
    var em = iconEl('emblem', 'logo-mark');
    if (em) h1.appendChild(em);
    var w = h('span', 'logo-words');
    w.setAttribute('aria-hidden', 'true');
    w.appendChild(h('span', 'logo-main', m[1]));
    if (m[2]) w.appendChild(h('span', 'logo-tag', m[2]));
    h1.appendChild(w);
  }

  function topbar(title, opts) {
    opts = opts || {};
    var bar = h('header', 'topbar');
    if (opts.back !== false) bar.appendChild(link('◀ ホーム', 'btn back', '#/'));
    var t = h('div', 'topbar-title');
    t.appendChild(h('h1', null, title));
    if (opts.sub) t.appendChild(h('span', 'topbar-sub', opts.sub));
    bar.appendChild(t);
    var sb = opts.stars === false ? null : starBadge();
    if (sb) bar.appendChild(sb);
    if (opts.right) bar.appendChild(opts.right);
    return bar;
  }

  /* 「とちゅうのところがあるよ」：つづきから／はじめから を大きく出す */
  function resumePrompt(container, o) {
    var box = h('div', 'resume');
    box.setAttribute('role', 'dialog');
    box.appendChild(h('div', 'resume-msg', o.msg || 'とちゅうのところがあるよ'));
    if (o.sub) box.appendChild(h('div', 'resume-sub', o.sub));
    var row = h('div', 'resume-row');
    row.appendChild(button('つづきから ▶', 'primary resume-go', function () { box.remove(); o.onContinue(); }));
    row.appendChild(button('はじめから', 'resume-restart', function () { box.remove(); o.onRestart(); }));
    box.appendChild(row);
    if (o.extra) box.appendChild(o.extra);
    container.appendChild(box);
    return box;
  }
  function firstOpen(items, results) {
    for (var i = 0; i < items.length; i++) if (!results[items[i].pid]) return i;
    return -1;
  }
  function slimResult(r) { return { correct: !!(r && r.correct), method: r && r.method === 'self' ? 'self' : 'auto', hints: (r && r.hints) || 0 }; }
  function cleanResults(items, res) {
    var out = {};
    res = res || {};
    items.forEach(function (it) { if (res[it.pid]) out[it.pid] = slimResult(res[it.pid]); });
    return out;
  }
  function countAnswered(items, results) { var n = 0; items.forEach(function (it) { if (results[it.pid]) n++; }); return n; }
  /* 自動で作った問題をそのまま保存したもの（[{p, pid}]）が正しい形か */
  function validItems(a) {
    return Array.isArray(a) && a.length > 0 && a.every(function (it) { return it && it.p && typeof it.p === 'object' && it.p.type && it.pid; });
  }

  /* ---------- ホーム ---------- */
  function viewHome() {
    var gear = h('button', 'gear');
    gear.type = 'button';
    gear.setAttribute('aria-label', '先生メニュー（1.5秒長おし）');
    gear.innerHTML = '<span class="gear-ring"></span>';
    var gIc = iconEl('telescope', 'gear-icon');
    if (gIc) gear.insertBefore(gIc, gear.firstChild);
    else gear.insertBefore(h('span', 'gear-icon', '先生'), gear.firstChild);
    longPress(gear, 1500, function () { location.hash = '#/teacher'; }, function () { toast('先生用メニューは、長おしで開きます'); });
    var bar = topbar(APP_TITLE, { back: false, sub: UNIT_TITLE + '（4年）', right: gear });
    bar.classList.add('topbar-home');
    logoTitle(bar.querySelector('h1'));
    app.appendChild(bar);

    var main = h('main', 'home');
    var sec = h('section', 'home-lessons');
    var head = h('div', 'sec-head');
    var lh = h('h2', null, 'じゅぎょう');
    lh.appendChild(h('span', 'sec-note', '星の旅の航路：第1時から じゅんに 星をあつめよう'));
    head.appendChild(lh);
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
      var nst = lessonStars(l);
      if (nst >= 3) c.classList.add('lc-done');
      var no = h('div', 'lc-no');
      no.appendChild(h('span', 'lc-node', String(l.no)));
      no.appendChild(h('span', 'lc-no-t', '第' + l.no + '時'));
      c.appendChild(no);
      c.appendChild(h('div', 'lc-title', l.title || ''));
      var foot = h('div', 'lc-foot');
      foot.appendChild(h('span', 'lc-page', l.page || ''));
      foot.appendChild(starsNode(nst));
      c.appendChild(foot);
      grid.appendChild(c);
    });
    sec.appendChild(grid);
    main.appendChild(sec);

    // まとめモードと星のずかん（第1〜10時と、ふくしゅうの間）
    var mm = h('section', 'home-matome');
    var mmA = link('', 'matome-entry', '#/matome');
    mmA.appendChild(cosmosIcon('matome-entry-icon'));
    var mmT = h('span', 'matome-entry-text');
    mmT.appendChild(h('span', 'matome-entry-title', 'まとめモード'));
    var mmSub = 'いろいろな問題に、時間をきめてちょうせん！（かんたん・ふつう・むずかしい／5〜20分）';
    var mmSt = sessLoad('matome');
    if (validMatome(mmSt)) mmSub = 'とちゅうのところがあるよ。つづきから できるよ';
    mmT.appendChild(h('span', 'matome-entry-sub', mmSub));
    mmA.appendChild(mmT);
    mmA.appendChild(arrows(h('span', 'matome-entry-go', 'スタート ▶')));
    mm.appendChild(mmA);
    var zk = link('', 'stars-entry', '#/stars');
    var zkT = h('span', 'stars-entry-title');
    withIcon(zkT, 'constellation', '星のずかん');
    zk.appendChild(zkT);
    zk.appendChild(h('span', 'stars-entry-sub', 'もらった星と称号を見る'));
    if (S.Stars && S.Stars.summary) {
      try {
        var sm = S.Stars.summary();
        if (sm && sm.title && sm.title.name) zk.appendChild(h('span', 'stars-entry-title-now', 'いまの称号：' + sm.title.name));
      } catch (e) { console.error('Stars.summary', e); }
    }
    mm.appendChild(zk);
    main.appendChild(mm);

    var rev = h('section', 'home-review');
    rev.appendChild(h('h2', null, 'ふくしゅう'));
    var rg = h('div', 'review-grid');
    var tp = topics();
    if (!tp.length) rg.appendChild(h('div', 'empty-note', 'ふくしゅうの問題は、まだありません。'));
    tp.forEach(function (t) {
      var a = link('', 'review-btn', '#/review/' + encodeURIComponent(t.id));
      var rvIc = iconEl('moon', 'rv-icon');
      if (rvIc) a.appendChild(rvIc);
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
    c1.appendChild(iconEl('pen', 'make-icon') || h('span', 'make-icon'));
    var c1t = h('span', null, 'もんだいをつくる');
    c1t.appendChild(h('span', 'make-sub', '問題を作って、ともだちに送ろう'));
    c1.appendChild(c1t);
    mg.appendChild(c1);
    var c2 = link('', 'make-card my', '#/my');
    c2.appendChild(iconEl('planet', 'make-icon') || h('span', 'make-icon'));
    var c2t = h('span', null, 'つくった問題');
    var myN = myCount();
    c2t.appendChild(h('span', 'make-sub', myN ? 'ほぞんした問題 ' + myN + 'こ' : 'ほぞんした問題を見る・直す・送る'));
    c2.appendChild(c2t);
    mg.appendChild(c2);
    var c3 = link('', 'make-card', '#/open');
    c3.appendChild(iconEl('letter', 'make-icon') || h('span', 'make-icon'));
    var c3t = h('span', null, 'もらった問題をひらく');
    c3t.appendChild(h('span', 'make-sub', 'ともだちから来たリンクやコードをはりつけよう'));
    c3.appendChild(c3t);
    mg.appendChild(c3);
    mk.appendChild(mg);
    main.appendChild(mk);

    var ex = h('section', 'home-extra');
    ex.appendChild(withIcon(link('', 'extra-link', '#/practice-write'), 'pen', '数字を書く練習（読み取りをためそう）'));
    ex.appendChild(withIcon(link('', 'extra-link small', '#/box'), 'dish', 'もんだいボックス（先生用）'));
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
  // opts: { results: 前に答えた結果 {pid: r}（番号の丸に再現する）, start: 最初に出す番号,
  //         onAnswer(it, r, results, first) 答えるたび（first は、その問題の最初の結果のとき true） }
  // 戻り値: { stop() } … とちゅうでやめる（done は呼ばない）
  function runSet(container, items, key, done, opts) {
    opts = opts || {};
    var idx = 0, handle = null, shown = 0, stopped = false;
    var results = {}; // pid -> 最新の結果
    if (opts.results) for (var rk in opts.results) results[rk] = opts.results[rk];
    if (opts.start > 0 && opts.start < items.length) idx = opts.start;
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
      arrows(next);
    }
    function show() {
      if (handle) handle.destroy();
      var it = items[idx];
      area.innerHTML = '';
      if (!S.Problems) { area.appendChild(h('div', 'empty-note', '問題を表示できません。')); drawProgress(); return; }
      var seen = false; // この表示で、もう結果を受け取ったか
      handle = S.Problems.render(area, it.p, {
        onResult: function (r) {
          if (stopped) return;
          results[it.pid] = r;
          record(key, it.pid, r);
          drawProgress();
          var first = !seen;
          seen = true;
          if (opts.onAnswer) { try { opts.onAnswer(it, r, results, first); } catch (e) { console.error(e); } }
        },
        onNext: function () { go(idx + 1); }
      });
      drawProgress();
      if (shown++) window.scrollTo({ top: Math.max(0, wrap.getBoundingClientRect().top + window.scrollY - 80), behavior: 'auto' });
    }
    function go(i) {
      if (i < 0 || stopped) return;
      if (i >= items.length) {
        if (handle) handle.destroy();
        handle = null;
        stopped = true;
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
    return {
      stop: function () { stopped = true; if (handle) handle.destroy(); handle = null; wrap.remove(); }
    };
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
    /* --- とちゅうから：各時のれんしゅう（'lesson-N'）と、もっとれんしゅう（'more-N'） --- */
    var sKey = 'lesson-' + lesson.no, mKey = 'more-' + lesson.no;
    function loadLessonSession() {
      var st = sessLoad(sKey);
      if (!st || !Array.isArray(st.pids) || !st.results) return null;
      if (st.pids.join('|') !== lessonPids(lesson).join('|')) { sessClear(sKey); return null; } // 内容が変わった
      return st;
    }
    function loadMoreSession() {
      var st = sessLoad(mKey);
      if (!st || !validItems(st.items)) return null;
      var res = cleanResults(st.items, st.results);
      if (firstOpen(st.items, res) < 0) { sessClear(mKey); return null; }
      return { items: st.items, results: res, names: st.names };
    }
    function startPractice(noAsk) {
      pRen.innerHTML = '';
      if (!noAsk) {
        var ls0 = loadLessonSession();
        if (ls0) {
          var items0 = buildLessonItems(ls0);
          var res0 = cleanResults(items0, ls0.results);
          var at = firstOpen(items0, res0);
          if (at >= 0 && countAnswered(items0, res0) > 0) {
            resumePrompt(pRen, {
              msg: 'とちゅうのところがあるよ（' + (at + 1) + '問目から）',
              sub: items0.length + '問中 ' + countAnswered(items0, res0) + '問 答えたよ',
              onContinue: function () { runPractice(items0, res0, at); },
              onRestart: function () { sessClear(sKey); startPractice(true); }
            });
            return;
          }
          sessClear(sKey);
        }
        var ms = loadMoreSession();
        if (ms) {
          var at2 = firstOpen(ms.items, ms.results);
          var extra = h('div', 'resume-extra');
          extra.appendChild(button('第' + lesson.no + '時の れんしゅうを する', 'small', function () { sessClear(mKey); startPractice(true); }));
          resumePrompt(pRen, {
            msg: 'もっとれんしゅうの とちゅうのところがあるよ（' + (at2 + 1) + '問目から）',
            onContinue: function () { startMore(ms.names || moreNames(), ms); },
            onRestart: function () { sessClear(mKey); startMore(moreNames()); },
            extra: extra
          });
          return;
        }
      }
      runPractice(buildLessonItems(null), {}, 0);
    }
    // 問題を並べる。自動で作る問題（type:'gen'）は、保存したものがあればそれを使う
    function buildLessonItems(st) {
      var items = expandLessonProblems(lesson);
      var gens = (st && st.gens) || {};
      items.forEach(function (it) { if (gens[it.pid] && gens[it.pid].type) it.p = gens[it.pid]; });
      return items;
    }
    function runPractice(items, res, start) {
      pRen.innerHTML = '';
      var genPids = {};
      (lesson.problems || []).forEach(function (p, i) { if (p && p.type === 'gen') genPids[p.id || 'p' + i] = 1; });
      runSet(pRen, items, key, function (results) { sessClear(sKey); showMatome(items, results); }, {
        results: res, start: start,
        onAnswer: function (it, r, results) {
          var cr = cleanResults(items, results);
          if (firstOpen(items, cr) < 0) sessClear(sKey); // 全部答えた
          else {
            var gens = {};
            items.forEach(function (x) { if (genPids[String(x.pid).replace(/-\d+$/, '')]) gens[x.pid] = x.p; });
            sessSave(sKey, { pids: items.map(function (x) { return x.pid; }), results: cr, gens: gens });
          }
          starLog('lesson', { no: lesson.no });
        }
      });
    }
    function moreNames() { return (lesson.more || []).filter(function () { return S.Generators && S.Generators.make; }); }
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
      var more = moreNames();
      if (more.length) row.appendChild(button('もっとれんしゅう（5問）', 'primary', function () { startMore(more); }));
      row.appendChild(button('はじめからもう一度', '', function () { sessClear(sKey); startPractice(true); }));
      row.appendChild(link('ホームへ', 'btn', '#/'));
      box.appendChild(row);
      pRen.appendChild(box);
      window.scrollTo(0, 0);
    }
    // resume: {items, results}（とちゅうから）
    function startMore(names, resume) {
      pRen.innerHTML = '';
      pRen.appendChild(h('div', 'more-head', 'もっとれんしゅう'));
      var items = [], res = {}, start = 0;
      if (resume) {
        items = resume.items; res = resume.results; start = Math.max(0, firstOpen(items, res));
      } else {
        var stamp = Date.now().toString(36);
        for (var i = 0; i < 5; i++) {
          var p = genProblem(names[Math.floor(Math.random() * names.length)]);
          if (p) items.push({ p: p, pid: 'more-' + stamp + '-' + i });
        }
        sessClear(mKey);
      }
      var logged = {}; // pid -> 星の記録に知らせた結果（○になったか）
      items.forEach(function (it) { if (res[it.pid]) logged[it.pid] = res[it.pid].correct ? 2 : 1; });
      runSet(pRen, items, key, function (results) {
        sessClear(mKey);
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
      }, {
        results: res, start: start,
        onAnswer: function (it, r, results) {
          var cr = cleanResults(items, results);
          if (firstOpen(items, cr) < 0) sessClear(mKey);
          else sessSave(mKey, { items: items, results: cr, names: names });
          // 1問につき1回。×のあと自己採点で○になったときだけ、もう一度 ○ を知らせる
          var prevL = logged[it.pid] || 0;
          if (!prevL) { logged[it.pid] = r.correct ? 2 : 1; starLog('more', { correct: !!r.correct }); }
          else if (prevL === 1 && r.correct) { logged[it.pid] = 2; starLog('more', { correct: true }); }
        }
      });
    }
    var hasSession = !!(loadLessonSession() || loadMoreSession());
    select(lesson.demo && !hasSession ? 'miru' : 'renshu');
  }

  /* ---------- ふくしゅう ---------- */
  function viewReview(id) {
    var topic = null;
    topics().forEach(function (t) { if (String(t.id) === String(id)) topic = t; });
    if (!topic) { app.appendChild(topbar('ふくしゅう')); app.appendChild(h('div', 'empty-note', 'このふくしゅうは見つかりません。')); return; }
    app.appendChild(topbar('ふくしゅう：' + topic.title));
    var main = h('main', 'review');
    app.appendChild(main);
    var sKey = 'review-' + topic.id;
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
      sessClear(sKey);
      run(items, {});
    }
    function run(items, res) {
      main.innerHTML = '';
      runSet(main, items, sKey, function (results) {
        sessClear(sKey);
        logOnce(results);
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
      }, {
        results: res, start: Math.max(0, firstOpen(items, res)),
        onAnswer: function (it, r, results) {
          var cr = cleanResults(items, results);
          if (firstOpen(items, cr) < 0) { sessClear(sKey); logOnce(results); } // 全部答えた
          else sessSave(sKey, { items: items, results: cr });
        }
      });
      var logged = false;
      function logOnce(results) {
        if (logged || !items.length) return;
        logged = true;
        var ok = 0;
        items.forEach(function (it) { if (results[it.pid] && results[it.pid].correct) ok++; });
        starLog('review', { topic: topic.id, total: items.length, correct: ok });
      }
    }
    var st = sessLoad(sKey);
    if (st && validItems(st.items)) {
      var res = cleanResults(st.items, st.results);
      var at = firstOpen(st.items, res);
      var n = countAnswered(st.items, res);
      if (n > 0 && at >= 0) {
        resumePrompt(main, {
          msg: 'とちゅうのところがあるよ（' + (at + 1) + '問目から）',
          sub: st.items.length + '問中 ' + n + '問 答えたよ',
          onContinue: function () { run(st.items, res); },
          onRestart: function () { start(); }
        });
        return;
      }
    }
    start();
  }

  /* ---------- まとめモード（問題選びは Shosu.Matome：担当I） ---------- */
  var MATOME_TAG_LABEL = {
    hyoshikata: '表し方・単位', shikumi: 'しくみ・数の構成', daisho: '大小', jubai: '10倍・1/10',
    tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり'
  };
  var MATOME_LEVELS = [{ id: 'easy', label: 'かんたん' }, { id: 'normal', label: 'ふつう' }, { id: 'hard', label: 'むずかしい' }];
  var MATOME_TIMES = [5, 10, 15, 20];
  function matomeApi() { return S.Matome && S.Matome.build ? S.Matome : null; }
  function matomeLevels() { var m = matomeApi(); return m && Array.isArray(m.LEVELS) && m.LEVELS.length ? m.LEVELS : MATOME_LEVELS; }
  function matomeTimes() { var m = matomeApi(); return m && Array.isArray(m.TIMES) && m.TIMES.length ? m.TIMES : MATOME_TIMES; }
  function levelLabel(id) { var l = null; matomeLevels().forEach(function (x) { if (x.id === id) l = x.label; }); return l || id; }
  function tagLabel(tag) {
    if (MATOME_TAG_LABEL[tag]) return MATOME_TAG_LABEL[tag];
    var t = null;
    topics().forEach(function (x) { if (x.id === tag) t = x.title; });
    return t || tag || 'そのほか';
  }
  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function seededRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var matomeCountCache = {};
  function matomeCount(level, minutes) {
    var k = level + '/' + minutes;
    if (k in matomeCountCache) return matomeCountCache[k];
    var n = 0;
    try { var b = matomeApi().build({ level: level, minutes: minutes, rng: seededRng(minutes * 7 + 1) }); n = b && b.problems ? b.problems.length : 0; }
    catch (e) { console.error('Matome.build', e); }
    matomeCountCache[k] = n;
    return n;
  }
  // 前の回の結果（内容ごとの×の割合）。次の build に weak として渡す
  function matomeLast() { var v = sessLoad('matome-last'); return v && typeof v === 'object' ? v : {}; }
  function validMatome(st) {
    return st && validItems(st.items) && typeof st.minutes === 'number' && st.level;
  }

  function viewMatome() {
    app.appendChild(topbar('まとめモード', { sub: 'いろいろな問題にちょうせん' }));
    var main = h('main', 'mm');
    app.appendChild(main);
    if (!matomeApi()) { main.appendChild(h('div', 'empty-note', 'まとめモードは、じゅんび中です。')); return; }
    var st = sessLoad('matome');
    if (validMatome(st)) {
      var res = cleanResults(st.items, st.results);
      var at = firstOpen(st.items, res);
      if (at >= 0) {
        var left = st.minutes * 60000 - (st.elapsed || 0);
        resumePrompt(main, {
          msg: 'とちゅうのところがあるよ（' + (at + 1) + '問目から）',
          sub: levelLabel(st.level) + '・' + st.minutes + '分　' + (left >= 0 ? 'のこり ' + mmss(left) : '時間をこえています'),
          onContinue: function () { st.results = res; runMatome(main, st); },
          onRestart: function () { sessClear('matome'); matomeSetup(main); }
        });
        return;
      }
      sessClear('matome');
    }
    matomeSetup(main);
  }

  function matomeSetup(main) {
    main.innerHTML = '';
    var last = matomeLast();
    var level = last.level || 'easy', minutes = last.minutes || 5;
    var card = h('section', 'mm-setup');
    card.appendChild(h('p', 'mm-lead', 'これまでに学習した、いろいろな問題が出るよ。レベルと時間をえらんで「スタート」をおそう。'));
    card.appendChild(h('h2', 'mm-h', 'レベル'));
    var lv = h('div', 'mm-choices mm-levels');
    var lvBtns = matomeLevels().map(function (l) {
      var b = button('', 'mm-choice', function () { level = l.id; mark(); });
      b.appendChild(h('span', 'mm-choice-t', l.label));
      b.dataset.id = l.id;
      lv.appendChild(b);
      return b;
    });
    card.appendChild(lv);
    card.appendChild(h('h2', 'mm-h', '時間'));
    var tm = h('div', 'mm-choices mm-times');
    var tmBtns = matomeTimes().map(function (m) {
      var b = button('', 'mm-choice', function () { minutes = m; mark(); });
      b.appendChild(h('span', 'mm-choice-t', m + '分'));
      var sub = h('span', 'mm-choice-sub', '');
      b.appendChild(sub);
      b.dataset.min = m;
      tm.appendChild(b);
      return { b: b, sub: sub, m: m };
    });
    card.appendChild(tm);
    var go = button('スタート ▶', 'primary mm-start', function () { startMatome(main, level, minutes); });
    var foot = h('div', 'mm-foot');
    foot.appendChild(go);
    card.appendChild(foot);
    if (last.weak) {
      var weakTags = Object.keys(last.weak).filter(function (t) { return last.weak[t] >= 0.4; });
      if (weakTags.length) card.appendChild(h('p', 'mm-note', '前の回にまちがいが多かった「' + weakTags.map(tagLabel).join('」「') + '」が、少し多めに出るよ。'));
    }
    main.appendChild(card);
    function mark() {
      lvBtns.forEach(function (b) { var on = b.dataset.id === level; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      tmBtns.forEach(function (x) {
        var on = x.m === minutes;
        x.b.classList.toggle('on', on);
        x.b.setAttribute('aria-pressed', on);
        var n = matomeCount(level, x.m);
        x.sub.textContent = n ? '約' + n + '問' : '';
      });
    }
    mark();
  }

  function startMatome(main, level, minutes) {
    var built = null;
    var last = matomeLast();
    try { built = matomeApi().build({ level: level, minutes: minutes, weak: last.weak || undefined }); }
    catch (e) { console.error('Matome.build', e); }
    var probs = built && Array.isArray(built.problems) ? built.problems.filter(Boolean) : [];
    if (!probs.length) { toast('問題を作れませんでした'); return; }
    var stamp = Date.now().toString(36);
    var st = {
      level: level, minutes: minutes, stamp: stamp,
      items: probs.map(function (p, i) { return { p: p, pid: 'mt-' + stamp + '-' + i, tag: p.tag || '' }; }),
      results: {}, elapsed: 0, timeUp: false
    };
    sessSave('matome', st);
    var l = matomeLast();
    l.level = level; l.minutes = minutes;
    sessSave('matome-last', l);
    runMatome(main, st);
  }

  /* 問題を出す。時間は「始めた時刻」と「それまでにかかった時間」で計算するので、
     タブをはなれてもずれない。アプリを閉じていた時間は数えない（つづきからで残り時間を引きつぐ） */
  function runMatome(main, st) {
    main.innerHTML = '';
    var limit = st.minutes * 60000;
    var since = Date.now() - (st.elapsed || 0);
    var over = false, timer = null, lastSave = Date.now(), dlg = null;
    var items = st.items;
    function elapsed() { return Date.now() - since; }

    var bar = h('div', 'mm-status');
    bar.setAttribute('role', 'status');
    var lvEl = h('span', 'mm-st-level', levelLabel(st.level) + '・' + st.minutes + '分');
    var timeEl = h('span', 'mm-st-time');
    var leftEl = h('span', 'mm-st-left');
    var endB = button('ここでおわる', 'small mm-st-end', function () {
      confirmDialog('ここでおわりにして、結果を見ますか？', 'おわる', function () { finish(); });
    });
    endB.classList.remove('danger');
    bar.appendChild(lvEl); bar.appendChild(timeEl); bar.appendChild(leftEl); bar.appendChild(endB);
    main.appendChild(bar);
    var area = h('div', 'mm-area');
    main.appendChild(area);

    function answered() { return countAnswered(items, st.results); }
    function draw() {
      var rest = limit - elapsed();
      if (rest >= 0) { timeEl.textContent = 'のこり ' + mmss(rest); timeEl.classList.remove('over'); timeEl.classList.toggle('soon', rest < 60000); }
      else { timeEl.textContent = '時間をこえて ' + mmss(-rest); timeEl.classList.add('over'); timeEl.classList.remove('soon'); }
      leftEl.textContent = 'あと ' + (items.length - answered()) + '問';
    }
    function persist() {
      if (over) return;
      st.elapsed = elapsed();
      lastSave = Date.now();
      sessSave('matome', st);
    }
    function tick() {
      if (over) return;
      draw();
      if (!st.timeUp && elapsed() >= limit) {
        st.timeUp = true;
        persist();
        timeUpDialog();
      }
      if (Date.now() - lastSave > 5000) persist();
    }
    function timeUpDialog() {
      var back = h('div', 'modal-back');
      var box = h('div', 'modal mm-timeup');
      box.setAttribute('role', 'dialog');
      box.appendChild(h('div', 'mm-timeup-msg', '時間になったよ。'));
      box.appendChild(h('div', 'modal-msg', items.length + '問中 ' + answered() + '問 答えたよ。このままつづけてもいいよ。'));
      var row = h('div', 'modal-row mm-timeup-row');
      row.appendChild(button('つづける', 'primary', function () { back.remove(); dlg = null; }));
      row.appendChild(button('ここでおわる', '', function () { back.remove(); dlg = null; finish(); }));
      box.appendChild(row);
      back.appendChild(box);
      document.body.appendChild(back);
      dlg = back;
    }
    function onVis() { if (document.visibilityState === 'hidden') persist(); else tick(); }
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', persist);
    timer = setInterval(tick, 500);
    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', persist);
      if (dlg) { dlg.remove(); dlg = null; }
    }
    cleanups.push(function () { persist(); stopTimer(); });

    var start = firstOpen(items, st.results);
    var ctl = runSet(area, items, 'matome', function () { finish(); }, {
      results: st.results, start: start < 0 ? 0 : start,
      onAnswer: function (it, r, results) {
        st.results = cleanResults(items, results);
        persist();
        draw();
      }
    });
    draw();
    tick();

    function finish() {
      if (over) return;
      var took = elapsed();
      st.elapsed = took;
      over = true;
      stopTimer();
      if (ctl) ctl.stop();
      sessClear('matome');
      var res = st.results;
      var n = answered(), ok = 0;
      var byTag = {}, tagOrder = [];
      items.forEach(function (it) {
        var tag = it.tag || (it.p && it.p.tag) || '';
        if (!byTag[tag]) { byTag[tag] = { n: 0, ok: 0, total: 0 }; tagOrder.push(tag); }
        byTag[tag].total++;
        var r = res[it.pid];
        if (r) { byTag[tag].n++; if (r.correct) { byTag[tag].ok++; ok++; } }
      });
      // 内容ごとの×の割合を、次の回のために残す
      var weak = {};
      tagOrder.forEach(function (t) { if (t && byTag[t].n) weak[t] = Math.round((1 - byTag[t].ok / byTag[t].n) * 100) / 100; });
      var l = matomeLast();
      l.level = st.level; l.minutes = st.minutes; l.weak = weak; l.t = Date.now();
      sessSave('matome-last', l);
      var finished = n === items.length;
      var got = starLog('matome', { level: st.level, minutes: st.minutes, total: items.length, answered: n, correct: ok, finished: finished, seconds: Math.round(took / 1000) });
      matomeResult(main, st, { n: n, ok: ok, took: took, byTag: byTag, tagOrder: tagOrder, got: got, finished: finished });
    }
  }

  function matomeResult(main, st, R) {
    main.innerHTML = '';
    var box = h('section', 'mm-result');
    box.appendChild(h('div', 'done-msg', R.finished ? 'まとめモード おつかれさま！' : 'ここまで よくがんばったね！'));
    var score = h('div', 'mm-score');
    score.appendChild(h('span', 'mm-score-big', '○ ' + R.ok));
    score.appendChild(h('span', 'mm-score-of', ' / ' + st.items.length + '問'));
    box.appendChild(score);
    var meta = h('div', 'mm-meta');
    meta.appendChild(h('span', null, levelLabel(st.level) + '・' + st.minutes + '分コース'));
    meta.appendChild(h('span', null, 'かかった時間 ' + mmss(R.took)));
    if (R.n < st.items.length) meta.appendChild(h('span', null, 'のこした問題 ' + (st.items.length - R.n) + '問'));
    box.appendChild(meta);

    var tbl = h('div', 'mm-tags');
    tbl.appendChild(h('h2', 'mm-h', '内容ごとのできぐあい'));
    var weakNames = [];
    R.tagOrder.forEach(function (t) {
      var x = R.byTag[t];
      var row = h('div', 'mm-tag');
      row.appendChild(h('span', 'mm-tag-name', tagLabel(t)));
      var meter = h('span', 'mm-tag-meter');
      var fill = h('span', 'mm-tag-fill');
      var rate = x.n ? x.ok / x.n : 0;
      fill.style.width = Math.round(rate * 100) + '%';
      meter.appendChild(fill);
      row.appendChild(meter);
      row.appendChild(h('span', 'mm-tag-num', x.n ? x.ok + ' / ' + x.n : 'まだ'));
      if (x.n && rate < 0.7) { row.classList.add('weak'); weakNames.push(tagLabel(t)); }
      tbl.appendChild(row);
    });
    box.appendChild(tbl);
    box.appendChild(h('div', 'mm-weak', weakNames.length ? 'にがてな内容：' + weakNames.join('、') + '（次の回に少し多めに出るよ）' : 'にがてな内容は なかったよ。すばらしい！'));

    var gotBox = h('div', 'mm-got');
    gotBox.appendChild(h('h2', 'mm-h', 'もらった星'));
    var got = Array.isArray(R.got) ? R.got : [];
    if (got.length) {
      var ul = h('ul', 'mm-got-list');
      got.forEach(function (g) { ul.appendChild(h('li', null, (g && (g.label || g.name || g.id)) || '')); });
      gotBox.appendChild(ul);
    } else {
      gotBox.appendChild(h('p', 'mm-note', S.Stars ? 'こんかいは 新しい星はなかったよ。つぎもがんばろう！' : ''));
    }
    box.appendChild(gotBox);

    var row = h('div', 'matome-actions');
    row.appendChild(button('もう一回（同じレベル・時間）', 'primary', function () { startMatome(main, st.level, st.minutes); }));
    row.appendChild(button('レベル・時間をえらぶ', '', function () { matomeSetup(main); }));
    row.appendChild(link('ホームへ', 'btn', '#/'));
    box.appendChild(row);
    main.appendChild(box);
    window.scrollTo(0, 0);
  }

  /* ---------- 星のずかん（中身は Shosu.Stars：担当H） ---------- */
  function viewStars() {
    app.appendChild(topbar('星のずかん'));
    var main = h('main', 'stars-page');
    app.appendChild(main);
    if (!(S.Stars && S.Stars.mountCollection)) { main.appendChild(h('div', 'empty-note', '星のずかんは、じゅんび中です。')); return; }
    var hd = null;
    try { hd = S.Stars.mountCollection(main); }
    catch (e) { console.error('Stars.mountCollection', e); main.appendChild(h('div', 'empty-note', '星のずかんを表示できませんでした。')); }
    cleanups.push(function () { if (hd && hd.destroy) { try { hd.destroy(); } catch (e) { console.error(e); } } });
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
    rows.push({ key: 'matome', label: 'まとめモード' });
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
        if (sess() && sess().clearAll) { try { sess().clearAll(); } catch (e) { console.error(e); } }
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

  /* ともだちの問題の「作った人」：作った端末のID（up.aid）。aid の無い古いリンクは名前の絵から作る */
  function friendAuthorKey(up) { return up && up.aid ? 'd' + up.aid : authorKey(up && up.author); }
  /* 作った人の名前（手書き）から短い文字列を作る（aid の無い古いリンク用の代わり）。
     Share.encode と同じ間引き・丸め（長い辺を1023目）をした後の座標で計算するので、
     作ったときの絵・リンクから開いた絵・ボックスに入れた絵のどれでも同じ値になる。 */
  function authorKey(ink) {
    if (!ink || !Array.isArray(ink.strokes)) return '';
    var GRID = 1023;
    var W = Math.max(1, Math.round(ink.w || 1)), H = Math.max(1, Math.round(ink.h || 1)), M = Math.max(W, H);
    var gw = Math.round(W / M * GRID), gh = Math.round(H / M * GRID);
    var src = ink;
    try { if (S.Share && S.Share.simplify) src = S.Share.simplify(ink) || ink; } catch (e) { src = ink; }
    var hsh = 0x811c9dc5;
    function add(n) { hsh ^= n & 0xffff; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
    add(W); add(H);
    (src.strokes || []).forEach(function (st) {
      if (!Array.isArray(st) || !st.length) return;
      add(0xfffe);
      var lx = -1, ly = -1;
      st.forEach(function (p) {
        var x = Math.min(gw, Math.round(Math.min(Math.max(+p.x || 0, 0), W) / M * GRID));
        var y = Math.min(gh, Math.round(Math.min(Math.max(+p.y || 0, 0), H) / M * GRID));
        if (x === lx && y === ly) return;
        lx = x; ly = y;
        add(x); add(y);
      });
    });
    return 'a' + hsh.toString(36);
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
        onResult: function (r) {
          record('friend', pid, r);
          // 自分の端末で作った問題は「ともだちの問題」の星にしない
          var mine = !!(up && up.aid && sess() && sess().deviceId && up.aid === sess().deviceId());
          if (!mine) starLog('friend', { token: token, correct: !!(r && r.correct), authorKey: friendAuthorKey(up) });
        }
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
      else if (parts[0] === 'matome') viewMatome();
      else if (parts[0] === 'stars') viewStars();
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
  // 前からの記録も星に変える（起動時に1回）
  if (S.Stars && S.Stars.evaluate) { try { S.Stars.evaluate(); } catch (e) { console.error('Stars.evaluate', e); } }
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

  S.App = { route: route, UNIT_TITLE: UNIT_TITLE, APP_TITLE: APP_TITLE, authorKey: authorKey };
})(window.Shosu = window.Shosu || {});
