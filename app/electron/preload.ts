import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { ConvertOptionsLegacy, ConvertResult } from "../lib/ffmpeg";

export interface MusicScanResult {
  files: string[];
  count: number;
}

export interface MusicSavedFolder extends MusicScanResult {
  folderPath: string;
  enabled: boolean;
}

export interface SavedSettings {
  preset: "reel" | "story" | "square" | "custom";
  customWidth: number;
  customHeight: number;
  duration: number;
  quality: number;
  watermark: {
    enabled: boolean;
    type: "text" | "image";
    text: string;
    imagePath: string;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity: number;
  };
  music: {
    enabled: boolean;
    folderPath: string;
    volume: number;
  };
  metadata: {
    title: string;
    author: string;
    description: string;
  };
  outputDir: string;
  encoder: "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";
}

export interface EncoderOption {
  value: string;
  label: string;
}

export interface UpdateCheckResult {
  ok: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

export interface UpdateDownloadResult {
  ok: boolean;
  filePath?: string;
  latestVersion?: string;
  error?: string;
}

export interface ElectronAPI {
  openFiles: () => Promise<string[]>;
  openFolder: () => Promise<string[]>;
  pickFolder: () => Promise<string>;
  convert: (jobId: string, options: ConvertOptionsLegacy) => Promise<ConvertResult>;
  onConvertProgress: (cb: (jobId: string, percent: number) => void) => () => void;
  showItem: (filePath: string) => Promise<void>;
  imageToDataUrl: (filePath: string) => Promise<string>;
  /** Get the absolute filesystem path for a File object (works with contextIsolation). */
  getFilePath: (file: File) => string;
  /** Scan folder for audio files (mp3 + mp4), persist path + enabled state. */
  scanMusicFolder: (dir: string) => Promise<MusicScanResult>;
  /** Return last-used music folder + enabled state. */
  getSavedMusicFolder: () => Promise<MusicSavedFolder>;
  /** Persist music enabled state. */
  saveMusicEnabled: (enabled: boolean) => Promise<void>;
  /** Persist output directory. */
  saveOutputDir: (dir: string) => Promise<void>;
  saveGpuEncoder: (encoder: string) => Promise<void>;
  saveAllSettings: (settings: SavedSettings) => Promise<void>;
  resetSettingsDefaults: () => Promise<void>;
  /** Load all persisted settings at startup. */
  getSavedSettings: () => Promise<SavedSettings>;
  pickMusicTrack: (folderPath: string, minDuration: number) => Promise<string | null>;
  cancelConvert: (jobId: string) => Promise<{ ok: boolean }>;
  listEncoders: () => Promise<EncoderOption[]>;
  checkForUpdates: () => Promise<UpdateCheckResult>;
  downloadLatestUpdate: () => Promise<UpdateDownloadResult>;
  minimizeWindow: () => Promise<void>;
  toggleMaximizeWindow: () => Promise<boolean>;
  isWindowMaximized: () => Promise<boolean>;
  closeWindow: () => Promise<void>;
}

contextBridge.exposeInMainWorld("electronAPI", {
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),

  convert: (jobId: string, options: ConvertOptionsLegacy) =>
    ipcRenderer.invoke("convert:run", jobId, options),

  onConvertProgress: (cb: (jobId: string, percent: number) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { jobId: string; percent: number },
    ) => cb(payload.jobId, payload.percent);
    ipcRenderer.on("convert:progress", handler);
    return () => ipcRenderer.off("convert:progress", handler);
  },

  showItem: (filePath: string) => ipcRenderer.invoke("shell:showItem", filePath),
  imageToDataUrl: (filePath: string) => ipcRenderer.invoke("image:toDataUrl", filePath),

  // webUtils.getPathForFile is the official Electron API for getting file paths
  // in contextIsolation renderers — replaces the non-standard File.path property.
  getFilePath: (file: File): string => {
    try {
      return webUtils.getPathForFile(file) ?? "";
    } catch {
      return "";
    }
  },

  scanMusicFolder: (dir: string) => ipcRenderer.invoke("music:scanFolder", dir),
  getSavedMusicFolder: () => ipcRenderer.invoke("music:getSavedFolder"),
  saveMusicEnabled: (enabled: boolean) => ipcRenderer.invoke("music:saveEnabled", enabled),
  saveOutputDir: (dir: string) => ipcRenderer.invoke("settings:saveOutputDir", dir),
  saveGpuEncoder: (encoder: string) => ipcRenderer.invoke("settings:saveGpuEncoder", encoder),
  saveAllSettings: (settings: SavedSettings) => ipcRenderer.invoke("settings:saveAll", settings),
  resetSettingsDefaults: () => ipcRenderer.invoke("settings:resetDefaults"),
  getSavedSettings: () => ipcRenderer.invoke("settings:getSaved"),
  pickMusicTrack: (folderPath: string, minDuration: number) =>
    ipcRenderer.invoke("music:pickTrack", folderPath, minDuration),
  cancelConvert: (jobId: string) => ipcRenderer.invoke("convert:cancel", jobId),
  listEncoders: () => ipcRenderer.invoke("encoder:list"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadLatestUpdate: () => ipcRenderer.invoke("update:downloadLatest"),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:maximizeToggle"),
  isWindowMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
} satisfies ElectronAPI);
