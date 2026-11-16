import fs from "node:fs";
import { Server } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { app } from "electron";
import { randomUUID } from "node:crypto";

export type AnalyzerHealth = {
  ok: boolean;
  service?: string;
  version?: string;
  autoShutdown?: boolean;
  idleTimeoutMs?: number;
  heartbeatSeen?: boolean;
  running: boolean;
  lastError?: string;
};

export type AnalyzeRequest = {
  url: string;
  instrument: "guitar" | "bass";
  requestId?: string;
};

export type AnalysisProgress = { requestId: string | null; stage: string; method?: string; detail?: string; errorCode?: string };

export type AnalyzerDependency = {
  id: string;
  label: string;
  ok: boolean;
  path: string;
  detail: string;
  required: boolean;
  source: "bundled" | "external" | "configured" | "optional" | "app";
};

type AnalysisServerModule = {
  createAnalysisServer: () => Server;
};

let analyzerServer: Server | null = null;
let lastError = "";
const host = "127.0.0.1";
const preferredPort = 8787;
let activePort = preferredPort;
const expectedService = "multi-effecter-analysis-server";
const activeRequests = new Set<string>();
const cancelledRequests = new Set<string>();

function baseUrl() {
  return `http://${host}:${activePort}`;
}

function projectRoot() {
  if (app.isPackaged) return process.resourcesPath;
  return process.env.MEFX_PROJECT_ROOT || path.resolve(app.getAppPath(), "..", "..");
}

function serverEntry() {
  return path.join(projectRoot(), "server", "src", "server.js");
}

function serverRoot() {
  return path.join(projectRoot(), "server");
}

function localPythonPackages() {
  return path.join(projectRoot(), "tools", "python-packages");
}

function espPythonPackages() {
  return "C:\\Espressif\\mefx_python_packages";
}

function pythonPackages() {
  const local = localPythonPackages();
  if (fs.existsSync(path.join(local, "yt_dlp"))) return local;
  return process.env.MEFX_PYTHON_PACKAGES || espPythonPackages();
}

function torchHome() {
  const bundled = path.join(projectRoot(), "tools", "torch-home");
  if (exists(bundled)) return bundled;
  return process.env.MEFX_TORCH_HOME || "C:\\Espressif\\mefx_torch_home";
}

function isAnalyzerRunning() {
  return Boolean(analyzerServer?.listening);
}

function bundledPythonCandidate() {
  return path.join(projectRoot(), "tools", "python", "python.exe");
}

function configuredPythonCandidate() {
  return process.env.MEFX_PYTHON || "";
}

function codexPythonCandidate() {
  return path.join(app.getPath("home"), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe");
}

function pythonRuntime() {
  const bundled = bundledPythonCandidate();
  if (exists(bundled)) return { path: bundled, source: "bundled" as const };
  const configured = configuredPythonCandidate();
  if (configured && exists(configured)) return { path: configured, source: "configured" as const };
  const codex = codexPythonCandidate();
  if (exists(codex)) return { path: codex, source: "external" as const };
  return { path: configured || "python", source: "external" as const };
}

function packageSource(target: string) {
  return target.startsWith(projectRoot()) ? "bundled" as const : "external" as const;
}

function exists(target: string) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

export function analyzerStatus() {
  return {
    running: isAnalyzerRunning(),
    baseUrl: baseUrl(),
    serverEntry: serverEntry(),
    lastError
  };
}

export function analyzerDependencies(): AnalyzerDependency[] {
  const serverPackage = path.join(serverRoot(), "package.json");
  const serverNodeModules = path.join(serverRoot(), "node_modules");
  const ffmpeg = path.join(serverRoot(), "node_modules", "ffmpeg-static", "ffmpeg.exe");
  const ffprobe = path.join(serverRoot(), "node_modules", "ffprobe-static", "bin", "win32", "x64", "ffprobe.exe");
  const packages = pythonPackages();
  const ytDlp = path.join(packages, "yt_dlp");
  const demucs = path.join(packages, "demucs", "separate.py");
  const runtimePython = pythonRuntime();
  const modelCache = torchHome();

  return [
    {
      id: "server-entry",
      label: "Internal analyzer server",
      ok: exists(serverEntry()) && exists(serverPackage),
      path: serverEntry(),
      detail: exists(serverEntry()) ? "Runs inside the Electron main process." : "server/src/server.js is missing.",
      required: true,
      source: "app"
    },
    {
      id: "server-node-modules",
      label: "Analyzer npm packages",
      ok: exists(serverNodeModules),
      path: serverNodeModules,
      detail: exists(serverNodeModules) ? "Packaged server/node_modules found." : "Run scripts\\install-analysis-tools.ps1.",
      required: true,
      source: packageSource(serverNodeModules)
    },
    {
      id: "ffmpeg",
      label: "ffmpeg-static",
      ok: exists(ffmpeg),
      path: ffmpeg,
      detail: exists(ffmpeg) ? "ffmpeg.exe found in analyzer npm packages." : "ffmpeg-static is missing.",
      required: true,
      source: packageSource(ffmpeg)
    },
    {
      id: "ffprobe",
      label: "ffprobe-static",
      ok: exists(ffprobe),
      path: ffprobe,
      detail: exists(ffprobe) ? "ffprobe.exe found in analyzer npm packages." : "ffprobe-static is missing.",
      required: true,
      source: packageSource(ffprobe)
    },
    {
      id: "python",
      label: "Python runtime",
      ok: exists(runtimePython.path),
      path: runtimePython.path,
      detail: exists(runtimePython.path) ? "Python runtime found for yt-dlp." : "Python runtime was not found.",
      required: true,
      source: runtimePython.source
    },
    {
      id: "yt-dlp",
      label: "yt-dlp package",
      ok: exists(ytDlp),
      path: ytDlp,
      detail: exists(ytDlp) ? "yt-dlp package found for YouTube download." : "yt-dlp is missing.",
      required: true,
      source: packageSource(ytDlp)
    },
    {
      id: "demucs",
      label: "Demucs package",
      ok: exists(demucs),
      path: demucs,
      detail: exists(demucs) ? "Demucs package found for high quality separation." : "Optional; analyzer falls back to ffmpeg filters when missing.",
      required: false,
      source: exists(demucs) ? packageSource(demucs) : "optional"
    },
    {
      id: "model-cache",
      label: "Demucs model cache",
      ok: exists(modelCache),
      path: modelCache,
      detail: exists(modelCache) ? "Demucs model cache folder found." : "Optional; only needed for Demucs high quality mode.",
      required: false,
      source: exists(modelCache) ? packageSource(modelCache) : "optional"
    }
  ];
}

export async function analyzerHealth(): Promise<AnalyzerHealth> {
  try {
    const response = await fetch(`${baseUrl()}/health`);
    if (!response.ok) throw new Error(`Analyzer health returned ${response.status}`);
    const body = (await response.json()) as Omit<AnalyzerHealth, "running" | "lastError">;
    if (!body.ok || body.service !== expectedService) {
      throw new Error(`ポート${activePort}はMEFX解析サーバーではない別のアプリが使用しています。`);
    }
    return { ...body, running: analyzerStatus().running, lastError };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Analyzer health check failed";
    return {
      ok: false,
      running: analyzerStatus().running,
      lastError
    };
  }
}

export async function startAnalyzer(): Promise<AnalyzerHealth> {
  const currentHealth = await analyzerHealth();
  if (currentHealth.ok) return currentHealth;

  if (isAnalyzerRunning()) return currentHealth;

  const entry = serverEntry();
  if (!fs.existsSync(entry)) {
    lastError = `Analyzer server not found: ${entry}`;
    return { ok: false, running: false, lastError };
  }

  try {
    process.env.HOST = host;
    process.env.PORT = String(preferredPort);
    process.env.MEFX_AUTO_SHUTDOWN = "0";

    const module = (await import(pathToFileURL(entry).href)) as AnalysisServerModule;
    const listen = async (requestedPort: number) => {
      const server = module.createAnalysisServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(requestedPort, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server;
    };

    try {
      analyzerServer = await listen(preferredPort);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") throw error;
      analyzerServer = await listen(0);
    }

    const address = analyzerServer.address();
    if (!address || typeof address === "string") throw new Error("Analyzer server did not report a TCP port.");
    activePort = address.port;
    if (process.env.MEFX_VERIFY_ANALYZER_PORT_FILE) {
      fs.writeFileSync(process.env.MEFX_VERIFY_ANALYZER_PORT_FILE, String(activePort), "utf8");
    }
    analyzerServer.on("error", (error) => {
      lastError = error instanceof Error ? error.message : "Analyzer server error";
    });
    console.log(`MEFX analysis server listening inside Electron on ${baseUrl()}`);
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Analyzer server failed to start";
    analyzerServer = null;
    activePort = preferredPort;
    return { ok: false, running: false, lastError };
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const health = await analyzerHealth();
    if (health.ok) return health;
  }

  return {
    ok: false,
    running: isAnalyzerRunning(),
    lastError: lastError || "Analyzer did not become ready in time"
  };
}

export async function stopAnalyzer(): Promise<{ ok: boolean; running: boolean; lastError?: string }> {
  await Promise.allSettled([...activeRequests].map((requestId) => cancelAnalysis(requestId)));
  if (analyzerServer) {
    const server = analyzerServer;
    analyzerServer = null;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
  activePort = preferredPort;
  return { ok: true, running: false, lastError };
}

export async function analyzeTone(request: AnalyzeRequest) {
  const requestId = request.requestId || randomUUID();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw new Error("解析IDが正しくありません。");
  const health = await analyzerHealth();
  if (!health.ok) throw new Error("Analyzer server is not running.");
  if (cancelledRequests.delete(requestId)) throw new Error("CANCELLED: 解析を中止しました。");
  activeRequests.add(requestId);
  try {
    const response = await fetch(`${baseUrl()}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, requestId })
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`${body.code || "ANALYSIS_FAILED"}: ${body.error || `Analyzer returned ${response.status}`}`);
    return body;
  } finally { activeRequests.delete(requestId); cancelledRequests.delete(requestId); }
}

export async function analysisProgress(requestId: string): Promise<AnalysisProgress> {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw new Error("解析IDが正しくありません。");
  const response = await fetch(`${baseUrl()}/analysis/status?requestId=${encodeURIComponent(requestId)}`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error("解析の進捗を取得できませんでした。");
  return response.json() as Promise<AnalysisProgress>;
}

export async function cancelAnalysis(requestId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(requestId)) throw new Error("解析IDが正しくありません。");
  cancelledRequests.add(requestId);
  if (cancelledRequests.size > 128) cancelledRequests.delete(cancelledRequests.values().next().value!);
  const response = await fetch(`${baseUrl()}/analysis/cancel`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId }), signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error("解析を中止できませんでした。");
  return response.json() as Promise<{ ok: boolean }>;
}
