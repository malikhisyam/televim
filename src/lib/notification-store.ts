// src/lib/notification-store.ts — Persist desktop notification preference

import { existsSync, readFileSync, writeFileSync } from "fs"
import { CONFIG_DIR } from "./config"
import { join } from "path"

const NOTIFY_FILE = join(CONFIG_DIR, "notifications")

export function loadNotificationsEnabled(): boolean {
  try {
    if (existsSync(NOTIFY_FILE)) {
      return readFileSync(NOTIFY_FILE, "utf-8").trim() === "1"
    }
  } catch {
    // ignore
  }
  return true // Default: enabled
}

export function saveNotificationsEnabled(enabled: boolean): void {
  try {
    writeFileSync(NOTIFY_FILE, enabled ? "1" : "0")
  } catch (err) {
    console.error("Failed to save notification setting:", err)
  }
}
