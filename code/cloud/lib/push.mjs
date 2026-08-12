export async function sendExpoPush({ to, title, body, data }) {
  if (!to || (Array.isArray(to) && !to.length)) return { ok: false, skipped: true };
  const tokens = Array.isArray(to) ? [...new Set(to.filter(Boolean))] : [to];
  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    data: data || {},
    sound: 'default',
    priority: 'high',
    channelId: 'windsage-alerts',
  }));
  // Expo accepts batches up to 100.
  const chunks = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
  const results = [];
  for (const chunk of chunks) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[push] failed', response.status, json);
      results.push({ ok: false, json });
    } else {
      console.log('[push] sent', chunk.length, 'message(s)');
      results.push({ ok: true, json });
    }
  }
  return { ok: results.every((r) => r.ok), results, count: tokens.length };
}
