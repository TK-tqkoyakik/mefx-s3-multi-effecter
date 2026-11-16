import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { createAnalysisServer } from "../src/server.js";
import { createAnalysisError } from "../src/processRunner.js";

const analysisRequest = { url: "https://youtu.be/example", instrument: "guitar", requestId: "request_001" };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function analysisResult() {
  return {
    preset: { effects: { gain: -1, tone_eq: 101, compressor: 50.5, drive: 20, modulation: 10, delay_reverb: 30 } },
    features: { rms: 0.1 },
    notes: ["existing note"],
    extraction: { method: "demucs", stem: "other" }
  };
}

async function startServer(t, analyze) {
  const server = createAnalysisServer({ analyze });
  const port = await listen(server);
  t.after(async () => {
    server.closeAllConnections();
    await close(server);
  });
  return { server, url: `http://127.0.0.1:${port}` };
}

function post(url, route, body) {
  return fetch(`${url}${route}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

function getStatus(url, requestId = analysisRequest.requestId) {
  return fetch(`${url}/analysis/status?requestId=${encodeURIComponent(requestId)}`);
}

async function waitForStage(url, stage, requestId = analysisRequest.requestId) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const response = await getStatus(url, requestId);
    const status = await response.json();
    if (status.stage === stage) return status;
    await setTimeout(10);
  }
  assert.fail(`Expected analysis stage ${stage}`);
}

function partialPost(server, url, firstChunk) {
  const received = once(server, "request");
  const request = http.request(`${url}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" } });
  const response = new Promise((resolve, reject) => {
    request.on("error", reject);
    request.on("response", (incoming) => {
      incoming.resume();
      incoming.on("end", () => resolve(incoming));
    });
  });
  request.write(firstChunk);
  return { request, response, received };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

test("rejects requests from untrusted origins", async () => {
  const server = createAnalysisServer();
  const port = await listen(server);
  try {
    const allowed = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: "https://tk-tqkoyakik.github.io" }
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://tk-tqkoyakik.github.io");

    const blocked = await fetch(`http://127.0.0.1:${port}/health`, {
      headers: { Origin: "https://evil.example" }
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);
  } finally {
    await close(server);
  }
});

test("rejects oversized JSON bodies before analysis", async () => {
  const server = createAnalysisServer();
  const port = await listen(server);
  try {
    const body = JSON.stringify({
      url: `https://youtu.be/${"a".repeat(40000)}`,
      instrument: "guitar"
    });
    const response = await fetch(`http://127.0.0.1:${port}/analyze`, {
      method: "POST",
      headers: {
        Origin: "https://tk-tqkoyakik.github.io",
        "Content-Type": "application/json"
      },
      body
    });
    assert.equal(response.status, 413);
  } finally {
    await close(server);
  }
});

test("reports live progress, preserves the last finished job, and keeps the legacy result shape", { timeout: 10000 }, async (t) => {
  let started = deferred();
  let finish = deferred();
  let options;
  let receivedRequest;
  const { url } = await startServer(t, async (body, currentOptions) => {
    receivedRequest = body;
    options = currentOptions;
    options.onProgress({ stage: "downloading" });
    started.resolve();
    await finish.promise;
    return analysisResult();
  });
  let pending = post(url, "/analyze", analysisRequest);
  await started.promise;
  assert.deepEqual(await (await getStatus(url)).json(), { requestId: analysisRequest.requestId, stage: "downloading" });
  options.onProgress({ stage: "separating", method: "demucs", detail: "fixture separation" });
  assert.deepEqual(await (await getStatus(url)).json(), {
    requestId: analysisRequest.requestId, stage: "separating", method: "demucs", detail: "fixture separation"
  });
  options.onProgress({ stage: "analyzing" });
  assert.deepEqual(await (await getStatus(url)).json(), {
    requestId: analysisRequest.requestId, stage: "analyzing", method: "demucs"
  });
  finish.resolve();
  let response = await pending;
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.requestId, analysisRequest.requestId);
  assert.deepEqual(receivedRequest, analysisRequest);
  assert.deepEqual(result.extraction, { method: "demucs", stem: "other" });
  assert.deepEqual(result.notes, ["existing note"]);
  assert.deepEqual(result.features, { rms: 0.1 });
  assert.equal(result.preset.effects.gain, 0);
  assert.equal(result.preset.effects.tone_eq, 100);
  assert.equal(result.preset.effects.compressor, 51);
  assert.equal(options.signal.aborted, false);
  assert.deepEqual(await (await getStatus(url)).json(), {
    requestId: analysisRequest.requestId, stage: "completed", method: "demucs"
  });
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: analysisRequest.requestId })).json(), { ok: false });
  assert.equal((await post(url, "/analyze", analysisRequest)).status, 200);

  started = deferred();
  finish = deferred();
  pending = post(url, "/analyze", { url: analysisRequest.url, instrument: analysisRequest.instrument });
  await started.promise;
  const generatedId = receivedRequest.requestId;
  assert.match(generatedId, /^[A-Za-z0-9_-]{8,80}$/);
  assert.equal((await getStatus(url)).status, 200);
  assert.equal((await getStatus(url, generatedId)).status, 200);
  assert.equal((await getStatus(url, generatedId)).headers.get("cache-control"), "no-store");
  finish.resolve();
  response = await pending;
  assert.equal(response.status, 200);
  assert.equal((await response.json()).requestId, generatedId);
  assert.equal((await getStatus(url)).status, 404);
  assert.equal((await getStatus(url, generatedId)).status, 200);
});

test("cancel aborts only the matching job and keeps the slot until cleanup completes", { timeout: 10000 }, async (t) => {
  const started = deferred();
  const aborted = deferred();
  const cleanup = deferred();
  const { url } = await startServer(t, async (body, { signal, onProgress }) => {
    onProgress({ stage: "separating", method: "demucs" });
    signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    started.resolve();
    await aborted.promise;
    onProgress({ stage: "analyzing", method: "filter" });
    await cleanup.promise;
    throw createAnalysisError("CANCELLED", "fixture cancellation");
  });
  const pending = post(url, "/analyze", analysisRequest);
  await started.promise;
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: "unknown_001" })).json(), { ok: false });
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: analysisRequest.requestId })).json(), { ok: true });
  await aborted.promise;
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: analysisRequest.requestId })).json(), { ok: false });
  assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId: "request_002" })).status, 429);
  assert.deepEqual(await (await getStatus(url)).json(), {
    requestId: analysisRequest.requestId, stage: "separating", method: "demucs"
  });
  cleanup.resolve();
  const response = await pending;
  assert.equal(response.status, 499);
  assert.deepEqual(await response.json(), { error: "Analysis cancelled", code: "CANCELLED", requestId: analysisRequest.requestId });
  assert.deepEqual(await (await getStatus(url)).json(), {
    requestId: analysisRequest.requestId, stage: "cancelled", method: "demucs", detail: "Analysis cancelled", errorCode: "CANCELLED"
  });
});

test("busy responses and late invalid JSON never release another job's slot", { timeout: 10000 }, async (t) => {
  const started = deferred();
  const finish = deferred();
  let calls = 0;
  const { server, url } = await startServer(t, async () => {
    calls += 1;
    started.resolve();
    await finish.promise;
    return analysisResult();
  });
  assert.equal((await post(url, "/analyze", "{")).status, 400);
  assert.equal((await post(url, "/analyze", { ...analysisRequest, instrument: "invalid" })).status, 400);
  const invalid = partialPost(server, url, "{");
  await invalid.received;
  const valid = partialPost(server, url, JSON.stringify({ ...analysisRequest, requestId: "request_003" }));
  await valid.received;
  const pending = post(url, "/analyze", analysisRequest);
  await started.promise;
  invalid.request.end();
  assert.equal((await invalid.response).statusCode, 400);
  valid.request.end();
  assert.equal((await valid.response).statusCode, 429);
  for (let index = 0; index < 3; index += 1) {
    assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId: "request_002" })).status, 429);
  }
  assert.equal((await post(url, "/analysis/cancel", "{")).status, 400);
  assert.equal((await post(url, "/analysis/cancel", {})).status, 400);
  assert.equal((await post(url, "/analyze", "{")).status, 429);
  assert.equal(calls, 1);
  assert.equal((await getStatus(url)).status, 200);
  finish.resolve();
  assert.equal((await pending).status, 200);
  assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId: "request_004" })).status, 200);
  assert.equal(calls, 2);
});

test("job state and execution slots are isolated between server instances", { timeout: 10000 }, async (t) => {
  let count = 0;
  const bothStarted = deferred();
  const finish = deferred();
  const analyze = async () => {
    if (++count === 2) bothStarted.resolve();
    await finish.promise;
    return analysisResult();
  };
  const first = await startServer(t, analyze);
  const second = await startServer(t, analyze);
  const pending = [post(first.url, "/analyze", analysisRequest), post(second.url, "/analyze", analysisRequest)];
  await bothStarted.promise;
  assert.equal((await getStatus(first.url)).status, 200);
  assert.equal((await getStatus(second.url)).status, 200);
  finish.resolve();
  assert.deepEqual((await Promise.all(pending)).map((response) => response.status), [200, 200]);
  const third = await startServer(t, analyze);
  assert.equal((await getStatus(third.url)).status, 404);
});

test("response close before finish aborts analysis and retains its cancelled status", { timeout: 10000 }, async (t) => {
  const started = deferred();
  const aborted = deferred();
  const cleanup = deferred();
  const { url } = await startServer(t, async (body, { signal }) => {
    signal.addEventListener("abort", () => aborted.resolve(), { once: true });
    started.resolve();
    await aborted.promise;
    await cleanup.promise;
    // The server still treats an analyzer ignoring abort as cancelled.
    return analysisResult();
  });
  const request = http.request(`${url}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" } });
  request.on("error", () => {});
  request.end(JSON.stringify(analysisRequest));
  await started.promise;
  request.destroy();
  await aborted.promise;
  assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId: "request_002" })).status, 429);
  cleanup.resolve();
  assert.equal((await waitForStage(url, "cancelled")).errorCode, "CANCELLED");
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: analysisRequest.requestId })).json(), { ok: false });
});

for (const [code, status] of Object.entries({ CANCELLED: 499, TIMEOUT: 504, DOWNLOAD_FAILED: 502, TOOLS_MISSING: 503, ANALYSIS_FAILED: 500 })) {
  test(`HTTP failure ${code} is retained and releases the slot`, async (t) => {
    const { url } = await startServer(t, async () => { throw createAnalysisError(code, "fixture error"); });
    const response = await post(url, "/analyze", analysisRequest);
    assert.equal(response.status, status);
    assert.equal((await response.json()).code, code);
    const job = await (await getStatus(url)).json();
    assert.equal(job.errorCode, code);
    assert.equal(job.stage, code === "CANCELLED" ? "cancelled" : "failed");
    assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId: "request_002" })).status, status);
  });
}

test("validates ids across endpoints without starting analysis", async (t) => {
  const { url } = await startServer(t, () => assert.fail("must not run invalid input"));
  for (const requestId of ["short", "a".repeat(81), "invalid!id", 12345678, null]) {
    assert.equal((await post(url, "/analyze", { ...analysisRequest, requestId })).status, 400);
    assert.equal((await post(url, "/analysis/cancel", { requestId })).status, 400);
    if (typeof requestId === "string") assert.equal((await getStatus(url, requestId)).status, 400);
  }
  assert.equal((await fetch(`${url}/analysis/status`)).status, 400);
  assert.equal((await getStatus(url, "unknown_001")).status, 404);
  assert.deepEqual(await (await post(url, "/analysis/cancel", { requestId: "unknown_001" })).json(), { ok: false });
});
