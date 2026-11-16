import { describeIrStatus } from "../lib/irStatus";
import type { ImpulseResponseFileStatus } from "../lib/desktopApi";
import type { DevicePresetSummary, Preset, StoredImpulseResponse } from "../lib/types";

type Props = {
  currentPreset: Preset;
  presets: Preset[];
  devicePresets: Preset[];
  deviceSummaries: DevicePresetSummary[];
  impulseResponses: StoredImpulseResponse[];
  impulseResponseFileStatuses: ImpulseResponseFileStatus[];
  onLoadPreset: (preset: Preset) => void;
  onDeletePreset: (preset: Preset) => void;
  onRenamePreset: (preset: Preset, name: string) => void;
  onLoadDevicePreset: (slot: number) => void;
  onDeleteDevicePreset: (slot: number) => void;
  onSaveCurrentIr: () => void;
  onLoadIr: (response: StoredImpulseResponse) => void;
  onDeleteIr: (response: StoredImpulseResponse) => void;
  onRenameIr: (response: StoredImpulseResponse, name: string) => void;
  onCheckIrFiles: () => void;
  t: (key: string) => string;
};

export function Library({
  currentPreset,
  presets,
  devicePresets,
  deviceSummaries,
  impulseResponses,
  impulseResponseFileStatuses,
  onLoadPreset,
  onDeletePreset,
  onRenamePreset,
  onLoadDevicePreset,
  onDeleteDevicePreset,
  onSaveCurrentIr,
  onLoadIr,
  onDeleteIr,
  onRenameIr,
  onCheckIrFiles,
  t
}: Props) {
  const renamePreset = (preset: Preset) => {
    const nextName = window.prompt(t("library.newName"), preset.name);
    if (nextName !== null) onRenamePreset(preset, nextName);
  };

  const renameIr = (response: StoredImpulseResponse) => {
    const nextName = window.prompt(t("library.newIrName"), response.name);
    if (nextName !== null) onRenameIr(response, nextName);
  };

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h3>{t("library.title")}</h3>
        </div>
        <span className="badge">
          {presets.length} {t("library.app")} / {devicePresets.length} {t("library.simulator")} / {impulseResponses.length} IR
        </span>
      </div>

      <div className="library-grid">
        <article className="panel">
          <h4>{t("library.appPresets")}</h4>
          {presets.length === 0 ? (
            <p className="empty-state">{t("library.emptyApp")}</p>
          ) : (
            <div className="preset-list">
              {presets.map((preset) => {
                const active = preset.name === currentPreset.name && preset.createdAt === currentPreset.createdAt;
                return (
                  <article className={active ? "preset-item active" : "preset-item"} key={`${preset.name}-${preset.createdAt}`}>
                    <button type="button" className="preset-main" onClick={() => onLoadPreset(preset)}>
                      <strong>{preset.name}</strong>
                      <span>
                        {preset.instrument === "guitar" ? t("common.guitar") : t("common.bass")} / {t(`common.source.${preset.source}`)} /{" "}
                        {new Date(preset.createdAt).toLocaleString()}
                      </span>
                    </button>
                    <div className="preset-actions">
                      <button type="button" onClick={() => onLoadPreset(preset)}>
                        {t("common.load")}
                      </button>
                      <button type="button" onClick={() => renamePreset(preset)}>
                        {t("common.rename")}
                      </button>
                      <button type="button" onClick={() => onDeletePreset(preset)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="section-heading compact">
            <div>
              <h4>{t("library.irLibrary")}</h4>
              <p className="muted">{t("library.irHelp")}</p>
            </div>
            <button type="button" onClick={onSaveCurrentIr} disabled={!currentPreset.ir?.enabled}>
              {t("library.saveCurrentIr")}
            </button>
            <button type="button" onClick={onCheckIrFiles} disabled={impulseResponses.length === 0}>
              {t("library.checkIrFiles")}
            </button>
          </div>
          {impulseResponses.length === 0 ? (
            <p className="empty-state">{t("library.emptyIr")}</p>
          ) : (
            <div className="preset-list">
              {impulseResponses.map((response) => {
                const irStatus = describeIrStatus(response, t);
                const fileStatus = impulseResponseFileStatuses.find((item) => item.id === response.id);
                return (
                  <article className="preset-item" key={response.id}>
                    <button type="button" className="preset-main" onClick={() => onLoadIr(response)}>
                      <strong>{response.name}</strong>
                      <span>
                        {response.instrument === "guitar" ? t("common.guitar") : t("common.bass")} / {t(`common.source.${response.source}`)} / {response.mix}% /{" "}
                        {response.lengthMs} ms
                      </span>
                      <span>
                        {t("ir.status")}: {irStatus.label} / {irStatus.canLoadInAudioFx ? t("ir.audioFxReady") : t("ir.audioFxPending")}
                      </span>
                      <span>{response.createdFromUrl ? `${t("ir.sourceUrl")}: ${response.createdFromUrl}` : t("ir.sourceUrlNone")}</span>
                      <span>{response.filePath ? `${t("library.irFile")}: ${response.filePath}` : t("library.irNoFile")}</span>
                      <span>
                        {t("library.irFileCheck")}:{" "}
                        {fileStatus
                          ? fileStatus.readable
                            ? `${t("library.irFileOk")} / ${Math.round(fileStatus.sizeBytes / 1024)} KB`
                            : `${t("library.irFileBroken")} / ${fileStatus.lastError ?? ""}`
                          : t("library.irFileUnchecked")}
                      </span>
                    </button>
                    <div className="preset-actions">
                      <button type="button" onClick={() => onLoadIr(response)}>
                        {t("common.load")}
                      </button>
                      <button type="button" onClick={() => renameIr(response)}>
                        {t("common.rename")}
                      </button>
                      <button type="button" onClick={() => onDeleteIr(response)}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </article>

        <article className="panel">
          <h4>{t("library.simPresets")}</h4>
          {deviceSummaries.length === 0 ? (
            <p className="empty-state">{t("library.emptySim")}</p>
          ) : (
            <div className="preset-list">
              {deviceSummaries.map((summary) => (
                <article className="preset-item" key={`${summary.slot}-${summary.name}`}>
                  <button type="button" className="preset-main" onClick={() => onLoadDevicePreset(summary.slot)}>
                    <strong>
                      {t("library.slot")} {summary.slot}: {summary.name}
                    </strong>
                    <span>
                      {summary.instrument === "guitar" ? t("common.guitar") : t("common.bass")} / {t(`common.source.${summary.source}`)}
                    </span>
                  </button>
                  <div className="preset-actions">
                    <button type="button" onClick={() => onLoadDevicePreset(summary.slot)}>
                      {t("library.read")}
                    </button>
                    <button type="button" onClick={() => onDeleteDevicePreset(summary.slot)}>
                      {t("common.delete")}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
