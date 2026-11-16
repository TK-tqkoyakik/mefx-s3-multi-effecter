import type { DeviceTone, EffectKey, Effects, ImpulseResponseSettings, Instrument, Preset, PresetSource } from "./types";

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

export const effectKeys = Object.keys(effectLabels) as EffectKey[];

export const defaultImpulseResponse: ImpulseResponseSettings = {
  enabled: false,
  source: "none",
  name: "No IR",
  mix: 0,
  lengthMs: 0,
  sampleRate: 44100
};

export function clampEffect(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function deriveDeviceTone(preset: Pick<Preset, "instrument" | "effects" | "ir">): DeviceTone {
  const profile = preset.ir?.profile;
  const brightness = profile?.brightness ?? (preset.effects.tone_eq / 100);
  const space = profile?.space ?? (preset.effects.delay_reverb / 100);
  const saturation = profile?.saturation ?? (preset.effects.drive / 100);
  const dynamics = profile?.dynamics ?? (1 - preset.effects.compressor / 100);
  return {
    cabinet: clampEffect((preset.ir?.enabled ? preset.ir.mix : 0) * 0.65 + saturation * 28),
    presence: clampEffect((preset.instrument === "bass" ? 24 : 38) + brightness * 48),
    resonance: clampEffect((preset.instrument === "bass" ? 52 : 34) + space * 30 - brightness * 10),
    air: clampEffect((preset.instrument === "bass" ? 8 : 24) + space * 42 + dynamics * 18),
    irMix: clampEffect(preset.ir?.enabled ? preset.ir.mix : 0)
  };
}

export function makePreset(
  overrides: Partial<Preset> & { name?: string; instrument?: Instrument; source?: PresetSource } = {}
): Preset {
  const preset = {
    instrument: overrides.instrument ?? "guitar",
    name: overrides.name?.trim() || "New Preset",
    effects: { ...defaultEffects, ...overrides.effects },
    ir: { ...defaultImpulseResponse, ...overrides.ir },
    deviceTone: overrides.deviceTone,
    bypass: overrides.bypass ?? false,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    source: overrides.source ?? "manual"
  };
  return { ...preset, deviceTone: preset.deviceTone ?? deriveDeviceTone(preset) };
}

export function validatePreset(preset: Preset): string[] {
  const errors: string[] = [];
  if (!["guitar", "bass"].includes(preset.instrument)) errors.push("Instrument must be Guitar or Bass.");
  if (!preset.name.trim()) errors.push("Preset name is required.");
  if (preset.name.length > 40) errors.push("Preset name must be 40 characters or fewer.");

  for (const key of effectKeys) {
    const value = preset.effects[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      errors.push(`${effectLabels[key]} must be an integer from 0 to 100.`);
    }
  }

  if (preset.ir) {
    if (typeof preset.ir.enabled !== "boolean") errors.push("IR enabled must be true or false.");
    if (!["none", "generated", "library", "imported"].includes(preset.ir.source)) {
      errors.push("IR source must be none, generated, library, or imported.");
    }
    if (!Number.isInteger(preset.ir.mix) || preset.ir.mix < 0 || preset.ir.mix > 100) {
      errors.push("IR mix must be an integer from 0 to 100.");
    }
    if (!Number.isInteger(preset.ir.lengthMs) || preset.ir.lengthMs < 0 || preset.ir.lengthMs > 10000) {
      errors.push("IR length must be 0-10000 ms.");
    }
    if (!Number.isInteger(preset.ir.sampleRate) || preset.ir.sampleRate < 8000 || preset.ir.sampleRate > 192000) {
      errors.push("IR sample rate must be 8000-192000 Hz.");
    }
    if (preset.ir.profile) {
      for (const [key, value] of Object.entries(preset.ir.profile)) {
        if (typeof value !== "number" || value < 0 || value > 1) {
          errors.push(`IR profile ${key} must be a number from 0 to 1.`);
        }
      }
    }
  }

  if (preset.deviceTone) {
    for (const [key, value] of Object.entries(preset.deviceTone)) {
      if (!Number.isInteger(value) || value < 0 || value > 100) {
        errors.push(`Device tone ${key} must be an integer from 0 to 100.`);
      }
    }
  }

  if (!["manual", "youtube"].includes(preset.source)) errors.push("Preset source must be manual or youtube.");
  return errors;
}
