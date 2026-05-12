import { useState, useCallback, useEffect, useRef } from "react";
import type { Settings } from "@/renderer/hooks/useSettings";
import type { ImageFile } from "@/renderer/hooks/useImageFiles";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Which set of files drives the output count. */
export type ConvertMode = "by-images" | "by-videos";
export type ConvertStatus = "idle" | "running" | "done" | "error";
export type FileStatus = "pending" | "running" | "done" | "error";

export interface FileProgress {
  status: FileStatus;
  progress: number;
  outputPath?: string;
  /** MP4 size after successful encode */
  outputSizeBytes?: number;
  error?: string;
}

export interface ConvertState {
  status: ConvertStatus;
  /** Keys are image file IDs in by-images mode, or "v_N" in by-videos mode. */
  fileProgress: Record<string, FileProgress>;
  outputPaths: string[];
  errorMessage: string | null;
}

const INITIAL: ConvertState = {
  status: "idle",
  fileProgress: {},
  outputPaths: [],
  errorMessage: null,
};

const DEFAULT_CONCURRENCY = 4;

function clampConcurrency(n: number): number {
  return Math.min(8, Math.max(1, Math.round(n)));
}

function effectiveConcurrency(settingsConcurrency: number | undefined, taskCount: number): number {
  return Math.min(clampConcurrency(settingsConcurrency ?? DEFAULT_CONCURRENCY), taskCount);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBatchDirName(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `converted-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Non-repeating shuffle queue — cycles through all items before repeating.
 * Returns null when the pool is empty.
 */
class ShuffleQueue<T> {
  private pool: T[];
  private queue: T[] = [];

  constructor(items: T[]) {
    this.pool = [...items];
  }

  pick(): T | null {
    if (this.pool.length === 0) return null;
    if (this.queue.length === 0) {
      this.queue = shuffleInPlace([...this.pool]);
    }
    return this.queue.pop()!;
  }
}

function dirname(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]*$/, "");
}

function basename(filePath: string): string {
  return (filePath.split(/[\\/]/).pop() ?? filePath).replace(/\.[^.]+$/, "");
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useConvert() {
  const [state, setState] = useState<ConvertState>(INITIAL);
  const stopRequestedRef = useRef(false);
  const activeJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = window.electronAPI.onConvertProgress(() => {});
    return unsub;
  }, []);

  const run = useCallback(
    async (images: ImageFile[], mode: ConvertMode, settings: Settings) => {
      stopRequestedRef.current = false;
      activeJobIdsRef.current.clear();

      // ── Determine primary items (drive output count) ──────────────────────
      // by-images: each uploaded image becomes one output
      // by-videos: each video bg clip becomes one output; images are overlaid randomly
      const videoBgFiles = settings.videoBg.enabled ? settings.videoBg.files : [];
      const primaryPaths: string[] = mode === "by-images"
        ? images.map((f) => f.path)
        : videoBgFiles;
      const primaryIds: string[] = mode === "by-images"
        ? images.map((f) => f.id)
        : videoBgFiles.map((_, i) => `v_${i}`);

      if (primaryPaths.length === 0) {
        setState((s) => ({
          ...s,
          status: "error",
          errorMessage:
            mode === "by-images"
              ? "No images in the list. Drop or browse to add images."
              : "No video background clips found. Enable video background and pick a folder in Settings.",
        }));
        return;
      }

      const batchDir = makeBatchDirName();
      const batchId = Math.random().toString(36).slice(2);

      const initProgress: Record<string, FileProgress> = {};
      for (const id of primaryIds) {
        initProgress[id] = { status: "pending", progress: 0 };
      }
      setState({ status: "running", fileProgress: initProgress, outputPaths: [], errorMessage: null });

      // ── Shuffle queues (non-repeating) ────────────────────────────────────
      const musicQueue =
        settings.music.enabled && settings.music.files.length > 0
          ? new ShuffleQueue(settings.music.files)
          : null;

      // In by-images mode: video bg clips are picked randomly per image
      // In by-videos mode: images are picked randomly as overlays per video
      const videoBgQueue = mode === "by-images" && videoBgFiles.length > 0
        ? new ShuffleQueue(videoBgFiles)
        : null;
      const imageQueue = mode === "by-videos" && images.length > 0
        ? new ShuffleQueue(images)
        : null;

      const produced: string[] = [];
      const errors: string[] = [];

      // ── Build task closures ───────────────────────────────────────────────
      let taskIndex = 0;
      const tasks = primaryPaths.map((primaryPath, i) => async () => {
        if (stopRequestedRef.current) return;

        const itemId = primaryIds[i];
        const jobId = `${batchId}_${i}`;
        activeJobIdsRef.current.add(jobId);

        setState((s) => ({
          ...s,
          fileProgress: { ...s.fileProgress, [itemId]: { status: "running", progress: 0 } },
        }));

        // Pick random audio (non-repeat)
        const audioPath = musicQueue?.pick() ?? undefined;

        // Determine video/image inputs based on mode
        let input: string;
        let inputIsVideo: boolean;
        let overlayImagePath: string | undefined;
        let outputBase: string;

        if (mode === "by-images") {
          // Primary = image; optionally pick a video bg as the visual background
          const videoBg = videoBgQueue?.pick() ?? null;
          if (videoBg) {
            // Video background mode: video loops behind, image centered on top
            input = videoBg.trim();
            inputIsVideo = true;
            overlayImagePath = primaryPath;
          } else {
            // Classic image-loop mode
            input = primaryPath;
            inputIsVideo = false;
            overlayImagePath = undefined;
          }
          outputBase = basename(primaryPath);
        } else {
          // Primary = video bg clip; optionally overlay a randomly-picked image
          const overlayImage = imageQueue?.pick();
          input = primaryPath;
          inputIsVideo = true;
          overlayImagePath = overlayImage?.path;
          outputBase = basename(primaryPath);
        }

        // Compute explicit output path so naming is always predictable
        const contentDir = mode === "by-images" ? dirname(primaryPath) : dirname(primaryPath);
        const outDir = settings.outputDir
          ? `${settings.outputDir}/${batchDir}`
          : `${contentDir}/${batchDir}`;
        const outputPath = `${outDir}/${outputBase}_reel.mp4`;

        const options: ConvertOptions = {
          input,
          inputIsVideo,
          overlayImagePath,
          overlayColor: inputIsVideo ? settings.videoBg.overlayColor : undefined,
          overlayOpacity: inputIsVideo ? settings.videoBg.overlayOpacity : undefined,
          overlayImageMaxPercent: inputIsVideo ? settings.videoBg.overlayImageMaxPercent : undefined,
          photoFit: settings.photoFit,
          outputPath,
          batchDir,
          preset: settings.preset,
          customWidth: settings.customWidth,
          customHeight: settings.customHeight,
          quality: settings.quality,
          duration: settings.duration,
          audioPath,
          audioVolume: settings.music.volume,
          encoder: settings.encoder,
        };

        // Subscribe to this job's progress events
        const progressUnsub = window.electronAPI.onConvertProgress((id, pct) => {
          if (id !== jobId) return;
          setState((s) => ({
            ...s,
            fileProgress: {
              ...s.fileProgress,
              [itemId]: { ...s.fileProgress[itemId], status: "running", progress: pct },
            },
          }));
        });

        let result: ConvertResult;
        try {
          result = await window.electronAPI.convert(jobId, options);
        } catch (err) {
          result = {
            ok: false,
            error: err instanceof Error ? err.message : "Failed to invoke conversion.",
          };
        }
        progressUnsub();
        activeJobIdsRef.current.delete(jobId);

        if (stopRequestedRef.current) {
          setState((s) => ({
            ...s,
            fileProgress: {
              ...s.fileProgress,
              [itemId]: { status: "error", progress: 0, error: "Cancelled" },
            },
          }));
          return;
        }

        if (result.ok && result.outputPath) {
          produced.push(result.outputPath);
          setState((s) => ({
            ...s,
            outputPaths: [...s.outputPaths, result.outputPath!],
            fileProgress: {
              ...s.fileProgress,
              [itemId]: {
                status: "done",
                progress: 100,
                outputPath: result.outputPath,
                outputSizeBytes: result.outputSizeBytes,
              },
            },
          }));
        } else {
          const errMsg = result.error ?? "unknown error";
          const label = primaryPath.split(/[\\/]/).pop() ?? primaryPath;
          errors.push(`${label}: ${errMsg}`);
          setState((s) => ({
            ...s,
            fileProgress: {
              ...s.fileProgress,
              [itemId]: { status: "error", progress: 0, error: errMsg },
            },
          }));
        }
      });

      // ── Work-stealing concurrency runner ──────────────────────────────────
      async function worker() {
        while (!stopRequestedRef.current) {
          const myIndex = taskIndex++;
          if (myIndex >= tasks.length) break;
          await tasks[myIndex]();
        }
      }
      await Promise.all(
        Array.from(
          { length: effectiveConcurrency(settings.concurrentJobs, tasks.length) },
          worker,
        ),
      );

      if (stopRequestedRef.current) {
        setState((s) => ({
          ...s,
          status: "idle",
          errorMessage:
            produced.length > 0
              ? "Conversion stopped. Partial output was saved."
              : "Conversion stopped.",
        }));
        return;
      }

      setState((s) => ({
        ...s,
        status: produced.length === 0 ? "error" : "done",
        errorMessage:
          produced.length === 0
            ? errors.join("\n")
            : errors.length > 0
              ? `${errors.length} file(s) failed:\n${errors.join("\n")}`
              : null,
      }));
    },
    [],
  );

  const reset = useCallback(() => setState(INITIAL), []);

  const stop = useCallback(async () => {
    stopRequestedRef.current = true;
    for (const jobId of activeJobIdsRef.current) {
      await window.electronAPI.cancelConvert(jobId);
    }
  }, []);

  return { ...state, run, reset, stop };
}
