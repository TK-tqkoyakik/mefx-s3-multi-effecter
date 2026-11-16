import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createToneAnalyzer, normalizePreset, validateAnalyzeRequest } from "../src/analyzer.js";
import { createAnalysisError, runProcess } from "../src/processRunner.js";

const request = { url: "https://youtu.be/example", instrument: "guitar" };

function wavBuffer() {
  const samples = 2205;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(44100, 24);
  buffer.writeUInt32LE(88200, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    buffer.writeInt16LE(Math.round(Math.sin(index * Math.PI * 2 * 220 / 44100) * 10000), 44 + index * 2);
  }
  return buffer;
}

function fixture(t, { demucs = true, intercept, requireTools = () => {} } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mefx-analyzer-test-"));
  const tempRoot = path.join(directory, "jobs");
  fs.mkdirSync(tempRoot);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    await intercept?.(command, args, options);
    if (args.includes("--print")) return { stdout: "Fixture Title\n", stderr: "" };
    if (args.includes("yt_dlp")) {
      fs.writeFileSync(args[args.indexOf("-o") + 1].replace("%(ext)s", "webm"), "fixture");
    } else if (args.includes("--out")) {
      const stemDir = path.join(args[args.indexOf("--out") + 1], "htdemucs", "demucs_input");
      fs.mkdirSync(stemDir, { recursive: true });
      fs.writeFileSync(path.join(stemDir, "other.wav"), wavBuffer());
      fs.writeFileSync(path.join(stemDir, "bass.wav"), wavBuffer());
    } else {
      fs.writeFileSync(args.at(-1), wavBuffer());
    }
    return { stdout: "", stderr: "" };
  };
  const analyze = createToneAnalyzer({ run, canUseDemucs: () => demucs, requireTools, tempRoot });
  return { analyze, calls, tempRoot, directory };
}

function progressRecorder(tempRoot, progress) {
  return (event) => {
    progress.push(event);
    if (["completed", "cancelled", "failed"].includes(event.stage)) {
      progress.push({ cleanAtTerminal: fs.readdirSync(tempRoot).length === 0 });
    }
  };
}

test("validates YouTube request", () => {
  assert.equal(validateAnalyzeRequest({ url: "https://youtu.be/example", instrument: "guitar" }), null);
  assert.match(validateAnalyzeRequest({ url: "https://example.com", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: "http://youtu.be/example", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: "https://youtube.com.evil.example/watch?v=x", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: `https://youtu.be/${"a".repeat(2100)}`, instrument: "guitar" }), /YouTube/);
  for (const requestId of ["1234567", "a".repeat(81), "invalid id", null, 12345678]) {
    assert.match(validateAnalyzeRequest({ ...request, requestId }), /requestId/);
  }
  for (const requestId of ["Abcd_12-", "a".repeat(80)]) {
    assert.equal(validateAnalyzeRequest({ ...request, requestId }), null);
  }
});

for (const instrument of ["guitar", "bass"]) {
  test(`Demucs ${instrument} analysis reports progress, extraction and cleans up before completion`, async (t) => {
    const { analyze, calls, tempRoot } = fixture(t);
    const progress = [];
    const controller = new AbortController();
    const result = await analyze({ ...request, instrument }, {
      signal: controller.signal, onProgress: progressRecorder(tempRoot, progress)
    });
    assert.deepEqual(progress.filter((event) => event.stage).map((event) => event.stage), [
      "preparing", "downloading", "converting", "separating", "converting", "analyzing", "completed"
    ]);
    assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
    assert.deepEqual(result.extraction, { method: "demucs", stem: instrument === "bass" ? "bass" : "other" });
    assert.equal(result.notes.length, 3);
    assert.match(result.notes[1], /Demucs/);
    assert.ok(result.preset.deviceTone);
    assert.ok(result.preset.ir.profile.low >= 0);
    assert.deepEqual(result.preset.ir.profile.low, result.features.spectralBands.low);
    assert.ok(calls.every((call) => call.options.signal === controller.signal));
    assert.equal(calls.find((call) => call.args.includes("--out")).options.timeoutMs, 900000);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  });
}

for (const demucs of [true, false]) {
  test(`filter fallback exposes its reason (Demucs installed: ${demucs})`, async (t) => {
    const { analyze, tempRoot } = fixture(t, {
      demucs,
      intercept(command, args) {
        if (args.includes("--out")) throw new Error("model unavailable");
      }
    });
    const progress = [];
    const result = await analyze(request, { onProgress: (event) => progress.push(event) });
    assert.deepEqual(result.extraction, {
      method: "filter", stem: null, fallbackReason: demucs ? "model unavailable" : "Demucs is not installed"
    });
    assert.equal(progress.at(-1).method, "filter");
    assert.equal(progress.at(-1).stage, "completed");
    assert.equal(result.notes.length, 3);
    assert.match(result.notes[1], /フィルター/);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  });
}

test("pre-cancelled analysis performs no tool checks, processes or temporary-file creation", async (t) => {
  const { analyze, calls, tempRoot } = fixture(t, { requireTools() { assert.fail("must not check tools"); } });
  const controller = new AbortController();
  controller.abort();
  const progress = [];
  await assert.rejects(analyze(request, { signal: controller.signal, onProgress: progressRecorder(tempRoot, progress) }), {
    code: "CANCELLED"
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(progress.map((event) => event.stage).filter(Boolean), ["preparing", "cancelled"]);
  assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
});

test("cancellation during separation never falls back and waits for child stop and cleanup", { timeout: 10000 }, async (t) => {
  const controller = new AbortController();
  let pid;
  let abortTimer;
  const { analyze, calls, tempRoot, directory } = fixture(t, {
    async intercept(command, args, options) {
      if (!args.includes("--out")) return;
      const marker = path.join(directory, "child.json");
      const running = runProcess(process.execPath, ["-e", `
        require('node:fs').writeFileSync(process.argv[1], String(process.pid));
        setInterval(() => {}, 1000);
      `, marker], { ...options, timeoutMs: 5000 });
      abortTimer = setInterval(() => {
        if (fs.existsSync(marker)) {
          pid = Number(fs.readFileSync(marker, "utf8"));
          clearInterval(abortTimer);
          controller.abort();
        }
      }, 10);
      await running;
    }
  });
  t.after(() => clearInterval(abortTimer));
  const progress = [];
  await assert.rejects(analyze(request, {
    signal: controller.signal, onProgress: progressRecorder(tempRoot, progress)
  }), { code: "CANCELLED" });
  assert.ok(pid);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(calls.some((call) => call.args.includes("-af")), false);
  assert.equal(progress.some((event) => event.method === "filter"), false);
  assert.equal(progress.at(-2).stage, "cancelled");
  assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test("missing tools report TOOLS_MISSING and failed progress", async (t) => {
  const { analyze, calls, tempRoot } = fixture(t, {
    requireTools() { throw createAnalysisError("TOOLS_MISSING", "tools unavailable"); }
  });
  const progress = [];
  await assert.rejects(analyze(request, { onProgress: progressRecorder(tempRoot, progress) }), { code: "TOOLS_MISSING" });
  assert.deepEqual(calls, []);
  assert.equal(progress.at(-2).stage, "failed");
  assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
});

test("real child timeout finishes termination and cleanup before analysis rejects", { timeout: 10000 }, async (t) => {
  const { analyze, calls, tempRoot, directory } = fixture(t, {
    async intercept(command, args, options) {
      if (!args.includes("--out")) return;
      const marker = path.join(directory, "child.json");
      await runProcess(process.execPath, ["-e", `
        require('node:fs').writeFileSync(process.argv[1], String(process.pid));
        setInterval(() => {}, 1000);
      `, marker], { ...options, timeoutMs: 500 });
    }
  });
  const progress = [];
  await assert.rejects(analyze(request, { onProgress: progressRecorder(tempRoot, progress) }), { code: "TIMEOUT" });
  const pid = Number(fs.readFileSync(path.join(directory, "child.json"), "utf8"));
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  assert.equal(calls.some((call) => call.args.includes("-af")), false);
  assert.equal(progress.at(-2).stage, "failed");
  assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

for (const stage of ["downloading", "converting", "separating", "analyzing"]) {
  test(`cancellation requested at ${stage} is observed without fallback`, async (t) => {
    const { analyze, calls, tempRoot } = fixture(t);
    const controller = new AbortController();
    const progress = [];
    await assert.rejects(analyze(request, {
      signal: controller.signal,
      onProgress(event) {
        progress.push(event);
        if (event.stage === stage) controller.abort();
      }
    }), { code: "CANCELLED" });
    assert.equal(progress.at(-1).stage, "cancelled");
    assert.equal(calls.some((call) => call.args.includes("-af")), false);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  });
}

test("progress observer exceptions cannot prevent cleanup or mask the result", async (t) => {
  const { analyze, tempRoot } = fixture(t);
  const result = await analyze(request, { onProgress() { throw new Error("observer error"); } });
  assert.equal(result.extraction.method, "demucs");
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

for (const stage of ["title", "download", "separation", "filter"]) {
  test(`failure at ${stage} is coded and cleaned up`, async (t) => {
    const { analyze, calls, tempRoot } = fixture(t, {
      demucs: stage !== "filter",
      intercept(command, args) {
        const fails = stage === "title" ? args.includes("--print")
          : stage === "download" ? args.includes("yt_dlp") && !args.includes("--print")
          : stage === "separation" ? args.includes("--out") : args.includes("-af");
        if (fails) {
          if (stage === "title" || stage === "separation") throw createAnalysisError("TIMEOUT", "fixture timeout");
          throw new Error("fixture failure");
        }
      }
    });
    const progress = [];
    await assert.rejects(analyze(request, { onProgress: progressRecorder(tempRoot, progress) }), {
      code: stage === "download" ? "DOWNLOAD_FAILED" : stage === "filter" ? "ANALYSIS_FAILED" : "TIMEOUT"
    });
    assert.equal(progress.at(-2).stage, "failed");
    assert.deepEqual(progress.at(-1), { cleanAtTerminal: true });
    if (stage === "separation") assert.equal(calls.some((call) => call.args.includes("-af")), false);
    assert.deepEqual(fs.readdirSync(tempRoot), []);
  });
}

test("normalizes effect values within range", () => {
  const preset = normalizePreset({
    instrument: "bass",
    name: "Test",
    effects: {
      gain: -10,
      tone_eq: 120,
      compressor: 50.4,
      drive: 10,
      modulation: 0,
      delay_reverb: 100
    },
    bypass: false,
    createdAt: new Date().toISOString(),
    source: "youtube"
  });
  for (const value of Object.values(preset.effects)) {
    assert.equal(Number.isInteger(value), true);
    assert.equal(value >= 0 && value <= 100, true);
  }
});
