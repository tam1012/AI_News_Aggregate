const CACHE_VERSION = 'synthnews-v2';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
];

function isSafeApiGet(request, url) {
  if (request.method !== 'GET') return false;
  if (!url.pathname.startsWith('/api/')) return false;

  const path = url.pathname.replace(/^\/api/, '');
  return (
    path.startsWith('/articles') ||
    path.startsWith('/digests/latest') ||
    path === '/sources'
  );
}

function offlineJson(url) {
  const path = url.pathname.replace(/^\/api/, '');
  if (path.startsWith('/articles/dates')) {
    return { success: true, data: [], offline: true };
  }
  if (path.startsWith('/articles')) {
    return { success: true, data: [], offline: true };
  }
  if (path.startsWith('/digests/latest')) {
    return { success: true, data: null, offline: true };
  }
  if (path === '/sources') {
    return { success: true, data: [], offline: true };
  }
  return { success: false, offline: true, error: { code: 'OFFLINE', message: 'Offline' } };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(CACHE_VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallbackResponse) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return fallbackResponse;
  }
}

async function cacheFirst(request) {
  const shell = await caches.open(APP_SHELL_CACHE);
  const cached = await shell.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    shell.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isSafeApiGet(request, url)) {
    event.respondWith(networkFirst(request, new Response(JSON.stringify(offlineJson(url)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, caches.match('/')));
    return;
  }

  if (APP_SHELL.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request));
  }
});
