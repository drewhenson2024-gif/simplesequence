# SimpleSequence — agent notes

The product is the live site: https://simplesequence-three.vercel.app
Do not use Cursor Cloud Agents. Do not run or verify against localhost. Do not put this in the resume / project-death repo. Drew creates the GitHub remote in the browser if it does not exist.

## Run

```bash
pnpm install
pnpm test
```

Database is Turso (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` on Vercel). There is no local SQLite file. Tests use in-memory SQLite via `createAppDb(":memory:")`. Stub workspace `ws_default`. Sandbox dry-run on until you turn it off on the site.

MCP: `https://simplesequence-three.vercel.app/mcp` with `X-API-Key`.

## Commands

Hexagonal core in `src/lib/app/commands.ts`. UI, HTTP, and MCP all call the same commands.

- Campaigns are created as `draft`. `start_campaign` is explicit.
- Unipile port: `MockUnipile` unless `UNIPILE_API_KEY` + `UNIPILE_DSN` are set.
- DataPort waterfall: Apollo first if `APOLLO_API_KEY`, then stub catalog. Not 50 live vendors. Source name is stored per lead.
- GiftPort: `MockGift` unless `POSTAL_API_KEY` / `SENDOSO_API_KEY` and `GIFT_API_URL`. Mock records the gift; never charges a courier without keys.
- One in-flight send per sender. Pace + deterministic jitter. No default daily ceilings.
- Stop on reply, bounce, or provider restriction.
- Prospecting, research, qualify, signals, and CRM export never send. Learnings apply as a new draft only.

## MCP

`POST /mcp` with `X-API-Key`. Tools: `import_leads`, `create_campaign`, `add_leads_to_campaign`, `get_campaign`, `list_campaigns`, `start_campaign`, `pause_campaign`, `resume_campaign`, `connect_status`, `get_inbox`, `stop_lead`, `search_people`, `research_leads`, `qualify_leads`, `prompt_to_campaign`, `export_leads`, `list_signals`, `ingest_signals`, `suggest_learnings`, `apply_learnings`. Prospecting / signals / qualify / export never send. Campaigns stay `draft` until `start_campaign`. Gift steps stay draft. `apply_learnings` writes a new draft and never auto-starts.

## Tests

`pnpm test` — parser + FSM property/unit tests, ingest, send safety, MCP always-draft, `tests/mcp-bench` Cluster slices, `tests/gtm.test.ts` scoring / signals / learnings / draft-only gift.
