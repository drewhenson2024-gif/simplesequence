# SimpleSequence

GTM sequencer for LinkedIn, email, and gift steps. Codex/Claude import or find people over MCP; humans review a draft and start sending. Unipile is the only LinkedIn/email pipe.

**Live site:** https://simplesequence-three.vercel.app

**Honest scope:** Apollo + stub catalog waterfall (not 50 live vendors). Signals are a stub watch unless a real source exists. Gifts use MockGift until a Postal/Sendoso-shaped key **and** `GIFT_API_URL` are set — no courier is charged without those.

## MCP (Cursor / Codex)

```json
{
  "mcpServers": {
    "simplesequence": {
      "url": "https://simplesequence-three.vercel.app/mcp",
      "headers": { "X-API-Key": "YOUR_MCP_API_KEY" }
    }
  }
}
```

Tools: `import_leads`, `create_campaign`, `add_leads_to_campaign`, `get_campaign`, `list_campaigns`, `start_campaign`, `pause_campaign`, `resume_campaign`, `connect_status`, `get_inbox`, `stop_lead`, `search_people`, `research_leads`, `qualify_leads`, `prompt_to_campaign`, `export_leads`, `list_signals`, `ingest_signals`, `suggest_learnings`, `apply_learnings`.

`create_campaign` always saves a draft. Sending is `start_campaign` after a human says go. Prospecting, signals, qualify, export, and learnings never send. `apply_learnings` creates a new draft.

## Tests

```bash
pnpm install
pnpm test
```

Tests use in-memory SQLite. The app itself is Vercel + Turso — there is no local SQLite database.

## Vercel

Required env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_URL` (`https://simplesequence-three.vercel.app`), `MCP_API_KEY`, `CRON_SECRET`, and Unipile keys for live connect.

Optional: `APOLLO_API_KEY` (people search), `POSTAL_API_KEY` / `SENDOSO_API_KEY` + `GIFT_API_URL` (live gifts), `HUBSPOT_ACCESS_TOKEN` (CRM destination label; export still writes a payload first).

Hobby cron runs **once per day** (16:00 UTC). For minute ticks: Pro, or ping `GET /api/scheduler/tick` with `Authorization: Bearer $CRON_SECRET`.
