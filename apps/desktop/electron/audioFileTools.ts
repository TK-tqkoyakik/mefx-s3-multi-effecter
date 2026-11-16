import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import { AudioFileJobs } from "./audioFileJob.js";

const jobs = new AudioFileJobs();
export const cancelAudioFile = (requestId: string) => jobs.cancel(requestId);
export const audioFileStatus = (requestId: string) => jobs.status(requestId);
export const stopAudioFiles = () => jobs.stop();

type Instrument = "guitar" | "bass";
type EffectKey = "gain" | "tone_eq" | "compressor" | "drive" | "modulation" | "delay_reverb";

type Preset = {
  instrument: Instrument;
  name: string;
  effects: Record<EffectKey, number>;
  bypass: boolean;
};

export type AudioFileSelection = {
  canceled: boolean;
  filePath?: string;
  name?: string;
  sizeBytes?: number;
};

export type AudioFileJobRequest = {
  inputPath: string;
  preset?: Preset;
  requestId?: string;
};

export type AudioFileJobResult = {
  ok: boolean;
  inputPath: string;
  outputPath?: string;
  durationMs: number;
  mode: "convert" | "process";
  detail: string;
  command?: string;
  cancelled?: boolean;
  code?: string;
};

function projectRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return process.env.MEFX_PROJECT_ROOT || path.resolve(app.getAppPath(), "..", "..");
}

function ffmpegPath() {
  return path.join(projectRoot(), "server", "node_modules", "ffmpeg-static", "ffmpeg.exe");
}

function outputRoot() {
  return path.join(app.getPath("userData"), "exports");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function safeFilePart(value: string) {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 64) || "audio"
  );
}

function outputPathFor(inputPath: string, suffix: string) {
  fs.mkdirSync(outputRoot(), { recursive: true });
  const parsed = path.parse(inputPath);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  return path.join(outputRoot(), `${safeFilePart(parsed.name)}-${suffix}-${stamp}-${randomUUID().slice(0, 8)}.wav`);
}

function assertInputPath(inputPath: string) {
  if (!inputPath || typeof inputPath !== "string") throw new Error("Input audio file is missing.");
  if (!path.isAbsolute(inputPath) || !fs.statSync(inputPath).isFile()) throw new Error("Input must be a local audio file.");
}

function assertFfmpeg() {
  const candidate = ffmpegPath();
  if (!fs.existsSync(candidate)) throw new Error(`ffmpeg.exe was not found: ${candidate}`);
  return candidate;
}

function presetFilters(preset: Preset) {
  if (preset.bypass) return ["volume=1"];

  const effects = preset.effects;
  const gain = clamp(effects.gain, 0, 100);
  const tone = clamp(effects.tone_eq, 0, 100);
  const compressor = clamp(effects.compressor, 0, 100);
  const drive = clamp(effects.drive, 0, 100);
  const modulation = clamp(effects.modulation, 0, 100);
  const delayReverb = clamp(effects.delay_reverb, 0, 100);
  const filters = [
    `volume=${(0.65 + gain / 95).toFixed(3)}`,
    `equalizer=f=${preset.instrument === "bass" ? 220 : 1200}:t=q:w=0.9:g=${((tone - 50) / 3).toFixed(2)}`,
    `acompressor=threshold=${(-24 + compressor / 5).toFixed(1)}dB:ratio=${(1.2 + compressor / 28).toFixed(2)}:attack=8:release=180`
  ];

  if (drive > 0) {
    filters.push(
      `acrusher=level_in=${(1 + drive / 55).toFixed(3)}:level_out=${(1 - drive / 260).toFixed(3)}:bits=${Math.max(12, Math.round(24 - drive / 8))}`
    );
  }

  if (modulation > 0) {
    filters.push(
      `aphaser=in_gain=0.65:out_gain=0.75:delay=${(1 + modulation / 8).toFixed(2)}:decay=${(0.2 + modulation / 180).toFixed(2)}:speed=${(0.25 + modulation / 80).toFixed(2)}:type=t`
    );
  }

  if (delayReverb > 0) {
    filters.push(`aecho=0.82:0.34:${Math.round(80 + delayReverb * 4)}:${(0.12 + delayReverb / 190).toFixed(2)}`);
  }

  filters.push("alimiter=limit=0.95");
  return filters;
}

async function runFfmpeg(args: string[], mode: AudioFileJobResult["mode"], inputPath: string, outputPath: string, requestId?: string): Promise<AudioFileJobResult> {
  const exe = assertFfmpeg();
  const result = await jobs.run(exe, args, outputPath, requestId ?? randomUUID());
  return { ...result, mode, inputPath };
}

export async function selectAudioFile(): Promise<AudioFileSelection> {
  const result = await dialog.showOpenDialog({
    title: "Select audio file",
    properties: ["openFile"],
    filters: [
      { name: "Audio files", extensions: ["wav", "mp3", "m4a", "aac", "flac", "ogg", "opus", "webm", "mp4"] },
      { name: "All files", extensions: ["*"] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const stat = fs.statSync(filePath);
  return { canceled: false, filePath, name: path.basename(filePath), sizeBytes: stat.size };
}

export async function convertAudioFile(request: AudioFileJobRequest) {
  assertInputPath(request.inputPath);
  const outputPath = outputPathFor(request.inputPath, "converted");
  return runFfmpeg(
    ["-nostdin", "-n", "-protocol_whitelist", "file,pipe", "-i", request.inputPath, "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le"],
    "convert",
    request.inputPath,
    outputPath,
    request.requestId
  );
}

export async function processAudioFile(request: AudioFileJobRequest) {
  assertInputPath(request.inputPath);
  if (!request.preset) throw new Error("Preset is missing.");
  const outputPath = outputPathFor(request.inputPath, "mefx");
  return runFfmpeg(
    ["-nostdin", "-n", "-protocol_whitelist", "file,pipe", "-i", request.inputPath, "-vn", "-af", presetFilters(request.preset).join(","), "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le"],
    "process",
    request.inputPath,
    outputPath,
    request.requestId
  );
}
