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
  /** Called when a user's online status changes */
  onUserStatusChange?: (userId: number, online: boolean, lastSeen?: Date) => void
}

const SESSION_FILE = "./session.txt"

export class TelegramClient {
  private gramClient: GramClient | null = null
  private status: ConnectionStatus = "disconnected"
  private options: TelegramClientOptions
  private session: StringSession
  private connectPromise: Promise<void> | null = null
  private onlineInterval: ReturnType<typeof setInterval> | null = null
  private cloakMode = false

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
        void this.setLastSeenPrivacy("anybody")
        this.startOnlineHeartbeat()
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
    this.stopOnlineHeartbeat()
    if (this.gramClient) {
      try {
        // Explicitly set offline before disconnecting
        await this.gramClient.invoke(
          new Api.account.UpdateStatus({
            offline: true,
          }),
        )
      } catch {
        // Ignore errors during disconnect cleanup
      }
      try {
        // Race disconnect against a 2s timeout so SIGINT doesn't hang
        await Promise.race([
          this.gramClient.disconnect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("disconnect-timeout")), 2000),
          ),
        ])
      } catch {
        // Ignore timeout or any disconnect error
      }
      this.gramClient = null
    }
    this.setStatus("disconnected")
  }

  setCloakMode(enabled: boolean): void {
    this.cloakMode = enabled
    // Cloak ON = privacy mode: appear offline, hide last seen from everybody
    // Cloak OFF = normal mode: appear online, show last seen to everybody
    void this.updateOnlineStatus(!enabled)
    void this.setLastSeenPrivacy(enabled ? "nobody" : "anybody")
  }

  private startOnlineHeartbeat(): void {
    this.stopOnlineHeartbeat()
    // Telegram expires online status after ~5 min; heartbeat every 30s
    this.onlineInterval = setInterval(() => {
      void this.updateOnlineStatus(!this.cloakMode)
    }, 30000)
    // Set immediately
    void this.updateOnlineStatus(!this.cloakMode)
  }

  private stopOnlineHeartbeat(): void {
    if (this.onlineInterval) {
      clearInterval(this.onlineInterval)
      this.onlineInterval = null
    }
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
      const allChats = dialogs.map(mapDialogToChat).filter((c): c is Chat => c !== null)

      // Fetch forum topics for forum channels so unread counts are accurate from startup
      const forumFetches = dialogs
        .filter((d: any) => {
          const entity = d.entity || d
          return entity?.className === "Channel" && entity?.forum
        })
        .map(async (d: any) => {
          const chat = mapDialogToChat(d)
          if (!chat) return null
          const threads = await this.getForumTopics(chat.id)
          return { chatId: chat.id, threads }
        })

      const forumResults = (await Promise.all(forumFetches)).filter(
        (r): r is { chatId: number; threads: Thread[] } => r !== null,
      )
      const threadMap = new Map<number, Thread[]>()
      for (const res of forumResults) {
        threadMap.set(res.chatId, res.threads)
      }

      const chatsWithThreads = allChats.map((chat) => {
        const threads = threadMap.get(chat.id)
        return threads ? { ...chat, threads } : chat
      })

      // Deduplicate by id — Telegram can return the same chat in multiple dialogs
      const seen = new Set<number>()
      const chats: Chat[] = []
      for (const chat of chatsWithThreads) {
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

  async sendMessage(chatId: number, text: string, threadId?: number, replyToMessageId?: number): Promise<Message | null> {
    if (!this.gramClient) return null
    try {
      const entity = await this.gramClient.getEntity(chatId)

      // Build replyTo parameter correctly for gram-js sendMessage
      let replyTo: any = undefined
      if (threadId && replyToMessageId) {
        // Replying to a message inside a forum topic
        replyTo = new Api.InputReplyToMessage({
          replyToMsgId: replyToMessageId,
          topMsgId: threadId,
        })
      } else if (replyToMessageId) {
        // Simple reply to a message
        replyTo = replyToMessageId
      } else if (threadId) {
        // Sending to a forum topic (no reply)
        replyTo = threadId
      }

      const result = await this.gramClient.sendMessage(entity, {
        message: text,
        ...(replyTo !== undefined ? { replyTo } : {}),
      })
      return mapGramMessage(result, chatId)
    } catch (err) {
      console.error("Failed to send message:", err)
      return null
    }
  }

  async searchMessages(chatId: number, query: string, limit = 50): Promise<Message[]> {
    if (!this.gramClient) return []
    try {
      const entity = await this.gramClient.getEntity(chatId)
      const msgs = await this.gramClient.getMessages(entity, {
        search: query,
        limit,
      })
      return msgs.map((m) => mapGramMessage(m, chatId))
    } catch (err) {
      console.error("Failed to search messages:", err)
      return []
    }
  }

  async searchMessagesGlobal(query: string, limit = 50): Promise<{ message: Message; chatTitle: string }[]> {
    if (!this.gramClient) return []
    try {
      const result = await this.gramClient.invoke(
        new Api.messages.SearchGlobal({
          q: query,
          filter: new Api.InputMessagesFilterEmpty(),
          limit,
          minDate: 0,
          maxDate: 0,
          offsetRate: 0,
          offsetPeer: new Api.InputPeerEmpty(),
          offsetId: 0,
        }),
      )
      const rawMessages = (result as any).messages ?? []
      const rawChats = (result as any).chats ?? []
      const rawUsers = (result as any).users ?? []

      const chats = new Map<number, string>()
      for (const chat of rawChats) {
        const title = chat.title || `${chat.firstName || ""} ${chat.lastName || ""}`.trim() || "Unknown"
        chats.set(Number(chat.id), title)
      }

      const users = new Map<number, string>()
      for (const user of rawUsers) {
        const name = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.title || "Unknown"
        users.set(Number(user.id), name)
      }

      return rawMessages.map((m: any) => {
        // Chat id from peerId (raw id, matches result.chats)
        const peerId = m.peerId
        const rawChatId = peerId?.channelId
          ? Number(peerId.channelId)
          : peerId?.chatId
            ? Number(peerId.chatId)
            : peerId?.userId
              ? Number(peerId.userId)
              : 0

        // Sender id from fromId or peerId (for channel posts, fromId may be the channel itself)
        const fromId = m.fromId
        let rawSenderId = fromId?.userId
          ? Number(fromId.userId)
          : fromId?.channelId
            ? Number(fromId.channelId)
            : fromId?.chatId
              ? Number(fromId.chatId)
              : 0
        // Fallback: if no fromId, the sender might be the chat itself (e.g. channel posts)
        if (rawSenderId === 0) {
          rawSenderId = rawChatId
        }
        const senderName = users.get(rawSenderId) || chats.get(rawSenderId) || "Unknown"

        const chatTitle = chats.get(rawChatId) || "Unknown"

        const { content: extractedContent, mediaType } = extractMediaInfo(m)
        const content = extractedContent || ""
        const timestamp = m.date ? new Date(m.date * 1000) : new Date()

        const mapped: Message = {
          id: m.id ? Number(m.id) : Date.now(),
          chatId: rawChatId,
          senderName,
          content,
          timestamp,
          isOutgoing: m.out === true,
          mediaType,
        }
        return { message: mapped, chatTitle }
      })
    } catch (err) {
      console.error("Failed to search messages globally:", err)
      return []
    }
  }

  async markAsRead(chatId: number, threadId?: number): Promise<void> {
    if (!this.gramClient) return
    try {
      const entity = await this.gramClient.getEntity(chatId)
      if (threadId) {
        // Thread / forum topic: use messages.readDiscussion
        // Fetch the latest message in the thread to know what to mark as read
        const msgs = await this.gramClient.getMessages(entity, {
          limit: 1,
          replyTo: threadId,
        })
        const readMaxId = msgs.length > 0 && msgs[0] ? msgs[0].id : threadId
        await this.gramClient.invoke(
          new Api.messages.ReadDiscussion({
            peer: entity,
            msgId: threadId,
            readMaxId,
          }),
        )
      } else if (entity.className === "Channel") {
        await this.gramClient.invoke(
          new Api.channels.ReadHistory({
            channel: entity,
            maxId: 0,
          }),
        )
      } else {
        await this.gramClient.invoke(
          new Api.messages.ReadHistory({
            peer: entity,
            maxId: 0,
          }),
        )
      }
    } catch (err) {
      // Silently ignore read failures (e.g. deleted chat)
    }
  }

  async sendReaction(chatId: number, messageId: number, emoticon: string): Promise<void> {
    if (!this.gramClient) return
    try {
      const entity = await this.gramClient.getEntity(chatId)
      await this.gramClient.invoke(
        new Api.messages.SendReaction({
          peer: entity,
          msgId: messageId,
          reaction: [new Api.ReactionEmoji({ emoticon })],
        }),
      )
    } catch (err) {
      console.error("Failed to send reaction:", err)
    }
  }

  async deleteMessages(chatId: number, messageIds: number[]): Promise<void> {
    if (!this.gramClient) return
    try {
      const entity = await this.gramClient.getEntity(chatId)
      await this.gramClient.invoke(
        new Api.messages.DeleteMessages({
          id: messageIds,
          revoke: true,
        }),
      )
    } catch (err) {
      console.error("Failed to delete messages:", err)
    }
  }

  async editMessage(chatId: number, messageId: number, newText: string): Promise<void> {
    if (!this.gramClient) return
    try {
      const entity = await this.gramClient.getEntity(chatId)
      await this.gramClient.invoke(
        new Api.messages.EditMessage({
          peer: entity,
          id: messageId,
          message: newText,
        }),
      )
    } catch (err) {
      console.error("Failed to edit message:", err)
    }
  }

  async forwardMessage(fromChatId: number, toChatId: number, messageId: number): Promise<void> {
    if (!this.gramClient) return
    try {
      const fromEntity = await this.gramClient.getEntity(fromChatId)
      const toEntity = await this.gramClient.getEntity(toChatId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const randomId = [(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) as any)]
      await this.gramClient.invoke(
        new Api.messages.ForwardMessages({
          fromPeer: fromEntity,
          id: [messageId],
          toPeer: toEntity,
          randomId,
        }),
      )
    } catch (err) {
      console.error("Failed to forward message:", err)
    }
  }

  async pinMessage(chatId: number, messageId: number): Promise<void> {
    if (!this.gramClient) return
    try {
      const entity = await this.gramClient.getEntity(chatId)
      await this.gramClient.invoke(
        new Api.messages.UpdatePinnedMessage({
          peer: entity,
          id: messageId,
          silent: true,
        }),
      )
    } catch (err) {
      console.error("Failed to pin message:", err)
    }
  }

  async updateOnlineStatus(online: boolean): Promise<void> {
    if (!this.gramClient) return
    try {
      await this.gramClient.invoke(
        new Api.account.UpdateStatus({
          offline: !online,
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("updateOnlineStatus failed:", msg)
    }
  }

  async setLastSeenPrivacy(level: "nobody" | "contacts" | "anybody"): Promise<void> {
    if (!this.gramClient) return
    try {
      const rules =
        level === "nobody"
          ? [new Api.InputPrivacyValueDisallowAll()]
          : level === "contacts"
            ? [new Api.InputPrivacyValueAllowContacts()]
            : [new Api.InputPrivacyValueAllowAll()]
      await this.gramClient.invoke(
        new Api.account.SetPrivacy({
          key: new Api.InputPrivacyKeyStatusTimestamp(),
          rules,
        }),
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("setLastSeenPrivacy failed:", msg)
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

    // Listen for user status updates (online/offline)
    this.gramClient.addEventHandler((update) => {
      const u = update as any
      if (u.className === "UpdateUserStatus") {
        const userId = Number(u.userId)
        const status = u.status
        let online = false
        let lastSeen: Date | undefined
        if (status?.className === "UserStatusOnline") {
          online = true
        } else if (status?.className === "UserStatusOffline") {
          online = false
          lastSeen = status.wasOnline ? new Date(status.wasOnline * 1000) : undefined
        } else if (status?.className === "UserStatusRecently") {
          online = false
        }
        this.options.onUserStatusChange?.(userId, online, lastSeen)
      }
    })
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

function mapDialogToChat(dialog: any): Chat | null {
  const entity = dialog.entity || dialog
  // Skip migrated basic groups — Telegram keeps the old group dialog around
  // temporarily after migrating to a supergroup. It has a `migratedTo` field.
  if (entity?.migratedTo || entity?.migrated_to) {
    return null
  }
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
  const forum = entity?.forum === true
  return { id, title, type, unreadCount, forum }
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
  const replyTo = msg.replyTo
  const isForumTopicReply = replyTo?.forumTopic === true
  const replyToMessageId = !isForumTopicReply && replyTo?.replyToMsgId
    ? Number(replyTo.replyToMsgId)
    : undefined
  // For forum topics, replyToMsgId IS the topic id when forumTopic flag is set.
  // Otherwise fall back to replyToTopId for regular thread replies.
  const threadId = isForumTopicReply && replyTo?.replyToMsgId
    ? Number(replyTo.replyToMsgId)
    : replyTo?.replyToTopId
      ? Number(replyTo.replyToTopId)
      : undefined

  // Detect forwarded messages
  const fwdFrom = msg.fwdFrom
  const isForwarded = !!fwdFrom
  let forwardFromName: string | undefined
  if (fwdFrom) {
    const fromName = fwdFrom.fromName
    const sender = fwdFrom.fromId
    if (fromName) {
      forwardFromName = fromName
    } else if (sender?.userId) {
      forwardFromName = fwdFrom.fromName || "Unknown"
    } else if (sender?.channelId) {
      forwardFromName = fwdFrom.channelTitle || fwdFrom.fromName || "Unknown Channel"
    }
  }

  return {
    id,
    chatId,
    senderName,
    content,
    timestamp,
    isOutgoing,
    mediaType,
    replyToMessageId,
    threadId,
    isForwarded,
    forwardFromName,
  }
}

function getChatIdFromGramMessage(msg: any): number {
  // Prefer msg.chat.id (raw MTProto id) over msg.chatId (bot-api style) so
  // that channel ids match the ids stored from getDialogs().
  if (msg.chat && msg.chat.id) return Number(msg.chat.id)
  if (msg.chatId) return Number(msg.chatId)
  if (msg.peerId) {
    return extractIdFromPeer(msg.peerId)
  }
  return 0
}
