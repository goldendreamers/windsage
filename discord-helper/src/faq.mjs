import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KNOWLEDGE_DIR } from "./config.mjs";
import { REFUSE_REPLY, shouldRefuse } from "./refuse.mjs";

const STOP = new Set(
  `a an the is are was were be been to of in on for and or what how why who does do did can could should would i we you your this that it app about tell me please just hey hi ok`
    .split(/\s+/)
);

export function loadFaq() {
  return JSON.parse(readFileSync(join(KNOWLEDGE_DIR, "faq.json"), "utf8"));
}

export function loadHowto() {
  return readFileSync(join(KNOWLEDGE_DIR, "howto.md"), "utf8");
}

export function loadRules() {
  return readFileSync(join(KNOWLEDGE_DIR, "rules.md"), "utf8");
}

function tokens(s) {
  return new Set(
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
  );
}

export function scoreFaq(question, item) {
  const q = String(question || "").toLowerCase().trim();
  if (!q) return 0;
  if (item.q.toLowerCase() === q) return 1;
  const keywords = item.keywords || [];
  const asks = item.asks || [];
  for (const ask of asks) {
    const a = String(ask).toLowerCase();
    if (!a) continue;
    if (q === a) return 1;
    if (q.length >= 10 && a.length >= 8 && (q.includes(a) || a.includes(q))) return 1;
  }
  let keywordHits = 0;
  for (const k of keywords) {
    const kw = String(k).toLowerCase();
    if (kw && q.includes(kw)) keywordHits += 1;
  }
  const qt = tokens(q);
  const it = tokens(`${item.q} ${asks.join(" ")} ${keywords.join(" ")}`);
  let inter = 0;
  for (const t of qt) if (it.has(t)) inter += 1;
  const overlap = inter / Math.max(qt.size, 1);
  return overlap + keywordHits * 0.35;
}

export function matchFaq(question, items = loadFaq()) {
  const q = String(question || "").toLowerCase().trim();
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const s = scoreFaq(question, item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }
  if (!best) return null;
  const strongKeyword = (best.keywords || []).some((k) => {
    const kw = String(k).toLowerCase();
    return kw.length >= 4 && q.includes(kw);
  });
  if (bestScore >= 0.45 || (strongKeyword && bestScore >= 0.35)) {
    return { item: best, score: bestScore };
  }
  return null;
}

function howtoParagraphs() {
  const raw = loadHowto().split(/## What this helper will not talk about/)[0];
  return raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(
      (p) =>
        p &&
        !p.startsWith("# ") &&
        !p.startsWith("This is the only") &&
        !p.startsWith("Live app:")
    );
}

export function matchHowto(question) {
  const qt = tokens(question);
  if (qt.size === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const para of howtoParagraphs()) {
    if (/will not talk about|SSH|Administrator/i.test(para) && /will not/.test(para)) {
      continue;
    }
    const pt = tokens(para);
    let inter = 0;
    for (const t of qt) if (pt.has(t)) inter += 1;
    const score = inter / Math.max(qt.size, 1);
    if (score > bestScore) {
      bestScore = score;
      best = para.replace(/^#+\s*/, "").replace(/\n/g, " ");
    }
  }
  if (!best || bestScore < 0.34) return null;
  if (bestScore < 0.5 && tokens(question).size < 2) return null;
  return { text: best.slice(0, 1800), score: bestScore };
}

export function answerFromFaq(question, items) {
  if (shouldRefuse(question)) {
    return { source: "refuse", text: REFUSE_REPLY, title: "Can't help with that" };
  }
  const hit = matchFaq(question, items);
  if (hit) return { source: "faq", text: hit.item.a, title: hit.item.q, score: hit.score };
  const pack = matchHowto(question);
  if (pack) return { source: "howto", text: pack.text, title: "How it works", score: pack.score };
  return null;
}
