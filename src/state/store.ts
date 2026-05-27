// src/state/store.ts — Lightweight global state (Zustand)

import { create } from "zustand"
import type { Chat, Message, ThemeColors, VimMode } from "../types"
import { DEFAULT_THEME } from "../constants"

export type PaneFocus = "sidebar" | "messages"

export interface TeleVimState {
  // Mode
  mode: VimMode
  setMode: (mode: VimMode) => void

  // Pane focus (sidebar = guild list, messages = chat view)
  paneFocus: PaneFocus
  setPaneFocus: (focus: PaneFocus) => void

  // Chat list
  chats: Chat[]
  setChats: (chats: Chat[]) => void

  // Flat list selection (chats + visible threads)
  selectedListIndex: number
  setSelectedListIndex: (index: number | ((prev: number) => number)) => void

  // Expanded groups
  expandedChatIds: Set<number>
  toggleExpandedChat: (id: number) => void
  expandChat: (id: number) => void
  collapseChat: (id: number) => void

  // Active chat & thread
  activeChat: Chat | null
  setActiveChat: (chat: Chat | null) => void
  activeThreadId: number | null
  setActiveThreadId: (id: number | null) => void

  messages: Record<string, Message[]>
  setMessages: (messages: Record<string, Message[]>) => void
  addMessage: (storeKey: string, message: Message) => void
  prependMessages: (storeKey: string, messages: Message[]) => void
  deleteMessage: (storeKey: string, messageIndex: number) => void

  // Pagination
  isLoadingOlderMessages: boolean
  setLoadingOlderMessages: (loading: boolean) => void

  // Message selection
  selectedMessageIndex: number
  setSelectedMessageIndex: (index: number | ((prev: number) => number)) => void

  // Message action menu
  messageActionMenuVisible: boolean
  setMessageActionMenuVisible: (visible: boolean) => void
  messageActionMenuIndex: number
  setMessageActionMenuIndex: (index: number | ((prev: number) => number)) => void

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
  updateSearchQuery: (fn: (prev: string) => string) => void
  searchResults: Chat[]
  setSearchResults: (results: Chat[]) => void
  selectedSearchIndex: number
  setSelectedSearchIndex: (index: number | ((prev: number) => number)) => void

  // Command buffer
  commandBuffer: string
  setCommandBuffer: (buffer: string) => void
  updateCommandBuffer: (fn: (prev: string) => string) => void

  // Theme
  theme: ThemeColors
  setTheme: (theme: ThemeColors) => void

  // Input key (force remount input bar)
  inputKey: number
  bumpInputKey: () => void

  // Help overlay
  helpVisible: boolean
  toggleHelp: () => void

  // Reset helpers
  resetToNormal: () => void
}

export const useStore = create<TeleVimState>((set, get) => ({
  mode: "normal",
  setMode: (mode) => set({ mode }),

  paneFocus: "sidebar",
  setPaneFocus: (paneFocus) => set({ paneFocus }),

  chats: [],
  setChats: (chats) => set({ chats }),

  selectedListIndex: 0,
  setSelectedListIndex: (index) =>
    set((state) => ({
      selectedListIndex:
        typeof index === "function" ? index(state.selectedListIndex) : index,
    })),

  expandedChatIds: new Set(),
  toggleExpandedChat: (id) =>
    set((state) => {
      const next = new Set(state.expandedChatIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedChatIds: next }
    }),
  expandChat: (id) =>
    set((state) => {
      const next = new Set(state.expandedChatIds)
      next.add(id)
      return { expandedChatIds: next }
    }),
  collapseChat: (id) =>
    set((state) => {
      const next = new Set(state.expandedChatIds)
      next.delete(id)
      return { expandedChatIds: next }
    }),

  activeChat: null,
  setActiveChat: (activeChat) => set({ activeChat }),
  activeThreadId: null,
  setActiveThreadId: (id) => set({ activeThreadId: id }),

  messages: {},
  setMessages: (messages) => set({ messages }),

  addMessage: (storeKey, message) =>
    set((state) => ({
      // Append so newest messages are at the end (bottom of chat view)
      messages: {
        ...state.messages,
        [storeKey]: [...(state.messages[storeKey] ?? []), message],
      },
    })),

  prependMessages: (storeKey, newMessages) =>
    set((state) => {
      const existing = state.messages[storeKey] ?? []
      // Deduplicate by message id
      const existingIds = new Set(existing.map((m) => m.id))
      const unique = newMessages.filter((m) => !existingIds.has(m.id))
      return {
        messages: {
          ...state.messages,
          [storeKey]: [...unique, ...existing],
        },
      }
    }),

  deleteMessage: (storeKey, messageIndex) =>
    set((state) => {
      const chatMessages = [...(state.messages[storeKey] ?? [])]
      chatMessages.splice(messageIndex, 1)
      return {
        messages: { ...state.messages, [storeKey]: chatMessages },
      }
    }),

  selectedMessageIndex: 0,
  setSelectedMessageIndex: (index) =>
    set((state) => ({
      selectedMessageIndex:
        typeof index === "function"
          ? index(state.selectedMessageIndex)
          : index,
    })),

  messageActionMenuVisible: false,
  setMessageActionMenuVisible: (visible) => set({ messageActionMenuVisible: visible }),
  messageActionMenuIndex: 0,
  setMessageActionMenuIndex: (index) =>
    set((state) => ({
      messageActionMenuIndex:
        typeof index === "function"
          ? index(state.messageActionMenuIndex)
          : index,
    })),

  searchQuery: "",
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  updateSearchQuery: (fn) =>
    set((state) => ({ searchQuery: fn(state.searchQuery) })),

  searchResults: [],
  setSearchResults: (searchResults) => set({ searchResults }),

  selectedSearchIndex: 0,
  setSelectedSearchIndex: (index) =>
    set((state) => ({
      selectedSearchIndex:
        typeof index === "function"
          ? index(state.selectedSearchIndex)
          : index,
    })),

  commandBuffer: "",
  setCommandBuffer: (buffer) => set({ commandBuffer: buffer }),
  updateCommandBuffer: (fn) =>
    set((state) => ({ commandBuffer: fn(state.commandBuffer) })),

  theme: DEFAULT_THEME,
  setTheme: (theme) => set({ theme }),

  inputKey: 0,
  bumpInputKey: () => set((state) => ({ inputKey: state.inputKey + 1 })),

  helpVisible: false,
  toggleHelp: () => set((state) => ({ helpVisible: !state.helpVisible })),

  isLoadingOlderMessages: false,
  setLoadingOlderMessages: (isLoadingOlderMessages) => set({ isLoadingOlderMessages }),

  resetToNormal: () =>
    set({
      mode: "normal",
      commandBuffer: "",
      searchQuery: "",
    }),
}))
