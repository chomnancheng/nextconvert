import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

function requireBuildEnv() {
  if (process.env.NODE_ENV === "production" || process.argv.includes("build")) {
    const missing = ["VITE_CLERK_PUBLISHABLE_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]
      .filter((k) => !process.env[k]?.trim());
    if (missing.length) {
      throw new Error(`Missing required build env vars: ${missing.join(", ")}`);
    }
  }
}

requireBuildEnv();

export default defineConfig({
  root: "app/renderer",
  envDir: __dirname,
  plugins: [react()],
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
});
