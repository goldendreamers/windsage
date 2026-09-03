import { SlashCommandBuilder } from 'discord.js';

export function loadConfig() {
  const token = String(process.env.DISCORD_TOKEN || process.env.DISCORD_ALERT_BOT_TOKEN || '').trim();
  const clientId = String(process.env.DISCORD_CLIENT_ID || '').trim();
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
  const hookSecret = String(process.env.DISCORD_ALERT_HOOK_SECRET || '').trim();
  const cloudUrl = String(process.env.WINDSAGE_CLOUD_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
  const alertsPort = Math.max(1, Number(process.env.WINDSAGE_ALERTS_PORT || 8788) || 8788);
  const missing = [];
  if (!token) missing.push('DISCORD_TOKEN');
  if (!clientId) missing.push('DISCORD_CLIENT_ID');
  if (!guildId) missing.push('DISCORD_GUILD_ID');
  if (!hookSecret) missing.push('DISCORD_ALERT_HOOK_SECRET');
  return { token, clientId, guildId, hookSecret, cloudUrl, alertsPort, missing };
}

export function linkCommand() {
  return new SlashCommandBuilder()
    .setName('link')
    .setDescription('Link this Discord account to your Windsage alerts')
    .addStringOption((o) =>
      o.setName('code').setDescription('6-character code from Account → Discord alerts').setRequired(true).setMinLength(6).setMaxLength(8),
    );
}

export function unlinkCommand() {
  return new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Stop Windsage Discord alerts for this account');
}

export async function cloudPost(cfg, path, body) {
  const res = await fetch(`${cfg.cloudUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-windsage-hook': cfg.hookSecret,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}
