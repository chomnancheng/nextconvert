import { useState, useMemo, useCallback, useEffect } from "react";
import {
  Loader2,
  Clapperboard,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { useConvert } from "@/renderer/hooks/useConvert";
import type { Settings, SizePreset } from "@/renderer/hooks/useSettings";
import type { ImageFile } from "@/renderer/hooks/useImageFiles";
import type { Template, LayoutTemplate } from "./types";
import { useTemplates } from "./hooks/useTemplates";
import { useLayoutTemplates, FACEBOOK_POSTS_HTML } from "./hooks/useLayoutTemplates";
import { useParagraphQueue } from "./hooks/useParagraphQueue";
import ParagraphInput from "./components/ParagraphInput";
import ParagraphQueueList from "./components/ParagraphQueueList";
import AIGeneratePanel from "./components/AIGeneratePanel";
import TemplateFormModal from "./components/TemplateFormModal";
import LayoutTemplateFormModal from "./components/LayoutTemplateFormModal";
import { renderHtmlTemplateToDataUrl } from "./utils/renderHtmlTemplate";
import { slugFromPlainText } from "@/renderer/lib/outputSlug";

interface ParagraphTabProps {
  settings: Settings;
}

function getPresetDims(
  preset: SizePreset,
  customWidth: number,
  customHeight: number,
): { width: number; height: number } {
  if (preset === "square") return { width: 1080, height: 1080 };
  if (preset === "custom") return { width: customWidth, height: customHeight };
  return { width: 1080, height: 1920 };
}

export default function ParagraphTab({ settings }: ParagraphTabProps) {
  const { items, rawText, setRawText, importText, appendItems, removeItem, clearAll } =
    useParagraphQueue();
  const { templates, loading, createTemplate, updateTemplate, deleteTemplate } =
    useTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    () => localStorage.getItem("para-template-id"),
  );

  // ── Layout templates ──────────────────────────────────────────────────────
  const {
    templates: layoutTemplates,
    createTemplate: createLayoutTemplate,
    updateTemplate: updateLayoutTemplate,
    deleteTemplate: deleteLayoutTemplate,
  } = useLayoutTemplates();
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(
    () => localStorage.getItem("para-layout-id"),
  );
  const { status, fileProgress, outputPaths, errorMessage, run, reset, stop } =
    useConvert();
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [outputSizesById, setOutputSizesById] = useState<Record<string, number>>({});
  const [inputMode, setInputMode] = useState<"text" | "ai">(
    () => (localStorage.getItem("para-input-mode") as "text" | "ai" | null) ?? "text",
  );

  // ── Template modal state ──────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const openNewModal = useCallback(() => {
    setEditingTemplate(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((t: Template) => {
    setEditingTemplate(t);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingTemplate(null);
  }, []);

  const handleTemplateSave = useCallback(
    (data: Omit<Template, "id" | "createdAt" | "postDate">) => {
      if (editingTemplate) {
        updateTemplate(editingTemplate.id, data);
      } else {
        const created = createTemplate(data);
        setSelectedTemplateId(created.id);
      }
      closeModal();
    },
    [editingTemplate, updateTemplate, createTemplate, closeModal],
  );

  const handleTemplateDelete = useCallback(() => {
    if (!editingTemplate) return;
    deleteTemplate(editingTemplate.id);
    if (selectedTemplateId === editingTemplate.id) {
      setSelectedTemplateId(null);
      localStorage.removeItem("para-template-id");
    }
    closeModal();
  }, [editingTemplate, deleteTemplate, selectedTemplateId, closeModal]);

  // ── Layout modal state ────────────────────────────────────────────────────
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [editingLayout, setEditingLayout] = useState<LayoutTemplate | null>(null);

  const openNewLayoutModal = useCallback(() => {
    setEditingLayout(null);
    setLayoutModalOpen(true);
  }, []);

  const openEditLayoutModal = useCallback((t: LayoutTemplate) => {
    setEditingLayout(t);
    setLayoutModalOpen(true);
  }, []);

  const closeLayoutModal = useCallback(() => {
    setLayoutModalOpen(false);
    setEditingLayout(null);
  }, []);

  const handleLayoutSave = useCallback(
    (data: Omit<LayoutTemplate, "id" | "createdAt">) => {
      if (editingLayout) {
        updateLayoutTemplate(editingLayout.id, data);
      } else {
        const created = createLayoutTemplate(data);
        setSelectedLayoutId(created.id);
        localStorage.setItem("para-layout-id", created.id);
      }
      closeLayoutModal();
    },
    [editingLayout, updateLayoutTemplate, createLayoutTemplate, closeLayoutModal],
  );

  const handleLayoutDelete = useCallback(() => {
    if (!editingLayout) return;
    deleteLayoutTemplate(editingLayout.id);
    if (selectedLayoutId === editingLayout.id) {
      setSelectedLayoutId(null);
      localStorage.removeItem("para-layout-id");
    }
    closeLayoutModal();
  }, [editingLayout, deleteLayoutTemplate, selectedLayoutId, closeLayoutModal]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isRunning = status === "running";
  const isDone    = status === "done";
  const isError   = status === "error";
  const isLocked  = isRunning || preparing;

  // Fetch output file sizes as each row finishes (paths come from fileProgress, not outputPaths order)
  useEffect(() => {
    const pairs: { id: string; path: string }[] = [];
    for (const item of items) {
      const fp = fileProgress[item.id];
      if (fp?.status === "done" && fp.outputPath) {
        pairs.push({ id: item.id, path: fp.outputPath });
      }
    }
    if (pairs.length === 0) return;
    const paths = [...new Set(pairs.map((p) => p.path))];
    let cancelled = false;
    void window.electronAPI.getFileSizes(paths).then((sizeMap) => {
      if (cancelled) return;
      setOutputSizesById((prev) => {
        const next = { ...prev };
        for (const { id, path } of pairs) {
          const sz = sizeMap[path];
          if (sz != null) next[id] = sz;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [items, fileProgress]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedLayout = useMemo(
    () =>
      layoutTemplates.find((t) => t.id === selectedLayoutId) ??
      layoutTemplates[0] ??
      null,
    [layoutTemplates, selectedLayoutId],
  );

  const { overallProgress, currentLabel } = useMemo(() => {
    const vals = Object.values(fileProgress);
    if (vals.length === 0) return { overallProgress: 0, currentLabel: "" };
    const total    = vals.length;
    const doneCount = vals.filter((v) => v.status === "done").length;
    const totalPct  = vals.reduce(
      (sum, v) => sum + (v.status === "done" ? 100 : v.progress), 0,
    );
    return {
      overallProgress: Math.round(totalPct / total),
      currentLabel: `${doneCount}/${total}`,
    };
  }, [fileProgress]);

  // ── Convert ───────────────────────────────────────────────────────────────
  const handleConvert = useCallback(async () => {
    setPrepError(null);

    if (!selectedTemplate) {
      setPrepError("Select a profile before converting.");
      return;
    }
    if (!selectedLayout) {
      setPrepError("Select a layout before converting.");
      return;
    }
    if (!selectedTemplate.outputDir?.trim() && !settings.outputDir) {
      setPrepError("Set an output folder on this profile, or choose one in Settings → Output.");
      return;
    }
    if (items.length === 0) {
      setPrepError("Import paragraphs first.");
      return;
    }

    setPreparing(true);
    const dims = getPresetDims(settings.preset, settings.customWidth, settings.customHeight);
    const transparent = settings.videoBg.enabled && settings.videoBg.files.length > 0;

    const syntheticFiles: ImageFile[] = [];
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const dataUrl = await renderHtmlTemplateToDataUrl(selectedLayout, selectedTemplate, item.text, { dims, transparent });
        const base64   = dataUrl.split(",")[1];
        const filename = `post_${String(i + 1).padStart(3, "0")}.png`;
        const tempPath = await window.electronAPI.saveParagraphTempImage(base64, filename);
        syntheticFiles.push({
          id: item.id,
          name: `Post #${item.lineNumber}`,
          path: tempPath,
          previewUrl: dataUrl,
          outputSlug: slugFromPlainText(item.text, 48),
        });
      }
    } catch (err) {
      setPrepError(`Failed to render posts: ${err instanceof Error ? err.message : String(err)}`);
      setPreparing(false);
      return;
    }

    setPreparing(false);
    await run(syntheticFiles, "by-images", settings, {
      outputDirOverride: selectedTemplate.outputDir?.trim() || undefined,
    });
    void window.electronAPI.cleanupParagraphTemp();
  }, [selectedTemplate, selectedLayout, settings, items, run]);

  const handleClearAll = useCallback(() => {
    clearAll();
    reset();
    setPrepError(null);
    setOutputSizesById({});
  }, [clearAll, reset]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden min-w-0">
      <ScrollArea className="flex-1 pr-2">
        <div className="flex flex-col gap-4">

          {/* ── Layout selector row ── */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Layout</span>

            <Select
              value={selectedLayout?.id ?? ""}
              onValueChange={(v) => { setSelectedLayoutId(v); localStorage.setItem("para-layout-id", v); }}
              disabled={isLocked}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Select a layout…" />
              </SelectTrigger>
              <SelectContent>
                {layoutTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedLayout && (
              <button
                type="button"
                onClick={() => openEditLayoutModal(selectedLayout)}
                disabled={isLocked}
                title="Edit layout"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5",
                  "text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  isLocked && "opacity-50 pointer-events-none",
                )}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}

            <button
              type="button"
              onClick={openNewLayoutModal}
              disabled={isLocked}
              title="Add new layout"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/60 px-2.5",
                "text-xs font-medium text-primary hover:bg-primary/10 transition-colors",
                isLocked && "opacity-50 pointer-events-none",
              )}
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>

          {/* ── Profile selector row ── */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Profile</span>

            <Select
              value={selectedTemplateId ?? ""}
              onValueChange={(v) => { setSelectedTemplateId(v); localStorage.setItem("para-template-id", v); }}
              disabled={isLocked || loading}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder={loading ? "Loading…" : "Select a profile…"} />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No profiles yet — click <strong>New</strong> to create one.
                  </div>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.profileName}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Edit selected */}
            {selectedTemplate && (
              <button
                type="button"
                onClick={() => openEditModal(selectedTemplate)}
                disabled={isLocked}
                title="Edit selected profile"
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5",
                  "text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                  isLocked && "opacity-50 pointer-events-none",
                )}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}

            {/* New template */}
            <button
              type="button"
              onClick={openNewModal}
              disabled={isLocked}
              title="Add new profile"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/60 px-2.5",
                "text-xs font-medium text-primary hover:bg-primary/10 transition-colors",
                isLocked && "opacity-50 pointer-events-none",
              )}
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>

          {/* ── Input mode toggle ── */}
          <div
            className="inline-flex shrink-0 self-start rounded-lg border border-border p-0.5 bg-muted/50"
            role="group"
          >
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                inputMode === "text"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => { setInputMode("text"); localStorage.setItem("para-input-mode", "text"); }}
            >
              Text Import
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                inputMode === "ai"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => { setInputMode("ai"); localStorage.setItem("para-input-mode", "ai"); }}
            >
              ✨ AI Generate
            </button>
          </div>

          {/* ── Paragraph input or AI panel ── */}
          {inputMode === "text" ? (
            <ParagraphInput
              rawText={rawText}
              onChange={setRawText}
              onImport={importText}
              disabled={isLocked}
            />
          ) : (
            <AIGeneratePanel onGenerate={appendItems} disabled={isLocked} />
          )}

          {/* ── Queue list ── */}
          <ParagraphQueueList
            items={items}
            fileProgress={fileProgress}
            outputSizes={outputSizesById}
            onRemove={removeItem}
            onClear={handleClearAll}
            disabled={isLocked}
          />
        </div>
      </ScrollArea>

      {/* ── Convert bar ── */}
      <div className="shrink-0 border-t border-border pt-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={!isLocked && !isDone && !isError ? handleConvert : undefined}
              disabled={isLocked || items.length === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold",
                "border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isLocked || items.length === 0
                  ? "cursor-not-allowed border-border bg-muted text-muted-foreground opacity-70"
                  : "cursor-pointer border-primary bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {isLocked ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
              {preparing ? "Rendering…" : isRunning ? "Converting…" : "Convert"}
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={() => void stop()}
                className="inline-flex items-center gap-2 rounded-lg border border-destructive/60 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10"
              >
                Stop
              </button>
            )}

            {items.length > 0 && !isLocked && !isDone && !isError && (
              <span className="text-xs text-muted-foreground">
                {items.length === 1 ? "1 post → 1 video" : `${items.length} posts → ${items.length} videos`}
              </span>
            )}

            {(isDone || isError || (isRunning && outputPaths.length > 0)) && (
              <button
                type="button"
                onClick={() => { reset(); setPrepError(null); }}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Convert again
              </button>
            )}
          </div>

          {(isRunning || isDone) && (
            <div className="flex flex-col gap-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all duration-200 ease-out", isDone ? "bg-green-500" : "bg-primary")}
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              {isRunning && currentLabel && (
                <p className="text-xs text-muted-foreground tabular-nums">{currentLabel}</p>
              )}
            </div>
          )}

          {prepError && !isRunning && !isDone && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive">{prepError}</p>
            </div>
          )}

          {(isRunning || isDone) && outputPaths.length > 0 && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2",
                isDone
                  ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40"
                  : "border-border bg-muted/60",
              )}
            >
              <CheckCircle2
                className={cn(
                  "h-4 w-4 shrink-0",
                  isDone ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                )}
              />
              <p
                className={cn(
                  "text-xs font-medium",
                  isDone ? "text-green-800 dark:text-green-300" : "text-foreground",
                )}
              >
                {isDone
                  ? outputPaths.length === 1
                    ? "Done — 1 video saved."
                    : `Done — ${outputPaths.length} videos saved.`
                  : outputPaths.length === 1
                    ? "1 video saved so far…"
                    : `${outputPaths.length}/${items.length} videos saved…`}
              </p>
              <button
                type="button"
                onClick={() => void window.electronAPI.showItem(outputPaths[outputPaths.length - 1]!)}
                className={cn(
                  "ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  isDone
                    ? "text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/60"
                    : "text-foreground hover:bg-muted",
                )}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                Show in Finder
              </button>
            </div>
          )}

          {isError && errorMessage && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="text-xs text-destructive leading-relaxed whitespace-pre-line">{errorMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Profile modal ── */}
      <TemplateFormModal
        open={modalOpen}
        template={editingTemplate}
        onSave={handleTemplateSave}
        onDelete={editingTemplate ? handleTemplateDelete : undefined}
        onClose={closeModal}
      />

      {/* ── Layout modal ── */}
      <LayoutTemplateFormModal
        open={layoutModalOpen}
        template={editingLayout}
        defaultHtml={FACEBOOK_POSTS_HTML}
        onSave={handleLayoutSave}
        onDelete={editingLayout ? handleLayoutDelete : undefined}
        onClose={closeLayoutModal}
      />
    </div>
  );
}
