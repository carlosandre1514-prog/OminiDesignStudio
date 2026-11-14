// OmniDesign Studio service worker: offline cache for the app shell and built assets.
// Paths are relative to the worker's scope so the app works at "/" and under a sub-path (GitHub Pages).
const CACHE = 'omnidesign-v2';
const BASE = new URL(self.registration.scope).pathname;
const SHELL = [BASE, `${BASE}index.html`, `${BASE}icon.svg`, `${BASE}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // Navigation: network first, fall back to the cached shell (SPA routing offline).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(`${BASE}index.html`)));
    return;
  }
  // Static assets: cache first, then network (and store).
  event.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })),
  );
});
