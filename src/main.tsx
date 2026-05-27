// src/main.tsx — Entry point: renderer setup, root render

import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import App from "./app"

// Suppress gram-js internal TIMEOUT errors during process shutdown.
// When the process is killed (Ctrl+C), gram-js's update loop may
// reject with a timeout that surfaces as an unhandled rejection.
process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error && reason.message === "TIMEOUT") {
    // Ignore — this is gram-js aborting its internal loops on exit
    return
  }
  console.error("Unhandled rejection:", reason)
})

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
