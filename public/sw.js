// eSports Lightweight Service Worker for Reliable Updates & Fast Asset Caching
const CACHE_NAME = 'esports-shell-__ESPORTS_SW_VERSION__';
const PRECACHE_URLS = [
  '/icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => {})
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
          return Promise.resolve(false);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept cross-origin requests, API routes, SSE streams, manifest, sw.js, or Vite dev modules/queries
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.pathname.includes('sync-stream') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src') ||
    url.pathname.includes('node_modules') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json' ||
    url.searchParams.has('t') ||
    url.searchParams.has('v') ||
    url.searchParams.has('import') ||
    url.searchParams.has('direct') ||
    url.searchParams.has('_sw_bust')
  ) {
    return;
  }

  // Always use Network-First (no-store) for HTML navigations so deploys and dev edits never serve stale index.html
  const accept = event.request.headers.get('accept') || '';
  if (
    event.request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    accept.includes('text/html')
  ) {
    event.respondWith(
      fetch(event.request.url, { cache: 'no-store', credentials: 'same-origin' })
        .then((networkResponse) => {
          const contentType = networkResponse.headers.get('content-type') || '';
          if (networkResponse.ok && contentType.includes('text/html')) {
            const copy = networkResponse.clone();
            const copyRoot = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request.url, copy).catch(() => {});
              if (url.pathname === '/') {
                cache.put('/', copyRoot).catch(() => {});
              }
            }).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request.url).then((m) => m || caches.match('/')))
    );
    return;
  }

  // Immutable hashed Vite production build assets (/assets/*): Cache-First ONLY when content-type is NOT HTML
  if (url.pathname.startsWith('/assets/') && !url.pathname.startsWith('/assets/aistudio')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          const cachedType = cachedResponse.headers.get('content-type') || '';
          if (!cachedType.includes('text/html')) {
            return cachedResponse;
          }
          caches.open(CACHE_NAME).then((cache) => cache.delete(event.request)).catch(() => {});
        }
        return fetch(event.request).then((networkResponse) => {
          const contentType = networkResponse.headers.get('content-type') || '';
          if (networkResponse.ok && !contentType.includes('text/html')) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Other static files (icons, unhashed assets): Network-First so updates appear immediately on mobile & desktop
  event.respondWith(
    fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((networkResponse) => {
        const contentType = networkResponse.headers.get('content-type') || '';
        if (networkResponse.ok && networkResponse.type === 'basic' && !contentType.includes('text/html')) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request.url, copy)).catch(() => {});
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request.url))
  );
});
