import { describe, expect, it } from "vitest";
import { looksLikeLinkedInRestriction, recordRestriction, runTrialAction, type AppContext } from "@/lib/app/commands";
import { createAppDb, migrate, seedWorkspace } from "@/lib/db/client";
import { senderAccounts } from "@/lib/db/schema";
import { DEFAULT_WORKSPACE_ID } from "@/lib/ids";
import { MockUnipile } from "@/lib/unipile/port";

async function testApp(unipile = new MockUnipile()) {
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

class RestrictUnipile extends MockUnipile {
  async invite(): Promise<never> {
    throw new Error("Unipile 429 /api/v1/users/invite: account restricted");
  }
}

describe("developer trial", () => {
  it("sends a connection through Unipile and does not open a new account", async () => {
    const { ctx, unipile } = await testApp();
    const result = await runTrialAction(ctx, {
      action: "connection",
      url: "https://www.linkedin.com/in/priya-rao",
    });
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(true);
    expect(result.restricted).toBe(false);
    expect(result.dryRun).toBe(true);
    expect(unipile.calls.some((c) => c.kind === "invite")).toBe(true);
    const senders = await ctx.db.select().from(senderAccounts);
    expect(senders).toHaveLength(1);
  });

  it("sends a message through Unipile", async () => {
    const { ctx, unipile } = await testApp();
    const result = await runTrialAction(ctx, {
      action: "message",
      url: "https://www.linkedin.com/in/matt-cole",
      body: "Hello",
    });
    expect(result.ok).toBe(true);
    expect(result.sent).toBe(true);
    expect(unipile.calls.some((c) => c.kind === "message")).toBe(true);
  });

  it("marks the sender restricted and does not create an account", async () => {
    const { ctx, unipile } = await testApp(new RestrictUnipile());
    const result = await runTrialAction(ctx, {
      action: "connection",
      url: "https://www.linkedin.com/in/priya-rao",
    });
    expect(result.restricted).toBe(true);
    expect(result.sent).toBe(false);
    const senders = await ctx.db.select().from(senderAccounts);
    expect(senders).toHaveLength(1);
    expect(senders[0]?.status).toBe("restricted");
    const again = await runTrialAction(ctx, {
      action: "connection",
      url: "https://www.linkedin.com/in/matt-cole",
    });
    expect(again.restricted).toBe(true);
    expect(again.sent).toBe(false);
    expect(unipile.calls.filter((c) => c.kind === "invite")).toHaveLength(0);
  });

  it("treats restriction language as a restrict, not a generic 404", async () => {
    expect(looksLikeLinkedInRestriction("Unipile 429 account restricted")).toBe(true);
    expect(looksLikeLinkedInRestriction("Unipile 404 /api/v1/users/foo")).toBe(false);
  });

  it("already-restricted sender stays stopped", async () => {
    const { ctx } = await testApp();
    await runTrialAction(ctx, {
      action: "connection",
      url: "https://www.linkedin.com/in/priya-rao",
    });
    const [sender] = await ctx.db.select().from(senderAccounts);
    await recordRestriction(ctx, sender.id);
    const after = await runTrialAction(ctx, {
      action: "message",
      url: "https://www.linkedin.com/in/matt-cole",
    });
    expect(after.restricted).toBe(true);
    expect(after.sent).toBe(false);
  });
});
