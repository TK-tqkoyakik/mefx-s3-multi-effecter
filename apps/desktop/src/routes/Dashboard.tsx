import type { BleBridgeStatus, BleDeviceCandidate } from "../lib/desktopApi";
import type { AudioTelemetry, DeviceStatus, Preset } from "../lib/types";
import { MeterPlaceholder } from "../ui/MeterPlaceholder";

type Props = {
  preset: Preset;
  deviceStatus: DeviceStatus;
  telemetry: AudioTelemetry;
  deviceMessage: string;
  onConnectBle: () => void;
  onConnectSimulator: () => void;
  onDisconnect: () => void;
  onSendPreset: () => void;
  bleStatus: BleBridgeStatus | null;
  bleCandidates: BleDeviceCandidate[];
  onScanBle: () => void;
  t: (key: string) => string;
};

export function Dashboard({
  preset,
  deviceStatus,
  telemetry,
  deviceMessage,
  onConnectBle,
  onConnectSimulator,
  onDisconnect,
  onSendPreset,
  bleStatus,
  bleCandidates,
  onScanBle,
  t
}: Props) {
  const simulatorConnected = deviceStatus.mode === "simulator";
  const deviceConnected = deviceStatus.mode === "device";
  const sourceLabel = t(`common.source.${preset.source}`);
  const modeLabel = t(`dashboard.mode.${deviceStatus.mode}`);

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("dashboard.overview")}</p>
          <h3>{t("dashboard.title")}</h3>
        </div>
        <span className={deviceStatus.connected ? "badge good" : "badge"}>
          {simulatorConnected ? t("dashboard.simConnected") : deviceConnected ? t("dashboard.deviceConnected") : t("dashboard.notConnected")}
        </span>
      </div>

      <div className="dashboard-grid">
        <article className="panel">
          <h4>{t("dashboard.currentPreset")}</h4>
          <p className="large-value">{preset.name || t("dashboard.untitledPreset")}</p>
          <p className="muted">
            {preset.instrument === "guitar" ? t("common.guitar") : t("common.bass")} / {preset.bypass ? t("dashboard.bypassOn") : t("dashboard.bypassOff")} /
            {t("common.source")}: {sourceLabel}
          </p>
        </article>

        <article className="panel">
          <h4>{t("dashboard.deviceState")}</h4>
          <div className="meta-grid">
            <span>{t("dashboard.mode")}</span>
            <strong>{modeLabel}</strong>
            <span>{t("dashboard.deviceName")}</span>
            <strong>{deviceStatus.deviceName ?? t("dashboard.noDevice")}</strong>
            <span>{t("dashboard.slot")}</span>
            <strong>{deviceStatus.activeSlot}</strong>
            <span>{t("dashboard.power")}</span>
            <strong>{deviceStatus.supplyMv ? `${deviceStatus.supplyMv} mV` : "N/A"}</strong>
          </div>
        </article>

        <article className="panel action-panel">
          <h4>{t("dashboard.quickActions")}</h4>
          <div className="button-row">
            <button type="button" onClick={onConnectBle} disabled={deviceConnected}>
              {t("dashboard.connectEsp32")}
            </button>
            <button type="button" onClick={onScanBle}>
              {t("dashboard.scanBle")}
            </button>
            <button type="button" onClick={onConnectSimulator} disabled={simulatorConnected}>
              {t("dashboard.simulator")}
            </button>
            <button type="button" onClick={onDisconnect} disabled={!deviceStatus.connected}>
              {t("dashboard.disconnect")}
            </button>
            <button type="button" onClick={onSendPreset} disabled={!deviceStatus.connected}>
              {t("dashboard.sendPreset")}
            </button>
          </div>
          <p className="muted">{deviceMessage}</p>
        </article>
      </div>

      <article className="panel">
        <div className="section-heading compact">
          <div>
            <h4>{t("dashboard.bleBridge")}</h4>
            <p className="muted">
              {bleStatus
                ? `${bleStatus.strategy}: ${bleStatus.lastError || t("dashboard.bleDiagnostics")}`
                : t("dashboard.bleUnchecked")}
            </p>
          </div>
          <span className={bleCandidates.length > 0 ? "badge good" : "badge warn"}>{bleCandidates.length} {t("dashboard.candidates")}</span>
        </div>
        {bleCandidates.length > 0 ? (
          <div className="preset-list">
            {bleCandidates.slice(0, 5).map((candidate) => (
              <article className="preset-item" key={candidate.id || candidate.name}>
                <div className="preset-main">
                  <strong>{candidate.name}</strong>
                  <span>
                    {candidate.status ?? t("dashboard.unknown")} / {candidate.id || t("dashboard.noId")}
                  </span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">{t("dashboard.bleEmpty")}</p>
        )}
      </article>

      <div className="meter-grid" aria-label="Audio meter placeholders">
        <MeterPlaceholder label={t("dashboard.input")} value={Math.round(telemetry.inputLevel * 100)} clip={telemetry.clip} />
        <MeterPlaceholder label={t("dashboard.preOutput")} value={Math.round(telemetry.preOutputLevel * 100)} />
        <MeterPlaceholder label={t("dashboard.mic")} value={Math.round(telemetry.micLevel * 100)} />
      </div>
    </section>
  );
}
