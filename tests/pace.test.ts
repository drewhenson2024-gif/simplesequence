import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  createCampaign,
  runCheck,
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

  it("holds the next connection for a random gap sized to the daily amount", async () => {
    const { ctx, advance } = await testApp();
    const list = await importList(ctx, "gap", `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\n`);
    const campaign = await createCampaign(ctx, { name: "gap", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    advance(2 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    advance(2 * 60 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    advance(6 * 60 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
  });

  it("stops trying other connections after LinkedIn refuses one", async () => {
    const { ctx, advance } = await testApp();
    const refusing = new MockUnipile();
    let refusals = 0;
    refusing.invite = async () => {
      refusals += 1;
      throw new Error('Unipile 422 /api/v1/users/invite: {"type":"errors/cannot_resend_yet"}');
    };
    ctx.unipile = refusing;
    const list = await importList(
      ctx,
      "refuse",
      `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\nLin,https://www.linkedin.com/in/lin\n`,
    );
    const campaign = await createCampaign(ctx, { name: "refuse", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    for (let i = 0; i < 10; i += 1) {
      advance(30 * 60 * 1000);
      await tick(ctx);
    }
    expect(refusals).toBe(1);
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

  it("frees a noted connection once one leaves the month", async () => {
    const { ctx, advance } = await testApp();
    const list = await importList(ctx, "roll", csv("Ada", "ada"));
    const campaign = await createCampaign(ctx, { name: "roll", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    const [pending] = await ctx.db.select().from(sendJobs);
    const now = ctx.clock.now();
    for (let i = 0; i < 5; i += 1) {
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
    const { getCampaign } = await import("@/lib/app/commands");
    const full = await getCampaign(ctx, campaign.id);
    expect(full.accountBudget?.used).toBe(5);
    expect(full.accountBudget?.allowance).toBe(5);
    expect(full.accountBudget?.periodLabel).toBe("this month");
    expect(full.accountBudget?.note).toContain("this month");
    expect((await tick(ctx)).processed).toBe(0);
    await ctx.db
      .update(sendJobs)
      .set({ claimedAt: new Date(ctx.clock.now().getTime() - 31 * 24 * 60 * 60 * 1000).toISOString() })
      .where(eq(sendJobs.id, "job_cap_0"));
    advance(8 * 60 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
  });

  it("shows the account budget and why the next step is waiting", async () => {
    const { ctx, advance } = await testApp();
    const { getCampaign } = await import("@/lib/app/commands");
    const list = await importList(
      ctx,
      "budget-view",
      `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\n`,
    );
    const campaign = await createCampaign(ctx, { name: "budget view", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx);
    const duringGap = await getCampaign(ctx, campaign.id);
    expect(duringGap.accountBudget?.used).toBe(1);
    expect(duringGap.accountBudget?.allowance).toBe(5);
    expect(duringGap.accountBudget?.note).toContain("random gap");
    advance(8 * 60 * 60 * 1000);
    const waitingOnCheck = await getCampaign(ctx, campaign.id);
    expect(waitingOnCheck.accountBudget?.note).toContain("A check will send");
    const checked = await runCheck(ctx);
    expect(checked.processed).toBe(1);
  });

  it("says the next step is due when its time has not arrived", async () => {
    const { ctx, advance } = await testApp();
    const { getCampaign } = await import("@/lib/app/commands");
    const list = await importList(ctx, "due-view", csv("Ada", "ada"));
    const campaign = await createCampaign(ctx, { name: "due view", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx);
    advance(2 * 60 * 1000);
    const view = await getCampaign(ctx, campaign.id);
    expect(view.accountBudget?.categoryLabel).toBe("Message after they accept");
    expect(view.accountBudget?.note).toContain("due");
  });

  it("reports the suggested amount for a connection with a note", async () => {
    const { ctx, advance } = await testApp();
    const { getFrequency } = await import("@/lib/app/commands");
    const list = await importList(
      ctx,
      "freq",
      `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\n`,
    );
    const campaign = await createCampaign(ctx, { name: "freq", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx);
    advance(2 * 60 * 1000);
    const before = await getFrequency(ctx);
    const noted = before.categories.find((row) => row.id === "connection_with_note");
    const plain = before.categories.find((row) => row.id === "connection_without_note");
    expect(noted).toMatchObject({ day: 5, week: 5, month: 5, usedMonth: 1 });
    expect(plain).toMatchObject({ day: 21, week: 150, month: 600, usedMonth: 0 });
    expect(before.gapOpen).toBe(true);
    expect(noted?.averageGapMinutes).toBe(288);
    expect(plain?.averageGapMinutes).toBe(69);
    advance(8 * 60 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
  });

  it("updates queued copy and delay while a sequence is running", async () => {
    const { ctx, advance } = await testApp();
    const { getCampaign, updateCampaign } = await import("@/lib/app/commands");
    const { messages } = await import("@/lib/db/schema");
    const list = await importList(
      ctx,
      "edit-live",
      `${csv("Ada", "ada").trim()}\nGrace,https://www.linkedin.com/in/grace\n`,
    );
    const campaign = await createCampaign(ctx, { name: "edit live", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx);
    advance(2 * 60 * 1000);
    const before = await getCampaign(ctx, campaign.id);
    const sent = before.jobs.find((job) => job.status === "sent");
    const pending = before.jobs.find((job) => job.status === "pending" && job.action === "connection");
    const follow = before.jobs.find((job) => job.action === "message" && job.stepIndex === 1);
    expect(sent?.action).toBe("connection");
    expect(pending).toBeTruthy();
    expect(follow?.status).toBe("pending");
    await updateCampaign(ctx, campaign.id, {
      steps: before.steps.map((step) => ({
        stepIndex: step.stepIndex,
        channel: "linkedin" as const,
        action: step.action === "connection" ? ("connection" as const) : ("message" as const),
        delayHours: step.stepIndex === 1 ? step.delayHours + 24 : step.delayHours,
        bodyTemplate: step.action === "connection" ? "Updated hello {{first_name}}" : step.bodyTemplate,
        subjectTemplate: step.subjectTemplate,
        enabled: step.enabled !== 0,
      })),
    });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.steps[0]?.bodyTemplate).toBe("Updated hello {{first_name}}");
    expect(after.jobs.find((job) => job.id === sent?.id)?.status).toBe("sent");
    expect(after.jobs.find((job) => job.id === pending?.id)?.status).toBe("pending");
    expect(after.jobs.find((job) => job.id === follow?.id)?.dueAt).not.toBe(follow?.dueAt);
    const sentMessages = await ctx.db.select().from(messages);
    expect(sentMessages.some((row) => row.body.includes("Updated hello"))).toBe(false);
  });
});

async function importList(ctx: AppContext, name: string, content: string) {
  const { importLeads } = await import("@/lib/app/commands");
  const list = await importLeads(ctx, { listName: name, content });
  return list.listId;
}
