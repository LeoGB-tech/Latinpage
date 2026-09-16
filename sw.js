/* Version du cache : incrémentée à chaque déploiement (cache-v2, cache-v3…).
   Le workflow GitHub Actions la remplace automatiquement par le numéro du déploiement. */
const CACHE = "cache-v1";

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/app.js",
  "data/citations.json",
  "data/credits.json",
  "fonts/cormorant-garamond-latin-700-normal.woff2",
  "fonts/eb-garamond-latin-400-normal.woff2",
  "fonts/eb-garamond-latin-400-italic.woff2",
  "fonts/eb-garamond-latin-700-normal.woff2",
  "fonts/eb-garamond-latin-700-italic.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    // Préchargement de toutes les illustrations dès la première visite
    try {
      const quotes = await (await cache.match("data/citations.json")).json();
      const stems = [...new Set(quotes.map((q) => q.image.replace(/\.webp$/i, "")))];
      const files = stems.flatMap((s) => [`img/${s}.webp`, `img/${s}-540.webp`]);
      await Promise.allSettled(files.map((f) => cache.add(f)));
    } catch (e) { /* les illustrations seront mises en cache à la lecture */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Cache-first : aucune dépendance réseau après la première visite
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
      return Response.error();
    }
  })());
});
