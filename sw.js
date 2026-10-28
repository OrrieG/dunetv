/* Service worker: caches the app shell so the TV can start Dune TV even if the
   host is briefly unreachable. Addon/stream traffic is never cached.
   Bump CACHE when you change app files so TVs pick up the new version. */
var CACHE = 'dunetv-v1';
var SHELL = ['./', './index.html', './css/app.css', './js/keys.js', './js/nav.js', './js/addons.js', './js/torrent.js', './js/player.js', './js/app.js',
  'https://cdn.jsdelivr.net/npm/webtorrent@1.9.7/webtorrent.min.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  var isShell = SHELL.some(function (s) { return url.indexOf(s.replace('./', '')) >= 0 && (url.indexOf(self.registration.scope) === 0 || s.indexOf('https://') === 0); });
  if (!isShell || e.request.method !== 'GET') return; // addons, posters, streams: straight to network
  // network first, fall back to cache
  e.respondWith(fetch(e.request).then(function (r) { var copy = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, copy); }); return r; })
    .catch(function () { return caches.match(e.request); }));
});
