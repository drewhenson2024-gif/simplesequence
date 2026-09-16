import { z } from "zod";
import { listTrialRuns, startTrialRun, stopTrialRun, tickTrialRun } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("start"),
    action: z.enum(["connection", "message"]),
    intervalSeconds: z.number().int().min(1),
    urls: z.array(z.string()).min(1),
    body: z.string().optional(),
  }),
  z.object({
    op: z.literal("tick"),
    runId: z.string().min(1),
  }),
  z.object({
    op: z.literal("stop"),
    runId: z.string().min(1),
  }),
]);

export async function GET() {
  return withCommand(async () => listTrialRuns(await getRuntime()));
}

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    const ctx = await getRuntime();
    if (input.op === "start") {
      return startTrialRun(ctx, {
        action: input.action,
        intervalSeconds: input.intervalSeconds,
        urls: input.urls,
        body: input.body,
      });
    }
    if (input.op === "tick") return tickTrialRun(ctx, input.runId);
    return stopTrialRun(ctx, input.runId);
  });
}
