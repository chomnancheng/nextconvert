import { useState, useCallback } from "react";

export interface ImageFile {
  /** Stable unique key */
  id: string;
  /** Display name */
  name: string;
  /** Absolute path on disk — used by FFmpeg later */
  path: string;
  /** Object URL for <img> preview — created once, revoked on removal */
  previewUrl: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

function isImageFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function makeId(): string {
  return Math.random().toString(36).slice(2);
}

/** Build an ImageFile from a native File object (drag-drop or <input> picker) */
function fromFile(file: File): ImageFile {
  return {
    id: makeId(),
    name: file.name,
    // `file.path` is Electron-specific — available on File objects inside the renderer
    path: (file as File & { path: string }).path,
    previewUrl: URL.createObjectURL(file),
  };
}

/** Build an ImageFile from an absolute path string (IPC folder scan result) */
function fromPath(absPath: string): ImageFile {
  const name = absPath.split(/[\\/]/).pop() ?? absPath;
  return {
    id: makeId(),
    name,
    path: absPath,
    // Electron renderer can load local files via the file:// protocol directly
    previewUrl: `file://${absPath}`,
  };
}

export function useImageFiles() {
  const [files, setFiles] = useState<ImageFile[]>([]);

  /** Add File objects (from drag-drop or <input>), deduplicated by path */
  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter((f) => isImageFile(f.name));
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      const next = arr
        .map(fromFile)
        .filter((f) => f.path && !existingPaths.has(f.path));
      return [...prev, ...next];
    });
  }, []);

  /** Add absolute path strings (from IPC dialog), deduplicated by path */
  const addPaths = useCallback((paths: string[]) => {
    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path));
      const next = paths
        .filter((p) => isImageFile(p) && !existingPaths.has(p))
        .map(fromPath);
      return [...prev, ...next];
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      // Only revoke blob URLs, not file:// URLs
      if (target?.previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.previewUrl.startsWith("blob:")) URL.revokeObjectURL(f.previewUrl);
      });
      return [];
    });
  }, []);

  return { files, addFiles, addPaths, removeFile, clearFiles };
}
