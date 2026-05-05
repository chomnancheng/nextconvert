/// <reference types="vite/client" />

type SizePreset = "reel" | "story" | "square";

interface ConvertOptions {
  input?: string;
  inputs?: string[];
  outputPath?: string;
  batchDir?: string;
  preset?: SizePreset;
  quality?: number;
  duration?: number;
  imageDuration?: number;
  singleDuration?: number;
  audioPath?: string;
  audioVolume?: number;
  encoder?: "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";
}

interface ConvertResult {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

interface MusicScanResult {
  files: string[];
  count: number;
}

interface MusicSavedFolder extends MusicScanResult {
  folderPath: string;
  enabled: boolean;
}

interface SavedSettings {
  musicFolderPath: string;
  musicEnabled: boolean;
  outputDir: string;
  gpuEncoder: string;
}

interface EncoderOption {
  value: string;
  label: string;
}

interface UpdateCheckResult {
  ok: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

interface UpdateDownloadResult {
  ok: boolean;
  filePath?: string;
  latestVersion?: string;
  error?: string;
}

interface Window {
  electronAPI: {
    openFiles: () => Promise<string[]>;
    openFolder: () => Promise<string[]>;
    pickFolder: () => Promise<string>;
    convert: (jobId: string, options: ConvertOptions) => Promise<ConvertResult>;
    onConvertProgress: (cb: (jobId: string, percent: number) => void) => () => void;
    showItem: (filePath: string) => Promise<void>;
    getFilePath: (file: File) => string;
    scanMusicFolder: (dir: string) => Promise<MusicScanResult>;
    getSavedMusicFolder: () => Promise<MusicSavedFolder>;
    saveMusicEnabled: (enabled: boolean) => Promise<void>;
    saveOutputDir: (dir: string) => Promise<void>;
    saveGpuEncoder: (encoder: string) => Promise<void>;
    getSavedSettings: () => Promise<SavedSettings>;
    pickMusicTrack: (folderPath: string, minDuration: number) => Promise<string | null>;
    cancelConvert: (jobId: string) => Promise<{ ok: boolean }>;
    listEncoders: () => Promise<EncoderOption[]>;
    checkForUpdates: () => Promise<UpdateCheckResult>;
    downloadLatestUpdate: () => Promise<UpdateDownloadResult>;
  };
}
