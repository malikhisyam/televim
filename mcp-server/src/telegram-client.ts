// mcp-server/src/telegram-client.ts — Reusable Telegram client for MCP

import { TelegramClient as GramClient, Api } from "telegram"
import { StringSession } from "telegram/sessions/index.js"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

const CONFIG_DIR = join(homedir(), ".config", "televim")
const SESSION_DIR = join(CONFIG_DIR, "sessions")
const CONFIG_FILE = join(CONFIG_DIR, "config.json")
const MEDIA_DIR = join(CONFIG_DIR, "media")

const DEFAULT_API_ID = 2040
const DEFAULT_API_HASH = "b18441a1ff607e10a989891a5462e627"

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8")
      const parsed = JSON.parse(raw)
      if (parsed.apiId && parsed.apiHash) {
        return { apiId: parsed.apiId, apiHash: parsed.apiHash }
      }
    }
  } catch {
    // ignore
  }
  return { apiId: DEFAULT_API_ID, apiHash: DEFAULT_API_HASH }
}

function loadSession(name: string): string {
  try {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const path = join(SESSION_DIR, `${safe}.session`)
    if (existsSync(path)) {
      return readFileSync(path, "utf-8").trim()
    }
  } catch {
    // ignore
  }
  return ""
}

function listAccounts(): string[] {
  try {
    if (!existsSync(SESSION_DIR)) return []
    return require("fs")
      .readdirSync(SESSION_DIR)
      .filter((f: string) => f.endsWith(".session"))
      .map((f: string) => f.slice(0, -".session".length))
      .sort()
  } catch {
    return []
  }
}

export interface ChatInfo {
  id: number
  title: string
  type: "private" | "group" | "channel" | "supergroup"
  unreadCount: number
  lastMessage?: string
  lastMessageDate?: Date
}

export interface MessageInfo {
  id: number
  chatId: number
  senderId: number
  senderName: string
  content: string
  date: Date
  isOutgoing: boolean
  replyToId?: number
  mediaPath?: string
}

export interface ContactInfo {
  id: number
  firstName: string
  lastName?: string
  username?: string
  phone?: string
}

type ChatRef = number | string

export class TelegramMcpClient {
  private gramClient: GramClient | null = null
  private connected = false
  private accountName: string

  constructor(accountName = "default") {
    this.accountName = accountName
  }

  async connect(): Promise<void> {
    if (this.connected && this.gramClient) return

    const config = loadConfig()
    const session = loadSession(this.accountName)

    if (!session) {
      throw new Error(
        "No session found for account \"" + this.accountName + "\". " +
        "Run televim TUI first to authenticate, or provide a session string."
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
  }

  async disconnect(): Promise<void> {
    if (this.gramClient) {
      await this.gramClient.disconnect()
      this.gramClient = null
    }
    this.connected = false
  }

  async getChatList(limit = 50): Promise<ChatInfo[]> {
    if (!this.gramClient) throw new Error("Not connected")

    const dialogs = await this.gramClient.getDialogs({ limit })
    const chats: ChatInfo[] = []

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
      const type = this.getChatType(entity)
      
      let lastMessage: string | undefined
      let lastMessageDate: Date | undefined
      if (dialog.message) {
        lastMessage = dialog.message.message || "[Media]"
        lastMessageDate = new Date(dialog.message.date * 1000)
      }

      chats.push({
        id: chatId,
        title,
        type,
        unreadCount: dialog.unreadCount || 0,
        lastMessage,
        lastMessageDate,
      })
    }

    return chats
  }

  async getMessages(chatId: ChatRef, limit = 50): Promise<MessageInfo[]> {
    if (!this.gramClient) throw new Error("Not connected")

    const peer = await this.getPeer(chatId)
    if (!peer) {
      throw new Error("Chat " + chatId + " not found")
    }

    const resolvedChatId = this.extractId(peer)
    const messages = await this.gramClient.getMessages(peer, { limit })
    const result: MessageInfo[] = []

    for (const msg of messages) {
      const media = (msg as any).media
      const hasPhoto = Boolean(
        (msg as any).photo ||
        media instanceof Api.MessageMediaPhoto ||
        media?.className === "MessageMediaPhoto"
      )
      if (!msg.message && !hasPhoto) continue

      const sender = await this.getSenderName(msg.senderId)
      let mediaPath: string | undefined
      if (hasPhoto) {
        mediaPath = await this.downloadPhoto(msg, resolvedChatId)
      }
      result.push({
        id: msg.id,
        chatId: resolvedChatId,
        senderId: msg.senderId?.toJSNumber() || 0,
        senderName: sender,
        content: msg.message || "[Image]",
        date: new Date(msg.date * 1000),
        isOutgoing: msg.out || false,
        replyToId: msg.replyTo?.replyToMsgId,
        mediaPath,
      })
    }

    return result.reverse()
  }

  async sendMessage(chatId: ChatRef, text: string, replyToId?: number): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")

    const peer = await this.getPeer(chatId)
    if (!peer) {
      throw new Error("Chat " + chatId + " not found")
    }

    await this.gramClient.sendMessage(peer, {
      message: text,
      replyTo: replyToId ?? undefined,
    })
  }

  async searchMessages(chatId: ChatRef, query: string, limit = 50): Promise<MessageInfo[]> {
    if (!this.gramClient) throw new Error("Not connected")

    const peer = await this.getPeer(chatId)
    if (!peer) {
      throw new Error("Chat " + chatId + " not found")
    }

    const result = await this.gramClient.invoke(
      new Api.messages.Search({
        peer,
        q: query,
        limit,
        filter: new Api.InputMessagesFilterEmpty(),
      })
    )

    if (!(result instanceof Api.messages.MessagesSlice || result instanceof Api.messages.ChannelMessages || result instanceof Api.messages.Messages)) {
      return []
    }

    const messages: MessageInfo[] = []
    for (const msg of result.messages) {
      if (!(msg instanceof Api.Message)) continue
      const sender = await this.getSenderName(msg.fromId)
      messages.push({
        id: msg.id,
        chatId: this.extractId(peer),
        senderId: msg.senderId ? msg.senderId.toJSNumber() : 0,
        senderName: sender,
        content: msg.message || "",
        date: new Date(msg.date * 1000),
        isOutgoing: msg.out || false,
        replyToId: msg.replyTo?.replyToMsgId,
      })
    }

    return messages
  }

  async getContacts(): Promise<ContactInfo[]> {
    if (!this.gramClient) throw new Error("Not connected")

    const result = await this.gramClient.invoke(new Api.contacts.GetContacts({ hash: 0 as any }))
    if (!(result instanceof Api.contacts.Contacts)) return []

    const contacts: ContactInfo[] = []
    for (const user of result.users) {
      if (!(user instanceof Api.User)) continue
      if (user.deleted) continue

      contacts.push({
        id: Number(user.id),
        firstName: user.firstName || "",
        lastName: user.lastName || undefined,
        username: user.username || undefined,
        phone: user.phone || undefined,
      })
    }

    return contacts.sort((a, b) => a.firstName.localeCompare(b.firstName))
  }

  async markAsRead(chatId: ChatRef): Promise<void> {
    if (!this.gramClient) throw new Error("Not connected")

    const peer = await this.getPeer(chatId)
    if (!peer) {
      throw new Error("Chat " + chatId + " not found")
    }

    const lastMessage = (await this.gramClient.getMessages(peer, { limit: 1 }))[0]
    await this.gramClient.invoke(
      new Api.messages.ReadHistory({ peer, maxId: lastMessage?.id ?? 0 })
    )
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
    } catch {
      // ignore
    }
    return "Unknown"
  }

  private async getPeer(chatId: ChatRef): Promise<any> {
    if (!this.gramClient) throw new Error("Not connected")
    const ref = typeof chatId === "string" ? chatId.replace(/^@/, "") : chatId
    return this.gramClient.getEntity(ref)
  }

  private async downloadPhoto(msg: any, chatId: number): Promise<string | undefined> {
    if (!this.gramClient) return undefined
    try {
      if (!existsSync(MEDIA_DIR)) mkdirSync(MEDIA_DIR, { recursive: true })
      const path = join(MEDIA_DIR, `${chatId}-${msg.id}.jpg`)
      if (existsSync(path)) return path
      const data = await this.gramClient.downloadMedia(msg)
      if (!data) return undefined
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as any)
      writeFileSync(path, buffer)
      return path
    } catch {
      return undefined
    }
  }

  private extractId(entity: any): number {
    if ("id" in entity) return entity.id.toJSNumber()
    return 0
  }

  private getChatType(entity: any): ChatInfo["type"] {
    if (entity instanceof Api.User || entity instanceof Api.UserEmpty) return "private"
    if (entity instanceof Api.Chat || entity instanceof Api.ChatEmpty) return "group"
    if (entity instanceof Api.Channel) {
      return entity.megagroup ? "supergroup" : "channel"
    }
    return "group"
  }

  get isConnected() {
    return this.connected
  }

  get availableAccounts() {
    return listAccounts()
  }
}
