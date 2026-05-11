# bot-core

> Language-agnostic spec for the Hanzo Bot. One runtime per language, one contract.

This repo is the canonical contract every Hanzo Bot runtime implements. Same
pattern as ZAP: `zap-proto/spec` defines the wire format, and every language
port (`zap-proto/c`, `zap-proto/cpp`, `zap-proto/go`, `zap-proto/py`,
`zap-proto/rust`, …) implements it. Here, [`spec.md`](./spec.md) defines the bot
contract — channels, router, brain hooks, billing, lifecycle — and every port
implements it.

## Runtimes

| Port | Repo | Status |
|---|---|---|
| TypeScript (canonical reference) | [`hanzoai/bot`](https://github.com/hanzoai/bot) | live, OpenClaw fork |
| Go | [`hanzoai/bot-go`](https://github.com/hanzoai/bot-go) | scaffold |
| Rust | `hanzoai/bot-rust` | planned |
| C++ | `hanzoai/bot-cpp` | planned |
| Python SDK | [`hanzoai/python-sdk/pkg/hanzo-memory`](https://github.com/hanzoai/python-sdk) (brain + recipes ported) | partial |

## What's defined

- Process layout (gateway, message router, channel adapters, brain, billing)
- Canonical artifact paths under `~/.hanzo/`
- Channel adapter trait + subprocess plugin protocol (any-language adapters)
- BrainStore trait + schema (`pages`, `edges`, `facts`, FTS5)
- Graph-links extractor (zero-LLM, six edge types, normative regex set)
- Recipe runner + YAML schema
- BillingGate contract
- MCP tool surface (HIP-0300 13 tools)
- Wire protocol — ZAP for everything internal

## What ports MUST agree on

- `~/.hanzo/brain/brain.db` schema (SQLite spec is the source of truth)
- Graph-links regex set + slugify algorithm
- Recipe YAML keys and semantics
- ZAP wire format for inter-runtime messaging

A bot.db written by `bot-ts` MUST be readable by `bot-go`, `bot-rust`, `bot-cpp`.

## License

MIT. Brand and infra references are Apache 2 / BSD-3 / MIT depending on the
upstream — see each port's repo for its license.
