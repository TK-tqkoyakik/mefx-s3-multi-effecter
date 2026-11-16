/// <reference types="vite/client" />

import type { DesktopApi } from "./lib/desktopApi";

declare global {
  interface Window {
    mefxDesktop?: DesktopApi;
  }

  interface Navigator {
    bluetooth: Bluetooth;
  }

  interface Bluetooth {
    requestDevice(options: {
      filters?: Array<{ services?: BluetoothServiceUUID[]; namePrefix?: string }>;
      optionalServices?: BluetoothServiceUUID[];
    }): Promise<BluetoothDevice>;
  }

  interface BluetoothDevice extends EventTarget {
    readonly name?: string;
    readonly gatt?: BluetoothRemoteGATTServer;
  }

  interface BluetoothRemoteGATTServer {
    readonly connected: boolean;
    connect(): Promise<BluetoothRemoteGATTServer>;
    disconnect(): void;
    getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
  }

  interface BluetoothRemoteGATTService {
    getCharacteristic(characteristic: BluetoothCharacteristicUUID): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    readonly value?: DataView;
    readValue(): Promise<DataView>;
    writeValue(value: BufferSource): Promise<void>;
    writeValueWithResponse?: (value: BufferSource) => Promise<void>;
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  }

  type BluetoothServiceUUID = string;
  type BluetoothCharacteristicUUID = string;
}

export {};
