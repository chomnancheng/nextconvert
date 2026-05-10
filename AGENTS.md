# AGENTS.md

## Package manager

**Bun** — use `bun install`, `bun run`, `bun add`. Do not use `npm`, `yarn`, or `pnpm`.

## Key commands

```bash
bun run dev          # Vite renderer (port 5173) + Electron main, concurrently
bun run build        # Production build: Vite renderer → dist/renderer, tsc → dist/electron
bun run typecheck    # tsc --noEmit on both renderer (tsconfig.json) and electron (tsconfig.electron.json)
bun run lint         # ESLint (flat config: eslint.config.mjs)
```

## Architecture

Two separate TypeScript compilation targets — do not mix them:

| Layer | Source | Compiler | Output | tsconfig |
|---|---|---|---|---|
| Renderer | `app/renderer/` | Vite (bundler mode) | `dist/renderer/` | `tsconfig.json` |
| Electron main + preload | `app/electron/` | `tsc` | `dist/electron/electron/` | `tsconfig.electron.json` |
| Shared lib | `app/lib/` | `tsc` (same config) | `dist/electron/lib/` | `tsconfig.electron.json` |

- `package.json` `"main"` points to `dist/electron/electron/main.js` (CJS).
- `tsconfig.electron.json` has `rootDir: "app"` and `include: ["app/electron", "app/lib"]` so that `app/lib/` code can be imported by the main process. **Do not change `rootDir` back to `app/electron`** — it will break the import of `app/lib/ffmpeg.ts`.
- Electron main loads the Vite dev server in dev (**`http://127.0.0.1:5173`** — see `vite.config.ts` `server.host`) after waiting until the port responds, and `dist/renderer/index.html` in production (see `app/electron/main.ts`). Older docs may say `localhost`; prefer `127.0.0.1` in dev to match Vite binding.
- Preload uses `contextBridge` + `contextIsolation: true`. All new IPC APIs go in `app/electron/preload.ts` and are typed under `window.electronAPI`.

## Folder structure

```
app/
  electron/     main.ts, preload.ts  (Node/Electron, CJS output)
  renderer/     React SPA — index.html, main.tsx, App.tsx, globals.css
  renderer/components/   UI components
  renderer/pages/        Page-level components
  lib/          ffmpeg.ts + store utilities (main-process only imports)
docs/           APP_SPEC.md, AI_INSTRUCTIONS.md, UPDATE_WORKFLOW.md
.cursor/rules/ nextconvert.mdc  — short agent context (Reel Stories UI, FFmpeg, persistence)
dist/           Build output (gitignored)
```

## Tailwind + shadcn/ui

- Tailwind 3 with CSS variable tokens defined in `app/renderer/globals.css`.
- `components.json` is configured for shadcn/ui CLI: `npx shadcn@latest add <component>` places components in `app/renderer/components/ui/` and uses `app/lib/utils.ts` for `cn()`.
- **After any `shadcn add`**, verify the generated file imports `cn` as `@/lib/utils`, not `app/lib/utils` — the CLI sometimes emits the bare path, which Vite cannot resolve.
- `postcss.config.js` uses `module.exports` (CJS syntax). Do **not** convert it to ESM — the package has no `"type": "module"` and Electron main requires CJS output.

## Critical quirks

- **No `"type": "module"`** in `package.json` — intentional. Electron main compiles to CJS; adding `"type": "module"` breaks `dist/electron/main.js`.
- `postcss.config.js` must stay as CJS (`module.exports = ...`). Using `export default` causes Vite's PostCSS loader to fail.
- `tailwind.config.ts` content glob targets `app/renderer/**/*.{ts,tsx}` — add paths here if new directories are added outside `app/renderer/`.
- `vite.config.ts` sets `root: "app/renderer"` and `base: "./"`. The `./` base is required for Electron's `loadFile()` to resolve assets correctly in production.

## Platform

Electron binary in `node_modules/electron/dist/Electron.app` is macOS-only. Re-run `bun install` on other platforms.

---

## Reel Stories UI (renderer)

| Area | Files / notes |
|------|----------------|
| Shell tab label | **`Layout.tsx`**: tab **“Reel Stories”**, value **`reel-stories`** |
| Main surface | **`pages/ImageToReels.tsx`** |
| Mode switch | **By Images** (shipped): drop zone + `MediaTable` + `ConvertBar`. **By Paragraph** (stub): placeholder + same **`SettingsPanel`**. |
| Settings panel | **`pages/Settings.tsx`**: accordion **`CollapseGroup`**s; **`SETTINGS_GROUP_IDS`**; **Collapse all / Expand all**; **default all sections collapsed** |
| Convert footer | **`components/ConvertBar.tsx`**: compact progress **`done/total`** while running; success line + **Show in Finder** only (no per-file list) |

**Clear all** on `MediaTable` calls **`clearFiles()`** plus **`reset()`** from **`useConvert`** so “Done — N videos” and progress maps do not linger.

---

## Reel Stories & conversion pipeline (authoritative behavior)

High-level mental model:

1. **By Images:** user adds **JPG / PNG / WEBP** (each logical row → **one MP4**). Parallel encodes obey **`settings.concurrentJobs`** (1–8, default **4**).
2. **Optional B-roll** (folder + **Music & video background** in Settings → **Enable video background**): random clip **looped** under the composited photo. **Photo layout** (**`photoFit`**): **cover** (default), **contain** (letterbox / inset overlay), **stretch**.
3. **Optional music**: **non-repeating shuffle** (`ShuffleQueue` in **`hooks/useConvert.ts`**). FFmpeg **never** `-map`s B-roll audio; only optional music stream.

### FFmpeg (`app/lib/ffmpeg.ts`)

- `convertOne` / IPC **`convert`** — one MP4 per call.
- **Still:** `-loop 1` image → **`stillImageVF`** (fit mode) → optional AAC from music input.
- **Video-bg:** `-stream_loop -1` input 0; optional `-loop 1` overlay PNG; **`filter_complex`**: scaled/cropped bg, optional color wash (`drawbox`), overlay with **`format=yuva420p`** where needed.
- **Quality:** UI 0–100 maps to **`qualityToCrf`** ≈ **CRF 35 (small)** … **18 (sharp)** — *not* the old linear 0→51 scale (avoid multi‑100 MB short reels).
- **Audio:** AAC **128k** when music enabled.
- **Overlay box:** **`overlayImageMaxPercent`** **50–100%** (app default **100** unless user changed saved prefs).
- **`outputSizeBytes`:** **`stat`** after encode for MediaTable column.

### Renderer orchestration (`hooks/useConvert.ts`)

- Worker pool size: **`effectiveConcurrency(settings.concurrentJobs, tasks.length)`**.
- **`batchDir`** naming once per batch; **`convert:progress`** keyed by **`jobId`**.

### Settings / persistence (`useSettings.ts` + **`app/electron/main.ts`**)

- **`saveAllSettings`** persists **`PersistedSettings` / settingsV2** including **`photoFit`**, **`concurrentJobs`**, **`videoBgOverlay`** (`overlayColor`, `overlayOpacity`, `overlayImageMaxPercent`), plus watermark/music/output/metadata/encoder/etc.
- **Folder paths / enabled flags:** still via **`videobg:*`** and **`music:*`** store keys; **`getSavedVideoBgFolder`** → merge **`{ …cur.videoBg, enabled, folderPath, files, fileCount }`** without dropping overlay_* fields populated from **`videoBgOverlay`** / local state.

### Auxiliary IPC

- **`file:getSizes(paths)`**: map path → byte size (`main` + preload + **`env.d.ts`**).

### New IPC checklist

**`app/electron/main.ts`** handler → **`app/electron/preload.ts`** expose → **`app/renderer/env.d.ts`** **`window.electronAPI`**.

