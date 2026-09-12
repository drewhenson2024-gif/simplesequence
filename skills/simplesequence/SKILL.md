# SimpleSequence

Import a people list, pick a template, `create_campaign` (always draft), show the human the copy, and only `start_campaign` after they say go.

Never invent LinkedIn URLs. Never store LinkedIn passwords. Never send without start.

## Tools

- `import_leads` — CSV text, Markdown, or rows. Merge/dedupe. Returns `list_id` + counts.
- `create_campaign` — name, channels, steps, delays, sender ids. Always draft.
- `add_leads_to_campaign` — `list_id` or inline rows.
- `get_campaign` / `list_campaigns`
- `start_campaign` / `pause_campaign` / `resume_campaign`
- `connect_status`
- `get_inbox` / `stop_lead`
