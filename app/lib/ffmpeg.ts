/**
 * FFmpeg service — runs entirely in the Electron main process (Node.js).
 * Never import this from renderer code.
 *
 * Public API:
 *   convertOne(options, onProgress)  — single image → single video (with optional audio)
 *   convert(options, onProgress)     — alias kept for IPC compat, calls convertOne
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import type { ChildProcess } from "child_process";
// eslint-disable-next-line @typescript-eslint/no-require-imports
let ffmpegBin: string = "";

const getFfmpegPath = (): string => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const staticPath = require("ffmpeg-static") as string;
    if (staticPath) {
      // In a packaged Electron app the binary lives in app.asar.unpacked,
      // but require() still returns the app.asar path — fix it up.
      return staticPath.replace(/app\.asar([/\\])/, "app.asar.unpacked$1");
    }
  } catch (e) {
    console.error("[ffmpeg] require failed:", e);
  }
  return "";
};

ffmpegBin = getFfmpegPath();
console.log("[ffmpeg] binary:", ffmpegBin);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SizePreset = "reel" | "story" | "square";
export type EncoderMode = "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";

const PRESETS: Record<SizePreset, [number, number]> = {
  reel:   [1080, 1920],
  story:  [1080, 1920],
  square: [1080, 1080],
};

export interface ConvertOptions {
  /** Single input image path */
  input: string;
  /** Absolute path to output mp4. If set, overrides batchDir logic entirely. */
  outputPath?: string;
  /**
   * Subdirectory name for this batch, e.g. "converted-2026-05-04-1430".
   * Created next to each input image. Defaults to "converted" if omitted.
   */
  batchDir?: string;
  preset?: SizePreset;
  /** 0–100, default 80 */
  quality?: number;
  /** Total video duration in seconds, default 59 */
  duration?: number;
  /** Absolute path to audio track. Omit for silent video. */
  audioPath?: string;
  /** Audio volume 0–100, default 80 */
  audioVolume?: number;
  /** Encoder profile selected by user. */
  encoder?: EncoderMode;
}

// Legacy shape used by IPC — kept for backwards compat with useConvert
export interface ConvertOptionsLegacy {
  inputs?: string[];
  input?: string;
  outputPath?: string;
  batchDir?: string;
  preset?: SizePreset;
  quality?: number;
  imageDuration?: number;
  singleDuration?: number;
  duration?: number;
  audioPath?: string;
  audioVolume?: number;
  encoder?: EncoderMode;
}

export interface ConvertResult {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

export type ProgressCallback = (percent: number) => void;
const activeJobs = new Map<string, ChildProcess>();
const cancelledJobs = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qualityToCrf(quality: number): number {
  const q = Math.max(0, Math.min(100, quality));
  return Math.round(51 - (q / 100) * 51);
}

function scaleFilter(w: number, h: number): string {
  return (
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1`
  );
}

/**
 * Resolve the output file path.
 *
 * Logic:
 * - If an explicit outputPath is given, use it (parent dir created if needed).
 * - Otherwise build: <baseDir>/converted-YYYY-MM-DD-HHmm/<imageName>_reel.mp4
 *   where baseDir is either the user-chosen outputDir or the directory of the input image.
 *
 * The `batchDir` parameter (e.g. "converted-2026-05-04-1430") is computed once
 * per batch by the caller so all images in one run land in the same folder.
 */
function resolveOutputPath(
  inputPath: string,
  outputPath: string | undefined,
  batchDir: string,
): string {
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    return outputPath;
  }
  // baseDir is the directory of the input image
  const dir = path.join(path.dirname(inputPath), batchDir);
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(inputPath, path.extname(inputPath));
  return path.join(dir, `${base}_reel.mp4`);
}

function runFfmpeg(
  jobId: string,
  args: string[],
  totalSeconds: number,
  onProgress: ProgressCallback,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
    activeJobs.set(jobId, proc);
    const chunks: string[] = [];

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      chunks.push(chunk);
      const m = /time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(chunk);
      if (m && totalSeconds > 0) {
        const elapsed =
          parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 +
          parseInt(m[3]) + parseInt(m[4]) / 100;
        onProgress(Math.min(99, Math.round((elapsed / totalSeconds) * 100)));
      }
    });

    proc.on("close", (code) => {
      activeJobs.delete(jobId);
      const wasCancelled = cancelledJobs.has(jobId);
      if (wasCancelled) cancelledJobs.delete(jobId);
      onProgress(100);
      resolve({
        code: code ?? 1,
        stderr: `${chunks.join("")}${wasCancelled ? "\n__CANCELLED__" : ""}`,
      });
    });
  });
}

function resolveVideoEncoder(mode: EncoderMode): string {
  if (mode === "cpu") return "libx264";
  if (mode === "nvidia") return "h264_nvenc";
  if (mode === "intel") return "h264_qsv";
  if (mode === "amd") return process.platform === "win32" ? "h264_amf" : "h264_videotoolbox";
  if (mode === "apple") return "h264_videotoolbox";
  return "libx264";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a single image to a video.
 *
 * With audio:
 *   ffmpeg -loop 1 -i image.jpg \
 *          -stream_loop -1 -i track.mp3 \
 *          -vf "scale+pad+setsar" \
 *          -c:v libx264 -crf N -preset fast -pix_fmt yuv420p \
 *          -c:a aac -b:a 192k -af "volume=V" \
 *          -t DURATION -shortest \
 *          -movflags +faststart -y output.mp4
 *
 * Without audio:
 *   ffmpeg -loop 1 -i image.jpg \
 *          -vf "scale+pad+setsar" \
 *          -c:v libx264 -crf N -preset fast -pix_fmt yuv420p \
 *          -t DURATION \
 *          -movflags +faststart -y output.mp4
 */
export async function convertOne(
  options: ConvertOptions,
  onProgress: ProgressCallback = () => {},
  jobId = "single",
): Promise<ConvertResult> {
  const {
    input,
    preset = "reel",
    quality = 80,
    duration = 59,
    audioPath,
    audioVolume = 80,
    batchDir = "converted",
    encoder = "auto",
  } = options;

  if (!input?.trim()) {
    return { ok: false, error: "No input file path provided." };
  }

  const [w, h] = PRESETS[preset];
  const crf = qualityToCrf(quality);
  const outputPath = resolveOutputPath(input, options.outputPath, batchDir);
  const vol = Math.max(0, Math.min(100, audioVolume)) / 100;
  const videoEncoder = resolveVideoEncoder(encoder);

  const args: string[] = [
    // Video input — loop the single image
    "-loop", "1",
    "-i", input,
  ];

  if (audioPath?.trim()) {
    // Audio input — loop so short tracks cover the full duration
    args.push("-stream_loop", "-1", "-i", audioPath);
  }

  args.push(
    "-vf", scaleFilter(w, h),
    "-c:v", videoEncoder,
    "-crf", String(crf),
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
  );

  if (audioPath?.trim()) {
    args.push(
      "-c:a", "aac",
      "-b:a", "192k",
      "-af", `volume=${vol.toFixed(3)}`,
      // Stop at video duration — don't let looped audio extend beyond it
      "-t", String(duration),
      "-shortest",
    );
  } else {
    args.push("-t", String(duration));
  }

  args.push("-movflags", "+faststart", "-y", outputPath);

  const { code, stderr } = await runFfmpeg(jobId, args, duration, onProgress);

  if (code !== 0) {
    if (stderr.includes("__CANCELLED__")) {
      return { ok: false, error: "Conversion canceled by user." };
    }
    return { ok: false, error: `FFmpeg exited with code ${code}.\n${stderr.slice(-1500)}` };
  }

  return { ok: true, outputPath };
}

/**
 * IPC entry point — accepts the legacy ConvertOptionsLegacy shape
 * and normalises it before calling convertOne.
 * Always converts a single image (batch is handled by useConvert).
 */
export async function convert(
  raw: ConvertOptionsLegacy,
  onProgress: ProgressCallback = () => {},
  jobId = "single",
): Promise<ConvertResult> {
  // Normalise: accept either `input` (new) or `inputs[0]` (legacy)
  const input = raw.input ?? raw.inputs?.[0] ?? "";
  const duration = raw.duration ?? raw.singleDuration ?? raw.imageDuration ?? 59;

  return convertOne(
    {
      input,
      outputPath: raw.outputPath,
      batchDir: raw.batchDir,
      preset: raw.preset,
      quality: raw.quality,
      duration,
      audioPath: raw.audioPath,
      audioVolume: raw.audioVolume,
      encoder: raw.encoder,
    },
    onProgress,
    jobId,
  );
}

export function cancelConvert(jobId: string): boolean {
  const proc = activeJobs.get(jobId);
  if (!proc) return false;
  cancelledJobs.add(jobId);
  try {
    proc.kill("SIGTERM");
    return true;
  } catch {
    return false;
  }
}
