/* ==========================================================================
   Road Trip Dashboard — service worker
   Caches the static app shell so the dashboard opens instantly and works
   fully offline (except the outbound Google Maps links, which need a
   connection by definition). Bump CACHE_VERSION whenever shell files change
   so returning users pick up the new build instead of a stale cache.
   ========================================================================== */

const CACHE_VERSION = "roadtrip-v2";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Cache-first for the app shell (same-origin GET requests). Anything else
// -- Google Maps navigation, tel: links, cross-origin calls -- passes
// straight through to the network untouched.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
