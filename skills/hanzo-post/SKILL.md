---
name: hanzo-post
description: "Manage, connect, automate, schedule, publish, and analyze social media & CMS channels across Hanzo AI and employee accounts via Hanzo Post (post.hanzo.ai) MCP, CLI (hanzo-post), and Public REST API."
metadata:
  {
    "bot":
      {
        "requires": { "bins": ["node"] },
        "install":
          [
            {
              "id": "npm",
              "kind": "npm",
              "package": "@hanzo/post",
              "label": "Install Hanzo Post CLI & SDK (@hanzo/post)",
            },
          ],
      },
  }
---

# Hanzo Post — Unified Social & Content Automation (`post.hanzo.ai`)

Manage company brand channels and opted-in employee personal accounts (LinkedIn, X, Facebook, Instagram, Threads, YouTube, Bluesky, Discord, Slack, Telegram, Reddit, Mastodon, Dev.to, Hashnode, Medium, and Hanzo CMS) from one control plane:

- **Web UI**: `https://post.hanzo.ai` (Hanzo IAM SSO via `hanzo.id` for `@hanzo.ai`, `@lux.network`, `@zoo.ngo`, `@hanzo.team`)
- **MCP Server**: `https://post.hanzo.ai/api/mcp/<HANZO_POST_API_KEY>` (or OAuth DCR `/mcp-oauth-dynamic`)
- **REST API**: `https://post.hanzo.ai/api/public/v1` (`Authorization: <HANZO_POST_API_KEY>`)
- **CLI / SDK**: `hanzo-post` (`@hanzo/post`)

## Employee Social Linking & Grouping (`hanzo.bot` / `hanzo.team`)

Every Hanzo team member can link their social accounts in **two ways**:

1. **1-Click OAuth Link (via Bot, Chat, or CLI — no dashboard visit needed)**:
   - Call MCP `connectChannelLinkTool({ platform: "linkedin", group: "Jane Doe", redirectUrl: "https://hanzo.team" })`
   - Or CLI: `hanzo-post connect linkedin --group "Jane Doe"`
   - Or API: `GET https://post.hanzo.ai/api/public/v1/social/linkedin?group=Jane%20Doe`
   - When the employee clicks **Allow** on LinkedIn / X / Meta / YouTube, Hanzo Post stores the OAuth token in `org-hanzo-ai` and **automatically assigns the channel to their employee group (`customer = "Jane Doe"`)**.
2. **Self-Service Web UI (`https://post.hanzo.ai`)**:
   - Sign in with **Hanzo** (`hanzo.id`) — verified `@hanzo.ai`, `@lux.network`, `@zoo.ngo`, and `@hanzo.team` accounts automatically join `org-hanzo-ai` with channel-connect and scheduling permissions.
   - Click **Add Channel**, connect personal LinkedIn / X / Instagram / Facebook, and group under their name.

## MCP Tools (`hanzo-post`)

- `integrationList({ group? })` — List connected & pending channels (optionally filtered by employee/brand group ID)
- `groupList({})` — List all brand and employee channel groups
- `assignChannelGroupTool({ integrationId, groupName })` — Assign a channel to an employee or brand group
- `connectChannelLinkTool({ platform, group?, refresh?, externalUrl?, redirectUrl? })` — Mint a 1-click OAuth URL for any employee or brand channel
- `integrationSchema({ platform })` — Inspect platform character limits and required settings before posting
- `integrationSchedulePostTool(...)` — Publish immediately (`type: "now"`), schedule (`type: "schedule"`), or save draft (`type: "draft"`)
- `postsListTool({ startDate, endDate, customer? })` — Audit queued, draft, published, and errored posts
- `channelAnalyticsTool({ integrationId?, postId?, days })` — Fetch 7/30/90-day channel or post engagement analytics
- `uploadFromUrlTool({ url })` / `mediaListTool` — Upload or reuse S3 media (`https://post.hanzo.ai/uploads/...`)
- `autopostListTool` / `autopostManageTool` — Configure RSS/webhook auto-posting pipelines

## CLI Usage (`hanzo-post`)

```bash
export HANZO_POST_API_KEY="<org-api-key>"

# List all channels (or filter by employee group)
hanzo-post channels
hanzo-post channels --group "Antje Worring"

# Generate a 1-click OAuth link for an employee
hanzo-post connect linkedin --group "Zach Kelling"
hanzo-post connect x --group "Antje Worring"

# Publish immediately or schedule
hanzo-post publish --channel <channelId> --text "<p>Shipping Zen6 Flash today.</p>" --type now
hanzo-post publish --channel <channelId> --text "<p>Weekly update</p>" --date 2026-11-12T17:00:00Z

# Reporting & analytics
hanzo-post analytics <channelId> --days 30
hanzo-post post-analytics <postId> --days 7
hanzo-post posts --startDate 2026-11-10T00:00:00Z --endDate 2026-11-17T00:00:00Z
```

## REST API Quick Reference

```bash
# List channels (includes connected & refreshNeeded status + customer group)
curl -sH "Authorization: $HANZO_POST_API_KEY" https://post.hanzo.ai/api/public/v1/integrations

# Generate 1-click OAuth link with automatic employee grouping
curl -sH "Authorization: $HANZO_POST_API_KEY" \
  "https://post.hanzo.ai/api/public/v1/social/linkedin?group=Antje%20Worring"

# Fetch channel analytics (7, 30, or 90 days)
curl -sH "Authorization: $HANZO_POST_API_KEY" \
  "https://post.hanzo.ai/api/public/v1/analytics/<channelId>?date=30"
```
