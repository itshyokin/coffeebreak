/* Coffee Break service worker: lets the site open offline.
   Strategy: serve from cache right away, refresh the cache in the background.
   Bump VERSION when you want every device to drop old files. */
const VERSION = 'cb-v2';
const SHELL = [
  './', 'index.html', 'mandarin.html', 'trivia.html', 'wheel.html', 'blackjack.html', 'manifest.webmanifest',
  'css/app.css', 'css/mandarin.css', 'css/games.css', 'js/core.js', 'js/mandarin.js', 'js/wiki.js', 'js/trivia.js', 'js/wheel.js', 'js/blackjack.js', 'data/hsk.js', 'data/phrases.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return; // live data (e.g. Wikipedia) always goes to the network
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    const fresh = fetch(req).then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => cached);
    return cached || fresh;
  }));
});
