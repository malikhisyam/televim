// src/lib/chat-list-utils.ts — Flat visible list computation for expandable groups

import type { Chat, Thread } from "../types"

export interface ListChatItem {
  type: "chat"
  chat: Chat
  depth: number
}

export interface ListThreadItem {
  type: "thread"
  chat: Chat
  thread: Thread
  depth: number
}

export type ListItem = ListChatItem | ListThreadItem

/**
 * Build a flat list of visible items from the chat tree.
 * Private chats are always visible leaf items.
 * Groups/channels show their threads when expanded.
 */
export function getVisibleItems(
  chats: Chat[],
  expandedChatIds: Set<number>,
): ListItem[] {
  const items: ListItem[] = []
  for (const chat of chats) {
    items.push({ type: "chat", chat, depth: 0 })
    if (expandedChatIds.has(chat.id) && chat.threads && chat.threads.length > 0) {
      for (const thread of chat.threads) {
        items.push({ type: "thread", chat, thread, depth: 1 })
      }
    }
  }
  return items
}
