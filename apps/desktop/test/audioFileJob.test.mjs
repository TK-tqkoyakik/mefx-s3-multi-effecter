import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { AudioFileJobs } from "../dist-electron/audioFileJob.js";

const write = "require('node:fs').writeFileSync(process.argv[1], Buffer.alloc(80));";
async function scratch(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mefx-audio-日本語-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test("audio job publishes only a complete file and does not overwrite a prior export", async (t) => {
  const dir = await scratch(t); const out = path.join(dir, "出力.wav");
  const jobs = new AudioFileJobs();
  assert.equal((await jobs.run(process.execPath, ["-e", write], out, "complete-01")).ok, true);
  const second = await jobs.run(process.execPath, ["-e", write], out, "complete-02");
  assert.equal(second.ok, false);
  assert.equal((await fs.stat(out)).size, 80);
  assert.deepEqual(await fs.readdir(dir), ["出力.wav"]);
});
test("cancellation waits for process exit and removes the partial output", async (t) => {
  const dir = await scratch(t); const jobs = new AudioFileJobs();
  const work = jobs.run(process.execPath, ["-e", write + "setInterval(()=>{},1000)"], path.join(dir, "cancel.wav"), "cancel-01");
  assert.throws(() => jobs.run(process.execPath, [], path.join(dir, "busy.wav"), "busy-job1"), /処理中/);
  assert.equal((await jobs.cancel("different-id")).ok, false);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await jobs.cancel("cancel-01")).ok, true);
  const result = await work;
  assert.equal(result.cancelled, true);
  assert.equal(jobs.status("cancel-01").stage, "cancelled");
  assert.deepEqual(await fs.readdir(dir), []);
});
test("timeout and shutdown both stop ffmpeg and cannot leave successful outputs", async (t) => {
  const dir = await scratch(t); const jobs = new AudioFileJobs();
  const args = ["-e", write + "setInterval(()=>{},1000)"];
  assert.equal((await jobs.run(process.execPath, args, path.join(dir, "timeout.wav"), "timeout-01", 100)).code, "TIMEOUT");
  const work = jobs.run(process.execPath, args, path.join(dir, "shutdown.wav"), "shutdown-01");
  await jobs.stop();
  assert.equal((await work).cancelled, true);
  assert.deepEqual(await fs.readdir(dir), []);
});
test("spawn failure is reported once and releases the job slot", async (t) => {
  const dir = await scratch(t); const jobs = new AudioFileJobs();
  assert.equal((await jobs.run(path.join(dir, "absent.exe"), [], path.join(dir, "failed.wav"), "failure-01")).ok, false);
  assert.equal((await jobs.run(process.execPath, ["-e", write], path.join(dir, "retry.wav"), "recovery-01")).ok, true);
});
test("bundled ffmpeg creates a valid WAV using Japanese output paths", async (t) => {
  const dir = await scratch(t); const jobs = new AudioFileJobs();
  const ffmpeg = path.resolve("../../server/node_modules/ffmpeg-static/ffmpeg.exe");
  const out = path.join(dir, "実際の変換.wav");
  assert.equal((await jobs.run(ffmpeg, ["-nostdin", "-n", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-ac", "2", "-c:a", "pcm_s16le"], out, "ffmpeg-real1")).ok, true);
  const bytes = await fs.readFile(out);
  assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString(), "WAVE");
});
test("bundled ffmpeg is actually stopped when processing is cancelled", async (t) => {
  const dir = await scratch(t); const jobs = new AudioFileJobs();
  const ffmpeg = path.resolve("../../server/node_modules/ffmpeg-static/ffmpeg.exe");
  const work = jobs.run(ffmpeg, ["-nostdin", "-n", "-re", "-f", "lavfi", "-i", "sine=frequency=440", "-c:a", "pcm_s16le"], path.join(dir, "中止.wav"), "ffmpeg-cancel1");
  await new Promise((resolve) => setTimeout(resolve, 250));
  await jobs.cancel("ffmpeg-cancel1");
  assert.equal((await work).cancelled, true);
  assert.deepEqual(await fs.readdir(dir), []);
});
