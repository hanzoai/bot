---
summary: "WeChat channel setup through the external bot-weixin plugin"
read_when:
  - You want to connect Bot to WeChat or Weixin
  - You are installing or troubleshooting the bot-weixin channel plugin
  - You need to understand how external channel plugins run beside the Gateway
title: "WeChat"
---

Bot connects to WeChat through Tencent's external
`@tencent-weixin/bot-weixin` channel plugin.

Status: external plugin, maintained by the Tencent Weixin team. Direct chats and
media are supported. Group chats are not advertised by the plugin capability
metadata (it declares direct chats only).

## Naming

- **WeChat** is the user-facing name in these docs.
- **Weixin** is the name used by Tencent's package and by the plugin id.
- `bot-weixin` is the Bot channel id (`weixin` and `wechat` work as aliases).
- `@tencent-weixin/bot-weixin` is the npm package.

Use `bot-weixin` in CLI commands and config paths.

## How it works

The WeChat code does not live in the Bot core repo. Bot provides the
generic channel plugin contract, and the external plugin provides the
WeChat-specific runtime:

1. `bot plugins install` installs `@tencent-weixin/bot-weixin`.
2. The Gateway discovers the plugin manifest and loads the plugin entrypoint.
3. The plugin registers channel id `bot-weixin`.
4. `bot channels login --channel bot-weixin` starts QR login.
5. The plugin stores account credentials under the Bot state directory
   (`~/.bot` by default).
6. When the Gateway starts, the plugin starts its Weixin monitor for each
   configured account.
7. Inbound WeChat messages are normalized through the channel contract, routed to
   the selected Bot agent, and sent back through the plugin outbound path.

That separation matters: Bot core stays channel-agnostic. WeChat login,
Tencent iLink API calls, media upload/download, context tokens, and account
monitoring are owned by the external plugin.

## Install

Quick install:

```bash
npx -y @tencent-weixin/bot-weixin-cli install
```

Manual install:

```bash
bot plugins install "@tencent-weixin/bot-weixin"
bot config set plugins.entries.bot-weixin.enabled true
```

Restart the Gateway after install:

```bash
bot gateway restart
```

## Login

Run QR login on the same machine that runs the Gateway:

```bash
bot channels login --channel bot-weixin
```

Scan the QR code with WeChat on your phone and confirm the login. The plugin saves
the account token locally after a successful scan.

To add another WeChat account, run the same login command again. For multiple
accounts, isolate direct-message sessions by account, channel, and sender:

```bash
bot config set session.dmScope per-account-channel-peer
```

## Access control

Direct messages use the normal Bot pairing and allowlist model for channel
plugins.

Approve new senders:

```bash
bot pairing list bot-weixin
bot pairing approve bot-weixin <CODE>
```

For the full access-control model, see [Pairing](/channels/pairing).

## Compatibility

The plugin checks the host Bot version at startup.

| Plugin line | Bot version                                                | npm tag  |
| ----------- | --------------------------------------------------------------- | -------- |
| `2.x`       | `>=2026.5.12` (current 2.4.6; early 2.x accepted `>=2026.3.22`) | `latest` |
| `1.x`       | `>=2026.1.0 <2026.3.22`                                         | `legacy` |

If the plugin reports that your Bot version is too old, either update
Bot or install the legacy plugin line:

```bash
bot plugins install @tencent-weixin/bot-weixin@legacy
```

## Sidecar process

The WeChat plugin can run helper work beside the Gateway while it monitors the
Tencent iLink API. In issue #68451, that helper path exposed a bug in Bot's
generic stale-Gateway cleanup: a child process could try to clean up the parent
Gateway process, causing restart loops under process managers such as systemd.

Current Bot startup cleanup excludes the current process and its ancestors,
so a channel helper cannot kill the Gateway that launched it. This fix is
generic; it is not a WeChat-specific path in core.

## Troubleshooting

Check install and status:

```bash
bot plugins list
bot channels status --probe
bot --version
```

If the channel shows as installed but does not connect, confirm that the plugin is
enabled and restart:

```bash
bot config set plugins.entries.bot-weixin.enabled true
bot gateway restart
```

If the Gateway restarts repeatedly after enabling WeChat, update both Bot and
the plugin:

```bash
npm view @tencent-weixin/bot-weixin version
bot plugins install "@tencent-weixin/bot-weixin" --force
bot gateway restart
```

If startup reports that the installed plugin package `requires compiled runtime
output for TypeScript entry`, the npm package was published without the compiled
JavaScript runtime files Bot needs. Update/reinstall after the plugin
publisher ships a fixed package, or temporarily disable/uninstall the plugin.

Temporary disable:

```bash
bot config set plugins.entries.bot-weixin.enabled false
bot gateway restart
```

## Related docs

- Channel overview: [Chat Channels](/channels)
- Pairing: [Pairing](/channels/pairing)
- Channel routing: [Channel Routing](/channels/channel-routing)
- Plugin architecture: [Plugin Architecture](/plugins/architecture)
- Channel plugin SDK: [Channel Plugin SDK](/plugins/sdk-channel-plugins)
- External package: [@tencent-weixin/bot-weixin](https://www.npmjs.com/package/@tencent-weixin/bot-weixin)
