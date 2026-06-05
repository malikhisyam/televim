// mcp-server/src/http-server.ts — HTTP server for webhook support

import { createServer, IncomingMessage, ServerResponse } from "http"
import { createDaemonMcpServer } from "./daemon-server.js"
import { QueuedMessage } from "./daemon.js"

export async function runHttpServer(port = 3000, accountName = "default") {
  const { daemon } = await createDaemonMcpServer(accountName)
  await daemon.connect()

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || "/"
    const method = req.method || "GET"

    res.setHeader("Content-Type", "application/json")

    // Enable CORS
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (method === "OPTIONS") {
      res.writeHead(200)
      res.end()
      return
    }

    try {
      if (url === "/health") {
        res.writeHead(200)
        res.end(JSON.stringify({ status: "ok", connected: daemon.isConnected }))
      }

      else if (url === "/messages" && method === "GET") {
        const messages = daemon.getUnprocessedMessages()
        res.writeHead(200)
        res.end(JSON.stringify({ messages }))
      }

      else if (url === "/messages" && method === "POST") {
        const body = await readBody(req)
        const data = JSON.parse(body)
        
        if (data.messageId) {
          daemon.markProcessed(data.messageId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(400)
          res.end(JSON.stringify({ error: "messageId required" }))
        }
      }

      else if (url === "/send" && method === "POST") {
        const body = await readBody(req)
        const data = JSON.parse(body)
        
        if (data.chatId && data.text) {
          await daemon.sendResponse(data.chatId, data.text, data.replyToId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(400)
          res.end(JSON.stringify({ error: "chatId and text required" }))
        }
      }

      else if (url === "/start-listening" && method === "POST") {
        const body = await readBody(req)
        const data = JSON.parse(body)
        await daemon.startListening(data.threadIds)
        res.writeHead(200)
        res.end(JSON.stringify({ success: true, listening: true }))
      }

      else if (url === "/webhook" && method === "POST") {
        // Webhook endpoint for external integrations
        const body = await readBody(req)
        const data = JSON.parse(body)
        
        // Forward to Telegram
        if (data.chatId && data.text) {
          await daemon.sendResponse(data.chatId, data.text, data.replyToId)
          res.writeHead(200)
          res.end(JSON.stringify({ success: true }))
        } else {
          res.writeHead(400)
          res.end(JSON.stringify({ error: "chatId and text required" }))
        }
      }

      else {
        res.writeHead(404)
        res.end(JSON.stringify({ error: "Not found" }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      res.writeHead(500)
      res.end(JSON.stringify({ error: message }))
    }
  })

  server.listen(port, () => {
    console.error("TeleVim MCP HTTP server running on port " + port)
    console.error("Endpoints:")
    console.error("  GET  /health          - Health check")
    console.error("  GET  /messages        - Get unprocessed messages")
    console.error("  POST /messages        - Mark message as processed")
    console.error("  POST /send            - Send message to chat")
    console.error("  POST /start-listening - Start listening to threads")
    console.error("  POST /webhook         - Webhook for external integrations")
  })

  return server
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ""
    req.on("data", (chunk) => body += chunk)
    req.on("end", () => resolve(body))
    req.on("error", reject)
  })
}
