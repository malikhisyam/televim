// src/constants.ts — Keybindings, colors, config defaults

import type { ThemeColors } from "./types"

export const MODES = {
  NORMAL: "normal" as const,
  INSERT: "insert" as const,
  VISUAL: "visual" as const,
  COMMAND: "command" as const,
  SEARCH: "search" as const,
}

export const DEFAULT_THEME: ThemeColors = {
  fg: "#dbdee1",
  bg: "#313338",
  accent: "#5865f2",
  muted: "#949ba4",
  border: "#3f4248",
  success: "#57f287",
  error: "#ed4245",
  warning: "#f9a62b",
}

export const KEYBINDINGS = {
  NORMAL: {
    nextChat: "j",
    prevChat: "k",
    nextMessage: "J",
    prevMessage: "K",
    openChat: "return",
    insertMode: "i",
    visualMode: "v",
    commandMode: ":",
    searchMode: "/",
    copyMessage: "y",
    deleteMessage: "d",
    replyMessage: "r",
    quit: "q",
  },
  GLOBAL: {
    escape: "escape",
  },
} as const
