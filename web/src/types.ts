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

export type ImpulseResponseSource = "none" | "generated" | "library" | "imported";

export type ImpulseResponseSettings = {
  enabled: boolean;
  source: ImpulseResponseSource;
  name: string;
  mix: number;
  lengthMs: number;
  sampleRate: number;
  profile?: {
    brightness: number;
    space: number;
    saturation: number;
    dynamics: number;
  };
  filePath?: string;
  createdFromUrl?: string;
  notes?: string[];
};

export type DeviceTone = {
  cabinet: number;
  presence: number;
  resonance: number;
  air: number;
  irMix: number;
};

export type Preset = {
  instrument: Instrument;
  name: string;
  effects: Effects;
  ir?: ImpulseResponseSettings;
  deviceTone?: DeviceTone;
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
