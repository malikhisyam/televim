// src/lib/draft-store.ts — Persist per-chat message drafts across restarts

import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { CONFIG_DIR } from "./config"

const DRAFTS_FILE = join(CONFIG_DIR, "drafts.json")

export function loadDrafts(): Record<string, string> {
  try {
    if (existsSync(DRAFTS_FILE)) {
      const raw = readFileSync(DRAFTS_FILE, "utf-8")
      const parsed = JSON.parse(raw) as Record<string, string>
      if (parsed && typeof parsed === "object") {
        return parsed
      }
    }
  } catch {
    // ignore corrupt drafts file
  }
  return {}
}

export function saveDrafts(drafts: Record<string, string>): void {
  try {
    writeFileSync(DRAFTS_FILE, JSON.stringify(drafts, null, 2), { mode: 0o600 })
  } catch (err) {
    console.error("Failed to save drafts:", err)
  }
}
