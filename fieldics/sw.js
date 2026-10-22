/*
 * FieldICS service worker: keeps the app on the device so it opens with no connection.
 * Change CACHE whenever any app file changes, so installed copies pick up the update.
 */
var CACHE = 'field-ics-v3-1';
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'js/forms.js',
  'js/core.js',
  'js/store.js',
  'js/print.js',
  'js/checks.js',
  'js/setup.js',
  'js/metrics.js',
  'js/secure.js',
  'js/qr.js',
  'js/pdf.js',
  'js/data/fema-rates-2025.js',
  'fonts/ibm-plex-sans-latin-400-normal.woff2',
  'fonts/ibm-plex-sans-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-latin-600-normal.woff2',
  'fonts/ibm-plex-sans-condensed-latin-500-normal.woff2',
  'fonts/ibm-plex-sans-condensed-latin-600-normal.woff2',
  'js/app/base.js',
  'js/app/state.js',
  'js/app/shell.js',
  'js/app/log.js',
  'js/app/editor.js',
  'js/app/photos.js',
  'js/app/lists.js',
  'js/app/costs.js',
  'js/app/records.js',
  'js/app/dialogs.js',
  'js/app/share.js',
  'js/app/printing.js',
  'js/app/checkin.js',
  'js/app/locality.js',
  'js/app/readiness.js',
  'js/app/tools.js',
  'js/app/lock.js',
  'js/app/transfer.js',
  'js/app/main.js',
  'js/vendor/qrcode-generator-2.0.4.js',
  'js/vendor/jsqr-1.4.0.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('field-ics-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === 'navigate') return caches.match('index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
