import { useState, useCallback } from "react";

export interface ImageFile {
  id: string;
  name: string;
  /** Absolute path on disk — used by FFmpeg. Empty string if unavailable. */
  path: string;
  /** URL safe for <img src>. blob: or file:// */
  previewUrl: string;
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "webp"]);

function isImageByExt(name: string): boolean {
  return IMAGE_EXTS.has(name.split(".").pop()?.toLowerCase() ?? "");
}

function makeId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Build an ImageFile from a native File object (drag-drop or <input>).
 *
 * In Electron, File objects have a non-standard `.path` property with the
 * absolute OS path. Outside Electron (browser) it is undefined — in that case
 * we store an empty string and use the blob URL for everything.
 */
function fromFile(file: File): ImageFile {
  const electronPath = (file as File & { path?: string }).path ?? "";
  return {
    id: makeId(),
    name: file.name,
    path: electronPath,
    // blob: URL works in both Electron and browser; file:// only in Electron
    previewUrl: URL.createObjectURL(file),
  };
}

/** Build an ImageFile from an absolute path (IPC dialog result). */
async function fromPath(absPath: string): Promise<ImageFile> {
  const name = absPath.split(/[\\/]/).pop() ?? absPath;
  let previewUrl = "";
  try {
    previewUrl = await window.electronAPI.imageToDataUrl(absPath);
  } catch {
    // Fallback for environments that cannot use IPC preview loading.
    previewUrl = `file://${encodeURI(absPath)}`;
  }
  return {
    id: makeId(),
    name,
    path: absPath,
    previewUrl,
  };
}

export function useImageFiles() {
  const [files, setFiles] = useState<ImageFile[]>([]);

  /**
   * Add File objects from drag-drop or <input>.
   * Deduplicates by `file.path` when available, by `file.name` otherwise.
   */
  const addFiles = useCallback((incoming: File[]) => {
    const filtered = incoming.filter((f) => isImageByExt(f.name));
    if (filtered.length === 0) return;

    setFiles((prev) => {
      const existingPaths = new Set(prev.map((f) => f.path).filter(Boolean));

      const next: ImageFile[] = [];
      for (const f of filtered) {
        const item = fromFile(f);
        // Only accept files that have an absolute path — empty path means
        // file.path wasn't populated (shouldn't happen in Electron but guard anyway)
        if (!item.path) continue;
        if (!existingPaths.has(item.path)) {
          existingPaths.add(item.path);
          next.push(item);
        }
      }
      return [...prev, ...next];
    });
  }, []);

  /** Add absolute path strings (from IPC dialog), deduplicated by path. */
  const addPaths = useCallback((paths: string[]) => {
    const filtered = paths.filter((p) => isImageByExt(p));
    if (filtered.length === 0) return;

    void (async () => {
      const uniqueNewPaths = Array.from(new Set(filtered));
      if (uniqueNewPaths.length === 0) return;

      const next = await Promise.all(uniqueNewPaths.map((p) => fromPath(p)));

      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.path));
        const safeNext = next.filter((f) => !existing.has(f.path));
        return [...prev, ...safeNext];
      });
    })();
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
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
