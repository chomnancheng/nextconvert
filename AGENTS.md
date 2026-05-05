# AGENTS.md

## Package manager

**Bun** — use `bun install`, `bun run`, `bun add`. Do not use `npm`, `yarn`, or `pnpm`.

## Key commands

```bash
bun run dev          # Vite renderer (port 5173) + Electron main, concurrently
bun run build        # Production build: Vite renderer → dist/renderer, tsc → dist/electron
bun run typecheck    # tsc --noEmit on both renderer (tsconfig.json) and electron (tsconfig.electron.json)
bun run lint         # ESLint over app/
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
- Electron main loads the Vite dev server (`http://localhost:5173`) in dev, and `dist/renderer/index.html` in production. The `NODE_ENV` env var controls the branch in `app/electron/main.ts`.
- Preload uses `contextBridge` + `contextIsolation: true`. All new IPC APIs go in `app/electron/preload.ts` and are typed under `window.electronAPI`.

## Folder structure

```
app/
  electron/     main.ts, preload.ts  (Node/Electron, CJS output)
  renderer/     React SPA — index.html, main.tsx, App.tsx, globals.css
  renderer/components/   UI components
  renderer/pages/        Page-level components
  lib/          Shared logic (utils.ts, future: ffmpeg, auth helpers)
docs/           APP_SPEC.md, AI_INSTRUCTIONS.md, UPDATE_WORKFLOW.md
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
