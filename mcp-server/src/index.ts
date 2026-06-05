#!/usr/bin/env node
// mcp-server/src/index.ts — Entry point with daemon and HTTP modes

import { runStdioServer } from "./server.js"
import { runDaemonStdioServer } from "./daemon-server.js"
import { runHttpServer } from "./http-server.js"

const args = process.argv.slice(2)
const mode = args[0] || "stdio"
const accountName = args[2] || args[1] || "default"
const port = args[1] && !isNaN(Number(args[1])) ? Number(args[1]) : 3000

async function main() {
  switch (mode) {
    case "daemon":
      await runDaemonStdioServer(accountName)
      break
    case "http":
      await runHttpServer(port, accountName)
      break
    case "stdio":
    default:
      await runStdioServer(accountName)
      break
  }
}

main().catch((error) => {
  console.error("Failed to start MCP server:", error)
  process.exit(1)
})
