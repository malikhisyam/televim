// src/app.tsx — Root App component: mode routing, global state, layout shell

import { useCallback, useEffect, useRef } from "react"
import { spawn } from "child_process"
import { MODES } from "./constants"
import { useStore } from "./state/store"
import { useTheme } from "./hooks/use-theme"
import { useTelegram } from "./hooks/use-telegram"
import { useVimMode } from "./hooks/use-vim-mode"
import { msgStoreKey } from "./lib/message-store"
import { loadCloakMode, saveCloakMode } from "./lib/config"

function openUrl(url: string): void {
  const platform = process.platform
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "start" : "xdg-open"
  const args = platform === "win32" ? ["", url] : [url]
  spawn(cmd, args, { shell: platform === "win32" || platform === "darwin" ? true : false, detached: true })
}

function copyToClipboard(text: string): void {
  const platform = process.platform
  const proc =
    platform === "win32"
      ? spawn("clip", [], { shell: false })
      : platform === "darwin"
        ? spawn("pbcopy", [], { shell: false })
        : spawn("xclip", ["-selection", "clipboard"], { shell: false })
  proc.stdin?.write(text)
  proc.stdin?.end()
}

function cleanupAndExit(code = 0) {
  // Leave alternate screen buffer, clear, show cursor, reset colors
  process.stdout.write("\x1b[?1049l\x1b[2J\x1b[H\x1b[?25h\x1b[0m")
  process.exit(code)
}

import ChatList from "./components/chat-list"
import ChatView from "./components/chat-view"
import StatusBar from "./components/status-bar"
import InputBar from "./components/input-bar"
import SearchOverlay from "./components/search-overlay"
import MessageSearchOverlay from "./components/message-search-overlay"
import MessageActionMenu from "./components/message-action-menu"
import ReactionMenu from "./components/reaction-menu"
import HelpOverlay from "./components/help-overlay"
import AuthScreen from "./components/auth-screen"

function LoadingScreen({ text }: { text: string }) {
  const theme = useStore((s) => s.theme)
  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.bg,
      }}
    >
      <text fg={theme.accent}>{text}</text>
    </box>
  )
}

function MainApp() {
  const { theme, cycleTheme } = useTheme()
  const telegram = useTelegram()
  const fetchingTopicsRef = useRef<Set<number>>(new Set())
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mode = useStore((s) => s.mode)
  const inputKey = useStore((s) => s.inputKey)

  // Load persisted cloak mode on mount
  useEffect(() => {
    const saved = loadCloakMode()
    if (saved) {
      useStore.getState().toggleCloakMode()
      telegram.setCloakMode(true)
    }
  }, [])

  const handleSendMessage = useCallback((text: string) => {
    const state = useStore.getState()
    const { activeChat, activeThreadId, bumpInputKey, replyToMessageId, setReplyToMessageId, editMessageId, setEditMessageId } = state
    if (!activeChat) return
    if (editMessageId) {
      void telegram.editMessage(activeChat.id, editMessageId, text)
      setEditMessageId(null)
    } else {
      void telegram.sendMessage(activeChat.id, text, activeThreadId ?? undefined, replyToMessageId ?? undefined).then(() => {
        if (state.cloakMode) {
          telegram.setCloakMode(true)
        }
      })
    }
    if (replyToMessageId) {
      setReplyToMessageId(null)
    }
    bumpInputKey()
  }, [telegram])

  const maybeMarkAsRead = useCallback((chatId: number, threadId?: number) => {
    const state = useStore.getState()
    if (!state.cloakMode) {
      void telegram.markAsRead(chatId, threadId)
      // Reset local unread count
      if (threadId) {
        state.resetThreadUnread(chatId, threadId)
      } else {
        state.resetChatUnread(chatId)
      }
    }
  }, [telegram])

  useVimMode({
    onOpenChat: useCallback((chatId: number, threadId?: number, targetMessageId?: number) => {
      const state = useStore.getState()
      const chat = state.chats.find((c) => c.id === chatId)
      if (!chat) return
      state.setActiveChat(chat)
      state.setActiveThreadId(threadId ?? null)
      state.setSelectedMessageIndex(0)
      maybeMarkAsRead(chat.id, threadId)
      const storeKey = `${chat.id}${threadId ? `:${threadId}` : ""}`
      void telegram.getMessages(chat.id, threadId, 50).then((msgs) => {
        const fresh = useStore.getState()
        if (msgs.length > 0) {
          fresh.setMessages({
            ...fresh.messages,
            [storeKey]: msgs,
          })
          if (targetMessageId) {
            const msgIndex = msgs.findIndex((m) => m.id === targetMessageId)
            if (msgIndex !== -1) {
              fresh.setSelectedMessageIndex(msgIndex)
              return
            }
          }
          // Start selection at the newest message (last in array, bottom of view)
          fresh.setSelectedMessageIndex(msgs.length - 1)
        }
      })
    }, [telegram, maybeMarkAsRead]),

    onExpandChat: useCallback((chatId: number) => {
      if (fetchingTopicsRef.current.has(chatId)) return
      fetchingTopicsRef.current.add(chatId)
      void telegram.getForumTopics(chatId).then((topics) => {
        fetchingTopicsRef.current.delete(chatId)
        if (topics.length === 0) return
        const state = useStore.getState()
        // Only apply if chat is still expanded (avoid race with rapid l/h)
        if (!state.expandedChatIds.has(chatId)) return

        // Merge new topics with existing threads, preserving local unread counts
        const existingChat = state.chats.find((c) => c.id === chatId)
        const existingThreads = existingChat?.threads ?? []
        const existingMap = new Map(existingThreads.map((t) => [t.id, t]))
        const mergedThreads = topics.map((t) => {
          const existing = existingMap.get(t.id)
          if (existing) {
            // Preserve our local unread count (it may have been zeroed by reading)
            return { ...t, unreadCount: existing.unreadCount }
          }
          return t
        })

        state.setChats(
          state.chats.map((c) =>
            c.id === chatId ? { ...c, threads: mergedThreads } : c,
          ),
        )
      })
    }, [telegram]),

    onNavigateMessage: useCallback((direction: "next" | "prev", count: number) => {
      const state = useStore.getState()
      const { activeChat, activeThreadId, messages, setSelectedMessageIndex, isLoadingOlderMessages, setLoadingOlderMessages, prependMessages } = state
      if (!activeChat) return

      const storeKey = msgStoreKey(activeChat.id, activeThreadId)
      const msgs = messages[storeKey] ?? []
      const currentIndex = state.selectedMessageIndex
      const target = currentIndex + (direction === "next" ? count : -count)

      // If we'd go near the top (target <= 2) and there are messages, try to load older ones
      if (target <= 2 && msgs.length > 0 && !isLoadingOlderMessages) {
        setLoadingOlderMessages(true)
        const oldestId = msgs[0]!.id
        void telegram.getOlderMessages(activeChat.id, oldestId, activeThreadId ?? undefined, 50).then((older) => {
          setLoadingOlderMessages(false)
          if (older.length > 0) {
            prependMessages(storeKey, older)
            // After prepending, adjust selection so we move in the requested direction
            const newIndex = Math.max(0, currentIndex + older.length + (direction === "next" ? count : -count))
            setSelectedMessageIndex(newIndex)
          } else {
            // No more older messages — clamp to the oldest available
            setSelectedMessageIndex(Math.max(0, target))
          }
        })
        return
      }

      setSelectedMessageIndex(Math.max(0, Math.min(msgs.length - 1, target)))
    }, [telegram]),

    onCopyMessage: useCallback(() => {
      const { activeChat, activeThreadId, messages, selectedMessageIndex } = useStore.getState()
      if (!activeChat) return
      const msg = messages[msgStoreKey(activeChat.id, activeThreadId)]?.[selectedMessageIndex]
      if (msg) {
        copyToClipboard(msg.content)
      }
    }, []),

    onDeleteMessage: useCallback(() => {
      const { activeChat, activeThreadId, messages, deleteMessage, setSelectedMessageIndex, selectedMessageIndex } = useStore.getState()
      if (!activeChat) return
      const msg = messages[msgStoreKey(activeChat.id, activeThreadId)]?.[selectedMessageIndex]
      if (msg) {
        void telegram.deleteMessages(activeChat.id, [msg.id])
        deleteMessage(msgStoreKey(activeChat.id, activeThreadId), selectedMessageIndex)
        setSelectedMessageIndex((prev) => Math.max(0, prev - 1))
      }
    }, [telegram]),

    onReplyMessage: useCallback(() => {
      const state = useStore.getState()
      const { activeChat, activeThreadId, messages, selectedMessageIndex, setReplyToMessageId } = state
      if (!activeChat) return
      const msg = messages[msgStoreKey(activeChat.id, activeThreadId)]?.[selectedMessageIndex]
      if (msg) {
        setReplyToMessageId(msg.id)
        state.setMode(MODES.INSERT)
      }
    }, []),

    onActionMenu: useCallback(() => {
      const state = useStore.getState()
      const index = state.messageActionMenuIndex
      const actions = ["reply", "copy", "forward", "pin", "edit", "delete", "react"] as const
      const action = actions[index]
      if (!action) return
      state.setMessageActionMenuVisible(false)
      state.setMessageActionMenuIndex(0)
      const { activeChat, activeThreadId } = state
      if (!activeChat) return
      const storeKey = msgStoreKey(activeChat.id, activeThreadId)
      if (action === "reply") {
        const { messages, selectedMessageIndex, setReplyToMessageId } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) {
          setReplyToMessageId(msg.id)
          state.setMode(MODES.INSERT)
        }
      } else if (action === "copy") {
        const { messages, selectedMessageIndex } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) copyToClipboard(msg.content)
      } else if (action === "delete") {
        const { messages, deleteMessage, setSelectedMessageIndex, selectedMessageIndex } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) {
          void telegram.deleteMessages(activeChat.id, [msg.id])
          deleteMessage(storeKey, selectedMessageIndex)
          setSelectedMessageIndex((prev) => Math.max(0, prev - 1))
        }
      } else if (action === "forward") {
        const { messages, selectedMessageIndex, setForwardMessageId } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) {
          setForwardMessageId(msg.id)
          state.setPaneFocus("sidebar")
        }
      } else if (action === "pin") {
        const { messages, selectedMessageIndex } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) {
          void telegram.pinMessage(activeChat.id, msg.id)
        }
      } else if (action === "edit") {
        const { messages, selectedMessageIndex, setEditMessageId } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) {
          setEditMessageId(msg.id)
          state.setMode(MODES.INSERT)
        }
      } else if (action === "react") {
        state.setReactionMenuVisible(true)
        state.setReactionMenuIndex(0)
      }
    }, [telegram]),

    onOpenLink: useCallback(() => {
      const { activeChat, activeThreadId, messages, selectedMessageIndex } = useStore.getState()
      if (!activeChat) return
      const msg = messages[msgStoreKey(activeChat.id, activeThreadId)]?.[selectedMessageIndex]
      if (!msg) return
      const isMedia = msg.mediaType && msg.mediaType !== "unknown"
      if (!isMedia || activeChat.type === "private") return
      const rawId = msg.chatId
      const positiveId = rawId < 0 ? rawId * -1 : rawId
      const url = `https://t.me/c/${positiveId}/${msg.id}`
      openUrl(url)
    }, []),

    onCommand: useCallback((command: string) => {
      console.log("command:", command)
      if (command === ":q") {
        void telegram.disconnect().then(() => cleanupAndExit(0))
        return
      } else if (command.startsWith(":join ")) {
        const channel = command.slice(5).trim()
        console.log("Joining channel:", channel)
      } else if (command === ":leave") {
        useStore.getState().setActiveChat(null)
      } else if (command === ":theme") {
        cycleTheme()
      } else if (command === ":cloak") {
        const state = useStore.getState()
        const nextCloak = !state.cloakMode
        state.toggleCloakMode()
        telegram.setCloakMode(nextCloak)
        saveCloakMode(nextCloak)
        // When turning cloak OFF, mark the currently viewed chat as read immediately
        if (!nextCloak && state.activeChat) {
          const { activeChat, activeThreadId } = state
          void telegram.markAsRead(activeChat.id, activeThreadId ?? undefined)
          if (activeThreadId) {
            state.resetThreadUnread(activeChat.id, activeThreadId)
          } else {
            state.resetChatUnread(activeChat.id)
          }
        }
      } else if (command === ":help") {
        useStore.getState().toggleHelp()
      } else if (command.startsWith(":privacy ")) {
        const level = command.slice(8).trim() as "nobody" | "contacts" | "anybody"
        if (["nobody", "contacts", "anybody"].includes(level)) {
          void telegram.setLastSeenPrivacy(level)
        }
      } else if (command.startsWith(":search ")) {
        const query = command.slice(7).trim()
        if (query) {
          const state = useStore.getState()
          const chat = state.activeChat
          if (chat) {
            void telegram.searchMessages(chat.id, query, 50).then((msgs) => {
              state.setMessageSearchResults(msgs)
              state.setMessageSearchVisible(true)
              state.setMessageSearchIndex(0)
            })
          }
        }
      } else if (command.startsWith(":searchglobal ")) {
        const query = command.slice(13).trim()
        if (query) {
          const state = useStore.getState()
          void telegram.searchMessagesGlobal(query, 50).then((results) => {
            // Map global results to local Message format with chatTitle in senderName
            const mapped = results.map((r) => ({
              ...r.message,
              senderName: `${r.chatTitle}: ${r.message.senderName}`,
            }))
            state.setMessageSearchResults(mapped)
            state.setMessageSearchVisible(true)
            state.setMessageSearchIndex(0)
          })
        }
      }
    }, [cycleTheme, telegram]),

    onSearch: useCallback((query: string) => {
      console.log("search:", query)
    }, []),

    onSearchGlobal: useCallback((query: string) => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      const state = useStore.getState()
      state.setMessageSearchLoading(true)
      searchTimeoutRef.current = setTimeout(() => {
        void telegram.searchMessagesGlobal(query, 50).then((results) => {
          const mapped = results.map((r) => ({
            ...r.message,
            senderName: `${r.chatTitle}: ${r.message.senderName}`,
          }))
          state.setMessageSearchResults(mapped)
          state.setMessageSearchIndex(0)
          state.setMessageSearchLoading(false)
        })
      }, 400)
    }, [telegram]),

    onReact: useCallback((emoticon: string) => {
      const state = useStore.getState()
      const { activeChat, activeThreadId, messages, selectedMessageIndex } = state
      if (!activeChat) return
      const storeKey = msgStoreKey(activeChat.id, activeThreadId)
      const msg = messages[storeKey]?.[selectedMessageIndex]
      if (msg) {
        void telegram.sendReaction(activeChat.id, msg.id, emoticon)
      }
    }, [telegram]),

    onForwardMessage: useCallback((toChatId: number, messageId: number) => {
      const state = useStore.getState()
      const fromChat = state.activeChat
      if (!fromChat) return
      void telegram.forwardMessage(fromChat.id, toChatId, messageId)
    }, [telegram]),

    onQuit: useCallback(async () => {
      await telegram.disconnect()
      cleanupAndExit(0)
    }, [telegram]),
  })

  const isInsert = mode === MODES.INSERT
  const isSearch = mode === MODES.SEARCH
  const isActionMenu = useStore((s) => s.messageActionMenuVisible)
  const isReactionMenu = useStore((s) => s.reactionMenuVisible)
  const isHelp = useStore((s) => s.helpVisible)
  const isMessageSearch = useStore((s) => s.messageSearchVisible)

  if (telegram.needsAuth || telegram.status === "error") {
    return <AuthScreen telegram={telegram} />
  }

  if (telegram.status === "connecting") {
    return <LoadingScreen text="Connecting to Telegram..." />
  }

  return (
    <box
      style={{
        flexDirection: "row",
        width: "100%",
        height: "100%",
        padding: 1,
        gap: 1,
        backgroundColor: theme.bg,
      }}
    >
      <ChatList />
      <box style={{ flexDirection: "column", flexGrow: 1, gap: 0 }}>
        <ChatView />
        {isInsert ? (
          <InputBar
            key={inputKey}
            onSendMessage={handleSendMessage}
            focused={true}
          />
        ) : (
          <StatusBar />
        )}
      </box>

      {isSearch ? <SearchOverlay /> : null}
      {isMessageSearch ? <MessageSearchOverlay /> : null}
      {isHelp ? <HelpOverlay /> : null}
      {isActionMenu ? <MessageActionMenu /> : null}
      {isReactionMenu ? <ReactionMenu onSelect={() => {}} /> : null}
    </box>
  )
}

export default function App() {
  return <MainApp />
}
