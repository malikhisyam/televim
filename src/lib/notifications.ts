// src/lib/notifications.ts — Cross-platform desktop notifications with Telegram icon
//
// Primary: OpenTUI renderer.triggerNotification() (OSC escape sequences)
// Fallback: platform-native tools for when terminal doesn't support OSC

import { execSync } from "child_process"
import { existsSync, mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { CONFIG_DIR } from "./config"

const ICON_PATH = join(CONFIG_DIR, "telegram-icon.png")
const ICON_URL = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/512px-Telegram_logo.svg.png"

let rendererInstance: { triggerNotification: (message: string, title?: string) => boolean; capabilities?: { notifications?: boolean } | null } | null = null

export function setNotificationRenderer(renderer: typeof rendererInstance): void {
  rendererInstance = renderer
}

/**
 * Download the Telegram logo PNG if it doesn't already exist locally.
 * Call this once on app startup.
 */
export async function downloadTelegramIcon(): Promise<string | null> {
  if (existsSync(ICON_PATH)) return ICON_PATH
  try {
    const res = await fetch(ICON_URL)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    if (!existsSync(CONFIG_DIR)) {
      mkdirSync(CONFIG_DIR, { recursive: true })
    }
    writeFileSync(ICON_PATH, Buffer.from(buffer))
    return ICON_PATH
  } catch {
    return null
  }
}

export function sendNotification(title: string, message: string): void {
  // Try OpenTUI renderer first
  if (rendererInstance) {
    try {
      const ok = rendererInstance.triggerNotification(message, title)
      if (ok) return
    } catch {
      // Renderer available but trigger failed — fall through to platform tools
    }
  }

  // Fallback to platform-specific notification tools
  const platform = process.platform
  const icon = existsSync(ICON_PATH) ? ICON_PATH : undefined

  try {
    if (platform === "darwin") {
      // Prefer terminal-notifier for icon support, fall back to osascript
      if (icon) {
        try {
          execSync(
            `terminal-notifier -title "${title.replace(/"/g, '\\"')}" -message "${message.replace(/"/g, '\\"')}" -appIcon "${icon}"`,
            { timeout: 3000 },
          )
          return
        } catch {
          // terminal-notifier not installed — fall through to osascript
        }
      }
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`
      execSync(`osascript -e '${script}'`, { timeout: 3000 })
    } else if (platform === "linux") {
      const iconArg = icon ? ` --icon="${icon}"` : ""
      execSync(`notify-send --expire-time=7000${iconArg} "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`, { timeout: 3000 })
    } else if (platform === "win32") {
      const ps = icon
        ? `Add-Type -AssemblyName System.Windows.Forms; ` +
          `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${icon.replace(/'/g, "''")}'); ` +
          `$notify = New-Object System.Windows.Forms.NotifyIcon; ` +
          `$notify.Icon = $icon; ` +
          `$notify.BalloonTipTitle = '${title.replace(/'/g, "''")}'; ` +
          `$notify.BalloonTipText = '${message.replace(/'/g, "''")}'; ` +
          `$notify.Visible = $true; ` +
          `$notify.ShowBalloonTip(7000); ` +
          `Start-Sleep -Milliseconds 7500; ` +
          `$notify.Dispose()`
        : `Add-Type -AssemblyName System.Windows.Forms; ` +
          `[System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}')`
      execSync(`powershell -Command "${ps}"`, { timeout: 8000 })
    }
  } catch {
    // Notifications are best-effort; ignore failures
  }
}
