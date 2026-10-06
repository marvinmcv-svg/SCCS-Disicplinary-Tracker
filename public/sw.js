/**
 * Service worker for the SCCS Discipline Tracker PWA.
 *
 * The previous version was cache-first for *every* request, including `/api/*`.
 * That is wrong for this app in two ways:
 *
 *   1. Disciplinary data would be served from cache indefinitely — a teacher
 *      could log an incident and a colleague would keep seeing the old list.
 *   2. Authenticated responses were written into a shared cache. On a staff
 *      room computer, one user's student data could be served to the next
 *      person to open the app.
 *
 * So: API requests never touch the cache. Next.js build assets are cache-first because
 * their filenames are fingerprinted, which makes them safe to keep.
 */

const VERSION = 'v4';
const SHELL_CACHE = `sccs-shell-${VERSION}`;
const ASSET_CACHE = `sccs-assets-${VERSION}`;

// The minimum needed to render the app shell offline.
const SHELL_FILES = ['/', '/manifest.json', '/sccs.png', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // Individually, so one missing file does not fail the whole install.
      .then(cache => Promise.allSettled(SHELL_FILES.map(f => cache.add(f))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then(names => Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function store(cacheName, key, response) {
  // Only whole, same-origin, successful responses (never 206 partial video).
  if (response.status !== 200 || response.type !== 'basic') return;
  const copy = response.clone();
  caches.open(cacheName).then(cache => cache.put(key, copy)).catch(() => {});
}

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET' || request.headers.has('range')) return;

  const url = new URL(request.url);

  // Never cache anything from another origin.
  if (url.origin !== self.location.origin) return;

  // API traffic goes straight to the network, always. No caching, no offline
  // fallback — stale disciplinary data is worse than an honest error.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, so a deploy is picked up immediately, falling
  // back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (url.pathname === '/') store(SHELL_CACHE, '/', response);
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')).then(r => r || Response.error()))
    );
    return;
  }

  // Build assets: cache first. Next.js fingerprints these filenames, so a
  // cached copy is always correct for the build that requested it.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(response => {
            store(ASSET_CACHE, request, response);
            return response;
          })
      )
    );
    return;
  }

  // Everything else (icons, images): network first, cache as a fallback.
  event.respondWith(
    fetch(request)
      .then(response => {
        store(ASSET_CACHE, request, response);
        return response;
      })
      .catch(() => caches.match(request).then(r => r || Response.error()))
  );
});
