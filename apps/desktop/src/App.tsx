import { useEffect, useMemo, useRef, useState } from "react";
import {
  type AnalyzerDependency,
  type AnalyzerHealth,
  type BleBridgeStatus,
  type BleDeviceCandidate,
  type ImpulseResponseFileStatus,
  getDesktopApi
} from "./lib/desktopApi";
import { DesktopBleClient } from "./lib/desktopBleClient";
import type { AppLogEntry, DiagnosticItem } from "./lib/diagnostics";
import { createTranslator, type Language } from "./lib/i18n";
import { deriveDeviceTone, makePreset, validatePreset } from "./lib/presets";
import type { ToneMatchResult } from "./lib/toneMatch";
import type { AudioTelemetry, DevicePresetSummary, DeviceStatus, Preset, StoredImpulseResponse } from "./lib/types";
import { AudioFiles } from "./routes/AudioFiles";
import { AudioFx } from "./routes/AudioFx";
import { Dashboard } from "./routes/Dashboard";
import { Library } from "./routes/Library";
import { ManualEditor } from "./routes/ManualEditor";
import { Settings } from "./routes/Settings";
import { ToneMatch } from "./routes/ToneMatch";

type PageId = "dashboard" | "manual" | "tone-match" | "audio-fx" | "audio-files" | "library" | "settings";

type PageDefinition = {
  id: PageId;
  labelKey: string;
  descriptionKey: string;
};

const pages: PageDefinition[] = [
  {
    id: "dashboard",
    labelKey: "nav.dashboard",
    descriptionKey: "nav.dashboard.description"
  },
  {
    id: "manual",
    labelKey: "nav.manual",
    descriptionKey: "nav.manual.description"
  },
  {
    id: "tone-match",
    labelKey: "nav.toneMatch",
    descriptionKey: "nav.toneMatch.description"
  },
  {
    id: "audio-fx",
    labelKey: "nav.audioFx",
    descriptionKey: "nav.audioFx.description"
  },
  {
    id: "audio-files",
    labelKey: "nav.audioFiles",
    descriptionKey: "nav.audioFiles.description"
  },
  {
    id: "library",
    labelKey: "nav.library",
    descriptionKey: "nav.library.description"
  },
  {
    id: "settings",
    labelKey: "nav.settings",
    descriptionKey: "nav.settings.description"
  }
];

const idleDeviceStatus: DeviceStatus = {
  connected: false,
  mode: "idle",
  instrument: "guitar",
  activeSlot: 0,
  bypass: false,
  supplyMv: 0
};

const idleTelemetry: AudioTelemetry = {
  inputLevel: 0,
  preOutputLevel: 0,
  micLevel: 0,
  clip: false
};

function toDevicePresetSummary(preset: Preset, slot: number): DevicePresetSummary {
  return {
    slot,
    name: preset.name,
    instrument: preset.instrument,
    source: preset.source
  };
}

type RenderPageArgs = {
  activePage: PageId;
  preset: Preset;
  setPreset: (preset: Preset) => void;
  savedPresets: Preset[];
  impulseResponses: StoredImpulseResponse[];
  impulseResponseFileStatuses: ImpulseResponseFileStatus[];
  saveCurrentPreset: () => void;
  loadPreset: (preset: Preset) => void;
  deletePreset: (preset: Preset) => void;
  renamePreset: (preset: Preset, name: string) => void;
  storageMessage: string;
  deviceStatus: DeviceStatus;
  telemetry: AudioTelemetry;
  devicePresets: Preset[];
  deviceMessage: string;
  connectBleDevice: () => void;
  connectSimulator: () => void;
  disconnectDevice: () => void;
  sendPresetToSimulator: () => void;
  loadDevicePreset: (slot: number) => void;
  deleteDevicePreset: (slot: number) => void;
  saveCurrentIr: () => void;
  loadIr: (response: StoredImpulseResponse) => void;
  deleteIr: (response: StoredImpulseResponse) => void;
  renameIr: (response: StoredImpulseResponse, name: string) => void;
  checkIrFiles: () => void;
  diagnostics: DiagnosticItem[];
  logs: AppLogEntry[];
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: (key: string) => string;
  audioFxEnabled: boolean;
  audioFxBypass: boolean;
  audioFxIrBypass: boolean;
  audioFxInputDevice: string;
  audioFxOutputDevice: string;
  audioFxLatencyMode: "low" | "balanced" | "stable";
  setAudioFxEnabled: (enabled: boolean) => void;
  setAudioFxBypass: (bypass: boolean) => void;
  setAudioFxIrBypass: (bypass: boolean) => void;
  setAudioFxInputDevice: (device: string) => void;
  setAudioFxOutputDevice: (device: string) => void;
  setAudioFxLatencyMode: (mode: "low" | "balanced" | "stable") => void;
  applyToneMatchResult: (result: ToneMatchResult) => Promise<void>;
  analyzerHealth: AnalyzerHealth;
  refreshAnalyzerHealth: () => void;
  startAnalyzerServer: () => void;
  stopAnalyzerServer: () => void;
  analyzeWithServer: (url: string, instrument: "guitar" | "bass", requestId: string) => Promise<ToneMatchResult>;
  bleStatus: BleBridgeStatus | null;
  bleCandidates: BleDeviceCandidate[];
  scanBleDevices: () => void;
};

function renderPage(args: RenderPageArgs) {
  switch (args.activePage) {
    case "dashboard":
      return (
        <Dashboard
          preset={args.preset}
          deviceStatus={args.deviceStatus}
          telemetry={args.telemetry}
          deviceMessage={args.deviceMessage}
          onConnectBle={args.connectBleDevice}
          onConnectSimulator={args.connectSimulator}
          onDisconnect={args.disconnectDevice}
          onSendPreset={args.sendPresetToSimulator}
          bleStatus={args.bleStatus}
          bleCandidates={args.bleCandidates}
          onScanBle={args.scanBleDevices}
          t={args.t}
        />
      );
    case "manual":
      return (
        <ManualEditor
          preset={args.preset}
          onPresetChange={args.setPreset}
          onSavePreset={args.saveCurrentPreset}
          storageMessage={args.storageMessage}
          t={args.t}
        />
      );
    case "tone-match":
      return (
        <ToneMatch
          onApplyResult={args.applyToneMatchResult}
          analyzerHealth={args.analyzerHealth}
          onRefreshAnalyzer={args.refreshAnalyzerHealth}
          onStartAnalyzer={args.startAnalyzerServer}
          onStopAnalyzer={args.stopAnalyzerServer}
          onAnalyzeWithServer={args.analyzeWithServer}
          t={args.t}
        />
      );
    case "audio-fx":
      return (
        <AudioFx
          preset={args.preset}
          enabled={args.audioFxEnabled}
          bypass={args.audioFxBypass}
          irBypass={args.audioFxIrBypass}
          inputDevice={args.audioFxInputDevice}
          outputDevice={args.audioFxOutputDevice}
          latencyMode={args.audioFxLatencyMode}
          onEnabledChange={args.setAudioFxEnabled}
          onBypassChange={args.setAudioFxBypass}
          onIrBypassChange={args.setAudioFxIrBypass}
          onInputDeviceChange={args.setAudioFxInputDevice}
          onOutputDeviceChange={args.setAudioFxOutputDevice}
          onLatencyModeChange={args.setAudioFxLatencyMode}
          t={args.t}
        />
      );
    case "audio-files":
      return <AudioFiles preset={args.preset} t={args.t} />;
    case "library":
      return (
        <Library
          currentPreset={args.preset}
          presets={args.savedPresets}
          impulseResponses={args.impulseResponses}
          impulseResponseFileStatuses={args.impulseResponseFileStatuses}
          onLoadPreset={args.loadPreset}
          onDeletePreset={args.deletePreset}
          onRenamePreset={args.renamePreset}
          devicePresets={args.devicePresets}
          deviceSummaries={args.devicePresets.map(toDevicePresetSummary)}
          onLoadDevicePreset={args.loadDevicePreset}
          onDeleteDevicePreset={args.deleteDevicePreset}
          onSaveCurrentIr={args.saveCurrentIr}
          onLoadIr={args.loadIr}
          onDeleteIr={args.deleteIr}
          onRenameIr={args.renameIr}
          onCheckIrFiles={args.checkIrFiles}
          t={args.t}
        />
      );
    case "settings":
      return (
        <Settings
          diagnostics={args.diagnostics}
          logs={args.logs}
          language={args.language}
          onLanguageChange={args.onLanguageChange}
          t={args.t}
        />
      );
  }
}

export default function App() {
  const desktopApi = useMemo(() => getDesktopApi(), []);
  const bleClientRef = useRef<DesktopBleClient | null>(null);
  const [language, setLanguage] = useState<Language>("ja");
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [preset, setPreset] = useState<Preset>(() => makePreset({ name: "Stage Clean" }));
  const [savedPresets, setSavedPresets] = useState<Preset[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const presetsLoaded = useRef(false);
  const irsLoaded = useRef(false);
  const [impulseResponses, setImpulseResponses] = useState<StoredImpulseResponse[]>([]);
  const [impulseResponseFileStatuses, setImpulseResponseFileStatuses] = useState<ImpulseResponseFileStatus[]>([]);
  const [storageMessage, setStorageMessage] = useState("保存領域を使用できます。");
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus>(idleDeviceStatus);
  const [telemetry, setTelemetry] = useState<AudioTelemetry>(idleTelemetry);
  const [devicePresets, setDevicePresets] = useState<Preset[]>([]);
  const [deviceMessage, setDeviceMessage] = useState("シミュレーターは未接続です。");
  const [audioFxEnabled, setAudioFxEnabled] = useState(false);
  const [audioFxBypass, setAudioFxBypass] = useState(false);
  const [audioFxIrBypass, setAudioFxIrBypass] = useState(false);
  const [audioFxInputDevice, setAudioFxInputDevice] = useState("default");
  const [audioFxOutputDevice, setAudioFxOutputDevice] = useState("default");
  const [audioFxLatencyMode, setAudioFxLatencyMode] = useState<"low" | "balanced" | "stable">("balanced");
  const [analyzerHealth, setAnalyzerHealth] = useState<AnalyzerHealth>({
    ok: false,
    running: false,
    lastError: "解析サーバーはまだ確認されていません。"
  });
  const [analyzerDependencies, setAnalyzerDependencies] = useState<AnalyzerDependency[]>([]);
  const [bleStatus, setBleStatus] = useState<BleBridgeStatus | null>(null);
  const [bleCandidates, setBleCandidates] = useState<BleDeviceCandidate[]>([]);
  const [logs, setLogs] = useState<AppLogEntry[]>([
    { at: new Date().toISOString(), scope: "ui", message: "デスクトップアプリを起動しました。" }
  ]);
  const currentPage = useMemo(() => pages.find((page) => page.id === activePage) ?? pages[0], [activePage]);
  const t = useMemo(() => createTranslator(language), [language]);
  const validationErrors = useMemo(() => validatePreset(preset), [preset]);

  const appendLog = (scope: AppLogEntry["scope"], message: string) => {
    setLogs((current) => [{ at: new Date().toISOString(), scope, message }, ...current].slice(0, 80));
  };

  const describeBleConnectError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    if (normalized.includes("requestdevice") || normalized.includes("user cancelled") || normalized.includes("user canceled")) {
      return t("status.device.bluetoothChooserCancelled");
    }
    if (normalized.includes("web bluetooth") || normalized.includes("bluetooth is not available")) {
      return t("status.device.bluetoothUnavailable");
    }
    if (normalized.includes("service was not found") || normalized.includes("gatt") || normalized.includes("primaryservice")) {
      return t("status.device.bluetoothServiceMissing");
    }
    return message || t("status.device.connectFailed");
  };

  const diagnostics = useMemo<DiagnosticItem[]>(
    () => [
      {
        label: t("diag.storage"),
        detail: storageMessage,
        state: storageMessage.toLowerCase().includes("could not") || storageMessage.includes("できません") ? "fail" : "ok"
      },
      {
        label: t("diag.currentPreset"),
        detail: validationErrors.length === 0 ? t("diag.currentPresetOk") : validationErrors.join(" / "),
        state: validationErrors.length === 0 ? "ok" : "warn"
      },
      {
        label: t("diag.irLibrary"),
        detail:
          impulseResponses.length === 0
            ? t("diag.irLibraryEmpty")
            : t("diag.irLibrarySummary", {
                count: impulseResponses.length,
                wav: impulseResponses.filter((item) => item.filePath).length,
                ready: impulseResponses.filter((item) => item.filePath || item.source === "generated").length
              }),
        state:
          impulseResponses.length === 0
            ? "pending"
            : impulseResponses.every((item) => item.filePath)
              ? "ok"
              : "warn"
      },
      {
        label: t("diag.simulator"),
        detail:
          deviceStatus.mode === "simulator"
            ? t("diag.simulatorConnected", { name: deviceStatus.deviceName ?? t("dashboard.simulator"), count: devicePresets.length })
            : t("diag.simulatorIdle"),
        state: deviceStatus.mode === "simulator" ? "ok" : "pending"
      },
      {
        label: t("diag.bluetooth"),
        detail: bleStatus
          ? `${bleStatus.strategy}. ${bleStatus.lastError || t("diag.bluetoothCandidates", { count: bleCandidates.length })}`
          : t("diag.bluetoothUnchecked"),
        state: bleStatus?.available ? (bleStatus.connected ? "ok" : "warn") : "pending"
      },
      {
        label: t("diag.analyzer"),
        detail: analyzerHealth.ok
          ? t("diag.analyzerOnline", { service: analyzerHealth.service ?? "Analyzer" })
          : analyzerHealth.lastError ?? t("diag.analyzerOffline"),
        state: analyzerHealth.ok ? "ok" : "pending"
      },
      ...analyzerDependencies.map<DiagnosticItem>((dependency) => ({
        label: dependency.label,
        detail: dependency.detail,
        state: dependency.ok ? "ok" : dependency.required ? "pending" : "warn",
        source: dependency.source,
        path: dependency.path
      }))
    ],
    [
      analyzerDependencies,
      analyzerHealth,
      bleCandidates.length,
      bleStatus,
      devicePresets.length,
      deviceStatus.deviceName,
      deviceStatus.mode,
      impulseResponses,
      storageMessage,
      t,
      validationErrors
    ]
  );

  const analyzerDependencySummary = useMemo(
    () => ({
      total: analyzerDependencies.length,
      ok: analyzerDependencies.filter((dependency) => dependency.ok).length
    }),
    [analyzerDependencies]
  );

  const topbarAnalyzerLabel =
    analyzerDependencySummary.total > 0
      ? `${analyzerHealth.ok ? t("common.online") : t("common.offline")} ${analyzerDependencySummary.ok}/${analyzerDependencySummary.total}`
      : analyzerHealth.ok
        ? t("common.online")
        : t("common.notStarted");

  const persistPresets = async (next: Preset[]) => {
    if (!presetsLoaded.current) throw new Error(t("status.storage.loadBeforeSave"));
    const saved = await desktopApi.storage.savePresets(next);
    setSavedPresets(saved);
    return saved;
  };

  const persistImpulseResponses = async (next: StoredImpulseResponse[]) => {
    if (!irsLoaded.current) throw new Error(t("status.storage.loadBeforeSave"));
    const saved = await desktopApi.storage.saveImpulseResponses(next);
    setImpulseResponses(saved);
    return saved;
  };

  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        const results = await Promise.allSettled([
          desktopApi.storage.loadPresets(),
          desktopApi.storage.loadImpulseResponses(),
          desktopApi.storage.loadSettings()
        ]);
        if (cancelled) return;
        const [presetResult, irResult, settingsResult] = results;
        const loadedPresets = presetResult.status === "fulfilled" ? presetResult.value : [];
        const loadedImpulseResponses = irResult.status === "fulfilled" ? irResult.value : [];
        if (presetResult.status === "fulfilled") {
          presetsLoaded.current = true;
          setSavedPresets(loadedPresets);
          if (loadedPresets[0]) setPreset(loadedPresets[0]);
        }
        if (irResult.status === "fulfilled") {
          irsLoaded.current = true;
          setImpulseResponses(loadedImpulseResponses);
          void checkIrFiles();
        }
        if (settingsResult.status === "fulfilled") {
          const settings = settingsResult.value;
          setLanguage(settings.language);
          if (pages.some((page) => page.id === settings.lastPage)) {
            setActivePage((current) => current === "dashboard" ? settings.lastPage as PageId : current);
          }
          setStorageReady(true);
        }
        const notices = await desktopApi.storage.notices();
        if (cancelled) return;
        const failures = results.flatMap((item) => item.status === "rejected" ? [item.reason instanceof Error ? item.reason.message : t("status.storage.loadFailed")] : []);
        setStorageMessage([...failures, ...notices.map((notice) => notice.message)].join(" ") || t("status.storage.loaded", { presets: loadedPresets.length, irs: loadedImpulseResponses.length }));
        appendLog("storage", t("status.storage.loaded", { presets: loadedPresets.length, irs: loadedImpulseResponses.length }));
      } catch (error) {
        if (cancelled) return;
        setStorageMessage(error instanceof Error ? error.message : t("status.storage.loadFailed"));
        appendLog("storage", t("status.storage.loadFailed"));
      }
    }

    void loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [desktopApi]);

  useEffect(() => {
    if (!storageReady) return;
    void desktopApi.storage.saveSettings({ language, lastPage: activePage }).catch((error) => setStorageMessage(error instanceof Error ? error.message : t("status.storage.savePresetFailed")));
  }, [activePage, desktopApi, language, storageReady]);

  useEffect(() => {
    void refreshAnalyzerHealth();
    void refreshBleStatus();
  }, []);

  useEffect(() => {
    if (deviceStatus.mode !== "simulator") return;

    const timer = window.setInterval(() => {
      const t = Date.now() / 700;
      const inputLevel = Math.max(0, Math.min(1, 0.38 + Math.sin(t) * 0.22));
      setTelemetry({
        inputLevel,
        preOutputLevel: Math.max(0, Math.min(1, inputLevel * 0.82)),
        micLevel: Math.max(0, Math.min(1, 0.2 + Math.cos(t * 0.7) * 0.12)),
        clip: inputLevel > 0.86
      });
    }, 300);

    return () => window.clearInterval(timer);
  }, [deviceStatus.mode]);

  const saveCurrentPreset = async () => {
    const errors = validatePreset(preset);
    if (errors.length > 0) {
      setStorageMessage(t("status.storage.fixBeforeSave"));
      return;
    }

    const nextPreset = { ...preset, deviceTone: deriveDeviceTone(preset), createdAt: new Date().toISOString() };
    const nextPresets = [nextPreset, ...savedPresets.filter((item) => item.name !== nextPreset.name)].slice(0, 32);
    try {
      await persistPresets(nextPresets);
      setPreset(nextPreset);
      setStorageMessage(t("status.storage.savedPreset", { name: nextPreset.name }));
      appendLog("storage", t("status.storage.savedPreset", { name: nextPreset.name }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.savePresetFailed"));
      appendLog("storage", t("status.storage.savePresetFailed"));
    }
  };

  const loadPreset = (nextPreset: Preset) => {
    setPreset(nextPreset);
    setActivePage("manual");
    setStorageMessage(t("status.storage.loadedPreset", { name: nextPreset.name }));
    appendLog("storage", t("status.storage.loadedPreset", { name: nextPreset.name }));
  };

  const deletePreset = async (target: Preset) => {
    const nextPresets = savedPresets.filter((item) => item.createdAt !== target.createdAt || item.name !== target.name);
    try {
      await persistPresets(nextPresets);
      setStorageMessage(t("status.storage.deletedPreset", { name: target.name }));
      appendLog("storage", t("status.storage.deletedPreset", { name: target.name }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.deletePresetFailed"));
      appendLog("storage", t("status.storage.deletePresetFailed"));
    }
  };

  const renamePreset = async (target: Preset, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 40) {
      setStorageMessage(t("status.storage.invalidPresetName"));
      return;
    }

    const renamed = { ...target, name: trimmedName, createdAt: new Date().toISOString() };
    const nextPresets = [renamed, ...savedPresets.filter((item) => item !== target && item.name !== trimmedName)].slice(0, 32);
    try {
      await persistPresets(nextPresets);
      if (preset.createdAt === target.createdAt && preset.name === target.name) setPreset(renamed);
      setStorageMessage(t("status.storage.renamedPreset", { name: trimmedName }));
      appendLog("storage", t("status.storage.renamedPreset", { name: trimmedName }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.renamePresetFailed"));
      appendLog("storage", t("status.storage.renamePresetFailed"));
    }
  };

  const saveCurrentIr = async () => {
    if (!preset.ir?.enabled) {
      setStorageMessage(t("status.storage.irRequired"));
      appendLog("storage", t("status.storage.irRequired"));
      return;
    }

    const nextIr: StoredImpulseResponse = {
      ...preset.ir,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      instrument: preset.instrument,
      createdAt: new Date().toISOString()
    };
    const nextResponses = [nextIr, ...impulseResponses.filter((item) => item.name !== nextIr.name)].slice(0, 64);
    try {
      await persistImpulseResponses(nextResponses);
      setStorageMessage(t("status.storage.savedIr", { name: nextIr.name }));
      appendLog("storage", t("status.storage.savedIr", { name: nextIr.name }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.saveIrFailed"));
      appendLog("storage", t("status.storage.saveIrFailed"));
    }
  };

  const saveImpulseResponseFromPreset = async (sourcePreset: Preset): Promise<StoredImpulseResponse | null> => {
    if (!sourcePreset.ir?.enabled) return null;

    const nextIr: StoredImpulseResponse = {
      ...sourcePreset.ir,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      instrument: sourcePreset.instrument,
      createdAt: new Date().toISOString()
    };
    const nextResponses = [nextIr, ...impulseResponses.filter((item) => item.name !== nextIr.name)].slice(0, 64);
    const saved = await persistImpulseResponses(nextResponses);
    return saved.find((item) => item.id === nextIr.id) ?? saved[0] ?? nextIr;
  };

  const loadIr = (response: StoredImpulseResponse) => {
    setPreset({
      ...preset,
      instrument: response.instrument,
      ir: {
        enabled: true,
        source: "library",
        name: response.name,
        mix: response.mix,
        lengthMs: response.lengthMs,
        sampleRate: response.sampleRate,
        profile: response.profile,
        filePath: response.filePath,
        createdFromUrl: response.createdFromUrl,
        notes: response.notes
      },
      deviceTone: deriveDeviceTone({
        ...preset,
        instrument: response.instrument,
        ir: {
          enabled: true,
          source: "library",
          name: response.name,
          mix: response.mix,
          lengthMs: response.lengthMs,
          sampleRate: response.sampleRate,
          profile: response.profile,
          filePath: response.filePath,
          createdFromUrl: response.createdFromUrl,
          notes: response.notes
        }
      })
    });
    setActivePage("manual");
    setStorageMessage(t("status.storage.loadedIr", { name: response.name }));
    appendLog("storage", t("status.storage.loadedIr", { name: response.name }));
  };

  const deleteIr = async (response: StoredImpulseResponse) => {
    try {
      const nextResponses = await desktopApi.storage.deleteImpulseResponse(response);
      setImpulseResponses(nextResponses);
      setImpulseResponseFileStatuses((current) => current.filter((item) => item.id !== response.id));
      setStorageMessage(t("status.storage.deletedIr", { name: response.name }));
      appendLog("storage", t("status.storage.deletedIr", { name: response.name }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.deleteIrFailed"));
      appendLog("storage", t("status.storage.deleteIrFailed"));
    }
  };

  const renameIr = async (response: StoredImpulseResponse, name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 80) {
      setStorageMessage(t("status.storage.invalidIrName"));
      return;
    }

    const renamed = { ...response, name: trimmedName };
    const nextResponses = [renamed, ...impulseResponses.filter((item) => item.id !== response.id && item.name !== trimmedName)].slice(0, 64);
    try {
      await persistImpulseResponses(nextResponses);
      if (preset.ir && (preset.ir.filePath === response.filePath || preset.ir.name === response.name)) {
        setPreset({
          ...preset,
          ir: {
            ...preset.ir,
            name: trimmedName
          }
        });
      }
      setStorageMessage(t("status.storage.renamedIr", { name: trimmedName }));
      appendLog("storage", t("status.storage.renamedIr", { name: trimmedName }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.renameIrFailed"));
      appendLog("storage", t("status.storage.renameIrFailed"));
    }
  };

  const checkIrFiles = async () => {
    try {
      const statuses = await desktopApi.storage.checkImpulseResponseFiles();
      setImpulseResponseFileStatuses(statuses);
      const broken = statuses.filter((item) => !item.readable).length;
      setStorageMessage(
        broken === 0
          ? t("status.storage.checkedIrOk", { count: statuses.length })
          : t("status.storage.checkedIrWarn", { count: statuses.length, broken })
      );
      appendLog("storage", t("status.storage.checkedIrOk", { count: `${statuses.length - broken}/${statuses.length}` }));
    } catch (error) {
      setStorageMessage(error instanceof Error ? error.message : t("status.storage.checkIrFailed"));
      appendLog("storage", t("status.storage.checkIrFailed"));
    }
  };

  const publishSimulatorStatus = (presets: Preset[], fallbackPreset = preset) => {
    const active = presets[0] ?? fallbackPreset;
    setDeviceStatus({
      connected: true,
      mode: "simulator",
      deviceName: "MEFX-S3 Simulator",
      instrument: active.instrument,
      activeSlot: 0,
      bypass: active.bypass,
      supplyMv: 9000
    });
  };

  const connectSimulator = () => {
    const initialPreset = devicePresets[0] ?? makePreset({ name: "SIM Clean" });
    const nextPresets = devicePresets.length > 0 ? devicePresets : [initialPreset];
    setDevicePresets(nextPresets);
    publishSimulatorStatus(nextPresets, initialPreset);
    setDeviceMessage(t("status.device.simConnected"));
    appendLog("simulator", `Connected simulator with ${nextPresets.length} slot(s).`);
  };

  const connectBleDevice = async () => {
    try {
      const client = bleClientRef.current ?? new DesktopBleClient();
      bleClientRef.current = client;
      await client.connect();
      const status = await client.readStatus().catch(() => ({
        connected: true,
        mode: "device" as const,
        deviceName: client.deviceName ?? "MEFX-S3",
        instrument: preset.instrument,
        activeSlot: 0,
        bypass: preset.bypass,
        supplyMv: 0
      }));
      setDeviceStatus({
        ...status,
        connected: true,
        mode: "device",
        deviceName: client.deviceName ?? "MEFX-S3"
      });
      await client.subscribeStatus((nextStatus) => {
        setDeviceStatus({
          ...nextStatus,
          connected: true,
          mode: "device",
          deviceName: client.deviceName ?? "MEFX-S3"
        });
      });
      await client.subscribeTelemetry((nextTelemetry) => setTelemetry(nextTelemetry));
      setDeviceMessage(t("status.device.connected", { name: client.deviceName ?? "MEFX-S3" }));
      appendLog("bluetooth", t("status.device.connected", { name: client.deviceName ?? "MEFX-S3" }));
    } catch (error) {
      const message = describeBleConnectError(error);
      setDeviceMessage(message);
      appendLog("bluetooth", message);
    }
  };

  const disconnectDevice = () => {
    bleClientRef.current?.disconnect();
    setDeviceStatus(idleDeviceStatus);
    setTelemetry(idleTelemetry);
    setDeviceMessage(t("status.device.disconnected"));
    appendLog("simulator", t("status.device.disconnected"));
  };

  const sendPresetToSimulator = async () => {
    if (!deviceStatus.connected) {
      setDeviceMessage(t("status.device.connectBeforeSend"));
      appendLog("simulator", "Send blocked because no device is connected.");
      return;
    }

    const errors = validatePreset(preset);
    if (errors.length > 0) {
      setDeviceMessage(t("status.device.fixBeforeSend"));
      appendLog("simulator", "Send blocked by preset validation.");
      return;
    }

    const nextPreset = { ...preset, deviceTone: deriveDeviceTone(preset), createdAt: new Date().toISOString() };
    if (deviceStatus.mode === "device") {
      try {
        await bleClientRef.current?.sendPreset(nextPreset);
        setPreset(nextPreset);
        setDevicePresets((current) => [nextPreset, ...current.filter((item) => item.name !== nextPreset.name)].slice(0, 16));
        setDeviceMessage(t("status.device.sentToDevice", { name: nextPreset.name }));
        appendLog("bluetooth", t("status.device.sentToDevice", { name: nextPreset.name }));
      } catch (error) {
        const message = error instanceof Error ? error.message : t("status.device.sendToDeviceFailed");
        setDeviceMessage(message);
        appendLog("bluetooth", `Preset send failed: ${message}`);
      }
      return;
    }

    const nextPresets = [nextPreset, ...devicePresets.filter((item) => item.name !== nextPreset.name)].slice(0, 16);
    setDevicePresets(nextPresets);
    publishSimulatorStatus(nextPresets, nextPreset);
    setPreset(nextPreset);
    setDeviceMessage(t("status.device.sentToSimulator", { name: nextPreset.name }));
    appendLog("simulator", t("status.device.sentToSimulator", { name: nextPreset.name }));
  };

  const loadDevicePreset = (slot: number) => {
    if (deviceStatus.mode === "device") {
      void bleClientRef.current?.readPreset(slot)
        .then((nextPreset) => {
          setPreset(nextPreset);
          setActivePage("manual");
          setDeviceMessage(t("status.device.loadedDeviceSlot", { slot, name: nextPreset.name }));
          appendLog("bluetooth", t("status.device.loadedDeviceSlot", { slot, name: nextPreset.name }));
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : t("status.device.loadDeviceSlotFailed", { slot });
          setDeviceMessage(message);
          appendLog("bluetooth", `Read failed: ${message}`);
        });
      return;
    }

    const nextPreset = devicePresets[slot];
    if (!nextPreset) {
      setDeviceMessage(t("status.device.simSlotEmpty", { slot }));
      appendLog("simulator", `Read failed because simulator slot ${slot} is empty.`);
      return;
    }

    setPreset(nextPreset);
    setActivePage("manual");
    setDeviceMessage(t("status.device.loadedSimSlot", { slot, name: nextPreset.name }));
    appendLog("simulator", t("status.device.loadedSimSlot", { slot, name: nextPreset.name }));
  };

  const deleteDevicePreset = (slot: number) => {
    if (deviceStatus.mode === "device") {
      void bleClientRef.current?.deletePreset(slot)
        .then(() => {
          setDeviceMessage(t("status.device.deletedDeviceSlot", { slot }));
          appendLog("bluetooth", t("status.device.deletedDeviceSlot", { slot }));
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : t("status.device.deleteDeviceSlotFailed", { slot });
          setDeviceMessage(message);
          appendLog("bluetooth", `Delete failed: ${message}`);
        });
      return;
    }

    const target = devicePresets[slot];
    const nextPresets = devicePresets.filter((_, index) => index !== slot);
    setDevicePresets(nextPresets);
    if (deviceStatus.mode === "simulator") publishSimulatorStatus(nextPresets);
    setDeviceMessage(
      target ? t("status.device.deletedSimSlot", { slot, name: target.name }) : t("status.device.simSlotWasEmpty", { slot })
    );
    appendLog("simulator", target ? t("status.device.deletedSimSlot", { slot, name: target.name }) : t("status.device.simSlotWasEmpty", { slot }));
  };

  const applyToneMatchResult = async (result: ToneMatchResult) => {
    const savedIr = await saveImpulseResponseFromPreset(result.preset);
    const nextPreset: Preset = savedIr
      ? {
          ...result.preset,
          ir: {
            enabled: true,
            source: "library",
            name: savedIr.name,
            mix: savedIr.mix,
            lengthMs: savedIr.lengthMs,
            sampleRate: savedIr.sampleRate,
            profile: savedIr.profile,
            filePath: savedIr.filePath,
            createdFromUrl: savedIr.createdFromUrl,
            notes: savedIr.notes
          },
          deviceTone: deriveDeviceTone({
            ...result.preset,
            ir: {
              enabled: true,
              source: "library",
              name: savedIr.name,
              mix: savedIr.mix,
              lengthMs: savedIr.lengthMs,
              sampleRate: savedIr.sampleRate,
              profile: savedIr.profile,
              filePath: savedIr.filePath,
              createdFromUrl: savedIr.createdFromUrl,
              notes: savedIr.notes
            }
          })
        }
      : { ...result.preset, deviceTone: deriveDeviceTone(result.preset) };

    setPreset(nextPreset);
    setAudioFxIrBypass(false);
    setAudioFxBypass(false);
    setActivePage("audio-fx");
    setStorageMessage(
      savedIr
        ? t("status.storage.savedIr", { name: savedIr.name })
        : t("tone.appliedWithIr")
    );
    appendLog(
      "analyzer",
      savedIr
        ? `Applied Tone Match result "${result.preset.name}", saved WAV IR "${savedIr.name}", and opened Audio FX.`
        : `Applied Tone Match result "${result.preset.name}" and opened Audio FX.`
    );
  };

  const refreshAnalyzerHealth = async () => {
    const [health, dependencies] = await Promise.all([
      desktopApi.analyzer.health(),
      desktopApi.analyzer.dependencies()
    ]);
    setAnalyzerHealth(health);
    setAnalyzerDependencies(dependencies);
    appendLog(
      "analyzer",
      health.ok
        ? `Analyzer health check passed. Dependencies: ${dependencies.filter((dependency) => dependency.ok).length}/${dependencies.length}.`
        : `Analyzer offline: ${health.lastError ?? "unknown"}. Dependencies: ${dependencies.filter((dependency) => dependency.ok).length}/${dependencies.length}.`
    );
  };

  const startAnalyzerServer = async () => {
    const health = await desktopApi.analyzer.start();
    setAnalyzerHealth(health);
    appendLog("analyzer", health.ok ? "Analyzer server started." : `Analyzer start failed: ${health.lastError ?? "unknown"}`);
    return health;
  };

  const stopAnalyzerServer = async () => {
    const result = await desktopApi.analyzer.stop();
    setAnalyzerHealth({ ok: false, running: result.running, lastError: result.lastError || "Analyzer stopped." });
    appendLog("analyzer", "Analyzer server stopped.");
  };

  const analyzeWithServer = async (url: string, instrument: "guitar" | "bass", requestId: string) => {
    const result = await desktopApi.analyzer.analyze({ url, instrument, requestId });
    appendLog("analyzer", `Analyzer returned "${result.preset.name}".`);
    return result;
  };

  const refreshBleStatus = async () => {
    const status = await desktopApi.ble.status();
    setBleStatus(status);
    appendLog("bluetooth", `BLE bridge status: ${status.strategy}. ${status.lastError ?? ""}`.trim());
  };

  const scanBleDevices = async () => {
    const result = await desktopApi.ble.scan();
    setBleCandidates(result.devices);
    setBleStatus(result.status);
    appendLog("bluetooth", `BLE scan returned ${result.devices.length} candidate(s). ${result.status.lastError ?? ""}`.trim());
  };

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand-block">
          <p className="eyebrow">MEFX-S3</p>
          <h1>Desktop</h1>
        </div>

        <nav className="nav-list">
          {pages.map((page) => (
            <button
              key={page.id}
              className={activePage === page.id ? "nav-item active" : "nav-item"}
              type="button"
              onClick={() => setActivePage(page.id)}
            >
              <span>{t(page.labelKey)}</span>
              <small>{t(page.descriptionKey)}</small>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className={validationErrors.length === 0 ? "status-dot" : "status-dot warn"} />
          <div>
            <strong>{t("app.phase")}</strong>
            <span>{deviceStatus.mode === "simulator" ? t("dashboard.simConnected") : t("common.savedPresetCount", { count: savedPresets.length })}</span>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("top.current")}</p>
            <h2>{t(currentPage.labelKey)}</h2>
          </div>
          <div className="system-pills" aria-label="System status placeholders">
            <span>{t("top.preset")}: {preset.name || t("dashboard.untitledPreset")}</span>
            <span>{t("top.saved")}: {savedPresets.length}</span>
            <span>{t("top.device")}: {t(`dashboard.mode.${deviceStatus.mode}`)}</span>
            <span>{t("top.audio")}: {audioFxEnabled ? t("audio.monitorOn") : t("audio.monitorOff")}</span>
            <span>{t("top.analyzer")}: {topbarAnalyzerLabel}</span>
          </div>
        </header>

        <div className="page-frame">
          {renderPage({
            activePage,
            preset,
            setPreset,
            savedPresets,
            impulseResponses,
            impulseResponseFileStatuses,
            saveCurrentPreset,
            loadPreset,
            deletePreset,
            renamePreset,
            storageMessage,
            deviceStatus,
            telemetry,
            devicePresets,
            deviceMessage,
            connectBleDevice,
            connectSimulator,
            disconnectDevice,
            sendPresetToSimulator,
            loadDevicePreset,
            deleteDevicePreset,
            saveCurrentIr,
            loadIr,
            deleteIr,
            renameIr,
            checkIrFiles,
            diagnostics,
            logs,
            language,
            onLanguageChange: setLanguage,
            t,
            audioFxEnabled,
            audioFxBypass,
            audioFxIrBypass,
            audioFxInputDevice,
            audioFxOutputDevice,
            audioFxLatencyMode,
            setAudioFxEnabled,
            setAudioFxBypass,
            setAudioFxIrBypass,
            setAudioFxInputDevice,
            setAudioFxOutputDevice,
            setAudioFxLatencyMode,
            applyToneMatchResult,
            analyzerHealth,
            refreshAnalyzerHealth,
            startAnalyzerServer,
            stopAnalyzerServer,
            analyzeWithServer,
            bleStatus,
            bleCandidates,
            scanBleDevices
          })}
        </div>
      </section>
    </main>
  );
}
