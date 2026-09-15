# SimpleSequence

Import or search a people list, pick a template, `create_campaign` (always draft), show the human the copy, and only `start_campaign` after they say go.

Never invent LinkedIn URLs. Never store LinkedIn passwords. Never send without start. Prospecting, research, qualify, signals, CRM export, and learnings never send.

## Tools

- `import_leads` — CSV text, Markdown, or rows. Merge/dedupe on LinkedIn URL then email. Returns `list_id` + counts.
- `create_campaign` — name, channels, steps, delays, sender ids. Gift steps allowed. Always draft.
- `add_leads_to_campaign` — `list_id` or inline rows.
- `get_campaign` / `list_campaigns`
- `start_campaign` / `pause_campaign` / `resume_campaign`
- `connect_status`
- `get_inbox` / `stop_lead`
- `search_people` — targeting brief → list. Apollo if keyed, else stub catalog. Source stored per lead. Never sends.
- `research_leads` / `qualify_leads` — opening lines and fit/maybe/no plus numeric score. Never sends.
- `prompt_to_campaign` — brief → researched draft. Always draft. Never sends.
- `export_leads` — CRM-ready payload for a list. Never sends LinkedIn/email.
- `list_signals` / `ingest_signals` — in-market this week. Stub catalog unless a real source exists. Never scrapes Sales Nav.
- `suggest_learnings` — reply-rate patterns from sent jobs. Never starts a campaign.
- `apply_learnings` — writes a **new draft**. Never mutates a running sequence. Never auto-starts.
