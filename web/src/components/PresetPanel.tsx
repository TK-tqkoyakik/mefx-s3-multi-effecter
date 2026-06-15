import type { EffectKey, Preset } from "../types";
import { EffectSlider } from "./EffectSlider";
import { effectLabels } from "../lib/presets";
import type { Messages } from "../i18n";

type Props = {
  preset: Preset;
  onPresetChange: (preset: Preset) => void;
  text: Messages;
};

export function PresetPanel({ preset, onPresetChange, text }: Props) {
  const updateEffect = (key: EffectKey, value: number) => {
    onPresetChange({
      ...preset,
      effects: { ...preset.effects, [key]: value }
    });
  };

  return (
    <section className="panel">
      <div className="row">
        <label className="field">
          <span>{text.name}</span>
          <input
            value={preset.name}
            maxLength={40}
            onChange={(event) => onPresetChange({ ...preset, name: event.target.value })}
          />
        </label>
        <label className="field">
          <span>{text.instrument}</span>
          <select
            value={preset.instrument}
            onChange={(event) =>
              onPresetChange({ ...preset, instrument: event.target.value as Preset["instrument"] })
            }
          >
            <option value="guitar">{text.instruments.guitar}</option>
            <option value="bass">{text.instruments.bass}</option>
          </select>
        </label>
      </div>

      <div className="toggle-row">
        <label>
          <input
            type="checkbox"
            checked={preset.bypass}
            onChange={(event) => onPresetChange({ ...preset, bypass: event.target.checked })}
          />
          {text.bypass}
        </label>
        <span className="chip">{text.sources[preset.source]}</span>
      </div>

      <div className="sliders">
        {(Object.keys(effectLabels) as EffectKey[]).map((key) => (
          <EffectSlider
            key={key}
            effectKey={key}
            label={text.effects[key]}
            value={preset.effects[key]}
            onChange={updateEffect}
          />
        ))}
      </div>
    </section>
  );
}
