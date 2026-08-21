import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { answerFromFaq } from "./faq.mjs";
import {
  buttonsPerRow,
  customIdsAreUnique,
  loadTree,
  matchTree,
  pickOption,
  viewForLeaf,
  viewForNode,
} from "./tree-data.mjs";

const tree = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../knowledge/tree.json"), "utf8")
);

test("every goto points at a node; every leaf has an answer", () => {
  assert.ok(tree.root);
  for (const [id, node] of Object.entries(tree)) {
    assert.ok(node.prompt, id);
    const ids = new Set();
    for (const opt of node.options || []) {
      assert.ok(opt.id && opt.label, `${id}.${opt.id}`);
      assert.ok(!ids.has(opt.id), `duplicate option id ${id}.${opt.id}`);
      ids.add(opt.id);
      assert.ok(opt.goto || opt.answer, `${id}.${opt.id} needs goto or answer`);
      if (opt.goto) assert.ok(tree[opt.goto], `missing node ${opt.goto}`);
      assert.ok(String(opt.label).length <= 80, `${id}.${opt.id} label too long for a button`);
    }
    if (id !== "root") {
      assert.ok(node.parent && tree[node.parent], `bad parent on ${id}`);
      assert.ok(
        node.answer && node.answer.length > 40,
        `${id} needs a real answer so the first tap is not empty`
      );
    }
  }
});

test("nav buttons never reuse a custom id (the bug that froze the menu)", () => {
  for (const id of Object.keys(tree)) {
    const view = viewForNode("123", id, "", tree);
    assert.ok(customIdsAreUnique(view.customIds), `duplicate custom id on node ${id}: ${view.customIds}`);
    for (const cid of view.customIds) {
      assert.ok(cid.length <= 100, cid);
    }
    const hasNav = view.nav.length > 0;
    const rows =
      Math.ceil(view.options.length / buttonsPerRow(view.options.length, hasNav)) + (hasNav ? 1 : 0);
    assert.ok(rows <= 5, `${id} would send ${rows} action rows`);
  }
});

test("tapping a root topic shows that topic's answer immediately", () => {
  const picked = pickOption(tree, "root", "ping");
  assert.equal(picked.type, "goto");
  const view = viewForNode("123", picked.nodeId, "", tree);
  assert.match(view.content, /phone stays idle/i);
  assert.match(view.content, /10 minutes/i);
  assert.ok(view.options.length >= 1);
});

test("tapping a blue answer button shows the card, with unique nav ids", () => {
  const picked = pickOption(tree, "what", "w2");
  assert.equal(picked.type, "answer");
  assert.match(picked.answer, /github\.com\/goldendreamers\/windsage/);
  const leaf = viewForLeaf("123", picked, tree);
  assert.ok(customIdsAreUnique(leaf.customIds));
  assert.ok(leaf.nav.length >= 1);
  assert.match(leaf.content, /Free to use/i);
});

test("parent=root topics only get one button back to root", () => {
  const view = viewForNode("123", "what", "", tree);
  const toRoot = view.nav.filter((n) => n.customId.endsWith(":root"));
  assert.equal(toRoot.length, 1);
});

test("typed questions hit FAQ, not an empty menu", () => {
  const hit = answerFromFaq("how do pings work?");
  assert.equal(hit.source, "faq");
  assert.match(hit.text, /phone stays idle/i);
});

test("tree matcher covers a leaf that FAQ might miss", () => {
  const hit = matchTree("tempest windfinder removed", tree);
  assert.ok(hit);
  assert.match(hit.item.a, /Removed from Add Station/i);
});
