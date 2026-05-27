// src/lib/config.ts — TeleVim configuration manager

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const CONFIG_DIR = join(homedir(), ".config", "televim")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")

// Embedded default credentials (same pattern as most Telegram clients)
// Users can override by editing ~/.config/televim/config.json
const DEFAULT_API_ID = 2040
const DEFAULT_API_HASH = "b18441a1ff607e10a989891a5462e627"

export interface TeleVimConfig {
  apiId: number
  apiHash: string
}

export function loadConfig(): TeleVimConfig {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8")
      const parsed = JSON.parse(raw) as TeleVimConfig
      if (parsed.apiId && parsed.apiHash) {
        return parsed
      }
    }
  } catch {
    // ignore parse errors, fall back to defaults
  }
  return { apiId: DEFAULT_API_ID, apiHash: DEFAULT_API_HASH }
}

export function saveConfig(config: TeleVimConfig): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
  } catch (err) {
    console.error("Failed to save config:", err)
  }
}

const CLOAK_FILE = join(CONFIG_DIR, "cloak")

export function loadCloakMode(): boolean {
  try {
    if (existsSync(CLOAK_FILE)) {
      return readFileSync(CLOAK_FILE, "utf-8").trim() === "1"
    }
  } catch {
    // ignore
  }
  return false
}

export function saveCloakMode(enabled: boolean): void {
  try {
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(CLOAK_FILE, enabled ? "1" : "0")
  } catch (err) {
    console.error("Failed to save cloak mode:", err)
  }
}
