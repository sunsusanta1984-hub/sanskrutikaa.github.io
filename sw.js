/**
 * SANSKRUTIKAA HANDLOOMS — Service Worker
 * PWA offline support, caching, background sync, push notifications
 * Version: 1.0.0
 */

const APP_NAME = 'Sanskrutikaa';
const CACHE_VERSION = 'v1.0.0';
const STATIC_CACHE  = `${APP_NAME}-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `${APP_NAME}-dynamic-${CACHE_VERSION}`;
const IMAGE_CACHE   = `${APP_NAME}-images-${CACHE_VERSION}`;

// Files to pre-cache on install (App Shell)
  const STATIC_ASSETS = [
  '/sanskrutikaa.github.io/index.html',
  '/sanskrutikaa.github.io/manifest.json',
  '/sanskrutikaa.github.io/offline.html',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-maskable-512x512.png',
];

// Max items in dynamic cache
const DYNAMIC_CACHE_MAX = 50;
const IMAGE_CACHE_MAX   = 30;

// ─── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${APP_NAME} Service Worker ${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Pre-caching app shell');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some static assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ─── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${APP_NAME} Service Worker ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => {
          return key.startsWith(APP_NAME) &&
                 key !== STATIC_CACHE &&
                 key !== DYNAMIC_CACHE &&
                 key !== IMAGE_CACHE;
        }).map(key => {
          console.log(`[SW] Deleting old cache: ${key}`);
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// ─── FETCH STRATEGY ─────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, analytics
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.href.includes('google-analytics')) return;
  if (url.href.includes('wa.me')) return;

  // Strategy 1: Images → Cache First, fallback to network
  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, IMAGE_CACHE_MAX));
    return;
  }

  // Strategy 2: Static assets → Cache First
  if (STATIC_ASSETS.some(asset => url.pathname.endsWith(asset.replace('/', '')))) {
    event.respondWith(cacheFirst(request, STATIC_CACHE, null));
    return;
  }

  // Strategy 3: HTML pages → Network First, fallback to cache, then offline page
  if (request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(networkFirstWithOffline(request));
    return;
  }

  // Strategy 4: Everything else → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request, DYNAMIC_CACHE, DYNAMIC_CACHE_MAX));
});

// ─── CACHE STRATEGIES ───────────────────────────────────────

async function cacheFirst(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      if (maxItems) await trimCache(cacheName, maxItems);
    }
    return response;
  } catch {
    return new Response('', { status: 408, statusText: 'Network unavailable' });
  }
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
    // Return the main app (SPA fallback)
    const indexCached = await caches.match('/index.html');
    if (indexCached) return indexCached;
    return caches.match('/offline.html');
  }
}

async function staleWhileRevalidate(request, cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkFetch = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
      if (maxItems) trimCache(cacheName, maxItems);
    }
    return response;
  }).catch(() => cached);
  return cached || networkFetch;
}

async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    await trimCache(cacheName, maxItems);
  }
}

// ─── BACKGROUND SYNC ────────────────────────────────────────
self.addEventListener('sync', event => {
  console.log('[SW] Background sync:', event.tag);
  if (event.tag === 'sync-enquiry') {
    event.waitUntil(syncPendingEnquiries());
  }
});

async function syncPendingEnquiries() {
  // When back online, send any pending enquiry forms
  try {
    const db = await getDB();
    const pending = await db.getAll('pending-enquiries');
    for (const enquiry of pending) {
      console.log('[SW] Syncing enquiry:', enquiry);
      // In a real app, POST to your backend here
      await db.delete('pending-enquiries', enquiry.id);
    }
  } catch(e) {
    console.log('[SW] Sync error:', e);
  }
}

// ─── PUSH NOTIFICATIONS ─────────────────────────────────────
self.addEventListener('push', event => {
  let data = { title: 'Sanskrutikaa', body: 'New saree collection arrived!', icon: '/icons/icon-192x192.png' };
  if (event.data) {
    try { data = { ...data, ...event.data.json() }; } catch {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: 'sanskrutikaa-notification',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      actions: [
        { action: 'view',    title: '👗 View Sarees' },
        { action: 'whatsapp', title: '💬 WhatsApp Us' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  let target = '/';
  if (event.action === 'whatsapp') target = 'https://wa.me/919776164994';
  else if (event.action === 'view') target = '/#sarees';
  else if (event.notification.data?.url) target = event.notification.data.url;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// ─── MESSAGE HANDLER ────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'getCacheStatus') {
    caches.keys().then(keys => {
      event.ports[0].postMessage({ caches: keys, version: CACHE_VERSION });
    });
  }
});

console.log(`[SW] ${APP_NAME} Service Worker ${CACHE_VERSION} loaded`);
