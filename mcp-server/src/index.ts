#!/usr/bin/env node
// mcp-server/src/index.ts — Entry point

import { runStdioServer } from "./server.js"

const accountName = process.argv[2] || "default"

runStdioServer(accountName).catch((error) => {
  console.error("Failed to start MCP server:", error)
  process.exit(1)
})
