import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  createCampaign,
  getCampaign,
  importLeads,
  startCampaign,
  tick,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { senderAccounts, sendJobs } from "@/lib/db/schema";
import { planFromPremiumFeatures, stepRequirement } from "@/lib/domain/linkedinPlan";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  let now = new Date("2026-09-19T17:00:00.000Z");
  const unipile = new MockUnipile();
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

describe("linkedin plan", () => {
  it("reads the highest plan from Unipile premium features", () => {
    expect(planFromPremiumFeatures([])).toBe("normal");
    expect(planFromPremiumFeatures(["premium"])).toBe("premium");
    expect(planFromPremiumFeatures(["sales_navigator", "premium"])).toBe("sales_navigator");
    expect(planFromPremiumFeatures(["recruiter"])).toBe("recruiter");
  });

  it("labels a message before a connection as blocked on a normal account", () => {
    const normal = stepRequirement({ action: "message", followsConnection: false, plan: "normal" });
    expect(normal.blocked).toContain("will not send");
    const premium = stepRequirement({ action: "message", followsConnection: false, plan: "premium" });
    expect(premium.blocked).toBeNull();
    const follow = stepRequirement({ action: "message", followsConnection: true, plan: "normal" });
    expect(follow.need).toContain("after they accept");
    expect(follow.blocked).toBeNull();
  });

  it("waits to message until they accept, then sends", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, {
      listName: "accept",
      content: "name,linkedin_url\nAda,https://www.linkedin.com/in/ada\n",
    });
    const campaign = await createCampaign(ctx, {
      name: "accept",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi",
          subjectTemplate: null,
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 0,
          bodyTemplate: "Hello",
          subjectTemplate: null,
        },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    await ctx.db.update(sendJobs).set({ dueAt: "2026-09-19T17:00:00.000Z" }).where(eq(sendJobs.status, "pending"));
    unipile.firstDegree = false;
    advance(2 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    const waiting = await getCampaign(ctx, campaign.id);
    const held = waiting.jobs.find((job) => job.action === "message");
    expect(held?.status).toBe("pending");
    expect(held?.error).toBe("waiting for accept");
    expect(unipile.calls.some((call) => call.kind === "message")).toBe(false);
    expect(waiting.accountBudget?.note).toContain("accept");
    unipile.firstDegree = true;
    expect((await tick(ctx)).processed).toBe(1);
    expect(unipile.calls.some((call) => call.kind === "message")).toBe(true);
  });

  it("does not send a message with no connection from a normal account", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, {
      listName: "inmail",
      content: "name,linkedin_url\nAda,https://www.linkedin.com/in/ada\n",
    });
    const campaign = await createCampaign(ctx, {
      name: "inmail",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "message",
          delayHours: 0,
          bodyTemplate: "Hello",
          subjectTemplate: null,
        },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    const skipped = await getCampaign(ctx, campaign.id);
    expect(skipped.jobs[0]?.status).toBe("skipped");
    expect(skipped.jobs[0]?.error).toBe("needs premium");
    expect(unipile.calls.some((call) => call.kind === "message")).toBe(false);
  });

  it("sends InMail when the account is Premium", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, {
      listName: "premium",
      content: "name,linkedin_url\nAda,https://www.linkedin.com/in/ada\n",
    });
    const campaign = await createCampaign(ctx, {
      name: "premium",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "message",
          delayHours: 0,
          bodyTemplate: "Hello",
          subjectTemplate: null,
        },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    await ctx.db.update(senderAccounts).set({ linkedinPlan: "premium" });
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    const sent = unipile.calls.find((call) => call.kind === "message");
    expect(sent?.input).toMatchObject({ inmail: true });
  });
});
