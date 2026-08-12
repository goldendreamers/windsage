/* Windsage service worker — Web Push + notification click
 * v4: absolute icon/badge URLs + proper monochrome badge (no white square).
 */
const SW_VERSION = 'windsage-sw-v4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  // Absolute URLs so Android loads icons while locked (relative paths often show a white square).
  try {
    return new URL(path, self.location.origin).href;
  } catch {
    return path;
  }
}

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

  // Show the OS notification FIRST — do not await client messaging before this.
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: assetUrl('/notify-icon.png'),
        badge: assetUrl('/badge-96.png'),
        image: undefined,
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
          // ignore — notification already shown
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
