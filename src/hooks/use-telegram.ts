// src/hooks/use-telegram.ts — Telegram client wrapper with QR support

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TelegramClient, type ConnectionStatus } from "../lib/telegram-client"
import { loadConfig, saveConfig, type TeleVimConfig } from "../lib/config"
import { loadSession, saveSession, deleteSession, listAccounts, migrateLegacySession } from "../lib/session-store"
import { useStore } from "../state/store"
import type { Chat, Message, Thread } from "../types"

export type AuthMethod = "phone" | "qr" | null

export interface UseTelegramResult {
  status: ConnectionStatus
  statusError?: string
  isReady: boolean
  needsAuth: boolean
  needsPhone: boolean
  needsCode: boolean
  needsPassword: boolean
  authMethod: AuthMethod
  qrData?: string
  qrExpires?: number
  setAuthMethod: (method: AuthMethod) => void
  submitPhone: (phone: string) => void
  submitCode: (code: string) => void
  submitPassword: (password: string) => void
  sendMessage: (chatId: number, text: string, threadId?: number, replyToMessageId?: number) => Promise<Message | null>
  sendFile: (chatId: number, filePath: string, caption?: string, threadId?: number, replyToMessageId?: number) => Promise<Message | null>
  getMessages: (chatId: number, threadId?: number, limit?: number) => Promise<Message[]>
  getOlderMessages: (chatId: number, beforeId: number, threadId?: number, limit?: number) => Promise<Message[]>
  getForumTopics: (chatId: number) => Promise<Thread[]>
  markAsRead: (chatId: number, threadId?: number) => Promise<void>
  searchMessages: (chatId: number, query: string, limit?: number) => Promise<Message[]>
  searchMessagesGlobal: (query: string, limit?: number) => Promise<{ message: Message; chatTitle: string }[]>
  setCloakMode: (enabled: boolean) => void
  setLastSeenPrivacy: (level: "nobody" | "contacts" | "anybody") => Promise<void>
  sendReaction: (chatId: number, messageId: number, emoticon: string) => Promise<void>
  deleteMessages: (chatId: number, messageIds: number[]) => Promise<void>
  editMessage: (chatId: number, messageId: number, newText: string) => Promise<void>
  forwardMessage: (fromChatId: number, toChatId: number, messageId: number) => Promise<void>
  pinMessage: (chatId: number, messageId: number) => Promise<void>
  disconnect: () => Promise<void>
  activeAccount: string
  accounts: string[]
  switchAccount: (name: string) => void
  addAccount: (name: string) => void
  removeAccount: (name: string) => void
}

export function useTelegram(): UseTelegramResult {
  // Memoize config to prevent object identity changes on every render
  const config = useMemo(() => loadConfig(), [])

  const [status, setStatus] = useState<ConnectionStatus>("connecting")
  const [statusError, setStatusError] = useState<string | undefined>()
  const [authMethod, setAuthMethodState] = useState<AuthMethod>(null)
  const [qrData, setQrData] = useState<string | undefined>()
  const [qrExpires, setQrExpires] = useState<number | undefined>()
  const clientRef = useRef<TelegramClient | null>(null)
  const connectingRef = useRef(false)

  const [activeAccount, setActiveAccount] = useState<string>(() => {
    // Migrate legacy ./session.txt on first run
    const migrated = migrateLegacySession()
    if (migrated) {
      const cfg = loadConfig()
      saveConfig({ ...cfg, activeAccount: migrated })
      return migrated
    }
    return config.activeAccount || "default"
  })
  const [accounts, setAccounts] = useState<string[]>(() => listAccounts())

  const setChats = useStore((s) => s.setChats)
  const addMessage = useStore((s) => s.addMessage)
  const setReadOutboxMaxId = useStore((s) => s.setReadOutboxMaxId)

  const isReady = status === "connected"
  const needsAuth = status === "awaiting-auth" || status === "awaiting-phone" || status === "awaiting-code" || status === "awaiting-password"
  const needsPhone = status === "awaiting-phone"
  const needsCode = status === "awaiting-code"
  const needsPassword = status === "awaiting-password"

  const onStatusChange = useCallback((newStatus: ConnectionStatus, error?: string) => {
    setStatus(newStatus)
    if (error?.startsWith("qr:")) {
      const rest = error.slice(3) // remove "qr:" prefix
      const lastColon = rest.lastIndexOf(":")
      if (lastColon !== -1) {
        setQrData(rest.slice(0, lastColon))
        setQrExpires(Number(rest.slice(lastColon + 1)))
      }
      setStatusError(undefined)
    } else {
      setStatusError(error)
    }
  }, [])

  const onNewMessage = useCallback((message: Message) => {
    const state = useStore.getState()
    const chat = state.chats.find((c) => c.id === message.chatId)
    // Try replyToTopId first (forum topic id), fall back to replyToMsgId for replies in threads
    const threadId = message.threadId ?? message.replyToMessageId
    const isThreadMessage =
      threadId !== undefined && chat?.threads?.some((t) => t.id === threadId)
    const key = isThreadMessage ? `${message.chatId}:${threadId}` : `${message.chatId}`
    addMessage(key, message)

    const isActiveChat = state.activeChat?.id === message.chatId
    const isActiveThread = state.activeThreadId
      ? state.activeThreadId === threadId
      : !isThreadMessage

    // In cloak mode, messages are never "read" — always increment unread count
    // In normal mode, only increment if we're not actively viewing this chat/thread
    const shouldIncrementUnread = state.cloakMode || !isActiveChat || !isActiveThread
    if (shouldIncrementUnread) {
      if (isThreadMessage && threadId !== undefined) {
        state.incrementThreadUnread(message.chatId, threadId)
      } else {
        state.incrementChatUnread(message.chatId)
      }
    }

    // Auto-read incoming messages when actively viewing the chat and cloak mode is off
    if (!state.cloakMode && isActiveChat && isActiveThread) {
      void clientRef.current?.markAsRead(message.chatId, state.activeThreadId ?? undefined)
    }
  }, [addMessage])

  const onChatListUpdate = useCallback((chats: Chat[]) => {
    const state = useStore.getState()
    const existing = new Map(state.chats.map((c) => [c.id, c]))
    setChats(
      chats.map((chat) => {
        const prev = existing.get(chat.id)
        return prev ? { ...chat, threads: prev.threads } : chat
      }),
    )
  }, [setChats])

  const onUserStatusChange = useCallback((userId: number, online: boolean, lastSeen?: Date) => {
    useStore.getState().setUserOnline(userId, online, lastSeen)
  }, [])

  const onReadOutboxUpdate = useCallback((chatId: number, maxId: number) => {
    setReadOutboxMaxId(chatId, maxId)
  }, [setReadOutboxMaxId])

  // Create / reconnect client whenever activeAccount changes
  useEffect(() => {
    let cancelled = false

    async function setup() {
      if (connectingRef.current) return
      connectingRef.current = true

      // Disconnect previous client
      if (clientRef.current) {
        try {
          await clientRef.current.disconnect()
        } catch {
          // ignore
        }
        clientRef.current = null
      }

      if (cancelled) {
        connectingRef.current = false
        return
      }

      const sessionString = loadSession(activeAccount)
      const client = new TelegramClient(
        {
          auth: { apiId: config.apiId, apiHash: config.apiHash },
          onStatusChange,
          onNewMessage,
          onChatListUpdate,
          onUserStatusChange,
          onReadOutboxUpdate,
          onSaveSession: (sess) => saveSession(activeAccount, sess),
        },
        sessionString,
      )

      clientRef.current = client

      if (!cancelled) {
        await client.connect()
      }
      connectingRef.current = false
    }

    void setup()

    return () => {
      cancelled = true
      void clientRef.current?.disconnect()
      clientRef.current = null
      connectingRef.current = false
    }
  }, [activeAccount, config, onStatusChange, onNewMessage, onChatListUpdate, onUserStatusChange, onReadOutboxUpdate])

  const switchAccount = useCallback((name: string) => {
    const cfg = loadConfig()
    saveConfig({ ...cfg, activeAccount: name })
    setActiveAccount(name)
    setAccounts(listAccounts())
    // Reset auth UI state for the new account
    setAuthMethodState(null)
    setStatus("connecting")
    setStatusError(undefined)
    setQrData(undefined)
    setQrExpires(undefined)
  }, [])

  const addAccount = useCallback((name: string) => {
    const safe = name.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
    if (!safe) return
    switchAccount(safe)
  }, [switchAccount])

  const removeAccount = useCallback((name: string) => {
    deleteSession(name)
    const remaining = listAccounts()
    setAccounts(remaining)
    if (activeAccount === name) {
      const first = remaining[0]
      if (first) {
        switchAccount(first)
      } else {
        switchAccount("default")
      }
    }
  }, [activeAccount, switchAccount])

  const setAuthMethod = useCallback((method: AuthMethod) => {
    setAuthMethodState(method)
    if (method === "phone") {
      void clientRef.current?.startPhoneAuth()
    } else if (method === "qr") {
      void clientRef.current?.startQrAuth()
    }
  }, [])

  const submitPhone = useCallback((phone: string) => {
    clientRef.current?.submitPhone(phone)
  }, [])

  const submitCode = useCallback((code: string) => {
    clientRef.current?.submitCode(code)
  }, [])

  const submitPassword = useCallback((password: string) => {
    clientRef.current?.submitPassword(password)
  }, [])

  const sendMessage = useCallback(async (chatId: number, text: string, threadId?: number, replyToMessageId?: number) => {
    const result = await clientRef.current?.sendMessage(chatId, text, threadId, replyToMessageId)
    if (result) {
      const key = threadId ? `${chatId}:${threadId}` : `${chatId}`
      addMessage(key, result)
    }
    return result || null
  }, [addMessage])

  const sendFile = useCallback(async (chatId: number, filePath: string, caption?: string, threadId?: number, replyToMessageId?: number) => {
    const result = await clientRef.current?.sendFile(chatId, filePath, caption, threadId, replyToMessageId)
    if (result) {
      const key = threadId ? `${chatId}:${threadId}` : `${chatId}`
      addMessage(key, result)
    }
    return result || null
  }, [addMessage])

  const getMessages = useCallback(async (chatId: number, threadId?: number, limit?: number) => {
    const msgs = await clientRef.current?.getMessages(chatId, threadId, limit)
    return msgs ?? []
  }, [])

  const getOlderMessages = useCallback(async (chatId: number, beforeId: number, threadId?: number, limit?: number) => {
    const msgs = await clientRef.current?.getOlderMessages(chatId, beforeId, threadId, limit)
    return msgs ?? []
  }, [])

  const getForumTopics = useCallback(async (chatId: number) => {
    const topics = await clientRef.current?.getForumTopics(chatId)
    return topics ?? []
  }, [])

  const markAsRead = useCallback(async (chatId: number, threadId?: number) => {
    await clientRef.current?.markAsRead(chatId, threadId)
  }, [])

  const searchMessages = useCallback(async (chatId: number, query: string, limit?: number) => {
    const msgs = await clientRef.current?.searchMessages(chatId, query, limit)
    return msgs ?? []
  }, [])

  const searchMessagesGlobal = useCallback(async (query: string, limit?: number) => {
    const results = await clientRef.current?.searchMessagesGlobal(query, limit)
    return results ?? []
  }, [])

  const setCloakMode = useCallback((enabled: boolean) => {
    clientRef.current?.setCloakMode(enabled)
  }, [])

  const setLastSeenPrivacy = useCallback(async (level: "nobody" | "contacts" | "anybody") => {
    await clientRef.current?.setLastSeenPrivacy(level)
  }, [])

  const sendReaction = useCallback(async (chatId: number, messageId: number, emoticon: string) => {
    await clientRef.current?.sendReaction(chatId, messageId, emoticon)
  }, [])

  const deleteMessages = useCallback(async (chatId: number, messageIds: number[]) => {
    await clientRef.current?.deleteMessages(chatId, messageIds)
  }, [])

  const editMessage = useCallback(async (chatId: number, messageId: number, newText: string) => {
    await clientRef.current?.editMessage(chatId, messageId, newText)
  }, [])

  const forwardMessage = useCallback(async (fromChatId: number, toChatId: number, messageId: number) => {
    await clientRef.current?.forwardMessage(fromChatId, toChatId, messageId)
  }, [])

  const pinMessage = useCallback(async (chatId: number, messageId: number) => {
    await clientRef.current?.pinMessage(chatId, messageId)
  }, [])

  const disconnect = useCallback(async () => {
    await clientRef.current?.disconnect()
  }, [])

  return {
    status,
    statusError,
    isReady,
    needsAuth,
    needsPhone,
    needsCode,
    needsPassword,
    authMethod,
    qrData,
    qrExpires,
    setAuthMethod,
    submitPhone,
    submitCode,
    submitPassword,
    sendMessage,
    sendFile,
    getMessages,
    getOlderMessages,
    getForumTopics,
    markAsRead,
    searchMessages,
    searchMessagesGlobal,
    setCloakMode,
    setLastSeenPrivacy,
    sendReaction,
    deleteMessages,
    editMessage,
    forwardMessage,
    pinMessage,
    disconnect,
    activeAccount,
    accounts,
    switchAccount,
    addAccount,
    removeAccount,
  }
}
