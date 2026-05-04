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
    getSavedSettings: () => Promise<SavedSettings>;
    pickMusicTrack: (folderPath: string, minDuration: number) => Promise<string | null>;
  };
}
