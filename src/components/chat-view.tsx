// src/components/chat-view.tsx — Discord-style messages pane

import React, { memo, useEffect, useRef } from "react"
import { useStore } from "../state/store"
import type { Message } from "../types"
import { formatEntities, type TextSegment } from "../lib/text-formatter"

function renderSegments(segments: TextSegment[], baseColor: string): React.ReactNode {
  return (
    <text fg={baseColor}>
      {segments.map((seg, i) => {
        let content: React.ReactNode = <span>{seg.text}</span>
        if (seg.url) {
          content = <a href={seg.url}><u>{seg.text}</u></a>
        }
        if (seg.bold) {
          content = <strong>{content}</strong>
        }
        if (seg.italic) {
          content = <em>{content}</em>
        }
        if (seg.code || seg.pre) {
          content = <span>{content}</span>
        }
        // code blocks use accent color
        return (
          <span key={i}>
            {content}
          </span>
        )
      })}
    </text>
  )
}

function MessageBubble({
  message,
  isSelected,
  allMessages,
  isRead,
}: {
  message: Message
  isSelected: boolean
  allMessages: Message[]
  isRead: boolean
}) {
  const theme = useStore((s) => s.theme)
  const activeChat = useStore((s) => s.activeChat)
  const activeThreadId = useStore((s) => s.activeThreadId)

  // Invert colors for selected message so it's always highly visible
  const bg = isSelected ? theme.fg : theme.bg
  const fg = isSelected ? theme.bg : theme.fg
  const align = message.isOutgoing ? "flex-end" : "flex-start"
  // Differentiate own messages (muted) vs others (bright), but invert when selected
  const senderColor = isSelected ? theme.bg : message.isOutgoing ? theme.muted : theme.fg

  // Read receipt indicator
  const readIndicator = isRead ? "✓✓" : message.isOutgoing ? "✓" : ""

  const d = message.timestamp
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const dateStr = `${d.getDate()} ${d.toLocaleDateString([], { month: "long" })}`
  const fullStr = `${timeStr} - ${dateStr}`

  // Build a t.me link for media messages in groups/channels.
  // Private chats have no public message URLs.
  // Channel IDs are negative (bot-api style: -100...); t.me/c/ needs the positive ID.
  const isMedia = message.mediaType && message.mediaType !== "unknown"
  let messageUrl: string | undefined
  if (isMedia && activeChat && activeChat.type !== "private") {
    const rawId = message.chatId
    const positiveId = rawId < 0 ? rawId * -1 : rawId
    messageUrl = `https://t.me/c/${positiveId}/${message.id}`
  }

  // Find the message being replied to
  const repliedTo = message.replyToMessageId
    ? allMessages.find((m) => m.id === message.replyToMessageId)
    : undefined

  // Format message content with Telegram entities
  const contentSegments = formatEntities(message.content, message.entities)

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
        {repliedTo ? (
          <box style={{ flexDirection: "row", gap: 0, marginBottom: 0 }}>
            <box style={{ width: 1, height: 2, backgroundColor: theme.accent }} />
            <box style={{ flexDirection: "column", paddingLeft: 1 }}>
              <text fg={isSelected ? theme.bg : theme.accent}>
                {repliedTo.senderName}
              </text>
              <text fg={isSelected ? theme.bg : theme.muted}>
                {repliedTo.content.slice(0, 50)}
              </text>
            </box>
          </box>
        ) : null}
        {message.isForwarded ? (
          <text fg={isSelected ? theme.bg : theme.muted}>
            Forwarded from {message.forwardFromName || "Unknown"}
          </text>
        ) : null}
        <text fg={senderColor}>
          {message.senderName} {fullStr} {readIndicator}
        </text>
        {messageUrl ? (
          <text fg={fg}>
            <a href={messageUrl}><u>{message.content}</u></a>
          </text>
        ) : (
          renderSegments(contentSegments, fg)
        )}
      </box>
    </box>
  )
}

const MemoMessageBubble = memo(MessageBubble, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.isSelected === next.isSelected &&
    prev.isRead === next.isRead &&
    prev.allMessages.length === next.allMessages.length &&
    JSON.stringify(prev.message.entities) === JSON.stringify(next.message.entities)
  )
})

const SCROLLBAR_OPTS = {
  showArrows: false,
  trackOptions: {
    foregroundColor: "#a0a0a0",
    backgroundColor: "#404040",
  },
}

export default function ChatView() {
  const theme = useStore((s) => s.theme)
  const activeChat = useStore((s) => s.activeChat)
  const activeThreadId = useStore((s) => s.activeThreadId)
  const messages = useStore((s) => s.messages)
  const selectedMessageIndex = useStore((s) => s.selectedMessageIndex)
  const scrollboxRef = useRef<any>(null)

  const activeMessages = activeChat ? messages[`${activeChat.id}${activeThreadId ? `:${activeThreadId}` : ""}`] ?? [] : []
  const isLoadingOlder = useStore((s) => s.isLoadingOlderMessages)
  const readOutboxMaxId = useStore((s) => s.readOutboxMaxId)

  // Build title: "Group > Thread" when in a thread
  let title = activeChat ? activeChat.title : "Messages"
  if (activeChat && activeThreadId) {
    const thread = activeChat.threads?.find((t) => t.id === activeThreadId)
    if (thread) {
      title = `${activeChat.title} > ${thread.title}`
    }
  }

  // Online indicator for private chats
  const userStatuses = useStore((s) => s.userStatuses)
  const pinnedMessages = useStore((s) => s.pinnedMessages)
  const isPrivate = activeChat?.type === "private"
  const userStatus = isPrivate && activeChat ? userStatuses[activeChat.id] : undefined
  const onlineIndicator = userStatus?.online ? " ●" : ""
  const pinnedMsg = activeChat ? pinnedMessages[activeChat.id] : undefined

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
      title={`${title}${onlineIndicator}`}
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
            backgroundColor: theme.bg,
          }}
          scrollbarOptions={SCROLLBAR_OPTS}
        >
          {pinnedMsg ? (
            <box
              style={{
                width: "100%",
                paddingX: 1,
                paddingY: 0,
                height: 2,
                backgroundColor: theme.border,
                flexDirection: "column",
              }}
            >
              <text fg={theme.accent}>📌 Pinned: {pinnedMsg.senderName}</text>
              <text fg={theme.fg}>{pinnedMsg.content.slice(0, 60)}</text>
            </box>
          ) : null}
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
            activeMessages.map((message, index) => {
              const isRead = message.isOutgoing && message.id <= (readOutboxMaxId[message.chatId] || 0)
              return (
                <MemoMessageBubble
                  key={message.id}
                  message={message}
                  isSelected={index === selectedMessageIndex}
                  allMessages={activeMessages}
                  isRead={isRead}
                />
              )
            })
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
