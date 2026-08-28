# dsh-ca-ref

**Languages: [English](README.en.md) | [中文](README.md)**

Clean Architecture reference library — a plugin for DSH (DeepSeek Harness).

![Panel screenshot](screenshots/ca-ref-panel.png)

## What it does

Before reviewing a Clean Arch / DDD / hexagonal project, pull a "known-good" baseline from a curated set of pinned reference repos and review against it:

- **8 pinned reference repos** — Go / Java / C# / TypeScript / Python Clean Architecture & DDD examples, pinned to fixed commits. Drift checking is read-only (no automatic re-clone).
- **FTS5 full-text search** — over repo assertions, docs, and structure; Chinese matches by substring, English via FTS5. Citations carry a `<repo>:<path>` source.
- **Mechanizable rule list** — each rule carries an assertion template and its source; `ca_ref_baseline` returns the full "answer set" for a language in one call.
- **Review ledger** — after reviewing a project, `ca_ref_record` logs it (project, language, rules hit, evidence); hit statistics feed back into library curation.
- **Observation-window panel** — a read-only "CA Reference Library" tab in the conversation view (30s auto-refresh) with four sub-tabs: baseline (repo list + rule coverage table + full card), search log, review ledger, and hit statistics.
- **Daily tick** — `git rev-parse HEAD` drift check against pinned SHAs + on-demand index rebuild (read-only).

## Agent tools

| Tool | Purpose |
|---|---|
| `ca_ref_search` | Full-text search over reference assertions/docs/structure |
| `ca_ref_baseline` | Fetch repo summary cards + rule list + 8 red flags for a language |
| `ca_ref_record` | Log a completed review (project / language / rules hit / evidence) |
| `ca_ref_status` | Library health: pinned SHAs, verification status, index state, ledger size |

A `/ca-ref status|search|baseline|ledger|stats|reindex` command channel (with `--json`) feeds the panel.

## Install

In your DSH web profile directory (the directory with the profile's `package.json`, default `~/.dsh/profiles/web`):

```bash
cd ~/.dsh/profiles/web
pnpm add github:Ansonfishing/dsh-ca-ref
```

Then make sure `dsh.profile.bundles` in `package.json` includes `"dsh-ca-ref"`, and restart `dsh`. A "CA Reference Library" tab then appears in the conversation view.

### Local development

Clone this repo and use a `link:` dependency in your profile:

```bash
cd ~/.dsh/profiles/web
pnpm add link:../path/to/dsh-ca-ref
```

Client-only changes need a browser refresh; Node-side changes (`index.js` / `lib/*.js`) need a `dsh` restart.

The corpus defaults to `~/AI/ca-ref` (override with the `CAREF_CORPUS` env var); the database lives at `~/.dsh/caref/caref.db` (indexed on first use). See `seed/repos.json` for the pinned repos and their verification commands.

## Development

```bash
node scripts/smoke.mjs   # smoke: 8 pinned repos + toolchain + index (missing local corpus items are skipped)
```

`test/harness/index.html` is a standalone browser render harness (mock data, `?chrome=0` hides the harness chrome bar) for verifying the panel render without a dsh environment.

## License

[MIT](LICENSE) © Ansonfishing
