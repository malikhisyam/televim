// src/components/message-search-overlay.tsx — Search messages in current chat

import { memo, useEffect, useRef } from "react"
import { useStore } from "../state/store"

const ResultItem = memo(function ResultItem({
  msg,
  isSelected,
  theme,
}: {
  msg: { id: number; senderName: string; content: string; timestamp: Date }
  isSelected: boolean
  theme: { bg: string; accent: string; fg: string; muted: string }
}) {
  const timeStr = msg.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  return (
    <box
      id={`search-${msg.id}`}
      style={{
        paddingX: 1,
        paddingY: 0,
        height: 2,
        backgroundColor: isSelected ? theme.accent : theme.bg,
        flexDirection: "column",
      }}
    >
      <text fg={isSelected ? theme.bg : theme.fg}>
        {msg.senderName} {timeStr}
      </text>
      <text fg={isSelected ? theme.bg : theme.muted}>
        {msg.content.slice(0, 60)}
      </text>
    </box>
  )
})

export default function MessageSearchOverlay() {
  const theme = useStore((s) => s.theme)
  const query = useStore((s) => s.messageSearchQuery)
  const results = useStore((s) => s.messageSearchResults)
  const selectedIndex = useStore((s) => s.messageSearchIndex)
      const isGlobal = useStore((s) => s.messageSearchGlobal)
      const isLoading = useStore((s) => s.messageSearchLoading)
      const scrollboxRef = useRef<any>(null)

  // Auto-scroll to keep the selected result in view
  useEffect(() => {
    if (!scrollboxRef.current || results.length === 0) return
    const selected = results[selectedIndex]
    if (!selected) return
    const id = `search-${selected.id}`
    try {
      scrollboxRef.current.scrollChildIntoView?.(id)
    } catch {
      scrollboxRef.current.scrollTop = selectedIndex * 2
    }
  }, [selectedIndex, results])

  return (
    <box
      style={{
        position: "absolute",
        top: "20%",
        left: "20%",
        width: "60%",
        height: "60%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.accent,
        backgroundColor: theme.bg,
        padding: 1,
      }}
    >
      <text fg={theme.accent}>
        {isGlobal ? "Global Search" : "Search"}: {query}
      </text>
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />
      <scrollbox
        ref={scrollboxRef}
        style={{ flexGrow: 1, scrollY: true }}
      >
        {results.length === 0 ? (
      <text fg={theme.muted}>
        {isLoading
          ? "Searching..."
          : query.trim() === ""
            ? isGlobal
              ? "Type to search globally..."
              : "Type to search messages..."
            : isGlobal
              ? "No results"
              : "No results"}
      </text>
        ) : (
          results.map((msg, index) => (
            <ResultItem
              key={msg.id}
              msg={msg}
              isSelected={index === selectedIndex}
              theme={theme}
            />
          ))
        )}
      </scrollbox>
      <text fg={theme.muted}>tab/shift+tab navigate • enter jump • esc close</text>
    </box>
  )
}
