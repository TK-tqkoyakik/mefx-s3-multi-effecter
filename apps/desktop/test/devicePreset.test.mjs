import assert from "node:assert/strict";
import test from "node:test";
import {
  createDevicePresetPayload,
  encodeDevicePreset,
  MAX_DEVICE_PRESET_BYTES,
  MAX_DEVICE_PRESET_NAME_BYTES
} from "../src/lib/devicePreset.ts";

function toneMatchPreset() {
  return {
    instrument: "guitar",
    name: "日本語の長いプリセット名を安全に短くするテスト \"quoted\"",
    effects: { gain: 55, tone_eq: 60, compressor: 30, drive: 45, modulation: 10, delay_reverb: 20 },
    ir: {
      enabled: true,
      source: "generated",
      name: "PC only IR",
      mix: 70,
      lengthMs: 1600,
      sampleRate: 48000,
      filePath: "C:/very/long/path/tone.wav",
      createdFromUrl: "https://www.youtube.com/watch?v=example",
      notes: ["ESP32へ送らない長い解析メモ".repeat(20)]
    },
    deviceTone: { cabinet: 54, presence: 63, resonance: 42, air: 35, irMix: 70 },
    bypass: false,
    createdAt: "2026-08-07T12:34:56.000Z",
    source: "youtube"
  };
}

test("ESP32送信用データからPC専用フィールドを除外する", () => {
  const payload = createDevicePresetPayload(toneMatchPreset());
  assert.deepEqual(Object.keys(payload), ["instrument", "name", "effects", "bypass", "createdAt", "source"]);
  assert.equal("ir" in payload, false);
  assert.equal("deviceTone" in payload, false);
  assert.ok(new TextEncoder().encode(payload.name).byteLength <= MAX_DEVICE_PRESET_NAME_BYTES);
});

test("Tone Matchプリセットも480バイト以内に収める", () => {
  const encoded = encodeDevicePreset(toneMatchPreset());
  assert.ok(encoded.byteLength <= MAX_DEVICE_PRESET_BYTES);
  assert.ok(encoded.byteLength < 320);
});

test("UTF-8 names stop at a code point boundary, including four-byte characters", () => {
  for (const [name, expected] of [
    ["a".repeat(32), "a".repeat(32)],
    ["a".repeat(33), "a".repeat(32)],
    ["日".repeat(20), "日".repeat(10)],
    ["a".repeat(29) + "日語", "a".repeat(29) + "日"],
    ["a".repeat(30) + "日", "a".repeat(30)],
    ["\u{1f3b8}".repeat(9), "\u{1f3b8}".repeat(8)]
  ]) {
    const preset = { ...toneMatchPreset(), name };
    const payload = createDevicePresetPayload(preset);
    assert.equal(payload.name, expected);
    assert.ok(new TextEncoder().encode(payload.name).byteLength <= MAX_DEVICE_PRESET_NAME_BYTES);
    assert.equal(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(encodeDevicePreset(preset))).name, expected);
  }
});

test("unsafe name characters and empty names are sanitized without mutating the preset", () => {
  for (const name of ["\0\t\n\r\"\\\u001f\u007f\u0085", "   ", ""]) {
    assert.equal(createDevicePresetPayload({ ...toneMatchPreset(), name }).name, "Preset");
  }
  const preset = { ...toneMatchPreset(), name: "  Clean\t\"A\"\\B\n  " };
  assert.equal(createDevicePresetPayload(preset).name, "Clean A B");
  assert.equal(preset.name, "  Clean\t\"A\"\\B\n  ");
});

test("unpaired surrogates cannot introduce JSON escapes into a firmware name", () => {
  const preset = { ...toneMatchPreset(), name: "A\ud800B\udc00" };
  const payload = createDevicePresetPayload(preset);
  assert.equal(payload.name, "A\ufffdB\ufffd");
  assert.equal(JSON.stringify(payload.name).includes("\\"), false);
});

test("all six effects are rounded and clamped, with non-finite inputs becoming zero", () => {
  const keys = Object.keys(toneMatchPreset().effects);
  for (const [input, expected] of [
    [-100, 0], [0, 0], [0.49, 0], [0.5, 1], [55.5, 56], [99.9, 100], [100, 100],
    [1000, 100], [NaN, 0], [Infinity, 0], [-Infinity, 0], [undefined, 0], ["55", 0]
  ]) {
    const preset = { ...toneMatchPreset(), effects: Object.fromEntries(keys.map((key) => [key, input])) };
    const before = { ...preset.effects };
    assert.deepEqual(createDevicePresetPayload(preset).effects, Object.fromEntries(keys.map((key) => [key, expected])));
    assert.deepEqual(preset.effects, before);
  }
});

test("createdAt cannot inject quotes or escape sequences into the firmware response", () => {
  for (const createdAt of ["invalid", "2026-01-01T\"name\":\"x", "2026-01-01T\n", "2026-01-01T00:00:00Z\\"]) {
    assert.equal(createDevicePresetPayload({ ...toneMatchPreset(), createdAt }).createdAt, "");
  }
  for (const createdAt of ["2026-08-07T12:34:56.000Z", "2026-08-07T12:34:56+09:00"]) {
    assert.equal(createDevicePresetPayload({ ...toneMatchPreset(), createdAt }).createdAt, createdAt);
  }
});

test("480-byte guard counts UTF-8 bytes and rejects overflow before sending", () => {
  // An untyped caller can still supply an oversized enum field at runtime.
  const preset = { ...toneMatchPreset(), source: "" };
  const baseBytes = encodeDevicePreset(preset).byteLength;
  preset.source = "x".repeat(MAX_DEVICE_PRESET_BYTES - baseBytes);
  assert.equal(encodeDevicePreset(preset).byteLength, MAX_DEVICE_PRESET_BYTES);
  preset.source += "x";
  assert.throws(() => encodeDevicePreset(preset), /480.*481/);
  preset.source = "日".repeat(Math.floor((MAX_DEVICE_PRESET_BYTES - baseBytes) / 3) + 1);
  assert.throws(() => encodeDevicePreset(preset), /480/);
});
