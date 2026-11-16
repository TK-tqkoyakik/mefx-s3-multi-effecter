import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { LibraryRepository } from "../dist-electron/libraryRepository.js";

const preset = (name = "日本語の音色") => ({ instrument: "guitar", name, effects: { gain: 45, tone_eq: 50, compressor: 20, drive: 0, modulation: 0, delay_reverb: 10 }, bypass: false, createdAt: "2026-10-21T00:00:00.000Z", source: "manual" });
function makeWav() {
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0); wav.writeUInt32LE(40, 4); wav.write("WAVE", 8);
  wav.write("fmt ", 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(4, 40); wav.writeInt16LE(1234, 44);
  return wav;
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "mefx-日本語-storage-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, repo: new LibraryRepository(root) };
}

test("保存を直列化し、再起動しても最後のデータを復元できる", async (t) => {
  const { root, repo } = await fixture(t);
  await Promise.all(Array.from({ length: 16 }, (_, index) => repo.savePresets([preset(`音色${index}`)])));
  assert.equal((await new LibraryRepository(root).loadPresets())[0].name, "音色15");
  assert.equal((await fs.readdir(root)).some((name) => name.endsWith(".tmp")), false);
});

test("壊れたJSONを前回の正常データから復旧し、破損原本を残す", async (t) => {
  const { root, repo } = await fixture(t);
  await repo.savePresets([preset("前回")]);
  await repo.savePresets([preset("今回")]);
  await fs.writeFile(path.join(root, "presets.json"), "{broken", "utf8");
  assert.equal((await repo.loadPresets())[0].name, "前回");
  const damaged = (await fs.readdir(root)).find((name) => name.includes(".corrupt-"));
  assert.ok(damaged);
  assert.equal(await fs.readFile(path.join(root, damaged), "utf8"), "{broken");
  assert.equal(repo.getNotices().length, 1);
});

test("復旧元がない破損データを空データで上書きしない", async (t) => {
  const { root, repo } = await fixture(t);
  await fs.writeFile(path.join(root, "presets.json"), '{"wrong":true}');
  await assert.rejects(repo.loadPresets(), /元データは保持/);
  await assert.rejects(repo.savePresets([]), /元データは保持/);
  assert.equal(await fs.readFile(path.join(root, "presets.json"), "utf8"), '{"wrong":true}');
});

test("不正な数値や型を含むプリセットは保存前に拒否する", async (t) => {
  const { repo } = await fixture(t);
  for (const invalid of [NaN, Infinity, -1, 101, "45"]) {
    const value = preset(); value.effects.gain = invalid;
    await assert.rejects(repo.savePresets([value]), /正しくありません/);
  }
  await assert.rejects(repo.saveSettings({ language: "xx", lastPage: "dashboard" }), /正しくありません/);
  assert.deepEqual(await repo.loadPresets(), []);
});

test("WAV IRをバックアップに含め、別の保存場所へパスを付け直す", async (t) => {
  const { root, repo } = await fixture(t);
  const destination = await fixture(t);
  const wav = makeWav();
  const source = path.join(root, "irs", "元のIR.wav");
  await fs.mkdir(path.dirname(source)); await fs.writeFile(source, wav);
  const ir = { enabled: true, source: "generated", name: "日本語IR", mix: 50, lengthMs: 120, sampleRate: 44100, filePath: source };
  await repo.savePresets([{ ...preset(), ir }]);
  await repo.saveImpulseResponses([{ ...ir, id: "ir1", instrument: "guitar", createdAt: preset().createdAt }]);
  const encoded = await repo.exportBackup();
  assert.equal(encoded.includes(root.replaceAll("\\", "\\\\")), false);
  const restored = await destination.repo.importBackup(encoded);
  assert.ok(restored.presets[0].ir.filePath.startsWith(path.join(destination.root, "irs")));
  assert.deepEqual(await fs.readFile(restored.presets[0].ir.filePath), wav);
  assert.equal(Object.keys(JSON.parse(encoded).assets).length, 1);
});

test("復元前に破損・欠落・パス改ざんを検査し、既存データを保持する", async (t) => {
  const { root, repo } = await fixture(t);
  await repo.savePresets([preset("残す音色")]);
  const backup = JSON.parse(await repo.exportBackup());
  backup.presets[0].ir = { enabled: true, source: "imported", name: "悪いIR", mix: 50, lengthMs: 120, sampleRate: 44100, filePath: "../../outside.wav" };
  await assert.rejects(repo.importBackup(JSON.stringify(backup)), /必要なIRファイル/);
  assert.equal((await repo.loadPresets())[0].name, "残す音色");
  assert.equal((await fs.readdir(root)).some((name) => name.includes("before-restore")), false);
});

test("復旧元がなくても正しいバックアップを復元でき、復元前原本を保管する", async (t) => {
  const { root, repo } = await fixture(t);
  const original = await fixture(t);
  await original.repo.savePresets([preset("救出")]);
  await fs.writeFile(path.join(root, "presets.json"), "broken");
  await repo.importBackup(await original.repo.exportBackup());
  assert.equal((await repo.loadPresets())[0].name, "救出");
  await fs.writeFile(path.join(root, "presets.json"), "broken-again");
  assert.equal((await repo.loadPresets())[0].name, "救出");
  const previous = (await fs.readdir(root)).find((name) => name.startsWith("presets.json.before-restore-"));
  assert.equal(await fs.readFile(path.join(root, previous), "utf8"), "broken");
});

test("IRを同時削除しても削除結果を取り消さない", async (t) => {
  const { repo } = await fixture(t);
  const ir = { enabled: false, source: "none", name: "IR", mix: 0, lengthMs: 0, sampleRate: 44100, instrument: "guitar", createdAt: preset().createdAt };
  await repo.saveImpulseResponses([{ ...ir, id: "A" }, { ...ir, id: "B" }]);
  await Promise.all([repo.deleteImpulseResponse("A"), repo.deleteImpulseResponse("B")]);
  assert.deepEqual(await repo.loadImpulseResponses(), []);
});

test("WAVヘッダーだけの不正音声と、必須係数がないIRを拒否する", async (t) => {
  const { repo } = await fixture(t);
  const backup = JSON.parse(await repo.exportBackup());
  const wav = Buffer.alloc(48); wav.write("RIFF", 0); wav.writeUInt32LE(40, 4); wav.write("WAVE", 8);
  const key = `${createHash("sha256").update(wav).digest("hex")}.wav`;
  backup.assets[key] = wav.toString("base64");
  await assert.rejects(repo.importBackup(JSON.stringify(backup)), /破損/);
  await assert.rejects(repo.savePresets([{ ...preset(), ir: { enabled: true, source: "generated", name: "Invalid", mix: 50, lengthMs: 120, sampleRate: 44100, profile: {} } }]), /正しくありません/);
});

test("復元途中の容量不足でも追加書込みをせず元の世代へ戻す", async (t) => {
  const { root, repo } = await fixture(t);
  await repo.savePresets([preset("元の世代")]);
  const other = await fixture(t); await other.repo.savePresets([preset("新しい世代")]);
  const backup = await other.repo.exportBackup();
  const originalRename = fs.rename;
  const originalWriteFile = fs.open;
  let failed = false;
  let opensAfterFailure = 0;
  fs.open = async (...args) => { if (failed) opensAfterFailure++; return originalWriteFile(...args); };
  fs.rename = async (from, to) => {
    if (!failed && from.startsWith(root) && from.includes("irs.json.restore-") && !from.endsWith(".tmp.tmp") && to === path.join(root, "irs.json")) {
      failed = true; throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    }
    return originalRename(from, to);
  };
  try { await assert.rejects(repo.importBackup(backup), /disk full/); }
  finally { fs.rename = originalRename; fs.open = originalWriteFile; }
  assert.equal((await repo.loadPresets())[0].name, "元の世代");
  assert.equal(opensAfterFailure, 0);
  assert.equal((await fs.readdir(root)).includes("restore.pending.json"), false);
});

test("中断された復元を再起動時に検出し、混在した世代を読ませない", async (t) => {
  const { root, repo } = await fixture(t);
  await repo.savePresets([preset("復元前")]);
  const other = await fixture(t); await other.repo.savePresets([preset("復元後")]);
  const backup = await other.repo.exportBackup();
  const originalRename = fs.rename;
  let commitFailed = false;
  fs.rename = async (from, to) => {
    if (!commitFailed && from.startsWith(root) && from.includes("irs.json.restore-") && to === path.join(root, "irs.json")) {
      commitFailed = true; throw new Error("simulated interruption");
    }
    if (commitFailed && from.startsWith(root) && from.includes("before-restore-")) throw new Error("rollback temporarily unavailable");
    return originalRename(from, to);
  };
  try { await assert.rejects(repo.importBackup(backup), /未完了の記録/); }
  finally { fs.rename = originalRename; }
  assert.equal((await fs.readdir(root)).includes("restore.pending.json"), true);
  const restarted = new LibraryRepository(root);
  assert.equal((await restarted.loadPresets())[0].name, "復元前");
  assert.match(restarted.getNotices()[0].message, /中断された復元/);
  assert.equal((await fs.readdir(root)).includes("restore.pending.json"), false);
});
