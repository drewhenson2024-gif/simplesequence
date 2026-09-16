import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  applyLearnings,
  createCampaign,
  exportLeadsToCrm,
  getCampaign,
  importLeads,
  recordReply,
  startCampaign,
  suggestLearnings,
  tick,
  workspaceAnalytics,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { sequenceSteps, sendJobs } from "@/lib/db/schema";
import { stepsForTemplate } from "@/lib/domain/templates";
import { DEFAULT_WORKSPACE_ID, newId } from "@/lib/ids";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp/handler";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  let now = new Date("2026-09-14T17:00:00.000Z");
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    clock: { now: () => now },
    actor: "gtm",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return {
    ctx,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("GTM — export", () => {
  it("export_leads writes a CRM payload and does not send", async () => {
    const { ctx } = await testApp();
    const imported = await importLeads(ctx, {
      content: "name,email,linkedin_url\nAda Lovelace,ada@example.com,https://www.linkedin.com/in/ada-lovelace\n",
    });
    const exported = await exportLeadsToCrm(ctx, imported.listId);
    expect(exported.sent).toBe(false);
    expect(exported.charged).toBe(false);
    expect(exported.contacts[0]?.email).toBe("ada@example.com");
    expect(exported.contacts[0]?.linkedinUrl).toBe("https://www.linkedin.com/in/ada-lovelace");
    expect(exported.destination).toBe("payload");
  });
});

describe("GTM — analytics", () => {
  it("empty workspace is zeros, not fake rates", async () => {
    const { ctx } = await testApp();
    const board = await workspaceAnalytics(ctx);
    expect(board.totals).toEqual({
      runs: 0,
      enrolled: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      replies: 0,
      replyRate: 0,
      restricted: 0,
    });
    expect(board.runs).toEqual([]);
  });

  it("draft runs count enrolled people with no send activity", async () => {
    const { ctx } = await testApp();
    const imported = await importLeads(ctx, {
      content: "name,email,linkedin_url\nAda,ada@example.com,https://www.linkedin.com/in/ada-lovelace\n",
    });
    const created = await createCampaign(ctx, { name: "Voice", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    const board = await workspaceAnalytics(ctx);
    expect(board.totals.runs).toBe(1);
    expect(board.totals.enrolled).toBe(1);
    expect(board.totals.sent).toBe(0);
    expect(board.runs[0]?.insights[0]).toMatch(/No send activity/);
  });

  it("counts sent and skip reasons from a LinkedIn run", async () => {
    const { ctx, advance } = await testApp();
    const imported = await importLeads(ctx, {
      listName: "no-profile",
      content: "name,email\nNo Li,noli@example.com\n",
    });
    const created = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    const added = await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    await startCampaign(ctx, created.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const board = await workspaceAnalytics(ctx);
    expect(added.enrolled).toBe(1);
    expect(board.totals.skipped).toBeGreaterThan(0);
    const connect = board.runs[0]?.steps.find((s) => s.action === "connection");
    expect(connect?.skipped).toBeGreaterThan(0);
    expect(connect?.skipReasons["no linkedin url"]).toBeGreaterThan(0);
    expect(board.runs[0]?.insights.some((line) => /skipped/i.test(line))).toBe(true);
  });

  it("counts a reply after a send and apply_learnings stays draft", async () => {
    const { ctx, advance } = await testApp();
    const imported = await importLeads(ctx, {
      content: "name,email,linkedin_url\nAda,ada@example.com,https://www.linkedin.com/in/ada-lovelace\n",
    });
    const created = await createCampaign(ctx, { name: "Voice", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    const started = await startCampaign(ctx, created.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    await recordReply(ctx, {
      enrollmentId: started.enrollments[0].id,
      channel: "linkedin",
      body: "interested",
    });
    const board = await workspaceAnalytics(ctx);
    expect(board.totals.sent).toBeGreaterThan(0);
    expect(board.totals.replies).toBe(1);
    expect(board.totals.replyRate).toBeGreaterThan(0);
    const applied = await applyLearnings(ctx, created.id);
    expect(applied.status).toBe("draft");
    expect(applied.started).toBe(false);
    expect(applied.id).not.toBe(created.id);
    const source = await getCampaign(ctx, created.id);
    expect(source.status).toBe("running");
  });
});

describe("GTM — learnings", () => {
  it("suggest and apply never start a campaign", async () => {
    const { ctx } = await testApp();
    const imported = await importLeads(ctx, {
      content: "name,email,linkedin_url\nAda,ada@example.com,https://www.linkedin.com/in/ada-lovelace\n",
    });
    const created = await createCampaign(ctx, { name: "Voice", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    const suggestions = await suggestLearnings(ctx, created.id);
    expect(suggestions.started).toBe(false);
    expect(suggestions.status).toBe("draft");
    const applied = await applyLearnings(ctx, created.id);
    expect(applied.status).toBe("draft");
    expect(applied.started).toBe(false);
    expect(applied.id).not.toBe(created.id);
    const source = await getCampaign(ctx, created.id);
    expect(source.status).toBe("draft");
  });
});

describe("GTM — gift removal", () => {
  it("rejects new gift steps on create and MCP", async () => {
    const { ctx } = await testApp();
    await expect(
      createCampaign(ctx, {
        name: "Cupcakes",
        steps: [
          {
            stepIndex: 0,
            channel: "gift" as "linkedin",
            action: "gift" as "connection",
            delayHours: 0,
            bodyTemplate: "Congrats {{first_name}}",
            subjectTemplate: null,
          },
        ],
      }),
    ).rejects.toThrow(/gift steps are not supported/);
    await expect(
      callMcpTool(ctx, "create_campaign", {
        name: "Cupcakes",
        steps: [
          {
            stepIndex: 0,
            channel: "gift",
            action: "gift",
            delayHours: 0,
            bodyTemplate: "Congrats {{first_name}}",
          },
        ],
      }),
    ).rejects.toThrow();
  });

  it("does not send leftover gift stages from the database", async () => {
    const { ctx, advance } = await testApp();
    const imported = await importLeads(ctx, {
      content:
        "name,email,company,custom_office_address\nAda Lovelace,ada@example.com,Analytical Engines,1 Engine Yard\n",
    });
    const created = await createCampaign(ctx, {
      name: "Cookies",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}}",
          subjectTemplate: null,
        },
      ],
    });
    await ctx.db.insert(sequenceSteps).values({
      id: newId("stp"),
      campaignId: created.id,
      stepIndex: 1,
      channel: "gift",
      action: "gift",
      delayHours: 0,
      bodyTemplate: "A treat for {{first_name}}",
      subjectTemplate: null,
      enabled: 1,
      skipOverdueHours: 72,
      imageUrl: null,
    });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    const started = await startCampaign(ctx, created.id);
    const enrollmentId = started.enrollments[0]?.id;
    const senderId = started.linkedinSenderId;
    expect(enrollmentId).toBeTruthy();
    expect(senderId).toBeTruthy();
    await ctx.db.insert(sendJobs).values({
      id: newId("job"),
      enrollmentId: enrollmentId!,
      senderId: senderId!,
      campaignId: created.id,
      stepIndex: 1,
      status: "pending",
      dueAt: new Date(ctx.clock.now().getTime() - 60 * 60 * 1000).toISOString(),
      claimedAt: null,
      claimedBy: null,
      idempotencyKey: `${enrollmentId}:1`,
      dryRun: 1,
      providerId: null,
      error: null,
      createdAt: ctx.clock.now().toISOString(),
    });
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const campaign = await getCampaign(ctx, created.id);
    const leftover = campaign.jobs.find((j) => j.action === "gift");
    expect(leftover?.status).toBe("skipped");
    expect(leftover?.skipReason).toBe("gift removed");
  });
});

describe("GTM — MCP tools", () => {
  it("exposes export and learnings tools, not sourcing", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "import_leads",
        "list_lists",
        "get_list",
        "update_list",
        "remove_lead_from_list",
        "delete_list",
        "update_campaign",
        "delete_campaign",
        "reply_inbox",
        "get_analytics",
        "export_leads",
        "suggest_learnings",
        "apply_learnings",
      ]),
    );
    expect(names).not.toContain("search_people");
    expect(names).not.toContain("prompt_to_campaign");
    expect(names).not.toContain("list_signals");
    expect(names).not.toContain("ingest_signals");
  });
});
