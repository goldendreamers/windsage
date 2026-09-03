/* Windsage service worker — Web Push + static cache
 * v10: skipWaiting on first install; Update + reload; wake-on-wind Stop action.
 */
const SW_VERSION = 'windsage-sw-v10';
const STATIC_CACHE = 'windsage-static-v10';
const SHELL_CACHE = 'windsage-shell-v10';
const SHELL_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL_CACHE);
        await Promise.all(
          SHELL_URLS.map((u) =>
            fetch(u, { cache: 'no-store' })
              .then((res) => (res && res.ok ? cache.put(u, res) : undefined))
              .catch(() => undefined),
          ),
        );
      } catch {
        // ignore — first visit may still work via network
      }
      // First SW: activate immediately. Updates wait for SKIP_WAITING from the app.
      if (!self.registration.active) {
        await self.skipWaiting();
      }
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (k) =>
              (k.startsWith('windsage-static-') || k.startsWith('windsage-shell-')) &&
              k !== STATIC_CACHE &&
              k !== SHELL_CACHE,
          )
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

function isAppCode(url) {
  const p = url.pathname;
  if (p.startsWith('/_expo/')) return true;
  return /\.(?:js|css)$/i.test(p);
}

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith('/_expo/')) return true;
  if (p.startsWith('/assets/')) return true;
  return /\.(?:js|css|png|jpe?g|webp|ico|woff2?)$/i.test(p);
}

function isNavigation(req, url) {
  if (req.mode === 'navigate') return true;
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/html') && (url.pathname === '/' || url.pathname.endsWith('.html'))) {
    return true;
  }
  return false;
}

async function shellFallback() {
  const cache = await caches.open(SHELL_CACHE);
  for (const u of SHELL_URLS) {
    const hit = await cache.match(u);
    if (hit) return hit;
  }
  return new Response(
    '<!doctype html><meta charset=utf-8><title>Windsage</title><p>Offline — open when you have a connection.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
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
  // Never cache API — always prefer network.
  if (url.pathname.startsWith('/v1/') || url.pathname === '/health') return;
  if (url.pathname === '/sw.js') return;

  // App JS/CSS: network-first so a reload after Update actually gets the new bundle.
  if (isAppCode(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            try {
              await cache.put(req, res.clone());
            } catch {
              // ignore quota
            }
          }
          return res;
        } catch {
          const cached = await cache.match(req);
          if (cached) return cached;
          throw new Error('offline');
        }
      })(),
    );
    return;
  }

  // HTML shell: network-first, fall back to last good shell when offline/stale fail.
  if (isNavigation(req, url) || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.ok) {
            try {
              const cache = await caches.open(SHELL_CACHE);
              await cache.put(url.pathname === '/' ? '/' : url.pathname, res.clone());
              if (url.pathname === '/' || url.pathname.endsWith('index.html')) {
                await cache.put('/index.html', res.clone());
              }
            } catch {
              // ignore quota
            }
            return res;
          }
        } catch {
          // network down
        }
        return shellFallback();
      })(),
    );
    return;
  }

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
  const isAlarm = data.alarm === true || data.alarm === '1' || data.kind === 'alarm';

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: assetUrl('/notify-icon.png'),
        badge: assetUrl('/badge-96.png'),
        data,
        tag: isAlarm ? `windsage-alarm-${followId}` : `${followId}-${Date.now()}`,
        renotify: true,
        requireInteraction: true,
        silent: false,
        vibrate: isAlarm ? [400, 120, 400, 120, 600, 120, 800] : [300, 120, 300, 120, 500],
        timestamp: Date.now(),
        actions: isAlarm
          ? [
              { action: 'open', title: 'Open' },
              { action: 'stop', title: 'Stop ringing' },
            ]
          : [{ action: 'open', title: 'Open Windsage' }],
      })
      .then(async () => {
        try {
          const clients = await self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true,
          });
          for (const client of clients) {
            client.postMessage({
              type: isAlarm ? 'windsage-alarm' : 'windsage-push',
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
  const data = event.notification.data || {};
  const stop = event.action === 'stop';
  const isAlarm = data.alarm === true || data.alarm === '1' || data.kind === 'alarm';
  event.notification.close();
  const target = stop ? '/?wake=stop' : isAlarm ? '/?wake=1' : '/';
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if ('focus' in client) {
          try {
            client.postMessage({
              type: stop ? 'windsage-alarm-stop' : isAlarm ? 'windsage-alarm' : 'windsage-push',
              title: event.notification.title,
              body: event.notification.body,
              data,
              at: Date.now(),
            });
          } catch {
            // ignore
          }
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
