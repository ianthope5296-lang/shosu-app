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
    main.appendChild(homePlanSection());
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
    // おすすめモード（追加5）：まとめモードのすぐ上に、目立つ入口
    var osA = link('', 'osusume-entry', '#/osusume');
    osA.appendChild(osusumeIcon('osusume-entry-icon'));
    var osT = h('span', 'matome-entry-text');
    osT.appendChild(h('span', 'matome-entry-title', 'おすすめモード'));
    var osSub = 'きみの記録から、きみに合った問題を 毎回 組み立てるよ（5・10・15分）';
    if (validOsusume(sessLoad('osusume'))) osSub = 'とちゅうのところがあるよ。つづきから できるよ';
    osT.appendChild(h('span', 'matome-entry-sub', osSub));
    osA.appendChild(osT);
    osA.appendChild(arrows(h('span', 'matome-entry-go', 'スタート ▶')));
    mm.appendChild(osA);
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
    var c3t = h('span', null, 'もらったコードをひらく');
    c3t.appendChild(h('span', 'make-sub', 'ともだちの問題や、先生からのゴールのコードをはりつけよう'));
    c3.appendChild(c3t);
    mg.appendChild(c3);
    mk.appendChild(mg);
    main.appendChild(mk);

    var ex = h('section', 'home-extra');
    ex.appendChild(withIcon(link('', 'extra-link', '#/practice-write'), 'pen', '数字を書く練習（読み取りをためそう）'));
    ex.appendChild(withIcon(link('', 'extra-link small', '#/box'), 'dish', 'もんだいボックス（先生用）'));
    ex.appendChild(withIcon(link('', 'extra-link small', '#/rbox'), 'reflect', 'ふりかえりボックス（先生用）'));
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
        reportRetry: true,
        onResult: function (r) {
          if (stopped) return;
          // 問題の tag（ふくしゅうの分類）・skill（細かい技能）も記録する（ふりかえりの候補・おすすめ用。追加4・5）
          var tg = (it.p && it.p.tag) || it.tag || '';
          var sk = (it.p && it.p.skill) || it.skill || skillOfProblem(it.p);
          var rec = { correct: r && r.correct, method: r && r.method, hints: r && r.hints };
          if (tg) rec.tag = tg;
          if (sk) rec.skill = sk;
          if (it.p && it.p.type) rec.type = it.p.type;
          var est = estimateSec(it.p, opts.level);
          if (est) rec.est = est;
          if (r && 'ms' in r) rec.ms = r.ms;
          if (r && typeof r.first === 'boolean') rec.first = r.first;
          if (r && r.retried) rec.retried = true;
          if (r && r.retry) { rec.retry = true; record(key, it.pid, rec); return; } // やり直して○：記録に印をつけるだけ
          results[it.pid] = r;
          record(key, it.pid, rec);
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
      stop: function () { stopped = true; if (handle) handle.destroy(); handle = null; wrap.remove(); },
      pause: function () { if (handle && handle.pause) handle.pause(); },
      resume: function () { if (handle && handle.resume) handle.resume(); }
    };
  }

  function resultSummary(items, results) {
    var ok = 0, n = 0;
    items.forEach(function (it) { if (results[it.pid]) { n++; if (results[it.pid].correct) ok++; } });
    return h('div', 'summary-score', items.length + '問中 ○ が ' + ok + '問' + (n < items.length ? '（とばした問題 ' + (items.length - n) + '問）' : ''));
  }

  /* 問題の細かい技能と目安の時間（おすすめモードの分析用。追加5）。なければ undefined */
  function skillOfProblem(p) {
    if (!p || typeof p !== 'object') return undefined;
    var fns = [S.Recommend && S.Recommend.skillOf, S.Generators && S.Generators.skillOf];
    for (var i = 0; i < fns.length; i++) {
      if (typeof fns[i] !== 'function') continue;
      try { var v = fns[i](p); if (typeof v === 'string' && v) return v; } catch (e) { /* 判定できない */ }
    }
    return undefined;
  }
  function estimateSec(p, level) {
    if (!p || !(S.Matome && typeof S.Matome.estimate === 'function')) return undefined;
    try { var v = S.Matome.estimate(p, level || p.level || 'normal'); return typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v) : undefined; }
    catch (e) { return undefined; }
  }
  /* 「みる」を開いた記録（追加5：その子がどこまで進めているかの判断に使う）。同じ画面では1回だけ */
  var miruLogged = {};
  function miruOpened(no) {
    var k = routeGen + ':' + no;
    if (miruLogged[k]) return;
    miruLogged[k] = 1;
    record('miru', 'lesson-' + no, { at: new Date().toISOString() });
  }
  /* その時の「みる」の教材（lesson.demos / lesson.demo）を holder に出す。教材が2つ以上なら切りかえボタン */
  function mountLessonDemos(holder, lesson) {
    var demos = lesson.demos && lesson.demos.length ? lesson.demos : (lesson.demo ? [lesson.demo] : []);
    var cur = null;
    if (demos.length && S.Demos && S.Demos.mount) {
      var titles = {};
      (S.Demos.list ? S.Demos.list() : []).forEach(function (x) { titles[x.id] = x.title; });
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
    } else {
      holder.appendChild(h('div', 'empty-note', 'この時の「みる」は、じゅんび中です。'));
    }
    return { destroy: function () { try { if (cur && cur.destroy) cur.destroy(); } catch (e) {} cur = null; } };
  }

  /* ---------- 各時 ---------- */
  // tab: 'miru' | 'renshu'（#/lesson/N/renshu のように開く。おすすめモードのアドバイスのボタンから）
  function viewLesson(no, tab) {
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
      if (which === 'miru') miruOpened(lesson.no);
      if (which === 'miru' && !demoMounted) { demoMounted = true; mountDemo(); }
      if (which === 'renshu' && !practiceStarted) { practiceStarted = true; startPractice(); }
    }
    function mountDemo() {
      var holder = h('div', 'demo-holder');
      pMiru.appendChild(holder);
      var md = mountLessonDemos(holder, lesson);
      cleanups.push(function () { md.destroy(); });
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
    if (tab === 'miru' || tab === 'renshu') select(tab);
    else select(lesson.demo && !hasSession ? 'miru' : 'renshu');
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

  /* 時間を決めて問題を出す（まとめモード・おすすめモードで共通）。
     時間は「始めた時刻」と「それまでにかかった時間」で計算するので、タブをはなれてもずれない。
     アプリを閉じていた時間は数えない（つづきからで残り時間を引きつぐ）。
     cfg: { sessKey, recKey, label, cls, before(area前に置く要素), onAnswer(it, r, results, first), onFinish(took) }
     戻り値: { pause(), resume(), finish() } … pause の間は時間を止める（「みる」を重ねて開いている間など） */
  function runTimed(main, st, cfg) {
    main.innerHTML = '';
    var limit = st.minutes * 60000;
    var since = Date.now() - (st.elapsed || 0);
    var over = false, timer = null, lastSave = Date.now(), dlg = null, pausedAt = 0;
    var items = st.items;
    function elapsed() { return (pausedAt || Date.now()) - since; }

    var bar = h('div', 'mm-status' + (cfg.cls ? ' ' + cfg.cls : ''));
    bar.setAttribute('role', 'status');
    var lvEl = h('span', 'mm-st-level', cfg.label);
    var timeEl = h('span', 'mm-st-time');
    var leftEl = h('span', 'mm-st-left');
    var endB = button('ここでおわる', 'small mm-st-end', function () {
      confirmDialog('ここでおわりにして、結果を見ますか？', 'おわる', function () { finish(); });
    });
    endB.classList.remove('danger');
    bar.appendChild(lvEl); bar.appendChild(timeEl); bar.appendChild(leftEl); bar.appendChild(endB);
    main.appendChild(bar);
    if (cfg.before) main.appendChild(cfg.before);
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
      sessSave(cfg.sessKey, st);
    }
    function tick() {
      if (over) return;
      draw();
      if (!pausedAt && !st.timeUp && elapsed() >= limit) {
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
    var ctl = runSet(area, items, cfg.recKey, function () { finish(); }, {
      results: st.results, start: start < 0 ? 0 : start, level: cfg.level,
      onAnswer: function (it, r, results, first) {
        st.results = cleanResults(items, results);
        if (cfg.onAnswer) { try { cfg.onAnswer(it, r, results, first); } catch (e) { console.error(e); } }
        persist();
        draw();
      }
    });
    draw();
    tick();

    function finish() {
      if (over) return;
      if (pausedAt) { since += Date.now() - pausedAt; pausedAt = 0; }
      var took = elapsed();
      st.elapsed = took;
      over = true;
      stopTimer();
      if (ctl) ctl.stop();
      sessClear(cfg.sessKey);
      cfg.onFinish(took, answered());
    }
    return {
      pause: function () {
        if (over || pausedAt) return;
        pausedAt = Date.now();
        if (ctl && ctl.pause) ctl.pause();
        persist();
        draw();
      },
      resume: function () {
        if (over || !pausedAt) return;
        since += Date.now() - pausedAt;
        pausedAt = 0;
        if (ctl && ctl.resume) ctl.resume();
        persist();
        tick();
      },
      finish: finish
    };
  }

  function runMatome(main, st) {
    var items = st.items;
    runTimed(main, st, {
      sessKey: 'matome', recKey: 'matome', label: levelLabel(st.level) + '・' + st.minutes + '分', level: st.level,
      onFinish: function (took, n) {
        var res = st.results;
        var ok = 0;
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
    });
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

  /* ---------- おすすめモード（分析と組み立ては Shosu.Recommend：担当O。画面と記録はここ） ---------- */
  var OSU_TIMES = [5, 10, 15];
  var OSU_MIX = [{ id: 'few', label: '少なめ' }, { id: 'normal', label: 'ふつう' }, { id: 'many', label: '多め' }];
  var OSU_ACT_ICON = { textbook: 'reflect', miru: 'telescope', lesson: 'pen', review: 'moon' };
  function recoApi() { return S.Recommend && typeof S.Recommend.build === 'function' ? S.Recommend : null; }
  function recoCall(name, args, def) {
    var r = recoApi();
    if (!r || typeof r[name] !== 'function') return def;
    try { var v = r[name].apply(r, args || []); return v == null ? def : v; }
    catch (e) { console.error('Recommend.' + name, e); return def; }
  }
  function skillInfo(id) {
    var list = recoApi() && Array.isArray(S.Recommend.SKILLS) ? S.Recommend.SKILLS : [];
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function skillLabel(id) { var sk = skillInfo(id); return sk && sk.label ? sk.label : tagLabel(id); }
  function mixLabel(id) { var l = 'ふつう'; OSU_MIX.forEach(function (x) { if (x.id === id) l = x.label; }); return l; }
  // 前に選んだ時間・わりあい（Recommend.prefs があればそれを使う）
  function osuLast() {
    var p = recoCall('prefs', [], null);
    if (p && typeof p === 'object') return p;
    var v = sessLoad('osusume-last'); return v && typeof v === 'object' ? v : {};
  }
  function osuSetLast(o) {
    var r = recoApi();
    if (r && typeof r.setPrefs === 'function') { recoCall('setPrefs', [o], null); return; }
    sessSave('osusume-last', o);
  }
  function validOsusume(st) { return st && validItems(st.items) && typeof st.minutes === 'number'; }
  function lessonByNo(no) { var r = null; lessons().forEach(function (l) { if (String(l.no) === String(no)) r = l; }); return r; }
  function asStr(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
  function asList(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

  /* ホームの入口のアイコン（自作のSVG：ロケットが、目じるしの星に向かう航路） */
  function osusumeIcon(cls) {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic ' + (cls || ''));
    svg.innerHTML =
      '<path d="M8 54C18 50 22 40 30 36S46 30 52 16" fill="none" stroke="#9ff0d8" stroke-width="2.6" stroke-dasharray="3 4" stroke-linecap="round"/>' +
      '<circle cx="52" cy="14" r="9" fill="none" stroke="#ffd34d" stroke-width="2.4"/>' +
      '<circle cx="52" cy="14" r="4.2" fill="none" stroke="#ffd34d" stroke-width="2"/>' +
      '<path d="M52 7.5L53.6 12.4 58.5 14 53.6 15.6 52 20.5 50.4 15.6 45.5 14 50.4 12.4Z" fill="#fff4c2"/>' +
      '<g transform="translate(22 42) scale(1.5) rotate(40) translate(-22 -42)">' +
      '<path d="M22 30c4.6 3.6 6 9.6 4.4 17h-8.8C16 39.6 17.4 33.6 22 30z" fill="#eef2fa" stroke="#9aa8c8" stroke-width="1.2"/>' +
      '<path d="M22 30c2 1.5 3.4 3.5 4.1 6h-8.2c.7-2.5 2.1-4.5 4.1-6z" fill="#3fc6a0"/>' +
      '<circle cx="22" cy="40" r="2.4" fill="#4fa3f7" stroke="#3d5a80" stroke-width="1"/>' +
      '<path d="M17.6 43l-4 5v3l4.4-2.4zM26.4 43l4 5v3l-4.4-2.4z" fill="#3fc6a0"/>' +
      '<path d="M19.6 47.4c-1 3 0 5.6 2.4 7.4 2.4-1.8 3.4-4.4 2.4-7.4z" fill="#ffb42e"/>' +
      '</g>' +
      '<circle cx="10" cy="12" r="1.6" fill="#fff"/><circle cx="36" cy="8" r="1.2" fill="#fff"/><circle cx="58" cy="44" r="1.4" fill="#fff"/>';
    return svg;
  }

  function viewOsusume() {
    app.appendChild(topbar('おすすめモード', { sub: 'きみに合わせた れんしゅう' }));
    var main = h('main', 'mm osu');
    app.appendChild(main);
    if (!recoApi()) { main.appendChild(h('div', 'empty-note', 'おすすめモードは、じゅんび中です。')); return; }
    var st = sessLoad('osusume');
    if (validOsusume(st)) {
      var res = cleanResults(st.items, st.results);
      var at = firstOpen(st.items, res);
      if (at >= 0) {
        var left = st.minutes * 60000 - (st.elapsed || 0);
        resumePrompt(main, {
          msg: 'とちゅうのところがあるよ（' + (at + 1) + '問目から）',
          sub: 'おすすめ・' + st.minutes + '分　' + (left >= 0 ? 'のこり ' + mmss(left) : '時間をこえています'),
          onContinue: function () { st.results = res; runOsusume(main, st); },
          onRestart: function () { sessClear('osusume'); osuSetup(main); }
        });
        return;
      }
      sessClear('osusume');
    }
    osuSetup(main);
  }

  /* いまの きみの にがて・とくい（技能名を2〜3こずつ） */
  function osuProfileBox() {
    var pf = recoCall('profile', [], null);
    var weak = [], soso = [], strong = [];
    var sk = pf && pf.skills && typeof pf.skills === 'object' ? pf.skills : {};
    Object.keys(sk).forEach(function (id) {
      var x = sk[id] || {};
      var o = { id: id, acc: typeof x.acc === 'number' ? x.acc : 0.5 };
      if (x.status === 'weak') weak.push(o);
      else if (x.status === 'soso') soso.push(o);
      else if (x.status === 'strong') strong.push(o);
    });
    function byAcc(a, b) { return a.acc - b.acc; }
    weak.sort(byAcc); soso.sort(byAcc); strong.sort(function (a, b) { return b.acc - a.acc; });
    var nigate = weak.concat(soso).slice(0, 3);
    strong = strong.slice(0, 3);
    var box = h('div', 'osu-profile');
    box.appendChild(h('h2', 'mm-h', 'いまの きみの にがて・とくい'));
    function row(label, cls, list, none) {
      var r = h('div', 'osu-prof-row ' + cls);
      r.appendChild(h('span', 'osu-prof-label', label));
      var chips = h('span', 'osu-prof-chips');
      if (list.length) list.forEach(function (x) { chips.appendChild(h('span', 'osu-chip', skillLabel(x.id))); });
      else chips.appendChild(h('span', 'osu-prof-none', none));
      r.appendChild(chips);
      return r;
    }
    box.appendChild(row('にがて', 'weak', nigate, 'まだ 見つかっていないよ'));
    box.appendChild(row('とくい', 'strong', strong, 'これから 見つけよう'));
    if (!nigate.length && !strong.length) box.appendChild(h('p', 'mm-note', 'まだ 記録が少ないよ。問題をとくほど、きみに合った問題になるよ。'));
    return box;
  }

  function osuSetup(main) {
    main.innerHTML = '';
    var last = osuLast();
    var minutes = OSU_TIMES.indexOf(last.minutes) >= 0 ? last.minutes : 5;
    var weak = last.weak || 'normal', challenge = last.challenge || 'normal';
    var card = h('section', 'mm-setup osu-setup');
    card.appendChild(h('p', 'mm-lead', 'これまでの きみの記録から、きみに合った問題を 毎回 組み立てるよ。時間をえらんで「スタート」をおそう。'));
    card.appendChild(osuProfileBox());
    card.appendChild(h('h2', 'mm-h', '時間'));
    var tm = h('div', 'mm-choices osu-times');
    var tmBtns = OSU_TIMES.map(function (m) {
      var b = button('', 'mm-choice osu-time', function () { minutes = m; mark(); });
      b.appendChild(h('span', 'mm-choice-t', m + '分'));
      b.dataset.min = m;
      tm.appendChild(b);
      return b;
    });
    card.appendChild(tm);
    var mixBox = h('div', 'osu-mix');
    function mixRow(title, note, get, set) {
      var r = h('div', 'osu-mix-row');
      var t = h('div', 'osu-mix-title');
      t.appendChild(h('span', 'osu-mix-name', title));
      t.appendChild(h('span', 'osu-mix-note', note));
      r.appendChild(t);
      var g = h('div', 'osu-mix-btns');
      var bs = OSU_MIX.map(function (x) {
        var b = button(x.label, 'osu-mix-btn', function () { set(x.id); mark(); });
        b.dataset.id = x.id;
        g.appendChild(b);
        return b;
      });
      r.appendChild(g);
      mixBox.appendChild(r);
      return function () { bs.forEach(function (b) { var on = b.dataset.id === get(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); };
    }
    var m1 = mixRow('にがて', 'にがてな問題の多さ', function () { return weak; }, function (v) { weak = v; });
    var m2 = mixRow('ちょうせん', 'むずかしい問題の多さ', function () { return challenge; }, function (v) { challenge = v; });
    card.appendChild(mixBox);
    var foot = h('div', 'mm-foot');
    foot.appendChild(button('スタート ▶', 'primary mm-start osu-start', function () { osuPreview(main, { minutes: minutes, weak: weak, challenge: challenge }); }));
    card.appendChild(foot);
    main.appendChild(card);
    function mark() {
      tmBtns.forEach(function (b) { var on = Number(b.dataset.min) === minutes; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      m1(); m2();
    }
    mark();
    window.scrollTo(0, 0);
  }

  /* 組み立てて、始める前に「今日のおすすめ」を一言で見せる */
  function osuPreview(main, opt) {
    var built = recoCall('build', [{ minutes: opt.minutes, weak: opt.weak, challenge: opt.challenge }], null);
    var probs = built && Array.isArray(built.problems) ? built.problems.filter(function (p) { return p && typeof p === 'object' && p.type; }) : [];
    if (!probs.length) { toast('問題を作れませんでした'); return; }
    osuSetLast({ minutes: opt.minutes, weak: opt.weak, challenge: opt.challenge });
    // 始めたときの「にがて」の技能（星「にがてだった技能で全問○」に使う）
    var pf = recoCall('profile', [], null), weakSkills = [];
    if (pf && pf.skills) Object.keys(pf.skills).forEach(function (id) { if (pf.skills[id] && pf.skills[id].status === 'weak') weakSkills.push(id); });
    var stamp = Date.now().toString(36);
    var st = {
      minutes: opt.minutes, weak: opt.weak, challenge: opt.challenge, stamp: stamp,
      summary: asStr(built.summary), focus: asList(built.focus).map(asStr),
      weakSkills: weakSkills,
      items: probs.map(function (p, i) { return { p: p, pid: 'os-' + stamp + '-' + i, tag: p.tag || '', skill: p.skill || '', role: p.role || '' }; }),
      results: {}, meta: {}, missed: {}, mistakes: {}, elapsed: 0, timeUp: false
    };
    main.innerHTML = '';
    var card = h('section', 'mm-setup osu-preview');
    var hd = h('div', 'osu-today');
    hd.appendChild(osusumeIcon('osu-today-icon'));
    hd.appendChild(h('span', 'osu-today-label', '今日のおすすめ'));
    card.appendChild(hd);
    card.appendChild(h('p', 'osu-summary', st.summary || 'きみの記録に合わせて、いろいろな問題を出すよ。'));
    card.appendChild(h('p', 'osu-preview-meta', st.minutes + '分・約' + st.items.length + '問（にがて ' + mixLabel(st.weak) + '・ちょうせん ' + mixLabel(st.challenge) + '）'));
    var row = h('div', 'mm-foot osu-preview-row');
    row.appendChild(button('えらびなおす', 'osu-back', function () { osuSetup(main); }));
    row.appendChild(button('はじめる ▶', 'primary mm-start osu-go', function () {
      sessSave('osusume', st);
      runOsusume(main, st);
    }));
    card.appendChild(row);
    main.appendChild(card);
    window.scrollTo(0, 0);
  }

  function runOsusume(main, st) {
    st.meta = st.meta || {}; st.missed = st.missed || {}; st.mistakes = st.mistakes || {};
    var suggest = h('div', 'osu-suggest');
    suggest.hidden = true;
    var ctl = runTimed(main, st, {
      sessKey: 'osusume', recKey: 'osusume', label: 'おすすめ・' + st.minutes + '分', cls: 'osu-status', before: suggest,
      onAnswer: function (it, r) {
        var m = st.meta[it.pid] || {};
        if (typeof r.first === 'boolean') m.first = r.first;
        if (typeof r.ms === 'number' && !('ms' in m)) m.ms = r.ms;
        st.meta[it.pid] = m;
        var firstOk = typeof r.first === 'boolean' ? r.first : !!r.correct;
        // 最初の答えが×のとき（1問につき1回）、同じ技能のまちがいを数えて「みる」を案内する
        if (firstOk || st.missed[it.pid]) return;
        st.missed[it.pid] = 1;
        var sk = it.skill || (it.p && it.p.skill);
        if (!sk) return;
        st.mistakes[sk] = (st.mistakes[sk] || 0) + 1;
        var sg = recoCall('shouldSuggestMiru', [sk, st.mistakes[sk]], null);
        if (sg && sg.lesson && lessonByNo(sg.lesson)) showSuggest(sk, sg.lesson, sg.label);
      },
      onFinish: function (took, n) { osuFinish(main, st, took, n); }
    });
    function showSuggest(sk, no, label) {
      suggest.innerHTML = '';
      var tx = h('span', 'osu-suggest-text', '「' + skillLabel(sk) + '」で 2回 まちがえたよ。');
      suggest.appendChild(tx);
      var b = button('', 'primary osu-suggest-btn', function () { openMiruOverlay(no, ctl, function () { suggest.hidden = true; }); });
      withIcon(b, 'telescope', asStr(label) || '第' + no + '時の「みる」で確かめよう');
      suggest.appendChild(b);
      suggest.hidden = false;
    }
  }

  /* その時の「みる」を重ねて開く。見ている間は時間を止める。とじると、つづきにもどる */
  function openMiruOverlay(no, ctl, onClose) {
    var lesson = lessonByNo(no);
    if (!lesson) return;
    if (ctl && ctl.pause) ctl.pause();
    miruOpened(lesson.no);
    var back = h('div', 'osu-miru-back');
    var box = h('div', 'osu-miru');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', '第' + lesson.no + '時の「みる」');
    var head = h('div', 'osu-miru-head');
    var tt = h('div', 'osu-miru-title');
    tt.appendChild(h('span', 'osu-miru-no', '第' + lesson.no + '時の「みる」'));
    tt.appendChild(h('span', 'osu-miru-name', lesson.title || ''));
    head.appendChild(tt);
    head.appendChild(h('span', 'osu-miru-pause', '時間は 止まっているよ'));
    var close = button('とじて つづける ▶', 'primary osu-miru-close', shut);
    head.appendChild(close);
    box.appendChild(head);
    if (lesson.meate) {
      var m = h('div', 'meate');
      m.appendChild(h('span', 'meate-label', 'めあて'));
      m.appendChild(h('span', 'meate-text', lesson.meate));
      box.appendChild(m);
    }
    var holder = h('div', 'demo-holder osu-miru-body');
    box.appendChild(holder);
    var md = mountLessonDemos(holder, lesson);
    back.appendChild(box);
    document.body.appendChild(back);
    document.documentElement.classList.add('osu-miru-open');
    var done = false;
    function onKey(e) { if (e.key === 'Escape') shut(); }
    document.addEventListener('keydown', onKey);
    function remove() {
      if (done) return false;
      done = true;
      document.removeEventListener('keydown', onKey);
      md.destroy();
      back.remove();
      document.documentElement.classList.remove('osu-miru-open');
      return true;
    }
    function shut() {
      if (!remove()) return;
      if (ctl && ctl.resume) ctl.resume();
      if (onClose) onClose();
    }
    cleanups.push(remove);
    try { close.focus({ preventScroll: true }); } catch (e) {}
  }

  function osuFinish(main, st, took, n) {
    var items = st.items, res = st.results || {}, meta = st.meta || {};
    var ok = 0;
    items.forEach(function (it) {
      var r = res[it.pid];
      if (!r) return;
      if (r.correct) ok++;
    });
    var finished = n === items.length;
    var acc = n ? ok / n : 0;
    var perQ = n ? Math.round(took / n) : 0;
    var prev = recoCall('lastResult', [], null);
    // problems と results は同じ順（答えていない問題の結果は null）。advice の result（要約）に、出した問題すべてが入るように
    var adv = recoCall('advice', [{ problems: items.map(function (it) { return it.p; }), results: items.map(function (it) {
      var r = res[it.pid];
      if (!r) return null;
      var m = meta[it.pid] || {};
      return { correct: !!r.correct, first: typeof m.first === 'boolean' ? m.first : !!r.correct, ms: typeof m.ms === 'number' ? m.ms : null, hints: r.hints || 0 };
    }), prev: prev, minutes: st.minutes, focus: st.focus || [], total: items.length, took: took }], null);
    // 前の回より、正答率も1問の時間もよくなった
    var improved = !!(finished && n >= 3 && prev && typeof prev.acc === 'number' && typeof prev.perQ === 'number' && prev.perQ > 0 &&
      acc >= prev.acc && (acc > prev.acc || acc === 1) && perQ < prev.perQ);
    // にがてだった技能で、1回の中の問題が全問○
    var weakSet = {};
    (st.weakSkills && st.weakSkills.length ? st.weakSkills : []).forEach(function (s) { weakSet[s] = 1; });
    if (!Object.keys(weakSet).length) items.forEach(function (it) { if (it.role === 'weak' && it.skill) weakSet[it.skill] = 1; });
    var bySkill = {};
    items.forEach(function (it) {
      var sk = it.skill || (it.p && it.p.skill);
      if (!sk || !weakSet[sk]) return;
      var b = bySkill[sk] || (bySkill[sk] = { total: 0, ok: 0 });
      b.total++;
      if (res[it.pid] && res[it.pid].correct) b.ok++;
    });
    var allWeak = Object.keys(bySkill).some(function (k) { return bySkill[k].total > 0 && bySkill[k].ok === bySkill[k].total; });
    // Recommend.advice が星の判定のもと（stars）を返すときは、そちらを使う
    if (adv && adv.stars && typeof adv.stars === 'object') {
      if (typeof adv.stars.allCorrectWeakSkill === 'boolean') allWeak = adv.stars.allCorrectWeakSkill;
      if (typeof adv.stars.improved === 'boolean') improved = finished && adv.stars.improved;
    }
    var result = {
      v: 1, at: new Date().toISOString(), minutes: st.minutes, weak: st.weak, challenge: st.challenge,
      total: items.length, answered: n, correct: ok, acc: Math.round(acc * 1000) / 1000, perQ: perQ, took: took, finished: finished,
      focus: st.focus || [], summary: st.summary || '',
      problems: items.map(function (it) { return it.p; }),
      results: items.map(function (it) {
        var r = res[it.pid];
        if (!r) return null;
        var m = meta[it.pid] || {};
        return { correct: !!r.correct, first: typeof m.first === 'boolean' ? m.first : !!r.correct, ms: typeof m.ms === 'number' ? m.ms : null, hints: r.hints || 0 };
      })
    };
    // advice が要約（result）を返すときは、それをそのまま保存する
    recoCall('saveResult', [adv && adv.result && typeof adv.result === 'object' ? adv.result : result], null);
    var got = starLog('recommend', { finished: finished, minutes: st.minutes, total: items.length, answered: n, correct: ok,
      allCorrectWeakSkill: allWeak, improved: improved, seconds: Math.round(took / 1000) });
    osuResult(main, st, { n: n, ok: ok, took: took, adv: adv, got: got, finished: finished, prev: prev, acc: acc, perQ: perQ });
  }

  function osuAction(a) {
    if (!a || typeof a !== 'object') return null;
    var kind = asStr(a.kind), label = asStr(a.label) || ({ textbook: '教科書を見直そう', miru: '「みる」で確かめよう', lesson: 'れんしゅうをやり直そう', review: 'ふくしゅうをしよう' })[kind] || '';
    if (!label) return null;
    var href = asStr(a.href);
    var tab = a.tab === 'miru' || a.tab === 'renshu' ? a.tab : (kind === 'lesson' ? 'renshu' : kind === 'miru' ? 'miru' : '');
    if (tab && /^#\/lesson\/\d+$/.test(href)) href += '/' + tab;
    var el;
    if (href && /^#\//.test(href)) el = link('', 'btn osu-act osu-act-' + kind, href);
    else el = h('span', 'osu-act osu-act-' + kind + ' osu-act-plain');
    if (OSU_ACT_ICON[kind]) withIcon(el, OSU_ACT_ICON[kind], label); else el.textContent = label;
    return el;
  }

  function osuResult(main, st, R) {
    main.innerHTML = '';
    var adv = R.adv && typeof R.adv === 'object' ? R.adv : {};
    var box = h('section', 'mm-result osu-result');
    box.appendChild(h('div', 'done-msg', R.finished ? 'おすすめモード おつかれさま！' : 'ここまで よくがんばったね！'));
    var score = h('div', 'mm-score');
    score.appendChild(h('span', 'mm-score-big', '○ ' + R.ok));
    score.appendChild(h('span', 'mm-score-of', ' / ' + st.items.length + '問'));
    box.appendChild(score);
    var meta = h('div', 'mm-meta');
    meta.appendChild(h('span', null, 'おすすめ・' + st.minutes + '分コース'));
    meta.appendChild(h('span', null, 'かかった時間 ' + mmss(R.took)));
    if (R.n) meta.appendChild(h('span', null, '1問 平均 ' + Math.max(1, Math.round(R.perQ / 1000)) + '秒'));
    if (R.n < st.items.length) meta.appendChild(h('span', null, 'のこした問題 ' + (st.items.length - R.n) + '問'));
    box.appendChild(meta);

    var compare = asList(adv.compare).map(asStr).filter(Boolean);
    if (compare.length) {
      var cp = h('div', 'osu-compare');
      compare.forEach(function (t) { cp.appendChild(h('div', 'osu-compare-item', t)); });
      box.appendChild(cp);
    }
    var praise = asList(adv.praise).map(asStr).filter(Boolean);
    if (praise.length) {
      var pr = h('div', 'osu-praise');
      pr.appendChild(h('h2', 'mm-h', 'よくできたね'));
      praise.forEach(function (t) {
        var p = h('div', 'osu-praise-item');
        var ic = iconEl('star', 'osu-praise-icon');
        if (ic) p.appendChild(ic);
        p.appendChild(h('span', null, t));
        pr.appendChild(p);
      });
      box.appendChild(pr);
    }
    var improve = asList(adv.improve).filter(function (x) { return x && typeof x === 'object'; });
    if (improve.length) {
      var im = h('div', 'osu-improve');
      im.appendChild(h('h2', 'mm-h', 'つぎに やってみよう'));
      improve.forEach(function (x) {
        var card = h('div', 'osu-imp');
        var t = h('div', 'osu-imp-text');
        if (x.skill) t.appendChild(h('span', 'osu-chip', skillLabel(asStr(x.skill))));
        t.appendChild(h('span', 'osu-imp-msg', asStr(x.text)));
        card.appendChild(t);
        var acts = h('div', 'osu-imp-acts');
        asList(x.actions).forEach(function (a) { var e = osuAction(a); if (e) acts.appendChild(e); });
        if (acts.firstChild) card.appendChild(acts);
        im.appendChild(card);
      });
      box.appendChild(im);
    }
    if (!compare.length && !praise.length && !improve.length) {
      box.appendChild(h('p', 'mm-note', R.n ? 'つぎの おすすめモードでも、きみに合わせた問題を出すよ。' : '問題をといたら、アドバイスが出るよ。'));
    }
    var next = asStr(adv.next);
    if (next) {
      var nx = h('div', 'osu-next');
      var nic = iconEl('rocket', 'osu-next-icon');
      if (nic) nx.appendChild(nic);
      nx.appendChild(h('span', null, next));
      box.appendChild(nx);
    }

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
    row.appendChild(button('もう一回（同じせってい）', 'primary', function () { osuPreview(main, { minutes: st.minutes, weak: st.weak, challenge: st.challenge }); }));
    row.appendChild(button('時間などをえらぶ', '', function () { osuSetup(main); }));
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

    main.appendChild(teacherGoalCard());
    main.appendChild(teacherRboxCard());

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
    rows.push({ key: 'osusume', label: 'おすすめモード' });
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
    var pc = planCounts();
    sec3.appendChild(h('p', 'tnote rec-plan', '計画・ふりかえり：今日の計画を立てた日 ' + pc.plans + '日　／　ふりかえりを書いた日 ' + pc.refl + '日'));
    sec3.appendChild(button('記録をすべて消す', 'danger', function () {
      var back = h('div', 'modal-back');
      var box = h('div', 'modal');
      box.setAttribute('role', 'dialog');
      box.appendChild(h('div', 'modal-msg', 'この端末の記録をすべて消します。もとにもどせません。よろしいですか？'));
      var lab = h('label', 'modal-check');
      var cb = h('input');
      cb.type = 'checkbox';
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' 計画・ふりかえりのとちゅうの記録（地図・今日の計画・書いたふりかえり）も消す（ゴールは残します）'));
      box.appendChild(lab);
      var row = h('div', 'modal-row');
      row.appendChild(button('やめる', '', function () { back.remove(); }));
      row.appendChild(button('消す', 'danger', function () {
        back.remove();
        if (store()) store().resetAll();
        if (sess() && sess().clearAll) { try { sess().clearAll(); } catch (e) { console.error(e); } }
        lsDel('shosu.recommend'); // おすすめモードの結果・最近出した問題・選んだ時間（追加5）
        if (cb.checked) resetPlanProgress();
        toast(cb.checked ? '記録と、計画・ふりかえりの記録を消しました' : '記録を消しました');
        route();
      }));
      box.appendChild(row);
      back.appendChild(box);
      document.body.appendChild(back);
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

  /* #/open：もらったコード（問題・ゴール・ふりかえり）をはりつけて開く。種類は自動で見分ける */
  var KIND_ROUTE = { problem: '#/q/', goal: '#/g/', reflection: '#/r/' };
  function viewOpen() {
    app.appendChild(topbar('もらったコードをひらく'));
    var main = h('main', 'box');
    app.appendChild(main);
    var sec = h('section', 'tcard');
    sec.appendChild(h('h2', null, 'リンクやコードをはりつけよう'));
    sec.appendChild(h('p', 'tnote', 'Teams や Classroom で送られてきたリンクやコード（「しょうすうもんだい #/q/…」「しょうすうゴール #/g/…」など）をコピーして、下にはりつけてね。ともだちの問題か、先生からのゴールかは、アプリが見分けるよ。'));
    var ta = h('textarea', 'box-paste');
    ta.setAttribute('aria-label', 'リンクやコードをはりつける');
    ta.placeholder = 'ここにはりつけ（Ctrl + V）';
    sec.appendChild(ta);
    var row = h('div', 'box-row');
    var msg = h('span', 'box-msg');
    msg.setAttribute('role', 'status');
    row.appendChild(button('ひらく', 'primary', function () {
      var sh = shareApi();
      var toks = (sh && sh.extractTokens) ? sh.extractTokens(ta.value || '') : [];
      var kind = null, tok = null;
      for (var i = 0; i < toks.length && !kind; i++) {
        var k = sh.kindOf ? sh.kindOf(toks[i]) : 'problem';
        if (k && KIND_ROUTE[k]) { kind = k; tok = toks[i]; }
      }
      if (!kind) {
        msg.textContent = /(?:#|%23)\/[qgr]\//i.test(ta.value || '') ? 'とちゅうで切れているみたい。もう一度コピーしてね。' : 'リンクやコードが見つからなかったよ。';
        msg.className = 'box-msg warn';
        return;
      }
      location.hash = KIND_ROUTE[kind] + tok;
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

  /* ==========================================================
   * 追加4：じぶんで計画・ふりかえり・ゴール（担当N：つなぎ）
   *   Shosu.Planner（担当L）・Shosu.Reflect（担当M）が無いときは、その画面だけ「じゅんび中」にする。
   * ========================================================== */
  var GOAL_KEY = 'shosu.goal';
  var WDAY = ['日', '月', '火', '水', '木', '金', '土'];
  var CLASS_MINUTES = [15, 20, 30, 45];
  function planner() { return S.Planner || null; }
  function reflectApi() { return S.Reflect || null; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return ymd(new Date()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function addDaysStr(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function diffDaysStr(a, b) { return Math.round((parseYmd(b) - parseYmd(a)) / 86400000); }
  function dateJa(s, withWday) {
    var d = parseYmd(s);
    if (!d) return String(s || '');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日' + (withWday ? '（' + WDAY[d.getDay()] + '）' : '');
  }
  function lsGet(k) { try { return window.localStorage ? window.localStorage.getItem(k) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (window.localStorage) { window.localStorage.setItem(k, v); return true; } } catch (e) {} return false; }
  function lsDel(k) { try { if (window.localStorage) window.localStorage.removeItem(k); } catch (e) {} }

  // ゴール：ふだんは Planner。無いときは 'shosu.goal' を直接読み書きする（あとで Planner が読む）
  function currentGoal() {
    var p = planner();
    if (p && p.goal) { try { return p.goal() || null; } catch (e) { console.error('Planner.goal', e); return null; } }
    try { var g = JSON.parse(lsGet(GOAL_KEY) || 'null'); return g && typeof g === 'object' ? g : null; } catch (e) { return null; }
  }
  function saveGoal(goal) {
    var p = planner();
    if (p && p.setGoal) { try { p.setGoal(goal); return true; } catch (e) { console.error('Planner.setGoal', e); } }
    return lsSet(GOAL_KEY, JSON.stringify(goal));
  }
  function goalValid(g) {
    if (!g || typeof g !== 'object') return false;
    var sh = shareApi();
    if (sh && sh.validateGoal) { try { return sh.validateGoal(g).ok; } catch (e) { return false; } }
    return !!(g.name && g.date);
  }
  // ゴール入りのアプリ（window.SHOSU_PRESET.goal）。Planner があれば Planner が自分で入れる。無いときだけここで入れる
  function applyPresetGoal() {
    if (planner()) return;
    var pg = window.SHOSU_PRESET && window.SHOSU_PRESET.goal;
    if (!goalValid(pg)) return;
    var cur = currentGoal();
    if (!cur || String(pg.created || '') > String(cur.created || '')) saveGoal(pg);
  }
  function goalLine(g) {
    if (!g) return '';
    var left = diffDaysStr(todayStr(), g.date);
    var s = g.name + '（' + dateJa(g.date, true) + '）';
    if (left > 0) s += '　あと ' + left + '日';
    else if (left === 0) s += '　きょう！';
    return s;
  }
  function classesLine(g) {
    var cls = (g && g.classes) || [];
    if (!cls.length) return '授業の予定：なし';
    var mins = {};
    cls.forEach(function (c) { mins[c.minutes] = 1; });
    return '授業の予定：' + cls.length + '回（' + Object.keys(mins).map(function (m) { return m + '分'; }).join('・') + '）';
  }

  /* コピー（クリップボード。だめなら選んだ状態の文を出す） */
  function copyText(text, box, okMsg) {
    function fallback() {
      if (!box) { toast('コピーできませんでした'); return; }
      box.innerHTML = '';
      box.hidden = false;
      box.appendChild(h('p', 'tnote', 'うまくコピーできませんでした。下の文がえらばれているので、Ctrl＋C でコピーしてください。'));
      var ta = h('textarea', 'code-out');
      ta.value = text; ta.readOnly = true; ta.rows = 3;
      ta.addEventListener('focus', function () { ta.select(); });
      box.appendChild(ta);
      setTimeout(function () { try { ta.focus(); ta.select(); } catch (e) {} }, 30);
    }
    var cb = navigator.clipboard;
    if (cb && cb.writeText) {
      cb.writeText(text).then(function () {
        toast('コピーしました');
        if (box) {
          box.innerHTML = '';
          box.hidden = false;
          box.appendChild(h('p', 'tnote', okMsg || 'コピーしました'));
          var ta = h('textarea', 'code-out');
          ta.value = text; ta.readOnly = true; ta.rows = 2;
          box.appendChild(ta);
        }
      }, fallback);
    } else fallback();
  }

  /* 計画・ふりかえりの画面（中身は Planner / Reflect が作る） */
  function mountInto(title, sub, api, fn, args, cls) {
    app.appendChild(topbar(title, sub ? { sub: sub } : null));
    var main = h('main', 'plan-host ' + (cls || ''));
    app.appendChild(main);
    if (!(api && typeof api[fn] === 'function')) {
      main.appendChild(h('div', 'empty-note', 'この画面は、じゅんび中です。'));
      main.appendChild(link('ホームへ', 'btn primary', '#/'));
      return;
    }
    var hd = null;
    try { hd = api[fn].apply(api, [main].concat(args || [])); }
    catch (e) { console.error(fn, e); main.appendChild(h('div', 'empty-note', '画面を表示できませんでした。')); }
    cleanups.push(function () { if (hd && hd.destroy) { try { hd.destroy(); } catch (e) { console.error(e); } } });
  }
  function viewPlan(sub) {
    if (sub === 'today') mountInto('今日の計画', null, planner(), 'mountToday', [], 'plan-today');
    else mountInto('じぶんで計画', '星の航路の地図', planner(), 'mountRoadmap', [], 'plan-map');
  }
  function viewReflect(date) {
    var d = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayStr();
    mountInto('ふりかえり', dateJa(d, true), reflectApi(), 'mountYWT', [d], 'reflect-ywt');
  }
  function viewRbox() { mountInto('ふりかえりボックス', '先生用', reflectApi(), 'mountBox', [], 'reflect-box'); }

  /* #/g/<token>：ゴールのコード */
  function viewGoalCode(token) {
    var gen = routeGen;
    app.appendChild(h('div', 'q-loading', 'ゴールのコードをひらいています…'));
    var sh = shareApi();
    var p = sh && sh.decodeGoal ? Promise.resolve().then(function () { return sh.decodeGoal(token); }) : Promise.reject(new Error('Share がありません'));
    p.then(function (goal) {
      if (gen !== routeGen) return;
      app.innerHTML = '';
      var before = currentGoal();
      var same = before && before.id === goal.id && String(before.created || '') === String(goal.created || '');
      var saved = saveGoal(goal);
      app.appendChild(topbar('ゴールのコード'));
      var main = h('main', 'goal-in');
      var card = h('section', 'goal-card');
      card.appendChild(iconEl('goal', 'goal-card-icon') || h('span'));
      var tx = h('div', 'goal-card-text');
      tx.appendChild(h('div', 'goal-card-head', saved ? (same ? 'このゴールは、もう入っています' : 'ゴールが入りました') : 'ゴールを保存できませんでした'));
      tx.appendChild(h('div', 'goal-card-name', goal.name + '　' + dateJa(goal.date, true)));
      tx.appendChild(h('div', 'goal-card-sub', classesLine(goal)));
      if (before && !same) tx.appendChild(h('div', 'goal-card-sub', '前のゴール（' + (before.name || '') + '）と入れかえました。星や記録はそのままです。'));
      card.appendChild(tx);
      main.appendChild(card);
      var row = h('div', 'goal-row');
      row.appendChild(link('じぶんで計画を立てる ▶', 'btn primary big', '#/plan'));
      row.appendChild(link('ホームへ', 'btn', '#/'));
      main.appendChild(row);
      app.appendChild(main);
    }, function (e) {
      if (gen !== routeGen) return;
      console.warn('ゴールのコードを開けませんでした', e && e.message);
      app.innerHTML = '';
      codeError('ゴールのコード', 'このゴールのコードは開けませんでした');
    });
  }
  function codeError(title, msg) {
    app.appendChild(topbar(title));
    var m = h('main', 'q-error');
    m.appendChild(h('div', 'qe-msg', msg));
    m.appendChild(h('p', 'tnote', 'コードがとちゅうで切れているかもしれません。もう一度コピーして、ホームの「もらったコードをひらく」にはりつけてください。'));
    m.appendChild(link('ホームへ', 'btn primary', '#/'));
    app.appendChild(m);
  }

  /* #/r/<token>：ふりかえりのコード（先生用に表示して、ふりかえりボックスに入れる） */
  var EVAL_LABEL = { double: 'よくできた', single: 'できた', triangle: 'もう少し' };
  function evalMark(ev) {
    var w = h('span', 'eval-mark eval-' + ev);
    if (S.Icons && S.Icons.has && S.Icons.has('ev-' + ev)) w.innerHTML = S.Icons.get('ev-' + ev);
    w.appendChild(h('span', 'eval-label', EVAL_LABEL[ev] || ''));
    return w;
  }
  function reflBlock(title, texts, ink) {
    var b = h('div', 'rcode-block');
    b.appendChild(h('h3', null, title));
    if (texts && texts.length) {
      var ul = h('ul', 'rcode-list');
      texts.forEach(function (t) { ul.appendChild(h('li', null, t)); });
      b.appendChild(ul);
    }
    if (ink && ink.strokes && ink.strokes.length) b.appendChild(inkNode(ink, { width: 560, trim: true, lineWidth: 4, label: title + '（手書き）' }));
    if ((!texts || !texts.length) && !(ink && ink.strokes && ink.strokes.length)) b.appendChild(h('p', 'tnote', '（なし）'));
    return b;
  }
  function viewReflCode(token) {
    var gen = routeGen;
    app.appendChild(h('div', 'q-loading', 'ふりかえりのコードをひらいています…'));
    var sh = shareApi();
    var p = sh && sh.decodeReflection ? Promise.resolve().then(function () { return sh.decodeReflection(token); }) : Promise.reject(new Error('Share がありません'));
    p.then(function (r) {
      if (gen !== routeGen) return;
      app.innerHTML = '';
      app.appendChild(topbar('ふりかえりのコード', { sub: '先生用' }));
      var main = h('main', 'rcode');
      var card = h('section', 'tcard rcode-card');
      var hd = h('div', 'rcode-head');
      if (r.name && r.name.strokes && r.name.strokes.length) hd.appendChild(inkNode(r.name, { height: 56, trim: true, lineWidth: 4, label: '名前（手書き）' }));
      else hd.appendChild(h('span', 'rcode-noname', '（名前なし）'));
      hd.appendChild(h('span', 'rcode-date', dateJa(r.date, true)));
      if (r.w && r.w.eval) hd.appendChild(evalMark(r.w.eval));
      card.appendChild(hd);
      card.appendChild(reflBlock('めあて', r.meate && r.meate.choices, r.meate && r.meate.ink));
      card.appendChild(reflBlock('Y　やったこと', [].concat((r.y && r.y.auto) || [], (r.y && r.y.extra) || []), null));
      card.appendChild(reflBlock('W　わかったこと・できたこと', r.w && r.w.choices, r.w && r.w.ink));
      card.appendChild(reflBlock('T　次にやりたいこと', r.t && r.t.choices, r.t && r.t.ink));
      main.appendChild(card);
      var row = h('div', 'goal-row');
      var msg = h('span', 'box-msg');
      msg.setAttribute('role', 'status');
      var rf = reflectApi();
      var addB = button('ふりかえりボックスに入れる', 'primary', function () {
        if (!(rf && rf.boxAdd)) { msg.textContent = 'ふりかえりボックスは、じゅんび中です。'; msg.className = 'box-msg warn'; return; }
        var res = null;
        try { res = rf.boxAdd([r]); } catch (e) { console.error('Reflect.boxAdd', e); }
        if (!res || res.ok === false) { msg.textContent = '保存できませんでした。'; msg.className = 'box-msg warn'; return; }
        msg.textContent = res.added ? 'ふりかえりボックスに入れました。' : res.updated ? '同じ子の同じ日のふりかえりを、新しいものにしました。' : 'もう入っています。';
        msg.className = 'box-msg';
        addB.disabled = true;
      });
      row.appendChild(addB);
      row.appendChild(link('ふりかえりボックスを開く ▶', 'btn', '#/rbox'));
      row.appendChild(msg);
      main.appendChild(row);
      app.appendChild(main);
    }, function (e) {
      if (gen !== routeGen) return;
      console.warn('ふりかえりのコードを開けませんでした', e && e.message);
      app.innerHTML = '';
      codeError('ふりかえりのコード', 'このふりかえりのコードは開けませんでした');
    });
  }

  /* ---------- 先生：ゴールを決める（#/teacher/goal） ---------- */
  function newGoalId() { return 'g-' + Date.now().toString(36); }
  function viewGoalEdit() {
    app.appendChild(topbar('ゴールを決める', { sub: '先生用' }));
    var main = h('main', 'teacher goal-edit');
    app.appendChild(main);
    main.appendChild(link('◀ 先生メニュー', 'btn small', '#/teacher'));
    var cur = currentGoal();
    var today = todayStr();
    var picked = {};      // date -> {lesson, note}
    var minutes = 20;
    if (cur) {
      (cur.classes || []).forEach(function (c) { picked[c.date] = { lesson: c.lesson || null, note: c.note || '' }; });
      if (cur.classes && cur.classes[0] && CLASS_MINUTES.indexOf(cur.classes[0].minutes) >= 0) minutes = cur.classes[0].minutes;
    }

    var sec = h('section', 'tcard');
    sec.appendChild(h('h2', null, 'ゴール'));
    var f1 = h('label', 'ge-field');
    f1.appendChild(h('span', 'ge-label', 'ゴールの名前'));
    var name = h('input', 'ge-input');
    name.type = 'text'; name.maxLength = 30; name.placeholder = '例：小数のテスト';
    name.value = cur ? cur.name : '小数のテスト';
    f1.appendChild(name);
    sec.appendChild(f1);
    var f2 = h('label', 'ge-field');
    f2.appendChild(h('span', 'ge-label', '日にち'));
    var date = h('input', 'ge-input ge-date');
    date.type = 'date'; date.min = today; date.max = addDaysStr(today, 119);
    date.value = cur && cur.date >= today ? cur.date : addDaysStr(today, 7);
    f2.appendChild(date);
    sec.appendChild(f2);
    main.appendChild(sec);

    var sec2 = h('section', 'tcard');
    sec2.appendChild(h('h2', null, '授業の予定'));
    sec2.appendChild(h('p', 'tnote', 'ゴールまでの算数の授業の日をタップしてえらびます。子どもの「じぶんで計画」の地図で、授業の日として使われます。'));
    var mrow = h('div', 'ge-minutes');
    mrow.appendChild(h('span', 'ge-label', '1回の授業でアプリを使える時間'));
    var mBtns = CLASS_MINUTES.map(function (m) {
      var b = button(m + '分', 'seg-btn', function () { minutes = m; markMin(); });
      b.dataset.m = m;
      mrow.appendChild(b);
      return b;
    });
    function markMin() { mBtns.forEach(function (b) { var on = +b.dataset.m === minutes; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); }
    markMin();
    sec2.appendChild(mrow);
    var tools = h('div', 'ge-tools');
    tools.appendChild(button('平日をぜんぶえらぶ', 'small', function () {
      eachDay(function (d) { var w = parseYmd(d).getDay(); if (w >= 1 && w <= 5 && !picked[d]) picked[d] = { lesson: null, note: '' }; });
      draw();
    }));
    tools.appendChild(button('ぜんぶはずす', 'small', function () { picked = {}; draw(); }));
    sec2.appendChild(tools);
    var cal = h('div', 'ge-cal');
    cal.setAttribute('role', 'group');
    cal.setAttribute('aria-label', '授業の日のカレンダー');
    sec2.appendChild(cal);
    var listH = h('h3', 'ge-h3', '授業の日ごとの内容（入れなくてもよい）');
    sec2.appendChild(listH);
    var list = h('div', 'ge-list');
    sec2.appendChild(list);
    main.appendChild(sec2);

    var sec3 = h('section', 'tcard');
    var save = button('保存する', 'primary big', doSave);
    var msg = h('span', 'box-msg');
    msg.setAttribute('role', 'status');
    sec3.appendChild(save);
    sec3.appendChild(msg);
    sec3.appendChild(h('p', 'tnote', '保存すると、この端末にもゴールが入ります。子どもには、先生メニューの「ゴールのコードをコピー」か「ゴール入りのアプリをダウンロード」で配ります。'));
    main.appendChild(sec3);

    function startDay() {
      var s = today;
      Object.keys(picked).forEach(function (d) { if (d < s) s = d; });
      return s;
    }
    function goalDate() { return parseYmd(date.value) ? date.value : null; }
    function eachDay(fn) {
      var g = goalDate();
      if (!g) return;
      for (var d = startDay(), n = 0; d <= g && n < 200; d = addDaysStr(d, 1), n++) fn(d);
    }
    function draw() {
      var g = goalDate();
      cal.innerHTML = '';
      Object.keys(picked).forEach(function (d) { if (!g || d > g) delete picked[d]; });
      if (!g) { cal.appendChild(h('p', 'tnote warn', '先に日にちを入れてください。')); drawList(); return; }
      WDAY.forEach(function (w, i) { cal.appendChild(h('div', 'ge-wd' + (i === 0 ? ' sun' : i === 6 ? ' sat' : ''), w)); });
      var s = startDay();
      var first = parseYmd(s);
      for (var k = 0; k < first.getDay(); k++) cal.appendChild(h('div', 'ge-day empty'));
      eachDay(function (d) {
        var dt = parseYmd(d), w = dt.getDay();
        var on = !!picked[d], isGoal = d === g;
        var b = h('button', 'ge-day' + (on ? ' on' : '') + (isGoal ? ' goal' : '') + (w === 0 ? ' sun' : w === 6 ? ' sat' : '') + (d === today ? ' today' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', on);
        b.setAttribute('aria-label', dateJa(d, true) + (isGoal ? '（ゴール）' : '') + (on ? '　授業あり' : ''));
        b.dataset.date = d;
        b.appendChild(h('span', 'ge-day-n', dt.getDate() === 1 || d === s ? (dt.getMonth() + 1) + '/' + dt.getDate() : String(dt.getDate())));
        if (isGoal) {
          var gi = iconEl('goal', 'ge-day-goal');
          if (gi) b.appendChild(gi);
          b.appendChild(h('span', 'ge-day-tag', 'ゴール'));
        } else if (on) b.appendChild(h('span', 'ge-day-tag', '授業'));
        b.addEventListener('click', function () {
          if (picked[d]) delete picked[d]; else picked[d] = { lesson: null, note: '' };
          draw();
        });
        cal.appendChild(b);
      });
      drawList();
    }
    function drawList() {
      list.innerHTML = '';
      var ds = Object.keys(picked).sort();
      listH.hidden = !ds.length;
      if (!ds.length) { list.appendChild(h('p', 'tnote', 'まだ授業の日がえらばれていません（えらばなくても保存できます）。')); return; }
      ds.forEach(function (d) {
        var row = h('div', 'ge-row');
        row.appendChild(h('span', 'ge-row-date', dateJa(d, true)));
        var sel = h('select', 'ge-sel');
        sel.setAttribute('aria-label', dateJa(d) + 'の第○時');
        var o0 = h('option', null, '第○時：入れない'); o0.value = ''; sel.appendChild(o0);
        var ls = lessons();
        var nMax = ls.length || 10;
        for (var n = 1; n <= nMax; n++) {
          var lt = ls[n - 1] && ls[n - 1].title ? '第' + n + '時　' + ls[n - 1].title : '第' + n + '時';
          var o = h('option', null, lt); o.value = String(n); sel.appendChild(o);
        }
        sel.value = picked[d].lesson ? String(picked[d].lesson) : '';
        sel.addEventListener('change', function () { picked[d].lesson = sel.value ? +sel.value : null; });
        row.appendChild(sel);
        var note = h('input', 'ge-note');
        note.type = 'text'; note.maxLength = 40; note.placeholder = '内容のメモ（任意）';
        note.setAttribute('aria-label', dateJa(d) + 'の内容のメモ');
        note.value = picked[d].note || '';
        note.addEventListener('input', function () { picked[d].note = note.value; });
        row.appendChild(note);
        row.appendChild(button('はずす', 'small', function () { delete picked[d]; draw(); }));
        list.appendChild(row);
      });
    }
    date.addEventListener('change', draw);
    draw();

    function doSave() {
      var g = goalDate();
      var nm = (name.value || '').trim();
      var keepId = cur && cur.id && cur.name === nm && cur.date === g;
      var goal = { v: 1, id: keepId ? cur.id : newGoalId(), name: nm, date: g || '',
        classes: Object.keys(picked).sort().map(function (d) {
          var c = { date: d, minutes: minutes };
          if (picked[d].lesson) c.lesson = picked[d].lesson;
          var nt = (picked[d].note || '').trim();
          if (nt) c.note = nt;
          return c;
        }),
        created: new Date().toISOString() };
      var sh = shareApi();
      var v = sh && sh.validateGoal ? sh.validateGoal(goal) : { ok: !!(nm && g), error: '名前と日にちを入れてください' };
      if (!v.ok) { msg.textContent = v.error; msg.className = 'box-msg warn'; return; }
      if (!saveGoal(goal)) { msg.textContent = '保存できませんでした。'; msg.className = 'box-msg warn'; return; }
      cur = goal;
      toast('ゴールを保存しました');
      location.hash = '#/teacher';
    }
  }

  /* ---------- ゴール入りのアプリ（shosu-app.html）を作る ---------- */
  // preset.js の目印。app.js 自身の文字が1ファイル版の中で一致しないよう、つないで作る
  var PRESET_MARK = '/* js/' + 'preset.js */';
  var PRESET_RE = new RegExp('<script>\\/\\* js\\/' + 'preset\\.js \\*\\/[\\s\\S]*?<\\/script>');
  var PRESET_SRC_RE = new RegExp('<scr' + 'ipt src="js\\/' + 'preset\\.js"><\\/script>');
  // 外部ファイルを読む書き方（この文字がそのまま app.js に入らないよう、つないで作る）
  var EXT_CSS_RE = new RegExp('<li' + 'nk rel="stylesheet" href="([^"]+)">\\s*', 'g');
  var EXT_JS_RE = new RegExp('<scr' + 'ipt src="([^"]+)"><\\/script>\\s*', 'g');
  var MANIFEST_RE = new RegExp('<li' + 'nk rel="manifest"[^>]*>\\s*', 'i');
  function presetScript(goal) {
    var json = JSON.stringify({ goal: goal }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '<script>' + PRESET_MARK + '\nwindow.SHOSU_PRESET = ' + json + ';\n</' + 'script>';
  }
  function putPreset(html, goal) {
    if (PRESET_RE.test(html)) return html.replace(PRESET_RE, function () { return presetScript(goal); });
    if (PRESET_SRC_RE.test(html)) return html.replace(PRESET_SRC_RE, function () { return presetScript(goal); });
    // 目印がない古い版：最初の <script の前に入れる
    var i = html.search(/<script[\s>]/i);
    if (i < 0) throw new Error('NO_SCRIPT');
    return html.slice(0, i) + presetScript(goal) + '\n' + html.slice(i);
  }
  // いま開いている1ファイル版の HTML（#app などの表示は空にする）
  function htmlFromDocument() {
    var root = document.documentElement.cloneNode(true);
    root.classList.remove('big-text');
    if (!root.getAttribute('class')) root.removeAttribute('class');
    var body = root.querySelector('body');
    if (body) {
      Array.prototype.slice.call(body.children).forEach(function (c) {
        var t = c.tagName.toLowerCase();
        if (t !== 'script' && t !== 'noscript' && c.id !== 'app') body.removeChild(c);
      });
      var ap = body.querySelector('#app');
      if (ap) ap.innerHTML = '';
    }
    return '<!DOCTYPE html>\n' + root.outerHTML;
  }
  // 配信版（http）：index.html と CSS・JS を取ってきて1ファイルにまとめる（tools/build-single.js と同じ）
  function htmlFromServer() {
    var base = location.href.split('#')[0];
    function get(u) {
      return fetch(new URL(u, base).href, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u + ' ' + r.status); return r.text(); });
    }
    return get(base).then(function (html) {
      var jobs = [], parts = {};
      html.replace(EXT_CSS_RE, function (m, href) { jobs.push(href); return m; });
      html.replace(EXT_JS_RE, function (m, src) { jobs.push(src); return m; });
      return Promise.all(jobs.map(function (u) {
        return get(u).then(function (t) { parts[u] = t; }, function () { parts[u] = null; });
      })).then(function () {
        html = html.replace(MANIFEST_RE, '');
        html = html.replace(EXT_CSS_RE, function (m, href) {
          if (parts[href] == null) return '';
          return '<style>/* ' + href + ' */\n' + parts[href].replace(/<\/style/gi, '<\\/style') + '\n</style>\n';
        });
        html = html.replace(EXT_JS_RE, function (m, src) {
          if (parts[src] == null) return '';
          return '<script>/* ' + src + ' */\n' + parts[src].replace(/<\/script/gi, '<\\/script') + '\n</' + 'script>\n';
        });
        html = html.replace('<head>', '<head>\n<!-- 小数アプリ（1ファイル版） 作成日 ' + todayStr() + ' -->');
        return html;
      });
    });
  }
  function buildGoalApp(goal) {
    var external = !!document.querySelector('script[src], link[rel="stylesheet"][href]');
    var p;
    if (!external) p = Promise.resolve(htmlFromDocument());
    else if (/^https?:$/.test(location.protocol) && window.fetch) p = htmlFromServer();
    else return Promise.reject(Object.assign(new Error('NEED_SINGLE'), { code: 'NEED_SINGLE' }));
    return p.then(function (html) { return putPreset(html, goal); });
  }
  function downloadText(text, filename) {
    var blob = new Blob([text], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  /* 先生メニューの「ゴールと授業の予定」 */
  function teacherGoalCard() {
    var sec = h('section', 'tcard tcard-goal');
    var hh = h('h2');
    withIcon(hh, 'goal', 'ゴールと授業の予定（じぶんで計画）');
    sec.appendChild(hh);
    var g = currentGoal();
    if (g) {
      sec.appendChild(h('p', 'tgoal-name', goalLine(g)));
      sec.appendChild(h('p', 'tnote', classesLine(g)));
    } else {
      sec.appendChild(h('p', 'tnote', 'まだゴールがありません。「ゴールを決める」で、テストなどの日にちと、それまでの授業の予定を入れてください。'));
    }
    var row = h('div', 'tgoal-row');
    row.appendChild(withIcon(link('', 'btn primary', '#/teacher/goal'), 'calendar', g ? 'ゴールを決める・直す' : 'ゴールを決める'));
    var out = h('div', 'tgoal-out');
    out.hidden = true;
    var msg = h('span', 'box-msg');
    msg.setAttribute('role', 'status');
    function warn(t) { msg.textContent = t; msg.className = 'box-msg warn'; }
    var copyB = withIcon(button('', '', function () {
      var gg = currentGoal(), sh = shareApi();
      if (!gg) { warn('先にゴールを決めてください。'); return; }
      if (!(sh && sh.encodeGoal)) { warn('コードを作れませんでした。'); return; }
      msg.textContent = '';
      Promise.resolve().then(function () { return sh.encodeGoal(gg); }).then(function (tok) {
        copyText(sh.codeText ? sh.codeText(tok) : tok, out, 'ゴールのコードをコピーしました。Teams に貼ってください。子どもはホームの「もらったコードをひらく」に貼ります。');
      }).catch(function (e) { console.error(e); warn('コードを作れませんでした（' + (e && e.message || '') + '）'); });
    }), 'copy', 'ゴールのコードをコピー');
    var dlB = withIcon(button('', '', function () {
      var gg = currentGoal();
      if (!gg) { warn('先にゴールを決めてください。'); return; }
      msg.textContent = 'アプリを作っています…'; msg.className = 'box-msg';
      buildGoalApp(gg).then(function (html) {
        downloadText(html, 'shosu-app.html');
        msg.textContent = 'ゴール入りの shosu-app.html をダウンロードしました（' + Math.round(html.length / 1024) + 'KB）。このファイルを配れば、開くだけでゴールが入ります。';
        msg.className = 'box-msg';
      }, function (e) {
        console.warn('buildGoalApp', e);
        if (e && e.code === 'NEED_SINGLE') warn('このボタンは、1ファイル版（shosu-app.html）か、Webで開いているときに使えます。');
        else warn('アプリを作れませんでした。1ファイル版（shosu-app.html）で開いて、もう一度ためしてください。');
      });
    }), 'download', 'ゴール入りのアプリをダウンロード');
    if (!g) { copyB.disabled = true; dlB.disabled = true; }
    row.appendChild(copyB);
    row.appendChild(dlB);
    sec.appendChild(row);
    sec.appendChild(msg);
    sec.appendChild(out);
    sec.appendChild(h('p', 'tnote', '配りかたは2通り：①ゴールのコードを Teams に貼る　②ゴール入りのアプリ（shosu-app.html）を配る。新しいゴールが来ると上書きされます（子どもの記録や星は消えません）。'));
    return sec;
  }
  function teacherRboxCard() {
    var sec = h('section', 'tcard');
    var hh = h('h2');
    withIcon(hh, 'reflect', 'ふりかえりボックス');
    sec.appendChild(hh);
    var n = 0, rf = reflectApi();
    try { n = rf && rf.boxList ? (rf.boxList() || []).length : 0; } catch (e) { n = 0; }
    sec.appendChild(h('p', 'tnote', '子どもから届いた「ふりかえり」のコードを、チャットの文章ごとはりつけて、クラスの一覧で見られます。' + (n ? '（いま ' + n + 'こ）' : '')));
    sec.appendChild(link('ふりかえりボックスを開く ▶', 'btn primary', '#/rbox'));
    return sec;
  }
  // 記録一覧の「計画・ふりかえり」の回数
  function planCounts() {
    var plans = 0, refl = 0;
    try { var st = S.Stars && S.Stars._state ? S.Stars._state() : null; if (st) { plans = Object.keys(st.plan || {}).length; refl = Object.keys(st.refl || {}).length; } } catch (e) {}
    try { var rf = reflectApi(); if (rf && rf.list) refl = Math.max(refl, (rf.list() || []).length); } catch (e) {}
    return { plans: plans, refl: refl };
  }
  // 計画・ふりかえりの「とちゅうの記録」を消す（ゴール・名前・先生のふりかえりボックスは残す）
  function resetPlanProgress() {
    var p = planner(), r = reflectApi();
    if (p && typeof p.resetProgress === 'function') { try { p.resetProgress(); } catch (e) { console.error(e); } }
    else {
      var d = null;
      try { d = JSON.parse(lsGet('shosu.plan') || 'null'); } catch (e) { d = null; }
      if (d && typeof d === 'object' && d.settings) lsSet('shosu.plan', JSON.stringify({ v: 1, settings: d.settings }));
      else lsDel('shosu.plan');
    }
    if (r && typeof r.resetProgress === 'function') { try { r.resetProgress(); } catch (e) { console.error(e); } }
    else lsDel('shosu.reflect');
  }

  /* ホーム：きょうの計画・じぶんで計画・ふりかえり */
  function homePlanSection() {
    var wrap = h('section', 'home-plan');
    var p = planner();
    if (p && p.todayPanel) {
      try { var tp = p.todayPanel(); if (tp) wrap.appendChild(tp); } catch (e) { console.error('Planner.todayPanel', e); }
    }
    var grid = h('div', 'plan-entries');
    var g = currentGoal();
    var a = link('', 'plan-entry plan-entry-map', '#/plan');
    a.appendChild(iconEl('plan', 'plan-entry-icon') || h('span', 'plan-entry-icon'));
    var at = h('span', 'plan-entry-text');
    at.appendChild(h('span', 'plan-entry-title', 'じぶんで計画'));
    at.appendChild(h('span', 'plan-entry-sub', g ? 'ゴール：' + goalLine(g) : 'ゴールまでの旅の地図をつくろう'));
    a.appendChild(at);
    a.appendChild(arrows(h('span', 'plan-entry-go', 'ひらく ▶')));
    grid.appendChild(a);
    var b = link('', 'plan-entry plan-entry-reflect', '#/reflect');
    b.appendChild(iconEl('reflect', 'plan-entry-icon') || h('span', 'plan-entry-icon'));
    var bt = h('span', 'plan-entry-text');
    bt.appendChild(h('span', 'plan-entry-title', 'ふりかえり'));
    var done = false;
    try { var rf = reflectApi(); done = !!(rf && rf.get && rf.get(todayStr())); } catch (e) { done = false; }
    bt.appendChild(h('span', 'plan-entry-sub', done ? 'きょうのふりかえりは書いたよ。なおすこともできるよ' : 'きょうのやったこと・わかったことを書こう'));
    b.appendChild(bt);
    b.appendChild(arrows(h('span', 'plan-entry-go', 'かく ▶')));
    grid.appendChild(b);
    wrap.appendChild(grid);
    return wrap;
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
      if (parts[0] === 'lesson' && parts[1]) viewLesson(parts[1], parts[2]);
      else if (parts[0] === 'review' && parts[1]) viewReview(decodeURIComponent(parts[1]));
      else if (parts[0] === 'teacher' && parts[1] === 'goal') viewGoalEdit();
      else if (parts[0] === 'teacher') viewTeacher();
      else if (parts[0] === 'plan') viewPlan(parts[1]);
      else if (parts[0] === 'reflect') viewReflect(parts[1]);
      else if (parts[0] === 'rbox') viewRbox();
      else if (parts[0] === 'g' && parts[1]) viewGoalCode(hash.slice(2));
      else if (parts[0] === 'r' && parts[1]) viewReflCode(hash.slice(2));
      else if (parts[0] === 'matome') viewMatome();
      else if (parts[0] === 'osusume') viewOsusume();
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
  // ゴール入りのアプリ（SHOSU_PRESET）のゴールを入れる（Planner が無いときだけ。あれば Planner が入れる）
  try { applyPresetGoal(); } catch (e) { console.error('preset', e); }
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
