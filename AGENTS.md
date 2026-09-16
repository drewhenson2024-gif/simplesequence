# SimpleSequence — agent notes

The product is the live site: https://simplesequence-three.vercel.app
Every change must land there — commit and push so Vercel deploys. Do not leave product work only on disk.
Do not use Cursor Cloud Agents. Do not run or verify against localhost. Do not put this in the resume / project-death repo. Drew creates the GitHub remote in the browser if it does not exist.

## Steering

Always-on Cursor rules in `.cursor/rules/`:

- `design-approval.mdc` — for every design or approach change, list 2–4 distinct options, recommend one, and **wait for Drew to approve** before writing code. Recommend on product fit. Build time / file count is not a factor. When done, report which option shipped.
- `product-loop.mdc` — finished-product chrome (import LinkedIn URLs → sequence → inbox → Analytics). Marketing page is public; Open app is the only way into the app. Coming soon for blocked vendors. Do not fake live data.

Parked: `plans/self-improving-sequences.md` — Analytics chrome is the board. AI copy from stats (C) waits on a model. Never auto-rewrite a running sequence.

## Run

```bash
pnpm install
pnpm test
```

Database is Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` on Vercel). There is no local SQLite file. Tests use in-memory SQLite via `createAppDb(":memory:")`. Stub workspace `ws_default`. Sandbox dry-run on until you turn it off on the site.

MCP: `https://simplesequence-three.vercel.app/mcp` with `X-API-Key`.

## Commands

Hexagonal core in `src/lib/app/commands.ts`. UI, HTTP, and MCP all call the same commands.

- Sequences are created as `draft`. `start_sequence` is explicit. Sequences are LinkedIn connection + messages only — no email.
- Unipile port: `MockUnipile` unless `UNIPILE_API_KEY` + `UNIPILE_DSN` are set.
- People come in as LinkedIn profile URLs (paste or MCP `import_leads` with `urls`). Import looks up name, title, company, headline, location, and about from the profile. No people search, no Signals watcher.
- One in-flight send per sender. Pace + deterministic jitter. No default daily ceilings.
- Stop on reply, bounce, or provider restriction.
- Import, CRM export, and learnings never send. Learnings apply as a new draft only.

## MCP

`POST /mcp` with `X-API-Key`. Tools: `import_leads`, `list_lists`, `get_list`, `update_list`, `remove_lead_from_list`, `delete_list`, `create_sequence`, `update_sequence`, `delete_sequence`, `add_leads_to_sequence`, `get_sequence`, `list_sequences`, `start_sequence`, `pause_sequence`, `resume_sequence`, `connect_status`, `get_inbox`, `reply_inbox`, `stop_lead`, `export_leads`, `get_analytics`, `suggest_learnings`, `apply_learnings`. Import / export / reply / learnings never start a sequence. Sequences stay `draft` until `start_sequence`. Connecting LinkedIn is Settings in the browser. `apply_learnings` writes a new draft and never auto-starts. `delete_sequence` is draft-only. `create_sequence` / `update_sequence` take the same step fields as Save on the sequence page.

## Tests

`pnpm test` — parser + FSM property/unit tests, ingest, send safety, MCP always-draft, `tests/mcp-bench` import/sequence slices, `tests/gtm.test.ts` export / analytics / learnings.
