// src/lib/keymap-engine.ts — Vim-motion parser (motions + operators)

/**
 * Parsed key sequence result.
 */
export interface KeymapResult {
  type:
    | "motion" // j, k, gg, G, etc.
    | "operator" // y, d, c
    | "operator-motion" // yj, dk, etc.
    | "mode-switch" // i, v, :, /
    | "action" // r, q, Enter, Escape
    | "count" // 0-9 (accumulated)
    | "pending" // waiting for next key
    | "unknown"
  motion?: string
  operator?: string
  count: number
  raw: string
}

interface KeymapState {
  countBuffer: string
  pendingOperator: string | null
  pendingMotion: string | null
}

const OPERATORS = new Set(["y", "d", "c"])
const MOTIONS = new Set([
  "j",
  "k",
  "h",
  "l",
  "gg",
  "G",
  "0",
  "$",
  "w",
  "b",
  "e",
  "{",
  "}",
])
const MODE_SWITCHES: Record<string, string> = {
  i: "insert",
  v: "visual",
  ":": "command",
  "/": "search",
}
const ACTIONS: Record<string, string> = {
  return: "open",
  escape: "escape",
  r: "reply",
  q: "quit",
}

/**
 * Parse a single keypress through the Vim keymap engine.
 *
 * @param keyName   Canonical key name from OpenTUI (e.g. "j", "return", "escape")
 * @param state     Mutable parser state (count buffer, pending operator)
 * @returns         Parsed keymap result
 */
export function parseKey(
  keyName: string,
  state: KeymapState,
): KeymapResult {
  const raw = keyName

  // ── Numeric prefix (0-9) ──
  if (/^[0-9]$/.test(keyName) && !(keyName === "0" && state.countBuffer === "")) {
    state.countBuffer += keyName
    return { type: "count", count: parseInt(state.countBuffer, 10), raw }
  }

  const count = state.countBuffer ? parseInt(state.countBuffer, 10) : 1

  // ── Resolve pending operator ──
  if (state.pendingOperator) {
    const op = state.pendingOperator
    state.pendingOperator = null
    state.countBuffer = ""

    // Operator + operator = linewise action (yy, dd, cc)
    if (keyName === op) {
      return { type: "action", count, raw: op + op }
    }

    // Operator + motion
    if (MOTIONS.has(keyName)) {
      return {
        type: "operator-motion",
        operator: op,
        motion: keyName,
        count,
        raw: op + keyName,
      }
    }

    // Unknown — cancel operator and re-parse as normal key
    // (fall through to normal handling)
  }

  state.countBuffer = ""

  // ── Special multi-key motions: gg ──
  if (keyName === "g") {
    if (state.pendingMotion === "g") {
      state.pendingMotion = null
      return { type: "motion", motion: "gg", count, raw: "gg" }
    }
    state.pendingMotion = "g"
    return { type: "pending", count, raw: "g" }
  }

  // ── Operator ──
  if (OPERATORS.has(keyName)) {
    state.pendingOperator = keyName
    return { type: "pending", count, raw }
  }

  // ── Motion ──
  if (MOTIONS.has(keyName) || keyName === "0") {
    return { type: "motion", motion: keyName, count, raw }
  }

  // ── Mode switch ──
  if (keyName in MODE_SWITCHES) {
    return {
      type: "mode-switch",
      motion: MODE_SWITCHES[keyName],
      count,
      raw,
    }
  }

  // ── Action ──
  if (keyName in ACTIONS) {
    return { type: "action", motion: ACTIONS[keyName], count, raw }
  }

  return { type: "unknown", count, raw }
}

/**
 * Reset parser state (call on mode change / Escape)
 */
export function resetKeymapState(state: KeymapState): void {
  state.countBuffer = ""
  state.pendingOperator = null
  state.pendingMotion = null
}

/**
 * Create a fresh keymap state object.
 */
export function createKeymapState(): KeymapState {
  return { countBuffer: "", pendingOperator: null, pendingMotion: null }
}
