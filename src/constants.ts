// src/constants.ts — Keybindings, colors, config defaults

import { getTheme } from "./lib/themes"

export const MODES = {
  NORMAL: "normal" as const,
  INSERT: "insert" as const,
  VISUAL: "visual" as const,
  COMMAND: "command" as const,
  SEARCH: "search" as const,
}

export const DEFAULT_THEME = getTheme("default")

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
