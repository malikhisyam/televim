// src/hooks/use-vim-mode.ts — Core Vim mode finite-state machine (reads store imperatively)

import { useCallback, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import { MODES } from "../constants"
import { useStore } from "../state/store"
import { fuzzyFilter } from "../lib/fuzzy-search"
import { getVisibleItems } from "../lib/chat-list-utils"
import { parseKey, resetKeymapState, createKeymapState } from "../lib/keymap-engine"

export interface UseVimModeOptions {
  /** Open the currently selected chat (or thread), optionally jumping to a specific message */
  onOpenChat?: (chatId: number, threadId?: number, targetMessageId?: number) => void
  /** A group was expanded (fetch threads here) */
  onExpandChat?: (chatId: number) => void
  /** Navigate messages up / down; count defaults to 1 */
  onNavigateMessage?: (direction: "next" | "prev", count: number) => void
  /** Copy (yank) the selected message */
  onCopyMessage?: () => void
  /** Delete the selected message (local only) */
  onDeleteMessage?: () => void
  /** Start replying to the selected message */
  onReplyMessage?: () => void
  /** Open the selected message's media link in browser */
  onOpenLink?: () => void
  /** Message action menu was opened */
  onActionMenu?: () => void
  /** React to the selected message with an emoticon */
  onReact?: (emoticon: string) => void
  /** Forward the selected message to a target chat */
  onForwardMessage?: (toChatId: number, messageId: number) => void
  /** Execute a colon command (string includes the colon) */
  onCommand?: (command: string) => void
  /** Execute a search query */
  onSearch?: (query: string) => void
  /** Execute a global search query */
  onSearchGlobal?: (query: string) => void
  /** Quit the application */
  onQuit?: () => void | Promise<void>
}

/**
 * useVimMode — Vim modal FSM for TeleVim.
 *
 * Uses useStore.getState() inside the keyboard handler to avoid creating
 * subscriptions that could trigger re-render loops with useKeyboard.
 */
export function useVimMode(options: UseVimModeOptions = {}) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const keymapRef = useRef(createKeymapState())

  useKeyboard(
    useCallback(async (key) => {
      const state = useStore.getState()
      const opts = optionsRef.current

      // Normalize shifted single-letter keys so Shift+g → "G"
      const keyName =
        key.shift && /^[a-z]$/.test(key.name)
          ? key.name.toUpperCase()
          : key.name

      // Helper to consume a key and stop it from bubbling to scrollbox/input
      const consume = (): void => {
        key.stopPropagation()
      }

      // ── Message action menu overlay ──
      if (state.messageActionMenuVisible) {
        const actionCount = 7
        if (keyName === "j" || keyName === "down") {
          consume()
          state.setMessageActionMenuIndex((prev) => Math.min(actionCount - 1, prev + 1))
          return
        }
        if (keyName === "k" || keyName === "up") {
          consume()
          state.setMessageActionMenuIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (keyName === "return") {
          consume()
          opts.onActionMenu?.()
          return
        }
        // Quick shortcut: press the action letter directly
        const shortcutMap: Record<string, number> = {
          r: 0, y: 1, f: 2, p: 3, e: 4, d: 5, t: 6,
        }
        const shortcutIndex = shortcutMap[keyName]
        if (shortcutIndex !== undefined) {
          consume()
          state.setMessageActionMenuIndex(shortcutIndex)
          opts.onActionMenu?.()
          return
        }
        // Any other key (including Escape) closes the menu
        consume()
        state.setMessageActionMenuVisible(false)
        state.setMessageActionMenuIndex(0)
        // Keep focus on messages pane when closing action menu
        state.setPaneFocus("messages")
        return
      }

      // ── Reaction menu overlay ──
      if (state.reactionMenuVisible) {
        const REACTIONS = ["❤️", "👍", "👎", "🔥", "🥰", "👋", "😂"]
        const reactionCount = REACTIONS.length
        if (keyName === "j" || keyName === "down") {
          consume()
          state.setReactionMenuIndex((prev) => Math.min(reactionCount - 1, prev + 1))
          return
        }
        if (keyName === "k" || keyName === "up") {
          consume()
          state.setReactionMenuIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (keyName === "return") {
          consume()
          const emoticon = REACTIONS[state.reactionMenuIndex]
          if (emoticon) {
            opts.onReact?.(emoticon)
          }
          state.setReactionMenuVisible(false)
          state.setReactionMenuIndex(0)
          return
        }
        if (keyName === "escape") {
          consume()
          state.setReactionMenuVisible(false)
          state.setReactionMenuIndex(0)
          state.setPaneFocus("messages")
          return
        }
        return
      }

      // ── Help overlay ──
      if (state.helpVisible) {
        consume()
        if (keyName === "escape" || keyName === "?") {
          state.toggleHelp()
        }
        return
      }

      // ── Message search overlay ──
      if (state.messageSearchVisible) {
        const results = state.messageSearchResults
        const maxIndex = Math.max(0, results.length - 1)
        if (keyName === "return") {
          consume()
          if (state.messageSearchGlobal) {
            // Global search: execute on return if results aren't loaded yet
            if (results.length === 0) {
              opts.onSearchGlobal?.(state.messageSearchQuery)
            } else {
              const selected = results[state.messageSearchIndex]
              if (selected) {
                // For global search, switch to the chat containing the message
                const targetChat = state.chats.find((c) => c.id === selected.chatId)
                if (targetChat) {
                  state.setActiveChat(targetChat)
                  state.setActiveThreadId(null)
                  state.setPaneFocus("messages")
                  opts.onOpenChat?.(selected.chatId, undefined, selected.id)
                }
              }
              state.setMessageSearchVisible(false)
              state.setMessageSearchIndex(0)
              state.setMessageSearchQuery("")
              state.setMessageSearchGlobal(false)
            }
            return
          }
          const selected = results[state.messageSearchIndex]
          if (selected) {
            const storeKey = `${state.activeChat?.id}${state.activeThreadId ? `:${state.activeThreadId}` : ""}`
            const msgs = state.messages[storeKey] ?? []
            const msgIndex = msgs.findIndex((m) => m.id === selected.id)
            if (msgIndex !== -1) {
              state.setSelectedMessageIndex(msgIndex)
            }
          }
          state.setMessageSearchVisible(false)
          state.setMessageSearchIndex(0)
          state.setMessageSearchQuery("")
          return
        }
        if (keyName === "backspace") {
          consume()
          state.updateMessageSearchQuery((prev) => {
            const next = prev.slice(0, -1)
            if (!state.messageSearchGlobal) {
              // Local search: re-filter results as query changes
              const storeKey = `${state.activeChat?.id}${state.activeThreadId ? `:${state.activeThreadId}` : ""}`
              const allMessages = state.messages[storeKey] ?? []
              const filtered = next.trim() === ""
                ? []
                : allMessages.filter((m) =>
                    m.content.toLowerCase().includes(next.toLowerCase()) ||
                    m.senderName.toLowerCase().includes(next.toLowerCase()),
                  )
              state.setMessageSearchResults(filtered)
              if (state.messageSearchIndex >= filtered.length) {
                state.setMessageSearchIndex(0)
              }
            } else if (next.trim().length > 0) {
              opts.onSearchGlobal?.(next)
            }
            return next
          })
          return
        }
        if (keyName === "escape") {
          consume()
          state.setMessageSearchVisible(false)
          state.setMessageSearchIndex(0)
          state.setMessageSearchQuery("")
          state.setMessageSearchResults([])
          state.setMessageSearchGlobal(false)
          return
        }
        // Tab / Shift+Tab navigate results
        if (keyName === "tab") {
          if (results.length > 0) {
            consume()
            if (key.shift) {
              state.setMessageSearchIndex((prev) => Math.max(0, prev - 1))
            } else {
              state.setMessageSearchIndex((prev) => Math.min(maxIndex, prev + 1))
            }
          }
          return
        }
        // Type any printable character into the search query
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta
        ) {
          consume()
          state.updateMessageSearchQuery((prev) => {
            const next = prev + key.sequence
            if (!state.messageSearchGlobal) {
              // Local search: re-filter results as query changes
              const storeKey = `${state.activeChat?.id}${state.activeThreadId ? `:${state.activeThreadId}` : ""}`
              const allMessages = state.messages[storeKey] ?? []
              const filtered = next.trim() === ""
                ? []
                : allMessages.filter((m) =>
                    m.content.toLowerCase().includes(next.toLowerCase()) ||
                    m.senderName.toLowerCase().includes(next.toLowerCase()),
                  )
              state.setMessageSearchResults(filtered)
              if (state.messageSearchIndex >= filtered.length) {
                state.setMessageSearchIndex(0)
              }
            } else if (next.trim().length > 0) {
              // Global search: debounced API call via app.tsx
              opts.onSearchGlobal?.(next)
            }
            return next
          })
          return
        }
        // Unhandled keys are ignored
        return
      }

      // ── GLOBAL: Escape always returns to Normal + sidebar focus ──
      if (keyName === "escape") {
        consume()
        if (state.forwardMessageId) {
          state.setForwardMessageId(null)
          state.setPaneFocus("messages")
          return
        }
        state.setPaneFocus("sidebar")
        state.resetToNormal()
        return
      }

      // ── INSERT mode ──
      if (state.mode === MODES.INSERT) {
        // Only intercept Escape; let all other keys pass to the focused input
        if (keyName === "escape") {
          consume()
          state.resetToNormal()
        }
        return
      }

      // ── VISUAL mode ──
      if (state.mode === MODES.VISUAL) {
        consume()
        if (keyName === "j" || keyName === "down") {
          opts.onNavigateMessage?.("next", 1)
        } else if (keyName === "k" || keyName === "up") {
          opts.onNavigateMessage?.("prev", 1)
        } else if (keyName === "y") {
          opts.onCopyMessage?.()
          state.resetToNormal()
        } else if (keyName === "d") {
          opts.onDeleteMessage?.()
          state.resetToNormal()
        }
        return
      }

      // ── COMMAND mode ──
      if (state.mode === MODES.COMMAND) {
        consume()
        if (keyName === "return") {
          const cmd = state.commandBuffer
          state.resetToNormal()
          opts.onCommand?.(cmd)
        } else if (keyName === "backspace") {
          state.updateCommandBuffer((prev) => {
            const next = prev.slice(0, -1)
            if (next === "" || next === ":") {
              state.resetToNormal()
              return ""
            }
            return next
          })
        } else if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta
        ) {
          state.updateCommandBuffer((prev) => prev + key.sequence)
        }
        return
      }

      // ── SEARCH mode ──
      if (state.mode === MODES.SEARCH) {
        const results = state.searchResults
        const maxResultIndex = Math.max(0, results.length - 1)

        if (keyName === "down") {
          consume()
          state.setSelectedSearchIndex((prev) =>
            Math.min(maxResultIndex, prev + 1),
          )
          return
        }
        if (keyName === "up") {
          consume()
          state.setSelectedSearchIndex((prev) => Math.max(0, prev - 1))
          return
        }
        if (keyName === "return") {
          consume()
          const selected = results[state.selectedSearchIndex]
          state.resetToNormal()
          if (selected) {
            // Also sync sidebar selection so j/k in sidebar land on the right chat
            const visible = getVisibleItems(state.chats, state.expandedChatIds)
            const sidebarIndex = visible.findIndex(
              (item) => item.type === "chat" && item.chat.id === selected.id,
            )
            if (sidebarIndex !== -1) {
              state.setSelectedListIndex(sidebarIndex)
            }
            state.setPaneFocus("messages")
            opts.onOpenChat?.(selected.id)
          } else {
            opts.onSearch?.(state.searchQuery)
          }
          return
        }
        if (keyName === "backspace") {
          consume()
          state.updateSearchQuery((prev) => {
            const next = prev.slice(0, -1)
            if (next === "") {
              state.resetToNormal()
              return ""
            }
            return next
          })
          return
        }
        if (
          key.sequence &&
          key.sequence.length === 1 &&
          !key.ctrl &&
          !key.meta
        ) {
          consume()
          state.updateSearchQuery((prev) => prev + key.sequence)
          // Live fuzzy update
          const newQuery = state.searchQuery + (key.sequence ?? "")
          const newResults = fuzzyFilter(state.chats, newQuery, (c) => c.title)
          state.setSearchResults(newResults.map((r) => r.item))
          // Reset selection to top on query change
          state.setSelectedSearchIndex(0)
          return
        }
        // Unhandled keys in search mode: let them pass through (e.g. arrow keys)
        return
      }

      // ── NORMAL mode ──
      if (state.mode !== MODES.NORMAL) return

      // Mode switches
      if (keyName === "i") {
        consume()
        state.setMode(MODES.INSERT)
        return
      }
      if (keyName === "v") {
        consume()
        state.setMode(MODES.VISUAL)
        return
      }
      if (keyName === ":") {
        consume()
        state.setMode(MODES.COMMAND)
        state.setCommandBuffer(":")
        return
      }
      if (keyName === "/") {
        consume()
        state.setMode(MODES.SEARCH)
        state.setSearchQuery("")
        state.setSearchResults([])
        state.setSelectedSearchIndex(0)
        return
      }
      if (keyName === "?") {
        consume()
        state.toggleHelp()
        return
      }
      if (keyName === "s") {
        consume()
        state.setMessageSearchVisible(true)
        state.setMessageSearchGlobal(false)
        state.setMessageSearchQuery("")
        state.setMessageSearchResults([])
        state.setMessageSearchIndex(0)
        return
      }
      if (keyName === "S") {
        consume()
        state.setMessageSearchVisible(true)
        state.setMessageSearchGlobal(true)
        state.setMessageSearchQuery("")
        state.setMessageSearchResults([])
        state.setMessageSearchIndex(0)
        return
      }

      // ── Keymap engine integration (counts + multi-key motions) ──
      const hasEngineState =
        keymapRef.current.countBuffer !== "" ||
        keymapRef.current.pendingMotion !== null
      const isEngineKey = /^[0-9]$/.test(keyName) || keyName === "g" || keyName === "G"

      if (hasEngineState || isEngineKey) {
        const km = parseKey(keyName, keymapRef.current)

        // Accumulating count or waiting for motion completion
        if (km.type === "count" || km.type === "pending") {
          consume()
          return
        }

        if (km.type === "motion") {
          const count = km.count
          const motion = km.motion
          consume()

          if (state.paneFocus === "sidebar") {
            const visible = getVisibleItems(state.chats, state.expandedChatIds)
            const maxIndex = Math.max(0, visible.length - 1)

            if (motion === "gg") {
              state.setSelectedListIndex(0)
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "G") {
              state.setSelectedListIndex(maxIndex)
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "j" || motion === "down") {
              state.setSelectedListIndex((prev) =>
                Math.min(maxIndex, prev + count),
              )
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "k" || motion === "up") {
              state.setSelectedListIndex((prev) => Math.max(0, prev - count))
              resetKeymapState(keymapRef.current)
              return
            }
          }

          if (state.paneFocus === "messages") {
            if (motion === "gg") {
              state.setSelectedMessageIndex(0)
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "G") {
              const msgs = state.activeChat
                ? state.messages[`${state.activeChat.id}${state.activeThreadId ? `:` + state.activeThreadId : ""}`] ?? []
                : []
              state.setSelectedMessageIndex(Math.max(0, msgs.length - 1))
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "j" || motion === "down") {
              opts.onNavigateMessage?.("next", count)
              resetKeymapState(keymapRef.current)
              return
            }
            if (motion === "k" || motion === "up") {
              opts.onNavigateMessage?.("prev", count)
              resetKeymapState(keymapRef.current)
              return
            }
          }
        }

        // Any other engine result we don't handle: reset and fall through
        resetKeymapState(keymapRef.current)
      }

      // ── Sidebar pane ──
      if (state.paneFocus === "sidebar") {
        const visible = getVisibleItems(state.chats, state.expandedChatIds)
        const maxIndex = Math.max(0, visible.length - 1)

        if (keyName === "j" || keyName === "down") {
          consume()
          state.setSelectedListIndex((prev) => Math.min(maxIndex, prev + 1))
          return
        }
        if (keyName === "k" || keyName === "up") {
          consume()
          state.setSelectedListIndex((prev) => Math.max(0, prev - 1))
          return
        }

        // Expand / collapse groups (only channels/supergroups can have threads)
        if (keyName === "l") {
          consume()
          const item = visible[state.selectedListIndex]
          if (item?.type === "chat" && item.chat.type === "channel" && item.chat.forum) {
            const wasExpanded = state.expandedChatIds.has(item.chat.id)
            if (!wasExpanded) {
              state.expandChat(item.chat.id)
              opts.onExpandChat?.(item.chat.id)
            }
          }
          return
        }
        if (keyName === "h") {
          consume()
          const item = visible[state.selectedListIndex]
          if (item?.type === "chat" && item.chat.type === "channel" && item.chat.forum && state.expandedChatIds.has(item.chat.id)) {
            state.collapseChat(item.chat.id)
            // Keep threads in state — getVisibleItems won't render them while collapsed,
            // so re-expansion is instant with no flicker
          }
          return
        }

        // Open chat / thread → switch focus to messages
        if (keyName === "return") {
          consume()
          const item = visible[state.selectedListIndex]
          if (!item) return

          // Forward mode: if a message is queued for forwarding, forward it instead of opening
          if (state.forwardMessageId && item.type === "chat") {
            opts.onForwardMessage?.(item.chat.id, state.forwardMessageId)
            state.setForwardMessageId(null)
            state.setPaneFocus("messages")
            return
          }

          if (item.type === "chat") {
            const chat = item.chat
            if (chat.type === "channel" && chat.forum && !state.expandedChatIds.has(chat.id)) {
              // Forum channel not yet expanded: expand it to show threads
              state.toggleExpandedChat(chat.id)
              opts.onExpandChat?.(chat.id)
            } else {
              // Private chat, basic group, or already-expanded channel: open it
              state.setActiveChat(chat)
              state.setActiveThreadId(null)
              state.setSelectedMessageIndex(0)
              state.setPaneFocus("messages")
              opts.onOpenChat?.(chat.id)
            }
          } else {
            // Thread selected
            state.setActiveChat(item.chat)
            state.setActiveThreadId(item.thread.id)
            state.setSelectedMessageIndex(0)
            state.setPaneFocus("messages")
            opts.onOpenChat?.(item.chat.id, item.thread.id)
          }
          return
        }
      }

      // ── Messages pane ──
      if (state.paneFocus === "messages") {
        if (keyName === "j" || keyName === "down") {
          consume()
          opts.onNavigateMessage?.("next", 1)
          return
        }
        if (keyName === "k" || keyName === "up") {
          consume()
          opts.onNavigateMessage?.("prev", 1)
          return
        }

        // Open action menu
        if (keyName === "a") {
          consume()
          state.setMessageActionMenuVisible(true)
          state.setMessageActionMenuIndex(0)
          return
        }

        // Quick single-stroke operators (also available in action menu)
        if (keyName === "y") {
          consume()
          opts.onCopyMessage?.()
          return
        }
        if (keyName === "d") {
          consume()
          opts.onDeleteMessage?.()
          return
        }
        if (keyName === "r") {
          consume()
          opts.onReplyMessage?.()
          return
        }
        if (keyName === "o") {
          consume()
          opts.onOpenLink?.()
          return
        }
      }

      if (keyName === "q") {
        consume()
        await opts.onQuit?.()
        return
      }
    }, []),
  )

  // Return the mode so App can derive conditional UI
  const currentMode = useStore((s) => s.mode)
  const commandBuffer = useStore((s) => s.commandBuffer)
  const searchQuery = useStore((s) => s.searchQuery)

  return {
    mode: currentMode,
    commandBuffer,
    searchQuery,
  }
}
