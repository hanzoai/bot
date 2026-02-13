---
name: hanzo-skills
description: Use the Hanzo Skills CLI to search, install, update, and publish agent skills from skills.hanzo.bot. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed hanzo-skills CLI.
metadata:
  {
    "bot":
      {
        "requires": { "bins": ["hanzo-skills"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "hanzo-skills",
              "bins": ["hanzo-skills"],
              "label": "Install Hanzo Skills CLI (npm)",
            },
          ],
      },
  }
---

# Hanzo Skills CLI

Install

```bash
npm i -g hanzo-skills
```

Auth (publish)

```bash
hanzo-skills login
hanzo-skills whoami
```

Search

```bash
hanzo-skills search "postgres backups"
```

Install

```bash
hanzo-skills install my-skill
hanzo-skills install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
hanzo-skills update my-skill
hanzo-skills update my-skill --version 1.2.3
hanzo-skills update --all
hanzo-skills update my-skill --force
hanzo-skills update --all --no-input --force
```

List

```bash
hanzo-skills list
```

Publish

```bash
hanzo-skills publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://skills.hanzo.bot (override with HANZO_SKILLS_REGISTRY or --registry)
- Default workdir: cwd (falls back to Hanzo Bot workspace); install dir: ./skills (override with --workdir / --dir / HANZO_SKILLS_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
