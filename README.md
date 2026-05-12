# bot

> Hanzo Bot — the entry point to every Hanzo runtime, SDK, and channel.

This repo is the **wrapper**. The actual bot runtimes live in
[`hanzobot`](https://github.com/hanzobot):

| Runtime | Repo | Install |
|---|---|---|
| TypeScript (canonical) | [`hanzobot/ts`](https://github.com/hanzobot/ts) | `npm install -g @hanzo/bot` |
| Go (single static binary) | [`hanzobot/go`](https://github.com/hanzobot/go) | `go install github.com/hanzobot/go/cmd/hanzo-bot@latest` |
| C++ (header-only, embeddable) | [`hanzobot/cpp`](https://github.com/hanzobot/cpp) | `cmake -S . -B build && cmake --build build` |
| Spec (language-agnostic) | [`hanzobot/core`](https://github.com/hanzobot/core) | reference / contract |

A `~/.hanzo/brain/brain.db` written by any runtime is byte-identical to
one written by every other. Same schema, same FTS5, same wallet
addresses (BLAKE3 via [`luxfi/blake3`](https://github.com/luxfi/blake3)).

## The whole ecosystem

```
hanzoai/bot               ← you are here (entry / wrapper)
├── hanzobot/ts           ← TS canonical, ships @hanzo/bot meta-pack
├── hanzobot/go           ← Go runtime, single static binary
├── hanzobot/cpp          ← C++17 header-only
├── hanzobot/core         ← language-agnostic spec
│
├── hanzoai/brain         ← 5-runtime brain monorepo (algorithms)
├── hanzoai/mcp           ← Model Context Protocol server (Rust mirror of brain)
├── hanzoai/python-sdk    ← hanzo-memory + hanzo-tools-* (entry-point discovery)
├── hanzoai/iam           ← identity / SSO / OAuth2 / API keys
├── hanzoai/kms           ← secret management
├── hanzoai/agents        ← multi-agent control plane
├── hanzoai/operator      ← K8s CRDs (Brain, Bot, KMSSecret, …)
│
├── hanzonet/genesis      ← Hanzo Network chain genesis
├── hanzonet/explore      ← block explorer
├── hanzonet/bridge       ← MPC + Teleport cross-chain
├── hanzonet/exchange     ← DEX AMM
├── hanzonet/faucet       ← testnet faucet
└── hanzonet/wallet       ← canonical wallet

luxfi/pq                  ← strict post-quantum profile
luxfi/blake3              ← canonical BLAKE3 (C + Rust)
luxfi/crypto/blake3       ← Go BLAKE3 (zeebo wrapper + GPU batch)
luxcpp/blake3-reference   ← vendored C reference impl
```

## Quick start

```bash
# TypeScript canonical (multi-channel, mobile apps, 30+ adapters):
npm install -g @hanzo/bot
hanzo-bot serve

# Go (server / embedded):
go install github.com/hanzobot/go/cmd/hanzo-bot@latest
hanzo-bot brain init
hanzo-bot brain ingest README.md
hanzo-bot brain search "founded"

# Python (memory + tools):
pip install hanzo-memory

# Rust (via hanzo-mcp):
cargo add hanzo-mcp
```

## Brain is the substrate

Every runtime hosts the same `BrainStore` contract: pages + edges +
facts + FTS5 hybrid search. Wallet-style content-addressable ids
(`hanzo:UFC8qCW8LRUmpfyRq2qnAvYi11cqftY3b`) are byte-identical across
all five runtimes — BLAKE3, base58check.

See [`hanzoai/brain`](https://github.com/hanzoai/brain) for the
algorithm surface (RRF + RSF + MMR + dedup + Unicode script detection
+ MRL truncation + UUIDv7 + WebVTT/SRT/RTTM + …).

## Strict post-quantum

The Lux EVM gates every classical precompile through
[`luxfi/pq`](https://github.com/luxfi/pq). Chains that install
`pq.Strict()` refuse ecrecover, sha256, ripemd160, blake2F, BN254
pairing, BLS12-381 pairing, and KZG point evaluation; PQ-native
primitives (ML-KEM, ML-DSA, SLH-DSA, Pulsar, P3Q) stay enabled.

Strict profile hash (consensus contract):
```
9efdbf424085b0557866c22b0a4e0c48e2ed90c8c9e3f699d17a3e0783cb2128
```

## License

MIT.
