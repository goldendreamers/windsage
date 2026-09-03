#!/usr/bin/env node
/**
 * Local agent face for the S22. Binds 0.0.0.0 so the Android WebView
 * can reach Termux via the phone Tailscale IP (loopback is isolated).
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WINDSAGE_LOCAL_PORT || 8790);
const CWD = process.env.WINDSAGE_ROOT || join(homedir(), "windsage");
const AGENT = process.env.CURSOR_AGENT || join(homedir(), ".local/bin/cursor-agent");
const PREFIX = `
You are a LOCAL Windsage agent on this Samsung S22 (Termux). cwd is ${CWD}.
ssh wald-mc is available. Never wipe /data/windsage/data/store.json.
Never merge to main unless asked. Never print .env.smtp or private key bytes.
remember discord bot alerts
`.trim();

const HTML = readFileSync(join(HERE, "index.html"), "utf8");
const MEMORY = join(HERE, "memory.json");

function readMemory() {
  try {
    const raw = JSON.parse(readFileSync(MEMORY, "utf8"));
    const messages = Array.isArray(raw.messages) ? raw.messages.slice(-80) : [];
    return {
      messages,
      continue: raw.continue === true,
      updatedAt: raw.updatedAt || null,
    };
  } catch {
    return { messages: [], continue: false, updatedAt: null };
  }
}

function writeMemory(partial) {
  const prev = readMemory();
  const next = {
    messages: Array.isArray(partial.messages) ? partial.messages.slice(-80) : prev.messages,
    continue: partial.continue === undefined ? prev.continue : !!partial.continue,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(MEMORY, JSON.stringify(next), { mode: 0o600 });
  return next;
}

function cors(extra = {}) {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store",
    ...extra,
  };
}

function json(res, code, body) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    ...cors(),
  });
  res.end(data);
}

function etaFor(prompt) {
  const n = prompt.length;
  if (n < 200) return { label: "30–90 sec", ms: 60_000 };
  if (n < 2000) return { label: "1–3 min", ms: 150_000 };
  if (n < 8000) return { label: "3–6 min", ms: 270_000 };
  return { label: "5–10 min", ms: 420_000 };
}

function health() {
  return {
    ok: true,
    kind: "local",
    cwd: CWD,
    cursorAgent: existsSync(AGENT),
    agentPath: existsSync(AGENT) ? AGENT : null,
    listen: `0.0.0.0:${PORT}`,
    memoryTurns: readMemory().messages.length,
  };
}

function sseWrite(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function pickText(obj) {
  if (!obj || typeof obj !== "object") return "";
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.delta === "string") return obj.delta;
  if (typeof obj.message === "string") return obj.message;
  const content = obj.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && (b.text || b.content || "")) || "")
      .join("");
  }
  if (typeof obj.result === "string") return obj.result;
  return "";
}

function streamAgent(prompt, res, useContinue) {
  return new Promise((resolve) => {
    const started = Date.now();
    const eta = etaFor(prompt);
    if (!existsSync(AGENT)) {
      sseWrite(res, { type: "error", error: "cursor-agent missing" });
      resolve();
      return;
    }
    const args = [
      "-p",
      "--trust",
      "--force",
      "--output-format",
      "stream-json",
      "--stream-partial-output",
    ];
    if (useContinue) args.push("--continue");
    args.push(`${PREFIX}\n\n${prompt}`);
    const child = spawn(AGENT, args, {
      cwd: CWD,
      env: {
        ...process.env,
        PATH: `${join(homedir(), ".local/bin")}:${process.env.PATH || ""}`,
        HOME: homedir(),
      },
    });
    const tick = setInterval(() => {
      const elapsedMs = Date.now() - started;
      sseWrite(res, {
        type: "tick",
        phase: "thinking",
        elapsedMs,
        eta: eta.label,
        remain: Math.max(0, eta.ms - elapsedMs),
      });
    }, 1000);
    sseWrite(res, {
      type: "status",
      phase: "starting",
      elapsedMs: 0,
      eta: eta.label,
      detail: "Starting local cursor-agent on this phone…",
    });

    let buf = "";
    const onChunk = (b, from) => {
      const s = b.toString("utf8");
      buf += s;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || "";
      for (const line of lines) {
        const raw = line.trim();
        if (!raw) continue;
        let obj = null;
        try {
          obj = JSON.parse(raw);
        } catch {
          if (from === "err") {
            sseWrite(res, { type: "status", phase: "thinking", detail: raw.slice(0, 240) });
          } else {
            sseWrite(res, { type: "text", text: raw + "\n" });
          }
          continue;
        }
        const t = String(obj.type || obj.event || obj.kind || "").toLowerCase();
        const text = pickText(obj);
        if (t.includes("think") || t.includes("reasoning")) {
          sseWrite(res, { type: "think", text: text || "Thinking…" });
        } else if (t.includes("tool") || t.includes("command") || obj.tool || obj.name) {
          const name = obj.tool || obj.name || obj.toolName || "tool";
          sseWrite(res, { type: "tool", name: String(name), text: text.slice(0, 200) });
        } else if (text) {
          sseWrite(res, { type: "text", text });
        } else {
          sseWrite(res, { type: "status", phase: t || "working", detail: t || "working" });
        }
      }
    };

    child.stdout.on("data", (b) => onChunk(b, "out"));
    child.stderr.on("data", (b) => onChunk(b, "err"));
    const finish = (code) => {
      clearInterval(tick);
      if (buf.trim()) onChunk(Buffer.from("\n"), "out");
      const elapsedMs = Date.now() - started;
      if (code && code !== 0) {
        sseWrite(res, { type: "error", error: `exit ${code}`, elapsedMs });
      } else {
        sseWrite(res, { type: "done", elapsedMs, eta: eta.label });
      }
      resolve();
    };
    child.on("error", (e) => {
      clearInterval(tick);
      sseWrite(res, { type: "error", error: String(e.message || e) });
      resolve();
    });
    child.on("close", finish);
    setTimeout(() => {
      child.kill("SIGTERM");
    }, 10 * 60 * 1000);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors());
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...cors() });
    res.end(HTML);
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, health());
    return;
  }
  if (req.method === "GET" && url.pathname === "/v1/memory") {
    json(res, 200, readMemory());
    return;
  }
  if (req.method === "PUT" && url.pathname === "/v1/memory") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try {
      json(res, 200, writeMemory(JSON.parse(raw || "{}")));
    } catch {
      json(res, 400, { error: "bad json" });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/v1/chat") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let prompt = "";
    try {
      prompt = String(JSON.parse(raw || "{}").prompt || "").trim();
    } catch {
      json(res, 400, { error: "bad json" });
      return;
    }
    if (!prompt) {
      json(res, 400, { error: "empty prompt" });
      return;
    }
    res.writeHead(200, cors({
      "content-type": "text/event-stream; charset=utf-8",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    }));
    const mem = readMemory();
    await streamAgent(prompt, res, mem.continue);
    writeMemory({ continue: true });
    res.end();
    return;
  }
  json(res, 404, { error: "not found" });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    process.stdout.write(`local-agent already on :${PORT}\n`);
    process.exit(0);
  }
  throw err;
});
// 0.0.0.0 so the Android app can reach Termux (127.0.0.1 is flaky from WebView).
server.listen(PORT, "0.0.0.0", () => {
  process.stdout.write(`local-agent http://127.0.0.1:${PORT} and :${PORT} on all ifaces cwd=${CWD}\n`);
});
