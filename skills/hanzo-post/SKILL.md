---
name: hanzo-post
description: "Manage, connect, automate, schedule, publish, and analyze social media & CMS channels across Hanzo AI and employee accounts natively via Hanzo Cloud (/v1/channel, /v1/post), core `hanzo` CLI (`hanzo channels`, `hanzo connect`, `hanzo post`), unified `hanzo` MCP, and the `post.hanzo.ai` Web UI."
metadata: { "bot": { "requires": { "bins": ["hanzo"] } } }
---

# Hanzo Social & Channels — Unified Cloud API, CLI, MCP & Web UI

Manage company brand channels and opted-in employee personal accounts (LinkedIn, X, Facebook, Instagram, Threads, TikTok, YouTube, Bluesky, Discord, Slack, Telegram, Reddit, Mastodon, Nostr, and Hanzo CMS) natively through the unified Hanzo Cloud control plane:

- **Core Cloud API**: `https://api.hanzo.ai/v1/channel` & `https://api.hanzo.ai/v1/post` (native Hanzo IAM Bearer JWT or `HANZO_API_KEY`)
- **Core CLI (`hanzo.sh`)**: `hanzo channels`, `hanzo connect`, `hanzo channel`, and `hanzo post`
- **Unified MCP (`hanzo`)**: `hanzo` MCP `social` subsystem (`get_channel`, `get_channel_groups`, `post_channel_connect`, `put_channel_by_id_group`, `get_channel_by_id_analytics`, `get_post`, `post_post`, `post_post_by_id_publish`, `get_post_by_id_analytics`)
- **Calendar & Composer Web UI**: `https://post.hanzo.ai` (Hanzo IAM SSO via `hanzo.id`; legacy `/api/public/*` routes are retired in favor of `/v1/channel` and `/v1/post`)

## Employee Social Linking & Grouping (`hanzo.bot` / `hanzo.team` / `hanzo` CLI)

Every Hanzo team member can link and automate their social accounts in **two ways**:

1. **1-Click OAuth Link (via CLI, `hanzo.bot`, `hanzo.team`, or MCP — no dashboard setup needed)**:
   - **CLI**:
     ```bash
     hanzo --as hanzo connect linkedin --group "Antje Worring" --open
     hanzo --as hanzo connect x --group "Zach Kelling" --open
     ```
   - **Unified `hanzo` MCP**:
     ```json
     {
       "resource": "social",
       "action": "post_channel_connect",
       "args": {
         "provider": "linkedin",
         "groupName": "Jane Doe",
         "returnUrl": "https://hanzo.team"
       }
     }
     ```
   - **REST API**:
     ```bash
     hanzo --as hanzo auth token | awk '{print "Authorization: Bearer " $0}' | \
       curl -fsSL -H @- -H "Content-Type: application/json" \
         -d '{"provider":"linkedin","groupName":"Jane Doe"}' \
         https://api.hanzo.ai/v1/channel/connect
     ```
   - When the employee approves OAuth on LinkedIn / X / Meta / YouTube, the channel is sealed in Hanzo Cloud & `post.hanzo.ai` and **automatically assigned to their employee group (`groupName = "Jane Doe"`)**.

2. **Self-Service Web UI (`https://post.hanzo.ai`)**:
   - Sign in with **Hanzo** (`hanzo.id`) — `@hanzo.ai`, `@lux.network`, `@zoo.ngo`, and `@hanzo.team` accounts authenticate via native Hanzo IAM (`hanzo-postiz` policy).
   - Click **Add Channel**, connect personal LinkedIn / X / Instagram / Facebook, and group under their name.

## Core `hanzo` CLI Usage

```bash
# List all connected channels (or filter by employee/brand group or provider)
hanzo --as hanzo channels
hanzo --as hanzo channels --group "Antje Worring"
hanzo --as hanzo channels --provider x

# List employee & brand channel groups and provider readiness
hanzo --as hanzo channels groups
hanzo --as hanzo channels providers

# Assign a channel to an employee or brand group
hanzo --as hanzo channels set-group <channelId> "Antje Worring"

# Connect a new channel via OAuth
hanzo --as hanzo connect x --group "Antje Worring" --open
hanzo --as hanzo connect linkedin --group "Hanzo AI" --open

# Publish immediately, schedule, or fan out to an entire group via `/v1/post`
hanzo --as hanzo post create --data '{"accountId":"<channelId>","content":"Shipping Zen6 Flash today.","status":"now"}'
hanzo --as hanzo post create --data '{"group":"Hanzo AI","content":"Weekly release notes are live.","status":"scheduled","scheduleAt":1794500000}'
hanzo --as hanzo post list

# Channel & post engagement analytics
hanzo --as hanzo channels analytics <channelId> --days 30
hanzo --as hanzo post analytics <postId>
```

## Unified `hanzo` MCP (`social` Subsystem)

Use `describe` first when inspecting input schemas (`{ "resource": "describe", "args": { "subsystem": "social", "op": "post_post" } }`):

- `get_channel` — List channels (`?group=...&provider=...`)
- `get_channel_groups` — List all brand & employee channel groups with channel counts and providers
- `get_channel_providers` — Check OAuth credential readiness per social network
- `post_channel_connect` — Mint a 1-click OAuth authorization URL (`{ provider, groupName?, returnUrl? }`)
- `put_channel_by_id_group` — Move a channel into an employee or brand group
- `get_channel_by_id_analytics` — 7/30/90-day channel post & engagement metrics
- `get_post` / `post_post` / `put_post_by_id` / `delete_post_by_id` — List, create/schedule/publish (single channel, `accountIds[]`, or `group` fanout), update, or delete posts
- `post_post_by_id_publish` — Immediately publish a draft or scheduled post
- `get_post_by_id_analytics` — Post-level impressions, likes, clicks, and engagement metrics
