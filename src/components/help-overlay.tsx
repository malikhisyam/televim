// src/components/help-overlay.tsx — Keybindings reference overlay

import { useStore } from "../state/store"

export default function HelpOverlay() {
  const theme = useStore((s) => s.theme)

  return (
    <box
      style={{
        position: "absolute",
        top: "10%",
        left: "15%",
        width: "70%",
        height: "80%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.accent,
        backgroundColor: theme.bg,
        padding: 1,
      }}
    >
      <text fg={theme.accent}>
        TeleVim Keybindings — press ? to toggle, Esc to close
      </text>
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />

      <box style={{ flexDirection: "row", flexGrow: 1 }}>
        {/* Column 1: Normal mode */}
        <box style={{ flexDirection: "column", width: "50%", paddingRight: 1 }}>
          <text fg={theme.warning}>NORMAL MODE</text>
          <box style={{ height: 1 }} />
          <text fg={theme.fg}>j / k        Navigate chats</text>
          <text fg={theme.fg}>J / K        Navigate messages</text>
          <text fg={theme.fg}>Enter        Open selected chat</text>
          <text fg={theme.fg}>i            Enter Insert mode</text>
          <text fg={theme.fg}>v            Enter Visual mode</text>
          <text fg={theme.fg}>:            Enter Command mode</text>
          <text fg={theme.fg}>/            Search chats</text>
          <text fg={theme.fg}>s            Search messages (tab/shift+tab nav)</text>
          <text fg={theme.fg}>S            Global search all chats</text>
          <text fg={theme.fg}>a            Message action menu (react, copy, delete, etc.)</text>
          <text fg={theme.fg}>o            Open media link</text>
          <text fg={theme.fg}>yy           Copy message</text>
          <text fg={theme.fg}>dd           Delete message</text>
          <text fg={theme.fg}>r            Reply to message</text>
          <text fg={theme.fg}>q            Quit</text>
          <text fg={theme.fg}>?            Toggle this help</text>
        </box>

        {/* Column 2: Other modes */}
        <box style={{ flexDirection: "column", width: "50%", paddingLeft: 1 }}>
          <text fg={theme.warning}>INSERT MODE</text>
          <box style={{ height: 1 }} />
          <text fg={theme.fg}>Type         Compose message</text>
          <text fg={theme.fg}>Enter        Send message</text>
          <text fg={theme.fg}>Esc          Return to Normal</text>

          <box style={{ height: 1 }} />
          <text fg={theme.warning}>VISUAL MODE</text>
          <box style={{ height: 1 }} />
          <text fg={theme.fg}>j / k        Extend selection</text>
          <text fg={theme.fg}>y            Yank (copy)</text>
          <text fg={theme.fg}>d            Delete</text>
          <text fg={theme.fg}>Esc          Cancel</text>

          <box style={{ height: 1 }} />
          <text fg={theme.warning}>COMMANDS</text>
          <box style={{ height: 1 }} />
          <text fg={theme.fg}>:q           Quit</text>
          <text fg={theme.fg}>:cloak       Toggle privacy mode</text>
          <text fg={theme.fg}>:privacy     nobody / contacts / anybody</text>
          <text fg={theme.fg}>:theme       Cycle color theme</text>
          <text fg={theme.fg}>:leave       Leave chat</text>
          <text fg={theme.fg}>:search      Search messages in chat</text>
          <text fg={theme.fg}>:searchglobal Search all chats</text>
          <text fg={theme.fg}>:help        Show this help</text>
        </box>
      </box>
    </box>
  )
}
