import { useMemo, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import DropZone from "@/renderer/components/DropZone";
import MediaTable from "@/renderer/components/MediaTable";
import ConvertBar from "@/renderer/components/ConvertBar";
import SettingsPanel from "@/renderer/pages/Settings";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { useImageFiles } from "@/renderer/hooks/useImageFiles";
import { useConvert } from "@/renderer/hooks/useConvert";
import { useSettings } from "@/renderer/hooks/useSettings";
import ParagraphTab from "@/renderer/features/paragraph-tab/ParagraphTab";

export type ReelStoryMode = "images" | "paragraph";

export default function ImageToReels() {
  const { files, addPaths, removeFile, clearFiles } = useImageFiles();
  const { status, fileProgress, outputPaths, errorMessage, run, reset, stop } = useConvert();
  const {
    settings,
    encoders,
    setPreset,
    setCustomSize,
    setDuration,
    setQuality,
    setWatermark,
    setMusic,
    setVideoBg,
    setMetadata,
    setOutputDir,
    setEncoder,
    setPhotoFit,
    setConcurrentJobs,
    reset: resetSettings,
  } = useSettings();

  const [workMode, setWorkMode] = useState<ReelStoryMode>("images");

  const isLocked = status === "running";
  const imagesMode = workMode === "images";

  // Overall progress aggregated from per-item state
  const { overallProgress, currentLabel } = useMemo(() => {
    const vals = Object.values(fileProgress);
    if (vals.length === 0) return { overallProgress: 0, currentLabel: "" };
    const totalPct = vals.reduce(
      (sum, v) => sum + (v.status === "done" ? 100 : v.progress),
      0,
    );
    const doneCount = vals.filter((v) => v.status === "done").length;
    const total = vals.length;
    return {
      overallProgress: Math.round(totalPct / vals.length),
      currentLabel: total > 0 ? `${doneCount}/${total}` : "",
    };
  }, [fileProgress]);

  const [inputSizesById, setInputSizesById] = useState<Record<string, number>>({});

  const handleClearAll = useCallback(() => {
    clearFiles();
    reset();
  }, [clearFiles, reset]);

  useEffect(() => {
    const paths = files.map((f) => f.path).filter(Boolean);
    if (paths.length === 0) {
      setInputSizesById({});
      return;
    }
    let cancelled = false;
    void window.electronAPI.getFileSizes(paths).then((map) => {
      if (cancelled) return;
      setInputSizesById(
        Object.fromEntries(
          files.filter((f) => f.path).map((f) => [f.id, map[f.path] ?? 0]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  const tableItems = useMemo(
    () =>
      files.map((f) => ({
        id: f.id,
        name: f.name,
        previewUrl: f.previewUrl,
        inputSizeBytes: inputSizesById[f.id],
      })),
    [files, inputSizesById],
  );

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">

      {/* ── Left: mode switch + main area + convert ── */}
      <div className="flex flex-1 flex-col gap-3 overflow-hidden min-w-0">
        <div
          className="inline-flex shrink-0 rounded-lg border border-border p-0.5 bg-muted/50"
          role="group"
          aria-label="Story source mode"
        >
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              imagesMode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setWorkMode("images")}
          >
            By Images
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              !imagesMode
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setWorkMode("paragraph")}
          >
            By Paragraph
          </button>
        </div>

        {imagesMode ? (
          <>
            <ScrollArea className="flex-1 pr-2">
              <div className="flex flex-col gap-4">
                <DropZone
                  onPaths={addPaths}
                  hasFiles={files.length > 0}
                  disabled={isLocked}
                />
                <MediaTable
                  items={tableItems}
                  fileProgress={fileProgress}
                  onRemove={removeFile}
                  onClear={handleClearAll}
                  label="images"
                  disabled={isLocked}
                />
              </div>
            </ScrollArea>

            <div className="shrink-0 border-t border-border pt-4">
              <ConvertBar
                fileCount={files.length}
                status={status}
                progress={overallProgress}
                currentLabel={currentLabel}
                outputPaths={outputPaths}
                errorMessage={errorMessage}
                onConvert={() => run(files, "by-images", settings)}
                onReset={reset}
                onStop={stop}
              />
            </div>
          </>
        ) : (
          <ParagraphTab settings={settings} />
        )}
      </div>

      {/* ── Right: settings panel ── */}
      <div className="w-72 shrink-0 border-l border-border pl-4">
        <ScrollArea className="h-full pr-2">
          <SettingsPanel
            settings={settings}
            onPreset={setPreset}
            onDuration={setDuration}
            onQuality={setQuality}
            onWatermark={setWatermark}
            onMusic={setMusic}
            onVideoBg={setVideoBg}
            onMetadata={setMetadata}
            onOutputDir={setOutputDir}
            onEncoder={setEncoder}
            onPhotoFit={setPhotoFit}
            onConcurrentJobs={setConcurrentJobs}
            onCustomSize={setCustomSize}
            onResetDefaults={resetSettings}
            encoderOptions={encoders}
            disabled={isLocked}
          />
        </ScrollArea>
      </div>

    </div>
  );
}
