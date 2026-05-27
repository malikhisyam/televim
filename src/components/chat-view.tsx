// src/components/chat-view.tsx — Discord-style messages pane

import { memo, useEffect, useRef } from "react"
import { useStore } from "../state/store"
import type { Message } from "../types"

function MessageBubble({
  message,
  isSelected,
}: {
  message: Message
  isSelected: boolean
}) {
  const theme = useStore((s) => s.theme)
  const bg = isSelected ? theme.accent : theme.bg
  const fg = isSelected ? "#ffffff" : theme.fg
  const align = message.isOutgoing ? "flex-end" : "flex-start"
  const senderColor = message.isOutgoing ? theme.accent : theme.warning

  const timeStr = message.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <box
      id={`msg-${message.id}`}
      style={{
        width: "100%",
        paddingX: 1,
        paddingY: 0,
        backgroundColor: bg,
        justifyContent: align,
      }}
    >
      <box style={{ flexDirection: "column", padding: 1, gap: 0 }}>
        <text fg={senderColor}>
          {message.senderName} {timeStr}
        </text>
        <text fg={fg}>{message.content}</text>
      </box>
    </box>
  )
}

const MemoMessageBubble = memo(MessageBubble)

export default function ChatView() {
  const theme = useStore((s) => s.theme)
  const activeChat = useStore((s) => s.activeChat)
  const messages = useStore((s) => s.messages)
  const selectedMessageIndex = useStore((s) => s.selectedMessageIndex)
  const scrollboxRef = useRef<any>(null)

  const activeThreadId = useStore((s) => s.activeThreadId)
  const activeMessages = activeChat ? messages[`${activeChat.id}${activeThreadId ? `:${activeThreadId}` : ""}`] ?? [] : []
  const isLoadingOlder = useStore((s) => s.isLoadingOlderMessages)

  // Auto-scroll to keep the selected message in view
  useEffect(() => {
    if (!scrollboxRef.current || activeMessages.length === 0) return
    const selectedMsg = activeMessages[selectedMessageIndex]
    if (!selectedMsg) return
    const id = `msg-${selectedMsg.id}`
    try {
      scrollboxRef.current.scrollChildIntoView?.(id)
    } catch {
      // Fallback: estimate scroll position (~4 rows per message)
      const itemHeight = 4
      const targetScroll = selectedMessageIndex * itemHeight
      scrollboxRef.current.scrollTop = targetScroll
    }
  }, [selectedMessageIndex, activeMessages])

  return (
    <box
      focusable={false}
      style={{
        flexGrow: 1,
        height: "100%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.border,
        backgroundColor: theme.bg,
      }}
      title={activeChat ? activeChat.title : "Messages"}
      titleAlignment="left"
    >
      {activeChat ? (
        <scrollbox
          ref={scrollboxRef}
          focusable={false}
          style={{
            flexGrow: 1,
            width: "100%",
            scrollY: true,
            stickyScroll: true,
            stickyStart: "bottom",
            viewportCulling: true,
            backgroundColor: theme.bg,
          }}
        >
          {isLoadingOlder ? (
            <box style={{ width: "100%", paddingY: 1, justifyContent: "center" }}>
              <text fg={theme.muted}>Loading older messages...</text>
            </box>
          ) : null}
          {activeMessages.length === 0 ? (
            <box
              style={{
                width: "100%",
                flexGrow: 1,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <text fg={theme.muted}>No messages yet</text>
            </box>
          ) : (
            activeMessages.map((message, index) => (
              <MemoMessageBubble
                key={message.id}
                message={message}
                isSelected={index === selectedMessageIndex}
              />
            ))
          )}
        </scrollbox>
      ) : (
        <box
          style={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <text fg={theme.muted}>Select a channel to start chatting</text>
        </box>
      )}
    </box>
  )
}
