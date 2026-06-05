// mcp-server/src/server.ts — MCP server setup with tools and resources

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js"
import { TelegramMcpClient } from "./telegram-client.js"

export async function createMcpServer(accountName = "default") {
  const tg = new TelegramMcpClient(accountName)

  const server = new Server(
    {
      name: "televim-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    }
  )

  // ── Tools ──

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "get_chat_list",
          description: "List all Telegram chats (groups, channels, private conversations). Returns title, type, unread count, and last message preview.",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Maximum chats to return (default 50, max 200)", default: 50 },
            },
          },
        },
        {
          name: "get_messages",
          description: "Fetch recent messages from a specific chat. Returns message content, sender, date, and reply-to info.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID (from get_chat_list)" },
              limit: { type: "number", description: "Max messages to return (default 50)", default: 50 },
            },
            required: ["chatId"],
          },
        },
        {
          name: "send_message",
          description: "Send a text message to a chat. Optionally reply to a specific message.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to send to" },
              text: { type: "string", description: "Message text" },
              replyToId: { type: "number", description: "Message ID to reply to (optional)" },
            },
            required: ["chatId", "text"],
          },
        },
        {
          name: "search_messages",
          description: "Search messages within a specific chat by keyword.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to search in" },
              query: { type: "string", description: "Search keyword" },
              limit: { type: "number", description: "Max results (default 50)", default: 50 },
            },
            required: ["chatId", "query"],
          },
        },
        {
          name: "get_contacts",
          description: "List all Telegram contacts with names, usernames, and phone numbers.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "mark_as_read",
          description: "Mark all messages in a chat as read.",
          inputSchema: {
            type: "object",
            properties: {
              chatId: { type: "number", description: "Chat ID to mark as read" },
            },
            required: ["chatId"],
          },
        },
      ],
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      if (!tg.isConnected) {
        await tg.connect()
      }

      const { name, arguments: args } = request.params

      switch (name) {
        case "get_chat_list": {
          const limit = Math.min((args?.limit as number) || 50, 200)
          const chats = await tg.getChatList(limit)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(chats, null, 2),
              },
            ],
          }
        }

        case "get_messages": {
          const chatId = args?.chatId as number
          const limit = (args?.limit as number) || 50
          if (!chatId) throw new McpError(ErrorCode.InvalidParams, "chatId is required")
          const messages = await tg.getMessages(chatId, limit)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(messages, null, 2),
              },
            ],
          }
        }

        case "send_message": {
          const chatId = args?.chatId as number
          const text = args?.text as string
          const replyToId = args?.replyToId as number | undefined
          if (!chatId || !text) throw new McpError(ErrorCode.InvalidParams, "chatId and text are required")
          await tg.sendMessage(chatId, text, replyToId)
          return {
            content: [
              {
                type: "text",
                text: `Message sent to chat ${chatId}.`,
              },
            ],
          }
        }

        case "search_messages": {
          const chatId = args?.chatId as number
          const query = args?.query as string
          const limit = (args?.limit as number) || 50
          if (!chatId || !query) throw new McpError(ErrorCode.InvalidParams, "chatId and query are required")
          const messages = await tg.searchMessages(chatId, query, limit)
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(messages, null, 2),
              },
            ],
          }
        }

        case "get_contacts": {
          const contacts = await tg.getContacts()
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(contacts, null, 2),
              },
            ],
          }
        }

        case "mark_as_read": {
          const chatId = args?.chatId as number
          if (!chatId) throw new McpError(ErrorCode.InvalidParams, "chatId is required")
          await tg.markAsRead(chatId)
          return {
            content: [
              {
                type: "text",
                text: `Chat ${chatId} marked as read.`,
              },
            ],
          }
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`)
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
          uri: "telegram://unread-summary",
          name: "Unread Messages Summary",
          description: "Summary of unread messages across all chats",
          mimeType: "application/json",
        },
      ],
    }
  })

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      if (!tg.isConnected) await tg.connect()
      const { uri } = request.params

      if (uri === "telegram://unread-summary") {
        const chats = await tg.getChatList(200)
        const unread = chats
          .filter((c) => c.unreadCount > 0)
          .map((c) => ({
            id: c.id,
            title: c.title,
            unreadCount: c.unreadCount,
            lastMessage: c.lastMessage,
          }))

        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(unread, null, 2),
            },
          ],
        }
      }

      throw new McpError(ErrorCode.InvalidRequest, `Unknown resource: ${uri}`)
    } catch (error) {
      if (error instanceof McpError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new McpError(ErrorCode.InternalError, message)
    }
  })

  // ── Prompts ──

  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
      prompts: [
        {
          name: "summarize_unread",
          description: "Summarize all unread messages across chats",
        },
        {
          name: "draft_reply",
          description: "Draft a reply to the most recent message in a chat",
        },
      ],
    }
  })

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name } = request.params

    if (name === "summarize_unread") {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Please read the unread messages summary resource and summarize what I missed across all my chats.",
            },
          },
        ],
      }
    }

    if (name === "draft_reply") {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Please read the recent messages from the active chat and draft a helpful reply.",
            },
          },
        ],
      }
    }

    throw new McpError(ErrorCode.InvalidRequest, `Unknown prompt: ${name}`)
  })

  return { server, tg }
}

export async function runStdioServer(accountName = "default") {
  const { server, tg } = await createMcpServer(accountName)
  const transport = new StdioServerTransport()

  // Handle cleanup on disconnect
  transport.onclose = async () => {
    await tg.disconnect()
  }

  await server.connect(transport)
  console.error("TeleVim MCP server running on stdio")
}
