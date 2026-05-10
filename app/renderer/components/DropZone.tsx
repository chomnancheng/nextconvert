import { useRef, useState, useCallback } from "react";
import { UploadCloud, FolderOpen, Images } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onPaths: (paths: string[]) => void;
  hasFiles: boolean;
  disabled?: boolean;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

function isImagePath(p: string): boolean {
  return IMAGE_EXTS.has(p.split(".").pop()?.toLowerCase() ?? "");
}

function getPathsFromFiles(fileList: FileList | File[]): string[] {
  const paths: string[] = [];
  for (const f of Array.from(fileList)) {
    const p = window.electronAPI?.getFilePath(f) ?? "";
    if (p && isImagePath(p)) paths.push(p);
  }
  return paths;
}

export default function DropZone({ onPaths, hasFiles, disabled = false }: DropZoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    dragCounter.current++;
    setIsDraggingOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDraggingOver(false);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    if (disabled) return;
    const paths = getPathsFromFiles(e.dataTransfer.files);
    if (paths.length > 0) onPaths(paths);
  }, [disabled, onPaths]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const paths = getPathsFromFiles(e.target.files);
      if (paths.length > 0) onPaths(paths);
    }
    e.target.value = "";
  }, [onPaths]);

  const handleFolderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const paths = getPathsFromFiles(e.target.files);
      if (paths.length > 0) onPaths(paths);
    }
    e.target.value = "";
  }, [onPaths]);

  const handleBrowseFiles = useCallback(async () => {
    if (disabled) return;
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFiles();
      if (paths.length > 0) onPaths(paths);
    } else {
      fileInputRef.current?.click();
    }
  }, [disabled, onPaths]);

  const handleBrowseFolder = useCallback(async () => {
    if (disabled) return;
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFolder();
      if (paths.length > 0) onPaths(paths);
    } else {
      folderInputRef.current?.click();
    }
  }, [disabled, onPaths]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed",
        "transition-colors duration-150 select-none min-h-[160px] px-8 py-8",
        disabled
          ? "border-border bg-muted/10 opacity-50 pointer-events-none"
          : isDraggingOver
            ? "border-primary bg-primary/5"
            : hasFiles
              ? "border-border bg-muted/20"
              : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/40 cursor-pointer",
      )}
    >
      <input ref={fileInputRef} type="file" multiple accept=".jpg,.jpeg,.png,.webp"
        className="hidden" onChange={handleFileInput} />
      <input ref={folderInputRef} type="file"
        // @ts-expect-error — non-standard but works in Chromium/Electron
        webkitdirectory="" multiple className="hidden" onChange={handleFolderInput} />

      {isDraggingOver ? (
        <div className="pointer-events-none flex flex-col items-center gap-2">
          <UploadCloud className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium text-primary">Drop to add images</p>
        </div>
      ) : (
        <>
          <UploadCloud className="h-8 w-8 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop images or a folder
            </p>
            <p className="mt-1 text-xs text-muted-foreground">JPG · PNG · WEBP</p>
          </div>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={handleBrowseFiles}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-background",
                "px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors",
              )}>
              <Images className="h-3.5 w-3.5" />
              Browse files
            </button>
            <button type="button" onClick={handleBrowseFolder}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-background",
                "px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors",
              )}>
              <FolderOpen className="h-3.5 w-3.5" />
              Browse folder
            </button>
          </div>
        </>
      )}
    </div>
  );
}
