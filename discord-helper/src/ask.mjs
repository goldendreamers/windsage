import { tooManyAsks } from "./rate-limit.mjs";
import { answerFromFaq } from "./faq.mjs";
import { matchTree } from "./tree-data.mjs";
import { answerCard, rootTreeMessage, treeMessage } from "./tree.mjs";

function inAskChannel(cfg, guildId, channelId) {
  if (guildId !== cfg.guildId) return "This bot is guild-only.";
  if (channelId !== cfg.askChannelId) {
    return "Open /ask in #questions (or @Windsage Helper there).";
  }
  return null;
}

function replyForQuestion(userId, question) {
  const q = String(question || "").trim();
  if (!q) return rootTreeMessage(userId);
  const faq = answerFromFaq(q);
  if (faq) {
    return answerCard(userId, faq.title || "Answer", faq.text);
  }
  const treeHit = matchTree(q);
  if (treeHit) {
    return answerCard(userId, treeHit.item.q, treeHit.item.a);
  }
  return treeMessage(
    userId,
    "root",
    `No exact card for “${q.slice(0, 80)}”. Tap the closest topic:`
  );
}

export async function handleAsk(cfg, interaction) {
  const err = inAskChannel(cfg, interaction.guildId, interaction.channelId);
  if (err) {
    await interaction.reply({ content: err, ephemeral: true });
    return;
  }
  if (tooManyAsks(interaction.user.id)) {
    await interaction.reply({
      content: "Slow down — 3 times per 30 seconds.",
      ephemeral: true,
    });
    return;
  }
  const question = interaction.options.getString("question")?.trim() || "";
  await interaction.reply(replyForQuestion(interaction.user.id, question));
}

export function textAfterBotMention(content, botUserId) {
  return String(content || "")
    .replace(new RegExp(`<@!?${botUserId}>`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function handleChannelQuestion(cfg, message, botUserId) {
  if (message.author?.bot) return false;
  if (message.guildId !== cfg.guildId) return false;
  if (message.channelId !== cfg.askChannelId) return false;
  if (!message.mentions?.users?.has(botUserId)) return false;
  if (tooManyAsks(message.author.id)) {
    await message.reply({
      content: "Slow down — 3 times per 30 seconds.",
      allowedMentions: { parse: [] },
    });
    return true;
  }
  const question = textAfterBotMention(message.content, botUserId);
  await message.reply(replyForQuestion(message.author.id, question));
  return true;
}
