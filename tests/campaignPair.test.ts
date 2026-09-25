import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createCampaignFromPair,
  createSequence,
  getCampaign,
  importLeads,
  updateSequence,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { sequenceTemplateSteps } from "@/lib/db/schema";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile: new MockUnipile(),
    clock: { now: () => new Date("2026-09-25T17:00:00.000Z") },
    actor: "test",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return ctx;
}

describe("campaign is a sequence plus people", () => {
  it("copies the sequence onto the campaign and leaves the sequence editable", async () => {
    const ctx = await testApp();
    const list = await importLeads(ctx, {
      listName: "Founders",
      content: "name,linkedin_url\nAda,https://www.linkedin.com/in/ada\n",
    });
    const sequence = await createSequence(ctx, {
      name: "Intro",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}}",
          subjectTemplate: null,
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 0,
          bodyTemplate: "Following up",
          subjectTemplate: null,
        },
      ],
    });
    const campaign = await createCampaignFromPair(ctx, { sequenceId: sequence.id, listId: list.listId });
    expect(campaign.status).toBe("draft");
    expect(campaign.sequenceName).toBe("Intro");
    expect(campaign.listName).toBe("Founders");
    expect(campaign.enrollments).toHaveLength(1);
    expect(campaign.steps.map((step) => step.bodyTemplate)).toEqual(["Hi {{first_name}}", "Following up"]);
    expect(campaign.jobs).toHaveLength(0);

    await updateSequence(ctx, sequence.id, {
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 48,
          bodyTemplate: "Changed later",
          subjectTemplate: null,
        },
      ],
    });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.steps.map((step) => step.bodyTemplate)).toEqual(["Hi {{first_name}}", "Following up"]);
    const template = await ctx.db
      .select()
      .from(sequenceTemplateSteps)
      .where(eq(sequenceTemplateSteps.sequenceId, sequence.id));
    expect(template).toHaveLength(1);
    expect(template[0]?.bodyTemplate).toBe("Changed later");
  });
});
