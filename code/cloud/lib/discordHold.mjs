function sanitizeDiscordWebhook(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const u = new URL(text);
    if (u.protocol !== 'https:') return '';
    const host = u.hostname.toLowerCase();
    if (host !== 'discord.com' && host !== 'www.discord.com') return '';
    if (!u.pathname.startsWith('/api/webhooks/')) return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function holdWebhookUrl() {
  return sanitizeDiscordWebhook(process.env.DISCORD_HOLD_WEBHOOK_URL);
}

export function holdWebhookEnabled() {
  return !!holdWebhookUrl();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/**
 * Club bell: same shouldNotify event, Discord webhook. Does not replace Web Push.
 * Never writes store.json. Failures are logged; they must not rewind phone delivery.
 */
export async function sendHoldWebhook(station, result) {
  const url = holdWebhookUrl();
  if (!url) return { ok: false, skipped: true };
  const place = String(station?.nickname || station?.sourceName || station?.stationId || 'spot').trim();
  const wind = num(result?.metricValue ?? result?.reading?.wind_avg);
  const minutes = Math.max(1, Number(station?.rule?.sustainedMinutes) || 20);
  const threshold = num(station?.rule?.threshold) ?? 15;
  const color = 0x2ecc71;
  const body = {
    content: null,
    embeds: [
      {
        title: `${place} מחזיק`,
        description:
          wind == null
            ? `הסף ${threshold} קשר החזיק ${minutes} דקות.`
            : `${wind} קשר מעל ${threshold} כבר ${minutes} דקות. יוצאים?`,
        url: 'https://windsage.nimrod.bio/',
        color,
      },
    ],
    allowed_mentions: { parse: [] },
  };
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, {
      method: 'POST',
      signal: ac.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    clearTimeout(t);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[discord-hold] webhook ${res.status} ${text.slice(0, 180)}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('[discord-hold] webhook failed', err?.message || err);
    return { ok: false };
  }
}

export { sanitizeDiscordWebhook };
