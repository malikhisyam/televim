// mcp-server/src/daemon.ts — Telegram daemon with event-driven message processing

import { TelegramClient as GramClient, Api } from "telegram"
import { NewMessage } from "telegram/events/index.js"
import { StringSession } from "telegram/sessions/index.js"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const CONFIG_DIR = join(homedir(), ".config", "televim")
const QUEUE_DIR = join(CONFIG_DIR, "mcp-queue")
const SESSION_DIR = join(CONFIG_DIR, "sessions")

function loadConfig() {
  try {
    const configFile = join(CONFIG_DIR, "config.json")
    if (existsSync(configFile)) {
      const raw = readFileSync(configFile, "utf-8")
      const parsed = JSON.parse(raw)
      if (parsed.apiId && parsed.apiHash) {
        return { apiId: parsed.apiId, apiHash: parsed.apiHash }
      }
    }
  } catch {}
  return { apiId: 2040, apiHash: "b18441a1ff607e10a989891a5462e627" }
}

function loadSession(name: string): string {
  try {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const path = join(SESSION_DIR, `${safe}.session`)
    if (existsSync(path)) {
      return readFileSync(path, "utf-8").trim()
    }
  } catch {}
  return ""
}

export interface QueuedMessage {
  id: number
  chatId: number
  chatTitle: string
  threadId?: number
  senderId: number
  senderName: string
  content: string
  date: string
  isMention: boolean
  mentionedBot: string | null
  intent: ParsedIntent
  processed: boolean
}

export interface ParsedIntent {
  action: string
  target: string | null
  parameters: Record<string, string>
  confidence: number
}

export class TelegramDaemon {
  private gramClient: GramClient | null = null
  private connected = false
  private accountName: string
  private watchThreads: Set<number> = new Set()
  private botUsername: string | null = null
  private onMessageCallback: ((msg: QueuedMessage) => void) | null = null
  private queue: QueuedMessage[] = []
  private queueFile: string

  constructor(accountName = "default") {
    this.accountName = accountName
    this.queueFile = join(QUEUE_DIR, `${accountName}-queue.json`)
    this.loadQueue()
  }

  async connect(): Promise<void> {
    if (this.connected && this.gramClient) return

    const config = loadConfig()
    const session = loadSession(this.accountName)

    if (!session) {
      throw new Error(
        "No session found for account \"" + this.accountName + "\". " +
        "Run televim TUI first to authenticate."
      )
    }

    const stringSession = new StringSession(session)
    this.gramClient = new GramClient(
      stringSession as any,
      config.apiId,
      config.apiHash,
      {
        connectionRetries: 5,
        useIPV6: false,
      }
    )

    await this.gramClient.connect()
    const authorized = await this.gramClient.checkAuthorization()
    if (!authorized) {
      throw new Error("Session expired. Please re-authenticate in TeleVim.")
    }

    this.connected = true

    // Get bot username if this is a bot account
    try {
      const me = await this.gramClient.getMe()
      if (me && "username" in me && me.username) {
        this.botUsername = me.username
      }
    } catch {
      // Not a bot or no username
    }

    console.error("Telegram daemon connected for account: " + this.accountName)
  }

  async disconnect(): Promise<void> {
    if (this.gramClient) {
      await this.gramClient.disconnect()
      this.gramClient = null
    }
    this.connected = false
  }

  async startListening(watchThreadIds?: number[], onMessage?: (msg: QueuedMessage) => void): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")
    
    if (watchThreadIds) {
      watchThreadIds.forEach(id => this.watchThreads.add(id))
    }

    this.onMessageCallback = onMessage || null

    // Listen for new messages
    this.gramClient.addEventHandler(async (event: any) => {
      const message = event.message
      if (!message) return

      const chatId = message.chatId ? (typeof message.chatId === "number" ? message.chatId : Number(message.chatId)) : 0
      if (!chatId) return

      // Check if we're watching this thread
      if (this.watchThreads.size > 0 && !this.watchThreads.has(chatId)) {
        return
      }

      const sender = await this.getSenderName(message.senderId)
      const content = message.message || ""
      const isMention = this.checkMention(content)
      const mentionedBot = isMention ? this.extractMention(content) : null
      const intent = this.parseIntent(content)

      const queuedMsg: QueuedMessage = {
        id: message.id,
        chatId: chatId,
        chatTitle: "",
        threadId: message.replyTo?.replyToTopId,
        senderId: message.senderId ? message.senderId.toJSNumber() : 0,
        senderName: sender,
        content: content,
        date: new Date(message.date * 1000).toISOString(),
        isMention: isMention,
        mentionedBot: mentionedBot,
        intent: intent,
        processed: false,
      }

      // Get chat title
      try {
        if (this.gramClient) {
          const chat = await this.gramClient.getEntity(chatId)
          if (chat && "title" in chat) {
            queuedMsg.chatTitle = chat.title
          } else if (chat && "firstName" in chat) {
            const firstName = chat.firstName || ""
            const lastName = chat.lastName || ""
            queuedMsg.chatTitle = (firstName + " " + lastName).trim()
          }
        }
      } catch {}

      this.queue.push(queuedMsg)
      this.saveQueue()

      console.error("New message queued: " + queuedMsg.chatTitle + " | " + sender + " | " + content.substring(0, 50))

      if (this.onMessageCallback) {
        this.onMessageCallback(queuedMsg)
      }
    }, new NewMessage({}) as any)

    console.error("Listening for messages...")
    console.error("Watching threads: " + (this.watchThreads.size > 0 ? Array.from(this.watchThreads).join(", ") : "ALL"))
    console.error("Bot username: " + (this.botUsername || "N/A"))
  }

  checkMention(content: string): boolean {
    if (!this.botUsername) return false
    const mentionPattern = new RegExp("@" + this.botUsername + "\\b", "i")
    return mentionPattern.test(content)
  }

  extractMention(content: string): string | null {
    const match = content.match(/@(\w+)/)
    return match ? match[1] : null
  }

  parseIntent(content: string): ParsedIntent {
    const lower = content.toLowerCase()
    
    // Remove the mention
    const cleanContent = content.replace(/@\w+\s*/g, "").trim()
    
    // Detect action keywords
    let action = "unknown"
    let target = null
    const parameters: Record<string, string> = {}
    
    // Notion actions
    if (lower.includes("create notion") || lower.includes("notion docs") || lower.includes("notion page")) {
      action = "notion.create"
      const titleMatch = cleanContent.match(/(?:for|about|titled?)\s+["']?([^"'\n]+?)["']?\s*(?:\n|$)/i)
      if (titleMatch) {
        target = titleMatch[1].trim()
        parameters["title"] = target
      }
    }
    
    // GitHub actions
    else if (lower.includes("create github") || lower.includes("github repo") || lower.includes("create pr")) {
      action = "github.create"
      const repoMatch = cleanContent.match(/(?:repo|repository|for)\s+["']?([^"'\n]+?)["']?\s*(?:\n|$)/i)
      if (repoMatch) {
        target = repoMatch[1].trim()
        parameters["repo"] = target
      }
    }
    
    // Calendar actions
    else if (lower.includes("schedule") || lower.includes("calendar") || lower.includes("remind me")) {
      action = "calendar.create"
      const dateMatch = cleanContent.match(/(?:on|at|for)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i)
      if (dateMatch) {
        parameters["date"] = dateMatch[1]
      }
    }
    
    // Generic question
    else if (lower.includes("?") || lower.includes("what") || lower.includes("how") || lower.includes("can you")) {
      action = "query"
      parameters["question"] = cleanContent
    }
    
    // Help
    else if (lower.includes("help") || lower.includes("commands")) {
      action = "help"
    }

    // Calculate confidence
    const confidence = action !== "unknown" ? 0.8 : 0.3

    return { action, target, parameters, confidence }
  }

  getUnprocessedMessages(): QueuedMessage[] {
    return this.queue.filter(m => !m.processed)
  }

  async getChatList(limit = 50): Promise<Array<{ id: number; title: string; type: string; unreadCount: number; lastMessage?: string }>> {
    if (!this.gramClient) throw new Error("Not connected")

    const dialogs = await this.gramClient.getDialogs({ limit })
    const chats: Array<{ id: number; title: string; type: string; unreadCount: number; lastMessage?: string }> = []

    for (const dialog of dialogs) {
      const entity = await this.gramClient.getEntity(dialog.inputEntity)
      if (!entity) continue

      const chatId = this.extractId(entity)
      let title: string
      if ("title" in entity) {
        title = entity.title
      } else if ("firstName" in entity) {
        const firstName = entity.firstName || ""
        const lastName = entity.lastName || ""
        title = (firstName + " " + lastName).trim()
      } else {
        title = "Unknown"
      }

      let lastMessage: string | undefined
      if (dialog.message) {
        lastMessage = dialog.message.message || "[Media]"
      }

      chats.push({
        id: chatId,
        title,
        type: this.getChatType(entity),
        unreadCount: dialog.unreadCount || 0,
        lastMessage,
      })
    }

    return chats
  }

  private extractId(entity: any): number {
    if ("id" in entity) return entity.id.toJSNumber()
    return 0
  }

  private getChatType(entity: any): string {
    if (entity instanceof Api.User || entity instanceof Api.UserEmpty) return "private"
    if (entity instanceof Api.Chat || entity instanceof Api.ChatEmpty) return "group"
    if (entity instanceof Api.Channel) {
      return entity.megagroup ? "supergroup" : "channel"
    }
    return "group"
  }

  markProcessed(messageId: number): void {
    const msg = this.queue.find(m => m.id === messageId)
    if (msg) {
      msg.processed = true
      this.saveQueue()
    }
  }

  async sendResponse(chatId: number, text: string, replyToId?: number): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")
    
    const peer = await this.gramClient.getEntity(chatId)
    if (!peer) throw new Error("Chat not found")

    await this.gramClient.sendMessage(peer, {
      message: text,
      replyTo: replyToId ?? undefined,
    })
  }

  async sendResponseWithButtons(chatId: number, text: string, buttons: Array<{ text: string; action: string }>, replyToId?: number): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")
    
    const peer = await this.gramClient.getEntity(chatId)
    if (!peer) throw new Error("Chat not found")

    const inlineKeyboard = new Api.ReplyInlineMarkup({
      rows: buttons.map(btn => 
        new Api.KeyboardButtonRow({
          buttons: [
            new Api.KeyboardButtonCallback({
              text: btn.text,
              data: Buffer.from(btn.action),
            }),
          ],
        })
      ),
    })

    const sendParams: any = {
      message: text,
      replyTo: replyToId ?? undefined,
      replyMarkup: inlineKeyboard,
    }
    await this.gramClient.sendMessage(peer, sendParams)
  }

  async sendReaction(chatId: number, messageId: number, emoticon: string): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")
    
    const peer = await this.gramClient.getEntity(chatId)
    if (!peer) throw new Error("Chat not found")

    await this.gramClient.invoke(
      new Api.messages.SendReaction({
        peer: peer as any,
        msgId: messageId,
        reaction: [new Api.ReactionEmoji({ emoticon })],
        big: false,
      })
    )
  }

  async removeReaction(chatId: number, messageId: number): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")
    
    const peer = await this.gramClient.getEntity(chatId)
    if (!peer) throw new Error("Chat not found")

    await this.gramClient.invoke(
      new Api.messages.SendReaction({
        peer: peer as any,
        msgId: messageId,
        reaction: [],
        big: false,
      })
    )
  }

  async setThinkingReaction(chatId: number, messageId: number): Promise<void> {
    await this.sendReaction(chatId, messageId, "🤔")
  }

  async setDoneReaction(chatId: number, messageId: number): Promise<void> {
    await this.removeReaction(chatId, messageId)
    await this.sendReaction(chatId, messageId, "✅")
  }

  async setErrorReaction(chatId: number, messageId: number): Promise<void> {
    await this.removeReaction(chatId, messageId)
    await this.sendReaction(chatId, messageId, "❌")
  }

  private async getSenderName(senderId: any): Promise<string> {
    if (!senderId || !this.gramClient) return "Unknown"
    try {
      const user = await this.gramClient.getEntity(senderId)
      if (user && "firstName" in user) {
        const firstName = user.firstName || ""
        const lastName = user.lastName || ""
        return (firstName + " " + lastName).trim() || "Unknown"
      }
      if (user && "title" in user) {
        return user.title || "Unknown"
      }
    } catch {}
    return "Unknown"
  }

  private loadQueue(): void {
    try {
      if (!existsSync(QUEUE_DIR)) {
        mkdirSync(QUEUE_DIR, { recursive: true })
      }
      if (existsSync(this.queueFile)) {
        const raw = readFileSync(this.queueFile, "utf-8")
        this.queue = JSON.parse(raw)
      }
    } catch {
      this.queue = []
    }
  }

  private saveQueue(): void {
    try {
      if (!existsSync(QUEUE_DIR)) {
        mkdirSync(QUEUE_DIR, { recursive: true })
      }
      writeFileSync(this.queueFile, JSON.stringify(this.queue, null, 2))
    } catch (err) {
      console.error("Failed to save queue:", err)
    }
  }

  get isConnected() {
    return this.connected
  }
}
