// mcp-server/src/daemon-server.ts — MCP server with daemon capabilities

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js"
import { TelegramDaemon, QueuedMessage } from "./daemon.js"

export async function createDaemonMcpServer(accountName = "default") {
  const daemon = new TelegramDaemon(accountName)
  let isListening = false

  const server = new Server(
    {
      name: "televim-mcp-daemon",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  )

  // ── Tools ──

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "connect_daemon",
          description: "Connect to Telegram and start the daemon. Must be called before other daemon operations.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "start_listening",
          description: "Start listening to Telegram messages. Optionally specify thread IDs to watch. If no threads specified, watches all messages.",
          inputSchema: {
            type: "object",
            properties: {
              threadIds: {
                type: "array",
                items: { type: "number" },
                description: "Specific thread IDs to watch (optional)",
              },
            },
          },
        },
        {
          name: "get_unprocessed_messages",
          description: "Get all unprocessed messages from the queue. These are messages that haven't been handled by the agent yet.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mark_processed",
          description: "Mark a message as processed so it won't appear in future get_unprocessed_messages calls.",
          inputSchema: {
            type: "object",
            properties: {
              messageId: { type: "number", description: "Message ID to mark as processed" },
            },
            required: ["messageId"],
          },
        },
        {
          name: "send_response",
          description: "Send a response message to a chat. Optionally reply to a specific message.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to send to" },
              text: { type: "string", description: "Response text" },
              replyToId: { type: "number", description: "Message ID to reply to (optional)" },
            },
            required: ["chatId", "text"],
          },
        },
        {
          name: "send_response_with_buttons",
          description: "Send a response with inline action buttons (e.g., Confirm, Cancel, Details).",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to send to" },
              text: { type: "string", description: "Response text" },
              buttons: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    action: { type: "string" },
                  },
                  required: ["text", "action"],
                },
                description: "Array of buttons with text and action",
              },
              replyToId: { type: "number", description: "Message ID to reply to (optional)" },
            },
            required: ["chatId", "text", "buttons"],
          },
        },
        {
          name: "send_reaction",
          description: "Send a reaction (emoji) to a message. Use 🤔 for thinking, ✅ for done, ❌ for error.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID" },
              messageId: { type: "number", description: "Message ID to react to" },
              emoticon: { type: "string", description: "Emoji reaction (e.g., 🤔, ✅, ❌)" },
            },
            required: ["chatId", "messageId", "emoticon"],
          },
        },
        {
          name: "set_thinking",
          description: "React with 🤔 to indicate the bot is processing/thinking.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID" },
              messageId: { type: "number", description: "Message ID to react to" },
            },
            required: ["chatId", "messageId"],
          },
        },
        {
          name: "set_done",
          description: "Remove thinking reaction and add ✅ to indicate completion.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID" },
              messageId: { type: "number", description: "Message ID to react to" },
            },
            required: ["chatId", "messageId"],
          },
        },
        {
          name: "set_error",
          description: "Remove thinking reaction and add ❌ to indicate an error occurred.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID" },
              messageId: { type: "number", description: "Message ID to react to" },
            },
            required: ["chatId", "messageId"],
          },
        },
        {
          name: "get_chat_list",
          description: "Get list of Telegram chats to find thread IDs for start_listening.",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", default: 50 },
            },
          },
        },
        {
          name: "disconnect_daemon",
          description: "Disconnect the daemon and stop listening.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params

      switch (name) {
        case "connect_daemon": {
          if (!daemon.isConnected) {
            await daemon.connect()
          }
          return {
            content: [
              {
                type: "text",
                text: "Daemon connected successfully for account: " + accountName,
              },
            ],
          }
        }

        case "start_listening": {
          if (!daemon.isConnected) {
            await daemon.connect()
          }
          const threadIds = (args?.threadIds as number[]) || undefined
          await daemon.startListening(threadIds)
          isListening = true
          return {
            content: [
              {
                type: "text",
                text: "Now listening to Telegram messages" + (threadIds ? " for threads: " + threadIds.join(", ") : " for all threads"),
              },
            ],
          }
        }

        case "get_unprocessed_messages": {
          const messages = daemon.getUnprocessedMessages()
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(messages, null, 2),
              },
            ],
          }
        }

        case "mark_processed": {
          const messageId = args?.messageId as number
          if (!messageId) throw new McpError(ErrorCode.InvalidParams, "messageId is required")
          daemon.markProcessed(messageId)
          return {
            content: [
              {
                type: "text",
                text: "Message " + messageId + " marked as processed.",
              },
            ],
          }
        }

        case "send_response": {
          const chatId = args?.chatId as number
          const text = args?.text as string
          const replyToId = args?.replyToId as number | undefined
          if (!chatId || !text) throw new McpError(ErrorCode.InvalidParams, "chatId and text are required")
          await daemon.sendResponse(chatId, text, replyToId)
          return {
            content: [
              {
                type: "text",
                text: "Response sent to chat " + chatId,
              },
            ],
          }
        }

        case "send_response_with_buttons": {
          const chatId = args?.chatId as number
          const text = args?.text as string
          const buttons = args?.buttons as Array<{ text: string; action: string }>
          const replyToId = args?.replyToId as number | undefined
          if (!chatId || !text || !buttons) throw new McpError(ErrorCode.InvalidParams, "chatId, text, and buttons are required")
          await daemon.sendResponseWithButtons(chatId, text, buttons, replyToId)
          return {
            content: [
              {
                type: "text",
                text: "Response with buttons sent to chat " + chatId,
              },
            ],
          }
        }

        case "send_reaction": {
          const chatId = args?.chatId as number
          const messageId = args?.messageId as number
          const emoticon = args?.emoticon as string
          if (!chatId || !messageId || !emoticon) throw new McpError(ErrorCode.InvalidParams, "chatId, messageId, and emoticon are required")
          await daemon.sendReaction(chatId, messageId, emoticon)
          return {
            content: [
              {
                type: "text",
                text: "Reaction " + emoticon + " sent to message " + messageId,
              },
            ],
          }
        }

        case "set_thinking": {
          const chatId = args?.chatId as number
          const messageId = args?.messageId as number
          if (!chatId || !messageId) throw new McpError(ErrorCode.InvalidParams, "chatId and messageId are required")
          await daemon.setThinkingReaction(chatId, messageId)
          return {
            content: [
              {
                type: "text",
                text: "Thinking reaction (🤔) set on message " + messageId,
              },
            ],
          }
        }

        case "set_done": {
          const chatId = args?.chatId as number
          const messageId = args?.messageId as number
          if (!chatId || !messageId) throw new McpError(ErrorCode.InvalidParams, "chatId and messageId are required")
          await daemon.setDoneReaction(chatId, messageId)
          return {
            content: [
              {
                type: "text",
                text: "Done reaction (✅) set on message " + messageId,
              },
            ],
          }
        }

        case "set_error": {
          const chatId = args?.chatId as number
          const messageId = args?.messageId as number
          if (!chatId || !messageId) throw new McpError(ErrorCode.InvalidParams, "chatId and messageId are required")
          await daemon.setErrorReaction(chatId, messageId)
          return {
            content: [
              {
                type: "text",
                text: "Error reaction (❌) set on message " + messageId,
              },
            ],
          }
        }

        case "get_chat_list": {
          if (!daemon.isConnected) {
            await daemon.connect()
          }
          const limit = Math.min((args?.limit as number) || 50, 200)
          const chats = await daemon.getChatList(limit)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(chats, null, 2),
              },
            ],
          }
        }

        case "disconnect_daemon": {
          await daemon.disconnect()
          isListening = false
          return {
            content: [
              {
                type: "text",
                text: "Daemon disconnected.",
              },
            ],
          }
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, "Unknown tool: " + name)
      }
    } catch (error) {
      if (error instanceof McpError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new McpError(ErrorCode.InternalError, message)
    }
  })

  // ── Resources ──

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return {
      resources: [
        {
          uri: "telegram://queue",
          name: "Message Queue",
          description: "Current unprocessed messages in the queue",
          mimeType: "application/json",
        },
        {
          uri: "telegram://status",
          name: "Daemon Status",
          description: "Current daemon connection and listening status",
          mimeType: "application/json",
        },
      ],
    }
  })

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params

    if (uri === "telegram://queue") {
      const messages = daemon.getUnprocessedMessages()
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(messages, null, 2),
          },
        ],
      }
    }

    if (uri === "telegram://status") {
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify({
              connected: daemon.isConnected,
              listening: isListening,
              account: accountName,
              unprocessedMessages: daemon.getUnprocessedMessages().length,
            }, null, 2),
          },
        ],
      }
    }

    throw new McpError(ErrorCode.InvalidRequest, "Unknown resource: " + uri)
  })

  return { server, daemon }
}

export async function runDaemonStdioServer(accountName = "default") {
  const { server } = await createDaemonMcpServer(accountName)
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("TeleVim MCP Daemon server running on stdio")
}
