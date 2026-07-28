---
summary: "CLI reference for `bot transcripts` (list, show, and export stored transcripts)"
read_when:
  - You want to read stored transcript summaries from the terminal
  - You need the path to a transcripts markdown summary
  - You are debugging the core transcripts storage layout
title: "Transcripts CLI"
---

# `bot transcripts`

Inspector and export command for durable meeting transcripts. Google Meet,
Microsoft Teams, and Zoom browser participants capture notes automatically;
the `transcripts` agent tool also supports provider capture and manual import.

Canonical transcript state lives in the shared SQLite database at
`$BOT_STATE_DIR/state/bot.sqlite`. `show` and `path` explicitly
materialize user-facing artifacts under the state directory:

```text
$BOT_STATE_DIR/transcripts/YYYY-MM-DD/<session>/
  metadata.json
  transcript.jsonl
  summary.json
  summary.md
```

These files are exports, not a second runtime store. Bot does not read them
back during capture, summarization, or listing. Default state directory is
`~/.bot`; override with `BOT_STATE_DIR`. The date directory comes
from the session start time; the session directory is a filesystem-safe slug
derived from the session id.

## Commands

```bash
bot transcripts list
bot transcripts show <session>
bot transcripts show YYYY-MM-DD/<session>
bot transcripts path <session>
bot transcripts path YYYY-MM-DD/<session>
bot transcripts path <session> --dir
bot transcripts path <session> --metadata
bot transcripts path <session> --transcript
bot transcripts list --json
bot transcripts show <session> --json
bot transcripts path <session> --json
```

| Command                       | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `list`                        | List stored sessions.                                |
| `show <session>`              | Print and materialize `summary.md`.                  |
| `path <session>`              | Materialize and print the `summary.md` path.         |
| `path <session> --dir`        | Materialize all artifacts and print their directory. |
| `path <session> --metadata`   | Materialize and print `metadata.json`.               |
| `path <session> --transcript` | Materialize and print `transcript.jsonl`.            |
| `--json`                      | Print machine-readable output (any subcommand).      |

`<session>` accepts either a bare session id or a date-qualified selector
(`YYYY-MM-DD/<session>`). Use the qualified form when the same session id
occurs on more than one day, for example `bot transcripts show
2026-05-22/standup`. Default session ids include a timestamp and random
suffix; give a session a fixed id only when that id is unique within the day.

## Output

`list` prints one tab-separated line per session: selector, start time, title,
summary path.

```text
2026-05-22/standup  2026-05-22T09:00:00.000Z  Weekly standup  /Users/user/.bot/transcripts/2026-05-22/standup/summary.md
```

The selector is the safest value to pass back to `show` or `path`.

`list --json` returns objects with `sessionId`, `selector`, `date`, `title`,
`startedAt`, `stoppedAt`, `source`, `path`, `summaryPath`, `hasSummary`.
Stored meeting source URLs contain only the origin and path; query strings,
fragments, and embedded credentials are removed before persistence.

`show --json` returns the stored session metadata, selector, session
directory, summary path, and summary Markdown text.

`path --json` returns the selected path and whether that artifact could be
materialized. Metadata and transcript exports always exist for a stored
session; a summary path reports `exists: false` until the session has a summary.

## Many sessions per day

Sessions group by date, then by session id. Ten meetings on one day become
ten sibling folders:

```text
~/.bot/transcripts/2026-05-22/
  transcript-2026-05-22T09-00-00-000Z-a1b2c3d4/
  transcript-2026-05-22T10-30-00-000Z-b2c3d4e5/
  standup/
```

Use default generated ids for automation. Use a fixed id like `standup` only
when it will not repeat on the same date.

## Missing summaries

Live sessions store and materialize `summary.md` when the session stops;
imported transcripts do so immediately after import. A session can appear in
`list` without a summary while capture is still active, if a provider failed
during stop, or if metadata was stored before any utterances arrived.

Use `path <session> --transcript` to inspect the raw append-only transcript,
or run the `transcripts` tool's `summarize` action to regenerate the Markdown
summary.

## Upgrading the legacy file store

Bot releases that predate the SQLite store wrote canonical runtime state
directly beneath `$BOT_STATE_DIR/transcripts/`. Run:

```bash
bot doctor --fix
```

Doctor imports the complete legacy tree into SQLite, verifies row counts and
ordering, records migration receipts, and moves the verified source tree to a
timestamped `transcripts.migrated-*` archive. Runtime commands do not fall back
to the legacy files. Keep the archive until you have verified the imported
sessions and any exports you rely on.

## Configuration

Meeting transcript capture is enabled by default. To opt out globally:

```json
{
  "transcripts": {
    "enabled": false
  }
}
```

- `enabled` (default `true`): enable automatic meeting notes, the transcripts
  tool, and configured auto-start sources. Set it to `false` when meeting
  notes should not be persisted on the host. An explicitly requested meeting
  `transcribe` mode keeps its existing bounded live-caption tail, but does not
  write durable rows while this setting is false.
  Configure auto-start sources with `transcripts.autoStart`. Each entry is
  enabled by being present; omit an entry to disable that source. `discord-voice`
  is the bundled auto-start-capable source and requires `guildId` and
  `channelId`:

```json
{
  "transcripts": {
    "enabled": true,
    "autoStart": [
      {
        "providerId": "discord-voice",
        "guildId": "1234567890",
        "channelId": "2345678901"
      }
    ]
  }
}
```

The meeting provider ids are `google-meet`, `teams`, and `zoom`. Their aliases
are `googlemeet`/`meet`, `teams-meetings`/`microsoft-teams`/`msteams`, and
`zoom-meetings`, respectively. Meeting providers attach to an already-active
meeting bot session; normal meeting joins do not need an `autoStart` entry.
