import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KNOWLEDGE_DIR } from "./config.mjs";
import { matchFaq } from "./faq.mjs";

export function loadTree() {
  return JSON.parse(readFileSync(join(KNOWLEDGE_DIR, "tree.json"), "utf8"));
}

export function getNode(tree, id) {
  if (id && tree[id]) return { id, node: tree[id] };
  return { id: "root", node: tree.root };
}

export function pickOption(tree, nodeId, optId) {
  const { node } = getNode(tree, nodeId);
  const picked = (node.options || []).find((o) => o.id === optId);
  if (!picked) return { type: "goto", nodeId: "root" };
  if (picked.goto) return { type: "goto", nodeId: picked.goto };
  return {
    type: "answer",
    label: picked.label,
    answer: String(picked.answer || "").trim(),
    parent: nodeId,
  };
}

function navItems(userId, node, nodeId, tree) {
  const items = [];
  const used = new Set();
  const add = (dest, label) => {
    if (!dest || dest === nodeId) return;
    const customId = `wtn:${userId}:${dest}`;
    if (used.has(customId)) return;
    used.add(customId);
    items.push({ customId, label: String(label).slice(0, 80) });
  };
  if (nodeId !== "root") add("root", "All topics");
  if (node.parent && tree[node.parent]) add(node.parent, "Back");
  return items;
}

function optionItems(userId, nodeId, options) {
  return options.map((o) => ({
    customId: `wtp:${userId}:${nodeId}:${o.id}`,
    label: String(o.label).slice(0, 80),
    kind: o.answer ? "answer" : "goto",
  }));
}

export function nodeContent(node, extra = "") {
  const lines = [];
  if (extra) {
    lines.push(String(extra).slice(0, 300), "");
  }
  lines.push(`**${node.prompt}**`);
  if (node.answer) {
    lines.push("", node.answer);
  }
  if ((node.options || []).length) {
    lines.push("", node.answer ? "More specific:" : "Tap a topic — the next screen is an answer.");
  }
  return lines.join("\n").slice(0, 2000);
}

export function viewForNode(userId, nodeId, extra = "", tree = loadTree()) {
  const { id, node } = getNode(tree, nodeId);
  const options = (node.options || []).slice(0, 10);
  const optionsUi = optionItems(userId, id, options);
  const nav = navItems(userId, node, id, tree);
  const customIds = [...optionsUi.map((o) => o.customId), ...nav.map((n) => n.customId)];
  return {
    nodeId: id,
    content: nodeContent(node, extra),
    options: optionsUi,
    nav,
    customIds,
  };
}

export function viewForLeaf(userId, leaf, tree = loadTree()) {
  const parent = leaf.parent && tree[leaf.parent] ? leaf.parent : "root";
  const nav = navItems(userId, { parent }, "_leaf", tree);
  return {
    content: `**${leaf.label}**\n\n${leaf.answer}`.slice(0, 2000),
    options: [],
    nav,
    customIds: nav.map((n) => n.customId),
  };
}

export function treeLeavesAsFaq(tree = loadTree()) {
  const items = [];
  for (const node of Object.values(tree)) {
    if (node.answer && node.prompt) {
      items.push({
        q: node.prompt,
        asks: [node.prompt],
        keywords: String(node.prompt)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4),
        a: node.answer,
      });
    }
    for (const opt of node.options || []) {
      if (!opt.answer) continue;
      items.push({
        q: opt.label,
        asks: [opt.label],
        keywords: String(opt.label)
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 4),
        a: opt.answer,
      });
    }
  }
  return items;
}

export function matchTree(question, tree = loadTree()) {
  return matchFaq(question, treeLeavesAsFaq(tree));
}

export function customIdsAreUnique(ids) {
  return new Set(ids).size === ids.length;
}

export function buttonsPerRow(optionCount, hasNav) {
  const maxOptionRows = hasNav ? 4 : 5;
  if (Math.ceil(optionCount / 2) <= maxOptionRows) return 2;
  return 5;
}
