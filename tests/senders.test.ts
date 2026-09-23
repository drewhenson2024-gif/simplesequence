import { describe, expect, it } from "vitest";
import {
  CommandError,
  connectAccount,
  createCampaign,
  pickLinkedInSenderId,
  reconnectAccount,
  refreshLinkedInProfiles,
  runTrialAction,
  startCampaign,
  syncUnipileAccounts,
  updateSettings,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { senderAccounts } from "@/lib/db/schema";
import { linkedInProfileHref } from "@/lib/domain/linkedinProfile";
import { stepsForTemplate } from "@/lib/domain/templates";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile, type UnipileAccount } from "@/lib/unipile/port";
import { eq } from "drizzle-orm";

async function testApp(unipile: MockUnipile = new MockUnipile()) {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  const ctx: AppContext = {
    db: app.db,
    client: app.client,
    unipile,
    clock: { now: () => new Date("2026-09-14T17:00:00.000Z") },
    actor: "test",
    workspaceId: DEFAULT_WORKSPACE_ID,
  };
  return { ctx, unipile };
}

async function insertSender(
  ctx: AppContext,
  row: { id: string; displayName: string; unipileAccountId: string },
) {
  await ctx.db.insert(senderAccounts).values({
    id: row.id,
    workspaceId: DEFAULT_WORKSPACE_ID,
    channel: "linkedin",
    status: "healthy",
    unipileAccountId: row.unipileAccountId,
    displayName: row.displayName,
    timezone: "America/Los_Angeles",
    lastError: null,
    createdAt: "2026-09-14T17:00:00.000Z",
  });
}

describe("linkedin sender roster", () => {
  it("prefers the stored sender when it still exists", () => {
    const senders = [
      { id: "snd_a", channel: "linkedin", status: "healthy", unipileAccountId: "acct_a" },
      { id: "snd_b", channel: "linkedin", status: "healthy", unipileAccountId: "acct_b" },
    ];
    expect(pickLinkedInSenderId(senders, "snd_b")).toBe("snd_b");
    expect(pickLinkedInSenderId(senders, "snd_missing")).toBe("snd_a");
  });

  it("selects a sender and uses it on Start", async () => {
    const { ctx } = await testApp();
    await insertSender(ctx, { id: "snd_a", displayName: "Drew A", unipileAccountId: "acct_a" });
    await insertSender(ctx, { id: "snd_b", displayName: "Drew B", unipileAccountId: "acct_b" });
    await updateSettings(ctx, { linkedinSenderId: "snd_b" });
    const campaign = await createCampaign(ctx, { name: "LI", steps: stepsForTemplate() });
    const started = await startCampaign(ctx, campaign.id);
    expect(started.linkedinSenderId).toBe("snd_b");
  });

  it("does not move a sequence that already has a sender", async () => {
    const { ctx } = await testApp();
    await insertSender(ctx, { id: "snd_a", displayName: "Drew A", unipileAccountId: "acct_a" });
    await insertSender(ctx, { id: "snd_b", displayName: "Drew B", unipileAccountId: "acct_b" });
    await updateSettings(ctx, { linkedinSenderId: "snd_b" });
    const campaign = await createCampaign(ctx, {
      name: "LI",
      steps: stepsForTemplate(),
      linkedinSenderId: "snd_a",
    });
    const started = await startCampaign(ctx, campaign.id);
    expect(started.linkedinSenderId).toBe("snd_a");
  });

  it("Add LinkedIn opens a new pending row when keys are live", async () => {
    const prevKey = process.env.UNIPILE_API_KEY;
    const prevDsn = process.env.UNIPILE_DSN;
    process.env.UNIPILE_API_KEY = "test-key";
    process.env.UNIPILE_DSN = "https://unipile.example";
    try {
      const { ctx, unipile } = await testApp();
      await insertSender(ctx, { id: "snd_a", displayName: "Drew A", unipileAccountId: "acct_a" });
      const result = await connectAccount(ctx, "linkedin");
      expect(result.live).toBe(true);
      expect(result.senderId).not.toBe("snd_a");
      const rows = await ctx.db.select().from(senderAccounts);
      const pending = rows.find((row) => row.id === result.senderId);
      expect(pending?.status).toBe("pending");
      expect(pending?.displayName).toBe("Connecting LinkedIn…");
      expect(unipile.calls.some((c) => c.kind === "hostedAuth" && (c.input as { type?: string }).type === "create")).toBe(
        true,
      );
    } finally {
      if (prevKey === undefined) delete process.env.UNIPILE_API_KEY;
      else process.env.UNIPILE_API_KEY = prevKey;
      if (prevDsn === undefined) delete process.env.UNIPILE_DSN;
      else process.env.UNIPILE_DSN = prevDsn;
    }
  });

  it("Reconnect asks Unipile to reconnect that account", async () => {
    const { ctx, unipile } = await testApp();
    await insertSender(ctx, { id: "snd_b", displayName: "Drew B", unipileAccountId: "acct_b" });
    const result = await reconnectAccount(ctx, "snd_b");
    expect(result.authUrl).toContain("type=reconnect");
    expect(result.authUrl).toContain("reconnect=acct_b");
    expect(
      unipile.calls.some(
        (c) =>
          c.kind === "hostedAuth" &&
          (c.input as { type?: string; reconnectAccount?: string }).type === "reconnect" &&
          (c.input as { reconnectAccount?: string }).reconnectAccount === "acct_b",
      ),
    ).toBe(true);
  });

  it("surfaces the Unipile reconnect error", async () => {
    class FailAuth extends MockUnipile {
      async hostedAuthUrl(): Promise<never> {
        throw new Error("Unipile 400 /api/v1/hosted/accounts/link: already linked");
      }
    }
    const { ctx } = await testApp(new FailAuth());
    await insertSender(ctx, { id: "snd_b", displayName: "Drew B", unipileAccountId: "acct_b" });
    await expect(reconnectAccount(ctx, "snd_b")).rejects.toMatchObject({
      name: "CommandError",
      message: "Unipile 400 /api/v1/hosted/accounts/link: already linked",
      status: 502,
    } satisfies Partial<CommandError>);
  });

  it("Trial sends from the selected account", async () => {
    const { ctx, unipile } = await testApp();
    await insertSender(ctx, { id: "snd_a", displayName: "Drew A", unipileAccountId: "acct_a" });
    await insertSender(ctx, { id: "snd_b", displayName: "Drew B", unipileAccountId: "acct_b" });
    await updateSettings(ctx, { linkedinSenderId: "snd_b" });
    await runTrialAction(ctx, { action: "connection", url: "https://www.linkedin.com/in/priya-rao" });
    const invite = unipile.calls.find((c) => c.kind === "invite");
    expect((invite?.input as { accountId?: string }).accountId).toBe("acct_b");
  });

  it("stores each account's LinkedIn profile URL", async () => {
    class Roster extends MockUnipile {
      async listAccounts(): Promise<UnipileAccount[]> {
        return [
          { id: "acct_a", type: "LINKEDIN", name: "Drew A" },
          { id: "acct_b", type: "LINKEDIN", name: "Drew B" },
        ];
      }
      async ownProfile(accountId: string) {
        if (accountId === "acct_b") return { profileUrl: "https://evil.example/in/drew" };
        return { profileUrl: "https://www.linkedin.com/in/drew-a" };
      }
    }
    const { ctx } = await testApp(new Roster());
    await syncUnipileAccounts(ctx);
    const rows = await ctx.db.select().from(senderAccounts);
    const a = rows.find((row) => row.unipileAccountId === "acct_a");
    const b = rows.find((row) => row.unipileAccountId === "acct_b");
    expect(a?.profileUrl).toBe("https://www.linkedin.com/in/drew-a");
    expect(b?.profileUrl ?? null).toBeNull();
  });

  it("fills a missing profile link without asking again once it is stored", async () => {
    const { ctx, unipile } = await testApp();
    await insertSender(ctx, { id: "snd_a", displayName: "Drew A", unipileAccountId: "acct_a" });
    await refreshLinkedInProfiles(ctx);
    const [first] = await ctx.db.select().from(senderAccounts).where(eq(senderAccounts.id, "snd_a"));
    expect(first?.profileUrl).toBe("https://www.linkedin.com/in/acct_a");
    const calls = unipile.calls.filter((c) => c.kind === "ownProfile").length;
    await refreshLinkedInProfiles(ctx);
    expect(unipile.calls.filter((c) => c.kind === "ownProfile").length).toBe(calls);
  });

  it("accepts only https LinkedIn profile URLs", () => {
    expect(linkedInProfileHref("https://www.linkedin.com/in/drew-henson")).toBe(
      "https://www.linkedin.com/in/drew-henson",
    );
    expect(linkedInProfileHref("http://www.linkedin.com/in/drew-henson")).toBeNull();
    expect(linkedInProfileHref("https://evil.example/in/drew")).toBeNull();
  });
});
