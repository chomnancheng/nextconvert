/// <reference types="vite/client" />

type SizePreset = "reel" | "story" | "square" | "custom";

type PhotoFitMode = "cover" | "contain" | "stretch";

interface ConvertOptions {
  input?: string;
  inputs?: string[];
  /** When true, input is a video background; otherwise a looped still image. */
  inputIsVideo?: boolean;
  /** Still image to overlay centered on a video background. */
  overlayImagePath?: string;
  /** Hex color (e.g. "#000000") for the color wash between video bg and image overlay. */
  overlayColor?: string;
  /** Opacity of the color wash, 0–100. */
  overlayOpacity?: number;
  /** Max size of PNG on B-roll, 50–100 (% of frame). */
  overlayImageMaxPercent?: number;
  /** cover | contain | stretch */
  photoFit?: PhotoFitMode;
  outputNameBase?: string;
  outputPath?: string;
  batchDir?: string;
  preset?: SizePreset;
  customWidth?: number;
  customHeight?: number;
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
  outputSizeBytes?: number;
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
  preset: SizePreset;
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
  photoFit?: "cover" | "contain" | "stretch";
  concurrentJobs?: number;
  videoBgOverlay?: {
    overlayColor: string;
    overlayOpacity: number;
    overlayImageMaxPercent: number;
  };
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
    imageToDataUrl: (filePath: string) => Promise<string>;
    getFileSizes: (paths: string[]) => Promise<Record<string, number>>;
    getFilePath: (file: File) => string;
    scanMusicFolder: (dir: string) => Promise<MusicScanResult>;
    getSavedMusicFolder: () => Promise<MusicSavedFolder>;
    saveMusicEnabled: (enabled: boolean) => Promise<void>;
    scanVideoBgFolder: (dir: string) => Promise<MusicScanResult>;
    getSavedVideoBgFolder: () => Promise<MusicSavedFolder>;
    saveVideoBgEnabled: (enabled: boolean) => Promise<void>;
    saveOutputDir: (dir: string) => Promise<void>;
    saveGpuEncoder: (encoder: string) => Promise<void>;
    saveAllSettings: (settings: SavedSettings) => Promise<void>;
    resetSettingsDefaults: () => Promise<void>;
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
  };
}
