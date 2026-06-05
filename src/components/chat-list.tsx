// src/components/chat-list.tsx — Discord-style guild/channel list with expandable groups

import { memo, useEffect, useRef } from "react"
import { useStore } from "../state/store"
import { getVisibleItems } from "../lib/chat-list-utils"
import type { ListItem } from "../lib/chat-list-utils"

function ChatListItem({
  item,
  isSelected,
}: {
  item: ListItem
  isSelected: boolean
}) {
  const theme = useStore((s) => s.theme)
  const expandedChatIds = useStore((s) => s.expandedChatIds)

  const isChat = item.type === "chat"
  const chat = isChat ? item.chat : item.chat
  const thread = isChat ? undefined : item.thread

  const isExpandable = chat.type === "channel" && chat.forum
  const isExpanded = isExpandable && expandedChatIds.has(chat.id)

  // Arrow: only for channels (can have forum topics); ▼ when expanded, ▶ when collapsed
  let arrow = ""
  if (isChat && isExpandable) {
    arrow = isExpanded ? "▼ " : "▶ "
  } else if (!isChat) {
    arrow = "  " // indent for thread
  }

  const fg = isSelected ? theme.accent : theme.fg
  const bg = isSelected ? theme.border : theme.bg
  const unreadCount = isChat
    ? chat.forum && chat.threads && chat.threads.length > 0
      ? chat.threads.reduce((sum, t) => sum + t.unreadCount, 0)
      : chat.unreadCount
    : (thread?.unreadCount ?? 0)
  const unreadBadge = unreadCount > 0 ? ` [${unreadCount}]` : ""
  const title = isChat ? chat.title : (thread?.title ?? "Thread")
  const depthPad = item.depth * 2

  // Truncate long names so they never wrap — reserve space for arrow + badge
  const SCROLLBOX_WIDTH = 28 // conservative inner width (box 35 - borders - padding - scrollbar)
  const hPadding = 2 * (1 + depthPad)
  const prefixLen = arrow.length
  const suffixLen = unreadBadge.length
  const maxTitleLen = Math.max(SCROLLBOX_WIDTH - hPadding - prefixLen - suffixLen, 1)
  const displayTitle =
    title.length > maxTitleLen
      ? title.slice(0, Math.max(maxTitleLen - 1, 0)) + "…"
      : title

  const id = isChat ? `chat-${chat.id}` : `thread-${chat.id}-${thread!.id}`

  return (
    <box
      id={id}
      style={{
        paddingX: 1 + depthPad,
        paddingY: 0,
        height: 1,
        backgroundColor: bg,
      }}
    >
      <text fg={fg}>
        {arrow}
        {displayTitle}
        {unreadBadge}
      </text>
    </box>
  )
}

const MemoChatListItem = memo(ChatListItem)

const SCROLLBAR_OPTS = {
  showArrows: false,
  trackOptions: {
    foregroundColor: "#a0a0a0",
    backgroundColor: "#404040",
  },
}

export default function ChatList() {
  const theme = useStore((s) => s.theme)
  const mode = useStore((s) => s.mode)
  const paneFocus = useStore((s) => s.paneFocus)
  const chats = useStore((s) => s.chats)
  const expandedChatIds = useStore((s) => s.expandedChatIds)
  const selectedListIndex = useStore((s) => s.selectedListIndex)
  const scrollboxRef = useRef<any>(null)

  const isFocused = paneFocus === "sidebar" && mode === "normal"
  const borderColor = isFocused ? theme.accent : theme.border

  const visibleItems = getVisibleItems(chats, expandedChatIds)

  // Auto-scroll to keep the selected guild/thread in view
  useEffect(() => {
    if (!scrollboxRef.current) return
    const selectedItem = visibleItems[selectedListIndex]
    if (!selectedItem) return
    const id =
      selectedItem.type === "chat"
        ? `chat-${selectedItem.chat.id}`
        : `thread-${selectedItem.chat.id}-${selectedItem.thread.id}`
    try {
      scrollboxRef.current.scrollChildIntoView?.(id)
    } catch {
      scrollboxRef.current.scrollTop = selectedListIndex
    }
  }, [selectedListIndex])

  return (
    <box
      title="Guilds"
      titleAlignment="left"
      style={{
        width: 35,
        height: "100%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: borderColor,
        backgroundColor: theme.bg,
        paddingX: 1,
        paddingY: 1,
        paddingBottom: 4,
        gap: 0,
      }}
    >
      <scrollbox
        ref={scrollboxRef}
        style={{
          flexGrow: 1,
          width: "100%",
          scrollY: true,
        }}
        scrollbarOptions={SCROLLBAR_OPTS}
      >
        {visibleItems.map((item, index) => (
          <MemoChatListItem
            key={
              item.type === "chat"
                ? `chat-${item.chat.id}`
                : `thread-${item.chat.id}-${item.thread.id}`
            }
            item={item}
            isSelected={index === selectedListIndex}
          />
        ))}
      </scrollbox>
    </box>
  )
}
