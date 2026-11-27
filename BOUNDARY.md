# OSS Bot Framework Boundary (`hanzoai/bot` vs `hanzo-inc/bot`)

Per owner directive (hanzoai/bot#98), this public repository is the **open-source Bot framework, SDK, protocol, reusable gateway/runtime, and generic self-hosted examples**.

## Ownership & Import Direction

```
hanzoai/bot (public OSS: MIT / Apache-2.0)
  ├── Reusable SDK, protocol schemas, gateway/runtime, generic self-hosted examples
  └── MUST NOT import or depend on `hanzo-inc/*` packages, private endpoints, billing, or commercial product UI

hanzo-inc/bot (private commercial product: hanzo.bot)
  ├── Imports published OSS packages from `hanzoai/bot`, `@hanzo/ui`, `@hanzo/gui`, `@hanzo/appearance`
  └── Owns managed cloud deployment, billing/subscriptions, hosted desktop/web product UI, and Team/Cloud integrations
```

## Migration & Compatibility Rules

1. **Non-destructive migration**: Keep published SDK exports and generic local/self-hosted examples compatible until downstream consumers (`hanzo-inc/bot`, `hanzo-inc/app`, `hanzo-inc/team`) migrate and pass CI.
2. **No private coupling**: Any commercial logic, managed billing, private SaaS branding, or proprietary connectors belong in `hanzo-inc/bot`.
3. **Automated enforcement**: Run `node scripts/check-oss-boundary.mjs` in CI to fail on any `hanzo-inc/` dependency or private commercial import introduced into `hanzoai/bot`.
