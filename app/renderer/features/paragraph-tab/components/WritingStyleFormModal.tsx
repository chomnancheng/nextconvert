import { useState, useEffect, useRef, type FormEvent } from "react";
import { X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WritingStyle } from "../types";

const TOKENS: { token: string; hint: string }[] = [
  { token: "{count}",     hint: "Number of posts to generate" },
  { token: "{wordCount}", hint: "Word length per post (set below)" },
];

interface WritingStyleFormModalProps {
  open: boolean;
  style?: WritingStyle | null;
  onSave: (data: Omit<WritingStyle, "id" | "createdAt">) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function WritingStyleFormModal({
  open,
  style,
  onSave,
  onDelete,
  onClose,
}: WritingStyleFormModalProps) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [wordCount, setWordCount] = useState(100);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setName(style?.name ?? "");
      setPrompt(style?.prompt ?? "");
      setWordCount(style?.wordCount ?? 100);
    }
  }, [open, style]);

  if (!open) return null;

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) { setPrompt((p) => p + token); return; }
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    setPrompt(prompt.slice(0, start) + token + prompt.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;
    onSave({ name: name.trim(), prompt: prompt.trim(), wordCount });
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
            {style ? "Edit Writing Style" : "New Writing Style"}
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

          {/* Name + min words on one row */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/70" htmlFor="ws-name">
                Style name *
              </label>
              <input
                id="ws-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mystery Story"
                required
                className={inputCls}
              />
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/70" htmlFor="ws-words">
                Word length
              </label>
              <input
                id="ws-words"
                type="number"
                min={10}
                max={1000}
                value={wordCount}
                onChange={(e) => setWordCount(Math.max(10, Math.min(1000, Number(e.target.value) || 100)))}
                className={inputCls}
              />
            </div>
          </div>

          {/* Tokens */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/70">Available tokens</label>
            <div className="flex gap-1.5">
              {TOKENS.map(({ token, hint }) => (
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
              Click to insert at cursor · {"{wordCount}"} resolves to the word length value above
            </p>
          </div>

          {/* Prompt editor */}
          <div className="flex flex-1 flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/70" htmlFor="ws-prompt">
              Prompt *
            </label>
            <textarea
              id="ws-prompt"
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={14}
              spellCheck={false}
              required
              placeholder={'Generate {count} Facebook posts about... around {wordCount} words each. Separate posts with a blank line.'}
              className={cn(
                "w-full resize-none rounded-md border border-border bg-background p-3",
                "text-xs leading-relaxed text-foreground caret-foreground",
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
                disabled={!name.trim() || !prompt.trim()}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold transition-colors",
                  name.trim() && prompt.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                {style ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
