import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import https from "https";
import os from "os";
import { convert } from "../lib/ffmpeg";
import type { ConvertOptionsLegacy } from "../lib/ffmpeg";
import { initStore, storeGet, storeSet } from "../lib/store";

const execFileAsync = promisify(execFile);
// In a packaged app the binary is in app.asar.unpacked, not app.asar
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = (require("ffmpeg-static") as string)
  .replace(/app\.asar([/\\])/, "app.asar.unpacked$1");

const isDev = process.env.NODE_ENV === "development";

const AUDIO_EXTS = new Set([".mp3", ".mp4", ".m4a", ".aac"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const GITHUB_OWNER = "chomnancheng";
const GITHUB_REPO = "nextconvert";

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: ReleaseAsset[];
}

interface UpdateCheckResult {
  ok: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

function parseVersion(version: string): number[] {
  return version.replace(/^v/i, "").split(".").map((x) => parseInt(x, 10) || 0);
}

function isVersionNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function fetchLatestRelease(): Promise<GithubRelease> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "api.github.com",
        path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        headers: {
          "User-Agent": "nextconvert-updater",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`GitHub API failed (${res.statusCode ?? 0}): ${body.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(body) as GithubRelease);
          } catch {
            reject(new Error("Failed to parse GitHub release response."));
          }
        });
      },
    );
    req.on("error", reject);
  });
}

function chooseAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  const arch = process.arch;
  if (process.platform === "win32") {
    return assets.find((a) => a.name.endsWith(".exe") && !a.name.endsWith(".blockmap")) ?? null;
  }
  if (process.platform === "darwin") {
    if (arch === "arm64") {
      return assets.find((a) => a.name.includes("arm64") && a.name.endsWith(".dmg")) ?? null;
    }
    return (
      assets.find((a) => !a.name.includes("arm64") && a.name.endsWith(".dmg")) ??
      assets.find((a) => a.name.endsWith(".dmg")) ??
      null
    );
  }
  return null;
}

function downloadFile(url: string, destinationPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destinationPath);
    const req = https.get(url, (res) => {
      if (
        res.statusCode &&
        [301, 302, 307, 308].includes(res.statusCode) &&
        res.headers.location
      ) {
        file.close();
        fs.unlink(destinationPath, () => {});
        downloadFile(res.headers.location!, destinationPath).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        file.close();
        fs.unlink(destinationPath, () => {});
        reject(new Error(`Download failed with status ${res.statusCode ?? 0}.`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve();
      });
    });
    req.on("error", (err) => {
      file.close();
      fs.unlink(destinationPath, () => {});
      reject(err);
    });
    file.on("error", (err) => {
      file.close();
      fs.unlink(destinationPath, () => {});
      reject(err);
    });
  });
}

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

  // ── Updates ───────────────────────────────────────────────────────────────

  ipcMain.handle("update:check", async (): Promise<UpdateCheckResult> => {
    try {
      const currentVersion = app.getVersion();
      const latest = await fetchLatestRelease();
      const latestVersion = latest.tag_name.replace(/^v/i, "");
      return {
        ok: true,
        hasUpdate: isVersionNewer(latestVersion, currentVersion),
        currentVersion,
        latestVersion,
      };
    } catch (error) {
      return {
        ok: false,
        hasUpdate: false,
        currentVersion: app.getVersion(),
        error: error instanceof Error ? error.message : "Unknown update check error.",
      };
    }
  });

  ipcMain.handle("update:downloadLatest", async () => {
    try {
      const latest = await fetchLatestRelease();
      const latestVersion = latest.tag_name.replace(/^v/i, "");
      const asset = chooseAsset(latest.assets);
      if (!asset) {
        return { ok: false, error: `No compatible installer found for ${process.platform}/${process.arch}.` };
      }
      const downloadsDir = path.join(os.homedir(), "Downloads", "NextConvert-updates");
      fs.mkdirSync(downloadsDir, { recursive: true });
      const destination = path.join(downloadsDir, asset.name);
      await downloadFile(asset.browser_download_url, destination);
      // Open installer/dmg for the user to continue the update flow.
      await shell.openPath(destination);
      return { ok: true, filePath: destination, latestVersion };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to download update.",
      };
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
