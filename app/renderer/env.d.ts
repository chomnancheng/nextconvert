/// <reference types="vite/client" />

// Inline the IPC payload types here rather than importing from app/lib/ffmpeg
// so this file stays a pure ambient declaration (no imports = no module boundary).

type SizePreset = "reel" | "story" | "square";

interface ConvertOptions {
  inputs: string[];
  outputPath?: string;
  preset?: SizePreset;
  quality?: number;
  imageDuration?: number;
  singleDuration?: number;
}

interface ConvertResult {
  ok: boolean;
  outputPath?: string;
  error?: string;
}

interface Window {
  electronAPI: {
    openFiles: () => Promise<string[]>;
    openFolder: () => Promise<string[]>;
    convert: (jobId: string, options: ConvertOptions) => Promise<ConvertResult>;
    onConvertProgress: (
      cb: (jobId: string, percent: number) => void,
    ) => () => void;
  };
}
