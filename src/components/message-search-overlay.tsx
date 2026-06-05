// src/components/message-search-overlay.tsx — Search messages in current chat

import { memo, useEffect, useRef } from "react"
import { useStore } from "../state/store"

const SNIPPET_LEN = 55

function getMatchSnippet(content: string, query: string, maxLen: number): string {
  const lowerQuery = query.toLowerCase().trim()
  if (!lowerQuery) return content.slice(0, maxLen)
  const lowerContent = content.toLowerCase()
  const index = lowerContent.indexOf(lowerQuery)
  if (index === -1) return content.slice(0, maxLen)
  // Show snippet around the match
  const start = Math.max(0, index - 10)
  const end = Math.min(content.length, start + maxLen)
  return content.slice(start, end)
}

const ResultItem = memo(function ResultItem({
  msg,
  isSelected,
  theme,
  query,
}: {
  msg: { id: number; senderName: string; content: string; timestamp: Date }
  isSelected: boolean
  theme: { bg: string; accent: string; fg: string; muted: string }
  query: string
}) {
  const timeStr = msg.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })
  const displayContent = getMatchSnippet(msg.content, query, SNIPPET_LEN)
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
        {displayContent}
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
        overflow: "hidden",
      }}
    >
      <text fg={theme.accent}>
        {isGlobal ? "Global Search" : "Search"}: {query}
      </text>
      <box style={{ height: 1, width: "100%", backgroundColor: theme.border }} />
      <box style={{ flexGrow: 1, width: "100%", overflow: "hidden" }}>
        <scrollbox
          ref={scrollboxRef}
          style={{ height: "100%", width: "100%", scrollY: true }}
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
                query={query}
              />
            ))
          )}
        </scrollbox>
      </box>
      <text fg={theme.muted}>tab/shift+tab navigate • enter jump • esc close</text>
    </box>
  )
}
