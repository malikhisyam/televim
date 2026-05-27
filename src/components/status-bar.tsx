// src/components/status-bar.tsx — Discord-style bottom keybindings bar

import { useStore } from "../state/store"
import { MODES } from "../constants"

export default function StatusBar() {
  const theme = useStore((s) => s.theme)
  const paneFocus = useStore((s) => s.paneFocus)
  const mode = useStore((s) => s.mode)
  const actionMenuVisible = useStore((s) => s.messageActionMenuVisible)

  let hint = ""
  if (actionMenuVisible) {
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
    hint = "j/k scroll messages • a action menu • y copy • d delete • r reply • esc sidebar • i insert • : command • / search • q quit"
  }

  return (
    <box
      style={{
        height: 1,
        width: "100%",
        flexDirection: "row",
        backgroundColor: theme.bg,
        border: true,
        borderStyle: "single",
        borderColor: theme.border,
      }}
    >
      <text fg={theme.muted} style={{ paddingX: 1 }}>
        {hint}
      </text>
    </box>
  )
}
