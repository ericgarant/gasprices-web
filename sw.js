// Service worker: the app shell works offline. Price data is cached by the app itself (localStorage).
const VERSION = 'lp-v2';
const SHELL = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'design-system/styles.css',
  'js/main.js', 'js/data.js', 'js/util.js', 'js/effects.js', 'js/heat.js', 'js/history.js', 'js/sharecard.js', 'icons/icon.svg', 'icons/icon-192.png',
];
const CDN = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(SHELL);
    await Promise.all(CDN.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k !== VERSION && k !== 'lp-tiles' && k !== 'lp-fonts') await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Live price feed: always the network (the app caches the parsed result).
  if (url.hostname === 'regieessencequebec.ca') return;
  // Map tiles and fonts: stale-while-revalidate with a small runtime cache.
  if (url.hostname.endsWith('tile.openstreetmap.org')) { e.respondWith(staleWhileRevalidate(req, 'lp-tiles', 300)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(staleWhileRevalidate(req, 'lp-fonts', 30)); return; }
  // App files and pinned CDN libraries: network first, cache fallback (so a deploy shows up on the next load).
  if (url.origin === location.origin || CDN.includes(req.url)) {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok) (await caches.open(VERSION)).put(req, r.clone());
        return r;
      } catch (err) {
        const hit = await caches.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
        return Response.error();
      }
    })());
  }
});

async function staleWhileRevalidate(req, name, max) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  const net = fetch(req).then(async (r) => {
    if (r.ok || r.type === 'opaque') {
      await c.put(req, r.clone());
      const keys = await c.keys();
      for (const k of keys.slice(0, Math.max(0, keys.length - max))) await c.delete(k);
    }
    return r;
  }).catch(() => null);
  return hit || (await net) || Response.error();
}
