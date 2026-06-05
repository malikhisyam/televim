// src/hooks/use-theme.ts — Theme / color scheme management

import { useCallback, useEffect } from "react"
import { useStore } from "../state/store"
import { getTheme, listThemeNames } from "../lib/themes"

export function useTheme() {
  const theme = useStore((state) => state.theme)
  const setTheme = useStore((state) => state.setTheme)

  const applyTheme = useCallback(
    (name: string) => {
      const newTheme = getTheme(name)
      setTheme(newTheme)
    },
    [setTheme],
  )

  const cycleTheme = useCallback(() => {
    const names = listThemeNames()
    const currentName =
      names.find((name) => getTheme(name).fg === theme.fg) ?? names[0] ?? "default"
    const currentIndex = names.indexOf(currentName)
    const nextIndex = (currentIndex + 1) % names.length
    applyTheme(names[nextIndex] ?? "default")
  }, [theme.fg, applyTheme])

  // Optional: load theme preference from environment or config file
  useEffect(() => {
    const envTheme = process.env.TELEVIM_THEME
    if (envTheme) {
      applyTheme(envTheme)
    }
  }, [applyTheme])

  return {
    theme,
    applyTheme,
    cycleTheme,
    availableThemes: listThemeNames(),
  }
}
