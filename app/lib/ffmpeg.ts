/**
 * FFmpeg service — runs entirely in the Electron main process (Node.js).
 * Never import this from renderer code.
 *
 * Two public functions:
 *   convertSingle   — single image  → 5-second video
 *   convertSlideshow — multiple images → slideshow video
 *
 * Both accept a ConvertOptions bag and a progress callback, and return a
 * ConvertResult with the output path or an error message.
 */

import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
// ffmpeg-static exports the binary path as a plain string (CJS default export)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = require("ffmpeg-static") as string;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SizePreset = "reel" | "story" | "square";

/** Map preset name → [width, height] */
const PRESETS: Record<SizePreset, [number, number]> = {
  reel:   [1080, 1920], // Facebook Reel (default)
  story:  [1080, 1920], // Facebook Story
  square: [1080, 1080], // Facebook Square
};

export interface ConvertOptions {
  /** Absolute paths to input images (order matters for slideshow) */
  inputs: string[];
  /**
   * Absolute path to the output file (must end in .mp4).
   * If omitted, output is placed in a `converted/` sibling of the first input.
   */
  outputPath?: string;
  /** Canvas size preset — defaults to "reel" (1080x1920) */
  preset?: SizePreset;
  /**
   * Quality 0–100 (higher = better, larger file).
   * Maps linearly to FFmpeg CRF: quality 100 → CRF 0, quality 0 → CRF 51.
   * Default: 80 → CRF ~10
   */
  quality?: number;
  /** Duration per image in seconds for slideshow mode. Default: 3 */
  imageDuration?: number;
  /** Duration of the single-image video in seconds. Default: 5 */
  singleDuration?: number;
}

export interface ConvertResult {
  ok: boolean;
  outputPath?: string;
  /** Human-readable error message when ok === false */
  error?: string;
}

/** Called periodically during conversion with 0–100 progress */
export type ProgressCallback = (percent: number) => void;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Convert quality 0–100 → FFmpeg CRF 51–0 (inverse scale) */
function qualityToCrf(quality: number): number {
  const clamped = Math.max(0, Math.min(100, quality));
  return Math.round(51 - (clamped / 100) * 51);
}

/**
 * Build the scale+pad+setsar filter that fits an image onto a canvas of the
 * given size with letterboxing, preserving aspect ratio.
 *
 * Equivalent CLI fragment:
 *   scale=W:H:force_original_aspect_ratio=decrease,
 *   pad=W:H:(ow-iw)/2:(oh-ih)/2:color=black,
 *   setsar=1
 */
function scaleFilter(width: number, height: number): string {
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1`
  );
}

/**
 * Resolve the output path. If not provided, place the file in a `converted/`
 * directory next to the first input image.
 */
function resolveOutputPath(
  inputs: string[],
  outputPath: string | undefined,
  suffix: string,
): string {
  if (outputPath) return outputPath;

  const firstInput = inputs[0];
  const dir = path.join(path.dirname(firstInput), "converted");
  fs.mkdirSync(dir, { recursive: true });

  const baseName = path.basename(firstInput, path.extname(firstInput));
  return path.join(dir, `${baseName}${suffix}.mp4`);
}

/**
 * Run an FFmpeg command described by `args`, call `onProgress` with 0–100,
 * and resolve with exit code + collected stderr lines.
 *
 * Progress is estimated from the `time=HH:MM:SS.cc` token in FFmpeg stderr
 * against a known total duration in seconds.
 */
function runFfmpeg(
  args: string[],
  totalSeconds: number,
  onProgress: ProgressCallback,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "ignore", "pipe"] });
    const stderrLines: string[] = [];

    proc.stderr.setEncoding("utf8");
    proc.stderr.on("data", (chunk: string) => {
      stderrLines.push(chunk);

      // Parse time= token to derive progress percentage
      // FFmpeg emits lines like: "frame=  30 fps= 25 ... time=00:00:01.20 ..."
      const match = /time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(chunk);
      if (match && totalSeconds > 0) {
        const elapsed =
          parseInt(match[1]) * 3600 +
          parseInt(match[2]) * 60 +
          parseInt(match[3]) +
          parseInt(match[4]) / 100;
        const percent = Math.min(100, Math.round((elapsed / totalSeconds) * 100));
        onProgress(percent);
      }
    });

    proc.on("close", (code) => {
      onProgress(100);
      resolve({ code: code ?? 1, stderr: stderrLines.join("") });
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a single image to a static video clip.
 *
 * FFmpeg command (simplified):
 *   ffmpeg -loop 1 -i input.jpg
 *          -vf "scale=W:H:...,pad=...,setsar=1"
 *          -c:v libx264 -crf CRF -preset fast
 *          -t DURATION -pix_fmt yuv420p
 *          -y output.mp4
 */
export async function convertSingle(
  options: ConvertOptions,
  onProgress: ProgressCallback = () => {},
): Promise<ConvertResult> {
  const { inputs, preset = "reel", quality = 80, singleDuration = 5 } = options;

  if (inputs.length === 0) {
    return { ok: false, error: "No input file provided." };
  }

  const [width, height] = PRESETS[preset];
  const crf = qualityToCrf(quality);
  const outputPath = resolveOutputPath(inputs, options.outputPath, "_reel");

  const args = [
    "-loop", "1",
    "-i", inputs[0],
    "-vf", scaleFilter(width, height),
    "-c:v", "libx264",
    "-crf", String(crf),
    "-preset", "fast",
    "-t", String(singleDuration),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  const { code, stderr } = await runFfmpeg(args, singleDuration, onProgress);

  if (code !== 0) {
    return { ok: false, error: `FFmpeg exited with code ${code}.\n${stderr.slice(-1000)}` };
  }

  return { ok: true, outputPath };
}

/**
 * Convert multiple images into a slideshow video using FFmpeg's concat demuxer.
 *
 * Strategy:
 *  1. Write a temporary concat list file: `file '/abs/path.jpg'\nduration N\n`
 *  2. Feed it to FFmpeg with `-f concat -safe 0`
 *  3. Apply scale+pad filter to enforce canvas size
 *  4. Encode with libx264
 *
 * FFmpeg command (simplified):
 *   ffmpeg -f concat -safe 0 -i list.txt
 *          -vf "scale=W:H:...,pad=...,setsar=1,fps=25"
 *          -c:v libx264 -crf CRF -preset fast
 *          -pix_fmt yuv420p
 *          -y output.mp4
 */
export async function convertSlideshow(
  options: ConvertOptions,
  onProgress: ProgressCallback = () => {},
): Promise<ConvertResult> {
  const { inputs, preset = "reel", quality = 80, imageDuration = 3 } = options;

  if (inputs.length === 0) {
    return { ok: false, error: "No input files provided." };
  }

  // Single image → delegate to convertSingle
  if (inputs.length === 1) {
    return convertSingle(options, onProgress);
  }

  const [width, height] = PRESETS[preset];
  const crf = qualityToCrf(quality);
  const totalSeconds = inputs.length * imageDuration;
  const outputPath = resolveOutputPath(inputs, options.outputPath, "_slideshow");

  // Write a temporary concat demuxer list file
  // The last entry is duplicated without duration so FFmpeg flushes the final frame
  const listFile = path.join(os.tmpdir(), `nextconvert_concat_${Date.now()}.txt`);
  const lastInput = inputs[inputs.length - 1];
  fs.writeFileSync(
    listFile,
    inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'\nduration ${imageDuration}`).join("\n") +
      `\nfile '${lastInput.replace(/'/g, "'\\''")}'\n`,
    "utf8",
  );

  const args = [
    "-f", "concat",
    "-safe", "0",
    "-i", listFile,
    "-vf", `${scaleFilter(width, height)},fps=25`,
    "-c:v", "libx264",
    "-crf", String(crf),
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
    outputPath,
  ];

  try {
    const { code, stderr } = await runFfmpeg(args, totalSeconds, onProgress);

    if (code !== 0) {
      return {
        ok: false,
        error: `FFmpeg exited with code ${code}.\n${stderr.slice(-1000)}`,
      };
    }

    return { ok: true, outputPath };
  } finally {
    // Clean up temp file regardless of outcome
    try { fs.unlinkSync(listFile); } catch { /* ignore */ }
  }
}

/**
 * Convenience: pick convertSingle or convertSlideshow based on input count.
 */
export async function convert(
  options: ConvertOptions,
  onProgress: ProgressCallback = () => {},
): Promise<ConvertResult> {
  return options.inputs.length === 1
    ? convertSingle(options, onProgress)
    : convertSlideshow(options, onProgress);
}
