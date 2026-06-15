export type Instrument = "guitar" | "bass";
export type PresetSource = "manual" | "youtube";

export type EffectKey =
  | "gain"
  | "tone_eq"
  | "compressor"
  | "drive"
  | "modulation"
  | "delay_reverb";

export type Effects = Record<EffectKey, number>;

export type Preset = {
  instrument: Instrument;
  name: string;
  effects: Effects;
  bypass: boolean;
  createdAt: string;
  source: PresetSource;
};

export type DeviceStatus = {
  connected: boolean;
  instrument: Instrument;
  activeSlot: number;
  bypass: boolean;
  supplyMv: number;
};

export type AudioTelemetry = {
  inputLevel: number;
  preOutputLevel: number;
  micLevel: number;
  clip: boolean;
};
