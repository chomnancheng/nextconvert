import { X, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ParagraphQueueItem } from "../types";
import type { FileProgress } from "@/renderer/hooks/useConvert";

interface ParagraphQueueListProps {
  items: ParagraphQueueItem[];
  fileProgress: Record<string, FileProgress>;
  outputSizes?: Record<string, number>;
  onRemove: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? html;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ParagraphQueueList({
  items,
  fileProgress,
  outputSizes = {},
  onRemove,
  onClear,
  disabled = false,
}: ParagraphQueueListProps) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {items.length} post{items.length !== 1 ? "s" : ""} queued
        </p>
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
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="w-8 px-3 py-2 text-left text-xs font-medium text-muted-foreground">#</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Text preview</th>
              <th className="w-24 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Status</th>
              <th className="w-36 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Progress</th>
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const fp = fileProgress[item.id];
              const status = fp?.status ?? "pending";
              const pct = fp?.progress ?? 0;
              const outSize = outputSizes[item.id];

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
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">{item.lineNumber}</td>
                  <td className="px-3 py-2.5 min-w-0">
                    <p className="truncate max-w-[300px] text-xs text-foreground">
                      {stripHtml(item.text)}
                    </p>
                    {fp?.error && status === "error" && (
                      <p className="mt-0.5 truncate max-w-[300px] text-[10px] text-destructive">
                        {fp.error}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <QueueStatusBadge status={status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <QueueProgressCell status={status} progress={pct} outputSize={outSize} />
                  </td>
                  <td className="px-2 py-2.5">
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onRemove(item.id)}
                        aria-label={`Remove post #${item.lineNumber}`}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function QueueStatusBadge({ status }: { status: string }) {
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

function QueueProgressCell({
  status,
  progress,
  outputSize,
}: {
  status: string;
  progress: number;
  outputSize?: number;
}) {
  const color =
    status === "done"
      ? "bg-green-500"
      : status === "error"
        ? "bg-destructive"
        : "bg-primary";
  const width = status === "done" ? 100 : status === "error" ? 0 : progress;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-200", color)}
          style={{ width: `${width}%` }}
        />
      </div>
      {status === "running" && (
        <span className="text-[10px] tabular-nums text-muted-foreground">{progress}%</span>
      )}
      {status === "done" && outputSize != null && (
        <span className="text-[10px] tabular-nums text-green-600 dark:text-green-400">
          {formatBytes(outputSize)}
        </span>
      )}
    </div>
  );
}
