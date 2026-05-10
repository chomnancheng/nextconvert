import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParagraphInputProps {
  rawText: string;
  onChange: (v: string) => void;
  onImport: (v: string) => void;
  disabled?: boolean;
}

export default function ParagraphInput({
  rawText,
  onChange,
  onImport,
  disabled = false,
}: ParagraphInputProps) {
  const lineCount = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Paragraph Input</p>
        {lineCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {lineCount} line{lineCount !== 1 ? "s" : ""} detected
          </span>
        )}
      </div>

      <textarea
        value={rawText}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={10}
        placeholder={
          "Enter your paragraphs here — one post per line.\n\nExample:\nFirst story paragraph here\nSecond story paragraph here\nHTML entities like &amp; are supported"
        }
        className={cn(
          "w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5",
          "text-sm leading-relaxed text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent",
          "transition-colors font-mono",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      />

      <button
        type="button"
        disabled={disabled || rawText.trim().length === 0}
        onClick={() => onImport(rawText)}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-lg border",
          "px-4 py-2.5 text-sm font-semibold transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          disabled || rawText.trim().length === 0
            ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-60"
            : "cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        <FileText className="h-4 w-4" />
        Import Paragraphs
        {lineCount > 0 && ` (${lineCount})`}
      </button>
    </div>
  );
}
