import http from "node:http";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { analyzeTone, isValidRequestId, normalizePreset, validateAnalyzeRequest } from "./analyzer.js";
import { throwIfCancelled } from "./processRunner.js";

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? "127.0.0.1";
const autoShutdown = process.env.MEFX_AUTO_SHUTDOWN === "1";
const idleTimeoutMs = Number(process.env.MEFX_IDLE_TIMEOUT_MS ?? 60000);
const closeGraceMs = Number(process.env.MEFX_CLOSE_GRACE_MS ?? 12000);
const maxJsonBytes = Number(process.env.MEFX_MAX_JSON_BYTES ?? 32768);
const allowedOrigins = new Set(
  (process.env.MEFX_ALLOWED_ORIGINS ?? "https://tk-tqkoyakik.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const startedAt = Date.now();
let lastHeartbeatAt = Date.now();
let heartbeatSeen = false;
let shuttingDown = false;
const progressStages = new Set(["preparing", "downloading", "converting", "separating", "analyzing", "completed", "cancelled", "failed"]);
const errorStatuses = { CANCELLED: 499, TIMEOUT: 504, DOWNLOAD_FAILED: 502, TOOLS_MISSING: 503, ANALYSIS_FAILED: 500 };

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.has(origin) || isLoopbackOrigin(origin);
}

function sendJson(request, response, statusCode, payload) {
  if (response.destroyed || response.writableEnded) return;
  const body = JSON.stringify(payload);
  const origin = request.headers.origin;
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin || "null";
    headers["Access-Control-Allow-Private-Network"] = "true";
  }
  response.writeHead(statusCode, headers);
  response.end(body);
}

async function readJson(request, maxBytes = maxJsonBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createAnalysisServer({ analyze = analyzeTone } = {}) {
  let activeJob = null;
  let lastFinishedJob = null;

  return http.createServer(async (request, response) => {
    if (!isOriginAllowed(request.headers.origin)) {
      sendJson(request, response, 403, { error: "Origin not allowed" });
      return;
    }

    if (request.method === "OPTIONS") {
      sendJson(request, response, 204, {});
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      sendJson(request, response, 200, {
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
      sendJson(request, response, 200, { ok: true, autoShutdown, idleTimeoutMs });
      return;
    }

    if (request.method === "POST" && request.url === "/client-close") {
      if (autoShutdown) {
        heartbeatSeen = true;
        lastHeartbeatAt = Math.min(lastHeartbeatAt, Date.now() - Math.max(0, idleTimeoutMs - closeGraceMs));
      }
      sendJson(request, response, 202, { ok: true, autoShutdown, closeGraceMs });
      return;
    }

    let job;
    let onClose;
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (request.method === "GET" && requestUrl.pathname === "/analysis/status") {
        const requestId = requestUrl.searchParams.get("requestId");
        if (!isValidRequestId(requestId)) {
          sendJson(request, response, 400, { error: "A valid requestId is required" });
          return;
        }
        const status = activeJob?.status.requestId === requestId ? activeJob.status : lastFinishedJob;
        if (status?.requestId !== requestId) {
          sendJson(request, response, 404, { error: "Analysis not found" });
          return;
        }
        sendJson(request, response, 200, status);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/analysis/cancel") {
        const body = await readJson(request);
        if (!isValidRequestId(body?.requestId)) {
          sendJson(request, response, 400, { error: "A valid requestId is required" });
          return;
        }
        const ok = activeJob?.status.requestId === body.requestId && !activeJob.controller.signal.aborted;
        if (ok) activeJob.controller.abort();
        sendJson(request, response, 200, { ok: Boolean(ok) });
        return;
      }

      if (request.method !== "POST" || requestUrl.pathname !== "/analyze") {
        sendJson(request, response, 404, { error: "Not found" });
        return;
      }

      const busy = () => sendJson(request, response, 429, { error: "Analysis is already running. Try again after it finishes." });
      if (activeJob) {
        busy();
        return;
      }
      const controller = new AbortController();
      onClose = () => {
        if (!response.writableFinished) controller.abort();
      };
      response.once("close", onClose);
      const body = await readJson(request);
      const validationError = validateAnalyzeRequest(body);
      if (validationError) {
        sendJson(request, response, 400, { error: validationError });
        return;
      }
      if (controller.signal.aborted) return;
      // Another request may have acquired the slot while this body was arriving.
      if (activeJob) {
        busy();
        return;
      }
      const requestId = body.requestId ?? randomUUID();
      job = { controller, status: { requestId, stage: "preparing" } };
      activeJob = job;
      const result = await analyze({ ...body, requestId }, {
        signal: controller.signal,
        onProgress(progress) {
          if (activeJob !== job || controller.signal.aborted || !progressStages.has(progress?.stage)) return;
          const method = ["demucs", "filter"].includes(progress.method) ? progress.method : job.status.method;
          job.status = {
            requestId,
            stage: progress.stage,
            ...(method ? { method } : {}),
            ...(typeof progress.detail === "string" ? { detail: progress.detail } : {})
          };
        }
      });
      throwIfCancelled(controller.signal);
      const payload = { ...result, requestId, preset: normalizePreset(result.preset) };
      const method = result.extraction?.method || job.status.method;
      job.status = {
        requestId,
        stage: "completed",
        ...(method ? { method } : {})
      };
      sendJson(request, response, 200, payload);
    } catch (error) {
      if (job) {
        const code = job.controller.signal.aborted ? "CANCELLED"
          : Object.hasOwn(errorStatuses, error?.code) ? error.code : "ANALYSIS_FAILED";
        const detail = code === "CANCELLED" ? "Analysis cancelled" : error instanceof Error ? error.message : "Analysis failed";
        job.status = { ...job.status, stage: code === "CANCELLED" ? "cancelled" : "failed", detail, errorCode: code };
        sendJson(request, response, errorStatuses[code], { error: detail, code, requestId: job.status.requestId });
      } else {
        const statusCode = error instanceof SyntaxError ? 400 : Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        sendJson(request, response, statusCode, { error: error instanceof Error ? error.message : "Invalid request" });
      }
    } finally {
      if (onClose) response.removeListener("close", onClose);
      if (job && activeJob === job) {
        lastFinishedJob = job.status;
        activeJob = null;
      }
    }
  });
}

function shutdownAfterIdle(server, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`MEFX analysis server shutting down: ${reason}`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 4000).unref();
}

function enableAutoShutdown(server) {
  if (!autoShutdown) return;
  setInterval(() => {
    const now = Date.now();
    const idleForMs = now - lastHeartbeatAt;
    const startupIdleMs = now - startedAt;
    if (heartbeatSeen && idleForMs > idleTimeoutMs) {
      shutdownAfterIdle(server, `no heartbeat for ${idleForMs}ms`);
    } else if (!heartbeatSeen && startupIdleMs > idleTimeoutMs * 2) {
      shutdownAfterIdle(server, `no web client connected for ${startupIdleMs}ms`);
    }
  }, Math.min(10000, Math.max(2000, Math.floor(idleTimeoutMs / 4)))).unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createAnalysisServer();
  enableAutoShutdown(server);
  server.listen(port, host, () => {
    console.log(`MEFX analysis server listening on http://${host}:${port}`);
    if (autoShutdown) {
      console.log(`Auto shutdown enabled. Idle timeout: ${idleTimeoutMs}ms`);
    }
  });
}
