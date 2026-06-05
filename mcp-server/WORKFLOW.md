# TeleVim MCP Daemon — OpenCode Workflow

## Architecture

```
Telegram Team Group #ask-ai
    ↓
[TeleVim MCP Daemon] ← listens for @mentions
    ↓
[OpenCode Orchestrator]
    ↓
[Other MCPs: Notion, GitHub, Calendar, etc.]
    ↓
[TeleVim MCP Daemon] ← sends response back
    ↓
Telegram Team Group #ask-ai
```

## Setup

### 1. Start the Daemon

```bash
cd /Users/malikhisyam/Documents/televim/mcp-server
npm run daemon
```

Or in background:
```bash
node dist/index.js daemon default > daemon.log 2>&1 &
```

### 2. Configure OpenCode

Add to `~/.config/opencode/opencode.json`:

```json
{
  "mcp": {
    "telegram-daemon": {
      "type": "local",
      "command": ["node", "/Users/malikhisyam/Documents/televim/mcp-server/dist/index.js", "daemon"]
    }
  }
}
```

### 3. Workflow Example

**Step 1: Connect and start listening**
```
User: "Connect to Telegram daemon and listen to #ask-ai thread"
Agent: Uses connect_daemon + start_listening
```

**Step 2: Check for new messages**
```
User: "Check for new messages in the queue"
Agent: Uses get_unprocessed_messages

Response: [
  {
    "id": 12345,
    "chatId": -1001234567890,
    "chatTitle": "Team Group",
    "senderName": "John",
    "content": "@apriliaintelligence create notion docs for client mkapr",
    "isMention": true,
    "mentionedBot": "apriliaintelligence",
    "intent": {
      "action": "notion.create",
      "target": "client mkapr",
      "parameters": { "title": "client mkapr" },
      "confidence": 0.8
    }
  }
]
```

**Step 3: Execute intent with other MCPs**
```
Agent: Uses Notion MCP to create document
Agent: Uses GitHub MCP to create branch (if needed)
```

**Step 4: Send response back**
```
Agent: Uses send_response_with_buttons

Response: "✅ Created Notion doc for client mkapr: [link]

📋 What else would you like to do?
[Create GitHub branch] [Schedule meeting] [Add to calendar]"
```

**Step 5: Mark processed**
```
Agent: Uses mark_processed(12345)
```

## Use Cases

### 1. Auto-Reply to @mentions
```
User: "@apriliaintelligence create notion docs for client mkapr"
Bot: "✅ Created Notion doc: [link]"
```

### 2. Multi-Step Workflows
```
User: "@apriliaintelligence setup project mkapr"
Bot: "✅ Created:
   - Notion workspace: [link]
   - GitHub repo: [link]
   - Calendar event: [link]
   
   📋 Next steps:
   [Invite team] [Add to Slack] [Create tasks]"
```

### 3. Status Updates
```
User: "@apriliaintelligence status of mkapr"
Bot: "📊 Project mkapr:
   - Notion: 12 pages, 3 incomplete
   - GitHub: 5 open PRs
   - Calendar: 2 meetings this week
   
   📋 Actions:
   [View details] [Send reminder] [Update status]"
```

### 4. Scheduled Actions
```
User: "@apriliaintelligence remind team to submit timesheets every Friday 5pm"
Bot: "✅ Scheduled recurring reminder
   📋 Actions:
   [Edit schedule] [Test now] [View all scheduled]"
```

## HTTP Mode for External Webhooks

### Start HTTP Server
```bash
node dist/index.js http 3000 default
```

### Endpoints
```
GET  /health          → { status: "ok", connected: true }
GET  /messages        → { messages: [...] }
POST /messages        → Mark as processed
POST /send            → Send message
POST /webhook         → External trigger
```

### Example: Webhook from CI/CD
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "chatId": -1001234567890,
    "text": "🚀 Deploy complete for mkapr",
    "replyToId": 12345
  }'
```

## Bot Account Setup

1. Create bot with @BotFather
2. Get bot token
3. Add bot to your team group
4. Promote bot to admin (if needed)
5. Start daemon with bot account

For user account:
1. Run televim TUI first
2. Authenticate with phone
3. Daemon will reuse session

## Advanced Features

### Intent Confidence Threshold
Messages with confidence < 0.7 will ask for clarification:
```
"I'm not sure what you want. Did you mean:
[Create Notion doc] [Search Notion] [Other]"
```

### Multi-Account Support
```bash
# Work account
node dist/index.js daemon work

# Personal account
node dist/index.js daemon personal
```

### Message Templates
Pre-defined responses for common actions:
```
notion.create → "✅ Created Notion doc: {title} [link]"
github.create → "✅ Created GitHub repo: {repo} [link]"
calendar.create → "✅ Scheduled: {event} at {date}"
```

## Monitoring

Check daemon status:
```
Resource: telegram://status

{
  "connected": true,
  "listening": true,
  "account": "default",
  "unprocessedMessages": 3
}
```

## Troubleshooting

1. **"No session found"** → Run televim TUI first
2. **"Bot not detected"** → Check bot username in @BotFather
3. **Messages not showing** → Check if bot is in the group
4. **Slow response** → Daemon keeps connection alive (no reconnect)

## Security Notes

- Session files stored in `~/.config/televim/sessions/` with 0600 permissions
- Bot mode: Use bot token instead of user session
- Rate limiting: Built-in to prevent Telegram API bans
- Approval: MCP host (OpenCode) asks for approval before executing write tools

## Next Steps

1. Add more intent patterns (Jira, Slack, Figma, etc.)
2. Add conversation memory (context across multiple messages)
3. Add file upload support (send documents, images)
4. Add scheduled message support (cron-like)
5. Add analytics dashboard
