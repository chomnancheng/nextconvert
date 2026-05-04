import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  /** Open native file picker, returns absolute paths of chosen image files */
  openFiles: () => Promise<string[]>;
  /** Open native folder picker, returns absolute paths of all images inside recursively */
  openFolder: () => Promise<string[]>;
}

contextBridge.exposeInMainWorld("electronAPI", {
  openFiles: () => ipcRenderer.invoke("dialog:openFiles"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
} satisfies ElectronAPI);
