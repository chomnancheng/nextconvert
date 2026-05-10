import { useState, useCallback, useEffect } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SizePreset = "reel" | "story" | "square" | "custom";

export const PRESET_LABELS: Record<SizePreset, string> = {
  reel:   "Facebook Reel (1080×1920)",
  story:  "Facebook Story (1080×1920)",
  square: "Facebook Square (1080×1080)",
  custom: "Custom size",
};

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type EncoderMode = "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";

/** cover = fill (crop), contain = shrink inside box, stretch = fill box (may distort). */
export type PhotoFitMode = "cover" | "contain" | "stretch";

export const PHOTO_FIT_LABELS: Record<PhotoFitMode, string> = {
  cover: "Cover (fill, crop edges)",
  contain: "Shrink (letterbox / inset)",
  stretch: "Fit (stretch to frame)",
};
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

export interface VideoBgSettings {
  enabled: boolean;
  folderPath: string;
  files: string[];
  fileCount: number;
  /** Hex color of the wash layer drawn between video bg and image overlay. */
  overlayColor: string;
  /** Opacity of the wash layer, 0–100. 0 = off. */
  overlayOpacity: number;
  /**
   * Max width/height for the PNG on the B-roll (50–100). Below 100 leaves visible video around the photo.
   */
  overlayImageMaxPercent: number;
}

export interface MetadataSettings {
  title: string;
  author: string;
  description: string;
}

export interface Settings {
  preset: SizePreset;
  customWidth: number;
  customHeight: number;
  duration: number;
  quality: number;
  watermark: WatermarkSettings;
  music: MusicSettings;
  videoBg: VideoBgSettings;
  metadata: MetadataSettings;
  /** Empty = auto (converted-datetime/ next to first input). Set = user-chosen fixed dir. */
  outputDir: string;
  encoder: EncoderMode;
  /** Still images and photo-on-B-roll framing. */
  photoFit: PhotoFitMode;
  /** Parallel FFmpeg jobs when converting a batch (1–8). */
  concurrentJobs: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  preset: "reel",
  customWidth: 1080,
  customHeight: 1920,
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
  videoBg: {
    enabled: false,
    folderPath: "",
    files: [],
    fileCount: 0,
    overlayColor: "#000000",
    overlayOpacity: 0,
    overlayImageMaxPercent: 100,
  },
  metadata: { title: "", author: "", description: "" },
  outputDir: "",
  encoder: "auto",
  photoFit: "cover",
  concurrentJobs: 4,
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

  const persistSettings = useCallback((next: Settings) => {
    void window.electronAPI.saveAllSettings({
      preset: next.preset,
      customWidth: next.customWidth,
      customHeight: next.customHeight,
      duration: next.duration,
      quality: next.quality,
      watermark: next.watermark,
      music: {
        enabled: next.music.enabled,
        folderPath: next.music.folderPath,
        volume: next.music.volume,
      },
      metadata: next.metadata,
      outputDir: next.outputDir,
      encoder: next.encoder,
      photoFit: next.photoFit,
      concurrentJobs: next.concurrentJobs,
      videoBgOverlay: {
        overlayColor: next.videoBg.overlayColor,
        overlayOpacity: next.videoBg.overlayOpacity,
        overlayImageMaxPercent: next.videoBg.overlayImageMaxPercent,
      },
    }).catch(() => {
      void window.electronAPI.saveOutputDir(next.outputDir);
      void window.electronAPI.saveGpuEncoder(next.encoder);
      void window.electronAPI.saveMusicEnabled(next.music.enabled);
    });
  }, []);

  const updateSettings = useCallback((updater: (prev: Settings) => Settings) => {
    setSettings((prev) => {
      const next = updater(prev);
      persistSettings(next);
      return next;
    });
  }, [persistSettings]);

  // Restore persisted settings once on mount
  useEffect(() => {
    window.electronAPI.getSavedSettings().then((saved) => {
      setSettings((s) => {
        const vbo = saved.videoBgOverlay;
        const next: Settings = {
          ...s,
          preset: saved.preset ?? s.preset,
          customWidth: saved.customWidth ?? s.customWidth,
          customHeight: saved.customHeight ?? s.customHeight,
          duration: saved.duration ?? s.duration,
          quality: saved.quality ?? s.quality,
          watermark: { ...s.watermark, ...(saved.watermark ?? {}) },
          music: { ...s.music, ...(saved.music ?? {}) },
          metadata: { ...s.metadata, ...(saved.metadata ?? {}) },
          videoBg: {
            ...s.videoBg,
            ...(vbo
              ? {
                  overlayColor: vbo.overlayColor,
                  overlayOpacity: vbo.overlayOpacity,
                  overlayImageMaxPercent: vbo.overlayImageMaxPercent,
                }
              : {}),
          },
          outputDir: saved.outputDir ?? s.outputDir,
          encoder: (saved.encoder as EncoderMode) ?? s.encoder,
          photoFit: (saved.photoFit as PhotoFitMode) ?? s.photoFit,
          concurrentJobs:
            typeof saved.concurrentJobs === "number"
              ? Math.min(8, Math.max(1, Math.round(saved.concurrentJobs)))
              : s.concurrentJobs,
        };

        if (next.music.folderPath) {
          window.electronAPI.scanMusicFolder(next.music.folderPath).then((result) => {
            setSettings((cur) => ({
              ...cur,
              music: { ...cur.music, files: result.files, fileCount: result.count },
            }));
          }).catch(() => {});
        }

        // Restore video bg folder
        window.electronAPI.getSavedVideoBgFolder().then((vbg) => {
          setSettings((cur) => ({
            ...cur,
            videoBg: {
              ...cur.videoBg,
              enabled: vbg.enabled,
              folderPath: vbg.folderPath,
              files: vbg.files,
              fileCount: vbg.count,
            },
          }));
        }).catch(() => {});

        return next;
      });
      setLoaded(true);
    }).catch((err) => {
      console.error("[useSettings] getSavedSettings failed:", err);
      setLoaded(true);
    });
    window.electronAPI.listEncoders().then((items) => {
      if (items.length > 0) {
        setEncoders(items.map((x) => ({ value: x.value as EncoderMode, label: x.label })));
      }
    }).catch(() => {});
  }, []);

  const setPreset = useCallback((preset: SizePreset) =>
    updateSettings((s) => ({ ...s, preset })), [updateSettings]);

  const setCustomSize = useCallback((patch: Partial<Pick<Settings, "customWidth" | "customHeight">>) =>
    updateSettings((s) => ({
      ...s,
      customWidth: patch.customWidth ?? s.customWidth,
      customHeight: patch.customHeight ?? s.customHeight,
    })), [updateSettings]);

  const setDuration = useCallback((duration: number) =>
    updateSettings((s) => ({ ...s, duration })), [updateSettings]);

  const setQuality = useCallback((quality: number) =>
    updateSettings((s) => ({ ...s, quality })), [updateSettings]);

  const setWatermark = useCallback((patch: Partial<WatermarkSettings>) =>
    updateSettings((s) => ({ ...s, watermark: { ...s.watermark, ...patch } })), [updateSettings]);

  const setMusic = useCallback((patch: Partial<MusicSettings>) => {
    updateSettings((s) => ({ ...s, music: { ...s.music, ...patch } }));
  }, [updateSettings]);

  const setVideoBg = useCallback((patch: Partial<VideoBgSettings>) => {
    updateSettings((s) => ({ ...s, videoBg: { ...s.videoBg, ...patch } }));
    // Persist enabled flag independently (like music)
    if (patch.enabled !== undefined) {
      void window.electronAPI.saveVideoBgEnabled(patch.enabled).catch(() => {});
    }
  }, [updateSettings]);

  const setMetadata = useCallback((patch: Partial<MetadataSettings>) =>
    updateSettings((s) => ({ ...s, metadata: { ...s.metadata, ...patch } })), [updateSettings]);

  const setOutputDir = useCallback((outputDir: string) => {
    updateSettings((s) => ({ ...s, outputDir }));
  }, [updateSettings]);

  const setEncoder = useCallback((encoder: EncoderMode) => {
    updateSettings((s) => ({ ...s, encoder }));
  }, [updateSettings]);

  const setPhotoFit = useCallback((photoFit: PhotoFitMode) => {
    updateSettings((s) => ({ ...s, photoFit }));
  }, [updateSettings]);

  const setConcurrentJobs = useCallback((concurrentJobs: number) => {
    const v = Math.min(8, Math.max(1, Math.round(concurrentJobs)));
    updateSettings((s) => ({ ...s, concurrentJobs: v }));
  }, [updateSettings]);

  const reset = useCallback(() => {
    void window.electronAPI.resetSettingsDefaults().catch(() => {
      // Fallback for older main process versions.
      void window.electronAPI.saveOutputDir("");
      void window.electronAPI.saveGpuEncoder("auto");
      void window.electronAPI.saveMusicEnabled(false);
    });
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    loaded,
    encoders,
    setPreset,
    setCustomSize,
    setDuration,
    setQuality,
    setWatermark,
    setMusic,
    setVideoBg,
    setMetadata,
    setOutputDir,
    setEncoder,
    setPhotoFit,
    setConcurrentJobs,
    reset,
  };
}
