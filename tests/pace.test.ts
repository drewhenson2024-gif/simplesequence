import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  createCampaign,
  startCampaign,
  tick,
  updateCampaign,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { sendJobs } from "@/lib/db/schema";
import { stepsForTemplate } from "@/lib/domain/templates";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  let now = new Date("2026-09-19T17:00:00.000Z");
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    clock: { now: () => now },
    actor: "test",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return {
    ctx,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

function csv(name: string, slug: string) {
  return `name,linkedin_url\n${name},https://www.linkedin.com/in/${slug}\n`;
}

describe("rolling account pace", () => {
  it("sends on a Saturday night", async () => {
    const { ctx, advance } = await testApp();
    const list = await importList(ctx, "sat", csv("Ada", "ada"));
    const campaign = await createCampaign(ctx, { name: "weekend", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    const result = await tick(ctx);
    expect(result.processed).toBe(1);
  });

  it("holds a second action until the minimum gap has passed", async () => {
    const { ctx, advance } = await testApp();
    const list = await importList(ctx, "gap", `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\n`);
    const campaign = await createCampaign(ctx, { name: "gap", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    expect((await tick(ctx)).processed).toBe(0);
    advance(2 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
  });

  it("lets a higher-priority sequence take the slot", async () => {
    const { ctx, advance } = await testApp();
    const lowList = await importList(ctx, "low", csv("Ada", "ada"));
    const highList = await importList(ctx, "high", csv("Grace", "grace"));
    const low = await createCampaign(ctx, { name: "low", steps: stepsForTemplate() });
    const high = await createCampaign(ctx, { name: "high", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, low.id, { listId: lowList });
    await addLeadsToCampaign(ctx, high.id, { listId: highList });
    await startCampaign(ctx, low.id);
    await startCampaign(ctx, high.id);
    await updateCampaign(ctx, high.id, { priority: 5 });
    await ctx.db.update(sendJobs).set({ dueAt: "2026-09-19T17:00:00.000Z" }).where(eq(sendJobs.campaignId, low.id));
    await ctx.db.update(sendJobs).set({ dueAt: "2026-09-19T17:30:00.000Z" }).where(eq(sendJobs.campaignId, high.id));
    advance(60 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    const jobs = await ctx.db.select().from(sendJobs);
    expect(jobs.find((job) => job.status === "sent")?.campaignId).toBe(high.id);
  });

  it("frees a connection slot once the oldest invite leaves the last 24 hours", async () => {
    const { ctx, advance } = await testApp();
    const list = await importList(ctx, "roll", csv("Ada", "ada"));
    const campaign = await createCampaign(ctx, { name: "roll", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    const [pending] = await ctx.db.select().from(sendJobs);
    const now = ctx.clock.now();
    for (let i = 0; i < 25; i += 1) {
      await ctx.db.insert(sendJobs).values({
        id: `job_cap_${i}`,
        enrollmentId: `enr_cap_${i}`,
        senderId: pending.senderId,
        campaignId: campaign.id,
        stepIndex: 0,
        status: "sent",
        dueAt: now.toISOString(),
        claimedAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString(),
        claimedBy: "worker",
        idempotencyKey: `cap:${i}`,
        dryRun: 1,
        createdAt: now.toISOString(),
      });
    }
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    await ctx.db
      .update(sendJobs)
      .set({ claimedAt: new Date(ctx.clock.now().getTime() - 25 * 60 * 60 * 1000).toISOString() })
      .where(eq(sendJobs.id, "job_cap_0"));
    expect((await tick(ctx)).processed).toBe(1);
  });
});

async function importList(ctx: AppContext, name: string, content: string) {
  const { importLeads } = await import("@/lib/app/commands");
  const list = await importLeads(ctx, { listName: name, content });
  return list.listId;
}
