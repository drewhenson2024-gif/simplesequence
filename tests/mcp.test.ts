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
  it("exposes 23 coarse tools", () => {
    expect(MCP_TOOLS).toHaveLength(23);
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      "import_leads",
      "list_lists",
      "get_list",
      "update_list",
      "remove_lead_from_list",
      "delete_list",
      "create_campaign",
      "update_campaign",
      "delete_campaign",
      "add_leads_to_campaign",
      "get_campaign",
      "list_campaigns",
      "start_campaign",
      "pause_campaign",
      "resume_campaign",
      "connect_status",
      "get_inbox",
      "reply_inbox",
      "stop_lead",
      "export_leads",
      "get_analytics",
      "suggest_learnings",
      "apply_learnings",
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
      name: "LinkedIn",
      template_key: "linkedin_only",
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

  it("import_leads accepts a urls array of LinkedIn profiles", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      urls: [
        "https://www.linkedin.com/in/priya-rao",
        "https://www.linkedin.com/in/matt-cole",
      ],
      list_name: "ops",
    })) as { listId: string; counts: { imported: number } };
    expect(imported.counts.imported).toBe(2);
    const created = (await callMcpTool(ctx, "create_campaign", { name: "From urls" })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_campaign", {
      campaign_id: created.id,
      list_id: imported.listId,
    });
    const campaign = (await callMcpTool(ctx, "get_campaign", { campaign_id: created.id })) as {
      enrollments: Array<{
        status: string;
        lead: {
          linkedinUrl: string | null;
          company: string;
          title: string;
          headline: string;
          location: string;
          about: string;
          openingLine: string;
        } | null;
      }>;
    };
    expect(campaign.enrollments).toHaveLength(2);
    expect(campaign.enrollments.every((e) => e.status === "pending")).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.linkedinUrl?.includes("linkedin.com/in/"))).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.company === "Example")).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.title === "Operator")).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.headline === "Operator at Example")).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.location === "Example City")).toBe(true);
    expect(campaign.enrollments.every((e) => e.lead?.openingLine === "")).toBe(true);
  });

  it("direct createCampaign helper matches MCP draft rule", async () => {
    const ctx = await testApp();
    await importLeads(ctx, { content: "name,email\nAda,ada@example.com\n" });
    const created = await createCampaign(ctx, { name: "x" });
    expect(created.status).toBe("draft");
  });

  it("lists people, analytics, and draft edits stay send-free", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      urls: ["https://www.linkedin.com/in/priya-rao"],
      list_name: "ops",
    })) as { listId: string };
    const lists = (await callMcpTool(ctx, "list_lists", {})) as Array<{ id: string; name: string }>;
    expect(lists.some((l) => l.id === imported.listId)).toBe(true);
    const list = (await callMcpTool(ctx, "get_list", { list_id: imported.listId })) as {
      leads: Array<{ linkedinUrlNormalized: string | null }>;
    };
    expect(list.leads[0]?.linkedinUrlNormalized).toBe("https://www.linkedin.com/in/priya-rao");
    const created = (await callMcpTool(ctx, "create_campaign", { name: "Ops" })) as { id: string; status: string };
    expect(created.status).toBe("draft");
    const updated = (await callMcpTool(ctx, "update_campaign", {
      campaign_id: created.id,
      name: "Ops v2",
    })) as { name: string; status: string };
    expect(updated.name).toBe("Ops v2");
    expect(updated.status).toBe("draft");
    const board = (await callMcpTool(ctx, "get_analytics", {})) as { totals: { sent: number } };
    expect(board.totals.sent).toBe(0);
  });

  it("reply_inbox does not start a campaign", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      urls: ["https://www.linkedin.com/in/priya-rao"],
    })) as { listId: string };
    const created = (await callMcpTool(ctx, "create_campaign", {
      name: "Reply check",
      template_key: "linkedin_only",
    })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_campaign", {
      campaign_id: created.id,
      list_id: imported.listId,
    });
    const started = (await callMcpTool(ctx, "start_campaign", { campaign_id: created.id })) as {
      enrollments: Array<{ id: string }>;
    };
    const replied = (await callMcpTool(ctx, "reply_inbox", {
      enrollment_id: started.enrollments[0]?.id,
      body: "Thanks for the note.",
    })) as { ok: boolean };
    expect(replied.ok).toBe(true);
    const campaign = (await callMcpTool(ctx, "get_campaign", { campaign_id: created.id })) as { status: string };
    expect(campaign.status).toBe("running");
  });

  it("agents can rename, remove, and delete lists and draft sequences", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      urls: ["https://www.linkedin.com/in/priya-rao", "https://www.linkedin.com/in/matt-cole"],
      list_name: "ops",
    })) as { listId: string };
    const renamed = (await callMcpTool(ctx, "update_list", {
      list_id: imported.listId,
      name: "Ops outreach",
    })) as { name: string; leads: Array<{ id: string }> };
    expect(renamed.name).toBe("Ops outreach");
    const removed = (await callMcpTool(ctx, "remove_lead_from_list", {
      list_id: imported.listId,
      lead_id: renamed.leads[0].id,
    })) as { leads: Array<{ id: string }> };
    expect(removed.leads).toHaveLength(1);
    const created = (await callMcpTool(ctx, "create_campaign", { name: "Draft" })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_campaign", { campaign_id: created.id, list_id: imported.listId });
    const started = (await callMcpTool(ctx, "start_campaign", { campaign_id: created.id })) as { status: string };
    expect(started.status).toBe("running");
    await expect(callMcpTool(ctx, "delete_campaign", { campaign_id: created.id })).rejects.toThrow(/only drafts/);
    const draft = (await callMcpTool(ctx, "create_campaign", { name: "To delete" })) as { id: string };
    const deleted = (await callMcpTool(ctx, "delete_campaign", { campaign_id: draft.id })) as { ok: boolean };
    expect(deleted.ok).toBe(true);
    const goneList = (await callMcpTool(ctx, "delete_list", { list_id: imported.listId })) as { ok: boolean };
    expect(goneList.ok).toBe(true);
    const lists = (await callMcpTool(ctx, "list_lists", {})) as Array<{ id: string }>;
    expect(lists.some((l) => l.id === imported.listId)).toBe(false);
    const campaigns = (await callMcpTool(ctx, "list_campaigns", {})) as Array<{ id: string }>;
    expect(campaigns.some((c) => c.id === created.id)).toBe(true);
    expect(campaigns.some((c) => c.id === draft.id)).toBe(false);
  });
});
