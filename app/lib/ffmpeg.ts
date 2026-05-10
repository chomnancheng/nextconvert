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

export type SizePreset = "reel" | "story" | "square" | "custom";
export type EncoderMode = "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";
/** How photos are framed: cover = fill crop, contain = shrink with padding (still) / inset (overlay), stretch = distort to box. */
export type PhotoFitMode = "cover" | "contain" | "stretch";

const PRESETS: Record<Exclude<SizePreset, "custom">, [number, number]> = {
  reel:   [1080, 1920],
  story:  [1080, 1920],
  square: [1080, 1080],
};

function resolvePresetSize(
  preset: SizePreset | undefined,
  customWidth: number,
  customHeight: number,
): [number, number] {
  if (preset === "custom") {
    return [Math.max(64, Math.floor(customWidth)), Math.max(64, Math.floor(customHeight))];
  }
  if (preset === "reel" || preset === "story" || preset === "square") {
    return PRESETS[preset];
  }
  return PRESETS.reel;
}

export interface ConvertOptions {
  /** Single input file path — an image (looped) or a video background. */
  input: string;
  /** When true, `input` is treated as a video background (looped); otherwise a still image. */
  inputIsVideo?: boolean;
  /**
   * Optional still image to overlay centered on top of a video background.
   * Only used when `inputIsVideo === true`.
   */
  overlayImagePath?: string;
  /**
   * Hex color (e.g. "#000000") for a semi-transparent color wash drawn between
   * the video background and the image overlay.  Only used when `inputIsVideo === true`.
   */
  overlayColor?: string;
  /**
   * Opacity of the color wash, 0–100.  0 = invisible, 100 = fully opaque.
   * Only applied when `overlayColor` is set and `inputIsVideo === true`.
   */
  overlayOpacity?: number;
  /**
   * Max size of the PNG on the B-roll, as % of output width/height (50–100).
   * Below 100% leaves a visible border of video around the photo (opaque PNGs).
   * Default 100.
   */
  overlayImageMaxPercent?: number;
  /** cover | contain | stretch — still reel and PNG-on-B-roll overlays. */
  photoFit?: PhotoFitMode;
  /** Absolute path to output mp4. If set, overrides batchDir logic entirely. */
  outputPath?: string;
  /**
   * Override the output file's base name (without extension).
   * Useful when the technical `input` is a video but the logical "content" is the image.
   * Only applied when `outputPath` is not set.
   */
  outputNameBase?: string;
  /**
   * Subdirectory name for this batch, e.g. "converted-2026-05-04-1430".
   * Created next to each input image. Defaults to "converted" if omitted.
   */
  batchDir?: string;
  preset?: SizePreset;
  customWidth?: number;
  customHeight?: number;
  /** 0–100, default 80 — maps to encoder CRF-style quality (smaller files than legacy mapping) */
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
  inputIsVideo?: boolean;
  overlayImagePath?: string;
  overlayColor?: string;
  overlayOpacity?: number;
  overlayImageMaxPercent?: number;
  photoFit?: PhotoFitMode;
  outputNameBase?: string;
  outputPath?: string;
  batchDir?: string;
  preset?: SizePreset;
  customWidth?: number;
  customHeight?: number;
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
  /** File size of output mp4 after successful encode */
  outputSizeBytes?: number;
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
  // Previous map (0→CRF 51, 100→CRF 0) made defaults land around CRF 8–14 — huge 1080p files.
  // Target a social-style range: high quality ≈ CRF 18, compact ≈ CRF 35 (libx264 / similar).
  return Math.round(35 - (q / 100) * 17);
}

function scaleFilter(w: number, h: number): string {
  return (
    `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
    `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `setsar=1`
  );
}

function stillImageVF(w: number, h: number, fit: PhotoFitMode = "cover"): string {
  if (fit === "stretch") {
    return `scale=${w}:${h},setsar=1`;
  }
  if (fit === "cover") {
    return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  }
  return scaleFilter(w, h);
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
  outputNameBase?: string,
): string {
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    return outputPath;
  }
  // baseDir is the directory of the input file
  const dir = path.join(path.dirname(inputPath), batchDir);
  fs.mkdirSync(dir, { recursive: true });
  const base = outputNameBase ?? path.basename(inputPath, path.extname(inputPath));
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
    inputIsVideo = false,
    overlayImagePath,
    overlayColor,
    overlayOpacity = 0,
    preset = "reel",
    customWidth = 1080,
    customHeight = 1920,
    quality = 80,
    duration = 59,
    audioPath,
    audioVolume = 80,
    batchDir = "converted",
    encoder = "auto",
    outputNameBase,
    overlayImageMaxPercent: rawOverlayMaxPct,
    photoFit = "cover",
  } = options;

  if (!input?.trim()) {
    return { ok: false, error: "No input file path provided." };
  }

  const [w, h] = resolvePresetSize(preset, customWidth, customHeight);
  const crf = qualityToCrf(quality);
  const outputPath = resolveOutputPath(input, options.outputPath, batchDir, outputNameBase);
  const vol = Math.max(0, Math.min(100, audioVolume)) / 100;
  const videoEncoder = resolveVideoEncoder(encoder);

  /** PNG is scaled relative to frame (50–100%). At 100% + cover fit, photo fills the slot. */
  const overlayMaxFrac =
    inputIsVideo
      ? Math.max(0.5, Math.min(1, (rawOverlayMaxPct ?? 100) / 100))
      : 1;

  // Normalise color overlay params
  const hasColorOverlay =
    inputIsVideo &&
    !!overlayColor?.trim() &&
    overlayOpacity > 0;
  // FFmpeg color format: 0xRRGGBB@alpha  (alpha 0.0–1.0)
  const fmtColor = hasColorOverlay
    ? `0x${overlayColor!.replace("#", "")}@${(Math.min(100, overlayOpacity) / 100).toFixed(2)}`
    : "";

  const args: string[] = [];

  if (inputIsVideo) {
    // ── Video background mode ──────────────────────────────────────────────
    // Input 0: looped B-roll — we never map 0:a; background stays muted.
    args.push("-stream_loop", "-1", "-i", input);

    const hasOverlay = !!overlayImagePath?.trim();
    if (hasOverlay) {
      args.push("-loop", "1", "-i", overlayImagePath!);
    }

    const hasMusic = !!audioPath?.trim();
    if (hasMusic) {
      args.push("-stream_loop", "-1", "-i", audioPath!);
    }
    const musicInputIndex = hasOverlay ? 2 : 1;

    // filter_complex: valid [bg] chain, then PNG with alpha on top (transparent areas show video).
    let fc = `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
    if (hasColorOverlay) {
      fc += `[__bg0];[__bg0]drawbox=x=0:y=0:w=iw:h=ih:color=${fmtColor}:t=fill[bg]`;
    } else {
      fc += `[bg]`;
    }

    if (hasOverlay) {
      const maxW = Math.max(2, Math.floor(w * overlayMaxFrac));
      const maxH = Math.max(2, Math.floor(h * overlayMaxFrac));
      let overlayScale: string;
      if (photoFit === "stretch") {
        overlayScale = `[1:v]scale=${maxW}:${maxH},setsar=1,format=yuva420p[img]`;
      } else if (photoFit === "cover") {
        overlayScale =
          `[1:v]scale=${maxW}:${maxH}:force_original_aspect_ratio=increase,crop=${maxW}:${maxH},setsar=1,format=yuva420p[img]`;
      } else {
        overlayScale =
          `[1:v]scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease,setsar=1,format=yuva420p[img]`;
      }
      fc += `;${overlayScale};[bg][img]overlay=(W-w)/2:(H-h)/2:format=auto[v]`;
    } else {
      fc += `;[bg]format=yuv420p[v]`;
    }

    args.push("-filter_complex", fc, "-map", "[v]");

    args.push(
      "-c:v", videoEncoder,
      "-crf", String(crf),
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
    );

    // Audio: map only the music input — never input 0 (B-roll stays muted).
    if (hasMusic) {
      args.push(
        "-map", `${musicInputIndex}:a`,
        "-c:a", "aac",
        "-b:a", "128k",
        "-af", `volume=${vol.toFixed(3)}`,
      );
    }

    args.push("-t", String(duration));

  } else {
    // ── Static image mode ─────────────────────────────────────────────────
    // Input 0: looped still image
    args.push("-loop", "1", "-i", input);

    const hasAudio = !!audioPath?.trim();
    // Input 1 (optional): looped audio
    if (hasAudio) {
      args.push("-stream_loop", "-1", "-i", audioPath!);
    }

    args.push(
      "-vf", stillImageVF(w, h, photoFit),
      "-c:v", videoEncoder,
      "-crf", String(crf),
      "-preset", "fast",
      "-pix_fmt", "yuv420p",
    );

    if (hasAudio) {
      // Explicit stream maps so FFmpeg never silently drops the audio track
      args.push(
        "-map", "0:v",
        "-map", "1:a",
        "-c:a", "aac",
        "-b:a", "128k",
        "-af", `volume=${vol.toFixed(3)}`,
      );
    }

    args.push("-t", String(duration));
    if (hasAudio) args.push("-shortest");
  }

  args.push("-movflags", "+faststart", "-y", outputPath);

  console.log("[ffmpeg] job", jobId, "args:", args.join(" "));

  const { code, stderr } = await runFfmpeg(jobId, args, duration, onProgress);

  if (code !== 0) {
    if (stderr.includes("__CANCELLED__")) {
      return { ok: false, error: "Conversion canceled by user." };
    }
    return { ok: false, error: `FFmpeg exited with code ${code}.\n${stderr.slice(-1500)}` };
  }

  let outputSizeBytes: number | undefined;
  try {
    outputSizeBytes = fs.statSync(outputPath).size;
  } catch {
    /* ignore */
  }

  return { ok: true, outputPath, outputSizeBytes };
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
      inputIsVideo: raw.inputIsVideo,
      overlayImagePath: raw.overlayImagePath,
      overlayColor: raw.overlayColor,
      overlayOpacity: raw.overlayOpacity,
      overlayImageMaxPercent: raw.overlayImageMaxPercent,
      photoFit: raw.photoFit,
      outputNameBase: raw.outputNameBase,
      outputPath: raw.outputPath,
      batchDir: raw.batchDir,
      preset: raw.preset,
      customWidth: raw.customWidth,
      customHeight: raw.customHeight,
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
