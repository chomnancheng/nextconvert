import { useState, useEffect, useRef, type FormEvent } from "react";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LayoutTemplate, CountRanges } from "../types";
import { DEFAULT_COUNT_RANGES } from "../types";

const FIELDS: { token: string; hint: string }[] = [
  { token: "{{profileName}}",  hint: "Profile name — default layout blurs + frosted overlay (rumor look)" },
  { token: "{{profileImage}}", hint: "Profile image (data URL injected automatically)" },
  { token: "{{postDate}}",     hint: "Random each render: Today at… or Nh ago (N = 1–24)" },
  { token: "{{text}}",         hint: "Post body — rendered as HTML" },
  { token: "{{readMoreText}}", hint: "Read-more link label" },
  { token: "{{likeCount}}",    hint: "Random like count (e.g. 5.4K) — unique per post" },
  { token: "{{commentCount}}", hint: "Random comment count" },
  { token: "{{shareCount}}",   hint: "Random share count" },
];

interface LayoutTemplateFormModalProps {
  open: boolean;
  template?: LayoutTemplate | null;
  defaultHtml: string;
  onSave: (data: Omit<LayoutTemplate, "id" | "createdAt">) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function LayoutTemplateFormModal({
  open,
  template,
  defaultHtml,
  onSave,
  onDelete,
  onClose,
}: LayoutTemplateFormModalProps) {
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [ranges, setRanges] = useState<CountRanges>({ ...DEFAULT_COUNT_RANGES });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setName(template?.name ?? "");
      setHtml(template?.html ?? defaultHtml);
      setRanges(template?.countRanges ? { ...template.countRanges } : { ...DEFAULT_COUNT_RANGES });
    }
  }, [open, template, defaultHtml]);

  const setRange = (key: keyof CountRanges, raw: string) => {
    const v = Math.max(0, parseInt(raw, 10) || 0);
    setRanges((r) => ({ ...r, [key]: v }));
  };

  if (!open) return null;

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) { setHtml((h) => h + token); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next  = html.slice(0, start) + token + html.slice(end);
    setHtml(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name: name.trim(), html, countRanges: ranges });
  };

  const inputCls =
    "flex h-8 w-full rounded-md border border-border bg-background px-3 text-xs " +
    "text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {template ? "Edit Layout" : "New Layout"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/70" htmlFor="lt-name">
              Layout name *
            </label>
            <input
              id="lt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Facebook Posts"
              required
              className={inputCls}
            />
          </div>

          {/* Field tokens */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/70">Available tokens</label>
            <div className="flex flex-wrap gap-1.5">
              {FIELDS.map(({ token, hint }) => (
                <button
                  key={token}
                  type="button"
                  title={hint}
                  onClick={() => insertToken(token)}
                  className="rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground/80 hover:bg-primary/10 hover:border-primary/40 transition-colors"
                >
                  {token}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Click a token to insert at cursor · Inline styles recommended · Tailwind classes work too
            </p>
          </div>

          {/* Engagement count ranges */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-foreground/70">Random count ranges</label>
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Token</th>
                    <th className="w-32 px-3 py-1.5 text-left font-medium text-muted-foreground">From</th>
                    <th className="w-32 px-3 py-1.5 text-left font-medium text-muted-foreground">To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {([
                    { label: "👍 Likes",    minKey: "likeMin",    maxKey: "likeMax" },
                    { label: "💬 Comments", minKey: "commentMin", maxKey: "commentMax" },
                    { label: "↗ Shares",   minKey: "shareMin",   maxKey: "shareMax" },
                  ] as const).map(({ label, minKey, maxKey }) => (
                    <tr key={minKey}>
                      <td className="px-3 py-1.5 text-muted-foreground">{label}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={ranges[minKey]}
                          onChange={(e) => setRange(minKey, e.target.value)}
                          className={cn(inputCls, "w-full")}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={ranges[maxKey]}
                          onChange={(e) => setRange(maxKey, e.target.value)}
                          className={cn(inputCls, "w-full")}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* HTML editor */}
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/70" htmlFor="lt-html">
              HTML template
            </label>
            <textarea
              id="lt-html"
              ref={textareaRef}
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={18}
              spellCheck={false}
              className={cn(
                "w-full resize-none rounded-md border border-border bg-background p-3",
                "font-mono text-[11px] leading-relaxed text-foreground caret-foreground",
                "focus:outline-none focus:ring-2 focus:ring-ring",
              )}
            />
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between border-t border-border pt-4">
            {onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Sure?</span>
                  <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              )
            )}

            <div className={cn("flex gap-2", !onDelete && "ml-auto")}>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold transition-colors",
                  name.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {template ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
