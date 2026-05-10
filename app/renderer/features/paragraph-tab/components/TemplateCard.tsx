import { Pencil, Trash2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Template } from "../types";

interface TemplateCardProps {
  template: Template;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export default function TemplateCard({
  template,
  selected,
  onSelect,
  onEdit,
  onDelete,
  disabled = false,
}: TemplateCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) onSelect();
      }}
      className={cn(
        "group relative flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors cursor-pointer",
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:bg-muted/50",
        disabled && "pointer-events-none opacity-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
          {template.profileImage ? (
            <img
              src={undefined}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{template.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {template.profileName || "—"}
          </p>
        </div>
        {selected && (
          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
            Active
          </span>
        )}
      </div>

      {/* Post date */}
      {template.postDate && (
        <p className="text-[10px] text-muted-foreground">{template.postDate}</p>
      )}

      {/* Read more preview */}
      {template.readMoreText && (
        <p className="truncate text-[10px] text-blue-600 dark:text-blue-400">
          {template.readMoreText}
        </p>
      )}

      {/* Comment link preview */}
      {template.commentLink && (
        <p className="truncate text-[10px] text-muted-foreground">
          {template.commentLink}
        </p>
      )}

      {/* Actions row */}
      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Edit template"
        >
          <Pencil className="h-2.5 w-2.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Delete template"
        >
          <Trash2 className="h-2.5 w-2.5" />
          Delete
        </button>
      </div>
    </div>
  );
}
