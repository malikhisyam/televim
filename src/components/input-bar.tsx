// src/components/input-bar.tsx — Discord-style input area with per-chat drafts

import { useCallback, useEffect, useState } from "react"
import { useStore } from "../state/store"
import { msgStoreKey } from "../lib/message-store"

interface InputBarProps {
  onSendMessage: (text: string) => void
  focused: boolean
}

export default function InputBar({ onSendMessage, focused }: InputBarProps) {
  const theme = useStore((s) => s.theme)
  const mode = useStore((s) => s.mode)
  const activeChat = useStore((s) => s.activeChat)
  const activeThreadId = useStore((s) => s.activeThreadId)
  const drafts = useStore((s) => s.drafts)
  const setDraft = useStore((s) => s.setDraft)
  const replyToMessageId = useStore((s) => s.replyToMessageId)
  const editMessageId = useStore((s) => s.editMessageId)
  const messages = useStore((s) => s.messages)
  const setReplyToMessageId = useStore((s) => s.setReplyToMessageId)
  const setEditMessageId = useStore((s) => s.setEditMessageId)

  const isFocused = mode === "insert"
  const borderColor = isFocused ? theme.accent : theme.border

  const draftKey = activeChat ? msgStoreKey(activeChat.id, activeThreadId) : ""
  const savedDraft = drafts[draftKey] ?? ""
  const attachmentPath = useStore((s) => s.attachmentPath)

  const [text, setText] = useState(savedDraft)

  // Prefill with message text when entering edit mode (runs only when editMessageId changes)
  useEffect(() => {
    if (editMessageId && activeChat) {
      const msg = messages[draftKey]?.find((m) => m.id === editMessageId)
      if (msg) {
        setText(msg.content)
        if (draftKey) {
          setDraft(draftKey, msg.content)
        }
      }
    }
  }, [editMessageId])

  // Sync local text when switching chats or when draft changes externally (only when NOT editing)
  useEffect(() => {
    if (!editMessageId) {
      setText(savedDraft)
    }
  }, [draftKey, savedDraft, editMessageId])

  const handleInput = useCallback((value: string) => {
    setText(value)
    if (draftKey) {
      setDraft(draftKey, value)
    }
  }, [draftKey, setDraft])

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (trimmed || attachmentPath) {
      onSendMessage(trimmed)
    }
    setText("")
    if (draftKey) {
      setDraft(draftKey, "")
    }
    if (replyToMessageId) {
      setReplyToMessageId(null)
    }
    if (editMessageId) {
      setEditMessageId(null)
    }
  }, [text, onSendMessage, draftKey, setDraft, replyToMessageId, setReplyToMessageId, editMessageId, setEditMessageId, attachmentPath])

  const placeholder = attachmentPath
    ? "Add a caption..."
    : activeChat
      ? activeThreadId
        ? `Message #${activeChat.title}`
        : `Message ${activeChat.title}`
      : "Message"

  const replyMsg = replyToMessageId && activeChat
    ? messages[draftKey]?.find((m) => m.id === replyToMessageId)
    : undefined

  const editMsg = editMessageId && activeChat
    ? messages[draftKey]?.find((m) => m.id === editMessageId)
    : undefined

  const metaVisible = editMsg || replyMsg || attachmentPath

  return (
    <box
      style={{
        height: metaVisible ? 5 : 3,
        width: "100%",
        flexDirection: "column",
        backgroundColor: theme.bg,
        border: true,
        borderStyle: "rounded",
        borderColor: borderColor,
        paddingX: 1,
        paddingY: 0,
      }}
    >
      {editMsg ? (
        <box style={{ flexDirection: "row", height: 1, gap: 1 }}>
          <text fg={theme.muted}>Editing message:</text>
          <text fg={theme.accent}>{editMsg.content.slice(0, 40)}</text>
        </box>
      ) : replyMsg ? (
        <box style={{ flexDirection: "row", height: 1, gap: 1 }}>
          <text fg={theme.muted}>Replying to:</text>
          <text fg={theme.accent}>{replyMsg.senderName}</text>
          <text fg={theme.muted}>— {replyMsg.content.slice(0, 40)}</text>
        </box>
      ) : attachmentPath ? (
        <box style={{ flexDirection: "row", height: 1, gap: 1 }}>
          <text fg={theme.accent}>Attach:</text>
          <text fg={theme.fg}>{attachmentPath.slice(0, 60)}</text>
        </box>
      ) : null}
      <input
        style={{
          flexGrow: 1,
          backgroundColor: theme.bg,
          textColor: theme.fg,
        }}
        placeholder={placeholder}
        value={text}
        onInput={handleInput}
        onSubmit={handleSubmit}
        focused={focused}
      />
    </box>
  )
}
