import { useState, useCallback, useEffect, useRef } from "react";
import type { Settings } from "@/renderer/hooks/useSettings";

export type ConvertStatus = "idle" | "running" | "done" | "error";

export interface ConvertState {
  status: ConvertStatus;
  progress: number;
  currentLabel: string;
  outputPaths: string[];
  errorMessage: string | null;
}

const INITIAL: ConvertState = {
  status: "idle",
  progress: 0,
  currentLabel: "",
  outputPaths: [],
  errorMessage: null,
};

/** "converted-2026-05-04-1430" */
function makeBatchDirName(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `converted-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export function useConvert() {
  const [state, setState] = useState<ConvertState>(INITIAL);
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Keep a subscription open just to satisfy the API; actual progress is
    // subscribed per-job inside run()
    const unsub = window.electronAPI.onConvertProgress(() => {});
    return unsub;
  }, []);

  const run = useCallback(async (allInputs: string[], settings: Settings) => {
    const inputs = allInputs.filter((p) => p.trim().length > 0);
    if (inputs.length === 0) {
      setState((s) => ({
        ...s,
        status: "error",
        errorMessage: "No file paths found. Try Browse files or drag & drop from Finder.",
      }));
      return;
    }

    // One batchDir name shared across all images in this run
    const batchDir = makeBatchDirName();
    const batchId = Math.random().toString(36).slice(2);

    setState({ status: "running", progress: 0, currentLabel: "", outputPaths: [], errorMessage: null });

    const produced: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const imagePath = inputs[i];
      const jobId = `${batchId}_${i}`;
      jobIdRef.current = jobId;

      const basePercent = Math.round((i / inputs.length) * 100);
      const sliceSize = Math.round(100 / inputs.length);

      setState((s) => ({
        ...s,
        progress: basePercent,
        currentLabel: inputs.length > 1 ? `Image ${i + 1} of ${inputs.length}` : "Converting…",
      }));

      // Pick a random music track for this video if music is enabled
      let audioPath: string | undefined;
      if (settings.music.enabled && settings.music.folderPath && settings.music.fileCount > 0) {
        const track = await window.electronAPI.pickMusicTrack(
          settings.music.folderPath,
          settings.duration,
        );
        audioPath = track ?? undefined;
      }

      // Output path:
      // - If user picked a base output dir: <outputDir>/<batchDir>/<name>_reel.mp4
      // - Otherwise: leave outputPath undefined → ffmpeg places next to input in batchDir
      let outputPath: string | undefined;
      if (settings.outputDir) {
        const base = imagePath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") ?? "output";
        outputPath = `${settings.outputDir}/${batchDir}/${base}_reel.mp4`;
      }
      // When outputPath is undefined, batchDir is passed and used by ffmpeg.ts
      // to create <inputFileDir>/batchDir/<name>_reel.mp4

      const options: ConvertOptions = {
        input: imagePath,
        outputPath,
        batchDir,           // used when outputPath is undefined
        preset: settings.preset,
        quality: settings.quality,
        duration: settings.duration,
        audioPath,
        audioVolume: settings.music.volume,
      };

      // Subscribe to this specific job's progress
      const progressUnsub = window.electronAPI.onConvertProgress((id, pct) => {
        if (id !== jobId) return;
        const overall = basePercent + Math.round((pct / 100) * sliceSize);
        setState((s) => ({ ...s, progress: Math.min(99, overall) }));
      });

      const result = await window.electronAPI.convert(jobId, options);
      progressUnsub();

      if (result.ok && result.outputPath) {
        produced.push(result.outputPath);
      } else {
        const name = imagePath.split(/[\\/]/).pop() ?? imagePath;
        errors.push(`${name}: ${result.error ?? "unknown error"}`);
      }
    }

    jobIdRef.current = null;

    if (produced.length === 0) {
      setState({
        status: "error", progress: 0, currentLabel: "", outputPaths: [],
        errorMessage: errors.join("\n"),
      });
    } else {
      setState({
        status: "done", progress: 100, currentLabel: "", outputPaths: produced,
        errorMessage: errors.length > 0
          ? `${errors.length} file(s) failed:\n${errors.join("\n")}`
          : null,
      });
    }
  }, []);

  const reset = useCallback(() => setState(INITIAL), []);

  return { ...state, run, reset };
}
