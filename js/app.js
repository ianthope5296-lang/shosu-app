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
    main.appendChild(homeProfileSection());
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
        var d = h('button', 'dot' + (i === idx ? ' cur' : '') + (r ? (r.correct ? ' ok' : ' ng') : '') + (it.p && it.p.boss ? ' dot-boss' : ''), it.p && it.p.boss ? 'ボス' : String(i + 1));
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
      if (it.p && it.p.boss) { area.insertBefore(bossBanner(), area.firstChild); if (opts.onBoss) { try { opts.onBoss(); } catch (e) { console.error(e); } } }
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
    tashizan: 'たし算', hikizan: 'ひき算', kimari: '計算のきまり',
    // 鬼ムズ（追加8）
    oni: '鬼ムズ', 'oni-add': 'たし算・ひき算', 'oni-muldiv': 'かけ算・わり算', 'oni-mix': 'まじった式・くふう', 'oni-idea': 'ひらめき'
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
  function matomeCount(level, minutes, stage) {
    var k = level + '/' + minutes + '/' + (stage || 0);
    if (k in matomeCountCache) return matomeCountCache[k];
    var n = 0;
    try { var b = matomeApi().build({ level: level, minutes: minutes, stage: stage || undefined, rng: seededRng(minutes * 7 + 1) }); n = b && b.problems ? b.problems.length : 0; }
    catch (e) { console.error('Matome.build', e); }
    matomeCountCache[k] = n;
    return n;
  }
  // 前の回の結果（内容ごとの×の割合）。次の build に weak として渡す
  function matomeLast() { var v = sessLoad('matome-last'); return v && typeof v === 'object' ? v : {}; }
  function validMatome(st) {
    return st && validItems(st.items) && typeof st.minutes === 'number' && st.level;
  }

  /* ---------- 鬼ムズ（追加8） ---------- */
  var ONI_LOCK_MSG = 'むずかしいを 8わり以上○で さいごまでやると開くよ';
  function hasOniLevel() { return matomeLevels().some(function (l) { return l && l.id === 'oni'; }); }
  function starState() { try { return S.Stars && S.Stars._state ? S.Stars._state() : null; } catch (e) { return null; } }
  // まとめモードの hard を「さいごまで」かつ「○の割合 0.8 以上」で1回以上やったか（または、もう開いたことがあるか）
  function hardPassed(level, correct, total, finished) {
    return level === 'hard' && !!finished && total > 0 && correct / total >= 0.8;
  }
  function oniUnlocked() {
    var mark = sessLoad('oni-open');
    if (mark && mark.open) return true;
    var ss = starState();
    if (!ss) return false;
    if (ss.oni && ss.oni.open) return true;
    var got = ss.got || {};
    if (got['oni-open'] || got['matome-hard-80']) return true;   // matome-hard-80 は「さいごまで・8わり以上」の星
    // 出来事の記録（'matome', 'hard:8/10:f'）
    return (ss.ev || []).some(function (e) {
      if (!Array.isArray(e) || e[0] !== 'matome') return false;
      var m = /^hard:(\d+)\/(\d+):f$/.exec(String(e[2]));
      return !!m && hardPassed('hard', +m[1], +m[2], true);
    });
  }
  function oniOpenLogged() { var ss = starState(); return !!(ss && ss.oni && ss.oni.open) || !!(sessLoad('oni-open') || {}).logged; }
  // 開いた瞬間：記録して「鬼ムズが開いた！」を出す。新しく開いたときだけ true
  function openOni() {
    if (oniOpenLogged()) return false;
    sessSave('oni-open', { open: true, logged: true, t: Date.now() });
    starLog('oniUnlock', {});
    toast('鬼ムズが開いた！');
    return true;
  }
  /* ---------- 鬼ムズの「だん」・ボス問題・鬼ポイント（追加9） ---------- */
  var ONI_STAGE_INFO = [
    { n: 1, label: '鬼1', sub: '計算の鬼（けた数が多い）' },
    { n: 2, label: '鬼2', sub: '文章題・くふうの鬼' },
    { n: 3, label: '鬼3', sub: 'ひらめきの鬼' }
  ];
  function oniStageData() {
    var v = sessLoad('oni-stage');
    if (!v || typeof v !== 'object') v = {};
    var mx = Math.floor(Number(v.max) || 1);
    v.max = Math.min(3, Math.max(1, mx));
    if (!v.best || typeof v.best !== 'object') v.best = {};
    if (!v.boss || typeof v.boss !== 'object') v.boss = {};
    return v;
  }
  function oniStageLabel(n) { return n >= 1 && n <= 3 ? '鬼' + n : ''; }
  function oniPts(p, r) {
    if (!r || !r.correct) return 0;
    var base = (r.hints || 0) === 0 ? 3 : (r.hints === 1 ? 2 : 1);
    return p && p.boss ? base * 2 : base;
  }
  function oniScore(items, results) {
    var o = { pts: 0, max: 0, noHint: 0, boss: null };
    items.forEach(function (it) {
      var r = results && results[it.pid];
      o.max += it.p && it.p.boss ? 6 : 3;
      o.pts += oniPts(it.p, r);
      if (r && r.correct && !(r.hints > 0)) o.noHint++;
      if (it.p && it.p.boss) o.boss = r ? (r.correct ? 'win' : 'lose') : 'skip';
    });
    return o;
  }
  function bossBanner() {
    var b = h('div', 'boss-banner');
    b.setAttribute('role', 'note');
    b.appendChild(svgSpan(SVG_ONI, 'boss-banner-ic'));
    var t = h('div', 'boss-banner-tx');
    t.appendChild(h('div', 'boss-banner-big', 'ボス問題！'));
    t.appendChild(h('div', 'boss-banner-sub', '正かいすると 鬼ポイントが2倍！ ヒントなしなら 6ポイントだよ。'));
    b.appendChild(t);
    return b;
  }
  // ボスをたおしたときの演出（タップか2.4秒で消える）
  function bossDefeated(pts) {
    var back = h('div', 'boss-fx');
    back.setAttribute('role', 'status');
    var stage = h('div', 'boss-fx-stage');
    stage.appendChild(svgSpan(SVG_ONI, 'boss-fx-oni'));
    for (var i = 0; i < 12; i++) {
      var sp = h('span', 'boss-fx-star'); sp.innerHTML = (S.Stars && S.Stars.SVG_STAR) || '';
      sp.style.setProperty('--a', (i * 30) + 'deg');
      sp.style.setProperty('--d', (90 + (i % 3) * 30) + 'px');
      stage.appendChild(sp);
    }
    back.appendChild(stage);
    back.appendChild(h('div', 'boss-fx-big', 'ボスをたおした！'));
    back.appendChild(h('div', 'boss-fx-sub', '鬼ポイント +' + pts));
    var gone = false;
    function close() { if (gone) return; gone = true; back.remove(); }
    back.addEventListener('click', close);
    document.body.appendChild(back);
    setTimeout(close, 2400);
  }


  /* ---------- 鬼バトル（追加10）：問題に答えるたびに攻撃。全問○で鬼をたおせる ---------- */
  var ONI_NAMES = { 1: 'けいさん鬼', 2: 'もんだい鬼', 3: 'ひらめき大鬼' };
  var ONI_COLORS = { 1: ['#e0403a', '#a81e1e'], 2: ['#3a7be0', '#1e3fa8'], 3: ['#8a4ae0', '#4a1ea8'] };
  function bigOniSvg(stage) {
    var c = ONI_COLORS[stage] || ONI_COLORS[1];
    return '<svg viewBox="0 0 200 220" aria-hidden="true" focusable="false">' +
      '<defs><radialGradient id="obg' + stage + '" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></radialGradient></defs>' +
      // こんぼう
      '<g class="ob-club"><rect x="160" y="70" width="14" height="110" rx="6" fill="#7a4a1e" transform="rotate(18 167 125)"/>' +
      '<rect x="150" y="40" width="34" height="70" rx="14" fill="#5a3410" transform="rotate(18 167 75)"/>' +
      '<circle cx="158" cy="58" r="4" fill="#ccc"/><circle cx="172" cy="80" r="4" fill="#ccc"/><circle cx="160" cy="92" r="4" fill="#ccc"/></g>' +
      // からだ
      '<path d="M40 215 Q45 150 100 145 Q155 150 160 215 Z" fill="url(#obg' + stage + ')"/>' +
      '<path d="M55 215 L70 175 L130 175 L145 215 Z" fill="#ffd34d"/><path d="M70 175 L80 195 L90 175 L100 195 L110 175 L120 195 L130 175" fill="none" stroke="#222" stroke-width="4"/>' +
      // つの
      '<path d="M58 62 L40 8 L80 48 Z" fill="#fff4d6" stroke="#c9a85a" stroke-width="3"/>' +
      '<path d="M142 62 L160 8 L120 48 Z" fill="#fff4d6" stroke="#c9a85a" stroke-width="3"/>' +
      // かお
      '<ellipse cx="100" cy="95" rx="62" ry="58" fill="url(#obg' + stage + ')"/>' +
      '<path d="M45 60 Q60 30 100 34 Q140 30 155 60 Q130 48 100 52 Q70 48 45 60Z" fill="#222"/>' +
      '<g class="ob-eyes"><path d="M62 78 L90 88" stroke="#222" stroke-width="7" stroke-linecap="round"/><path d="M138 78 L110 88" stroke="#222" stroke-width="7" stroke-linecap="round"/>' +
      '<circle cx="77" cy="98" r="11" fill="#fff"/><circle cx="123" cy="98" r="11" fill="#fff"/><circle cx="79" cy="99" r="5.5" fill="#222"/><circle cx="121" cy="99" r="5.5" fill="#222"/></g>' +
      '<g class="ob-eyes-hurt"><path d="M66 92 L88 104 M66 104 L88 92 M112 92 L134 104 M112 104 L134 92" stroke="#222" stroke-width="6" stroke-linecap="round"/></g>' +
      '<path class="ob-mouth" d="M70 125 Q100 108 130 125 Q100 140 70 125Z" fill="#3a0a0a"/>' +
      '<path class="ob-mouth" d="M78 120 L84 130 L90 119 M110 119 L116 130 L122 120" fill="#fff"/>' +
      '<path class="ob-mouth-hurt" d="M72 132 Q100 118 128 132" fill="none" stroke="#3a0a0a" stroke-width="6" stroke-linecap="round"/>' +
      '<g class="ob-sweat"><path d="M150 70 Q158 84 150 90 Q142 84 150 70Z" fill="#9fd8ff"/><path d="M48 80 Q54 92 48 96 Q42 92 48 80Z" fill="#9fd8ff"/></g>' +
      '<path d="M40 100 Q30 96 34 108 Q40 112 42 106" fill="url(#obg' + stage + ')"/><path d="M160 100 Q170 96 166 108 Q160 112 158 106" fill="url(#obg' + stage + ')"/>' +
      '</svg>';
  }
  /* ---------- 3Dの鬼（追加11）：WebGL だけで描く（外部ライブラリなし）。使えないときは null を返し、2Dの絵にもどす ---------- */
  function Oni3D(canvas, stage, opts) {
    opts = opts || {};
    var gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false }) || canvas.getContext('experimental-webgl', { alpha: true }); } catch (e) { gl = null; }
    if (!gl) return null;
    var VS = 'attribute vec3 aP;attribute vec3 aN;uniform mat4 uMVP;uniform mat4 uM;uniform mat3 uNM;varying vec3 vN;varying vec3 vW;' +
      'void main(){vN=normalize(uNM*aN);vec4 w=uM*vec4(aP,1.0);vW=w.xyz;gl_Position=uMVP*vec4(aP,1.0);}';
    var FS = 'precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec3 uC;uniform float uF;uniform vec3 uE;uniform vec3 uCam;' +
      'void main(){vec3 n=normalize(vN);vec3 L=normalize(vec3(0.5,0.9,0.7));vec3 V=normalize(uCam-vW);' +
      'float d=max(dot(n,L),0.0);float b=max(dot(n,normalize(vec3(-0.6,0.2,-0.5))),0.0);' +
      'float s=pow(max(dot(n,normalize(L+V)),0.0),28.0);float r=pow(1.0-max(dot(n,V),0.0),2.5);' +
      'vec3 c=uC*(0.38+0.75*d)+uC*b*0.25+vec3(1.0)*s*0.35+vec3(1.0,0.85,0.6)*r*0.35+uE;' +
      'gl_FragColor=vec4(mix(c,vec3(1.0),uF),1.0);}';
    function sh(t, src) { var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var pr;
    try {
      pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    } catch (e) { return null; }
    gl.useProgram(pr);
    var A = { p: gl.getAttribLocation(pr, 'aP'), n: gl.getAttribLocation(pr, 'aN') };
    var U = {}; ['uMVP', 'uM', 'uNM', 'uC', 'uF', 'uE', 'uCam'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });

    // ---- 形（球・円柱/円すい・箱） ----
    function mesh(pos, nor, idx) {
      var m = { n: idx.length };
      m.pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.pb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.STATIC_DRAW);
      m.nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, m.nb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(nor), gl.STATIC_DRAW);
      m.ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
      return m;
    }
    function sphere(la, lo) {
      var p = [], n = [], ix = [], i, j;
      for (i = 0; i <= la; i++) { var th = i * Math.PI / la, st = Math.sin(th), ct = Math.cos(th);
        for (j = 0; j <= lo; j++) { var ph = j * 2 * Math.PI / lo, x = Math.cos(ph) * st, z = Math.sin(ph) * st; p.push(x, ct, z); n.push(x, ct, z); } }
      for (i = 0; i < la; i++) for (j = 0; j < lo; j++) { var a = i * (lo + 1) + j, b = a + lo + 1; ix.push(a, b, a + 1, b, b + 1, a + 1); }
      return mesh(p, n, ix);
    }
    // 高さ1（y -0.5〜0.5）。rt=上の半径、rb=下の半径
    function cyl(rt, rb, seg) {
      var p = [], n = [], ix = [], j, sl = (rb - rt);
      for (j = 0; j <= seg; j++) { var a = j * 2 * Math.PI / seg, c = Math.cos(a), s = Math.sin(a), l = Math.sqrt(1 + sl * sl);
        p.push(c * rt, 0.5, s * rt, c * rb, -0.5, s * rb); n.push(c / l, sl / l, s / l, c / l, sl / l, s / l); }
      for (j = 0; j < seg; j++) { var k = j * 2; ix.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      var base = p.length / 3;
      p.push(0, 0.5, 0); n.push(0, 1, 0); p.push(0, -0.5, 0); n.push(0, -1, 0);
      for (j = 0; j <= seg; j++) { var b2 = j * 2 * Math.PI / seg; p.push(Math.cos(b2) * rt, 0.5, Math.sin(b2) * rt); n.push(0, 1, 0); p.push(Math.cos(b2) * rb, -0.5, Math.sin(b2) * rb); n.push(0, -1, 0); }
      for (j = 0; j < seg; j++) { var q = base + 2 + j * 2; ix.push(base, q + 2, q); ix.push(base + 1, q + 1, q + 3); }
      return mesh(p, n, ix);
    }
    function box() {
      var p = [], n = [], ix = [], F = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      F.forEach(function (f, fi) {
        var u = f[0] ? [0, 1, 0] : [1, 0, 0], v = [f[1] * u[2] - f[2] * u[1], f[2] * u[0] - f[0] * u[2], f[0] * u[1] - f[1] * u[0]];
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { p.push((f[0] + u[0] * c[0] + v[0] * c[1]) / 2, (f[1] + u[1] * c[0] + v[1] * c[1]) / 2, (f[2] + u[2] * c[0] + v[2] * c[1]) / 2); n.push(f[0], f[1], f[2]); });
        var o = fi * 4; ix.push(o, o + 1, o + 2, o, o + 2, o + 3);
      });
      return mesh(p, n, ix);
    }
    var G = { s: sphere(18, 24), sl: sphere(10, 12), c: cyl(1, 1, 20), cone: cyl(0, 1, 16), club: cyl(1, 0.45, 14), b: box() };

    // ---- 行列 ----
    function I() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
    function mul(a, b) { var o = new Array(16); for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
    function T(x, y, z) { var m = I(); m[12] = x; m[13] = y; m[14] = z; return m; }
    function S(x, y, z) { var m = I(); m[0] = x; m[5] = y; m[10] = z; return m; }
    function RX(a) { var c = Math.cos(a), s = Math.sin(a), m = I(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
    function RY(a) { var c = Math.cos(a), s = Math.sin(a), m = I(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
    function RZ(a) { var c = Math.cos(a), s = Math.sin(a), m = I(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
    function C() { var m = arguments[0]; for (var i = 1; i < arguments.length; i++) m = mul(m, arguments[i]); return m; }
    function persp(f, asp, n, fa) { var t = 1 / Math.tan(f / 2), m = [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; return m; }
    function look(e, c) {
      var z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]], l = Math.hypot(z[0], z[1], z[2]); z = z.map(function (v) { return v / l; });
      var x = [z[2], 0, -z[0]]; l = Math.hypot(x[0], x[1], x[2]); x = x.map(function (v) { return v / l; });
      var y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
        -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
    }
    function nmat(m) {
      var a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h2 = m[9], i = m[10];
      var A0 = e * i - f * h2, B0 = -(d * i - f * g), C0 = d * h2 - e * g, det = a * A0 + b * B0 + c * C0 || 1e-6;
      return [A0 / det, B0 / det, C0 / det, -(b * i - c * h2) / det, (a * i - c * g) / det, -(a * h2 - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
    }
    function hex(s) { var v = parseInt(s.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }

    var BODY = { 1: '#e2453c', 2: '#3f7fe4', 3: '#8f52e6' }[stage] || '#e2453c';
    var FLOOR = { 1: '#5a2a2a', 2: '#22365e', 3: '#3e2660' }[stage] || '#5a2a2a';
    var COL = { body: hex(BODY), dark: hex('#1c1416'), horn: hex('#fff0cc'), white: hex('#ffffff'), pants: hex('#ffd23a'),
      mouth: hex('#4a0c10'), club: hex('#7a4a1e'), spike: hex('#c8c8d0'), floor: hex(FLOOR), ring: hex('#ffd34d'), shadow: hex('#140a12'), nose: hex(BODY).map(function (v) { return v * 0.8; }) };

    // ---- ようす ----
    var st = { hitT: -1e9, atkT: -1e9, rage: false, weak: false, mode: opts.mode || 'idle', modeT: performance.now(), drag: 0, dragV: 0 };
    var VP, camE = [0, 1.8, 4.9], dead = false, raf = 0;
    function draw(m, mesh, col, F, E) {
      gl.uniformMatrix4fv(U.uMVP, false, mul(VP, m));
      gl.uniformMatrix4fv(U.uM, false, m);
      gl.uniformMatrix3fv(U.uNM, false, nmat(m));
      gl.uniform3fv(U.uC, col); gl.uniform1f(U.uF, F || 0); gl.uniform3fv(U.uE, E || [0, 0, 0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pb); gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(A.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nb); gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(A.n);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib); gl.drawElements(gl.TRIANGLES, mesh.n, gl.UNSIGNED_SHORT, 0);
    }
    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h2 = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h2) { canvas.width = w; canvas.height = h2; }
      gl.viewport(0, 0, w, h2);
      return w / h2;
    }
    var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    function frame(now) {
      if (dead) return;
      if (!canvas.isConnected) { dead = true; return; }
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      var t = reduce ? 0 : now / 1000, asp = resize();
      // 動きの計算
      var bob = Math.sin(t * (st.rage ? 5 : 2.2)) * (st.weak ? 0.03 : 0.05), rotY = Math.sin(t * 0.6) * 0.28, lean = st.weak ? 0.12 : 0, shx = 0, lunge = 0, swing = 0, flash = 0, squint = st.weak ? 0.45 : 1, mouth = 1, yoff = 0, fall = 0, sc = 1, camShake = 0, xoff = 0;
      var hh = (now - st.hitT) / 520;
      if (hh >= 0 && hh < 1) { flash = Math.pow(1 - hh, 2) * 0.85; lean -= 0.4 * Math.sin(Math.PI * hh); shx = Math.sin(hh * 38) * 0.12 * (1 - hh); squint = 0.15; mouth = 1.8; camShake = 0.05 * (1 - hh); }
      var aa = (now - st.atkT) / 750;
      if (aa >= 0 && aa < 1) {
        swing = aa < 0.35 ? -0.9 * (aa / 0.35) : aa < 0.55 ? -0.9 + 2.6 * ((aa - 0.35) / 0.2) : 1.7 * (1 - (aa - 0.55) / 0.45);
        lunge = 0.9 * Math.sin(Math.PI * Math.min(1, aa * 1.3)); lean += 0.25 * Math.sin(Math.PI * aa); mouth = 2;
        if (aa > 0.45 && aa < 0.75) camShake = 0.12 * (1 - (aa - 0.45) / 0.3);
      }
      if (st.drag === 0 && Math.abs(st.dragV) > 0.001) st.dragV *= 0.94;
      rotY += st.dragV;
      var md = (now - st.modeT) / 1000;
      if (st.mode === 'defeat') {
        var p1 = Math.min(1, md / 0.8), p2 = Math.max(0, Math.min(1, (md - 0.8) / 1.0));
        flash = md < 0.8 ? 0.5 + 0.5 * Math.sin(md * 40) : 0; shx = md < 0.8 ? Math.sin(md * 60) * 0.1 : 0; squint = 0.12; mouth = 1.6;
        fall = -1.45 * (p2 * p2); yoff = -0.3 * p2; sc = 1 - 0.25 * p2; rotY = 0.4 * p1; camShake = md < 0.8 ? 0.05 : 0;
      } else if (st.mode === 'flee') {
        var f1 = Math.min(1, md / 0.6), f2 = Math.max(0, (md - 0.6) / 1.4);
        rotY = Math.PI * 0.5 * f1; xoff = 6 * f2 * f2; bob = Math.abs(Math.sin(md * 14)) * 0.18 * (md > 0.6 ? 1 : 0); squint = 0.5;
      }
      var E = st.rage ? [0.35 + 0.2 * Math.sin(t * 8), 0.05, 0] : [0, 0, 0];
      // カメラ
      var ce = [camE[0] + (Math.random() - 0.5) * camShake, camE[1] + (Math.random() - 0.5) * camShake, camE[2]];
      VP = mul(persp(0.78, asp, 0.1, 50), look(ce, [0, 1.45, 0]));
      gl.uniform3fv(U.uCam, ce);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CW);
      // 床
      if (!opts.noFloor) {
        draw(C(T(0, -0.08, 0), S(3.2, 0.16, 2.2)), G.c, COL.floor);
        draw(C(T(0, 0.005, 0), S(2.9, 0.01, 2.0)), G.c, COL.floor.map(function (v) { return v * 1.25; }));
        draw(C(T(0, 0.012, 0), S(2.95, 0.012, 2.05)), G.c, COL.ring, 0, [0.25, 0.18, 0]);
        draw(C(T(0, 0.016, 0), S(2.85, 0.012, 1.95)), G.c, COL.floor.map(function (v) { return v * 1.15; }));
      }
      // 影
      var shs = Math.max(0.3, 1 - (bob + yoff) * 0.6) * sc;
      draw(C(T(xoff + shx, 0.03, lunge), S(1.1 * shs, 0.01, 0.7 * shs)), G.c, COL.shadow);
      // からだ全体
      var R = C(T(xoff + shx, bob + yoff, lunge), RY(rotY), RX(lean), RX(fall), S(sc, sc, sc));
      var body = COL.body;
      draw(C(R, T(-0.38, 0.28, 0), S(0.26, 0.56, 0.26)), G.c, body, flash, E);
      draw(C(R, T(0.38, 0.28, 0), S(0.26, 0.56, 0.26)), G.c, body, flash, E);
      draw(C(R, T(-0.38, 0.03, 0.08), S(0.22, 0.1, 0.3)), G.s, COL.dark, flash);
      draw(C(R, T(0.38, 0.03, 0.08), S(0.22, 0.1, 0.3)), G.s, COL.dark, flash);
      draw(C(R, T(0, 1.15, 0), S(0.95, 0.8, 0.72)), G.s, body, flash, E);
      draw(C(R, T(0, 0.68, 0), S(1.0, 0.42, 0.78)), G.s, COL.pants, flash);
      [0.52, 0.72, 0.9].forEach(function (y, i) { draw(C(R, T(0, y, 0), RY(i * 0.7), S(i === 1 ? 0.99 : 0.93, 0.05, i === 1 ? 0.77 : 0.72)), G.c, COL.dark, flash); });
      // 頭
      var Hd = C(R, T(0, 2.15, 0.02), RX(st.mode === 'idle' ? Math.sin(t * 1.3) * 0.05 : 0));
      draw(C(Hd, S(0.86, 0.8, 0.8)), G.s, body, flash, E);
      draw(C(Hd, T(0, 0.42, -0.16), S(0.9, 0.5, 0.78)), G.s, COL.dark, flash);
      draw(C(Hd, T(-0.42, 0.56, 0), RZ(0.38), T(0, 0.36, 0), S(0.19, 0.78, 0.19)), G.cone, COL.horn, flash);
      draw(C(Hd, T(0.42, 0.56, 0), RZ(-0.38), T(0, 0.36, 0), S(0.19, 0.78, 0.19)), G.cone, COL.horn, flash);
      draw(C(Hd, T(-0.86, -0.02, 0), S(0.14, 0.2, 0.12)), G.sl, body, flash, E);
      draw(C(Hd, T(0.86, -0.02, 0), S(0.14, 0.2, 0.12)), G.sl, body, flash, E);
      [-1, 1].forEach(function (sx) {
        draw(C(Hd, T(0.29 * sx, 0.04, 0.66), S(0.18, 0.18 * squint, 0.12)), G.sl, COL.white, flash);
        if (squint > 0.2) draw(C(Hd, T(0.27 * sx, 0.03, 0.76), S(0.085, 0.085 * Math.min(1, squint), 0.05)), G.sl, COL.dark);
        draw(C(Hd, T(0.3 * sx, 0.25, 0.72), RZ(-0.5 * sx * (st.weak ? -0.4 : 1)), S(0.34, 0.09, 0.1)), G.b, COL.dark, flash);
        draw(C(Hd, T(0.17 * sx, -0.36, 0.72), T(0, 0.08, 0), S(0.07, 0.18, 0.07)), G.cone, COL.white, flash);
      });
      draw(C(Hd, T(0, -0.12, 0.78), S(0.1, 0.08, 0.07)), G.sl, COL.nose, flash);
      draw(C(Hd, T(0, -0.36, 0.64), S(0.4, 0.11 * mouth, 0.1)), G.s, COL.mouth, flash);
      // 左うで
      draw(C(R, T(-0.9, 1.4, 0), RZ(-0.55 - (st.weak ? 0.3 : 0)), T(0, -0.36, 0), S(0.17, 0.72, 0.17)), G.c, body, flash, E);
      draw(C(R, T(-0.9, 1.4, 0), RZ(-0.55 - (st.weak ? 0.3 : 0)), T(0, -0.76, 0), S(0.2, 0.2, 0.2)), G.sl, body, flash, E);
      // 右うで＋こんぼう
      var Ar = C(R, T(0.9, 1.45, 0), RZ(0.5), RX(swing));
      draw(C(Ar, T(0, -0.36, 0), S(0.17, 0.72, 0.17)), G.c, body, flash, E);
      draw(C(Ar, T(0, -0.76, 0), S(0.21, 0.21, 0.21)), G.sl, body, flash, E);
      var Cl = C(Ar, T(0, -0.76, 0), RZ(-0.55), RX(-0.1));
      draw(C(Cl, T(0, 0.7, 0), S(0.2, 1.5, 0.2)), G.club, COL.club, flash);
      draw(C(Cl, T(0, 1.45, 0), S(0.2, 0.08, 0.2)), G.sl, COL.club, flash);
      for (var k = 0; k < 7; k++) { var ky = 0.75 + (k % 3) * 0.25, ka = k * 2.1; draw(C(Cl, T(Math.cos(ka) * 0.16, ky, Math.sin(ka) * 0.16), S(0.05, 0.05, 0.05)), G.sl, COL.spike, flash); }
    }
    raf = requestAnimationFrame(frame);
    // 横にスワイプすると、鬼が回る（たてのスクロールはそのまま）
    var px = null;
    canvas.addEventListener('pointerdown', function (e) { px = e.clientX; st.drag = 1; });
    canvas.addEventListener('pointermove', function (e) { if (px == null) return; st.dragV += (e.clientX - px) * 0.01; px = e.clientX; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { canvas.addEventListener(ev, function () { px = null; st.drag = 0; }); });
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); dead = true; if (opts.onLost) opts.onLost(); });
    return {
      hit: function () { st.hitT = performance.now(); },
      attack: function () { st.atkT = performance.now(); },
      setRage: function (v) { st.rage = !!v; },
      setWeak: function (v) { st.weak = !!v; },
      setMode: function (m) { st.mode = m; st.modeT = performance.now(); },
      destroy: function () { dead = true; cancelAnimationFrame(raf); }
    };
  }

  var ONI_TAUNT = ['ふはは！ その程度か！', 'まだまだ！', 'こんな問題も とけないのか？', 'おれさまの勝ちだな！'];
  var ONI_OUCH = ['ぐわっ！', 'いたたた…', 'な、なんだと！', 'うぐぐ…', 'やるな…！'];
  function oniBattle(items, results, stage) {
    var dmgOf = function (it) { return it.p && it.p.boss ? 200 : 100; };
    var maxHp = 0; items.forEach(function (it) { maxHp += dmgOf(it); });
    var hp = maxHp, enraged = false, done = false;
    items.forEach(function (it) { var r = results[it.pid]; if (r && r.correct) hp -= dmgOf(it); });
    hp = Math.max(0, hp);

    var el = h('section', 'ob ob-s' + stage);
    el.setAttribute('aria-label', '鬼バトル');
    var sky = h('div', 'ob-sky');
    var top = h('div', 'ob-top');
    top.appendChild(h('span', 'ob-name', (ONI_NAMES[stage] || '鬼') + ' があらわれた！'));
    var hpWrap = h('div', 'ob-hp');
    hpWrap.appendChild(h('span', 'ob-hp-l', 'HP'));
    var bar = h('div', 'ob-hp-bar'), lag = h('div', 'ob-hp-lag'), fill = h('div', 'ob-hp-fill');
    bar.appendChild(lag); bar.appendChild(fill); hpWrap.appendChild(bar);
    var hpNum = h('span', 'ob-hp-n', '');
    hpWrap.appendChild(hpNum);
    top.appendChild(hpWrap);
    sky.appendChild(top);
    var stageEl = h('div', 'ob-stage');
    var oni = h('div', 'ob-oni');
    var o3 = null, cv = document.createElement('canvas');
    cv.className = 'ob-cv';
    cv.setAttribute('aria-label', (ONI_NAMES[stage] || '鬼') + '（3D）');
    try { o3 = Oni3D(cv, stage, { onLost: function () { el.classList.remove('ob-3d'); cv.remove(); oni.innerHTML = bigOniSvg(stage); o3 = null; } }); } catch (e) { console.error(e); o3 = null; }
    if (o3) { el.classList.add('ob-3d'); oni.appendChild(cv); } else oni.innerHTML = bigOniSvg(stage);
    var bubble = h('div', 'ob-bubble', 'おれさまを たおせるかな？');
    var fx = h('div', 'ob-fx');
    stageEl.appendChild(oni); stageEl.appendChild(bubble); stageEl.appendChild(fx);
    sky.appendChild(stageEl);
    var log = h('div', 'ob-log', '問題に正かいすると こうげき！ ぜんぶ○で 鬼をたおせるよ。');
    log.setAttribute('aria-live', 'polite');
    sky.appendChild(log);
    el.appendChild(sky);

    function draw(instant) {
      var pc = maxHp ? hp / maxHp * 100 : 0;
      fill.style.width = pc + '%';
      if (instant) lag.style.width = pc + '%'; else setTimeout(function () { lag.style.width = pc + '%'; }, 450);
      fill.className = 'ob-hp-fill' + (pc <= 25 ? ' low' : pc <= 50 ? ' mid' : '');
      hpNum.textContent = hp + ' / ' + maxHp;
      el.classList.toggle('ob-weak', pc > 0 && pc <= 30);
      if (o3) o3.setWeak(pc > 0 && pc <= 30);
    }
    draw(true);
    function say(t) { bubble.textContent = t; bubble.classList.remove('pop'); void bubble.offsetWidth; bubble.classList.add('pop'); }
    function anim(node, cls, ms) { node.classList.remove(cls); void node.offsetWidth; node.classList.add(cls); setTimeout(function () { node.classList.remove(cls); }, ms); }
    function floatText(t, cls) {
      var d = h('div', 'ob-float ' + (cls || ''), t);
      fx.appendChild(d);
      setTimeout(function () { d.remove(); }, 1300);
    }
    function slash(n) {
      for (var i = 0; i < n; i++) {
        (function (k) {
          setTimeout(function () {
            var s2 = h('div', 'ob-slash');
            s2.style.setProperty('--r', (k % 2 ? 35 : -35) + 'deg');
            fx.appendChild(s2);
            setTimeout(function () { s2.remove(); }, 450);
          }, k * 140);
        })(i);
      }
    }
    function sparks(n) {
      for (var i = 0; i < n; i++) {
        var sp = h('span', 'ob-spark'); sp.innerHTML = (S.Stars && S.Stars.SVG_STAR) || '';
        sp.style.setProperty('--a', (i * (360 / n)) + 'deg');
        sp.style.setProperty('--d', (60 + (i % 3) * 25) + 'px');
        fx.appendChild(sp);
        (function (x) { setTimeout(function () { x.remove(); }, 1000); })(sp);
      }
    }
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

    return {
      el: el,
      answer: function (it, r) {
        if (done || !r) return;
        var boss = it.p && it.p.boss;
        if (r.correct) {
          var d = dmgOf(it);
          var crit = !(r.hints > 0);
          hp = Math.max(0, hp - d);
          slash(boss ? 3 : crit ? 2 : 1);
          setTimeout(function () {
            if (o3) o3.hit(); else anim(oni, 'hit', 500);
            floatText('-' + d, crit ? 'crit' : '');
            if (crit) floatText(boss ? '必殺の一撃！' : '会心の一撃！', 'word');
            sparks(crit ? 10 : 6);
            draw(false);
            if (hp <= 0) { say('ぐ…ぐわあああ！'); log.textContent = '鬼のHPが 0 になった！'; }
            else { say(pick(ONI_OUCH)); log.textContent = (crit ? 'ヒントなしで ' : '') + d + ' のダメージ！'; }
          }, 150);
        } else {
          anim(el, 'ouch', 600);
          if (o3) o3.attack(); else anim(oni, 'atk', 600);
          say(pick(ONI_TAUNT));
          floatText('ミス！', 'miss');
          log.textContent = '鬼のはんげき！ ヒントを見て、もう一度考えてみよう。';
        }
      },
      // 問題を表示したとき（ボス問題で鬼がおこる）
      enterBoss: function () {
        if (enraged || done) return;
        enraged = true;
        el.classList.add('ob-rage');
        if (o3) o3.setRage(true);
        say(hp > 0 ? 'もうゆるさん！ 本気を出すぞ！' : '…');
        log.textContent = 'さいごの問題！ 正かいで 200 のダメージ！';
      },
      finale: function () {
        if (done) return;
        done = true;
        var win = hp <= 0;
        var back = h('div', 'ob-end ' + (win ? 'win' : 'lose'));
        back.setAttribute('role', 'status');
        var o2 = h('div', 'ob-end-oni');
        back.appendChild(o2);
        var e3 = null, cv2 = document.createElement('canvas');
        cv2.className = 'ob-cv';
        try { e3 = Oni3D(cv2, stage, { mode: win ? 'defeat' : 'flee', noFloor: true }); } catch (e) { e3 = null; }
        if (e3) { back.classList.add('ob-end-3d'); o2.appendChild(cv2); } else o2.innerHTML = bigOniSvg(stage);
        if (win) {
          for (var i = 0; i < 16; i++) {
            var sp = h('span', 'ob-end-star'); sp.innerHTML = (S.Stars && S.Stars.SVG_STAR) || '';
            sp.style.setProperty('--a', (i * 22.5) + 'deg');
            sp.style.setProperty('--d', (110 + (i % 3) * 40) + 'px');
            back.appendChild(sp);
          }
        }
        back.appendChild(h('div', 'ob-end-big', win ? (ONI_NAMES[stage] || '鬼') + 'を たおした！' : (ONI_NAMES[stage] || '鬼') + 'は にげていった…'));
        back.appendChild(h('div', 'ob-end-sub', win ? 'ぜんぶ○！ おめでとう！' : 'のこりHP ' + hp + '。ぜんぶ○で たおせるよ。またちょうせんしよう！'));
        back.appendChild(h('div', 'ob-end-tap', 'タップしてけっかを見る'));
        var gone = false;
        function close() { if (gone) return; gone = true; back.remove(); }
        back.addEventListener('click', close);
        document.body.appendChild(back);
        setTimeout(close, win ? 4500 : 3500);
      }
    };
  }

  function oniRuns() { var ss = starState(); return ss && ss.oni ? ss.oni.run || 0 : 0; }
  // 自作のSVG：ツノとほのおの鬼ムズのしるし・鍵
  var SVG_ONI = '<svg class="oni-ic" viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    '<path d="M24 46c-9 0-15-6-15-14 0-6 3-9 5-13 1 4 3 6 5 6-1-6 2-12 7-17 0 6 3 9 6 12 2-2 2-5 2-7 4 4 5 9 5 14 0 11-6 19-15 19z" fill="#ff7a1a"/>' +
    '<path d="M24 46c-5 0-9-4-9-9 0-4 2-6 4-8 0 3 2 4 3 4 0-4 2-7 4-9 1 4 3 5 4 7 1-1 2-2 2-4 2 3 2 6 2 9 0 6-4 10-10 10z" fill="#ffd34d"/>' +
    '<path d="M11 21 6 4l11 10zM37 21l5-17-11 10z" fill="#fff4e8" stroke="#7a1010" stroke-width="2" stroke-linejoin="round"/>' +
    '<circle cx="19" cy="34" r="2.4" fill="#7a1010"/><circle cx="29" cy="34" r="2.4" fill="#7a1010"/>' +
    '<path d="M16 29.5l6 2M32 29.5l-6 2" stroke="#7a1010" stroke-width="2.2" stroke-linecap="round"/>' +
    '<path d="M20 40.5q4 2.5 8 0" stroke="#7a1010" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  var SVG_LOCK = '<svg class="lock-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
    '<rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="currentColor"/>' +
    '<circle cx="12" cy="15.3" r="1.7" fill="#fff"/><path d="M12 16.5v2.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function svgSpan(svg, cls) { var e = h('span', cls); e.innerHTML = svg; return e; }

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
    var hasOni = hasOniLevel();
    var oniOpen = hasOni && oniUnlocked();
    var justOpened = oniOpen && openOni();   // 前からの記録で開けるようになっていたとき
    if (level === 'oni' && !oniOpen) level = 'easy';
    var osd = oniStageData();
    var stage = Math.min(osd.max, Math.max(1, Number(last.oniStage) || osd.max));
    var card = h('section', 'mm-setup');
    if (justOpened) card.appendChild(oniBanner());
    card.appendChild(h('p', 'mm-lead', 'これまでに学習した、いろいろな問題が出るよ。レベルと時間をえらんで「スタート」をおそう。'));
    card.appendChild(h('h2', 'mm-h', 'レベル'));
    var lv = h('div', 'mm-choices mm-levels' + (hasOni ? ' mm-levels-oni' : ''));
    var lvBtns = matomeLevels().map(function (l) {
      if (l.id === 'oni') {
        var ob = button('', 'mm-choice mm-oni' + (oniOpen ? '' : ' locked'), function () { if (!oniOpen) return; level = l.id; mark(); });
        ob.dataset.id = l.id;
        var ot = h('span', 'mm-choice-t');
        ot.appendChild(svgSpan(oniOpen ? SVG_ONI : SVG_LOCK, oniOpen ? 'mm-oni-ic' : 'mm-lock-ic'));
        ot.appendChild(document.createTextNode(l.label || '鬼ムズ'));
        ob.appendChild(ot);
        ob.appendChild(h('span', 'mm-choice-sub mm-oni-sub', oniOpen ? '4年のはんいをこえる問題も！' : ONI_LOCK_MSG));
        if (!oniOpen) { ob.disabled = true; ob.setAttribute('aria-label', '鬼ムズ（鍵がかかっています。' + ONI_LOCK_MSG + '）'); }
        lv.appendChild(ob);
        return ob;
      }
      var b = button('', 'mm-choice', function () { level = l.id; mark(); });
      b.appendChild(h('span', 'mm-choice-t', l.label));
      b.dataset.id = l.id;
      lv.appendChild(b);
      return b;
    });
    card.appendChild(lv);
    // 鬼ムズの「だん」（鬼ムズをえらんだときだけ出す）
    var stWrap = h('div', 'mm-oni-stages');
    stWrap.appendChild(h('h2', 'mm-h', '鬼の だん'));
    var stRow = h('div', 'mm-choices mm-stages');
    var stBtns = ONI_STAGE_INFO.map(function (si) {
      var open = si.n <= osd.max;
      var b = button('', 'mm-choice mm-stage' + (open ? '' : ' locked'), function () { if (!open) return; stage = si.n; mark(); });
      b.dataset.stage = si.n;
      var t = h('span', 'mm-choice-t');
      if (!open) t.appendChild(svgSpan(SVG_LOCK, 'mm-lock-ic'));
      t.appendChild(document.createTextNode(si.label));
      b.appendChild(t);
      b.appendChild(h('span', 'mm-choice-sub', open ? si.sub : oniStageLabel(si.n - 1) + 'を8わり以上○で さいごまで'));
      var best = osd.best[si.n];
      if (open && best) b.appendChild(h('span', 'mm-choice-sub mm-stage-best', 'さいこう ' + best.pts + 'ポイント' + (osd.boss[si.n] ? '・ボス撃破' : '')));
      if (!open) b.disabled = true;
      stRow.appendChild(b);
      return b;
    });
    stWrap.appendChild(stRow);
    stWrap.appendChild(h('p', 'mm-note', 'さいごに ボス問題 が出るよ。ヒントを使わずに○なら3ポイント、ヒント1つで2ポイント、2つ以上で1ポイント。ボス問題は2倍！'));
    card.appendChild(stWrap);
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
    var go = button('スタート ▶', 'primary mm-start', function () { startMatome(main, level, minutes, level === 'oni' ? stage : 0); });
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
      stWrap.hidden = level !== 'oni';
      stBtns.forEach(function (b) { var on = Number(b.dataset.stage) === stage; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
      tmBtns.forEach(function (x) {
        var on = x.m === minutes;
        x.b.classList.toggle('on', on);
        x.b.setAttribute('aria-pressed', on);
        var n = matomeCount(level, x.m, level === 'oni' ? stage : 0);
        x.sub.textContent = n ? '約' + n + '問' : '';
      });
    }
    mark();
  }

  function startMatome(main, level, minutes, stage) {
    var built = null;
    var last = matomeLast();
    stage = level === 'oni' ? Math.min(oniStageData().max, Math.max(1, Number(stage) || 1)) : 0;
    try { built = matomeApi().build({ level: level, minutes: minutes, stage: stage || undefined, weak: last.weak || undefined }); }
    catch (e) { console.error('Matome.build', e); }
    var probs = built && Array.isArray(built.problems) ? built.problems.filter(Boolean) : [];
    if (!probs.length) { toast('問題を作れませんでした'); return; }
    var stamp = Date.now().toString(36);
    var st = {
      level: level, minutes: minutes, stamp: stamp, oniStage: stage || undefined,
      items: probs.map(function (p, i) { return { p: p, pid: 'mt-' + stamp + '-' + i, tag: p.tag || '' }; }),
      results: {}, elapsed: 0, timeUp: false
    };
    sessSave('matome', st);
    var l = matomeLast();
    l.level = level; l.minutes = minutes;
    if (stage) l.oniStage = stage;
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
      results: st.results, start: start < 0 ? 0 : start, level: cfg.level, onBoss: cfg.onBoss,
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
    var battle = st.oniStage ? oniBattle(items, st.results || {}, st.oniStage) : null;
    runTimed(main, st, {
      before: battle ? battle.el : undefined,
      onBoss: battle ? function () { battle.enterBoss(); } : undefined,
      sessKey: 'matome', recKey: 'matome', label: levelLabel(st.level) + (st.oniStage ? ' ' + oniStageLabel(st.oniStage) : '') + '・' + st.minutes + '分', level: st.level,
      onAnswer: function (it, r, results, first) {
        if (battle && first) battle.answer(it, r);
      },
      onFinish: function (took, n) {
        var res = st.results;
        if (battle) battle.finale();
        var ok = 0;
        var byTag = {}, tagOrder = [];
        items.forEach(function (it) {
          var tag = it.tag || (it.p && it.p.tag) || '';
          // 鬼ムズは、内容（oni-add など）ごとに分ける
          if (st.level === 'oni') { var osk = skillOfProblem(it.p); if (osk && MATOME_TAG_LABEL[osk]) tag = osk; }
          if (!byTag[tag]) { byTag[tag] = { n: 0, ok: 0, total: 0 }; tagOrder.push(tag); }
          byTag[tag].total++;
          var r = res[it.pid];
          if (r) { byTag[tag].n++; if (r.correct) { byTag[tag].ok++; ok++; } }
        });
        // 内容ごとの×の割合を、次の回のために残す
        var weak = {};
        tagOrder.forEach(function (t) { if (t && byTag[t].n) weak[t] = Math.round((1 - byTag[t].ok / byTag[t].n) * 100) / 100; });
        var l = matomeLast();
        l.level = st.level; l.minutes = st.minutes; l.t = Date.now();
        if (st.level !== 'oni') l.weak = weak;   // 鬼ムズは weak を使わない（7つの内容の記録はそのまま残す）
        sessSave('matome-last', l);
        var finished = n === items.length;
        var got = starLog('matome', { level: st.level, minutes: st.minutes, total: items.length, answered: n, correct: ok, finished: finished, seconds: Math.round(took / 1000) });
        var oniNew = false;
        if (hasOniLevel() && hardPassed(st.level, ok, items.length, finished)) {
          sessSave('oni-open', Object.assign({}, sessLoad('oni-open') || {}, { open: true }));
          var before = starGotIds();
          oniNew = openOni();
          if (oniNew) got = got.concat(starNewSince(before));
        }
        var oni = null;
        if (st.oniStage) {
          oni = oniScore(items, res);
          var od = oniStageData(), sk = st.oniStage, prevBest = od.best[sk];
          oni.prevBest = prevBest ? prevBest.pts : null;
          oni.record = !prevBest || oni.pts > prevBest.pts;
          if (oni.record && oni.pts > 0) od.best[sk] = { pts: oni.pts, max: oni.max, t: Date.now() };
          else if (!prevBest) oni.record = false;
          if (oni.boss === 'win') od.boss[sk] = 1;
          oni.clear = finished && items.length > 0 && ok / items.length >= 0.8;
          oni.newStage = 0;
          if (oni.clear && sk < 3 && od.max <= sk) { od.max = sk + 1; oni.newStage = sk + 1; }
          sessSave('oni-stage', od);
        }
        matomeResult(main, st, { n: n, ok: ok, took: took, byTag: byTag, tagOrder: tagOrder, got: got, finished: finished, oniNew: oniNew, oni: oni });
      }
    });
  }

  function starGotIds() { var ss = starState(); return ss ? Object.keys(ss.got || {}) : []; }
  function starNewSince(before) {
    var cat = S.Stars && Array.isArray(S.Stars.CATALOG) ? S.Stars.CATALOG : [];
    return starGotIds().filter(function (id) { return before.indexOf(id) < 0; })
      .map(function (id) { var c = null; cat.forEach(function (x) { if (x.id === id) c = x; }); return c || { id: id, label: id }; });
  }
  function oniBanner() {
    var b = h('div', 'oni-banner');
    b.setAttribute('role', 'status');
    b.appendChild(svgSpan(SVG_ONI, 'oni-banner-ic'));
    var t = h('div', 'oni-banner-tx');
    t.appendChild(h('div', 'oni-banner-big', '鬼ムズが開いた！'));
    t.appendChild(h('div', 'oni-banner-sub', 'まとめモードで「鬼ムズ」をえらべるようになったよ。4年のはんいをこえる問題にも ちょうせんしよう。'));
    b.appendChild(t);
    return b;
  }
  // まちがえた鬼ムズの問題の「せつめい」を見るボタン（結果画面のアドバイス）
  function oniReview(st) {
    var wrong = [];
    st.items.forEach(function (it, i) { var r = st.results && st.results[it.pid]; if (r && !r.correct) wrong.push({ it: it, no: i + 1 }); });
    if (!wrong.length) return null;
    var sec = h('div', 'mm-oni-review');
    sec.appendChild(h('h2', 'mm-h', 'まちがえた問題の せつめいを見よう'));
    wrong.forEach(function (w) {
      var p = w.it.p || {};
      var row = h('div', 'mm-oni-item');
      var body = h('div', 'mm-oni-body');
      body.hidden = true;
      var b = button(w.no + '問目の せつめいを見る', 'small mm-oni-explain', function () {
        body.hidden = !body.hidden;
        b.textContent = w.no + '問目の せつめいを' + (body.hidden ? '見る' : 'とじる');
        b.setAttribute('aria-expanded', !body.hidden);
      });
      b.setAttribute('aria-expanded', 'false');
      row.appendChild(b);
      var q = p.q || (p.type === 'hissan' ? p.a + ' ' + (p.op === '-' ? '−' : '＋') + ' ' + p.b : '');
      if (Array.isArray(p.parts)) q += (q ? '\n' : '') + p.parts.map(function (x) { return typeof x === 'string' ? x : '□'; }).join('');
      if (q) body.appendChild(h('div', 'mm-oni-q', q));
      var ans = p.type === 'fill' && Array.isArray(p.parts) ? p.parts.filter(function (x) { return x && typeof x === 'object' && x.a != null; }).map(function (x) { return String(x.a); }).join('、')
        : p.type === 'hissan' && S.Problems && S.Problems.hissanAnswer ? S.Problems.hissanAnswer(p.op === '-' ? '-' : '+', p.a, p.b).canon
        : p.type === 'order' && Array.isArray(p.items) ? '' : (p.a != null ? String(p.a) : '');
      if (ans) body.appendChild(h('div', 'mm-oni-a', '答え：' + ans));
      if (p.explain) body.appendChild(h('div', 'mm-oni-ex', p.explain));
      else if (Array.isArray(p.hints) && p.hints.length) body.appendChild(h('div', 'mm-oni-ex', p.hints.filter(function (x) { return typeof x === 'string'; }).join('\n')));
      row.appendChild(body);
      sec.appendChild(row);
    });
    return sec;
  }

  function matomeResult(main, st, R) {
    main.innerHTML = '';
    var box = h('section', 'mm-result' + (st.level === 'oni' ? ' mm-result-oni' : ''));
    if (R.oniNew) box.appendChild(oniBanner());
    box.appendChild(h('div', 'done-msg', R.finished ? 'まとめモード おつかれさま！' : 'ここまで よくがんばったね！'));
    var score = h('div', 'mm-score');
    score.appendChild(h('span', 'mm-score-big', '○ ' + R.ok));
    score.appendChild(h('span', 'mm-score-of', ' / ' + st.items.length + '問'));
    box.appendChild(score);
    var meta = h('div', 'mm-meta');
    meta.appendChild(h('span', null, levelLabel(st.level) + (st.oniStage ? ' ' + oniStageLabel(st.oniStage) : '') + '・' + st.minutes + '分コース'));
    meta.appendChild(h('span', null, 'かかった時間 ' + mmss(R.took)));
    if (R.n < st.items.length) meta.appendChild(h('span', null, 'のこした問題 ' + (st.items.length - R.n) + '問'));
    box.appendChild(meta);
    if (R.oni) {
      var O = R.oni, ob = h('div', 'mm-oni-pts');
      if (O.newStage) {
        var nb = h('div', 'oni-banner');
        nb.setAttribute('role', 'status');
        nb.appendChild(svgSpan(SVG_ONI, 'oni-banner-ic'));
        var nt = h('div', 'oni-banner-tx');
        nt.appendChild(h('div', 'oni-banner-big', oniStageLabel(O.newStage) + 'が開いた！'));
        nt.appendChild(h('div', 'oni-banner-sub', 'つぎの だん「' + ONI_STAGE_INFO[O.newStage - 1].sub + '」に ちょうせんできるよ。'));
        nb.appendChild(nt);
        box.insertBefore(nb, box.firstChild);
      }
      ob.appendChild(h('div', 'mm-oni-pts-t', '鬼ポイント'));
      var big = h('div', 'mm-oni-pts-big');
      big.appendChild(h('span', 'mm-oni-pts-n', String(O.pts)));
      big.appendChild(h('span', 'mm-oni-pts-of', ' / ' + O.max));
      ob.appendChild(big);
      if (O.record && O.pts > 0) ob.appendChild(h('div', 'mm-oni-rec', O.prevBest == null ? 'はじめての記録！' : '新記録！（前のさいこう ' + O.prevBest + '）'));
      else if (O.prevBest != null) ob.appendChild(h('div', 'mm-oni-prev', 'さいこう記録 ' + O.prevBest + 'ポイント'));
      var info = h('div', 'mm-oni-pts-info');
      info.appendChild(h('span', null, 'ヒントなしで○ ' + O.noHint + '問'));
      info.appendChild(h('span', 'boss-' + O.boss, O.boss === 'win' ? 'ボス：撃破！' : O.boss === 'lose' ? 'ボス：またちょうせん' : 'ボス：まだ'));
      ob.appendChild(info);
      if (!O.newStage && !O.clear && st.oniStage < 3 && oniStageData().max <= st.oniStage) ob.appendChild(h('p', 'mm-note', oniStageLabel(st.oniStage + 1) + 'は、' + oniStageLabel(st.oniStage) + 'を8わり以上○で さいごまでやると開くよ。'));
      box.appendChild(ob);
    }

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
    box.appendChild(h('div', 'mm-weak', weakNames.length ? 'にがてな内容：' + weakNames.join('、') + (st.level === 'oni' ? '（ヒントを見ながら、もう一度ちょうせんしよう）' : '（次の回に少し多めに出るよ）') : 'にがてな内容は なかったよ。すばらしい！'));
    if (st.level === 'oni') { var rv = oniReview(st); if (rv) box.appendChild(rv); }
    else if (st.level === 'hard' && hasOniLevel() && !oniUnlocked()) box.appendChild(h('p', 'mm-note mm-oni-hint', '「鬼ムズ」は、' + ONI_LOCK_MSG + '。'));

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
    if (R.oni && R.oni.newStage) row.appendChild(button(oniStageLabel(R.oni.newStage) + 'に ちょうせん ▶', 'primary', function () { startMatome(main, st.level, st.minutes, R.oni.newStage); }));
    row.appendChild(button('もう一回（同じレベル・時間）', R.oni && R.oni.newStage ? '' : 'primary', function () { startMatome(main, st.level, st.minutes, st.oniStage); }));
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

    var cbSec = classbookSection();
    if (cbSec) main.appendChild(cbSec);
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
    rows.push({ key: 'matome', label: 'まとめモード' + (hasOniLevel() || oniRuns() ? '（うち 鬼ムズ ' + oniRuns() + '回）' : '') });
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
  function friendAuthorKey(up) {
    if (up && up.aid) return 'd' + up.aid;
    if (up && typeof up.authorName === 'string' && up.authorName) return 'n' + up.authorName;   // 追加6：名前が文字の問題
    return authorKey(up && up.author);
  }
  /* 作った人の表示：文字（authorName）があれば文字、古い問題の手書きは絵で（追加6） */
  function authorNameNode(up, o) {
    if (up && typeof up.authorName === 'string' && up.authorName) return h('span', 'author-name-text', up.authorName);
    return inkNode(up && up.author, o);
  }
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
  var KIND_ROUTE = { problem: '#/q/', goal: '#/g/', reflection: '#/r/', record: '#/k/' };
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
        msg.textContent = /(?:#|%23)\/[qgrk]\//i.test(ta.value || '') ? 'とちゅうで切れているみたい。もう一度コピーしてね。' : 'リンクやコードが見つからなかったよ。';
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
        nm.appendChild(authorNameNode(up, { height: 40, width: 200, trim: true, lineWidth: 6, label: 'つくった人の名前' }));
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
      if (r.profile && r.profile.name) hd.appendChild(h('span', 'rcode-pname', r.profile.cls + '組 ' + r.profile.no + '番 ' + r.profile.name));
      else if (r.name && r.name.strokes && r.name.strokes.length) hd.appendChild(inkNode(r.name, { height: 56, trim: true, lineWidth: 4, label: '名前（手書き）' }));
      else hd.appendChild(h('span', 'rcode-noname', '（名前なし）'));
      hd.appendChild(h('span', 'rcode-date', dateJa(r.date, true)));
      if (r.w && r.w.eval) hd.appendChild(evalMark(r.w.eval));
      card.appendChild(hd);
      card.appendChild(reflBlock('めあて', r.meate && r.meate.choices, r.meate && r.meate.ink));
      card.appendChild(reflBlock('Y　やったこと', [].concat((r.y && r.y.auto) || [], (r.y && r.y.extra) || []), null));
      card.appendChild(reflBlock('W　わかったこと・できたこと', r.w && r.w.choices, r.w && r.w.ink));
      card.appendChild(reflBlock('T　次にやりたいこと', r.t && r.t.choices, r.t && r.t.ink));
      if (r.cut) card.appendChild(h('p', 'tnote', '（コードが長くなりすぎたので、手書きの一部をはぶいて送られています）'));
      if (r.summary) card.appendChild(summaryBlock(r.summary));
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
      var cbB = classbookAddButton(token, msg);
      if (cbB) row.appendChild(cbB);
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
    // 追加6：Microsoft Forms のURL（任意）。子どもが「先生に送る」を押すと、コードがコピーされて Forms が開く
    var f3 = h('label', 'ge-field ge-forms');
    f3.appendChild(h('span', 'ge-label', 'Forms のURL（入れなくてもよい）'));
    var forms = h('input', 'ge-input ge-forms-input');
    forms.type = 'url'; forms.maxLength = 400; forms.placeholder = 'https://forms.office.com/r/…';
    forms.autocomplete = 'off'; forms.spellcheck = false;
    forms.value = cur && cur.formsUrl ? cur.formsUrl : '';
    f3.appendChild(forms);
    sec.appendChild(f3);
    sec.appendChild(h('p', 'tnote', '質問が1つ（「コードをはりつけてください」）だけの Microsoft Forms を作り、そのURLを入れます。子どもが「先生に送る」を押すと、コードがコピーされて Forms が開きます。回答は Excel で開いて「クラスのきろく」に取りこめます。ゴールのコード・ゴール入りのアプリにも入ります。'));
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
      var fu = (forms.value || '').trim();
      if (fu) goal.formsUrl = fu;
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
  function presetForms(goal) {
    var u = goal && goal.formsUrl ? goal.formsUrl : '';
    if (!u) { try { u = S.Classbook && S.Classbook.formsUrl ? S.Classbook.formsUrl() || '' : ''; } catch (e) { u = ''; } }
    return u;
  }
  function presetScript(goal) {
    var pre = {};
    if (goal) pre.goal = goal;
    var fu = presetForms(goal);
    if (fu) pre.formsUrl = fu;
    var json = JSON.stringify(pre).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
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
    // 先生用のファイルから作るときも、子ども用（ホームから始まる）にする
    Array.prototype.slice.call(root.querySelectorAll('#teacher-start')).forEach(function (n) { n.parentNode.removeChild(n); });
    var tt = root.querySelector('title');
    if (tt) tt.textContent = tt.textContent.replace('（先生用）', '');
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
      sec.appendChild(h('p', 'tnote', g.formsUrl ? '提出：Forms（' + g.formsUrl + '）' : '提出：Teams のチャット（Forms のURLは未設定）'));
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
      if (!gg && !presetForms(null)) { warn('先にゴールを決めるか、Forms のURLを入れてください。'); return; }
      msg.textContent = 'アプリを作っています…'; msg.className = 'box-msg';
      buildGoalApp(gg).then(function (html) {
        downloadText(html, 'shosu-app.html');
        var what = (gg ? 'ゴール' : '') + (gg && presetForms(gg) ? '・' : '') + (presetForms(gg) ? 'FormsのURL' : '');
        msg.textContent = what + '入りの shosu-app.html をダウンロードしました（' + Math.round(html.length / 1024) + 'KB）。このファイルを配れば、開くだけで入ります。';
        msg.className = 'box-msg';
      }, function (e) {
        console.warn('buildGoalApp', e);
        if (e && e.code === 'NEED_SINGLE') warn('このボタンは、1ファイル版（shosu-app.html）か、Webで開いているときに使えます。');
        else warn('アプリを作れませんでした。1ファイル版（shosu-app.html）で開いて、もう一度ためしてください。');
      });
    }), 'download', 'ゴール・Forms入りのアプリをダウンロード');
    if (!g) { copyB.disabled = true; if (!presetForms(null)) dlB.disabled = true; }
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

  /* ---------- 追加6：じぶんのこと（組・出席番号・名前）・学習のきろく・クラスのきろく ---------- */
  function profileApi() { return S.Profile && S.Profile.get ? S.Profile : null; }
  function myProfile() { var pa = profileApi(); if (!pa) return null; try { return pa.get(); } catch (e) { return null; } }
  function profileLabel(p) { var pa = profileApi(); return p ? (pa && pa.label ? pa.label(p) : p.cls + '組 ' + p.no + '番 ' + p.name) : ''; }

  /* ホームのいちばん上：じぶんのこと（はじめては大きな案内）・学習のきろくを先生に送る */
  function homeProfileSection() {
    var p = myProfile();
    var sec = h('section', 'home-me' + (p ? '' : ' home-me-first'));
    if (!profileApi()) return sec;
    if (!p) {
      var a = link('', 'me-first', '#/me');
      a.appendChild(iconEl('pen', 'me-first-icon') || h('span', 'me-first-icon'));
      var t = h('span', 'me-first-text');
      t.appendChild(h('span', 'me-first-title', 'さいしょに じぶんのことを入れよう'));
      t.appendChild(h('span', 'me-first-sub', '組・出席番号・名前を入れてね。ふりかえりや、作った問題に名前が出るよ'));
      a.appendChild(t);
      a.appendChild(arrows(h('span', 'me-first-go', 'いれる ▶')));
      sec.appendChild(a);
      return sec;
    }
    var bar = h('div', 'me-bar');
    var who = h('div', 'me-who');
    who.appendChild(h('span', 'me-who-label', 'じぶんのこと'));
    who.appendChild(h('span', 'me-who-name', profileLabel(p)));
    who.appendChild(link('変更', 'btn small me-edit', '#/me'));
    bar.appendChild(who);
    var msg = h('span', 'box-msg me-msg');
    msg.setAttribute('role', 'status');
    var box = h('div', 'me-codebox');
    box.hidden = true;
    var sendB = withIcon(button('', 'me-send', function () { sendRecord(sendB, msg, box); }), 'letter', '学習のきろくを先生に送る');
    bar.appendChild(sendB);
    sec.appendChild(bar);
    sec.appendChild(msg);
    sec.appendChild(box);
    return sec;
  }
  /* 「学習のきろくを先生に送る」：じぶんのこと＋学習データのまとめをコードにして、コピー（Forms があれば開く） */
  function sendRecord(btn, msg, box) {
    var sh = shareApi(), p = myProfile();
    function warn(t) { msg.textContent = t; msg.className = 'box-msg me-msg warn'; }
    if (!p) { location.hash = '#/me'; return; }
    if (!(sh && sh.encodeRecord)) { warn('送る機能は、まだじゅんび中です。'); return; }
    var sm = null;
    try { sm = S.Summary && S.Summary.build ? S.Summary.build() : null; } catch (e) { console.error('Summary.build', e); }
    if (!sm) { warn('学習のきろくを作れませんでした。'); return; }
    btn.disabled = true;
    Promise.resolve().then(function () { return sh.encodeRecord({ profile: p, summary: sm }); }).then(function (tok) {
      btn.disabled = false;
      var text = sh.codeText ? sh.codeText(tok) : tok;
      var rf = reflectApi();
      if (rf && rf.deliver) return rf.deliver(text, { msg: msg, codeBox: box, msgClass: 'box-msg me-msg' });
      copyText(text, box, 'コードをコピーしたよ。Teams の先生へのチャットに はりつけてね。');
    }).catch(function (e) {
      btn.disabled = false;
      console.warn('encodeRecord', e && e.message);
      warn('コードを作れませんでした。');
    });
  }
  /* #/me：じぶんのこと */
  function viewMe(sub) {
    app.appendChild(topbar('じぶんのこと'));
    var main = h('main', 'me-page');
    app.appendChild(main);
    var pa = profileApi();
    if (!(pa && pa.mountForm)) { main.appendChild(h('div', 'empty-note', 'この画面は、じゅんび中です。')); return; }
    var card = h('section', 'tcard me-card');
    card.appendChild(h('h2', null, myProfile() ? 'じぶんのことを なおす' : 'じぶんのことを入れよう'));
    card.appendChild(h('p', 'tnote', '組・出席番号・名前を入れてね。ふりかえりや、作った問題の「作った人」に、この名前が出るよ。先生に送るコードにも入るよ。'));
    main.appendChild(card);
    var hd = pa.mountForm(card, { focusName: false, saveLabel: 'これでOK', onSave: function () {
      toast('じぶんのことを ほぞんしたよ');
      setTimeout(function () { location.hash = sub === 'reflect' ? '#/reflect' : '#/'; }, 300);
    }, onCancel: myProfile() ? function () { location.hash = '#/'; } : null });
    cleanups.push(function () { if (hd && hd.destroy) hd.destroy(); });
  }

  /* 学習のまとめを先生用に小さく見せる */
  function pct(x) { return x == null ? '—' : Math.round(x * 100) + '%'; }
  function summaryBlock(sm) {
    var b = h('div', 'rcode-block sum-block');
    b.appendChild(h('h3', null, '学習のまとめ' + (sm.at ? '（' + dateJa(String(sm.at).slice(0, 10)) + 'まで）' : '')));
    var g = h('div', 'sum-grid');
    function cell(label, val) { var c = h('div', 'sum-cell'); c.appendChild(h('span', 'sum-label', label)); c.appendChild(h('span', 'sum-val', val)); g.appendChild(c); }
    var tried = 0, total = 0, corr = 0;
    (sm.lessons || []).forEach(function (l) { if (l && l.tried) tried++; total += (l && l.tried) || 0; corr += (l && l.correct) || 0; });
    cell('学習した日数', (sm.days || 0) + '日');
    cell('合計時間（目安）', (sm.min || 0) + '分');
    cell('取り組んだ時', tried + ' / ' + ((sm.lessons || []).length || 10));
    cell('教科書の問題', corr + ' / ' + total + '問○');
    var m = sm.matome || {}, o = sm.osusume || {};
    cell('まとめモード', (m.n || 0) + '回・' + pct(m.rate));
    cell('おすすめモード', (o.n || 0) + '回・' + pct(o.rate));
    cell('ふりかえり', ((sm.reflect && sm.reflect.n) || 0) + '回');
    cell('星', ((sm.stars && sm.stars.n) || 0) + 'こ' + (sm.stars && sm.stars.title ? '（' + sm.stars.title + '）' : ''));
    b.appendChild(g);
    var lr = h('div', 'sum-lessons');
    (sm.lessons || []).forEach(function (l) {
      if (!l) return;
      var c = h('div', 'sum-lesson' + (l.tried ? '' : ' none'));
      c.appendChild(h('span', 'sum-lno', '第' + l.no + '時'));
      c.appendChild(h('span', 'sum-lval', l.tried ? l.correct + '/' + l.total : '—'));
      lr.appendChild(c);
    });
    b.appendChild(lr);
    return b;
  }
  function classbookApi() { return S.Classbook || null; }
  /* 「クラスのきろくに入れる」（Classbook.importText があるときだけ） */
  function classbookAddButton(token, msg) {
    var cb = classbookApi(), sh = shareApi();
    if (!(cb && typeof cb.importText === 'function')) return null;
    var b = button('クラスのきろくに入れる', 'primary', function () {
      var res = null;
      try { res = cb.importText(sh && sh.codeText ? sh.codeText(token) : token); } catch (e) { console.error('Classbook.importText', e); }
      Promise.resolve(res).then(function (r) {
        if (!r) { msg.textContent = '入れられませんでした。'; msg.className = 'box-msg warn'; return; }
        msg.textContent = 'クラスのきろくに入れました。';
        msg.className = 'box-msg';
        b.disabled = true;
      }, function () { msg.textContent = '入れられませんでした。'; msg.className = 'box-msg warn'; });
    });
    return b;
  }
  /* #/k/<token>：学習のきろくのコード（先生用） */
  function viewRecordCode(token) {
    var gen = routeGen;
    app.appendChild(h('div', 'q-loading', '学習のきろくのコードをひらいています…'));
    var sh = shareApi();
    var p = sh && sh.decodeRecord ? Promise.resolve().then(function () { return sh.decodeRecord(token); }) : Promise.reject(new Error('Share がありません'));
    p.then(function (rec) {
      if (gen !== routeGen) return;
      app.innerHTML = '';
      app.appendChild(topbar('学習のきろくのコード', { sub: '先生用' }));
      var main = h('main', 'rcode kcode');
      var card = h('section', 'tcard rcode-card');
      var hd = h('div', 'rcode-head');
      hd.appendChild(h('span', 'rcode-pname', rec.profile.cls + '組 ' + rec.profile.no + '番 ' + rec.profile.name));
      card.appendChild(hd);
      card.appendChild(summaryBlock(rec.summary || {}));
      main.appendChild(card);
      var row = h('div', 'goal-row');
      var msg = h('span', 'box-msg');
      msg.setAttribute('role', 'status');
      var cbB = classbookAddButton(token, msg);
      if (cbB) row.appendChild(cbB);
      else row.appendChild(h('span', 'tnote', '先生メニューの「クラスのきろく」に、このコードをはりつけて取りこめます。'));
      if (classbookApi() && classbookApi().mount) row.appendChild(link('クラスのきろくを開く ▶', 'btn', '#/classbook'));
      row.appendChild(msg);
      main.appendChild(row);
      app.appendChild(main);
    }, function (e) {
      if (gen !== routeGen) return;
      console.warn('学習のきろくのコードを開けませんでした', e && e.message);
      app.innerHTML = '';
      codeError('学習のきろくのコード', 'この学習のきろくのコードは開けませんでした');
    });
  }
  /* 先生メニューの「クラスのきろく」（Classbook.teacherSection があれば） */
  function classbookSection() {
    var cb = classbookApi();
    if (!(cb && typeof cb.teacherSection === 'function')) return null;
    try {
      var el = cb.teacherSection();
      return el && el.nodeType === 1 ? el : null;
    } catch (e) { console.error('Classbook.teacherSection', e); return null; }
  }
  /* #/classbook、#/classbook/<cls>/<no> */
  function viewClassbook(cls, no) {
    var c = parseInt(cls, 10), n = parseInt(no, 10);
    var opts = {};
    if (c >= 1 && c <= 9) opts.cls = c;
    if (opts.cls && n >= 1 && n <= 45) opts.no = n;
    var back = link('◀ 先生メニュー', 'btn back', '#/teacher');
    app.appendChild(topbar('クラスのきろく', { sub: '先生用', right: back }));
    var main = h('main', 'classbook-host');
    app.appendChild(main);
    var cb = classbookApi();
    if (!(cb && typeof cb.mount === 'function')) {
      main.appendChild(h('div', 'empty-note', 'この画面は、じゅんび中です。'));
      main.appendChild(link('先生メニューへ', 'btn primary', '#/teacher'));
      return;
    }
    var hd = null;
    try { hd = cb.mount(main, opts); }
    catch (e) { console.error('Classbook.mount', e); main.appendChild(h('div', 'empty-note', '画面を表示できませんでした。')); }
    cleanups.push(function () { if (hd && hd.destroy) { try { hd.destroy(); } catch (e) { console.error(e); } } });
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
      else if (parts[0] === 'k' && parts[1]) viewRecordCode(hash.slice(2));
      else if (parts[0] === 'me') viewMe(parts[1]);
      else if (parts[0] === 'classbook') viewClassbook(parts[1], parts[2]);
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
