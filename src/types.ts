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
  isForwarded?: boolean
  forwardFromName?: string
  mediaType?: "photo" | "video" | "file" | "audio" | "voice" | "sticker" | "gif" | "location" | "poll" | "contact" | "unknown"
  mediaSize?: number // bytes
  entities?: MessageEntity[]
}

export interface MessageEntity {
  type: "bold" | "italic" | "code" | "pre" | "strikethrough" | "underline" | "url" | "text_link"
  offset: number
  length: number
  url?: string
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
