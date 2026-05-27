// src/components/reaction-menu.tsx — Emoji reaction picker overlay

import { useStore } from "../state/store"

const REACTIONS = [
  { label: "❤️", key: "heart" },
  { label: "👍", key: "thumbsup" },
  { label: "👎", key: "thumbsdown" },
  { label: "🔥", key: "fire" },
  { label: "🥰", key: "love" },
  { label: "👋", key: "wave" },
  { label: "😂", key: "laugh" },
] as const

export type ReactionKey = (typeof REACTIONS)[number]["key"]

interface ReactionMenuProps {
  onSelect?: (emoticon: string) => void
}

export default function ReactionMenu(_props: ReactionMenuProps) {
  const theme = useStore((s) => s.theme)
  const selectedIndex = useStore((s) => s.reactionMenuIndex)

  return (
    <box
      style={{
        position: "absolute",
        top: "25%",
        left: "25%",
        width: "50%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.accent,
        backgroundColor: theme.bg,
        padding: 1,
      }}
    >
      <text fg={theme.accent}>React</text>
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />
      {REACTIONS.map((reaction, index) => {
        const isSelected = index === selectedIndex
        return (
          <box
            key={reaction.key}
            style={{
              paddingX: 1,
              paddingY: 0,
              height: 1,
              backgroundColor: isSelected ? theme.accent : theme.bg,
            }}
          >
            <text fg={isSelected ? theme.bg : theme.fg}>
              {reaction.label}
            </text>
          </box>
        )
      })}
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />
      <text fg={theme.muted}>j/k navigate • enter select • esc close</text>
    </box>
  )
}

export { REACTIONS }
