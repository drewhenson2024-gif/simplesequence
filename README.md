# SimpleSequence

GTM sequencer for LinkedIn and email. Codex/Claude import people lists over MCP; humans review a draft and start sending. Unipile is the only LinkedIn/email pipe.

**v1:** lists in, mixed sequences out, hosted MCP. Not 50+ data sources, not gifting.

## Run locally

No paid keys required. Unipile is mocked until you add `UNIPILE_API_KEY` and `UNIPILE_DSN`.

```bash
pnpm install
pnpm test
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). MCP is at `/mcp` with `X-API-Key: dev-mcp-key`. Campaigns stay **draft** until you start them.

Copy `.env.example` to `.env.local` if you want to override the defaults.

## MCP (Cursor / Codex)

```json
{
  "mcpServers": {
    "simplesequence": {
      "url": "http://localhost:3000/mcp",
      "headers": { "X-API-Key": "dev-mcp-key" }
    }
  }
}
```

`create_campaign` always saves a draft. Sending is `start_campaign` after a human says go.
