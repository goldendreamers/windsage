/* Windsage service worker — Web Push + static cache
 * v5: cache hashed JS/images for faster repeat loads; keep push lock-screen icons absolute.
 */
const SW_VERSION = 'windsage-sw-v5';
const STATIC_CACHE = 'windsage-static-v5';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('windsage-static-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function parsePushPayload(event) {
  const fallback = { title: 'Windsage', body: 'Wind alert', data: {} };
  if (!event.data) return fallback;
  try {
    return { ...fallback, ...event.data.json() };
  } catch {
    try {
      return { ...fallback, body: event.data.text() || fallback.body };
    } catch {
      return fallback;
    }
  }
}

function assetUrl(path) {
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return path;
  }
}

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith('/_expo/')) return true;
  if (p.startsWith('/assets/')) return true;
  return /\.(?:js|css|png|jpe?g|webp|ico|woff2?)$/i.test(p);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never cache API / HTML shell aggressively — always prefer network.
  if (url.pathname.startsWith('/v1/') || url.pathname === '/health') return;
  if (url.pathname === '/' || url.pathname.endsWith('.html') || url.pathname === '/sw.js') return;
  if (!isStaticAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) {
        // Refresh in background
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res && res.ok) return cache.put(req, res.clone());
            })
            .catch(() => undefined),
        );
        return cached;
      }
      const res = await fetch(req);
      if (res && res.ok) {
        try {
          await cache.put(req, res.clone());
        } catch {
          // ignore quota
        }
      }
      return res;
    })(),
  );
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const followId = (payload.data && payload.data.followId) || 'windsage-alert';
  const title = payload.title || 'Windsage';
  const body = payload.body || 'Wind alert';
  const data = {
    ...(payload.data || {}),
    swVersion: SW_VERSION,
    receivedAt: Date.now(),
  };

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: assetUrl('/notify-icon.png'),
        badge: assetUrl('/badge-96.png'),
        data,
        tag: `${followId}-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: [300, 120, 300, 120, 500],
        timestamp: Date.now(),
        actions: [{ action: 'open', title: 'Open Windsage' }],
      })
      .then(async () => {
        try {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of clients) {
            client.postMessage({
              type: 'windsage-push',
              title,
              body,
              data,
              at: Date.now(),
            });
          }
        } catch {
          // ignore
        }
      }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              // ignore
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});
