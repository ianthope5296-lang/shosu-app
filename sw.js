/* sw.js — オフライン用キャッシュ（ネットワーク優先）
 * つながっているときは毎回いちばん新しいファイルを取りに行き、キャッシュも新しくする。
 * つながらないとき（または応答がおそいとき）だけキャッシュを使う。
 * そのため、ファイルを更新すれば子どもの端末にも自動で新しい版が届く。
 * VERSION はキャッシュのしくみ自体を変えたときだけ上げる。 */
var VERSION = 'shosu-v6';
var CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/demos.css',
  './css/maker.css',
  './css/present.css',
  './css/stars.css',
  './css/planner.css',
  './css/reflect.css',
  './js/preset.js',
  './model/digit-model.js',
  './js/icons.js',
  './js/store.js',
  './js/session.js',
  './js/stars.js',
  './js/share.js',
  './js/recognizer.js',
  './js/figures.js',
  './js/pad.js',
  './js/problems.js',
  './js/present.js',
  './js/generators.js',
  './js/matome.js',
  './js/demos/core.js',
  './js/lessons.js',
  './js/maker.js',
  './js/planner.js',
  './js/reflect.js',
  './js/app.js'
];

function addAll(cache, urls) {
  // 1つ失敗しても、ほかはキャッシュする
  return Promise.all(urls.map(function (u) {
    return fetch(u, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok) return cache.put(u, res);
    }).catch(function () {});
  }));
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return addAll(c, CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// ページから「読みこんだファイルの一覧」を受け取り、まだなければキャッシュする
self.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'cache-urls' && Array.isArray(d.urls)) {
    var urls = d.urls.filter(function (u) { return typeof u === 'string' && u.indexOf(self.location.origin) === 0; });
    e.waitUntil(caches.open(VERSION).then(function (c) {
      return Promise.all(urls.map(function (u) {
        return c.match(u, { ignoreSearch: true }).then(function (hit) { if (!hit) return addAll(c, [u]); });
      }));
    }));
  }
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.url.indexOf(self.location.origin) !== 0) return;
  e.respondWith(caches.open(VERSION).then(function (c) {
    var fromCache = function () {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === 'navigate') return c.match('./index.html');
        return new Response('', { status: 504 });
      });
    };
    var net = fetch(req, { cache: 'no-cache' }).then(function (res) {
      if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    });
    // 4秒たっても返事がなければキャッシュを使う（学校の回線が混んでいるとき用）
    var timeout = new Promise(function (resolve) { setTimeout(resolve, 4000); }).then(function () {
      return c.match(req, { ignoreSearch: true }).then(function (hit) { return hit || net; });
    });
    return Promise.race([net, timeout]).catch(fromCache);
  }));
});
