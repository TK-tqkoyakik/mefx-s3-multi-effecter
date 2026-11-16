import { app, dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { LibraryRepository } from "./libraryRepository.js";
import type { LibraryPreset as Preset, LibraryStoredIr as StoredImpulseResponse } from "./libraryData.js";
import { isIrList } from "./libraryData.js";

export type ImpulseResponseFileStatus = {
  id: string;
  exists: boolean;
  readable: boolean;
  sizeBytes: number;
  lastError?: string;
};

export type DesktopSettings = {
  language: "ja" | "en";
  lastPage: string;
};

let repository: LibraryRepository | undefined;
function libraryRepository() {
  repository ??= new LibraryRepository(app.getPath("userData"));
  return repository;
}

function irStoragePath(fileName: string) {
  return path.join(app.getPath("userData"), "irs", fileName);
}

async function ensureIrStorageDir() {
  await fs.mkdir(path.join(app.getPath("userData"), "irs"), { recursive: true });
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, "_").slice(0, 64) || "ir";
}

function pseudoNoise(index: number, channel: number) {
  const value = Math.sin(index * 12.9898 + channel * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function writeString(buffer: Buffer, offset: number, value: string) {
  buffer.write(value, offset, value.length, "ascii");
}

function createGeneratedIrWav(response: StoredImpulseResponse) {
  const sampleRate = Math.max(8000, Math.min(192000, Math.round(response.sampleRate || 44100)));
  const lengthMs = Math.max(30, Math.min(10000, Math.round(response.lengthMs || 120)));
  const channels = 2;
  const bytesPerSample = 2;
  const sampleCount = Math.max(1, Math.floor((sampleRate * lengthMs) / 1000));
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  const profile = response.profile ?? { brightness: 0.45, space: 0.35, saturation: 0.25, dynamics: 0.5 };
  const spectral = {
    low: Math.max(0, Math.min(1, profile.low ?? (response.instrument === "bass" ? 0.65 : 0.25))),
    lowMid: Math.max(0, Math.min(1, profile.lowMid ?? 0.45)),
    highMid: Math.max(0, Math.min(1, profile.highMid ?? profile.brightness)),
    high: Math.max(0, Math.min(1, profile.high ?? profile.brightness * 0.75))
  };
  const decayPower = response.instrument === "bass" ? 2.8 - profile.space * 1.1 : 4.2 - profile.space * 1.6;
  const lowTone = response.instrument === "bass" ? 0.045 + spectral.low * 0.075 : 0.07 + spectral.low * 0.1;
  const bodyTone = response.instrument === "bass" ? 0.14 + spectral.lowMid * 0.18 : 0.25 + spectral.lowMid * 0.36;
  const biteTone = response.instrument === "bass" ? 0.55 + spectral.highMid * 0.28 : 0.75 + spectral.highMid * 0.55;
  const noiseAmount = response.instrument === "bass" ? 0.08 + profile.saturation * 0.16 + spectral.high * 0.08 : 0.12 + profile.saturation * 0.2 + spectral.high * 0.14;
  const lowAmount = response.instrument === "bass" ? 0.1 + spectral.low * 0.18 : 0.04 + spectral.low * 0.09;
  const bodyAmount = response.instrument === "bass" ? 0.08 + spectral.lowMid * 0.13 : 0.05 + spectral.lowMid * 0.16;
  const biteAmount = response.instrument === "bass" ? 0.03 + spectral.highMid * 0.06 : 0.04 + spectral.highMid * 0.14;
  const earlyAmount = 0.75 + profile.dynamics * 0.45;

  writeString(buffer, 0, "RIFF");
  buffer.writeUInt32LE(36 + dataSize, 4);
  writeString(buffer, 8, "WAVE");
  writeString(buffer, 12, "fmt ");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  writeString(buffer, 36, "data");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let index = 0; index < sampleCount; index += 1) {
    const progress = index / sampleCount;
    const decay = Math.pow(1 - progress, decayPower);
    for (let channel = 0; channel < channels; channel += 1) {
      const highDamping = Math.max(0.25, 1 - progress * (1.1 - profile.brightness * 0.65));
      const earlyReflection = index === 0 ? earlyAmount : 0;
      const lowBody = Math.sin(index * lowTone) * decay * lowAmount;
      const cabinetBody = Math.sin(index * bodyTone) * decay * bodyAmount;
      const cabinetBite = Math.sin(index * biteTone) * decay * highDamping * biteAmount;
      const reflectionNoise = pseudoNoise(index, channel) * decay * highDamping * noiseAmount;
      const stereoOffset = channel === 0 ? 1 : 0.92 + profile.space * 0.12;
      const sample = Math.max(-1, Math.min(1, (earlyReflection + lowBody + cabinetBody + cabinetBite + reflectionNoise) * stereoOffset));
      buffer.writeInt16LE(Math.round(sample * 32767), offset);
      offset += bytesPerSample;
    }
  }

  return buffer;
}

async function ensureImpulseResponseFile(response: StoredImpulseResponse): Promise<StoredImpulseResponse> {
  if (response.filePath) return response;
  await ensureIrStorageDir();
  const fileName = `${sanitizeFileName(response.name)}-${sanitizeFileName(response.id)}.wav`;
  const filePath = irStoragePath(fileName);
  await fs.writeFile(filePath, createGeneratedIrWav(response));
  return {
    ...response,
    source: response.source === "none" ? "generated" : response.source,
    filePath,
    notes: [
      ...(response.notes ?? []),
      "Generated WAV IR file was written by the desktop app."
    ]
  };
}

export async function loadPresets(): Promise<Preset[]> {
  return libraryRepository().loadPresets();
}

export async function savePresets(presets: Preset[]): Promise<Preset[]> {
  return libraryRepository().savePresets(presets);
}

export async function loadImpulseResponses(): Promise<StoredImpulseResponse[]> {
  return libraryRepository().loadImpulseResponses();
}

export async function saveImpulseResponses(responses: StoredImpulseResponse[]): Promise<StoredImpulseResponse[]> {
  if (!isIrList(responses)) throw new Error("IRライブラリの形式が正しくありません。");
  const root = path.resolve(app.getPath("userData"), "irs") + path.sep;
  if (responses.some((response) => response.filePath && !path.resolve(response.filePath).startsWith(root))) throw new Error("アプリ管理外のIRファイルは保存できません。");
  const next = await Promise.all(responses.map((response) => ensureImpulseResponseFile(response)));
  return libraryRepository().saveImpulseResponses(next);
}

export async function readImpulseResponseFile(filePath: string): Promise<string> {
  const irRoot = path.join(app.getPath("userData"), "irs");
  const resolvedPath = path.resolve(filePath);
  const resolvedRoot = path.resolve(irRoot);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
    throw new Error("IR file must be inside the app IR library folder.");
  }
  const buffer = await fs.readFile(resolvedPath);
  return buffer.toString("base64");
}

export async function deleteImpulseResponse(response: StoredImpulseResponse): Promise<StoredImpulseResponse[]> {
  // Keep WAV assets referenced by presets and the previous library snapshot recoverable.
  return libraryRepository().deleteImpulseResponse(response.id);
}

export async function checkImpulseResponseFiles(): Promise<ImpulseResponseFileStatus[]> {
  const responses = await loadImpulseResponses();
  return Promise.all(
    responses.map(async (response) => {
      if (!response.filePath) {
        return {
          id: response.id,
          exists: false,
          readable: false,
          sizeBytes: 0,
          lastError: "No WAV file path is saved."
        };
      }
      try {
        const stat = await fs.stat(response.filePath);
        await readImpulseResponseFile(response.filePath);
        return {
          id: response.id,
          exists: true,
          readable: stat.isFile(),
          sizeBytes: stat.size
        };
      } catch (error) {
        return {
          id: response.id,
          exists: false,
          readable: false,
          sizeBytes: 0,
          lastError: error instanceof Error ? error.message : "Could not read IR WAV file."
        };
      }
    })
  );
}

export async function loadSettings(): Promise<DesktopSettings> {
  return libraryRepository().loadSettings();
}

export async function saveSettings(settings: DesktopSettings): Promise<DesktopSettings> {
  return libraryRepository().saveSettings(settings);
}

export function storageNotices() { return libraryRepository().getNotices(); }

export async function exportLibraryBackup() {
  const selected = await dialog.showSaveDialog({
    title: "音色ライブラリをバックアップ",
    defaultPath: `MEFX-S3-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "MEFX-S3 Backup", extensions: ["json"] }]
  });
  if (selected.canceled || !selected.filePath) return { canceled: true };
  const data = await libraryRepository().exportBackup();
  const temporary = `${selected.filePath}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(temporary, data, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporary, selected.filePath);
  } finally { await fs.rm(temporary, { force: true }); }
  return { canceled: false, filePath: selected.filePath };
}

export async function importLibraryBackup() {
  const selected = await dialog.showOpenDialog({ title: "音色ライブラリを復元", properties: ["openFile"], filters: [{ name: "MEFX-S3 Backup", extensions: ["json"] }] });
  if (selected.canceled || !selected.filePaths[0]) return { canceled: true };
  if ((await fs.stat(selected.filePaths[0])).size > 128 * 1024 * 1024) throw new Error("バックアップの上限128MBを超えています。");
  const confirmation = await dialog.showMessageBox({ type: "question", title: "バックアップを復元", message: "プリセット・IR・設定をバックアップの内容へ置き換えます。", detail: "復元前のファイルもアプリの保存フォルダへ保管します。", buttons: ["キャンセル", "復元"], defaultId: 0, cancelId: 0 });
  if (confirmation.response !== 1) return { canceled: true };
  await libraryRepository().importBackup(await fs.readFile(selected.filePaths[0], "utf8"));
  return { canceled: false };
}
