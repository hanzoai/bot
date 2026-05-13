# bot

> Ops + orchestration for the Hanzo Bot ecosystem.

This repo doesn't ship code. It wires the pieces that other repos own:

| Concern | Lives in | Ships as |
|---|---|---|
| TypeScript runtime (canonical) | [`hanzobot/core`](https://github.com/hanzobot/core) | npm `@hanzo/bot` |
| Go runtime (single static binary) | [`hanzobot/go`](https://github.com/hanzobot/go) | `go install github.com/hanzobot/go/cmd/hanzo-bot@latest` |
| C++ runtime (header-only) | [`hanzobot/cpp`](https://github.com/hanzobot/cpp) | `cmake -S . -B build && cmake --build build` |
| Language-agnostic spec | [`hanzobot/core`](https://github.com/hanzobot/core) | reference / contract |

One concern per repo. The `~/.hanzo/brain/brain.db` written by any
runtime is byte-identical — same schema, same FTS5, same wallet
addresses (BLAKE3 via [`luxfi/blake3`](https://github.com/luxfi/blake3)).

## What this repo owns

- `compose.yml` — local orchestration of the published images
- `.github/workflows/` — release / sanity checks for the compose stack
- this README

That's it. No `package.json`, no `bin/`, no impl. Anything that looks
like product code belongs in one of the runtime repos above.

## Install the canonical TS runtime

```bash
npm install -g @hanzo/bot     # ships from hanzobot/ts
hanzo-bot serve
```

## Local stack

```bash
docker compose up -d          # bot + brain
```

## The wider ecosystem

```
hanzoai/bot               ← ops / compose (you are here)
├── hanzobot/core         ← TS canonical, ships @hanzo/bot
├── hanzobot/go           ← Go runtime, single static binary
├── hanzobot/cpp          ← C++17 header-only
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
