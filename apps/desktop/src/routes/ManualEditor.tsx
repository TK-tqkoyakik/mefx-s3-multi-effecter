import { clampEffect, deriveDeviceTone, effectKeys, effectLabels, makePreset, validatePreset } from "../lib/presets";
import type { EffectKey, Instrument, Preset } from "../lib/types";

type Props = {
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  onSavePreset: () => void;
  storageMessage: string;
  t: (key: string) => string;
};

export function ManualEditor({ preset, onPresetChange, onSavePreset, storageMessage, t }: Props) {
  const validationErrors = validatePreset(preset);
  const deviceTone = deriveDeviceTone(preset);

  const updatePreset = (next: Partial<Preset>) => {
    onPresetChange({ ...preset, ...next });
  };

  const updateEffect = (key: EffectKey, value: number) => {
    onPresetChange({
      ...preset,
      effects: {
        ...preset.effects,
        [key]: clampEffect(value)
      }
    });
  };

  const updateIrMix = (value: number) => {
    onPresetChange({
      ...preset,
      ir: {
        enabled: preset.ir?.enabled ?? false,
        source: preset.ir?.source ?? "none",
        name: preset.ir?.name ?? "No IR",
        lengthMs: preset.ir?.lengthMs ?? 0,
        sampleRate: preset.ir?.sampleRate ?? 44100,
        ...preset.ir,
        mix: clampEffect(value)
      }
    });
  };

  const updateIrEnabled = (enabled: boolean) => {
    const currentIr = preset.ir;
    onPresetChange({
      ...preset,
      ir: {
        ...currentIr,
        enabled,
        source: enabled ? "generated" : (currentIr?.source ?? "none"),
        name: enabled ? (currentIr?.name && currentIr.name !== "No IR" ? currentIr.name : t("manual.irTestName")) : (currentIr?.name ?? "No IR"),
        lengthMs: enabled ? (currentIr?.lengthMs || 120) : (currentIr?.lengthMs ?? 0),
        sampleRate: currentIr?.sampleRate ?? 44100,
        mix: enabled ? (currentIr?.mix || 45) : (currentIr?.mix ?? 0)
      }
    });
  };

  const resetPreset = () => {
    onPresetChange(makePreset({ name: preset.name || "New Preset", instrument: preset.instrument }));
  };

  return (
    <section className="page-content">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{t("manual.eyebrow")}</p>
          <h3>{t("manual.title")}</h3>
        </div>
        <span className={validationErrors.length === 0 ? "badge good" : "badge warn"}>
          {validationErrors.length === 0 ? t("manual.valid") : `${validationErrors.length} ${t("manual.issues")}`}
        </span>
      </div>

      <div className="editor-layout">
        <article className="panel editor-meta">
          <label className="field">
            <span>{t("manual.presetName")}</span>
            <input
              value={preset.name}
              maxLength={48}
              onChange={(event) => updatePreset({ name: event.target.value })}
              aria-invalid={!preset.name.trim() || preset.name.length > 40}
            />
          </label>

          <label className="field">
            <span>{t("manual.instrument")}</span>
            <select
              value={preset.instrument}
              onChange={(event) => updatePreset({ instrument: event.target.value as Instrument })}
            >
              <option value="guitar">{t("common.guitar")}</option>
              <option value="bass">{t("common.bass")}</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preset.bypass}
              onChange={(event) => updatePreset({ bypass: event.target.checked })}
            />
            {t("manual.bypass")}
          </label>

          <div className="meta-grid">
            <span>{t("common.source")}</span>
            <strong>{preset.source}</strong>
            <span>{t("common.created")}</span>
            <strong>{new Date(preset.createdAt).toLocaleString()}</strong>
          </div>

          <div className="button-row">
            <button type="button" onClick={() => onPresetChange(makePreset({ name: "New Preset" }))}>
              {t("manual.newPreset")}
            </button>
            <button type="button" onClick={resetPreset}>
              {t("manual.reset")}
            </button>
            <button type="button" onClick={onSavePreset} disabled={validationErrors.length > 0}>
              {t("manual.save")}
            </button>
          </div>
        </article>

        <article className="panel">
          <h4>{t("manual.effects")}</h4>
          <div className="slider-list">
            {effectKeys.map((key) => (
              <label className="effect-row" key={key}>
                <span>{effectLabels[key]}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={preset.effects[key]}
                  onChange={(event) => updateEffect(key, Number(event.target.value))}
                />
                <output>{preset.effects[key]}</output>
              </label>
            ))}
          </div>
        </article>

        <article className="panel">
          <h4>{t("manual.ir")}</h4>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preset.ir?.enabled ?? false}
              onChange={(event) => updateIrEnabled(event.target.checked)}
            />
            {t("manual.irEnable")}
          </label>
          <div className="meta-grid">
            <span>{t("common.name")}</span>
            <strong>{preset.ir?.name ?? t("manual.irNone")}</strong>
            <span>{t("manual.irSource")}</span>
            <strong>{preset.ir?.source ?? "none"}</strong>
            <span>{t("manual.irLength")}</span>
            <strong>{preset.ir?.lengthMs ? `${preset.ir.lengthMs} ms` : "N/A"}</strong>
          </div>
          <label className="effect-row ir-mix-row">
            <span>{t("manual.irMix")}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={preset.ir?.mix ?? 0}
              onChange={(event) => updateIrMix(Number(event.target.value))}
            />
            <output>{preset.ir?.mix ?? 0}</output>
          </label>
        </article>

        <article className="panel">
          <h4>{t("manual.deviceTone")}</h4>
          <div className="effect-summary">
            {Object.entries(deviceTone).map(([key, value]) => (
              <span key={key}>
                {key}: <strong>{value}</strong>
              </span>
            ))}
          </div>
          <p className="muted">{t("manual.deviceToneHelp")}</p>
        </article>
      </div>

      <article className={validationErrors.length === 0 ? "panel validation-panel ok" : "panel validation-panel"}>
        <h4>{t("manual.validation")}</h4>
        {validationErrors.length === 0 ? (
          <p className="muted">{storageMessage}</p>
        ) : (
          <ul>
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
