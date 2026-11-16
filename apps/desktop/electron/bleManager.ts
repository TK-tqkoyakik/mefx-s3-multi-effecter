import { spawn } from "node:child_process";

export const bleContract = {
  deviceName: "MEFX-S3",
  serviceUuid: "7d8f0000-8b7d-4c2a-9a61-7e39f5d20100",
  characteristics: {
    presetWrite: "7d8f0001-8b7d-4c2a-9a61-7e39f5d20100",
    presetList: "7d8f0002-8b7d-4c2a-9a61-7e39f5d20100",
    presetReadDelete: "7d8f0003-8b7d-4c2a-9a61-7e39f5d20100",
    deviceStatus: "7d8f0004-8b7d-4c2a-9a61-7e39f5d20100",
    audioTelemetry: "7d8f0005-8b7d-4c2a-9a61-7e39f5d20100"
  }
};

export type BleDeviceCandidate = {
  name: string;
  id: string;
  status?: string;
};

export type BleBridgeStatus = {
  available: boolean;
  strategy: "windows-pnp-diagnostics" | "native-gatt-pending";
  connected: boolean;
  deviceName?: string;
  lastError?: string;
  contract: typeof bleContract;
};

let connected = false;
let deviceName = "";
let lastError = "Native GATT bridge is planned. Current implementation exposes diagnostics and scan candidates.";

function runPowerShell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with ${code}`));
    });
  });
}

export function bleStatus(): BleBridgeStatus {
  return {
    available: true,
    strategy: connected ? "native-gatt-pending" : "windows-pnp-diagnostics",
    connected,
    deviceName: deviceName || undefined,
    lastError,
    contract: bleContract
  };
}

export async function scanBleDevices(): Promise<{ devices: BleDeviceCandidate[]; status: BleBridgeStatus }> {
  try {
    const command = [
      "$devices = Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue |",
      "Select-Object FriendlyName,Status,InstanceId;",
      "$devices | ConvertTo-Json -Compress"
    ].join(" ");
    const output = await runPowerShell(command);
    const parsed = output ? JSON.parse(output) : [];
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const devices = rows
      .filter(Boolean)
      .map((item) => ({
        name: String(item.FriendlyName || "Bluetooth device"),
        id: String(item.InstanceId || ""),
        status: item.Status ? String(item.Status) : undefined
      }))
      .filter((item) => item.name || item.id);
    lastError = devices.length > 0 ? "" : "No Bluetooth PnP devices were returned by Windows.";
    return { devices, status: bleStatus() };
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Could not scan Bluetooth diagnostics.";
    return { devices: [], status: bleStatus() };
  }
}

export async function connectBleDevice(candidate?: BleDeviceCandidate): Promise<BleBridgeStatus> {
  deviceName = candidate?.name || bleContract.deviceName;
  connected = false;
  lastError = "Native Windows GATT connection is not implemented yet. Use Simulator until the C#/WinRT bridge is added.";
  return bleStatus();
}

export async function disconnectBleDevice(): Promise<BleBridgeStatus> {
  connected = false;
  deviceName = "";
  lastError = "Disconnected native BLE placeholder.";
  return bleStatus();
}

export async function unsupportedBleOperation(operation: string): Promise<never> {
  throw new Error(`${operation} requires the native Windows GATT bridge planned after this diagnostic bridge.`);
}
