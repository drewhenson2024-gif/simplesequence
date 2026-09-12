import { eq } from "drizzle-orm";
import { getRuntime } from "@/lib/app/runtime";
import { json } from "@/lib/http/respond";
import { workspaces } from "@/lib/db/schema";
import { callMcpTool, mcpInitializeResult, MCP_TOOLS } from "@/lib/mcp/handler";

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function POST(req: Request) {
  const ctx = await getRuntime();
  const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1);
  const key = req.headers.get("x-api-key") ?? "";
  if (!ws || key !== ws.mcpApiKey) {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json();
  const messages = Array.isArray(body) ? body : [body];
  const replies = [];
  for (const msg of messages) {
    const id = msg?.id ?? null;
    const method = msg?.method as string | undefined;
    if (method === "initialize") {
      replies.push(rpcResult(id, mcpInitializeResult()));
      continue;
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      continue;
    }
    if (method === "tools/list") {
      replies.push(rpcResult(id, { tools: MCP_TOOLS }));
      continue;
    }
    if (method === "tools/call") {
      const name = msg?.params?.name as string;
      const args = msg?.params?.arguments ?? {};
      try {
        const result = await callMcpTool(ctx, name, args);
        replies.push(
          rpcResult(id, {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "tool_error";
        replies.push(rpcError(id, -32000, message));
      }
      continue;
    }
    if (method === "ping") {
      replies.push(rpcResult(id, {}));
      continue;
    }
    replies.push(rpcError(id, -32601, `Unknown method ${method}`));
  }
  return json(Array.isArray(body) ? replies : replies[0] ?? { jsonrpc: "2.0", result: {} });
}

export async function GET() {
  return json({ name: "simplesequence", transport: "streamable-http" });
}
