import type { AudioTelemetry, DeviceStatus, Preset } from "../types";

const SERVICE_UUID = "7d8f0000-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_WRITE_UUID = "7d8f0001-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_LIST_UUID = "7d8f0002-8b7d-4c2a-9a61-7e39f5d20100";
const PRESET_READ_DELETE_UUID = "7d8f0003-8b7d-4c2a-9a61-7e39f5d20100";
const DEVICE_STATUS_UUID = "7d8f0004-8b7d-4c2a-9a61-7e39f5d20100";
const AUDIO_TELEMETRY_UUID = "7d8f0005-8b7d-4c2a-9a61-7e39f5d20100";

type CharacteristicWithModernWrite = BluetoothRemoteGATTCharacteristic & {
  writeValueWithResponse?: (value: BufferSource) => Promise<void>;
};

export type BleConnectionMode = "idle" | "device" | "simulator";

export type BleConnectionInfo = {
  mode: BleConnectionMode;
  connected: boolean;
  supportsWebBluetooth: boolean;
  secureContext: boolean;
  deviceName?: string;
  serviceReady: boolean;
};

export type DevicePresetSummary = {
  slot: number;
  name: string;
  instrument: "guitar" | "bass";
  source: "manual" | "youtube";
};

export class MefxBleClient {
  private device?: BluetoothDevice;
  private server?: BluetoothRemoteGATTServer;
  private presetWrite?: CharacteristicWithModernWrite;
  private presetList?: BluetoothRemoteGATTCharacteristic;
  private presetReadDelete?: CharacteristicWithModernWrite;
  private status?: BluetoothRemoteGATTCharacteristic;
  private telemetry?: BluetoothRemoteGATTCharacteristic;
  private mode: BleConnectionMode = "idle";
  private simulatedPresets: Preset[] = [];
  private statusCallbacks: Array<(status: DeviceStatus) => void> = [];
  private telemetryCallbacks: Array<(telemetry: AudioTelemetry) => void> = [];
  private disconnectCallbacks: Array<() => void> = [];
  private telemetryTimer?: number;

  readonly supportsWebBluetooth = "bluetooth" in navigator;
  readonly secureContext = window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";

  get info(): BleConnectionInfo {
    return {
      mode: this.mode,
      connected: this.connected,
      supportsWebBluetooth: this.supportsWebBluetooth,
      secureContext: this.secureContext,
      deviceName: this.device?.name,
      serviceReady:
        this.mode === "simulator" ||
        Boolean(this.presetWrite && this.presetList && this.presetReadDelete && this.status && this.telemetry)
    };
  }

  onDisconnect(callback: () => void): void {
    this.disconnectCallbacks.push(callback);
  }

  enableSimulation(): void {
    this.mode = "simulator";
  }

  async connect(): Promise<void> {
    if (this.mode === "simulator") {
      this.startSimulation();
      return;
    }

    if (!this.supportsWebBluetooth) {
      throw new Error("This browser does not support Web Bluetooth. Use Chrome or Edge on this PC.");
    }

    if (!this.secureContext) {
      throw new Error("Web Bluetooth requires localhost or HTTPS.");
    }

    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }, { namePrefix: "MEFX" }],
      optionalServices: [SERVICE_UUID]
    });
    this.device.addEventListener("gattserverdisconnected", () => {
      this.resetGatt();
      this.disconnectCallbacks.forEach((callback) => callback());
    });

    this.server = await this.device.gatt?.connect();
    const service = await this.server?.getPrimaryService(SERVICE_UUID);
    if (!service) throw new Error("MEFX service not found");

    this.presetWrite = await service.getCharacteristic(PRESET_WRITE_UUID);
    this.presetList = await service.getCharacteristic(PRESET_LIST_UUID);
    this.presetReadDelete = await service.getCharacteristic(PRESET_READ_DELETE_UUID);
    this.status = await service.getCharacteristic(DEVICE_STATUS_UUID);
    this.telemetry = await service.getCharacteristic(AUDIO_TELEMETRY_UUID);
    this.mode = "device";
  }

  disconnect(): void {
    if (this.mode === "simulator") {
      this.mode = "idle";
      window.clearInterval(this.telemetryTimer);
      this.publishSimulatedStatus();
      return;
    }
    this.device?.gatt?.disconnect();
    this.resetGatt();
  }

  get connected(): boolean {
    return this.mode === "simulator" || Boolean(this.device?.gatt?.connected);
  }

  get simulationActive(): boolean {
    return this.mode === "simulator";
  }

  async sendPreset(preset: Preset): Promise<void> {
    if (this.mode === "simulator") {
      this.simulatedPresets = [
        preset,
        ...this.simulatedPresets.filter((item) => item.name !== preset.name)
      ].slice(0, 16);
      this.publishSimulatedStatus();
      return;
    }
    if (!this.presetWrite) throw new Error("Connect to MEFX-S3 first");
    const payload = new TextEncoder().encode(JSON.stringify(preset));
    if (this.presetWrite.writeValueWithResponse) {
      await this.presetWrite.writeValueWithResponse(payload);
    } else {
      await this.presetWrite.writeValue(payload);
    }
  }

  async listDevicePresets(): Promise<DevicePresetSummary[]> {
    if (this.mode === "simulator") {
      return this.simulatedPresets.map((preset, slot) => ({
        slot,
        name: preset.name,
        instrument: preset.instrument,
        source: preset.source
      }));
    }
    if (!this.presetList) throw new Error("Connect to MEFX-S3 first");
    const value = await this.presetList.readValue();
    return JSON.parse(new TextDecoder().decode(value)) as DevicePresetSummary[];
  }

  async readDevicePreset(slot: number): Promise<Preset> {
    if (this.mode === "simulator") {
      const preset = this.simulatedPresets[slot];
      if (!preset) throw new Error(`Simulator slot ${slot} is empty`);
      return preset;
    }
    if (!this.presetReadDelete) throw new Error("Connect to MEFX-S3 first");
    const payload = new TextEncoder().encode(JSON.stringify({ action: "read", slot }));
    if (this.presetReadDelete.writeValueWithResponse) {
      await this.presetReadDelete.writeValueWithResponse(payload);
    } else {
      await this.presetReadDelete.writeValue(payload);
    }
    const value = await this.presetReadDelete.readValue();
    return JSON.parse(new TextDecoder().decode(value)) as Preset;
  }

  async deleteDevicePreset(slot: number): Promise<void> {
    if (this.mode === "simulator") {
      this.simulatedPresets = this.simulatedPresets.filter((_, index) => index !== slot);
      this.publishSimulatedStatus();
      return;
    }
    if (!this.presetReadDelete) throw new Error("Connect to MEFX-S3 first");
    const payload = new TextEncoder().encode(JSON.stringify({ action: "delete", slot }));
    if (this.presetReadDelete.writeValueWithResponse) {
      await this.presetReadDelete.writeValueWithResponse(payload);
    } else {
      await this.presetReadDelete.writeValue(payload);
    }
  }

  async subscribeStatus(callback: (status: DeviceStatus) => void): Promise<void> {
    if (this.mode === "simulator") {
      this.statusCallbacks.push(callback);
      this.publishSimulatedStatus();
      return;
    }
    if (!this.status) return;
    callback(await this.readDeviceStatus());
    await this.status.startNotifications();
    this.status.addEventListener("characteristicvaluechanged", (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      callback(JSON.parse(new TextDecoder().decode(value)));
    });
  }

  async readDeviceStatus(): Promise<DeviceStatus> {
    if (this.mode === "simulator") {
      const active = this.simulatedPresets[0];
      return {
        connected: true,
        instrument: active?.instrument ?? "guitar",
        activeSlot: 0,
        bypass: active?.bypass ?? false,
        supplyMv: 9000
      };
    }
    if (!this.status) throw new Error("Connect to MEFX-S3 first");
    const value = await this.status.readValue();
    return JSON.parse(new TextDecoder().decode(value)) as DeviceStatus;
  }

  async subscribeTelemetry(callback: (telemetry: AudioTelemetry) => void): Promise<void> {
    if (this.mode === "simulator") {
      this.telemetryCallbacks.push(callback);
      return;
    }
    if (!this.telemetry) return;
    await this.telemetry.startNotifications();
    this.telemetry.addEventListener("characteristicvaluechanged", (event) => {
      const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
      if (!value) return;
      callback(JSON.parse(new TextDecoder().decode(value)));
    });
  }

  private startSimulation(): void {
    this.mode = "simulator";
    if (this.simulatedPresets.length === 0) {
      this.simulatedPresets.push({
        instrument: "guitar",
        name: "SIM Clean",
        effects: {
          gain: 45,
          tone_eq: 55,
          compressor: 25,
          drive: 10,
          modulation: 0,
          delay_reverb: 15
        },
        bypass: false,
        createdAt: new Date().toISOString(),
        source: "manual"
      });
    }
    this.publishSimulatedStatus();
    window.clearInterval(this.telemetryTimer);
    this.telemetryTimer = window.setInterval(() => {
      const t = Date.now() / 700;
      const level = 0.35 + Math.sin(t) * 0.2;
      this.telemetryCallbacks.forEach((callback) =>
        callback({
          inputLevel: Math.max(0, Math.min(1, level)),
          preOutputLevel: Math.max(0, Math.min(1, level * 0.82)),
          micLevel: Math.max(0, Math.min(1, 0.22 + Math.cos(t * 0.7) * 0.12)),
          clip: level > 0.9
        })
      );
    }, 300);
  }

  private publishSimulatedStatus(): void {
    const active = this.simulatedPresets[0];
    this.statusCallbacks.forEach((callback) =>
      callback({
        connected: this.mode === "simulator",
        instrument: active?.instrument ?? "guitar",
        activeSlot: 0,
        bypass: active?.bypass ?? false,
        supplyMv: 9000
      })
    );
  }

  private resetGatt(): void {
    window.clearInterval(this.telemetryTimer);
    this.server = undefined;
    this.presetWrite = undefined;
    this.presetList = undefined;
    this.presetReadDelete = undefined;
    this.status = undefined;
    this.telemetry = undefined;
    if (this.mode === "device") this.mode = "idle";
  }
}
