import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  applyLearnings,
  createCampaign,
  exportLeadsToCrm,
  getCampaign,
  getList,
  importLeads,
  ingestSignals,
  listSignals,
  qualifyLeads,
  searchPeople,
  startCampaign,
  suggestLearnings,
  tick,
  type AppContext,
} from "@/lib/app/commands";
import { createDataPort } from "@/lib/data/apollo";
import { WaterfallData } from "@/lib/data/waterfall";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { callMcpTool, MCP_TOOLS } from "@/lib/mcp/handler";
import { MockGift } from "@/lib/gift/port";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const gift = new MockGift();
  let now = new Date("2026-09-14T17:00:00.000Z");
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    data: createDataPort({}, new MockUnipile()),
    gift,
    clock: { now: () => now },
    actor: "gtm",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return {
    ctx,
    gift,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("GTM — prospecting", () => {
  it("waterfall is Apollo-then-stub and tags source on each lead", async () => {
    const port = createDataPort({}, new MockUnipile());
    expect(port).toBeInstanceOf(WaterfallData);
    expect((port as WaterfallData).sourceNames()).toEqual(["stub_catalog"]);
    const { ctx } = await testApp();
    const searched = await searchPeople(ctx, {
      brief: "Find experienced benefits brokers",
      limit: 5,
    });
    expect(searched.counts.imported).toBeGreaterThan(0);
    expect(searched.sources).toContain("stub_catalog");
    const list = await getList(ctx, searched.listId as string);
    const custom = JSON.parse(list.leads[0]?.customJson ?? "{}") as { custom_source?: string };
    expect(custom.custom_source).toBe("stub_catalog");
  });

  it("qualify stores a numeric score and never starts a campaign", async () => {
    const { ctx } = await testApp();
    const imported = await importLeads(ctx, {
      listName: "score-me",
      content: "name,title,company,email\nNeha,Engineering Manager,Freshworks,neha@example.com\n",
    });
    const result = await qualifyLeads(ctx, imported.listId, "Current technical role as engineer");
    expect(result.leads[0]?.decision).toMatch(/fit|maybe/);
    expect(result.leads[0]?.score).toBeGreaterThanOrEqual(30);
    expect(result.leads[0]?.reason.length).toBeGreaterThan(0);
    const { listCampaigns } = await import("@/lib/app/commands");
    expect(await listCampaigns(ctx)).toHaveLength(0);
  });

  it("export_leads writes a CRM payload and does not send", async () => {
    const { ctx } = await testApp();
    const imported = await importLeads(ctx, {
      content: "name,email\nAda Lovelace,ada@example.com\n",
    });
    await qualifyLeads(ctx, imported.listId, "operator");
    const exported = await exportLeadsToCrm(ctx, imported.listId);
    expect(exported.sent).toBe(false);
    expect(exported.charged).toBe(false);
    expect(exported.contacts[0]?.email).toBe("ada@example.com");
    expect(exported.destination).toBe("payload");
  });
});

describe("GTM — signals", () => {
  it("ingest seeds stub signals and list_signals stays send-free", async () => {
    const { ctx } = await testApp();
    const seeded = await ingestSignals(ctx);
    expect(seeded.created).toBeGreaterThan(0);
    const week = await listSignals(ctx, { sinceDays: 7 });
    expect(week.some((s) => s.signalType === "hiring")).toBe(true);
    expect(week.every((s) => s.source !== "sales_navigator")).toBe(true);
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

describe("GTM — gifting", () => {
  it("MCP gift campaign stays draft and start is required before a gift is queued", async () => {
    const { ctx, gift } = await testApp();
    const created = (await callMcpTool(ctx, "create_campaign", {
      name: "Cupcakes",
      steps: [
        {
          stepIndex: 0,
          channel: "gift",
          action: "gift",
          delayHours: 0,
          bodyTemplate: "Congrats {{first_name}}",
          giftItem: "cupcakes",
          giftNote: "Handwritten hello",
        },
      ],
    })) as { id: string; status: string };
    expect(created.status).toBe("draft");
    const imported = await importLeads(ctx, {
      content:
        "name,email,company,custom_office_address\nAda Lovelace,ada@example.com,Analytical Engines,1 Engine Yard\n",
    });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    expect(gift.orders).toHaveLength(0);
    await startCampaign(ctx, created.id);
    const afterStart = await getCampaign(ctx, created.id);
    expect(afterStart.status).toBe("running");
    expect(afterStart.jobs.some((j) => j.action === "gift")).toBe(true);
    expect(gift.orders).toHaveLength(0);
  });

  it("started gift jobs record in the mock outbox and never charge", async () => {
    const { ctx, gift, advance } = await testApp();
    const imported = await importLeads(ctx, {
      content:
        "name,email,company,custom_office_address\nAda Lovelace,ada@example.com,Analytical Engines,1 Engine Yard\n",
    });
    const created = await createCampaign(ctx, {
      name: "Cookies",
      steps: [
        {
          stepIndex: 0,
          channel: "gift",
          action: "gift",
          delayHours: 0,
          bodyTemplate: "A treat for {{first_name}}",
          subjectTemplate: null,
          giftItem: "cookies",
          giftNote: "Enjoy",
        },
      ],
    });
    await addLeadsToCampaign(ctx, created.id, { listId: imported.listId });
    await startCampaign(ctx, created.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    expect(gift.orders).toHaveLength(1);
    expect(gift.orders[0]?.item).toBe("cookies");
    const campaign = await getCampaign(ctx, created.id);
    const giftJob = campaign.jobs.find((j) => j.action === "gift");
    expect(giftJob?.status).toBe("sent");
    expect(giftJob?.dryRun).toBe(1);
  });
});

describe("GTM — MCP tools", () => {
  it("exposes export, signals, and learnings tools", () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "export_leads",
        "list_signals",
        "ingest_signals",
        "suggest_learnings",
        "apply_learnings",
      ]),
    );
  });
});
