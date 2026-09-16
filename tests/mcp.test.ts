import { describe, expect, it } from "vitest";
import { createCampaign, importLeads, type AppContext } from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { stepsForTemplate } from "@/lib/domain/templates";
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
      "create_sequence",
      "update_sequence",
      "delete_sequence",
      "add_leads_to_sequence",
      "get_sequence",
      "list_sequences",
      "start_sequence",
      "pause_sequence",
      "resume_sequence",
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

  it("create_sequence via MCP is always draft", async () => {
    const ctx = await testApp();
    const created = (await callMcpTool(ctx, "create_sequence", { name: "From Codex" })) as {
      id: string;
      status: string;
    };
    expect(created.status).toBe("draft");
    const campaign = (await callMcpTool(ctx, "get_sequence", { sequence_id: created.id })) as {
      steps: unknown[];
    };
    expect(campaign.steps).toEqual([]);
  });

  it("import_leads then get_sequence shows pending enrollments", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      content: "name,email\nAda Lovelace,ada@example.com\n",
    })) as { listId: string };
    const created = (await callMcpTool(ctx, "create_sequence", {
      name: "LinkedIn",
      template_key: "linkedin_only",
    })) as { id: string; status: string };
    expect(created.status).toBe("draft");
    await callMcpTool(ctx, "add_leads_to_sequence", {
      sequence_id: created.id,
      list_id: imported.listId,
    });
    const campaign = (await callMcpTool(ctx, "get_sequence", { sequence_id: created.id })) as {
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
    const created = (await callMcpTool(ctx, "create_sequence", { name: "From urls" })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_sequence", {
      sequence_id: created.id,
      list_id: imported.listId,
    });
    const campaign = (await callMcpTool(ctx, "get_sequence", { sequence_id: created.id })) as {
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
    const created = (await callMcpTool(ctx, "create_sequence", { name: "Ops" })) as { id: string; status: string };
    expect(created.status).toBe("draft");
    const updated = (await callMcpTool(ctx, "update_sequence", {
      sequence_id: created.id,
      name: "Ops v2",
    })) as { name: string; status: string };
    expect(updated.name).toBe("Ops v2");
    expect(updated.status).toBe("draft");
    const board = (await callMcpTool(ctx, "get_analytics", {})) as { totals: { sent: number } };
    expect(board.totals.sent).toBe(0);
  });

  it("reply_inbox does not start a sequence", async () => {
    const ctx = await testApp();
    const imported = (await callMcpTool(ctx, "import_leads", {
      urls: ["https://www.linkedin.com/in/priya-rao"],
    })) as { listId: string };
    const created = (await callMcpTool(ctx, "create_sequence", {
      name: "Reply check",
      template_key: "linkedin_only",
      steps: stepsForTemplate(),
    })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_sequence", {
      sequence_id: created.id,
      list_id: imported.listId,
    });
    const started = (await callMcpTool(ctx, "start_sequence", { sequence_id: created.id })) as {
      enrollments: Array<{ id: string }>;
    };
    const replied = (await callMcpTool(ctx, "reply_inbox", {
      enrollment_id: started.enrollments[0]?.id,
      body: "Thanks for the note.",
    })) as { ok: boolean };
    expect(replied.ok).toBe(true);
    const campaign = (await callMcpTool(ctx, "get_sequence", { sequence_id: created.id })) as { status: string };
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
    const created = (await callMcpTool(ctx, "create_sequence", { name: "Draft" })) as { id: string };
    await callMcpTool(ctx, "add_leads_to_sequence", { sequence_id: created.id, list_id: imported.listId });
    const started = (await callMcpTool(ctx, "start_sequence", { sequence_id: created.id })) as { status: string };
    expect(started.status).toBe("running");
    await expect(callMcpTool(ctx, "delete_sequence", { sequence_id: created.id })).rejects.toThrow(/only drafts/);
    const draft = (await callMcpTool(ctx, "create_sequence", { name: "To delete" })) as { id: string };
    const deleted = (await callMcpTool(ctx, "delete_sequence", { sequence_id: draft.id })) as { ok: boolean };
    expect(deleted.ok).toBe(true);
    const goneList = (await callMcpTool(ctx, "delete_list", { list_id: imported.listId })) as { ok: boolean };
    expect(goneList.ok).toBe(true);
    const lists = (await callMcpTool(ctx, "list_lists", {})) as Array<{ id: string }>;
    expect(lists.some((l) => l.id === imported.listId)).toBe(false);
    const campaigns = (await callMcpTool(ctx, "list_sequences", {})) as Array<{ id: string }>;
    expect(campaigns.some((c) => c.id === created.id)).toBe(true);
    expect(campaigns.some((c) => c.id === draft.id)).toBe(false);
  });

  it("publishes the sequence editor step fields", () => {
    const create = MCP_TOOLS.find((t) => t.name === "create_sequence");
    const update = MCP_TOOLS.find((t) => t.name === "update_sequence");
    const steps = create?.inputSchema.properties.steps as {
      items: {
        properties: {
          action: { enum: string[] };
          bodyTemplate: { description: string };
          imageUrl: { description: string };
        };
      };
    };
    expect(steps.items.properties.action.enum).toEqual(["connection", "message"]);
    expect(steps.items.properties.bodyTemplate.description).toContain("{{first_name}}");
    expect(steps.items.properties.imageUrl.description).toContain("image");
    expect(update?.inputSchema.properties).toMatchObject({ sequence_id: { type: "string" } });
    expect(MCP_TOOLS.map((t) => t.name)).not.toContain("create_campaign");
  });

  it("update_sequence can add, insert, edit, and remove stages like the editor", async () => {
    const ctx = await testApp();
    const created = (await callMcpTool(ctx, "create_sequence", { name: "Editor" })) as {
      id: string;
      status: string;
    };
    expect(created.status).toBe("draft");

    type Step = {
      stepIndex: number;
      channel: string;
      action: string;
      delayHours: number;
      bodyTemplate: string;
      imageUrl: string | null;
    };

    let seq = (await callMcpTool(ctx, "update_sequence", {
      sequence_id: created.id,
      name: "Editor v2",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}} — {{title}} at {{company}}",
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 48,
          bodyTemplate: "Hi {{first_name}}, following up.",
        },
      ],
    })) as { name: string; steps: Step[] };
    expect(seq.name).toBe("Editor v2");
    expect(seq.steps).toHaveLength(2);
    expect(seq.steps[0]?.action).toBe("connection");
    expect(seq.steps[1]?.delayHours).toBe(48);

    seq = (await callMcpTool(ctx, "update_sequence", {
      sequence_id: created.id,
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}} — {{title}} at {{company}}",
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 24,
          bodyTemplate: "Quick note from {{company}}.",
        },
        {
          stepIndex: 2,
          channel: "linkedin",
          action: "message",
          delayHours: 48,
          bodyTemplate: "Hi {{first_name}}, following up.",
        },
      ],
    })) as { name: string; steps: Step[] };
    expect(seq.steps).toHaveLength(3);
    expect(seq.steps[1]?.bodyTemplate).toContain("{{company}}");

    seq = (await callMcpTool(ctx, "update_sequence", {
      sequence_id: created.id,
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "message",
          delayHours: 0,
          bodyTemplate: "Hi {{full_name}}, {{headline}} in {{location}}.",
          imageUrl: "https://example.com/card.png",
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 72,
          bodyTemplate: "Last note — {{about}} {{profile_url}}",
        },
      ],
    })) as { name: string; steps: Step[] };
    expect(seq.steps).toHaveLength(2);
    expect(seq.steps[0]?.action).toBe("message");
    expect(seq.steps[0]?.imageUrl).toBe("https://example.com/card.png");
    expect(seq.steps[1]?.delayHours).toBe(72);
    expect(seq.steps[1]?.bodyTemplate).toContain("{{profile_url}}");

    await expect(callMcpTool(ctx, "create_campaign", { name: "legacy" })).rejects.toThrow(/Unknown tool/);
  });
});
