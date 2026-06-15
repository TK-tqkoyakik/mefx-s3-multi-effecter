import type { EffectKey, Effects, Instrument, Preset, PresetSource } from "../types";

export const effectLabels: Record<EffectKey, string> = {
  gain: "Gain",
  tone_eq: "Tone / EQ",
  compressor: "Compressor",
  drive: "Drive",
  modulation: "Modulation",
  delay_reverb: "Delay / Reverb"
};

export const defaultEffects: Effects = {
  gain: 45,
  tone_eq: 50,
  compressor: 25,
  drive: 20,
  modulation: 0,
  delay_reverb: 10
};

export function clampEffect(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function makePreset(
  overrides: Partial<Preset> & { name?: string; instrument?: Instrument; source?: PresetSource } = {}
): Preset {
  return {
    instrument: overrides.instrument ?? "guitar",
    name: overrides.name?.trim() || "New Preset",
    effects: { ...defaultEffects, ...overrides.effects },
    bypass: overrides.bypass ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    source: overrides.source ?? "manual"
  };
}

export function validatePreset(preset: Preset): string[] {
  const errors: string[] = [];
  if (!["guitar", "bass"].includes(preset.instrument)) errors.push("Invalid instrument");
  if (!preset.name || preset.name.length > 40) errors.push("Preset name must be 1-40 chars");
  for (const key of Object.keys(effectLabels) as EffectKey[]) {
    const value = preset.effects[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      errors.push(`${key} must be 0-100`);
    }
  }
  if (!["manual", "youtube"].includes(preset.source)) errors.push("Invalid source");
  return errors;
}

const STORAGE_KEY = "mefx.presets";

export function loadLocalPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Preset[];
    return parsed.filter((preset) => validatePreset(preset).length === 0);
  } catch {
    return [];
  }
}

export function saveLocalPresets(presets: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, 32)));
}
