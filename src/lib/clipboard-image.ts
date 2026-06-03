// src/lib/clipboard-image.ts — Cross-platform clipboard image extraction

import { execSync } from "child_process"
import { existsSync, statSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

/**
 * Attempts to read an image from the system clipboard and save it to a
 * temporary PNG file. Returns the temp file path on success, or null if no
 * image was found or platform tools are unavailable.
 */
export function pasteClipboardImage(): string | null {
  const platform = process.platform
  const tmpFile = join(tmpdir(), `televim-paste-${Date.now()}.png`)

  try {
    if (platform === "darwin") {
      // macOS: pngpaste is the most reliable tool (brew install pngpaste)
      try {
        execSync(`pngpaste "${tmpFile}"`, { timeout: 5000 })
        if (hasContent(tmpFile)) return tmpFile
      } catch {
        // fall through
      }

      // Fallback: osascript AppleScript (best-effort, often fails on modern macOS)
      try {
        const script = `
try
  set pngData to (the clipboard as «class PNGf»)
  set f to (open for access POSIX file "${tmpFile}" with write permission)
  write pngData to f
  close access f
end try`
        writeFileSync(`${tmpFile}.scpt`, script)
        execSync(`osascript "${tmpFile}.scpt"`, { timeout: 5000 })
        if (hasContent(tmpFile)) return tmpFile
      } catch {
        // fall through
      }
    } else if (platform === "linux") {
      // Wayland
      try {
        const data = execSync("wl-paste --type image/png", { timeout: 5000 })
        writeFileSync(tmpFile, data)
        if (hasContent(tmpFile)) return tmpFile
      } catch {
        // fall through
      }

      // X11
      try {
        const data = execSync("xclip -selection clipboard -t image/png -o", { timeout: 5000 })
        writeFileSync(tmpFile, data)
        if (hasContent(tmpFile)) return tmpFile
      } catch {
        // fall through
      }
    } else if (platform === "win32") {
      try {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
          `$img = [System.Windows.Forms.Clipboard]::GetImage(); ` +
          `if ($img -ne $null) { $img.Save('${tmpFile.replace(/\\/g, "\\\\")}'); exit 0 } else { exit 1 }`
        execSync(`powershell -Command "${ps}"`, { timeout: 5000 })
        if (hasContent(tmpFile)) return tmpFile
      } catch {
        // fall through
      }
    }
  } catch {
    // Overall failure
  }

  return null
}

function hasContent(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).size > 0
  } catch {
    return false
  }
}
