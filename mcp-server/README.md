# televim-mcp

> Model Context Protocol (MCP) server for Telegram — enable AI assistants to send messages, read chats, and automate Telegram workflows.

## Installation

```bash
# Install globally
npm install -g televim-mcp

# Or run directly with npx
npx televim-mcp
```

## Prerequisites

You must authenticate with Telegram first using the TeleVim TUI:

```bash
npx televim
# Or if installed globally:
televim
```

After logging in, the MCP server will reuse the same session.

## Usage

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "telegram": {
      "command": "npx",
      "args": ["televim-mcp"]
    }
  }
}
```

### With Account Selection

If you have multiple accounts:

```json
{
  "mcpServers": {
    "telegram-work": {
      "command": "npx",
      "args": ["televim-mcp", "work"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `get_chat_list` | List all chats (groups, channels, private) |
| `get_messages` | Read recent messages from a chat |
| `send_message` | Send a message (optionally reply to a message) |
| `search_messages` | Search messages in a chat |
| `get_contacts` | List all contacts |
| `mark_as_read` | Mark a chat as read |

## Resources

| Resource | Description |
|----------|-------------|
| `telegram://unread-summary` | Summary of unread messages across all chats |

## Prompts

| Prompt | Description |
|--------|-------------|
| `summarize_unread` | Summarize all unread messages |
| `draft_reply` | Draft a reply to recent messages |

## Multi-Account Support

The MCP server supports multiple Telegram accounts. The default account is `"default"`. To use a different account:

```bash
npx televim-mcp work
npx televim-mcp personal
```

Accounts are shared with the TeleVim TUI and stored in `~/.config/televim/sessions/`.

## Bot Mode

For automation (webhooks, cron jobs), use the HTTP transport option:

```bash
# Coming soon: HTTP server mode
npx televim-mcp --http --port 3000
```

## License

MIT
