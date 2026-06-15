import type { EffectKey, Instrument, PresetSource } from "./types";

export type Language = "ja" | "en";

export const languageOptions: { value: Language; label: string }[] = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" }
];

export const languageStorageKey = "mefx.language";

export type Messages = {
  appTitle: string;
  language: string;
  connect: string;
  connected: string;
  disconnect: string;
  simulator: string;
  manualEditor: string;
  youtubeToneMatch: string;
  save: string;
  sendToDevice: string;
  youtubeUrl: string;
  targetPart: string;
  analyzeAndCreate: string;
  status: string;
  devicePresets: string;
  localPresets: string;
  refresh: string;
  load: string;
  noDevicePresets: string;
  noSavedPresets: string;
  name: string;
  instrument: string;
  bypass: string;
  ready: string;
  connectingMessage: string;
  connectedMessage: (name?: string) => string;
  disconnectedMessage: string;
  simulatorConnected: string;
  bleConnectionFailed: string;
  simulatorConnectionFailed: string;
  presetSendFailed: string;
  localSaveMessage: (name: string) => string;
  localDeleteMessage: (name: string) => string;
  sentMessage: (name: string) => string;
  loadedDevicePresets: string;
  couldNotLoadDevicePresets: string;
  loadedDevicePreset: (slot: number) => string;
  couldNotReadDevicePreset: string;
  deletedDeviceSlot: (slot: number) => string;
  couldNotDeleteDevicePreset: string;
  analyzingTone: string;
  analysisFailed: string;
  bluetoothPanelTitle: string;
  bluetoothPanelBody: string;
  pcBluetoothReady: string;
  pcBluetoothUnsupported: string;
  pcBluetoothInsecure: string;
  realDeviceMode: string;
  simulatorMode: string;
  idleMode: string;
  serviceReady: string;
  serviceNotReady: string;
  selectedDevice: string;
  noSelectedDevice: string;
  connectionChecklistTitle: string;
  connectionChecklist: string[];
  deviceLine: (instrument: Instrument, slot: number, bypass: boolean) => string;
  telemetryLine: (input: string, output: string, mic: string) => string;
  slotLabel: (slot: number, name: string) => string;
  deleteDeviceSlotLabel: (slot: number) => string;
  loadDeviceSlotLabel: (slot: number) => string;
  deleteLocalPresetLabel: (name: string) => string;
  instruments: Record<Instrument, string>;
  sources: Record<PresetSource, string>;
  effects: Record<EffectKey, string>;
};

export const messages: Record<Language, Messages> = {
  ja: {
    appTitle: "マルチエフェクター操作",
    language: "言語",
    connect: "実機に接続",
    connected: "接続済み",
    disconnect: "切断",
    simulator: "シミュレーター",
    manualEditor: "手動エディター",
    youtubeToneMatch: "YouTube音色コピー",
    save: "保存",
    sendToDevice: "MEFX-S3へ送信",
    youtubeUrl: "YouTube URL",
    targetPart: "対象パート",
    analyzeAndCreate: "解析してプリセット作成",
    status: "状態",
    devicePresets: "本体プリセット",
    localPresets: "ローカルプリセット",
    refresh: "更新",
    load: "読み込み",
    noDevicePresets: "本体プリセットはまだ読み込まれていません。",
    noSavedPresets: "保存済みプリセットはまだありません。",
    name: "名前",
    instrument: "楽器",
    bypass: "バイパス",
    ready: "準備完了",
    connectingMessage: "Bluetoothデバイスを検索しています。表示された一覧からMEFX-S3を選んでください。",
    connectedMessage: (name) => `${name || "MEFX-S3"}に接続しました`,
    disconnectedMessage: "Bluetooth接続が切断されました",
    simulatorConnected: "シミュレーターに接続しました。ESP32なしで動作確認できます。",
    bleConnectionFailed: "BLE接続に失敗しました",
    simulatorConnectionFailed: "シミュレーター接続に失敗しました",
    presetSendFailed: "プリセット送信に失敗しました",
    localSaveMessage: (name) => `「${name}」をローカルに保存しました`,
    localDeleteMessage: (name) => `「${name}」を削除しました`,
    sentMessage: (name) => `「${name}」を本体へ送信しました`,
    loadedDevicePresets: "本体プリセット一覧を読み込みました",
    couldNotLoadDevicePresets: "本体プリセット一覧を読み込めませんでした",
    loadedDevicePreset: (slot) => `本体スロット${slot}をエディターに読み込みました`,
    couldNotReadDevicePreset: "本体プリセットを読み込めませんでした",
    deletedDeviceSlot: (slot) => `本体スロット${slot}を削除しました`,
    couldNotDeleteDevicePreset: "本体プリセットを削除できませんでした",
    analyzingTone: "ローカルサーバーで音色を解析中...",
    analysisFailed: "解析に失敗しました",
    bluetoothPanelTitle: "PC Bluetooth接続",
    bluetoothPanelBody:
      "PCのChromeまたはEdgeでMEFX-S3実機へ接続します。シミュレーターとは別なので、実機接続では必ずBluetooth選択画面が開きます。",
    pcBluetoothReady: "このブラウザはWeb Bluetoothを使用できます。",
    pcBluetoothUnsupported: "このブラウザはWeb Bluetoothに対応していません。PC版ChromeまたはEdgeで開いてください。",
    pcBluetoothInsecure: "Web BluetoothにはlocalhostまたはHTTPSが必要です。現在のURLでは接続できません。",
    realDeviceMode: "実機接続",
    simulatorMode: "シミュレーター",
    idleMode: "未接続",
    serviceReady: "GATTサービス準備完了",
    serviceNotReady: "GATTサービス未確認",
    selectedDevice: "選択中のデバイス",
    noSelectedDevice: "未選択",
    connectionChecklistTitle: "実機接続前チェック",
    connectionChecklist: [
      "ESP32-S3にファームウェアを書き込む",
      "ESP32-S3をUSBまたは9V電源で起動する",
      "PCのBluetoothをオンにする",
      "接続ボタンを押し、MEFX-S3を選ぶ"
    ],
    deviceLine: (instrument, slot, bypass) =>
      `本体 ${messages.ja.instruments[instrument]} / スロット ${slot} / ${bypass ? "バイパス" : "有効"}`,
    telemetryLine: (input, output, mic) => `入力 ${input}% / 出力前 ${output}% / マイク ${mic}%`,
    slotLabel: (slot, name) => `スロット ${slot}: ${name}`,
    deleteDeviceSlotLabel: (slot) => `本体スロット${slot}を削除`,
    loadDeviceSlotLabel: (slot) => `本体スロット${slot}を読み込み`,
    deleteLocalPresetLabel: (name) => `${name}を削除`,
    instruments: { guitar: "ギター", bass: "ベース" },
    sources: { manual: "手動", youtube: "YouTube" },
    effects: {
      gain: "ゲイン",
      tone_eq: "トーン / EQ",
      compressor: "コンプレッサー",
      drive: "ドライブ",
      modulation: "モジュレーション",
      delay_reverb: "ディレイ / リバーブ"
    }
  },
  en: {
    appTitle: "Multi Effecter Control",
    language: "Language",
    connect: "Connect Device",
    connected: "Connected",
    disconnect: "Disconnect",
    simulator: "Simulator",
    manualEditor: "Manual Editor",
    youtubeToneMatch: "YouTube Tone Match",
    save: "Save",
    sendToDevice: "Send to MEFX-S3",
    youtubeUrl: "YouTube URL",
    targetPart: "Target part",
    analyzeAndCreate: "Analyze and Create Preset",
    status: "Status",
    devicePresets: "Device Presets",
    localPresets: "Local Presets",
    refresh: "Refresh",
    load: "Load",
    noDevicePresets: "No device presets loaded.",
    noSavedPresets: "No saved presets yet.",
    name: "Name",
    instrument: "Instrument",
    bypass: "Bypass",
    ready: "Ready",
    connectingMessage: "Searching for Bluetooth devices. Select MEFX-S3 from the browser picker.",
    connectedMessage: (name) => `Connected to ${name || "MEFX-S3"}`,
    disconnectedMessage: "Bluetooth connection was disconnected",
    simulatorConnected: "Simulator connected. You can test without an ESP32.",
    bleConnectionFailed: "BLE connection failed",
    simulatorConnectionFailed: "Simulator connection failed",
    presetSendFailed: "Preset send failed",
    localSaveMessage: (name) => `Saved "${name}" locally`,
    localDeleteMessage: (name) => `Deleted "${name}"`,
    sentMessage: (name) => `Sent "${name}" to device`,
    loadedDevicePresets: "Loaded device preset list",
    couldNotLoadDevicePresets: "Could not load device presets",
    loadedDevicePreset: (slot) => `Loaded device slot ${slot} into the editor`,
    couldNotReadDevicePreset: "Could not read device preset",
    deletedDeviceSlot: (slot) => `Deleted device slot ${slot}`,
    couldNotDeleteDevicePreset: "Could not delete device preset",
    analyzingTone: "Analyzing tone on local server...",
    analysisFailed: "Analysis failed",
    bluetoothPanelTitle: "PC Bluetooth Connection",
    bluetoothPanelBody:
      "Connect this PC's Chrome or Edge directly to the MEFX-S3 device. Real device connection is separate from simulator mode.",
    pcBluetoothReady: "This browser can use Web Bluetooth.",
    pcBluetoothUnsupported: "This browser does not support Web Bluetooth. Open the app in desktop Chrome or Edge.",
    pcBluetoothInsecure: "Web Bluetooth requires localhost or HTTPS. The current URL cannot connect.",
    realDeviceMode: "Real device",
    simulatorMode: "Simulator",
    idleMode: "Disconnected",
    serviceReady: "GATT service ready",
    serviceNotReady: "GATT service not verified",
    selectedDevice: "Selected device",
    noSelectedDevice: "None",
    connectionChecklistTitle: "Before Connecting",
    connectionChecklist: [
      "Flash the firmware to the ESP32-S3",
      "Power the ESP32-S3 from USB or 9V",
      "Turn on Bluetooth on this PC",
      "Press connect and choose MEFX-S3"
    ],
    deviceLine: (instrument, slot, bypass) =>
      `Device ${messages.en.instruments[instrument]} / slot ${slot} / ${bypass ? "bypass" : "active"}`,
    telemetryLine: (input, output, mic) => `In ${input}% / Out ${output}% / Mic ${mic}%`,
    slotLabel: (slot, name) => `Slot ${slot}: ${name}`,
    deleteDeviceSlotLabel: (slot) => `Delete device slot ${slot}`,
    loadDeviceSlotLabel: (slot) => `Load device slot ${slot}`,
    deleteLocalPresetLabel: (name) => `Delete ${name}`,
    instruments: { guitar: "Guitar", bass: "Bass" },
    sources: { manual: "manual", youtube: "youtube" },
    effects: {
      gain: "Gain",
      tone_eq: "Tone / EQ",
      compressor: "Compressor",
      drive: "Drive",
      modulation: "Modulation",
      delay_reverb: "Delay / Reverb"
    }
  }
};

export function getInitialLanguage(): Language {
  const saved = localStorage.getItem(languageStorageKey);
  if (saved === "ja" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}
