---
summary: "CLI reference for `bot clawbot` (legacy alias namespace)"
read_when:
  - You maintain older scripts using `bot clawbot ...`
  - You need migration guidance to current commands
title: "Clawbot"
---

# `bot clawbot`

Legacy alias namespace kept for backward compatibility. It registers the same QR command as the top-level CLI, so `bot clawbot qr` accepts every [`bot qr`](/cli/qr) flag.

## Migration

Prefer the modern top-level command:

- `bot clawbot qr` -> `bot qr`

## Related

- [CLI reference](/cli)
