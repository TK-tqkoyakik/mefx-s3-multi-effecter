import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { runProcess } from "../src/processRunner.js";

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mefx-process-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function waitForFile(file) {
  const deadline = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < deadline, "child must start before the test deadline");
    await setTimeout(10);
  }
}

test("process runner captures output and reports nonzero exits and missing tools", async () => {
  assert.deepEqual(await runProcess(process.execPath, ["-e", "process.stdout.write('out'); process.stderr.write('err')"]), {
    stdout: "out", stderr: "err"
  });
  await assert.rejects(runProcess(process.execPath, ["-e", "process.stderr.write('broken'); process.exit(2)"]), {
    code: "ANALYSIS_FAILED", message: "broken"
  });
  await assert.rejects(runProcess(path.join(os.tmpdir(), "mefx-nonexistent-command", "missing.exe"), []), {
    code: "TOOLS_MISSING"
  });
});

test("pre-aborted process runner never starts a child", async (t) => {
  const marker = path.join(tempDirectory(t), "started");
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runProcess(process.execPath, ["-e", "require('node:fs').writeFileSync(process.argv[1], 'started')", marker], {
    signal: controller.signal
  }), { code: "CANCELLED" });
  assert.equal(fs.existsSync(marker), false);
});

for (const reason of ["timeout", "abort"]) {
  test(`${reason} stops the child and its descendant before rejecting`, { timeout: 15000 }, async (t) => {
    const marker = path.join(tempDirectory(t), "pids.json");
    const controller = new AbortController();
    const script = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
      require('node:fs').writeFileSync(process.argv[1], JSON.stringify([process.pid, child.pid]));
      setInterval(() => {}, 1000);
    `;
    t.after(() => {
      if (!fs.existsSync(marker)) return;
      for (const pid of JSON.parse(fs.readFileSync(marker, "utf8"))) {
        try { process.kill(pid, "SIGKILL"); } catch {}
      }
    });
    const running = runProcess(process.execPath, ["-e", script, marker], {
      signal: controller.signal,
      timeoutMs: reason === "timeout" ? 1000 : 6000
    });
    const rejected = assert.rejects(running, { code: reason === "timeout" ? "TIMEOUT" : "CANCELLED" });
    await waitForFile(marker);
    if (reason === "abort") controller.abort();
    await rejected;
    for (const pid of JSON.parse(fs.readFileSync(marker, "utf8"))) {
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" }, `process ${pid} must be stopped before rejection`);
    }
  });
}
