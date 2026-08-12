/* Windsage service worker — Web Push + notification click */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Windsage', body: 'Wind alert', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    try {
      payload.body = event.data ? event.data.text() : payload.body;
    } catch {
      // ignore
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Windsage', {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: payload.data || {},
      renotify: true,
      tag: (payload.data && payload.data.followId) || 'windsage-alert',
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
