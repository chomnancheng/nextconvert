import { useState } from "react";
import { Plus, LayoutTemplate } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Template } from "../types";
import TemplateCard from "./TemplateCard";
import TemplateFormModal from "./TemplateFormModal";

type FormData = Omit<Template, "id" | "createdAt">;

interface TemplateSidebarProps {
  templates: Template[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (data: FormData) => Template;
  onUpdate: (id: string, patch: Partial<FormData>) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

export default function TemplateSidebar({
  templates,
  loading,
  selectedId,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  disabled = false,
}: TemplateSidebarProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (t: Template) => {
    setEditTarget(t);
    setModalOpen(true);
  };

  const handleSave = (data: FormData) => {
    if (editTarget) {
      onUpdate(editTarget.id, data);
    } else {
      const created = onCreate(data);
      // auto-select newly created template
      if (created) onSelect(created.id);
    }
    setModalOpen(false);
    setEditTarget(null);
  };

  const handleDelete = (id: string) => {
    setConfirmDeleteId(id);
  };

  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    onDelete(confirmDeleteId);
    if (selectedId === confirmDeleteId) {
      // select first remaining template
      const remaining = templates.filter((t) => t.id !== confirmDeleteId);
      if (remaining.length > 0) onSelect(remaining[0].id);
    }
    setConfirmDeleteId(null);
  };

  return (
    <div className={cn("flex flex-col gap-3 py-1 pb-6", disabled && "select-none")}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Templates
          </span>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1",
            "text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
            disabled && "opacity-50 pointer-events-none",
          )}
        >
          <Plus className="h-3.5 w-3.5" />
          New
        </button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading templates…</p>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center">
          <LayoutTemplate className="mx-auto h-6 w-6 text-muted-foreground/40 mb-2" />
          <p className="text-xs text-muted-foreground">No templates yet.</p>
          <p className="text-xs text-muted-foreground">Click <strong>New</strong> to create one.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              selected={t.id === selectedId}
              onSelect={() => onSelect(t.id)}
              onEdit={() => handleOpenEdit(t)}
              onDelete={() => handleDelete(t.id)}
              disabled={disabled}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setConfirmDeleteId(null)}
            aria-hidden
          />
          <div className="relative z-10 w-full max-w-xs rounded-xl border border-border bg-background p-5 shadow-2xl">
            <p className="text-sm font-semibold text-foreground mb-2">Delete template?</p>
            <p className="text-xs text-muted-foreground mb-4">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <TemplateFormModal
        open={modalOpen}
        template={editTarget}
        onSave={handleSave}
        onClose={() => { setModalOpen(false); setEditTarget(null); }}
      />
    </div>
  );
}
