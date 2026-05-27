// src/app.tsx — Root App component: mode routing, global state, layout shell

import { useCallback, useRef } from "react"
import { MODES } from "./constants"
import { useStore } from "./state/store"
import { useTheme } from "./hooks/use-theme"
import { useTelegram } from "./hooks/use-telegram"
import { useVimMode } from "./hooks/use-vim-mode"
import { msgStoreKey } from "./lib/message-store"
import ChatList from "./components/chat-list"
import ChatView from "./components/chat-view"
import StatusBar from "./components/status-bar"
import InputBar from "./components/input-bar"
import SearchOverlay from "./components/search-overlay"
import MessageActionMenu from "./components/message-action-menu"
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

  const mode = useStore((s) => s.mode)
  const inputKey = useStore((s) => s.inputKey)

  const handleSendMessage = useCallback((text: string) => {
    const state = useStore.getState()
    const { activeChat, activeThreadId, bumpInputKey } = state
    if (!activeChat) return
    void telegram.sendMessage(activeChat.id, text, activeThreadId ?? undefined)
    bumpInputKey()
  }, [telegram])

  useVimMode({
    onOpenChat: useCallback((chatId: number, threadId?: number) => {
      const state = useStore.getState()
      const chat = state.chats.find((c) => c.id === chatId)
      if (!chat) return
      state.setActiveChat(chat)
      state.setActiveThreadId(threadId ?? null)
      state.setSelectedMessageIndex(0)
      const storeKey = `${chat.id}${threadId ? `:${threadId}` : ""}`
      void telegram.getMessages(chat.id, threadId, 50).then((msgs) => {
        if (msgs.length > 0) {
          const fresh = useStore.getState()
          fresh.setMessages({
            ...fresh.messages,
            [storeKey]: msgs,
          })
          // Start selection at the newest message (last in array, bottom of view)
          fresh.setSelectedMessageIndex(msgs.length - 1)
        }
      })
    }, [telegram]),

    onExpandChat: useCallback((chatId: number) => {
      if (fetchingTopicsRef.current.has(chatId)) return
      fetchingTopicsRef.current.add(chatId)
      void telegram.getForumTopics(chatId).then((topics) => {
        fetchingTopicsRef.current.delete(chatId)
        if (topics.length === 0) return
        const state = useStore.getState()
        // Only apply if chat is still expanded (avoid race with rapid l/h)
        if (!state.expandedChatIds.has(chatId)) return
        state.setChats(
          state.chats.map((c) =>
            c.id === chatId ? { ...c, threads: topics } : c,
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
        console.log("Copied:", msg.content)
      }
    }, []),

    onDeleteMessage: useCallback(() => {
      const { activeChat, activeThreadId, deleteMessage, setSelectedMessageIndex, selectedMessageIndex } = useStore.getState()
      if (!activeChat) return
      deleteMessage(msgStoreKey(activeChat.id, activeThreadId), selectedMessageIndex)
      setSelectedMessageIndex((prev) => Math.max(0, prev - 1))
    }, []),

    onReplyMessage: useCallback(() => {
      const { activeChat, activeThreadId, messages, selectedMessageIndex } = useStore.getState()
      if (!activeChat) return
      const msg = messages[msgStoreKey(activeChat.id, activeThreadId)]?.[selectedMessageIndex]
      if (msg) {
        console.log("Replying to:", msg.content)
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
        const { messages, selectedMessageIndex } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) console.log("Replying to:", msg.content)
      } else if (action === "copy") {
        const { messages, selectedMessageIndex } = state
        const msg = messages[storeKey]?.[selectedMessageIndex]
        if (msg) console.log("Copied:", msg.content)
      } else if (action === "delete") {
        const { deleteMessage, selectedMessageIndex } = state
        deleteMessage(storeKey, selectedMessageIndex)
        state.setSelectedMessageIndex((prev) => Math.max(0, prev - 1))
      } else {
        console.log("Action not implemented:", action)
      }
    }, []),

    onCommand: useCallback((command: string) => {
      console.log("command:", command)
      if (command === ":q") {
        process.exit(0)
      } else if (command.startsWith(":join ")) {
        const channel = command.slice(5).trim()
        console.log("Joining channel:", channel)
      } else if (command === ":leave") {
        useStore.getState().setActiveChat(null)
      } else if (command === ":theme") {
        cycleTheme()
      }
    }, []),

    onSearch: useCallback((query: string) => {
      console.log("search:", query)
    }, []),

    onQuit: useCallback(() => {
      process.exit(0)
    }, []),
  })

  const isInsert = mode === MODES.INSERT
  const isSearch = mode === MODES.SEARCH
  const isActionMenu = useStore((s) => s.messageActionMenuVisible)

  if (telegram.needsAuth || telegram.status === "error") {
    return <AuthScreen telegram={telegram} />
  }

  if (telegram.status === "connecting") {
    return <LoadingScreen text="Connecting to Telegram..." />
  }

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        backgroundColor: theme.bg,
      }}
    >
      <box style={{ flexDirection: "row", flexGrow: 1, height: "100%" }}>
        <ChatList />
        <ChatView />
      </box>

      {isInsert ? (
        <InputBar
          key={inputKey}
          onSendMessage={handleSendMessage}
          focused={true}
        />
      ) : null}

      <StatusBar />
      {isSearch ? <SearchOverlay /> : null}
      {isActionMenu ? <MessageActionMenu onAction={(action) => {
        console.log("Action:", action)
        const state = useStore.getState()
        state.setMessageActionMenuVisible(false)
        state.setMessageActionMenuIndex(0)
        const { activeChat, activeThreadId } = state
        if (!activeChat) return
        const storeKey = msgStoreKey(activeChat.id, activeThreadId)
        if (action === "reply") {
          console.log("Replying to message")
        } else if (action === "copy") {
          const { messages, selectedMessageIndex } = state
          const msg = messages[storeKey]?.[selectedMessageIndex]
          if (msg) console.log("Copied:", msg.content)
        } else if (action === "delete") {
          const { deleteMessage, selectedMessageIndex } = state
          deleteMessage(storeKey, selectedMessageIndex)
          state.setSelectedMessageIndex((prev) => Math.max(0, prev - 1))
        } else if (action === "forward") {
          console.log("Forward not implemented yet")
        } else if (action === "pin") {
          console.log("Pin not implemented yet")
        } else if (action === "edit") {
          console.log("Edit not implemented yet")
        } else if (action === "react") {
          console.log("React not implemented yet")
        }
      }} /> : null}
    </box>
  )
}

export default function App() {
  return <MainApp />
}
