import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";

const EFFECT_KEYS = ["gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"];
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const localPythonPackages = path.join(projectRoot, "tools", "python-packages");
const espPythonPackages = "C:\\Espressif\\mefx_python_packages";
const pythonPackages =
  process.env.MEFX_PYTHON_PACKAGES ||
  (fs.existsSync(path.join(localPythonPackages, "yt_dlp")) ? localPythonPackages : espPythonPackages);
const bundledPython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const torchHome = process.env.MEFX_TORCH_HOME || "C:\\Espressif\\mefx_torch_home";
const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : "";
const ffprobeDir = ffprobe?.path ? path.dirname(ffprobe.path) : "";

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONPATH: [pythonPackages, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
        TORCH_HOME: torchHome,
        PATH: [ffmpegDir, ffprobeDir, process.env.PATH].filter(Boolean).join(path.delimiter)
      }
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} timed out`));
    }, options.timeoutMs ?? 180000);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `${path.basename(command)} exited with ${code}`));
      }
    });
  });
}

function getPythonCommand() {
  if (process.env.MEFX_PYTHON) return process.env.MEFX_PYTHON;
  if (fs.existsSync(bundledPython)) return bundledPython;
  return "python";
}

function requireTools() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw new Error("ffmpeg is not installed. Run scripts\\install-analysis-tools.ps1 first.");
  }
  if (!fs.existsSync(path.join(pythonPackages, "yt_dlp"))) {
    throw new Error("yt-dlp is not installed. Run scripts\\install-analysis-tools.ps1 first.");
  }
}

function canUseDemucs() {
  try {
    return fs.existsSync(path.join(pythonPackages, "demucs", "separate.py"));
  } catch {
    return false;
  }
}

export function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object") return "Request body must be JSON";
  if (typeof body.url !== "string" || !/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(body.url)) {
    return "A valid YouTube URL is required";
  }
  if (!["guitar", "bass"].includes(body.instrument)) return "instrument must be guitar or bass";
  return null;
}

async function downloadAudio(url, tempDir) {
  const outputTemplate = path.join(tempDir, "source.%(ext)s");
  await run(getPythonCommand(), [
    "-m",
    "yt_dlp",
    "--no-playlist",
    "--no-warnings",
    "-f",
    "ba/bestaudio",
    "-o",
    outputTemplate,
    url
  ]);

  const source = fs
    .readdirSync(tempDir)
    .map((name) => path.join(tempDir, name))
    .find((file) => path.basename(file).startsWith("source."));
  if (!source) throw new Error("Could not download YouTube audio.");
  return source;
}

async function convertToWav(sourceFile, tempDir, options = {}) {
  const wavFile = path.join(tempDir, options.fileName ?? "analysis.wav");
  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceFile,
    "-t",
    String(options.seconds ?? 45),
    "-ac",
    String(options.channels ?? 1),
    "-ar",
    "44100",
    "-acodec",
    "pcm_s16le",
    wavFile
  ]);
  return wavFile;
}

async function separatePart(inputWav, tempDir, instrument) {
  const outDir = path.join(tempDir, "stems");
  const runner = path.join(projectRoot, "server", "src", "demucs_runner.py");
  await run(getPythonCommand(), ["-u", runner, "--input", inputWav, "--out", outDir, "--model", "htdemucs"], {
    timeoutMs: 900000
  });

  const stemName = instrument === "bass" ? "bass.wav" : "other.wav";
  const stemPath = path.join(outDir, "htdemucs", path.basename(inputWav, path.extname(inputWav)), stemName);
  if (!fs.existsSync(stemPath)) {
    throw new Error(`Could not find separated ${instrument} stem.`);
  }
  return stemPath;
}

async function extractPartWithFilters(sourceFile, tempDir, instrument) {
  const wavFile = path.join(tempDir, `${instrument}_filtered.wav`);
  const filter =
    instrument === "bass"
      ? "highpass=f=35,lowpass=f=320"
      : "highpass=f=120,lowpass=f=6500";
  await run(ffmpegPath, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceFile,
    "-t",
    "45",
    "-ac",
    "1",
    "-ar",
    "44100",
    "-af",
    filter,
    "-acodec",
    "pcm_s16le",
    wavFile
  ]);
  return wavFile;
}

function readWavPcm16(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Converted file is not a WAV file.");
  }

  let offset = 12;
  let sampleRate = 44100;
  let dataStart = -1;
  let dataSize = 0;
  let bitsPerSample = 16;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (id === "fmt ") {
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (id === "data") {
      dataStart = chunkStart;
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (dataStart < 0 || bitsPerSample !== 16) throw new Error("Unsupported WAV format.");
  const samples = new Float32Array(dataSize / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = buffer.readInt16LE(dataStart + index * 2) / 32768;
  }
  return { samples, sampleRate };
}

function percentile(values, ratio) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * ratio)))];
}

function calculateFeatures(samples, sampleRate) {
  const stride = Math.max(1, Math.floor(samples.length / 220500));
  let sumSquares = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let previous = samples[0] ?? 0;
  let diffEnergy = 0;
  let absEnergy = 0;
  let clipped = 0;
  const blockSize = Math.max(512, Math.floor(sampleRate / 20));
  const blockRms = [];

  for (let index = 0; index < samples.length; index += stride) {
    const sample = samples[index];
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    peak = Math.max(peak, abs);
    absEnergy += abs;
    diffEnergy += Math.abs(sample - previous);
    if ((sample >= 0) !== (previous >= 0)) zeroCrossings += 1;
    if (abs > 0.78) clipped += 1;
    previous = sample;
  }

  for (let start = 0; start < samples.length; start += blockSize) {
    let blockSquares = 0;
    let count = 0;
    for (let index = start; index < Math.min(samples.length, start + blockSize); index += 1) {
      blockSquares += samples[index] * samples[index];
      count += 1;
    }
    blockRms.push(Math.sqrt(blockSquares / Math.max(1, count)));
  }

  const usedSamples = Math.ceil(samples.length / stride);
  const rms = Math.sqrt(sumSquares / Math.max(1, usedSamples));
  const zcr = zeroCrossings / Math.max(1, usedSamples);
  const brightness = Math.max(0, Math.min(1, diffEnergy / Math.max(0.0001, absEnergy) / 0.55));
  const dynamics = Math.max(0, Math.min(1, (percentile(blockRms, 0.92) - percentile(blockRms, 0.2)) / 0.28));
  const saturation = Math.max(0, Math.min(1, clipped / Math.max(1, usedSamples) * 40 + peak * 0.25));
  const space = Math.max(0, Math.min(1, (1 - dynamics) * 0.55 + Math.min(1, zcr / 0.22) * 0.45));

  return { rms, peak, zeroCrossingRate: zcr, brightness, dynamics, saturation, space };
}

function mapFeaturesToPreset({ instrument, features, title }) {
  const effects = {
    gain: clamp(instrument === "bass" ? 35 + features.rms * 120 : 42 + features.rms * 135),
    tone_eq: clamp(instrument === "bass" ? 30 + features.brightness * 45 : 38 + features.brightness * 55),
    compressor: clamp(instrument === "bass" ? 70 - features.dynamics * 35 : 58 - features.dynamics * 32),
    drive: clamp(instrument === "bass" ? features.saturation * 50 : 8 + features.saturation * 82),
    modulation: clamp(instrument === "bass" ? features.space * 20 : features.space * 42),
    delay_reverb: clamp(instrument === "bass" ? features.space * 24 : 8 + features.space * 58)
  };

  return {
    instrument,
    name: `${instrument === "bass" ? "Bass" : "Guitar"} Match ${title.slice(0, 16) || "YouTube"}`,
    effects,
    bypass: false,
    createdAt: new Date().toISOString(),
    source: "youtube"
  };
}

async function getTitle(url) {
  try {
    const { stdout } = await run(getPythonCommand(), ["-m", "yt_dlp", "--no-playlist", "--print", "title", "--skip-download", url], {
      timeoutMs: 60000
    });
    return stdout.trim().split(/\r?\n/).at(-1) || "YouTube";
  } catch {
    return "YouTube";
  }
}

export async function analyzeTone({ url, instrument }) {
  requireTools();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mefx-analysis-"));
  try {
    const title = await getTitle(url);
    const sourceFile = await downloadAudio(url, tempDir);
    let wavFile;
    let extractionNote;
    if (canUseDemucs()) {
      try {
        const demucsInput = await convertToWav(sourceFile, tempDir, {
          fileName: "demucs_input.wav",
          channels: 2,
          seconds: 45
        });
        const separatedStem = await separatePart(demucsInput, tempDir, instrument);
        wavFile = await convertToWav(separatedStem, tempDir, { fileName: "analysis.wav", channels: 1, seconds: 45 });
        extractionNote =
          instrument === "bass"
            ? "ベースはDemucsのbassステムを解析しています。"
            : "ギターはDemucsのotherステムを解析しています。ボーカル/ドラム/ベース以外の楽器が含まれる場合があります。";
      } catch (error) {
        wavFile = await extractPartWithFilters(sourceFile, tempDir, instrument);
        extractionNote = `Demucsが使えなかったため、${instrument === "bass" ? "低域" : "中高域"}フィルターで簡易パート抽出しました。`;
      }
    } else {
      wavFile = await extractPartWithFilters(sourceFile, tempDir, instrument);
      extractionNote = `Demucsが未準備のため、${instrument === "bass" ? "低域" : "中高域"}フィルターで簡易パート抽出しました。`;
    }
    const audio = readWavPcm16(wavFile);
    const features = calculateFeatures(audio.samples, audio.sampleRate);
    const preset = mapFeaturesToPreset({ instrument, features, title });
    return {
      preset,
      features,
      notes: [
        "YouTube音声を一時取得し、先頭45秒をパート抽出して解析しました。",
        extractionNote
      ]
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

export function normalizePreset(preset) {
  return {
    ...preset,
    effects: Object.fromEntries(EFFECT_KEYS.map((key) => [key, clamp(preset.effects[key])]))
  };
}
