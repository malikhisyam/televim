// src/lib/themes.ts — Theme definitions & switching

import type { ThemeColors } from "../types"

export const THEMES: Record<string, ThemeColors> = {
  default: {
    fg: "#dbdee1",
    bg: "#313338",
    accent: "#5865f2",
    muted: "#949ba4",
    border: "#3f4248",
    success: "#57f287",
    error: "#ed4245",
    warning: "#f9a62b",
  },
  gruvbox: {
    fg: "#ebdbb2",
    bg: "#282828",
    accent: "#458588",
    muted: "#928374",
    border: "#504945",
    success: "#b8bb26",
    error: "#fb4934",
    warning: "#fabd2f",
  },
  nord: {
    fg: "#d8dee9",
    bg: "#2e3440",
    accent: "#88c0d0",
    muted: "#616e88",
    border: "#4c566a",
    success: "#a3be8c",
    error: "#bf616a",
    warning: "#ebcb8b",
  },
  dracula: {
    fg: "#f8f8f2",
    bg: "#282a36",
    accent: "#bd93f9",
    muted: "#6272a4",
    border: "#44475a",
    success: "#50fa7b",
    error: "#ff5555",
    warning: "#f1fa8c",
  },
  solarized: {
    fg: "#839496",
    bg: "#002b36",
    accent: "#268bd2",
    muted: "#586e75",
    border: "#073642",
    success: "#859900",
    error: "#dc322f",
    warning: "#b58900",
  },
}

export function getTheme(name: string): ThemeColors {
  return THEMES[name] ?? THEMES["default"]!
}

export function listThemeNames(): string[] {
  return Object.keys(THEMES)
}
