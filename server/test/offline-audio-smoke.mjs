import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import ffmpeg from "ffmpeg-static";
import { createToneAnalyzer, analysisProcessEnv } from "../src/analyzer.js";
import { runProcess } from "../src/processRunner.js";

const project = path.resolve(import.meta.dirname, "../..");
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "mefx-offline-audio-"));
const source = path.join(scratch, "synthetic.wav");
const environment = analysisProcessEnv({ ...process.env, PYTHONHOME: "invalid-foreign-home", PYTHONPATH: "invalid-foreign-path" });

try {
  const checkpoints = await fs.readdir(path.join(environment.TORCH_HOME, "hub/checkpoints"));
  assert.ok(checkpoints.some((name) => name.endsWith(".th")), "Demucs checkpoint must already be bundled.");
  await runProcess(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "aevalsrc=0.14*sin(2*PI*110*t)+0.1*sin(2*PI*220*t)+0.08*sin(2*PI*880*t):s=44100:d=2", "-ac", "2", "-c:a", "pcm_s16le", source]);
  const run = async (command, args, options) => {
    if (args.includes("yt_dlp")) {
      if (args.includes("--skip-download")) return { stdout: "Offline synthetic audio", stderr: "" };
      const template = args[args.indexOf("-o") + 1];
      await fs.copyFile(source, template.replace("%(ext)s", "wav"));
      return { stdout: "", stderr: "" };
    }
    return runProcess(command, args, { ...options, env: environment });
  };
  const stages = [];
  const analyze = createToneAnalyzer({ run, tempRoot: scratch });
  const result = await analyze({ url: "https://www.youtube.com/watch?v=offline-test", instrument: "bass" }, {
    onProgress: ({ stage }) => { stages.push(stage); console.log(`offline-audio: ${stage}`); }
  });
  assert.deepEqual(result.extraction, { method: "demucs", stem: "bass" });
  assert.ok(Number.isFinite(result.features.rms) && result.features.rms > 0);
  assert.ok(Object.values(result.preset.effects).every((value) => Number.isInteger(value) && value >= 0 && value <= 100));
  assert.ok(stages.includes("separating") && stages.includes("analyzing") && stages.at(-1) === "completed");
  assert.deepEqual(await fs.readdir(scratch), ["synthetic.wav"]);
  console.log(JSON.stringify({ ok: true, source: "synthetic, no YouTube network", extraction: result.extraction, rms: result.features.rms, effects: result.preset.effects }));
} finally { await fs.rm(scratch, { recursive: true, force: true }); }
