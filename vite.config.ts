import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "app/renderer",
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
