import type { AudioTelemetry, DeviceStatus, Preset } from "./types";
import { encodeDevicePreset } from "./devicePreset";

const SERVICE_UUID = "7d8f0000-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_WRITE_UUID = "7d8f0001-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_LIST_UUID = "7d8f0002-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_READ_DELETE_UUID = "7d8f0003-8b7d-4c2a-9a61-7e39f5d20100";
const DEVICE_STATUS_UUID = "7d8f0004-8b7d-4c2a-9a61-7e39f5d20100";
const AUDIO_TELEMETRY_UUID = "7d8f0005-8b7d-4c2a-9a61-7e39f5d20100";
const MAX_PRESET_SLOTS = 16;
const PRESET_PAGE_SIZE = 4;

type CharacteristicWithModernWrite = BluetoothRemoteGATTCharacteristic & {
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
};

export type DevicePresetSummary = {
  slot: number;
  name: string;
  instrument: "guitar" | "bass";
  source: "manual" | "youtube";
};

type DevicePresetPage = {
  items: DevicePresetSummary[];
  nextOffset: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_PRESET_SLOTS;
}

function isPresetIdentity(value: Record<string, unknown>) {
  return typeof value.name === "string" && value.name.trim().length > 0
    && (value.instrument === "guitar" || value.instrument === "bass")
    && (value.source === "manual" || value.source === "youtube");
}

function parseSummaries(value: unknown, limit: number, offset = 0): DevicePresetSummary[] {
  if (!Array.isArray(value) || value.length > limit) throw new Error("Preset list response is invalid.");
  let previousSlot = offset - 1;
  for (const item of value) {
    if (!isRecord(item) || !isPresetIdentity(item) || !isSlot(item.slot) || item.slot <= previousSlot) {
      throw new Error("Preset summary or slot order is invalid.");
    }
    previousSlot = item.slot;
  }
  return value as DevicePresetSummary[];
}

function parsePage(value: unknown, offset: number): DevicePresetPage {
  if (!isRecord(value)) throw new Error("Paged preset response is invalid.");
  const items = parseSummaries(value.items, PRESET_PAGE_SIZE, offset);
  const nextOffset = value.nextOffset;
  if (nextOffset !== null && (!isSlot(nextOffset) || nextOffset <= offset
    || items.length === 0 || nextOffset <= items[items.length - 1].slot)) {
    throw new Error("Paged preset response did not advance within the supported 16 slots.");
  }
  return { items, nextOffset };
}

function parseResponse(value: DataView): unknown {
  const response: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(value));
  if (isRecord(response) && (response.ok === false || typeof response.error === "string")) {
    throw new Error(`MEFX-S3: ${typeof response.error === "string" ? response.error : "Device command failed."}`);
  }
  return response;
}

function parsePreset(value: unknown): Preset {
  if (!isRecord(value) || !isPresetIdentity(value) || typeof value.bypass !== "boolean"
    || typeof value.createdAt !== "string" || !isRecord(value.effects)) {
    throw new Error("Preset read response is invalid.");
  }
  for (const key of ["gain", "tone_eq", "compressor", "drive", "modulation", "delay_reverb"]) {
    const effect = value.effects[key];
    if (typeof effect !== "number" || !Number.isInteger(effect) || effect < 0 || effect > 100) {
      throw new Error("Preset read effects are invalid.");
    }
  }
  return value as Preset;
}

function parseStatus(value: unknown): DeviceStatus {
  if (!isRecord(value) || typeof value.connected !== "boolean" || !isSlot(value.activeSlot)
    || (value.instrument !== "guitar" && value.instrument !== "bass") || typeof value.bypass !== "boolean"
    || typeof value.supplyMv !== "number" || !Number.isFinite(value.supplyMv) || value.supplyMv < 0) {
    throw new Error("Device status response is invalid.");
  }
  return value as DeviceStatus;
}

function parseTelemetry(value: unknown): AudioTelemetry {
  if (!isRecord(value) || typeof value.clip !== "boolean"
    || ![value.inputLevel, value.preOutputLevel, value.micLevel].every((level) =>
      typeof level === "number" && Number.isFinite(level) && level >= 0)) {
    throw new Error("Audio telemetry response is invalid.");
  }
  return value as AudioTelemetry;
}

export class DesktopBleClient {
  private device?: BluetoothDevice;
  private presetWrite?: CharacteristicWithModernWrite;
  private presetList?: BluetoothRemoteGATTCharacteristic;
  private presetReadDelete?: CharacteristicWithModernWrite;
  private status?: BluetoothRemoteGATTCharacteristic;
  private telemetry?: BluetoothRemoteGATTCharacteristic;
  private connectionVersion = 0;
  private commandQueue: Promise<void> = Promise.resolve();
  private statusCallback?: (status: DeviceStatus) => void;
  private telemetryCallback?: (telemetry: AudioTelemetry) => void;
  private readonly onDisconnected = () => this.resetConnection();
  private readonly onStatusChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (characteristic === this.status && characteristic.value && this.connected) {
      this.statusCallback?.(parseStatus(parseResponse(characteristic.value)));
    }
  };
  private readonly onTelemetryChanged = (event: Event) => {
    const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    if (characteristic === this.telemetry && characteristic.value && this.connected) {
      this.telemetryCallback?.(parseTelemetry(parseResponse(characteristic.value)));
    }
  };

  get supported() {
    return typeof navigator !== "undefined" && "bluetooth" in navigator && Boolean(navigator.bluetooth);
  }

  get connected() {
    return Boolean(this.device?.gatt?.connected);
  }

  get deviceName() {
    return this.device?.name;
  }

  async connect() {
    if (!this.supported) throw new Error("Electron Web Bluetooth is not available in this environment.");
    this.disconnect();
    const version = this.connectionVersion;
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }, { namePrefix: "MEFX" }],
      optionalServices: [SERVICE_UUID]
    });
    if (version !== this.connectionVersion) throw new Error("MEFX-S3 connection was cancelled.");
    this.device = device;
    device.addEventListener("gattserverdisconnected", this.onDisconnected);
    try {
      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService(SERVICE_UUID);
      if (!service) throw new Error("MEFX-S3 BLE service was not found.");

      const presetWrite = await service.getCharacteristic(PRESET_WRITE_UUID);
      const presetList = await service.getCharacteristic(PRESET_LIST_UUID);
      const presetReadDelete = await service.getCharacteristic(PRESET_READ_DELETE_UUID);
      const status = await service.getCharacteristic(DEVICE_STATUS_UUID);
      const telemetry = await service.getCharacteristic(AUDIO_TELEMETRY_UUID);
      if (version !== this.connectionVersion || !server?.connected) {
        throw new Error("MEFX-S3 disconnected during connection.");
      }
      this.presetWrite = presetWrite;
      this.presetList = presetList;
      this.presetReadDelete = presetReadDelete;
      this.status = status;
      this.telemetry = telemetry;
    } catch (error) {
      if (this.device === device) this.disconnect();
      throw error;
    }
  }

  disconnect() {
    const device = this.device;
    this.resetConnection();
    device?.gatt?.disconnect();
  }

  private resetConnection() {
    this.connectionVersion += 1;
    this.commandQueue = Promise.resolve();
    this.device?.removeEventListener("gattserverdisconnected", this.onDisconnected);
    this.status?.removeEventListener("characteristicvaluechanged", this.onStatusChanged);
    this.telemetry?.removeEventListener("characteristicvaluechanged", this.onTelemetryChanged);
    this.statusCallback = undefined;
    this.telemetryCallback = undefined;
    this.device = undefined;
    this.presetWrite = undefined;
    this.presetList = undefined;
    this.presetReadDelete = undefined;
    this.status = undefined;
    this.telemetry = undefined;
  }

  async sendPreset(preset: Preset) {
    const characteristic = this.requireCharacteristic(this.presetWrite);
    const payload = encodeDevicePreset(preset);
    await this.writeCharacteristic(characteristic, payload);
  }

  async listPresets(): Promise<DevicePresetSummary[]> {
    return this.runPresetCommand(async (characteristic) => {
      const legacyCharacteristic = this.requireCharacteristic(this.presetList);
      const presets: DevicePresetSummary[] = [];
      let offset = 0;
      for (let pageNumber = 0; pageNumber < MAX_PRESET_SLOTS / PRESET_PAGE_SIZE; pageNumber += 1) {
        try {
          await this.writeReadDeleteCommand(characteristic, { action: "list", offset });
        } catch (error) {
          // Only an explicit unsupported command identifies legacy firmware, not transport or JSON errors.
          if (pageNumber !== 0 || !this.connected || !(error instanceof DOMException) || error.name !== "NotSupportedError") {
            throw error;
          }
          try {
            return parseSummaries(await this.readResponse(legacyCharacteristic), MAX_PRESET_SLOTS);
          } catch (legacyError) {
            throw new AggregateError([error, legacyError], "Paged preset command is unsupported and legacy list fallback failed.");
          }
        }
        const page = parsePage(await this.readResponse(characteristic), offset);
        presets.push(...page.items);
        if (page.nextOffset === null) return presets;
        offset = page.nextOffset;
      }
      throw new Error("Preset list exceeded the supported 16 slots.");
    });
  }

  async readPreset(slot: number): Promise<Preset> {
    if (!isSlot(slot)) throw new Error("Preset slot must be an integer from 0 to 15.");
    return this.runPresetCommand(async (characteristic) => {
      await this.writeReadDeleteCommand(characteristic, { action: "read", slot });
      return parsePreset(await this.readResponse(characteristic));
    });
  }

  async deletePreset(slot: number) {
    if (!isSlot(slot)) throw new Error("Preset slot must be an integer from 0 to 15.");
    return this.runPresetCommand(async (characteristic) => {
      await this.writeReadDeleteCommand(characteristic, { action: "delete", slot });
      const response = await this.readResponse(characteristic);
      if (!isRecord(response) || response.ok !== true || response.deletedSlot !== slot) {
        throw new Error("Preset delete response is invalid or refers to a different slot.");
      }
    });
  }

  async readStatus(): Promise<DeviceStatus> {
    return parseStatus(await this.readResponse(this.requireCharacteristic(this.status)));
  }

  async subscribeStatus(callback: (status: DeviceStatus) => void) {
    const characteristic = this.requireCharacteristic(this.status);
    const version = this.connectionVersion;
    await characteristic.startNotifications();
    this.assertCurrent(characteristic, version);
    this.statusCallback = callback;
    characteristic.addEventListener("characteristicvaluechanged", this.onStatusChanged);
  }

  async subscribeTelemetry(callback: (telemetry: AudioTelemetry) => void) {
    const characteristic = this.requireCharacteristic(this.telemetry);
    const version = this.connectionVersion;
    await characteristic.startNotifications();
    this.assertCurrent(characteristic, version);
    this.telemetryCallback = callback;
    characteristic.addEventListener("characteristicvaluechanged", this.onTelemetryChanged);
  }

  private requireCharacteristic(characteristic?: BluetoothRemoteGATTCharacteristic) {
    if (!this.connected || !characteristic) throw new Error("Connect to MEFX-S3 before using BLE.");
    return characteristic;
  }

  private runPresetCommand<T>(operation: (characteristic: CharacteristicWithModernWrite) => Promise<T>): Promise<T> {
    const characteristic = this.requireCharacteristic(this.presetReadDelete);
    const version = this.connectionVersion;
    // Firmware shares one response buffer for list/read/delete, so keep each write/read transaction together.
    const result = this.commandQueue.then(async () => {
      this.assertCurrent(characteristic, version);
      const response = await operation(characteristic);
      this.assertCurrent(characteristic, version);
      return response;
    });
    this.commandQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertCurrent(characteristic: BluetoothRemoteGATTCharacteristic, version: number) {
    if (!this.connected || version !== this.connectionVersion
      || ![this.presetWrite, this.presetList, this.presetReadDelete, this.status, this.telemetry].includes(characteristic)) {
      throw new Error("MEFX-S3 disconnected during the operation.");
    }
  }

  private async readResponse(characteristic: BluetoothRemoteGATTCharacteristic): Promise<unknown> {
    const version = this.connectionVersion;
    this.assertCurrent(characteristic, version);
    const value = await characteristic.readValue();
    this.assertCurrent(characteristic, version);
    return parseResponse(value);
  }

  private async writeCharacteristic(characteristic: CharacteristicWithModernWrite, payload: Uint8Array<ArrayBuffer>) {
    const version = this.connectionVersion;
    this.assertCurrent(characteristic, version);
    if (characteristic.writeValueWithResponse) await characteristic.writeValueWithResponse(payload);
    else await characteristic.writeValue(payload);
    this.assertCurrent(characteristic, version);
  }

  private async writeReadDeleteCommand(
    characteristic: CharacteristicWithModernWrite,
    command: { action: "read" | "delete"; slot: number } | { action: "list"; offset: number }
  ) {
    const payload = new TextEncoder().encode(JSON.stringify(command));
    await this.writeCharacteristic(characteristic, payload);
  }
}
