const REFUSE_RE = [
  /\bwald\b/i,
  /\bssh\b/i,
  /\bsudo\b/i,
  /\boauth\.env\b/i,
  /\bstore\.json\b/i,
  /\btailscale\b/i,
  /\bwindsage\.service\b/i,
  /\brelease:web\b/i,
  /\bport\s*8787\b/i,
  /\badministrator\b/i,
  /\bbot token\b/i,
  /\bapi key\b/i,
  /\bclient secret\b/i,
  /\brestart (the )?(server|host|box|wald)\b/i,
  /\bgive me admin/i,
  /\bpassword\b/i,
  /\bprivate key\b/i,
];

export const REFUSE_REPLY =
  "I can't help with servers, secrets, login keys, or Discord Administrator. Ask a human mod if you still need something.";

export function shouldRefuse(question) {
  const q = String(question || "");
  return REFUSE_RE.some((re) => re.test(q));
}

export function llmLooksUnsafe(text) {
  return shouldRefuse(text);
}
