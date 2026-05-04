import { useRef, useState, useCallback } from "react";
import { UploadCloud, FolderOpen, Images } from "lucide-react";
import { cn } from "@/lib/utils";

interface DropZoneProps {
  onFiles: (files: FileList | File[]) => void;
  onPaths: (paths: string[]) => void;
  hasFiles: boolean;
}

/**
 * Recursively collects all image File objects from a DataTransferItem directory entry.
 */
async function collectFromEntry(
  entry: FileSystemEntry,
): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file(
        (f) => resolve([f]),
        () => resolve([]),
      );
    });
  }

  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const allEntries = await readAllEntries(reader);
    const nested = await Promise.all(allEntries.map(collectFromEntry));
    return nested.flat();
  }

  return [];
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const results: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(results);
        } else {
          results.push(...batch);
          readBatch();
        }
      }, () => resolve(results));
    }
    readBatch();
  });
}

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export default function DropZone({ onFiles, onPaths, hasFiles }: DropZoneProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Track nested drag-enter/leave across children
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDraggingOver(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDraggingOver(false);

      const items = Array.from(e.dataTransfer.items);
      const collected: File[] = [];

      await Promise.all(
        items.map(async (item) => {
          const entry = item.webkitGetAsEntry();
          if (!entry) return;
          const files = await collectFromEntry(entry);
          collected.push(...files.filter((f) => IMAGE_TYPES.has(f.type)));
        }),
      );

      if (collected.length > 0) onFiles(collected);
    },
    [onFiles],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(e.target.files);
      }
      // Reset so the same files can be re-selected if cleared
      e.target.value = "";
    },
    [onFiles],
  );

  const handleFolderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFiles(e.target.files);
      }
      e.target.value = "";
    },
    [onFiles],
  );

  const handleBrowseFiles = useCallback(async () => {
    // Prefer native Electron dialog when available; fall back to <input>
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFiles();
      if (paths.length > 0) onPaths(paths);
    } else {
      fileInputRef.current?.click();
    }
  }, [onPaths]);

  const handleBrowseFolder = useCallback(async () => {
    if (window.electronAPI) {
      const paths = await window.electronAPI.openFolder();
      if (paths.length > 0) onPaths(paths);
    } else {
      folderInputRef.current?.click();
    }
  }, [onPaths]);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed transition-colors duration-150 select-none",
        "min-h-[220px] px-8 py-10",
        isDraggingOver
          ? "border-primary bg-primary/5"
          : hasFiles
            ? "border-border bg-muted/20"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/40",
      )}
    >
      {/* Hidden inputs for fallback / webkitdirectory */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={handleFileInput}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error — webkitdirectory is non-standard but works in Chromium/Electron
        webkitdirectory=""
        className="hidden"
        onChange={handleFolderInput}
      />

      {isDraggingOver ? (
        <div className="flex flex-col items-center gap-2 pointer-events-none">
          <UploadCloud className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium text-primary">Drop images here</p>
        </div>
      ) : (
        <>
          <UploadCloud className="h-10 w-10 text-muted-foreground/60" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drag &amp; drop images or a folder
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              JPG, PNG, WEBP supported
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBrowseFiles}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5",
                "text-xs font-medium text-foreground shadow-sm",
                "hover:bg-muted transition-colors",
              )}
            >
              <Images className="h-3.5 w-3.5" />
              Browse files
            </button>
            <button
              type="button"
              onClick={handleBrowseFolder}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5",
                "text-xs font-medium text-foreground shadow-sm",
                "hover:bg-muted transition-colors",
              )}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Browse folder
            </button>
          </div>
        </>
      )}
    </div>
  );
}
