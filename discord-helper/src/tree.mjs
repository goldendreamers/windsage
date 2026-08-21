import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  buttonsPerRow,
  customIdsAreUnique,
  getNode,
  loadTree,
  pickOption,
  viewForLeaf,
  viewForNode,
} from "./tree-data.mjs";

function parseId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const kind = parts[0];
  const userId = parts[1];
  if (kind === "wtn" || kind === "wtb") {
    return { kind: "nav", userId, nodeId: parts.slice(2).join(":") };
  }
  if (kind === "wtp") {
    return {
      kind: "pick",
      userId,
      nodeId: parts[2],
      optId: parts.slice(3).join(":"),
    };
  }
  if (kind === "wts") {
    return { kind: "select", userId, nodeId: parts.slice(2).join(":") };
  }
  return null;
}

export function isTreeCustomId(customId) {
  return /^(wts|wtb|wtn|wtp):/.test(String(customId || ""));
}

function rowsFromView(view) {
  const components = [];
  const options = view.options || [];
  const perRow = buttonsPerRow(options.length, Boolean(view.nav?.length));
  for (let i = 0; i < options.length; i += perRow) {
    const row = new ActionRowBuilder();
    for (const o of options.slice(i, i + perRow)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(o.customId)
          .setLabel(o.label)
          .setStyle(o.kind === "answer" ? ButtonStyle.Primary : ButtonStyle.Secondary)
      );
    }
    components.push(row);
  }
  if (view.nav?.length) {
    const row = new ActionRowBuilder();
    for (const n of view.nav.slice(0, 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(n.customId)
          .setLabel(n.label)
          .setStyle(ButtonStyle.Secondary)
      );
    }
    components.push(row);
  }
  if (components.length > 5) {
    throw new Error("tree view exceeded 5 Discord action rows");
  }
  if (!customIdsAreUnique(view.customIds || [])) {
    throw new Error("tree view has duplicate custom ids");
  }
  return components;
}

function payloadFromView(view) {
  return {
    content: view.content,
    components: rowsFromView(view),
    allowedMentions: { parse: [] },
  };
}

export function treeMessage(userId, nodeId, extra = "") {
  return payloadFromView(viewForNode(userId, nodeId, extra));
}

export function answerCard(userId, title, text) {
  return payloadFromView({
    content: `**${title}**\n\n${text}`.slice(0, 2000),
    options: [],
    nav: [{ customId: `wtn:${userId}:root`, label: "More topics" }],
    customIds: [`wtn:${userId}:root`],
  });
}

export function rootTreeMessage(userId) {
  return treeMessage(userId, "root");
}

function optionByValue(node, value) {
  return (node.options || []).find((o) => o.id === value) || null;
}

export async function handleTreeInteraction(interaction) {
  const parsed = parseId(interaction.customId);
  if (!parsed) return false;
  if (interaction.user.id !== parsed.userId) {
    await interaction.reply({
      content: "That menu is someone else's. Use /ask to open your own.",
      ephemeral: true,
    });
    return true;
  }

  const tree = loadTree();

  if (parsed.kind === "nav") {
    await interaction.update(treeMessage(parsed.userId, parsed.nodeId));
    return true;
  }

  if (parsed.kind === "pick") {
    const result = pickOption(tree, parsed.nodeId, parsed.optId);
    if (result.type === "goto") {
      await interaction.update(treeMessage(parsed.userId, result.nodeId));
      return true;
    }
    await interaction.update(payloadFromView(viewForLeaf(parsed.userId, result, tree)));
    return true;
  }

  if (parsed.kind !== "select" || !interaction.isStringSelectMenu()) return false;
  const { node } = getNode(tree, parsed.nodeId);
  const picked = optionByValue(node, interaction.values[0]);
  if (!picked) {
    await interaction.update(treeMessage(parsed.userId, "root"));
    return true;
  }
  if (picked.goto) {
    await interaction.update(treeMessage(parsed.userId, picked.goto));
    return true;
  }
  await interaction.update(
    payloadFromView(
      viewForLeaf(
        parsed.userId,
        { label: picked.label, answer: picked.answer, parent: parsed.nodeId },
        tree
      )
    )
  );
  return true;
}
