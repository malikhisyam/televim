// src/components/status-bar.tsx — Discord-style bottom keybindings bar

import { useStore } from "../state/store"
import { MODES } from "../constants"

export default function StatusBar() {
  const theme = useStore((s) => s.theme)
  const paneFocus = useStore((s) => s.paneFocus)
  const mode = useStore((s) => s.mode)
  const actionMenuVisible = useStore((s) => s.messageActionMenuVisible)
  const forwardMessageId = useStore((s) => s.forwardMessageId)
  const cloakMode = useStore((s) => s.cloakMode)
  const commandBuffer = useStore((s) => s.commandBuffer)
  const searchQuery = useStore((s) => s.searchQuery)

  let hint = ""
  if (forwardMessageId) {
    hint = "j/k select • enter forward • esc cancel"
  } else if (actionMenuVisible) {
    hint = "j/k navigate • enter confirm • esc close"
  } else if (mode === MODES.INSERT) {
    hint = "esc normal • enter send"
  } else if (mode === MODES.COMMAND) {
    hint = "enter run • backspace del • esc cancel"
  } else if (mode === MODES.SEARCH) {
    hint = "enter select • backspace del • esc cancel"
  } else if (paneFocus === "sidebar") {
    hint = "j/k navigate • enter open • l expand • h collapse • i insert • q quit • ?:help"
  } else {
    hint = "j/k scroll • a menu • i insert • esc sidebar • q quit • ?:help"
  }

  const cloakBadge = cloakMode ? "[CLOAK] " : ""

  // In command/search mode, show the typed buffer so the user knows what they typed
  const isTypingCommand = mode === MODES.COMMAND || mode === MODES.SEARCH
  const typedText = mode === MODES.COMMAND ? commandBuffer : searchQuery

  // Typing indicator for active chat
  const activeChat = useStore((s) => s.activeChat)
  const typingUsers = useStore((s) => s.typingUsers)
  const activeTyping = activeChat ? typingUsers[activeChat.id] : undefined
  const typingText = activeTyping ? `${activeTyping.name} is typing...` : ""

  return (
    <box
      style={{
        height: 3,
        width: "100%",
        flexDirection: "row",
        backgroundColor: theme.bg,
        border: true,
        borderStyle: "rounded",
        borderColor: theme.border,
        paddingX: 1,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {isTypingCommand ? (
        <text fg={theme.fg}>{typedText}</text>
      ) : (
        <text fg={theme.muted}>
          {cloakBadge}{hint}
        </text>
      )}
      {typingText ? (
        <text fg={theme.accent}>{typingText}</text>
      ) : mode === MODES.COMMAND ? (
        <text fg={theme.muted}>type :help for keybindings</text>
      ) : null}
    </box>
  )
}
