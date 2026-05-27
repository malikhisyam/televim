// src/types.ts — Shared TypeScript types for TeleVim

export type VimMode = "normal" | "insert" | "visual" | "command" | "search"

export interface Thread {
  id: number
  title: string
  unreadCount: number
}

export interface Chat {
  id: number
  title: string
  type: "private" | "group" | "channel"
  unreadCount: number
  forum?: boolean
  lastMessage?: Message
  threads?: Thread[]
}

export interface Message {
  id: number
  chatId: number
  senderName: string
  content: string
  timestamp: Date
  isOutgoing: boolean
  replyToMessageId?: number
  threadId?: number
  mediaType?: "photo" | "video" | "file" | "audio" | "voice" | "sticker" | "gif" | "location" | "poll" | "contact" | "unknown"
}

export interface ThemeColors {
  fg: string
  bg: string
  accent: string
  muted: string
  border: string
  success: string
  error: string
  warning: string
}
