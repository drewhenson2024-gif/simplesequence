import { z } from "zod";
import { replyToLead } from "@/lib/app/commands";
import { getRuntime } from "@/lib/app/runtime";
import { withCommand } from "@/lib/http/respond";

const schema = z.object({
  enrollmentId: z.string(),
  body: z.string().min(1),
  channel: z.enum(["linkedin", "email"]).optional(),
});

export async function POST(req: Request) {
  return withCommand(async () => {
    const input = schema.parse(await req.json());
    return replyToLead(await getRuntime(), input);
  });
}
