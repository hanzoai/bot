# @hanzo/bot-pixverse-provider

Official PixVerse video generation provider plugin for Bot.

This plugin registers PixVerse as a `video_generate` provider for text-to-video and image-to-video workflows.

## Install

```bash
bot plugins install @hanzo/bot-pixverse-provider
```

Restart the Gateway after installing or updating the plugin.

## Configure

Store your PixVerse API key in Bot config or expose the supported environment variable to the Gateway. Then select PixVerse as a video generation provider.

Full setup and model/provider examples:

- https://docs.bot.ai/providers/pixverse

## Package

- Plugin id: `pixverse`
- Package: `@hanzo/bot-pixverse-provider`
- Minimum Bot host: `2026.5.26`
