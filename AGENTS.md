# SimpleSequence — agent notes

Local-only product. Do not use Cursor Cloud Agents. Do not put this in the resume / project-death repo. Drew creates the GitHub remote in the browser if it does not exist.

## Run

```bash
pnpm install
pnpm test
pnpm dev
pnpm db:migrate
```

SQLite at `data/simplesequence.db`. Stub workspace `ws_default`. Protect mode off. Sandbox dry-run on until live Unipile keys exist.

## Commands

Hexagonal core in `src/lib/app/commands.ts`. UI, HTTP, and MCP all call the same commands.

- Campaigns are created as `draft`. `start_campaign` is explicit.
- Unipile port: `MockUnipile` unless `UNIPILE_API_KEY` + `UNIPILE_DSN` are set.
- One in-flight send per sender. Pace + deterministic jitter. No default daily ceilings.
- Stop on reply, bounce, or provider restriction.

## MCP

`POST /mcp` with `X-API-Key`. Tools: `import_leads`, `create_campaign`, `add_leads_to_campaign`, `get_campaign`, `list_campaigns`, `start_campaign`, `pause_campaign`, `resume_campaign`, `connect_status`, `get_inbox`, `stop_lead`.

## Tests

`pnpm test` — parser + FSM property/unit tests, ingest, send safety, MCP always-draft.
