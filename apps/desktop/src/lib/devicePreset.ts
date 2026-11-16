import type { Effects, Preset } from "./types";

export const MAX_DEVICE_PRESET_BYTES = 480;
export const MAX_DEVICE_PRESET_NAME_BYTES = 32;

export type DevicePresetPayload = {
  instrument: Preset["instrument"];
  name: string;
  effects: Effects;
  bypass: boolean;
  createdAt: string;
  source: Preset["source"];
};

const encoder = new TextEncoder();

function clampEffect(value: number) {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function truncateUtf8(value: string, maxBytes: number) {
  let result = "";
  for (const character of value) {
    if (encoder.encode(result + character).byteLength > maxBytes) break;
    result += character;
  }
  return result;
}

function deviceSafeName(name: string) {
  const wellFormed = new TextDecoder().decode(encoder.encode(name));
  const sanitized = wellFormed.replace(/[\u0000-\u001f\u007f-\u009f"\\]/g, " ").replace(/\s+/g, " ").trim() || "Preset";
  return truncateUtf8(sanitized, MAX_DEVICE_PRESET_NAME_BYTES);
}

export function createDevicePresetPayload(preset: Preset): DevicePresetPayload {
  return {
    instrument: preset.instrument,
    name: deviceSafeName(preset.name),
    effects: {
      gain: clampEffect(preset.effects.gain),
      tone_eq: clampEffect(preset.effects.tone_eq),
      compressor: clampEffect(preset.effects.compressor),
      drive: clampEffect(preset.effects.drive),
      modulation: clampEffect(preset.effects.modulation),
      delay_reverb: clampEffect(preset.effects.delay_reverb)
    },
    bypass: Boolean(preset.bypass),
    createdAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(preset.createdAt)
      && Number.isFinite(Date.parse(preset.createdAt)) ? preset.createdAt : "",
    source: preset.source
  };
}

export function encodeDevicePreset(preset: Preset): Uint8Array<ArrayBuffer> {
  const payload = encoder.encode(JSON.stringify(createDevicePresetPayload(preset)));
  if (payload.byteLength > MAX_DEVICE_PRESET_BYTES) {
    throw new Error(
      `ESP32送信用データが上限${MAX_DEVICE_PRESET_BYTES}バイトを超えています（${payload.byteLength}バイト）。`
    );
  }
  return payload;
}
