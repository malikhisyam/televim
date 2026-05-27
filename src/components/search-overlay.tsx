// src/components/search-overlay.tsx — Fuzzy search UI (/ command)

import { useStore } from "../state/store"

export default function SearchOverlay() {
  const theme = useStore((s) => s.theme)
  const query = useStore((s) => s.searchQuery)
  const results = useStore((s) => s.searchResults)
  const selectedSearchIndex = useStore((s) => s.selectedSearchIndex)

  return (
    <box
      style={{
        position: "absolute",
        top: "30%",
        left: "20%",
        width: "60%",
        height: "40%",
        flexDirection: "column",
        border: true,
        borderStyle: "rounded",
        borderColor: theme.accent,
        backgroundColor: theme.bg,
        padding: 1,
      }}
    >
      <text fg={theme.accent}>Search: {query}</text>
      <box
        style={{
          height: 1,
          width: "100%",
          backgroundColor: theme.border,
        }}
      />
      <scrollbox style={{ flexGrow: 1, scrollY: true }}>
        {results.length === 0 ? (
          <text fg={theme.muted}>No results</text>
        ) : (
          results.map((chat, index) => (
            <box
              key={chat.id}
              style={{
                paddingX: 1,
                height: 1,
                backgroundColor:
                  index === selectedSearchIndex ? theme.accent : theme.bg,
              }}
            >
              <text
                fg={
                  index === selectedSearchIndex ? theme.bg : theme.fg
                }
              >
                {chat.title}
              </text>
            </box>
          ))
        )}
      </scrollbox>
    </box>
  )
}
