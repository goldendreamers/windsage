import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import { isProtectedChannel } from "./config.mjs";
import { loadRules } from "./faq.mjs";
import { deleteJob, getJob, putJob } from "./pending.mjs";

const DANGEROUS_ROLE_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.ManageGuildExpressions,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageMessages,
];

const DESTRUCTIVE = new Set(["delete-channel", "kick", "ban"]);
const PROTECTED_CHANNEL_NAMES = new Set(["rules", "ask-windsage", "mod-bot"]);

export function chunkText(text, max = 1800) {
  const blocks = [];
  let buf = "";
  for (const para of String(text).split(/\n{2,}/)) {
    const piece = para.trim();
    if (!piece) continue;
    if ((buf + "\n\n" + piece).length > max) {
      if (buf) blocks.push(buf);
      if (piece.length > max) {
        for (let i = 0; i < piece.length; i += max) {
          blocks.push(piece.slice(i, i + max));
        }
        buf = "";
      } else {
        buf = piece;
      }
    } else {
      buf = buf ? `${buf}\n\n${piece}` : piece;
    }
  }
  if (buf) blocks.push(buf);
  return blocks;
}

function confirmRow(id, destructive, second) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`wh:${id}:ok`)
      .setLabel(second ? "Confirm again" : "Confirm")
      .setStyle(destructive || second ? ButtonStyle.Danger : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`wh:${id}:no`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

export function isModMember(cfg, member) {
  if (!member || cfg.modRoleIds.length === 0) return false;
  return cfg.modRoleIds.some((id) => member.roles.cache.has(id));
}

function discordCdn(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" &&
      (u.hostname === "cdn.discordapp.com" || u.hostname === "media.discordapp.net")
    );
  } catch {
    return false;
  }
}

async function fetchMember(guild, userId) {
  try {
    return await guild.members.fetch(userId);
  } catch {
    return null;
  }
}

function cannotTouch(cfg, guild, actor, target) {
  if (!target) return "That member is not in the server.";
  if (target.id === guild.ownerId) return "Can't touch the owner.";
  if (target.id === guild.members.me?.id) return "Can't touch the bot.";
  if (target.user?.bot && target.id === guild.members.me?.id) {
    return "Can't touch the bot.";
  }
  if (isModMember(cfg, target)) return "Can't timeout / kick / ban other mods.";
  if (target.permissions?.has(PermissionFlagsBits.Administrator)) {
    return "Can't touch an Administrator.";
  }
  const me = guild.members.me;
  if (me && target.roles?.highest && me.roles?.highest) {
    if (target.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
      return "That member is above or equal to the bot role.";
    }
  }
  if (target.id === actor.id) return "Don't use the bot on yourself for that.";
  return null;
}

function cosmeticOk(cfg, guild, role) {
  if (!role) return "Pick a role.";
  if (cfg.cosmeticRoleIds.length === 0) {
    return "No cosmetic roles are configured. Feature off.";
  }
  if (!cfg.cosmeticRoleIds.includes(role.id)) {
    return "That role is not on the cosmetic allowlist.";
  }
  if (role.managed) return "Can't edit a managed role.";
  if (role.id === guild.id) return "Can't use @everyone.";
  if (DANGEROUS_ROLE_PERMS.some((p) => role.permissions.has(p))) {
    return "That role has staff permissions. Cosmetic only.";
  }
  const me = guild.members.me;
  if (me && role.comparePositionTo(me.roles.highest) >= 0) {
    return "That role is above or equal to the bot. Move the bot role up (still below mods).";
  }
  return null;
}

export async function planMod(cfg, interaction) {
  const sub = interaction.options.getSubcommand();
  const guild = interaction.guild;
  if (!guild) return { error: "Guild only." };

  if (sub === "post-rules") {
    if (!cfg.rulesChannelId) return { error: "#rules is not configured." };
    return {
      kind: "post-rules",
      summary: "Post the frozen rules file into #rules",
      payload: {},
    };
  }

  if (sub === "create-channel") {
    const name = interaction.options.getString("name", true).toLowerCase().replace(/\s+/g, "-");
    const category = interaction.options.getChannel("category", true);
    if (cfg.allowedCategoryIds.length === 0) {
      return { error: "No allowed categories configured. Feature off." };
    }
    if (!cfg.allowedCategoryIds.includes(category.id)) {
      return { error: "That category is not on the allowlist." };
    }
    if (PROTECTED_CHANNEL_NAMES.has(name)) {
      return { error: "Won't create a channel with a protected name." };
    }
    return {
      kind: "create-channel",
      summary: `Create #${name} in ${category.name}`,
      payload: { name, categoryId: category.id },
    };
  }

  if (sub === "rename" || sub === "topic" || sub === "slowmode" || sub === "delete-channel") {
    const channel = interaction.options.getChannel("channel", true);
    if (isProtectedChannel(cfg, channel)) {
      return { error: "Won't change #rules, #ask-windsage, or #mod-bot." };
    }
    if (channel.type !== ChannelType.GuildText) {
      return { error: "Text channels only." };
    }
    if (sub === "rename") {
      const name = interaction.options.getString("name", true).toLowerCase().replace(/\s+/g, "-");
      if (PROTECTED_CHANNEL_NAMES.has(name)) {
        return { error: "Won't rename to a protected name." };
      }
      return {
        kind: "rename",
        summary: `Rename ${channel} to #${name}`,
        payload: { channelId: channel.id, name },
      };
    }
    if (sub === "topic") {
      const text = interaction.options.getString("text", true);
      return {
        kind: "topic",
        summary: `Set topic on ${channel}`,
        payload: { channelId: channel.id, text },
      };
    }
    if (sub === "slowmode") {
      const seconds = interaction.options.getInteger("seconds", true);
      return {
        kind: "slowmode",
        summary: `Slowmode ${seconds}s on ${channel}`,
        payload: { channelId: channel.id, seconds },
      };
    }
    return {
      kind: "delete-channel",
      summary: `Delete ${channel}`,
      payload: { channelId: channel.id },
    };
  }

  if (sub === "add-emoji") {
    const name = interaction.options.getString("name", true).replace(/[^a-zA-Z0-9_]/g, "");
    const att = interaction.options.getAttachment("image", true);
    if (!/^[a-zA-Z0-9_]{2,32}$/.test(name)) {
      return { error: "Emoji name must be 2–32 letters, numbers, or _." };
    }
    if (!discordCdn(att.url)) return { error: "Image must be uploaded here, not a random web link." };
    if (att.size > 256_000) return { error: "Emoji image must be 256 KB or smaller." };
    const res = await fetch(att.url);
    if (!res.ok) return { error: "Could not read that image." };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 256_000) return { error: "Emoji image must be 256 KB or smaller." };
    return {
      kind: "add-emoji",
      summary: `Add emoji :${name}:`,
      payload: { name },
      buffer: buf,
    };
  }

  if (sub === "remove-emoji") {
    const name = interaction.options.getString("name", true);
    const emoji = guild.emojis.cache.find((e) => e.name === name) || null;
    if (!emoji) return { error: `No custom emoji named ${name}.` };
    return {
      kind: "remove-emoji",
      summary: `Remove emoji :${name}:`,
      payload: { emojiId: emoji.id, name },
    };
  }

  if (sub === "role-give" || sub === "role-take") {
    const user = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true);
    const bad = cosmeticOk(cfg, guild, role);
    if (bad) return { error: bad };
    const member = await fetchMember(guild, user.id);
    if (!member) return { error: "That member is not in the server." };
    return {
      kind: sub,
      summary: `${sub === "role-give" ? "Give" : "Take"} ${role.name} ${sub === "role-give" ? "to" : "from"} ${user.tag}`,
      payload: { userId: user.id, roleId: role.id, roleName: role.name, tag: user.tag },
    };
  }

  if (sub === "timeout" || sub === "kick" || sub === "ban") {
    const user = interaction.options.getUser("user", true);
    const member = await fetchMember(guild, user.id);
    const err = cannotTouch(cfg, guild, interaction.member, member);
    if (err) return { error: err };
    if (sub === "timeout") {
      const minutes = interaction.options.getInteger("minutes", true);
      return {
        kind: "timeout",
        summary: `Timeout ${user.tag} for ${minutes} min`,
        payload: { userId: user.id, minutes, tag: user.tag },
      };
    }
    const reason = interaction.options.getString("reason") || "mod-bot";
    return {
      kind: sub,
      summary: `${sub} ${user.tag}`,
      payload: { userId: user.id, reason, tag: user.tag },
    };
  }

  return { error: "Unknown /mod action." };
}

async function runJob(cfg, guild, job) {
  const { kind, payload } = job;
  if (kind === "post-rules") {
    const ch = await guild.channels.fetch(cfg.rulesChannelId);
    if (!ch || !ch.isTextBased()) throw new Error("#rules is missing.");
    const parts = chunkText(loadRules());
    for (const part of parts) {
      await ch.send({ content: part, allowedMentions: { parse: [] } });
    }
    return `Posted ${parts.length} rule message(s) in ${ch}.`;
  }
  if (kind === "create-channel") {
    const cat = await guild.channels.fetch(payload.categoryId);
    if (!cat || cat.type !== ChannelType.GuildCategory) {
      throw new Error("Category gone.");
    }
    if (!cfg.allowedCategoryIds.includes(cat.id)) {
      throw new Error("Category no longer allowed.");
    }
    const created = await guild.channels.create({
      name: payload.name,
      type: ChannelType.GuildText,
      parent: cat.id,
      reason: "windsage helper /mod",
    });
    return `Created ${created}.`;
  }
  if (kind === "rename" || kind === "topic" || kind === "slowmode" || kind === "delete-channel") {
    const ch = await guild.channels.fetch(payload.channelId);
    if (!ch) throw new Error("Channel gone.");
    if (isProtectedChannel(cfg, ch)) throw new Error("Protected channel.");
    if (kind === "rename") {
      await ch.setName(payload.name, "windsage helper /mod");
      return `Renamed to #${payload.name}.`;
    }
    if (kind === "topic") {
      await ch.setTopic(payload.text, "windsage helper /mod");
      return `Updated topic on ${ch}.`;
    }
    if (kind === "slowmode") {
      await ch.setRateLimitPerUser(payload.seconds, "windsage helper /mod");
      return `Slowmode ${payload.seconds}s on ${ch}.`;
    }
    await ch.delete("windsage helper /mod");
    return `Deleted #${ch.name}.`;
  }
  if (kind === "add-emoji") {
    if (!job.buffer) throw new Error("Emoji image expired. Run the command again.");
    const emoji = await guild.emojis.create({
      attachment: job.buffer,
      name: payload.name,
      reason: "windsage helper /mod",
    });
    return `Added ${emoji}.`;
  }
  if (kind === "remove-emoji") {
    const emoji = await guild.emojis.fetch(payload.emojiId);
    await emoji.delete("windsage helper /mod");
    return `Removed :${payload.name}:`;
  }
  if (kind === "role-give" || kind === "role-take") {
    const role = await guild.roles.fetch(payload.roleId);
    const bad = cosmeticOk(cfg, guild, role);
    if (bad) throw new Error(bad);
    const member = await fetchMember(guild, payload.userId);
    if (!member) throw new Error("Member gone.");
    if (kind === "role-give") await member.roles.add(role, "windsage helper /mod");
    else await member.roles.remove(role, "windsage helper /mod");
    return `${kind === "role-give" ? "Gave" : "Took"} ${role.name} ${kind === "role-give" ? "to" : "from"} ${payload.tag}.`;
  }
  if (kind === "timeout" || kind === "kick" || kind === "ban") {
    const member = await fetchMember(guild, payload.userId);
    const err = cannotTouch(cfg, guild, { id: job.userId }, member);
    if (kind !== "ban" || member) {
      if (err) throw new Error(err);
    }
    if (kind === "timeout") {
      await member.timeout(payload.minutes * 60_000, "windsage helper /mod");
      return `Timed out ${payload.tag} for ${payload.minutes} min.`;
    }
    if (kind === "kick") {
      await member.kick(payload.reason);
      return `Kicked ${payload.tag}.`;
    }
    if (member) {
      const again = cannotTouch(cfg, guild, { id: job.userId }, member);
      if (again) throw new Error(again);
      await member.ban({ reason: payload.reason });
    } else {
      await guild.bans.create(payload.userId, { reason: payload.reason });
    }
    return `Banned ${payload.tag}.`;
  }
  throw new Error("Unknown job.");
}

export async function offerConfirm(cfg, interaction, planned) {
  const id = putJob({
    userId: interaction.user.id,
    kind: planned.kind,
    payload: planned.payload,
    summary: planned.summary,
    buffer: planned.buffer || null,
    step: 1,
  });
  const destructive = DESTRUCTIVE.has(planned.kind);
  await interaction.reply({
    content: `${interaction.user} wants: **${planned.summary}**\nConfirm expires in 60s.${destructive ? "\nThis needs a second Confirm." : ""}`,
    components: [confirmRow(id, destructive, false)],
    allowedMentions: { parse: [] },
  });
}

export async function onConfirmButton(cfg, interaction) {
  const parts = String(interaction.customId || "").split(":");
  if (parts.length !== 3 || parts[0] !== "wh") return false;
  const [, id, act] = parts;
  const job = getJob(id);
  if (!job) {
    await interaction.reply({ content: "That confirm expired or was already used.", ephemeral: true });
    return true;
  }
  if (job.userId !== interaction.user.id) {
    await interaction.reply({
      content: "Only the mod who started this can confirm.",
      ephemeral: true,
    });
    return true;
  }
  if (!isModMember(cfg, interaction.member)) {
    await interaction.reply({ content: "Mods only.", ephemeral: true });
    return true;
  }

  if (act === "no") {
    deleteJob(id);
    await interaction.update({
      content: `Cancelled: ${job.summary}`,
      components: [],
    });
    return true;
  }

  if (act !== "ok") return false;

  const destructive = DESTRUCTIVE.has(job.kind);
  if (destructive && job.step === 1) {
    job.step = 2;
    job.expires = Date.now() + 60_000;
    await interaction.update({
      content: `${interaction.user} — second Confirm needed: **${job.summary}**`,
      components: [confirmRow(id, true, true)],
    });
    return true;
  }

  deleteJob(id);
  await interaction.update({
    content: `Working: ${job.summary}`,
    components: [],
  });
  try {
    const result = await runJob(cfg, interaction.guild, job);
    await interaction.editReply({ content: `Done. ${result}` });
  } catch (err) {
    const msg = err?.message || "failed";
    await interaction.editReply({ content: `Failed: ${msg}` });
  }
  return true;
}
