import { eq } from "drizzle-orm";
import { z } from "zod";
import { pickLinkedInSenderId, publicSender, refreshLinkedInProfiles, updateSettings } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";
import { senderAccounts, workspaces } from "@/lib/db/schema";
import { keysPresent } from "@/lib/unipile/port";
import { loginKeyPresent } from "@/lib/secure/login";

const schema = z.object({
  sandbox: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  developerTrial: z.boolean().optional(),
  timezone: z.string().optional(),
  weekendsEnabled: z.boolean().optional(),
  linkedinSenderId: z.string().nullable().optional(),
});

async function settingsPayload() {
  const ctx = await getRuntime();
  await refreshLinkedInProfiles(ctx);
  const [senders, wsRows] = await Promise.all([
    ctx.db.select().from(senderAccounts).where(eq(senderAccounts.workspaceId, ctx.workspaceId)),
    ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1),
  ]);
  const ws = wsRows[0];
  return {
    sandbox: Boolean(ws?.sandbox),
    killSwitch: Boolean(ws?.killSwitch),
    developerTrial: Boolean(ws?.developerTrial),
    senders: senders.map(publicSender),
    linkedinSenderId: pickLinkedInSenderId(senders, ws?.linkedinSenderId),
    workspace: ws,
    liveKeys: keysPresent(),
    loginKey: loginKeyPresent(),
  };
}

export async function GET() {
  return withCommand(async () => settingsPayload());
}

export async function PATCH(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    await updateSettings(await getRuntime(), input);
    return settingsPayload();
  });
}
