import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ImageFile } from "@/renderer/hooks/useImageFiles";

interface ThumbnailGridProps {
  files: ImageFile[];
  onRemove: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export default function ThumbnailGrid({ files, onRemove, onClear, disabled = false }: ThumbnailGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          {files.length} {files.length === 1 ? "image" : "images"} selected
        </p>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            "transition-colors",
            disabled
              ? "text-muted-foreground/40 cursor-not-allowed"
              : "text-muted-foreground hover:text-destructive hover:bg-destructive/10",
          )}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear all
        </button>
      </div>

      {/* Grid */}
      <div
        className={cn(
          "grid gap-2 overflow-y-auto pr-1",
          "grid-cols-[repeat(auto-fill,minmax(96px,1fr))]",
        )}
        style={{ maxHeight: "calc(100vh - 420px)", minHeight: 120 }}
      >
        {files.map((file) => (
          <div
            key={file.id}
            className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
          >
            <img
              src={file.previewUrl}
              alt={file.name}
              className="h-full w-full object-cover"
              draggable={false}
            />
            {/* Hover overlay with filename */}
            <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 p-1.5">
              <p className="truncate text-[10px] leading-tight text-white font-medium">
                {file.name}
              </p>
            </div>
            {/* Remove button */}
            {!disabled && (
              <button
                type="button"
                onClick={() => onRemove(file.id)}
                aria-label={`Remove ${file.name}`}
                className={cn(
                  "absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full",
                  "bg-black/60 text-white opacity-0 group-hover:opacity-100",
                  "hover:bg-black/80 transition-opacity duration-150",
                )}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
