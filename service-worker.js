/* =================================================================
   HARXORA VIBEZ — Offline Service Worker
   Cache-first shell strategy for reliable offline playback
   ================================================================= */

const CACHE_PREFIX = 'harxora-vibez-';
const CACHE_NAME = 'harxora-vibez-v8';

// Essential shell resources required to boot and run offline
const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './assets/icons/neon-h-music-wave-icon.png'
];

// Installation: pre-cache application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activation: purge only outdated caches belonging specifically to Harxora Vibez
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first for shell assets with network fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignore non-GET requests and internal schemes
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Do not intercept blob:, data:, or chrome-extension: schemes
  if (!url.protocol.startsWith('http')) return;

  // Navigation requests: return index.html from cache if offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('./index.html') || caches.match('./');
      })
    );
    return;
  }

  // Same-origin shell assets: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
            const copy = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return networkRes;
        }).catch(() => {
          // If offline and requesting an image, fallback to unified icon if available
          if (req.destination === 'image') {
            return caches.match('./assets/icons/neon-h-music-wave-icon.png');
          }
        });
      })
    );
  }
});
