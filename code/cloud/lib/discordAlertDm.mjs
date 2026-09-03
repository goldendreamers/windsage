/**
 * Discord station DMs and wake voice-call hooks.
 * Separate bot from Helper, website OAuth, and the Cursor ops bot.
 * Never reads store.json itself — cloud calls these helpers.
 */
import crypto from 'node:crypto';

const DISCORD_API = 'https://discord.com/api/v10';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LINK_TTL_MS = 10 * 60 * 1000;

export function discordAlertConfig() {
  const token = String(process.env.DISCORD_ALERT_BOT_TOKEN || process.env.DISCORD_TOKEN || '').trim();
  const hookSecret = String(process.env.DISCORD_ALERT_HOOK_SECRET || '').trim();
  const alertsUrl = String(process.env.DISCORD_ALERTS_URL || 'http://127.0.0.1:8788').replace(/\/$/, '');
  return {
    token,
    hookSecret,
    alertsUrl,
    enabled: token.length > 20,
    hookEnabled: token.length > 20 && hookSecret.length >= 16,
  };
}

export function newLinkCode() {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function normalizeLinkCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function hashLinkCode(code) {
  const n = normalizeLinkCode(code);
  if (n.length < 6) return '';
  return crypto.createHash('sha256').update(n).digest('hex');
}

export function hookSecretOk(provided) {
  const want = Buffer.from(discordAlertConfig().hookSecret);
  const got = Buffer.from(String(provided || ''));
  if (!want.length || want.length !== got.length) return false;
  return crypto.timingSafeEqual(want, got);
}

export function publicDiscordAlert(user) {
  const row = user?.discordAlert;
  if (!row?.discordUserId) return { linked: false, username: null };
  return { linked: true, username: row.discordUsername || null };
}

export function findUserByDiscordAlertId(store, discordUserId) {
  const id = String(discordUserId || '').trim();
  if (!id) return null;
  return Object.values(store.users || {}).find((u) => u?.discordAlert?.discordUserId === id) || null;
}

export function findUserByLinkCodeHash(store, codeHash) {
  const hash = String(codeHash || '').trim();
  if (!hash) return null;
  const now = Date.now();
  return (
    Object.values(store.users || {}).find((u) => {
      const pending = u?.discordAlertPending;
      return pending?.codeHash === hash && Number(pending.expiresAt) > now;
    }) || null
  );
}

export function startDiscordAlertLink(user) {
  const code = newLinkCode();
  user.discordAlertPending = {
    codeHash: hashLinkCode(code),
    expiresAt: Date.now() + LINK_TTL_MS,
  };
  user.updatedAt = Date.now();
  return { code, expiresAt: user.discordAlertPending.expiresAt };
}

export function completeDiscordAlertLink(store, { code, discordUserId, discordUsername }) {
  const hash = hashLinkCode(code);
  const user = findUserByLinkCodeHash(store, hash);
  if (!user) return { ok: false, error: 'That code is unknown or expired. Generate a new one in Account.' };
  const taken = findUserByDiscordAlertId(store, discordUserId);
  if (taken && taken.id !== user.id) {
    return { ok: false, error: 'That Discord account is already linked to another Windsage user.' };
  }
  user.discordAlert = {
    discordUserId: String(discordUserId).trim(),
    discordUsername: String(discordUsername || '').trim() || null,
    linkedAt: Date.now(),
    enabled: true,
  };
  user.discordAlertPending = null;
  user.updatedAt = Date.now();
  return { ok: true, userId: user.id };
}

export function unlinkDiscordAlertByDiscordId(store, discordUserId) {
  const user = findUserByDiscordAlertId(store, discordUserId);
  if (!user) return { ok: false, error: 'Not linked.' };
  user.discordAlert = null;
  user.updatedAt = Date.now();
  return { ok: true };
}

export function unlinkDiscordAlert(user) {
  user.discordAlert = null;
  user.discordAlertPending = null;
  user.updatedAt = Date.now();
}

async function discordFetch(path, { method = 'GET', body } = {}) {
  const { token, enabled } = discordAlertConfig();
  if (!enabled) return { ok: false, skipped: true, status: 0 };
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}

/** Open (or reuse) a DM channel, then send the alert copy. */
export async function sendAlertDiscordDm(discordUserId, { title, body }) {
  const id = String(discordUserId || '').trim();
  if (!id) return { ok: false, skipped: true };
  const cfg = discordAlertConfig();
  if (!cfg.enabled) return { ok: false, skipped: true };

  const opened = await discordFetch('/users/@me/channels', {
    method: 'POST',
    body: { recipient_id: id },
  });
  const channelId = opened.json?.id;
  if (!opened.ok || !channelId) {
    console.error('[discord-alert] open DM failed', opened.status, (opened.text || '').slice(0, 180));
    return { ok: false, status: opened.status };
  }

  const content = `${title}\n${body}\nhttps://windsage.nimrod.bio/`.slice(0, 1900);
  const sent = await discordFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: { content, allowed_mentions: { parse: [] } },
  });
  if (!sent.ok) {
    console.error('[discord-alert] send DM failed', sent.status, (sent.text || '').slice(0, 180));
    return { ok: false, status: sent.status };
  }
  return { ok: true };
}

export function bagDiscordUserId(bag) {
  if (!bag?.discordAlert || bag.discordAlert.enabled === false) return null;
  const id = String(bag.discordAlert.discordUserId || '').trim();
  return id || null;
}

async function alertsBotPost(path, body) {
  const cfg = discordAlertConfig();
  if (!cfg.hookEnabled) return { ok: false, skipped: true };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 12_000);
  try {
    const res = await fetch(`${cfg.alertsUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-windsage-hook': cfg.hookSecret,
      },
      body: JSON.stringify(body || {}),
      signal: ac.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok && json?.ok !== false, status: res.status, ...json };
  } catch (err) {
    console.error('[discord-alert] wake bot failed', err?.message || err);
    return { ok: false, error: err?.message || 'wake bot failed' };
  } finally {
    clearTimeout(timer);
  }
}

export async function startWakeVoiceCall({ discordUserId, title, body }) {
  const id = String(discordUserId || '').trim();
  if (!id) return { ok: false, skipped: true };
  return alertsBotPost('/v1/wake/start', { discordUserId: id, title, body });
}

export async function stopWakeVoiceCall({ discordUserId }) {
  const id = String(discordUserId || '').trim();
  if (!id) return { ok: false, skipped: true };
  return alertsBotPost('/v1/wake/stop', { discordUserId: id });
}
