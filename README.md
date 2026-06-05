# televim

> A Vim-inspired terminal UI for Telegram — fast, modal, and distraction-free messaging for keyboard power users.

![version](https://img.shields.io/npm/v/televim)
![license](https://img.shields.io/npm/l/televim)

## Features

- **Vim motions** — `j`/`k` navigate chats, `J`/`K` navigate messages, `Enter` opens
- **Modal editing** — Normal, Insert, Visual, Command, and Search modes
- **Fuzzy search** — `/` to search chats, `s` for global message search
- **Real-time updates** — Live message streaming via MTProto
- **Keyboard-first** — Every action reachable without a mouse
- **Discord-like dark theme** — Terminal-native aesthetic
- **Multi-account support** — Switch between Telegram accounts
- **Forum / threads** — Expandable topic lists in groups
- **Message actions** — Reply, edit, forward, pin, delete, react
- **File attachments** — Send photos, videos, documents
- **Cloak mode** — Hide read receipts and last-seen status
- **Desktop notifications** — Native alerts via OSC sequences

## Requirements

- [Bun](https://bun.sh) >= 1.0.0 (OpenTUI is Bun-exclusive)

## Installation

```bash
# Via npm (requires Bun runtime)
npm install -g televim

# Via bun
bun install -g televim

# Run directly
npx televim
```

## Usage

```bash
# Start the app
televim

# Development mode
bun run dev
```

## Authentication

TeleVim supports three auth methods:

1. **Phone number** — Enter phone → SMS code → optional 2FA password
2. **QR code** — Scan ASCII QR with mobile Telegram app
3. **Existing session** — Auto-connects if `~/.config/televim/session.txt` exists

## Keybindings

### Normal Mode
| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous chat |
| `J` / `K` | Next / previous message |
| `Enter` | Open selected chat |
| `i` | Enter Insert mode |
| `v` | Enter Visual mode |
| `:` | Enter Command mode |
| `/` | Enter Search mode |
| `s` | Global message search |
| `yy` | Copy selected message |
| `dd` | Delete selected message |
| `r` | Reply to message |
| `?` | Show help |
| `q` | Quit |

### Insert Mode
| Key | Action |
|-----|--------|
| `Enter` | Send message |
| `Esc` | Return to Normal |

### Command Mode
| Command | Action |
|---------|--------|
| `:q` | Quit |
| `:theme` | Cycle theme |
| `:cloak` | Toggle cloak mode |
| `:notify` | Toggle notifications |
| `:search <query>` | Search messages in current chat |
| `:searchglobal <query>` | Search messages globally |
| `:attach <path>` | Attach file |
| `:pasteimage` | Paste image from clipboard |
| `:account <name>` | Switch account |
| `:accounts` | List accounts |
| `:addaccount <name>` | Add new account |
| `:removeaccount <name>` | Remove account |
| `:contact <query>` | Search contacts |
| `:download` | Download selected media |
| `:privacy <nobody\|contacts\|anybody>` | Set last seen privacy |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Framework**: [OpenTUI](https://opentui.dev) — native terminal UI with React bindings
- **Language**: TypeScript / TSX
- **State**: Zustand v5
- **Telegram**: gram-js MTProto client

## License

MIT
