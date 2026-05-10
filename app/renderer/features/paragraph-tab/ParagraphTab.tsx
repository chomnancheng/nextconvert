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
import type { Template } from "./types";
import { useTemplates } from "./hooks/useTemplates";
import { useParagraphQueue } from "./hooks/useParagraphQueue";
import ParagraphInput from "./components/ParagraphInput";
import ParagraphQueueList from "./components/ParagraphQueueList";
import AIGeneratePanel from "./components/AIGeneratePanel";
import TemplateFormModal from "./components/TemplateFormModal";
import { renderPostToDataUrl } from "./utils/postCanvas";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const { status, fileProgress, outputPaths, errorMessage, run, reset, stop } =
    useConvert();
  const [preparing, setPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [outputSizesById, setOutputSizesById] = useState<Record<string, number>>({});
  const [inputMode, setInputMode] = useState<"text" | "ai">("text");

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
    if (selectedTemplateId === editingTemplate.id) setSelectedTemplateId(null);
    closeModal();
  }, [editingTemplate, deleteTemplate, selectedTemplateId, closeModal]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const isRunning = status === "running";
  const isDone    = status === "done";
  const isError   = status === "error";
  const isLocked  = isRunning || preparing;

  // Fetch output file sizes once conversion completes
  useEffect(() => {
    if (!isDone || outputPaths.length === 0 || items.length === 0) return;
    const paths = outputPaths.slice(0, items.length);
    void window.electronAPI.getFileSizes(paths).then((sizeMap) => {
      const byId: Record<string, number> = {};
      items.forEach((item, i) => {
        const p = paths[i];
        if (p && sizeMap[p]) byId[item.id] = sizeMap[p];
      });
      setOutputSizesById(byId);
    });
  }, [isDone, outputPaths, items]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
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
      setPrepError("Select a template before converting.");
      return;
    }
    if (!settings.outputDir) {
      setPrepError("Select an output folder in Settings → Output before converting.");
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
        const dataUrl = await renderPostToDataUrl(selectedTemplate, item.text, { dims, transparent });
        const base64   = dataUrl.split(",")[1];
        const filename = `post_${String(i + 1).padStart(3, "0")}.png`;
        const tempPath = await window.electronAPI.saveParagraphTempImage(base64, filename);
        syntheticFiles.push({
          id: item.id,
          name: `Post #${item.lineNumber}`,
          path: tempPath,
          previewUrl: dataUrl,
        });
      }
    } catch (err) {
      setPrepError(`Failed to render posts: ${err instanceof Error ? err.message : String(err)}`);
      setPreparing(false);
      return;
    }

    setPreparing(false);
    await run(syntheticFiles, "by-images", settings);
    void window.electronAPI.cleanupParagraphTemp();
  }, [selectedTemplate, settings, items, run]);

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

          {/* ── Template selector row ── */}
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Template</span>

            <Select
              value={selectedTemplateId ?? ""}
              onValueChange={setSelectedTemplateId}
              disabled={isLocked || loading}
            >
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder={loading ? "Loading…" : "Select a template…"} />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    No templates yet — click <strong>New</strong> to create one.
                  </div>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.name}
                      {t.profileName && (
                        <span className="ml-1.5 text-muted-foreground">· {t.profileName}</span>
                      )}
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
                title="Edit selected template"
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
              title="Add new template"
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
              onClick={() => setInputMode("text")}
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
              onClick={() => setInputMode("ai")}
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

            {(isDone || isError) && (
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

          {isDone && outputPaths.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/40">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
              <p className="text-xs font-medium text-green-800 dark:text-green-300">
                {outputPaths.length === 1 ? "Done — 1 video saved." : `Done — ${outputPaths.length} videos saved.`}
              </p>
              <button
                type="button"
                onClick={() => void window.electronAPI.showItem(outputPaths[0])}
                className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/60 transition-colors"
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

      {/* ── Template modal ── */}
      <TemplateFormModal
        open={modalOpen}
        template={editingTemplate}
        onSave={handleTemplateSave}
        onDelete={editingTemplate ? handleTemplateDelete : undefined}
        onClose={closeModal}
      />
    </div>
  );
}
