# SimpleSequence

Agents run the loop over MCP. Humans can also use the site. Input is LinkedIn profile URLs. `create_sequence` is always draft. `start_sequence` is an explicit call — import never sends.

Never invent LinkedIn URLs. Never store LinkedIn passwords. We do not search for people. We do not send email. Connecting LinkedIn is Settings in the browser (Unipile).

## Loop

`import_leads({ urls })` → `create_sequence` → `add_leads_to_sequence` → (optional `update_sequence` / `update_list` while draft) → `start_sequence` → `get_inbox` / `reply_inbox` / `stop_lead` → `get_analytics` / `suggest_learnings` → `apply_learnings` (new draft only). `delete_list` / `delete_sequence` (draft only) / `remove_lead_from_list` match the site.

## Tools

- `import_leads` — prefer `urls: string[]`. Looks up name / title / company / headline / location / about from each profile. Dedupe on LinkedIn URL. Never sends.
- `list_lists` / `get_list` / `update_list` / `remove_lead_from_list` / `delete_list` — people lists.
- `create_sequence` — always draft. Empty unless you pass `steps`.
- `update_sequence` — draft only. Same as Save on the sequence page: send the full `steps` list to add, insert, remove, reorder, change kind, wait, copy, or image.
- `delete_sequence` — draft only. Running sequences stay pause-only.
- `add_leads_to_sequence` — `list_id` or `urls`.
- `get_sequence` / `list_sequences`
- `start_sequence` / `pause_sequence` / `resume_sequence`
- `connect_status` — check senders. Does not open Unipile OAuth.
- `get_inbox` / `reply_inbox` / `stop_lead`
- `export_leads` — CRM payload. Never sends.
- `get_analytics` — zeros until something has sent.
- `suggest_learnings` / `apply_learnings` — new draft only. Never auto-starts. `sequence_id`.

## Editing a sequence

`create_sequence` / `update_sequence` take the same stage fields as the site editor. Args use `sequence_id`. Stages use:

- `stepIndex` — 0-based order
- `channel` — `linkedin`
- `action` — `connection` (LinkedIn · Connection) or `message` (LinkedIn · Message)
- `delayHours` — wait before the stage (first is usually 0; a day is 24)
- `bodyTemplate` — copy with merge fields `{{first_name}}` `{{last_name}}` `{{full_name}}` `{{company}}` `{{title}}` `{{headline}}` `{{location}}` `{{about}}` `{{profile_url}}`
- `imageUrl` — optional LinkedIn image URL

To change one stage, send the whole list again (same as Save). Omit a stage to remove it. Insert in the list to add one.
