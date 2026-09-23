import { readFileSync } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  createCampaign,
  getCampaign,
  getInbox,
  getList,
  importLeads,
  listLists,
  peopleCatalog,
  recordReply,
  recordRestriction,
  resumeCampaign,
  replyToLead,
  startCampaign,
  stopLead,
  tick,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { sendJobs, senderAccounts, sequenceSteps } from "@/lib/db/schema";
import { stepsForTemplate } from "@/lib/domain/templates";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

const fixture = (name: string) => readFileSync(path.join(process.cwd(), "fixtures", name), "utf8");

class ScriptedUnipile extends MockUnipile {
  constructor(private readonly inviteErrors: Array<Error | null>) {
    super();
  }
  async invite(input: Parameters<MockUnipile["invite"]>[0]) {
    const next = this.inviteErrors.shift();
    if (next) throw next;
    return super.invite(input);
  }
}

async function testApp(unipile: MockUnipile = new MockUnipile()) {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
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
    const created = await createCampaign(ctx, { name: "Q3", templateKey: "linkedin_only" });
    expect(created.status).toBe("draft");
  });

  it("create_campaign defaults to empty steps", async () => {
    const { ctx } = await testApp();
    const created = await createCampaign(ctx, { name: "Q3" });
    const campaign = await getCampaign(ctx, created.id);
    expect(campaign.steps).toEqual([]);
  });

  it("draft sequence editor persists copy and skips disabled stages", async () => {
    const { ctx } = await testApp();
    const created = await createCampaign(ctx, { name: "edit me", templateKey: "linkedin_only" });
    const { updateCampaign, getCampaign } = await import("@/lib/app/commands");
    await updateCampaign(ctx, created.id, {
      name: "Growth leaders",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}}",
          subjectTemplate: null,
          enabled: true,
          skipOverdueHours: 72,
        },
        {
          stepIndex: 1,
          channel: "linkedin",
          action: "message",
          delayHours: 48,
          bodyTemplate: "bump",
          subjectTemplate: null,
          enabled: false,
          skipOverdueHours: 72,
        },
      ],
    });
    const after = await getCampaign(ctx, created.id);
    expect(after.name).toBe("Growth leaders");
    expect(after.steps).toHaveLength(2);
    expect(after.steps[0].bodyTemplate).toBe("Hi {{first_name}}");
    expect(after.steps[1].enabled).toBe(0);
  });

  it("start is required before any Unipile call", async () => {
    const { ctx, unipile } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    expect(unipile.calls.filter((c) => c.kind !== "lookup")).toHaveLength(0);
    await startCampaign(ctx, campaign.id);
    expect(unipile.calls.filter((c) => c.kind !== "lookup")).toHaveLength(0);
  });

  it("tick sends with mock Unipile after start and clock advance", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
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
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
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

  it("reply stops remaining jobs for that lead", async () => {
    const { ctx, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
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
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
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

  it("defers an invite quota without stopping the sequence", async () => {
    const { ctx, unipile, advance } = await testApp(
      new ScriptedUnipile([new Error("Unipile 422 cannot_resend_yet"), null]),
    );
    const list = await importLeads(ctx, {
      listName: "quota",
      content: "name,linkedin_url\nPat,https://www.linkedin.com/in/pat-lee\n",
    });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const paused = await getCampaign(ctx, campaign.id);
    expect(paused.status).toBe("running");
    expect(paused.senderSignal).toBeNull();
    const parked = paused.jobs.find((j) => j.action === "connection");
    expect(parked?.status).toBe("pending");
    expect(parked?.skipReason).toBe("invite limit");
    const senders = await ctx.db.select().from(senderAccounts);
    expect(senders[0]?.status).toBe("healthy");
    expect(senders[0]?.lastError).toBeNull();
    advance(25 * 60 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.status).toBe("running");
    expect(after.jobs.find((j) => j.action === "connection")?.status).toBe("sent");
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(1);
  });

  it("pauses on throttle and resumes after a human Start", async () => {
    const { ctx, unipile, advance } = await testApp(
      new ScriptedUnipile([new Error("Unipile 429 provider/too_many_requests"), null]),
    );
    const list = await importLeads(ctx, {
      listName: "throttle",
      content: "name,linkedin_url\nPat,https://www.linkedin.com/in/pat-lee\n",
    });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const stopped = await getCampaign(ctx, campaign.id);
    expect(stopped.status).toBe("paused");
    expect(stopped.senderSignal).toBe("throttled");
    const senders = await ctx.db.select().from(senderAccounts);
    expect(senders[0]?.status).toBe("healthy");
    expect(senders[0]?.lastError).toBe("provider_throttle");
    const idle = await tick(ctx, { ignoreWorkingHours: true });
    expect(idle.processed).toBe(0);
    await resumeCampaign(ctx, campaign.id);
    const resumed = await getCampaign(ctx, campaign.id);
    expect(resumed.status).toBe("running");
    expect(resumed.senderSignal).toBeNull();
    await tick(ctx, { ignoreWorkingHours: true });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.jobs.find((j) => j.action === "connection")?.status).toBe("sent");
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(1);
  });

  it("hard restrict from a send still opens the circuit", async () => {
    const { ctx, advance } = await testApp(
      new ScriptedUnipile([new Error("Unipile 429 /api/v1/users/invite: account restricted")]),
    );
    const list = await importLeads(ctx, {
      listName: "restrict",
      content: "name,linkedin_url\nPat,https://www.linkedin.com/in/pat-lee\n",
    });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.status).toBe("restricted");
    expect(after.senderSignal).toBe("restricted");
    const senders = await ctx.db.select().from(senderAccounts);
    expect(senders[0]?.status).toBe("restricted");
  });

  it("rejects email steps", async () => {
    const { ctx } = await testApp();
    await expect(
      createCampaign(ctx, {
        name: "mail",
        steps: [
          {
            stepIndex: 0,
            channel: "email" as never,
            action: "email" as never,
            delayHours: 0,
            bodyTemplate: "Hi",
            subjectTemplate: "Hello",
          },
        ],
      }),
    ).rejects.toThrow(/email steps are not supported/);
  });

  it("skips LinkedIn when the lead has no profile", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, {
      listName: "no-profile",
      content: "name,email\nNo Li,noli@example.com\n",
    });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(0);
    expect(unipile.calls.filter((c) => c.kind === "email")).toHaveLength(0);
    const after = await getCampaign(ctx, campaign.id);
    expect(after.jobs.find((j) => j.action === "connection")?.skipReason).toBe("no linkedin url");
  });

  it("skips a LinkedIn message as not connected when the invite was skipped", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, {
      listName: "both",
      content:
        "name,email,linkedin_url\nPat,pat@example.com,https://www.linkedin.com/in/pat-lee\n",
    });
    const campaign = await createCampaign(ctx, {
      name: "disabled connect",
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
          bodyTemplate: "Thanks for connecting",
          subjectTemplate: null,
        },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    await ctx.db
      .update(sequenceSteps)
      .set({ enabled: 0 })
      .where(and(eq(sequenceSteps.campaignId, campaign.id), eq(sequenceSteps.stepIndex, 0)));
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const after = await getCampaign(ctx, campaign.id);
    expect(after.jobs.find((j) => j.action === "connection")?.skipReason).toBe("disabled");
    expect(after.jobs.find((j) => j.action === "message")?.skipReason).toBe("not connected");
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(0);
    expect(unipile.calls.filter((c) => c.kind === "email")).toHaveLength(0);
  });

  it("still sends a step after its due time", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "late still sends", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(10 * 24 * 60 * 60 * 1000);
    const result = await tick(ctx, { ignoreWorkingHours: true });
    expect(result.processed).toBeGreaterThan(0);
    expect(unipile.calls.some((c) => c.kind === "invite")).toBe(true);
    const after = await getCampaign(ctx, campaign.id);
    expect(after.jobs.some((j) => j.skipReason === "overdue")).toBe(false);
  });

  it("inbox reply sends via Unipile without restarting the sequence", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "small", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    const added = await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    expect(added.enrolled).toBe(6);
    const started = await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const enrollmentId = started.enrollments[0].id;
    await recordReply(ctx, { enrollmentId, channel: "linkedin", body: "interested" });
    const before = unipile.calls.filter((c) => c.kind === "message").length;
    const replied = await replyToLead(ctx, { enrollmentId, body: "Great — Thursday work?", channel: "linkedin" });
    expect(replied.ok).toBe(true);
    expect(unipile.calls.filter((c) => c.kind === "message").length).toBe(before + 1);
    const after = await getCampaign(ctx, campaign.id);
    expect(after.status).toBe("running");
    expect(after.enrollments.find((e) => e.id === enrollmentId)?.status).toBe("replied");
    const inbox = await getInbox(ctx);
    expect(inbox.some((m) => m.direction === "outbound" && m.body.includes("Thursday"))).toBe(true);
    await stopLead(ctx, enrollmentId);
  });

  it("passes optional LinkedIn image URLs through Unipile", async () => {
    const { ctx, unipile, advance } = await testApp();
    const list = await importLeads(ctx, { listName: "img", content: fixture("csv-6.csv") });
    const campaign = await createCampaign(ctx, {
      name: "LI image",
      steps: [
        {
          stepIndex: 0,
          channel: "linkedin",
          action: "connection",
          delayHours: 0,
          bodyTemplate: "Hi {{first_name}}",
          subjectTemplate: null,
          imageUrl: "https://example.com/card.png",
        },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    await tick(ctx, { ignoreWorkingHours: true });
    const invite = unipile.calls.find((c) => c.kind === "invite");
    expect(invite?.input).toMatchObject({ imageUrl: "https://example.com/card.png" });
  });

  it("caps LinkedIn invites per sender per day", async () => {
    const { ctx, unipile, advance } = await testApp();
    const header = "first_name,last_name,company,title,email,linkedin_url";
    const rows = Array.from(
      { length: 30 },
      (_, i) => `P${i},Lead${i},Co,Ops,p${i}@x.com,https://www.linkedin.com/in/p${i}`,
    );
    const list = await importLeads(ctx, { listName: "cap", content: [header, ...rows].join("\n") });
    const campaign = await createCampaign(ctx, { name: "LI cap", steps: stepsForTemplate() });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    advance(20 * 60 * 1000);
    for (let i = 0; i < 25; i += 1) {
      await tick(ctx, { ignoreWorkingHours: true });
      advance(2 * 60 * 1000);
    }
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(25);
    const extra = await tick(ctx, { ignoreWorkingHours: true });
    expect(extra.processed).toBe(0);
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(25);
  });

  it("fills name, title, company, and headline from a LinkedIn lookup", async () => {
    const { ctx, unipile } = await testApp();
    const list = await importLeads(ctx, {
      listName: "urls",
      urls: ["https://www.linkedin.com/in/priya-rao"],
    });
    const got = await getList(ctx, list.listId);
    const lead = got.leads[0];
    expect(lead?.fullName).toBe("Priya Rao");
    expect(lead?.title).toBe("Operator");
    expect(lead?.company).toBe("Example");
    expect(lead?.headline).toBe("Operator at Example");
    expect(lead?.location).toBe("Example City");
    expect(lead?.about).toBe("Builds sequences for operators.");
    expect(lead?.openingLine).toBe("");
    expect(unipile.calls.some((c) => c.kind === "lookup")).toBe(true);
  });

  it("does not overwrite CSV company, title, or opener", async () => {
    const { ctx } = await testApp();
    const list = await importLeads(ctx, { listName: "csv", content: fixture("csv-6.csv") });
    const ada = (await getList(ctx, list.listId)).leads.find((l) => l.email === "ada@example.com");
    expect(ada?.company).toBe("Analytical Engines");
    expect(ada?.title).toBe("Countess");
    expect(ada?.openingLine).toBe("Saw your note on difference engines");
  });

  it("still imports when profile lookup fails", async () => {
    const { ctx, unipile } = await testApp();
    unipile.lookupProfile = async () => {
      throw new Error("unipile down");
    };
    const list = await importLeads(ctx, {
      listName: "fail",
      urls: ["https://www.linkedin.com/in/priya-rao"],
    });
    expect(list.counts.imported).toBe(1);
    const lead = (await getList(ctx, list.listId)).leads[0];
    expect(lead?.fullName.toLowerCase()).toContain("priya");
    expect(lead?.company).toBe("");
  });

  it("lists people with lead counts without a per-list query", async () => {
    const { ctx } = await testApp();
    const a = await importLeads(ctx, {
      listName: "A",
      urls: ["https://www.linkedin.com/in/priya-rao"],
    });
    const b = await importLeads(ctx, {
      listName: "B",
      urls: ["https://www.linkedin.com/in/matt-cole", "https://www.linkedin.com/in/reid-hoffman"],
    });
    const rows = await listLists(ctx);
    expect(rows.find((row) => row.id === a.listId)?.leadCount).toBe(1);
    expect(rows.find((row) => row.id === b.listId)?.leadCount).toBe(2);
    const catalog = await peopleCatalog(ctx);
    expect(catalog.find((row) => row.id === a.listId)?.leads).toHaveLength(1);
    expect(catalog.find((row) => row.id === b.listId)?.leads).toHaveLength(2);
  });

  it("migrate is safe to run twice", async () => {
    const app = createAppDb(":memory:");
    await migrate(app.client);
    await migrate(app.client);
  });
});
