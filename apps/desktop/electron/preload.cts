import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mefxDesktop", {
  appName: "MEFX-S3 Desktop",
  phase: "phase-4",
  storage: {
    loadPresets: () => ipcRenderer.invoke("storage:load-presets"),
    savePresets: (presets: unknown[]) => ipcRenderer.invoke("storage:save-presets", presets),
    loadImpulseResponses: () => ipcRenderer.invoke("storage:load-irs"),
    saveImpulseResponses: (responses: unknown[]) => ipcRenderer.invoke("storage:save-irs", responses),
    readImpulseResponseFile: (filePath: string) => ipcRenderer.invoke("storage:read-ir-file", filePath),
    deleteImpulseResponse: (response: unknown) => ipcRenderer.invoke("storage:delete-ir", response),
    checkImpulseResponseFiles: () => ipcRenderer.invoke("storage:check-ir-files"),
    loadSettings: () => ipcRenderer.invoke("storage:load-settings"),
    saveSettings: (settings: unknown) => ipcRenderer.invoke("storage:save-settings", settings),
    notices: () => ipcRenderer.invoke("storage:notices"),
    exportBackup: () => ipcRenderer.invoke("storage:export-backup"),
    importBackup: () => ipcRenderer.invoke("storage:import-backup")
  },
  analyzer: {
    status: () => ipcRenderer.invoke("analyzer:status"),
    dependencies: () => ipcRenderer.invoke("analyzer:dependencies"),
    health: () => ipcRenderer.invoke("analyzer:health"),
    start: () => ipcRenderer.invoke("analyzer:start"),
    stop: () => ipcRenderer.invoke("analyzer:stop"),
    analyze: (request: unknown) => ipcRenderer.invoke("analyzer:analyze", request),
    progress: (requestId: string) => ipcRenderer.invoke("analyzer:progress", requestId),
    cancel: (requestId: string) => ipcRenderer.invoke("analyzer:cancel", requestId)
  },
  audioFile: {
    select: () => ipcRenderer.invoke("audio-file:select"),
    convert: (request: unknown) => ipcRenderer.invoke("audio-file:convert", request),
    process: (request: unknown) => ipcRenderer.invoke("audio-file:process", request),
    cancel: (requestId: string) => ipcRenderer.invoke("audio-file:cancel", requestId),
    status: (requestId: string) => ipcRenderer.invoke("audio-file:status", requestId)
  },
  ble: {
    status: () => ipcRenderer.invoke("ble:status"),
    scan: () => ipcRenderer.invoke("ble:scan"),
    connect: (candidate: unknown) => ipcRenderer.invoke("ble:connect", candidate),
    disconnect: () => ipcRenderer.invoke("ble:disconnect"),
    sendPreset: (preset: unknown) => ipcRenderer.invoke("ble:send-preset", preset),
    listPresets: () => ipcRenderer.invoke("ble:list-presets"),
    readPreset: (slot: number) => ipcRenderer.invoke("ble:read-preset", slot),
    deletePreset: (slot: number) => ipcRenderer.invoke("ble:delete-preset", slot)
  }
});
