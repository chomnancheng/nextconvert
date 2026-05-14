import {
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Film,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileProgress } from "@/renderer/hooks/useConvert";

// ---------------------------------------------------------------------------
// Generic table item — works for both uploaded images and video-bg file rows
// ---------------------------------------------------------------------------

export interface TableItem {
  id: string;
  name: string;
  /** Blob / data / file URL to display in the thumbnail cell. Omit for video-bg rows. */
  previewUrl?: string;
  /** If true show a video badge instead of the blue image badge. */
  isVideo?: boolean;
  /** Source image file size on disk (bytes). */
  inputSizeBytes?: number;
}

interface MediaTableProps {
  items: TableItem[];
  fileProgress: Record<string, FileProgress>;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  /** Label shown in the toolbar, e.g. "images" or "video clips" */
  label?: string;
  disabled?: boolean;
}

function formatBytes(n: number | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"] as const;
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export default function MediaTable({
  items,
  fileProgress,
  onRemove,
  onClear,
  label = "files",
  disabled = false,
}: MediaTableProps) {
  if (items.length === 0) return null;

  const showInFinder = (p: string) => window.electronAPI.showItem(p);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {items.length} {items.length === 1 ? label.replace(/s$/, "") : label} selected
        </p>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              disabled
                ? "text-muted-foreground/40 cursor-not-allowed"
                : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <th className="w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                Preview
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Filename
              </th>
              <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                Source
              </th>
              <th className="w-20 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                Output
              </th>
              <th className="w-24 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Status
              </th>
              <th className="w-36 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                Progress
              </th>
              {onRemove && <th className="w-8 px-2 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item, i) => {
              const fp = fileProgress[item.id];
              const status = fp?.status ?? "pending";
              const pct = fp?.progress ?? 0;

              return (
                <tr
                  key={item.id}
                  className={cn(
                    "transition-colors",
                    status === "running" && "bg-primary/5",
                    status === "done" && "bg-green-50/50 dark:bg-green-950/20",
                    status === "error" && "bg-destructive/5",
                  )}
                >
                  {/* Index */}
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>

                  {/* Thumbnail */}
                  <td className="px-2 py-2">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted flex items-center justify-center">
                      {item.previewUrl ? (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <Film className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                  </td>

                  {/* Filename + output info */}
                  <td className="px-3 py-2 min-w-0">
                    <p className="truncate max-w-[180px] text-xs font-medium text-foreground">
                      {item.name}
                    </p>
                    {fp?.outputPath && (
                      <button
                        type="button"
                        onClick={() => showInFinder(fp.outputPath!)}
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-green-700 dark:text-green-400 hover:underline"
                      >
                        <FolderOpen className="h-2.5 w-2.5" />
                        <span className="truncate max-w-[160px]">
                          {fp.outputPath.split(/[\\/]/).pop()}
                        </span>
                      </button>
                    )}
                    {fp?.error && status === "error" && (
                      <p className="mt-0.5 truncate max-w-[180px] text-[10px] text-destructive">
                        {fp.error}
                      </p>
                    )}
                  </td>

                  <td className="px-2 py-2 text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                    {formatBytes(item.inputSizeBytes)}
                  </td>
                  <td className="px-2 py-2 text-[10px] tabular-nums text-muted-foreground whitespace-nowrap">
                    {status === "done" ? formatBytes(fp?.outputSizeBytes) : "—"}
                  </td>

                  {/* Status */}
                  <td className="px-3 py-2">
                    <StatusBadge status={status} />
                  </td>

                  {/* Progress */}
                  <td className="px-3 py-2">
                    <ProgressCell status={status} progress={pct} />
                  </td>

                  {/* Remove */}
                  {onRemove && (
                    <td className="px-2 py-2">
                      {!disabled && (
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary">
          <Loader2 className="h-2.5 w-2.5 animate-spin" />
          Converting
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Done
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
          <AlertCircle className="h-2.5 w-2.5" />
          Error
        </span>
      );
    default:
      return <span className="text-[10px] text-muted-foreground">Pending</span>;
  }
}

function ProgressCell({ status, progress }: { status: string; progress: number }) {
  const barColor =
    status === "done"
      ? "bg-green-500"
      : status === "error"
        ? "bg-destructive"
        : "bg-primary";

  const widthPct = status === "done" ? 100 : status === "error" ? 0 : progress;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-200", barColor)}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      {status === "running" && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{progress}%</span>
      )}
    </div>
  );
}
