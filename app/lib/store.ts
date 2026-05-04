/**
 * Simple persistent key-value store backed by a JSON file in userData.
 * Runs in the Electron main process only.
 */

import { app } from "electron";
import fs from "fs";
import path from "path";

let storePath: string | null = null;
let cache: Record<string, unknown> = {};

function getStorePath(): string {
  if (!storePath) {
    storePath = path.join(app.getPath("userData"), "nextconvert-settings.json");
  }
  return storePath;
}

function load(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(getStorePath(), "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function save(): void {
  try {
    fs.writeFileSync(getStorePath(), JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // Non-fatal — silently ignore write errors
  }
}

/** Initialise the store (call once after app.whenReady) */
export function initStore(): void {
  cache = load();
}

export function storeGet<T>(key: string, defaultValue: T): T {
  return key in cache ? (cache[key] as T) : defaultValue;
}

export function storeSet(key: string, value: unknown): void {
  cache[key] = value;
  save();
}
