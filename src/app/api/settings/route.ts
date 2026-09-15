import { eq } from "drizzle-orm";
import { z } from "zod";
import { connectStatus, updateSettings } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";
import { workspaces } from "@/lib/db/schema";
import { keysPresent } from "@/lib/unipile/port";

const schema = z.object({
  sandbox: z.boolean().optional(),
  killSwitch: z.boolean().optional(),
  timezone: z.string().optional(),
  weekendsEnabled: z.boolean().optional(),
});

export async function GET() {
  return withCommand(async () => {
    const ctx = await getRuntime();
    const status = await connectStatus(ctx);
    const [ws] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, ctx.workspaceId)).limit(1);
    return { ...status, workspace: ws, liveKeys: keysPresent() };
  });
}

export async function PATCH(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return updateSettings(await getRuntime(), input);
  });
}
