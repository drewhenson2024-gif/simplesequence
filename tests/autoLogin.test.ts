import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  addLeadsToCampaign,
  autoLogin,
  connectStatus,
  createCampaign,
  saveLinkedInLogin,
  startCampaign,
  tick,
  type AppContext,
} from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { enrollments, sendJobs, senderAccounts } from "@/lib/db/schema";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { openLogin, sealLogin, totpCode } from "@/lib/secure/login";
import { MockUnipile } from "@/lib/unipile/port";

process.env.LOGIN_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");

const SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

class DroppingUnipile extends MockUnipile {
  dropNext = 0;
  async invite(input: Parameters<MockUnipile["invite"]>[0]) {
    if (this.dropNext > 0) {
      this.dropNext -= 1;
      throw new Error(
        'Unipile 401 /api/v1/users/x: {"status":401,"type":"errors/disconnected_account","title":"Disconnected account"}',
      );
    }
    return super.invite(input);
  }
}

async function testApp() {
  const app = createAppDb(":memory:");
  await migrate(app.client);
  await seedWorkspace(app.db);
  let now = new Date("2026-09-19T17:00:00.000Z");
  const unipile = new DroppingUnipile();
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

async function liveSender(ctx: AppContext): Promise<string> {
  const campaign = await createCampaign(ctx, {
    name: "sender",
    steps: [
      { stepIndex: 0, channel: "linkedin", action: "connection", delayHours: 0, bodyTemplate: "", subjectTemplate: null },
    ],
  });
  await startCampaign(ctx, campaign.id);
  const [sender] = await ctx.db.select().from(senderAccounts);
  await ctx.db.update(senderAccounts).set({ unipileAccountId: "acct_live" }).where(eq(senderAccounts.id, sender.id));
  return sender.id;
}

describe("authenticator codes and sealed logins", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    expect(totpCode(SECRET, new Date(59 * 1000))).toBe("287082");
    expect(totpCode(SECRET, new Date(1111111109 * 1000))).toBe("081804");
  });

  it("opens only what it sealed", () => {
    const password = "correct-horse-battery-staple";
    const sealed = sealLogin({ username: "a@b.co", password, totpSecret: SECRET });
    expect(sealed).not.toContain(password);
    expect(sealed).not.toContain(SECRET);
    expect(openLogin(sealed)).toEqual({ username: "a@b.co", password, totpSecret: SECRET });
  });
});

describe("automatic login", () => {
  it("parks the person, logs back in with the 2FA code, and sends on the next check", async () => {
    const { ctx, unipile, advance } = await testApp();
    const { importLeads } = await import("@/lib/app/commands");
    const list = await importLeads(ctx, {
      listName: "drop",
      content: "name,linkedin_url\nAda,https://www.linkedin.com/in/ada\n",
    });
    const campaign = await createCampaign(ctx, {
      name: "drop",
      steps: [
        { stepIndex: 0, channel: "linkedin", action: "connection", delayHours: 0, bodyTemplate: "", subjectTemplate: null },
      ],
    });
    await addLeadsToCampaign(ctx, campaign.id, { listId: list.listId });
    await startCampaign(ctx, campaign.id);
    const [sender] = await ctx.db.select().from(senderAccounts);
    await ctx.db.update(senderAccounts).set({ unipileAccountId: "acct_live" }).where(eq(senderAccounts.id, sender.id));
    const saved = await saveLinkedInLogin(ctx, sender.id, {
      username: "drew@example.com",
      password: "secret-pw",
      totpSecret: SECRET,
    });
    expect(saved.code).toMatch(/^\d{6}$/);

    unipile.dropNext = 1;
    advance(20 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(0);
    const [job] = await ctx.db.select().from(sendJobs);
    expect(job.status).toBe("pending");
    const [enrollment] = await ctx.db.select().from(enrollments);
    expect(enrollment.status).not.toBe("failed");
    const solved = unipile.calls.find((c) => c.kind === "solveCheckpoint");
    expect(solved?.input).toMatchObject({ code: totpCode(SECRET, ctx.clock.now()) });
    const [after] = await ctx.db.select().from(senderAccounts);
    expect(after.status).toBe("healthy");

    advance(2 * 60 * 1000);
    expect((await tick(ctx)).processed).toBe(1);
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(1);
  });

  it("stays logged out and says why when LinkedIn asks for a check it cannot answer", async () => {
    const { ctx, unipile } = await testApp();
    const senderId = await liveSender(ctx);
    await saveLinkedInLogin(ctx, senderId, { username: "d@e.co", password: "pw", totpSecret: SECRET });
    unipile.loginCheckpoints = ["CAPTCHA"];
    const result = await autoLogin(ctx, senderId, { force: true });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("CAPTCHA");
    const [row] = await ctx.db.select().from(senderAccounts);
    expect(row.status).toBe("disconnected");
  });

  it("never returns the saved login", async () => {
    const { ctx } = await testApp();
    const senderId = await liveSender(ctx);
    await saveLinkedInLogin(ctx, senderId, { username: "d@e.co", password: "pw", totpSecret: SECRET });
    const status = await connectStatus(ctx);
    const text = JSON.stringify(status);
    expect(text).not.toContain("loginSecret");
    expect(text).not.toContain("pw");
    expect(status.senders[0]?.autoLogin).toBe(true);
  });
});
