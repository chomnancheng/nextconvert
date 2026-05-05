import DropZone from "@/renderer/components/DropZone";
import ThumbnailGrid from "@/renderer/components/ThumbnailGrid";
import ConvertBar from "@/renderer/components/ConvertBar";
import SettingsPanel from "@/renderer/pages/Settings";
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
    setDuration,
    setQuality,
    setWatermark,
    setMusic,
    setMetadata,
    setOutputDir,
    setEncoder,
  } = useSettings();

  const isLocked = status === "running";

  return (
    <div className="flex flex-1 gap-4 overflow-hidden">

      {/* ── Left: drop zone + thumbnails + convert bar ── */}
      <div className="flex flex-1 flex-col gap-4 overflow-hidden min-w-0">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
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
      <div className="w-72 shrink-0 border-l border-border overflow-y-auto pl-4">
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
          encoderOptions={encoders}
          disabled={isLocked}
        />
      </div>

    </div>
  );
}
