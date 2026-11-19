/* sw.js — オフライン用キャッシュ（キャッシュファースト）
 * ファイルを更新したら VERSION を上げる。古いキャッシュは activate で消える。 */
var VERSION = 'shosu-v2';
var CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './css/demos.css',
  './css/maker.css',
  './css/present.css',
  './model/digit-model.js',
  './js/store.js',
  './js/share.js',
  './js/recognizer.js',
  './js/figures.js',
  './js/pad.js',
  './js/problems.js',
  './js/present.js',
  './js/generators.js',
  './js/demos/core.js',
  './js/lessons.js',
  './js/maker.js',
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
    return c.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return c.match('./index.html');
        return new Response('', { status: 504 });
      });
    });
  }));
});
