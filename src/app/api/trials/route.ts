import { z } from "zod";
import { runTrialAction } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  action: z.enum(["connection", "message"]),
  url: z.string().min(1),
  body: z.string().optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return runTrialAction(await getRuntime(), input);
  });
}
