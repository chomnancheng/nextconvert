import { useState, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SizePreset = "reel" | "story" | "square";

export const PRESET_LABELS: Record<SizePreset, string> = {
  reel:   "Facebook Reel (1080×1920)",
  story:  "Facebook Story (1080×1920)",
  square: "Facebook Square (1080×1080)",
};

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type EncoderMode = "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";
export interface EncoderOption {
  value: EncoderMode;
  label: string;
}

export interface WatermarkSettings {
  enabled: boolean;
  type: "text" | "image";
  text: string;
  imagePath: string;
  position: WatermarkPosition;
  opacity: number;
}

export interface MusicSettings {
  enabled: boolean;
  folderPath: string;
  files: string[];
  fileCount: number;
  volume: number;
}

export interface MetadataSettings {
  title: string;
  author: string;
  description: string;
}

export interface Settings {
  preset: SizePreset;
  duration: number;
  quality: number;
  watermark: WatermarkSettings;
  music: MusicSettings;
  metadata: MetadataSettings;
  /** Empty = auto (converted-datetime/ next to first input). Set = user-chosen fixed dir. */
  outputDir: string;
  encoder: EncoderMode;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  preset: "reel",
  duration: 59,
  quality: 80,
  watermark: {
    enabled: false,
    type: "text",
    text: "",
    imagePath: "",
    position: "bottom-right",
    opacity: 80,
  },
  music: {
    enabled: false,
    folderPath: "",
    files: [],
    fileCount: 0,
    volume: 80,
  },
  metadata: { title: "", author: "", description: "" },
  outputDir: "",
  encoder: "auto",
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [encoders, setEncoders] = useState<EncoderOption[]>([
    { value: "auto", label: "Auto (recommended)" },
    { value: "cpu", label: "CPU (libx264)" },
  ]);

  // Restore persisted settings once on mount
  useEffect(() => {
    window.electronAPI.getSavedSettings().then((saved) => {
      setSettings((s) => {
        let next = { ...s };

        // Restore output dir
        if (saved.outputDir) {
          next = { ...next, outputDir: saved.outputDir };
        }
        if (saved.gpuEncoder) {
          next = { ...next, encoder: saved.gpuEncoder as EncoderMode };
        }

        // Restore music folder + enabled state
        if (saved.musicFolderPath) {
          next = {
            ...next,
            music: {
              ...next.music,
              enabled: saved.musicEnabled,
              folderPath: saved.musicFolderPath,
            },
          };
          // Re-scan the folder to get current file list
          window.electronAPI.scanMusicFolder(saved.musicFolderPath).then((result) => {
            setSettings((cur) => ({
              ...cur,
              music: { ...cur.music, files: result.files, fileCount: result.count },
            }));
          });
        } else {
          next = { ...next, music: { ...next.music, enabled: saved.musicEnabled } };
        }

        return next;
      });
      setLoaded(true);
    });
    window.electronAPI.listEncoders().then((items) => {
      if (items.length > 0) {
        setEncoders(items.map((x) => ({ value: x.value as EncoderMode, label: x.label })));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreset = useCallback((preset: SizePreset) =>
    setSettings((s) => ({ ...s, preset })), []);

  const setDuration = useCallback((duration: number) =>
    setSettings((s) => ({ ...s, duration })), []);

  const setQuality = useCallback((quality: number) =>
    setSettings((s) => ({ ...s, quality })), []);

  const setWatermark = useCallback((patch: Partial<WatermarkSettings>) =>
    setSettings((s) => ({ ...s, watermark: { ...s.watermark, ...patch } })), []);

  const setMusic = useCallback((patch: Partial<MusicSettings>) => {
    // Persist enabled state whenever it changes
    if (patch.enabled !== undefined) {
      window.electronAPI.saveMusicEnabled(patch.enabled);
    }
    setSettings((s) => ({ ...s, music: { ...s.music, ...patch } }));
  }, []);

  const setMetadata = useCallback((patch: Partial<MetadataSettings>) =>
    setSettings((s) => ({ ...s, metadata: { ...s.metadata, ...patch } })), []);

  const setOutputDir = useCallback((outputDir: string) => {
    // Persist whenever changed
    window.electronAPI.saveOutputDir(outputDir);
    setSettings((s) => ({ ...s, outputDir }));
  }, []);

  const setEncoder = useCallback((encoder: EncoderMode) => {
    window.electronAPI.saveGpuEncoder(encoder);
    setSettings((s) => ({ ...s, encoder }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return {
    settings,
    loaded,
    encoders,
    setPreset,
    setDuration,
    setQuality,
    setWatermark,
    setMusic,
    setMetadata,
    setOutputDir,
    setEncoder,
    reset,
  };
}
