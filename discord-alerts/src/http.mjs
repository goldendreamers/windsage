import http from 'node:http';
import { startWakeCall, stopWakeCall } from './wakeCall.mjs';

function isLoopback(addr) {
  const a = String(addr || '');
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

export function startWakeHttp(client, cfg) {
  const port = Number(cfg.alertsPort || 8788);
  const server = http.createServer(async (req, res) => {
    if (!isLoopback(req.socket.remoteAddress)) {
      send(res, 403, { ok: false, error: 'loopback only' });
      return;
    }
    if (req.headers['x-windsage-hook'] !== cfg.hookSecret) {
      send(res, 401, { ok: false, error: 'bad hook' });
      return;
    }
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        send(res, 200, { ok: true });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/wake/start') {
        const body = await readJson(req);
        const started = await startWakeCall(client, cfg, body);
        send(res, started.ok ? 200 : 500, started);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/wake/stop') {
        const body = await readJson(req);
        const stopped = await stopWakeCall(body.discordUserId);
        send(res, 200, stopped);
        return;
      }
      send(res, 404, { ok: false, error: 'not found' });
    } catch (err) {
      console.error('windsage-alerts: wake http failed', err);
      send(res, 500, { ok: false, error: err?.message || 'wake failed' });
    }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`windsage-alerts: wake http 127.0.0.1:${port}`);
  });
  return server;
}
