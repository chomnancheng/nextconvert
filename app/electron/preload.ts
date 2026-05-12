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

export type SavedPhotoFit = "cover" | "contain" | "stretch";

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
  photoFit?: SavedPhotoFit;
  concurrentJobs?: number;
  videoBgOverlay?: {
    overlayColor: string;
    overlayOpacity: number;
    overlayImageMaxPercent: number;
  };
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

export interface TemplateRecord {
  id: string;
  name: string;
  profileImage: string;
  profileName: string;
  postDate: string;
  readMoreText: string;
  commentLink: string;
  createdAt: string;
}

export interface ElectronAPI {
  getDeviceId: () => Promise<string>;
  getDeviceName: () => Promise<string>;
  openFiles: () => Promise<string[]>;
  openFolder: () => Promise<string[]>;
  pickFolder: () => Promise<string>;
  convert: (jobId: string, options: ConvertOptionsLegacy) => Promise<ConvertResult>;
  onConvertProgress: (cb: (jobId: string, percent: number) => void) => () => void;
  showItem: (filePath: string) => Promise<void>;
  imageToDataUrl: (filePath: string) => Promise<string>;
  /** Byte size per absolute path for existing files */
  getFileSizes: (paths: string[]) => Promise<Record<string, number>>;
  /** Get the absolute filesystem path for a File object (works with contextIsolation). */
  getFilePath: (file: File) => string;
  /** Scan folder for audio files (mp3 + mp4), persist path + enabled state. */
  scanMusicFolder: (dir: string) => Promise<MusicScanResult>;
  /** Return last-used music folder + enabled state. */
  getSavedMusicFolder: () => Promise<MusicSavedFolder>;
  /** Persist music enabled state. */
  saveMusicEnabled: (enabled: boolean) => Promise<void>;
  /** Scan folder for video background clips, persist path. */
  scanVideoBgFolder: (dir: string) => Promise<MusicScanResult>;
  /** Return last-used video background folder + enabled state. */
  getSavedVideoBgFolder: () => Promise<MusicSavedFolder>;
  /** Persist video background enabled state. */
  saveVideoBgEnabled: (enabled: boolean) => Promise<void>;
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
  /** Templates CRUD */
  getTemplates: () => Promise<TemplateRecord[]>;
  saveTemplates: (templates: TemplateRecord[]) => Promise<void>;
  /** Paragraph mode: save rendered PNG to temp dir, returns absolute path */
  saveParagraphTempImage: (base64Data: string, filename: string) => Promise<string>;
  /** Remove the paragraph temp dir after conversion */
  cleanupParagraphTemp: () => Promise<void>;
}

contextBridge.exposeInMainWorld("electronAPI", {
  getDeviceId: () => ipcRenderer.invoke("device:getId"),
  getDeviceName: () => ipcRenderer.invoke("device:getName"),
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
  getFileSizes: (paths: string[]) => ipcRenderer.invoke("file:getSizes", paths),

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
  scanVideoBgFolder: (dir: string) => ipcRenderer.invoke("videobg:scanFolder", dir),
  getSavedVideoBgFolder: () => ipcRenderer.invoke("videobg:getSavedFolder"),
  saveVideoBgEnabled: (enabled: boolean) => ipcRenderer.invoke("videobg:saveEnabled", enabled),
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
  getTemplates: () => ipcRenderer.invoke("templates:getAll"),
  saveTemplates: (templates) => ipcRenderer.invoke("templates:saveAll", templates),
  saveParagraphTempImage: (base64Data: string, filename: string) =>
    ipcRenderer.invoke("paragraph:saveTempImage", base64Data, filename),
  cleanupParagraphTemp: () => ipcRenderer.invoke("paragraph:cleanupTemp"),
} satisfies ElectronAPI);
