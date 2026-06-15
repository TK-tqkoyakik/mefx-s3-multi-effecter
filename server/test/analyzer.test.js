import test from "node:test";
import assert from "node:assert/strict";
import { normalizePreset, validateAnalyzeRequest } from "../src/analyzer.js";

test("validates YouTube request", () => {
  assert.equal(validateAnalyzeRequest({ url: "https://youtu.be/example", instrument: "guitar" }), null);
  assert.match(validateAnalyzeRequest({ url: "https://example.com", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: "http://youtu.be/example", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: "https://youtube.com.evil.example/watch?v=x", instrument: "guitar" }), /YouTube/);
  assert.match(validateAnalyzeRequest({ url: `https://youtu.be/${"a".repeat(2100)}`, instrument: "guitar" }), /YouTube/);
});

test("normalizes effect values within range", () => {
  const preset = normalizePreset({
    instrument: "bass",
    name: "Test",
    effects: {
      gain: -10,
      tone_eq: 120,
      compressor: 50.4,
      drive: 10,
      modulation: 0,
      delay_reverb: 100
    },
    bypass: false,
    createdAt: new Date().toISOString(),
    source: "youtube"
  });
  for (const value of Object.values(preset.effects)) {
    assert.equal(Number.isInteger(value), true);
    assert.equal(value >= 0 && value <= 100, true);
  }
});
