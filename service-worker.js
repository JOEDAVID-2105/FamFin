const CACHE_NAME = "famfin-cache-v1";
const urlsToCache = [
  "./",
  "./index.html",
  "./login.html",
  "./family.html",
  "./app.css",
  "./app.js",
  "./applogo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp => resp || fetch(event.request))
  );
});
