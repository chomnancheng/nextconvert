import { contextBridge, ipcRenderer } from "electron";

// Expose safe APIs to the renderer via window.electronAPI
contextBridge.exposeInMainWorld("electronAPI", {
  // Will be expanded as features are added (file dialogs, ffmpeg, etc.)
  ping: () => ipcRenderer.invoke("ping"),
});
