import { contextBridge, ipcRenderer } from "electron";
import type { ConvertOptions, ConvertResult } from "../lib/ffmpeg";

export interface ElectronAPI {
  /** Open native file picker, returns absolute paths of chosen image files */
  openFiles: () => Promise<string[]>;
  /** Open native folder picker, returns absolute paths of all images inside recursively */
  openFolder: () => Promise<string[]>;
  /**
   * Run an FFmpeg conversion job.
   * @param jobId  Caller-generated unique string; echoed back in progress events.
   * @param options  Conversion parameters.
   */
  convert: (jobId: string, options: ConvertOptions) => Promise<ConvertResult>;
  /**
   * Subscribe to progress updates for all running jobs.
   * Returns an unsubscribe function.
   */
  onConvertProgress: (
    cb: (jobId: string, percent: number) => void,
  ) => () => void;
}

contextBridge.exposeInMainWorld("electronAPI", {
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),

  convert: (jobId: string, options: ConvertOptions) =>
    ipcRenderer.invoke("convert:run", jobId, options),

  onConvertProgress: (cb: (jobId: string, percent: number) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { jobId: string; percent: number },
    ) => cb(payload.jobId, payload.percent);
    ipcRenderer.on("convert:progress", handler);
    return () => ipcRenderer.off("convert:progress", handler);
  },
} satisfies ElectronAPI);
