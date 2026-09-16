# SimpleSequence

Agents run the loop over MCP. Humans can also use the site. Input is LinkedIn profile URLs. `create_campaign` is always draft. `start_campaign` is an explicit call — import never sends.

Never invent LinkedIn URLs. Never store LinkedIn passwords. We do not search for people. We do not send email. Connecting LinkedIn is Settings in the browser (Unipile).

## Loop

`import_leads({ urls })` → `create_campaign` → `add_leads_to_campaign` → (optional `update_campaign` / `update_list` while draft) → `start_campaign` → `get_inbox` / `reply_inbox` / `stop_lead` → `get_analytics` / `suggest_learnings` → `apply_learnings` (new draft only). `delete_list` / `delete_campaign` (draft only) / `remove_lead_from_list` match the site.

## Tools

- `import_leads` — prefer `urls: string[]`. Looks up name / title / company / headline / location / about from each profile. Dedupe on LinkedIn URL. Never sends.
- `list_lists` / `get_list` / `update_list` / `remove_lead_from_list` / `delete_list` — people lists.
- `create_campaign` — always draft.
- `update_campaign` — draft only.
- `delete_campaign` — draft only. Running sequences stay pause-only.
- `add_leads_to_campaign` — `list_id` or `urls`.
- `get_campaign` / `list_campaigns`
- `start_campaign` / `pause_campaign` / `resume_campaign`
- `connect_status` — check senders. Does not open Unipile OAuth.
- `get_inbox` / `reply_inbox` / `stop_lead`
- `export_leads` — CRM payload. Never sends.
- `get_analytics` — zeros until something has sent.
- `suggest_learnings` / `apply_learnings` — new draft only. Never auto-starts.
