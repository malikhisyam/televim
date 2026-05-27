// src/components/input-bar.tsx — Discord-style input area

import { useCallback, useState } from "react"
import { useStore } from "../state/store"

interface InputBarProps {
  onSendMessage: (text: string) => void
  focused: boolean
}

export default function InputBar({ onSendMessage, focused }: InputBarProps) {
  const theme = useStore((s) => s.theme)
  const [text, setText] = useState("")

  const handleSubmit = useCallback(() => {
    if (text.trim()) {
      onSendMessage(text.trim())
      setText("")
    }
  }, [text, onSendMessage])

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
        paddingX: 1,
      }}
    >
      <input
        style={{
          flexGrow: 1,
          backgroundColor: theme.bg,
          textColor: theme.fg,
        }}
        placeholder="Message #general"
        value={text}
        onInput={setText}
        onSubmit={handleSubmit}
        focused={focused}
      />
    </box>
  )
}
