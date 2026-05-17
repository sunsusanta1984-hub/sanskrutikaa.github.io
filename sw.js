/**
 * SANSKRUTIKAA HANDLOOMS — Service Worker v2.0.0
 * Fixed for GitHub Pages subfolder
 */

const APP_NAME = 'Sanskrutikaa';
const CACHE_VERSION = 'v2.0.0';
const STATIC_CACHE  = `${APP_NAME}-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${APP_NAME}-dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE   = `${APP_NAME}-images-${CACHE_VERSION}`;
const BASE = '/sanskrutikaa.github.io';

const STATIC_ASSETS = [
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/offline.html`,
  `${BASE}/icons/icon-192x192.png`,
  `${BASE}/icons/icon-512x512.png`,
];

const DYNAMIC_CACHE_MAX = 50;
const IMAGE_CACHE_MAX   = 30;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => console.warn('[SW] Cache error:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith(APP_NAME) && key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== IMAGE_CACHE)
          .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.href.includes('wa.me')) return;

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_MAX));
    return;
  }
  if (request.destination === 'document' || url.pathname.endsWith('.html')) {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE, DYNAMIC_CACHE_MAX));
});

async function cacheFirst(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) { await cache.put(request, response.clone()); }
    return response;
  } catch { return new Response('', { status: 408 }); }
}

async function networkFirstWithOffline(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(DYNAMIC_CACHE);
    await cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return caches.match(`${BASE}/offline.html`);
  }
}

async function staleWhileRevalidate(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

console.log(`[SW] Sanskrutikaa Service Worker ${CACHE_VERSION} ready`);
