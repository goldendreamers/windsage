import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  }
}

loadEnvFile(join(ROOT, "helper.env"));

function csv(name) {
  return String(process.env[name] || "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function req(name) {
  return String(process.env[name] || "").trim();
}

export const ROOT_DIR = ROOT;
export const KNOWLEDGE_DIR = join(ROOT, "knowledge");

export function loadConfig() {
  const token = req("DISCORD_TOKEN");
  const clientId = req("DISCORD_CLIENT_ID");
  const guildId = req("DISCORD_GUILD_ID");
  const askChannelId = req("ASK_CHANNEL_ID");
  const missing = [];
  if (!token) missing.push("DISCORD_TOKEN");
  if (!clientId) missing.push("DISCORD_CLIENT_ID");
  if (!guildId) missing.push("DISCORD_GUILD_ID");
  if (!askChannelId) missing.push("ASK_CHANNEL_ID");
  return {
    token,
    clientId,
    guildId,
    askChannelId,
    modChannelId: req("MOD_CHANNEL_ID"),
    rulesChannelId: req("RULES_CHANNEL_ID"),
    modRoleIds: csv("MOD_ROLE_IDS"),
    allowedCategoryIds: csv("ALLOWED_CATEGORY_IDS"),
    cosmeticRoleIds: csv("COSMETIC_ROLE_IDS"),
    apiUrl: req("WINDSAGE_API_URL") || "https://windsage.nimrod.bio",
    missing,
  };
}

export const PROTECTED_NAMES = new Set(["rules", "ask-windsage", "mod-bot"]);

export function isProtectedChannel(cfg, channel) {
  if (!channel) return true;
  const id = channel.id;
  if (
    id === cfg.askChannelId ||
    id === cfg.modChannelId ||
    id === cfg.rulesChannelId
  ) {
    return true;
  }
  const name = String(channel.name || "").toLowerCase();
  return PROTECTED_NAMES.has(name);
}
