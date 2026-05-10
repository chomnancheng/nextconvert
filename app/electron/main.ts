import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import { execFile } from "child_process";
import { promisify } from "util";
import https from "https";
import os from "os";
import { convert, cancelConvert } from "../lib/ffmpeg";
import type { ConvertOptionsLegacy } from "../lib/ffmpeg";
import { initStore, storeGet, storeSet } from "../lib/store";

const execFileAsync = promisify(execFile);
// In a packaged app the binary is in app.asar.unpacked, not app.asar
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = (require("ffmpeg-static") as string)
  .replace(/app\.asar([/\\])/, "app.asar.unpacked$1");

const isDev = !app.isPackaged || process.env.NODE_ENV === "development";

const AUDIO_EXTS = new Set([".mp3", ".mp4", ".m4a", ".aac"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
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

interface GithubTag {
  name: string;
}

interface UpdateCheckResult {
  ok: boolean;
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

type PhotoFitMode = "cover" | "contain" | "stretch";

interface PersistedSettings {
  preset: "reel" | "story" | "square" | "custom";
  customWidth: number;
  customHeight: number;
  duration: number;
  quality: number;
  watermark: {
    enabled: boolean;
    type: "text" | "image";
    text: string;
    imagePath: string;
    position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    opacity: number;
  };
  music: {
    enabled: boolean;
    folderPath: string;
    volume: number;
  };
  metadata: {
    title: string;
    author: string;
    description: string;
  };
  outputDir: string;
  encoder: "auto" | "cpu" | "nvidia" | "intel" | "amd" | "apple";
  /** How images are framed in reel + on video B-roll overlay. */
  photoFit?: PhotoFitMode;
  /** Parallel conversion jobs (1–8). */
  concurrentJobs?: number;
  /** Persisted video-background overlay UI (folder still from videobg:* keys). */
  videoBgOverlay?: {
    overlayColor: string;
    overlayOpacity: number;
    overlayImageMaxPercent: number;
  };
}

function mimeFromImagePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

ipcMain.handle("image:toDataUrl", async (_event, filePath: string) => {
  const data = await fs.promises.readFile(filePath);
  const mime = mimeFromImagePath(filePath);
  return `data:${mime};base64,${data.toString("base64")}`;
});

ipcMain.handle("file:getSizes", (_event, paths: string[]) => {
  const out: Record<string, number> = {};
  for (const p of paths) {
    if (!p?.trim()) continue;
    try {
      const st = fs.statSync(p);
      if (st.isFile()) out[p] = st.size;
    } catch {
      /* skip missing */
    }
  }
  return out;
});

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

function extractVersionFromAssetName(assetName: string): string | null {
  const m = assetName.match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function fetchJson(pathname: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "api.github.com",
        path: pathname,
        headers: {
          "User-Agent": "nextconvert-updater",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
  });
}

async function fetchLatestTagFromRedirect(): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: "github.com",
        path: `/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        headers: {
          "User-Agent": "nextconvert-updater",
          Accept: "text/html",
        },
      },
      (res) => {
        const location = res.headers.location ?? "";
        const match = location.match(/\/tag\/([^/?#]+)/);
        if (match?.[1]) {
          resolve(decodeURIComponent(match[1]));
          return;
        }
        reject(new Error("Could not resolve latest release tag from redirect."));
      },
    );
    req.on("error", reject);
  });
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const latestRelease = await fetchJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
  if (latestRelease.statusCode === 200) {
    try {
      return JSON.parse(latestRelease.body) as GithubRelease;
    } catch {
      throw new Error("Failed to parse GitHub latest release response.");
    }
  }

  // If there is no published release yet, GitHub returns 404 for /releases/latest.
  // If unauthenticated API access is blocked/rate-limited, it can also fail with 403.
  let fallbackTag: string | null = null;
  if (latestRelease.statusCode === 404) {
    const tags = await fetchJson(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags?per_page=1`);
    if (tags.statusCode === 200) {
      try {
        const parsed = JSON.parse(tags.body) as GithubTag[];
        if (parsed.length > 0 && parsed[0].name) {
          fallbackTag = parsed[0].name;
        }
      } catch {
        throw new Error("Failed to parse GitHub tags response.");
      }
    }
  }

  if (!fallbackTag) {
    try {
      fallbackTag = await fetchLatestTagFromRedirect();
    } catch {
      fallbackTag = null;
    }
  }

  if (fallbackTag) {
    return { tag_name: fallbackTag, assets: [] };
  }

  throw new Error(`GitHub API failed (${latestRelease.statusCode}): ${latestRelease.body.slice(0, 200)}`);
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

const DEV_RENDERER_URL = "http://127.0.0.1:5173/";

/** Poll until Vite answers — avoids a blank window when Electron wins the startup race. */
function waitForViteDevServer(url: string, timeoutMs = 120_000, pollMs = 150): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for Vite at ${url}`));
        return;
      }
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else {
          setTimeout(attempt, pollMs);
        }
      });
      req.on("error", () => setTimeout(attempt, pollMs));
      req.setTimeout(2500, () => {
        req.destroy();
        setTimeout(attempt, pollMs);
      });
    };
    attempt();
  });
}

function attachDevRendererDiagnostics(win: BrowserWindow): void {
  win.webContents.on("did-fail-load", (_event, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      console.error("[main] did-fail-load (main frame):", code, desc, url);
    }
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[main] render-process-gone:", details.reason, details.exitCode);
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const prefix = `[renderer:${level}]`;
    if (level >= 2) console.error(prefix, message, sourceId, line);
    else console.log(prefix, message);
  });
  if (process.env.ELECTRON_OPEN_DEVTOOLS !== "0") {
    win.webContents.once("did-finish-load", () => {
      win.webContents.openDevTools({ mode: "detach" });
    });
  }
}

function loadDevRenderer(win: BrowserWindow): void {
  attachDevRendererDiagnostics(win);

  let didRetryFailLoad = false;
  win.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    if (didRetryFailLoad) return;
    didRetryFailLoad = true;
    console.warn("[main] Renderer did-fail-load, will retry after Vite is ready:", errorCode, errorDescription, validatedURL);
    void waitForViteDevServer(DEV_RENDERER_URL)
      .then(() => win.loadURL(DEV_RENDERER_URL))
      .catch((err) => console.error("[main] Retry load failed:", err));
  });

  void waitForViteDevServer(DEV_RENDERER_URL)
    .then(() => win.loadURL(DEV_RENDERER_URL))
    .catch((err) => {
      console.error("[main] Vite dev server not reachable:", err);
      void dialog.showMessageBox(win, {
        type: "error",
        title: "NextConvert — dev",
        message: "Could not reach the Vite dev server (port 5173).",
        detail: "Make sure `bun run dev` is running and the renderer started before Electron.\n\n" + String(err),
      });
    });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#f9f9fb",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Some dev setups fail to expose preload when sandboxed; keep production sandboxed.
      sandbox: !isDev,
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  if (isDev) {
    loadDevRenderer(win);
  } else {
    void win.loadFile(path.join(__dirname, "../../renderer/index.html"));
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

  // ── Video background ──────────────────────────────────────────────────────

  ipcMain.handle("videobg:scanFolder", (_event, dir: string) => {
    const files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(dir, e.name));
    storeSet("videoBgFolderPath", dir);
    return { files, count: files.length };
  });

  ipcMain.handle("videobg:getSavedFolder", () => {
    const folderPath = storeGet<string>("videoBgFolderPath", "");
    const enabled = storeGet<boolean>("videoBgEnabled", false);
    if (!folderPath) return { folderPath: "", files: [], count: 0, enabled };
    const files = fs.readdirSync(folderPath, { withFileTypes: true })
      .filter((e) => e.isFile() && VIDEO_EXTS.has(path.extname(e.name).toLowerCase()))
      .map((e) => path.join(folderPath, e.name));
    return { folderPath, files, count: files.length, enabled };
  });

  ipcMain.handle("videobg:saveEnabled", (_event, enabled: boolean) => {
    storeSet("videoBgEnabled", enabled);
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
    const v2 = storeGet<PersistedSettings | null>("settingsV2", null);
    if (v2) return v2;
    // Backward-compatible fallback for older saved keys.
    return {
      preset: "reel",
      customWidth: 1080,
      customHeight: 1920,
      duration: 59,
      quality: 80,
      watermark: {
        enabled: false,
        type: "text",
        text: "",
        imagePath: "",
        position: "bottom-right",
        opacity: 80,
      },
      music: {
        enabled: storeGet<boolean>("musicEnabled", false),
        folderPath: storeGet<string>("musicFolderPath", ""),
        volume: 80,
      },
      metadata: {
        title: "",
        author: "",
        description: "",
      },
      outputDir: storeGet<string>("outputDir", ""),
      encoder: storeGet<PersistedSettings["encoder"]>("gpuEncoder", "auto"),
      photoFit: "cover",
      concurrentJobs: 4,
      videoBgOverlay: {
        overlayColor: "#000000",
        overlayOpacity: 0,
        overlayImageMaxPercent: 100,
      },
    } satisfies PersistedSettings;
  });

  ipcMain.handle("settings:saveAll", (_event, settings: PersistedSettings) => {
    storeSet("settingsV2", settings);
    // Keep legacy fields in sync for compatibility with old code paths.
    storeSet("musicFolderPath", settings.music.folderPath);
    storeSet("musicEnabled", settings.music.enabled);
    storeSet("outputDir", settings.outputDir);
    storeSet("gpuEncoder", settings.encoder);
  });

  ipcMain.handle("settings:resetDefaults", () => {
    storeSet("settingsV2", null);
    storeSet("musicFolderPath", "");
    storeSet("musicEnabled", false);
    storeSet("outputDir", "");
    storeSet("gpuEncoder", "auto");
  });

  ipcMain.handle("settings:saveGpuEncoder", (_event, encoder: string) => {
    storeSet("gpuEncoder", encoder);
  });

  // ── FFmpeg ────────────────────────────────────────────────────────────────

  ipcMain.handle("convert:run", async (_event, jobId: string, options: ConvertOptionsLegacy) => {
    try {
      const safePreset = options.preset === "custom" || options.preset === "reel" || options.preset === "story" || options.preset === "square"
        ? options.preset
        : "reel";
      return await convert({
        ...options,
        preset: safePreset,
      }, (percent) => {
        win.webContents.send("convert:progress", { jobId, percent });
      }, jobId);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown conversion error.",
      };
    }
  });

  ipcMain.handle("convert:cancel", (_event, jobId: string) => {
    return { ok: cancelConvert(jobId) };
  });

  ipcMain.handle("encoder:list", () => {
    const options = [{ value: "auto", label: "Auto (recommended)" }, { value: "cpu", label: "CPU (libx264)" }];
    if (process.platform === "win32") {
      options.push(
        { value: "nvidia", label: "NVIDIA NVENC" },
        { value: "intel", label: "Intel Quick Sync (QSV)" },
        { value: "amd", label: "AMD AMF" },
      );
    } else if (process.platform === "darwin") {
      options.push({ value: "apple", label: "Apple VideoToolbox" });
    }
    return options;
  });

  // ── Shell ─────────────────────────────────────────────────────────────────

  ipcMain.handle("shell:showItem", (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  // ── Window controls ───────────────────────────────────────────────────────

  ipcMain.handle("window:minimize", () => {
    win.minimize();
  });

  ipcMain.handle("window:maximizeToggle", () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    return win.isMaximized();
  });

  ipcMain.handle("window:isMaximized", () => {
    return win.isMaximized();
  });

  ipcMain.handle("window:close", () => {
    win.close();
  });

  // ── Updates ───────────────────────────────────────────────────────────────

  ipcMain.handle("update:check", async (): Promise<UpdateCheckResult> => {
    try {
      const currentVersion = app.getVersion();
      const latest = await fetchLatestRelease();
      const tagVersion = latest.tag_name.replace(/^v/i, "");
      const asset = chooseAsset(latest.assets ?? []);
      // Prefer version parsed from actual downloadable installer name.
      // This prevents update loops when tag and app version drift.
      const latestVersion =
        (asset ? extractVersionFromAssetName(asset.name) : null) ??
        tagVersion;
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
      const currentVersion = app.getVersion();
      const latest = await fetchLatestRelease();
      const tagVersion = latest.tag_name.replace(/^v/i, "");
      if (!latest.assets || latest.assets.length === 0) {
        return {
          ok: false,
          error: "Latest tag has no published release assets yet. Publish a GitHub Release first.",
        };
      }
      const asset = chooseAsset(latest.assets);
      if (!asset) {
        return { ok: false, error: `No compatible installer found for ${process.platform}/${process.arch}.` };
      }
      const latestVersion = extractVersionFromAssetName(asset.name) ?? tagVersion;
      if (!isVersionNewer(latestVersion, currentVersion)) {
        return { ok: false, error: `Current version (${currentVersion}) is already up to date.` };
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
