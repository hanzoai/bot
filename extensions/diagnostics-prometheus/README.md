# @hanzo/bot-diagnostics-prometheus

Official Prometheus diagnostics exporter for Bot.

This plugin exposes Bot Gateway runtime metrics in Prometheus text format for Prometheus, Grafana, VictoriaMetrics, and compatible scrapers.

## Install

```bash
bot plugins install @hanzo/bot-diagnostics-prometheus
```

Restart the Gateway after installing or updating the plugin.

## Configure

Enable the plugin and set the scrape endpoint options in `plugins.entries.diagnostics-prometheus.config`.

The full config surface, metric names, and scrape examples live in the docs:

- https://docs.bot.ai/gateway/prometheus

## Package

- Plugin id: `diagnostics-prometheus`
- Package: `@hanzo/bot-diagnostics-prometheus`
- Minimum Bot host: `2026.4.25`
