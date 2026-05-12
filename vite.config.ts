import { defineConfig, loadEnv, type ConfigEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const PUBLIC_ENV_ALIASES = {
  VITE_CLERK_PUBLISHABLE_KEY: ["VITE_CLERK_PUBLISHABLE_KEY", "CLERK_PUBLISHABLE_KEY"],
  VITE_SUPABASE_URL: ["VITE_SUPABASE_URL", "SUPABASE_URL"],
  VITE_SUPABASE_ANON_KEY: ["VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
} as const;

function resolvePublicEnv(mode: string): Record<keyof typeof PUBLIC_ENV_ALIASES, string> {
  const loadedEnv = loadEnv(mode, __dirname, "");
  const resolved = {} as Record<keyof typeof PUBLIC_ENV_ALIASES, string>;

  for (const [targetKey, aliases] of Object.entries(PUBLIC_ENV_ALIASES)) {
    resolved[targetKey as keyof typeof PUBLIC_ENV_ALIASES] = aliases
      .map((key) => process.env[key] ?? loadedEnv[key])
      .find((value) => value?.trim())
      ?.trim() ?? "";
  }

  return resolved;
}

export default defineConfig(({ command, mode }: ConfigEnv) => {
  const publicEnv = resolvePublicEnv(mode);
  const missing = Object.entries(publicEnv)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (command === "build" && missing.length) {
    throw new Error(`Missing required build env vars: ${missing.join(", ")}`);
  }

  for (const [key, value] of Object.entries(publicEnv)) {
    if (value) process.env[key] = value;
  }

  return {
    root: "app/renderer",
    envDir: __dirname,
    plugins: [react()],
    define: Object.fromEntries(
      Object.entries(publicEnv).map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
    ),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "app"),
      },
    },
    build: {
      outDir: path.resolve(__dirname, "dist/renderer"),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      // Must match Electron dev URL (127.0.0.1). Default "localhost" can bind IPv6-only
      // on some Macs, so Chromium loading http://127.0.0.1:5173/ never reaches Vite → blank window.
      host: "127.0.0.1",
      hmr: {
        host: "127.0.0.1",
        port: 5173,
        protocol: "ws",
      },
    },
    base: "./",
  };
});
