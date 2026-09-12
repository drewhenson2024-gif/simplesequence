import { readFileSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  createCampaign,
  importLeads,
  recordReply,
  recordRestriction,
  startCampaign,
  tick,
  updateSettings,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { sendJobs } from "@/lib/db/schema";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const unipile = new MockUnipile();
  let now = new Date("2026-09-14T17:00:00.000Z");
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile,
    clock: { now: () => now },
    actor: "test",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return {
    ctx,
    unipile,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe("commands", () => {
  it("two CSVs append into one list without dropping columns", async () => {
    const { ctx } = await testApp();
    const first = await importLeads(ctx, { listName: "bench", content: fixture("csv-append-a.csv") });
    const second = await importLeads(ctx, { listId: first.listId, content: fixture("csv-append-b.csv") });
    expect(second.counts.merged).toBe(1);
    expect(second.counts.imported).toBe(1);
    const { getList } = await import("@/lib/app/commands");
    const list = await getList(ctx, first.listId);
    const pat = list.leads.find((l) => l.email === "pat@example.com");
    const custom = JSON.parse(pat?.customJson ?? "{}") as Record<string, string>;
    expect(custom.custom_source).toBe("bench");
    expect(custom.custom_note).toBe("keep-me");
    expect(pat?.title).toBe("GM");
    expect(list.leads).toHaveLength(3);
  });

  it("import is idempotent on the same content", async () => {
    const { ctx } = await testApp();
    const a = await importLeads(ctx, { listName: "same", content: fixture("csv-6.csv") });
    const b = await importLeads(ctx, { listName: "same", content: fixture("csv-6.csv") });
    expect(a.listId).toBe(b.listId);
    expect(a.counts).toEqual(b.counts);
  });

  it("create_campaign is always draft", async () => {
    const { ctx } = await testApp();
    const created = await createCampaign(ctx, { name: "Q3", templateKey: "mixed" });
    expect(created.status).toBe("draft");
  });

  it("start is required before any Unipile call", async () => {
    const { ctx, unipile } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    expect(unipile.calls).toHaveLength(0);
    await startCampaign(ctx, campaign.id);
    expect(unipile.calls).toHaveLength(0);
  });

  it("tick sends with mock Unipile after start and clock advance", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    const result = await tick(ctx, { ignoreWorkingHours: true });
    expect(result.processed).toBeGreaterThan(0);
    expect(unipile.calls.some((c) => c.kind === "invite")).toBe(true);
  });

  it("one in-flight send per sender", async () => {
    const { ctx, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const inflight = await ctx.db.select().from(sendJobs);
    const active = inflight.filter((j) => j.status === "claimed" || j.status === "in_progress");
    expect(active).toHaveLength(0);
    const sent = inflight.filter((j) => j.status === "sent");
    const pending = inflight.filter((j) => j.status === "pending" && j.stepIndex === 0);
    expect(sent.length).toBe(1);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("protect mode off does not invent a ceiling", async () => {
    const { ctx, advance } = await testApp();
    await updateSettings(ctx, { protectMode: false, protectDailyMax: null });
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    await tick(ctx, { ignoreWorkingHours: true });
    const sent = (await ctx.db.select().from(sendJobs).where(eq(sendJobs.status, "sent"))).length;
    expect(sent).toBeGreaterThanOrEqual(2);
  });

  it("protect mode defers once the typed max is hit", async () => {
    const { ctx, advance } = await testApp();
    await updateSettings(ctx, { protectMode: true, protectDailyMax: 1 });
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    await tick(ctx, { ignoreWorkingHours: true });
    const sent = (await ctx.db.select().from(sendJobs).where(eq(sendJobs.status, "sent"))).length;
    expect(sent).toBe(1);
  });

  it("reply stops remaining jobs for that lead", async () => {
    const { ctx, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    const added = await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    expect(added.enrolled).toBe(6);
    const started = await startCampaign(ctx, campaign.id);
    const enrollmentId = started.enrollments[0].id;
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    await recordReply(ctx, { enrollmentId, channel: "linkedin", body: "not now" });
    const remaining = await ctx.db.select().from(sendJobs);
    const open = remaining.filter(
      (j) => j.enrollmentId === enrollmentId && (j.status === "pending" || j.status === "claimed"),
    );
    expect(open).toHaveLength(0);
  });

  it("restriction opens the circuit for that sender", async () => {
    const { ctx, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", templateKey: "linkedin_only" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    const started = await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    await recordRestriction(ctx, started.linkedinSenderId!);
    const again = await tick(ctx, { ignoreWorkingHours: true });
    expect(again.processed).toBe(0);
    const { getCampaign } = await import("@/lib/app/commands");
    const after = await getCampaign(ctx, campaign.id);
    expect(after.status).toBe("restricted");
  });

  it("skips email steps when the lead has no email", async () => {
    const { ctx, unipile, advance } = await testApp();
    const content =
      "name,linkedin_url\nNo Mail,https://www.linkedin.com/in/no-mail\n";
    const list = await importLeads(ctx, { listName: "li-only-person", content });
    const campaign = await createCampaign(ctx, { name: "mixed", templateKey: "mixed" });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    advance(30 * 60 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    advance(50 * 60 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    expect(unipile.calls.filter((c) => c.kind === "email")).toHaveLength(0);
  });
});
