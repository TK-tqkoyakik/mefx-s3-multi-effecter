import http from "node:http";
import { analyzeTone, normalizePreset, validateAnalyzeRequest } from "./analyzer.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const autoShutdown = process.env.MEFX_AUTO_SHUTDOWN === "1";
const idleTimeoutMs = Number(process.env.MEFX_IDLE_TIMEOUT_MS ?? 60000);
const closeGraceMs = Number(process.env.MEFX_CLOSE_GRACE_MS ?? 12000);
const startedAt = Date.now();
let lastHeartbeatAt = Date.now();
let heartbeatSeen = false;
let shuttingDown = false;

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true"
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "multi-effecter-analysis-server",
      version: "0.1.0",
      autoShutdown,
      idleTimeoutMs,
      heartbeatSeen
    });
    return;
  }

  if (request.method === "POST" && request.url === "/heartbeat") {
    heartbeatSeen = true;
    lastHeartbeatAt = Date.now();
    sendJson(response, 200, {
      ok: true,
      autoShutdown,
      idleTimeoutMs
    });
    return;
  }

  if (request.method === "POST" && request.url === "/client-close") {
    if (autoShutdown) {
      heartbeatSeen = true;
      lastHeartbeatAt = Math.min(lastHeartbeatAt, Date.now() - Math.max(0, idleTimeoutMs - closeGraceMs));
    }
    sendJson(response, 202, { ok: true, autoShutdown, closeGraceMs });
    return;
  }

  if (request.method !== "POST" || request.url !== "/analyze") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readJson(request);
    const validationError = validateAnalyzeRequest(body);
    if (validationError) {
      sendJson(response, 400, { error: validationError });
      return;
    }

    const result = await analyzeTone(body);
    sendJson(response, 200, { ...result, preset: normalizePreset(result.preset) });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Analysis failed" });
  }
});

function shutdownAfterIdle(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`MEFX analysis server shutting down: ${reason}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

if (autoShutdown) {
  setInterval(() => {
    const now = Date.now();
    const idleForMs = now - lastHeartbeatAt;
    const startupIdleMs = now - startedAt;
    if (heartbeatSeen && idleForMs > idleTimeoutMs) {
      shutdownAfterIdle(`no heartbeat for ${idleForMs}ms`);
    } else if (!heartbeatSeen && startupIdleMs > idleTimeoutMs * 2) {
      shutdownAfterIdle(`no web client connected for ${startupIdleMs}ms`);
    }
  }, Math.min(10000, Math.max(2000, Math.floor(idleTimeoutMs / 4)))).unref();
}

server.listen(port, host, () => {
  console.log(`MEFX analysis server listening on http://${host}:${port}`);
  if (autoShutdown) {
    console.log(`Auto shutdown enabled. Idle timeout: ${idleTimeoutMs}ms`);
  }
});
