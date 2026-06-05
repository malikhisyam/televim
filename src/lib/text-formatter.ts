// src/lib/text-formatter.ts — Split text into styled segments based on Telegram entities

import type { MessageEntity } from "../types"

export interface TextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  code?: boolean
  pre?: boolean
  strikethrough?: boolean
  underline?: boolean
  url?: string
}

/**
 * Split a string into styled segments based on Telegram-style entities.
 * Each segment is a piece of text with zero or more style flags applied.
 */
export function formatEntities(text: string, entities?: MessageEntity[]): TextSegment[] {
  if (!entities || entities.length === 0) {
    return [{ text }]
  }

  // Build a map of which styles apply at each character position
  const activeStyles: Array<{
    bold?: boolean
    italic?: boolean
    code?: boolean
    pre?: boolean
    strikethrough?: boolean
    underline?: boolean
    url?: string
  }> = []

  for (let i = 0; i < text.length; i++) {
    activeStyles[i] = {}
  }

  for (const entity of entities) {
    const end = entity.offset + entity.length
    for (let i = entity.offset; i < end && i < text.length; i++) {
      switch (entity.type) {
        case "bold":
          activeStyles[i]!.bold = true
          break
        case "italic":
          activeStyles[i]!.italic = true
          break
        case "code":
          activeStyles[i]!.code = true
          break
        case "pre":
          activeStyles[i]!.pre = true
          break
        case "strikethrough":
          activeStyles[i]!.strikethrough = true
          break
        case "underline":
          activeStyles[i]!.underline = true
          break
        case "url":
          activeStyles[i]!.url = text.slice(entity.offset, end)
          break
        case "text_link":
          activeStyles[i]!.url = entity.url || ""
          break
      }
    }
  }

  // Group consecutive characters with identical styles into segments
  const segments: TextSegment[] = []
  let current: TextSegment | null = null

  for (let i = 0; i < text.length; i++) {
    const style = activeStyles[i]!
    const char = text[i]!

    if (
      current &&
      current.bold === !!style.bold &&
      current.italic === !!style.italic &&
      current.code === !!style.code &&
      current.pre === !!style.pre &&
      current.strikethrough === !!style.strikethrough &&
      current.underline === !!style.underline &&
      current.url === (style.url || undefined)
    ) {
      current.text += char
    } else {
      current = {
        text: char,
        bold: style.bold,
        italic: style.italic,
        code: style.code,
        pre: style.pre,
        strikethrough: style.strikethrough,
        underline: style.underline,
        url: style.url || undefined,
      }
      segments.push(current)
    }
  }

  return segments
}
