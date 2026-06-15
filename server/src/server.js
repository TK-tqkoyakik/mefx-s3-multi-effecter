import http from "node:http";
import { analyzeTone, normalizePreset, validateAnalyzeRequest } from "./analyzer.js";

const port = Number(process.env.PORT ?? 8787);

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
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
    sendJson(response, 200, { ok: true, service: "multi-effecter-analysis-server" });
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

server.listen(port, () => {
  console.log(`MEFX analysis server listening on http://localhost:${port}`);
});
