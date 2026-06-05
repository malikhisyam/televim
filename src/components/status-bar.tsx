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
    hint = "FORWARD MODE: j/k select chat • enter forward • esc cancel"
  } else if (actionMenuVisible) {
    hint = "j/k navigate • enter confirm • esc close • r/y/f/p/e/d/t shortcut"
  } else if (mode === MODES.INSERT) {
    hint = "esc normal mode • enter send"
  } else if (mode === MODES.COMMAND) {
    hint = "enter execute • backspace delete • esc cancel"
  } else if (mode === MODES.SEARCH) {
    hint = "enter select • backspace delete • esc cancel"
  } else if (paneFocus === "sidebar") {
    hint = "j/k navigate • enter open/expand • l expand group • h collapse group • esc sidebar • i insert • : command • / search • q quit"
  } else {
    hint = "j/k scroll messages • a action menu • o open link • s search msg • y copy • d delete • r reply • esc sidebar • i insert • : command • / search • q quit"
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
    <text fg={theme.muted}>
      {isTypingCommand ? typedText : `${cloakBadge}${hint}`}
      {typingText ? `  ${typingText}` : ""}
    </text>
  )
}
