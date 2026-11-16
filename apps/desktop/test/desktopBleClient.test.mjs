import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Keep the bundler's extensionless production import; resolve it only for Node's TS runner.
const clientUrl = new URL("../src/lib/desktopBleClient.ts", import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "./devicePreset" && context.parentURL === clientUrl ? "./devicePreset.ts" : specifier, context);
  }
});
const { DesktopBleClient } = await import(clientUrl);
hooks.deregister();

const uuid = (index) => `7d8f000${index}-8b7d-4c2a-9a61-7e39f5d20100`;
const encode = (value) => new DataView(new TextEncoder().encode(JSON.stringify(value)).buffer);
const decode = (value) => JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
const summary = (slot) => ({ slot, name: `Preset ${slot}`, instrument: "guitar", source: "manual" });
const preset = () => ({
  name: "日本語の長いプリセット名を安全に送信する", instrument: "guitar", source: "manual",
  effects: { gain: 50, tone_eq: 60, compressor: 30, drive: 20, modulation: 0, delay_reverb: 10 },
  bypass: false, createdAt: "2026-10-21T00:00:00.000Z"
});
const status = () => ({ connected: true, instrument: "guitar", activeSlot: 0, bypass: false, supplyMv: 9000 });
const telemetry = () => ({ inputLevel: 0.2, preOutputLevel: 0.1, micLevel: 0.3, clip: false });

class MockTarget {
  listeners = new Map();
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  emit(type) { for (const callback of this.listeners.get(type) ?? []) callback({ target: this }); }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}

class MockCharacteristic extends MockTarget {
  writes = [];
  reads = 0;
  starts = 0;
  value = encode({});
  onWrite = () => {};
  onRead = () => this.value;
  onStart = () => {};
  async writeValueWithResponse(value) { this.writes.push(new Uint8Array(value)); await this.onWrite(decode(value)); }
  async writeValue(value) { this.legacyWrites = (this.legacyWrites ?? 0) + 1; this.writes.push(new Uint8Array(value)); await this.onWrite(decode(value)); }
  async readValue() { this.reads += 1; return this.onRead(); }
  async startNotifications() { this.starts += 1; await this.onStart(); return this; }
  notify(value) { this.value = encode(value); this.emit("characteristicvaluechanged"); }
}

function setup(t) {
  const characteristics = Array.from({ length: 5 }, () => new MockCharacteristic());
  const [write, list, command, deviceStatus, audioTelemetry] = characteristics;
  const device = new MockTarget();
  device.name = "MEFX-S3 Mock";
  device.gatt = {
    connected: false,
    async connect() { this.connected = true; return this; },
    disconnect() { this.connected = false; device.emit("gattserverdisconnected"); },
    async getPrimaryService(serviceUuid) {
      assert.equal(serviceUuid, uuid(0));
      return { getCharacteristic: async (id) => characteristics[Number(id.slice(7, 8)) - 1] };
    }
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    bluetooth: { requestDevice: async () => device }
  } });
  const client = new DesktopBleClient();
  t.after(() => {
    client.disconnect();
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
  });
  list.value = encode([]);
  deviceStatus.value = encode(status());
  return { client, device, write, list, command, deviceStatus, audioTelemetry };
}

test("lists all 16 slots in exactly four pages", async (t) => {
  const { client, command, list } = setup(t);
  await client.connect();
  const expected = Array.from({ length: 16 }, (_, slot) => summary(slot));
  command.onWrite = ({ action, offset }) => {
    assert.equal(action, "list");
    command.value = encode({ items: expected.slice(offset, offset + 4), nextOffset: offset < 12 ? offset + 4 : null });
  };
  assert.deepEqual(await client.listPresets(), expected);
  assert.deepEqual(command.writes.map(decode), [0, 4, 8, 12].map((offset) => ({ action: "list", offset })));
  assert.equal(list.reads, 0);
});

test("sparse slots preserve device slot numbers and use nextOffset, not item count", async (t) => {
  const { client, command } = setup(t);
  await client.connect();
  const expected = [0, 3, 7, 9, 15].map(summary);
  command.onWrite = ({ offset }) => {
    command.value = encode(offset === 0 ? { items: expected.slice(0, 4), nextOffset: 15 } : { items: expected.slice(4), nextOffset: null });
  };
  assert.deepEqual(await client.listPresets(), expected);
  assert.deepEqual(command.writes.map(decode).map((cmd) => cmd.offset), [0, 15]);
});

test("an empty device is a successful page, without legacy fallback", async (t) => {
  const { client, command, list } = setup(t);
  await client.connect();
  command.value = encode({ items: [], nextOffset: null });
  assert.deepEqual(await client.listPresets(), []);
  assert.equal(command.writes.length, 1);
  assert.equal(list.reads, 0);
});

test("legacy fallback is limited to an explicitly unsupported first list command", async (t) => {
  const { client, command, list } = setup(t);
  await client.connect();
  command.onWrite = () => { throw new DOMException("Paging unsupported", "NotSupportedError"); };
  list.value = encode([summary(3), summary(15)]);
  assert.deepEqual(await client.listPresets(), [summary(3), summary(15)]);
  assert.equal(list.reads, 1);
});

test("legacy fallback failures retain both the unsupported error and the fallback error", async (t) => {
  const { client, command, list } = setup(t);
  await client.connect();
  const unsupported = new DOMException("Paging unsupported", "NotSupportedError");
  const failure = new DOMException("Link lost", "NetworkError");
  command.onWrite = () => { throw unsupported; };
  list.onRead = () => { throw failure; };
  await assert.rejects(client.listPresets(), (error) => error instanceof AggregateError && error.errors[0] === unsupported && error.errors[1] === failure);
});

test("malformed or failed first-page responses never fall back to a misleading empty list", async (t) => {
  const cases = [
    null, [], { ok: false, error: "flash failure" }, { items: [] }, { items: "bad", nextOffset: null },
    { items: [], nextOffset: 0 }, { items: [], nextOffset: 16 }, { items: [], nextOffset: 1.5 },
    { items: [], nextOffset: 4 }, { items: [summary(-1)], nextOffset: null },
    { items: [summary(16)], nextOffset: null }, { items: [summary(0.5)], nextOffset: null },
    { items: [summary(2), summary(2)], nextOffset: null }, { items: [summary(3), summary(0)], nextOffset: null },
    { items: [summary(4)], nextOffset: 4 }, { items: [summary(0), summary(1), summary(2), summary(3), summary(4)], nextOffset: null },
    { items: [{ ...summary(0), name: 4 }], nextOffset: null },
    { items: [{ ...summary(0), instrument: "drums" }], nextOffset: null },
    { items: [{ ...summary(0), source: "unknown" }], nextOffset: null }
  ];
  for (const response of cases) await t.test(JSON.stringify(response), async (t) => {
    const { client, command, list } = setup(t);
    await client.connect();
    command.value = encode(response);
    await assert.rejects(client.listPresets());
    assert.equal(list.reads, 0);
  });
});

test("bad UTF-8, malformed JSON, and read/write errors propagate without fallback", async (t) => {
  for (const mode of ["utf8", "json", "read", "write", "unsupportedRead"]) await t.test(mode, async (t) => {
    const { client, command, list } = setup(t);
    await client.connect();
    const failure = new DOMException("Link lost", "NetworkError");
    if (mode === "utf8") command.value = new DataView(Uint8Array.of(0xff).buffer);
    if (mode === "json") command.value = new DataView(new TextEncoder().encode("{broken").buffer);
    if (mode === "read") command.onRead = () => { throw failure; };
    if (mode === "write") command.onWrite = () => { throw failure; };
    if (mode === "unsupportedRead") command.onRead = () => { throw new DOMException("Read unsupported", "NotSupportedError"); };
    await assert.rejects(client.listPresets(), mode === "read" || mode === "write" ? (error) => error === failure : undefined);
    assert.equal(list.reads, 0);
  });
});

test("later-page failures and nontermination never return partial lists", async (t) => {
  for (const mode of ["unsupported", "invalid", "tooManyPages"]) await t.test(mode, async (t) => {
    const { client, command, list } = setup(t);
    await client.connect();
    command.onWrite = ({ offset }) => {
      if (offset && mode === "unsupported") throw new DOMException("Paging unsupported", "NotSupportedError");
      command.value = encode(offset && mode === "invalid" ? { ok: false } : { items: [summary(offset)], nextOffset: offset + 1 });
    };
    await assert.rejects(client.listPresets());
    assert.ok(command.writes.length <= 4);
    assert.equal(list.reads, 0);
  });
});

test("legacy lists also reject malformed, duplicated, or out-of-range slots", async (t) => {
  for (const response of [null, {}, [summary(16)], [summary(0), summary(0)], [{ ...summary(0), source: "bad" }]]) {
    await t.test(JSON.stringify(response), async (t) => {
      const { client, command, list } = setup(t);
      await client.connect();
      command.onWrite = () => { throw new DOMException("Paging unsupported", "NotSupportedError"); };
      list.value = encode(response);
      await assert.rejects(client.listPresets());
    });
  }
});

test("read and delete validate replies, including failure envelopes and stale deletion acknowledgements", async (t) => {
  const { client, command } = setup(t);
  await client.connect();
  command.value = encode(preset());
  assert.deepEqual(await client.readPreset(15), preset());
  command.value = encode({ ok: true, deletedSlot: 15 });
  await client.deletePreset(15);
  assert.deepEqual(command.writes.map(decode), [{ action: "read", slot: 15 }, { action: "delete", slot: 15 }]);
  for (const response of [null, {}, { ok: true }, { ok: false, error: "slot missing" }, { ...preset(), effects: { gain: 50 } }, { ...preset(), effects: { ...preset().effects, drive: 101 } }]) {
    command.value = encode(response);
    await assert.rejects(client.readPreset(3));
  }
  for (const response of [null, {}, { ok: true }, { ok: false, error: "erase failed" }, { ok: true, deletedSlot: 2 }, { ok: "true", deletedSlot: 3 }]) {
    command.value = encode(response);
    await assert.rejects(client.deletePreset(3));
  }
  command.value = encode({ ok: false, error: "NVS erase failed" });
  await assert.rejects(client.deletePreset(3), /NVS erase failed/);
});

test("invalid read/delete slot numbers are rejected before GATT writes", async (t) => {
  const { client, command } = setup(t);
  await client.connect();
  for (const slot of [-1, 16, 1.5, NaN, Infinity, "0"]) {
    await assert.rejects(client.readPreset(slot));
    await assert.rejects(client.deletePreset(slot));
  }
  assert.equal(command.writes.length, 0);
});

test("sendPreset uses compact UTF-8, modern or legacy writes, and never retries a failed modern write", async (t) => {
  const { client, write } = setup(t);
  await client.connect();
  const input = { ...preset(), ir: { notes: ["PC only".repeat(1000)] }, deviceTone: { cabinet: 50 } };
  await client.sendPreset(input);
  assert.ok(write.writes[0].byteLength <= 480);
  assert.deepEqual(Object.keys(decode(write.writes[0])), ["instrument", "name", "effects", "bypass", "createdAt", "source"]);
  assert.ok(new TextEncoder().encode(decode(write.writes[0]).name).byteLength <= 32);
  const failure = new DOMException("Write failed", "NetworkError");
  write.onWrite = () => { throw failure; };
  await assert.rejects(client.sendPreset(input), (error) => error === failure);
  assert.equal(write.legacyWrites, undefined);
  write.onWrite = () => {};
  write.writeValueWithResponse = undefined;
  await client.sendPreset(input);
  assert.equal(write.legacyWrites, 1);
  const writesBefore = write.writes.length;
  await assert.rejects(client.sendPreset({ ...input, source: "x".repeat(500) }), /480/);
  assert.equal(write.writes.length, writesBefore);
});

test("read/delete also work without writeValueWithResponse and surface transport errors", async (t) => {
  const { client, command } = setup(t);
  await client.connect();
  command.writeValueWithResponse = undefined;
  command.value = encode(preset());
  await client.readPreset(0);
  command.value = encode({ ok: true, deletedSlot: 0 });
  await client.deletePreset(0);
  assert.equal(command.legacyWrites, 2);
  const failure = new DOMException("Read failed", "NetworkError");
  command.onRead = () => { throw failure; };
  await assert.rejects(client.readPreset(0), (error) => error === failure);
  await assert.rejects(client.deletePreset(0), (error) => error === failure);
});

test("unexpected disconnect clears GATT references and all notification listeners", async (t) => {
  const { client, device, write, command, deviceStatus, audioTelemetry } = setup(t);
  await client.connect();
  let calls = 0;
  await client.subscribeStatus(() => calls++);
  await client.subscribeTelemetry(() => calls++);
  device.gatt.disconnect();
  assert.equal(client.connected, false);
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
  assert.equal(audioTelemetry.listenerCount("characteristicvaluechanged"), 0);
  assert.equal(device.listenerCount("gattserverdisconnected"), 0);
  deviceStatus.notify(status());
  audioTelemetry.notify(telemetry());
  assert.equal(calls, 0);
  for (const operation of [() => client.sendPreset(preset()), () => client.listPresets(), () => client.readPreset(0), () => client.deletePreset(0), () => client.readStatus(), () => client.subscribeStatus(() => {}), () => client.subscribeTelemetry(() => {})]) {
    await assert.rejects(operation());
  }
  assert.equal(write.writes.length, 0);
  assert.equal(command.writes.length, 0);
});

test("disconnect during write/read/startNotifications cannot complete a stale operation", async (t) => {
  for (const mode of ["write", "read", "status", "telemetry"]) await t.test(mode, async (t) => {
    const { client, device, command, list, deviceStatus, audioTelemetry } = setup(t);
    await client.connect();
    command.value = encode({ items: [], nextOffset: null });
    if (mode === "write") command.onWrite = () => device.gatt.disconnect();
    if (mode === "read") command.onRead = () => { device.gatt.disconnect(); return encode({ items: [], nextOffset: null }); };
    if (mode === "status") deviceStatus.onStart = () => device.gatt.disconnect();
    if (mode === "telemetry") audioTelemetry.onStart = () => device.gatt.disconnect();
    await assert.rejects(mode === "status" ? client.subscribeStatus(() => {}) : mode === "telemetry" ? client.subscribeTelemetry(() => {}) : client.listPresets());
    assert.equal(list.reads, 0);
    assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
    assert.equal(audioTelemetry.listenerCount("characteristicvaluechanged"), 0);
  });
});

test("repeated subscriptions and reconnects deliver each notification once to the current callback", async (t) => {
  const { client, device, deviceStatus, audioTelemetry } = setup(t);
  let oldCalls = 0;
  let currentCalls = 0;
  await client.connect();
  await client.subscribeStatus(() => oldCalls++);
  await client.subscribeStatus(() => currentCalls++);
  await client.subscribeTelemetry(() => oldCalls++);
  await client.subscribeTelemetry(() => currentCalls++);
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 1);
  assert.equal(audioTelemetry.listenerCount("characteristicvaluechanged"), 1);
  deviceStatus.notify(status());
  audioTelemetry.notify(telemetry());
  assert.equal(oldCalls, 0);
  assert.equal(currentCalls, 2);
  await client.connect();
  assert.equal(device.listenerCount("gattserverdisconnected"), 1);
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
  await client.subscribeStatus(() => currentCalls++);
  deviceStatus.notify(status());
  assert.equal(currentCalls, 3);
  client.disconnect();
  client.disconnect();
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
});

test("a failed connection cleans up partial GATT state and can be retried", async (t) => {
  const { client, device } = setup(t);
  const originalGetService = device.gatt.getPrimaryService;
  device.gatt.getPrimaryService = async () => { throw new Error("Service discovery failed"); };
  await assert.rejects(client.connect(), /Service discovery failed/);
  assert.equal(client.connected, false);
  assert.equal(device.listenerCount("gattserverdisconnected"), 0);
  device.gatt.getPrimaryService = originalGetService;
  await client.connect();
  assert.equal(client.connected, true);
});

test("concurrent commands cannot read each other's shared response, and a failure does not poison later commands", async (t) => {
  const { client, command } = setup(t);
  await client.connect();
  command.onWrite = ({ action, slot }) => {
    if (slot === 1) throw new Error("Slot unavailable");
    command.value = encode(action === "read" ? { ...preset(), name: `Slot ${slot}` } : { ok: true, deletedSlot: slot });
  };
  const [first, second] = await Promise.all([client.readPreset(0), client.readPreset(15)]);
  assert.equal(first.name, "Slot 0");
  assert.equal(second.name, "Slot 15");
  const failed = assert.rejects(client.readPreset(1), /Slot unavailable/);
  const deleted = client.deletePreset(3);
  await Promise.all([failed, deleted]);
});

test("readStatus and notifications reject malformed status/telemetry instead of publishing them", async (t) => {
  const { client, deviceStatus, audioTelemetry } = setup(t);
  await client.connect();
  assert.deepEqual(await client.readStatus(), status());
  for (const response of [null, {}, { ok: false, error: "status failed" }, { ...status(), activeSlot: 16 }, { ...status(), bypass: "false" }]) {
    deviceStatus.value = encode(response);
    await assert.rejects(client.readStatus());
  }
  let calls = 0;
  await client.subscribeStatus(() => calls++);
  await client.subscribeTelemetry(() => calls++);
  assert.throws(() => deviceStatus.notify({}));
  assert.throws(() => audioTelemetry.notify({ inputLevel: "bad" }));
  assert.equal(calls, 0);
  deviceStatus.notify(status());
  audioTelemetry.notify(telemetry());
  assert.equal(calls, 2);
});

test("notification startup failures propagate and leave no listeners behind", async (t) => {
  const { client, deviceStatus, audioTelemetry } = setup(t);
  await client.connect();
  const failure = new DOMException("Notification setup failed", "NetworkError");
  deviceStatus.onStart = audioTelemetry.onStart = () => { throw failure; };
  await assert.rejects(client.subscribeStatus(() => {}), (error) => error === failure);
  await assert.rejects(client.subscribeTelemetry(() => {}), (error) => error === failure);
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
  assert.equal(audioTelemetry.listenerCount("characteristicvaluechanged"), 0);
});

test("an in-flight notification from an old connection cannot attach after reconnect", async (t) => {
  const { client, deviceStatus } = setup(t);
  await client.connect();
  let release;
  deviceStatus.onStart = () => new Promise((resolve) => { release = resolve; });
  const pending = client.subscribeStatus(() => {});
  const rejected = assert.rejects(pending, /disconnected/);
  await client.connect();
  release();
  await rejected;
  assert.equal(deviceStatus.listenerCount("characteristicvaluechanged"), 0);
});

test("disconnect while choosing a device cancels the pending connection", async (t) => {
  const { client, device } = setup(t);
  let release;
  navigator.bluetooth.requestDevice = () => new Promise((resolve) => { release = resolve; });
  const pending = client.connect();
  const rejected = assert.rejects(pending, /cancelled/);
  client.disconnect();
  release(device);
  await rejected;
  assert.equal(client.connected, false);
  assert.equal(device.listenerCount("gattserverdisconnected"), 0);
});
