export type LibraryPreset = {
  instrument: "guitar" | "bass";
  name: string;
  effects: Record<string, number>;
  bypass: boolean;
  createdAt: string;
  source: "manual" | "youtube";
  ir?: LibraryIr;
  deviceTone?: Record<string, number>;
};

export type LibraryIr = {
  enabled: boolean;
  source: "none" | "generated" | "library" | "imported";
  name: string;
  mix: number;
  lengthMs: number;
  sampleRate: number;
  profile?: Record<string, number>;
  filePath?: string;
  createdFromUrl?: string;
  notes?: string[];
};

export type LibraryStoredIr = LibraryIr & { id: string; instrument: "guitar" | "bass"; createdAt: string };
export type LibrarySettings = { language: "ja" | "en"; lastPage: string };
export const defaultLibrarySettings: LibrarySettings = { language: "ja", lastPage: "dashboard" };
const effects = ["gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"];
const pages = ["dashboard", "manual", "tone-match", "audio-fx", "audio-files", "library", "settings"];
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown, max = 4096): value is string => typeof value === "string" && value.length <= max;
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const instrument = (value: unknown) => value === "guitar" || value === "bass";

export function isLibraryIr(value: unknown): value is LibraryIr {
  if (!record(value) || typeof value.enabled !== "boolean" || !["none", "generated", "library", "imported"].includes(String(value.source))) return false;
  if (!text(value.name, 256) || !number(value.mix, 0, 100) || !number(value.lengthMs, 0, 10000) || !number(value.sampleRate, 8000, 192000)) return false;
  if (value.filePath !== undefined && !text(value.filePath)) return false;
  if (value.createdFromUrl !== undefined && !text(value.createdFromUrl)) return false;
  if (value.notes !== undefined && (!Array.isArray(value.notes) || value.notes.length > 64 || !value.notes.every((item) => text(item, 4096)))) return false;
  if (value.profile !== undefined && (!record(value.profile) || !["brightness", "space", "saturation", "dynamics"].every((key) => number((value.profile as Record<string, unknown>)[key], 0, 1)) || !Object.values(value.profile).every((item) => number(item, 0, 1)))) return false;
  return true;
}

export function isLibraryPreset(value: unknown): value is LibraryPreset {
  if (!record(value) || !instrument(value.instrument) || !text(value.name, 256) || !value.name.trim() || !record(value.effects)) return false;
  if (!effects.every((key) => number(value.effects && (value.effects as Record<string, unknown>)[key], 0, 100))) return false;
  if (typeof value.bypass !== "boolean" || !text(value.createdAt, 64) || !["manual", "youtube"].includes(String(value.source))) return false;
  if (value.ir !== undefined && !isLibraryIr(value.ir)) return false;
  return value.deviceTone === undefined || (record(value.deviceTone) && Object.values(value.deviceTone).every((item) => number(item, 0, 100)));
}

export const isPresetList = (value: unknown): value is LibraryPreset[] => Array.isArray(value) && value.length <= 32 && value.every(isLibraryPreset);
export const isIrList = (value: unknown): value is LibraryStoredIr[] => Array.isArray(value) && value.length <= 64 && value.every((item) =>
  record(item) && text(item.id, 128) && Boolean(item.id) && instrument(item.instrument) && text(item.createdAt, 64) && isLibraryIr(item));
export const isSettings = (value: unknown): value is LibrarySettings => record(value) && ["ja", "en"].includes(String(value.language)) && pages.includes(String(value.lastPage));
