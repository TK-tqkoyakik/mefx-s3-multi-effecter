import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { defaultLibrarySettings, isIrList, isPresetList, isSettings, type LibraryPreset, type LibraryStoredIr, type LibrarySettings } from "./libraryData.js";

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_BACKUP_BYTES = 128 * 1024 * 1024;
const MAX_WAV_BYTES = 8 * 1024 * 1024;
type Validator<T> = (value: unknown) => value is T;
const documentNames = ["presets.json", "irs.json", "settings.json", "presets.json.bak", "irs.json.bak", "settings.json.bak"];
type RestoreEntry = { name: string; existed: boolean };
type Backup = { format: "mefx-s3-library"; version: 1; createdAt: string; presets: LibraryPreset[]; impulseResponses: LibraryStoredIr[]; settings: LibrarySettings; assets: Record<string, string> };
export type StorageNotice = { file: string; message: string };

export class LibraryRepository {
  private queue: Promise<unknown> = Promise.resolve();
  private notices: StorageNotice[] = [];
  constructor(private readonly root: string) {}

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => { await this.recoverRestore(); return work(); });
    this.queue = result.catch(() => undefined);
    return result;
  }

  getNotices() { return [...this.notices]; }

  private notice(file: string, message: string) {
    if (!this.notices.some((item) => item.file === file && item.message === message)) this.notices.push({ file, message });
  }

  private async exists(target: string) {
    try { await fs.access(target); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
  }

  private restorePaths(name: string, id: string) {
    const target = path.join(this.root, name);
    return { target, previous: `${target}.before-restore-${id}`, staged: `${target}.restore-${id}.tmp` };
  }

  private async rollback(entries: RestoreEntry[], id: string) {
    for (const entry of entries) {
      const { target, previous, staged } = this.restorePaths(entry.name, id);
      if (await this.exists(previous)) await fs.rename(previous, target);
      else if (!entry.existed && !(await this.exists(staged))) await fs.rm(target, { force: true });
    }
    await fs.rm(path.join(this.root, "restore.pending.json"), { force: true });
    for (const entry of entries) await fs.rm(this.restorePaths(entry.name, id).staged, { force: true });
  }

  private async recoverRestore() {
    const journal = path.join(this.root, "restore.pending.json");
    if (!(await this.exists(journal))) return;
    const pending = JSON.parse(await fs.readFile(journal, "utf8")) as { version: number; id: string; entries: RestoreEntry[] };
    if (pending.version !== 1 || !/^[a-f0-9-]{36}$/.test(pending.id) || !Array.isArray(pending.entries) || pending.entries.length !== 6 || new Set(pending.entries.map((entry) => entry.name)).size !== 6 || !pending.entries.every((entry) => documentNames.includes(entry.name) && typeof entry.existed === "boolean")) throw new Error("未完了の復元記録が不正です。保存フォルダを保持して復旧してください。");
    await this.rollback(pending.entries, pending.id);
    this.notice("backup", "中断された復元を検出し、復元前のデータに戻しました。");
  }

  private async atomic(target: string, bytes: string | Buffer) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const handle = await fs.open(temporary, "wx");
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      await fs.rename(temporary, target);
    } finally { await fs.rm(temporary, { force: true }); }
  }

  private async readValidated<T>(target: string, validate: Validator<T>): Promise<T> {
    if ((await fs.stat(target)).size > MAX_JSON_BYTES) throw new Error("保存ファイルが大きすぎます。");
    const parsed: unknown = JSON.parse(await fs.readFile(target, "utf8"));
    if (!validate(parsed)) throw new Error("保存データの形式が正しくありません。");
    return parsed;
  }

  private async read<T>(name: string, fallback: T, validate: Validator<T>): Promise<T> {
    const target = path.join(this.root, name);
    let failure: unknown;
    try { return await this.readValidated(target, validate); } catch (error) { failure = error; }
    try {
      const restored = await this.readValidated(`${target}.bak`, validate);
      const damaged = await fs.readFile(target).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return undefined; });
      if (damaged) await this.atomic(`${target}.corrupt-${Date.now()}-${randomUUID()}`, damaged);
      await this.atomic(target, `${JSON.stringify(restored, null, 2)}\n`);
      this.notice(name, "前回の正常な保存データから復旧しました。破損したファイルも保管しています。");
      return restored;
    } catch (error) {
      if ((failure as NodeJS.ErrnoException)?.code === "ENOENT" && (error as NodeJS.ErrnoException)?.code === "ENOENT") return fallback;
      const message = `${name}を読み込めません。元データは保持しました。「設定」からバックアップを復元してください。`;
      this.notice(name, message);
      throw new Error(message, { cause: failure });
    }
  }

  private async write<T>(name: string, value: T, fallback: T, validate: Validator<T>) {
    if (!validate(value)) throw new Error(`${name}の保存データが正しくありません。`);
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (Buffer.byteLength(serialized) > MAX_JSON_BYTES) throw new Error("保存データの上限4MBを超えています。");
    const current = await this.read(name, fallback, validate);
    const target = path.join(this.root, name);
    await this.atomic(`${target}.bak`, `${JSON.stringify(current, null, 2)}\n`);
    await this.atomic(target, serialized);
    return value;
  }

  loadPresets() { return this.exclusive(() => this.read("presets.json", [], isPresetList)); }
  savePresets(value: LibraryPreset[]) { return this.exclusive(() => this.write("presets.json", value, [], isPresetList)); }
  loadImpulseResponses() { return this.exclusive(() => this.read("irs.json", [], isIrList)); }
  saveImpulseResponses(value: LibraryStoredIr[]) { return this.exclusive(() => this.write("irs.json", value, [], isIrList)); }
  deleteImpulseResponse(id: string) {
    return this.exclusive(async () => {
      const current = await this.read("irs.json", [], isIrList);
      return this.write("irs.json", current.filter((item) => item.id !== id), [], isIrList);
    });
  }
  loadSettings() { return this.exclusive(() => this.read("settings.json", defaultLibrarySettings, isSettings)); }
  saveSettings(value: LibrarySettings) { return this.exclusive(() => this.write("settings.json", value, defaultLibrarySettings, isSettings)); }

  private isWav(bytes: Buffer) {
    if (bytes.length < 44 || bytes.length > MAX_WAV_BYTES || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE" || bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
    let offset = 12;
    let blockAlign = 0;
    let dataBytes = 0;
    while (offset + 8 <= bytes.length) {
      const chunk = bytes.toString("ascii", offset, offset + 4);
      const size = bytes.readUInt32LE(offset + 4);
      const start = offset + 8;
      if (start + size > bytes.length) return false;
      if (chunk === "fmt ") {
        if (size < 16 || blockAlign) return false;
        const format = bytes.readUInt16LE(start);
        const channels = bytes.readUInt16LE(start + 2);
        const sampleRate = bytes.readUInt32LE(start + 4);
        const bits = bytes.readUInt16LE(start + 14);
        blockAlign = bytes.readUInt16LE(start + 12);
        if (![1, 3].includes(format) || channels < 1 || channels > 2 || sampleRate < 8000 || sampleRate > 192000 || ![8, 16, 24, 32].includes(bits) || (format === 3 && bits !== 32) || blockAlign !== channels * bits / 8 || bytes.readUInt32LE(start + 8) !== sampleRate * blockAlign) return false;
      }
      if (chunk === "data") dataBytes += size;
      offset = start + size + (size % 2);
    }
    return offset === bytes.length && blockAlign > 0 && dataBytes > 0 && dataBytes % blockAlign === 0;
  }

  exportBackup() {
    return this.exclusive(async () => {
      const presets = await this.read("presets.json", [], isPresetList);
      const impulseResponses = await this.read("irs.json", [], isIrList);
      const settings = await this.read("settings.json", defaultLibrarySettings, isSettings);
      const assets: Record<string, string> = {};
      const libraryRoot = path.resolve(this.root, "irs") + path.sep;
      for (const ir of [...impulseResponses, ...presets.flatMap((preset) => preset.ir ? [preset.ir] : [])]) {
        if (!ir.filePath) continue;
        if (!path.resolve(ir.filePath).startsWith(libraryRoot)) throw new Error("アプリ管理外のIRファイルはバックアップできません。");
        if ((await fs.stat(ir.filePath)).size > MAX_WAV_BYTES) throw new Error("IRのWAVファイルが大きすぎます。");
        const bytes = await fs.readFile(ir.filePath);
        if (!this.isWav(bytes)) throw new Error("IRのWAVファイルが破損しているか、大きすぎます。");
        const key = `${createHash("sha256").update(bytes).digest("hex")}.wav`;
        assets[key] = bytes.toString("base64");
        ir.filePath = key;
      }
      const backup: Backup = { format: "mefx-s3-library", version: 1, createdAt: new Date().toISOString(), presets, impulseResponses, settings, assets };
      const serialized = JSON.stringify(backup);
      if (Buffer.byteLength(serialized) > MAX_BACKUP_BYTES) throw new Error("バックアップの上限128MBを超えました。");
      return serialized;
    });
  }

  importBackup(serialized: string) {
    return this.exclusive(async () => {
      if (Buffer.byteLength(serialized) > MAX_BACKUP_BYTES) throw new Error("バックアップの上限128MBを超えています。");
      const backup = JSON.parse(serialized) as Backup;
      if (!backup || backup.format !== "mefx-s3-library" || backup.version !== 1 || !isPresetList(backup.presets) || !isIrList(backup.impulseResponses) || !isSettings(backup.settings) || !backup.assets || typeof backup.assets !== "object" || Array.isArray(backup.assets) || Object.keys(backup.assets).length > 96) throw new Error("MEFX-S3のバックアップ形式が正しくありません。");
      const assetBytes = new Map<string, Buffer>();
      for (const [key, encoded] of Object.entries(backup.assets)) {
        if (!/^[a-f0-9]{64}\.wav$/.test(key) || typeof encoded !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error("バックアップ内のIRデータが正しくありません。");
        const bytes = Buffer.from(encoded, "base64");
        if (!this.isWav(bytes) || `${createHash("sha256").update(bytes).digest("hex")}.wav` !== key) throw new Error("バックアップ内のIRファイルが破損しています。");
        assetBytes.set(key, bytes);
      }
      for (const ir of [...backup.impulseResponses, ...backup.presets.flatMap((preset) => preset.ir ? [preset.ir] : [])]) {
        if (!ir.filePath) continue;
        if (!assetBytes.has(ir.filePath)) throw new Error("バックアップ内に必要なIRファイルがありません。");
        ir.filePath = path.join(this.root, "irs", ir.filePath);
      }
      const updates = [
        ["presets.json", backup.presets], ["irs.json", backup.impulseResponses], ["settings.json", backup.settings]
      ] as const;
      for (const [, value] of updates) {
        if (Buffer.byteLength(JSON.stringify(value, null, 2)) > MAX_JSON_BYTES) throw new Error("復元する保存データの上限4MBを超えています。");
      }
      const writes = updates.flatMap(([name, value]) => [[name, value], [`${name}.bak`, value]] as const);
      const restoreId = randomUUID();
      const entries: RestoreEntry[] = [];
      try {
        for (const [key, bytes] of assetBytes) await this.atomic(path.join(this.root, "irs", key), bytes);
        for (const [name, value] of writes) {
          const { target, staged } = this.restorePaths(name, restoreId);
          entries.push({ name, existed: await this.exists(target) });
          await this.atomic(staged, `${JSON.stringify(value, null, 2)}\n`);
        }
      } catch (error) {
        for (const entry of entries) await fs.rm(this.restorePaths(entry.name, restoreId).staged, { force: true });
        throw error;
      }
      const journal = path.join(this.root, "restore.pending.json");
      try {
        await this.atomic(journal, JSON.stringify({ version: 1, id: restoreId, entries }));
      } catch (error) {
        for (const entry of entries) await fs.rm(this.restorePaths(entry.name, restoreId).staged, { force: true });
        throw error;
      }
      try {
        for (const entry of entries) {
          const { target, previous, staged } = this.restorePaths(entry.name, restoreId);
          if (entry.existed) await fs.rename(target, previous);
          await fs.rename(staged, target);
        }
        await fs.rm(journal);
      } catch (error) {
        try { await this.rollback(entries, restoreId); }
        catch (rollbackError) { throw new AggregateError([error, rollbackError], "復元を完了できませんでした。未完了の記録を保持し、次回読み込み時に復旧します。"); }
        throw error;
      }
      this.notices = [{ file: "backup", message: "バックアップを復元しました。復元前のデータも保管しています。" }];
      return { presets: backup.presets, impulseResponses: backup.impulseResponses, settings: backup.settings };
    });
  }
}
