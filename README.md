# OpenClaw Channel Talk Plugin (Unofficial)

> ⚠️ **Unofficial Plugin** — This is a community-built, unofficial Channel Talk plugin for [OpenClaw](https://github.com/openclaw/openclaw). It is not affiliated with, endorsed by, or supported by [Channel Corp](https://channel.io) or the OpenClaw team.

Channel Talk (채널톡) Team Chat channel plugin for OpenClaw. Enables your OpenClaw AI agent to receive and respond to messages in Channel Talk Team Chat groups.

## Features

- 📥 **Webhook-based inbound** — Receives team chat messages via Channel Talk webhook events
- 📤 **REST API outbound** — Sends replies through Channel Talk Open API v5
- 🔄 **Duplicate detection** — In-memory message ID cache (60s TTL) prevents duplicate processing
- 🔁 **Automatic retry** — Retries on 429/5xx errors with exponential backoff (1s, 3s)
- 🤖 **Bot filtering** — Automatically ignores bot-originated messages to prevent loops
- 🏷️ **Bot identity** — Sends replies as bot with configurable display name (`botName`)

## Scope

This plugin supports **Team Chat only** (internal group messaging between managers/staff). User Chat (customer-facing) is not currently supported.

## Prerequisites

- [OpenClaw](https://github.com/openclaw/openclaw) installed and running
- A Channel Talk account with API credentials
- A publicly accessible URL for webhook delivery (e.g., via [Tailscale Funnel](https://tailscale.com/kb/1223/funnel), [ngrok](https://ngrok.com), or a reverse proxy)

## Setup

### 1. Create Channel Talk API Credentials

1. Log in to [Channel Desk](https://desk.channel.io)
2. Go to **Settings** → **API Key Management** → **Create new credential**
3. Note down the **Access Key** and **Access Secret**

For more details, see the [Channel Talk authentication docs](https://developers.channel.io/docs/authentication-2).

### 2. Install the Plugin

**From local checkout:**

```bash
openclaw plugins install /path/to/openclaw-channel-talk
```

**Or copy to extensions directory:**

```bash
cp -r openclaw-channel-talk ~/.openclaw/extensions/channel-talk
cd ~/.openclaw/extensions/channel-talk && npm install
```

### 3. Configure OpenClaw

Add the channel configuration to your OpenClaw config (`~/.openclaw/openclaw.json`):

```jsonc
{
  "channels": {
    "channel-talk": {
      "enabled": true,
      "accessKey": "<YOUR_ACCESS_KEY>",
      "accessSecret": "<YOUR_ACCESS_SECRET>",
      "botName": "OpenClaw",          // optional: display name for sent messages
      "groupPolicy": "open",          // "open" = all groups, "closed" = none
      "webhook": {
        "port": 3979,                 // optional, default: 3979
        "path": "/api/channel-talk"   // optional, default: /api/channel-talk
      }
    }
  }
}
```

You can also use environment variables:

| Variable | Description |
|----------|-------------|
| `CHANNEL_TALK_ACCESS_KEY` | Channel Talk access key |
| `CHANNEL_TALK_ACCESS_SECRET` | Channel Talk access secret |

### 4. Expose the Webhook Endpoint

Channel Talk needs to reach your webhook endpoint. Choose one:

**Option A: Tailscale Funnel (recommended for self-hosted)**
```bash
tailscale funnel 3979
# Your URL: https://your-machine.tail1234.ts.net
```

**Option B: ngrok**
```bash
ngrok http 3979
# Copy the https URL, e.g., https://abc123.ngrok.io
```

**Option C: Reverse proxy (production)**
Configure your web server (nginx, Caddy, etc.) to proxy to `localhost:3979`.

### 5. Register the Webhook in Channel Talk

Register a webhook in Channel Talk to forward team chat messages to your endpoint.

**Via Channel Talk API:**
```bash
curl -X POST https://api.channel.io/open/v5/webhooks \
  -H "x-access-key: <YOUR_ACCESS_KEY>" \
  -H "x-access-secret: <YOUR_ACCESS_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenClaw",
    "url": "https://<YOUR_PUBLIC_URL>/api/channel-talk",
    "scopes": ["message.created.teamChat"],
    "apiVersion": "v5"
  }'
```

**Note:** The webhook creation response includes a `token` field that can be used for request verification (not yet implemented in this plugin).

### 6. Start OpenClaw

```bash
openclaw gateway start
# or
openclaw gateway restart
```

The plugin will automatically start the webhook server on the configured port.

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `accessKey` | string | *required* | Channel Talk API access key |
| `accessSecret` | string | *required* | Channel Talk API access secret |
| `botName` | string | — | Display name for bot messages |
| `groupPolicy` | `"open"` \| `"closed"` | `"open"` | Whether to accept messages from all groups |
| `webhook.port` | number | `3979` | HTTP server port for webhook |
| `webhook.path` | string | `"/api/channel-talk"` | URL path for webhook endpoint |

## Architecture

```
Channel Talk                    OpenClaw
┌──────────────┐     webhook    ┌─────────────────────┐
│  Team Chat   │ ──────────→   │  Webhook Handler     │
│  (Group)     │   POST event  │  (webhook.ts)        │
│              │               │    ↓                  │
│              │               │  Dedup + Filter       │
│              │               │    ↓                  │
│              │               │  OpenClaw Agent       │
│              │   REST API    │    ↓                  │
│  ← reply ── │ ←──────────── │  API Client           │
│              │   POST msg    │  (api-client.ts)      │
└──────────────┘               └─────────────────────┘
```

### Webhook Events

The plugin listens for `message.created.teamChat` events and filters:
- ✅ Team chat (`chatType=group`) messages with text content
- ❌ Bot messages (prevents reply loops)
- ❌ Empty messages
- ❌ Non-group messages
- ❌ Duplicate messages (60s window)

### Outbound Messages

Replies are sent via `POST /open/v5/groups/{groupId}/messages` with:
- `plainText` — Message content (auto-chunked for long messages)
- `botName` query parameter — Sets the bot display name

> **Note:** `actAsManager` option is **not available** for Team Chat. Messages are sent as bot type.

## File Structure

```
openclaw-channel-talk/
├── openclaw.plugin.json     # Plugin manifest
├── package.json             # Dependencies & metadata
├── tsconfig.json            # TypeScript config
├── index.ts                 # Entry point (registers channel plugin)
├── src/
│   ├── channel.ts           # ChannelPlugin interface implementation
│   ├── config-schema.ts     # Config validation schema (TypeBox)
│   ├── webhook.ts           # Webhook HTTP server & event handler
│   ├── api-client.ts        # Channel Talk REST API client (v5)
│   ├── send.ts              # Outbound message helper
│   ├── runtime.ts           # OpenClaw runtime accessor
│   └── types.ts             # TypeScript type definitions
└── ref/
    └── channel-swagger.json # Channel Talk API reference (for dev)
```

## Troubleshooting

### Webhook not receiving events
- Verify your public URL is accessible: `curl https://<YOUR_URL>/api/channel-talk`
- Check that the webhook is registered: `curl -H "x-access-key: ..." -H "x-access-secret: ..." https://api.channel.io/open/v5/webhooks`
- Ensure the webhook scope includes `message.created.teamChat`

### Bot not responding
- Check OpenClaw gateway logs for `[channel-talk]` prefixed messages
- Verify API credentials are correct (test with a direct API call)
- Ensure `groupPolicy` is set to `"open"` (or configure allowlists)

### Duplicate messages
- The plugin uses a 60-second dedup window. If Channel Talk retries rapidly, duplicates are dropped.
- Check logs for `skipping duplicate message` entries.

## Channel Talk API Reference

- [Authentication](https://developers.channel.io/docs/authentication-2)
- [Open API Documentation](https://api-doc.channel.io)
- [Webhook Reference](https://developers.channel.io/docs)

## License

MIT

---

*Built by the community for [OpenClaw](https://github.com/openclaw/openclaw). Not officially supported by Channel Corp or the OpenClaw team.*
