import { useState, useEffect, type FormEvent } from "react";
import { X, FolderOpen, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Template } from "../types";

// postDate is intentionally omitted — canvas always shows today's date
type FormData = Omit<Template, "id" | "createdAt" | "postDate">;

const EMPTY: FormData = {
  name: "",
  profileImage: "",
  profileName: "",
  readMoreText: "See More",
  commentLink: "",
};

interface TemplateFormModalProps {
  open: boolean;
  template?: Template | null;
  onSave: (data: FormData) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export default function TemplateFormModal({
  open,
  template,
  onSave,
  onDelete,
  onClose,
}: TemplateFormModalProps) {
  const [form, setForm] = useState<FormData>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setConfirmDelete(false);
      setForm(
        template
          ? {
              name: template.name,
              profileImage: template.profileImage,
              profileName: template.profileName,
              readMoreText: template.readMoreText,
              commentLink: template.commentLink,
            }
          : { ...EMPTY },
      );
    }
  }, [open, template]);

  if (!open) return null;

  const handlePickImage = async () => {
    const paths = await window.electronAPI.openFiles();
    if (paths.length > 0) setForm((f) => ({ ...f, profileImage: paths[0] }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSave(form);
  };

  const inputCls =
    "flex h-8 w-full rounded-md border border-border bg-background px-3 text-xs " +
    "text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            {template ? "Edit Template" : "New Template"}
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-5 py-4">
          <Field label="Template name *" htmlFor="tf-name">
            <input
              id="tf-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. My Brand Template"
              required
              className={inputCls}
            />
          </Field>

          <Field label="Profile name" htmlFor="tf-pname">
            <input
              id="tf-pname"
              value={form.profileName}
              onChange={(e) => setForm((f) => ({ ...f, profileName: e.target.value }))}
              placeholder="e.g. John Doe"
              className={inputCls}
            />
          </Field>

          <Field label="Profile image">
            <div className="flex gap-1.5">
              <input
                value={form.profileImage}
                readOnly
                placeholder="No image selected"
                className={cn(inputCls, "flex-1 font-mono text-[11px]")}
              />
              <button
                type="button"
                onClick={handlePickImage}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
                aria-label="Pick profile image"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Date is always set to today automatically.</p>
          </Field>

          <Field label="Read more text" htmlFor="tf-readmore">
            <input
              id="tf-readmore"
              value={form.readMoreText}
              onChange={(e) => setForm((f) => ({ ...f, readMoreText: e.target.value }))}
              placeholder="e.g. See More"
              className={inputCls}
            />
          </Field>

          <Field label="Comment link" htmlFor="tf-comment">
            <input
              id="tf-comment"
              value={form.commentLink}
              onChange={(e) => setForm((f) => ({ ...f, commentLink: e.target.value }))}
              placeholder="e.g. 128 comments"
              className={inputCls}
            />
          </Field>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border pt-4">
            {/* Delete */}
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
                disabled={!form.name.trim()}
                className={cn(
                  "rounded-md px-4 py-2 text-xs font-semibold transition-colors",
                  form.name.trim()
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

function Field({
  label, htmlFor, children,
}: {
  label: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-medium text-foreground/70">
        {label}
      </label>
      {children}
    </div>
  );
}
