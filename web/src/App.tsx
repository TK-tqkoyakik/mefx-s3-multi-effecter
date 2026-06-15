import { useEffect, useMemo, useState } from "react";
import { Bluetooth, Cable, Music2, Save, Trash2, Unplug, Wand2 } from "lucide-react";
import { type DevicePresetSummary, MefxBleClient } from "./lib/ble";
import { loadLocalPresets, makePreset, saveLocalPresets, validatePreset } from "./lib/presets";
import { PresetPanel } from "./components/PresetPanel";
import { getInitialLanguage, languageOptions, languageStorageKey, messages, type Language } from "./i18n";
import type { AudioTelemetry, DeviceStatus, Instrument, Preset } from "./types";
import "./styles.css";

type Page = "manual" | "youtube";

const analysisEndpoint = "http://localhost:8787/analyze";

export default function App() {
  const [language, setLanguage] = useState<Language>(() => getInitialLanguage());
  const text = messages[language];
  const [page, setPage] = useState<Page>("manual");
  const [preset, setPreset] = useState<Preset>(() => makePreset({ name: "Stage Clean" }));
  const [presets, setPresets] = useState<Preset[]>(() => loadLocalPresets());
  const [ble] = useState(() => new MefxBleClient());
  const [connected, setConnected] = useState(false);
  const [connectionInfo, setConnectionInfo] = useState(() => ble.info);
  const [message, setMessage] = useState(() => messages[getInitialLanguage()].ready);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [devicePresets, setDevicePresets] = useState<DevicePresetSummary[]>([]);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [targetInstrument, setTargetInstrument] = useState<Instrument>("guitar");
  const [telemetry, setTelemetry] = useState<AudioTelemetry | null>(null);
  const validation = useMemo(() => validatePreset(preset), [preset]);

  const refreshConnectionInfo = () => {
    setConnected(ble.connected);
    setConnectionInfo(ble.info);
  };

  useEffect(() => {
    ble.onDisconnect(() => {
      setConnected(false);
      setConnectionInfo(ble.info);
      setDeviceStatus(null);
      setTelemetry(null);
      setMessage(messages[getInitialLanguage()].disconnectedMessage);
    });
  }, [ble]);

  const changeLanguage = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    localStorage.setItem(languageStorageKey, nextLanguage);
    setMessage(messages[nextLanguage].ready);
  };

  const persistPresets = (next: Preset[]) => {
    setPresets(next);
    saveLocalPresets(next);
  };

  const connect = async () => {
    try {
      setMessage(text.connectingMessage);
      await ble.connect();
      refreshConnectionInfo();
      await ble.subscribeStatus(setDeviceStatus);
      await ble.subscribeTelemetry(setTelemetry);
      setDevicePresets(await ble.listDevicePresets());
      refreshConnectionInfo();
      setMessage(text.connectedMessage(ble.info.deviceName));
    } catch (error) {
      refreshConnectionInfo();
      setMessage(error instanceof Error ? error.message : text.bleConnectionFailed);
    }
  };

  const connectSimulator = async () => {
    try {
      ble.enableSimulation();
      await ble.connect();
      refreshConnectionInfo();
      await ble.subscribeStatus(setDeviceStatus);
      await ble.subscribeTelemetry(setTelemetry);
      setDevicePresets(await ble.listDevicePresets());
      refreshConnectionInfo();
      setMessage(text.simulatorConnected);
    } catch (error) {
      refreshConnectionInfo();
      setMessage(error instanceof Error ? error.message : text.simulatorConnectionFailed);
    }
  };

  const disconnect = () => {
    ble.disconnect();
    refreshConnectionInfo();
    setDeviceStatus(null);
    setTelemetry(null);
    setMessage(text.disconnectedMessage);
  };

  const sendPreset = async () => {
    try {
      const errors = validatePreset(preset);
      if (errors.length) throw new Error(errors.join(", "));
      await ble.sendPreset({ ...preset, createdAt: new Date().toISOString() });
      setDevicePresets(await ble.listDevicePresets());
      refreshConnectionInfo();
      setMessage(text.sentMessage(preset.name));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.presetSendFailed);
    }
  };

  const savePreset = () => {
    const nextPreset = { ...preset, createdAt: new Date().toISOString() };
    persistPresets([nextPreset, ...presets.filter((item) => item.name !== nextPreset.name)]);
    setMessage(text.localSaveMessage(nextPreset.name));
  };

  const deletePreset = (name: string) => {
    persistPresets(presets.filter((item) => item.name !== name));
    setMessage(text.localDeleteMessage(name));
  };

  const refreshDevicePresets = async () => {
    try {
      setDevicePresets(await ble.listDevicePresets());
      setMessage(text.loadedDevicePresets);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.couldNotLoadDevicePresets);
    }
  };

  const loadDevicePreset = async (slot: number) => {
    try {
      const devicePreset = await ble.readDevicePreset(slot);
      setPreset(devicePreset);
      setMessage(text.loadedDevicePreset(slot));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.couldNotReadDevicePreset);
    }
  };

  const deleteDevicePreset = async (slot: number) => {
    try {
      await ble.deleteDevicePreset(slot);
      setDevicePresets(await ble.listDevicePresets());
      refreshConnectionInfo();
      setMessage(text.deletedDeviceSlot(slot));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.couldNotDeleteDevicePreset);
    }
  };

  const analyzeYoutube = async () => {
    try {
      setMessage(text.analyzingTone);
      const response = await fetch(analysisEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl, instrument: targetInstrument })
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { preset: Preset; notes: string[] };
      setPreset(result.preset);
      setPage("manual");
      setMessage(result.notes.join(" "));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text.analysisFailed);
    }
  };

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">MEFX-S3</p>
          <h1>{text.appTitle}</h1>
        </div>
        <div className="topbar-actions">
          <label className="language-select">
            <span>{text.language}</span>
            <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <nav className="tabs" aria-label="Pages">
        <button className={page === "manual" ? "active" : ""} onClick={() => setPage("manual")}>
          <Music2 size={18} />
          {text.manualEditor}
        </button>
        <button className={page === "youtube" ? "active" : ""} onClick={() => setPage("youtube")}>
          <Wand2 size={18} />
          {text.youtubeToneMatch}
        </button>
      </nav>

      <section className="panel bluetooth-panel">
        <div className="connection-heading">
          <div>
            <h2>{text.bluetoothPanelTitle}</h2>
            <p>{text.bluetoothPanelBody}</p>
          </div>
          <span className={connected ? "badge good" : "badge"}>
            {connectionInfo.mode === "device"
              ? text.realDeviceMode
              : connectionInfo.mode === "simulator"
                ? text.simulatorMode
                : text.idleMode}
          </span>
        </div>

        <div className="connection-grid">
          <div className="connection-status">
            <span className={connectionInfo.supportsWebBluetooth ? "badge good" : "badge warn"}>
              {connectionInfo.supportsWebBluetooth ? text.pcBluetoothReady : text.pcBluetoothUnsupported}
            </span>
            {!connectionInfo.secureContext && <span className="badge warn">{text.pcBluetoothInsecure}</span>}
            <span className={connectionInfo.serviceReady ? "badge good" : "badge"}>
              {connectionInfo.serviceReady ? text.serviceReady : text.serviceNotReady}
            </span>
            <span className="badge">
              {text.selectedDevice}: {connectionInfo.deviceName || text.noSelectedDevice}
            </span>
          </div>

          <div className="connection-actions">
            <button
              className={connected && connectionInfo.mode === "device" ? "connected" : "primary"}
              onClick={connect}
              disabled={connected || !connectionInfo.supportsWebBluetooth || !connectionInfo.secureContext}
            >
              <Bluetooth size={18} />
              {connected && connectionInfo.mode === "device" ? text.connected : text.connect}
            </button>
            <button onClick={connectSimulator} disabled={connected}>
              <Cable size={18} />
              {text.simulator}
            </button>
            <button onClick={disconnect} disabled={!connected}>
              <Unplug size={18} />
              {text.disconnect}
            </button>
          </div>
        </div>

        <details className="connection-help">
          <summary>{text.connectionChecklistTitle}</summary>
          <ol>
            {text.connectionChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </details>
      </section>

      {page === "manual" ? (
        <>
          <PresetPanel preset={preset} onPresetChange={setPreset} text={text} />
          <section className="actions">
            <button onClick={savePreset}>
              <Save size={18} />
              {text.save}
            </button>
            <button className="primary" onClick={sendPreset} disabled={validation.length > 0}>
              {text.sendToDevice}
            </button>
          </section>
        </>
      ) : (
        <section className="panel">
          <label className="field">
            <span>{text.youtubeUrl}</span>
            <input
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(event) => setYoutubeUrl(event.target.value)}
            />
          </label>
          <label className="field">
            <span>{text.targetPart}</span>
            <select value={targetInstrument} onChange={(event) => setTargetInstrument(event.target.value as Instrument)}>
              <option value="guitar">{text.instruments.guitar}</option>
              <option value="bass">{text.instruments.bass}</option>
            </select>
          </label>
          <button className="primary" onClick={analyzeYoutube} disabled={!youtubeUrl.trim()}>
            {text.analyzeAndCreate}
          </button>
        </section>
      )}

      <section className="status">
        <strong>{text.status}</strong>
        <span>{message}</span>
        {deviceStatus && (
          <span>{text.deviceLine(deviceStatus.instrument, deviceStatus.activeSlot, deviceStatus.bypass)}</span>
        )}
        {telemetry && (
          <span>
            {text.telemetryLine(
              (telemetry.inputLevel * 100).toFixed(0),
              (telemetry.preOutputLevel * 100).toFixed(0),
              (telemetry.micLevel * 100).toFixed(0)
            )}
          </span>
        )}
      </section>

      <section className="preset-list">
        <div className="list-heading">
          <h2>{text.devicePresets}</h2>
          <button onClick={refreshDevicePresets} disabled={!connected}>
            {text.refresh}
          </button>
        </div>
        {devicePresets.length === 0 ? (
          <p className="empty">{text.noDevicePresets}</p>
        ) : (
          devicePresets.map((item) => (
            <article key={item.slot} className="preset-item">
              <button onClick={() => loadDevicePreset(item.slot)}>
                <strong>{text.slotLabel(item.slot, item.name)}</strong>
                <span>{text.instruments[item.instrument]} / {text.sources[item.source]}</span>
              </button>
              <button aria-label={text.loadDeviceSlotLabel(item.slot)} onClick={() => loadDevicePreset(item.slot)}>
                {text.load}
              </button>
              <button aria-label={text.deleteDeviceSlotLabel(item.slot)} onClick={() => deleteDevicePreset(item.slot)}>
                <Trash2 size={18} />
              </button>
            </article>
          ))
        )}
      </section>

      <section className="preset-list">
        <h2>{text.localPresets}</h2>
        {presets.length === 0 ? (
          <p className="empty">{text.noSavedPresets}</p>
        ) : (
          presets.map((item) => (
            <article key={`${item.name}-${item.createdAt}`} className="preset-item">
              <button onClick={() => setPreset(item)}>
                <strong>{item.name}</strong>
                <span>{text.instruments[item.instrument]} / {text.sources[item.source]}</span>
              </button>
              <button aria-label={text.deleteLocalPresetLabel(item.name)} onClick={() => deletePreset(item.name)}>
                <Trash2 size={18} />
              </button>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
