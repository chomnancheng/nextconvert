import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { convert } from "../lib/ffmpeg";
import type { ConvertOptionsLegacy } from "../lib/ffmpeg";
import { initStore, storeGet, storeSet } from "../lib/store";

const execFileAsync = promisify(execFile);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = require("ffmpeg-static") as string;

const isDev = process.env.NODE_ENV === "development";

const AUDIO_EXTS = new Set([".mp3", ".mp4", ".m4a", ".aac"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectImages(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...collectImages(full));
      else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) results.push(full);
    }
  } catch { /* skip */ }
  return results;
}

function listAudioFiles(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && AUDIO_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(dir, e.name));
  } catch { return []; }
}

async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync(ffmpegBin, ["-i", filePath], { timeout: 8000 })
      .catch((err: { stderr?: string }) => ({ stderr: err.stderr ?? "" }));
    const m = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/.exec(stderr as string);
    if (!m) return null;
    return parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseInt(m[3]) + parseInt(m[4]) / 100;
  } catch { return null; }
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  return win;
}

// ── App ───────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  initStore();
  const win = createWindow();

  // ── Dialogs ──────────────────────────────────────────────────────────────

  ipcMain.handle("dialog:openFiles", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }],
    });
    return canceled ? [] : filePaths;
  });

  ipcMain.handle("dialog:openFolder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled || filePaths.length === 0) return [];
    return collectImages(filePaths[0]);
  });

  ipcMain.handle("dialog:pickFolder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return canceled || filePaths.length === 0 ? "" : filePaths[0];
  });

  // ── Music ─────────────────────────────────────────────────────────────────

  ipcMain.handle("music:scanFolder", (_event, dir: string) => {
    const files = listAudioFiles(dir);
    storeSet("musicFolderPath", dir);
    return { files, count: files.length };
  });

  ipcMain.handle("music:getSavedFolder", () => {
    const folderPath = storeGet<string>("musicFolderPath", "");
    const enabled = storeGet<boolean>("musicEnabled", false);
    if (!folderPath) return { folderPath: "", files: [], count: 0, enabled };
    const files = listAudioFiles(folderPath);
    return { folderPath, files, count: files.length, enabled };
  });

  ipcMain.handle("music:saveEnabled", (_event, enabled: boolean) => {
    storeSet("musicEnabled", enabled);
  });

  ipcMain.handle("music:pickTrack", async (_event, folderPath: string, minDuration: number) => {
    const files = listAudioFiles(folderPath);
    if (files.length === 0) return null;
    const withDur = await Promise.all(files.map(async (f) => ({ f, dur: await getAudioDuration(f) })));
    const qualifying = withDur.filter(({ dur }) => dur !== null && dur >= minDuration).map(({ f }) => f);
    const pool = qualifying.length > 0 ? qualifying : files;
    return pool[Math.floor(Math.random() * pool.length)];
  });

  // ── Settings persistence ──────────────────────────────────────────────────

  ipcMain.handle("settings:saveOutputDir", (_event, dir: string) => {
    storeSet("outputDir", dir);
  });

  ipcMain.handle("settings:getSaved", () => {
    return {
      musicFolderPath: storeGet<string>("musicFolderPath", ""),
      musicEnabled: storeGet<boolean>("musicEnabled", false),
      outputDir: storeGet<string>("outputDir", ""),
    };
  });

  // ── FFmpeg ────────────────────────────────────────────────────────────────

  ipcMain.handle("convert:run", async (_event, jobId: string, options: ConvertOptionsLegacy) => {
    return convert(options, (percent) => {
      win.webContents.send("convert:progress", { jobId, percent });
    });
  });

  // ── Shell ─────────────────────────────────────────────────────────────────

  ipcMain.handle("shell:showItem", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
