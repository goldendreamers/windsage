export async function sendExpoPush({ to, title, body, data }) {
  if (!to) return { ok: false, skipped: true };
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to,
      title,
      body,
      data: data || {},
      sound: 'default',
      priority: 'high',
      channelId: 'windsage-alerts',
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[push] failed', response.status, json);
    return { ok: false, json };
  }
  console.log('[push] sent', to.slice(0, 18) + '…');
  return { ok: true, json };
}
