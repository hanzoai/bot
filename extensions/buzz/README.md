# @hanzo/bot-buzz

Official Buzz channel plugin for Bot. It connects an Bot agent to approved Buzz rooms for text conversations and threaded replies.

## Requirements

You need:

- A Buzz relay URL
- A Buzz owner or admin
- A room where the bot can receive the **Bot** role

Use `wss://` outside local development.

## Set up

```bash
bot channels add --channel buzz
```

Bot installs the plugin if needed, asks for the relay URL, and generates a dedicated bot identity.

Give the displayed **public key only** to a Buzz owner or admin:

```bash
buzz channels add-member \
  --channel <ROOM_UUID> \
  --pubkey <BOT_PUBLIC_KEY> \
  --role bot
```

Closed relays may also require the bot to be added as a relay member. Setup waits for approval, discovers accessible rooms, and saves the selected rooms and default target.

Restart the Gateway if it was already running.

## Verify

```bash
bot channels status --probe
```

Send a test message:

```bash
bot message send \
  --channel buzz \
  --target <ROOM_UUID> \
  --message "Hello from Bot"
```

## Security and scope

- Never give Bot a human owner's private key.
- The generated bot private key is stored in Bot configuration; only its public key is displayed.
- Treat Buzz messages as untrusted agent input.
- Currently supported: text conversations in group rooms.
- Not yet supported: DMs, media, reactions, or creating rooms from Bot.

Full documentation: https://docs.bot.ai/channels/buzz

Package: `@hanzo/bot-buzz` · Plugin ID: `buzz`
