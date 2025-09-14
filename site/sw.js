// Versioned cache so you can bust it after deploys
const CACHE = "lala-v1";

const PRECACHE = [
  "/",                     // default root object -> index.html via CloudFront
  "/index.html",
  "/assets/css/styles.css",
  "/assets/manifest.webmanifest",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/pwa-maskable-192.png",
  "/assets/icons/pwa-maskable-512.png",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategy: network-first for HTML; stale-while-revalidate for static assets
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin
  if (url.origin !== location.origin) return;

  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put("/", copy));
        return r;
      }).catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  // Static assets
  if (/\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|json)$/i.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(networkResp => {
          const respClone = networkResp.clone();
          caches.open(CACHE).then(c => c.put(req, respClone));
          return networkResp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
