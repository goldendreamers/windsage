import test from "node:test";
import assert from "node:assert/strict";
import { answerFromFaq, matchFaq } from "./faq.mjs";

test("pings FAQ", () => {
  const hit = answerFromFaq("How do pings work?");
  assert.equal(hit.source, "faq");
  assert.match(hit.text, /phone stays idle/i);
});

test("home screen FAQ", () => {
  const hit = answerFromFaq("how do I add to home screen on iphone");
  assert.equal(hit.source, "faq");
  assert.match(hit.text, /Add to Home Screen/);
});

test("follow station", () => {
  const hit = answerFromFaq("how do I follow a station? 2259 freegull");
  assert.equal(hit.source, "faq");
});

test("unknown goes to null so caller can show the question tree", () => {
  const hit = answerFromFaq("what is the capital of France?");
  assert.equal(hit, null);
});

test("what is windsage", () => {
  const hit = answerFromFaq("what is windsage?");
  assert.ok(hit);
  assert.match(hit.text, /wind-alert/i);
});

test("what does this app do", () => {
  const hit = answerFromFaq("what does this app do");
  assert.ok(hit);
  assert.match(hit.text, /https:\/\/windsage\.nimrod\.bio/i);
});

test("android install", () => {
  const hit = answerFromFaq("how do I install on android");
  assert.equal(hit.source, "faq");
  assert.match(hit.text, /Android/i);
});

test("matchFaq scores a direct question", () => {
  const m = matchFaq("How do pings work?");
  assert.ok(m && m.score >= 0.55);
});
