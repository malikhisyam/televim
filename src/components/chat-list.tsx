// src/components/chat-list.tsx — Discord-style guild/channel list with expandable groups

import { memo } from "react"
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

  const isGroup = chat.type !== "private"
  const isExpanded = isGroup && expandedChatIds.has(chat.id)

  // Arrow: only for groups; ▼ when expanded, ▶ when collapsed
  let arrow = ""
  if (isChat && isGroup) {
    arrow = isExpanded ? "▼ " : "▶ "
  } else if (!isChat) {
    arrow = "  " // indent for thread
  }

  const fg = isSelected ? theme.accent : theme.fg
  const bg = isSelected ? theme.border : theme.bg
  const unreadCount = isChat ? chat.unreadCount : (thread?.unreadCount ?? 0)
  const unreadBadge = unreadCount > 0 ? ` [${unreadCount}]` : ""
  const title = isChat ? chat.title : (thread?.title ?? "Thread")
  const depthPad = item.depth * 2

  return (
    <box
      style={{
        paddingX: 1 + depthPad,
        paddingY: 0,
        height: 1,
        backgroundColor: bg,
      }}
    >
      <text fg={fg}>
        {arrow}
        {title.slice(0, 28 - depthPad)}
        {unreadBadge}
      </text>
    </box>
  )
}

const MemoChatListItem = memo(ChatListItem)

export default function ChatList() {
  const theme = useStore((s) => s.theme)
  const chats = useStore((s) => s.chats)
  const expandedChatIds = useStore((s) => s.expandedChatIds)
  const selectedListIndex = useStore((s) => s.selectedListIndex)

  const visibleItems = getVisibleItems(chats, expandedChatIds)

  return (
    <box
      style={{
        width: 34,
        height: "100%",
        flexDirection: "column",
        border: true,
        borderStyle: "single",
        borderColor: theme.border,
        backgroundColor: theme.bg,
      }}
    >
      <text
        fg={theme.success}
        style={{
          paddingX: 1,
          paddingY: 0,
          height: 1,
        }}
      >
        Guilds
      </text>
      <scrollbox
        style={{
          flexGrow: 1,
          width: "100%",
          scrollY: true,
        }}
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
