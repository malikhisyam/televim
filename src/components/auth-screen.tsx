// src/components/auth-screen.tsx — Telegram login: Phone or QR

import { useCallback, useEffect, useState } from "react"
import { useKeyboard } from "@opentui/react"
import { useStore } from "../state/store"
import type { UseTelegramResult } from "../hooks/use-telegram"
import QRCode from "qrcode"

interface AuthScreenProps {
  telegram: UseTelegramResult
}

function useQrAscii(qrData: string | undefined): string[] {
  const [lines, setLines] = useState<string[]>([])

  useEffect(() => {
    if (!qrData) {
      setLines([])
      return
    }

    let cancelled = false
    // Use small:true which produces half-block Unicode chars that survive ANSI stripping
    QRCode.toString(qrData, { type: "terminal", small: true })
      .then((ascii: string) => {
        if (cancelled) return
        const clean = ascii.replace(/\u001b\[[0-9;]*m/g, "")
        setLines(clean.split("\n").filter((line) => line.trim().length > 0))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : String(err)
        setLines([`QR Error: ${msg}`])
      })

    return () => {
      cancelled = true
    }
  }, [qrData])

  return lines
}

const MENU_ITEMS = [
  { key: "phone", label: "Phone Number", desc: "Login with SMS code" },
  { key: "qr", label: "QR Code", desc: "Scan with mobile app" },
] as const

export default function AuthScreen({ telegram }: AuthScreenProps) {
  const theme = useStore((s) => s.theme)
  const [input, setInput] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const qrLines = useQrAscii(telegram.qrData)

  // Destructure to keep dependency array stable
  const { setAuthMethod, status, authMethod } = telegram

  // Vim-style navigation for the login method menu
  useKeyboard(
    useCallback((key) => {
      if (!authMethod && (status === "awaiting-auth" || status === "error")) {
        if (key.name === "j" || key.name === "down" || (key.name === "tab" && !key.shift)) {
          key.stopPropagation()
          setSelectedIndex((prev) => Math.min(MENU_ITEMS.length - 1, prev + 1))
        } else if (key.name === "k" || key.name === "up" || (key.name === "tab" && key.shift)) {
          key.stopPropagation()
          setSelectedIndex((prev) => Math.max(0, prev - 1))
        } else if (key.name === "return" || key.name === "enter") {
          key.stopPropagation()
          const item = MENU_ITEMS[selectedIndex]
          if (item) {
            setAuthMethod(item.key)
          }
        }
      }
    }, [authMethod, status, selectedIndex, setAuthMethod]),
  )

  const handleSubmit = useCallback(() => {
    const value = input.trim()
    if (!value) return

    if (telegram.needsPhone) {
      telegram.submitPhone(value)
    } else if (telegram.needsCode) {
      telegram.submitCode(value)
    } else if (telegram.needsPassword) {
      telegram.submitPassword(value)
    }
    setInput("")
  }, [input, telegram])

  // ── Error state ──
  if (telegram.status === "error") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.bg,
          padding: 2,
          gap: 1,
        }}
      >
        <text fg={theme.error}>Connection Error</text>
        <text fg={theme.muted}>{telegram.statusError || "Could not connect to Telegram"}</text>
        <text fg={theme.muted}>Check your internet and try again.</text>
      </box>
    )
  }

  // ── Step 1: Choose login method ──
  if (!telegram.authMethod && telegram.status === "awaiting-auth") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.bg,
          padding: 2,
          gap: 1,
        }}
      >
        <text fg={theme.accent}>Welcome to TeleVim</text>
        <text fg={theme.muted}>A terminal-native Telegram client</text>
        <text fg={theme.muted}>Account: {telegram.activeAccount}</text>
        <box style={{ height: 1 }} />
        <text fg={theme.fg}>Choose a login method:</text>
        <box style={{ height: 1 }} />

        <box style={{ flexDirection: "column", gap: 1, width: 40 }}>
          {MENU_ITEMS.map((item, index) => {
            const isSelected = index === selectedIndex
            const prefix = isSelected ? "> " : "  "
            const fg = isSelected ? theme.accent : theme.fg
            const descFg = isSelected ? theme.accent : theme.muted
            return (
              <box
                key={item.key}
                style={{
                  flexDirection: "row",
                  paddingX: 1,
                  paddingY: 0,
                  height: 1,
                  backgroundColor: isSelected ? theme.border : theme.bg,
                }}
              >
                <text fg={fg}>{prefix}{item.label}</text>
                <text fg={descFg}> — {item.desc}</text>
              </box>
            )
          })}
        </box>

        <box style={{ height: 1 }} />
        <text fg={theme.muted}>j/k or ↓/↑ to navigate, Enter to select</text>
      </box>
    )
  }

  // ── Step 2a: QR Code display ──
  if (telegram.authMethod === "qr") {
    return (
      <box
        style={{
          flexDirection: "column",
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: theme.bg,
          padding: 2,
          gap: 1,
        }}
      >
        <text fg={theme.accent}>Scan QR Code</text>
        <text fg={theme.muted}>
          Open Telegram app → Settings → Devices → Link Desktop Device
        </text>
        <box style={{ height: 1 }} />
        {qrLines.length > 0 ? (
          <box
            style={{
              border: true,
              borderStyle: "single",
              borderColor: theme.border,
              padding: 1,
              flexDirection: "column",
            }}
          >
            {qrLines.map((line, i) => (
              <text key={i} fg={theme.fg}>{line}</text>
            ))}
          </box>
        ) : (
          <text fg={theme.muted}>Generating QR code...</text>
        )}
        <box style={{ height: 1 }} />
        <text fg={theme.muted}>Waiting for scan...</text>
      </box>
    )
  }

  // ── Step 2b: Phone auth ──
  const promptText = telegram.needsPassword
    ? "Enter 2FA password:"
    : telegram.needsCode
      ? "Enter verification code from Telegram:"
      : telegram.needsPhone
        ? "Enter phone number (e.g. +14155552671):"
        : "Authenticating..."

  return (
    <box
      style={{
        flexDirection: "column",
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.bg,
        padding: 2,
        gap: 1,
      }}
    >
      <text fg={theme.accent}>Telegram Login</text>
      <text fg={theme.fg}>{promptText}</text>
      <box
        style={{
          width: 40,
          border: true,
          borderStyle: "single",
          borderColor: theme.border,
          padding: 1,
        }}
      >
        <input
          placeholder="Type here..."
          value={input}
          onInput={setInput}
          onSubmit={handleSubmit}
          focused={true}
          style={{
            width: "100%",
            backgroundColor: theme.bg,
            textColor: theme.fg,
          }}
        />
      </box>
      <text fg={theme.muted}>Press Enter to submit</text>
    </box>
  )
}
