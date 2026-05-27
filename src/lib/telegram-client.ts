// src/lib/telegram-client.ts — Real MTProto Telegram client via gram-js

import { TelegramClient as GramClient, Api } from "telegram"
import { StringSession } from "telegram/sessions"
import { NewMessage } from "telegram/events"
import { existsSync, readFileSync, writeFileSync } from "fs"
import type { Chat, Message, Thread } from "../types"

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "awaiting-auth"
  | "awaiting-phone"
  | "awaiting-code"
  | "awaiting-password"
  | "authenticated"
  | "connected"
  | "error"

export interface TelegramAuthConfig {
  apiId: number
  apiHash: string
}

export interface TelegramClientOptions {
  auth: TelegramAuthConfig
  /** Called when connection status changes */
  onStatusChange?: (status: ConnectionStatus, error?: string) => void
  /** Called when a new message arrives */
  onNewMessage?: (message: Message) => void
  /** Called when the chat list updates */
  onChatListUpdate?: (chats: Chat[]) => void
}

const SESSION_FILE = "./session.txt"

export class TelegramClient {
  private gramClient: GramClient | null = null
  private status: ConnectionStatus = "disconnected"
  private options: TelegramClientOptions
  private session: StringSession
  private connectPromise: Promise<void> | null = null

  // Pending resolvers for auth callbacks
  private pendingPhone: ((phone: string) => void) | null = null
  private pendingCode: ((code: string) => void) | null = null
  private pendingPassword: ((password: string) => void) | null = null
  private pendingQrCode: (() => void) | null = null

  constructor(options: TelegramClientOptions) {
    this.options = options
    const savedSession = this.loadSession()
    this.session = new StringSession(savedSession)
  }

  // ── Connection lifecycle ──

  async connect(): Promise<void> {
    // Prevent multiple simultaneous connection attempts
    if (this.connectPromise) {
      return this.connectPromise
    }

    this.connectPromise = this.doConnect()
    try {
      await this.connectPromise
    } finally {
      this.connectPromise = null
    }
  }

  private async doConnect(): Promise<void> {
    this.setStatus("connecting")

    try {
      // Disconnect any existing client first
      if (this.gramClient) {
        await this.gramClient.disconnect()
        this.gramClient = null
      }

      this.gramClient = new GramClient(
        this.session,
        this.options.auth.apiId,
        this.options.auth.apiHash,
        {
          connectionRetries: 5,
          useWSS: false,
        },
      )

      await this.gramClient.connect()

      // Guard against the client being destroyed during connection
      if (!this.gramClient) {
        this.setStatus("error", "Connection interrupted")
        return
      }

      const isAuthorized = await this.gramClient.checkAuthorization()

      if (!isAuthorized) {
        this.setStatus("awaiting-auth")
      } else {
        this.setStatus("connected")
        this.saveSession()
        void this.setupUpdates()
        void this.loadInitialChats()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // Don't show error for initial connection retries — gram-js handles those internally
      if (!msg.includes("WebSocket") && !msg.includes("Not connected")) {
        this.setStatus("error", msg)
      } else {
        this.setStatus("awaiting-auth")
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.gramClient) {
      await this.gramClient.disconnect()
      this.gramClient = null
    }
    this.setStatus("disconnected")
  }

  // ── Auth flows ──

  async startPhoneAuth(): Promise<void> {
    if (!this.gramClient) return
    try {
      await this.gramClient.start({
        phoneNumber: async () => {
          this.setStatus("awaiting-phone")
          return new Promise((resolve) => {
            this.pendingPhone = resolve
          })
        },
        phoneCode: async () => {
          this.setStatus("awaiting-code")
          return new Promise((resolve) => {
            this.pendingCode = resolve
          })
        },
        password: async () => {
          this.setStatus("awaiting-password")
          return new Promise((resolve) => {
            this.pendingPassword = resolve
          })
        },
        onError: async (err) => {
          console.error("Auth error:", err)
          return true
        },
      })

      this.setStatus("connected")
      this.saveSession()
      void this.setupUpdates()
      void this.loadInitialChats()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.setStatus("error", msg)
    }
  }

  async startQrAuth(): Promise<void> {
    if (!this.gramClient) return
    try {
      await this.gramClient.signInUserWithQrCode(
        { apiId: this.options.auth.apiId, apiHash: this.options.auth.apiHash },
        {
          qrCode: async (qrCode) => {
            this.setStatus("awaiting-auth")
            // Telegram mobile app expects URL-safe base64 (RFC 4648) without padding
            const tokenBase64 = Buffer.from(qrCode.token)
              .toString("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/g, "")
            const qrUrl = `tg://login?token=${tokenBase64}`
            this.options.onStatusChange?.("awaiting-auth", `qr:${qrUrl}:${qrCode.expires}`)
            return new Promise((resolve) => {
              this.pendingQrCode = resolve
            })
          },
          password: async () => {
            this.setStatus("awaiting-password")
            return new Promise((resolve) => {
              this.pendingPassword = resolve
            })
          },
          onError: async (err) => {
            console.error("QR auth error:", err)
            return true
          },
        },
      )

      this.setStatus("connected")
      this.saveSession()
      void this.setupUpdates()
      void this.loadInitialChats()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.setStatus("error", msg)
    }
  }

  // ── Auth input (called from TUI) ──

  submitPhone(phone: string): void {
    this.pendingPhone?.(phone)
    this.pendingPhone = null
  }

  submitCode(code: string): void {
    this.pendingCode?.(code)
    this.pendingCode = null
  }

  submitPassword(password: string): void {
    this.pendingPassword?.(password)
    this.pendingPassword = null
  }

  // ── Data fetching ──

  async getChatList(): Promise<Chat[]> {
    if (!this.gramClient) return []
    try {
      const dialogs = await this.gramClient.getDialogs({})
      const allChats = dialogs.map(mapDialogToChat)
      // Deduplicate by id — Telegram can return the same chat in multiple dialogs
      const seen = new Set<number>()
      const chats: Chat[] = []
      for (const chat of allChats) {
        if (!seen.has(chat.id)) {
          seen.add(chat.id)
          chats.push(chat)
        }
      }
      this.options.onChatListUpdate?.(chats)
      return chats
    } catch (err) {
      console.error("Failed to get chat list:", err)
      return []
    }
  }

  async getMessages(chatId: number, threadId?: number, limit = 50): Promise<Message[]> {
    if (!this.gramClient) return []
    try {
      const entity = await this.gramClient.getEntity(chatId)

      // Use gram-js getMessages which properly wraps raw API objects
      const msgs = await this.gramClient.getMessages(entity, {
        limit,
        offsetId: 0,
        ...(threadId ? { replyTo: threadId } : {}),
      })

      // Reverse so oldest is first in array, newest is last
      return msgs.reverse().map((m) => mapGramMessage(m, chatId))
    } catch (err) {
      console.error("Failed to get messages:", err)
      return []
    }
  }

  async getOlderMessages(chatId: number, beforeId: number, threadId?: number, limit = 50): Promise<Message[]> {
    if (!this.gramClient) return []
    try {
      const entity = await this.gramClient.getEntity(chatId)

      // Use gram-js getMessages which properly wraps raw API objects
      const msgs = await this.gramClient.getMessages(entity, {
        limit,
        offsetId: beforeId,
        ...(threadId ? { replyTo: threadId } : {}),
      })

      // Reverse so oldest is first in array, newest is last
      const mapped = msgs.reverse().map((m) => mapGramMessage(m, chatId))
      // Filter out the message with id === beforeId to avoid duplicates
      return mapped.filter((m) => m.id !== beforeId)
    } catch (err) {
      console.error("Failed to get older messages:", err)
      return []
    }
  }

  async getForumTopics(chatId: number): Promise<Thread[]> {
    if (!this.gramClient) return []
    try {
      const entity = await this.gramClient.getEntity(chatId)
      // Only channels/supergroups can have forum topics
      const result = await this.gramClient.invoke(
        new Api.channels.GetForumTopics({
          channel: entity,
          offsetId: 0,
          offsetDate: 0,
          limit: 100,
        }),
      )
      const topics = (result as any).topics ?? []
      return topics.map((t: any) => ({
        id: t.id ? Number(t.id) : 0,
        title: t.title || "Topic",
        unreadCount: t.unreadCount || 0,
      }))
    } catch (err) {
      // Most groups are not forums; fail silently
      return []
    }
  }

  async sendMessage(chatId: number, text: string, threadId?: number): Promise<Message | null> {
    if (!this.gramClient) return null
    try {
      const entity = await this.gramClient.getEntity(chatId)
      const result = await this.gramClient.sendMessage(entity, {
        message: text,
        ...(threadId ? { replyTo: threadId } : {}),
      })
      return mapGramMessage(result, chatId)
    } catch (err) {
      console.error("Failed to send message:", err)
      return null
    }
  }

  // ── Internal helpers ──

  private async setupUpdates(): Promise<void> {
    if (!this.gramClient) return
    this.gramClient.addEventHandler((event) => {
      const msg = event.message
      if (!msg) return
      const chatId = getChatIdFromGramMessage(msg)
      const mapped = mapGramMessage(msg, chatId)
      this.options.onNewMessage?.(mapped)
    }, new NewMessage({}))
  }

  private async loadInitialChats(): Promise<void> {
    await this.getChatList()
  }

  private setStatus(status: ConnectionStatus, error?: string): void {
    this.status = status
    this.options.onStatusChange?.(status, error)
  }

  private loadSession(): string {
    try {
      if (existsSync(SESSION_FILE)) {
        return readFileSync(SESSION_FILE, "utf-8").trim()
      }
    } catch {
      // ignore
    }
    return ""
  }

  private saveSession(): void {
    try {
      const sess = this.session.save() as string
      writeFileSync(SESSION_FILE, sess)
    } catch {
      // ignore
    }
  }
}

// ── Mapping helpers ──

function extractIdFromPeer(peer: any): number {
  if (!peer) return 0
  // gram-js Peer objects: PeerUser, PeerChat, PeerChannel
  if (peer.userId) return Number(peer.userId)
  if (peer.chatId) return Number(peer.chatId)
  if (peer.channelId) return Number(peer.channelId)
  if (peer.id) return Number(peer.id)
  return 0
}

function mapDialogToChat(dialog: any): Chat {
  const entity = dialog.entity || dialog
  // dialog.id is a Peer object in gram-js
  const id = extractIdFromPeer(dialog.id) || (entity?.id ? Number(entity.id) : 0)
  const title =
    entity?.title ||
    `${entity?.firstName || ""} ${entity?.lastName || ""}`.trim() ||
    "Unknown"
  const type: Chat["type"] = entity?.className === "User"
    ? "private"
    : entity?.className === "Channel" || entity?.megagroup === true
      ? "channel"
      : "group"
  const unreadCount = dialog.unreadCount || 0
  return { id, title, type, unreadCount }
}

function extractMediaInfo(msg: any): { content: string; mediaType?: Message["mediaType"] } {
  // If message has text, it's a text message (possibly with caption)
  if (msg.text && msg.text.trim().length > 0) {
    return { content: msg.text }
  }

  const media = msg.media
  if (!media) {
    return { content: "" }
  }

  const className = media.className || ""

  if (className === "MessageMediaPhoto") {
    return { content: "[Image]", mediaType: "photo" }
  }

  if (className === "MessageMediaDocument") {
    const doc = media.document
    const mime = doc?.mimeType || ""
    const attrs = doc?.attributes || []

    if (mime.startsWith("image/")) return { content: "[Image]", mediaType: "photo" }
    if (mime.startsWith("video/")) return { content: "[Video]", mediaType: "video" }
    if (mime.startsWith("audio/")) return { content: "[Audio]", mediaType: "audio" }

    // Check attributes for specific document types
    for (const attr of attrs) {
      const attrClass = attr.className || ""
      if (attrClass === "DocumentAttributeSticker") return { content: "[Sticker]", mediaType: "sticker" }
      if (attrClass === "DocumentAttributeVideo") return { content: "[Video]", mediaType: "video" }
      if (attrClass === "DocumentAttributeAudio") {
        return attr.voice
          ? { content: "[Voice message]", mediaType: "voice" }
          : { content: "[Audio]", mediaType: "audio" }
      }
      if (attrClass === "DocumentAttributeAnimated") return { content: "[GIF]", mediaType: "gif" }
    }

    return { content: "[File]", mediaType: "file" }
  }

  if (className === "MessageMediaGeo" || className === "MessageMediaGeoLive") {
    return { content: "[Location]", mediaType: "location" }
  }

  if (className === "MessageMediaPoll") {
    return { content: "[Poll]", mediaType: "poll" }
  }

  if (className === "MessageMediaContact") {
    return { content: "[Contact]", mediaType: "contact" }
  }

  return { content: "[Media]", mediaType: "unknown" }
}

function mapGramMessage(msg: any, chatId: number): Message {
  const id = msg.id ? Number(msg.id) : Date.now()
  const sender = msg.sender
  const senderName = sender
    ? `${sender.firstName || ""} ${sender.lastName || ""}`.trim() ||
      sender.title ||
      "Unknown"
    : "Unknown"
  const { content, mediaType } = extractMediaInfo(msg)
  const timestamp = msg.date ? new Date(msg.date * 1000) : new Date()
  const isOutgoing = msg.out === true
  return {
    id,
    chatId,
    senderName,
    content,
    timestamp,
    isOutgoing,
    mediaType,
  }
}

function getChatIdFromGramMessage(msg: any): number {
  if (msg.chatId) return Number(msg.chatId)
  if (msg.chat && msg.chat.id) return Number(msg.chat.id)
  if (msg.peerId) {
    return extractIdFromPeer(msg.peerId)
  }
  return 0
}
