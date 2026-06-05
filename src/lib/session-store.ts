// src/lib/session-store.ts — Secure multi-account session storage
//
// Sessions are stored in ~/.config/televim/sessions/ with restrictive
// filesystem permissions (0600). This follows XDG Base Directory spec and
// matches how professional CLI tools (aws-cli, docker, kubectl) protect
// credentials. The session string itself is not encrypted at rest — real
// protection would require a user passphrase on every launch, which is
// impractical for a TUI. Instead we rely on:
//   1. Storing outside the project tree (never in git)
//   2. Directory permissions: 0700 (owner only)
//   3. File permissions:   0600 (owner read/write only)

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const CONFIG_DIR = join(homedir(), ".config", "televim")
const SESSION_DIR = join(CONFIG_DIR, "sessions")

/** The legacy session file sitting in the project root. */
const LEGACY_SESSION_FILE = "./session.txt"

function ensureSessionDir(): void {
  if (!existsSync(SESSION_DIR)) {
    mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 })
  }
}

function sessionPath(name: string): string {
  // Sanitise account name so it can't traverse directories
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_")
  return join(SESSION_DIR, `${safe}.session`)
}

/** List all saved account names (sorted). */
export function listAccounts(): string[] {
  try {
    ensureSessionDir()
    return readdirSync(SESSION_DIR)
      .filter((f) => f.endsWith(".session"))
      .map((f) => f.slice(0, -".session".length))
      .sort()
  } catch {
    return []
  }
}

/** Load a session string for the given account. Returns "" if missing. */
export function loadSession(name: string): string {
  try {
    const path = sessionPath(name)
    if (existsSync(path)) {
      return readFileSync(path, "utf-8").trim()
    }
  } catch {
    // ignore
  }
  return ""
}

/** Save a session string for the given account with 0600 permissions. */
export function saveSession(name: string, session: string): void {
  try {
    ensureSessionDir()
    const path = sessionPath(name)
    writeFileSync(path, session, { mode: 0o600 })
  } catch (err) {
    console.error("Failed to save session:", err)
  }
}

/** Delete a session file permanently. */
export function deleteSession(name: string): void {
  try {
    const path = sessionPath(name)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  } catch (err) {
    console.error("Failed to delete session:", err)
  }
}

/** Check whether an account has a saved session. */
export function hasSession(name: string): boolean {
  try {
    const path = sessionPath(name)
    return existsSync(path) && statSync(path).size > 0
  } catch {
    return false
  }
}

/**
 * Migrate the old ./session.txt to the new secure location.
 * Returns the migrated account name (always "default") on success,
 * or null if there was nothing to migrate.
 */
export function migrateLegacySession(): string | null {
  try {
    if (existsSync(LEGACY_SESSION_FILE)) {
      const session = readFileSync(LEGACY_SESSION_FILE, "utf-8").trim()
      if (session) {
        saveSession("default", session)
        unlinkSync(LEGACY_SESSION_FILE)
        return "default"
      }
    }
  } catch {
    // ignore
  }
  return null
}
