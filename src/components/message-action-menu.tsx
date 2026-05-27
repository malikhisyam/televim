// src/components/message-action-menu.tsx — Message action overlay (reply, copy, delete, etc.)

import { useStore } from "../state/store"

const ACTIONS = [
  { key: "reply", label: "Reply", shortcut: "r" },
  { key: "copy", label: "Copy Text", shortcut: "y" },
  { key: "forward", label: "Forward", shortcut: "f" },
  { key: "pin", label: "Pin", shortcut: "p" },
  { key: "edit", label: "Edit", shortcut: "e" },
  { key: "delete", label: "Delete", shortcut: "d" },
  { key: "react", label: "React", shortcut: "t" },
] as const

export type ActionKey = (typeof ACTIONS)[number]["key"]

interface MessageActionMenuProps {
  onAction: (action: ActionKey) => void
}

export default function MessageActionMenu({ onAction }: MessageActionMenuProps) {
  const theme = useStore((s) => s.theme)
  const selectedIndex = useStore((s) => s.messageActionMenuIndex)

  return (
    <box
      style={{
        position: "absolute",
        top: "30%",
        left: "30%",
        width: "40%",
        height: "auto",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.accent,
        backgroundColor: theme.bg,
        padding: 1,
      }}
    >
      <text fg={theme.accent}>Message Actions</text>
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />
      {ACTIONS.map((action, index) => {
        const isSelected = index === selectedIndex
        return (
          <box
            key={action.key}
            style={{
              paddingX: 1,
              paddingY: 0,
              height: 1,
              backgroundColor: isSelected ? theme.accent : theme.bg,
            }}
          >
            <box style={{ flexDirection: "row", height: 1 }}>
              <text fg={isSelected ? theme.bg : theme.fg}>{action.label}</text>
              <text fg={isSelected ? theme.bg : theme.muted}> ({action.shortcut})</text>
            </box>
          </box>
        )
      })}
    </box>
  )
}
