import { describe, expect, it } from "vitest";
import { createCampaign, importLeads, type AppContext } from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp/handler";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    clock: { now: () => new Date("2026-09-14T17:00:00.000Z") },
    actor: "mcp",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return ctx;
}

describe("MCP", () => {
  it("exposes 11 coarse tools", () => {
    expect(MCP_TOOLS).toHaveLength(11);
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      "import_leads",
      "create_campaign",
      "add_leads_to_campaign",
      "get_campaign",
      "list_campaigns",
      "start_campaign",
      "pause_campaign",
      "resume_campaign",
      "connect_status",
      "get_inbox",
      "stop_lead",
    ]);
  });

  it("create_campaign via MCP is always draft", async () => {
    const ctx = await testApp();
    const created = (await callMcpTool(ctx, "create_campaign", { name: "From Codex" })) as {
      status: string;
    };
    expect(created.status).toBe("draft");
  });

  it("import_leads then get_campaign shows pending enrollments", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      content: "name,email\nAda Lovelace,ada@example.com\n",
    })) as { listId: string };
    const created = (await callMcpTool(ctx, "create_campaign", {
      name: "Email",
      template_key: "email_only",
    })) as { id: string; status: string };
    expect(created.status).toBe("draft");
    await callMcpTool(ctx, "add_leads_to_campaign", {
      campaign_id: created.id,
      list_id: imported.listId,
    });
    const campaign = (await callMcpTool(ctx, "get_campaign", { campaign_id: created.id })) as {
      enrollments: Array<{ status: string }>;
      status: string;
    };
    expect(campaign.status).toBe("draft");
    expect(campaign.enrollments[0]?.status).toBe("pending");
  });

  it("direct createCampaign helper matches MCP draft rule", async () => {
    const ctx = await testApp();
    await importLeads(ctx, { content: "name,email\nAda,ada@example.com\n" });
    const created = await createCampaign(ctx, { name: "x" });
    expect(created.status).toBe("draft");
  });
});
