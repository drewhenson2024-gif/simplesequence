# SimpleSequence

GTM sequencer for LinkedIn. Codex/Claude send LinkedIn profile URLs over MCP (`import_leads` with `urls`); import looks up name, title, company, and headline from each profile. Humans review a draft and start sending. Unipile is the LinkedIn send pipe. We do not search for people. We do not send email.

**Live site:** https://simplesequence-three.vercel.app

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

Tools: `import_leads`, `list_lists`, `get_list`, `update_list`, `remove_lead_from_list`, `delete_list`, `create_campaign`, `update_campaign`, `delete_campaign`, `add_leads_to_campaign`, `get_campaign`, `list_campaigns`, `start_campaign`, `pause_campaign`, `resume_campaign`, `connect_status`, `get_inbox`, `reply_inbox`, `stop_lead`, `export_leads`, `get_analytics`, `suggest_learnings`, `apply_learnings`.

`create_campaign` always saves a draft. Sending is `start_campaign` (agent or human). Import, export, reply, and learnings never start a campaign. `apply_learnings` creates a new draft. Connecting LinkedIn is Settings in the browser.

## Tests

```bash
pnpm install
pnpm test
```

Tests use in-memory SQLite. The app itself is Vercel + Turso — there is no local SQLite database.

## Vercel

Required env: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_URL` (`https://simplesequence-three.vercel.app`), `MCP_API_KEY`, `CRON_SECRET`, and Unipile keys for live connect.

Optional: `HUBSPOT_ACCESS_TOKEN` (CRM destination label; export still writes a payload first).

Hobby cron runs **once per day** (16:00 UTC). For minute ticks: Pro, or ping `GET /api/scheduler/tick` with `Authorization: Bearer $CRON_SECRET`.
