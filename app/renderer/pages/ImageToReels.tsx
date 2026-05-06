import DropZone from "@/renderer/components/DropZone";
import ThumbnailGrid from "@/renderer/components/ThumbnailGrid";
import ConvertBar from "@/renderer/components/ConvertBar";
import SettingsPanel from "@/renderer/pages/Settings";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { useImageFiles } from "@/renderer/hooks/useImageFiles";
import { useConvert } from "@/renderer/hooks/useConvert";
import { useSettings } from "@/renderer/hooks/useSettings";

export default function ImageToReels() {
  const { files, addPaths, removeFile, clearFiles } = useImageFiles();
  const { status, progress, currentLabel, outputPaths, errorMessage, run, reset, stop } = useConvert();
  const {
    settings,
    encoders,
    setPreset,
    setCustomSize,
    setDuration,
    setQuality,
    setWatermark,
    setMusic,
    setMetadata,
    setOutputDir,
    setEncoder,
    reset: resetSettings,
  } = useSettings();

  const isLocked = status === "running";

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">

      {/* ── Left: drop zone + thumbnails + convert bar ── */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden min-w-0">
        <ScrollArea className="flex-1 pr-2">
          <div className="flex flex-col gap-4">
            <DropZone
              onPaths={addPaths}
              hasFiles={files.length > 0}
              disabled={isLocked}
            />
            <ThumbnailGrid
              files={files}
              onRemove={removeFile}
              onClear={clearFiles}
              disabled={isLocked}
            />
          </div>
        </ScrollArea>

        <div className="shrink-0 border-t border-border pt-4">
          <ConvertBar
            fileCount={files.length}
            status={status}
            progress={progress}
            currentLabel={currentLabel}
            outputPaths={outputPaths}
            errorMessage={errorMessage}
            onConvert={() => run(files.map((f) => f.path), settings)}
            onReset={reset}
            onStop={stop}
          />
        </div>
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
            onMetadata={setMetadata}
            onOutputDir={setOutputDir}
            onEncoder={setEncoder}
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
