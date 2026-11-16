import test from "node:test";
import assert from "node:assert/strict";
import { BluetoothChooser, mefxCandidates } from "../dist-electron/bluetoothChooser.js";
const devices = [{ deviceName: "Other", deviceId: "a" }, { deviceName: "MEFX-S3", deviceId: "b" }, { deviceName: "MEFX-S3 2", deviceId: "c" }];
const tick = () => new Promise((resolve) => setImmediate(resolve));
test("Bluetooth filters unrelated devices and never selects before explicit approval", async () => {
  let approve; const received = []; let prompts = 0;
  const chooser = new BluetoothChooser(async (items) => { prompts++; assert.equal(items.length, 2); return new Promise((resolve) => { approve = resolve; }); });
  chooser.update(devices, (id) => received.push(id), true);
  chooser.update(devices, (id) => received.push(id), true);
  assert.equal(prompts, 1); assert.deepEqual(received, []);
  approve(1); await tick(); assert.deepEqual(received, ["c"]);
});
test("Bluetooth untrusted requests and cancellation are denied", async () => {
  let prompts = 0; const received = [];
  const chooser = new BluetoothChooser(async () => { prompts++; return -1; });
  chooser.update(devices, (id) => received.push(id), false);
  assert.equal(prompts, 0); assert.deepEqual(received, [""]);
  chooser.update(devices, (id) => received.push(id), true); await tick();
  assert.deepEqual(received, ["", ""]);
  assert.deepEqual(mefxCandidates([{ deviceName: "MEFX-S3-impostor", deviceId: "x" }, ...devices, devices[1]]).map((d) => d.deviceId), ["b", "c"]);
});
test("Bluetooth timeout cannot be undone by a late dialog response", async () => {
  let approve; const received = [];
  const chooser = new BluetoothChooser(() => new Promise((resolve) => { approve = resolve; }), 15);
  chooser.update(devices, (id) => received.push(id), true);
  await new Promise((resolve) => setTimeout(resolve, 25));
  approve(0); await tick(); assert.deepEqual(received, [""]);
});
