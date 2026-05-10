import { Loader2, Clapperboard, CheckCircle2, AlertCircle, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConvertStatus } from "@/renderer/hooks/useConvert";

interface ConvertBarProps {
  fileCount: number;
  status: ConvertStatus;
  progress: number;
  currentLabel: string;
  outputPaths: string[];
  errorMessage: string | null;
  onConvert: () => void;
  onStop: () => void;
  onReset: () => void;
}

export default function ConvertBar({
  fileCount,
  status,
  progress,
  currentLabel,
  outputPaths,
  errorMessage,
  onConvert,
  onStop,
  onReset,
}: ConvertBarProps) {
  const isRunning = status === "running";
  const isDone = status === "done";
  const isError = status === "error";
  const isIdle = status === "idle";

  const showInFinder = (p: string) => window.electronAPI.showItem(p);

  return (
    <div className="flex flex-col gap-3">

      {/* ── Action row ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isIdle || isError ? onConvert : undefined}
          disabled={isRunning || fileCount === 0}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold",
            "border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isRunning || fileCount === 0
              ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-70"
              : "cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {isRunning
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Clapperboard className="h-4 w-4" />}
          {isRunning ? "Converting…" : "Convert"}
        </button>

        {isRunning && (
          <button
            type="button"
            onClick={onStop}
            className="inline-flex items-center gap-2 rounded-lg border border-destructive/60 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
          >
            Stop
          </button>
        )}

        {fileCount > 0 && isIdle && (
          <span className="text-xs text-muted-foreground">
            {fileCount === 1 ? "1 image → 1 video" : `${fileCount} images → ${fileCount} videos`}
          </span>
        )}

        {(isDone || isError) && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            Convert again
          </button>
        )}
      </div>

      {/* ── Progress bar ── */}
      {(isRunning || isDone) && (
        <div className="flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-200 ease-out",
                isDone ? "bg-green-500" : "bg-primary",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          {isRunning && currentLabel && (
            <p className="text-xs text-muted-foreground tabular-nums">{currentLabel}</p>
          )}
        </div>
      )}

      {/* ── Success notice ── */}
      {isDone && outputPaths.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
          <p className="text-xs font-medium text-green-800 dark:text-green-300">
            {outputPaths.length === 1
              ? "Done — 1 video saved."
              : `Done — ${outputPaths.length} videos saved.`}
          </p>
          <button
            type="button"
            onClick={() => showInFinder(outputPaths[0])}
            className={cn(
              "ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1",
              "text-[11px] font-medium text-green-700 dark:text-green-300",
              "hover:bg-green-100 dark:hover:bg-green-900/60 transition-colors",
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Show in Finder
          </button>
        </div>
      )}
      {isDone && outputPaths.length > 0 && errorMessage && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          {errorMessage}
        </p>
      )}

      {/* ── Error notice ── */}
      {isError && errorMessage && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive leading-relaxed whitespace-pre-line">
            {errorMessage}
          </p>
        </div>
      )}

    </div>
  );
}
