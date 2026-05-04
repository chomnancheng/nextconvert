import DropZone from "@/renderer/components/DropZone";
import ThumbnailGrid from "@/renderer/components/ThumbnailGrid";
import { useImageFiles } from "@/renderer/hooks/useImageFiles";

export default function ImageToReels() {
  const { files, addFiles, addPaths, removeFile, clearFiles } = useImageFiles();

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto">
      <DropZone
        onFiles={addFiles}
        onPaths={addPaths}
        hasFiles={files.length > 0}
      />
      <ThumbnailGrid
        files={files}
        onRemove={removeFile}
        onClear={clearFiles}
      />
    </div>
  );
}
