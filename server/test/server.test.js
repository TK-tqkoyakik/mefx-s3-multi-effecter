import test from "node:test";
import assert from "node:assert/strict";
import { createAnalysisServer } from "../src/server.js";

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
