// Bump CACHE_NAME whenever ANY file in ASSETS changes — assets are served
// cache-first, so an unbumped version never reaches already-installed clients.
// Install is atomic (cache.addAll): on a flaky first visit it can fail whole;
// accepted for this deployment (home-wifi iPad) — retry happens next visit.
var CACHE_NAME = 'calm-station-v6';
var ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-192.svg',
  './icon-512.svg',
  './audio/music/bowls.mp3',
  './audio/music/tides.mp3',
  './audio/music/forest-rain.mp3',
  './audio/sfx/chime.mp3',
  './audio/sfx/drop.mp3',
  './audio/sfx/bird.mp3',
  './audio/sfx/bowl.mp3',
  './audio/sfx/breeze.mp3',
  './modes/registry.js',
  './modes/currents.js',
  './modes/orbits.js',
  './modes/mandala.js',
  './modes/bloom.js',
  './modes/morph.js',
  './modes/echo.js',
  './modes/etch.js',
  './modes/invert.js',
];

// Install: cache all core assets
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for assets
self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);

  // Skip non-GET and cross-origin
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // HTML: network-first (get latest, fallback to cache)
  if (e.request.mode === 'navigate' || e.request.headers.get('accept').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Assets: cache-first (fast loads, fallback to network)
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        // Cache Google Fonts and other assets on first load
        if (res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return res;
      });
    })
  );
});
