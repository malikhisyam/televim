// src/state/actions.ts — Convenience action creators & selectors

import { useStore } from "./store"
import { msgStoreKey } from "../lib/message-store"

/** Hook to get the current theme colors */
export function useThemeColors() {
  return useStore((state) => state.theme)
}

/** Hook to get the current mode */
export function useVimModeState() {
  return useStore((state) => state.mode)
}

/** Hook to check if a chat is active */
export function useIsChatActive(chatId: number): boolean {
  return useStore((state) => state.activeChat?.id === chatId)
}

/** Get active messages as a memoized derived value */
export function useActiveMessages() {
  const activeChat = useStore((state) => state.activeChat)
  const activeThreadId = useStore((state) => state.activeThreadId)
  const messages = useStore((state) => state.messages)
  if (!activeChat) return []
  return messages[msgStoreKey(activeChat.id, activeThreadId)] ?? []
}
