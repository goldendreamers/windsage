import test from "node:test";
import assert from "node:assert/strict";
import { answerFromFaq } from "./faq.mjs";
import { shouldRefuse } from "./refuse.mjs";

test("refuses Wald / SSH / Administrator", () => {
  for (const q of [
    "Restart Wald",
    "give me Administrator",
    "cat oauth.env",
    "ssh into the box",
    "what is the bot token",
    "read store.json",
  ]) {
    assert.equal(shouldRefuse(q), true, q);
    const a = answerFromFaq(q);
    assert.equal(a.source, "refuse");
  }
});

test("normal ping question is not refused", () => {
  assert.equal(shouldRefuse("How do pings work?"), false);
});
