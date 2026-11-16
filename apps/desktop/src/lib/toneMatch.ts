import { clampEffect, deriveDeviceTone, makePreset } from "./presets";
import type { Instrument, Preset } from "./types";

export type ToneMatchResult = {
  preset: Preset;
  notes: string[];
  extraction?: { method: "demucs" | "filter" | "mock"; stem: "bass" | "other" | null; fallbackReason?: string };
};

function scoreText(text: string): number {
  return Array.from(text).reduce((score, char) => score + char.charCodeAt(0), 0);
}

function makeToneMatchIr(url: string, instrument: Instrument, score: number) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "youtube";
    }
  })();

  return {
    enabled: true,
    source: "generated" as const,
    name: `${instrument === "bass" ? "Bass" : "Guitar"} Tone Match IR`,
    mix: clampEffect(instrument === "bass" ? 36 + (score % 18) : 42 + (score % 24)),
    lengthMs: instrument === "bass" ? 180 + (score % 80) : 110 + (score % 95),
    sampleRate: 44100,
    profile: {
      brightness: ((score >> 2) % 100) / 100,
      space: ((score >> 5) % 100) / 100,
      saturation: ((score >> 3) % 100) / 100,
      dynamics: ((score >> 4) % 100) / 100
    },
    createdFromUrl: url,
    notes: [
      `Generated from ${host}.`,
      "This IR candidate uses a generated tone profile for brightness, space, saturation, and dynamics."
    ]
  };
}

export function isLikelyYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function createMockToneMatchPreset(url: string, instrument: Instrument): ToneMatchResult {
  const score = scoreText(url);
  const namePrefix = instrument === "guitar" ? "YT Guitar" : "YT Bass";
  const preset = makePreset({
    name: `${namePrefix} ${String((score % 89) + 10).padStart(2, "0")}`,
    instrument,
    source: "youtube",
    effects: {
      gain: clampEffect(35 + (score % 36)),
      tone_eq: clampEffect(42 + ((score >> 2) % 28)),
      compressor: clampEffect(instrument === "bass" ? 42 + (score % 18) : 24 + (score % 22)),
      drive: clampEffect(instrument === "guitar" ? 18 + ((score >> 3) % 42) : 8 + ((score >> 3) % 24)),
      modulation: clampEffect((score >> 4) % 38),
      delay_reverb: clampEffect(10 + ((score >> 5) % 36))
    },
    ir: makeToneMatchIr(url, instrument, score)
  });
  preset.deviceTone = deriveDeviceTone(preset);

  return {
    preset,
    extraction: { method: "mock", stem: null },
    notes: [
      "Phase 7 mock analysis result.",
      "A generated IR candidate is attached for Audio FX convolution.",
      `Input URL score: ${score}.`
    ]
  };
}
