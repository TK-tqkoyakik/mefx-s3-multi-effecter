import type { EffectKey } from "../types";
import { clampEffect } from "../lib/presets";

type Props = {
  effectKey: EffectKey;
  label: string;
  value: number;
  onChange: (key: EffectKey, value: number) => void;
};

export function EffectSlider({ effectKey, label, value, onChange }: Props) {
  return (
    <label className="effect-slider">
      <span>
        <strong>{label}</strong>
        <output>{value}</output>
      </span>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => onChange(effectKey, clampEffect(Number(event.target.value)))}
      />
    </label>
  );
}
