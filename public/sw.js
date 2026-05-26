/**
 * Que — Service Worker Bouncer
 *
 * Strategy:
 *  - Install:  pre-cache the app shell (logo, manifest, offline page)
 *  - Activate: purge stale caches
 *  - Fetch:
 *      /api/*          → network-only   (auth cookies must not be cached)
 *      /auth/*         → network-only   (sign-in page always fresh)
 *      navigation      → network-first, fall back to cached shell
 *      static assets   → cache-first, revalidate in background
 */

const CACHE = 'que-v3'; // bump on every deploy that changes JS/CSS

const PRECACHE = [
  '/',
  '/index.html',
  '/Que_logo.png',
  '/manifest.json',
];

/* ── Install: cache app shell ──────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: evict old caches ────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── Push notifications ────────────────────────────────────────────── */
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Que', {
      body:  data.body  ?? '',
      icon:  '/Que_logo.png',
      badge: '/Que_logo.png',
      data:  { url: data.url ?? '/' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(event.notification.data.url);
    })
  );
});

/* ── Fetch: route-based bouncer ────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // API + auth routes — NEVER cache, always hit network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation requests — network-first, fall back to cached root
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/') || caches.match(request))
    );
    return;
  }

  // JS / CSS — always network-first so logic updates reach users immediately.
  // Fall back to cache only when offline.
  if (request.method === 'GET' && (
    url.pathname.endsWith('.js') || url.pathname.endsWith('.css')
  )) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // All other static assets (images, fonts, manifest) — cache-first
  if (request.method === 'GET') {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(request).then(cached => {
          const networkFetch = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          });
          return cached || networkFetch;
        })
      )
    );
  }
});
