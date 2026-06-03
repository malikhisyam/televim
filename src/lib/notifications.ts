// src/lib/notifications.ts — Cross-platform desktop notifications
//
// Primary: OpenTUI renderer.triggerNotification() (OSC escape sequences)
// Fallback: platform-native tools for when terminal doesn't support OSC

import { execSync } from "child_process"

let rendererInstance: { triggerNotification: (message: string, title?: string) => boolean; capabilities?: { notifications?: boolean } | null } | null = null

export function setNotificationRenderer(renderer: typeof rendererInstance): void {
  rendererInstance = renderer
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
  try {
    if (platform === "darwin") {
      const script = `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"`
      execSync(`osascript -e '${script}'`, { timeout: 3000 })
    } else if (platform === "linux") {
      execSync(`notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`, { timeout: 3000 })
    } else if (platform === "win32") {
      const ps = `Add-Type -AssemblyName System.Windows.Forms; ` +
        `[System.Windows.Forms.MessageBox]::Show('${message.replace(/'/g, "''")}', '${title.replace(/'/g, "''")}')`
      execSync(`powershell -Command "${ps}"`, { timeout: 3000 })
    }
  } catch {
    // Notifications are best-effort; ignore failures
  }
}
