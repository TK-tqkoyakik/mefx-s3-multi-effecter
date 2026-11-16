import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import ffmpegPath from "ffmpeg-static";
import ffprobe from "ffprobe-static";
import { createAnalysisError, runProcess, throwIfCancelled } from "./processRunner.js";

const EFFECT_KEYS = ["gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"];
const ALLOWED_YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const MAX_URL_LENGTH = 2048;
const MAX_DOWNLOAD_SIZE = process.env.MEFX_MAX_DOWNLOAD_SIZE || "80M";
const MAX_VIDEO_DURATION_SECONDS = Number(process.env.MEFX_MAX_VIDEO_DURATION_SECONDS ?? 900);
const projectRoot = path.resolve(import.meta.dirname, "..", "..");
const localPythonPackages = path.join(projectRoot, "tools", "python-packages");
const espPythonPackages = "C:\\Espressif\\mefx_python_packages";
const pythonPackages =
  process.env.MEFX_PYTHON_PACKAGES ||
  (fs.existsSync(path.join(localPythonPackages, "yt_dlp")) ? localPythonPackages : espPythonPackages);
const bundledPython = path.join(projectRoot, "tools", "python", "python.exe");
const codexPython = path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
const localTorchHome = path.join(projectRoot, "tools", "torch-home");
const torchHome =
  process.env.MEFX_TORCH_HOME ||
  (fs.existsSync(localTorchHome) ? localTorchHome : "C:\\Espressif\\mefx_torch_home");
const ffmpegDir = ffmpegPath ? path.dirname(ffmpegPath) : "";
const ffprobeDir = ffprobe?.path ? path.dirname(ffprobe.path) : "";

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function analysisProcessEnv(parent = process.env) {
  const environment = Object.fromEntries(Object.entries(parent).filter(([key]) => !/^PYTHON/i.test(key)));
  return {
    ...environment,
    PYTHONPATH: pythonPackages,
    PYTHONNOUSERSITE: "1",
    PYTHONSAFEPATH: "1",
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    TORCH_HOME: torchHome,
    PATH: [ffmpegDir, ffprobeDir, parent.PATH].filter(Boolean).join(path.delimiter)
  };
}

function run(command, args, options = {}) {
  return runProcess(command, args, { ...options, env: analysisProcessEnv() });
}

function getPythonCommand() {
  if (process.env.MEFX_PYTHON) return process.env.MEFX_PYTHON;
  if (fs.existsSync(bundledPython)) return bundledPython;
  if (fs.existsSync(codexPython)) return codexPython;
  return "python";
}

function requireTools() {
  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    throw createAnalysisError("TOOLS_MISSING", "ffmpeg is not installed. Run scripts\\install-analysis-tools.ps1 first.");
  }
  if (!fs.existsSync(path.join(pythonPackages, "yt_dlp"))) {
    throw createAnalysisError("TOOLS_MISSING", "yt-dlp is not installed. Run scripts\\install-analysis-tools.ps1 first.");
  }
}

function canUseDemucs() {
  try {
    return fs.existsSync(path.join(pythonPackages, "demucs", "separate.py"));
  } catch {
    return false;
  }
}

export function isValidRequestId(requestId) {
  return typeof requestId === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(requestId);
}

export function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be JSON";
  if (body.requestId !== undefined && !isValidRequestId(body.requestId)) {
    return "requestId must contain 8-80 letters, digits, underscores or hyphens";
  }
  if (typeof body.url !== "string" || body.url.length === 0 || body.url.length > MAX_URL_LENGTH) {
    return "A valid YouTube URL is required";
  }
  try {
    const parsed = new URL(body.url);
    if (parsed.protocol !== "https:" || !ALLOWED_YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
      return "A valid YouTube URL is required";
    }
  } catch {
    return "A valid YouTube URL is required";
  }
  if (!["guitar", "bass"].includes(body.instrument)) return "instrument must be guitar or bass";
  return null;
}

async function downloadAudio(url, tempDir, { run, signal }) {
  const outputTemplate = path.join(tempDir, "source.%(ext)s");
  await run(getPythonCommand(), [
    "-m",
    "yt_dlp",
    "--no-playlist",
    "--no-warnings",
    "--socket-timeout",
    "20",
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "--max-filesize",
    MAX_DOWNLOAD_SIZE,
    "--match-filter",
    `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
    "-f",
    "ba/bestaudio",
    "-o",
    outputTemplate,
    url
  ], { signal });

  const source = fs
    .readdirSync(tempDir)
    .map((name) => path.join(tempDir, name))
    .find((file) => path.basename(file).startsWith("source."));
  if (!source) throw new Error("Could not download YouTube audio.");
  return source;
}

async function convertToWav(sourceFile, tempDir, options) {
  const wavFile = path.join(tempDir, options.fileName ?? "analysis.wav");
  await options.run(ffmpegPath, [
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
  ], { signal: options.signal });
  return wavFile;
}

async function separatePart(inputWav, tempDir, instrument, { run, signal }) {
  const outDir = path.join(tempDir, "stems");
  const runner = path.join(projectRoot, "server", "src", "demucs_runner.py");
  await run(getPythonCommand(), ["-u", runner, "--input", inputWav, "--out", outDir, "--model", "htdemucs"], {
    timeoutMs: 900000,
    signal
  });

  const stemName = instrument === "bass" ? "bass.wav" : "other.wav";
  const stemPath = path.join(outDir, "htdemucs", path.basename(inputWav, path.extname(inputWav)), stemName);
  if (!fs.existsSync(stemPath)) {
    throw new Error(`Could not find separated ${instrument} stem.`);
  }
  return stemPath;
}

async function extractPartWithFilters(sourceFile, tempDir, instrument, { run, signal }) {
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
  ], { signal });
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

function estimateBandEnergy(samples, sampleRate, minHz, maxHz) {
  const stride = Math.max(1, Math.floor(samples.length / 65536));
  const used = [];
  for (let index = 0; index < samples.length && used.length < 65536; index += stride) {
    used.push(samples[index]);
  }

  const centers = [];
  const bandCount = 4;
  for (let index = 0; index < bandCount; index += 1) {
    const ratio = bandCount === 1 ? 0 : index / (bandCount - 1);
    centers.push(minHz * Math.pow(maxHz / minHz, ratio));
  }

  let energy = 0;
  for (const frequency of centers) {
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const cosine = Math.cos(omega);
    const sine = Math.sin(omega);
    let real = 0;
    let imag = 0;
    for (let index = 0; index < used.length; index += 1) {
      const windowValue = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / Math.max(1, used.length - 1));
      const sample = used[index] * windowValue;
      real += sample * Math.cos(omega * index);
      imag -= sample * sine * Math.sin(omega * index) / Math.max(0.0001, sine);
    }
    energy += Math.sqrt(real * real + imag * imag);
  }
  return energy / bandCount;
}

function calculateSpectralBands(samples, sampleRate, instrument) {
  const ranges =
    instrument === "bass"
      ? [
          [45, 140],
          [140, 420],
          [420, 1400],
          [1400, 4200]
        ]
      : [
          [90, 240],
          [240, 900],
          [900, 3200],
          [3200, 7800]
        ];
  const energies = ranges.map(([minHz, maxHz]) => estimateBandEnergy(samples, sampleRate, minHz, maxHz));
  const total = energies.reduce((sum, value) => sum + value, 0) || 1;
  const normalized = energies.map((value) => Math.max(0, Math.min(1, value / total)));
  const max = Math.max(...normalized, 0.0001);
  return {
    low: Number((normalized[0] / max).toFixed(4)),
    lowMid: Number((normalized[1] / max).toFixed(4)),
    highMid: Number((normalized[2] / max).toFixed(4)),
    high: Number((normalized[3] / max).toFixed(4))
  };
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

function mapFeaturesToPreset({ instrument, features, spectralBands, title }) {
  const effects = {
    gain: clamp(instrument === "bass" ? 35 + features.rms * 120 : 42 + features.rms * 135),
    tone_eq: clamp(instrument === "bass" ? 30 + features.brightness * 45 : 38 + features.brightness * 55),
    compressor: clamp(instrument === "bass" ? 70 - features.dynamics * 35 : 58 - features.dynamics * 32),
    drive: clamp(instrument === "bass" ? features.saturation * 50 : 8 + features.saturation * 82),
    modulation: clamp(instrument === "bass" ? features.space * 20 : features.space * 42),
    delay_reverb: clamp(instrument === "bass" ? features.space * 24 : 8 + features.space * 58)
  };
  const irLengthMs = clamp(instrument === "bass" ? 150 + features.space * 170 : 85 + features.space * 190);
  const irMix = clamp(instrument === "bass" ? 32 + features.brightness * 18 : 36 + features.brightness * 28);
  const deviceTone = {
    cabinet: clamp(irMix * 0.65 + features.saturation * 28),
    presence: clamp((instrument === "bass" ? 24 : 38) + features.brightness * 48),
    resonance: clamp((instrument === "bass" ? 52 : 34) + features.space * 30 - features.brightness * 10),
    air: clamp((instrument === "bass" ? 8 : 24) + features.space * 42 + (1 - features.dynamics) * 18),
    irMix
  };

  return {
    instrument,
    name: `${instrument === "bass" ? "Bass" : "Guitar"} Match ${title.slice(0, 16) || "YouTube"}`,
    effects,
    ir: {
      enabled: true,
      source: "generated",
      name: `${instrument === "bass" ? "Bass" : "Guitar"} Match IR`,
      mix: irMix,
      lengthMs: irLengthMs,
      sampleRate: 44100,
      profile: {
        brightness: Number(features.brightness.toFixed(4)),
        space: Number(features.space.toFixed(4)),
        saturation: Number(features.saturation.toFixed(4)),
        dynamics: Number(features.dynamics.toFixed(4)),
        ...spectralBands
      },
      notes: [
        "解析した音の明るさ、空間感、歪み感、ダイナミクス、周波数バランスから生成したIR候補です。",
        "アプリへ適用するとWAV IRとして保存され、Audio FXのConvolverNodeで読み込めます。"
      ]
    },
    deviceTone,
    bypass: false,
    createdAt: new Date().toISOString(),
    source: "youtube"
  };
}

async function getTitle(url, { run, signal }) {
  try {
    const { stdout } = await run(getPythonCommand(), ["-m", "yt_dlp", "--no-playlist", "--print", "title", "--skip-download", url], {
      timeoutMs: 60000,
      signal
    });
    return stdout.trim().split(/\r?\n/).at(-1) || "YouTube";
  } catch (error) {
    throwIfCancelled(signal);
    if (["CANCELLED", "TIMEOUT", "TOOLS_MISSING"].includes(error.code)) throw error;
    return "YouTube";
  }
}

export function createToneAnalyzer({
  run: runCommand = run,
  requireTools: checkTools = requireTools,
  canUseDemucs: hasDemucs = canUseDemucs,
  tempRoot = os.tmpdir()
} = {}) {
  return async function analyzeTone({ url, instrument }, { signal, onProgress } = {}) {
    let tempDir;
    let result;
    let failure;
    let method;
    const processOptions = { run: runCommand, signal };
    const report = (stage, detail) => {
      try {
        onProgress?.({ stage, ...(method ? { method } : {}), ...(detail ? { detail } : {}) });
      } catch {
        // Observers must not prevent process termination or temporary-file cleanup.
      }
    };
    try {
      report("preparing");
      throwIfCancelled(signal);
      checkTools();
      tempDir = fs.mkdtempSync(path.join(tempRoot, "mefx-analysis-"));
      report("downloading");
      throwIfCancelled(signal);
      const title = await getTitle(url, processOptions);
      throwIfCancelled(signal);
      let sourceFile;
      try {
        sourceFile = await downloadAudio(url, tempDir, processOptions);
      } catch (error) {
        if (["CANCELLED", "TIMEOUT", "TOOLS_MISSING"].includes(error.code)) throw error;
        throw createAnalysisError("DOWNLOAD_FAILED", error.message || "Could not download YouTube audio", error);
      }
      throwIfCancelled(signal);
      let wavFile;
      let extractionNote;
      let fallbackReason;
      let extraction;
      if (hasDemucs()) {
        method = "demucs";
        try {
          report("converting");
          throwIfCancelled(signal);
          const demucsInput = await convertToWav(sourceFile, tempDir, {
            ...processOptions,
            fileName: "demucs_input.wav",
            channels: 2,
            seconds: 45
          });
          report("separating");
          throwIfCancelled(signal);
          const separatedStem = await separatePart(demucsInput, tempDir, instrument, processOptions);
          report("converting");
          throwIfCancelled(signal);
          wavFile = await convertToWav(separatedStem, tempDir, {
            ...processOptions, fileName: "analysis.wav", channels: 1, seconds: 45
          });
          extraction = { method: "demucs", stem: instrument === "bass" ? "bass" : "other" };
          extractionNote =
            instrument === "bass"
              ? "ベースはDemucsのbassステムを解析しています。"
              : "ギターはDemucsのotherステムを解析しています。ボーカル/ドラム/ベース以外の楽器が含まれる場合があります。";
        } catch (error) {
          throwIfCancelled(signal);
          if (["CANCELLED", "TIMEOUT", "TOOLS_MISSING"].includes(error.code)) throw error;
          fallbackReason = error.message || "Demucs separation failed";
          extractionNote = `Demucsが使えなかったため、${instrument === "bass" ? "低域" : "中高域"}フィルターで簡易パート抽出しました。`;
        }
      } else {
        fallbackReason = "Demucs is not installed";
        extractionNote = `Demucsが未準備のため、${instrument === "bass" ? "低域" : "中高域"}フィルターで簡易パート抽出しました。`;
      }
      if (!extraction) {
        method = "filter";
        report("separating", fallbackReason);
        throwIfCancelled(signal);
        report("converting");
        throwIfCancelled(signal);
        wavFile = await extractPartWithFilters(sourceFile, tempDir, instrument, processOptions);
        extraction = { method: "filter", stem: null, fallbackReason };
      }
      report("analyzing");
      await setImmediate();
      throwIfCancelled(signal);
      const audio = readWavPcm16(wavFile);
      const features = calculateFeatures(audio.samples, audio.sampleRate);
      const spectralBands = calculateSpectralBands(audio.samples, audio.sampleRate, instrument);
      const preset = mapFeaturesToPreset({ instrument, features, spectralBands, title });
      result = {
        preset,
        features: { ...features, spectralBands },
        extraction,
        notes: [
          "YouTube音声を一時取得し、先頭45秒をパート抽出して解析しました。",
          extractionNote,
          "抽出音の周波数バランスをIR生成に反映します。"
        ]
      };
      await setImmediate();
      throwIfCancelled(signal);
    } catch (error) {
      failure = ["CANCELLED", "TIMEOUT", "DOWNLOAD_FAILED", "TOOLS_MISSING", "ANALYSIS_FAILED"].includes(error.code)
        ? error
        : createAnalysisError("ANALYSIS_FAILED", error.message || "Analysis failed", error);
    } finally {
      if (tempDir) {
        try {
          await fs.promises.rm(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (error) {
          failure = createAnalysisError("ANALYSIS_FAILED", "Could not clean up analysis temporary files", error);
        }
      }
    }
    if (signal?.aborted && !failure) failure = createAnalysisError("CANCELLED", "Analysis cancelled");
    if (failure) {
      report(failure.code === "CANCELLED" ? "cancelled" : "failed", failure.message);
      throw failure;
    }
    report("completed");
    return result;
  };
}

export const analyzeTone = createToneAnalyzer();

export function normalizePreset(preset) {
  return {
    ...preset,
    effects: Object.fromEntries(EFFECT_KEYS.map((key) => [key, clamp(preset.effects[key])]))
  };
}
