import { app, BrowserWindow, dialog, ipcMain, session } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BluetoothChooser } from "./bluetoothChooser.js";
import {
  analyzeTone,
  analyzerDependencies,
  analyzerHealth,
  analyzerStatus,
  startAnalyzer,
  stopAnalyzer,
  analysisProgress,
  cancelAnalysis
} from "./analyzerManager.js";
import { convertAudioFile, processAudioFile, selectAudioFile, cancelAudioFile, audioFileStatus, stopAudioFiles } from "./audioFileTools.js";
import {
  bleStatus,
  connectBleDevice,
  disconnectBleDevice,
  scanBleDevices,
  unsupportedBleOperation
} from "./bleManager.js";
import {
  checkImpulseResponseFiles,
  deleteImpulseResponse,
  loadImpulseResponses,
  loadPresets,
  loadSettings,
  readImpulseResponseFile,
  saveImpulseResponses,
  savePresets,
  saveSettings,
  storageNotices,
  exportLibraryBackup,
  importLibraryBackup
} from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const indexPath = path.join(__dirname, "../dist/index.html");
if (!app.isPackaged && process.env.MEFX_TEST_USER_DATA) {
  app.setPath("userData", path.resolve(process.env.MEFX_TEST_USER_DATA));
}

if (!app.isReady()) app.disableHardwareAcceleration();

function safeLog(message: string) {
  if (!devServerUrl && process.env.MEFX_DEBUG_LOGS !== "1") return;
  try {
    console.log(message);
  } catch {
    // The development shortcut can outlive its console pipe.
  }
}

function safeError(message: string) {
  if (!devServerUrl && process.env.MEFX_DEBUG_LOGS !== "1") return;
  try {
    console.error(message);
  } catch {
    // The development shortcut can outlive its console pipe.
  }
}

function isTrustedRendererUrl(value: string) {
  try {
    const candidate = new URL(value);
    if (devServerUrl) return candidate.origin === new URL(devServerUrl).origin;
    return candidate.protocol === "file:" && path.normalize(fileURLToPath(candidate)) === path.normalize(indexPath);
  } catch {
    return false;
  }
}

function registerTrustedHandler<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => TResult | Promise<TResult>
) {
  ipcMain.handle(channel, (event, ...args) => {
    const senderUrl = event.senderFrame?.url || event.sender.getURL();
    if (!isTrustedRendererUrl(senderUrl)) throw new Error(`拒否されたIPC呼び出しです: ${channel}`);
    return handler(...(args as TArgs));
  });
}

function registerIpcHandlers() {
  registerTrustedHandler("storage:load-presets", () => loadPresets());
  registerTrustedHandler("storage:save-presets", savePresets);
  registerTrustedHandler("storage:load-irs", () => loadImpulseResponses());
  registerTrustedHandler("storage:save-irs", saveImpulseResponses);
  registerTrustedHandler("storage:read-ir-file", readImpulseResponseFile);
  registerTrustedHandler("storage:delete-ir", deleteImpulseResponse);
  registerTrustedHandler("storage:check-ir-files", () => checkImpulseResponseFiles());
  registerTrustedHandler("storage:load-settings", () => loadSettings());
  registerTrustedHandler("storage:save-settings", saveSettings);
  registerTrustedHandler("storage:notices", storageNotices);
  registerTrustedHandler("storage:export-backup", exportLibraryBackup);
  registerTrustedHandler("storage:import-backup", importLibraryBackup);
  registerTrustedHandler("analyzer:status", () => analyzerStatus());
  registerTrustedHandler("analyzer:dependencies", () => analyzerDependencies());
  registerTrustedHandler("analyzer:health", () => analyzerHealth());
  registerTrustedHandler("analyzer:start", () => startAnalyzer());
  registerTrustedHandler("analyzer:stop", () => stopAnalyzer());
  registerTrustedHandler("analyzer:analyze", analyzeTone);
  registerTrustedHandler("analyzer:progress", analysisProgress);
  registerTrustedHandler("analyzer:cancel", cancelAnalysis);
  registerTrustedHandler("audio-file:select", () => selectAudioFile());
  registerTrustedHandler("audio-file:convert", convertAudioFile);
  registerTrustedHandler("audio-file:process", processAudioFile);
  registerTrustedHandler("audio-file:cancel", cancelAudioFile);
  registerTrustedHandler("audio-file:status", audioFileStatus);
  registerTrustedHandler("ble:status", () => bleStatus());
  registerTrustedHandler("ble:scan", () => scanBleDevices());
  registerTrustedHandler("ble:connect", connectBleDevice);
  registerTrustedHandler("ble:disconnect", () => disconnectBleDevice());
  registerTrustedHandler("ble:send-preset", () => unsupportedBleOperation("Preset send"));
  registerTrustedHandler("ble:list-presets", () => unsupportedBleOperation("Preset list"));
  registerTrustedHandler("ble:read-preset", () => unsupportedBleOperation("Preset read"));
  registerTrustedHandler("ble:delete-preset", () => unsupportedBleOperation("Preset delete"));
}

function configureSessionSecurity() {
  const appSession = session.defaultSession;
  appSession.setPermissionCheckHandler((webContents, permission, _origin, details) => {
    const trusted = Boolean(webContents && isTrustedRendererUrl(webContents.getURL()) && details.isMainFrame &&
      details.requestingUrl && isTrustedRendererUrl(details.requestingUrl));
    return trusted && permission === "media" && details.mediaType === "audio";
  });
  appSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = "mediaTypes" in details ? details.mediaTypes : undefined;
    const audioOnly = Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every((type) => type === "audio");
    callback(isTrustedRendererUrl(webContents.getURL()) && details.isMainFrame && permission === "media" && audioOnly);
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: "MEFX-S3 Desktop",
    backgroundColor: "#101418",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (devServerUrl || level >= 2) {
      safeLog(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    safeError(`[renderer:load-failed] ${errorCode} ${errorDescription} ${validatedUrl}`);
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    safeError(`[renderer:gone] ${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    void mainWindow.webContents
      .executeJavaScript(
        `({
          text: document.body.innerText.slice(0, 400),
          htmlLength: document.body.innerHTML.length,
          rootChildren: document.getElementById("root")?.children.length ?? -1,
          location: location.href
        })`
      )
      .then((snapshot) => {
        safeLog(`[renderer:dom] ${JSON.stringify(snapshot)}`);
      })
      .catch((error) => {
        safeError(`[renderer:dom-failed] ${error instanceof Error ? error.message : String(error)}`);
      });
  });

  const chooser = new BluetoothChooser(async (devices) => {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: "MEFX-S3 Bluetooth",
      message: "接続するMEFX-S3を選択してください / Select your MEFX-S3",
      detail: "許可した機器に音色データを読み書きします。名前だけでは本体の真正性は保証されません。 / Device names alone do not authenticate hardware.",
      buttons: ["キャンセル / Cancel", ...devices.map((device) => `${device.deviceName} (${device.deviceId})`)],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    return result.response - 1;
  });
  mainWindow.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    chooser.update(devices, callback, isTrustedRendererUrl(mainWindow.webContents.getURL()));
  });
  mainWindow.webContents.on("did-start-navigation", () => chooser.cancel());
  mainWindow.on("closed", () => chooser.cancel());

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedRendererUrl(targetUrl)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  if (devServerUrl) {
    safeLog(`[main] Loading dev server: ${devServerUrl}`);
    void mainWindow.loadURL(devServerUrl);
    return;
  }

  safeLog(`[main] Loading file: ${indexPath}`);
  void mainWindow.loadFile(indexPath);
}

app.whenReady().then(() => {
  configureSessionSecurity();
  registerIpcHandlers();
  createMainWindow();
  if (process.env.MEFX_VERIFY_START_ANALYZER === "1") {
    void startAnalyzer();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void Promise.allSettled([stopAnalyzer(), stopAudioFiles()]).finally(() => app.exit());
});
