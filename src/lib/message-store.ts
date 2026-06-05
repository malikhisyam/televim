// src/lib/message-store.ts — Message storage key helpers

/**
 * Build a store key for messages. Normal chats use "chatId",
 * forum threads use "chatId:threadId" to keep thread messages separate.
 */
export function msgStoreKey(chatId: number, threadId?: number | null): string {
  return threadId ? `${chatId}:${threadId}` : `${chatId}`
}
