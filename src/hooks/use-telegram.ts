// src/hooks/use-telegram.ts — Telegram client wrapper with QR support

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TelegramClient, type ConnectionStatus } from "../lib/telegram-client"
import { loadConfig } from "../lib/config"
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
  sendMessage: (chatId: number, text: string, threadId?: number) => Promise<Message | null>
  getMessages: (chatId: number, threadId?: number, limit?: number) => Promise<Message[]>
  getOlderMessages: (chatId: number, beforeId: number, threadId?: number, limit?: number) => Promise<Message[]>
  getForumTopics: (chatId: number) => Promise<Thread[]>
  disconnect: () => Promise<void>
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
  const connectedRef = useRef(false)

  const setChats = useStore((s) => s.setChats)
  const addMessage = useStore((s) => s.addMessage)

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
    const key = `${message.chatId}`
    addMessage(key, message)
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

  // Create client once and keep it in ref
  if (!clientRef.current) {
    clientRef.current = new TelegramClient({
      auth: { apiId: config.apiId, apiHash: config.apiHash },
      onStatusChange,
      onNewMessage,
      onChatListUpdate,
    })
  }

  // Auto-connect on mount — only once
  useEffect(() => {
    if (connectedRef.current) return
    connectedRef.current = true
    void clientRef.current!.connect()

    return () => {
      void clientRef.current?.disconnect()
      connectedRef.current = false
    }
  }, [])

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

  const sendMessage = useCallback(async (chatId: number, text: string, threadId?: number) => {
    const result = await clientRef.current?.sendMessage(chatId, text, threadId)
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
    getMessages,
    getOlderMessages,
    getForumTopics,
    disconnect,
  }
}
