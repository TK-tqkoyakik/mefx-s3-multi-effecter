import type { Preset, StoredImpulseResponse } from "./types";
import type { ToneMatchResult } from "./toneMatch";
import type { Language } from "./i18n";

export type DesktopSettings = {
  language: Language;
  lastPage: string;
};

export type ImpulseResponseFileStatus = {
  id: string;
  exists: boolean;
  readable: boolean;
  sizeBytes: number;
  lastError?: string;
};

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

export type AnalyzerStatus = {
  running: boolean;
  baseUrl: string;
  serverEntry: string;
  lastError?: string;
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

export type BleDeviceCandidate = {
  name: string;
  id: string;
  status?: string;
};

export type BleBridgeStatus = {
  available: boolean;
  strategy: "windows-pnp-diagnostics" | "native-gatt-pending";
  connected: boolean;
  deviceName?: string;
  lastError?: string;
  contract: {
    deviceName: string;
    serviceUuid: string;
    characteristics: Record<string, string>;
  };
};

export type AudioFileSelection = {
  canceled: boolean;
  filePath?: string;
  name?: string;
  sizeBytes?: number;
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

export type DesktopApi = {
  appName: string;
  phase: string;
  storage: {
    loadPresets: () => Promise<Preset[]>;
    savePresets: (presets: Preset[]) => Promise<Preset[]>;
    loadImpulseResponses: () => Promise<StoredImpulseResponse[]>;
    saveImpulseResponses: (responses: StoredImpulseResponse[]) => Promise<StoredImpulseResponse[]>;
    readImpulseResponseFile: (filePath: string) => Promise<string>;
    deleteImpulseResponse: (response: StoredImpulseResponse) => Promise<StoredImpulseResponse[]>;
    checkImpulseResponseFiles: () => Promise<ImpulseResponseFileStatus[]>;
    loadSettings: () => Promise<DesktopSettings>;
    saveSettings: (settings: DesktopSettings) => Promise<DesktopSettings>;
    notices: () => Promise<{ file: string; message: string }[]>;
    exportBackup: () => Promise<{ canceled: boolean; filePath?: string }>;
    importBackup: () => Promise<{ canceled: boolean }>;
  };
  analyzer: {
    status: () => Promise<AnalyzerStatus>;
    dependencies: () => Promise<AnalyzerDependency[]>;
    health: () => Promise<AnalyzerHealth>;
    start: () => Promise<AnalyzerHealth>;
    stop: () => Promise<{ ok: boolean; running: boolean; lastError?: string }>;
    analyze: (request: { url: string; instrument: "guitar" | "bass"; requestId?: string }) => Promise<ToneMatchResult>;
    progress: (requestId: string) => Promise<AnalysisProgress>;
    cancel: (requestId: string) => Promise<{ ok: boolean }>;
  };
  audioFile: {
    select: () => Promise<AudioFileSelection>;
    convert: (request: { inputPath: string; requestId?: string }) => Promise<AudioFileJobResult>;
    process: (request: { inputPath: string; preset: Preset; requestId?: string }) => Promise<AudioFileJobResult>;
    cancel: (requestId: string) => Promise<{ ok: boolean }>;
    status: (requestId: string) => Promise<{ requestId: string | null; stage: string }>;
  };
  ble: {
    status: () => Promise<BleBridgeStatus>;
    scan: () => Promise<{ devices: BleDeviceCandidate[]; status: BleBridgeStatus }>;
    connect: (candidate?: BleDeviceCandidate) => Promise<BleBridgeStatus>;
    disconnect: () => Promise<BleBridgeStatus>;
    sendPreset: (preset: Preset) => Promise<void>;
    listPresets: () => Promise<unknown[]>;
    readPreset: (slot: number) => Promise<Preset>;
    deletePreset: (slot: number) => Promise<void>;
  };
};

const fallbackSettings: DesktopSettings = {
  language: "ja",
  lastPage: "dashboard"
};

const electronOnlyMessage =
  "この画面はWeb版として開かれています。YouTube解析、IRファイル操作、音声ファイル処理は、デスクトップの「MEFX-S3 Desktop アプリ」ショートカットから起動してください。";

export function getDesktopApi(): DesktopApi {
  if (window.mefxDesktop) return window.mefxDesktop;

  return {
    appName: "MEFX-S3 Desktop",
    phase: "browser-fallback",
    storage: {
      loadPresets: async () => [],
      savePresets: async (presets) => presets.slice(0, 32),
      loadImpulseResponses: async () => [],
      saveImpulseResponses: async (responses) => responses.slice(0, 64),
      readImpulseResponseFile: async () => {
        throw new Error(electronOnlyMessage);
      },
      deleteImpulseResponse: async () => [],
      checkImpulseResponseFiles: async () => [],
      loadSettings: async () => fallbackSettings,
      saveSettings: async (settings) => settings,
      notices: async () => [],
      exportBackup: async () => { throw new Error(electronOnlyMessage); },
      importBackup: async () => { throw new Error(electronOnlyMessage); }
    },
    analyzer: {
      status: async () => ({ running: false, baseUrl: "browser-fallback", serverEntry: "", lastError: electronOnlyMessage }),
      dependencies: async () => [],
      health: async () => ({ ok: false, running: false, lastError: electronOnlyMessage }),
      start: async () => ({ ok: false, running: false, lastError: electronOnlyMessage }),
      stop: async () => ({ ok: true, running: false }),
      analyze: async () => {
        throw new Error(electronOnlyMessage);
      },
      progress: async () => ({ requestId: null, stage: "idle" }),
      cancel: async () => ({ ok: false })
    },
    audioFile: {
      select: async () => {
        throw new Error(electronOnlyMessage);
      },
      convert: async () => {
        throw new Error(electronOnlyMessage);
      },
      process: async () => {
        throw new Error(electronOnlyMessage);
      },
      cancel: async () => ({ ok: false }),
      status: async () => ({ requestId: null, stage: "idle" })
    },
    ble: {
      status: async () => ({
        available: false,
        strategy: "native-gatt-pending",
        connected: false,
        lastError: electronOnlyMessage,
        contract: { deviceName: "MEFX-S3", serviceUuid: "", characteristics: {} }
      }),
      scan: async () => ({
        devices: [],
        status: {
          available: false,
          strategy: "native-gatt-pending",
          connected: false,
          lastError: electronOnlyMessage,
          contract: { deviceName: "MEFX-S3", serviceUuid: "", characteristics: {} }
        }
      }),
      connect: async () => {
        throw new Error(electronOnlyMessage);
      },
      disconnect: async () => ({
        available: false,
        strategy: "native-gatt-pending",
        connected: false,
        contract: { deviceName: "MEFX-S3", serviceUuid: "", characteristics: {} }
      }),
      sendPreset: async () => {
        throw new Error(electronOnlyMessage);
      },
      listPresets: async () => [],
      readPreset: async () => {
        throw new Error(electronOnlyMessage);
      },
      deletePreset: async () => {
        throw new Error(electronOnlyMessage);
      }
    }
  };
}
