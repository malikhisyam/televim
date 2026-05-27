// src/main.tsx — Entry point: renderer setup, root render

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import App from "./app"

async function main(): Promise<void> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  createRoot(renderer).render(<App />)
}

main().catch((error: unknown) => {
  console.error("Failed to start TeleVim:", error)
  process.exit(1)
})
