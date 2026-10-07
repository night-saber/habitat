/* Habitat — service worker for offline support. */
"use strict";

const CACHE_NAME = "habitat-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/i18n.js",
  "./js/trades.js",
  "./js/worker-comms.js",
  "./js/mobile.js",
  "./manifest.json",
  "./assets/favicon.svg",
  "./assets/icon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Network-first for external resources (Leaflet tiles, etc.)
  if (url.origin !== location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for HTML (always get latest)
  if (e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname === "/") {
    e.respondWith(
      fetch(e.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return response;
      });
    })
  );
});
